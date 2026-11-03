import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  fitHawkes, predictHawkes, predictHawkesSeconds, hawkesLikelihoodData,
  prepareHawkesPredictionState, advanceHawkesPredictionState,
} from '../safari/src/statistics/hawkes.mjs';

const ORIGIN = Date.UTC(2026, 8, 1), GAP = 180000;
function history(n = 1000, hit = i => i % 20 === 0, step = 5000) {
  return Array.from({length: n}, (_, i) => ({id: 'r' + i, timestamp: ORIGIN + i * step,
    coefficient: hit(i) ? 100 : 1.2, completed: true, estimated: false}));
}
function regularFit() {
  const rows = history(), now = rows.at(-1).timestamp;
  return {rows, now, fit: fitHawkes(rows, {now, targets: [100]})};
}
function excitationFixture() {
  const {rows, now, fit} = regularFit();
  const base = structuredClone(fit), model = base.models[0];
  base.identity += ':known-excitation';
  model.parameters = {mu: .002, alpha: .01, beta: .02, branchingRatio: .5, decaySeconds: 50};
  model.status = 'ready'; model.reason = 'training-excitation-selected'; model.trainingSelection = 'exponential-hawkes';
  model.conditionalClustering = true; model.terminalExcitation = 2;
  model.covariance = {varianceMu: 1e-7, varianceAlpha: 1e-6, covarianceMuAlpha: 0};
  model.uncertainty = {kind: 'laplace-conditional-on-selected-decay'};
  return {rows, now, fit: base};
}

test('exact exponential likelihood includes known boundary history and censored tail', () => {
  const beta = .1, data = hawkesLikelihoodData([{duration: 100, seeds: 1, eventTimes: [10, 40]}], beta);
  assert.ok(Math.abs(data.history[0] - Math.exp(-1)) < 1e-14);
  assert.ok(Math.abs(data.history[1] - (Math.exp(-1) + 1) * Math.exp(-3)) < 1e-14);
  const expectedIntegral = (1 - Math.exp(-10)) + (1 - Math.exp(-9)) + (1 - Math.exp(-6));
  assert.ok(Math.abs(data.integratedKernel - expectedIntegral) < 1e-14);
  assert.ok(Math.abs(data.terminal - ((Math.exp(-1) + 1) * Math.exp(-3) + 1) * Math.exp(-6)) < 1e-14);
  const nextSegment = hawkesLikelihoodData([{duration: 100, seeds: 1, eventTimes: [10, 40]},
    {duration: 20, seeds: 0, eventTimes: [10]}], beta);
  assert.equal(nextSegment.history[2], 0, 'excitation cannot cross an unobserved gap');
  assert.equal(nextSegment.exposure, 120);
  assert.equal(hawkesLikelihoodData([{duration: 10, seeds: 0, eventTimes: [5, 5]}], beta), null);
});

test('regular separated events select the Poisson null, never forced excitation', () => {
  const {fit, now} = regularFit(), model = fit.models[0];
  assert.equal(model.status, 'ready'); assert.equal(model.trainingSelection, 'poisson-null');
  assert.equal(model.parameters.alpha, 0); assert.equal(model.parameters.branchingRatio, 0);
  assert.equal(model.eventCount, 49, 'left-boundary event is conditioned on, not counted in exposure');
  let previous = 0;
  for (const horizon of [1, 3, 5]) {
    const forecast = predictHawkes(fit, [], {now, target: 100, horizon});
    assert.equal(forecast.status, 'ready'); assert.equal(forecast.horizonUnit, 'rounds-via-cadence-approximation');
    assert.ok(forecast.probability > previous && forecast.probability < 1); previous = forecast.probability;
    assert.ok(forecast.interval95[0] <= forecast.probability && forecast.probability <= forecast.interval95[1]);
    assert.equal(forecast.actualRoundTimingKnown, false);
  }
  assert.ok(Object.isFrozen(fit.models[0].parameters));
});

test('true first-event survival decays excitation rather than adding a waiting bonus', () => {
  const {fit, now} = excitationFixture();
  const first = predictHawkesSeconds(fit, [], {now, target: 100, horizonSeconds: 30});
  const later = predictHawkesSeconds(fit, [], {now: now + 60000, target: 100, horizonSeconds: 30});
  assert.equal(first.status, 'ready'); assert.ok(later.probability < first.probability);
  const exact = 1 - Math.exp(-(.002 * 30 + .01 * 2 * (1 - Math.exp(-.02 * 30)) / .02));
  assert.ok(Math.abs(first.probability - exact) < 1e-14);
  assert.equal(first.uncertaintyKind, 'laplace-conditional-on-selected-decay');
  assert.equal(first.includesModelSelectionUncertainty, false);
  assert.ok(first.interval95[0] < first.probability && first.interval95[1] > first.probability);
});

test('gaps are excluded from training exposure and current state restarts at next segment', () => {
  const rows = history(), split = 600, shift = 12 * 3600000;
  const gapped = rows.map((row, i) => ({...row, timestamp: row.timestamp + (i >= split ? shift : 0)}));
  const now = gapped.at(-1).timestamp, fit = fitHawkes(gapped, {now, targets: [100]});
  assert.equal(fit.models[0].segmentCount, 2);
  assert.equal(fit.models[0].exposureSeconds, (rows.length - 2) * 5);
  const {fit: exciting, now: previous} = excitationFixture();
  const state = prepareHawkesPredictionState(exciting, [], {now: previous});
  const advanced = advanceHawkesPredictionState(exciting, state,
    {id: 'new', coefficient: 1.1, timestamp: previous + GAP + 1}, {now: previous + GAP + 1});
  assert.equal(advanced.models[0].excitation, 0);
  const event = advanceHawkesPredictionState(exciting, state,
    {id: 'new', coefficient: 100, timestamp: previous + GAP + 1}, {now: previous + GAP + 1});
  assert.equal(event.models[0].excitation, 1);
});

test('streaming state matches prefix preparation and forecast reuses immutable state', () => {
  const {fit, now} = excitationFixture();
  const fresh = [
    {id: 'next1', coefficient: 100, timestamp: now + 10000},
    {id: 'next2', coefficient: 1.5, timestamp: now + 25000},
    {id: 'next3', coefficient: 100, timestamp: now + 50000},
  ];
  let state = prepareHawkesPredictionState(fit, [], {now});
  for (const row of fresh) state = advanceHawkesPredictionState(fit, state, row, {now: row.timestamp});
  const prepared = prepareHawkesPredictionState(fit, fresh, {now: fresh.at(-1).timestamp});
  assert.deepEqual(state, prepared);
  const before = structuredClone(state);
  for (const horizon of [1, 3, 5]) {
    const forecast = predictHawkes(fit, [], {now: state.lastAt, target: 100, horizon, state});
    assert.equal(forecast.status, 'ready');
  }
  assert.deepEqual(state, before); assert.ok(Object.isFrozen(state.models[0]));
});

test('sparse, stale, malformed, future and conflicting observations abstain', () => {
  const few = history(800, () => false), now = few.at(-1).timestamp;
  assert.equal(fitHawkes(few, {now, targets: [100]}).models[0].reason, 'insufficient-events');
  const {fit, now: at, rows} = regularFit();
  const future = {...rows[2], id: 'future', timestamp: at + 10000, coefficient: 100};
  const withFuture = fitHawkes([...rows, future], {now: at, targets: [100]});
  assert.deepEqual(withFuture, fit);
  assert.equal(predictHawkes(fit, [], {now: at - 1, target: 100}).status, 'insufficient');
  assert.equal(predictHawkes(fit, [], {now: at + GAP + 1, target: 100}).reason, 'stale-state');
  assert.equal(predictHawkes(fit, [], {now: at, target: 100, horizon: 2}).reason, 'unsupported-round-horizon');
  assert.equal(predictHawkes(null, [], {now: at, target: 100}).status, 'insufficient');
  assert.equal(predictHawkes(fit, [], {now: at, target: 100,
    state: {fitIdentity: fit.identity, status: 'ready', lastAt: at}}).status, 'insufficient');
  const initial = prepareHawkesPredictionState(fit, [], {now: at});
  assert.equal(advanceHawkesPredictionState(fit, initial, {...rows.at(-1), coefficient: 200}, {now: at}).status, 'invalid');
  assert.equal(advanceHawkesPredictionState(fit, initial, {...rows.at(-2), id: 'backwards'}, {now: at}).status, 'invalid');
  assert.equal(advanceHawkesPredictionState(fit, initial, future, {now: at}).status, 'invalid');
});

test('whole simultaneous clock groups are excluded without joining their adjacent exposure', () => {
  const rows = history();
  rows[21] = {...rows[21], coefficient: 100, timestamp: rows[20].timestamp};
  const fit = fitHawkes(rows, {now: rows.at(-1).timestamp, targets: [100]});
  assert.equal(fit.excludedAmbiguousRows, 2); assert.equal(fit.excludedAmbiguousBlocks, 1);
  assert.equal(fit.usableRoundCount, 998);
  assert.equal(fit.models[0].segmentCount, 2);
  assert.equal(fit.models[0].exposureSeconds, 4980);
  assert.equal(fit.models[0].tiedEventCount, 0);
  assert.equal(fit.models[0].status, 'ready');
  assert.equal(fit.models[0].trainingSelection, 'poisson-null');
  // Even two LOW results break observation; deciding from their coefficients
  // would turn the missingness policy into target-dependent selection.
  rows[20].coefficient = 1.1; rows[21].coefficient = 1.1;
  const lows = fitHawkes(rows, {now: rows.at(-1).timestamp, targets: [100]});
  assert.equal(lows.models[0].exposureSeconds, 4980);
  assert.equal(lows.excludedAmbiguousRows, 2);
});

test('latest ambiguous group abstains until a fresh singleton, never seeds an artificial cluster', () => {
  const {fit, now} = excitationFixture();
  const state = prepareHawkesPredictionState(fit, [], {now});
  const first = advanceHawkesPredictionState(fit, state, {id: 'a', coefficient: 100, timestamp: now + 5000}, {now: now + 5000});
  const second = advanceHawkesPredictionState(fit, first, {id: 'b', coefficient: 100, timestamp: now + 5000}, {now: now + 5000});
  assert.equal(second.models[0].excitation, 0); assert.equal(second.awaitingUnambiguous, true);
  assert.equal(predictHawkes(fit, [], {now: now + 5000, target: 100, state: second}).reason, 'latest-timestamp-ambiguous');
  const next = advanceHawkesPredictionState(fit, second, {id: 'c', coefficient: 100, timestamp: now + 10000}, {now: now + 10000});
  assert.equal(next.models[0].excitation, 1); assert.equal(next.awaitingUnambiguous, false);
  const prepared = prepareHawkesPredictionState(fit, [
    {id: 'a', coefficient: 100, timestamp: now + 5000}, {id: 'b', coefficient: 100, timestamp: now + 5000},
    {id: 'c', coefficient: 100, timestamp: now + 10000},
  ], {now: now + 10000});
  assert.deepEqual(next, prepared);
  const rows = history();
  rows.push({...rows.at(-1), id: 'tied-end'});
  const terminalFit = fitHawkes(rows, {now: rows.at(-1).timestamp, targets: [100]});
  const terminal = prepareHawkesPredictionState(terminalFit, [], {now: rows.at(-1).timestamp});
  assert.equal(terminal.awaitingUnambiguous, true);
  assert.equal(predictHawkes(terminalFit, [], {now: rows.at(-1).timestamp, target: 100, state: terminal}).reason, 'latest-timestamp-ambiguous');
});

test('cluster training keeps branching stable and compares against the null explicitly', () => {
  const rows = history(2000, i => i % 100 < 6), now = rows.at(-1).timestamp;
  const fit = fitHawkes(rows, {now, targets: [100]}), model = fit.models[0];
  assert.ok(Number.isFinite(model.nullLogLikelihood));
  assert.equal(model.trainingSelection, 'exponential-hawkes');
  assert.ok(model.parameters.branchingRatio > 0 && model.parameters.branchingRatio < 1);
  assert.ok(model.parameters.alpha / model.parameters.beta < 1);
  assert.ok(model.logLikelihood > model.nullLogLikelihood);
  // Independent SciPy L-BFGS-B fit of the same censored likelihood + 2*n² prior.
  assert.equal(model.parameters.decaySeconds, 30);
  assert.ok(Math.abs(model.parameters.mu - .002426869908711645) < 1e-9);
  assert.ok(Math.abs(model.parameters.branchingRatio - .7697767444634894) < 1e-6);
  assert.ok(Math.abs(model.logLikelihood - -528.3105018818078) < 1e-6);
  if (model.status === 'ready') {
    const result = predictHawkes(fit, [], {now, target: 100});
    assert.equal(result.status, 'ready'); assert.ok(Number.isFinite(result.probability));
  } else assert.equal(model.reason, 'near-critical-or-singular-fit');
});
