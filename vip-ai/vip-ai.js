/* Cloud VIP AI UI. Gemini credentials remain exclusively in Supabase. */
(()=>{
'use strict';
const C=VipAICore,$=id=>document.getElementById(id),names={logistic:'Логистическая',catboost:'CatBoost',lightgbm:'LightGBM',xgboost:'XGBoost'};
const labels={pending:'Проверяется',hit:'Попадание',miss:'Промах',unknown:'Не проверено',late:'Ответ опоздал',observe:'Наблюдение',error:'Ошибка ИИ'};
let report=null,reportAt=0,status=null,rows=[],sourceAt=0,sourceError='',apiError='',busy=false,syncBusy=false,autoSync=false,lastAnchor='',lastSync=0,lastSyncMessage='',scores=null,classic=null,anchorId='',selected=true;
const time=t=>Number.isFinite(t)?BogML.displayTime(t):'—',fmt=p=>(p*100).toFixed(1)+'%';
function text(id,value){$(id).textContent=String(value??'—')}
function choose(active){selected=active;$('vipAiSignal').hidden=!active;$('vipAiTab').classList.toggle('active',active);$('vipAiTab').setAttribute('aria-selected',String(active));if(active){for(const id of ['normalTab','vipTab']){$(id).classList.remove('active');$(id).setAttribute('aria-selected','false')}$('normalSignal').hidden=true;$('vipSignal').hidden=true;render();}}
$('vipAiTab').addEventListener('click',()=>choose(true));
for(const id of ['normalTab','vipTab'])$(id).addEventListener('click',()=>choose(false));
function receive(d){report=d;reportAt=Date.now();apiError='';render()}
window.addEventListener('bee-ai-report',e=>receive(e.detail));
window.addEventListener('bee-ai-error',e=>{apiError=e.detail||'Облачный ИИ недоступен';reportAt=0;render()});
function quality(now){return sourceError?null:status&&now-sourceAt<20000?status:null}
function calculation(input,at=Date.now()){
 const clean=C.clean(input);return {scores:C.modelScores(clean,VIP_AI_MODELS,BogML),classic:(()=>{const value=VipClassic.evaluateClassic(clean,quality(Date.now())||{},at);value.insurance=value.vip?VipClassic.plan(value.vip.target,value.vip.score):null;return value})()};
}
function render(){
 const now=Date.now(),p=report?.predictions?.[0],state=C.evaluate(p,quality(now),rows,now,reportAt);
 const active=state.active&&report?.enabled===true&&report?.key_server_only===true&&!apiError;
 text('vipAiTarget',active?'≥'+p.target+'×':'Нет актуального сигнала');
 text('vipAiTime',p?time(C.epoch(p.created_at)):'—');
 text('vipAiRemaining',active?state.remaining+' из '+p.horizon+' осталось':'—');
 const explanation=p?.explanation||'Облачный Gemini может выбрать наблюдение, если оснований нет.';
 text('vipAiExplanation',explanation);
 text('vipAiStatus',sourceError||apiError||(report?.enabled===false?'ИИ на паузе':state.reason)+(report?.message?' · '+report.message:''));
 const basis=active?state.anchorRows:rows;
 const key=(basis[0]?.id||'')+'|'+(active?state.created:'current');
 if(C.sourceReason(quality(now),rows)){scores=null;classic=null;anchorId='';}
 else if(key!==anchorId||!scores){try{const result=calculation(basis,active?state.created:now);scores=result.scores;classic=result.classic;anchorId=key}catch(e){scores=null;classic=null}}
 const rule=classic?.vip,end=rule?Number(rule.at)+Number(rule.window):0;
 text('vipAiWindow',rule&&end>now?'≈ '+time(Number(rule.at))+' – '+time(end):'Не подтверждено');
 text('vipAiClassic',rule?'Правила страницы: цель '+rule.target+'× · балл '+rule.score+' · '+(rule.estimated?'время оценочное':'время по архиву')+'. '+(rule.basis||''):'Расчёт правил пока недоступен.');
 text('vipAiInsurance',active&&C.insurance(p)?C.insurance(p).toFixed(2)+'× · выбор ИИ':'ИИ не выбрал');
 const h=Number($('vipAiHorizon').value),target=Number($('vipAiModelTarget').value),task=VIP_AI_MODELS.tasks[target+'x_'+h],snapshot=scores?.[target+'x_'+h];
 $('vipAiModels').replaceChildren();
 for(const [name] of Object.entries(task.models)){
  const tr=document.createElement('tr');for(const value of [names[name],snapshot?fmt(snapshot.models[name]):'—','Brier '+task.metrics[name].brier.toFixed(4)+(name===task.selected?' · выбран на этапе отбора':'')]){const td=document.createElement('td');td.textContent=value;tr.append(td)}$('vipAiModels').append(tr);
 }
 text('vipAiModelBasis',(snapshot?'Историческая базовая частота: '+fmt(snapshot.baseline)+'. Расчёт на 200 раундах до ID '+(basis[0]?.id||'—')+'. ':'')+'Brier: меньше лучше; база '+task.baseline_metrics.brier.toFixed(4)+'. Преимущество и игровой порядок источника не подтверждены.'+(active&&(h!==p.horizon||target!==p.target)?' Цель или горизонт таблицы отличаются от прогноза ИИ; эти оценки нельзя переносить на его окно.':''));
 text('vipAiStats',(report?.stats||[]).filter(s=>Number(s.target)>=10).map(s=>'≥'+s.target+'× / '+s.horizon+' раундов: '+s.hits+' попаданий, '+s.misses+' промахов, '+s.unknown+' unknown').join(' · ')||'Проверенных прогнозов ≥10× пока нет.');
 $('vipAiJournal').replaceChildren();
 const seen=new Set();for(const item of (report?.predictions||[]).filter(p=>Number(p.target)>=10)){if(seen.has(String(item.id)))continue;seen.add(String(item.id));const el=document.createElement('p');el.className='signal-note';el.textContent=time(C.epoch(item.created_at))+' · ID '+item.id+' · ≥'+item.target+'× · '+item.horizon+' раунда · '+(labels[item.status]||item.status)+(item.actual!=null?' · факт '+item.actual+'×':'')+(item.result_id?' · раунд '+item.result_id:'');$('vipAiJournal').append(el);}
 text('vipAiSyncState',lastSyncMessage||'Ключ Gemini хранится на сервере. Включение передаёт ИИ точные расчёты и оценки 4 моделей, сохраняя вашу базу знаний.');
 $('vipAiEnable').disabled=syncBusy;$('vipAiSync').disabled=syncBusy;$('vipAiPause').disabled=syncBusy;
}
async function liveQuery(full){
 const head=rows[0]?.source_seq,params=new URLSearchParams({select:'id,coefficient,round_timestamp,estimated,source_seq,origin,collection_backend,live_received_at',origin:'eq.live',collection_backend:'eq.cloud',order:'source_seq.desc',limit:full?'2000':'100'});
 if(!full)params.set('source_seq','gt.'+head);
 const k=BOG_CLOUD.anonKey,r=await fetch(BOG_CLOUD.url+'/rest/v1/luckyjet_rounds?'+params,{headers:{apikey:k,Authorization:'Bearer '+k},cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('LIVE Supabase: HTTP '+r.status);
 const data=await r.json();if(!Array.isArray(data))throw Error('Некорректный ответ LIVE');
 if(!full&&data.length>=100)return liveQuery(true);
 const next=C.clean(full?data:[...data,...rows]).sort((a,b)=>Number(b.source_seq)-Number(a.source_seq)).slice(0,2000);
 for(let i=1;i<Math.min(next.length,200);i++)if(!Number.isFinite(Number(next[i].source_seq))||Number(next[i-1].source_seq)-Number(next[i].source_seq)!==1)throw Error('Разрыв последовательности LIVE; прогноз остановлен');
 rows=next;return rows;
}
async function refreshSource(){
 if(busy)return;busy=true;
 try{
  status=await ClassicCloud.getStatus();await liveQuery(!rows.length||!!sourceError);sourceAt=Date.now();sourceError='';
  render();
  if(autoSync&&!document.hidden&&selected&&Date.now()-lastSync>=30000&&rows[0]?.id!==lastAnchor)await synchronize(false);
 }catch(e){sourceError=e.message;sourceAt=0;scores=null;classic=null;render()}finally{busy=false}
}
async function synchronize(enable){
 if(syncBusy)return;syncBusy=true;render();
 try{
  const now=Date.now(),reason=C.sourceReason(quality(now),rows);if(reason)throw Error(reason);
  const computed=calculation(rows,now),block=C.context(rows,quality(now),computed.classic,computed.scores,now);
  // Read current settings immediately before mutation so other pages' knowledge is retained.
  const current=await BeeCloud.request(),knowledge=C.mergeKnowledge(current.knowledge,block);
  const next=await BeeCloud.request('POST',{knowledge,...(enable?{enabled:true}:{})});receive(next);
  if($('beeKnowledge'))$('beeKnowledge').value=next.knowledge||knowledge;
  autoSync=true;lastAnchor=rows[0].id;lastSync=Date.now();
  lastSyncMessage='Расчёты переданы '+time(lastSync)+' · ID '+lastAnchor+'. Gemini использует снимок только при совпадении опорного раунда. Ответ появится после серверной проверки.';
 }catch(e){autoSync=false;lastSyncMessage=e.message;}finally{syncBusy=false;render()}
}
$('vipAiEnable').addEventListener('click',()=>synchronize(true));
$('vipAiSync').addEventListener('click',()=>synchronize(false));
$('vipAiPause').addEventListener('click',async()=>{
 autoSync=false;syncBusy=true;render();try{receive(await BeeCloud.request('POST',{enabled:false}));lastSyncMessage='Облачный ИИ поставлен на паузу.'}catch(e){lastSyncMessage=e.message}finally{syncBusy=false;render()}
});
$('vipAiHorizon').addEventListener('change',render);$('vipAiModelTarget').addEventListener('change',render);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSource();else render()});
choose(true);refreshSource();setInterval(()=>{render();if(selected||autoSync)refreshSource()},10000);
})();
