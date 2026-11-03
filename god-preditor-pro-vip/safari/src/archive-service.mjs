import {createArchiveFeed} from './archive-feed.mjs';
import {buildRareArchiveSummary} from './archive-history.mjs';

const MAX_SEQUENCE = 9223372036854775807n;
const MIN_SEQUENCE = -9223372036854775808n;
const MIN_TIMESTAMP = 946684800000;
const MAX_TIMESTAMP = 8640000000000000;
const rowFields = ['id', 'coefficient', 'timestamp', 'sourceSeq', 'completed', 'estimated'];
const dataError = message => Object.assign(new Error(message), {name: 'ArchiveCacheDataError'});
const sameRow = (left, right) => rowFields.every(field => left[field] === right[field]);
const timestamp = value => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP;

function checkedTime(value) {
  if (!timestamp(value)) throw dataError('Архив: неверное время устройства');
  return value;
}

function sequence(value) {
  if (typeof value !== 'string' || !/^-?\d{1,19}$/.test(value) || BigInt(value) > MAX_SEQUENCE || BigInt(value) < MIN_SEQUENCE)
    throw dataError('Архив: неверная граница sourceSeq');
  return BigInt(value).toString();
}

function cleanRow(value, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.id !== 'string' || !value.id.trim() || value.id.length > 300 ||
      typeof value.coefficient !== 'number' || !Number.isFinite(value.coefficient) || value.coefficient < 1 ||
      !timestamp(value.timestamp) || value.timestamp > at ||
      value.completed !== true || value.estimated !== false)
    throw dataError('Архив: неверный подтверждённый раунд');
  return {id: value.id, coefficient: value.coefficient, timestamp: value.timestamp,
    sourceSeq: sequence(value.sourceSeq), completed: true, estimated: false};
}

function cleanSnapshot(value, at) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.rows) ||
      !timestamp(value.savedAt) || value.savedAt > at)
    throw dataError('Архив: повреждён сохранённый снимок');
  const snapshotSeq = sequence(value.snapshotSeq), rows = new Map();
  for (const input of value.rows) {
    const row = cleanRow(input, at), prior = rows.get(row.id);
    if (BigInt(row.sourceSeq) > BigInt(snapshotSeq) || (prior && !sameRow(prior, row)))
      throw dataError('Архив: повреждена граница сохранённой истории');
    rows.set(row.id, row);
  }
  return {rows, snapshotSeq, savedAt: value.savedAt};
}

// Only complete archive snapshots become a statistical baseline. Archive network
// progress never changes live-feed freshness or the betting/cashout controllers.
export function createArchiveService({config, fetchImpl, cache = null, onChange = () => {}, now = Date.now,
  createFeed = createArchiveFeed, buildSummary = buildRareArchiveSummary} = {}) {
  let stopped = false, initialized = false, generation = 0, feed = null, records = null;
  let volatileComplete = null, cacheAvailable = !!cache;
  let summary = null, count = 0, snapshotSeq = null, savedAt = null;
  let status = 'idle', loading = false, progress = null, error = '', cacheWarning = cache ? '' : 'Кэш недоступен; архив хранится в памяти этой вкладки';
  let finishing = null, dataFailure = false;

  function state() {
    return {status, loading, summary, count, loadedCount: records?.size ?? count,
      snapshotSeq, savedAt, progress: progress ? {...progress} : null, error, cacheWarning};
  }
  function notify() {
    if (!stopped) {try {onChange(state());} catch { /* Presentation cannot fail a scan. */ }}
  }
  const current = ticket => !stopped && ticket === generation;
  function unavailable(reason) {
    cacheAvailable = false;
    cacheWarning = 'Кэш архива недоступен; история хранится только до закрытия страницы' +
      (reason?.message ? ' · ' + String(reason.message).slice(0, 180) : '');
  }
  function addPage(input, at) {
    if (!Array.isArray(input)) throw dataError('Архив: страница должна быть массивом');
    const staged = new Map();
    for (const value of input) {
      const row = cleanRow(value, at), prior = staged.get(row.id) ?? records?.get(row.id);
      if (prior && !sameRow(prior, row)) throw dataError('Архив: конфликт ID в полученной истории');
      staged.set(row.id, row);
    }
    return staged;
  }
  function fail(ticket, failure) {
    if (!current(ticket)) return;
    if (failure?.name === 'ArchiveCacheDataError') dataFailure = true;
    loading = false; status = 'error'; error = String(failure?.message || failure || 'Ошибка архива'); notify();
  }

  async function finish(ticket, incoming, full) {
    if (!current(ticket) || incoming.exhausted !== true) return;
    try {
      const nextSeq = incoming.snapshotSeq === null ? null : sequence(incoming.snapshotSeq);
      if (nextSeq === null ? records.size > 0 :
        [...records.values()].some(row => BigInt(row.sourceSeq) > BigInt(nextSeq)))
        throw dataError('Архив: граница полного снимка не соответствует истории');
      status = 'processing'; notify();
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!current(ticket)) return;
      const at = checkedTime(now());
      const unchangedSnapshot = !full && summary && snapshotSeq === nextSeq && count === records.size;
      const nextSummary = unchangedSnapshot ? summary : await buildSummary([...records.values()], at);
      if (!current(ticket)) return;
      if (!nextSummary || typeof nextSummary !== 'object') throw dataError('Архив: анализ полного снимка недоступен');
      if (cacheAvailable && nextSeq !== null) {
        try {await cache.markComplete({snapshotSeq: nextSeq, savedAt: at});}
        catch (failure) {
          if (failure?.name === 'ArchiveCacheDataError') throw failure;
          unavailable(failure);
        }
      }
      if (!current(ticket)) return;
      summary = nextSummary; count = records.size; snapshotSeq = nextSeq; savedAt = at;
      // The compact model summary remains in memory; full public records reside
      // in IndexedDB. A volatile fallback must retain its only complete copy.
      volatileComplete = cacheAvailable && nextSeq !== null ? null : records;
      records = null; status = 'complete'; loading = false; error = ''; notify();
    } catch (failure) {fail(ticket, failure);}
  }

  async function begin(full = false) {
    if (stopped || (loading && !full)) return false;
    const ticket = ++generation;
    feed?.stop(); feed = null; finishing = null;
    loading = true; status = 'cache-loading'; error = ''; progress = null; dataFailure = false; notify();
    let base = null;
    try {
      if (full) {
        // An explicit full refresh may recover a previously unavailable or
        // corrupt cache; it discards its incomplete pages and old watermark.
        cacheAvailable = !!cache; cacheWarning = '';
        if (cacheAvailable) {
          try {await cache.clear();}
          catch (failure) {unavailable(failure);}
        }
      } else if (cacheAvailable) {
        try {base = await cache.loadComplete();}
        catch (failure) {
          // A damaged cache must be rebuilt from Supabase, rather than reused as
          // a trusted baseline. Storage failures use the same read-only fallback.
          unavailable(failure);
        }
      }
      if (!current(ticket)) return false;
      records = new Map();
      let lowerBound = null;
      if (!full && base) {
        const at = checkedTime(now()), restored = cleanSnapshot(base, at), seq = restored.snapshotSeq;
        records = restored.rows;
        let cachedSummary = summary;
        if (!cachedSummary || snapshotSeq !== seq || count !== records.size) {
          status = 'processing'; notify();
          await new Promise(resolve => setTimeout(resolve, 0));
          if (!current(ticket)) return false;
          cachedSummary = await buildSummary([...records.values()], at);
        }
        if (!current(ticket)) return false;
        summary = cachedSummary; count = records.size; snapshotSeq = lowerBound = seq; savedAt = restored.savedAt;
        notify();
      } else if (!full && volatileComplete) {
        records = new Map(volatileComplete); lowerBound = snapshotSeq;
      }
      if (!current(ticket)) return false;
      status = 'loading'; notify();
      feed = createFeed(config, {fetchImpl, now, afterSeq: lowerBound, pageSize: 1000,
        async onPage(rows) {
          if (!current(ticket)) return;
          try {
            const staged = addPage(rows, checkedTime(now()));
            if (cacheAvailable) {
              try {await cache.writePage([...staged.values()]);}
              catch (failure) {
                if (failure?.name === 'ArchiveCacheDataError') throw failure;
                unavailable(failure);
              }
            }
            if (!current(ticket)) return;
            for (const [id, row] of staged) records.set(id, row);
          } catch (failure) {
            if (failure?.name === 'ArchiveCacheDataError') dataFailure = true;
            throw failure;
          }
        },
        onStatus(incoming) {
          if (!current(ticket)) return;
          progress = {...incoming};
          if (incoming.state === 'error') {fail(ticket, incoming.message || 'Ошибка загрузки архива'); return;}
          if (incoming.state === 'complete') {
            if (incoming.exhausted !== true) {fail(ticket, dataError('Архив: источник не подтвердил конец истории')); return;}
            if (!finishing) finishing = finish(ticket, incoming, full);
            return;
          }
          if (incoming.state === 'loading') {status = 'loading'; loading = true; error = '';}
          notify();
        },
      });
      feed.start(); return current(ticket);
    } catch (failure) {fail(ticket, failure); return false;}
  }

  function start() {
    if (initialized || stopped) return Promise.resolve(false);
    initialized = true; return begin();
  }
  function refresh({full = false} = {}) {
    initialized = true; return begin(full === true);
  }
  function retry() {
    if (stopped || status !== 'error' || dataFailure) return false;
    const ticket = generation, selectedFeed = feed;
    if (selectedFeed?.retry() && current(ticket) && feed === selectedFeed) {
      loading = true; status = 'loading'; error = ''; notify(); return true;
    }
    return false;
  }
  async function getRows() {
    if (stopped || !summary || savedAt === null) return null;
    const ticket = generation, expected = {summary, count, snapshotSeq, savedAt};
    const unchanged = () => current(ticket) && summary === expected.summary && count === expected.count &&
      snapshotSeq === expected.snapshotSeq && savedAt === expected.savedAt;
    // Never expose records: that map may contain only part of an active scan.
    if (volatileComplete) return [...volatileComplete.values()].map(row => ({...row}));
    if (!cacheAvailable || expected.snapshotSeq === null) return null;
    try {
      const loaded = await cache.loadComplete();
      if (!unchanged()) return null;
      if (!loaded || loaded.snapshotSeq !== expected.snapshotSeq || loaded.savedAt !== expected.savedAt) return null;
      const clean = cleanSnapshot(loaded, checkedTime(now()));
      if (clean.rows.size !== expected.count || !unchanged()) return null;
      return [...clean.rows.values()];
    } catch (failure) {
      if (unchanged()) {unavailable(failure); notify();}
      return null;
    }
  }
  function stop() {
    if (stopped) return;
    stopped = true; generation++; feed?.stop(); feed = null;
    loading = false; status = 'stopped'; records = null; volatileComplete = null;
    cache?.close?.();
  }
  return {start, refresh, retry, getRows, stop, get state() {return state();}};
}
