// Read-only historical scan, isolated from the five-second live feed. A high
// source_seq boundary fixes the scan range; it is not a database MVCC snapshot.
const COLUMNS = 'id,source_seq,coefficient,round_timestamp,completed,estimated';
const MIN_SEQUENCE = -9223372036854775808n;
const MAX_SEQUENCE = 9223372036854775807n;
const DEFAULT_PAGE_SIZE = 500;

function sequence(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return null;
    value = String(value);
  }
  if (typeof value !== 'string' || ! /^-?\d{1,19}$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed >= MIN_SEQUENCE && parsed <= MAX_SEQUENCE ? String(parsed) : null;
}

function mapRound(row, seq, now) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || row.completed !== true || row.estimated !== false ||
      typeof row.round_timestamp !== 'string' || !row.round_timestamp.trim()) return null;
  const timestamp = Date.parse(row.round_timestamp), coefficient = row.coefficient;
  const numeric = typeof coefficient === 'number' || (typeof coefficient === 'string' && coefficient.trim() !== '');
  if (!Number.isSafeInteger(timestamp) || timestamp < 946684800000 || timestamp > now || !numeric ||
      !Number.isFinite(Number(coefficient)) || Number(coefficient) < 1) return null;
  if (!['string', 'number'].includes(typeof row.id) ||
      (typeof row.id === 'number' && !Number.isSafeInteger(row.id))) return null;
  const id = String(row.id);
  const mappedId = `supabase:luckyjet:${id}`;
  if (!id.trim() || mappedId.length > 300) return null;
  return Object.freeze({id: mappedId, coefficient: Number(coefficient), timestamp,
    source: 'Supabase · LuckyJet', sourceSeq: seq, completed: true, estimated: false});
}

class ArchiveDataError extends Error {
  constructor(message) {super(message); this.name = 'ArchiveDataError';}
}

/**
 * Explicit start(), then descending keyset pages until an EMPTY page confirms
 * exhaustion. A short page is never treated as the end (PostgREST may cap it).
 * onPage is awaited before progress commits; callbacks must be idempotent by ID
 * because a failed callback can be retried with the same frozen scan range.
 * afterSeq optionally bounds an incremental scan after a completed local cache.
 */
export function createArchiveFeed(config, {
  onPage = () => {}, onStatus = () => {}, fetchImpl = fetch, now = Date.now,
  schedule = setTimeout, cancel = clearTimeout, pageSize = DEFAULT_PAGE_SIZE,
  pageDelayMs = 50, timeoutMs = 15000, setRequestTimeout = setTimeout, clearRequestTimeout = clearTimeout,
  afterSeq: rawAfterSeq = null,
} = {}) {
  const root = new URL(config.url);
  if (root.protocol !== 'https:' || !config.publishableKey?.startsWith('sb_publishable_'))
    throw Error('Архиву нужны HTTPS и publishable key Supabase');
  if (!/^[a-z_][a-z0-9_]*$/.test(config.table)) throw Error('Неверное имя таблицы архива');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw Error('Размер страницы архива: 1–1000');
  if (!Number.isFinite(pageDelayMs) || pageDelayMs < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw Error('Неверные интервалы загрузки архива');
  const afterSeq = rawAfterSeq === null ? null : sequence(rawAfterSeq);
  if (rawAfterSeq !== null && afterSeq === null) throw Error('Неверная нижняя граница архива');
  let state = 'idle', generation = 0, timer = null, request = null, snapshotSeq = null, snapshotAt = null, cursor = null;
  let totalReceived = 0, totalScanned = 0, rejected = 0, duplicates = 0, pages = 0, oldestAt = null, latestAt = null;
  let message = '', retryable = false;
  const seen = new Map();
  function status() {
    return {state, snapshotSeq, snapshotAt, afterSeq, cursor, totalReceived, totalScanned, rejected,
      duplicates, pages, oldestAt, latestAt, exhausted: state === 'complete', message, retryable};
  }
  function report() {try {onStatus(status());} catch { /* Presentation cannot undo an acknowledged page. */ }}
  function requestURL() {
    const url = new URL(`/rest/v1/${config.table}`, root);
    url.searchParams.set('select', COLUMNS);
    url.searchParams.set('completed', 'eq.true');
    url.searchParams.set('estimated', 'eq.false');
    url.searchParams.set('round_timestamp', 'not.is.null');
    url.searchParams.set('order', 'source_seq.desc');
    url.searchParams.set('limit', String(pageSize));
    const filters = [];
    if (afterSeq !== null) filters.push(`source_seq.gt.${afterSeq}`);
    if (snapshotSeq !== null) filters.push(`source_seq.lte.${snapshotSeq}`);
    if (cursor !== null) filters.push(`source_seq.lt.${cursor}`);
    if (filters.length === 1) url.searchParams.set('source_seq', filters[0].slice('source_seq.'.length));
    else if (filters.length) url.searchParams.set('and', `(${filters.join(',')})`);
    return url;
  }
  async function getPage() {
    const controller = new AbortController(); request = controller;
    let timeout, abortListener;
    const aborted = new Promise((_, reject) => {
      abortListener = () => reject(new DOMException('Aborted', 'AbortError'));
      controller.signal.addEventListener('abort', abortListener, {once: true});
      timeout = setRequestTimeout(() => controller.abort(), timeoutMs);
    });
    try {
      return await Promise.race([aborted, (async () => {
        const response = await fetchImpl(requestURL(), {method: 'GET', headers: {apikey: config.publishableKey, Accept: 'application/json'},
          signal: controller.signal, credentials: 'omit', cache: 'no-store'});
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw Error(`Архив Supabase HTTP ${response.status}${body?.code ? ' · ' + String(body.code).slice(0, 80) : ''}`);
        }
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new ArchiveDataError('Supabase вернул неверный формат архива');
        if (rows.length > pageSize) throw new ArchiveDataError('Источник превысил размер страницы архива');
        return rows;
      })()]);
    } finally {
      clearRequestTimeout(timeout); controller.signal.removeEventListener('abort', abortListener);
      if (request === controller) request = null;
    }
  }
  async function step(ticket) {
    if (state !== 'loading' || ticket !== generation) return;
    try {
      const raw = await getPage();
      if (state !== 'loading' || ticket !== generation) return;
      if (!raw.length) {
        if (snapshotSeq === null) snapshotSeq = afterSeq;
        state = 'complete'; retryable = false; message = ''; report(); return;
      }
      const batch = [], staged = new Map();
      let previousSeq = null, previousRaw = null, pageRejected = 0, pageDuplicates = 0, nextCursor = null;
      let nextOldest = oldestAt, nextLatest = latestAt;
      const pageNow = now();
      if (!Number.isSafeInteger(pageNow) || pageNow <= 0) throw new ArchiveDataError('Некорректное время при загрузке архива');
      for (const row of raw) {
        const seq = sequence(row?.source_seq);
        if (seq === null) throw new ArchiveDataError('Некорректный source_seq в архиве');
        if ((snapshotSeq !== null && BigInt(seq) > BigInt(snapshotSeq)) ||
            (afterSeq !== null && BigInt(seq) <= BigInt(afterSeq)) ||
            (cursor !== null && BigInt(seq) >= BigInt(cursor)))
          throw new ArchiveDataError('Источник нарушил границы страницы архива');
        if (previousSeq !== null && BigInt(seq) > BigInt(previousSeq))
          throw new ArchiveDataError('Источник нарушил порядок source_seq в архиве');
        if (previousSeq === seq) {
          if (row.id !== previousRaw.id || row.coefficient !== previousRaw.coefficient || row.round_timestamp !== previousRaw.round_timestamp ||
              row.completed !== previousRaw.completed || row.estimated !== previousRaw.estimated)
            throw new ArchiveDataError('Конфликт одинакового source_seq в архиве');
          pageDuplicates++; continue;
        }
        previousSeq = seq; previousRaw = row; nextCursor = seq;
        const round = mapRound(row, seq, pageNow);
        if (!round) {pageRejected++; continue;}
        const prior = staged.get(round.id) ?? seen.get(round.id);
        if (prior) {
          if (prior.coefficient !== round.coefficient || prior.timestamp !== round.timestamp)
            throw new ArchiveDataError('Конфликт ID в истории Supabase; архив не подтверждён');
          pageDuplicates++; continue;
        }
        staged.set(round.id, round); batch.push(round);
        nextOldest = nextOldest === null ? round.timestamp : Math.min(nextOldest, round.timestamp);
        nextLatest = nextLatest === null ? round.timestamp : Math.max(nextLatest, round.timestamp);
      }
      if (nextCursor === null || (cursor !== null && BigInt(nextCursor) >= BigInt(cursor)))
        throw new ArchiveDataError('Курсор архива не продвинулся');
      // Freeze the high-water boundary before onPage: retrying a failed local
      // commit must not silently move the scan range to newly inserted rows.
      if (snapshotSeq === null) snapshotSeq = sequence(raw[0].source_seq);
      const meta = Object.freeze({snapshotSeq, snapshotAt, afterSeq, cursor: nextCursor, previousCursor: cursor,
        page: pages + 1, rawCount: raw.length, totalReceived: totalReceived + batch.length,
        totalScanned: totalScanned + raw.length, rejected: rejected + pageRejected,
        duplicates: duplicates + pageDuplicates, oldestAt: nextOldest, latestAt: nextLatest});
      await onPage(Object.freeze(batch), meta);
      if (state !== 'loading' || ticket !== generation) return;
      for (const [id, round] of staged) seen.set(id, round);
      cursor = nextCursor; pages++; totalScanned += raw.length; totalReceived += batch.length;
      rejected += pageRejected; duplicates += pageDuplicates; oldestAt = nextOldest; latestAt = nextLatest;
      report();
      if (state !== 'loading' || ticket !== generation) return;
      timer = schedule(() => {timer = null; void step(ticket);}, pageDelayMs);
    } catch (error) {
      if (state !== 'loading' || ticket !== generation) return;
      state = 'error'; retryable = !(error instanceof ArchiveDataError);
      message = error?.name === 'AbortError' ? 'Загрузка архива прервана или превышено время ожидания' : String(error?.message || 'Ошибка загрузки архива');
      report();
    }
  }
  function start() {
    if (state !== 'idle') return false;
    snapshotAt = now(); state = 'loading'; generation++; report(); void step(generation); return true;
  }
  function retry() {
    if (state !== 'error' || !retryable) return false;
    state = 'loading'; message = ''; retryable = false; generation++; report(); void step(generation); return true;
  }
  function stop() {
    if (state === 'stopped') return;
    generation++; cancel(timer); timer = null; request?.abort(); request = null;
    state = 'stopped'; message = ''; retryable = false; report();
  }
  return {start, retry, stop, status};
}
