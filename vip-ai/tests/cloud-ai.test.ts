import {generate,handler} from '../../supabase/functions/luckyjet-beeai/handler.ts';
const env={SUPABASE_URL:'https://example.supabase.co',LUCKYJET_MIRROR_KEY:'test-server-only',BEEAI_GEMINI_KEY:'test-ai-only',BEEAI_MODEL:'gemini-test',BEEAI_ACCESS_TOKEN:'test-access'};
for(const [k,v] of Object.entries(env))Deno.env.set(k,v);
const now=Date.now(),history=Array.from({length:210},(_,i)=>({id:'r'+i,coefficient:i%7?1.8:12,source_seq:10000-i*5,origin:'live',collection_backend:'cloud',live_received_at:new Date(now-i*30000).toISOString(),round_timestamp:new Date(now-i*30000).toISOString(),estimated:false}));
const status={source_connected:true,fresh:true},config={enabled:true,active:false,knowledge:'Мои факты',persona:'Мой стиль',model:'gemini-test',status_reason:'observing_no_basis',checked_at:new Date().toISOString()};
function check(ok:unknown,msg:string){if(!ok)throw Error(msg)}
async function mock(fn:(calls:any[])=>Promise<void>,reply:any={decision:'estimate',target:10,horizon:3,insurance_target:2,explanation:'Структурированный ответ'},http=200){
 const original=globalThis.fetch,calls:any[]=[];
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({url,body,method:init?.method});
  if(url.includes('generativelanguage.googleapis.com'))return Response.json(http===200?{candidates:[{content:{parts:[{text:JSON.stringify(reply)}]}}]}:{error:{message:'test error'}},{status:http});
  if(url.includes('rpc/luckyjet_bee_save_v2'))return Response.json('pending');
  if(url.includes('luckyjet_bee_settings'))return Response.json([{...config,...body}]);
  if(url.includes('luckyjet_bee_stats'))return Response.json([]);
  if(url.includes('luckyjet_bee_attempts'))return Response.json([]);
  if(url.includes('luckyjet_prediction_journal'))return Response.json([]);
  if(url.includes('luckyjet_bee_predictions'))return Response.json([]);
  throw Error('Unexpected route '+url);
 };
 try{await fn(calls)}finally{globalThis.fetch=original}
}
Deno.test('real generation request uses fresh server scores and saves structured target',async()=>{
 await mock(async calls=>{
  await generate(config,status,history);
  const gemini=calls.find(c=>c.url.includes('generativelanguage.googleapis.com')),context=JSON.parse(gemini.body.contents[0].parts[0].text),saved=calls.find(c=>c.url.includes('rpc/luckyjet_bee_save_v2'));
  check(context.ml_models.anchor_id===history[0].id,'model anchor mismatch');
  check(context.ml_models.source==='server'&&context.ml_models.sample_size===200,'model source invalid');
  check(Object.keys(context.ml_models.tasks).length===6,'missing model tasks');
  check(gemini.body.generationConfig.responseSchema.required.includes('insurance_target'),'missing response field');
  check(saved.body.p_insurance===2&&saved.body.p_target===10,'structured save missing');
  check(saved.body.p_anchor===context.anchor_id,'save anchor mismatch');
  check(calls.some(c=>c.body?.status_reason==='pending_window'),'missing state diagnosis');
 });
});
Deno.test('invalid lower target cannot enter the immutable forecast journal',async()=>{
 await mock(async calls=>{
  let failed=false;try{await generate(config,status,history)}catch{failed=true}
  check(failed,'invalid reply accepted');check(!calls.some(c=>c.url.includes('luckyjet_bee_save_v2')),'invalid forecast saved');
  check(calls.some(c=>c.body?.outcome==='BEE_ANALYSIS_FAILED'),'failure not recorded');
 },{decision:'estimate',target:10,horizon:3,insurance_target:20,explanation:'bad lower target'});
});
Deno.test('provider quota failure stays an error instead of a fabricated forecast',async()=>{
 await mock(async calls=>{
  let failed=false;try{await generate(config,status,history)}catch(e){failed=String(e).includes('429')}
  check(failed,'provider error lost');check(!calls.some(c=>c.url.includes('luckyjet_bee_save_v2')),'forecast fabricated');
  check(calls.some(c=>c.body?.outcome==='GEMINI_HTTP_429'),'quota failure missing');
 },null,429);
});
Deno.test('report and settings preserve private access and user facts',async()=>{
 await mock(async calls=>{
  const unauth=await handler(new Request('https://example.supabase.co'));check(unauth.status===403&&calls.length===0,'private gate failed');
  const report=await handler(new Request('https://example.supabase.co',{headers:{'x-bee-access':'test-access'}})),body=await report.json();
  check(body.revision==='20261010-server-ml-v1'&&body.diagnostics.model_source==='server','report revision absent');
  check(body.knowledge==='Мои факты'&&body.key_server_only===true,'settings not retained');
  check(!JSON.stringify(body).includes('test-ai-only'),'key in report');
  const post=await handler(new Request('https://example.supabase.co',{method:'POST',headers:{'x-bee-access':'test-access'},body:JSON.stringify({enabled:false})}));
  check(post.ok,'pause failed');check(calls.some(c=>c.body?.enabled===false&&c.body?.status_reason==='paused'),'pause diagnosis missing');
 });
});
