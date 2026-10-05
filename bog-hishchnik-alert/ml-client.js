(function(){
'use strict';
const $=id=>document.getElementById(id),core=window.BogML,MAX_ROUNDS=100000;
const names={logistic:'Логистическая',catboost:'CatBoost',lightgbm:'LightGBM',xgboost:'XGBoost'};
let database=null,storageError='',storedCount=0,known=new Set(),artifact=null,feed=null,lastAnchor=null;
let queue=Promise.resolve(),predictions=[],issued=new Set(),artifactError='',writeCount=0,storageReady=false,backfillBusy=false;
let paused2x=false,lossStreak=0;try{const saved=JSON.parse(localStorage.getItem('bog_ml_2x_pause')||'{}');paused2x=!!saved.paused;lossStreak=Number(saved.streak)||0}catch(_){}
function savePause(){try{localStorage.setItem('bog_ml_2x_pause',JSON.stringify({paused:paused2x,streak:lossStreak}))}catch(_) {}}
const format=n=>Number.isFinite(n)?n.toFixed(4):'—',percent=n=>Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Ошибка хранилища'));tx.onabort=()=>reject(tx.error||Error('Запись прервана'))})}
function requestValue(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function openStorage(){
 if(!window.indexedDB)throw Error('IndexedDB недоступна в этом браузере');
 const request=indexedDB.open('bog_hishchnik_ml_v1',1);
 request.onupgradeneeded=()=>{const db=request.result;const rounds=db.createObjectStore('rounds',{keyPath:'id'});rounds.createIndex('received','local_received_at');db.createObjectStore('predictions',{keyPath:'id'})};
 database=await requestValue(request);database.onversionchange=()=>{database.close();database=null;storageError='Хранилище обновлено в другой вкладке. Перезагрузите страницу.';render()};
 const keys=await requestValue(database.transaction('rounds').objectStore('rounds').getAllKeys());known=new Set(keys);storedCount=keys.length;
 predictions=await requestValue(database.transaction('predictions').objectStore('predictions').getAll());issued=new Set(predictions.map(p=>p.id));
 // Reload destroys knowledge of observation continuity; do not resume incomplete forecasts as confirmed outcomes.
 for(const prediction of predictions)if(prediction.status==='pending'){prediction.status='unknown';prediction.reason='Страница перезагружена; покрытие окна неизвестно'}
 await savePredictions();render();
}
function enqueue(fn){queue=queue.then(fn).catch(e=>{storageError=e.message;render()});return queue}
const ready=openStorage().catch(e=>{storageError=e.message;render()}).then(()=>{storageReady=true;enqueue(schedulePrediction);render()});
async function retain(rows){
 await ready;if(!database)return;
 const incoming=rows.filter(r=>r&&typeof r.id==='string'&&Number.isFinite(r.coefficient)&&r.coefficient>=1&&!known.has(r.id));
 if(!incoming.length)return;
 const tx=database.transaction('rounds','readwrite'),store=tx.objectStore('rounds'),done=transactionDone(tx);
 for(const r of incoming)store.put({id:r.id,coefficient:r.coefficient,timestamp:r.timestamp,estimated:!!r.estimated,time_quality:r.timeIssue||'source',observed_at:r._observedAt||null,delivery_sequence:r._sequence||null,local_received_at:Date.now(),order_verified:false});
 await done;incoming.forEach(r=>known.add(r.id));storedCount=known.size;writeCount+=incoming.length;
 if(storedCount>MAX_ROUNDS){const removeCount=storedCount-MAX_ROUNDS,prune=database.transaction('rounds','readwrite'),completed=transactionDone(prune);let removed=0;const cursor=prune.objectStore('rounds').index('received').openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c&&removed<removeCount){known.delete(c.primaryKey);c.delete();removed++;c.continue()}};await completed;storedCount=known.size}
 render();
}
async function savePredictions(){
 await Promise.resolve();if(!database)return;
 const tx=database.transaction('predictions','readwrite'),store=tx.objectStore('predictions'),done=transactionDone(tx);
 for(const p of predictions)store.put(p);
 if(predictions.length>5000){const sorted=[...predictions].sort((a,b)=>b.created_at-a.created_at),obsolete=sorted.slice(5000);obsolete.forEach(p=>store.delete(p.id));predictions=sorted.slice(0,5000);issued=new Set(predictions.map(p=>p.id))}
 await done;
}
function chosenTask(){return artifact?.tasks[`${$('mlTarget').value}x_${$('mlHorizon').value}`]}
async function schedulePrediction(){
 const task=chosenTask();if(!storageReady||!database||storageError||!task||!feed?.online||!feed?.fresh||feed.gap||Date.now()-feed.pollAt>15000||feed.rows.length<200)return;
 if((task.target===2&&paused2x)||predictions.some(p=>p.status==='pending'&&p.target===task.target&&p.horizon===task.horizon))return;
 const anchor=feed.rows[0].id,id=[artifact.version,anchor,task.target,task.horizon].join(':');if(issued.has(id))return;
 const features=core.features(feed.rows.slice(0,200).map(r=>r.coefficient).reverse());if(!features)return;
 const prediction={id,anchor,created_at:Date.now(),target:task.target,horizon:task.horizon,version:artifact.version,model:task.selected,probability:core.predict(task.models[task.selected],features),baseline:task.baseline,status:'pending',observed_ids:[],values:[],source_order_verified:false};
 issued.add(id);predictions.push(prediction);await savePredictions();prediction.recorded_at=Date.now();await savePredictions();
}
function observe(rows,previousAnchor,continuity,pollAt){
 if(!previousAnchor)return;
 const boundary=rows.findIndex(r=>r.id===previousAnchor);
 if(boundary<0||!continuity){for(const p of predictions)if(p.status==='pending'){p.status='unknown';p.reason='Разрыв доставки или граница истории потеряна'}return}
 // Only IDs ahead of a known boundary are subsequent observations. Backfilled history cannot settle a forecast.
 const arrivals=rows.slice(0,boundary).reverse();
 for(const p of predictions){
  if(p.status!=='pending')continue;
  if(p.recorded_at&&pollAt<p.recorded_at&&arrivals.length){p.status='unknown';p.reason='Ответ получен до завершения фиксации оценки';continue}
   for(const r of arrivals){if(r.id===p.anchor||p.observed_ids.includes(r.id))continue;p.observed_ids.push(r.id);p.values.push(r.coefficient);if(p.values.length===p.horizon){p.outcome=p.values.some(n=>n>=p.target)?1:0;p.status='observed';p.finished_at=Date.now();if(p.target===2&&p.horizon===3){lossStreak=p.outcome?0:lossStreak+1;if(lossStreak>=2)paused2x=true;savePause()}break}}
 }
}
function onFeed(rows,quality){
 return enqueue(async()=>{await ready;
 const prior=lastAnchor;
 const continuity=!quality.gap&&(!feed||!feed.pollAt||quality.pollAt-feed.pollAt<=15000);
 observe(rows,prior,continuity,quality.pollAt);
 feed={rows,online:quality.online,fresh:quality.fresh,pollAt:quality.pollAt,gap:quality.gap};lastAnchor=rows[0]?.id||null;
 await retain(rows);await savePredictions();await schedulePrediction();render();
 });
}
function onError(){return enqueue(async()=>{if(feed){feed.online=false;feed.fresh=false;feed.gap=true}for(const p of predictions)if(p.status==='pending'){p.status='unknown';p.reason='Ошибка получения истории'}await savePredictions();render()})}
function render(){
 if(!$('mlState'))return;
 $('mlStorage').textContent=storageError?'Не сохраняется: '+storageError:'Сохранено '+storedCount.toLocaleString('ru-RU')+' уникальных раундов · предел 100 000 · только в этом браузере';
 $('mlSource').textContent=(window.BOG_RUNTIME?.sqlite?'Локальный SQLite + ':'')+(feed?.online?'HTTP каждую секунду · '+(feed.fresh?'данные свежие':'последний раунд устарел'):'Ожидание подключения истории');
 if(artifactError){$('mlState').textContent='Модели не загружены: '+artifactError;return}
 if(!artifact){$('mlState').textContent='Загружаются обученные модели…';return}
 const task=chosenTask();if(!task)return;
 const data=feed?.rows||[],x=core.features(data.slice(0,200).map(r=>r.coefficient).reverse());
 const quality={fresh:!!feed?.fresh&&!!feed?.online,gap:!!feed?.gap,approximate:data.slice(0,200).some(r=>r.estimated)};
 const gate=core.decision(artifact,task,quality);
 $('mlState').textContent=task.target===2&&paused2x?'2x: пауза после двух неудачных наблюдений':gate.promoted?'Проверенная модель доступна':'Эксперимент · преимущество для сигналов не подтверждено';
 $('mlResume').hidden=!paused2x;
 $('mlEvent').textContent='Хотя бы один коэффициент ≥'+task.target+'× в следующих '+task.horizon+' наблюдаемых раундах';
 $('mlBaseline').textContent=percent(task.baseline);$('mlCandidate').textContent=x?percent(core.predict(task.models[task.selected],x)):'Нужно 200 раундов';
 $('mlSelected').textContent=names[task.selected]+' · выбрана на отдельной части истории';
 $('mlReasons').textContent=gate.reasons.join(' · ');
 const rows=[['Базовая частота',task.baseline_metrics,null],...Object.entries(task.metrics).map(([key,value])=>[names[key],value,key])];
 if(task.old_2x){rows.splice(1,0,['Старые 2x · балл как вероятность ⚠',task.old_2x.raw_score,null],['Старые 2x · после калибровки',task.old_2x.calibrated,null])}
 $('mlComparison').innerHTML=rows.map(([name,m,key])=>'<tr><td>'+name+(key===task.selected?' ★':'')+'</td><td>'+format(m.brier)+'</td><td>'+format(m.logloss)+'</td><td>'+format(m.auc)+'</td></tr>').join('');
 const ci=task.improvement_interval;$('mlEvaluation').textContent='Последующая проверка: '+task.counts.test+' примеров · 95% интервал улучшения Brier: '+format(ci[0])+' … '+format(ci[1])+'. Меньше Brier и Log loss — лучше. Это проверка порядка записей API; игровой порядок и полнота не удостоверены. Период уже просматривался в первом пилоте — нужен новый независимый будущий период.'+(task.rare_warning?' Мало положительных событий: для редкой цели оценка нестабильна.':'');
 $('mlWalkForward').textContent=task.walk_forward?'Walk-forward: 3 последовательных периода. Средний Brier: '+Object.entries(task.walk_forward.mean_brier).map(([name,value])=>(names[name]||name)+' '+format(value)).join(' · '):'Для этой цели доступна отложенная проверка. Расширенная walk-forward-проверка выполнена отдельно для 2x (1 и 3 раунда), 10x и 50x (1 раунд).';
 const own=predictions.filter(p=>p.target===task.target&&p.horizon===task.horizon&&p.version===artifact.version),statistics=core.score(own),pending=own.filter(p=>p.status==='pending').length,unknown=own.filter(p=>p.status==='unknown').length;
 $('mlLiveStats').textContent='После открытия: завершённых наблюдений '+statistics.count+' · Brier модели '+format(statistics.brier)+' · базовый '+format(statistics.baselineBrier)+' · ожидают '+pending+' · с разрывом '+unknown+'. Это наблюдения доставки, не подтверждённая точность игровых прогнозов.';
 $('mlJournal').innerHTML=[...own].sort((a,b)=>b.created_at-a.created_at).slice(0,8).map(p=>'<div class="journal-row"><b>'+core.displayTime(p.created_at)+' · ≥'+p.target+'× / '+p.horizon+' раунда · '+percent(p.probability)+'</b><span>'+esc(p.status==='pending'?'Ожидается результат':p.status==='unknown'?'Не оценён: '+p.reason:'Наблюдение: '+(p.outcome?'цель встретилась':'цель не встретилась'))+'</span></div>').join('')||'<p class="signal-note">Новый прогноз фиксируется до получения следующих наблюдений.</p>';
}
async function exportHistory(){
 await queue;await ready;if(!database)throw Error(storageError||'Хранилище недоступно');
 const rows=await requestValue(database.transaction('rounds').objectStore('rounds').getAll());
 const payload={version:1,source:'v0xff3-live',exported_at:new Date().toISOString(),actual_game_order_verified:false,completeness_verified:false,rounds:rows,predictions};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='bog-hishchnik-ml-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function backfill(){
 if(backfillBusy)return;backfillBusy=true;$('mlBackfill').disabled=true;
 try {await ready;if(!database)throw Error(storageError||'Хранилище недоступно');for(let offset=0;offset<20000;offset+=1000){const batch=await window.page(1000,offset);const valid=window.normalizeFeed(batch.rows).rows;queue=queue.then(()=>retain(valid));await queue;$('mlBackfill').textContent='Дочитано '+(offset+batch.rows.length);if(!batch.rows.length||(batch.total!=null&&offset+batch.rows.length>=batch.total))break;await new Promise(resolve=>setTimeout(resolve,300))}}
 catch(e){storageError='Дочитывание: '+e.message;render()}
 finally {backfillBusy=false;$('mlBackfill').disabled=false;$('mlBackfill').textContent='Дочитать до 20 000 раундов'}
}
$('mlTarget').addEventListener('change',()=>enqueue(async()=>{await schedulePrediction();render()}));$('mlHorizon').addEventListener('change',()=>enqueue(async()=>{await schedulePrediction();render()}));
$('mlExport').addEventListener('click',()=>exportHistory().catch(e=>{storageError=e.message;render()}));
$('mlBackfill').addEventListener('click',backfill);
$('mlResume').addEventListener('click',()=>enqueue(async()=>{if(window.BOG_RUNTIME?.sqlite){const response=await fetch('/api/resume',{method:'POST'});if(!response.ok)throw Error('Не удалось возобновить сборщик')}paused2x=false;lossStreak=0;savePause();await schedulePrediction();render()}));
window.BogMLClient=Object.freeze({onFeed,onError,exportHistory,render,ready,getState:()=>({storedCount,predictions,artifactLoaded:!!artifact,storageError,source:feed&&{online:feed.online,fresh:feed.fresh},pendingWrites:writeCount}),flush:()=>queue});
fetch('ml-models.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>{if(data.lookback!==200||!data.tasks)throw Error('Неверный формат моделей');artifact=data;enqueue(async()=>{await schedulePrediction();render()})}).catch(e=>{artifactError=e.message;render()});
render();
})();
