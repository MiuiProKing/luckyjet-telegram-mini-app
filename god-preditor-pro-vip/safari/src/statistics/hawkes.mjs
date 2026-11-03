import {normalizeRounds} from '../prediction-v2.ts';
import {inverseGammaCDF} from '../rare-window-model.mjs';

// Conditional point-process diagnostic only. The source's inter-round spacing
// is an operational coverage assumption, not proof that every round arrived.
export const HAWKES_MODEL = 'hawkes-exponential';
export const HAWKES_TARGETS = Object.freeze([10, 15, 20, 50, 100]);
export const HAWKES_DECAY_SECONDS = Object.freeze([30, 60, 120, 300]);
export const HAWKES_EVIDENCE = 'experimental-unvalidated';
const GAP_MS = 180000, MIN_EVENTS = 20, MIN_ROUNDS = 500, MAX_BRANCHING = .95;
const MIN_TIME = 946684800000, MAX_TIME = 8640000000000000 - 30 * 60000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const timestamp = value => Number.isSafeInteger(value) && value >= MIN_TIME && value <= MAX_TIME;
const validTarget = value => finite(value) && value >= 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const probability = hazard => -Math.expm1(-Math.max(0, hazard));

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function segmentsOf(rows) {
  const segments = [];
  let current = [], excludedAmbiguousRows = 0, excludedAmbiguousBlocks = 0, lastAmbiguousAt = null;
  const flush = () => {if (current.length) segments.push(current); current = [];};
  for (let i = 0; i < rows.length;) {
    let end = i + 1;
    while (end < rows.length && rows[end].timestamp === rows[i].timestamp) end++;
    if (end - i > 1) {
      // Never deduplicate or choose an event by ID/coefficient. The whole
      // ambiguous clock group is unobserved, and its adjacent exposure is cut.
      flush(); excludedAmbiguousRows += end - i; excludedAmbiguousBlocks++;
      lastAmbiguousAt = rows[i].timestamp;
    } else {
      if (current.length && rows[i].timestamp - current.at(-1).timestamp > GAP_MS) flush();
      current.push(rows[i]);
    }
    i = end;
  }
  flush();
  return {segments, excludedAmbiguousRows, excludedAmbiguousBlocks, lastAmbiguousAt};
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function targetSegments(segments, target) {
  let exposure = 0, events = 0, tiedEvents = 0;
  const observed = [];
  for (const segment of segments) {
    const first = segment[0].timestamp, duration = (segment.at(-1).timestamp - first) / 1000;
    const eventTimes = [], seeds = segment.filter(row => row.timestamp === first && row.coefficient >= target).length;
    if (seeds > 1) tiedEvents += seeds - 1;
    if (!(duration > 0)) continue;
    let previousEventAt = seeds > 0 ? first : null;
    for (const row of segment) {
      if (row.timestamp <= first || row.coefficient < target) continue;
      if (row.timestamp === previousEventAt) tiedEvents++;
      previousEventAt = row.timestamp;
      eventTimes.push((row.timestamp - first) / 1000);
    }
    // Known left-boundary events condition the intensity but are not counted as
    // outcomes in the subsequent positive exposure interval.
    exposure += duration; events += eventTimes.length;
    observed.push({duration, seeds, eventTimes});
  }
  return {segments: observed, exposure, events, tiedEvents};
}

/** Exact conditional exponential-kernel sufficient values for a fixed beta. */
export function hawkesLikelihoodData(segments, beta) {
  if (!finite(beta) || beta <= 0 || !Array.isArray(segments)) return null;
  const history = [];
  let exposure = 0, integratedKernel = 0, terminal = 0;
  for (const segment of segments) {
    const {duration, seeds, eventTimes} = segment;
    if (!finite(duration) || duration <= 0 || !Number.isSafeInteger(seeds) || seeds < 0 ||
        !Array.isArray(eventTimes)) return null;
    let r = seeds, previous = 0;
    integratedKernel += seeds * -Math.expm1(-beta * duration);
    for (const time of eventTimes) {
      if (!finite(time) || time <= previous || time > duration) return null;
      r *= Math.exp(-beta * (time - previous));
      history.push(r);
      r += 1; previous = time;
      integratedKernel += -Math.expm1(-beta * (duration - time));
    }
    terminal = r * Math.exp(-beta * (duration - previous));
    exposure += duration;
  }
  return {history, exposure, integratedKernel, terminal};
}

function objective(data, rate, u, n, derivatives = false) {
  const beta = data.beta;
  if (!(u > 0) || n < 0 || n > MAX_BRANCHING) return {penalized: -Infinity};
  let ll = -rate * u * data.exposure - n * data.integratedKernel;
  let gu = -rate * data.exposure, gn = -data.integratedKernel - 4 * n;
  let auu = 0, aun = 0, ann = 4;
  for (const r of data.history) {
    const lambda = rate * u + beta * n * r;
    if (!(lambda > 0) || !Number.isFinite(lambda)) return {penalized: -Infinity};
    ll += Math.log(lambda);
    if (derivatives) {
      const x = rate / lambda, y = beta * r / lambda;
      gu += x; gn += y; auu += x * x; aun += x * y; ann += y * y;
    }
  }
  return {ll, penalized: ll - 2 * n * n, gu, gn, auu, aun, ann};
}

function fitDecay(raw, decaySeconds) {
  const beta = 1 / decaySeconds, values = hawkesLikelihoodData(raw.segments, beta);
  if (!values || !raw.events || !values.exposure) return null;
  const data = {...values, beta}, rate = raw.events / raw.exposure;
  let u = 1, n = 0, value = objective(data, rate, u, n, true);
  for (let iteration = 0; iteration < 60; iteration++) {
    let du, dn;
    if ((n <= 1e-12 && value.gn <= 0) || (n >= MAX_BRANCHING - 1e-12 && value.gn >= 0)) {
      du = value.auu > 0 ? value.gu / value.auu : 0; dn = 0;
    } else {
      const determinant = value.auu * value.ann - value.aun * value.aun;
      if (!(determinant > 0) || !Number.isFinite(determinant)) break;
      du = (value.ann * value.gu - value.aun * value.gn) / determinant;
      dn = (value.auu * value.gn - value.aun * value.gu) / determinant;
    }
    if (![du, dn].every(Number.isFinite)) break;
    let accepted = false;
    for (let step = 1; step >= 1 / 65536; step /= 2) {
      const nextU = clamp(u + step * du, 1e-8, 100), nextN = clamp(n + step * dn, 0, MAX_BRANCHING);
      const next = objective(data, rate, nextU, nextN, true);
      if (next.penalized >= value.penalized - 1e-10) {
        const difference = Math.abs(nextU - u) + Math.abs(nextN - n);
        u = nextU; n = nextN; value = next; accepted = true;
        if (difference < 1e-9) iteration = 60;
        break;
      }
    }
    if (!accepted) break;
  }
  const determinant = value.auu * value.ann - value.aun * value.aun;
  const covariance = determinant > 0 ? {
    varianceMu: rate * rate * value.ann / determinant,
    varianceAlpha: beta * beta * value.auu / determinant,
    covarianceMuAlpha: -rate * beta * value.aun / determinant,
  } : null;
  return {parameters: {mu: rate * u, alpha: beta * n, beta, branchingRatio: n, decaySeconds},
    logLikelihood: value.ll, penalizedLogLikelihood: value.penalized, covariance,
    terminalExcitation: values.terminal,
    // Two continuous parameters, plus the fixed four-way decay comparison.
    selectionScore: -2 * value.ll + 2 * Math.log(raw.events) + 2 * Math.log(HAWKES_DECAY_SECONDS.length)};
}

function terminalEventAt(segment, target) {
  for (let i = segment.length - 1; i >= 0; i--) if (segment[i].coefficient >= target) return segment[i].timestamp;
  return null;
}

function terminalExcitationFor(segment, target, beta) {
  const end = segment.at(-1)?.timestamp;
  return segment.reduce((sum, row) => sum + (row.coefficient >= target ? Math.exp(-beta * (end - row.timestamp) / 1000) : 0), 0);
}

/** Training only. Never uses a future day or chooses a model by held-out loss. */
export function fitHawkes(input, {now = Date.now(), targets = HAWKES_TARGETS} = {}) {
  const rows = normalizeRounds(input, now).reverse(), partition = segmentsOf(rows), {segments} = partition;
  const gaps = [];
  for (const segment of segments) for (let i = 1; i < segment.length; i++) {
    const gap = (segment[i].timestamp - segment[i - 1].timestamp) / 1000;
    if (gap > 0) gaps.push(gap);
  }
  const cadenceSeconds = median(gaps), selectedTargets = [...new Set(Array.isArray(targets) ? targets.filter(validTarget) : [])];
  const finalSegment = segments.at(-1) || [], latest = finalSegment.at(-1);
  const usableRoundCount = rows.length - partition.excludedAmbiguousRows;
  const models = selectedTargets.map(target => {
    const raw = targetSegments(segments, target), nullRate = raw.events / raw.exposure;
    const nullLogLikelihood = raw.events > 0 && raw.exposure > 0 ? raw.events * Math.log(nullRate) - raw.events : null;
    const base = {modelId: HAWKES_MODEL, family: 'hawkes', target, eventCount: raw.events,
      exposureSeconds: raw.exposure, segmentCount: raw.segments.length, tiedEventCount: raw.tiedEvents,
      excludedAmbiguousRows: partition.excludedAmbiguousRows, excludedAmbiguousBlocks: partition.excludedAmbiguousBlocks,
      cadenceSeconds, nullLogLikelihood,
      lastEventAt: terminalEventAt(finalSegment, target),
      evidenceStatus: HAWKES_EVIDENCE,
      assumptions: ['conditional-empty-presegment-history', 'known-boundary-events-seed-intensity',
        'all-equal-timestamp-round-groups-excluded-and-exposure-split', 'ambiguity-exclusion-may-be-nonrandom',
        'observed-spacing-assumes-provider-coverage', 'fixed-rate-and-exponential-kernel-within-training-period'],
    };
    const reason = !timestamp(now) ? 'invalid-clock' : usableRoundCount < MIN_ROUNDS ? 'insufficient-rounds' :
      raw.events < MIN_EVENTS ? 'insufficient-events' : raw.exposure < 1800 ? 'insufficient-exposure' :
        raw.tiedEvents ? 'simultaneous-event-timestamps' : !(cadenceSeconds > 0) ? 'no-positive-cadence' : null;
    if (reason) return {...base, status: 'insufficient', reason, parameters: null, covariance: null};
    const candidates = HAWKES_DECAY_SECONDS.map(decay => fitDecay(raw, decay)).filter(Boolean);
    const nullScore = -2 * nullLogLikelihood + Math.log(raw.events);
    const selected = candidates.sort((a, b) => a.selectionScore - b.selectionScore)[0];
    const useExcitation = selected && selected.selectionScore < nullScore && selected.parameters.branchingRatio > 1e-7;
    if (!useExcitation) return {...base, status: 'ready', reason: 'poisson-null-selected',
      trainingSelection: 'poisson-null', conditionalClustering: false,
      parameters: {mu: nullRate, alpha: 0, beta: 1 / 60, branchingRatio: 0, decaySeconds: 60},
      covariance: null, logLikelihood: nullLogLikelihood, selectionScore: nullScore,
      terminalExcitation: 0,
      uncertainty: {kind: 'gamma-jeffreys-null', shape: raw.events + .5, rateSeconds: raw.exposure},
    };
    const unstable = selected.parameters.branchingRatio >= MAX_BRANCHING - 1e-6 || !selected.covariance;
    return {...base, ...selected, terminalExcitation: terminalExcitationFor(finalSegment, target, selected.parameters.beta),
      status: unstable ? 'insufficient' : 'ready',
      reason: unstable ? 'near-critical-or-singular-fit' : 'training-excitation-selected',
      trainingSelection: 'exponential-hawkes', conditionalClustering: true,
      uncertainty: {kind: 'laplace-conditional-on-selected-decay', includesModelSelectionUncertainty: false,
        description: 'Approximate conditional parameter interval; decay-selection and model misspecification are excluded.'},
    };
  });
  const result = {modelId: HAWKES_MODEL, family: 'hawkes', evidenceStatus: HAWKES_EVIDENCE,
    trainedAt: timestamp(now) ? now : null, trainingStart: rows[0]?.timestamp ?? null,
    trainingEnd: latest?.timestamp ?? null, trainingObservedEnd: rows.at(-1)?.timestamp ?? null,
    terminalBarrierAt: partition.lastAmbiguousAt > (latest?.timestamp ?? Infinity) ? partition.lastAmbiguousAt : null,
    roundCount: rows.length, usableRoundCount, cadenceSeconds,
    excludedAmbiguousRows: partition.excludedAmbiguousRows, excludedAmbiguousBlocks: partition.excludedAmbiguousBlocks,
    lastId: latest?.id ?? null, lastCoefficient: latest?.coefficient ?? null, models};
  result.identity = [result.modelId, result.trainedAt, result.trainingEnd, ...models.flatMap(model =>
    [model.target, model.parameters?.mu, model.parameters?.alpha, model.parameters?.beta])].join(':');
  return freeze(result);
}

function validFit(fit) {
  return fit?.modelId === HAWKES_MODEL && fit.evidenceStatus === HAWKES_EVIDENCE &&
    typeof fit.identity === 'string' && timestamp(fit.trainingEnd) && timestamp(fit.trainedAt) && Array.isArray(fit.models);
}

function validState(state, fit) {
  return state?.fitIdentity === fit.identity && state.status === 'ready' && timestamp(state.lastAt) &&
    Array.isArray(state.models) && state.models.every(model => model && validTarget(model.target) &&
      finite(model.excitation) && model.excitation >= 0 && (model.beta === null || (finite(model.beta) && model.beta > 0)));
}

function initialState(fit) {
  const barrier = fit.terminalBarrierAt !== null && fit.terminalBarrierAt !== undefined;
  return {modelId: HAWKES_MODEL, fitIdentity: fit.identity, status: 'ready', reason: null,
    lastAt: barrier ? fit.terminalBarrierAt : fit.trainingEnd, lastId: barrier ? null : fit.lastId,
    lastCoefficient: barrier ? null : fit.lastCoefficient, awaitingUnambiguous: barrier,
    models: fit.models.map(model => ({target: model.target, beta: model.parameters?.beta ?? null,
      excitation: barrier ? 0 : model.terminalExcitation ?? 0, lastEventAt: barrier ? null : model.lastEventAt, tied: false}))};
}

function ambiguityBarrier(state, at) {
  return {...state, lastAt: at, lastId: null, lastCoefficient: null, awaitingUnambiguous: true,
    models: state.models.map(model => ({...model, excitation: 0, lastEventAt: null, tied: false}))};
}

function advanceTrusted(fit, state, row) {
  if (row.timestamp < state.lastAt || (row.id === state.lastId &&
      (row.timestamp !== state.lastAt || row.coefficient !== state.lastCoefficient)))
    return {...state, status: 'invalid', reason: 'out-of-order-or-conflicting-state-row'};
  if (row.id === state.lastId) return state;
  const gap = row.timestamp - state.lastAt;
  if (gap === 0) return ambiguityBarrier(state, row.timestamp);
  return {...state, lastAt: row.timestamp, lastId: row.id, lastCoefficient: row.coefficient, awaitingUnambiguous: false,
    models: state.models.map(model => {
      const reset = gap > GAP_MS || state.awaitingUnambiguous, hit = row.coefficient >= model.target;
      const old = reset ? 0 : model.excitation * Math.exp(-(model.beta ?? 0) * gap / 1000);
      const lastEventAt = reset ? null : model.lastEventAt;
      return {...model, excitation: old + Number(hit), lastEventAt: hit ? row.timestamp : lastEventAt,
        tied: !reset && (model.tied || (hit && lastEventAt === row.timestamp))};
    })};
}

/** Prepare once per prediction prefix, then share state across 15 forecasts. */
export function prepareHawkesPredictionState(fit, recentRows = [], {now = Date.now()} = {}) {
  if (!validFit(fit) || !timestamp(now) || fit.trainedAt > now || fit.trainingEnd > now)
    return freeze({modelId: HAWKES_MODEL, status: 'invalid', reason: 'invalid-or-future-fit'});
  let state = initialState(fit);
  const rows = normalizeRounds(recentRows, now).reverse();
  for (let i = 0; i < rows.length;) {
    let end = i + 1;
    while (end < rows.length && rows[end].timestamp === rows[i].timestamp) end++;
    const row = rows[i];
    if (row.timestamp >= fit.trainingEnd) {
      if (end - i > 1 && row.timestamp >= state.lastAt) state = ambiguityBarrier(state, row.timestamp);
      else if (row.timestamp > state.lastAt || (row.timestamp === state.lastAt && row.id !== state.lastId))
        state = advanceTrusted(fit, state, row);
      if (state.status !== 'ready') break;
    }
    i = end;
  }
  return freeze(state);
}

// Streaming fast path: input must already come from the shared strict canonical
// deduplicated chronological history. It rejects the last ID's conflict and any
// backwards timestamp; arbitrary old-ID reconciliation belongs to normalization.
export function advanceHawkesPredictionState(fit, state, row, {now = Date.now()} = {}) {
  if (!validFit(fit) || !validState(state, fit) ||
      !timestamp(now) || fit.trainedAt > now || !row || typeof row.id !== 'string' || !row.id.trim() ||
      !finite(row.coefficient) || row.coefficient < 1 || !timestamp(row.timestamp) || row.timestamp > now ||
      row.completed === false || row.estimated === true)
    return freeze({...state, status: 'invalid', reason: 'invalid-stream-row-or-fit'});
  return freeze(advanceTrusted(fit, state, row));
}

function prediction(fit, state, {now, target, horizon, seconds}) {
  const model = Array.isArray(fit?.models) ? fit.models.find(value => value?.target === target) : null;
  const base = {modelId: HAWKES_MODEL, family: 'hawkes', target, horizon,
    horizonUnit: seconds === null ? 'rounds-via-cadence-approximation' : 'seconds',
    evidenceStatus: HAWKES_EVIDENCE, status: 'insufficient', probability: null, interval95: null,
    assumptions: ['continuous-time-events', 'future-round-count-mapped-using-training-median-cadence'],
  };
  const reason = !validFit(fit) || !timestamp(now) || fit.trainedAt > now || fit.trainingEnd > now ? 'invalid-or-future-fit' :
    !model ? 'unknown-target' : model.status !== 'ready' ? model.reason :
      !validState(state, fit) ? state?.reason || 'invalid-prediction-state' :
        state.lastAt > now ? 'future-state' : now - state.lastAt > GAP_MS ? 'stale-state' :
          state.awaitingUnambiguous ? 'latest-timestamp-ambiguous' :
          seconds === null && ![1, 3, 5].includes(horizon) ? 'unsupported-round-horizon' :
            seconds !== null && (!finite(seconds) || seconds <= 0 || seconds > 86400) ? 'unsupported-seconds-horizon' : null;
  if (reason) return {...base, reason};
  const active = state.models.find(value => value.target === target);
  if (!active || active.tied || !finite(active.excitation) || active.excitation < 0)
    return {...base, reason: active?.tied ? 'simultaneous-event-timestamps' : 'invalid-excitation-state'};
  const p = model.parameters;
  if (![p?.mu, p?.alpha, p?.beta, p?.branchingRatio].every(finite) || p.mu <= 0 || p.alpha < 0 ||
      p.beta <= 0 || p.branchingRatio < 0 || p.branchingRatio >= 1 || Math.abs(p.alpha / p.beta - p.branchingRatio) > 1e-8)
    return {...base, reason: 'invalid-fitted-parameters'};
  const exposure = seconds === null ? model.cadenceSeconds * horizon : seconds;
  const excitation = active.excitation * Math.exp(-p.beta * (now - state.lastAt) / 1000);
  const integratedExcitation = excitation * -Math.expm1(-p.beta * exposure) / p.beta;
  let estimate, bounds;
  if (p.alpha === 0) {
    const shape = model.uncertainty?.shape, rate = model.uncertainty?.rateSeconds;
    if (!(shape > 0) || !(rate > 0)) return {...base, reason: 'invalid-null-posterior'};
    estimate = -Math.expm1(-shape * Math.log1p(exposure / rate));
    bounds = [.025, .975].map(q => probability(inverseGammaCDF(q, shape) * exposure / rate));
  } else {
    const covariance = model.covariance, integrated = p.mu * exposure + p.alpha * integratedExcitation;
    const variance = covariance && exposure ** 2 * covariance.varianceMu + integratedExcitation ** 2 * covariance?.varianceAlpha +
      2 * exposure * integratedExcitation * covariance?.covarianceMuAlpha;
    if (!finite(variance) || variance < -1e-10) return {...base, reason: 'invalid-conditional-uncertainty'};
    const error = 1.959963984540054 * Math.sqrt(Math.max(0, variance));
    estimate = probability(integrated);
    bounds = [probability(integrated - error), probability(integrated + error)];
  }
  if (![estimate, ...bounds].every(finite)) return {...base, reason: 'numerical-failure'};
  return {...base, status: 'ready', reason: model.reason, probability: estimate, interval95: bounds,
    trainingSelection: model.trainingSelection, conditionalClustering: model.conditionalClustering,
    horizonSeconds: exposure, cadenceSeconds: model.cadenceSeconds,
    conditionalIntensityPerSecond: p.mu + p.alpha * excitation,
    uncertaintyKind: model.uncertainty.kind, includesModelSelectionUncertainty: false,
    actualRoundTimingKnown: false,
    interpretation: 'Conditional probability of at least one event in a time exposure; exact next-round timing is unknown.',
  };
}

export function predictHawkes(fit, recentRows = [], {now = Date.now(), target = 100, horizon = 1, state = null} = {}) {
  return prediction(fit, state ?? prepareHawkesPredictionState(fit, recentRows, {now}), {now, target, horizon, seconds: null});
}

export function predictHawkesSeconds(fit, recentRows = [], {now = Date.now(), target = 100, horizonSeconds = 60, state = null} = {}) {
  return prediction(fit, state ?? prepareHawkesPredictionState(fit, recentRows, {now}),
    {now, target, horizon: horizonSeconds, seconds: horizonSeconds});
}
