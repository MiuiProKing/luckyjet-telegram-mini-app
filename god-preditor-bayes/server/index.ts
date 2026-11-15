// Deploy as god-bayes-v1, with gateway verify_jwt=true.
// The service key is supplied only by the Edge runtime; no client forecast is trusted.
import { VERSION, TARGETS, MAX_GAP_MS, normalizeRows, statistics, plannedWindow, evaluateWindow } from './core.mjs';

const SOURCE = 'god_bayes_rounds_v1';
const LEDGER = 'god_bayes_signals_v1';
const SOURCE_FIELDS = 'id,coefficient,round_timestamp,estimated,feed_order';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Max-Age': '86400',
};
let cachedRows: unknown[] | null = null;
let cachedAt = 0;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS,
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function configuration() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('backend_configuration_unavailable');
  return { url: url.replace(/\/$/, ''), key };
}

async function rest(path: string, method = 'GET', body?: unknown, preference?: string) {
  const { url, key } = configuration();
  const res = await fetch(url + '/rest/v1/' + path, {
    method, headers: { apikey: key, Authorization: 'Bearer ' + key,
      Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(preference ? { Prefer: preference } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('database_request_failed_' + res.status);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function history(now: number) {
  if (cachedRows && now - cachedAt < 25000) return normalizeRows(cachedRows, now);
  const collected: any[] = [];
  let before: number | null = null;
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ select: SOURCE_FIELDS, estimated: 'eq.false',
      order: 'feed_order.desc', limit: '1000' });
    if (before !== null) query.set('feed_order', 'lt.' + before);
    const rows = await rest(SOURCE + '?' + query);
    if (!Array.isArray(rows)) throw new Error('invalid_history_response');
    collected.push(...rows);
    if (!rows.length || rows.length < 1000) break;
    const cursor = Number(rows.at(-1).feed_order);
    if (!Number.isSafeInteger(cursor) || before !== null && cursor >= before) throw new Error('invalid_history_cursor');
    before = cursor;
  }
  cachedRows = collected;
  cachedAt = Date.now();
  return normalizeRows(collected, now);
}

function canonical(row: any) {
  return { ...row.forecast, id: row.id, modelVersion: row.model_version, target: row.target,
    start: Date.parse(row.start_at), end: Date.parse(row.end_at), issuedAt: Date.parse(row.issued_at),
    probability: row.probability, interval95: [row.interval_low, row.interval_high],
    perRoundProbability: row.per_round_probability, sampleSize: row.sample_size,
    sourceCutoff: Date.parse(row.source_cutoff), status: row.status, actual: row.actual,
    resultAt: row.actual_at ? Date.parse(row.actual_at) : null, roundId: row.round_id,
    checkedAt: row.checked_at ? Date.parse(row.checked_at) : null, reason: row.resolution_reason,
    timingKind: 'fixed_future_statistical_window', validatedEdge: false, calibrated: false };
}

async function storedSignals(limit = 50) {
  return await rest(LEDGER + '?' + new URLSearchParams({ select: '*', order: 'issued_at.desc,id', limit: String(limit) }));
}

async function outcomeRows(window: any, recentRows: any[], now: number) {
  if (recentRows.length && recentRows[0].timestamp <= window.start - MAX_GAP_MS) return recentRows;
  const first = new Date(window.start - MAX_GAP_MS).toISOString();
  const last = new Date(Math.min(now, window.end + MAX_GAP_MS)).toISOString();
  const query = new URLSearchParams({ select: SOURCE_FIELDS, estimated: 'eq.false',
    and: `(round_timestamp.gte.${first},round_timestamp.lte.${last})`, order: 'feed_order.asc', limit: '1000' });
  const raw = await rest(SOURCE + '?' + query);
  if (!Array.isArray(raw)) throw new Error('invalid_outcome_history');
  // A capped interval is incomplete, so never conclude MISS from its leading subset.
  if (raw.length >= 1000) return [];
  return normalizeRows(raw, now);
}

async function resolveEnded(recentRows: any[], now: number) {
  const ended = new Date(now).toISOString();
  const pending = await rest(LEDGER + '?' + new URLSearchParams({ select: '*', status: 'eq.pending',
    end_at: 'lt.' + ended, order: 'end_at.asc', limit: '20' }));
  const unknown = await rest(LEDGER + '?' + new URLSearchParams({ select: '*', status: 'eq.unknown',
    checked_at: 'lt.' + new Date(now - 300000).toISOString(), order: 'checked_at.asc', limit: '5' }));
  for (const row of [...pending, ...unknown]) {
    const window = canonical(row);
    const rows = await outcomeRows(window, recentRows, now);
    const result = evaluateWindow(window, rows, now);
    if (!result) continue;
    const patch = { status: result.status, actual: result.actual,
      actual_at: result.resultAt ? new Date(result.resultAt).toISOString() : null,
      round_id: result.roundId, checked_at: new Date(now).toISOString(), resolution_reason: result.reason };
    const query = new URLSearchParams({ id: 'eq.' + row.id, status: 'eq.' + row.status });
    await rest(LEDGER + '?' + query, 'PATCH', patch, 'return=minimal');
  }
}

function record(window: any) {
  return { id: window.id, model_version: window.modelVersion, target: window.target,
    issued_at: new Date(window.issuedAt).toISOString(), start_at: new Date(window.start).toISOString(),
    end_at: new Date(window.end).toISOString(), probability: window.probability,
    interval_low: window.interval95[0], interval_high: window.interval95[1],
    per_round_probability: window.perRoundProbability, sample_size: window.sampleSize,
    hit_count: window.hits, source_cutoff: new Date(window.cutoff).toISOString(),
    source_first: new Date(window.first).toISOString(), exposure_seconds: window.exposureSeconds,
    forecast: window, status: 'pending' };
}

async function targetFrom(req: Request) {
  let value: unknown;
  if (req.method === 'GET') value = new URL(req.url).searchParams.get('target') ?? '10';
  else {
    const text = await req.text();
    if (text.length > 4096) throw new Error('invalid_input');
    const input = text ? JSON.parse(text) : {};
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => key !== 'target')) throw new Error('invalid_input');
    value = input.target ?? 10;
  }
  if (typeof value === 'boolean' || !TARGETS.includes(Number(value))) throw new Error('invalid_target');
  return Number(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!['GET', 'POST'].includes(req.method)) return response({ error: 'method_not_allowed' }, 405);
  let target: number;
  try { target = await targetFrom(req); }
  catch { return response({ error: 'target_must_be_10_40_200_or_500' }, 400); }
  try {
    const now = Date.now(), rows = await history(now), stats = statistics(rows, target, now);
    await resolveEnded(rows, now);
    let records = await storedSignals();
    let selected = records.filter((row: any) => row.target === target && row.status === 'pending'
      && Date.parse(row.end_at) > now).sort((a: any, b: any) => Date.parse(a.start_at)-Date.parse(b.start_at))[0];
    const lastResult = records.find((row: any) => row.target === target && row.status !== 'pending'
      && Date.parse(row.end_at) < now && row.checked_at && now-Date.parse(row.checked_at) < 12000);
    let phase: string;
    if (selected) phase = now >= Date.parse(selected.start_at) ? 'checking' : 'scheduled';
    else if (lastResult) { selected = lastResult; phase = 'result'; }
    else {
      const window = plannedWindow(stats, now);
      if (window) {
        await rest(LEDGER + '?on_conflict=id', 'POST', record(window), 'resolution=ignore-duplicates,return=minimal');
        records = await storedSignals();
        selected = records.find((row: any) => row.id === window.id);
      }
      phase = selected ? 'scheduled' : stats.fresh ? 'reasoning' : 'offline';
    }
    return response({ version: VERSION, serverNow: Date.now(), target, phase,
      window: selected ? canonical(selected) : null, signals: records.map(canonical),
      sourceFresh: stats.fresh, sourceCutoff: stats.cutoff, sampleSize: stats.sampleSize,
      source: 'public.god_bayes_rounds_v1',
      model: { kind: 'bayesian_frequency_baseline', assumption: 'constant_poisson', calibrated: false,
        validatedEdge: false, timingKind: 'fixed_future_statistical_window',
        scope: 'at_least_one_completed_round_in_window', historyLimit: 10000 },
      notice: 'Время — границы статистического окна, не доказанный оптимальный момент ставки.' });
  } catch {
    // No request URLs, credentials, provider payloads, or stack traces leave the backend.
    return response({ error: 'source_or_journal_temporarily_unavailable', serverNow: Date.now() }, 503);
  }
});
