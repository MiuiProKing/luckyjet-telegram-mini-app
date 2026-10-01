import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const API="https://crash-gateway-grm-cr.gamedev-tech.cc/state";
const LIVE_API="https://crash-gateway-grm-cr.gamedev-tech.cc";
const LIVE_WS="wss://crash-gateway-grm-cr.gamedev-tech.cc/websocket/lifecycle";
const PAGE_ORIGIN="https://miuiproking.github.io";
const GAME_ORIGIN="https://1play.gamedev-tech.cc";
const FALLBACK_CUSTOMER="077dee8d-c923-4c02-9bee-757573662e69";
const TABLE="luckyjet_rounds";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-collector-token","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function pick(value:any,keys:string[]){for(const key of keys)if(value&&value[key]!=null)return value[key];return null}
function parseCoefficient(value:any,depth=0):number|null{if(depth>5||value==null)return null;if(Array.isArray(value)){for(const item of value){const found=parseCoefficient(item,depth+1);if(found!=null)return found}return null}if(typeof value==="object"){for(const [key,nested] of Object.entries(value)){if(/coef|multiplier|value|crash|stop|final/i.test(key)){const found=parseCoefficient(nested,depth+1);if(found!=null)return found}}return null}const n=Number(String(value).toLowerCase().replace("x","").trim());return Number.isFinite(n)&&n>=1?Math.round(n*100)/100:null}
function parseTime(value:any):number{if(value==null)return 0;if(typeof value==="number"||/^[0-9]+$/.test(String(value))){const n=Number(value);return n<10_000_000_000?n*1000:n}const t=Date.parse(String(value));return Number.isFinite(t)?t:0}
function database(){const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!url||!key)throw new Error("DATABASE_NOT_CONFIGURED");return createClient(url,key,{auth:{persistSession:false}})}
async function readHistory(url:URL){const limit=Math.min(5000,Math.max(1,Number.parseInt(url.searchParams.get("limit")||"100",10)||100)),offset=Math.max(0,Number.parseInt(url.searchParams.get("offset")||"0",10)||0);const {data,error,count}=await database().from(TABLE).select("id,coefficient,round_timestamp,estimated",{count:"exact"}).order("round_timestamp",{ascending:false}).range(offset,offset+limit-1);if(error)throw error;const history=(data||[]).map((row:any)=>({id:row.id,topCoefficient:Number(row.coefficient),coefficient:Number(row.coefficient),timestamp:Date.parse(row.round_timestamp),round_timestamp:row.round_timestamp,estimated:Boolean(row.estimated)}));return{ok:true,history,total:count||0,offset,limit,nextOffset:offset+history.length,hasMore:offset+history.length<(count||0),updatedAt:history[0]?.timestamp||0}}
async function saveRound(coefficient:number,rawTime:unknown,rawId?:unknown){const timestamp=parseTime(rawTime)||Date.now(),id=String(rawId??("live-"+timestamp+"-"+coefficient)).slice(0,120);const {error}=await database().from(TABLE).upsert({id,coefficient,round_timestamp:new Date(timestamp).toISOString(),estimated:!rawTime},{onConflict:"id"});if(error)throw error;return{id,topCoefficient:coefficient,coefficient,timestamp,round_timestamp:new Date(timestamp).toISOString(),estimated:!rawTime}}
function findToken(value:any,depth=0):string|null{if(depth>6||value==null)return null;if(typeof value==="string")return/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)?value:null;if(Array.isArray(value)){for(const item of value){const token=findToken(item,depth+1);if(token)return token}return null}if(typeof value!=="object")return null;const entries=Object.entries(value);for(const [key,nested]of entries){if(/token|jwt/i.test(key)){const token=findToken(nested,depth+1);if(token)return token}}for(const [,nested]of entries){const token=findToken(nested,depth+1);if(token)return token}return null}
async function liveToken(){const sessionId=(Deno.env.get("LUCKYJET_SESSION_ID")||"").trim();if(!/^[0-9a-f-]{32,64}$/i.test(sessionId))throw new Error("SESSION_NOT_CONFIGURED");const customerId=(Deno.env.get("LUCKYJET_CUSTOMER_ID")||FALLBACK_CUSTOMER).trim(),headers={"customer-id":customerId,"session-id":sessionId,"accept":"application/json","content-type":"application/json","origin":GAME_ORIGIN,"referer":GAME_ORIGIN+"/"};const auth=await fetch(LIVE_API+"/user/auth",{method:"POST",headers,body:"{}",cache:"no-store"}),authText=await auth.text();if(!auth.ok)throw new Error("GAME_AUTH_HTTP_"+auth.status);let authData:any=null;try{authData=JSON.parse(authText)}catch{}const tokenHeaders:Record<string,string>={...headers},authToken=findToken(authData);if(authToken)tokenHeaders.authorization="Bearer "+authToken;const cookie=auth.headers.get("set-cookie");if(cookie)tokenHeaders.cookie=cookie;const tokenResponse=await fetch(LIVE_API+"/user/token",{method:"POST",headers:tokenHeaders,body:"{}",cache:"no-store"}),tokenText=await tokenResponse.text();if(!tokenResponse.ok)throw new Error("GAME_TOKEN_HTTP_"+tokenResponse.status);let tokenData:any=tokenText;try{tokenData=JSON.parse(tokenText)}catch{}const token=findToken(tokenData)||(typeof tokenData==="string"&&tokenData.length>30?tokenData:null);if(!token)throw new Error("GAME_TOKEN_MISSING");return token}
function liveStream(request:Request):Response{if(request.headers.get("origin")!==PAGE_ORIGIN)return reply({ok:false,error:"ORIGIN_NOT_ALLOWED"},403);if((request.headers.get("upgrade")||"").toLowerCase()!=="websocket")return reply({ok:false,error:"WEBSOCKET_REQUIRED"},426);const {socket:client,response}=Deno.upgradeWebSocket(request);let upstream:WebSocket|null=null,ended=false,lifetime:ReturnType<typeof setTimeout>|undefined,resolveDone:()=>void=()=>{};const done=new Promise<void>(resolve=>{resolveDone=resolve});const stop=(code=1000,reason="stream ended")=>{if(ended)return;ended=true;if(lifetime)clearTimeout(lifetime);try{upstream?.close()}catch{}try{if(client.readyState===WebSocket.OPEN)client.close(code,reason)}catch{}resolveDone()};client.onclose=()=>stop();client.onerror=()=>stop(1011,"client socket error");const work=(async()=>{try{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify({type:"status",status:"connecting"}));const token=await liveToken();if(ended)return;upstream=new WebSocket(LIVE_WS);await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error("GAME_SOCKET_TIMEOUT")),8000);upstream!.onopen=()=>{clearTimeout(timeout);resolve()};upstream!.onerror=()=>{clearTimeout(timeout);reject(new Error("GAME_SOCKET_FAILED"))}});if(ended||!upstream)return;lifetime=setTimeout(()=>stop(1000,"refresh stream"),110000);upstream.onmessage=event=>{void(async()=>{let frame:any;try{frame=JSON.parse(String(event.data))}catch{return}if(frame?.connect?.error){client.send(JSON.stringify({type:"status",status:"upstream_error"}));stop(1011,"upstream rejected stream");return}if(frame?.connect&&client.readyState===WebSocket.OPEN)client.send(JSON.stringify({type:"status",status:"connected"}));const data=frame?.push?.pub?.data;if(!data||data.eventType!=="endGame")return;const values=Array.isArray(data.finalCoefficientValues)?data.finalCoefficientValues:[data.finalCoefficientValues];for(const value of values){const coefficient=parseCoefficient(value);if(coefficient==null)continue;const round=await saveRound(coefficient,data.currentTime,data.roundId??data.round_id);if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify({type:"round",round}))}})().catch(()=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify({type:"status",status:"save_error"}))})};upstream.onclose=()=>stop(1011,"upstream closed");upstream.onerror=()=>stop(1011,"upstream socket error");upstream.send(JSON.stringify({id:1,connect:{token,name:"js"}}));await done}catch(error){const message=error instanceof Error?error.message:"LIVE_STREAM_FAILED";console.error("live stream setup failed",message);if(client.readyState===WebSocket.OPEN){client.send(JSON.stringify({type:"status",status:"fallback"}));client.close(1011,"live stream unavailable")}stop(1011,"live stream unavailable")}finally{if(lifetime)clearTimeout(lifetime);try{upstream?.close()}catch{}}})();(globalThis as any).EdgeRuntime?.waitUntil(work);return response}
function historyItems(body: any): any[] {
  if (Array.isArray(body)) return body;
  for (const key of ["history", "rounds", "items", "results", "data", "stopCoefficients"]) {
    if (Array.isArray(body?.[key])) return body[key];
    if (body?.[key] && typeof body[key] === "object") {
      const nested = historyItems(body[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

async function syncPage() {
  const sessionId = (Deno.env.get("LUCKYJET_SESSION_ID") || "").trim();
  if (!/^[0-9a-f-]{32,64}$/i.test(sessionId)) throw new Error("SESSION_NOT_CONFIGURED");
  const customerId = (Deno.env.get("LUCKYJET_CUSTOMER_ID") || FALLBACK_CUSTOMER).trim();
  const configured = Deno.env.get("LUCKYJET_HISTORY_URL");
  const urls = [...new Set([configured, LIVE_API + "/history", "https://crash-gateway-grm-cr.100hp.app/history"].filter(Boolean))] as string[];
  let items: any[] = [], source = "", failure = "HISTORY_EMPTY";
  for (const endpoint of urls) {
    try {
      const response = await fetch(endpoint, {
        headers: {"customer-id":customerId,"session-id":sessionId,accept:"application/json",origin:GAME_ORIGIN,referer:GAME_ORIGIN+"/"},
        cache:"no-store", signal:AbortSignal.timeout(10000)
      });
      if (!response.ok) { failure = "HISTORY_HTTP_" + response.status; continue; }
      items = historyItems(await response.json());
      if (items.length) { source = endpoint; break; }
    } catch (error) { failure = error instanceof Error ? error.message : "HISTORY_FETCH_FAILED"; }
  }
  if (!items.length) throw new Error(failure);
  const db = database(), unique = new Map<string, any>(), now = Date.now();
  let skipped = 0;
  for (let index = 0; index < items.length; index++) {
    const raw = items[index], coefficient = parseCoefficient(raw);
    const rawId = pick(raw,["id","round_id","roundId","_id","gameId","hash"]);
    const rawTime = pick(raw,["round_timestamp","played_at","createdAt","created_at","timestamp","time","endedAt","ended_at","startTime","start_time"]);
    const time = parseTime(rawTime);
    if (coefficient == null || (rawId == null && !time)) { skipped++; continue; }
    // Never use the parent current-game ID or deduplicate by multiplier alone.
    // Timestamp-free entries use their stable upstream ID; ignoreDuplicates
    // keeps the first observation time intact on later history refreshes.
    const id = String(rawId ?? ("history-"+time+"-"+coefficient)).slice(0,120);
    if (!unique.has(id)) unique.set(id,{id,coefficient,round_timestamp:new Date(time || now-index).toISOString(),estimated:!time});
  }
  if (!unique.size) throw new Error("HISTORY_WITHOUT_IDENTITIES");
  const rows = [...unique.values()].sort((a,b)=>a.round_timestamp.localeCompare(b.round_timestamp));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 250) {
    const {data,error} = await db.from(TABLE).upsert(rows.slice(i,i+250),{onConflict:"id",ignoreDuplicates:true}).select("id");
    if (error) throw error;
    inserted += data?.length || 0;
  }
  return {received:items.length,identified:rows.length,inserted,skipped,source,checkedAt:new Date().toISOString()};
}

async function collect(request: Request) {
  const token = Deno.env.get("COLLECTOR_TOKEN") || "";
  if (!token || request.headers.get("x-collector-token") !== token) return reply({ok:false,error:"UNAUTHORIZED"},401);
  const sync = await syncPage();
  return reply({ok:true,...sync});
}

Deno.serve(async request=>{if(request.method==="OPTIONS")return new Response("ok",{headers:cors});try{const url=new URL(request.url);if(request.method==="GET"&&url.searchParams.get("mode")==="live")return liveStream(request);if(request.method==="GET"&&url.searchParams.get("mode")==="sync"){const origin=request.headers.get("origin")||"";if(origin!==PAGE_ORIGIN)return reply({ok:false,error:"ORIGIN_NOT_ALLOWED"},403);return reply({...await readHistory(url),sync:{scheduled:true,intervalSeconds:30}})}if(request.method==="GET")return reply(await readHistory(url));if(request.method==="POST")return await collect(request);return reply({ok:false,error:"METHOD_NOT_ALLOWED"},405)}catch(error){const message=error instanceof Error?error.message:"UNKNOWN_ERROR";console.error("v0xff3-live",message);return reply({ok:false,error:/^(DATABASE_NOT_CONFIGURED|SESSION_NOT_CONFIGURED|HISTORY_[A-Z0-9_]+)$/.test(message)?message:"COLLECTOR_FAILED"},502)}});