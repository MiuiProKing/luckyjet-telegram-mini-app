import {
  EVIDENCE_STATUS, MAX_FRESH_AGE_MS, normalizeRounds,
} from './prediction-v2.ts';
import {MIN_ROUNDS as MIN_RARE_ROUNDS} from './rare-window-model.mjs';
import {bestInWindow, resolveWindow} from '../../modules/signal-validation.mjs';

// Informational publications have their own identity and never enter the
// primary/big journal or carry fields used by the betting controllers.
export const MODEL = 'rare-alert-v1';
export const RESULT_GRACE_MS = 180000;
export const MAX_ALERTS = 100;
const BIG_MODEL = 'hardened-dynamic-windows-v4';
const RARE_MODEL = 'rare-window-v1';
const BIG_SOURCE = 'existing-big-opportunity';
const BETA_SOURCE = 'beta-window-frequency';
const MINUTE = 60000;
const POLL_FRESH_MS = 12000;
const MIN_TIMESTAMP = 946684800000;
const MAX_TIMESTAMP = 8640000000000000;
const STATUSES = new Set(['pending', 'hit', 'miss', 'unknown']);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const timestamp = value => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP;
const validNow = value => timestamp(value) && value <= MAX_TIMESTAMP - 30 * MINUTE;
const safeTarget = value => Number.isSafeInteger(value) && value >= 100;

function validTimes(value) {
  return record(value) && safeTarget(value.target) &&
    [value.generatedAt, value.start, value.end].every(timestamp) &&
    Number.isSafeInteger(value.windowMs) && value.windowMs > 0 && value.windowMs <= 10 * MINUTE &&
    value.end - value.start === value.windowMs &&
    value.start - value.generatedAt >= 2 * MINUTE &&
    value.start - value.generatedAt <= 15 * MINUTE;
}

function candidateFromBig(value, now) {
  if (!record(value) || value.model !== BIG_MODEL || value.channel !== 'big' ||
      value.evidenceStatus !== EVIDENCE_STATUS || value.scoreKind !== 'heuristic' ||
      !finite(value.heuristicScore) || value.heuristicScore < 0 || value.heuristicScore > 100 ||
      !validTimes(value) || value.start < value.generatedAt + 3 * MINUTE ||
      value.windowMs > 6 * MINUTE || value.end > value.generatedAt + 9 * MINUTE ||
      value.generatedAt > now || value.start <= now) return null;
  return {
    source: BIG_SOURCE, sourceModel: BIG_MODEL, target: value.target,
    generatedAt: value.generatedAt, start: value.start, end: value.end, windowMs: value.windowMs,
  };
}

function candidateFromBeta(value, now) {
  if (!record(value) || value.model !== RARE_MODEL || value.source !== BETA_SOURCE ||
      value.evidenceStatus !== EVIDENCE_STATUS || value.target !== 100) return null;
  const candidate = {...value, windowMs: value.end - value.start};
  if (!validTimes(candidate) || candidate.generatedAt > now || candidate.start <= now) return null;
  return {
    source: BETA_SOURCE, sourceModel: RARE_MODEL, target: candidate.target,
    generatedAt: candidate.generatedAt, start: candidate.start, end: candidate.end,
    windowMs: candidate.windowMs,
  };
}

function keyOf(value) {
  return `${MODEL}:${value.source}:${value.generatedAt}:${value.start}:${value.end}:${value.target}:${value.acceptedAt}`;
}

function validResult(value, now) {
  if (value.status === 'pending') {
    return value.actual === undefined && value.actualAt === undefined && value.resolvedAt === undefined;
  }
  if (!timestamp(value.resolvedAt) || value.resolvedAt < value.acceptedAt || value.resolvedAt > now) return false;
  if (value.status === 'hit') {
    return finite(value.actual) && value.actual >= value.target && timestamp(value.actualAt) &&
      value.actualAt >= value.start && value.actualAt <= value.end && value.actualAt <= value.resolvedAt;
  }
  if (value.status === 'miss') {
    return finite(value.actual) && value.actual >= 1 && value.actual < value.target &&
      value.actualAt === value.end && value.resolvedAt > value.end;
  }
  return value.resolvedAt > value.end + RESULT_GRACE_MS &&
    (value.actual === null || (finite(value.actual) && value.actual >= 1 && value.actual < value.target)) &&
    (value.actual === null ? value.actualAt === null :
      timestamp(value.actualAt) && value.actualAt >= value.start && value.actualAt <= value.end);
}

function validEntry(value, now) {
  if (!record(value) || value.model !== MODEL || value.evidenceStatus !== EVIDENCE_STATUS ||
      !validTimes(value) || !timestamp(value.acceptedAt) || value.acceptedAt < value.generatedAt ||
      value.acceptedAt >= value.start || value.acceptedAt > now || !STATUSES.has(value.status) ||
      !finite(value.avgRoundSeconds) || value.avgRoundSeconds <= 0 || value.avgRoundSeconds > 180 ||
      value.key !== keyOf(value) || !validResult(value, now)) return false;
  if (value.source === BIG_SOURCE) {
    return value.sourceModel === BIG_MODEL && value.start >= value.generatedAt + 3 * MINUTE &&
      value.windowMs <= 6 * MINUTE && value.end <= value.generatedAt + 9 * MINUTE;
  }
  return value.source === BETA_SOURCE && value.sourceModel === RARE_MODEL && value.target === 100;
}

// Copy only this journal's primitive schema. Persisted unrelated fields cannot
// turn an informational alert into an action or a claimed confidence score.
function cleanEntry(value) {
  const clean = {
    model: MODEL, key: value.key, source: value.source, sourceModel: value.sourceModel,
    evidenceStatus: EVIDENCE_STATUS, target: value.target, generatedAt: value.generatedAt,
    acceptedAt: value.acceptedAt, start: value.start, end: value.end, windowMs: value.windowMs,
    avgRoundSeconds: value.avgRoundSeconds, status: value.status,
  };
  if (value.status !== 'pending') {
    clean.actual = value.actual;
    clean.actualAt = value.actualAt;
    clean.resolvedAt = value.resolvedAt;
  }
  return clean;
}

function sameFields(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && a[key] === b[key]);
}

function sanitize(journal) {
  const input = Array.isArray(journal) ? journal : [];
  // Validate persisted chronology separately from the current wall clock. A
  // rollback must hide and hold a later publication, never delete/reissue it.
  const eligible = input.filter(value => validEntry(value, Infinity)).sort((a, b) =>
    a.acceptedAt - b.acceptedAt || a.start - b.start || a.key.localeCompare(b.key));
  const clean = [], keys = new Set();
  for (const value of eligible) {
    const previous = clean.at(-1);
    const blockedUntil = previous?.status === 'pending' ? Infinity :
      Math.max(previous?.end ?? 0, previous?.resolvedAt ?? 0);
    if (keys.has(value.key) || value.acceptedAt < blockedUntil) continue;
    keys.add(value.key);
    clean.push(cleanEntry(value));
  }
  const capped = clean.slice(-MAX_ALERTS);
  return {
    journal: capped,
    changed: capped.length !== input.length || capped.some((value, i) => !sameFields(value, input[i])),
  };
}

function currentSegment(rows) {
  let count = rows.length;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1].timestamp - rows[i].timestamp > MAX_FRESH_AGE_MS) {count = i; break;}
  }
  return rows.slice(0, count);
}

function cadenceSeconds(rows) {
  const gaps = rows.slice(1, 101).map((row, i) => rows[i].timestamp - row.timestamp)
    .filter(gap => gap > 0).sort((a, b) => a - b);
  if (!gaps.length) return 30;
  const middle = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[middle] : gaps[middle - 1] / 2 + gaps[middle] / 2;
  return Math.min(180, Math.max(.001, median / 1000));
}

function sourceFresh(online, lastSuccessAt, now) {
  return online === true && timestamp(lastSuccessAt) && lastSuccessAt <= now && now - lastSuccessAt <= POLL_FRESH_MS;
}

function analysisFresh(analysis, rows, segment, now) {
  return analysis?.ready === true && analysis.evidenceStatus === EVIDENCE_STATUS &&
    analysis.threshold === 100 && analysis.horizonMs === 180000 &&
    segment.length >= MIN_RARE_ROUNDS && rows.length > 0 && now - rows[0].timestamp <= MAX_FRESH_AGE_MS;
}

/** Publish once before start, then assess any observed target hit in that fixed window. */
export function advanceRareAlerts(journal, rounds, options = {}) {
  const {analysis = null, bigForecast = null, now = Date.now(), online = false, lastSuccessAt = null} = options ?? {};
  const sanitized = sanitize(journal);
  if (!validNow(now) || sanitized.journal.some(entry =>
    entry.acceptedAt > now || (entry.resolvedAt !== undefined && entry.resolvedAt > now))) {
    return {journal: Object.freeze(sanitized.journal.map(entry => Object.freeze(entry))),
      changed: sanitized.changed, active: null, latestResult: null};
  }
  const rows = normalizeRounds(rounds, now), segment = currentSegment(rows);
  let changed = sanitized.changed;
  const freshPoll = sourceFresh(online, lastSuccessAt, now);
  const freshAnalysis = analysisFresh(analysis, rows, segment, now);
  const next = sanitized.journal.map(entry => {
    if (entry.status !== 'pending') return entry;
    const result = resolveWindow(entry, rows, now, entry.avgRoundSeconds);
    const freshFinalPoll = freshPoll && lastSuccessAt >= entry.end && rows.length > 0 &&
      now - rows[0].timestamp <= MAX_FRESH_AGE_MS;
    if (result && (result.status === 'validated' || freshFinalPoll)) {
      changed = true;
      return {...entry, status: result.status === 'validated' ? 'hit' : 'miss',
        actual: result.coefficient, actualAt: result.at, resolvedAt: now};
    }
    if (now > entry.end + RESULT_GRACE_MS) {
      const best = bestInWindow(rows, entry.target, entry.start, entry.windowMs);
      changed = true;
      return {...entry, status: 'unknown', actual: best.best, actualAt: best.bestAt, resolvedAt: now};
    }
    return entry;
  });
  const blocked = next.some(entry => entry.status === 'pending' || now < entry.end);
  if (!blocked && freshPoll && freshAnalysis) {
    const candidate = candidateFromBig(bigForecast, now) ?? candidateFromBeta(analysis.candidate, now);
    if (candidate) {
      const entry = {...candidate, model: MODEL, evidenceStatus: EVIDENCE_STATUS,
        acceptedAt: now, avgRoundSeconds: cadenceSeconds(segment), status: 'pending'};
      entry.key = keyOf(entry);
      next.push(cleanEntry(entry));
      changed = true;
    }
  }
  const frozen = Object.freeze(next.slice(-MAX_ALERTS).map(entry => Object.freeze(entry)));
  const active = freshPoll && freshAnalysis ? [...frozen].reverse().find(entry =>
    now < entry.end && (entry.status === 'pending' || entry.status === 'hit')) ?? null : null;
  const latestResult = frozen.reduce((latest, entry) => entry.status !== 'pending' &&
    (!latest || entry.resolvedAt > latest.resolvedAt ||
      (entry.resolvedAt === latest.resolvedAt && entry.acceptedAt > latest.acceptedAt)) ? entry : latest, null);
  return {journal: frozen, changed, active, latestResult};
}
