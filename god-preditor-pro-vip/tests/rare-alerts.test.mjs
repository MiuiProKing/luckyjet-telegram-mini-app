import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MODEL, RESULT_GRACE_MS, MAX_ALERTS, advanceRareAlerts} from '../safari/src/rare-alerts.mjs';
import {MIN_ROUNDS, analyzeRareWindows} from '../safari/src/rare-window-model.mjs';

const NOW = Date.UTC(2026, 10, 3, 12);
const EVIDENCE = 'experimental-unvalidated';
const history = (at = NOW, prefix = 'r', count = 500, cadence = 20000) =>
  Array.from({length: count}, (_, i) => ({id: `${prefix}-${i}`, coefficient: 1.5, timestamp: at - i * cadence}));
const candidate = (now = NOW, extra = {}) => ({
  model: 'rare-window-v1', source: 'beta-window-frequency', target: 100,
  generatedAt: now, start: now + 120000, end: now + 300000, evidenceStatus: EVIDENCE, ...extra,
});
const analysis = (now = NOW, extra = {}) => ({
  ready: true, evidenceStatus: EVIDENCE, threshold: 100, horizonMs: 180000,
  candidate: candidate(now), ...extra,
});
const big = (now = NOW, extra = {}) => ({
  model: 'hardened-dynamic-windows-v4', channel: 'big', target: 120,
  generatedAt: now, start: now + 180000, end: now + 360000, windowMs: 180000,
  evidenceStatus: EVIDENCE, scoreKind: 'heuristic', heuristicScore: 70, ...extra,
});
const advance = (journal = [], rounds = history(), now = NOW, extra = {}) =>
  advanceRareAlerts(journal, rounds, {analysis: analysis(now), now, online: true, lastSuccessAt: now, ...extra});
const futureLows = to => Array.from({length: Math.floor((to - NOW) / 20000)}, (_, i) =>
  ({id: `future-low-${i}`, coefficient: 1.5, timestamp: NOW + (i + 1) * 20000}));
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test('rare alert publication is a separate frozen experiment with no action or confidence fields', () => {
  const rows = deepFreeze(history()), stats = deepFreeze(analysis());
  const result = advanceRareAlerts(deepFreeze([]), rows, {
    now: NOW, online: true, lastSuccessAt: NOW, analysis: stats,
  });
  assert.equal(MODEL, 'rare-alert-v1');
  assert.equal(RESULT_GRACE_MS, 180000);
  assert.equal(MAX_ALERTS, 100);
  assert.equal(result.changed, true);
  assert.equal(result.journal.length, 1);
  assert.equal(result.active, result.journal[0]);
  assert.equal(result.latestResult, null);
  assert.equal(result.active.model, MODEL);
  assert.equal(result.active.source, 'beta-window-frequency');
  assert.equal(result.active.sourceModel, 'rare-window-v1');
  assert.equal(result.active.evidenceStatus, EVIDENCE);
  assert.ok(result.active.acceptedAt < result.active.start);
  assert.ok(Object.isFrozen(result.active));
  assert.ok(Object.isFrozen(result.journal));
  for (const field of ['channel', 'raw', 'opportunity', 'autoBet', 'cashout', 'action', 'confidence',
    'score', 'heuristicScore', 'probability', 'reliability']) assert.equal(Object.hasOwn(result.active, field), false, field);
});

test('existing valid big opportunity is preferred and can be accepted after generation before its start', () => {
  const forecast = big(NOW - 100000), saved = structuredClone(forecast);
  const result = advance([], history(), NOW, {bigForecast: deepFreeze(forecast)});
  assert.equal(result.active.source, 'existing-big-opportunity');
  assert.equal(result.active.sourceModel, 'hardened-dynamic-windows-v4');
  assert.equal(result.active.target, 120);
  assert.equal(result.active.generatedAt, NOW - 100000);
  assert.equal(result.active.start, NOW + 80000);
  assert.equal(result.active.acceptedAt, NOW);
  assert.deepEqual(forecast, saved);
});

test('archive candidate retains its separate source model across saved journal reload', () => {
  const archiveAnalysis = analysis(NOW, {candidate: candidate(NOW, {model: 'rare-window-archive-v1'})});
  const issued = advance([], history(), NOW, {analysis: archiveAnalysis});
  assert.equal(issued.active.sourceModel, 'rare-window-archive-v1');
  const restored = advance(structuredClone(issued.journal), history(NOW + 1000), NOW + 1000,
    {analysis: analysis(NOW + 1000, {candidate: null})});
  assert.deepEqual(restored.active, issued.active);
  assert.equal(restored.changed, false);
  assert.equal(restored.active.channel, undefined);
});

test('invalid or historical big windows never resurrect and independent analysis can supply its own window', () => {
  for (const invalid of [
    big(NOW - 180000), big(NOW - 180001), big(NOW, {model: 'old-model'}),
    big(NOW, {channel: 'primary'}), big(NOW, {target: 99}),
    big(NOW, {scoreKind: 'confidence'}), big(NOW, {heuristicScore: NaN}),
    big(NOW, {windowMs: 180001}), big(NOW, {generatedAt: NOW + 1}),
  ]) {
    const noFallback = advance([], history(), NOW, {
      bigForecast: invalid, analysis: analysis(NOW, {candidate: null}),
    });
    assert.equal(noFallback.active, null);
    assert.equal(noFallback.journal.length, 0);
    assert.equal(advance([], history(), NOW, {bigForecast: invalid}).active.source, 'beta-window-frequency');
  }
});

test('publication target, source, generation and window remain immutable as live candidates change', () => {
  const result = advance(), saved = structuredClone(result.journal[0]);
  const time = NOW + 20000;
  const next = advance(deepFreeze(result.journal), [...futureLows(time), ...history()], time, {
    analysis: analysis(time, {candidate: candidate(time, {target: 200})}),
    bigForecast: big(time, {target: 500}),
  });
  assert.equal(next.changed, false);
  assert.equal(next.journal.length, 1);
  assert.deepEqual(next.active, saved);
  assert.deepEqual(result.journal[0], saved);
});

test('candidate boundary validation rejects noninteger, nonfinite, foreign and unsafe values', () => {
  const invalid = [
    {start: NOW + 119999}, {start: NOW + 900001, end: NOW + 950000},
    {end: NOW + 120000}, {end: NOW + 720001}, {end: Infinity},
    {start: NOW + 120000.5}, {generatedAt: NOW + 1}, {generatedAt: NOW - .5},
    {generatedAt: Math.floor(NOW / 1000)}, {target: '100'}, {target: 100.5},
    {target: Number.MAX_SAFE_INTEGER + 1}, {model: 'other'}, {source: 'other'},
    {evidenceStatus: 'validated'}, {start: NOW},
  ];
  for (const extra of invalid) {
    const result = advance([], history(), NOW, {analysis: analysis(NOW, {candidate: candidate(NOW, extra)})});
    assert.equal(result.active, null, JSON.stringify(extra));
    assert.equal(result.journal.length, 0);
  }
  for (const extra of [{start: NOW + 120000, end: NOW + 720000},
    {start: NOW + 900000, end: NOW + 900001}]) {
    assert.equal(advance([], history(), NOW, {analysis: analysis(NOW, {candidate: candidate(NOW, extra)})}).journal.length, 1);
  }
});

test('readiness and recent successful poll are required for publication and active display', () => {
  const stored = advance().journal;
  for (const extra of [
    {online: false}, {online: 'connected'}, {lastSuccessAt: null},
    {lastSuccessAt: NOW + 1}, {lastSuccessAt: NOW - 12001},
    {lastSuccessAt: String(NOW)}, {analysis: analysis(NOW, {ready: false})},
    {analysis: analysis(NOW, {evidenceStatus: 'validated'})},
    {analysis: analysis(NOW, {threshold: 99})}, {analysis: analysis(NOW, {horizonMs: 60000})},
  ]) {
    assert.equal(advance([], history(), NOW, extra).journal.length, 0, JSON.stringify(extra));
    const result = advance(stored, history(), NOW, extra);
    assert.equal(result.active, null);
    assert.deepEqual(result.journal, stored);
  }
  assert.equal(advance([], history(), NOW, {lastSuccessAt: NOW - 12000}).journal.length, 1);
});

test('claimed analysis readiness cannot bypass stale history or recovery after a gap', () => {
  const stored = advance().journal;
  const histories = [[], history(NOW - 180001), history(NOW, 'few', 499),
    [...history(NOW, 'new', 499, 1000), ...history(NOW - 2000000, 'old')]];
  for (const rounds of histories) {
    assert.equal(advance([], rounds).journal.length, 0);
    assert.equal(advance(stored, rounds).active, null);
  }
  const recovered = [...history(NOW, 'recovered', 500, 1000), ...history(NOW - 2000000, 'old')];
  assert.equal(advance([], recovered).journal.length, 1);
});

test('real rare analysis and journal both require 500 rounds for beta and existing-big red alerts', () => {
  assert.equal(MIN_ROUNDS, 500);
  const full = history(NOW, 'boundary', 500, 60000).map((row, i) => ({...row,
    coefficient: (i < 90 ? i % 3 === 0 : i % 30 === 0) ? 100 : 1.5,
  }));
  const short = full.slice(0, 499);
  const shortAnalysis = analyzeRareWindows(short, NOW), fullAnalysis = analyzeRareWindows(full, NOW);
  assert.equal(shortAnalysis.ready, false);
  assert.equal(shortAnalysis.diagnostics.currentSegmentCount, 499);
  assert.equal(shortAnalysis.diagnostics.reason, 'insufficient-contiguous-history');
  assert.equal(fullAnalysis.ready, true);
  assert.equal(fullAnalysis.diagnostics.currentSegmentCount, 500);
  assert.ok(fullAnalysis.candidate);
  for (const bigForecast of [null, big()]) {
    const insufficient = advance([], short, NOW, {analysis: shortAnalysis, bigForecast});
    assert.equal(insufficient.journal.length, 0);
    assert.equal(insufficient.active, null);
    // Even genuine ready analysis from a longer history cannot authorize the
    // alert when the journal receives only 499 completed contiguous rounds.
    const forgedReady = advance([], short, NOW, {analysis: fullAnalysis, bigForecast});
    assert.equal(forgedReady.journal.length, 0);
    assert.equal(forgedReady.active, null);
    const enough = advance([], full, NOW, {analysis: fullAnalysis, bigForecast});
    assert.equal(enough.journal.length, 1);
    assert.equal(enough.active.source, bigForecast ? 'existing-big-opportunity' : 'beta-window-frequency');
    const hidden = advance(enough.journal, short, NOW, {analysis: fullAnalysis, bigForecast});
    assert.equal(hidden.active, null);
    assert.deepEqual(hidden.journal, enough.journal);
  }
});

test('strict completed-round normalization excludes future, conflicting and malformed apparent hits', () => {
  const initial = advance(), entry = initial.active, time = entry.start + 20000;
  const malformed = [
    {id: 'future-hit', coefficient: 1000, timestamp: time + 1},
    {id: 'estimated-hit', coefficient: 1000, timestamp: entry.start, estimated: true},
    {id: 'incomplete-hit', coefficient: 1000, timestamp: entry.start, completed: false},
    {id: 'conflicting-hit', coefficient: 1000, timestamp: entry.start},
    {id: 'conflicting-hit', coefficient: 2, timestamp: entry.start},
    {id: 'string-hit', coefficient: '1000', timestamp: entry.start},
    {id: 'seconds-hit', coefficient: 1000, timestamp: Math.floor(entry.start / 1000)},
    {coefficient: 1000, timestamp: entry.start},
  ];
  const rounds = [...malformed, ...futureLows(time), ...history()];
  const saved = structuredClone(rounds);
  const result = advance(initial.journal, deepFreeze(rounds), time);
  assert.equal(result.journal[0].status, 'pending');
  assert.equal(result.latestResult, null);
  assert.deepEqual(rounds, saved);
});

test('an early observed hit resolves once and holds the same alert through the original end', () => {
  const initial = advance(), entry = initial.active, time = entry.start + 20000;
  const hit = {id: 'real-hit', coefficient: 125.5, timestamp: entry.start};
  const rows = [hit, ...futureLows(time).filter(row => row.timestamp !== hit.timestamp), ...history()];
  const result = advance(initial.journal, rows, time, {bigForecast: big(time)});
  assert.equal(result.journal.length, 1);
  assert.equal(result.active.key, entry.key);
  assert.equal(result.active.status, 'hit');
  assert.equal(result.latestResult, result.active);
  assert.equal(result.active.actual, 125.5);
  assert.equal(result.active.actualAt, entry.start);
  const later = entry.end - 1;
  const held = advance(result.journal, [hit, ...futureLows(later).filter(row => row.timestamp !== hit.timestamp), ...history()], later);
  assert.equal(held.journal.length, 1);
  assert.equal(held.changed, false);
  assert.equal(held.active.key, entry.key);
  assert.equal(held.active.target, 100);
  assert.equal(held.active.source, 'beta-window-frequency');
});

test('a completed hit releases publication only after its end and permits the next independent alert', () => {
  const initial = advance(), entry = initial.active;
  const hitAt = entry.start + 1000;
  const hit = {id: 'hit', coefficient: 100, timestamp: hitAt};
  const first = advance(initial.journal, [hit, ...futureLows(hitAt), ...history()], hitAt);
  const time = entry.end + 20000;
  const next = advance(first.journal, [hit, ...futureLows(time), ...history()], time);
  assert.equal(next.journal.length, 2);
  assert.equal(next.latestResult.key, entry.key);
  assert.notEqual(next.active.key, entry.key);
  assert.equal(next.active.acceptedAt, time);
  assert.ok(next.active.start > time);
  assert.ok(next.active.start > entry.end);
});

test('hits use the frozen alert target and include the end boundary', () => {
  const initial = advance([], history(), NOW, {bigForecast: big()}), entry = initial.active;
  const firstTime = entry.start + 20000;
  const near = {id: 'under-target', coefficient: 119, timestamp: entry.start};
  const first = advance(initial.journal, [near, ...futureLows(firstTime).filter(row => row.timestamp !== near.timestamp), ...history()], firstTime);
  assert.equal(first.journal[0].status, 'pending');
  const hit = {id: 'at-end', coefficient: 120, timestamp: entry.end};
  const final = advance(first.journal, [near, hit, ...futureLows(entry.end).filter(row => ![near.timestamp, hit.timestamp].includes(row.timestamp)), ...history()], entry.end, {
    analysis: analysis(entry.end, {candidate: null}), online: false,
  });
  assert.equal(final.journal[0].status, 'hit');
  assert.equal(final.journal[0].actualAt, entry.end);
  assert.equal(final.active, null);
});

test('a miss requires post-end brackets, sufficient cadence coverage and a fresh final poll', () => {
  const initial = advance(), entry = initial.active, time = entry.end + 20000;
  const rows = [...futureLows(time), ...history()];
  for (const extra of [{online: false}, {lastSuccessAt: time + 1}, {lastSuccessAt: entry.end - 1},
    {lastSuccessAt: time - 12001}]) {
    const result = advance(initial.journal, rows, time, extra);
    assert.equal(result.journal.length, 1);
    assert.equal(result.journal[0].status, 'pending');
    assert.equal(result.active, null);
  }
  const result = advance(initial.journal, rows, time, {analysis: analysis(time, {candidate: null})});
  assert.equal(result.journal[0].status, 'miss');
  assert.equal(result.latestResult.actual, 1.5);
  assert.equal(result.latestResult.actualAt, entry.end);
  assert.equal(result.active, null);
});

test('missing brackets, no in-window observations or an excessive coverage gap stay pending then unknown', () => {
  const initial = advance(), entry = initial.active;
  const during = {id: 'inside-low', coefficient: 1.5, timestamp: entry.start + 1000};
  const time = entry.end + 20000;
  for (const rows of [
    [...history(time, 'recent'), ...history()].filter(row => row.timestamp < entry.end),
    [...history(time, 'recent', 1), ...history()],
    [{id: 'after', coefficient: 1.5, timestamp: time}, during, ...history()],
  ]) {
    const waiting = advance(initial.journal, rows, time, {analysis: analysis(time, {candidate: null})});
    assert.equal(waiting.journal[0].status, 'pending');
    const late = entry.end + RESULT_GRACE_MS + 1;
    const unknown = advance(waiting.journal, [during, ...history(late, 'recovery', 500, 100), ...history()], late, {
      analysis: analysis(late, {candidate: null}),
    });
    assert.equal(unknown.journal[0].status, 'unknown');
    assert.equal(unknown.latestResult.status, 'unknown');
  }
});

test('cadence-based coverage gap limit is frozen at publication and capped between one and three minutes', () => {
  const fast = advance([], history(NOW, 'fast', 500, 20000)).active;
  const slow = advance([], history(NOW, 'slow', 500, 100000)).active;
  const time = fast.end + 20000;
  const sparse = Array.from({length: 5}, (_, i) =>
    ({id: `sparse-${i}`, coefficient: 1.5, timestamp: NOW + i * 80000}));
  const fastResult = advance([fast], [...sparse, ...history()], time, {analysis: analysis(time, {candidate: null})});
  const slowResult = advance([slow], [...sparse, ...history(NOW, 'slow', 500, 100000)], time, {
    analysis: analysis(time, {candidate: null}),
  });
  assert.equal(fast.avgRoundSeconds, 20);
  assert.equal(slow.avgRoundSeconds, 100);
  assert.equal(fastResult.journal[0].status, 'pending');
  assert.equal(slowResult.journal[0].status, 'miss');
});

test('expired unresolved alerts block a new publication until their result or grace period', () => {
  const initial = advance(), entry = initial.active;
  const time = entry.end + 1;
  const gapRows = [...history(time, 'new', 20), ...history()].filter(row =>
    row.timestamp < entry.start || row.timestamp > entry.end);
  const waiting = advance(initial.journal, gapRows, time);
  assert.equal(waiting.journal.length, 1);
  assert.equal(waiting.journal[0].status, 'pending');
  assert.equal(waiting.active, null);
  const late = entry.end + RESULT_GRACE_MS + 1;
  const next = advance(waiting.journal, history(late, 'recovered', 500, 100), late);
  assert.equal(next.journal.length, 2);
  assert.equal(next.journal[0].status, 'unknown');
  assert.equal(next.latestResult.key, entry.key);
  assert.equal(next.active.acceptedAt, late);
});

test('persisted foreign, retroactive, future, overlapping and malformed alerts are rejected', () => {
  const entry = advance().active;
  const invalid = [
    {...entry, model: 'hardened-dynamic-windows-v4'}, {...entry, sourceModel: 'old'},
    {...entry, acceptedAt: entry.generatedAt - 1}, {...entry, acceptedAt: entry.start},
    {...entry, acceptedAt: NOW + 1}, {...entry, evidenceStatus: 'validated'},
    {...entry, status: 'success'}, {...entry, status: 'hit'}, {...entry, target: Infinity},
    {...entry, avgRoundSeconds: NaN}, {...entry, key: 'changed'},
  ];
  const result = advance(invalid, history(), NOW, {analysis: analysis(NOW, {candidate: null})});
  assert.deepEqual(result.journal, []);
  assert.equal(result.changed, true);
  const overlap = {...entry, source: 'existing-big-opportunity', sourceModel: 'hardened-dynamic-windows-v4',
    start: NOW + 180000, end: NOW + 360000};
  overlap.key = `${MODEL}:${overlap.source}:${overlap.generatedAt}:${overlap.start}:${overlap.end}:${overlap.target}:${overlap.acceptedAt}`;
  const deduped = advance([entry, entry, overlap], history(), NOW, {analysis: analysis(NOW, {candidate: null})});
  assert.equal(deduped.journal.length, 1);
  assert.equal(deduped.changed, true);
});

test('persisted unrelated fields are removed and valid alert reloads preserve the frozen schema', () => {
  const entry = advance().active;
  const polluted = {...entry, autoBet: true, channel: 'primary', cashout: 100,
    confidence: 99, raw: {doSomething: true}};
  const result = advance([polluted], history());
  assert.equal(result.changed, true);
  assert.deepEqual(result.active, entry);
  const reloaded = advance(JSON.parse(JSON.stringify(result.journal)), history());
  assert.equal(reloaded.changed, false);
  assert.deepEqual(reloaded.journal, result.journal);
});

test('a backwards or invalid clock preserves published history and blocks overlapping replacement', () => {
  const initial = advance(), before = NOW - 1000;
  const rollback = advance(initial.journal, history(before, 'rollback'), before);
  assert.deepEqual(rollback.journal, initial.journal);
  assert.equal(rollback.changed, false);
  assert.equal(rollback.active, null);
  assert.equal(rollback.latestResult, null);
  assert.deepEqual(advance(initial.journal, history(), NaN).journal, initial.journal);
  const entry = initial.active, time = entry.start + 20000;
  const hit = {id: 'hit-before-rollback', coefficient: 100, timestamp: entry.start};
  const resolved = advance(initial.journal, [hit, ...futureLows(time), ...history()], time);
  const resultRollback = advance(resolved.journal, history(NOW + 20000, 'after'), NOW + 20000);
  assert.deepEqual(resultRollback.journal, resolved.journal);
  assert.equal(resultRollback.changed, false);
  assert.equal(resultRollback.active, null);
  assert.equal(resultRollback.latestResult, null);
});

test('journal storage is capped at the newest 100 valid publications', () => {
  const template = advance().active;
  const entries = Array.from({length: 105}, (_, i) => {
    const offset = (i - 105) * 1000000;
    const entry = {...template, generatedAt: template.generatedAt + offset,
      acceptedAt: template.acceptedAt + offset, start: template.start + offset, end: template.end + offset,
      status: 'miss', actual: 1.5, actualAt: template.end + offset, resolvedAt: template.end + offset + 1};
    entry.key = `${MODEL}:${entry.source}:${entry.generatedAt}:${entry.start}:${entry.end}:${entry.target}:${entry.acceptedAt}`;
    return entry;
  });
  const result = advance(entries, history(), NOW, {analysis: analysis(NOW, {candidate: null})});
  assert.equal(result.journal.length, 100);
  assert.equal(result.journal[0].key, entries[5].key);
  assert.equal(result.latestResult.key, entries[104].key);
  assert.equal(result.changed, true);
});
