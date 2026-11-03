import {normalizeRounds} from './prediction-v2.ts';
import {
  analyzeRareWindows, gammaPoissonPosterior, inverseBetaCDF,
  THRESHOLD, HORIZON_MS, RECENT_WINDOWS, MIN_REFERENCE_WINDOWS, MIN_EVENTS,
  EVIDENCE_STATUS, COVERAGE_ASSUMPTION,
} from './rare-window-model.mjs';

export const ARCHIVE_MODEL = 'rare-archive-history-v1';
export const RARE_ARCHIVE_MODEL = 'rare-window-archive-v1';
const MINUTE = 60000;
const MIN_TIMESTAMP = 946684800000;
const MAX_TIMESTAMP = 8640000000000000;
const timestamp = value => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP;
const count = value => Number.isSafeInteger(value) && value >= 0;
const freezeWindows = windows => Object.freeze(windows.map(window => Object.freeze(window)));

// Build once after a confirmed complete snapshot, not on each UI tick. The
// caller owns snapshot completeness; this helper never infers it from row count.
// Compact tuples are [UTC window start, observed row count, >=100 event count].
export function buildRareArchiveSummary(input, now = Date.now()) {
  const rows = normalizeRounds(input, now).reverse(), windows = [];
  let segmentCount = 0, gapCount = 0, maxGapMs = 0, observedSegmentExposureMs = 0;
  function segment(from, to) {
    if (from >= to) return;
    segmentCount++;
    const first = rows[from].timestamp, last = rows[to - 1].timestamp;
    observedSegmentExposureMs += last - first;
    const firstStart = Math.ceil(first / HORIZON_MS) * HORIZON_MS;
    const lastEnd = Math.floor(last / HORIZON_MS) * HORIZON_MS;
    let cursor = from;
    for (let start = firstStart; start + HORIZON_MS <= lastEnd; start += HORIZON_MS) {
      const end = start + HORIZON_MS;
      while (cursor < to && rows[cursor].timestamp <= start) cursor++;
      let n = 0, events = 0;
      while (cursor < to && rows[cursor].timestamp <= end) {
        n++; events += Number(rows[cursor].coefficient >= THRESHOLD); cursor++;
      }
      if (n) windows.push([start, n, events]);
    }
  }
  let beginning = 0;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].timestamp - rows[i - 1].timestamp;
    maxGapMs = Math.max(maxGapMs, gap);
    if (gap > HORIZON_MS) {segment(beginning, i); beginning = i; gapCount++;}
  }
  segment(beginning, rows.length);
  const largeEvents = rows.filter(row => row.coefficient >= THRESHOLD)
    .map(row => Object.freeze({id: row.id, timestamp: row.timestamp, coefficient: row.coefficient}));
  return Object.freeze({
    model: ARCHIVE_MODEL, threshold: THRESHOLD, horizonMs: HORIZON_MS,
    builtAt: timestamp(now) ? now : null,
    inputValid: Array.isArray(input) && timestamp(now) && now <= MAX_TIMESTAMP - 30 * MINUTE,
    inputCount: Array.isArray(input) ? input.length : 0,
    acceptedRoundCount: rows.length,
    rejectedCount: Array.isArray(input) ? input.length - rows.length : 0,
    rawLargeEventCount: largeEvents.length, largeEvents: Object.freeze(largeEvents),
    firstAt: rows[0]?.timestamp ?? null, lastAt: rows.at(-1)?.timestamp ?? null,
    segmentCount, gapCount, maxGapMs, observedSegmentExposureMs,
    coverageAssumption: COVERAGE_ASSUMPTION,
    coveredWindowCount: windows.length,
    coveredExposureMs: windows.length * HORIZON_MS,
    coveredEventCount: windows.reduce((sum, window) => sum + window[2], 0),
    windows: freezeWindows(windows),
  });
}

function archiveWindows(summary, now) {
  if (!timestamp(now) || now > MAX_TIMESTAMP - 30 * MINUTE || !summary || summary.inputValid !== true ||
      summary.model !== ARCHIVE_MODEL || summary.threshold !== THRESHOLD ||
      summary.horizonMs !== HORIZON_MS || !timestamp(summary.builtAt) || summary.builtAt > now ||
      !count(summary.acceptedRoundCount) || !count(summary.rawLargeEventCount) ||
      summary.rawLargeEventCount > summary.acceptedRoundCount || !Array.isArray(summary.windows) ||
      summary.coveredWindowCount !== summary.windows.length ||
      summary.coveredExposureMs !== summary.windows.length * HORIZON_MS) return null;
  if (!summary.acceptedRoundCount) {
    return summary.firstAt === null && summary.lastAt === null && summary.windows.length === 0 &&
      summary.coveredEventCount === 0 && summary.rawLargeEventCount === 0 ? [] : null;
  }
  if (!timestamp(summary.firstAt) || !timestamp(summary.lastAt) ||
      summary.firstAt > summary.lastAt || summary.lastAt > summary.builtAt || summary.lastAt > now) return null;
  const result = [];
  let previous = -Infinity, rowCount = 0, eventCount = 0;
  for (const value of summary.windows) {
    if (!Array.isArray(value) || value.length !== 3) return null;
    const [start, n, events] = value, end = start + HORIZON_MS;
    if (!timestamp(start) || start % HORIZON_MS !== 0 || start <= previous ||
        start < summary.firstAt || end > summary.lastAt || !count(n) || n === 0 ||
        !count(events) || events > n) return null;
    result.push({start, end, rowCount: n, eventCount: events, hit: events > 0});
    previous = start; rowCount += n; eventCount += events;
  }
  return rowCount <= summary.acceptedRoundCount && eventCount === summary.coveredEventCount &&
    eventCount <= summary.rawLargeEventCount ? result : null;
}

function summarize(windows) {
  if (!windows.length) return null;
  const n = windows.length, hits = windows.reduce((sum, window) => sum + Number(window.hit), 0);
  const alpha = hits + .5, beta = n - hits + .5;
  const interval95 = [.025, .975].map(p => inverseBetaCDF(p, alpha, beta));
  return {
    start: windows[0].start, end: windows.at(-1).end, windowCount: n,
    hitWindowCount: hits, eventCount: windows.reduce((sum, window) => sum + window.eventCount, 0),
    observedFrequency: hits / n, posteriorMean: alpha / (alpha + beta), interval95,
    posterior: {distribution: 'beta', alpha, beta},
  };
}

// Both inputs are sorted and windows are keyed by their UTC start. A current
// fully covered live window replaces its older snapshot copy, never adds a
// second exposure. Count disagreements are surfaced rather than hidden.
function mergeWindows(archived, current) {
  const windows = [], conflictingStarts = [];
  let a = 0, b = 0;
  while (a < archived.length || b < current.length) {
    if (b >= current.length || (a < archived.length && archived[a].start < current[b].start)) windows.push(archived[a++]);
    else if (a >= archived.length || current[b].start < archived[a].start) windows.push(current[b++]);
    else {
      if (archived[a].rowCount !== current[b].rowCount || archived[a].eventCount !== current[b].eventCount)
        conflictingStarts.push(current[b].start);
      windows.push(current[b]); a++; b++;
    }
  }
  return {windows, conflictingStarts};
}

/**
 * All-history reference with a strictly current recent group. Old rare events
 * cannot fill the recent five-hit gate or make stale live history ready.
 * Gamma uses only the union of fully covered three-minute exposures, excluding
 * every gap and partial segment edge. This differs from 1.6's single-span T.
 */
export function analyzeRareArchive(recentRows, summary, now = Date.now()) {
  const base = analyzeRareWindows(recentRows, now), archived = archiveWindows(summary, now);
  if (archived === null) return {
    ...base, candidate: null,
    archive: {model: ARCHIVE_MODEL, status: 'unavailable', reason: 'archive-summary-unavailable'},
  };
  const current = base.bayesian.windows;
  const {windows, conflictingStarts} = mergeWindows(archived, current);
  const recent = base.bayesian.recent;
  const referenceWindows = recent ? windows.filter(window => window.end <= recent.start) : [];
  const reference = summarize(referenceWindows);
  const recentConflictCount = recent ? conflictingStarts.filter(start => start >= recent.start && start < recent.end).length : 0;
  const gateReason = base.ready ? null : base.diagnostics.reason;
  const numericSupport = [...(recent?.interval95 ?? []), ...(reference?.interval95 ?? [])].every(Number.isFinite);
  const reason = gateReason ?? (recent?.windowCount !== RECENT_WINDOWS ||
    (reference?.windowCount ?? 0) < MIN_REFERENCE_WINDOWS ? 'insufficient-covered-windows'
      : recent.hitWindowCount < MIN_EVENTS || reference.hitWindowCount < MIN_EVENTS ? 'insufficient-hit-windows'
        : recentConflictCount > 0 ? 'archive-recent-window-conflict'
          : !numericSupport ? 'numerical-failure' : null);
  const supported = reason === null;
  const localRise = supported && recent.interval95[0] > reference.interval95[1];
  const eventCount = windows.reduce((sum, window) => sum + window.eventCount, 0);
  const exposureMs = windows.length * HORIZON_MS;
  let poissonReason = gateReason ?? (!exposureMs ? 'insufficient-exposure' : eventCount < MIN_EVENTS ? 'insufficient-events' : null);
  const posterior = poissonReason === null ? gammaPoissonPosterior(eventCount, exposureMs) : null;
  if (poissonReason === null && !posterior) poissonReason = 'numerical-failure';
  const poisson = {
    ...base.poisson,
    status: posterior ? 'ready' : 'insufficient', reason: poissonReason,
    model: 'archive-covered-windows-poisson-gamma-jeffreys',
    historyScope: 'all-covered-archive-and-live-windows',
    exposureConvention: 'sum-of-disjoint-fully-covered-three-minute-windows',
    exposureStart: windows[0]?.start ?? null, exposureEnd: windows.at(-1)?.end ?? null,
    exposureMs, eventCount, coveredWindowCount: windows.length,
    observedRatePerMs: exposureMs > 0 ? eventCount / exposureMs : null,
    posteriorShape: posterior?.shape ?? null, posteriorRateMs: posterior?.rateMs ?? null,
    posteriorMeanRatePerMs: posterior?.meanRatePerMs ?? null,
    rateInterval95PerMs: posterior?.rateInterval95PerMs ?? null,
    probability: posterior?.probability ?? null,
    probabilityInterval95: posterior?.probabilityInterval95 ?? null,
  };
  const bayesian = {
    ...base.bayesian,
    status: supported ? 'ready' : 'insufficient',
    reason: reason ?? (localRise ? 'experimental-local-frequency-rise' : 'no-supported-local-rise'),
    historyScope: 'current-thirty-windows-versus-all-earlier-covered-windows',
    windows, windowCount: windows.length,
    hitWindowCount: windows.reduce((sum, window) => sum + Number(window.hit), 0),
    eventCount, recent, reference, localFrequencyRise: localRise,
    currentWindowFrequency: supported ? recent.posteriorMean : null,
    currentWindowFrequencyInterval95: supported ? recent.interval95 : null,
  };
  const start = Math.ceil((now + 2 * MINUTE) / MINUTE) * MINUTE;
  const candidate = localRise ? {
    model: RARE_ARCHIVE_MODEL, source: 'beta-window-frequency', target: THRESHOLD,
    historyModel: ARCHIVE_MODEL, historyScope: bayesian.historyScope,
    generatedAt: now, start, end: start + HORIZON_MS, windowMs: HORIZON_MS,
    horizonMs: HORIZON_MS, evidenceStatus: EVIDENCE_STATUS,
    purpose: 'observation-only', interpretation: 'experimental-local-frequency-rise',
    coverageAssumption: COVERAGE_ASSUMPTION,
    currentWindowFrequency: recent.posteriorMean,
    currentWindowFrequencyInterval95: [...recent.interval95],
    referenceWindowFrequency: reference.posteriorMean,
    referenceWindowFrequencyInterval95: [...reference.interval95],
    recentWindowCount: recent.windowCount, recentHitWindowCount: recent.hitWindowCount,
    referenceWindowCount: reference.windowCount, referenceHitWindowCount: reference.hitWindowCount,
    reason: 'Recent historical frequency differs from all earlier covered archive windows; future performance is unvalidated.',
  } : null;
  return {
    ...base, poisson, bayesian, candidate,
    diagnostics: {...base.diagnostics, reason: gateReason ?? bayesian.reason},
    archive: {
      model: ARCHIVE_MODEL, status: 'ready', historyScope: bayesian.historyScope,
      acceptedRoundCount: summary.acceptedRoundCount, rawLargeEventCount: summary.rawLargeEventCount,
      firstAt: summary.firstAt, lastAt: summary.lastAt, coveredWindowCount: archived.length,
      referenceWindowCount: reference?.windowCount ?? 0,
      referenceHitWindowCount: reference?.hitWindowCount ?? 0,
      recentWindowCount: recent?.windowCount ?? 0, recentHitWindowCount: recent?.hitWindowCount ?? 0,
      conflictingWindowCount: conflictingStarts.length, recentConflictCount,
      partialEdgesAndGapsExcluded: true, coveredExposureMs: exposureMs,
    },
  };
}
