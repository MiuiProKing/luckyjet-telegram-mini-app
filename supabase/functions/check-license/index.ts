import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, verifyTelegramInitData } from "../_shared/telegram.ts";

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ ok: false, message: "METHOD_NOT_ALLOWED" }, 405, origin);

  try {
    const body = await request.json();
    const activationToken = String(body?.activationToken || "").trim();
    const initData = String(body?.initData || "");
    if (!activationToken) return jsonResponse({ ok: false, message: "ACTIVATION_TOKEN_REQUIRED" }, 400, origin);

    const user = await verifyTelegramInitData(initData, Deno.env.get("TELEGRAM_BOT_TOKEN") || "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } }
    );

    const { data: activation, error } = await supabase
      .from("license_activations")
      .select("*, license_keys(*)")
      .eq("activation_token", activationToken)
      .single();

    if (error || !activation) return jsonResponse({ ok: false, message: "LICENSE_NOT_FOUND" }, 404, origin);
    if (Number(activation.telegram_id) !== user.id) return jsonResponse({ ok: false, message: "LICENSE_USER_MISMATCH" }, 403, origin);
    if (!activation.is_active) return jsonResponse({ ok: false, message: "LICENSE_REVOKED" }, 403, origin);
    if (activation.license_keys?.status === "revoked") return jsonResponse({ ok: false, message: "LICENSE_REVOKED" }, 403, origin);
    if (activation.expires_at && new Date(activation.expires_at).getTime() <= Date.now()) {
      await supabase.from("license_activations").update({ is_active: false }).eq("id", activation.id);
      return jsonResponse({ ok: false, message: "LICENSE_EXPIRED" }, 403, origin);
    }

    const now = new Date().toISOString();
    await supabase.from("license_activations").update({ last_checked_at: now }).eq("id", activation.id);
    await supabase.from("app_users").update({ last_seen_at: now }).eq("telegram_id", user.id);

    return jsonResponse({
      ok: true,
      message: "LICENSE_ACTIVE",
      license: {
        activationToken: activation.activation_token,
        plan: activation.license_keys?.plan || "pro",
        expiresAt: activation.expires_at,
        telegramId: user.id,
        activatedAt: activation.activated_at
      }
    }, 200, origin);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return jsonResponse({ ok: false, message }, message.startsWith("TELEGRAM_") ? 401 : 500, origin);
  }
});
