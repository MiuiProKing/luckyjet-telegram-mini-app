// Public completed rounds only. The current completed snapshot is isolated from
// pages of a newer scan until the caller confirms exhaustion and marks it complete.
const VERSION = 1;
const MIN_TIMESTAMP = 946684800000;
const MAX_TIMESTAMP = 8640000000000000;
const MIN_SEQUENCE = -9223372036854775808n;
const MAX_SEQUENCE = 9223372036854775807n;
const STORE = 'rounds', META = 'metadata', COMPLETE = 'complete';
const fields = ['id', 'coefficient', 'timestamp', 'sourceSeq', 'completed', 'estimated'];
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP;

// Corrupt/conflicting observations must stop a scan; a storage quota failure may
// safely fall back to volatile memory. Callers can distinguish those outcomes.
export class ArchiveCacheDataError extends Error {
  constructor(message) {super(message); this.name = 'ArchiveCacheDataError';}
}

function sequence(value) {
  if (typeof value !== 'string' || !/^-?\d{1,19}$/.test(value)) throw new ArchiveCacheDataError('Архив: неверный sourceSeq');
  const result = BigInt(value);
  if (result < MIN_SEQUENCE || result > MAX_SEQUENCE) throw new ArchiveCacheDataError('Архив: неверный sourceSeq');
  return result.toString();
}

function cleanRow(value, now) {
  if (!record(value) || typeof value.id !== 'string' || !value.id.trim() || value.id.length > 300 ||
      typeof value.coefficient !== 'number' || !Number.isFinite(value.coefficient) || value.coefficient < 1 ||
      !timestamp(value.timestamp) || value.timestamp > now || value.completed !== true || value.estimated !== false)
    throw new ArchiveCacheDataError('Архив: неверный подтверждённый раунд');
  return {id: value.id, coefficient: value.coefficient, timestamp: value.timestamp,
    sourceSeq: sequence(value.sourceSeq), completed: true, estimated: false};
}

const sameRow = (a, b) => fields.every(field => a?.[field] === b[field]);

/** IndexedDB is optional: callers may fall back to a volatile in-memory scan. */
export function createArchiveCache({indexedDB = globalThis.indexedDB, name = 'god-preditor-archive-v1', now = Date.now,
  timeoutMs = 15000} = {}) {
  if (typeof name !== 'string' || !name || name.length > 250) throw Error('Архив: неверное имя кэша');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('Архив: неверный таймаут кэша');
  let database = null, opening = null, closed = false;

  async function open() {
    if (closed) throw Error('Кэш архива закрыт');
    if (database) return database;
    if (!indexedDB?.open) throw Error('IndexedDB недоступна: архив останется в памяти');
    if (!opening) opening = new Promise((resolve, reject) => {
      let settled = false, request;
      const done = (error, db = null) => {
        if (settled) {db?.close(); return;}
        settled = true; clearTimeout(timer);
        if (error) reject(error); else resolve(db);
      };
      const timer = setTimeout(() => done(Error('Кэш архива не ответил вовремя')), timeoutMs);
      try {request = indexedDB.open(name, VERSION);}
      catch (error) {done(error); return;}
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath: 'id'});
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, {keyPath: 'key'});
      };
      request.onerror = () => done(request.error || Error('Не удалось открыть кэш архива'));
      request.onblocked = () => done(Error('Кэш архива заблокирован другой вкладкой'));
      request.onsuccess = () => {
        const db = request.result;
        if (closed || settled) {db.close(); done(Error('Кэш архива закрыт')); return;}
        db.onversionchange = () => {db.close(); if (database === db) database = null;};
        database = db; done(null, db);
      };
    }).finally(() => {opening = null;});
    return opening;
  }

  async function transact(stores, mode, operation) {
    const db = await open();
    if (closed) throw Error('Кэш архива закрыт');
    return new Promise((resolve, reject) => {
      let transaction, result, failure = null, settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) reject(error); else resolve(result);
      };
      const fail = error => {
        failure = error instanceof Error ? error : Error(String(error));
        try {transaction?.abort();} catch {}
        // A transaction may already be inactive; always settle rather than hang.
        finish(failure);
      };
      const timer = setTimeout(() => fail(Error('Запись кэша архива задержалась')), timeoutMs);
      try {
        transaction = db.transaction(stores, mode);
        transaction.oncomplete = () => finish();
        transaction.onabort = () => finish(failure || transaction.error || Error('Операция кэша архива отменена'));
        transaction.onerror = event => {failure ||= event.target?.error || transaction.error || Error('Ошибка кэша архива');};
        operation(transaction, value => {result = value;}, fail);
      } catch (error) {fail(error);}
    });
  }

  async function writePage(input) {
    if (!Array.isArray(input)) throw new ArchiveCacheDataError('Архив: страница должна быть массивом');
    const at = now();
    if (!timestamp(at)) throw new ArchiveCacheDataError('Архив: неверное время устройства');
    const unique = new Map();
    for (const value of input) {
      const clean = cleanRow(value, at), prior = unique.get(clean.id);
      if (prior && !sameRow(prior, clean)) throw new ArchiveCacheDataError('Архив: конфликт ID ' + clean.id);
      unique.set(clean.id, clean);
    }
    return transact([STORE], 'readwrite', (tx, set, fail) => {
      const store = tx.objectStore(STORE);
      set(unique.size);
      for (const row of unique.values()) {
        const request = store.get(row.id);
        request.onsuccess = () => {
          try {
            const prior = request.result;
            if (prior && !sameRow(prior, row)) {fail(new ArchiveCacheDataError('Архив: конфликт ID ' + row.id)); return;}
            if (!prior) store.put(row);
          } catch (error) {fail(error);}
        };
      }
    });
  }

  async function markComplete({snapshotSeq, savedAt} = {}) {
    const highwater = sequence(snapshotSeq), at = now();
    if (!timestamp(savedAt) || !timestamp(at) || savedAt > at) throw new ArchiveCacheDataError('Архив: неверное время снимка');
    // Scope both stores so this marker waits for all earlier page transactions.
    return transact([STORE, META], 'readwrite', (tx, set, fail) => {
      const store = tx.objectStore(META), request = store.get(COMPLETE);
      request.onsuccess = () => {
        try {
          const previous = request.result;
          if (previous && BigInt(sequence(previous.snapshotSeq)) > BigInt(highwater)) {
            fail(new ArchiveCacheDataError('Архив: снимок не может откатиться назад')); return;
          }
          store.put({key: COMPLETE, version: VERSION, snapshotSeq: highwater, savedAt});
          set({snapshotSeq: highwater, savedAt});
        } catch (error) {fail(error);}
      };
    });
  }

  async function loadComplete() {
    const at = now();
    if (!timestamp(at)) throw new ArchiveCacheDataError('Архив: неверное время устройства');
    return transact([STORE, META], 'readonly', (tx, set, fail) => {
      const request = tx.objectStore(META).get(COMPLETE);
      request.onsuccess = () => {
        const meta = request.result;
        if (!meta) {set(null); return;}
        let highwater;
        try {
          if (meta.version !== VERSION || !timestamp(meta.savedAt) || meta.savedAt > at) throw new ArchiveCacheDataError('Архив: повреждён снимок кэша');
          highwater = sequence(meta.snapshotSeq);
        } catch (error) {fail(error); return;}
        // Bulk reads avoid one JS callback per row for the six-figure archive.
        const records = tx.objectStore(STORE).getAll();
        records.onsuccess = () => {
          try {
            const bound = BigInt(highwater), rows = [];
            for (const value of records.result) {
              // Newer, incomplete pages remain staged, never leak into this snapshot.
              if (BigInt(sequence(value.sourceSeq)) <= bound) rows.push(cleanRow(value, at));
            }
            set({rows, snapshotSeq: highwater, savedAt: meta.savedAt});
          } catch (error) {fail(error);}
        };
      };
    });
  }

  async function clear() {
    return transact([STORE, META], 'readwrite', tx => {
      tx.objectStore(STORE).clear(); tx.objectStore(META).clear();
    });
  }
  function close() {closed = true; database?.close(); database = null;}
  return {loadComplete, writePage, markComplete, clear, close};
}
