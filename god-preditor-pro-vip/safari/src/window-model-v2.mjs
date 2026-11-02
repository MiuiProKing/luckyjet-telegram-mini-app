import {
  EVIDENCE_STATUS, MIN_ROUNDS, MAX_FRESH_AGE_MS, generatePrediction, normalizeRounds,
} from './prediction-v2.ts';
import {
  ARCHIVE_PROFILE, mean, median, emaNewestFirst, geometricMean, deviation,
  medianDeviation, eventIntervals,
} from '../../modules/public-forecast.mjs';
import {bestInWindow, resolveWindow} from '../../modules/signal-validation.mjs';

export const MODEL = 'hardened-dynamic-windows-v4';
export const TARGETS = Object.freeze(['primary', 'big']);
export const RESULT_GRACE_MS = MAX_FRESH_AGE_MS;
const MINUTE = 60000;

// Keep the supplied fork's strict identity, provenance and timestamp rules at
// every boundary, including result validation. No sequence-number assumptions.
export function normalize(rounds, now = Date.now()) {
  return normalizeRounds(rounds, now);
}

function currentSegment(rows) {
  let count = rows.length, boundaryGapMs = null;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i - 1].timestamp - rows[i].timestamp;
    if (gap > MAX_FRESH_AGE_MS) {count = i; boundaryGapMs = gap; break;}
  }
  return {
    rows: rows.slice(0, count),
    diagnostics: {
      gapThresholdMs: MAX_FRESH_AGE_MS, currentSegmentCount: count,
      discardedOlderSegmentRows: rows.length - count, boundaryGapMs,
      status: boundaryGapMs === null ? 'no-large-gap-observed' : 'continuity-unknown-before-gap',
    },
  };
}

function wilson(hits, n) {
  if (!n) return [0, 1];
  const z = 1.95996398454, p = hits / n, d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d;
  const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}

function analyzeHistory(input, rows, now, raw) {
  const segment = currentSegment(rows), values = segment.rows.map(r => r.coefficient);
  const recent = values.slice(0, 50), last = rows[0];
  const gaps = segment.rows.slice(0, 101).slice(1)
    .map((r, i) => segment.rows[i].timestamp - r.timestamp).filter(gap => gap > 0);
  const fresh = !!last && now - last.timestamp <= MAX_FRESH_AGE_MS;
  const inputCount = Array.isArray(input) ? input.length : 0;
  const normalization = {
    inputCount, acceptedCount: rows.length, rejectedCount: inputCount - rows.length,
    freshestAgeMs: last ? now - last.timestamp : null, fresh,
    ...raw?.diagnostics.normalization,
  };
  return {
    model: MODEL, evidenceStatus: EVIDENCE_STATUS, n: rows.length,
    continuityCount: segment.rows.length,
    ready: fresh && segment.rows.length >= MIN_ROUNDS, fresh,
    lastId: last?.id, lastAt: last?.timestamp, cadenceMs: median(gaps),
    avgRoundSeconds: mean(gaps) / 1000,
    ema20: emaNewestFirst(values.slice(0, 20), .25),
    ema50: emaNewestFirst(recent, .12), median50: median(recent),
    mad50: medianDeviation(recent), deviation50: deviation(recent),
    geometricMean: geometricMean(values),
    targets: [2, 5, 10, 20, 50, 100].map(target => {
      const intervals = eventIntervals(segment.rows, target), sampleSize = values.length;
      return {
        target, count: intervals.count, sampleSize,
        historicalFrequency: sampleSize ? intervals.count / sampleSize : 0,
        range: wilson(intervals.count, sampleSize), rangeKind: 'historical-wilson-interval',
        recentRate: values.length ? values.slice(0, 100).filter(v => v >= target).length / Math.min(100, values.length) : 0,
        medianGapMs: intervals.medGap, lastHitAt: intervals.last,
        intervals, profile: ARCHIVE_PROFILE,
      };
    }),
    diagnostics: {
      analyzedAt: now, primaryHeld: false, additionalHeld: false,
      ...raw?.diagnostics,
      normalization, continuity: segment.diagnostics,
      additional: raw?.diagnostics.additional ?? null,
    },
  };
}

export function analyze(rounds, now = Date.now()) {
  const rows = normalize(rounds, now);
  return analyzeHistory(rounds, rows, now, generatePrediction(rounds, null, now));
}

const RULES = Object.freeze({
  cycle: 'Цикл достижения цели', 'low-streak': 'Серия ниже цели',
  'hot-cluster': 'Кластер достижений цели', 'mid-mixed': 'Смешанная фаза',
  'mid-favorable': 'Эвристика средней зоны', 'hour-profile': 'Часовой профиль',
  'multi-signal': 'Многосигнальный расчёт', 'big-opportunity': 'Пересечение двух эвристических окон',
});
function ruleOf(pattern) {
  if (pattern.startsWith('Cycle')) return 'cycle';
  if (pattern.startsWith('Série')) return 'low-streak';
  if (pattern.includes('cotes ≥')) return 'hot-cluster';
  if (pattern.startsWith('Phase mixte')) return 'mid-mixed';
  if (pattern.startsWith('Heuristique')) return 'mid-favorable';
  if (pattern.startsWith('Plage horaire')) return 'hour-profile';
  return 'multi-signal';
}

function validWindow(x) {
  if (!x || x.model !== MODEL || !TARGETS.includes(x.channel) ||
      x.evidenceStatus !== EVIDENCE_STATUS || x.scoreKind !== 'heuristic' ||
      !Number.isFinite(x.target) || x.target < (x.channel === 'big' ? 100 : 1) ||
      !Number.isFinite(x.heuristicScore) || x.heuristicScore < 0 || x.heuristicScore > 100 ||
      ![x.generatedAt, x.start, x.end, x.windowMs].every(Number.isSafeInteger) ||
      x.generatedAt < 946684800000 || x.start <= x.generatedAt ||
      x.end <= x.start || x.end - x.start !== x.windowMs) return false;
  return x.channel === 'big'
    ? x.start >= x.generatedAt + 3 * MINUTE && x.windowMs <= 6 * MINUTE && x.end <= x.generatedAt + 9 * MINUTE
    : x.start >= x.generatedAt + 90000 && x.start <= x.generatedAt + 3 * MINUTE &&
      x.windowMs >= 90000 && x.windowMs <= 3 * MINUTE;
}

function acceptedWindow(x, now = Infinity) {
  return validWindow(x) && Number.isSafeInteger(x.acceptedAt) &&
    x.acceptedAt >= x.generatedAt && x.acceptedAt < x.start && x.acceptedAt <= now &&
    ['pending', 'hit', 'miss', 'unknown'].includes(x.status);
}

function primaryRaw(entry) {
  const raw = entry?.raw;
  return entry?.channel === 'primary' && validWindow(entry) && raw &&
    raw.evidenceStatus === EVIDENCE_STATUS && raw.generatedAt === entry.generatedAt &&
    raw.estimatedAt === entry.start && raw.windowMs === entry.windowMs &&
    raw.estimatedCoef === entry.target && raw.heuristicScore === entry.heuristicScore ? raw : null;
}
function bigRaw(entry) {
  const big = entry?.raw?.bigOpportunity;
  return entry?.channel === 'big' && validWindow(entry) && big &&
    big.evidenceStatus === EVIDENCE_STATUS && big.generatedAt === entry.generatedAt &&
    big.expectedAt === entry.start && big.windowMs === entry.windowMs && big.expiresAt === entry.end &&
    big.estimatedCoef === entry.target && big.heuristicScore === entry.heuristicScore ? big : null;
}

// Rebuild each hold from its own published channel. A primary snapshot's old
// nested opportunity must never resurrect an unannounced or expired big window.
function previousState(primaryEntry, bigEntry) {
  const primary = primaryRaw(primaryEntry), big = bigRaw(bigEntry);
  return {
    ...(primary ? {
      estimatedCoef: primary.estimatedCoef, estimatedAt: primary.estimatedAt,
      windowMs: primary.windowMs, generatedAt: primary.generatedAt,
      heuristicScore: primary.heuristicScore, evidenceStatus: primary.evidenceStatus,
      pattern: primary.pattern, basis: primary.basis,
    } : {}),
    bigOpportunity: big ? {...big} : null,
  };
}

function forecastFromRaw(raw, channel, analysis) {
  if (!raw) return null;
  const big = raw.bigOpportunity;
  if (channel === 'big' && !big) return null;
  const source = channel === 'big' ? big : raw;
  const target = source.estimatedCoef;
  const start = channel === 'big' ? big.expectedAt : raw.estimatedAt;
  const rule = channel === 'big' ? 'big-opportunity' : ruleOf(raw.pattern);
  const forecast = {
    model: MODEL, channel, target, estimatedCoef: target,
    generatedAt: source.generatedAt, start, end: start + source.windowMs,
    estimatedAt: start, windowMs: source.windowMs,
    heuristicScore: source.heuristicScore, evidenceStatus: EVIDENCE_STATUS,
    scoreKind: 'heuristic', rule, pattern: RULES[rule],
    basis: channel === 'big' ? big.reason : raw.basis,
    opportunity: big, raw,
    diagnostics: {
      ...raw.diagnostics, profile: ARCHIVE_PROFILE, sampleSize: analysis.n,
      continuityCount: analysis.continuityCount, dataCutoff: analysis.lastAt,
      cycle: analysis.targets.find(x => x.target === 10).intervals,
    },
  };
  return validWindow(forecast) ? forecast : null;
}

export function forecastForTarget(rounds, channel = 'primary', previous = null, now = Date.now()) {
  if (!TARGETS.includes(channel)) return null;
  const rows = normalize(rounds, now);
  const raw = generatePrediction(rounds, previousState(
    previous?.channel === 'primary' ? previous : null,
    previous?.channel === 'big' ? previous : null,
  ), now);
  if (!raw) return null;
  if (previous?.channel === channel && validWindow(previous) &&
      (channel === 'primary' ? raw.diagnostics.primaryHeld : raw.diagnostics.additionalHeld)) return previous;
  return forecastFromRaw(raw, channel, analyzeHistory(rounds, rows, now, raw));
}

function latestFor(journal, channel) {
  return journal.reduce((latest, entry) => entry.channel === channel &&
    (!latest || entry.acceptedAt >= latest.acceptedAt) ? entry : latest, null);
}

// Frozen publications resolve against observed in-window rounds. Live analysis
// continues on every tick, even while one or both publication channels are held.
export function advanceJournal(journal, rounds, _stats, now = Date.now(), enabled = true,
  coverage = {online: true, lastSuccessAt: now}) {
  const rows = normalize(rounds, now), inputJournal = Array.isArray(journal) ? journal : [];
  const eligible = inputJournal.filter(entry => acceptedWindow(entry, now));
  let changed = eligible.length !== inputJournal.length;
  const raw = generatePrediction(rounds, previousState(
    latestFor(eligible, 'primary'), latestFor(eligible, 'big'),
  ), now);
  const analysis = analyzeHistory(rounds, rows, now, raw);
  const next = eligible.map(entry => {
    if (entry.status !== 'pending') return entry;
    const result = resolveWindow(entry, rows, now, entry.avgRoundSeconds || 30);
    const freshFinalPoll = coverage?.online && Number.isFinite(coverage.lastSuccessAt) &&
      coverage.lastSuccessAt >= entry.end && coverage.lastSuccessAt <= now &&
      now - coverage.lastSuccessAt <= RESULT_GRACE_MS && analysis.fresh;
    if (result && (result.status === 'validated' || freshFinalPoll)) {
      changed = true;
      return {...entry, status: result.status === 'validated' ? 'hit' : 'miss',
        actual: result.coefficient, actualAt: result.at, resolvedAt: now};
    }
    if (now > entry.end + RESULT_GRACE_MS) {
      changed = true;
      return {...entry, status: 'unknown',
        actual: bestInWindow(rows, entry.target, entry.start, entry.windowMs).best, resolvedAt: now};
    }
    return entry;
  });
  if (enabled && analysis.ready && raw) for (const channel of TARGETS) {
    const latest = latestFor(next, channel);
    if (next.some(entry => entry.channel === channel && entry.status === 'pending') ||
        (latest && now < Math.max(latest.end, latest.generatedAt + MINUTE))) continue;
    const forecast = forecastFromRaw(raw, channel, analysis);
    // A held generator result can be in progress already. Publication always
    // happens before start, never retrospectively at the first observed hit.
    if (!forecast || forecast.generatedAt > now || now >= forecast.start) continue;
    const segment = currentSegment(rows).rows;
    next.push({...forecast, key: `${MODEL}:${channel}:${now}`, acceptedAt: now,
      avgRoundSeconds: analysis.avgRoundSeconds || 30, sampleSize: analysis.n,
      historicalFrequency: segment.filter(r => r.coefficient >= forecast.target).length / segment.length,
      historicalSampleSize: segment.length, status: 'pending'});
    changed = true;
  }
  return {journal: next.slice(-200), changed, analysis, diagnostics: analysis.diagnostics};
}

export function summary(journal) {
  const own = (Array.isArray(journal) ? journal : []).filter(entry => acceptedWindow(entry));
  const known = own.filter(entry => ['hit', 'miss'].includes(entry.status));
  return {
    known: known.length, hits: known.filter(entry => entry.status === 'hit').length,
    unknown: own.filter(entry => entry.status === 'unknown').length,
    semantics: 'any-hit-in-frozen-window', evidenceStatus: EVIDENCE_STATUS, brier: null,
  };
}
