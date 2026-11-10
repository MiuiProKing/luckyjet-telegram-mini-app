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

test('session boundaries are sent to Supabase and out-of-period responses are rejected locally', async () => {
  const start = Date.parse('2026-11-08T06:00:00Z'), end = Date.parse('2026-11-09T06:00:00Z');
  let calls = 0;const received = [];
  const reader = createReader(config, {now: () => NOW, fetchImpl: async url => {
    const bounds = url.searchParams.getAll('round_timestamp');
    assert.ok(bounds.includes('gte.2026-11-08T06:00:00.000Z'));
    assert.ok(bounds.includes('lt.2026-11-09T06:00:00.000Z'));
    return ++calls === 1 ? json([
      row(4, 10, {round_timestamp:'2026-11-08T06:00:00Z'}),
      row(3, 100, {round_timestamp:'2026-11-09T03:00:00Z'}),
      row(2, 50, {round_timestamp:'2026-11-09T06:00:00Z'}),
      row(1, 500, {round_timestamp:'2026-11-07T18:00:00Z'}),
    ]) : json([]);
  }});
  await reader.loadHistory({start, end, onBatch: batch => received.push(...batch)});
  assert.deepEqual(received.map(r => r.seq), ['4','3']);
  await assert.rejects(reader.page({start:end, end:start}), /период/);
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

test('full session analysis can load sub-10 coefficients without relaxing validation or boundaries', async () => {
  const start = Date.parse('2026-11-08T06:00:00Z'), end = Date.parse('2026-11-09T06:00:00Z');
  let calls = 0;const received = [];
  const reader = createReader(config, {now: () => NOW, fetchImpl: async url => {
    assert.equal(url.searchParams.get('coefficient'), 'gte.1');
    assert.equal(url.searchParams.get('completed'), 'eq.true');
    assert.equal(url.searchParams.get('estimated'), 'eq.false');
    return ++calls === 1 ? json([
      row(8,1), row(7,1.5), row(6,2), row(5,10), row(4,0.5),
      row(3,50,{estimated:true}),row(2,1.2,{completed:false}),
      row(1,20,{round_timestamp:'2026-11-09T06:00:00Z'}),
    ]) : json([]);
  }});
  const result = await reader.loadHistory({minimum:1,start,end,onBatch:batch=>received.push(...batch)});
  assert.equal(result.count,4);
  assert.deepEqual(received.map(r=>r.coefficient),[1,1.5,2,10]);
  await assert.rejects(reader.loadHistory({minimum:0}),/минимальный/);
});

test('latest 2000 analysis rows page across server caps without scanning the full archive', async () => {
  const source = Array.from({length:3500},(_,i)=>row(3500-i,i%2?1.2:20));
  const requests=[];let first=true;
  const reader = createReader(config,{now:()=>NOW,fetchImpl:async url=>{
    assert.equal(url.searchParams.get('coefficient'),'gte.1');
    assert.equal(url.searchParams.get('order'),'source_seq.desc');
    const before=url.searchParams.get('source_seq');
    const requested=Number(url.searchParams.get('limit'));requests.push(requested);
    // The head moves after the first response. New arrivals must stay out of
    // the bounded snapshot while older pages are fetched.
    if(!first) source.unshift(row(4000+requests.length));
    first=false;
    return json(source.filter(r=>before===null||r.source_seq<Number(before.slice(3))).slice(0,Math.min(700,requested)));
  }});
  const result=await reader.loadRecent();
  assert.deepEqual(requests,[1000,1000,600]);
  assert.equal(result.count,2000);assert.equal(result.sourceCount,2000);
  assert.equal(result.snapshotSeq,'3500');assert.equal(result.cursor,'3500');assert.equal(result.exhausted,false);
  assert.equal(result.rounds[0].seq,'3500');assert.equal(result.rounds.at(-1).seq,'1501');
  assert.ok(result.rounds.some(r=>r.coefficient===1.2));
  assert.ok(result.rounds.every(r=>BigInt(r.seq)<=3500n));
});

test('latest analysis uses two 1000-row pages and stops at the requested limit', async () => {
  const source=Array.from({length:5000},(_,i)=>row(5000-i));let calls=0;
  const reader=createReader(config,{now:()=>NOW,fetchImpl:async url=>{
    calls++;const before=url.searchParams.get('source_seq');
    return json(source.filter(r=>before===null||r.source_seq<Number(before.slice(3))).slice(0,Number(url.searchParams.get('limit'))));
  }});
  const result=await reader.loadRecent({limit:2000});
  assert.equal(calls,2);assert.equal(result.rounds.length,2000);
  assert.equal(result.rounds.at(-1).seq,'3001');
});

test('latest snapshot rejects invalid/future rows and keeps its cursor below a future sequence', async () => {
  const source=[row(6,1),row(5,20,{round_timestamp:'2026-11-09T17:46:10Z'}),
    row(4,20,{estimated:true}),row(3,2),row(2,10,{completed:false}),row(1,0.5)];
  let calls=0;
  const reader=createReader(config,{now:()=>NOW,fetchImpl:async()=>{calls++;return json(source);}});
  const result=await reader.loadRecent({limit:6});
  assert.equal(calls,1);assert.equal(result.sourceCount,6);assert.equal(result.count,2);
  assert.deepEqual(result.rounds.map(r=>r.seq),['6','3']);
  assert.equal(result.snapshotSeq,'6');assert.equal(result.cursor,'4');
});

test('latest snapshot errors cannot masquerade as a successful partial analysis', async () => {
  let calls=0,received=0;
  const reader=createReader(config,{now:()=>NOW,fetchImpl:async()=>++calls===1?json([row(3),row(2)]):new Response('',{status:503})});
  await assert.rejects(reader.loadRecent({limit:5,onBatch:batch=>{received+=batch.length;}}),/503/);
  assert.equal(received,2);
});

test('latest snapshot validates limits, cursor progress and empty exhaustion', async () => {
  let calls=0;
  const reader=createReader(config,{now:()=>NOW,fetchImpl:async()=>{calls++;return json([row(2)]);}});
  await assert.rejects(reader.loadRecent({limit:0}),/Лимит/);
  await assert.rejects(reader.loadRecent({limit:10001}),/Лимит/);
  assert.equal(calls,0);
  await assert.rejects(reader.loadRecent({limit:5}),/курсор/);
  assert.equal(calls,2);
  const empty=await createReader(config,{fetchImpl:async()=>json([])}).loadRecent();
  assert.equal(empty.count,0);assert.equal(empty.cursor,null);assert.equal(empty.exhausted,true);
});
