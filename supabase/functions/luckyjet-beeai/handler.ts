import {analysisContext,REVISION} from './analysis-context.js';
import {RESPONSE_SCHEMA,validate,readinessReason,settle,settingsChange,errorReason,resultReason} from './logic.js';
declare const EdgeRuntime:{waitUntil(task:Promise<unknown>):void};
const key=()=>Deno.env.get('LUCKYJET_MIRROR_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const SYSTEM='Ты отдельный экспериментальный аналитик Lucky Jet. Используй реальные завершённые раунды и точные функции классической страницы из контекста. Это статистические эвристики, а не доказанные вероятности. Не советуй ставить деньги, не обещай будущий коэффициент или точную минуту. Роль и база знаний меняют только стиль и дополнительные факты. Если основания нет, decision observe и target null. Иначе target только из allowed_targets, horizon от 1 до 3 будущих раундов; объяснение на русском. Преимущество ИИ не доказано. Главная цель только ≥10× из allowed_targets. ml_models рассчитаны сервером на 200 завершённых раундах до anchor_id, это не подтверждённые вероятности; не используй оценку другого горизонта или другой цели. Модели не promoted. insurance_target: null при observe; при estimate null или меньшая цель 1.5,2,3,5 по lower_targets и правилам. Меньшая цель не защищает деньги. Объясни выбор в explanation. Не назначай денежные суммы.';
const SCHEMA=RESPONSE_SCHEMA;
async function db(route:string,body?:unknown,method=body===undefined?'GET':'POST'){
 const credential=key(),response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/'+route,{method,headers:{apikey:credential,...(credential.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+credential}),'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('DATABASE_HTTP_'+response.status);const text=await response.text();return text?JSON.parse(text):null;
}
const settings=async()=>(await db('luckyjet_bee_settings?id=eq.true&select=*'))[0];
const update=(body:unknown)=>db('luckyjet_bee_settings?id=eq.true',body,'PATCH');
const workerUpdate=(body:unknown)=>update({...body as Record<string,unknown>,checked_at:new Date().toISOString()});
const source=()=>db('rpc/luckyjet_cloud_status',{});
const rows=(limit=2000,seq?:number)=>db('luckyjet_rounds?select=id,source_seq,coefficient,round_timestamp,estimated,origin,collection_backend,live_received_at&collection_backend=eq.cloud&origin=eq.live&order=source_seq.'+(seq===undefined?'desc':'asc')+'&limit='+limit+(seq===undefined?'':'&source_seq=gt.'+seq));
async function report(){
 const config=await settings(),predictions=await db('luckyjet_bee_predictions?select=id,anchor_id,anchor_seq,created_at,model,target,horizon,insurance_target,status,status_reason,explanation,observed,actual,result_id&order=id.desc&limit=50');
 const modelRecords=await db('luckyjet_bee_predictions?select=model_snapshot:context->ml_models&order=id.desc&limit=1');
 const diagnosticReason=!config.enabled?'paused':config.checked_at&&Date.now()-Date.parse(config.checked_at)>180000?'worker_stale':config.status_reason;
 const stats=await db('rpc/luckyjet_bee_stats',{}),legacy=await db("luckyjet_prediction_journal?source=eq.beeai&select=id"),attempts=await db('luckyjet_bee_attempts?select=outcome&order=requested_at.desc&limit=100');
 return {ok:true,source:'supabase-cloud',enabled:config.enabled,active:!!config.active&&Date.parse(config.lease_until)>Date.now(),message:config.message,status_reason:diagnosticReason,revision:REVISION,diagnostics:{reason:diagnosticReason,checked_at:config.checked_at,retry_at:config.retry_at,next_analysis:config.next_analysis,model_source:'server',model_sample_size:200},model_snapshot:modelRecords[0]?.model_snapshot||null,model:config.model,persona:config.persona,knowledge:config.knowledge,predictions:predictions.map((p:any)=>({...p,created_at:Date.parse(p.created_at)/1000,target:p.target===null?null:Number(p.target),insurance_target:p.status_reason==null?undefined:p.insurance_target==null?null:Number(p.insurance_target),actual:p.actual===null?null:Number(p.actual)})),stats,legacy_count:legacy.length,recent_errors:attempts.filter((a:any)=>a.outcome.endsWith('FAILED')||a.outcome.includes('HTTP')).length,advantage_proven:false,timing_verified:false,key_server_only:true,pc_required:false};
}
async function settlePending(status:any){
 const pending=await db('luckyjet_bee_predictions?status=eq.pending&select=*');
 for(const p of pending){const outcome=settle(p,await rows(3,Number(p.anchor_seq)),status.source_connected&&status.fresh&&!status.error&&!status.gap&&!status.has_gap);await db('luckyjet_bee_predictions?id=eq.'+p.id+'&status=eq.pending',outcome,'PATCH');}
 return (await db('luckyjet_bee_predictions?status=eq.pending&select=id&limit=1')).length>0;
}
export async function generate(config:any,status:any,history:any[]){
 const head=history[0],context=analysisContext(history,status,config),allowed=context.allowed_targets;
 const attempt=crypto.randomUUID();await db('luckyjet_bee_attempts',{id:attempt,anchor_id:head.id,context});
 try{
 const payload={systemInstruction:{parts:[{text:SYSTEM}]},contents:[{role:'user',parts:[{text:JSON.stringify(context)}]}],generationConfig:{temperature:0.1,maxOutputTokens:1200,responseMimeType:'application/json',responseSchema:SCHEMA}};
 const model=Deno.env.get('BEEAI_MODEL')||'';if(!/^[a-zA-Z0-9.\-]+$/.test(model))throw Error('GEMINI_MODEL_REQUIRED');
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':Deno.env.get('BEEAI_GEMINI_KEY')||''},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)});
 if(!response.ok)throw Error('GEMINI_HTTP_'+response.status);
 const reply=await response.json(),text=(reply.candidates?.[0]?.content?.parts||[]).filter((p:any)=>!p.thought).map((p:any)=>p.text||'').join('');
 const value=validate(JSON.parse(text),allowed),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(context))))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const result=await db('rpc/luckyjet_bee_save_v2',{p_anchor:head.id,p_model:model,p_target:value.target,p_horizon:value.horizon,p_decision:value.decision,p_explanation:value.explanation,p_insurance:value.insurance_target,p_digest:digest,p_context:context});
 await db('luckyjet_bee_attempts?id=eq.'+attempt,{outcome:result,finished_at:new Date().toISOString()},'PATCH');
 await workerUpdate({model,active:false,status_reason:resultReason(result),message:result==='late'?'Ответ опоздал: новые раунды не засчитаны':result==='pending'?'Экспериментальная цель записана; преимущество не доказано':'ИИ: наблюдение без рекомендации ставки'});
 }catch(cause){const raw=cause instanceof Error?cause.message:'';const outcome=/^GEMINI_HTTP_\d+$/.test(raw)?raw:'BEE_ANALYSIS_FAILED';await db('luckyjet_bee_attempts?id=eq.'+attempt,{outcome,finished_at:new Date().toISOString()},'PATCH');throw cause;}
}
async function run(){
 const lease=crypto.randomUUID();if(!await db('rpc/luckyjet_bee_claim',{p_lease:lease}))return;
 const until=Date.now()+95000;
 try{while(Date.now()<until){
  const status=await source(),pending=await settlePending(status),config=await settings();
  if(!config.enabled){await workerUpdate({message:'ИИ на паузе',active:false,status_reason:'paused'});break;}
  if(!status.source_connected||!status.fresh||status.error||status.gap||status.has_gap){await workerUpdate({message:'ИИ ожидает свежий источник Supabase',active:false,status_reason:!status.source_connected?'source_disconnected':!status.fresh?'source_stale':'source_gap'});break;}
  if(!pending&&Date.now()+35000<until&&(!Number.isFinite(Date.parse(config.retry_at))||Date.now()>=Date.parse(config.retry_at))&&(!Number.isFinite(Date.parse(config.next_analysis))||Date.now()>=Date.parse(config.next_analysis))){
   const history=await rows();
   const reason=readinessReason(status,history);
   if(reason){await workerUpdate({message:'ИИ ожидает подтверждённые облачные LIVE раунды',active:false,status_reason:reason});break;}
   const duplicate=await db('luckyjet_bee_predictions?anchor_id=eq.'+encodeURIComponent(history[0].id)+'&select=id&limit=1');
   if(!duplicate.length){await workerUpdate({active:true,status_reason:'analyzing',message:'Gemini анализирует свежие раунды Supabase',next_analysis:new Date(Date.now()+60000).toISOString()});await generate(config,status,history);}
  }
  await workerUpdate(pending?{status_reason:'waiting_result'}:{});await new Promise(resolve=>setTimeout(resolve,2000));
 }}catch(cause){const raw=cause instanceof Error?cause.message:'';const code=/^(GEMINI|DATABASE)_HTTP_\d+$/.test(raw)?raw:'BEE_ANALYSIS_FAILED';await workerUpdate({active:false,message:code,status_reason:errorReason(code),retry_at:new Date(Date.now()+(/_(401|403|429)$/.test(code)?600000:120000)).toISOString()});}
 finally{await db('luckyjet_bee_settings?id=eq.true&lease_id=eq.'+lease,{active:false,lease_until:new Date().toISOString()},'PATCH');}
}
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,apikey,authorization,x-bee-access','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'};
export async function handler(request:Request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const secret=Deno.env.get('LUCKYJET_COLLECTOR_TOKEN');
 if(secret&&request.method==='POST'&&request.headers.get('x-collector-token')===secret){EdgeRuntime.waitUntil(run().catch(()=>{}));return Response.json({ok:true,started:true},{headers:cors});}
 const access=Deno.env.get('BEEAI_ACCESS_TOKEN');
 if(!access||request.headers.get('x-bee-access')!==access)return Response.json({ok:false,error:'BEE_ACCESS_REQUIRED'},{status:403,headers:cors});
 try{
  if(request.method==='POST'){const text=await request.text();if(text.length>15000)throw Error('BEE_INVALID_SETTINGS');const change=settingsChange(JSON.parse(text));await update({...change,...('enabled' in change?{status_reason:change.enabled?'waiting_schedule':'paused'}:{})});}
  else if(request.method!=='GET')return new Response(null,{status:405,headers:cors});
  return Response.json(await report(),{headers:cors});
 }catch{return Response.json({ok:false,error:'BEE_REQUEST_FAILED'},{status:400,headers:cors});}
}
