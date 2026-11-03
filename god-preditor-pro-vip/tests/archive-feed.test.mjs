import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArchiveFeed} from '../safari/src/archive-feed.mjs';

const NOW = Date.UTC(2026, 10, 3, 12);
const CONFIG = {url: 'https://archive.example.supabase.co', publishableKey: 'sb_publishable_test', table: 'luckyjet_rounds'};
const row = (seq, patch = {}) => ({id: `r-${seq}`, source_seq: String(seq), coefficient: 1.5,
  round_timestamp: new Date(NOW - Math.min(100000, Number(seq)) * 1000).toISOString(), completed: true, estimated: false, ...patch});
const response = rows => ({ok: true, status: 200, json: async () => rows});
const flush = async () => {for (let i = 0; i < 10; i++) await Promise.resolve();};
function harness(pages, options = {}) {
  const requests = [], delivered = [], states = [], scheduled = [];
  let index = 0;
  const feed = createArchiveFeed(CONFIG, {
    now: () => NOW,
    fetchImpl: async (url, init) => {
      requests.push({url: new URL(url), init});
      const value = pages[index++];
      if (value instanceof Error) throw value;
      return value?.ok === false ? value : response(value);
    },
    onPage: async (rows, meta) => delivered.push({rows, meta}),
    onStatus: state => states.push(state),
    schedule: fn => {const token = {fn, active: true}; scheduled.push(token); return token;},
    cancel: token => {if (token) token.active = false;},
    ...options,
  });
  async function next() {
    const token = scheduled.find(x => x.active);
    assert.ok(token, 'Expected a scheduled next archive page');
    token.active = false; token.fn(); await flush();
  }
  return {feed, requests, delivered, states, scheduled, next};
}

test('archive starts explicitly, reads every descending page and confirms only empty exhaustion', async () => {
  const h = harness([[row(9), row(8)], [row(7)], [row(6)], []], {pageSize: 500});
  assert.equal(h.requests.length, 0);
  assert.equal(h.feed.start(), true); assert.equal(h.feed.start(), false); await flush();
  assert.equal(h.feed.status().state, 'loading');
  assert.equal(h.feed.status().snapshotSeq, '9');
  assert.equal(h.feed.status().cursor, '8');
  await h.next();
  assert.equal(h.feed.status().state, 'loading', 'Short server-capped page is not exhaustion');
  await h.next(); await h.next();
  const status = h.feed.status();
  assert.equal(status.state, 'complete'); assert.equal(status.exhausted, true);
  assert.equal(status.totalReceived, 4); assert.equal(status.totalScanned, 4); assert.equal(status.pages, 3);
  assert.equal(status.oldestAt, NOW - 9000); assert.equal(status.latestAt, NOW - 6000);
  assert.deepEqual(h.delivered.flatMap(x => x.rows.map(r => r.id)), ['supabase:luckyjet:r-9', 'supabase:luckyjet:r-8', 'supabase:luckyjet:r-7', 'supabase:luckyjet:r-6']);
  const first = h.requests[0];
  assert.equal(first.init.method, 'GET'); assert.equal(first.init.credentials, 'omit');
  assert.equal(first.init.headers.apikey, CONFIG.publishableKey);
  assert.equal(first.url.searchParams.get('order'), 'source_seq.desc');
  assert.equal(first.url.searchParams.get('completed'), 'eq.true');
  assert.equal(first.url.searchParams.get('estimated'), 'eq.false');
  assert.equal(first.url.searchParams.get('round_timestamp'), 'not.is.null');
  assert.match(first.url.searchParams.get('select'), /completed/);
  assert.equal(h.requests[1].url.searchParams.get('and'), '(source_seq.lte.9,source_seq.lt.8)');
  assert.equal(h.requests[2].url.searchParams.get('and'), '(source_seq.lte.9,source_seq.lt.7)');
  assert.equal(h.requests[3].url.searchParams.get('and'), '(source_seq.lte.9,source_seq.lt.6)');
  assert.equal(h.delivered[0].rows[0].sourceSeq, '9');
  assert.equal(h.delivered[0].rows[0].completed, true); assert.equal(h.delivered[0].rows[0].estimated, false);
  assert.equal(h.feed.retry(), false); h.feed.stop();
});

test('older source_seq remains exact above Number safe integer and cannot move across snapshot bounds', async () => {
  const large = '9007199254740997', lower = '9007199254740996';
  const h = harness([[row(large, {round_timestamp: new Date(NOW - 1000).toISOString()}), row(lower, {round_timestamp: new Date(NOW - 2000).toISOString()})], []]);
  h.feed.start(); await flush(); await h.next();
  assert.equal(h.feed.status().snapshotSeq, large); assert.equal(h.feed.status().cursor, lower);
  assert.equal(h.requests[1].url.searchParams.get('and'), `(source_seq.lte.${large},source_seq.lt.${lower})`);
  h.feed.stop();
  for (const bad of [Number(large), '-9223372036854775809', '1.5', '1e4', null, '9223372036854775808', true]) {
    const b = harness([[row(5, {source_seq: bad})]]); b.feed.start(); await flush();
    assert.equal(b.feed.status().state, 'error', String(bad)); assert.equal(b.feed.status().retryable, false);
    assert.equal(b.delivered.length, 0); b.feed.stop();
  }
});

test('incremental cached range retains its lower bound and fixed new high water', async () => {
  const h = harness([[row(10), row(9)], [row(8)], []], {afterSeq: '7', pageSize: 1000});
  h.feed.start(); await flush(); await h.next(); await h.next();
  assert.equal(h.requests[0].url.searchParams.get('source_seq'), 'gt.7');
  assert.equal(h.requests[1].url.searchParams.get('and'), '(source_seq.gt.7,source_seq.lte.10,source_seq.lt.9)');
  assert.equal(h.feed.status().afterSeq, '7'); assert.equal(h.feed.status().snapshotSeq, '10');
  assert.equal(h.feed.status().totalReceived, 3); h.feed.stop();
  const empty = harness([[]], {afterSeq: '7'}); empty.feed.start(); await flush();
  assert.equal(empty.feed.status().state, 'complete'); assert.equal(empty.feed.status().snapshotSeq, '7');
  assert.equal(empty.feed.status().totalReceived, 0); empty.feed.stop();
  const below = harness([[row(7)]], {afterSeq: '7'}); below.feed.start(); await flush();
  assert.equal(below.feed.status().state, 'error'); assert.equal(below.delivered.length, 0); below.feed.stop();
});

test('archive excludes unconfirmed, estimated, untimed and future records without inventing timestamps', async () => {
  const h = harness([[row(10), row(9, {completed: false}), row(8, {estimated: true}),
    row(7, {round_timestamp: null}), row(6, {round_timestamp: new Date(NOW + 1000).toISOString()}),
    row(5, {coefficient: false}), row(4, {id: ''}), row(3, {coefficient: '2.25'})], []]);
  h.feed.start(); await flush(); await h.next();
  assert.equal(h.feed.status().totalScanned, 8); assert.equal(h.feed.status().totalReceived, 2);
  assert.equal(h.feed.status().rejected, 6); assert.equal(h.feed.status().cursor, '3');
  assert.deepEqual(h.delivered[0].rows.map(r => [r.id, r.coefficient, r.timestamp]), [
    ['supabase:luckyjet:r-10', 1.5, NOW - 10000], ['supabase:luckyjet:r-3', 2.25, NOW - 3000],
  ]); h.feed.stop();
});

test('duplicate IDs do not inflate history, and conflicts prevent archive completion', async () => {
  const duplicate = row(9, {id: 'same', coefficient: 100, round_timestamp: new Date(NOW - 1000).toISOString()});
  const h = harness([[duplicate, {...duplicate}], [row(8, {...duplicate, source_seq: '8'})], []]);
  h.feed.start(); await flush(); await h.next(); await h.next();
  assert.equal(h.feed.status().totalScanned, 3); assert.equal(h.feed.status().totalReceived, 1);
  assert.equal(h.feed.status().duplicates, 2); assert.equal(h.feed.status().state, 'complete'); h.feed.stop();
  const conflict = harness([[duplicate], [row(8, {...duplicate, source_seq: '8', coefficient: 200})]]);
  conflict.feed.start(); await flush(); await conflict.next();
  assert.equal(conflict.feed.status().state, 'error'); assert.equal(conflict.feed.status().retryable, false);
  assert.match(conflict.feed.status().message, /Конфликт ID/);
  assert.equal(conflict.delivered.length, 1); assert.equal(conflict.feed.status().cursor, '9');
  assert.equal(conflict.feed.retry(), false); conflict.feed.stop();
});

test('a failed page retries the same cursor without resetting accumulated history', async () => {
  const h = harness([[row(10)], Error('offline'), [row(9)], []]);
  h.feed.start(); await flush(); await h.next();
  assert.equal(h.feed.status().state, 'error'); assert.equal(h.feed.status().retryable, true);
  assert.equal(h.feed.status().cursor, '10'); assert.equal(h.feed.status().totalReceived, 1);
  assert.equal(h.feed.retry(), true); await flush();
  assert.equal(h.requests[1].url.href, h.requests[2].url.href);
  await h.next(); assert.equal(h.feed.status().state, 'complete');
  assert.equal(h.feed.status().totalReceived, 2); h.feed.stop();
});

test('awaited local commit freezes high water but does not commit progress before callback success', async () => {
  let rejectCommit, calls = 0;
  const h = harness([[row(10)], [row(10)], []], {onPage: async () => {
    calls++;
    if (calls === 1) await new Promise((_, reject) => {rejectCommit = reject;});
  }});
  h.feed.start(); await flush();
  assert.equal(h.feed.status().snapshotSeq, '10'); assert.equal(h.feed.status().cursor, null);
  assert.equal(h.feed.status().totalReceived, 0); assert.equal(h.scheduled.length, 0);
  rejectCommit(Error('local write failed')); await flush();
  assert.equal(h.feed.status().state, 'error'); assert.equal(h.feed.retry(), true); await flush();
  assert.equal(h.requests[1].url.searchParams.get('source_seq'), 'lte.10');
  assert.equal(h.feed.status().cursor, '10'); assert.equal(h.feed.status().totalReceived, 1);
  await h.next(); assert.equal(h.feed.status().state, 'complete'); h.feed.stop();
});

test('stop aborts in-flight request and prevents late page delivery or status changes', async () => {
  let resolveRequest, signal;
  const h = harness([], {fetchImpl: (url, options) => {signal = options.signal; return new Promise(resolve => {resolveRequest = resolve;});}});
  h.feed.start(); await flush(); h.feed.stop();
  const statuses = h.states.length;
  assert.equal(signal.aborted, true); assert.equal(h.feed.status().state, 'stopped');
  resolveRequest(response([row(10)])); await flush();
  assert.equal(h.delivered.length, 0); assert.equal(h.states.length, statuses);
  assert.equal(h.feed.start(), false); assert.equal(h.feed.retry(), false);
});

test('stop while local commit is pending never schedules another page or confirms completion', async () => {
  let release;
  const h = harness([[row(10)]], {onPage: () => new Promise(resolve => {release = resolve;})});
  h.feed.start(); await flush(); h.feed.stop(); release(); await flush();
  assert.equal(h.feed.status().state, 'stopped'); assert.equal(h.feed.status().totalReceived, 0);
  assert.equal(h.scheduled.length, 0); assert.equal(h.states.some(s => s.state === 'complete'), false);
});

test('malformed responses, nonadvancing cursors and out-of-order rows never become complete', async () => {
  for (const pages of [[{}], [[row(8), row(9)]], [[row(10)], [row(10)]],
    [[row(10)], [row(11)]], [[row(9), row(9, {id: 'different'})]]]) {
    const h = harness(pages); h.feed.start(); await flush();
    if (h.feed.status().state === 'loading') await h.next();
    assert.equal(h.feed.status().state, 'error'); assert.equal(h.feed.status().exhausted, false);
    assert.equal(h.feed.status().retryable, false); h.feed.stop();
  }
});

test('timeout aborts hanging transport and can retry without pretending archive is live', async () => {
  let timeout;
  const h = harness([], {
    fetchImpl: () => new Promise(() => {}),
    setRequestTimeout: fn => {timeout = fn; return 1;}, clearRequestTimeout: () => {},
  });
  h.feed.start(); await flush(); timeout(); await flush();
  assert.equal(h.feed.status().state, 'error'); assert.equal(h.feed.status().retryable, true);
  assert.equal(h.states.some(s => s.state === 'connected'), false);
  assert.equal(h.feed.status().exhausted, false); h.feed.stop();
});

test('invalid config and bounds are rejected before a request can start', () => {
  for (const patch of [{url: 'http://archive.example.supabase.co'}, {publishableKey: 'secret'}, {table: 'a;drop table'}])
    assert.throws(() => createArchiveFeed({...CONFIG, ...patch}), /HTTPS|таблицы/);
  for (const options of [{afterSeq: '-9223372036854775809'}, {afterSeq: true}, {pageSize: 0}, {pageSize: 1001}, {timeoutMs: 0}, {pageDelayMs: -1}])
    assert.throws(() => createArchiveFeed(CONFIG, options), /граница|страницы|интервалы/);
});


test('a progress observer can stop immediately without a leftover next-page timer', async () => {
  let feed;
  const h = harness([[row(10)]], {onStatus: status => {if (status.pages === 1 && status.state === 'loading') feed.stop();}});
  feed = h.feed; feed.start(); await flush();
  assert.equal(feed.status().state, 'stopped');
  assert.equal(feed.status().pages, 1); assert.equal(h.scheduled.length, 0);
});


test('historical negative source_seq values are scanned through zero without dropping old imports', async () => {
  const timestamp = new Date(NOW - 20000).toISOString();
  const h = harness([[row(1), row(0)], [row(-1, {round_timestamp: timestamp}), row(-77143, {round_timestamp: timestamp})], []]);
  h.feed.start(); await flush(); await h.next(); await h.next();
  assert.equal(h.feed.status().state, 'complete'); assert.equal(h.feed.status().totalReceived, 4);
  assert.equal(h.feed.status().snapshotSeq, '1'); assert.equal(h.feed.status().cursor, '-77143');
  assert.equal(h.requests[1].url.searchParams.get('and'), '(source_seq.lte.1,source_seq.lt.0)');
  assert.equal(h.requests[2].url.searchParams.get('and'), '(source_seq.lte.1,source_seq.lt.-77143)');
  assert.equal(h.delivered.flatMap(x => x.rows).at(-1).sourceSeq, '-77143'); h.feed.stop();
  const incremental = harness([[]], {afterSeq: '-77143'}); incremental.feed.start(); await flush();
  assert.equal(incremental.requests[0].url.searchParams.get('source_seq'), 'gt.-77143');
  assert.equal(incremental.feed.status().snapshotSeq, '-77143'); incremental.feed.stop();
});
