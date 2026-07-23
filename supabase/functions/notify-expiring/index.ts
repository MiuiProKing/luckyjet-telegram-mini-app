import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function sendTelegram(botToken: string, chatId: number, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.description || `TELEGRAM_${response.status}`);
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ ok: false, message: "ACCESS_DENIED" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } }
    );
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    if (!botToken) throw new Error("BOT_TOKEN_MISSING");

    const now = Date.now();
    const from = new Date(now + 2 * 86400000).toISOString();
    const to = new Date(now + 4 * 86400000).toISOString();

    const { data: activations, error } = await supabase
      .from("license_activations")
      .select("id,telegram_id,expires_at,license_keys(plan)")
      .eq("is_active", true)
      .gte("expires_at", from)
      .lte("expires_at", to);
    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    for (const activation of activations || []) {
      const referenceId = String(activation.id);
      const { data: previous } = await supabase
        .from("notification_log")
        .select("id")
        .eq("telegram_id", activation.telegram_id)
        .eq("notification_type", "license_expiring_3d")
        .eq("reference_id", referenceId)
        .maybeSingle();
      if (previous) {
        skipped += 1;
        continue;
      }

      const expires = new Date(activation.expires_at).toLocaleDateString("ru-RU", { timeZone: "Europe/Kyiv" });
      const plan = activation.license_keys?.plan || "PRO";
      const text = [
        "⏳ AllPredictor — подписка заканчивается",
        "",
        `Тариф: ${plan}`,
        `Доступ до: ${expires}`,
        "Для продления напишите @V0xFF3.",
        "",
        "Your AllPredictor subscription expires soon.",
        `Access until: ${expires}`,
        "Contact @V0xFF3 to renew."
      ].join("\n");

      try {
        await sendTelegram(botToken, Number(activation.telegram_id), text);
        await supabase.from("notification_log").insert({
          telegram_id: activation.telegram_id,
          notification_type: "license_expiring_3d",
          reference_id: referenceId,
          payload: { expires_at: activation.expires_at, plan }
        });
        sent += 1;
      } catch (sendError) {
        console.error("Notification failed", activation.telegram_id, sendError);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : "UNKNOWN_ERROR" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
