import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generatePrediction, normalizeRounds, EVIDENCE_STATUS} from '../safari/src/prediction-v2.ts';
import {
  MODEL, TARGETS, RESULT_GRACE_MS, normalize, analyze, forecastForTarget, advanceJournal, summary,
} from '../safari/src/window-model-v2.mjs';

const NOW = Date.UTC(2026, 10, 2, 12, 10, 17);
const history = (values, at = NOW, prefix = 'r', cadence = 20000) => values.map((coefficient, i) =>
  ({id: prefix + i, coefficient, timestamp: at - i * cadence}));
const low = () => history(Array(40).fill(1.1));
const advance = (journal, rounds, now = NOW, enabled = true, coverage) =>
  advanceJournal(journal, rounds, analyze(rounds, now), now, enabled, coverage);
const latest = (journal, channel = 'primary') => [...journal].reverse().find(x => x.channel === channel);
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function opportunityHistory() {
  return history(Array.from({length: 80}, (_, i) => [0, 3, 6, 9, 12].includes(i) ? 100 : 1.5));
}
function futureLows(to) {
  return Array.from({length: Math.floor(to / 20000)}, (_, i) =>
    ({id: 'new-low-' + i, coefficient: 1.5, timestamp: NOW + (i + 1) * 20000}));
}

test('Safari v4 maps only unvalidated heuristic fields from the supplied v2 arithmetic', () => {
  assert.equal(MODEL, 'hardened-dynamic-windows-v4');
  assert.deepEqual(TARGETS, ['primary', 'big']);
  assert.equal(RESULT_GRACE_MS, 180000);
  for (const rounds of [low(), history([6, 7, 8, ...Array(37).fill(2.5)]), opportunityHistory()]) {
    const raw = generatePrediction(rounds, null, NOW), forecast = forecastForTarget(rounds, 'primary', null, NOW);
    assert.equal(forecast.target, raw.estimatedCoef);
    assert.equal(forecast.start, raw.estimatedAt);
    assert.equal(forecast.end, raw.estimatedAt + raw.windowMs);
    assert.equal(forecast.heuristicScore, raw.heuristicScore);
    assert.equal(forecast.evidenceStatus, EVIDENCE_STATUS);
    assert.deepEqual(forecast.raw, raw);
    for (const field of ['score', 'reliability', 'confidence', 'probability']) {
      assert.equal(Object.hasOwn(forecast, field), false, field);
      assert.equal(Object.hasOwn(forecast.raw, field), false, 'raw ' + field);
    }
  }
  assert.equal(forecastForTarget(low(), 2, null, NOW), null);
  assert.equal(summary([]).brier, null);
});

test('strict normalization rejects conflicting identities, estimated, incomplete and malformed rows', () => {
  const proper = history([1.2, 3, 5]);
  const rounds = [...proper, {...proper[0]}, {...proper[1], coefficient: 90},
    {id: 'estimated', coefficient: 900, timestamp: NOW, estimated: true},
    {id: 'incomplete', coefficient: 900, timestamp: NOW, completed: false},
    {id: 'future', coefficient: 900, timestamp: NOW + 1},
    {id: 'string', coefficient: '90', timestamp: NOW},
    {id: 'seconds', coefficient: 90, timestamp: Math.floor(NOW / 1000)},
    {id: 'microseconds', coefficient: 90, timestamp: NOW * 1000},
    {id: 'bad-flag', coefficient: 90, timestamp: NOW, estimated: 'false'},
    {id: ' bad-id ', coefficient: 90, timestamp: NOW},
    {coefficient: 90, timestamp: NOW}, null];
  const before = structuredClone(rounds);
  assert.deepEqual(normalize(rounds, NOW), normalizeRounds(rounds, NOW));
  assert.deepEqual(normalize(rounds, NOW), [proper[0], proper[2]]);
  assert.deepEqual(rounds, before);
  const stats = analyze(rounds, NOW);
  assert.equal(stats.n, 2);
  assert.equal(stats.ready, false);
  assert.equal(stats.diagnostics.normalization.rejectedCount, rounds.length - 2);
  assert.deepEqual(normalize(undefined, NOW), []);
});

test('recovery requires twenty fresh contiguous rounds while n retains full valid history', () => {
  const older = history(Array(80).fill(100), NOW - 2000000, 'older');
  const recovered = history(Array(20).fill(1.5));
  for (const count of [1, 19]) {
    const rounds = [...recovered.slice(0, count), ...older];
    const stats = analyze(rounds, NOW);
    assert.equal(stats.n, 80 + count);
    assert.equal(stats.continuityCount, count);
    assert.equal(stats.fresh, true);
    assert.equal(stats.ready, false);
    assert.equal(forecastForTarget(rounds, 'primary', null, NOW), null);
    assert.equal(advance([], rounds).journal.length, 0);
  }
  const rounds = [...recovered, ...older].map((r, i) => ({...r, source_seq: i % 2 ? -900 : 8000}));
  const stats = analyze(rounds, NOW);
  assert.equal(stats.n, 100);
  assert.equal(stats.continuityCount, 20);
  assert.equal(stats.ready, true);
  assert.equal(stats.diagnostics.continuity.discardedOlderSegmentRows, 80);
  assert.equal(stats.diagnostics.continuity.status, 'continuity-unknown-before-gap');
  assert.equal(stats.targets.find(x => x.target === 100).count, 0);
  assert.equal(stats.targets.find(x => x.target === 100).historicalFrequency, 0);
  assert.equal(forecastForTarget(rounds, 'big', null, NOW), null);
  assert.equal(analyze(rounds, NOW + 180001).ready, false);
  assert.equal(forecastForTarget(rounds, 'primary', null, NOW + 180001), null);
});

test('a gap strictly above 180 seconds splits continuity; equal gaps and sequence jumps do not', () => {
  const rounds = history(Array(20).fill(2), NOW, 'edge', 180000);
  assert.equal(analyze(rounds, NOW).ready, true);
  assert.equal(analyze([{...rounds[0]}, ...rounds.slice(1).map(r => ({...r, timestamp: r.timestamp - 1}))], NOW).continuityCount, 1);
  assert.equal(forecastForTarget(rounds, 'primary', null, NOW).evidenceStatus, EVIDENCE_STATUS);
});

test('additional windows require two overlapping candidates, with no fallback manufacture', () => {
  const cycleOnly = opportunityHistory();
  const clusterOnly = history([100, 55, 55, 20, 20, 20, ...Array(74).fill(1.5)]);
  for (const rounds of [low(), cycleOnly, clusterOnly]) {
    assert.equal(forecastForTarget(rounds, 'big', null, NOW), null);
    assert.equal(advance([], rounds).journal.filter(x => x.channel === 'big').length, 0);
  }
  assert.equal(analyze(cycleOnly, NOW).diagnostics.additional.candidateCount, 1);
  assert.equal(analyze(clusterOnly, NOW).diagnostics.additional.candidateCount, 1);
});

test('fresh opportunity analysis continues while the published primary is held and immutable', () => {
  const rounds = opportunityHistory(), initial = advance([], rounds).journal;
  const primary = latest(initial), saved = structuredClone(primary);
  freeze(initial); freeze(rounds);
  const time = NOW + 20000;
  const updated = [{id: 'added20', timestamp: time, coefficient: 20}, ...rounds];
  const result = advance(initial, updated, time), big = latest(result.journal, 'big');
  assert.equal(result.diagnostics.primaryHeld, true);
  assert.equal(result.diagnostics.additional.analyzedAt, time);
  assert.equal(result.diagnostics.additional.decision, 'overlapping-heuristics');
  assert.equal(latest(result.journal), primary);
  assert.deepEqual(primary, saved);
  assert.equal(big.start, NOW + 200000);
  assert.equal(big.end, NOW + 240000);
  assert.equal(big.generatedAt, time);
  assert.equal(big.raw.generatedAt, NOW);
  assert.equal(big.generatedAt, big.raw.bigOpportunity.generatedAt);
  assert.ok(big.acceptedAt < big.start);
  assert.equal(big.heuristicScore, big.raw.bigOpportunity.heuristicScore);
  assert.equal(primary.raw.bigOpportunity, null);
});

test('big expiry and primary expiry release independently without shifting either held publication', () => {
  const rounds = opportunityHistory();
  const first = advance([], rounds).journal;
  const added = {id: 'added20', timestamp: NOW + 20000, coefficient: 20};
  const second = advance(first, [added, ...rounds], NOW + 20000).journal;
  const primary = latest(second), oldBig = latest(second, 'big');
  const time = oldBig.end + 1;
  const lows = futureLows(time - NOW).filter(r => r.timestamp !== added.timestamp);
  const result = advance(freeze(second), [added, ...lows, ...rounds], time);
  assert.equal(result.diagnostics.primaryHeld, true);
  assert.equal(result.diagnostics.additionalHeld, false);
  assert.equal(latest(result.journal), primary);
  assert.equal(result.journal.find(x => x.key === oldBig.key).status, 'miss');
  const newBig = latest(result.journal, 'big');
  assert.notEqual(newBig.key, oldBig.key);
  assert.equal(newBig.generatedAt, time);
  assert.ok(newBig.acceptedAt < newBig.start);
  const later = NOW + 280000;
  const more = futureLows(later - NOW).filter(r => r.timestamp !== added.timestamp);
  const final = advance(freeze(result.journal), [added, ...more, ...rounds], later);
  assert.equal(final.diagnostics.primaryHeld, false);
  assert.equal(final.diagnostics.additionalHeld, true);
  assert.equal(latest(final.journal, 'big'), newBig);
  assert.equal(latest(final.journal).generatedAt, later);
  assert.notEqual(latest(final.journal).key, primary.key);
});

test('early success keeps the entire primary window occupied and never moves its frozen score or times', () => {
  const rounds = low(), journal = advance([], rounds).journal, initial = latest(journal);
  const saved = structuredClone(initial);
  const hitAt = initial.start + 1000;
  const updated = [{id: 'hit', coefficient: initial.target + .1, timestamp: hitAt}, ...rounds];
  const hit = advance(freeze(journal), updated, hitAt).journal;
  assert.equal(latest(hit).status, 'hit');
  assert.equal(hit.filter(x => x.channel === 'primary').length, 1);
  const stillHeld = advance(freeze(hit), updated, hitAt + 1000).journal;
  assert.equal(stillHeld.filter(x => x.channel === 'primary').length, 1);
  for (const field of ['start', 'end', 'generatedAt', 'acceptedAt', 'heuristicScore', 'raw', 'diagnostics']) {
    assert.deepEqual(latest(stillHeld)[field], saved[field], field);
  }
  assert.deepEqual(initial, saved);
  assert.equal(forecastForTarget(updated, 'primary', initial, hitAt + 1000), initial);
});

test('forecastForTarget holds valid independent big metadata, then expires it at its own end', () => {
  const rounds = [{id: 'added20', timestamp: NOW + 20000, coefficient: 20}, ...opportunityHistory()];
  const big = forecastForTarget(rounds, 'big', null, NOW + 20000);
  assert.ok(big);
  assert.equal(forecastForTarget(rounds, 'big', freeze(big), NOW + 30000), big);
  const updated = [...futureLows(big.end - NOW), ...rounds];
  const expired = forecastForTarget(updated, 'big', big, big.end);
  assert.ok(!expired || expired.generatedAt === big.end);
  assert.notEqual(expired, big);
});

test('journal acceptance must precede the future start, and invalid retrospective entries cannot become hits', () => {
  const rounds = low(), forecast = latest(advance([], rounds).journal);
  const hit = {id: 'observed-before-announcement', timestamp: forecast.start + 1000, coefficient: 999};
  const now = hit.timestamp;
  for (const acceptedAt of [forecast.start, now]) {
    const retrospective = {...forecast, acceptedAt};
    assert.deepEqual(advance([retrospective], [hit, ...rounds], now, false).journal, []);
    assert.equal(summary([retrospective]).known, 0);
  }
  const fresh = advance([], [hit, ...rounds], now).journal;
  assert.ok(fresh.length);
  for (const entry of fresh) {
    assert.ok(entry.acceptedAt < entry.start);
    assert.equal(entry.status, 'pending');
    assert.ok(entry.start > hit.timestamp);
  }
});

test('estimated or incomplete threshold crossings never resolve a journal hit', () => {
  const rounds = low(), journal = advance([], rounds).journal, forecast = latest(journal);
  const crossing = {id: 'not-a-result', timestamp: forecast.start + 1000, coefficient: 999};
  for (const provenance of [{estimated: true}, {completed: false}]) {
    const result = advance(journal, [{...crossing, ...provenance}, ...rounds], crossing.timestamp, false);
    assert.equal(latest(result.journal).status, 'pending');
  }
});

test('complete observed low coverage becomes a miss only after a fresh final poll', () => {
  const rounds = low(), journal = advance([], rounds).journal, forecast = latest(journal);
  const full = Array.from({length: Math.ceil((forecast.end - NOW) / 20000) + 2}, (_, i) =>
    ({id: 'covered-' + i, timestamp: NOW + i * 20000, coefficient: 1.1}));
  const now = full.at(-1).timestamp;
  const offline = advance(journal, [...full, ...rounds], now, false, {online: false});
  assert.equal(latest(offline.journal).status, 'pending');
  const result = advance(journal, [...full, ...rounds], now, false, {online: true, lastSuccessAt: now});
  assert.equal(latest(result.journal).status, 'miss');
  assert.deepEqual(summary(result.journal), {known: 1, hits: 0, unknown: 0,
    semantics: 'any-hit-in-frozen-window', evidenceStatus: EVIDENCE_STATUS, brier: null});
});

test('a source gap produces unknown even with twenty recovered rows and an online final poll', () => {
  const rounds = low(), journal = advance([], rounds).journal, forecast = latest(journal);
  const now = forecast.end + RESULT_GRACE_MS + 20000;
  const recovery = history(Array(20).fill(1.1), now, 'recovered', 1000);
  const inWindow = {id: 'observed-low', timestamp: forecast.start + 1000, coefficient: 1.1};
  const updated = [...recovery, inWindow, ...rounds];
  assert.equal(analyze(updated, now).ready, true);
  const result = advance(journal, updated, now, false, {online: true, lastSuccessAt: now});
  assert.equal(latest(result.journal).status, 'unknown');
  assert.equal(summary(result.journal).known, 0);
  assert.equal(summary(result.journal).unknown, 1);
});

test('journals and previous forecasts from the old model are isolated', () => {
  const rounds = low(), forecast = latest(advance([], rounds).journal);
  const old = {...forecast, model: 'supplied-dynamic-windows-v3', status: 'hit'};
  const isolated = advance([old], rounds, NOW, false);
  assert.deepEqual(isolated.journal, []);
  assert.equal(isolated.changed, true);
  assert.equal(summary([old]).known, 0);
  const newForecast = forecastForTarget(rounds, 'primary', old, NOW + 1000);
  assert.equal(newForecast.model, MODEL);
  assert.equal(newForecast.generatedAt, NOW + 1000);
  assert.equal(advance([old], rounds, NOW).journal.every(x => x.model === MODEL), true);
});

test('a caller supplied ready flag cannot bypass strict current history readiness', () => {
  const rounds = [low()[0], ...history(Array(80).fill(100), NOW - 2000000, 'old')];
  const result = advanceJournal([], rounds, {ready: true, fresh: true, n: 81}, NOW);
  assert.equal(result.analysis.ready, false);
  assert.equal(result.analysis.continuityCount, 1);
  assert.equal(result.journal.length, 0);
});
