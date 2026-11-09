const COLUMNS = 'id,source_seq,coefficient,round_timestamp,estimated,completed';

export function sequence(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const s = String(value);
  return /^-?\d+$/.test(s) ? String(BigInt(s)) : null;
}

export function mapRound(row, now = Date.now()) {
  const timestamp = Date.parse(row?.round_timestamp), coefficient = Number(row?.coefficient), seq = sequence(row?.source_seq);
  if (!row?.id || row.estimated !== false || row.completed !== true || !seq || !Number.isFinite(timestamp) ||
      timestamp <= 0 || timestamp > now || !Number.isFinite(coefficient) || coefficient < 1) return null;
  return {id: String(row.id), seq, coefficient, timestamp};
}

export function readLivePage(rows, previousCursor = null, now = Date.now()) {
  const sorted = [...rows].sort((a, b) => {
    const x = sequence(a.source_seq), y = sequence(b.source_seq);
    if (!x || !y) throw Error('Нет номера раунда в ответе Supabase');
    return BigInt(x) < BigInt(y) ? -1 : BigInt(x) > BigInt(y) ? 1 : 0;
  });
  let cursor = previousCursor;
  const rounds = [];
  for (const row of sorted) {
    if (Date.parse(row.round_timestamp) > now) break;
    const value = sequence(row.source_seq);
    if (cursor !== null && BigInt(value) <= BigInt(cursor)) continue;
    const mapped = mapRound(row, now);
    if (mapped) rounds.push(mapped);
    cursor = value;
  }
  return {rounds, cursor};
}

export function createReader(config, {fetchImpl = fetch, now = Date.now, timeoutMs = 15000} = {}) {
  const root = new URL(config.url);
  if (root.protocol !== 'https:' || !config.publishableKey?.startsWith('sb_publishable_') ||
      !/^[a-z_][a-z0-9_]*$/.test(config.table)) throw Error('Неверная публичная конфигурация Supabase');

  async function page({minimum = null, after = null, before = null, ascending = false, limit = 1000, signal} = {}) {
    const url = new URL(`/rest/v1/${config.table}`, root);
    const q = url.searchParams;
    q.set('select', COLUMNS); q.set('completed', 'eq.true'); q.set('estimated', 'eq.false');
    q.set('round_timestamp', 'not.is.null'); q.set('order', `source_seq.${ascending ? 'asc' : 'desc'}`);
    q.set('limit', String(limit));
    if (minimum !== null) q.set('coefficient', `gte.${minimum}`);
    for (const [value, operator] of [[after, 'gt'], [before, 'lt']]) {
      if (value !== null) {
        if (!sequence(value)) throw Error('Неверный курсор истории');
        q.append('source_seq', `${operator}.${value}`);
      }
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchImpl(url, {headers: {apikey: config.publishableKey, Accept: 'application/json'},
        credentials: 'omit', cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw Error(`Supabase: HTTP ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw Error('Не удалось прочитать историю Supabase');
      return rows;
    } finally {clearTimeout(timer); signal?.removeEventListener('abort', abort);}
  }

  async function loadHistory({after = null, onBatch = () => {}, signal} = {}) {
    let before = null, highWater = after, futureFloor = null, count = 0;
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const rows = await page({minimum: 10, after, before, signal});
      if (!rows.length) break;
      const seqs = rows.map(row => sequence(row.source_seq));
      if (seqs.some(x => !x)) throw Error('В истории отсутствует номер раунда');
      const oldest = seqs.reduce((a, b) => BigInt(a) < BigInt(b) ? a : b);
      const newest = seqs.reduce((a, b) => BigInt(a) > BigInt(b) ? a : b);
      if ((before !== null && BigInt(newest) >= BigInt(before)) ||
          (after !== null && BigInt(oldest) <= BigInt(after))) throw Error('Сервер не применил курсор истории');
      if (highWater === null || BigInt(newest) > BigInt(highWater)) highWater = newest;
      const batch = [];
      for (const row of rows) {
        if (Date.parse(row.round_timestamp) > now()) {
          const s = sequence(row.source_seq);
          if (futureFloor === null || BigInt(s) < BigInt(futureFloor)) futureFloor = s;
        }
        const mapped = mapRound(row, now());
        if (mapped && mapped.coefficient >= 10) batch.push(mapped);
      }
      count += batch.length;
      await onBatch(batch, {count});
      before = oldest;
      // Continue until an empty page: server row caps must not truncate history.
    }
    if (futureFloor !== null && highWater !== null && BigInt(highWater) >= BigInt(futureFloor)) {
      const safe = BigInt(futureFloor) - 1n;
      highWater = String(safe);
    }
    return {highWater, count, syncedAt: now()};
  }
  return {page, loadHistory};
}

// Only completed historical coefficients are cached. No authentication session,
// password, service-role key or provider token is stored by this page.
const CACHE_KEY = 'golden-history-v1';
function openCache() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(Error('No IndexedDB'));
    const request = indexedDB.open('god-golden-history', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Cache is blocked'));
  });
}

export async function readCache(identity, now = Date.now()) {
  let db;
  try {
    db = await openCache();
    const data = await new Promise((resolve, reject) => {
      const request = db.transaction('state').objectStore('state').get(CACHE_KEY);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    if (!data || data.identity !== identity || data.version !== 1 || !data.complete || !Array.isArray(data.rows) ||
        !Number.isFinite(data.syncedAt) || data.syncedAt > now || now - data.syncedAt > 86400000 ||
        (data.highWater !== null && !sequence(data.highWater))) return null;
    return data;
  } catch {return null;} finally {db?.close();}
}

export async function writeCache(data) {
  let db;
  try {
    db = await openCache();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('state', 'readwrite');
      transaction.objectStore('state').put({...data, version: 1}, CACHE_KEY);
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
    return true;
  } catch {return false;} finally {db?.close();}
}
