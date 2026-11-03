import {normalizeRounds} from '../prediction-v2.ts';
import {inverseBetaCDF} from '../rare-window-model.mjs';

// Pure, independent renewal diagnostics. Fits and intervals describe assumptions
// conditional on these observations; validation/consensus is owned elsewhere.
export const TARGETS = Object.freeze([10, 15, 20, 50, 100]);
export const HORIZONS = Object.freeze([1, 3, 5]);
export const AGE_BINS = Object.freeze([0, 1, 2, 3, 5, 10, 20, 50, 100, 200, 500, Infinity]);
export const EVIDENCE_STATUS = 'experimental-unvalidated';
const MAX_GAP_MS = 180000;
const MIN_TIMESTAMP = 946684800000;
const MIN_ROWS = 500, MIN_KNOWN_EVENTS = 20, MIN_BIN_EXPOSURES = 30, MIN_WEIBULL_EVENTS = 30;
const LOG_SHAPE_MIN = Math.log(.2), LOG_SHAPE_MAX = Math.log(5);
const LOG_SCALE_MIN = Math.log(.1), LOG_SCALE_MAX = Math.log(1e7);
const clamp01 = value => Math.max(0, Math.min(1, value));
const validTime = value => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP && value <= 8640000000000000;
const binIndex = age => {
  for (let index = 0; index < AGE_BINS.length - 1; index++) if (age < AGE_BINS[index + 1]) return index;
  return AGE_BINS.length - 2;
};
function freeze(object) {
  if (object && typeof object === 'object' && !Object.isFrozen(object)) {
    for (const value of Object.values(object)) freeze(value);
    Object.freeze(object);
  }
  return object;
}

function grouped(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  return [...map].sort((a, b) => a[0] - b[0]);
}

// Discrete intervals are (g-1,g], not continuous Weibull densities evaluated at
// integers. Trailing completed non-event rounds contribute right censoring S(c).
function negativeLogLikelihood(parameters, events, censored) {
  const [logShape, logScale] = parameters;
  if (!parameters.every(Number.isFinite) || logShape < LOG_SHAPE_MIN || logShape > LOG_SHAPE_MAX ||
      logScale < LOG_SCALE_MIN || logScale > LOG_SCALE_MAX) return Infinity;
  const shape = Math.exp(logShape), scale = Math.exp(logScale);
  let loss = 0;
  for (const [gap, n] of events) {
    const left = gap === 1 ? 0 : Math.exp(shape * (Math.log(gap - 1) - logScale));
    const right = Math.exp(shape * (Math.log(gap) - logScale));
    const difference = right - left;
    if (!(difference > 0) || !Number.isFinite(right)) return Infinity;
    const logProbability = -left + Math.log(-Math.expm1(-difference));
    if (!Number.isFinite(logProbability)) return Infinity;
    loss -= n * logProbability;
  }
  for (const [duration, n] of censored) loss += n * (duration / scale) ** shape;
  return Number.isFinite(loss) ? loss : Infinity;
}

function nelderMead(loss, initial) {
  let points = [initial, [initial[0] + .15, initial[1]], [initial[0], initial[1] + .15]]
    .map(point => ({point: [...point], value: loss(point)}));
  let converged = false;
  for (let iteration = 0; iteration < 240; iteration++) {
    points.sort((a, b) => a.value - b.value);
    if (Math.max(...points.slice(1).flatMap(item => item.point.map((value, index) => Math.abs(value - points[0].point[index])))) < 1e-7) {converged = true; break;}
    const center = points[0].point.map((value, index) => (value + points[1].point[index]) / 2);
    const proposal = factor => center.map((value, index) => value + factor * (value - points[2].point[index]));
    const reflected = {point: proposal(1)}; reflected.value = loss(reflected.point);
    if (reflected.value < points[0].value) {
      const expanded = {point: proposal(2)}; expanded.value = loss(expanded.point);
      points[2] = expanded.value < reflected.value ? expanded : reflected;
    } else if (reflected.value < points[1].value) points[2] = reflected;
    else {
      const outside = reflected.value < points[2].value;
      const contracted = {point: proposal(outside ? .5 : -.5)}; contracted.value = loss(contracted.point);
      if (contracted.value < (outside ? reflected.value : points[2].value)) points[2] = contracted;
      else for (let index = 1; index < 3; index++) {
        points[index].point = points[index].point.map((value, axis) => (value + points[0].point[axis]) / 2);
        points[index].value = loss(points[index].point);
      }
    }
  }
  points.sort((a, b) => a.value - b.value);
  return {...points[0], converged};
}

function hessianCovariance(loss, point) {
  const step = .001, center = loss(point);
  const at = (x, y) => loss([point[0] + x * step, point[1] + y * step]);
  const a = (at(1, 0) - 2 * center + at(-1, 0)) / step ** 2;
  const d = (at(0, 1) - 2 * center + at(0, -1)) / step ** 2;
  const b = (at(1, 1) - at(1, -1) - at(-1, 1) + at(-1, -1)) / (4 * step ** 2);
  const determinant = a * d - b * b;
  if (![a, b, d, determinant].every(Number.isFinite) || a <= 0 || d <= 0 || determinant <= 1e-9) return null;
  const trace = a + d, discriminant = Math.sqrt((a - d) ** 2 + 4 * b * b);
  if ((trace + discriminant) / (trace - discriminant) > 1e10) return null;
  return [[d / determinant, -b / determinant], [-b / determinant, a / determinant]];
}

export function weibullRoundProbability(shape, scale, ageRounds, horizon) {
  if (![shape, scale].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0) ||
      !Number.isSafeInteger(ageRounds) || ageRounds < 0 || !Number.isSafeInteger(horizon) || horizon < 1) return null;
  const before = ageRounds === 0 ? 0 : (ageRounds / scale) ** shape;
  const after = ((ageRounds + horizon) / scale) ** shape;
  return clamp01(-Math.expm1(-(after - before)));
}

/** Public numerical fixture helper; all gaps are measured in completed rounds. */
export function fitDiscreteWeibull(eventGaps, censoredGaps = []) {
  if (!Array.isArray(eventGaps) || !Array.isArray(censoredGaps) ||
      eventGaps.some(value => !Number.isSafeInteger(value) || value < 1) ||
      censoredGaps.some(value => !Number.isSafeInteger(value) || value < 0))
    return {status: 'insufficient', reason: 'invalid-renewal-gaps'};
  if (eventGaps.length < MIN_WEIBULL_EVENTS) return {status: 'insufficient', reason: 'insufficient-renewal-events', eventCount: eventGaps.length};
  const events = grouped(eventGaps), censored = grouped(censoredGaps.filter(value => value > 0));
  const totalExposure = [...events, ...censored].reduce((sum, [duration, n]) => sum + duration * n, 0);
  const loss = parameters => negativeLogLikelihood(parameters, events, censored);
  const result = nelderMead(loss, [0, Math.log(Math.max(.2, totalExposure / eventGaps.length))]);
  const [logShape, logScale] = result.point;
  if (!result.converged || !Number.isFinite(result.value) ||
      logShape - LOG_SHAPE_MIN < .001 || LOG_SHAPE_MAX - logShape < .001 ||
      logScale - LOG_SCALE_MIN < .001 || LOG_SCALE_MAX - logScale < .001)
    return {status: 'insufficient', reason: 'unstable-or-boundary-weibull-fit', eventCount: eventGaps.length};
  const covariance = hessianCovariance(loss, result.point);
  if (!covariance) return {status: 'insufficient', reason: 'singular-weibull-uncertainty', eventCount: eventGaps.length};
  return {
    status: 'ready', reason: null, shape: Math.exp(logShape), scale: Math.exp(logScale),
    logParameters: result.point, covariance, negativeLogLikelihood: result.value,
    shapeInterval95: [-1.96, 1.96].map(z => Math.exp(logShape + z * Math.sqrt(covariance[0][0]))),
    scaleInterval95: [-1.96, 1.96].map(z => Math.exp(logScale + z * Math.sqrt(covariance[1][1]))),
    eventCount: eventGaps.length, rightCensoredCount: censoredGaps.filter(value => value > 0).length,
    totalExposureRounds: totalExposure,
    fitKind: 'discrete-interval-weibull-mle-with-right-censoring',
    intervalKind: 'asymptotic-log-parameter-observed-hessian',
  };
}

// A timestamp does not provide an authoritative order inside a tied block.
// Discard its ENTIRE group (including its first member) and censor the renewal
// segment before it. A later unique event is needed to establish age again.
function unambiguousChronology(ordered) {
  const rows = [], breakBefore = new Set();
  let tiedGroupCount = 0, tiedRoundCount = 0, pendingBreak = true;
  for (let index = 0; index < ordered.length;) {
    let end = index + 1;
    while (end < ordered.length && ordered[end].timestamp === ordered[index].timestamp) end++;
    if (end - index > 1) {
      tiedGroupCount++; tiedRoundCount += end - index; pendingBreak = true;
    } else {
      const row = ordered[index], previous = rows.at(-1);
      if (pendingBreak || !previous || row.timestamp - previous.timestamp > MAX_GAP_MS) breakBefore.add(rows.length);
      rows.push(row); pendingBreak = false;
    }
    index = end;
  }
  return {rows, breakBefore, tiedGroupCount, tiedRoundCount};
}

function targetFit(rows, target, breakBefore) {
  const bins = AGE_BINS.slice(0, -1).map((lower, index) => ({lower, upper: AGE_BINS[index + 1], exposures: 0, events: 0}));
  const eventGaps = [], censoredGaps = [];
  let age = null, previousAt = null, knownEvents = 0, allEvents = 0, segments = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (previousAt === null || breakBefore.has(index) || row.timestamp - previousAt > MAX_GAP_MS) {
      if (age !== null) censoredGaps.push(age);
      age = null; segments++;
    }
    const event = row.coefficient >= target;
    if (event) allEvents++;
    if (age !== null) {
      const bin = bins[binIndex(age)]; bin.exposures++;
      if (event) {bin.events++; eventGaps.push(age + 1); knownEvents++; age = 0;}
      else age++;
    } else if (event) age = 0;
    previousAt = row.timestamp;
  }
  if (age !== null) censoredGaps.push(age);
  for (const bin of bins) {
    bin.alpha = bin.events + .5; bin.beta = bin.exposures - bin.events + .5;
    // At most five different hazard bins can enter a requested horizon. A
    // Bonferroni envelope has >=95% joint posterior coverage, conditional on
    // independent bin priors and this fixed binning. It is not calibration.
    bin.bounds = Array.from({length: 5}, (_, index) => {
      const tail = .025 / (index + 1);
      return [inverseBetaCDF(tail, bin.alpha, bin.beta), inverseBetaCDF(1 - tail, bin.alpha, bin.beta)];
    });
  }
  const reason = rows.length < MIN_ROWS ? 'insufficient-training-rounds' : knownEvents < MIN_KNOWN_EVENTS ? 'insufficient-known-age-events' : null;
  return {
    target, eventCount: allEvents, knownAgeEventCount: knownEvents, segmentCount: segments,
    lastKnownAgeRounds: age, bayesian: {status: reason ? 'insufficient' : 'ready', reason, bins,
      intervalKind: 'at-least-95-percent-bonferroni-posterior-envelope'},
    weibull: reason ? {status: 'insufficient', reason} : fitDiscreteWeibull(eventGaps, censoredGaps),
  };
}

export function fitSurvivalModels(input, {targets = TARGETS, now = Date.now()} = {}) {
  const accepted = normalizeRounds(input, now).reverse();
  const {rows, breakBefore, tiedGroupCount, tiedRoundCount} = unambiguousChronology(accepted);
  const acceptedTargets = Array.isArray(targets) ? [...new Set(targets.filter(value => typeof value === 'number' && Number.isFinite(value) && value > 1))].sort((a, b) => a - b) : [];
  return freeze({modelId: 'survival-models-v1', evidenceStatus: EVIDENCE_STATUS,
    trainedAt: validTime(now) ? now : null, dataCutoff: accepted.at(-1)?.timestamp ?? null,
    firstAt: accepted[0]?.timestamp ?? null, sampleSize: rows.length,
    diagnostics: {acceptedRoundCount: accepted.length, usableRoundCount: rows.length,
      excludedTiedGroupCount: tiedGroupCount, excludedTiedRoundCount: tiedRoundCount,
      tiedTimestampPolicy: 'exclude-whole-group-and-break-renewal-segment'},
    gapThresholdMs: MAX_GAP_MS, horizons: [...HORIZONS],
    targets: acceptedTargets.map(target => targetFit(rows, target, breakBefore)),
    assumptions: ['renewal-within-contiguous-observed-segments', 'fixed-age-bins',
      'unknown-left-edge-age-excluded', 'right-censoring-at-segment-ends',
      'equal-timestamp-groups-excluded-and-censored', 'completed-round-horizons'],
  });
}

function bayesianProbability(fit, age, horizon) {
  const usage = new Map();
  for (let step = 0; step < horizon; step++) {
    const index = binIndex(age + step); usage.set(index, (usage.get(index) || 0) + 1);
  }
  if ([...usage.keys()].some(index => fit.bins[index].exposures < MIN_BIN_EXPOSURES))
    return {reason: 'insufficient-age-bin-exposure'};
  if ([...usage.keys()].some(index => {
    const bounds = fit.bins[index].bounds?.[usage.size - 1];
    return !Array.isArray(bounds) || bounds.length !== 2 ||
      !bounds.every(value => Number.isFinite(value) && value >= 0 && value <= 1) || bounds[0] > bounds[1];
  })) return {reason: 'unstable-hazard-posterior'};
  let expectedSurvival = 1, lowerSurvival = 1, upperSurvival = 1;
  for (const [index, repeats] of usage) {
    const bin = fit.bins[index], bounds = bin.bounds[usage.size - 1];
    for (let j = 0; j < repeats; j++) expectedSurvival *= (bin.beta + j) / (bin.alpha + bin.beta + j);
    lowerSurvival *= (1 - bounds[1]) ** repeats;
    upperSurvival *= (1 - bounds[0]) ** repeats;
  }
  return {probability: clamp01(1 - expectedSurvival), interval95: [clamp01(1 - upperSurvival), clamp01(1 - lowerSurvival)]};
}

function weibullProbability(fit, age, horizon) {
  const probability = weibullRoundProbability(fit.shape, fit.scale, age, horizon);
  if (probability === null || probability <= 1e-12 || probability >= 1 - 1e-12) return null;
  const logit = parameters => {
    const value = weibullRoundProbability(Math.exp(parameters[0]), Math.exp(parameters[1]), age, horizon);
    return value > 0 && value < 1 ? Math.log(value / (1 - value)) : NaN;
  };
  const step = 1e-4;
  const gradient = [0, 1].map(index => {
    const plus = [...fit.logParameters], minus = [...fit.logParameters]; plus[index] += step; minus[index] -= step;
    return (logit(plus) - logit(minus)) / (2 * step);
  });
  const covariance = fit.covariance;
  const variance = gradient[0] ** 2 * covariance[0][0] + 2 * gradient[0] * gradient[1] * covariance[0][1] + gradient[1] ** 2 * covariance[1][1];
  if (!Number.isFinite(variance) || variance < 0) return null;
  const center = Math.log(probability / (1 - probability)), deviation = 1.96 * Math.sqrt(variance);
  return {probability, interval95: [center - deviation, center + deviation].map(value => 1 / (1 + Math.exp(-value)))};
}

/** Cheap as-of interface for chronological validators maintaining their own age. */
export function predictSurvivalAtAge(fit, {target, ageRounds, now = Date.now(), lastAt = now} = {}) {
  const trained = fit?.targets?.find(item => item.target === target);
  const sourceReason = fit?.modelId !== 'survival-models-v1' || !trained ? 'unknown-target-or-fit' :
    !validTime(now) || !validTime(lastAt) || !validTime(fit.trainedAt) || !validTime(fit.dataCutoff) ||
      fit.trainedAt > now || fit.dataCutoff > lastAt || lastAt > now ? 'invalid-as-of-time' :
      now - lastAt > MAX_GAP_MS ? 'stale-live-history' :
        !Number.isSafeInteger(ageRounds) || ageRounds < 0 ? 'unknown-current-renewal-age' : null;
  const records = [];
  for (const [key, modelId] of [['bayesian', 'bayesian-hazard-v1'], ['weibull', 'weibull-survival-v1']]) for (const horizon of HORIZONS) {
    const component = trained?.[key];
    let reason = sourceReason ?? (component?.status === 'ready' ? null : component?.reason || 'insufficient-model-fit');
    const computed = reason ? null : key === 'bayesian' ? bayesianProbability(component, ageRounds, horizon) : weibullProbability(component, ageRounds, horizon);
    if (!reason && computed?.reason) reason = computed.reason;
    if (!reason && !computed) reason = 'unstable-prediction-uncertainty';
    const result = reason ? null : computed;
    records.push({modelId, target, horizon, status: result ? 'ready' : 'insufficient', reason,
      evidenceStatus: EVIDENCE_STATUS, probability: result?.probability ?? null, interval95: result?.interval95 ?? null,
      intervalKind: key === 'bayesian' ? 'at-least-95-percent-bonferroni-posterior-envelope' : 'asymptotic-logit-delta-parameter-uncertainty',
      ageRounds: Number.isSafeInteger(ageRounds) && ageRounds >= 0 ? ageRounds : null,
      trainedAt: fit?.trainedAt ?? null, dataCutoff: fit?.dataCutoff ?? null, generatedAt: now,
      horizonUnit: 'completed-rounds', assumptions: key === 'bayesian' ? 'piecewise-constant-age-hazards' : 'discrete-weibull-renewal',
    });
  }
  return records;
}

export function predictSurvivalModels(fit, recentInput, {now = Date.now()} = {}) {
  const recent = normalizeRounds(recentInput, now);
  const prepared = unambiguousChronology([...recent].reverse());
  const lastAt = recent[0]?.timestamp ?? null;
  const latestIsTied = lastAt !== null && prepared.rows.at(-1)?.timestamp !== lastAt;
  const start = [...prepared.breakBefore].at(-1) ?? 0;
  const segment = latestIsTied ? [] : prepared.rows.slice(start).reverse();
  return (fit?.targets || []).flatMap(({target}) => {
    const index = segment.findIndex(row => row.coefficient >= target);
    return predictSurvivalAtAge(fit, {target, ageRounds: index >= 0 ? index : null, now, lastAt})
      .map(record => ({...record, excludedCurrentTiedGroupCount: prepared.tiedGroupCount,
        excludedCurrentTiedRoundCount: prepared.tiedRoundCount, latestTimestampAmbiguous: latestIsTied}));
  });
}
