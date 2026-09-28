import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SOURCE = "https://crash-gateway-grm-cr.100hp.app/history";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,x-collector-token", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const db = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const value = (r: any, keys: string[]) => keys.map(k => r?.[k]).find(v => v !== null && v !== undefined);
function normalize(r: any, position: number) {
  const id = value(r,["id","roundId","round_id","uuid"]);
  const finals = Array.isArray(r?.finalValues) ? r.finalValues : [];
  const coefficient = Number(value(r,["topCoefficient","coefficient","coef","crash","value","multiplier"]) ?? finals[0]);
  if ((typeof id !== "string" && typeof id !== "number") || !String(id).trim() || String(id).length > 256 || !Number.isFinite(coefficient) || coefficient < 1 || coefficient > 1000000) return null;
  // /history contains stable round IDs and coefficients but no round timestamp.
  // Store first-observed time explicitly; never present it as the actual round time.
  const observedAt = new Date().toISOString();
  return { id: String(id), coefficient, round_timestamp: observedAt, observed_at: observedAt, source_position: position, estimated: true, source: "astronaut-history" };
}
async function status(database: any, text: string, received = 0, rejected = 0, upstream: number | null = null) {
  const { error } = await database.from("astronaut_collector_status").upsert({ id:1, status:text, checked_at:new Date().toISOString(), received, rejected, upstream_status:upstream });
  if(error) throw new Error("STATUS_WRITE_FAILED");
}
Deno.serve(async request => {
  if(request.method === "OPTIONS") return new Response("ok",{headers:cors});
  const database = db();
  try {
    if(request.method === "GET") {
      const url = new URL(request.url), limit=Math.min(1000,Math.max(1,parseInt(url.searchParams.get("limit")||"100")||100)), offset=Math.max(0,parseInt(url.searchParams.get("offset")||"0")||0);
      const {data,error,count} = await database.from("astronaut_rounds").select("id,coefficient,round_timestamp,observed_at,source_position,estimated",{count:"exact"}).order("observed_at",{ascending:false}).order("source_position",{ascending:true}).order("id",{ascending:true}).range(offset,offset+limit-1);
      if(error) return reply({ok:false,error:"ASTRONAUT_DATABASE_NOT_READY"},503);
      const {data:collector} = await database.from("astronaut_collector_status").select("status,checked_at,received,rejected,upstream_status").eq("id",1).maybeSingle();
      const history=(data||[]).map(r=>({...r,coefficient:Number(r.coefficient),topCoefficient:Number(r.coefficient),timestamp:Date.parse(r.observed_at || r.round_timestamp),estimated:true}));
      return reply({ok:true,game:"astronaut",history,total:count||0,offset,limit,nextOffset:offset+history.length,hasMore:offset+history.length<(count||0),collector,updatedAt:history[0]?.timestamp||0});
    }
    if(request.method !== "POST") return reply({ok:false,error:"METHOD_NOT_ALLOWED"},405);
    const token=Deno.env.get("ASTRO_COLLECTOR_TOKEN");
    if(!token || request.headers.get("x-collector-token") !== token) return reply({ok:false,error:"UNAUTHORIZED"},401);
    const session=Deno.env.get("ASTRO_SESSION_ID"), customer=Deno.env.get("ASTRO_CUSTOMER_ID");
    if(!session || !customer || Deno.env.get("ASTRO_SOURCE_CONFIRMED") !== "true") {
      await status(database,"Источник Astronaut не настроен или не подтверждён");
      return reply({ok:false,error:"ASTRONAUT_SOURCE_NOT_CONFIGURED"},503);
    }
    const upstream=await fetch(SOURCE,{headers:{"customer-id":customer,"session-id":session,accept:"application/json",origin:"https://allpredictor.com",referer:"https://allpredictor.com/"},signal:AbortSignal.timeout(10000)});
    if(!upstream.ok) { await status(database,"Источник Astronaut: HTTP "+upstream.status,0,0,upstream.status);return reply({ok:false,error:"UPSTREAM_HTTP_"+upstream.status},502); }
    const raw=await upstream.json();
    if(!Array.isArray(raw)) { await status(database,"Неизвестный формат истории Astronaut");return reply({ok:false,error:"HISTORY_FORMAT_UNKNOWN"},502); }
    const records=raw.map((row,index)=>normalize(row,index)), valid=new Map(records.filter(Boolean).map(r=>[r!.id,r!])), rejected=records.filter(r=>!r).length;
    if(raw.length && !valid.size) { await status(database,"В ответе нет корректных ID/коэффициентов",raw.length,rejected);return reply({ok:false,error:"ROUND_ID_OR_COEFFICIENT_REQUIRED",received:raw.length,rejected},422); }
    const rows=Array.from(valid.values());
    for(let i=0;i<rows.length;i+=500){const {error}=await database.from("astronaut_rounds").upsert(rows.slice(i,i+500),{onConflict:"id",ignoreDuplicates:true});if(error)throw new Error("ROUND_WRITE_FAILED");}
    await status(database,rejected?"Часть записей пропущена: нет корректного ID или коэффициента":"ok · время наблюдения",raw.length,rejected,upstream.status);
    return reply({ok:true,received:raw.length,accepted:rows.length,rejected});
  } catch(error) {
    console.error("Astronaut collector failure:",error instanceof Error ? error.name : "unknown");
    return reply({ok:false,error:"ASTRONAUT_REQUEST_FAILED"},503);
  }
});
