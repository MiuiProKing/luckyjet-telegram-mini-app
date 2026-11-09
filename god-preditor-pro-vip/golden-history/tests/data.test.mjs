import test from 'node:test';
import assert from 'node:assert/strict';
import {createReader, mapRound, readLivePage, sequence} from '../data.mjs';

const NOW = Date.parse('2026-11-09T17:46:00Z');
const config = {url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test', table: 'luckyjet_rounds'};
const row = (seq, coefficient = 10, changes = {}) => ({id: `round-${seq}`, source_seq: seq, coefficient,
  round_timestamp: '2026-11-08T17:50:00Z', completed: true, estimated: false, ...changes});
const json = rows => new Response(JSON.stringify(rows), {headers: {'content-type': 'application/json'}});

test('real completed provider timestamps are required; no receive-time substitution', () => {
  assert.equal(mapRound(row(1), NOW).coefficient, 10);
  for (const changes of [{estimated: true}, {completed: false}, {round_timestamp: null},
    {round_timestamp: '2026-11-10T00:00:00Z'}, {coefficient: Infinity}, {coefficient: 0}, {id: ''}]) {
    assert.equal(mapRound(row(1, 10, changes), NOW), null);
  }
  assert.equal(sequence('9007199254740999'), '9007199254740999');
  assert.equal(sequence(9007199254740999), null);
  assert.equal(sequence(-77100), '-77100');
  assert.equal(sequence(0), '0');
});

test('historical imports with negative and zero source sequences are included', async () => {
  const source = [2, 1, 0, -1, -77100].map(n => row(n)), received = [];
  const reader = createReader(config, {now: () => NOW, fetchImpl: async url => {
    const bound = url.searchParams.get('source_seq');
    return json(source.filter(r => bound === null || r.source_seq < Number(bound.slice(3))).slice(0, 2));
  }});
  await reader.loadHistory({onBatch: batch => received.push(...batch)});
  assert.deepEqual(received.map(r => r.seq), ['2', '1', '0', '-1', '-77100']);
});

test('all archive pages load even when the server caps each response below the requested limit', async () => {
  const source = [5, 4, 3, 2, 1].map(n => row(n)), calls = [], received = [];
  const reader = createReader(config, {now: () => NOW, fetchImpl: async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.apikey, config.publishableKey);
    assert.equal(options.credentials, 'omit');
    assert.equal(url.searchParams.get('completed'), 'eq.true');
    assert.equal(url.searchParams.get('estimated'), 'eq.false');
    assert.equal(url.searchParams.get('coefficient'), 'gte.10');
    const before = url.searchParams.get('source_seq');
    return json(source.filter(r => !before || r.source_seq < Number(before.slice(3))).slice(0, 2));
  }});
  const result = await reader.loadHistory({onBatch: batch => received.push(...batch)});
  assert.equal(calls.length, 4);
  assert.deepEqual(received.map(r => r.seq), ['5', '4', '3', '2', '1']);
  assert.equal(result.highWater, '5');
});

test('cached history catches up using both lower and upper sequence bounds', async () => {
  const source = [8, 7, 6, 5].map(n => row(n)), received = [];
  const reader = createReader(config, {now: () => NOW, fetchImpl: async url => {
    const filters = url.searchParams.getAll('source_seq');
    assert.ok(filters.includes('gt.5'));
    const gt = Number(filters.find(x => x.startsWith('gt.')).slice(3));
    const lt = filters.find(x => x.startsWith('lt.'));
    return json(source.filter(r => r.source_seq > gt && (!lt || r.source_seq < Number(lt.slice(3)))).slice(0, 2));
  }});
  const result = await reader.loadHistory({after: '5', onBatch: rows => received.push(...rows)});
  assert.deepEqual(received.map(r => r.seq), ['8', '7', '6']);
  assert.equal(result.highWater, '8');
});

test('an archive failure after page one is an error, not a complete history', async () => {
  let calls = 0, received = 0;
  const reader = createReader(config, {now: () => NOW, fetchImpl: async () => ++calls === 1 ? json([row(2)]) : new Response('', {status: 503})});
  await assert.rejects(reader.loadHistory({onBatch: batch => {received += batch.length;}}), /503/);
  assert.equal(received, 1);
});

test('ignored keyset filters stop the request loop rather than silently duplicating pages', async () => {
  let calls = 0;
  const reader = createReader(config, {now: () => NOW, fetchImpl: async () => {calls++; return json([row(2)]);}});
  await assert.rejects(reader.loadHistory(), /курсор/);
  assert.equal(calls, 2);
});

test('future-dated archive rounds do not move the checkpoint past an event that can mature later', async () => {
  let calls = 0;
  const reader = createReader(config, {now: () => NOW, fetchImpl: async () => ++calls === 1 ? json([
    row(6), row(5, 20, {round_timestamp: '2026-11-09T17:46:10Z'}), row(4),
  ]) : json([])});
  const result = await reader.loadHistory();
  assert.equal(result.highWater, '4');
});

test('live cursor stops before a future round and accepts it when the clock catches up', () => {
  const rows = [row(3, 30, {round_timestamp: '2026-11-09T17:46:10Z'}), row(2, 2)];
  const first = readLivePage(rows, '1', NOW);
  assert.equal(first.cursor, '2');
  assert.deepEqual(first.rounds.map(r => r.coefficient), [2]);
  const second = readLivePage(rows, first.cursor, NOW + 11000);
  assert.equal(second.cursor, '3');
  assert.deepEqual(second.rounds.map(r => r.coefficient), [30]);
});

test('malformed JSON shapes and insecure/private-key configurations are rejected', async () => {
  const reader = createReader(config, {fetchImpl: async () => json({message: 'not rounds'})});
  await assert.rejects(reader.page(), /историю/);
  assert.throws(() => createReader({...config, publishableKey: 'service_role_secret'}));
  assert.throws(() => createReader({...config, url: 'http://example.com'}));
});
