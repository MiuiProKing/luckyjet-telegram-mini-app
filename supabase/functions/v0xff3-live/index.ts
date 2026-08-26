import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HISTORY_URL = "https://crash-gateway-grm-cr.100hp.app/history";
const DEFAULT_CUSTOMER_ID = "077dee8d-c923-4c02-9bee-757573662e69";
const EVENT_NAME = "v0xff3_round_v1";
const MAX_LIMIT = 5_000;

function headers() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-v0xff3-session, x-v0xff3-customer",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers() });
}

function database() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("SERVER_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false } });
}

function first(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (item[key] != null) return item[key];
  return null;
}

function extractItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(row => row && typeof row === "object") as Record<string, unknown>[];
  if (!value || typeof value !== "object") return [];
  const data = value as Record<string, unknown>;
  for (const key of ["history", "rounds", "data", "items", "results"]) {
    const nested = data[key];
    if (Array.isArray(nested)) return nested.filter(row => row && typeof row === "object") as Record<string, unknown>[];
    if (nested && typeof nested === "object") {
      const object = nested as Record<string, unknown>;
      for (const sub of ["history", "rounds", "items", "results"]) {
        if (Array.isArray(object[sub])) return (object[sub] as unknown[]).filter(row => row && typeof row === "object") as Record<string, unknown>[];
      }
    }
  }
  return [];
}

function coefficient(item: Record<string, unknown>) {
  let value = first(item, ["topCoefficient", "top_coefficient", "coefficient", "multiplier", "value", "coef", "crash"]);
  if (value == null) {
    const finals = first(item, ["finalValues", "final_values"]);
    if (Array.isArray(finals)) {
      const values = finals.map(Number).filter(Number.isFinite);
      if (values.length) value = Math.max(...values);
    }
  }
  const parsed = Number(String(value ?? "").toLowerCase().replace("x", "").trim());
  return Number.isFinite(parsed) && parsed >= 1 ? Math.round(Math.max(1.01, parsed) * 100) / 100 : null;
}

function timestamp(value: unknown) {
  if (value == null) return 0;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric < 10_000_000_000 ? numeric * 1_000 : numeric) : 0;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(items: Record<string, unknown>[]) {
  const fetchedAt = Date.now();
  return items.map((item, index) => {
    const value = coefficient(item);
    const rawId = first(item, ["id", "round_id", "roundId", "_id", "gameId", "hash"]);
    if (value == null || rawId == null) return null;
    const rawTime = first(item, ["createdAt", "created_at", "timestamp", "time", "start_time", "stateChangedAt", "endedAt", "ended_at", "updatedAt"]);
    const realTime = timestamp(rawTime);
    return {
      id: String(rawId).slice(0, 120),
      coefficient: value,
      timestamp: realTime || fetchedAt - index * 12_000,
      estimated: !realTime
    };
  }).filter(Boolean) as Array<{ id: string; coefficient: number; timestamp: number; estimated: boolean }>;
}

async function pushFromLuckyJet(request: Request) {
  const sessionId = String(request.headers.get("x-v0xff3-session") || "").trim();
  const customerId = String(request.headers.get("x-v0xff3-customer") || DEFAULT_CUSTOMER_ID).trim();
  if (!/^[0-9a-f-]{32,64}$/i.test(sessionId)) throw new Error("SESSION_REQUIRED");
  if (!customerId || customerId.length > 100) throw new Error("CUSTOMER_INVALID");

  const upstream = await fetch(HISTORY_URL, {
    headers: { "customer-id": customerId, "session-id": sessionId, "Accept": "application/json" },
    cache: "no-store"
  });
  if (!upstream.ok) throw new Error(`LUCKYJET_HTTP_${upstream.status}`);
  const rounds = normalize(extractItems(await upstream.json()));
  if (!rounds.length) throw new Error("LUCKYJET_EMPTY");

  const supabase = database();
  const ids = rounds.map(row => row.id);
  const { data: existing, error: selectError } = await supabase
    .from("app_events")
    .select("page")
    .eq("event_name", EVENT_NAME)
    .in("page", ids);
  if (selectError) throw selectError;
  const known = new Set((existing || []).map((row: any) => String(row.page || "")));
  const fresh = rounds.filter(row => !known.has(row.id));
  if (fresh.length) {
    const { error: insertError } = await supabase.from("app_events").insert(fresh.map(row => ({
      telegram_id: null,
      event_name: EVENT_NAME,
      page: row.id,
      game: "luckyjet",
      data: { coefficient: row.coefficient, timestamp: row.timestamp, estimated: row.estimated }
    })));
    if (insertError) throw insertError;
  }
  return { received: rounds.length, inserted: fresh.length, latest: rounds[0] };
}

async function snapshot(url: URL) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "5000", 10) || 5000));
  const supabase = database();
  const [{ data, error }, countResult] = await Promise.all([
    supabase.from("app_events").select("page,data,created_at").eq("event_name", EVENT_NAME).order("created_at", { ascending: false }).limit(limit),
    supabase.from("app_events").select("id", { count: "exact", head: true }).eq("event_name", EVENT_NAME)
  ]);
  if (error) throw error;
  const map = new Map<string, any>();
  for (const row of data || []) {
    const id = String(row.page || "");
    if (!id || map.has(id)) continue;
    map.set(id, {
      id,
      topCoefficient: Number(row.data?.coefficient),
      timestamp: Number(row.data?.timestamp) || Date.parse(row.created_at),
      estimated: Boolean(row.data?.estimated)
    });
  }
  const history = Array.from(map.values()).sort((left, right) => left.timestamp - right.timestamp);
  return { history, total: Number(countResult.count || history.length), updatedAt: history.at(-1)?.timestamp || 0 };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers() });
  try {
    const url = new URL(request.url);
    if (request.method === "POST") return reply({ ok: true, ...(await pushFromLuckyJet(request)) });
    if (request.method === "GET") return reply({ ok: true, ...(await snapshot(url)) });
    return reply({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "SESSION_REQUIRED" || message === "CUSTOMER_INVALID" ? 401 : message.startsWith("LUCKYJET_HTTP_4") ? 401 : 500;
    console.error("v0xff3-live", message);
    return reply({ ok: false, error: message }, status);
  }
});
