import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  AGE_BINS, TARGETS, fitSurvivalModels, predictSurvivalModels, predictSurvivalAtAge,
  fitDiscreteWeibull, weibullRoundProbability,
} from '../safari/src/statistics/survival.mjs';

const NOW = Date.UTC(2026, 10, 3, 12);
function history(length = 3000, probability = .07, {gapAt = -1} = {}) {
  let seed = 8675309;
  return Array.from({length}, (_, index) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return {id: 'r-' + index, coefficient: index === 0 || seed / 2 ** 32 < probability ? 110 : 1.3,
      timestamp: NOW - (length - 1 - index) * 10000 - (gapAt >= 0 && index < gapAt ? 300000 : 0),
      completed: true, estimated: false};
  });
}
const fixtureGaps = () => Array.from({length: 200}, (_, index) => Math.ceil(18 * (-Math.log1p(-(index + .5) / 200)) ** (1 / 1.35)));

test('discrete Weibull likelihood with right censoring matches an independent SciPy fixture', () => {
  // SciPy minimize of sum log[S(g-1)-S(g)] + sum log S(c), not a density fit.
  const fit = fitDiscreteWeibull(fixtureGaps(), [5, 10, 20, 50, 75]);
  assert.equal(fit.status, 'ready');
  assert.ok(Math.abs(fit.shape - 1.3027464842512413) < 2e-6);
  assert.ok(Math.abs(fit.scale - 18.619086964663) < 2e-5);
  assert.ok(Math.abs(fit.negativeLogLikelihood - 760.1384923393668) < 1e-6);
  assert.equal(fit.rightCensoredCount, 5);
  assert.ok(fit.shapeInterval95[0] < fit.shape && fit.shape < fit.shapeInterval95[1]);
  assert.ok(fit.scaleInterval95[0] < fit.scale && fit.scale < fit.scaleInterval95[1]);
});

test('renewal age does not receive an invented overdue bonus', () => {
  for (const horizon of [1, 3, 5]) {
    const exponential = -Math.expm1(-horizon / 20);
    for (const age of [0, 10, 100, 1000]) assert.ok(Math.abs(weibullRoundProbability(1, 20, age, horizon) - exponential) < 1e-13);
    assert.ok(weibullRoundProbability(.7, 20, 100, horizon) < weibullRoundProbability(.7, 20, 0, horizon));
    assert.ok(weibullRoundProbability(1.4, 20, 100, horizon) > weibullRoundProbability(1.4, 20, 0, horizon));
  }
});

test('unknown left edges are excluded and inter-segment gaps add no renewal exposure', () => {
  const length = 500;
  const rows = Array.from({length}, (_, index) => ({id: 'p-' + index,
    timestamp: NOW - (length - 1 - index) * 10000 - (index < 250 ? 300000 : 0),
    coefficient: index % 10 === 0 ? 20 : 1.2}));
  const fit = fitSurvivalModels(rows, {targets: [10], now: NOW}), target = fit.targets[0];
  assert.equal(target.eventCount, 50);
  assert.equal(target.segmentCount, 2);
  assert.equal(target.knownAgeEventCount, 48);
  assert.equal(target.bayesian.bins.reduce((sum, bin) => sum + bin.exposures, 0), 498);
  const prefix = rows.map((row, index) => index < 10 ? {...row, coefficient: 1.2} : row);
  const delayed = fitSurvivalModels(prefix, {targets: [10], now: NOW}).targets[0];
  assert.equal(delayed.knownAgeEventCount, 47);
  assert.equal(delayed.bayesian.bins.reduce((sum, bin) => sum + bin.exposures, 0), 488);
});

test('all requested targets and horizons return bounded probabilities and conditional uncertainty', () => {
  const rows = history(), fit = fitSurvivalModels(rows, {now: NOW});
  const predictions = predictSurvivalModels(fit, rows.slice(-500), {now: NOW});
  assert.deepEqual(fit.targets.map(target => target.target), [...TARGETS]);
  assert.equal(predictions.length, 30);
  assert.equal(new Set(predictions.map(item => item.modelId)).size, 2);
  for (const item of predictions) {
    assert.equal(item.evidenceStatus, 'experimental-unvalidated');
    assert.equal(item.horizonUnit, 'completed-rounds');
    assert.equal(item.status, 'ready');
    assert.ok(item.interval95[0] >= 0 && item.interval95[1] <= 1);
    assert.ok(item.interval95[0] < item.probability && item.probability < item.interval95[1]);
  }
  for (const modelId of new Set(predictions.map(item => item.modelId))) {
    const selected = predictions.filter(item => item.modelId === modelId && item.target === 10);
    assert.deepEqual(selected.map(item => item.horizon), [1, 3, 5]);
    assert.ok(selected[0].probability <= selected[1].probability && selected[1].probability <= selected[2].probability);
  }
});

test('Bayesian same-bin repetitions integrate the shared posterior, rather than independent plug-in hazards', () => {
  const fit = fitSurvivalModels(history(6000, .04), {targets: [10], now: NOW});
  const target = fit.targets[0], index = AGE_BINS.findIndex((lower, i) => 30 >= lower && 30 < AGE_BINS[i + 1]);
  const bin = target.bayesian.bins[index];
  assert.ok(bin.exposures >= 30);
  let survival = 1;
  for (let repeat = 0; repeat < 5; repeat++) survival *= (bin.beta + repeat) / (bin.alpha + bin.beta + repeat);
  const prediction = predictSurvivalAtAge(fit, {target: 10, ageRounds: 30, now: NOW, lastAt: NOW})
    .find(item => item.modelId === 'bayesian-hazard-v1' && item.horizon === 5);
  assert.equal(prediction.status, 'ready');
  assert.ok(Math.abs(prediction.probability - (1 - survival)) < 1e-14);
  assert.notEqual(prediction.probability, 1 - (bin.beta / (bin.alpha + bin.beta)) ** 5);
});

test('sparse or unsupported age bins abstain instead of fabricating precise chances', () => {
  const sparse = fitSurvivalModels(history(499), {targets: [10], now: NOW});
  assert.ok(predictSurvivalAtAge(sparse, {target: 10, ageRounds: 1, now: NOW, lastAt: NOW}).every(item => item.status === 'insufficient' && item.probability === null));
  const fit = fitSurvivalModels(history(), {targets: [10], now: NOW});
  const veryOld = predictSurvivalAtAge(fit, {target: 10, ageRounds: 100000, now: NOW, lastAt: NOW});
  assert.equal(veryOld.find(item => item.modelId === 'bayesian-hazard-v1').reason, 'insufficient-age-bin-exposure');
  assert.equal(fitDiscreteWeibull(Array(29).fill(10)).status, 'insufficient');
  assert.equal(fitDiscreteWeibull(Array(100).fill(10)).status, 'insufficient'); // Degenerate boundary shape.
});

test('forecast freshness, as-of training cutoff and known current age are enforced independently', () => {
  const fit = fitSurvivalModels(history(), {targets: [10], now: NOW});
  for (const options of [
    {now: NOW - 1, lastAt: NOW - 1, ageRounds: 1},
    {now: NOW, lastAt: NOW - 1, ageRounds: 1},
    {now: NOW + 180001, lastAt: NOW, ageRounds: 1},
    {now: NOW, lastAt: NOW + 1, ageRounds: 1},
    {now: NOW, lastAt: NOW, ageRounds: null},
    {now: NOW, lastAt: NOW, ageRounds: -1},
    {now: NaN, lastAt: NOW, ageRounds: 0},
  ]) {
    const results = predictSurvivalAtAge(fit, {target: 10, ...options});
    assert.ok(results.every(item => item.status === 'insufficient' && item.probability === null));
  }
  const disconnected = history().slice(-30).map(row => ({...row, coefficient: 1.1}));
  assert.ok(predictSurvivalModels(fit, disconnected, {now: NOW}).every(item => item.reason === 'unknown-current-renewal-age'));
});

test('future, estimated, duplicate/conflicting records cannot inflate model training', () => {
  const rows = history(), clean = fitSurvivalModels(rows, {targets: [10], now: NOW});
  const noise = [rows[0], {...rows[0], id: 'future', timestamp: NOW + 1},
    {...rows[0], id: 'estimated', estimated: true}, {...rows[0], id: 'incomplete', completed: false}];
  const noisy = fitSurvivalModels([...rows, ...noise], {targets: [10], now: NOW});
  assert.deepEqual(noisy, clean);
  const conflicting = fitSurvivalModels([...rows, {...rows[0], coefficient: 999}], {targets: [10], now: NOW});
  assert.equal(conflicting.sampleSize, rows.length - 1);
});

test('fits and prediction calls are deterministic, immutable and have no shared model state', () => {
  const rows = history(2000), before = structuredClone(rows);
  const fit = fitSurvivalModels(rows, {targets: [10], now: NOW});
  const serialized = JSON.stringify(fit), result = predictSurvivalModels(fit, rows, {now: NOW});
  fitSurvivalModels(history(700, .8), {targets: [100], now: NOW});
  assert.deepEqual(predictSurvivalModels(fit, rows, {now: NOW}), result);
  assert.equal(JSON.stringify(fit), serialized);
  assert.deepEqual(rows, before);
  assert.ok(Object.isFrozen(fit) && Object.isFrozen(fit.targets[0].bayesian.bins));
});

test('non-finite posterior bounds cannot become a ready probability record', () => {
  const fit = structuredClone(fitSurvivalModels(history(), {targets: [10], now: NOW}));
  fit.targets[0].bayesian.bins[0].bounds[0] = [NaN, 1];
  const record = predictSurvivalAtAge(fit, {target: 10, ageRounds: 0, now: NOW, lastAt: NOW})
    .find(item => item.modelId === 'bayesian-hazard-v1' && item.horizon === 1);
  assert.equal(record.status, 'insufficient');
  assert.equal(record.reason, 'unstable-hazard-posterior');
  assert.equal(record.probability, null);
  assert.equal(record.interval95, null);
});

test('whole equal-timestamp groups are excluded before fitting and break renewal exposure', () => {
  const length = 500;
  const rows = Array.from({length}, (_, index) => ({id: 'ties-' + index,
    timestamp: NOW - (length - 1 - index) * 10000,
    coefficient: index % 10 === 0 ? 20 : 1.2}));
  rows[249].coefficient = 20;
  rows[250].timestamp = rows[249].timestamp;
  const fit = fitSurvivalModels(rows, {targets: [10], now: NOW}), target = fit.targets[0];
  assert.equal(fit.sampleSize, 498);
  assert.deepEqual(fit.diagnostics, {acceptedRoundCount: 500, usableRoundCount: 498,
    excludedTiedGroupCount: 1, excludedTiedRoundCount: 2,
    tiedTimestampPolicy: 'exclude-whole-group-and-break-renewal-segment'});
  assert.equal(target.segmentCount, 2);
  assert.equal(target.eventCount, 49); // Both tied hits removed, including the first.
  assert.equal(target.knownAgeEventCount, 47);
  assert.equal(target.bayesian.bins.reduce((sum, bin) => sum + bin.exposures, 0), 487);
  const renamed = rows.map((row, index) => index === 249 || index === 250 ? {...row, id: index === 249 ? 'z-tie' : 'a-tie'} : row);
  assert.deepEqual(fitSurvivalModels(renamed.reverse(), {targets: [10], now: NOW}), fit);
});

test('current tied blocks cannot seed age or create arbitrary next-round forecasts', () => {
  const fit = fitSurvivalModels(history(), {targets: [10], now: NOW});
  const rows = [110, 1.2, 110, 110, 1.2, 1.2, 1.2].map((coefficient, index) => ({
    id: 'current-' + index, coefficient, timestamp: NOW - (6 - index) * 10000,
  }));
  rows[3].timestamp = rows[2].timestamp;
  const blocked = predictSurvivalModels(fit, rows, {now: NOW});
  assert.ok(blocked.every(record => record.reason === 'unknown-current-renewal-age'));
  assert.ok(blocked.every(record => record.excludedCurrentTiedRoundCount === 2));
  rows[5].coefficient = 110; // This unique event after the tied block seeds age.
  assert.ok(predictSurvivalModels(fit, rows, {now: NOW}).every(record => record.ageRounds === 1));
  rows[5].timestamp = rows[6].timestamp;
  const latestTied = predictSurvivalModels(fit, rows, {now: NOW});
  assert.ok(latestTied.every(record => record.reason === 'unknown-current-renewal-age' && record.latestTimestampAmbiguous));
});
