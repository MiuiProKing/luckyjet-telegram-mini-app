import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from '../safari/node_modules/fake-indexeddb/build/esm/index.js';
import {ArchiveCacheDataError, createArchiveCache} from '../safari/src/archive-cache.mjs';

const NOW = Date.UTC(2026, 10, 3, 9);
const row = (sourceSeq, extra = {}) => ({id: 'supabase:luckyjet:' + sourceSeq, coefficient: 1.5,
  timestamp: NOW - 100000 + Number(sourceSeq), sourceSeq: String(sourceSeq), completed: true, estimated: false, ...extra});
function cache(indexedDB = new IDBFactory()) {return createArchiveCache({indexedDB, name: 'test-archive', now: () => NOW});}

test('incomplete scan stays unavailable and complete snapshot returns only public normalized fields', async () => {
  const value = cache();
  assert.equal(await value.loadComplete(), null);
  await value.writePage([row(1, {secret: 'discard', element: {click: true}, source: 'discard'}), row(2)]);
  assert.equal(await value.loadComplete(), null);
  await value.markComplete({snapshotSeq: '2', savedAt: NOW});
  const saved = await value.loadComplete();
  assert.equal(saved.snapshotSeq, '2');assert.equal(saved.savedAt, NOW);assert.equal(saved.rows.length, 2);
  assert.deepEqual(Object.keys(saved.rows[0]).sort(), ['id', 'coefficient', 'timestamp', 'sourceSeq', 'completed', 'estimated'].sort());
  assert.deepEqual(saved.rows.map(x => x.sourceSeq), ['1', '2']);
  value.close();
});

test('partial newer pages cannot replace completed metadata or leak above old numeric highwater', async () => {
  const indexedDB = new IDBFactory(), value = cache(indexedDB);
  await value.writePage([row(9)]);await value.markComplete({snapshotSeq: '9', savedAt: NOW - 1000});
  await value.writePage([row(10), row(100)]);
  const before = await value.loadComplete();
  assert.deepEqual(before.rows.map(x => x.sourceSeq), ['9']);assert.equal(before.savedAt, NOW - 1000);
  value.close();
  const reopened = cache(indexedDB), persisted = await reopened.loadComplete();
  assert.equal(persisted.snapshotSeq, '9');assert.deepEqual(persisted.rows.map(x => x.sourceSeq), ['9']);
  await reopened.markComplete({snapshotSeq: '100', savedAt: NOW});
  assert.deepEqual((await reopened.loadComplete()).rows.map(x => x.sourceSeq).sort((a,b)=>Number(a)-Number(b)), ['9','10','100']);
  reopened.close();
});

test('idempotent retries and leading-zero sequences do not duplicate stored rounds', async () => {
  const value = cache();
  assert.equal(await value.writePage([row(1), row(1, {sourceSeq: '0001'})]), 1);
  await value.writePage([row(1)]);await value.markComplete({snapshotSeq: '0001', savedAt: NOW});
  assert.equal((await value.loadComplete()).rows.length, 1);
  assert.equal((await value.loadComplete()).snapshotSeq, '1');value.close();
});

test('snapshot membership preserves adjacent bigint source sequences beyond Number precision', async () => {
  const value = cache(), first = row('9007199254740992', {timestamp: NOW - 1000}),
    second = row('9007199254740993', {timestamp: NOW - 999});
  await value.writePage([first, second]);
  await value.markComplete({snapshotSeq: first.sourceSeq, savedAt: NOW});
  assert.deepEqual((await value.loadComplete()).rows, [first]);
  await value.markComplete({snapshotSeq: second.sourceSeq, savedAt: NOW});
  assert.equal((await value.loadComplete()).rows.length, 2);value.close();
});

test('historical negative signed source sequences survive IDB reload and incremental highwater filtering', async () => {
  const indexedDB = new IDBFactory(), value = cache(indexedDB);
  await value.writePage([row('-20'), row('-10'), row('-9'), row('0')]);
  await value.markComplete({snapshotSeq:'-10',savedAt:NOW});
  const sequences = saved => saved.rows.map(x=>x.sourceSeq).sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  assert.deepEqual(sequences(await value.loadComplete()),['-20','-10']);value.close();
  const reloaded = cache(indexedDB);
  assert.equal((await reloaded.loadComplete()).snapshotSeq,'-10');
  await reloaded.markComplete({snapshotSeq:'-9',savedAt:NOW});
  assert.deepEqual(sequences(await reloaded.loadComplete()),['-20','-10','-9']);
  await reloaded.markComplete({snapshotSeq:'0',savedAt:NOW});
  assert.deepEqual(sequences(await reloaded.loadComplete()),['-20','-10','-9','0']);
  await reloaded.writePage([row('-9223372036854775808',{timestamp:NOW-1000})]);
  assert.equal((await reloaded.loadComplete()).rows.some(x=>x.sourceSeq==='-9223372036854775808'),true);
  reloaded.close();
});

test('conflicting persisted IDs abort an entire page transaction and preserve the prior snapshot', async () => {
  const value = cache();
  await value.writePage([row(1)]);await value.markComplete({snapshotSeq: '1', savedAt: NOW - 1000});
  for (const patch of [{coefficient: 100}, {timestamp: NOW - 1}, {sourceSeq: '2'}]) {
    await assert.rejects(value.writePage([row(2), row(1, patch)]), error => error instanceof ArchiveCacheDataError && /конфликт ID/.test(error.message));
    await value.markComplete({snapshotSeq: '2', savedAt: NOW});
    assert.deepEqual((await value.loadComplete()).rows, [row(1)]);
  }
  value.close();
});

test('invalid pages reject before any write and cannot persist private fields or approximate/future data', async () => {
  const value = cache();
  for (const patch of [{completed:false},{estimated:true},{estimated:undefined},{timestamp:NOW+1},
    {timestamp:1700000000},{coefficient:'1.5'},{coefficient:NaN},{coefficient:.5},
    {sourceSeq:'1.5'},{sourceSeq:'-9223372036854775809'},{sourceSeq:'9223372036854775808'},{id:''}]) {
    await assert.rejects(value.writePage([row(2), row(1, patch)]), ArchiveCacheDataError);
  }
  await assert.rejects(value.writePage([row(1),row(1,{coefficient:20})]), /конфликт ID/);
  await assert.rejects(value.writePage('bad'));
  await value.markComplete({snapshotSeq:'2',savedAt:NOW});
  assert.deepEqual((await value.loadComplete()).rows, []);value.close();
});

test('snapshot markers cannot roll back or use malformed/future timestamps', async () => {
  const value = cache();
  await value.writePage([row(2)]);await value.markComplete({snapshotSeq:'2',savedAt:NOW});
  await assert.rejects(value.markComplete({snapshotSeq:'1',savedAt:NOW}), /откатиться/);
  for (const savedAt of [NOW+1, NaN, 123, 'bad']) await assert.rejects(value.markComplete({snapshotSeq:'3',savedAt}));
  assert.equal((await value.loadComplete()).snapshotSeq, '2');value.close();
});

test('clear atomically removes both data and completed marker and allows intentional full refresh', async () => {
  const value = cache();
  await value.writePage([row(1)]);await value.markComplete({snapshotSeq:'1',savedAt:NOW});
  await value.clear();assert.equal(await value.loadComplete(), null);
  await value.writePage([row(1,{coefficient:200})]);await value.markComplete({snapshotSeq:'1',savedAt:NOW});
  assert.equal((await value.loadComplete()).rows[0].coefficient,200);value.close();
});

test('unavailable, synchronous open failures, quota errors and closed caches reject for caller fallback', async () => {
  await assert.rejects(cache(null).loadComplete(), /IndexedDB недоступна/);
  await assert.rejects(cache({open(){throw new Error('quota');}}).loadComplete(), /quota/);
  const indexedDB = new IDBFactory(), value = cache(indexedDB);
  await value.writePage([row(1)]);
  // Inject an actual transaction failure after open, with IndexedDB's put API.
  const original = indexedDB.open.bind(indexedDB);
  const db = await new Promise((resolve,reject)=>{const r=original('test-archive');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const prototype = Object.getPrototypeOf(db.transaction('rounds','readwrite').objectStore('rounds'));
  const put = prototype.put;
  try {
    prototype.put = function(){throw new DOMException('Quota exceeded','QuotaExceededError');};
    await assert.rejects(value.writePage([row(2)]), error => error.name === 'QuotaExceededError' && !(error instanceof ArchiveCacheDataError));
  } finally {prototype.put=put;db.close();}
  value.close();await assert.rejects(value.loadComplete(), /закрыт/);
});

test('blocked or unresponsive opens reject and a late success closes its abandoned connection', async () => {
  for (const blocked of [true, false]) {
    const request = {}, indexedDB = {open(){
      if (blocked) queueMicrotask(() => request.onblocked());
      return request;
    }};
    const value = createArchiveCache({indexedDB, name:'delayed', now:()=>NOW, timeoutMs:10});
    await assert.rejects(value.loadComplete(), blocked ? /заблокирован/ : /вовремя/);
    let closed = 0;
    request.result = {close(){closed++;}};
    request.onsuccess();
    assert.equal(closed,1);value.close();
  }
});
