import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArchiveService} from '../safari/src/archive-service.mjs';

const NOW = Date.UTC(2026, 10, 3, 8);
const CONFIG = {url: 'https://example.supabase.co', table: 'luckyjet_rounds', publishableKey: 'sb_publishable_test'};
const row = (seq, coefficient = 1.5) => ({id: 'round:' + seq, sourceSeq: String(seq),
  coefficient, timestamp: NOW - 60_000 + Number(seq) * 100, completed: true, estimated: false});
const corrupt = message => Object.assign(Error(message), {name: 'ArchiveCacheDataError'});
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail('Service did not reach expected state');
}

function memoryCache(initial = null) {
  const data = new Map((initial?.rows ?? []).map(value => [value.id, structuredClone(value)]));
  let meta = initial ? {snapshotSeq: initial.snapshotSeq, savedAt: initial.savedAt} : null;
  const calls = {load: 0, write: 0, mark: 0, clear: 0, close: 0};
  return {
    calls, data,
    async loadComplete() {
      calls.load++;
      return meta ? {...meta, rows: [...data.values()].filter(value => BigInt(value.sourceSeq) <= BigInt(meta.snapshotSeq)).map(value => structuredClone(value))} : null;
    },
    async writePage(rows) {
      calls.write++;
      for (const value of rows) {
        const prior = data.get(value.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(value)) throw corrupt('Conflicting cached row');
        data.set(value.id, structuredClone(value));
      }
    },
    async markComplete(value) {calls.mark++; meta = {...value};},
    async clear() {calls.clear++; data.clear(); meta = null;},
    close() {calls.close++;},
  };
}

function setup({cache = memoryCache(), buildSummary, onChange = () => {}, now = () => NOW} = {}) {
  const feeds = [], changes = [], builds = [];
  const service = createArchiveService({config: CONFIG, cache, now,
    buildSummary: buildSummary ?? ((rows, at) => {builds.push({rows: structuredClone(rows), at}); return {count: rows.length, ids: rows.map(value => value.id)};}),
    onChange(state) {changes.push(state); onChange(state);},
    createFeed(config, options) {
      assert.equal(config, CONFIG);
      let state = 'idle', stopped = false;
      const feed = {
        options,
        start() {state = 'loading'; options.onStatus({state}); return true;},
        async page(rows) {await options.onPage(rows); if (!stopped) options.onStatus({state: 'loading', totalReceived: rows.length});},
        complete(snapshotSeq, exhausted = true) {state = 'complete'; options.onStatus({state, snapshotSeq, exhausted});},
        error(message = 'network error') {state = 'error'; options.onStatus({state, message, retryable: true});},
        retry() {if (state !== 'error') return false; state = 'loading'; options.onStatus({state}); return true;},
        stop() {state = 'stopped'; stopped = true; options.onStatus({state});},
      };
      feeds.push(feed); return feed;
    },
  });
  return {service, feeds, cache, changes, builds};
}

test('publishes only exhausted full snapshots and getRows returns isolated completed records', async () => {
  const {service, feeds, cache, changes} = setup();
  assert.equal(await service.getRows(), null);
  assert.equal(await service.start(), true);
  assert.equal(await service.start(), false);
  assert.equal(feeds[0].options.afterSeq, null);
  await feeds[0].page([row(1), row(2, 100)]);
  assert.equal(service.state.summary, null);
  assert.equal(service.state.count, 0);
  assert.equal(service.state.loadedCount, 2);
  assert.equal(cache.calls.mark, 0);
  assert.equal(await service.getRows(), null);
  feeds[0].complete('2');
  await until(() => service.state.status === 'complete');
  assert.equal(service.state.count, 2);
  assert.equal(service.state.snapshotSeq, '2');
  assert.equal(cache.calls.mark, 1);
  assert.ok(changes.every(state => state.status === 'complete' || state.count === 0));
  const received = await service.getRows();
  assert.deepEqual(received, [row(1), row(2, 100)]);
  received[0].coefficient = 999;
  assert.equal((await service.getRows())[0].coefficient, 1.5);
  service.stop();
  assert.equal(await service.getRows(), null);
  assert.equal(cache.calls.close, 1);
});

test('cached signed watermark resumes incrementally; partial pages remain outside getRows', async () => {
  const oldRows = [row(-5), row(-3, 100)], cache = memoryCache({rows: oldRows, snapshotSeq: '-3', savedAt: NOW - 1000});
  const {service, feeds} = setup({cache});
  await service.start();
  assert.equal(feeds[0].options.afterSeq, '-3');
  assert.deepEqual(await service.getRows(), oldRows);
  await feeds[0].page([row(-1)]);
  assert.equal(service.state.count, 2);
  assert.equal(service.state.loadedCount, 3);
  assert.deepEqual(await service.getRows(), oldRows);
  feeds[0].complete('-1');
  await until(() => service.state.status === 'complete');
  assert.deepEqual(await service.getRows(), [...oldRows, row(-1)]);
  assert.equal(service.state.snapshotSeq, '-1');
  service.stop();
});

test('empty unchanged incremental scans reuse the completed summary without re-fitting', async () => {
  const cache = memoryCache({rows: [row(1)], snapshotSeq: '1', savedAt: NOW - 1000});
  const {service, feeds, builds} = setup({cache});
  await service.start();
  const first = service.state.summary;
  assert.equal(builds.length, 1);
  feeds[0].complete('1');
  await until(() => service.state.status === 'complete');
  assert.equal(service.state.summary, first);
  assert.equal(builds.length, 1);
  await service.refresh();
  assert.equal(builds.length, 1);
  feeds[1].complete('1');
  await until(() => service.state.status === 'complete');
  assert.equal(builds.length, 1);
  service.stop();
});

test('quota errors preserve a complete volatile copy and allow later incremental reads', async () => {
  const cache = memoryCache();
  cache.writePage = async () => {throw Object.assign(Error('quota exhausted'), {name: 'QuotaExceededError'});};
  const {service, feeds} = setup({cache});
  await service.start();
  await feeds[0].page([row(-2), row(1, 100)]);
  feeds[0].complete('1');
  await until(() => service.state.status === 'complete');
  assert.match(service.state.cacheWarning, /quota exhausted/);
  assert.deepEqual(await service.getRows(), [row(-2), row(1, 100)]);
  assert.equal(cache.calls.mark, 0);
  await service.refresh();
  assert.equal(feeds[1].options.afterSeq, '1');
  await feeds[1].page([row(2)]);
  assert.deepEqual(await service.getRows(), [row(-2), row(1, 100)]);
  feeds[1].complete('2');
  await until(() => service.state.status === 'complete');
  assert.equal((await service.getRows()).length, 3);
  service.stop();
});

test('cache open failures cause a fresh volatile scan, never a fake cached baseline', async () => {
  const cache = memoryCache();
  cache.loadComplete = async () => {throw corrupt('corrupt cache metadata');};
  const {service, feeds} = setup({cache});
  await service.start();
  assert.equal(service.state.summary, null);
  assert.equal(feeds[0].options.afterSeq, null);
  assert.match(service.state.cacheWarning, /corrupt cache/);
  await feeds[0].page([row(1)]);
  feeds[0].complete('1');
  await until(() => service.state.status === 'complete');
  assert.deepEqual(await service.getRows(), [row(1)]);
  service.stop();
});

test('conflicting data and cache-write corruption are not downgraded to quota fallback', async () => {
  for (const cachedFailure of [false, true]) {
    const cache = memoryCache({rows: [row(1)], snapshotSeq: '1', savedAt: NOW - 1000});
    if (cachedFailure) cache.writePage = async () => {throw corrupt('stored ID conflict');};
    const {service, feeds} = setup({cache});
    await service.start();
    await assert.rejects(feeds[0].page(cachedFailure ? [row(2)] : [row(1, 777)]), /conflict|конфликт/i);
    feeds[0].error('page rejected');
    assert.equal(service.state.status, 'error');
    assert.equal(service.retry(), false);
    assert.deepEqual(await service.getRows(), [row(1)]);
    assert.equal(cache.calls.mark, 0);
    service.stop();
  }
});

test('network errors keep the completed baseline, and retry resumes the same feed', async () => {
  const cache = memoryCache({rows: [row(1)], snapshotSeq: '1', savedAt: NOW - 1000});
  const {service, feeds} = setup({cache});
  await service.start();
  const baseline = service.state.summary;
  await feeds[0].page([row(2)]);
  feeds[0].error();
  assert.equal(service.state.loading, false);
  assert.equal(service.state.summary, baseline);
  assert.deepEqual(await service.getRows(), [row(1)]);
  assert.equal(service.retry(), true);
  assert.equal(feeds.length, 1);
  feeds[0].complete('2');
  await until(() => service.state.status === 'complete');
  assert.deepEqual(await service.getRows(), [row(1), row(2)]);
  service.stop();
});

test('unconfirmed exhaustion and out-of-range completion watermarks cannot publish', async () => {
  for (const [watermark, exhausted] of [['2', false], ['1', true], [null, true]]) {
    const {service, feeds, cache} = setup();
    await service.start();
    await feeds[0].page([row(2)]);
    feeds[0].complete(watermark, exhausted);
    await until(() => service.state.status === 'error');
    assert.equal(service.state.summary, null);
    assert.equal(await service.getRows(), null);
    assert.equal(cache.calls.mark, 0);
    service.stop();
  }
});

test('empty full history is a genuine completed empty snapshot, not a missing load', async () => {
  const {service, feeds} = setup({cache: null});
  await service.start();
  feeds[0].complete(null);
  await until(() => service.state.status === 'complete');
  assert.equal(service.state.count, 0);
  assert.deepEqual(await service.getRows(), []);
  service.stop();
});

test('explicit full refresh clears the old watermark and rebuilds despite equal row counts', async () => {
  const cache = memoryCache({rows: [row(1)], snapshotSeq: '1', savedAt: NOW - 1000});
  const {service, feeds, builds} = setup({cache});
  await service.start();
  feeds[0].complete('1');
  await until(() => service.state.status === 'complete');
  assert.equal(builds.length, 1);
  await service.refresh({full: true});
  assert.equal(cache.calls.clear, 1);
  assert.equal(feeds[1].options.afterSeq, null);
  assert.equal(await service.getRows(), null);
  await feeds[1].page([row(-5, 20)]);
  feeds[1].complete('-5');
  await until(() => service.state.status === 'complete');
  assert.equal(builds.length, 2);
  assert.deepEqual(await service.getRows(), [row(-5, 20)]);
  service.stop();
});

test('getRows rejects mismatched snapshots and cache errors without leaking staging rows', async () => {
  const cache = memoryCache({rows: [row(1)], snapshotSeq: '1', savedAt: NOW - 1000});
  const {service} = setup({cache});
  await service.start();
  cache.loadComplete = async () => ({rows: [row(1), row(2)], snapshotSeq: '2', savedAt: NOW});
  assert.equal(await service.getRows(), null);
  cache.loadComplete = async () => {throw Error('cache unavailable');};
  assert.equal(await service.getRows(), null);
  assert.match(service.state.cacheWarning, /cache unavailable/);
  assert.equal(service.state.snapshotSeq, '1');
  service.stop();
});

test('getRows cannot return a snapshot after a concurrent refresh or stop', async () => {
  for (const action of ['refresh', 'stop']) {
    const cache = memoryCache({rows: [row(1)], snapshotSeq: '1', savedAt: NOW - 1000});
    const {service} = setup({cache});
    await service.start();
    const delayed = deferred();
    cache.loadComplete = () => delayed.promise;
    const result = service.getRows();
    if (action === 'refresh') {
      cache.loadComplete = async () => ({rows: [row(1)], snapshotSeq: '1', savedAt: NOW - 1000});
      await service.refresh({full: true});
    } else service.stop();
    delayed.resolve({rows: [row(1)], snapshotSeq: '1', savedAt: NOW - 1000});
    assert.equal(await result, null);
    service.stop();
  }
});

test('stop during cache read, page write, or asynchronous summary build never publishes late results', async () => {
  for (const phase of ['cache', 'write', 'build']) {
    const wait = deferred(), cache = memoryCache();
    if (phase === 'cache') cache.loadComplete = () => wait.promise;
    if (phase === 'write') cache.writePage = () => wait.promise;
    const options = {cache};
    if (phase === 'build') options.buildSummary = () => wait.promise;
    const {service, feeds, changes} = setup(options);
    const start = service.start();
    if (phase !== 'cache') await start;
    let page = null;
    if (phase === 'write') page = feeds[0].page([row(1)]);
    if (phase === 'build') {await feeds[0].page([row(1)]); feeds[0].complete('1'); await until(() => service.state.status === 'processing');}
    const notifications = changes.length;
    service.stop();
    wait.resolve(phase === 'cache' ? null : {count: 1});
    await start; await page;
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(service.state.status, 'stopped');
    assert.equal(changes.length, notifications);
    assert.equal(cache.calls.mark, 0);
    assert.equal(await service.getRows(), null);
  }
});

test('invalid cached savedAt, rows, or rollback clocks cannot become completed snapshots', async () => {
  for (const payload of [
    {rows: [row(1)], snapshotSeq: '1', savedAt: NOW + 1},
    {rows: [row(2)], snapshotSeq: '1', savedAt: NOW - 1},
    {rows: [row(1), row(1, 500)], snapshotSeq: '1', savedAt: NOW - 1},
  ]) {
    const cache = memoryCache(); cache.loadComplete = async () => payload;
    const {service, feeds} = setup({cache});
    assert.equal(await service.start(), false);
    assert.equal(service.state.status, 'error');
    assert.equal(feeds.length, 0);
    assert.equal(service.state.summary, null);
    service.stop();
  }
  const {service, feeds} = setup({cache: null, now: () => NaN});
  await service.start();
  await assert.rejects(feeds[0].page([row(1)]), /время/);
  service.stop();
});
