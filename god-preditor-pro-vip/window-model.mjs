import {generatePrediction} from './modules/supplied-prediction.mjs';
import {
  ARCHIVE_PROFILE, mean, median, emaNewestFirst,
  geometricMean, deviation, medianDeviation, eventIntervals, temporalBins,
} from './modules/public-forecast.mjs';
import {bestInWindow, resolveWindow} from './modules/signal-validation.mjs';

export const TARGETS = Object.freeze(['primary', 'big']);
export const MODEL = 'supplied-dynamic-windows-v3';
export const RESULT_GRACE_MS = 180000;
const MINUTE = 60000;

// Provider timestamps, stable ties, unique IDs and no future input. Coefficients
// above 2 remain observations; all original forecast thresholds remain unchanged.
export function normalize(rounds, now = Date.now()) {
  const ids = new Set();
  return [...rounds].filter(r => r && Number.isFinite(r.coefficient) && r.coefficient >= 1 &&
    Number.isFinite(r.timestamp) && r.timestamp > 0 && r.timestamp <= now)
    .sort((a, b) => b.timestamp - a.timestamp || String(a.id ?? '').localeCompare(String(b.id ?? '')))
    .filter(r => {
      const id = String(r.id ?? `${r.timestamp}:${r.coefficient}`);
      if (ids.has(id)) return false;
      ids.add(id); return true;
    });
}

export function wilson(hits, n) {
  if (!n) return [0, 1];
  const z = 1.95996398454, p = hits / n, d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d;
  const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}

export function analyze(rounds, now = Date.now()) {
  const rows = normalize(rounds, now), values = rows.map(r => r.coefficient);
  const recent = values.slice(0, 50), last = rows[0];
  const gaps = rows.slice(0, 101).slice(1).map((r, i) => rows[i].timestamp - r.timestamp)
    .filter(gap => gap > 0 && gap <= RESULT_GRACE_MS);
  const fresh = !!last && now - last.timestamp <= RESULT_GRACE_MS;
  return {
    model: MODEL, n: rows.length, ready: rows.length >= 20 && fresh, fresh,
    lastId: last?.id, lastAt: last?.timestamp, cadenceMs: median(gaps),
    avgRoundSeconds: mean(gaps) / 1000,
    ema20: emaNewestFirst(values.slice(0, 20), .25),
    ema50: emaNewestFirst(recent, .12), median50: median(recent),
    mad50: medianDeviation(recent), deviation50: deviation(recent),
    geometricMean: geometricMean(values),
    targets: [2, 5, 10, 20, 50, 100].map(target => {
      const intervals = eventIntervals(rows, target);
      return {
        target, count: intervals.count,
        probability: rows.length ? intervals.count / rows.length : 0,
        range: wilson(intervals.count, rows.length),
        recentRate: values.length ? values.slice(0, 100).filter(v => v >= target).length / Math.min(100, values.length) : 0,
        medianGapMs: intervals.medGap, lastHitAt: intervals.last,
        intervals, profile: ARCHIVE_PROFILE,
      };
    }),
  };
}

const RULES = Object.freeze({
  cycle: 'Цикл достижения цели',
  'low-streak': 'Серия ниже цели',
  'hot-cluster': 'Кластер достижений цели',
  'mid-mixed': 'Смешанная фаза',
  'mid-favorable': 'Благоприятная фаза',
  'hour-favorable': 'Благоприятный часовой профиль',
  'hour-weak': 'Слабый часовой профиль',
  'multi-signal': 'Многосигнальный расчёт',
  'opportunity-cycle': 'Окно по циклу цели',
  'opportunity-cluster': 'Окно по кластеру цели',
  'opportunity-poisson-delay': 'Окно по интервалам цели',
});
function ruleOf(pattern) {
  if (pattern.startsWith('Cycle')) return 'cycle';
  if (pattern.startsWith('Série')) return 'low-streak';
  if (pattern.includes('cotes ≥')) return 'hot-cluster';
  if (pattern.startsWith('Phase mixte')) return 'mid-mixed';
  if (pattern.startsWith('Phase favorable')) return 'mid-favorable';
  if (pattern === 'Plage horaire favorable') return 'hour-favorable';
  if (pattern === 'Plage horaire faible') return 'hour-weak';
  return 'multi-signal';
}

export function forecastForTarget(rounds, channel = 'primary', previous = null, now = Date.now()) {
  if (!TARGETS.includes(channel)) return null;
  const rows = normalize(rounds, now);
  if (rows.length < 20 || now - rows[0].timestamp > RESULT_GRACE_MS) return null;
  if (previous?.model === MODEL && previous.channel === channel && validWindow(previous) &&
      now < Math.max(previous.end, previous.generatedAt + MINUTE)) return previous;
  const raw = generatePrediction(rows, null, now);
  if (!raw) return null;
  const big = raw.bigOpportunity;
  if (channel === 'big' && !big) return null;
  const target = channel === 'big' ? big.estimatedCoef : raw.estimatedCoef;
  const start = channel === 'big' ? big.expectedAt : raw.estimatedAt;
  const windowMs = channel === 'big' ? big.windowMs : raw.windowMs;
  const pattern = channel === 'big' ? big.reason : raw.pattern;
  const rule = channel === 'big' ? 'big-opportunity' : ruleOf(pattern);
  return {
    model: MODEL, channel, target, estimatedCoef: target, generatedAt: raw.generatedAt,
    start, end: start + windowMs, estimatedAt: start, windowMs,
    score: channel === 'big' ? big.confidence : raw.reliability,
    confidence: channel === 'big' ? null : raw.confidence,
    scoreKind: 'heuristic', rule, pattern: RULES[rule] || pattern,
    basis: channel === 'big' ? big.reason : raw.basis,
    opportunity: big, raw,
    diagnostics: {profile: ARCHIVE_PROFILE, sampleSize: rows.length,
      dataCutoff: rows[0].timestamp, cycle: eventIntervals(rows, 10)},
  };
}

function validWindow(x) {
  return x && x.model === MODEL && TARGETS.includes(x.channel) && Number.isFinite(x.target) && x.target >= 1 &&
    [x.generatedAt, x.start, x.end].every(Number.isFinite) && x.generatedAt > 0 &&
    x.start > x.generatedAt && x.end > x.start && x.end - x.start <= 12 * MINUTE;
}

// Freeze windows before their start. Like the archived client, success means
// ANY observed threshold crossing within that window, not the next round.
export function advanceJournal(journal, rounds, stats, now = Date.now(), enabled = true,
  coverage = {online: true, lastSuccessAt: now}) {
  const rows = normalize(rounds, now);
  let changed = false;
  const eligible = journal.filter(x => validWindow(x) && Number.isFinite(x.acceptedAt) &&
    x.acceptedAt < x.start && x.acceptedAt <= now && ['pending', 'hit', 'miss', 'unknown'].includes(x.status));
  if (eligible.length !== journal.length) changed = true;
  const next = eligible.map(entry => {
    if (entry.status !== 'pending') return entry;
    const result = resolveWindow(entry, rows, now, entry.avgRoundSeconds || 30);
    const freshFinalPoll = coverage.online && Number.isFinite(coverage.lastSuccessAt) &&
      coverage.lastSuccessAt >= entry.end && now - coverage.lastSuccessAt <= RESULT_GRACE_MS && stats.fresh;
    if (result && (result.status === 'validated' || freshFinalPoll)) {
      changed = true;
      return {...entry, status: result.status === 'validated' ? 'hit' : 'miss',
        actual: result.coefficient, actualAt: result.at, resolvedAt: now};
    }
    if (now > entry.end + RESULT_GRACE_MS) {
      changed = true;
      return {...entry, status: 'unknown', actual: bestInWindow(rows, entry.target, entry.start, entry.end - entry.start).best, resolvedAt: now};
    }
    return entry;
  });
  if (enabled && stats.ready) for (const channel of TARGETS) {
    const latest = [...next].reverse().find(x => x.channel === channel);
    // An early success keeps its original window occupied. No overlapping or
    // retroactively generated windows and no post-hoc updates of their score.
    if (next.some(x => x.channel === channel && x.status === 'pending') ||
        (latest && now < Math.max(latest.end, latest.generatedAt + MINUTE))) continue;
    const forecast = forecastForTarget(rows, channel, null, now);
    if (!forecast) continue;
    next.push({...forecast, key: `${MODEL}:${channel}:${now}`, acceptedAt: now,
      avgRoundSeconds: stats.avgRoundSeconds || 30, sampleSize: stats.n,
      historicalFrequency: rows.filter(x => x.coefficient >= forecast.target).length / rows.length,
      status: 'pending'});
    changed = true;
  }
  return {journal: next.slice(-200), changed};
}

export function summary(journal) {
  const own = journal.filter(x => validWindow(x));
  const known = own.filter(x => ['hit', 'miss'].includes(x.status));
  return {known: known.length, hits: known.filter(x => x.status === 'hit').length,
    unknown: own.filter(x => x.status === 'unknown').length,
    semantics: 'any-hit-in-frozen-window', brier: null};
}
