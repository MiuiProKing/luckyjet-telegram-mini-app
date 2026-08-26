import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();
const CHANNEL_RE = /^[a-f0-9]{64}$/;
const SIGNATURE_RE = /^[a-f0-9]{64}$/;
const MAX_MESSAGE_BYTES = 24_000;
const MAX_CLOCK_SKEW_MS = 90_000;
const VISIBLE_WINDOW_MS = 10 * 60_000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-ig247-ts, x-ig247-signature",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function hexBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function verifyRequest(
  request: Request,
  channel: string,
  direction: string,
  after: number,
  message: string
) {
  if (!CHANNEL_RE.test(channel)) throw new Error("CHANNEL_INVALID");
  if (direction !== "cmd" && direction !== "evt") throw new Error("DIRECTION_INVALID");

  const timestamp = request.headers.get("x-ig247-ts") || "";
  const signature = (request.headers.get("x-ig247-signature") || "").toLowerCase();
  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    throw new Error("TIMESTAMP_INVALID");
  }
  if (!SIGNATURE_RE.test(signature)) throw new Error("SIGNATURE_INVALID");

  const key = await crypto.subtle.importKey(
    "raw",
    hexBytes(channel),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const canonical = [request.method, direction, timestamp, String(after), message].join("\n");
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    hexBytes(signature),
    encoder.encode(canonical)
  );
  if (!valid) throw new Error("SIGNATURE_INVALID");
}

function database() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("SERVER_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const url = new URL(request.url);
    let channel = "";
    let direction = "";
    let message = "";
    let after = 0;

    if (request.method === "POST") {
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > MAX_MESSAGE_BYTES * 2) throw new Error("MESSAGE_TOO_LARGE");
      const body = await request.json();
      channel = String(body?.channel || "").toLowerCase();
      direction = String(body?.direction || "");
      message = String(body?.message || "");
      if (!message || encoder.encode(message).byteLength > MAX_MESSAGE_BYTES) {
        throw new Error("MESSAGE_TOO_LARGE");
      }
    } else {
      channel = String(url.searchParams.get("channel") || "").toLowerCase();
      direction = String(url.searchParams.get("direction") || "");
      after = Math.max(0, Number.parseInt(url.searchParams.get("after") || "0", 10) || 0);
    }

    await verifyRequest(request, channel, direction, after, message);
    const supabase = database();
    const page = `${channel}:${direction}`;

    if (request.method === "POST") {
      const { data, error } = await supabase
        .from("app_events")
        .insert({
          telegram_id: null,
          event_name: "ig247_bridge_v1",
          page,
          game: "instagram247",
          data: { message, client_ts: request.headers.get("x-ig247-ts") }
        })
        .select("id")
        .single();
      if (error) throw error;

      if (crypto.getRandomValues(new Uint8Array(1))[0] < 12) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
        await supabase.from("app_events").delete().eq("event_name", "ig247_bridge_v1").lt("created_at", cutoff);
      }
      return json({ ok: true, id: data?.id || 0 });
    }

    const cutoff = new Date(Date.now() - VISIBLE_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("app_events")
      .select("id,created_at,data")
      .eq("event_name", "ig247_bridge_v1")
      .eq("page", page)
      .gt("id", after)
      .gte("created_at", cutoff)
      .order("id", { ascending: true })
      .limit(100);
    if (error) throw error;

    const events = (data || []).map((row: any) => ({
      id: Number(row.id),
      created_at: row.created_at,
      message: String(row.data?.message || "")
    })).filter((row: any) => row.message);
    return json({ ok: true, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = [
      "CHANNEL_INVALID",
      "DIRECTION_INVALID",
      "TIMESTAMP_INVALID",
      "SIGNATURE_INVALID"
    ].includes(message) ? 401 : message === "MESSAGE_TOO_LARGE" ? 413 : 500;
    console.error("instagram247-bridge", message);
    return json({ ok: false, error: message }, status);
  }
});
