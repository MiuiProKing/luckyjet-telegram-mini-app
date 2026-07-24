import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_URL = "https://crash-gateway-grm-cr.100hp.app/state";
const CUSTOMER_ID = "077dee8d-c923-4c02-9bee-757573662e69";
const SESSION_ID = "933841e0-8e4f-4513-9ef1-852096c0e566";
const LAST_COEF_MIN = 1.5;

Deno.serve(async (req) => {
  const headers = { "content-type": "application/json", "access-control-allow-origin": "*" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  const expected = Deno.env.get("BETA_AI_CRON_SECRET") || "";
  if (expected && req.headers.get("x-cron-secret") !== expected) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const api = await fetch(API_URL, {
      headers: { "customer-id": CUSTOMER_ID, "session-id": SESSION_ID, accept: "application/json" },
    });
    if (!api.ok) throw new Error(`LuckyJet API ${api.status}`);
    const raw = await api.json();
    const value = Number(raw?.stopCoefficients?.[0]);
    if (!Number.isFinite(value)) return new Response(JSON.stringify({ ok: true, skipped: "NO_COEFFICIENT" }), { headers });
    const coefficient = Number((value === 1 ? 1.01 : value).toFixed(2));
    const sourceTime = String(raw?.currentTime ?? raw?.roundConfig?.id ?? "");
    const bucket = Math.floor(Date.now() / 45000);
    const roundKey = String(raw?.roundConfig?.id ?? raw?.currentTime ?? `${coefficient}-${bucket}`);

    const { data: inserted, error: insertError } = await sb
      .from("beta_ai_rounds")
      .upsert({ round_key: roundKey, coefficient, source_time: sourceTime, raw }, { onConflict: "round_key", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (insertError) throw insertError;
    if (!inserted) return new Response(JSON.stringify({ ok: true, skipped: "DUPLICATE_ROUND" }), { headers });

    const { data: open, error: openError } = await sb.from("beta_ai_signals").select("*").eq("status", "open").maybeSingle();
    if (openError) throw openError;

    if (open) {
      const checked = Number(open.checked_rounds || 0) + 1;
      const win = coefficient >= Number(open.target);
      const loss = !win && checked >= 3;
      const patch: Record<string, unknown> = { checked_rounds: checked, result_coefficient: coefficient };
      if (win || loss) Object.assign(patch, { status: win ? "win" : "loss", resolved_at: new Date().toISOString() });
      const { error } = await sb.from("beta_ai_signals").update(patch).eq("id", open.id);
      if (error) throw error;
    }

    const { data: stillOpen } = await sb.from("beta_ai_signals").select("id").eq("status", "open").maybeSingle();
    if (!stillOpen) {
      const { data: recent, error } = await sb.from("beta_ai_rounds").select("id,coefficient").order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      const window = (recent || []).map((r) => Number(r.coefficient));
      if (window.length >= 5 && window.filter((c) => c > LAST_COEF_MIN).length >= 3) {
        const target = Number((2 + Math.random() * 1.5).toFixed(2));
        const { error: signalError } = await sb.from("beta_ai_signals").insert({ target, source_round_id: recent?.[0]?.id });
        if (signalError && signalError.code !== "23505") throw signalError;
      }
    }

    return new Response(JSON.stringify({ ok: true, coefficient, round_key: roundKey }), { headers });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers });
  }
});
