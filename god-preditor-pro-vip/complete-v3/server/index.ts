import {planSnapshot,SCHEDULER_VERSION} from '../shared/scheduler.mjs';

const CORS={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 'Access-Control-Allow-Methods':'POST,GET,OPTIONS',
 'Access-Control-Expose-Headers':'date,etag,x-model-version',
};
const API=Deno.env.get('SUPABASE_URL')??'';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
let warmRows:any[]=[];
let fullHeadAt=0;
let lastHeadAt=0;
let cachedSnapshot:any=null;
let cachedSnapshotAt=0;

async function rpc(name:string,args:Record<string,unknown>={}){
 const response=await fetch(API+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(30000)});
 if(!response.ok){await response.arrayBuffer();throw new Error('database_rpc:'+name+':'+response.status);}
 return await response.json();
}
function stamp(value:any){if(typeof value==='number')return value;return Date.parse(String(value));}
function merge(input:any[],now:number){
 const found=new Map();for(const r of [...input,...warmRows]){
  const at=stamp(r.round_timestamp??r.timestamp),x=Number(r.coefficient);
  if(!r.id||r.completed!==true||r.estimated!==false||!Number.isFinite(at)||at>now||!Number.isFinite(x)||x<1)continue;
  if(!found.has(String(r.id)))found.set(String(r.id),{...r,timestamp:at});
 }
 warmRows=[...found.values()].sort((a:any,b:any)=>b.timestamp-a.timestamp||String(b.id).localeCompare(String(a.id))).slice(0,5000);
}
async function head(now:number){
 if(!warmRows.length||now-fullHeadAt>60000){const rows=await rpc('god_complete_v3_head',{p_limit:5000});merge(rows,now);fullHeadAt=now;lastHeadAt=now;}
 else if(now-lastHeadAt>3500){const rows=await rpc('god_complete_v3_head',{p_limit:100});merge(rows,now);lastHeadAt=now;}
 return warmRows;
}
async function tick(){
 const lock=await rpc('god_complete_v3_acquire');
 if(!lock?.acquired)return {acquired:false};
 try{
  const [rows,analytics]=await Promise.all([head(lock.now),rpc('god_complete_v3_refresh_analytics',{p_zone:'UTC',p_force:false})]);
  const asOf=Math.max(lock.now,Date.now(),Date.parse(analytics.calculatedAt)||0);
  const plan=planSnapshot({now:asOf,rounds:rows,analytics,signals:lock.signals,state:lock.state});
  const result=await rpc('god_complete_v3_commit',{p_lease:lock.lease,p_generation:lock.generation,p_plan:plan});
  cachedSnapshot=null;
  return result;
 }catch(error){await rpc('god_complete_v3_release',{p_lease:lock.lease}).catch(()=>{});throw error;}
}
function requestOptions(url:URL,body:any){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('invalid_request');
 if(Object.keys(body).some(k=>!['action','zone','afterEventId'].includes(k)))throw new Error('unsupported_fields');
 const action=body.action??url.searchParams.get('action')??'snapshot';
 const zone=body.zone??url.searchParams.get('zone')??'Europe/Kyiv';
 const cursor=body.afterEventId??(url.searchParams.has('afterEventId')?Number(url.searchParams.get('afterEventId')):null);
 if(!['snapshot','tick'].includes(action)||!['UTC','Europe/Kyiv'].includes(zone))throw new Error('invalid_request');
 if(cursor!==null&&(!Number.isSafeInteger(cursor)||cursor<0))throw new Error('invalid_event_cursor');
 return {action,zone,cursor};
}
async function json(req:Request,value:any,status=200){
 const plain=new TextEncoder().encode(JSON.stringify(value));
 const headers:any={...CORS,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Model-Version':SCHEDULER_VERSION,'Vary':'Accept-Encoding'};
 if(plain.length>2048&&/\bgzip\b/.test(req.headers.get('accept-encoding')??'')){
  const stream=new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'));
  headers['Content-Encoding']='gzip';return new Response(stream,{status,headers});
 }
 return new Response(plain,{status,headers});
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
 if(req.method!=='POST'&&req.method!=='GET')return json(req,{error:'method_not_allowed'},405);
 try{
  const url=new URL(req.url);let body={};
  if(req.method==='POST'){
   const text=await req.text();if(text.length>4096)return json(req,{error:'request_too_large'},413);
   body=text?JSON.parse(text):{};
  }
  const options=requestOptions(url,body);
  const updated=await tick();
  if(options.action==='tick')return json(req,{ok:true,version:SCHEDULER_VERSION,serverNow:Date.now(),...updated});
  // A caller's display timezone never changes authoritative UTC model inputs.
  if(options.zone!=='UTC')await rpc('god_complete_v3_refresh_analytics',{p_zone:options.zone,p_force:false});
  const clock=Date.now();
  let snapshot;
  if(options.cursor===null&&cachedSnapshot&&cachedSnapshot.zone===options.zone&&clock-cachedSnapshotAt<2500)snapshot={...cachedSnapshot.value};
  else {
   snapshot=await rpc('god_complete_v3_snapshot',{p_zone:options.zone,p_after_event:options.cursor});
   if(options.cursor===null){cachedSnapshot={zone:options.zone,value:snapshot};cachedSnapshotAt=clock;}
  }
  if(!warmRows.length){merge(await rpc('god_complete_v3_head',{p_limit:100}),clock);lastHeadAt=clock;}
  const progress=snapshot.diagnostics?.progress??{};
  const signals=(snapshot.signals??[]).map((s:any)=>({...s,...(progress[s.id]??{})}));
  const channelStatistics=Object.fromEntries((snapshot.statistics?.byChannel??[]).map((s:any)=>[s.channel,{...s,created:s.total}]));
  const diagnostics={...snapshot.diagnostics,channelStatistics,statisticsScope:'all_server_created_signals'};
  const latest=warmRows[0]?.timestamp??0;
  const sample=Number(diagnostics.report?.sampleSize??diagnostics.sampleSize??diagnostics.headSampleSize??warmRows.length);
  const result={...snapshot,signals,diagnostics,serverNow:Date.now(),sourceFresh:!!latest&&Date.now()-latest<=180000,sourceCutoff:latest||null,
   sampleSize:sample,rounds:warmRows.slice(0,100),publicReadOnly:true,
   source:{kind:'own_supabase_exact_completed',historyTotal:snapshot.analytics?.total??0,headSampleSize:warmRows.length},
   protocol:{providerCompletenessVerified:false,roundBasis:'received_exact_rounds',outcomes:'post_close_time_windows',sharedJournal:true},
  };
  return await json(req,result);
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const client=message==='invalid_request'||message==='unsupported_fields'||message==='invalid_event_cursor'||error instanceof SyntaxError;
  // Never expose service credentials, SQL text, row contents or request headers in errors.
  console.error('god-complete-v3',client?'invalid_request':message.split(':').slice(0,3).join(':'));
  return json(req,{error:client?'invalid_request':'snapshot_unavailable',serverNow:Date.now(),version:SCHEDULER_VERSION},client?400:503);
 }
});
