import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forecastBasic, targetProfile, forecastOpportunity} from '../modules/public-forecast.mjs';
import {forecastArchive} from './fixtures/archive-forecast.mjs';
import {MODEL, analyze, normalize, forecastForTarget, advanceJournal, summary} from '../window-model.mjs';
import {mergeRounds} from '../data.mjs';

const NOW = Date.UTC(2026, 10, 1, 12, 10, 17);
const history = (values, now = NOW, gap = 20000) => values.map((coefficient, i) =>
  ({id: 'r-' + i, coefficient, timestamp: now - i * gap}));
const low = () => history(Array(40).fill(1.1));
const advance = (journal, rows, now, enabled = true, coverage) =>
  advanceJournal(journal, rows, analyze(rows, now), now, enabled, coverage);

test('full public arithmetic matches the unmodified archived function across 100 histories', () => {
  let seed = 15;
  for (let j = 0; j < 100; j++) {
    const rows = history(Array.from({length: 20 + j * 5}, () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return 1 + (seed % 10000) / 100;
    }));
    assert.deepEqual(forecastBasic(rows, null, NOW), forecastArchive(rows, null, NOW));
    const previous = forecastArchive(rows, null, NOW);
    assert.deepEqual(forecastBasic(rows, previous, NOW + 1000), forecastArchive(rows, previous, NOW + 1000));
  }
  const targeted = [Array(40).fill(1.1), [12, ...Array(35).fill(6)], [2.1, ...Array(35).fill(1.2)]];
  for (const values of targeted) assert.deepEqual(forecastBasic(history(values), null, NOW), forecastArchive(history(values), null, NOW));
});

test('all primary archive branches remain executable in both small-target profiles', () => {
  for (const target of [1.5, 2]) {
    const middle = 1 + (target - 1) * .75;
    const scenarios = [
      {values: Array(20).fill(1.1), rule: 'low-streak'},
      {values: [target + .1, target + .1, target + .1, ...Array(17).fill(1.1)], rule: 'hot-cluster'},
      {values: [target + .1, ...Array(29).fill(middle), ...Array(30).fill(target + .1)], rule: 'mid-favorable'},
      {values: [target + .1, ...Array(19).fill(middle)], rule: 'mid-mixed'},
      {values: [target + .1, ...Array(19).fill(1.05)], rule: 'multi-signal'},
    ];
    for (const {values, rule} of scenarios) {
      const f = forecastForTarget(history(values), target, null, NOW);
      assert.equal(f.diagnostics.basicWindow.rule, rule);
      assert.equal(f.target, target); assert.equal(f.estimatedCoef, target);
      assert.ok(f.start > NOW); assert.ok(f.end > f.start);
    }
    let timestamp = NOW;
    const cyclic = Array.from({length: 80}, (_, i) => {
      const row = {id: 'c' + i, coefficient: target + .1, timestamp};
      timestamp -= [20000, 25000, 30000][i % 3]; return row;
    });
    const f = forecastForTarget(cyclic, target, null, NOW);
    assert.equal(f.diagnostics.basicWindow.rule, 'cycle');
    assert.equal(f.rule, target === 1.5 ? 'opportunity-cycle' : 'opportunity-cluster');
    assert.ok(f.score > f.diagnostics.basicWindow.score);
    assert.equal(f.opportunity.target, target);
  }
});

test('UTC hour-profile branches affect the live primary rule rather than being display-only statistics', () => {
  for (const target of [1.5, 2]) {
    for (const [oldCoefficient,expected] of [[1.01,'hour-favorable'],[50,'hour-weak']]) {
      const rows = [
        ...history([target + .1,...Array(29).fill(target===1.5?1.2:1.4)],NOW,1000),
        ...Array.from({length:70},(_,i)=>({id:'old-'+i,timestamp:NOW-3600000-i*20000,coefficient:oldCoefficient})),
      ];
      assert.equal(forecastForTarget(rows,target,null,NOW).diagnostics.basicWindow.rule,expected);
    }
  }
});

test('Poisson-style delay rule is retained for target event intervals', () => {
  const values = Array(80).fill(1.1);
  for (const i of [60, 65, 70, 75]) values[i] = 2.2;
  const rows = history(values);
  for (const target of [1.5, 2]) {
    const candidate = forecastOpportunity(rows, NOW, targetProfile(target));
    assert.ok(candidate.reason.startsWith('Hazard Poisson'));
    assert.ok(candidate.expectedAt > NOW);
  }
});

test('cycles are calculated at 1.50 and 2 separately; all coefficient observations remain', () => {
  const rows = history(Array.from({length: 100}, (_, i) => i % 2 ? 1.6 : 2.2));
  rows[5].coefficient = 50;
  const stats = analyze(rows, NOW);
  assert.equal(stats.n, 100);
  assert.deepEqual(stats.targets.map(x => x.target), [1.5, 2]);
  assert.equal(stats.targets[0].intervals.count, 100);
  assert.equal(stats.targets[0].intervals.medGap, 20000);
  assert.equal(stats.targets[1].intervals.count, 51);
  assert.equal(stats.targets[1].intervals.medGap, 40000);
  assert.throws(() => forecastForTarget(rows, 40, null, NOW), /Supported targets/);
});

test('duplicates, stale/future/invalid data cannot create forecasts or alter calculations', () => {
  const rows = low(), before = analyze(rows, NOW);
  assert.deepEqual(analyze([...rows, rows[0], {id: 'future', coefficient: 200, timestamp: NOW + 1},
    {id: 'invalid', coefficient: NaN, timestamp: NOW}], NOW), before);
  assert.equal(forecastForTarget(rows.slice(0, 19), 1.5, null, NOW), null);
  assert.equal(forecastForTarget(rows, 1.5, null, NOW + 180001), null);
  assert.deepEqual(normalize([...rows].reverse(), NOW), normalize(rows, NOW));
});

test('custom imports cannot substitute ingestion time for a missing round timestamp', () => {
  const result=mergeRounds([], [1.6,{coefficient:2},{coefficient:1.5,time:''},
    {id:'known',coefficient:'1.6',timestamp:NOW}], 'test', NOW);
  assert.equal(result.rejected,3);
  assert.equal(result.rounds.length,1);
  assert.equal(result.rounds[0].timestamp,NOW);
});

test('forecast times, score and diagnostics are frozen before the window starts', () => {
  const rows = low(), first = advance([], rows, NOW).journal;
  assert.equal(first.length, 2);
  const chosen = first[0]; assert.equal(chosen.start, NOW + 90000);
  const updated = [...rows, {id: 'early', timestamp: chosen.start - 1, coefficient: 500}];
  const next = advance(first, updated, chosen.start - 1).journal;
  assert.equal(next[0].status, 'pending');
  for (const key of ['start', 'end', 'score', 'acceptedAt', 'diagnostics']) assert.deepEqual(next[0][key], chosen[key]);
  assert.equal(forecastForTarget(updated, 1.5, chosen, chosen.start - 1), chosen);
});

test('a later round inside the window can succeed; outside-window events cannot', () => {
  const rows = low(), first = advance([], rows, NOW).journal, f = first[0];
  const observed = [
    ...rows,
    {id: 'before', timestamp: f.start - 1, coefficient: 50},
    {id: 'low', timestamp: f.start + 10000, coefficient: 1.2},
    {id: 'later-hit', timestamp: f.start + 30000, coefficient: 1.6},
    {id: 'future', timestamp: f.end + 1, coefficient: 500},
  ];
  const second = advance(first, observed, f.start + 30000).journal;
  assert.equal(second[0].status, 'hit'); assert.equal(second[0].actual, 1.6);
  assert.equal(second[1].status, 'pending');
  assert.equal(second.length, 2); // Early success does not free the occupied window.
  const renewalRows = [...observed, {id: 'after', timestamp: f.end + 20000, coefficient: 1.1}];
  const renewed = advance(second, renewalRows, f.end + 20000).journal;
  const newWindow = renewed.find(x => x.target === 1.5 && x.status === 'pending');
  assert.ok(newWindow.start > f.end + 20000);
});

test('window bounds are inclusive, with no post-window retroactive success', () => {
  for (const boundary of ['start', 'end']) {
    const first = advance([], low(), NOW).journal, f = first[0];
    const result = advance(first, [...low(), {id: 'boundary', timestamp: f[boundary], coefficient: 1.5}], f[boundary]).journal;
    assert.equal(result[0].status, 'hit');
  }
  const first = advance([], low(), NOW).journal, f = first[0];
  const result = advance(first, [...low(), {id: 'outside', timestamp: f.end + 1, coefficient: 10}], f.end + 1).journal;
  assert.notEqual(result[0].status, 'hit');
});

test('miss requires elapsed window, bracketing history, bounded gaps and a fresh successful poll', () => {
  const first = advance([], low(), NOW).journal, f = first[0], now = f.end + 20000;
  const rows = [...low(), ...Array.from({length: Math.ceil((now - NOW) / 10000)}, (_, i) =>
    ({id: 'live-' + i, timestamp: NOW + (i + 1) * 10000, coefficient: 1.1}))];
  const atEnd = advance(first, rows, f.end, false).journal;
  assert.equal(atEnd[0].status, 'pending');
  const result = advance(first, rows, now, false).journal;
  assert.equal(result[0].status, 'miss'); assert.equal(result[0].actual, 1.1);
  const offline = advance(first, rows, now, false, {online: false, lastSuccessAt: NOW}).journal;
  assert.equal(offline[0].status, 'pending');
  const oldPoll = advance(first, rows, now, false, {online: true, lastSuccessAt: f.end - 1}).journal;
  assert.equal(oldPoll[0].status, 'pending');
  const missing = advance(first, [...low(), {id: 'after', timestamp: now, coefficient: 1.1}], now, false).journal;
  assert.equal(missing[0].status, 'pending');
  const expired = advance(first, rows, f.end + 180001, false, {online: false, lastSuccessAt: NOW}).journal;
  assert.equal(expired[0].status, 'unknown');
});

test('legacy next-round results and malformed windows are excluded from window results', () => {
  const valid = advance([], low(), NOW).journal;
  const legacy = {model: 'small-targets-frequency-v1', target: 1.5, status: 'hit', actual: 10};
  const invalid = {...valid[0], acceptedAt: valid[0].end + 1};
  const result = advance([legacy, invalid], low(), NOW).journal;
  assert.equal(result.length, 2); assert.ok(result.every(x => x.model === MODEL && x.status === 'pending'));
  assert.equal(summary([legacy]).known, 0);
  assert.equal(summary(valid).brier, null); // A heuristic score is not a probability.
});

test('walking forward never creates or resolves a window with future input', () => {
  let rows = [], journal = [], seed = 7;
  for (let i = 0; i < 350; i++) {
    const now = NOW + i * 20000;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    rows.push({id: 'walk-' + i, timestamp: now, coefficient: 1 + (seed % 180) / 100});
    const future = {id: 'impossible', timestamp: now + 1, coefficient: 999};
    const baseline = advance(journal, rows, now);
    assert.deepEqual(advance(journal, [...rows, future], now), baseline);
    journal = baseline.journal;
    assert.ok(journal.every(x => x.acceptedAt < x.start && [1.5, 2].includes(x.target)));
    assert.ok(journal.filter(x => x.status === 'hit').every(x => x.actualAt >= x.start && x.actualAt <= x.end));
  }
  assert.ok(summary(journal).known > 0);
});
