import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, verifyTelegramInitData } from "../_shared/telegram.ts";

function adminIds(): number[] {
  return String(Deno.env.get("ADMIN_TELEGRAM_IDS") || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter(Number.isSafeInteger);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ ok: false, message: "METHOD_NOT_ALLOWED" }, 405, origin);

  try {
    const body = await request.json();
    const user = await verifyTelegramInitData(String(body?.initData || ""), Deno.env.get("TELEGRAM_BOT_TOKEN") || "");
    if (!adminIds().includes(user.id)) return jsonResponse({ ok: false, message: "ADMIN_ACCESS_DENIED" }, 403, origin);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } }
    );

    const action = String(body?.action || "");
    const payload = body?.payload || {};

    if (action === "stats") {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const week = new Date(Date.now() - 7 * 86400000).toISOString();
      const month = new Date(Date.now() - 30 * 86400000).toISOString();

      const [users, todayUsers, weekUsers, monthUsers, licenses, activeActivations] = await Promise.all([
        supabase.from("app_users").select("telegram_id", { count: "exact", head: true }),
        supabase.from("app_users").select("telegram_id", { count: "exact", head: true }).gte("first_seen_at", today.toISOString()),
        supabase.from("app_users").select("telegram_id", { count: "exact", head: true }).gte("last_seen_at", week),
        supabase.from("app_users").select("telegram_id", { count: "exact", head: true }).gte("last_seen_at", month),
        supabase.from("license_keys").select("id", { count: "exact", head: true }),
        supabase.from("license_activations").select("id", { count: "exact", head: true }).eq("is_active", true)
      ]);

      return jsonResponse({
        ok: true,
        stats: {
          users: users.count || 0,
          newToday: todayUsers.count || 0,
          activeWeek: weekUsers.count || 0,
          activeMonth: monthUsers.count || 0,
          licenses: licenses.count || 0,
          activeLicenses: activeActivations.count || 0
        }
      }, 200, origin);
    }

    if (action === "list_users") {
      const limit = Math.min(200, Math.max(1, Number(payload.limit) || 50));
      const { data, error } = await supabase
        .from("app_users")
        .select("telegram_id,username,first_name,last_name,language_code,first_seen_at,last_seen_at,launch_count,is_blocked,referral_code")
        .order("last_seen_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return jsonResponse({ ok: true, users: data || [] }, 200, origin);
    }

    if (action === "list_licenses") {
      const limit = Math.min(200, Math.max(1, Number(payload.limit) || 100));
      const { data, error } = await supabase
        .from("license_keys")
        .select("id,license_key,plan,duration_days,max_activations,activation_count,bound_telegram_id,status,created_at,expires_at,activated_at,note")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return jsonResponse({ ok: true, licenses: data || [] }, 200, origin);
    }

    if (action === "create_license") {
      const plan = String(payload.plan || "pro_30");
      const maxActivations = Math.min(10, Math.max(1, Number(payload.maxActivations) || 1));
      const note = String(payload.note || "").slice(0, 500) || null;
      const { data, error } = await supabase.rpc("create_license", {
        p_plan: plan,
        p_duration_days: payload.durationDays ? Number(payload.durationDays) : null,
        p_max_activations: maxActivations,
        p_note: note,
        p_created_by: user.id
      });
      if (error) throw error;
      return jsonResponse({ ok: true, license: data }, 200, origin);
    }

    if (action === "revoke_license") {
      const licenseId = String(payload.licenseId || "");
      if (!licenseId) return jsonResponse({ ok: false, message: "LICENSE_ID_REQUIRED" }, 400, origin);
      const { error } = await supabase.from("license_keys").update({ status: "revoked" }).eq("id", licenseId);
      if (error) throw error;
      await supabase.from("license_activations").update({ is_active: false }).eq("license_id", licenseId);
      return jsonResponse({ ok: true, message: "LICENSE_REVOKED" }, 200, origin);
    }

    if (action === "extend_license") {
      const licenseId = String(payload.licenseId || "");
      const days = Math.min(3650, Math.max(1, Number(payload.days) || 30));
      const { data: activations, error: readError } = await supabase
        .from("license_activations")
        .select("id,expires_at")
        .eq("license_id", licenseId)
        .eq("is_active", true);
      if (readError) throw readError;
      for (const activation of activations || []) {
        const base = activation.expires_at && new Date(activation.expires_at).getTime() > Date.now()
          ? new Date(activation.expires_at).getTime()
          : Date.now();
        await supabase.from("license_activations").update({ expires_at: new Date(base + days * 86400000).toISOString() }).eq("id", activation.id);
      }
      return jsonResponse({ ok: true, message: "LICENSE_EXTENDED" }, 200, origin);
    }

    if (action === "block_user") {
      const telegramId = Number(payload.telegramId);
      const blocked = Boolean(payload.blocked);
      if (!Number.isSafeInteger(telegramId)) return jsonResponse({ ok: false, message: "TELEGRAM_ID_INVALID" }, 400, origin);
      const { error } = await supabase.from("app_users").update({ is_blocked: blocked }).eq("telegram_id", telegramId);
      if (error) throw error;
      if (blocked) await supabase.from("license_activations").update({ is_active: false }).eq("telegram_id", telegramId);
      return jsonResponse({ ok: true, message: blocked ? "USER_BLOCKED" : "USER_UNBLOCKED" }, 200, origin);
    }

    return jsonResponse({ ok: false, message: "UNKNOWN_ACTION" }, 400, origin);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return jsonResponse({ ok: false, message }, message.startsWith("TELEGRAM_") ? 401 : 500, origin);
  }
});
