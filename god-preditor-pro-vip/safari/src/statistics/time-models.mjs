import {normalizeRounds} from '../prediction-v2.ts';
import {inverseBetaCDF} from '../rare-window-model.mjs';

// Each fixed specification is evaluated separately by walk-forward validation.
// These fits alone never qualify a time zone or authorize a betting action.
export const TIME_MODEL_VERSION = 'clock-exposure-v1';
export const TIME_TARGETS = Object.freeze([10, 15, 20, 50, 100]);
export const TIME_RADII = Object.freeze([30, 60, 120]);
export const TIME_BUCKET_SECONDS = 300;
export const TIME_MODEL_IDS = Object.freeze([
  ...TIME_RADII.map(r => `temporal-pattern-${r}`),
  ...TIME_RADII.map(r => `circular-kde-${r}`),
  'bayesian-time-buckets-300', 'multi-day-seasonality-300',
]);
const DAY = 86400, MIN_TIMESTAMP = 946684800000, MAX_TIMESTAMP = 8640000000000000;
const PRIOR_ROUNDS = 20;
const FORMATTERS = new Map();
const timestamp = value => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP;
const clamp = x => Math.max(0, Math.min(1, x));
const mod = x => ((x % DAY) + DAY) % DAY;

function clockFormatter(timeZone) {
  if (!FORMATTERS.has(timeZone)) FORMATTERS.set(timeZone, new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}));
  return FORMATTERS.get(timeZone);
}

/** Local clock is derived only from the original completed-round timestamp. */
export function localClock(timestampMs, timeZone = 'Europe/Kyiv') {
  if (!timestamp(timestampMs)) return null;
  try {return clockParts(clockFormatter(timeZone), timestampMs);} catch {return null;}
}
function clockParts(formatter, timestampMs) {
  const fields = Object.fromEntries(formatter.formatToParts(timestampMs).map(p => [p.type, p.value]));
  const hour = Number(fields.hour), minute = Number(fields.minute), second = Number(fields.second);
  if (hour > 23 || minute > 59 || second > 59) throw Error('Invalid local clock');
  return {second: hour * 3600 + minute * 60 + second, date: `${fields.year}-${fields.month}-${fields.day}`};
}

function moments(counts) {
  const n = new Float64Array(DAY + 1), first = new Float64Array(DAY + 1), second = new Float64Array(DAY + 1);
  for (let i = 0; i < DAY; i++) {
    n[i + 1] = n[i] + counts[i];
    first[i + 1] = first[i] + counts[i] * i;
    second[i + 1] = second[i] + counts[i] * i * i;
  }
  return {n, first, second};
}

// Circular interval in an unwrapped coordinate system around the query second.
// At most two pieces are needed for the fixed <=120-second supports.
function rangeMoments(prefix, from, to) {
  if (to < from) return [0, 0, 0];
  let n = 0, first = 0, second = 0;
  const firstPeriod = Math.floor(from / DAY), lastPeriod = Math.floor(to / DAY);
  for (let period = firstPeriod; period <= lastPeriod; period++) {
    const offset = period * DAY, a = Math.max(0, from - offset), b = Math.min(DAY - 1, to - offset);
    if (a > b) continue;
    const count = prefix.n[b + 1] - prefix.n[a];
    const one = prefix.first[b + 1] - prefix.first[a];
    const two = prefix.second[b + 1] - prefix.second[a];
    n += count; first += one + offset * count; second += two + 2 * offset * one + offset * offset * count;
  }
  return [n, first, second];
}
function intervalCount(prefix, center, radius) {return rangeMoments(prefix, center - radius, center + radius)[0];}
function linearWeight(prefix, from, to, a, b) {
  const [n, first, second] = rangeMoments(prefix, from, to);
  return [Math.max(0, a * n + b * first), Math.max(0, a * a * n + 2 * a * b * first + b * b * second)];
}
function triangular(prefix, center, radius) {
  const bandwidth = radius + 1;
  const left = linearWeight(prefix, center - radius, center, 1 - center / bandwidth, 1 / bandwidth);
  const right = linearWeight(prefix, center + 1, center + radius, 1 + center / bandwidth, -1 / bandwidth);
  return [left[0] + right[0], left[1] + right[1]];
}

function daySupport(bySecond, dayCount, targetCount, radius) {
  const rounds = new Uint32Array(dayCount), hits = Array.from({length: targetCount}, () => new Uint32Array(dayCount));
  const supported = new Uint16Array(DAY), eventDays = Array.from({length: targetCount}, () => new Uint16Array(DAY));
  let days = 0;
  const eventDayCounts = new Uint16Array(targetCount), maskBase = 2 ** targetCount;
  function add(second, delta) {
    for (const encoded of bySecond[mod(second)] || []) {
      const day = Math.floor(encoded / maskBase), mask = encoded % maskBase;
      if (delta > 0) {if (rounds[day]++ === 0) days++;}
      else if (--rounds[day] === 0) days--;
      for (let t = 0; t < targetCount; t++) if (mask & (1 << t)) {
        if (delta > 0) {if (hits[t][day]++ === 0) eventDayCounts[t]++;}
        else if (--hits[t][day] === 0) eventDayCounts[t]--;
      }
    }
  }
  for (let i = -radius; i <= radius; i++) add(i, 1);
  for (let center = 0; center < DAY; center++) {
    supported[center] = days;
    for (let t = 0; t < targetCount; t++) eventDays[t][center] = eventDayCounts[t];
    add(center - radius, -1); add(center + radius + 1, 1);
  }
  return {supported, eventDays};
}

function emptyFit(reason, options) {
  return {version: TIME_MODEL_VERSION, status: 'insufficient', reason, evidenceStatus: 'experimental-unvalidated',
    timeZone: options.timeZone, targets: [...options.targets], trainingRoundCount: 0, trainingDayCount: 0,
    dataCutoff: null, modelIds: [...TIME_MODEL_IDS], _state: null};
}

/** Fits historical clock exposures; observations after now are strictly excluded. */
export function fitTimeModels(input, {now = Date.now(), timeZone = 'Europe/Kyiv', targets = TIME_TARGETS, lookbackDays = 90} = {}) {
  const options = {timeZone, targets};
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 8 ||
      new Set(targets).size !== targets.length || targets.some(t => !Number.isFinite(t) || t < 1))
    return emptyFit('invalid-targets', {timeZone, targets: []});
  if (!timestamp(now)) return emptyFit('invalid-now', options);
  if (!Number.isSafeInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 90) return emptyFit('invalid-lookback', options);
  let formatter;
  try {formatter = clockFormatter(timeZone);} catch {return emptyFit('invalid-time-zone', options);}
  const rows = normalizeRounds(input, now).filter(row => row.timestamp >= now - lookbackDays * DAY * 1000).reverse();
  if (!rows.length) return emptyFit('no-valid-rounds', options);
  const targetCount = targets.length, maskBase = 2 ** targetCount;
  const total = new Uint32Array(DAY), events = targets.map(() => new Uint32Array(DAY));
  const bySecond = new Array(DAY), days = new Map(), bucketDays = Array.from({length: DAY / TIME_BUCKET_SECONDS}, () => new Map());
  for (const row of rows) {
    const clock = clockParts(formatter, row.timestamp);
    if (!days.has(clock.date)) days.set(clock.date, days.size);
    const day = days.get(clock.date), second = clock.second, bucket = Math.floor(second / TIME_BUCKET_SECONDS);
    total[second]++;
    let mask = 0, daily = bucketDays[bucket].get(day);
    if (!daily) {daily = new Uint32Array(targetCount + 1); bucketDays[bucket].set(day, daily);}
    daily[0]++;
    for (let t = 0; t < targetCount; t++) if (row.coefficient >= targets[t]) {
      events[t][second]++; daily[t + 1]++; mask |= 1 << t;
    }
    (bySecond[second] ||= []).push(day * maskBase + mask);
  }
  const exposure = moments(total), eventPrefixes = events.map(moments);
  const support = Object.fromEntries(TIME_RADII.map(radius => [radius, daySupport(bySecond, days.size, targetCount, radius)]));
  return {
    version: TIME_MODEL_VERSION, status: rows.length >= 500 && days.size >= 7 ? 'ready' : 'insufficient',
    reason: rows.length < 500 ? 'insufficient-training-rounds' : days.size < 7 ? 'insufficient-training-days' : null,
    evidenceStatus: 'experimental-unvalidated', timeZone, targets: [...targets], modelIds: [...TIME_MODEL_IDS],
    trainingRoundCount: rows.length, trainingDayCount: days.size,
    dataStart: rows[0].timestamp, dataCutoff: rows.at(-1).timestamp,
    fittedAt: now, lookbackDays,
    _state: {exposure, eventPrefixes, support, bucketDays: bucketDays.map(map => [...map.entries()].map(([day, counts]) => [day, ...counts])),
      globalHits: events.map(counts => counts.reduce((a, b) => a + b, 0))},
  };
}

function betaEstimate(hits, rounds, outsideHits, outsideRounds, includeIntervals, effectiveRounds = rounds) {
  if (!(rounds > 0) || !(effectiveRounds > 0)) return {probability: null, interval95: null};
  const outside = (outsideHits + .5) / (outsideRounds + 1), local = clamp(hits / rounds);
  const alpha = local * effectiveRounds + .5 + PRIOR_ROUNDS * outside;
  const beta = (1 - local) * effectiveRounds + .5 + PRIOR_ROUNDS * (1 - outside);
  return {probability: alpha / (alpha + beta), interval95: includeIntervals ?
    [.025, .975].map(p => inverseBetaCDF(p, alpha, beta)) : null};
}
function supportedReason(fit, globalHits, counts) {
  if (fit.status !== 'ready') return fit.reason || 'insufficient-training-history';
  if (globalHits < 10) return 'insufficient-global-events';
  if (counts.insideRounds < 30) return 'insufficient-local-rounds';
  if (counts.insideHits < 3) return 'insufficient-local-events';
  if (counts.insideDays < 5) return 'insufficient-local-days';
  if (counts.eventDays < 3) return 'events-not-repeated-across-days';
  if (counts.outsideRounds < 100) return 'insufficient-outside-exposure';
  return null;
}
function record(fit, target, modelId, counts, estimate, reason, detail = {}) {
  return {modelId, family: 'time', target, horizon: 1, status: reason ? 'insufficient' : 'ready', reason,
    probability: reason ? null : estimate.probability, interval95: reason ? null : estimate.interval95,
    evidenceStatus: 'experimental-unvalidated', qualified: false,
    qualificationReason: 'requires-independent-walk-forward-validation',
    baselineProbability: (counts.globalHits + .5) / (fit.trainingRoundCount + 1),
    observedInsideFrequency: counts.insideRounds ? counts.insideHits / counts.insideRounds : null,
    observedOutsideFrequency: counts.outsideRounds ? counts.outsideHits / counts.outsideRounds : null,
    counts, priorEquivalentRounds: PRIOR_ROUNDS,
    intervalKind: 'conditional-empirical-bayes-95-percent-equal-tail',
    timeZone: fit.timeZone, dataCutoff: fit.dataCutoff,
    interpretation: 'next-round-conditional-on-decision-clock-approximation',
    intervalAssumption: 'exchangeable-conditional-round-outcomes-within-clock-zone; fixed-outside-rate-prior',
    ...detail};
}

/**
 * Clock is the forecast origin (the last known round/current clock), not the
 * unknown next completion time. Only horizon1 is supported by clock models.
 * Bulk validators may omit interval inversion without changing probabilities.
 */
export function predictTimeModels(fit, {timestamp: at = Date.now(), target = 10, horizon = 1, includeIntervals = true, intervalModelIds = null} = {}) {
  if (!fit || fit.version !== TIME_MODEL_VERSION || !fit._state || !timestamp(at) ||
      !timestamp(fit.dataCutoff) || at < fit.dataCutoff || !Array.isArray(fit.targets) || !fit.targets.includes(target) || horizon !== 1 ||
      !Number.isSafeInteger(fit.trainingRoundCount) || fit.trainingRoundCount < 1 ||
      fit._state.exposure?.n?.length !== DAY + 1 || !Array.isArray(fit._state.eventPrefixes) ||
      fit._state.eventPrefixes.length !== fit.targets.length || !fit._state.support ||
      !Array.isArray(fit._state.bucketDays) || fit._state.bucketDays.length !== DAY / TIME_BUCKET_SECONDS ||
      !Array.isArray(fit._state.globalHits)) return [];
  const clock = localClock(at, fit.timeZone);
  if (!clock) return [];
  const t = fit.targets.indexOf(target), state = fit._state, globalHits = state.globalHits[t];
  const globalRounds = fit.trainingRoundCount, results = [];
  const wantInterval = id => includeIntervals && (intervalModelIds === null || (Array.isArray(intervalModelIds) && intervalModelIds.includes(id)));
  for (const radius of TIME_RADII) {
    const insideRounds = intervalCount(state.exposure, clock.second, radius), insideHits = intervalCount(state.eventPrefixes[t], clock.second, radius);
    const counts = {insideRounds, insideHits, outsideRounds: globalRounds - insideRounds, outsideHits: globalHits - insideHits,
      insideDays: state.support[radius].supported[clock.second], eventDays: state.support[radius].eventDays[t][clock.second], globalHits};
    const reason = supportedReason(fit, globalHits, counts);
    const estimate = betaEstimate(insideHits, insideRounds, counts.outsideHits, counts.outsideRounds, wantInterval(`temporal-pattern-${radius}`) && !reason);
    results.push(record(fit, target, `temporal-pattern-${radius}`, counts, estimate, reason,
      {clockSecond: clock.second, radiusSeconds: radius, windowKind: 'circular-inclusive-seconds', futureClockAssumption: 'next-round-near-forecast-origin'}));
  }
  for (const radius of TIME_RADII) {
    const [weightedRounds, sumWeightsSquared] = triangular(state.exposure, clock.second, radius);
    const [weightedHits] = triangular(state.eventPrefixes[t], clock.second, radius);
    const supportRounds = intervalCount(state.exposure, clock.second, radius), supportHits = intervalCount(state.eventPrefixes[t], clock.second, radius);
    const counts = {insideRounds: supportRounds, insideHits: supportHits,
      outsideRounds: globalRounds - supportRounds, outsideHits: globalHits - supportHits,
      insideDays: state.support[radius].supported[clock.second], eventDays: state.support[radius].eventDays[t][clock.second], globalHits};
    const reason = supportedReason(fit, globalHits, counts);
    const effectiveRounds = sumWeightsSquared > 0 ? weightedRounds ** 2 / sumWeightsSquared : 0;
    const estimate = betaEstimate(Math.min(weightedHits, weightedRounds), weightedRounds, counts.outsideHits,
      counts.outsideRounds, wantInterval(`circular-kde-${radius}`) && !reason, effectiveRounds);
    results.push(record(fit, target, `circular-kde-${radius}`, counts, estimate, reason,
      {clockSecond: clock.second, radiusSeconds: radius, kernel: 'discrete-triangular', bandwidthSeconds: radius + 1,
        weightedRounds, weightedHits, effectiveRounds, intervalKind: 'approximate-effective-sample-empirical-bayes-95-percent-equal-tail',
        futureClockAssumption: 'next-round-near-forecast-origin'}));
  }
  const bucket = Math.floor(clock.second / TIME_BUCKET_SECONDS), from = bucket * TIME_BUCKET_SECONDS, to = from + TIME_BUCKET_SECONDS - 1;
  const insideRounds = rangeMoments(state.exposure, from, to)[0], insideHits = rangeMoments(state.eventPrefixes[t], from, to)[0];
  const daily = state.bucketDays[bucket];
  const supportedDays = daily.filter(row => row[1] > 0), eventDays = daily.filter(row => row[t + 2] > 0);
  const counts = {insideRounds, insideHits, outsideRounds: globalRounds - insideRounds, outsideHits: globalHits - insideHits,
    insideDays: supportedDays.length, eventDays: eventDays.length, globalHits};
  const reason = supportedReason(fit, globalHits, counts);
  // Bucket and seasonality share a conditional interval; invert at most once.
  const estimate = betaEstimate(insideHits, insideRounds, counts.outsideHits, counts.outsideRounds,
    (wantInterval('bayesian-time-buckets-300') || wantInterval('multi-day-seasonality-300')) && !reason);
  results.push(record(fit, target, 'bayesian-time-buckets-300', counts, estimate, reason,
    {clockSecond: clock.second, zoneStartSecond: from, zoneEndSecond: to, bucketSeconds: TIME_BUCKET_SECONDS,
      interval95: wantInterval('bayesian-time-buckets-300') && !reason ? estimate.interval95 : null,
      futureClockAssumption: 'next-round-near-forecast-origin'}));
  const outsideRate = (counts.outsideHits + .5) / (counts.outsideRounds + 1);
  const daysAboveOutside = supportedDays.filter(row => row[t + 2] / row[1] > outsideRate).length;
  const largestDayEventFraction = insideHits ? Math.max(0, ...eventDays.map(row => row[t + 2] / insideHits)) : 0;
  const seasonReason = reason || (supportedDays.length < 7 ? 'insufficient-seasonality-days' :
    largestDayEventFraction > .5 ? 'single-day-event-concentration' :
      daysAboveOutside < Math.ceil(.6 * supportedDays.length) ? 'inconsistent-day-direction' : null);
  // A repeated direction in training is descriptive; future-day validation is
  // still mandatory. The interval is not a calibrated random-day prediction.
  results.push(record(fit, target, 'multi-day-seasonality-300', {...counts, daysAboveOutside, largestDayEventFraction},
    estimate, seasonReason, {clockSecond: clock.second, zoneStartSecond: from, zoneEndSecond: to,
      interval95: wantInterval('multi-day-seasonality-300') && !seasonReason ? estimate.interval95 : null,
      bucketSeconds: TIME_BUCKET_SECONDS, stabilityScope: 'training-days-only', futureClockAssumption: 'next-round-near-forecast-origin'}));
  return results;
}
