import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, verifyTelegramInitData } from "../_shared/telegram.ts";

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ ok: false, message: "METHOD_NOT_ALLOWED" }, 405, origin);

  try {
    const body = await request.json();
    const user = await verifyTelegramInitData(String(body?.initData || ""), Deno.env.get("TELEGRAM_BOT_TOKEN") || "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } }
    );

    const { data: existing } = await supabase
      .from("app_users")
      .select("launch_count,referred_by")
      .eq("telegram_id", user.id)
      .maybeSingle();

    const referralCode = `U${user.id.toString(36).toUpperCase()}`;
    const startParam = String(body?.startParam || "");
    const referredBy = startParam.startsWith("ref_") ? startParam.slice(4, 80) : existing?.referred_by || null;

    const { error } = await supabase.from("app_users").upsert({
      telegram_id: user.id,
      username: user.username || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      language_code: user.language_code || null,
      last_seen_at: new Date().toISOString(),
      launch_count: Number(existing?.launch_count || 0) + 1,
      referral_code: referralCode,
      referred_by: referredBy,
      metadata: {
        platform: String(body?.platform || "").slice(0, 40),
        version: String(body?.version || "").slice(0, 40),
        app_version: String(body?.appVersion || "").slice(0, 40)
      }
    }, { onConflict: "telegram_id" });
    if (error) throw error;

    if (referredBy && !existing?.referred_by) {
      const { data: referrer } = await supabase
        .from("app_users")
        .select("telegram_id")
        .eq("referral_code", referredBy)
        .maybeSingle();
      if (referrer && Number(referrer.telegram_id) !== user.id) {
        await supabase.from("referrals").upsert({
          referrer_telegram_id: referrer.telegram_id,
          referred_telegram_id: user.id,
          referral_code: referredBy
        }, { onConflict: "referred_telegram_id" });
      }
    }

    await supabase.from("app_events").insert({
      telegram_id: user.id,
      event_name: String(body?.eventName || "app_open").slice(0, 80),
      page: String(body?.page || "").slice(0, 120),
      game: String(body?.game || "").slice(0, 80),
      data: typeof body?.data === "object" && body.data ? body.data : {}
    });

    return jsonResponse({ ok: true, user: { telegramId: user.id, referralCode } }, 200, origin);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return jsonResponse({ ok: false, message }, message.startsWith("TELEGRAM_") ? 401 : 500, origin);
  }
});
