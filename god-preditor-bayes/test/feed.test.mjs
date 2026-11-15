import test from 'node:test';
import assert from 'node:assert/strict';
import {LuckyFeed, RoundStore, normalizeRound} from '../feed.mjs';

const now = Date.now();
const raw = (id, updates = {}) => ({id: 'r' + id, coefficient: 2,
  round_timestamp: new Date(now - (100 - id) * 1000).toISOString(),
  estimated: false, feed_order: id, ...updates});
const config = {SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'sb_publishable_test',
  TABLE: 'luckyjet_classic_history', PAGE_SIZE: 2, POLL_MS: 50000};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await sleep(5); }
  throw Error('test timed out');
}
function response(rows) { return new Response(JSON.stringify(rows), {status: 200, headers: {'Content-Type': 'application/json'}}); }
function api(getRows, calls = []) {
  return async (url, options) => {
    const q = new URL(url).searchParams; calls.push({url, options});
    const condition = q.get('feed_order'), ascending = q.get('order') === 'feed_order.asc';
    let rows = [...getRows()];
    if (condition?.startsWith('lt.')) rows = rows.filter(r => r.feed_order < Number(condition.slice(3)));
    if (condition?.startsWith('gt.')) rows = rows.filter(r => r.feed_order > Number(condition.slice(3)));
    rows.sort((a, b) => ascending ? a.feed_order - b.feed_order : b.feed_order - a.feed_order);
    return response(rows.slice(0, Number(q.get('limit'))));
  };
}

test('normalization retains source identity and exact/estimated flags', () => {
  assert.equal(normalizeRound(raw(1)).completed, true);
  assert.equal(normalizeRound(raw(1)).estimated, false);
  assert.equal(normalizeRound(raw(1, {estimated: true})).estimated, true);
  for (const invalid of [raw(1, {feed_order: null}), raw(1, {coefficient: Infinity}),
    raw(1, {id: ''}), raw(1, {round_timestamp: 'bad'})]) assert.equal(normalizeRound(invalid), null);
});

test('equal X with different IDs survive; repeated IDs deduplicate', () => {
  const store = new RoundStore(); store.ingest([raw(3), raw(1), raw(2), raw(2)]);
  assert.equal(store.size, 3);
  assert.deepEqual(store.rounds.map(r => r.id), ['r1', 'r2', 'r3']);
});

test('conflicting observations quarantine ID instead of choosing profitable value', () => {
  const store = new RoundStore(); store.ingest([raw(1), raw(1, {coefficient: 500}), raw(2)]);
  assert.equal(store.size, 1); assert.ok(store.conflicts.has('r1'));
  store.ingest([raw(1)]); assert.equal(store.size, 1);
});

test('late archival page cannot downgrade exact live timestamps', () => {
  const store = new RoundStore(); store.ingest([raw(1)]);
  store.ingest([raw(1, {estimated: true, round_timestamp: new Date(now).toISOString()})]);
  assert.equal(store.rounds[0].estimated, false);
  const upgraded = new RoundStore(); upgraded.ingest([raw(1, {estimated: true})]);
  upgraded.ingest([raw(1)]); assert.equal(upgraded.rounds[0].estimated, false);
});

test('full archive uses descending keyset while live uses separate ascending cursor', async () => {
  const rows = Array.from({length: 8}, (_, i) => raw(i + 1)), calls = [];
  const feed = new LuckyFeed(config, {cache: false, fetchImpl: api(() => rows, calls)});
  try {
    await feed.start(); await until(() => feed.meta.complete);
    assert.equal(feed.rounds.length, 8);
    assert.ok(calls.some(c => new URL(c.url).searchParams.get('feed_order') === 'lt.7'));
    assert.ok(calls.some(c => new URL(c.url).searchParams.get('feed_order') === 'gt.8'));
    for (const call of calls) {
      assert.equal(call.options.headers.apikey, config.SUPABASE_KEY);
      assert.equal(call.options.headers.Authorization, undefined);
      assert.ok(!call.url.includes(config.SUPABASE_KEY));
    }
  } finally { feed.stop(); }
});

test('restart fills the gap between complete old cache and fresh head', async () => {
  const dataset = Array.from({length: 8}, (_, i) => raw(i + 1));
  const cache = {open: async () => {}, read: async () => ({rows: [normalizeRound(raw(1)), normalizeRound(raw(2))],
    state: {archiveComplete: true, archiveBefore: 1, liveAfter: 2, cutoff: now - 91 * 86400000}}), put: async () => {}};
  const feed = new LuckyFeed(config, {cache, fetchImpl: api(() => dataset)});
  try {
    await feed.start(); await until(() => feed.meta.complete && feed.rounds.length === 8);
    assert.deepEqual(feed.rounds.map(r => r.order), [1, 2, 3, 4, 5, 6, 7, 8]);
  } finally { feed.stop(); }
});

test('live arrivals during archive load are retained after older pages complete', async () => {
  const dataset = Array.from({length: 8}, (_, i) => raw(i + 1));
  const mock = api(() => dataset); let release, blocked = false;
  const fetchImpl = async (url, options) => {
    if (new URL(url).searchParams.get('feed_order') === 'lt.7' && !blocked) {
      blocked = true; await new Promise(resolve => { release = resolve; });
    }
    return mock(url, options);
  };
  const feed = new LuckyFeed(config, {cache: false, fetchImpl});
  try {
    await feed.start(); await until(() => blocked && !feed.polling);
    dataset.push(raw(9), raw(10)); await feed.poll(); release();
    await until(() => feed.meta.complete && feed.rounds.length === 10);
    assert.equal(feed.rounds.at(-1).id, 'r10');
  } finally { release?.(); feed.stop(); }
});

test('unavailable cache does not prevent actual network history', async () => {
  const feed = new LuckyFeed(config, {cache: {open: async () => { throw Error('quota'); }}, fetchImpl: api(() => [raw(1)])});
  try { await feed.start(); assert.equal(feed.rounds.length, 1); assert.equal(feed.meta.phase, 'live'); }
  finally { feed.stop(); }
});

test('browser host fetch is invoked with the global receiver', async () => {
  const browserFetch = async function () {
    assert.equal(this, globalThis, 'Window.fetch rejects a feed instance as its receiver');
    return response([raw(1)]);
  };
  const feed = new LuckyFeed(config, {cache: false, fetchImpl: browserFetch});
  try { assert.equal((await feed.request()).length, 1); }
  finally { feed.stop(); }
});

test('non-decreasing/crossed page cursor is rejected rather than silently skipped', async () => {
  const feed = new LuckyFeed(config, {cache: false, fetchImpl: async () => response([raw(5)])});
  await assert.rejects(feed.request({before: 5}), /порядок/);
  feed.stop();
});

test('secret keys cannot be embedded as a browser feed configuration', () => {
  assert.throws(() => new LuckyFeed({...config, SUPABASE_KEY: 'sb_secret_no'}), /публичный/);
  const payload = Buffer.from(JSON.stringify({role: 'service_role'})).toString('base64url');
  assert.throws(() => new LuckyFeed({...config, SUPABASE_KEY: 'eyJ.' + payload + '.test'}), /Секретный/);
});

test('stopping aborts ongoing fetch and prevents subsequent notifications', async () => {
  let notifications = 0;
  const feed = new LuckyFeed(config, {cache: false, onUpdate: () => notifications++,
    fetchImpl: async (_url, {signal}) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {once: true});
    })});
  const started = feed.start(); await sleep(5); feed.stop(); await started;
  assert.equal(notifications, 0);
});
