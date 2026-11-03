import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  fitTimeModels, predictTimeModels, localClock, TIME_MODEL_IDS,
} from '../safari/src/statistics/time-models.mjs';

const DAY = 86400000, BASE = Date.UTC(2026, 9, 1), NOW = BASE + 9 * DAY;
function history({days = 8, concentratedDay = false} = {}) {
  const rows = [];
  for (let day = 0; day < days; day++) {
    for (let i = 0; i < 80; i++) rows.push({id: `outside-${day}-${i}`, timestamp: BASE + day * DAY + 5 * 3600000 + i * 10000, coefficient: i % 20 === 0 ? 20 : 1.2});
    for (let i = 0; i < 25; i++) rows.push({id: `inside-${day}-${i}`, timestamp: BASE + day * DAY + 12 * 3600000 + (i - 12) * 5000,
      coefficient: concentratedDay ? (day === 0 ? 100 : 1.2) : i % 4 === 0 ? 100 : 1.2});
  }
  return rows;
}
function forecast(fit, extra = {}) {return predictTimeModels(fit, {timestamp: NOW, target: 100, ...extra});}

test('fixed temporal variants report all-round exposures, outside baseline and independent validation requirement', () => {
  const rows = history(), fit = fitTimeModels(rows, {now: NOW, timeZone: 'UTC'});
  const result = forecast(fit, {timestamp: NOW + 12 * 3600000});
  assert.deepEqual(result.map(r => r.modelId), TIME_MODEL_IDS);
  assert.equal(fit.trainingRoundCount, rows.length);
  assert.equal(fit.trainingDayCount, 8);
  for (const model of result) {
    assert.equal(model.family, 'time'); assert.equal(model.horizon, 1);
    assert.equal(model.evidenceStatus, 'experimental-unvalidated'); assert.equal(model.qualified, false);
    assert.equal(model.interpretation, 'next-round-conditional-on-decision-clock-approximation');
    assert.equal(model.counts.insideRounds + model.counts.outsideRounds, rows.length);
    assert.equal(model.counts.insideHits + model.counts.outsideHits, model.counts.globalHits);
    assert.ok(model.counts.insideDays >= 7);
    if (model.status === 'ready') {
      assert.ok(model.probability > 0 && model.probability < 1);
      assert.ok(model.interval95[0] < model.probability && model.probability < model.interval95[1]);
      assert.ok(model.baselineProbability < model.probability);
    }
  }
  const match = result.find(r => r.modelId === 'temporal-pattern-30');
  assert.equal(match.counts.insideRounds, 8 * 13);
  assert.equal(match.counts.insideHits, 8 * 3);
  assert.equal(match.counts.eventDays, 8);
  assert.equal(match.counts.outsideRounds, rows.length - 104);
});

test('omitting expensive interval inversion preserves every model probability and does not change input', () => {
  const rows = history(), original = structuredClone(rows), fit = fitTimeModels(rows, {now: NOW, timeZone: 'UTC'});
  const full = forecast(fit, {timestamp: NOW + 12 * 3600000});
  const fast = forecast(fit, {timestamp: NOW + 12 * 3600000, includeIntervals: false});
  assert.deepEqual(rows, original);
  assert.deepEqual(full.map(r => r.probability), fast.map(r => r.probability));
  assert.ok(fast.every(r => r.interval95 === null));
  const copiedFit = structuredClone(fit);
  assert.deepEqual(forecast(copiedFit, {timestamp: NOW + 12 * 3600000, includeIntervals: false}), fast);
});

test('selective interval inversion changes neither sibling probabilities nor ready states', () => {
  const fit = fitTimeModels(history(), {now: NOW, timeZone: 'UTC'}), timestamp = NOW + 12 * 3600000;
  const full = forecast(fit, {timestamp});
  for (const modelId of ['temporal-pattern-30', 'circular-kde-120', 'bayesian-time-buckets-300', 'multi-day-seasonality-300']) {
    const selected = forecast(fit, {timestamp, intervalModelIds: [modelId]});
    assert.deepEqual(selected.map(r => [r.probability, r.status]), full.map(r => [r.probability, r.status]));
    for (let i = 0; i < selected.length; i++) assert.deepEqual(selected[i].interval95, selected[i].modelId === modelId ? full[i].interval95 : null);
  }
  assert.ok(forecast(fit, {timestamp, intervalModelIds: []}).every(r => r.interval95 === null));
});

test('circular KDE matches brute-force triangular weights, including wrap at midnight', () => {
  const rows = [];
  for (let day = 0; day < 8; day++) {
    for (let i = 0; i < 80; i++) rows.push({id: `out-${day}-${i}`, timestamp: BASE + day * DAY + 10 * 3600000 + i * 1000, coefficient: 1.2});
    for (const sec of [0, 1, 10, 29, 30, 31, 60, 61, 100, 120, 121, 86399, 86390, 86370]) {
      rows.push({id: `clock-${day}-${sec}`, timestamp: BASE + day * DAY + sec * 1000, coefficient: sec % 2 ? 100 : 1.2});
    }
  }
  const fit = fitTimeModels(rows, {now: NOW, timeZone: 'UTC'}), predictions = forecast(fit);
  for (const radius of [30, 60, 120]) {
    const model = predictions.find(r => r.modelId === 'circular-kde-' + radius);
    let n = 0, k = 0, squared = 0;
    for (const row of rows) {
      const second = localClock(row.timestamp, 'UTC').second, distance = Math.min(second, 86400 - second);
      if (distance > radius) continue;
      const w = 1 - distance / (radius + 1);
      n += w; squared += w * w; k += Number(row.coefficient >= 100) * w;
    }
    assert.ok(Math.abs(model.weightedRounds - n) < 1e-5, `radius${radius} exposure`);
    assert.ok(Math.abs(model.weightedHits - k) < 1e-5, `radius${radius} events`);
    assert.ok(Math.abs(model.effectiveRounds - n * n / squared) < 1e-5, `radius${radius} effective sample`);
    const match = predictions.find(r => r.modelId === 'temporal-pattern-' + radius);
    assert.equal(model.counts.insideRounds, match.counts.insideRounds);
    assert.ok(model.counts.insideDays >= 7);
  }
});

test('exposure normalisation does not confuse a busy clock zone with an increased event rate', () => {
  const rows = [];
  for (let day = 0; day < 8; day++) {
    for (let i = 0; i < 100; i++) rows.push({id: `dense-${day}-${i}`, timestamp: BASE + day * DAY + 12 * 3600000 + (i % 61 - 30) * 1000, coefficient: i % 10 === 0 ? 100 : 1.2});
    for (let i = 0; i < 20; i++) rows.push({id: `sparse-${day}-${i}`, timestamp: BASE + day * DAY + 6 * 3600000 + i * 1000, coefficient: i % 10 === 0 ? 100 : 1.2});
  }
  const result = forecast(fitTimeModels(rows, {now: NOW, timeZone: 'UTC'}), {timestamp: NOW + 12 * 3600000});
  const model = result.find(r => r.modelId === 'temporal-pattern-30');
  assert.equal(model.counts.insideRounds, 800); assert.equal(model.counts.outsideRounds, 160);
  assert.equal(model.observedInsideFrequency, .1); assert.equal(model.observedOutsideFrequency, .1);
  assert.ok(Math.abs(model.probability - model.baselineProbability) < .001);
});

test('Kyiv local seconds observe DST and repeated fall-back times remain distinct exposures', () => {
  const first = localClock(Date.UTC(2026, 9, 25, 0, 30), 'Europe/Kyiv');
  const second = localClock(Date.UTC(2026, 9, 25, 1, 30), 'Europe/Kyiv');
  assert.deepEqual(first, second); assert.equal(first.second, 3 * 3600 + 30 * 60);
  assert.equal(first.date, '2026-10-25');
  assert.equal(localClock(Date.UTC(2026, 6, 1, 21, 15), 'Europe/Kyiv').date, '2026-07-02');
  assert.equal(localClock(Date.UTC(2026, 10, 1, 21, 15), 'Europe/Kyiv').date, '2026-11-01');
  assert.equal(localClock(123, 'Europe/Kyiv'), null);
  assert.equal(localClock(NOW, 'Bad/Timezone'), null);
});

test('a single historical event day cannot qualify seasonality and sparse local zones abstain', () => {
  const fit = fitTimeModels(history({concentratedDay: true}), {now: NOW, timeZone: 'UTC'});
  const result = forecast(fit, {timestamp: NOW + 12 * 3600000});
  assert.ok(result.every(r => r.status === 'insufficient' && r.probability === null));
  assert.ok(result.every(r => r.reason === 'events-not-repeated-across-days'));
  const sparse = forecast(fit, {timestamp: NOW + 18 * 3600000});
  assert.ok(sparse.every(r => r.reason === 'insufficient-local-rounds'));
});

test('training excludes future, invalid and conflicting IDs; forecasts cannot backcast with future data', () => {
  const rows = history(), fit = fitTimeModels(rows, {now: NOW, timeZone: 'UTC'});
  const poisoned = [...rows, {...rows[0], coefficient: 200}, {id: 'future', timestamp: NOW + 1000, coefficient: 200},
    {id: 'estimated', timestamp: NOW - 1000, coefficient: 200, estimated: true}, {id: 'missing', coefficient: 200}];
  const hardened = fitTimeModels(poisoned, {now: NOW, timeZone: 'UTC'});
  assert.equal(hardened.trainingRoundCount, rows.length - 1);
  assert.deepEqual(forecast(fit, {timestamp: fit.dataCutoff - 1}), []);
  assert.deepEqual(forecast(fit, {horizon: 3}), []);
  assert.deepEqual(forecast(fit, {target: 9}), []);
  assert.deepEqual(forecast(fit, {timestamp: NaN}), []);
  assert.equal(fitTimeModels([], {now: NOW}).reason, 'no-valid-rounds');
  assert.equal(fitTimeModels(rows, {now: NaN}).reason, 'invalid-now');
  assert.equal(fitTimeModels(rows, {now: NOW, timeZone: 'bad'}).reason, 'invalid-time-zone');
});

test('at most the declared ninety-day training interval is used', () => {
  const rows = history(), old = {id: 'too-old', timestamp: NOW - 91 * DAY, coefficient: 100};
  const fit = fitTimeModels([...rows, old], {now: NOW, timeZone: 'UTC'});
  assert.equal(fit.lookbackDays, 90); assert.equal(fit.trainingRoundCount, rows.length);
  assert.equal(fitTimeModels(rows, {now: NOW, lookbackDays: 91}).reason, 'invalid-lookback');
});
