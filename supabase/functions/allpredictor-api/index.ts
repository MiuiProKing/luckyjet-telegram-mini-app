import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();

function cors(origin: string | null) {
  const allowed = Deno.env.get("APP_ORIGIN") || "https://miuiproking.github.io";
  return {
    "Access-Control-Allow-Origin": origin && origin.startsWith(allowed) ? origin : allowed,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  };
}

function reply(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

async function hmac(key: Uint8Array, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map(v => v.toString(16).padStart(2, "0")).join("");
}

async function verifyTelegram(initData: string) {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  if (!initData || !botToken) throw new Error("TELEGRAM_AUTH_REQUIRED");
  const params = new URLSearchParams(initData);
  const providedHash = params.get("hash");
  if (!providedHash) throw new Error("TELEGRAM_HASH_MISSING");
  params.delete("hash");
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > 86400) throw new Error("TELEGRAM_AUTH_EXPIRED");
  const checkString = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(encoder.encode("WebAppData"), botToken);
  const calculated = hex(await hmac(new Uint8Array(secret), checkString));
  if (calculated.toLowerCase() !== providedHash.toLowerCase()) throw new Error("TELEGRAM_AUTH_INVALID");
  const rawUser = params.get("user");
  if (!rawUser) throw new Error("TELEGRAM_USER_MISSING");
  const user = JSON.parse(rawUser);
  user.id = Number(user.id);
  if (!Number.isSafeInteger(user.id)) throw new Error("TELEGRAM_USER_ID_INVALID");
  return user;
}

async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function adminIds() {
  return String(Deno.env.get("ADMIN_TELEGRAM_IDS") || "").split(",").map(v => Number(v.trim())).filter(Number.isSafeInteger);
}

function db() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("SERVER_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ensureUser(supabase: ReturnType<typeof createClient>, user: any, increaseLaunch = false) {
  const { data: existing } = await supabase.from("app_users").select("launch_count,is_blocked,referred_by").eq("telegram_id", user.id).maybeSingle();
  if (existing?.is_blocked) throw new Error("USER_BLOCKED");
  const row: Record<string, unknown> = {
    telegram_id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    language_code: user.language_code || null,
    last_seen_at: new Date().toISOString(),
    referral_code: `U${user.id.toString(36).toUpperCase()}`
  };
  if (increaseLaunch) row.launch_count = Number(existing?.launch_count || 0) + 1;
  const { error } = await supabase.from("app_users").upsert(row, { onConflict: "telegram_id" });
  if (error) throw error;
  return existing;
}

async function activateLicense(supabase: ReturnType<typeof createClient>, user: any, body: any) {
  const key = String(body.key || "").trim().toUpperCase();
  const deviceId = String(body.deviceId || "").trim();
  if (!key) throw new Error("EMPTY_LICENSE_KEY");
  if (deviceId.length < 8) throw new Error("DEVICE_ID_REQUIRED");
  await ensureUser(supabase, user, true);
  const deviceHash = await sha256(deviceId);
  const { data: license, error } = await supabase.from("license_keys").select("*").eq("license_key", key).single();
  if (error || !license) throw new Error("LICENSE_NOT_FOUND");
  if (license.status === "revoked") throw new Error("LICENSE_REVOKED");
  if (license.status === "expired" || (license.expires_at && new Date(license.expires_at).getTime() <= Date.now())) throw new Error("LICENSE_EXPIRED");
  if (license.bound_telegram_id && Number(license.bound_telegram_id) !== user.id) throw new Error("LICENSE_BOUND_TO_ANOTHER_USER");

  const { data: existing } = await supabase.from("license_activations").select("*").eq("license_id", license.id).eq("telegram_id", user.id).eq("device_hash", deviceHash).maybeSingle();
  if (existing?.is_active) return { activationToken: existing.activation_token, plan: license.plan, expiresAt: existing.expires_at, telegramId: user.id, activatedAt: existing.activated_at };

  const { count } = await supabase.from("license_activations").select("id", { count: "exact", head: true }).eq("license_id", license.id).eq("telegram_id", user.id).eq("is_active", true);
  const limit = Math.max(1, Number(license.max_devices || license.max_activations || 1));
  if (Number(count || 0) >= limit) throw new Error("LICENSE_DEVICE_LIMIT");

  const activatedAt = new Date();
  const expiresAt = license.plan === "lifetime" ? null : new Date(activatedAt.getTime() + Number(license.duration_days || 0) * 86400000).toISOString();
  const activationToken = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v => v.toString(16).padStart(2, "0")).join("");
  const { data: activation, error: activationError } = await supabase.from("license_activations").insert({
    license_id: license.id,
    telegram_id: user.id,
    activation_token: activationToken,
    device_hash: deviceHash,
    activated_at: activatedAt.toISOString(),
    last_checked_at: activatedAt.toISOString(),
    expires_at: expiresAt,
    is_active: true
  }).select("*").single();
  if (activationError) throw activationError;
  await supabase.from("license_keys").update({
    bound_telegram_id: user.id,
    activated_at: license.activated_at || activatedAt.toISOString(),
    activation_count: Number(license.activation_count || 0) + 1,
    status: "active"
  }).eq("id", license.id);
  await supabase.from("app_events").insert({ telegram_id: user.id, event_name: "license_activated", page: "license", data: { plan: license.plan } });
  return { activationToken: activation.activation_token, plan: license.plan, expiresAt: activation.expires_at, telegramId: user.id, activatedAt: activation.activated_at };
}

async function checkLicense(supabase: ReturnType<typeof createClient>, user: any, body: any) {
  const token = String(body.activationToken || "").trim();
  const deviceId = String(body.deviceId || "").trim();
  if (!token || deviceId.length < 8) throw new Error("ACTIVATION_DATA_REQUIRED");
  await ensureUser(supabase, user);
  const deviceHash = await sha256(deviceId);
  const { data: activation, error } = await supabase.from("license_activations").select("*,license_keys(*)").eq("activation_token", token).single();
  if (error || !activation) throw new Error("LICENSE_NOT_FOUND");
  if (Number(activation.telegram_id) !== user.id) throw new Error("LICENSE_USER_MISMATCH");
  if (activation.device_hash !== deviceHash) throw new Error("LICENSE_DEVICE_MISMATCH");
  if (!activation.is_active || activation.license_keys?.status === "revoked") throw new Error("LICENSE_REVOKED");
  if (activation.expires_at && new Date(activation.expires_at).getTime() <= Date.now()) {
    await supabase.from("license_activations").update({ is_active: false }).eq("id", activation.id);
    throw new Error("LICENSE_EXPIRED");
  }
  await supabase.from("license_activations").update({ last_checked_at: new Date().toISOString() }).eq("id", activation.id);
  return { activationToken: activation.activation_token, plan: activation.license_keys?.plan || "pro", expiresAt: activation.expires_at, telegramId: user.id, activatedAt: activation.activated_at };
}

async function trackUser(supabase: ReturnType<typeof createClient>, user: any, body: any) {
  const existing = await ensureUser(supabase, user, true);
  const startParam = String(body.startParam || "");
  const referredBy = startParam.startsWith("ref_") ? startParam.slice(4, 80) : existing?.referred_by || null;
  if (referredBy && !existing?.referred_by) {
    await supabase.from("app_users").update({ referred_by: referredBy }).eq("telegram_id", user.id);
    const { data: referrer } = await supabase.from("app_users").select("telegram_id").eq("referral_code", referredBy).maybeSingle();
    if (referrer && Number(referrer.telegram_id) !== user.id) await supabase.from("referrals").upsert({ referrer_telegram_id: referrer.telegram_id, referred_telegram_id: user.id, referral_code: referredBy }, { onConflict: "referred_telegram_id" });
  }
  await supabase.from("app_events").insert({ telegram_id: user.id, event_name: String(body.eventName || "app_open").slice(0, 80), page: String(body.page || "").slice(0, 120), game: String(body.game || "").slice(0, 80), data: body.data && typeof body.data === "object" ? body.data : {} });
  return { telegramId: user.id, referralCode: `U${user.id.toString(36).toUpperCase()}` };
}

async function adminAction(supabase: ReturnType<typeof createClient>, action: string, body: any, user: any) {
  if (!adminIds().includes(user.id)) throw new Error("ADMIN_ACCESS_DENIED");
  const payload = body.payload || {};
  if (action === "admin_stats") {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const week = new Date(Date.now() - 7 * 86400000).toISOString();
    const month = new Date(Date.now() - 30 * 86400000).toISOString();
    const results = await Promise.all([
      supabase.from("app_users").select("telegram_id", { count: "exact", head: true }),
      supabase.from("app_users").select("telegram_id", { count: "exact", head: true }).gte("first_seen_at", today.toISOString()),
      supabase.from("app_users").select("telegram_id", { count: "exact", head: true }).gte("last_seen_at", week),
      supabase.from("app_users").select("telegram_id", { count: "exact", head: true }).gte("last_seen_at", month),
      supabase.from("license_keys").select("id", { count: "exact", head: true }),
      supabase.from("license_activations").select("id", { count: "exact", head: true }).eq("is_active", true)
    ]);
    return { stats: { users: results[0].count || 0, newToday: results[1].count || 0, activeWeek: results[2].count || 0, activeMonth: results[3].count || 0, licenses: results[4].count || 0, activeLicenses: results[5].count || 0 } };
  }
  if (action === "admin_list_users") {
    const { data, error } = await supabase.from("app_users").select("telegram_id,username,first_name,last_name,language_code,first_seen_at,last_seen_at,launch_count,is_blocked,referral_code").order("last_seen_at", { ascending: false }).limit(100);
    if (error) throw error; return { users: data || [] };
  }
  if (action === "admin_list_licenses") {
    const { data, error } = await supabase.from("license_keys").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw error; return { licenses: data || [] };
  }
  if (action === "admin_create_license") {
    const plan = String(payload.plan || "pro_30");
    const maxDevices = Math.min(2, Math.max(1, Number(payload.maxDevices || payload.maxActivations || 1)));
    const { data, error } = await supabase.rpc("create_license", { p_plan: plan, p_duration_days: payload.durationDays ? Number(payload.durationDays) : null, p_max_activations: maxDevices, p_note: String(payload.note || "").slice(0, 500) || null, p_created_by: user.id });
    if (error) throw error;
    const created = Array.isArray(data) ? data[0] : data;
    await supabase.from("license_keys").update({ max_devices: maxDevices, max_activations: maxDevices }).eq("id", created.id);
    const { data: finalRow } = await supabase.from("license_keys").select("*").eq("id", created.id).single();
    return { license: finalRow };
  }
  if (action === "admin_revoke_license") {
    await supabase.from("license_keys").update({ status: "revoked" }).eq("id", String(payload.licenseId || ""));
    await supabase.from("license_activations").update({ is_active: false }).eq("license_id", String(payload.licenseId || ""));
    return { message: "LICENSE_REVOKED" };
  }
  if (action === "admin_extend_license") {
    const days = Math.min(3650, Math.max(1, Number(payload.days || 30)));
    const { data: rows } = await supabase.from("license_activations").select("id,expires_at").eq("license_id", String(payload.licenseId || "")).eq("is_active", true);
    for (const row of rows || []) {
      const base = row.expires_at && new Date(row.expires_at).getTime() > Date.now() ? new Date(row.expires_at).getTime() : Date.now();
      await supabase.from("license_activations").update({ expires_at: new Date(base + days * 86400000).toISOString() }).eq("id", row.id);
    }
    return { message: "LICENSE_EXTENDED" };
  }
  if (action === "admin_block_user") {
    const telegramId = Number(payload.telegramId);
    const blocked = Boolean(payload.blocked);
    await supabase.from("app_users").update({ is_blocked: blocked }).eq("telegram_id", telegramId);
    if (blocked) await supabase.from("license_activations").update({ is_active: false }).eq("telegram_id", telegramId);
    return { message: blocked ? "USER_BLOCKED" : "USER_UNBLOCKED" };
  }
  throw new Error("UNKNOWN_ACTION");
}

Deno.serve(async request => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (request.method !== "POST") return reply(origin, { ok: false, message: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = await request.json();
    const action = String(body.action || "");
    const user = await verifyTelegram(String(body.initData || ""));
    const supabase = db();
    let result: any;
    if (action === "activate_license") result = { license: await activateLicense(supabase, user, body) };
    else if (action === "check_license") result = { license: await checkLicense(supabase, user, body) };
    else if (action === "track_user") result = { user: await trackUser(supabase, user, body) };
    else result = await adminAction(supabase, action, body, user);
    return reply(origin, { ok: true, ...result });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message.startsWith("TELEGRAM_") ? 401 : message === "ADMIN_ACCESS_DENIED" || message === "USER_BLOCKED" ? 403 : message.includes("NOT_FOUND") ? 404 : message.includes("LIMIT") || message.includes("BOUND") ? 409 : 400;
    return reply(origin, { ok: false, message }, status);
  }
});
