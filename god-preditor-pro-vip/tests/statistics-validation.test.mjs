import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chronologicalFolds, localDay, futureRoundOutcome, createValidationAccumulator, recordObservation,
  summarizeValidation, holmCorrection, freezeFamilySelection, fixedConsensus} from '../safari/src/statistics/validation.mjs';
import {fitCurrentSuite, predictCurrentSuite, runStatisticalSuite} from '../safari/src/statistics/suite.mjs';

const ORIGIN = Date.UTC(2026, 8, 1, 9);
const rows = (n, origin = ORIGIN) => Array.from({length: n}, (_, index) => ({id: `r${origin}-${index}`,
  coefficient: index % 5 === 0 ? 15 : 1.2, timestamp: origin + index * 20000}));
const forecast = (patch = {}) => ({modelId: 'test-model', family: 'test-family', target: 10, horizon: 1,
  status: 'ready', probability: .8, interval95: [.7, .9], ...patch});

test('daily folds reserve independent later dates and exclude current partial day, including Kyiv DST', () => {
  const history = Array.from({length: 40}, (_, day) => rows(100, ORIGIN + day * 86400000)).flat();
  const now = ORIGIN + 40 * 86400000;
  history.push(...rows(10, now));
  const result = chronologicalFolds(history, {now, minTrainRounds: 500});
  assert.equal(result.confirmationDays, 14); assert.equal(result.qualificationPossible, true);
  assert.equal(result.folds.filter(value => value.stage === 'confirmation').length, 14);
  const confirmation = result.folds.find(value => value.stage === 'confirmation');
  assert.ok(result.folds.filter(value => value.stage === 'development').every(value => value.day < confirmation.day));
  for (const fold of result.folds) {
    assert.ok(fold.trainingDays >= 14);
    assert.ok(fold.trainingCutoff < history[fold.from].timestamp);
    assert.ok(fold.day < localDay(now));
  }
  assert.equal(localDay(Date.UTC(2026, 9, 24, 21, 30)), '2026-10-25');
  assert.equal(localDay(Date.UTC(2026, 9, 25, 21, 30)), '2026-10-25');
});

test('unknown outcome includes gaps, tied origins and tied target just outside the requested horizon', () => {
  const history = rows(8);
  assert.equal(futureRoundOutcome(history, 0, 3, 10).status, 'known');
  assert.equal(futureRoundOutcome(history, 7, 1, 10).reason, 'right-edge-or-next-day');
  const gap = structuredClone(history); gap[2].timestamp = gap[1].timestamp + 180001;
  assert.equal(futureRoundOutcome(gap, 1, 1, 10).reason, 'coverage-gap');
  const tie = structuredClone(history); tie[2].timestamp = tie[1].timestamp;
  assert.equal(futureRoundOutcome(tie, 1, 1, 10).reason, 'ambiguous-origin-time');
  assert.equal(futureRoundOutcome(tie, 0, 1, 10).reason, 'ambiguous-target-time');
});

test('matched loss accounting separates missing observations from misses and random guesses', () => {
  const accumulator = createValidationAccumulator();
  recordObservation(accumulator, forecast(), {day: '2026-09-02', baseline: .5, outcome: {status: 'known', hit: true}});
  recordObservation(accumulator, forecast(), {day: '2026-09-02', baseline: .5, outcome: {status: 'unknown', reason: 'coverage-gap'}});
  recordObservation(accumulator, forecast({status: 'insufficient', probability: null}), {day: '2026-09-02', baseline: .5, outcome: {status: 'known', hit: false}});
  const [result] = summarizeValidation(accumulator, {minDays: 1, minKnown: 1, minEvents: 0, bootstrapSamples: 64});
  assert.equal(result.known, 1); assert.equal(result.unknown, 1); assert.equal(result.unavailable, 1);
  assert.ok(Math.abs(result.brier - .04) < 1e-12); assert.equal(result.baselineBrier, .25);
  assert.equal(result.frequencyMatchedRandomGuessExpectedBrier, .5);
  assert.equal(result.hitCount, 1); assert.equal(result.unknownReasons['coverage-gap'], 1);
});

test('Holm correction includes every predeclared hypothesis and restores original order', () => {
  assert.deepEqual(holmCorrection([.02, .001, .5]), [.04, .003, .5]);
  assert.deepEqual(holmCorrection([NaN, -1, 2]), [1, 1, 1]);
});

function accumulatedStrongDays(count = 14, equal = false) {
  const accumulator = createValidationAccumulator();
  for (let day = 0; day < count; day++) for (let round = 0; round < 100; round++) {
    const hit = round % 2 === 0;
    recordObservation(accumulator, forecast({probability: equal ? .5 : hit ? .8 : .2}),
      {day: `day-${day.toString().padStart(2, '0')}`, baseline: .5, outcome: {status: 'known', hit}});
  }
  return accumulator;
}

test('large reproducible paired heldout advantage can qualify, while equal baseline cannot', () => {
  const [strong] = summarizeValidation(accumulatedStrongDays(), {bootstrapSamples: 128});
  assert.equal(strong.qualified, true); assert.equal(strong.dayCount, 14); assert.ok(strong.adjustedP < .05);
  assert.ok(strong.brierGainSimultaneousInterval[0] > 0);
  const [nullResult] = summarizeValidation(accumulatedStrongDays(14, true), {bootstrapSamples: 128});
  assert.equal(nullResult.qualified, false); assert.equal(nullResult.rawP, 1); assert.equal(nullResult.brierGain, 0);
  const [disabled] = summarizeValidation(accumulatedStrongDays(), {allowQualification: false, bootstrapSamples: 128});
  assert.equal(disabled.qualified, false); assert.equal(disabled.reason, 'insufficient-separate-validation-days');
});

test('development selection ranks siblings without using confirmation qualification', () => {
  const base = {target: 10, horizon: 1, family: 'time', sufficient: true, qualified: false, brierGain: .01, logLossGain: .02};
  const selected = freezeFamilySelection([{...base, key: 'a', modelId: 'a'}, {...base, key: 'b', modelId: 'b', brierGain: .02},
    {...base, key: 'c', modelId: 'c', family: 'survival'}, {...base, key: 'bad', modelId: 'bad', logLossGain: -1}]);
  assert.deepEqual(selected.map(value => value.modelId), ['b', 'c']);
});

test('consensus counts distinct families, requires lower-bound uplift and never invents intervals', () => {
  const members = [{modelId: 'a', family: 'time', target: 10, horizon: 1}, {modelId: 'b', family: 'time', target: 10, horizon: 1}];
  const forecasts = [forecast({modelId: 'a'}), forecast({modelId: 'b'})];
  assert.equal(fixedConsensus(forecasts, members, [.3, .6], {target: 10, horizon: 1}).status, 'insufficient');
  members.push({modelId: 'c', family: 'survival', target: 10, horizon: 1}); forecasts.push(forecast({modelId: 'c'}));
  const result = fixedConsensus(forecasts, members, [.3, .6], {target: 10, horizon: 1});
  assert.equal(result.status, 'ready'); assert.equal(result.agreeingFamilies.length, 2);
  assert.equal(fixedConsensus(forecasts, members, [.3, .75], {target: 10, horizon: 1}).status, 'insufficient');
});

test('current suite emits isolated target/horizon estimates but no unvalidated consensus or zones', () => {
  const history = rows(600), now = history.at(-1).timestamp;
  const fits = fitCurrentSuite(history, {now, targets: [10]});
  const before = JSON.stringify(fits.sequence);
  const result = predictCurrentSuite(fits, history, {now});
  assert.ok(result.estimates.some(value => value.modelId === 'bayesian-hazard-v1' && value.horizon === 5));
  assert.ok(result.estimates.some(value => value.modelId === 'cycle-calibrated-v1'));
  assert.equal(result.consensus.status, 'abstain'); assert.deepEqual(result.zones, []);
  assert.equal(JSON.stringify(fits.sequence), before);
  assert.deepEqual(predictCurrentSuite(fits, history, {now: now - 1}).estimates, []);
});

test('current consensus requires both individually confirmed families AND the confirmed exact frozen combination', () => {
  const history = rows(600).map((row, index) => ({...row, coefficient: index % 50 >= 40 ? 15 : 1.2}));
  const now = history.at(-1).timestamp, fits = fitCurrentSuite(history, {now, targets: [10]});
  const members = [{modelId: 'cluster-calibrated-v1', family: 'sequence'}, {modelId: 'bayesian-hazard-v1', family: 'survival'}]
    .map(value => ({...value, target: 10, horizon: 1, key: `${value.modelId}:10:1`}));
  const ledger = {frozenMembers: members, models: members.map(value => ({...value, qualified: true})),
    consensus: [{key: 'fixed-family-consensus-v1:10:1', qualified: true}]};
  assert.equal(predictCurrentSuite(fits, history, {now, validation: ledger}).consensus.signals.length, 1);
  const noCombo = structuredClone(ledger); noCombo.consensus[0].qualified = false;
  assert.equal(predictCurrentSuite(fits, history, {now, validation: noCombo}).consensus.signals.length, 0);
  const noMember = structuredClone(ledger); noMember.models[0].qualified = false;
  assert.equal(predictCurrentSuite(fits, history, {now, validation: noMember}).consensus.signals.length, 0);
  const differentRule = structuredClone(ledger); differentRule.frozenMembers.push({modelId: 'unconfirmed-model', family: 'hawkes', target: 10,
    horizon: 1, key: 'unconfirmed-model:10:1'});
  assert.equal(predictCurrentSuite(fits, history, {now, validation: differentRule}).consensus.signals.length, 0);
});

test('current renewal state discards every known tied timestamp member and waits for a new unique event', () => {
  const history = rows(600), cutoff = history.at(-1).timestamp;
  const fits = fitCurrentSuite(history, {now: cutoff, targets: [10]});
  const recent = history.slice(-50).concat([{id: 'tie-a', coefficient: 15, timestamp: cutoff + 20000},
    {id: 'tie-b', coefficient: 15, timestamp: cutoff + 20000}, {id: 'after-tie', coefficient: 1.2, timestamp: cutoff + 40000}]);
  const result = predictCurrentSuite(fits, recent, {now: cutoff + 40000});
  assert.ok(result.estimates.filter(value => value.family === 'survival').every(value => value.status === 'insufficient' &&
    value.reason === 'unknown-current-renewal-age'));
  recent.push({id: 'unique-hit', coefficient: 15, timestamp: cutoff + 60000});
  assert.ok(predictCurrentSuite(fits, recent, {now: cutoff + 60000}).estimates.some(value => value.modelId === 'bayesian-hazard-v1' && value.status === 'ready'));
});

test('suite scope uses at most the requested 90 days and reports rejected future/outside records', async () => {
  const history = rows(600), now = history.at(-1).timestamp;
  const result = await runStatisticalSuite([{id: 'too-old', coefficient: 100, timestamp: now - 91 * 86400000}, ...history,
    {id: 'future', coefficient: 100, timestamp: now + 1}], {now, targets: [10], bootstrapSamples: 32, yieldTask: async () => {}});
  assert.equal(result.history.rawInputCount, 602); assert.equal(result.history.normalizedCount, 601);
  assert.equal(result.history.acceptedCount, 600); assert.equal(result.history.excludedOutsideLookback, 1);
  assert.equal(result.history.lookbackDays, 90); assert.equal(result.history.observedDayCount, 1);
  assert.equal(result.consensus.status, 'abstain');
});

test('replay does not read the unknown next completion timestamp into an earlier forecast', async () => {
  const history = Array.from({length: 10}, (_, day) => rows(60, ORIGIN + day * 86400000)).flat();
  const now = ORIGIN + 10 * 86400000, changed = structuredClone(history), origin = history[480].timestamp;
  changed[481].timestamp += 1000;
  const collect = async input => {
    let snapshot;
    await runStatisticalSuite(input, {now, targets: [10], minTrainDays: 2, minTrainRounds: 100,
      confirmationDays: 2, bootstrapSamples: 32, yieldTask: async () => {}, onForecast: value => {
        if (value.issuedAt === origin) snapshot = value.forecasts;
      }});
    return snapshot;
  };
  const before = await collect(history), after = await collect(changed);
  assert.ok(before?.length); assert.deepEqual(after, before);
});
