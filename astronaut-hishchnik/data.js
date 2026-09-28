(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BHData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function millis(value) {
    if (value == null || value === '') return null;
    const n = Number(value), t = Number.isFinite(n) ? (n < 1e11 ? n * 1000 : n) : Date.parse(value);
    return Number.isFinite(t) && t > 0 ? t : null;
  }
  function normalize(row) {
    const coefficient = Number(row.coefficient ?? row.topCoefficient ?? row.multiplier);
    const timestamp = millis(row.timestamp ?? row.round_timestamp ?? row.played_at ?? row.createdAt);
    if (!Number.isFinite(coefficient) || coefficient < 1 || !timestamp) return null;
    const suppliedId = row.id ?? row.round_id ?? row.roundId;
    const id = suppliedId == null ? 'time:' + timestamp + ':' + coefficient : String(suppliedId);
    return { id, coefficient, timestamp, estimated: Boolean(row.estimated), syntheticId: suppliedId == null || /^(?:live|state)-\d{13}-\d+(?:\.\d+)?$/.test(id) };
  }
  const rawKey = row => String(row.id ?? row.round_id ?? row.roundId ?? ('time:' + (row.timestamp ?? row.round_timestamp ?? row.played_at) + ':' + (row.coefficient ?? row.topCoefficient)));
  function dayKey(timestamp) {
    const d = new Date(timestamp);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  class Archive {
    constructor(request, options = {}) {
      this.request = request; this.legacyDuplicates = options.legacyDuplicates !== false; this.pageSize = options.pageSize || 500; this.overlap = Math.min(options.overlap || 40, Math.floor(this.pageSize / 2));
      this.map = new Map(); this.seen = new Set(); this.invalid = new Set(); this.total = 0; this.revision = 0;
      this.cursor = 0; this.cursorTotal = 0; this.anchor = null; this.oldestScanned = null; this.complete = false; this.ended = false; this.resets = 0; this.repairPasses = 0; this.pending = null;
      this.sortedRevision = -1; this.sorted = [];
    }
    ingest(raw, total) {
      if (Number.isFinite(Number(total)) && total != null) this.total = Math.max(0, Number(total));
      let added = 0;
      for (const item of raw) {
        const key = rawKey(item); this.seen.add(key);
        const row = normalize(item);
        if (!row) { this.invalid.add(key); continue; }
        const prev = this.map.get(row.id);
        if (!prev) added++;
        if (!prev || prev.coefficient !== row.coefficient || prev.timestamp !== row.timestamp || prev.estimated !== row.estimated) { this.map.set(row.id, row); this.revision++; }
      }
      if (this.complete && this.seen.size < this.total) this.resetScan();
      return added;
    }
    rows() {
      if (this.sortedRevision !== this.revision) {
        const raw = Array.from(this.map.values()).sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
        // Legacy collectors manufacture IDs from receipt times. Collapse only
        // these technical records within 2.5 s of a fixed group anchor, never
        // genuine source round IDs or a chain of neighbouring timestamps.
        const anchors = new Map(); this.sorted = []; this.hiddenDuplicates = 0;
        for (const row of raw) {
          const anchor = anchors.get(row.coefficient);
          if (this.legacyDuplicates && row.syntheticId && anchor && anchor.timestamp - row.timestamp <= 2500) { this.hiddenDuplicates++; continue; }
          this.sorted.push(row);
          if (row.syntheticId) anchors.set(row.coefficient, row);
        }
        this.sortedRevision = this.revision;
      }
      return this.sorted;
    }
    resetScan() { this.cursor = 0; this.cursorTotal = 0; this.anchor = null; this.oldestScanned = null; this.complete = false; this.ended = false; }
    coveredDay(day) { const start = new Date(day + 'T00:00:00').getTime(); return this.complete || (this.oldestScanned != null && this.oldestScanned < start); }
    loadNext() {
      if (this.pending) return this.pending;
      if (this.complete || this.ended) return Promise.resolve({ added: 0, complete: this.complete });
      this.pending = this._load().finally(() => { this.pending = null; });
      return this.pending;
    }
    async _load() {
      let offset = 0;
      if (this.anchor) {
        const head = await this.request(0, 1);
        this.ingest(head.history, head.total);
        offset = Math.max(0, this.cursor + (this.total - this.cursorTotal) - this.overlap);
      }
      let page = await this.request(offset, this.pageSize);
      if (this.anchor && !page.history.some(r => rawKey(r) === this.anchor)) {
        // A deletion or a large concurrent backfill can move the boundary. Rescan;
        // never silently skip a page when the known boundary cannot be located.
        if (++this.resets > 3) throw new Error('Граница истории изменилась. Обновите архив повторно.');
        this.resetScan(); offset = 0; page = await this.request(0, this.pageSize);
      }
      const added = this.ingest(page.history, page.total);
      this.cursor = offset + page.history.length;
      this.cursorTotal = Number(page.total) || this.total;
      if (page.history.length) {
        this.anchor = rawKey(page.history.at(-1));
        this.oldestScanned = normalize(page.history.at(-1))?.timestamp ?? this.oldestScanned;
      }
      this.ended = page.history.length === 0 || page.hasMore === false || (this.total > 0 && this.cursor >= this.total);
      this.complete = this.ended && this.seen.size >= this.total;
      if (this.ended && !this.complete && this.repairPasses < 1) {
        this.repairPasses++; this.resetScan();
      }
      return { added, complete: this.complete, cursor: this.cursor, total: this.total };
    }
  }
  return { Archive, normalize, millis, dayKey, rawKey };
});
