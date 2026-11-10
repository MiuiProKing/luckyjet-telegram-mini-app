import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeAttachedModels} from '../attached-analysis.mjs';
import {forecastBasic} from '../basic-forecast.mjs';

const NOW = Date.parse('2026-11-09T20:30:00Z');
const stream = (count, {last = NOW - 1000, gap = 10000, prefix = 'live', value = () => 1.5} = {}) =>
  Array.from({length: count}, (_, i) => ({id: `${prefix}-${i}`, coefficient: value(i), timestamp: last - (count - 1 - i) * gap}));

test('fresh inputs become ready at 20 real rounds; smaller or stale inputs do not produce forecasts', () => {
  const learning = analyzeAttachedModels({liveRounds: stream(19), now: NOW});
  assert.equal(learning.status, 'learning');
  assert.equal(learning.live.count, 19);
  assert.equal(learning.forecast, null);
  const ready = analyzeAttachedModels({liveRounds: stream(20), now: NOW});
  assert.equal(ready.status, 'ready');
  assert.equal(ready.live.latestAt, NOW - 1000);
  assert.ok(ready.forecast);
  const stale = analyzeAttachedModels({liveRounds: stream(20, {last: NOW - 180001}), now: NOW});
  assert.equal(stale.status, 'stale');
  assert.equal(stale.forecast, null);
  assert.equal(stale.poisson.probabilityPct, null);
});

test('normalization accepts confirmed normalized fields and rejects duplicate IDs, estimates, incomplete and future rows', () => {
  const rows = stream(20);
  const result = analyzeAttachedModels({liveRounds: [...rows, rows[0],
    {...rows[0], id: 'estimated', estimated: true},
    {...rows[0], id: 'incomplete', completed: false},
    {...rows[0], id: 'future', timestamp: NOW + 1},
    {...rows[0], id: 'bad-value', coefficient: Infinity},
    {...rows[0], id: 'low-value', coefficient: 0},
    {...rows[0], id: 'bad-time', timestamp: NaN},
    {...rows[0], id: ''},
  ], now: NOW});
  assert.equal(result.live.count, 20);
  assert.equal(result.status, 'ready');
  assert.equal(result.live.mean, 1.5);
});

test('an observation gap prevents older records from satisfying the live sample minimum', () => {
  const old = stream(50, {last: NOW - 3600000, prefix: 'old'});
  const recent = stream(19, {prefix: 'recent'});
  const result = analyzeAttachedModels({liveRounds: [...recent, ...old].reverse(), now: NOW});
  assert.equal(result.live.count, 19);
  assert.equal(result.live.inputCount, 69);
  assert.equal(result.live.discardedByGap, 50);
  assert.equal(result.live.segmentStartedAt, recent[0].timestamp);
  assert.equal(result.status, 'learning');
  assert.equal(result.forecast, null);
});

test('latest analysis remains bounded at 2000 all-coefficient rounds', () => {
  const result = analyzeAttachedModels({liveRounds: stream(2050), now: NOW});
  assert.equal(result.live.count, 2000);
  assert.equal(result.live.latestAt, NOW - 1000);
});

test('all-low recent sequence preserves the original BASIC branch and marks its score as heuristic', () => {
  const rows = stream(30);
  const raw = forecastBasic(rows, null, NOW);
  const result = analyzeAttachedModels({liveRounds: rows, now: NOW});
  assert.match(result.forecast.pattern, /Série basse/);
  for (const field of ['estimatedCoef', 'estimatedAt', 'windowMs', 'generatedAt', 'reliability']) {
    assert.equal(result.forecast[field], raw[field]);
  }
  assert.equal(result.forecast.scoreType, 'heuristic');
  assert.equal(result.forecast.scoreIsProbability, false);
  assert.ok(result.forecast.patternRu);
});

test('historical baseline statistics stay separate from current rounds and cannot change their forecast', () => {
  const history = stream(200, {last: NOW - 86400000, prefix: 'history', value: () => 1000});
  const live = stream(30);
  const first = analyzeAttachedModels({liveRounds: live, now: NOW});
  const combined = analyzeAttachedModels({historyRounds: history, liveRounds: live, now: NOW});
  assert.equal(combined.history.count, 200);
  assert.equal(combined.history.goldPct, 100);
  assert.equal(combined.live.goldPct, 0);
  assert.equal(combined.live.count, 30);
  assert.deepEqual(combined.forecast, first.forecast);
  assert.equal(combined.poisson.events, 0);
});

test('historical target frequencies count every coefficient and include uncertainty bounds', () => {
  const history = [1, 2, 10, 20, 100].map((coefficient, i) => ({id: `h-${i}`, coefficient, timestamp: NOW - 86400000 + i * 10000}));
  const result = analyzeAttachedModels({historyRounds: history, now: NOW});
  assert.equal(result.history.count, 5);
  assert.equal(result.history.lowPct, 20);
  assert.equal(result.history.goldPct, 60);
  assert.equal(result.history.frequencies['20'].hits, 2);
  assert.equal(result.history.frequencies['20'].count, 5);
  assert.equal(result.history.frequencies['20'].pct, 40);
  const [low, high] = result.history.frequencies['20'].interval95;
  assert.ok(low < 40 && high > 40 && low >= 0 && high <= 100);
});

test('an active BASIC window remains locked despite new coefficients, but stale data cancels it', () => {
  const live = stream(30);
  const first = analyzeAttachedModels({liveRounds: live, now: NOW});
  const later = analyzeAttachedModels({liveRounds: stream(30, {last: NOW + 29000, value: () => 25}), now: NOW + 30000, previousForecast: first.forecast});
  assert.deepEqual(later.forecast, first.forecast);
  const stale = analyzeAttachedModels({liveRounds: live, now: NOW + 181000, previousForecast: first.forecast});
  assert.equal(stale.status, 'stale');
  assert.equal(stale.forecast, null);
  const end = first.forecast.estimatedAt + first.forecast.windowMs + 1;
  const after = analyzeAttachedModels({liveRounds: stream(30, {last: end - 1000}), now: end, previousForecast: first.forecast});
  assert.equal(after.forecast.generatedAt, end);
});

test('future Poisson window uses event rate and fixed exposure, not elapsed waiting since the last mega', () => {
  const rows = stream(200, {value: i => i % 40 === 0 ? 100 : 1.5});
  const result = analyzeAttachedModels({liveRounds: rows, now: NOW});
  const exposure = rows.at(-1).timestamp - rows[0].timestamp;
  assert.equal(result.poisson.status, 'ready');
  assert.equal(result.poisson.events, 5);
  assert.equal(result.poisson.exposureMs, exposure);
  assert.equal(result.poisson.windowMs, 180000);
  const expected = 100 * -Math.expm1(-5 * 180000 / exposure);
  assert.ok(Math.abs(result.poisson.probabilityPct - expected) < 1e-9);
  const clustered = stream(200, {value: i => [0, 1, 2, 3, 199].includes(i) ? 100 : 1.5});
  const other = analyzeAttachedModels({liveRounds: clustered, now: NOW});
  assert.equal(other.poisson.events, 5);
  assert.equal(other.poisson.probabilityPct, result.poisson.probabilityPct);
});

test('Poisson requires 200 continuous rounds and five mega events; stale data has no probability', () => {
  const fewerRows = analyzeAttachedModels({liveRounds: stream(199, {value: i => i % 40 === 0 ? 100 : 1.5}), now: NOW});
  assert.equal(fewerRows.poisson.status, 'insufficient');
  assert.equal(fewerRows.poisson.probabilityPct, null);
  const fewerHits = analyzeAttachedModels({liveRounds: stream(200, {value: i => i % 50 === 0 ? 100 : 1.5}), now: NOW});
  assert.equal(fewerHits.poisson.status, 'insufficient');
  const stale = analyzeAttachedModels({liveRounds: stream(200, {last: NOW - 180001, value: i => i % 40 === 0 ? 100 : 1.5}), now: NOW});
  assert.equal(stale.poisson.status, 'stale');
  assert.equal(stale.poisson.probabilityPct, null);
});
