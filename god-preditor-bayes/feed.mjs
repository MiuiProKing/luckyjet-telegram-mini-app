/** Read-only, keyset-paginated Supabase history + live feed. No framework/CDN. */
const DAY = 86400000;
const byOrder = (a, b) => a.order - b.order || a.timestamp - b.timestamp || a.id.localeCompare(b.id);
const integer = value => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

export function normalizeRound(raw) {
  if (!raw || typeof raw !== 'object' || raw.id == null) return null;
  const id = String(raw.id), coefficient = Number(raw.coefficient);
  const order = integer(raw.feed_order ?? raw.order);
  const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : Date.parse(raw.round_timestamp);
  if (!id || id.length > 512 || !Number.isFinite(coefficient) || coefficient < 1 ||
      order === null || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  return {id, coefficient, timestamp, order, estimated: raw.estimated !== false,
    completed: raw.completed !== false};
}

/** Equal coefficients with different IDs are separate rounds. Conflicts are excluded. */
export class RoundStore {
  constructor() { this.map = new Map(); this.conflicts = new Set(); this.version = 0; this.sorted = []; this.sortedVersion = -1; }
  ingest(input) {
    const accepted = [];
    for (const raw of input || []) {
      const row = normalizeRound(raw);
      if (!row || this.conflicts.has(row.id)) continue;
      const old = this.map.get(row.id);
      if (old && (old.coefficient !== row.coefficient || old.order !== row.order ||
          (!old.estimated && !row.estimated && old.timestamp !== row.timestamp))) {
        this.map.delete(row.id); this.conflicts.add(row.id); this.version++;
        continue;
      }
      // A later archival page must never downgrade an exact live timestamp.
      if (old && !old.estimated && row.estimated) continue;
      if (!old || old.timestamp !== row.timestamp || old.estimated !== row.estimated || old.completed !== row.completed) {
        this.map.set(row.id, row); accepted.push(row); this.version++;
      }
    }
    return accepted.filter(row => !this.conflicts.has(row.id));
  }
  get rounds() {
    if (this.sortedVersion !== this.version) {
      this.sorted = [...this.map.values()].sort(byOrder); this.sortedVersion = this.version;
    }
    return this.sorted;
  }
  get size() { return this.map.size; }
  get maxOrder() { return this.rounds.at(-1)?.order ?? null; }
}

export class IndexedArchiveCache {
  constructor(name) { this.name = name; this.db = null; this.pending = Promise.resolve(); }
  async open() {
    if (!globalThis.indexedDB) return;
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        const rows = request.result.createObjectStore('rounds', {keyPath: 'id'});
        rows.createIndex('timestamp', 'timestamp');
        request.result.createObjectStore('meta');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(Error('CACHE_UNAVAILABLE'));
      request.onblocked = () => reject(Error('CACHE_BLOCKED'));
    });
  }
  async read() {
    if (!this.db) return {rows: [], state: null};
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['rounds', 'meta'], 'readonly');
      const rows = tx.objectStore('rounds').getAll(), state = tx.objectStore('meta').get('state');
      tx.oncomplete = () => resolve({rows: rows.result, state: state.result ?? null});
      tx.onerror = tx.onabort = () => reject(Error('CACHE_READ_FAILED'));
    });
  }
  put(rows, state, conflicts = []) {
    const snapshot = {...state}, excluded = [...conflicts];
    this.pending = this.pending.catch(() => {}).then(async () => {
      if (!this.db) return;
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(['rounds', 'meta'], 'readwrite'), store = tx.objectStore('rounds');
        for (const row of rows) store.put(row);
        for (const id of excluded) store.delete(id);
        tx.objectStore('meta').put({...snapshot, conflicts: excluded}, 'state');
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(Error('CACHE_WRITE_FAILED'));
      });
    });
    return this.pending;
  }
  async prune(cutoff) {
    if (!this.db || !globalThis.IDBKeyRange) return;
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction('rounds', 'readwrite');
      const cursor = tx.objectStore('rounds').index('timestamp').openCursor(IDBKeyRange.upperBound(cutoff, true));
      cursor.onsuccess = () => { const item = cursor.result; if (item) { item.delete(); item.continue(); } };
      tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(Error('CACHE_PRUNE_FAILED'));
    });
  }
  close() { this.db?.close(); this.db = null; }
}

export class LuckyFeed {
  constructor(config, {onUpdate = () => {}, onStatus = () => {}, fetchImpl = globalThis.fetch, cache} = {}) {
    const url = new URL(config.SUPABASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('Некорректный адрес источника');
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.TABLE || 'luckyjet_classic_history')) throw Error('Некорректная таблица');
    if (!config.SUPABASE_KEY || config.SUPABASE_KEY.startsWith('sb_secret_')) throw Error('Нужен публичный ключ Supabase');
    if (config.SUPABASE_KEY.startsWith('eyJ')) {
      try { if (JSON.parse(atob(config.SUPABASE_KEY.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role') throw Error('SECRET_KEY'); }
      catch (error) { if (error.message === 'SECRET_KEY') throw Error('Секретный ключ запрещён в браузере'); }
    }
    this.config = config; this.base = url.origin; this.table = config.TABLE || 'luckyjet_classic_history';
    this.fetch = fetchImpl.bind(globalThis); this.onUpdate = onUpdate; this.onStatus = onStatus;
    this.store = new RoundStore(); this.pageSize = Math.max(1, Math.min(1000, config.PAGE_SIZE || 1000));
    this.days = Math.max(1, Math.min(90, config.HISTORY_DAYS || 90));
    this.cache = cache === false ? null : cache || new IndexedArchiveCache('god-bayes-history-v1-' + url.hostname + '-' + this.table);
    this.running = false; this.archiveComplete = false; this.archiveBefore = null; this.liveAfter = null;
    this.serverOffsetMs = 0; this.lastSuccessAt = 0; this.error = null; this.phase = 'idle';
    this.cutoff = Date.now() - this.days * DAY; this.controllers = new Set(); this.polling = false;
    this.loadingArchive = false; this.timer = null; this.cacheWarning = null;
  }
  get rounds() { return this.store.rounds; }
  get meta() {
    return {phase: this.phase, complete: this.archiveComplete && !this.catchingUp,
      archiveComplete: this.archiveComplete, loaded: this.store.size,
      oldest: this.rounds[0]?.timestamp ?? null, latest: this.rounds.at(-1)?.timestamp ?? null,
      cursor: this.store.maxOrder, serverOffsetMs: this.serverOffsetMs,
      lastSuccessAt: this.lastSuccessAt, error: this.error, cacheWarning: this.cacheWarning,
      conflicts: this.store.conflicts.size, historyDays: this.days};
  }
  emit(update = true) {
    const meta = this.meta;
    if (update) this.onUpdate(this.rounds, meta);
    this.onStatus(meta);
  }
  async request({before = null, after = null, limit = this.pageSize} = {}) {
    const query = new URLSearchParams({select: 'id,coefficient,round_timestamp,estimated,feed_order',
      order: 'feed_order.' + (after === null ? 'desc' : 'asc'), limit: String(limit),
      round_timestamp: 'gte.' + new Date(this.cutoff).toISOString()});
    if (before !== null) query.set('feed_order', 'lt.' + before);
    if (after !== null) query.set('feed_order', 'gt.' + after);
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    this.controllers.add(controller);
    const started = Date.now();
    try {
      const headers = {apikey: this.config.SUPABASE_KEY, Accept: 'application/json'};
      if (this.config.SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + this.config.SUPABASE_KEY;
      const response = await this.fetch(this.base + '/rest/v1/' + this.table + '?' + query,
        {headers, signal: controller.signal, cache: 'no-store', credentials: 'omit'});
      if (!response.ok) throw Error('Источник временно недоступен (' + response.status + ')');
      const date = Date.parse(response.headers?.get('date'));
      if (Number.isFinite(date)) {
        const offset = date - (started + Date.now()) / 2;
        if (Math.abs(offset) < DAY) this.serverOffsetMs = offset;
      }
      const data = await response.json();
      if (!Array.isArray(data)) throw Error('Некорректный ответ истории');
      // Cursor validation prevents silently skipping a damaged/unsorted page.
      let previous = after === null ? before : after;
      for (const row of data) {
        const order = integer(row.feed_order);
        if (order === null || (previous !== null && (after === null ? order >= previous : order <= previous))) throw Error('Нарушен порядок истории');
        previous = order;
      }
      return data;
    } finally { clearTimeout(timeout); this.controllers.delete(controller); }
  }
  async persist(rows = []) {
    if (!this.cache) return;
    try { await this.cache.put(rows, {archiveBefore: this.archiveBefore, archiveComplete: this.archiveComplete,
      liveAfter: this.liveAfter, cutoff: this.cutoff}, this.store.conflicts); }
    catch { this.cacheWarning = 'Кеш браузера недоступен; данные загружаются с сервера'; this.cache = null; }
  }
  async start() {
    if (this.running) return;
    this.running = true; this.phase = 'loading'; this.emit(false);
    if (this.cache) {
      try {
        await this.cache.open();
        const saved = await this.cache.read(), state = saved.state;
        await this.cache.prune?.(this.cutoff);
        this.store.ingest((saved.rows || []).filter(row => row.timestamp >= this.cutoff));
        if (state) {
          for (const id of state.conflicts || []) { this.store.map.delete(id); this.store.conflicts.add(id); }
          this.store.version++;
          this.archiveBefore = integer(state.archiveBefore);
          this.archiveComplete = state.archiveComplete === true && state.cutoff <= this.cutoff;
          if (!this.archiveComplete && state.cutoff > this.cutoff) this.archiveBefore = null;
          this.liveAfter = integer(state.liveAfter) ?? this.store.maxOrder;
        } else this.liveAfter = this.store.maxOrder;
        if (this.store.size) { this.phase = 'cached'; this.emit(); }
      } catch { this.cacheWarning = 'Кеш браузера недоступен'; this.cache = null; }
    }
    if (!this.running) return;
    try {
      const head = await this.request();
      if (!this.running) return;
      const accepted = this.store.ingest(head);
      if (this.liveAfter === null) this.liveAfter = this.store.maxOrder;
      this.catchingUp = this.liveAfter !== null && this.store.maxOrder > this.liveAfter;
      if (this.archiveBefore === null) {
        this.archiveBefore = head.length ? integer(head.at(-1).feed_order) : null;
        this.archiveComplete = head.length < this.pageSize;
      }
      this.phase = 'live'; this.lastSuccessAt = Date.now(); this.error = null;
      await this.persist(accepted); this.emit();
    } catch (error) {
      if (this.running) { this.error = error.name === 'AbortError' ? 'Источник не ответил вовремя' : error.message; this.phase = 'offline'; this.emit(); }
    }
    if (!this.running) return;
    this.timer = setInterval(() => { void this.poll(); }, this.config.POLL_MS || 5000);
    void this.poll(); void this.loadMore();
  }
  async poll() {
    if (!this.running || this.polling) return;
    this.polling = true;
    try {
      // A separate cursor survives fresh-head fetches: cached-to-current gaps are filled.
      do {
        const after = this.liveAfter;
        const rows = await this.request(after === null ? {} : {after});
        if (!this.running) return;
        const accepted = this.store.ingest(rows);
        if (rows.length) this.liveAfter = after === null ? this.store.maxOrder : integer(rows.at(-1).feed_order);
        this.catchingUp = rows.length === this.pageSize && after !== null;
        this.phase = 'live'; this.lastSuccessAt = Date.now(); this.error = null;
        await this.persist(accepted); this.emit();
        if (!this.catchingUp) break;
      } while (this.running);
    } catch (error) {
      if (this.running) { this.error = error.name === 'AbortError' ? 'Источник не ответил вовремя' : error.message; this.phase = 'offline'; this.emit(false); }
    } finally { this.polling = false; }
  }
  async loadMore() {
    if (!this.running || this.loadingArchive || this.archiveComplete) return;
    this.loadingArchive = true;
    try {
      while (this.running && !this.archiveComplete) {
        const before = this.archiveBefore, rows = await this.request({before});
        if (!this.running) return;
        const accepted = this.store.ingest(rows);
        if (rows.length) {
          const next = integer(rows.at(-1).feed_order);
          if (before !== null && next >= before) throw Error('Не удалось продолжить архив');
          this.archiveBefore = next;
        }
        this.archiveComplete = rows.length < this.pageSize;
        await this.persist(accepted); this.emit();
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    } catch (error) {
      if (this.running) { this.cacheWarning = 'Архив загружен частично. Можно продолжить загрузку.'; this.emit(false); }
    } finally { this.loadingArchive = false; }
  }
  stop() {
    this.running = false; this.phase = 'stopped'; clearInterval(this.timer);
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
}
