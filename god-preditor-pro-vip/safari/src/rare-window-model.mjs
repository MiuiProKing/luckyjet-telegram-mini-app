import {normalizeRounds} from './prediction-v2.ts';

/**
 * Experimental observation aid. Neither model has prospective calibration.
 * Observed cadence is an operational coverage assumption, never proof that a
 * provider delivered every round. No elapsed-wait or betting rule is used.
 */
export const MODEL = 'rare-window-v1';
export const EVIDENCE_STATUS = 'experimental-unvalidated';
export const THRESHOLD = 100;
export const HORIZON_MS = 180_000;
export const MIN_ROUNDS = 500;
export const MAX_WINDOWS = 200;
export const RECENT_WINDOWS = 30;
export const MIN_REFERENCE_WINDOWS = 60;
export const MIN_EVENTS = 5;
export const COVERAGE_ASSUMPTION = 'operational-coverage-assumption';
const MINUTE = 60_000;
const MIN_TIMESTAMP = 946_684_800_000;
const MAX_NOW = 8_640_000_000_000_000 - 30 * MINUTE;
const clamp01 = x => Math.max(0, Math.min(1, x));

// Lanczos log-Gamma, followed by stable lower/upper-tail special functions.
// Public helpers support independent mathematical fixtures without dependencies.
export function logGamma(z) {
  if (!Number.isFinite(z) || z <= 0) return NaN;
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  const shifted = z - 1;
  let sum = .99999999999980993;
  for (let i = 0; i < coefficients.length; i++) sum += coefficients[i] / (shifted + i + 1);
  const t = shifted + 7.5;
  return .9189385332046727 + (shifted + .5) * Math.log(t) - t + Math.log(sum);
}

function betaFraction(a, b, x) {
  const tiny = 1e-300;
  const nonzero = value => Math.abs(value) < tiny ? (value < 0 ? -tiny : tiny) : value;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 / nonzero(1 - qab * x / qap), h = d;
  for (let m = 1; m <= 300; m++) {
    const twice = 2 * m;
    let aa = m * (b - m) * x / ((qam + twice) * (a + twice));
    d = 1 / nonzero(1 + aa * d);
    c = nonzero(1 + aa / c);
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + twice) * (qap + twice));
    d = 1 / nonzero(1 + aa * d);
    c = nonzero(1 + aa / c);
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-14) return h;
  }
  return NaN;
}

/** Regularized incomplete Beta I_x(a,b). */
export function regularizedBeta(x, a, b) {
  if (![x, a, b].every(Number.isFinite) || a <= 0 || b <= 0 || x < 0 || x > 1) return NaN;
  if (x === 0 || x === 1) return x;
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  return clamp01(x < (a + 1) / (a + b + 2)
    ? factor * betaFraction(a, b, x) / a
    : 1 - factor * betaFraction(b, a, 1 - x) / b);
}

export function inverseBetaCDF(p, a, b) {
  if (![p, a, b].every(Number.isFinite) || p < 0 || p > 1 || a <= 0 || b <= 0) return NaN;
  if (p === 0 || p === 1) return p;
  let low = 0, high = 1;
  for (let i = 0; i < 90; i++) {
    const middle = (low + high) / 2;
    const cdf = regularizedBeta(middle, a, b);
    if (!Number.isFinite(cdf)) return NaN;
    if (cdf < p) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Regularized lower incomplete Gamma P(shape,x), with unit rate. */
export function regularizedGamma(shape, x) {
  if (!Number.isFinite(shape) || shape <= 0 || typeof x !== 'number' || Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return 0;
  if (x === Infinity) return 1;
  const factor = Math.exp(shape * Math.log(x) - x - logGamma(shape));
  if (x < shape + 1) {
    let term = 1 / shape, sum = term;
    for (let i = 1; i <= 2000; i++) {
      term *= x / (shape + i);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 3e-14) return clamp01(sum * factor);
    }
  } else {
    const tiny = 1e-300;
    const nonzero = value => Math.abs(value) < tiny ? (value < 0 ? -tiny : tiny) : value;
    let b = x + 1 - shape, c = 1 / tiny, d = 1 / nonzero(b), h = d;
    for (let i = 1; i <= 2000; i++) {
      const an = -i * (i - shape);
      b += 2;
      d = 1 / nonzero(an * d + b);
      c = nonzero(b + an / c);
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 3e-14) return clamp01(1 - factor * h);
    }
  }
  return NaN;
}

export function inverseGammaCDF(p, shape) {
  if (![p, shape].every(Number.isFinite) || p < 0 || p > 1 || shape <= 0) return NaN;
  if (p === 0) return 0;
  if (p === 1) return Infinity;
  let low = 0, high = Math.max(1, shape);
  for (let i = 0; i < 100 && regularizedGamma(shape, high) < p; i++) high *= 2;
  if (regularizedGamma(shape, high) < p) return NaN;
  for (let i = 0; i < 100; i++) {
    const middle = (low + high) / 2;
    const cdf = regularizedGamma(shape, middle);
    if (!Number.isFinite(cdf)) return NaN;
    if (cdf < p) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Conditional Gamma-Jeffreys/Poisson arithmetic, independent of clock time. */
export function gammaPoissonPosterior(eventCount, exposureMs, horizonMs = HORIZON_MS) {
  if (!Number.isSafeInteger(eventCount) || eventCount < 0 || !Number.isFinite(exposureMs) ||
      exposureMs <= 0 || !Number.isFinite(horizonMs) || horizonMs < 0) return null;
  const shape = eventCount + .5;
  const rateInterval95PerMs = [.025, .975].map(p => inverseGammaCDF(p, shape) / exposureMs);
  if (!rateInterval95PerMs.every(Number.isFinite)) return null;
  return {
    shape, rateMs: exposureMs, meanRatePerMs: shape / exposureMs,
    rateInterval95PerMs,
    probability: -Math.expm1(-shape * Math.log1p(horizonMs / exposureMs)),
    probabilityInterval95: rateInterval95PerMs.map(rate => -Math.expm1(-rate * horizonMs)),
  };
}

function newestSegment(rows) {
  let boundary = rows.length, boundaryGapMs = null;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i - 1].timestamp - rows[i].timestamp;
    if (gap > HORIZON_MS) {boundary = i; boundaryGapMs = gap; break;}
  }
  return {
    rows: rows.slice(0, boundary).reverse(),
    diagnostics: {
      gapThresholdMs: HORIZON_MS, currentSegmentCount: boundary,
      discardedOlderSegmentRows: rows.length - boundary, boundaryGapMs,
      coverageAssumption: COVERAGE_ASSUMPTION,
    },
  };
}

function completedWindows(rows) {
  if (rows.length < 2) return [];
  const firstAt = rows[0].timestamp, lastAt = rows.at(-1).timestamp;
  const lastEnd = Math.floor(lastAt / HORIZON_MS) * HORIZON_MS;
  const firstStart = Math.max(Math.ceil(firstAt / HORIZON_MS) * HORIZON_MS, lastEnd - MAX_WINDOWS * HORIZON_MS);
  const windows = [];
  let index = 0;
  // Both endpoints are bracketed by actual observations in one contiguous
  // segment. now is never treated as an observation or an exposure endpoint.
  for (let start = firstStart; start + HORIZON_MS <= lastEnd; start += HORIZON_MS) {
    const end = start + HORIZON_MS;
    while (index < rows.length && rows[index].timestamp <= start) index++;
    let rowCount = 0, eventCount = 0;
    while (index < rows.length && rows[index].timestamp <= end) {
      rowCount++;
      eventCount += Number(rows[index].coefficient >= THRESHOLD);
      index++;
    }
    windows.push({start, end, rowCount, eventCount, hit: eventCount > 0});
  }
  return windows;
}

function windowSummary(windows) {
  if (!windows.length) return null;
  const n = windows.length, hits = windows.filter(w => w.hit).length;
  const a = hits + .5, b = n - hits + .5;
  return {
    start: windows[0].start, end: windows.at(-1).end, windowCount: n,
    hitWindowCount: hits, eventCount: windows.reduce((sum, w) => sum + w.eventCount, 0),
    observedFrequency: hits / n, posteriorMean: a / (a + b),
    interval95: [.025, .975].map(p => inverseBetaCDF(p, a, b)),
    posterior: {distribution: 'beta', alpha: a, beta: b},
  };
}

/**
 * Analyze strictly completed observations. A candidate means only that two
 * disjoint historical window groups differ under the stated Beta model; its
 * fixed future observation window is not a calibrated future hit probability.
 */
export function analyzeRareWindows(input, now = Date.now()) {
  const validNow = Number.isSafeInteger(now) && now >= MIN_TIMESTAMP && now <= MAX_NOW;
  const normalized = normalizeRounds(input, now);
  const segment = newestSegment(normalized), rows = segment.rows;
  const firstAt = rows[0]?.timestamp ?? null, lastAt = rows.at(-1)?.timestamp ?? null;
  const ageMs = lastAt === null || !validNow ? null : now - lastAt;
  const fresh = ageMs !== null && ageMs <= HORIZON_MS;
  const exposureMs = firstAt === null ? 0 : lastAt - firstAt;
  const gateReason = !validNow ? 'invalid-now' : !Array.isArray(input) ? 'invalid-input'
    : !rows.length ? 'no-valid-completed-rounds' : !fresh ? 'stale-data'
      : rows.length < MIN_ROUNDS ? 'insufficient-contiguous-history'
        : exposureMs <= 0 ? 'no-positive-exposure' : null;
  const ready = gateReason === null;
  // Every result at the left exposure boundary is excluded, even if distinct
  // IDs share that timestamp. IDs never stand in for elapsed time or sequence.
  const eventCount = rows.filter(r => r.timestamp > firstAt && r.coefficient >= THRESHOLD).length;
  let poissonReason = gateReason ?? (exposureMs < HORIZON_MS ? 'insufficient-exposure'
    : eventCount < MIN_EVENTS ? 'insufficient-events' : null);
  const posterior = poissonReason === null ? gammaPoissonPosterior(eventCount, exposureMs) : null;
  if (poissonReason === null && posterior === null) poissonReason = 'numerical-failure';
  const poisson = {
    status: posterior ? 'ready' : 'insufficient', reason: poissonReason,
    model: 'stationary-poisson-gamma-jeffreys', evidenceStatus: 'assumption-only-not-calibrated',
    assumption: 'stationary-event-rate', coverageAssumption: COVERAGE_ASSUMPTION,
    exposureStart: firstAt, exposureEnd: lastAt, exposureMs, eventCount,
    intervalConvention: 'start-exclusive-end-inclusive', horizonMs: HORIZON_MS,
    observedRatePerMs: exposureMs > 0 ? eventCount / exposureMs : null,
    posteriorShape: posterior?.shape ?? null, posteriorRateMs: posterior?.rateMs ?? null,
    posteriorMeanRatePerMs: posterior?.meanRatePerMs ?? null,
    rateInterval95PerMs: posterior?.rateInterval95PerMs ?? null,
    probability: posterior?.probability ?? null,
    probabilityInterval95: posterior?.probabilityInterval95 ?? null,
    intervalKind: '95-percent-equal-tailed-gamma-posterior',
  };
  const windows = completedWindows(rows);
  const split = Math.max(0, windows.length - RECENT_WINDOWS);
  const recent = windowSummary(windows.slice(split));
  const reference = windowSummary(windows.slice(0, split));
  const numericalSupport = [...(recent?.interval95 ?? []), ...(reference?.interval95 ?? [])].every(Number.isFinite);
  const bayesianReason = gateReason ?? (recent?.windowCount !== RECENT_WINDOWS ||
    (reference?.windowCount ?? 0) < MIN_REFERENCE_WINDOWS ? 'insufficient-covered-windows'
    : recent.hitWindowCount < MIN_EVENTS || reference.hitWindowCount < MIN_EVENTS ? 'insufficient-hit-windows'
      : !numericalSupport ? 'numerical-failure' : null);
  const supported = bayesianReason === null;
  const localRise = supported && recent.interval95[0] > reference.interval95[1];
  const bayesian = {
    status: supported ? 'ready' : 'insufficient',
    reason: bayesianReason ?? (localRise ? 'experimental-local-frequency-rise' : 'no-supported-local-rise'),
    model: 'beta-jeffreys-window-frequency', evidenceStatus: EVIDENCE_STATUS,
    coverageAssumption: COVERAGE_ASSUMPTION,
    assumption: 'exchangeable-window-outcomes-within-each-historical-group',
    intervalConvention: 'start-exclusive-end-inclusive',
    intervalKind: '95-percent-equal-tailed-beta-posterior',
    windows, windowCount: windows.length,
    hitWindowCount: windows.filter(w => w.hit).length,
    eventCount: windows.reduce((sum, w) => sum + w.eventCount, 0),
    recent, reference, localFrequencyRise: localRise,
    currentWindowFrequency: supported ? recent.posteriorMean : null,
    currentWindowFrequencyInterval95: supported ? recent.interval95 : null,
  };
  const start = validNow ? Math.ceil((now + 2 * MINUTE) / MINUTE) * MINUTE : null;
  const candidate = localRise ? {
    model: MODEL, source: 'beta-window-frequency', target: THRESHOLD,
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
    reason: 'Disjoint historical window groups have separated 95% Beta posterior intervals; future performance is unvalidated.',
  } : null;
  return {
    ready, evidenceStatus: EVIDENCE_STATUS, threshold: THRESHOLD, horizonMs: HORIZON_MS,
    poisson, bayesian, candidate,
    diagnostics: {
      analyzedAt: validNow ? now : null, reason: gateReason ?? bayesian.reason,
      inputCount: Array.isArray(input) ? input.length : 0, acceptedCount: normalized.length,
      rejectedCount: Array.isArray(input) ? input.length - normalized.length : 0,
      lastAt, freshestAgeMs: ageMs, fresh, ...segment.diagnostics,
    },
  };
}
