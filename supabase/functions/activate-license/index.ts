import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, verifyTelegramInitData } from "../_shared/telegram.ts";

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendActivationMessage(botToken: string, telegramId: number, plan: string, expiresAt: string | null): Promise<void> {
  if (!botToken) return;
  const until = expiresAt ? new Date(expiresAt).toLocaleDateString("ru-RU", { timeZone: "Europe/Kyiv" }) : "LIFETIME";
  const text = [
    "✅ AllPredictor — доступ активирован",
    `Тариф: ${plan}`,
    `Доступ до: ${until}`,
    "Поддержка: @V0xFF3",
    "",
    "✅ AllPredictor access activated",
    `Plan: ${plan}`,
    `Access until: ${until}`
  ].join("\n");
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramId, text, disable_web_page_preview: true })
  }).catch(() => {});
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ ok: false, message: "METHOD_NOT_ALLOWED" }, 405, origin);

  try {
    const body = await request.json();
    const key = String(body?.key || "").trim().toUpperCase();
    const initData = String(body?.initData || "");
    const rawDeviceId = String(body?.deviceId || "").trim();
    if (!key) return jsonResponse({ ok: false, message: "EMPTY_LICENSE_KEY" }, 400, origin);
    if (rawDeviceId.length < 8) return jsonResponse({ ok: false, message: "DEVICE_ID_REQUIRED" }, 400, origin);

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    const user = await verifyTelegramInitData(initData, botToken);
    const deviceHash = await sha256(rawDeviceId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("SERVER_NOT_CONFIGURED");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: existingUser } = await supabase
      .from("app_users")
      .select("telegram_id,is_blocked,launch_count")
      .eq("telegram_id", user.id)
      .maybeSingle();
    if (existingUser?.is_blocked) return jsonResponse({ ok: false, message: "USER_BLOCKED" }, 403, origin);

    const referralCode = `U${user.id.toString(36).toUpperCase()}`;
    const { error: userError } = await supabase.from("app_users").upsert({
      telegram_id: user.id,
      username: user.username || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      language_code: user.language_code || null,
      last_seen_at: new Date().toISOString(),
      launch_count: Number(existingUser?.launch_count || 0) + 1,
      referral_code: referralCode
    }, { onConflict: "telegram_id" });
    if (userError) throw userError;

    const { data: license, error: licenseError } = await supabase
      .from("license_keys")
      .select("*")
      .eq("license_key", key)
      .single();
    if (licenseError || !license) return jsonResponse({ ok: false, message: "LICENSE_NOT_FOUND" }, 404, origin);
    if (license.status === "revoked") return jsonResponse({ ok: false, message: "LICENSE_REVOKED" }, 403, origin);
    if (license.status === "expired") return jsonResponse({ ok: false, message: "LICENSE_EXPIRED" }, 403, origin);
    if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
      await supabase.from("license_keys").update({ status: "expired" }).eq("id", license.id);
      return jsonResponse({ ok: false, message: "LICENSE_EXPIRED" }, 403, origin);
    }
    if (license.bound_telegram_id && Number(license.bound_telegram_id) !== user.id) {
      return jsonResponse({ ok: false, message: "LICENSE_BOUND_TO_ANOTHER_USER" }, 409, origin);
    }

    const { data: existingActivation } = await supabase
      .from("license_activations")
      .select("*")
      .eq("license_id", license.id)
      .eq("telegram_id", user.id)
      .eq("device_hash", deviceHash)
      .maybeSingle();

    if (existingActivation?.is_active) {
      return jsonResponse({
        ok: true,
        message: "LICENSE_ALREADY_ACTIVE",
        license: {
          activationToken: existingActivation.activation_token,
          plan: license.plan,
          expiresAt: existingActivation.expires_at,
          telegramId: user.id,
          activatedAt: existingActivation.activated_at,
          deviceHash
        }
      }, 200, origin);
    }

    const { count: activeDevices, error: countError } = await supabase
      .from("license_activations")
      .select("id", { count: "exact", head: true })
      .eq("license_id", license.id)
      .eq("telegram_id", user.id)
      .eq("is_active", true);
    if (countError) throw countError;

    const deviceLimit = Math.max(1, Number(license.max_devices || 1), Number(license.max_activations || 1));
    if (Number(activeDevices || 0) >= deviceLimit) {
      return jsonResponse({ ok: false, message: "LICENSE_DEVICE_LIMIT" }, 409, origin);
    }

    const activatedAt = new Date();
    let expiresAt: string | null = null;
    if (license.plan !== "lifetime") {
      const days = Number(license.duration_days || 0);
      if (!days) return jsonResponse({ ok: false, message: "LICENSE_DURATION_INVALID" }, 500, origin);
      expiresAt = new Date(activatedAt.getTime() + days * 86400000).toISOString();
    }

    const activationToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const { data: activation, error: activationError } = await supabase
      .from("license_activations")
      .upsert({
        license_id: license.id,
        telegram_id: user.id,
        activation_token: activationToken,
        device_hash: deviceHash,
        activated_at: activatedAt.toISOString(),
        last_checked_at: activatedAt.toISOString(),
        expires_at: expiresAt,
        is_active: true
      }, { onConflict: "license_id,telegram_id,device_hash" })
      .select("*")
      .single();
    if (activationError) throw activationError;

    const newCount = Number(license.activation_count || 0) + 1;
    const { error: updateError } = await supabase.from("license_keys").update({
      bound_telegram_id: user.id,
      activated_at: license.activated_at || activatedAt.toISOString(),
      activation_count: newCount,
      status: "active"
    }).eq("id", license.id);
    if (updateError) throw updateError;

    await supabase.from("app_events").insert({
      telegram_id: user.id,
      event_name: "license_activated",
      page: "license",
      data: { license_id: license.id, plan: license.plan, device_hash: deviceHash }
    });

    await sendActivationMessage(botToken, user.id, license.plan, activation.expires_at);

    return jsonResponse({
      ok: true,
      message: "LICENSE_ACTIVATED",
      license: {
        activationToken: activation.activation_token,
        plan: license.plan,
        expiresAt: activation.expires_at,
        telegramId: user.id,
        activatedAt: activation.activated_at,
        deviceHash
      }
    }, 200, origin);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return jsonResponse({ ok: false, message }, message.startsWith("TELEGRAM_") ? 401 : 500, origin);
  }
});
