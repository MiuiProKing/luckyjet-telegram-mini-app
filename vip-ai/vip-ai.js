/* Cloud VIP AI UI. Gemini credentials remain exclusively in Supabase. */
(()=>{
'use strict';
const C=VipAICore,$=id=>document.getElementById(id),names={logistic:'Логистическая',catboost:'CatBoost',lightgbm:'LightGBM',xgboost:'XGBoost'};
const labels={pending:'Проверяется',hit:'Попадание',miss:'Промах',unknown:'Не проверено',late:'Ответ опоздал',observe:'Наблюдение',error:'Ошибка ИИ'};
let report=null,reportAt=0,status=null,rows=[],sourceAt=0,sourceError='',apiError='',busy=false,syncBusy=false,lastSyncMessage='',scores=null,classic=null,anchorId='',selected=true,ruleCard=null;
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

const duration=ms=>{const seconds=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')};
function renderRuleCard(now){
 const reason=C.sourceReason(quality(now),rows,now);
 if(reason)ruleCard=null;
 else if(!ruleCard||now>=Number(ruleCard.at)+Number(ruleCard.window)){
  try{const value=VipClassic.evaluateClassic(C.clean(rows),quality(now),now).vip;
   ruleCard=value&&[value.target,value.score,value.at,value.window].every(Number.isFinite)&&value.target>=10&&value.window>0?{...value,anchor_id:rows[0].id,rows:rows.length}:null;
  }catch{ruleCard=null}
 }
 const rule=ruleCard,end=rule?rule.at+rule.window:0,plan=rule?VipClassic.plan(rule.target,rule.score):null;
 text('vipAiRuleState',reason||(!rule?'Для расчёта VIP недостаточно данных':'Расчёт правил закреплён · это не подтверждение Gemini'));
 text('vipAiRuleTarget',rule?rule.target.toFixed(2)+'×':'—');
 text('vipAiRuleLevel',rule?(rule.score>=82?'Высокий балл':rule.score>=66?'Средний балл':'Низкий балл'):'—');
 text('vipAiRuleInsurance',plan?'Дополнительная цель по формуле: '+plan.insurance.toFixed(2)+'×':'Дополнительная цель по формуле: —');
 text('vipAiRuleScore',rule?rule.score+' / 100':'—');
 $('vipAiRuleProgress').style.width=rule?Math.max(0,Math.min(100,rule.score))+'%':'0%';
 text('vipAiRuleTimeLabel',rule?.estimated?'Начало наблюдения ≈':'Расчётное начало окна');
 text('vipAiRuleStart',rule?time(rule.at):'—');
 text('vipAiRuleCountdown',rule?(now<rule.at?'До окна: '+duration(rule.at-now):'До конца: '+duration(end-now)):'—');
 text('vipAiRuleWindow',rule?'Окно наблюдения'+(rule.estimated?' ≈':'')+': '+time(rule.at)+' — '+time(end)+' · Europe/Kyiv · '+rule.rows+' раундов.':'Окно наблюдения пока не рассчитано.');
 text('vipAiRuleBasis',rule?(rule.basis||'')+' Частота цели в исходной выборке: '+rule.hitRate+'% ('+rule.hits+' / '+rule.sampleSize+'); это не точность прогноза.':'');
}

function render(){
 const now=Date.now(),p=report?.predictions?.[0],state=C.evaluate(p,quality(now),rows,now,reportAt);
 renderRuleCard(now);
 const diagnostic=C.diagnostic(report,now);
 const active=state.active&&report?.enabled===true&&report?.key_server_only===true&&!apiError;
 const observing=!!report&&report.enabled===true&&report.key_server_only===true&&!!reportAt&&now-reportAt<=20000&&!apiError&&p?.status==='observe';
 text('vipAiTarget',active?'≥'+p.target+'×':observing?'Наблюдение · без цели':'Нет актуального сигнала');
 text('vipAiAnswerStatus',apiError?'Ответ Gemini не получен: '+apiError:!report?'Получаю последний ответ Gemini…':report.enabled===false?'ИИ на паузе':report.active?'Gemini сейчас анализирует раунды. Ниже — последний сохранённый ответ.':p?'Последний ответ Gemini: '+(labels[p.status]||p.status)+' · '+time(C.epoch(p.created_at))+' · ID '+p.id:'ИИ включён. Первый ответ ещё не зарегистрирован.');
 text('vipAiTime',p?time(C.epoch(p.created_at)):'—');
 text('vipAiRemaining',active?state.remaining+' из '+p.horizon+' осталось':observing?'Окно прогноза не открыто':'—');
 const explanation=p?.explanation?(observing?'Gemini выбрал наблюдение без прогноза: '+p.explanation:active?p.explanation:'Последний ответ ИИ ('+time(C.epoch(p.created_at))+' · '+(p.target?'цель '+p.target+'×':'без цели')+' · '+(labels[p.status]||p.status)+'): '+p.explanation+'. Этот ответ не является актуальным сигналом VIP AI ≥10×.'):'Облачный Gemini может выбрать наблюдение, если оснований нет.';
 text('vipAiExplanation',explanation);
 text('vipAiStatus',sourceError||apiError||(report?.enabled===false?'ИИ на паузе':state.reason)+(diagnostic?' · '+diagnostic:report?.message?' · '+report.message:''));
 text('vipAiDiagnostic',diagnostic||'Получаю состояние серверного ИИ…');
 const basis=active?state.anchorRows:rows;
 const key=(basis[0]?.id||'')+'|'+(active?state.created:'current');
 if(C.sourceReason(quality(now),rows)){scores=null;classic=null;anchorId='';}
 else if(key!==anchorId||!scores){try{const result=calculation(basis,active?state.created:now);scores=result.scores;classic=result.classic;anchorId=key}catch(e){scores=null;classic=null}}
 const rule=classic?.vip,end=rule?Number(rule.at)+Number(rule.window):0;
 text('vipAiWindow',rule&&end>now?'≈ '+time(Number(rule.at))+' – '+time(end):'Не подтверждено');
 text('vipAiClassic',rule?'Правила страницы: цель '+rule.target+'× · балл '+rule.score+' · '+(rule.estimated?'время оценочное':'время по архиву')+'. '+(rule.basis||''):'Расчёт правил пока недоступен.');
 text('vipAiInsurance',active?(C.insurance(p)?C.insurance(p).toFixed(2)+'× · выбор ИИ':'ИИ не выбрал'):observing?'Не выбрана при наблюдении':'Нет актуальной меньшей цели');
 const h=Number($('vipAiHorizon').value),target=Number($('vipAiModelTarget').value),task=VIP_AI_MODELS.tasks[target+'x_'+h],snapshot=scores?.[target+'x_'+h];
 $('vipAiModels').replaceChildren();
 for(const [name] of Object.entries(task.models)){
  const tr=document.createElement('tr');for(const value of [names[name],snapshot?fmt(snapshot.models[name]):'—','Brier '+task.metrics[name].brier.toFixed(4)+(name===task.selected?' · выбран на этапе отбора':'')]){const td=document.createElement('td');td.textContent=value;tr.append(td)}$('vipAiModels').append(tr);
 }
 text('vipAiModelBasis',(snapshot?'Историческая базовая частота: '+fmt(snapshot.baseline)+'. Расчёт на 200 раундах до ID '+(basis[0]?.id||'—')+'. ':'')+'Brier: меньше лучше; база '+task.baseline_metrics.brier.toFixed(4)+'. Преимущество и игровой порядок источника не подтверждены.'+(active&&(h!==p.horizon||target!==p.target)?' Цель или горизонт таблицы отличаются от прогноза ИИ; эти оценки нельзя переносить на его окно.':''));
 text('vipAiStats',(report?.stats||[]).filter(s=>Number(s.target)>=10).map(s=>'≥'+s.target+'× / '+s.horizon+' раундов: '+s.hits+' попаданий, '+s.misses+' промахов, '+s.unknown+' unknown').join(' · ')||'Проверенных прогнозов ≥10× пока нет.');
 $('vipAiJournal').replaceChildren();
 const seen=new Set();for(const item of (report?.predictions||[]).filter(p=>Number(p.target)>=10)){if(seen.has(String(item.id)))continue;seen.add(String(item.id));const el=document.createElement('p');el.className='signal-note';el.textContent=time(C.epoch(item.created_at))+' · ID '+item.id+' · ≥'+item.target+'× · '+item.horizon+' раунда · '+(labels[item.status]||item.status)+(item.actual!=null?' · факт '+item.actual+'×':'')+(item.result_id?' · раунд '+item.result_id:'');$('vipAiJournal').append(el);}
 text('vipAiSyncState',lastSyncMessage||'Gemini получает правила и оценки 4 моделей непосредственно в Supabase. Открытая страница и ПК для расчёта моделей не нужны.');
 $('vipAiEnable').disabled=syncBusy;$('vipAiSync').disabled=syncBusy;$('vipAiPause').disabled=syncBusy;
}
async function liveQuery(full){
 const head=rows[0]?.source_seq,params=new URLSearchParams({select:'id,coefficient,round_timestamp,estimated,source_seq,origin,collection_backend,live_received_at',origin:'eq.live',collection_backend:'eq.cloud',order:'source_seq.desc',limit:full?'2000':'100'});
 if(!full)params.set('source_seq','gt.'+head);
 const k=BOG_CLOUD.anonKey,r=await fetch(BOG_CLOUD.url+'/rest/v1/luckyjet_rounds?'+params,{headers:{apikey:k,Authorization:'Bearer '+k},cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('LIVE Supabase: HTTP '+r.status);
 const data=await r.json();if(!Array.isArray(data))throw Error('Некорректный ответ LIVE');
 if(!full&&data.length>=100)return liveQuery(true);
 const next=C.liveRows(full?data:[...data,...rows]).slice(0,2000);
 rows=next;return rows;
}
async function refreshSource(){
 if(busy)return;busy=true;
 try{
  status=await ClassicCloud.getStatus();await liveQuery(!rows.length||!!sourceError);sourceAt=Date.now();sourceError='';
  render();
 }catch(e){sourceError=e.message;sourceAt=0;scores=null;classic=null;render()}finally{busy=false}
}
async function synchronize(enable){
 if(syncBusy)return;syncBusy=true;render();
 try{
  if(enable){const reason=C.sourceReason(quality(Date.now()),rows);if(reason)throw Error(reason);}
  const next=await BeeCloud.request(enable?'POST':undefined,enable?{enabled:true}:undefined);receive(next);
  if(next.revision!=='20261010-server-ml-v1')throw Error('Облачный сервер ещё не обновлён. Модели на сервере пока не подтверждены.');
  const snapshot=next.model_snapshot;
  lastSyncMessage='Модели считаются на сервере из 200 завершённых раундов.'+(snapshot?' Последний снимок: ID '+snapshot.anchor_id+' · '+snapshot.sample_size+' раундов.':' Первый серверный снимок появится после проверки Gemini.');
 }catch(e){lastSyncMessage=e.message;}finally{syncBusy=false;render()}
}
$('vipAiEnable').addEventListener('click',()=>synchronize(true));
$('vipAiSync').addEventListener('click',()=>synchronize(false));
$('vipAiPause').addEventListener('click',async()=>{
 syncBusy=true;render();try{receive(await BeeCloud.request('POST',{enabled:false}));lastSyncMessage='Облачный ИИ поставлен на паузу.'}catch(e){lastSyncMessage=e.message}finally{syncBusy=false;render()}
});
$('vipAiHorizon').addEventListener('change',render);$('vipAiModelTarget').addEventListener('change',render);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSource();else render()});
choose(true);refreshSource();setInterval(()=>{render();if(selected)refreshSource()},10000);
})();
