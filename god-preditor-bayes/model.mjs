/* GOD PREDITOR — Bayesian frequency baseline, not a validated betting edge.
 * Probabilities are fractions in [0,1]. Timestamps are Unix milliseconds.
 * Only already observed, completed, exact rounds are accepted.
 */
export const MODEL_VERSION = 'god-bayes-frequency-20261114-v1';
export const TARGETS = Object.freeze([10, 40, 200, 500]);
export const WINDOW_MS = 180_000;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const finite = x => typeof x === 'number' && Number.isFinite(x);
const numeric = x => typeof x === 'boolean' || x == null || x === '' ? NaN : Number(x);
const median = xs => {
  if (!xs.length) return null;
  const a = [...xs].sort((a, b) => a - b), n = a.length, m = n >> 1;
  return n % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

function timestamp(value) {
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : NaN;
  }
  return numeric(value);
}

function cleanRounds(input, now) {
  const ids = new Map(), conflicts = new Set();
  let invalid = 0;
  for (const row of Array.isArray(input) ? input : []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { invalid++; continue; }
    if (row.completed != null && row.completed !== true || row.estimated != null && row.estimated !== false) {
      invalid++; continue;
    }
    const rawId = row.id;
    if (!(typeof rawId === 'string' && rawId.trim()) && !(typeof rawId === 'number' && Number.isSafeInteger(rawId))) {
      invalid++; continue;
    }
    const id = String(rawId), coefficient = numeric(row.coefficient),
      time = timestamp(row.timestamp ?? row.played_at), rawOrder = numeric(row.order);
    if (id.length > 512 || !Number.isFinite(coefficient) || coefficient < 1 ||
        !Number.isFinite(time) || time <= 0 || time > now) { invalid++; continue; }
    const order = Number.isSafeInteger(rawOrder) && rawOrder >= 0 ? rawOrder : null;
    const normalized = { id, coefficient, timestamp: time, order, completed: true, estimated: false };
    const old = ids.get(id);
    if (old && (old.coefficient !== coefficient || old.timestamp !== time || old.order !== order)) conflicts.add(id);
    else ids.set(id, normalized);
  }
  const rows = [...ids.values()].filter(r => !conflicts.has(r.id)).sort((a, b) =>
    a.timestamp - b.timestamp || (a.order != null && b.order != null ? a.order - b.order : a.id.localeCompare(b.id)));
  return { rows, quality: { inputCount: Array.isArray(input) ? input.length : 0,
    invalid, conflictingIds: conflicts.size, acceptedCount: rows.length } };
}

export function normalizeRounds(input, now = Date.now()) {
  return cleanRounds(input, finite(now) ? now : Date.now()).rows;
}

// Lanczos log-Gamma, continued-fraction incomplete Beta, and numerical quantiles.
// No random simulation or downloaded statistical runtime is required.
function logGamma(z) {
  const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = .9999999999998099;
  for (let i = 0; i < c.length; i++) x += c[i] / (z + i + 1);
  const t = z + 7.5;
  return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
}

function betaFraction(a, b, x) {
  const tiny = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 2000; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c; h *= delta;
    if (Math.abs(delta - 1) <= 2e-14) break;
  }
  return h;
}

function betaCDF(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) +
    a * Math.log(x) + b * Math.log1p(-x));
  return clamp(x < (a + 1) / (a + b + 2) ?
    front * betaFraction(a, b, x) / a : 1 - front * betaFraction(b, a, 1 - x) / b, 0, 1);
}

export function betaQuantile(probability, a, b) {
  if (!(a > 0 && b > 0) || !Number.isFinite(a + b) || !finite(probability) || probability < 0 || probability > 1) return NaN;
  if (probability === 0 || probability === 1) return probability;
  let lo = 0, hi = 1;
  for (let i = 0; i < 90; i++) {
    const x = (lo + hi) / 2;
    if (betaCDF(x, a, b) < probability) lo = x; else hi = x;
  }
  return (lo + hi) / 2;
}

function gammaCDF(x, a) {
  if (x <= 0) return 0;
  const scale = Math.exp(-x + a * Math.log(x) - logGamma(a)), tiny = 1e-300;
  if (x < a + 1) {
    let delta = 1 / a, sum = delta, ap = a;
    for (let i = 1; i <= 4000; i++) {
      delta *= x / ++ap; sum += delta;
      if (Math.abs(delta) <= Math.abs(sum) * 2e-14) break;
    }
    return clamp(sum * scale, 0, 1);
  }
  let b = x + 1 - a, c = 1 / tiny, d = 1 / (Math.abs(b) < tiny ? tiny : b), h = d;
  for (let i = 1; i <= 4000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c; h *= delta;
    if (Math.abs(delta - 1) <= 2e-14) break;
  }
  return clamp(1 - scale * h, 0, 1);
}

export function gammaQuantile(probability, a) {
  if (!(a > 0) || !finite(a) || !finite(probability) || probability < 0 || probability > 1) return NaN;
  if (probability === 0) return 0;
  if (probability === 1) return Infinity;
  let lo = 0, hi = Math.max(1, a + 12 * Math.sqrt(a));
  while (gammaCDF(hi, a) < probability) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const x = (lo + hi) / 2;
    if (gammaCDF(x, a) < probability) lo = x; else hi = x;
  }
  return (lo + hi) / 2;
}

function roundProbability(a, b, m) {
  let logNoHit = 0;
  for (let i = 0; i < m; i++) logNoHit += Math.log1p(-a / (a + b + i));
  return clamp(-Math.expm1(logNoHit), 0, 1);
}

export function analyzeHistory(input, now = Date.now()) {
  const safeNow = finite(now) ? now : Date.now(), { rows, quality } = cleanRounds(input, safeNow);
  const cutoff = rows.at(-1)?.timestamp ?? null, sampleSize = rows.length;
  const fresh = cutoff != null && safeNow - cutoff <= 180_000;
  const gaps = [];
  for (let i = Math.max(1, rows.length - 1000); i < rows.length; i++) {
    const delta = rows[i].timestamp - rows[i - 1].timestamp;
    if (delta > 0 && delta <= 300_000) gaps.push(delta);
  }
  const medianRoundMs = median(gaps), coverageGapMs = clamp((medianRoundMs || 20_000) * 3, 60_000, 180_000);
  // Do not discard long intervals when estimating an event rate. A large
  // coefficient can itself cause a long flight and a long preceding gap;
  // excluding that interval/hit would select against the target outcome.
  // Full-span exposure is descriptive and assumes continuous observation.
  // Unknown collector outages are reported, not silently censored as misses.
  const transitions = rows.slice(1);
  const observedMs = sampleSize > 1 ? rows.at(-1).timestamp - rows[0].timestamp : 0;
  let timeGapWarnings = 0, maxObservedGapMs = 0;
  for (let i = 1; i < rows.length; i++) {
    const delta = rows[i].timestamp - rows[i - 1].timestamp;
    maxObservedGapMs = Math.max(maxObservedGapMs, delta);
    if (delta > coverageGapMs) timeGapWarnings++;
  }
  const targets = TARGETS.map(target => {
    const hits = rows.filter(r => r.coefficient >= target), k = hits.length,
      a = k + .5, b = sampleSize - k + .5;
    const interval = [betaQuantile(.025, a, b), betaQuantile(.975, a, b)];
    const nextRounds = Object.fromEntries([1, 3, 5].map(m => [m, {
      probability: roundProbability(a, b, m),
      interval95: interval.map(p => clamp(-Math.expm1(m * Math.log1p(-p)), 0, 1)),
      horizon: m, unit: 'rounds', assumption: 'conditional_independent_rounds'
    }]));
    const clockEvents = transitions.filter(r => r.coefficient >= target).length;
    // Jeffreys prior for a homogeneous Poisson rate; full-span exposure is in minutes.
    // P(N_future>=1 | data)=1-(rate/(rate+W))^shape, not elapsed-event CDF.
    const exposureMinutes = observedMs / 60_000, shape = clockEvents + .5;
    let next3Minutes = null;
    if (exposureMinutes > 0) {
      const rate95 = [gammaQuantile(.025, shape), gammaQuantile(.975, shape)].map(v => v / exposureMinutes);
      next3Minutes = {
        probability: clamp(-Math.expm1(-shape * Math.log1p(3 / exposureMinutes)), 0, 1),
        interval95: rate95.map(rate => clamp(-Math.expm1(-rate * 3), 0, 1)),
        ratePerMinute: shape / exposureMinutes, rateInterval95: rate95,
        exposureMinutes, events: clockEvents, horizon: 180, unit: 'seconds',
        assumption: 'constant_poisson', calibrated: false, coverageVerified: false,
        exposureQuality: 'full_observed_span_including_unknown_gaps'
      };
    }
    return { target, hits: k, sampleSize, frequencyPct: sampleSize ? k / sampleSize * 100 : null,
      posterior: { a, b }, perRound: { probability: a / (a + b), interval95: interval },
      nextRounds, next3Minutes, lastHitAt: hits.at(-1)?.timestamp ?? null,
      calibrated: false, validatedEdge: false };
  });
  const reason = sampleSize < 200 ? 'insufficient_history' : !fresh ? 'stale_source' :
    !medianRoundMs || observedMs < WINDOW_MS ? 'insufficient_pace' : 'ready';
  return { version: MODEL_VERSION, modelKind: 'bayesian_frequency_baseline',
    ready: reason === 'ready', fresh, reason, now: safeNow, sampleSize, cutoff,
    lastRoundId: rows.at(-1)?.id ?? null, medianRoundMs, coverageGapMs, observedMs,
    targets, dataQuality: { ...quality, providerSequenceVerified: false,
      coverageVerified: false, timeGapWarnings, maxObservedGapMs,
      exposureQuality: 'full_observed_span_including_unknown_gaps' }, calibrated: false, validatedEdge: false,
    timingKind: 'observed_round_pace',
    explanation: 'Историческая оценка частоты; преимущество прогноза не подтверждено. Время — ориентир по темпу завершённых раундов.' };
}

export function createWindow(analysis, now = Date.now(), target = 10) {
  if (!analysis?.ready || !finite(now) || now < analysis.cutoff || now - analysis.cutoff > 180_000) return null;
  const estimate = analysis.targets?.find(t => t.target === Number(target));
  if (!estimate?.next3Minutes || !finite(analysis.medianRoundMs)) return null;
  const lead = clamp(Math.round(analysis.medianRoundMs), 10_000, 120_000), start = Math.round(now) + lead;
  const end = start + WINDOW_MS;
  return { id: `${MODEL_VERSION}:${analysis.lastRoundId}:${target}:${start}`, modelVersion: MODEL_VERSION,
    target: estimate.target, start, end, issuedAt: Math.round(now), estimatedAt: start,
    windowMs: WINDOW_MS, probability: estimate.next3Minutes.probability,
    interval95: [...estimate.next3Minutes.interval95], dataCutoff: analysis.cutoff,
    sampleSize: analysis.sampleSize, coverageGapMs: analysis.coverageGapMs,
    assumption: 'constant_poisson', scheduleKind: 'pace_estimate',
    scope: 'at_least_one_completed_round_in_window', calibrated: false, validatedEdge: false };
}

export function evaluateWindow(window, input, now = Date.now()) {
  const empty = { status: 'unknown', actual: null, resultAt: null, roundId: null };
  if (!window || !finite(now) || !finite(window.target) || window.target < 1 ||
      !finite(window.start) || !finite(window.end) || !finite(window.issuedAt) ||
      !(0 < window.issuedAt && window.issuedAt < window.start && window.start < window.end)) {
    return { ...empty, reason: 'invalid_window' };
  }
  const rows = normalizeRounds(input, now), inside = rows.filter(r =>
    r.timestamp >= window.start && r.timestamp <= window.end && r.timestamp > window.issuedAt);
  const best = inside.reduce((a, b) => !a || b.coefficient > a.coefficient ? b : a, null);
  const actual = best?.coefficient ?? null;
  // Even a known hit is not published as a final result before closure.
  if (now <= window.end) return { ...empty, status: 'pending', actual, reason: 'window_open' };
  if (best && best.coefficient >= window.target) return {
    status: 'hit', actual, resultAt: best.timestamp, roundId: best.id, reason: 'observed_hit_in_window'
  };
  const left = rows.findLastIndex(r => r.timestamp <= window.start), right = rows.findIndex(r => r.timestamp >= window.end);
  if (left < 0 || right < left || !inside.length) return { ...empty, actual, reason: 'missing_bracketing_history' };
  const maxGap = finite(window.coverageGapMs) ? clamp(window.coverageGapMs, 60_000, 180_000) : 60_000;
  for (let i = left + 1; i <= right; i++) {
    if (rows[i].timestamp - rows[i - 1].timestamp > maxGap) {
      return { ...empty, actual, reason: 'history_gap' };
    }
  }
  return { status: 'miss', actual, resultAt: best?.timestamp ?? null, roundId: best?.id ?? null,
    reason: 'no_threshold_hit_in_covered_window', coverageEvidence: 'timestamp_brackets_and_gap_limit' };
}
