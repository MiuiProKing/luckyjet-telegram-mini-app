import {normalizeRounds} from '../prediction-v2.ts';
import {inverseBetaCDF} from '../rare-window-model.mjs';
import {fitSurvivalModels, predictSurvivalAtAge} from './survival.mjs';
import {fitTimeModels, predictTimeModels} from './time-models.mjs';
import {fitHawkes, prepareHawkesPredictionState, advanceHawkesPredictionState, predictHawkes} from './hawkes.mjs';
import {validateTimeZones, currentQualifiedZones} from './time-zones.mjs';
import {GAP_MS, chronologicalFolds, createValidationAccumulator, recordObservation,
  futureRoundOutcome, summarizeValidation, freezeFamilySelection, fixedConsensus, forecastKey, localDay} from './validation.mjs';

export const SUITE_MODEL = 'independent-statistical-suite-v1';
export const SUITE_TARGETS = Object.freeze([10, 15, 20, 50, 100]);
export const SUITE_HORIZONS = Object.freeze([1, 3, 5]);
const EVIDENCE = 'experimental-unvalidated';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const validProbability = value => finite(value) && value >= 0 && value <= 1;
const defaultYield = () => new Promise(resolve => setTimeout(resolve, 0));

function betaSummary(hits, total) {
  const alpha = hits + .5, beta = total - hits + .5;
  return {hits, total, alpha, beta, probability: alpha / (alpha + beta),
    interval95: [.025, .975].map(q => inverseBetaCDF(q, alpha, beta))};
}

function probabilityHorizon(probability, horizon) {return -Math.expm1(horizon * Math.log1p(-probability));}

function baselineFor(fits, target, horizon) {
  const record = fits.baselines.find(value => value.target === target);
  if (!record?.total) return {probability: null, interval95: null};
  // Fixed empirical frequency is the matched comparison forecast. The interval
  // is a conditional Beta transform, not an accuracy guarantee for future bets.
  return {probability: probabilityHorizon(record.hits / record.total, horizon),
    interval95: record.interval95.map(value => probabilityHorizon(value, horizon))};
}

function initialSequenceState(targets) {
  return {lastAt: null, lastId: null, history: [], ages: Object.fromEntries(targets.map(target => [target, null]))};
}

function tiedTimes(rows) {
  const times = new Set();
  for (let index = 1; index < rows.length; index++) if (rows[index].timestamp === rows[index - 1].timestamp) times.add(rows[index].timestamp);
  return times;
}

function advanceSequence(state, row, targets, ambiguous = false) {
  if (ambiguous) {
    state.history = []; for (const target of targets) state.ages[target] = null;
    state.lastAt = row.timestamp; state.lastId = row.id; return;
  }
  if (state.lastAt !== null && row.timestamp <= state.lastAt) {
    state.history = []; for (const target of targets) state.ages[target] = null;
    state.lastAt = row.timestamp; state.lastId = row.id; return;
  }
  if (state.lastAt !== null && (row.timestamp - state.lastAt > GAP_MS || row.timestamp <= state.lastAt)) {
    state.history = []; for (const target of targets) state.ages[target] = null;
  }
  for (const target of targets) state.ages[target] = row.coefficient >= target ? 0 :
    state.ages[target] === null ? null : state.ages[target] + 1;
  state.history.push(row.coefficient); if (state.history.length > 20) state.history.shift();
  state.lastAt = row.timestamp; state.lastId = row.id;
}

function sequenceFlag(kind, rule, state, target) {
  if (kind === 'cycle') return state.ages[target] === null ? null : Number(state.ages[target] >= rule.cycleAge);
  return state.history.length < 20 ? null : Number(state.history.filter(value => value >= target).length >= 3 ||
    state.history.slice(-5).filter(value => value >= target).length >= 2);
}

/** Calibrated, fixed cycle/cluster indicators; they do not alter legacy rules. */
function fitSequence(rows, targets) {
  const ambiguous = tiedTimes(rows);
  const gaps = Object.fromEntries(targets.map(target => [target, []])), first = initialSequenceState(targets);
  for (const row of rows) {
    if (ambiguous.has(row.timestamp)) {advanceSequence(first, row, targets, true); continue;}
    if (first.lastAt !== null && row.timestamp > first.lastAt && row.timestamp - first.lastAt <= GAP_MS)
      for (const target of targets) if (row.coefficient >= target && first.ages[target] !== null) gaps[target].push(first.ages[target] + 1);
    advanceSequence(first, row, targets);
  }
  const rules = targets.map(target => ({target,
    cycleAge: gaps[target].length ? Math.max(1, Math.ceil(gaps[target].reduce((a, b) => a + b, 0) / gaps[target].length)) : null,
    events: rows.filter(row => row.coefficient >= target).length,
    cycle: [[0, 0], [0, 0]], cluster: [[0, 0], [0, 0]]}));
  const state = initialSequenceState(targets);
  for (const row of rows) {
    if (ambiguous.has(row.timestamp)) {advanceSequence(state, row, targets, true); continue;}
    if (state.lastAt !== null && (row.timestamp <= state.lastAt || row.timestamp - state.lastAt > GAP_MS)) {
      state.history = []; for (const target of targets) state.ages[target] = null;
    }
    for (const rule of rules) for (const kind of ['cycle', 'cluster']) {
      const flag = sequenceFlag(kind, rule, state, rule.target);
      if (flag !== null) {rule[kind][flag][0] += Number(row.coefficient >= rule.target); rule[kind][flag][1]++;}
    }
    advanceSequence(state, row, targets);
  }
  const jointSummary = ([hits, total]) => {
    const value = betaSummary(hits, total);
    return {...value, intervalJoint95: [.0125, .9875].map(q => inverseBetaCDF(q, value.alpha, value.beta))};
  };
  return rules.map(rule => ({...rule, cycle: rule.cycle.map(jointSummary),
    cluster: rule.cluster.map(jointSummary), ready: rows.length >= 500 && rule.events >= 20}));
}

function sequenceForecasts(fits, state, now) {
  const records = [];
  for (const rule of fits.sequence) for (const kind of ['cycle', 'cluster']) for (const horizon of SUITE_HORIZONS) {
    const synthetic = {history: [...state.history], ages: {...state.ages}};
    const occurrences = new Map(); let survival = 1, lowerSurvival = 1, upperSurvival = 1;
    let reason = !rule.ready ? 'insufficient-training-events' : state.lastAt === null || now - state.lastAt > GAP_MS || now < state.lastAt ? 'stale-current-segment' : null;
    for (let step = 0; !reason && step < horizon; step++) {
      const flag = sequenceFlag(kind, rule, synthetic, rule.target), bin = flag === null ? null : rule[kind][flag];
      if (!bin || bin.total < 100 || bin.hits < 5) {reason = 'insufficient-calibrated-feature-support'; break;}
      const repetition = occurrences.get(flag) || 0;
      survival *= (bin.beta + repetition) / (bin.alpha + bin.beta + repetition);
      lowerSurvival *= 1 - bin.intervalJoint95[1]; upperSurvival *= 1 - bin.intervalJoint95[0];
      occurrences.set(flag, repetition + 1);
      synthetic.ages[rule.target] = synthetic.ages[rule.target] === null ? null : synthetic.ages[rule.target] + 1;
      synthetic.history.push(1); if (synthetic.history.length > 20) synthetic.history.shift();
    }
    records.push({modelId: `${kind}-calibrated-v1`, family: 'sequence', target: rule.target, horizon,
      status: reason ? 'insufficient' : 'ready', reason, probability: reason ? null : 1 - survival,
      interval95: reason ? null : [1 - upperSurvival, 1 - lowerSurvival],
      intervalKind: 'at-least-95-percent-bonferroni-two-feature-bin-posterior-envelope',
      evidenceStatus: EVIDENCE, horizonUnit: 'completed-rounds', generatedAt: now,
      feature: kind === 'cycle' ? 'age-at-least-training-mean-renewal-gap' : 'three-in-twenty-or-two-in-five',
    });
  }
  return records;
}

/** Expensive fitting is kept in the worker and runs only after archive updates. */
export function fitCurrentSuite(input, {now = Date.now(), targets = SUITE_TARGETS, timeZone = 'Europe/Kyiv', lookbackDays = 90} = {}) {
  const days = Number.isFinite(lookbackDays) && lookbackDays > 0 && lookbackDays <= 90 ? lookbackDays : 90;
  const rows = normalizeRounds(input, now).reverse().filter(row => row.timestamp >= now - days * 86400000);
  const acceptedTargets = [...new Set(targets)].filter(value => SUITE_TARGETS.includes(value));
  return {modelId: SUITE_MODEL, evidenceStatus: EVIDENCE, trainedAt: now, dataCutoff: rows.at(-1)?.timestamp ?? null,
    trainingRoundCount: rows.length, timeZone, targets: acceptedTargets, lookbackDays: days,
    baselines: acceptedTargets.map(target => ({target, ...betaSummary(rows.filter(row => row.coefficient >= target).length, rows.length)})),
    sequence: fitSequence(rows, acceptedTargets),
    survival: fitSurvivalModels(rows, {now, targets: acceptedTargets}),
    time: fitTimeModels(rows, {now, targets: acceptedTargets, timeZone}),
    hawkes: fitHawkes(rows, {now, targets: acceptedTargets}),
  };
}

function stateFromRows(fits, rows, now) {
  const sequence = initialSequenceState(fits.targets);
  const ambiguous = tiedTimes(rows);
  for (const row of rows) advanceSequence(sequence, row, fits.targets, ambiguous.has(row.timestamp));
  return {sequence, hawkes: prepareHawkesPredictionState(fits.hawkes, rows, {now})};
}

function predictFromState(fits, state, now, {includeTimeIntervals = true, timeIntervalMembers = null} = {}) {
  const forecasts = sequenceForecasts(fits, state.sequence, now);
  for (const target of fits.targets) {
    forecasts.push(...predictSurvivalAtAge(fits.survival, {target, ageRounds: state.sequence.ages[target], now,
      lastAt: state.sequence.lastAt}).map(value => ({...value, family: 'survival'})));
    const intervalModelIds = timeIntervalMembers === null ? null : timeIntervalMembers.filter(value => value.target === target).map(value => value.modelId);
    forecasts.push(...predictTimeModels(fits.time, {timestamp: now, target, horizon: 1,
      includeIntervals: includeTimeIntervals && (intervalModelIds === null || intervalModelIds.length > 0), intervalModelIds}));
    for (const horizon of SUITE_HORIZONS) forecasts.push(predictHawkes(fits.hawkes, [], {now, target, horizon, state: state.hawkes}));
  }
  return forecasts;
}

/** Only validation-qualified clock families may expose a current time zone. */
export function predictCurrentSuite(fits, recentInput, {now = Date.now(), validation = null} = {}) {
  const rows = normalizeRounds(recentInput, now).reverse();
  if (fits?.modelId !== SUITE_MODEL || !fits.targets || !fits.dataCutoff || fits.dataCutoff > now || fits.trainedAt > now)
    return {estimates: [], consensus: {status: 'unavailable', reason: 'invalid-or-future-fit', signals: []}, zones: []};
  const state = stateFromRows(fits, rows, now);
  const estimates = predictFromState(fits, state, now).map(value => {
    const verified = validation?.models?.find(item => item.key === forecastKey(value));
    return {...value, validation: verified?.qualified ? 'qualified-on-confirmation-dates' : 'unvalidated-or-no-demonstrated-advantage',
      validationReason: verified?.reason || 'no-independent-validation'};
  });
  const members = validation?.frozenMembers || [], signals = [];
  for (const target of fits.targets) for (const horizon of SUITE_HORIZONS) {
    const model = fixedConsensus(estimates, members, baselineFor(fits, target, horizon).interval95, {target, horizon});
    const combo = validation?.consensus?.find(value => value.key === forecastKey(model));
    const qualifiedMembers = members.filter(member => member.target === target && member.horizon === horizon &&
      validation?.models?.some(value => value.key === member.key && value.qualified));
    const supportedFamilies = new Set(qualifiedMembers.map(value => value.family));
    // Confirmation performance applies to the exact development-frozen rule.
    // It cannot be replaced by a newly selected subset on the same test dates.
    const allFrozenMembersQualified = qualifiedMembers.length === members.filter(value => value.target === target && value.horizon === horizon).length;
    if (model.status === 'ready' && combo?.qualified && supportedFamilies.size >= 2 && allFrozenMembersQualified)
      signals.push({...model, evidenceStatus: 'conditionally-supported-in-this-walk-forward-check', informationalOnly: true});
  }
  const zones = currentQualifiedZones(validation?.timeZones, now);
  return {estimates, consensus: {status: signals.length ? 'ready' : 'abstain', signals,
    reason: signals.length ? 'confirmed-frozen-distinct-family-combination' : 'no-confirmed-combination-with-current-agreement'}, zones};
}

async function evaluateFold(fits, train, test, fold, accumulator, consensusAccumulator, frozenMembers, yieldTask, onForecast) {
  const state = stateFromRows(fits, train.slice(-2000), test[0]?.timestamp ?? fits.trainedAt);
  for (let index = 0; index < test.length; index++) {
    const row = test[index], now = row.timestamp;
    // The first member of a not-yet-known collision is treated as observed.
    // A later collision resets state; it never changes an earlier forecast.
    advanceSequence(state.sequence, row, fits.targets);
    state.hawkes = advanceHawkesPredictionState(fits.hawkes, state.hawkes, row, {now});
    // Only this row and earlier state enter prediction. Future completion times
    // and coefficients are read below, after all forecast records are frozen.
    const forecasts = predictFromState(fits, state, now, {includeTimeIntervals: frozenMembers.some(value => value.family === 'time'),
      timeIntervalMembers: frozenMembers.filter(value => value.family === 'time')});
    if (onForecast) onForecast({day: fold.day, stage: fold.stage, issuedAt: now,
      forecasts: forecasts.map(({modelId, target, horizon, probability, status}) => ({modelId, target, horizon, probability, status}))});
    for (const forecast of forecasts) {
      if (index % forecast.horizon !== 0) continue;
      const baseline = baselineFor(fits, forecast.target, forecast.horizon).probability;
      const outcome = futureRoundOutcome(test, index, forecast.horizon, forecast.target);
      recordObservation(accumulator, forecast, {day: fold.day, baseline, outcome});
    }
    if (consensusAccumulator && frozenMembers.length) for (const target of fits.targets) for (const horizon of SUITE_HORIZONS) {
      if (index % horizon !== 0) continue;
      const baseline = baselineFor(fits, target, horizon);
      const combo = fixedConsensus(forecasts, frozenMembers, baseline.interval95, {target, horizon});
      recordObservation(consensusAccumulator, combo, {day: fold.day, baseline: baseline.probability,
        outcome: futureRoundOutcome(test, index, horizon, target)});
    }
    if (index % 512 === 511) await yieldTask();
  }
}

/**
 * All variants are predeclared. Development chooses one sibling per family;
 * that selection is frozen before separate confirmation dates are evaluated.
 */
export async function runStatisticalSuite(input, {now = Date.now(), onProgress = () => {}, targets = SUITE_TARGETS,
  timeZone = 'Europe/Kyiv', confirmationDays = 14, minTrainDays = 14, minTrainRounds = 2000,
  yieldTask = defaultYield, bootstrapSamples = 8192, onForecast = null, lookbackDays = 90} = {}) {
  const normalized = normalizeRounds(input, now).reverse();
  const days = Number.isFinite(lookbackDays) && lookbackDays > 0 && lookbackDays <= 90 ? lookbackDays : 90;
  const rows = normalized.filter(row => row.timestamp >= now - days * 86400000);
  const claimAlpha = .05 / 3;
  const protocol = chronologicalFolds(rows, {now, timeZone, minTrainDays, minTrainRounds, confirmationDays});
  const development = createValidationAccumulator(), confirmation = createValidationAccumulator(), combinations = createValidationAccumulator();
  let developmentReport = [], frozenMembers = [], frozen = false;
  for (let index = 0; index < protocol.folds.length; index++) {
    const fold = protocol.folds[index];
    if (fold.stage === 'confirmation' && !frozen) {
      developmentReport = summarizeValidation(development, {bootstrapSamples, alpha: claimAlpha, allowQualification: protocol.developmentDays >= 5});
      frozenMembers = freezeFamilySelection(developmentReport); frozen = true;
    }
    onProgress({stage: 'walk-forward', fold: index + 1, folds: protocol.folds.length, day: fold.day, partition: fold.stage});
    await yieldTask();
    const train = rows.slice(0, fold.from), test = rows.slice(fold.from, fold.to);
    const fits = fitCurrentSuite(train, {now: train.at(-1).timestamp, targets, timeZone, lookbackDays: days});
    await evaluateFold(fits, train, test, fold, fold.stage === 'development' ? development : confirmation,
      fold.stage === 'confirmation' ? combinations : null, fold.stage === 'confirmation' ? frozenMembers : [], yieldTask, onForecast);
  }
  if (!frozen) developmentReport = summarizeValidation(development, {bootstrapSamples, allowQualification: false});
  const models = summarizeValidation(confirmation, {bootstrapSamples, minDays: confirmationDays, alpha: claimAlpha,
    allowQualification: protocol.qualificationPossible});
  const consensus = summarizeValidation(combinations, {bootstrapSamples, minDays: confirmationDays, alpha: claimAlpha,
    allowQualification: protocol.qualificationPossible});
  const validation = {protocol: {...protocol, folds: protocol.folds.map(({day, stage, trainingDays, trainingCutoff, count}) =>
    ({day, stage, trainingDays, trainingCutoff, observedRounds: count}))}, development: developmentReport, frozenMembers, models, consensus,
    multipleTestingBudget: {totalAlpha: .05, models: claimAlpha, consensus: claimAlpha, timeZones: claimAlpha,
      method: 'Bonferroni across three claim families; Holm within each family'},
    selectionRule: 'development-supported positive Brier/log gain ranked per target/horizon/family; fixed lower-bound agreement; equal-weight supporting families; independent confirmation required',
    limitations: ['Whole-day bootstrap/sign-flip assumes adequately exchangeable day blocks and is approximate.',
      'Timestamp replay assumes immediate availability; real feed delivery and game actions are not tested.',
      'Several models use the same observations; distinct families are not proof of statistical independence.',
      'Next-k any-event probability is neither payout probability nor profitability of a particular stake.',
      'Hawkes maps round horizons using training cadence; clock models predict only next round near the known origin time.']};
  validation.timeZones = await validateTimeZones(rows, {protocol, now, timeZone, targets, alpha: claimAlpha,
    yieldTask, onProgress, bootstrapSamples});
  onProgress({stage: 'current-fit', fold: protocol.folds.length, folds: protocol.folds.length}); await yieldTask();
  const fits = fitCurrentSuite(rows, {now, targets, timeZone, lookbackDays: days});
  const current = predictCurrentSuite(fits, rows.slice(-2000), {now, validation});
  onProgress({stage: 'complete', folds: protocol.folds.length});
  return {modelId: SUITE_MODEL, evidenceStatus: EVIDENCE, generatedAt: now,
    history: {inputCount: Array.isArray(input) ? input.length : 0, rawInputCount: Array.isArray(input) ? input.length : 0,
      normalizedCount: normalized.length, excludedOutsideLookback: normalized.length - rows.length, acceptedCount: rows.length, lookbackDays: days,
      observedDayCount: protocol.availableCompleteDays + Number(!!rows.length && localDay(rows.at(-1).timestamp, timeZone) === protocol.today),
      dataQuality: {renewal: fits.survival.diagnostics, clockExposure: 'all normalized source records; equal-time records are not silently deduplicated'},
      firstAt: rows[0]?.timestamp ?? null, lastAt: rows.at(-1)?.timestamp ?? null,
      eventCounts: targets.map(target => ({target, count: rows.filter(row => row.coefficient >= target).length}))},
    validation, ...current, fits};
}
