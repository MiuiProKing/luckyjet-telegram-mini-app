const COLUMNS = 'id,source_seq,coefficient,round_timestamp,estimated,origin';

// Only confirmed provider timestamps can feed time-window analysis. Import/receive
// timestamps are deliberately not substituted for a missing round timestamp.
export function mapSupabaseRound(row, now = Date.now()) {
  const timestamp = Date.parse(row.round_timestamp);
  const coefficient = Number(row.coefficient);
  if (row.estimated !== false || !row.round_timestamp || !Number.isFinite(timestamp) ||
      timestamp <= 0 || timestamp > now || !Number.isFinite(coefficient) || coefficient < 1 || !row.id) return null;
  return {id: `supabase:luckyjet:${row.id}`, coefficient, timestamp, source: 'Supabase · LuckyJet'};
}

export function createSupabaseFeed(config, {onRounds, onStatus, fetchImpl = fetch, now = Date.now, schedule = setTimeout, cancel = clearTimeout}) {
  const root = new URL(config.url);
  if (root.protocol !== 'https:' || !config.publishableKey?.startsWith('sb_publishable_')) throw Error('Требуются HTTPS и publishable key Supabase');
  if (!/^[a-z_][a-z0-9_]*$/.test(config.table)) throw Error('Неверное имя таблицы');
  let closed = false, timer = null, request = null, cursor = null, lastSuccess = null;
  const report = (state, extra = {}) => {if (!closed) onStatus?.({state, cursor, lastSuccess, ...extra});};

  async function getPage(initial) {
    const url = new URL(`/rest/v1/${config.table}`, root);
    url.searchParams.set('select', COLUMNS);
    url.searchParams.set('completed', 'eq.true');
    url.searchParams.set('estimated', 'eq.false');
    url.searchParams.set('round_timestamp', 'not.is.null');
    url.searchParams.set('order', `source_seq.${initial ? 'desc' : 'asc'}`);
    url.searchParams.set('limit', String(initial ? config.initialLimit : config.pageSize));
    if (!initial) url.searchParams.set('source_seq', 'gt.' + cursor);
    request = new AbortController();
    const timeout = setTimeout(() => request?.abort(), 15000);
    try {
      const response = await fetchImpl(url, {headers: {apikey: config.publishableKey, Accept: 'application/json'}, signal: request.signal, credentials: 'omit', cache: 'no-store'});
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Error(`Supabase HTTP ${response.status}${body.code ? ' · ' + body.code : ''}`);
      }
      const rows = await response.json();
      if (!Array.isArray(rows)) throw Error('Supabase вернул неверный формат истории');
      return rows;
    } finally {clearTimeout(timeout); request = null;}
  }

  async function poll() {
    let nextDelay = config.pollMs;
    try {
      const initial = cursor === null;
      const rows = await getPage(initial);
      if (closed) return;
      // Process ascending so a provider clock slightly ahead of this browser does
      // not advance the cursor past a valid round that should be accepted later.
      const sorted = [...rows].sort((a,b) => BigInt(a.source_seq) < BigInt(b.source_seq) ? -1 : 1);
      const batch = []; let candidate = cursor;
      for (const row of sorted) {
        if (Date.parse(row.round_timestamp) > now()) break;
        const mapped = mapSupabaseRound(row, now());
        if (mapped) batch.push(mapped);
        if (candidate === null || BigInt(row.source_seq) > BigInt(candidate)) candidate = String(row.source_seq);
      }
      // Initial empty history gets cursor zero, so inserts are still discovered.
      if (batch.length) await onRounds(batch, {initial});
      if (closed) return;
      cursor = candidate ?? '0'; lastSuccess = now();
      report('connected', {received: batch.length, initial});
      if (!initial && rows.length >= config.pageSize) nextDelay = 50;
    } catch (error) {
      if (!closed) report('error', {message: error.message});
    } finally {
      if (!closed) timer = schedule(poll, nextDelay);
    }
  }
  report('connecting');
  void poll();
  return {stop() {closed = true; cancel(timer); request?.abort();}, status() {return {cursor, lastSuccess, closed};}};
}
