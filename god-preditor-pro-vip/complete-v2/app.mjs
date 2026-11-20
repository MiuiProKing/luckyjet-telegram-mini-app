import {CONFIG} from './config.mjs';
import {analyzeReport,analyzeAll,normalizeRounds,validateWindow,TARGETS} from './engine.mjs';
import {timedChoose,timedKind,TIMED_INGEST_MS,TIMED_RESULT_MS,TIMED_DURATIONS,timedLargest} from './timed-engine.mjs';
import {mountScene} from './scene.mjs';

const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='god_complete_v2_journal',PREF='god_complete_v2_preferences';
const state={rows:new Map(),ordered:[],report:null,mode:'premium',target:20,offset:0,lastPoll:0,lastLatency:0,error:'',cursor:null,snapshot:null,allLoaded:false,moreBusy:false,allBusy:false,stop:false,pollBusy:false,ingest:null,result:null,cooldown:0,lastPremiumRound:null,lastAnalysis:0,pulseUntil:0,storageError:false,historyShown:200};
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
const journal=read(STORE,[]).filter(x=>x&&typeof x.id==='string'&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&Number.isFinite(x.target));
const prefs={spider:true,economy:false,vivid:true,brightness:100,...read(PREF,{})};
const now=()=>Date.now()+state.offset;
const formatTime=t=>Number.isFinite(Number(t))?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(Number(t)):'—';
const formatDate=t=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric'}).format(t);
const coef=x=>Number(x).toFixed(2).replace('.',',');
const color=x=>x>=10?'gold':x>=2?'purple':'blue';
const secs=t=>`${Math.max(0,Math.floor(t/60))}:${String(Math.max(0,Math.floor(t%60))).padStart(2,'0')}`;
const labels={hit:'ЗАШЛО',miss:'НЕ ЗАШЛО',unknown:'НЕТ ПОЛНЫХ ДАННЫХ',pending:'ОЖИДАНИЕ'};
const names={premium_live:'Premium · временное окно',basic:'Обычный анализ',big_cycle100:'Цикл 100×',big_hot_cluster:'Кластер крупных X'};
function saveJournal(){try{localStorage.setItem(STORE,JSON.stringify(journal))}catch{state.storageError=true;$('dataError').textContent='Память браузера заполнена. Скачай журнал JSON; новые окна пока сохраняются только в открытой вкладке.'}}
function download(name,data,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function applyPrefs(){document.body.classList.toggle('vivid',!!prefs.vivid);document.documentElement.style.setProperty('--brightness',String(prefs.brightness/100));$('spiderVisible').checked=prefs.spider;$('economyMode').checked=prefs.economy;$('vividMode').checked=prefs.vivid;$('pageBrightness').value=prefs.brightness;$('brightnessValue').textContent=prefs.brightness+'%';try{localStorage.setItem(PREF,JSON.stringify(prefs))}catch{}}
applyPrefs();const scene=mountScene($('vortex'),$('spider'),()=>prefs,()=>now()<state.pulseUntil?1:0);

async function fetchPage(cursor=null,limit=1000,latest=false){
 const started=performance.now(),query=new URLSearchParams({select:'id,coefficient,round_timestamp,completed,estimated,feed_order',completed:'eq.true',estimated:'eq.false',order:'feed_order.desc,id.desc',limit:String(limit)});
 if(cursor)query.set('or',`(feed_order.lt.${cursor.feed_order},and(feed_order.eq.${cursor.feed_order},id.lt.${cursor.id}))`);
 if(!latest&&state.snapshot!=null)query.set('feed_order',`lte.${state.snapshot}`);
 const response=await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE}?${query}`,{headers:{apikey:CONFIG.SUPABASE_KEY},signal:AbortSignal.timeout(25000),cache:'no-store'});
 if(!response.ok)throw new Error(`Supabase: HTTP ${response.status}`);
 const server=Date.parse(response.headers.get('date')??'');if(Number.isFinite(server))state.offset=server-Date.now();
 const raw=await response.json();if(!Array.isArray(raw))throw new Error('Источник вернул некорректную историю');
 return{raw,latency:performance.now()-started};
}
function mergeRows(raw){let changed=false;for(const r of normalizeRounds(raw,now())){if(!state.rows.has(r.id)){state.rows.set(r.id,r);changed=true}}
 if(changed)state.ordered=[...state.rows.values()].sort((a,b)=>b.timestamp-a.timestamp||b.id.localeCompare(a.id));return changed;
}
async function moreHistory(){
 if(state.moreBusy||state.allLoaded)return;state.moreBusy=true;updateHistoryControls();
 try{const {raw}=await fetchPage(state.cursor);if(raw.length){mergeRows(raw);state.snapshot??=raw[0].feed_order;const last=raw.at(-1);state.cursor={feed_order:last.feed_order,id:last.id}}if(raw.length<1000)state.allLoaded=true;state.error='';updateAnalysis(true);renderHistory();}
 catch(error){state.error=error.message;$('historyProgress').textContent=error.message;}
 finally{state.moreBusy=false;updateHistoryControls();renderData()}
}
async function poll(){
 if(state.pollBusy)return;state.pollBusy=true;
 try{const {raw,latency}=await fetchPage(null,1000,true),before=state.ordered[0]?.id;mergeRows(raw);state.lastLatency=latency;state.lastPoll=now();state.error='';if(!state.cursor&&raw.length){state.snapshot=raw[0].feed_order;state.cursor={feed_order:raw.at(-1).feed_order,id:raw.at(-1).id};state.allLoaded=raw.length<1000}
 const newest=state.ordered[0]?.id;if(newest!==before){state.pulseUntil=now()+2500;renderRecent(newest);updateAnalysis(true)}else updateAnalysis(false);
 await verifyPending();maybePremium();renderData();if($('historyDialog').open)renderHistory();
 }catch(error){state.error=error.name==='TimeoutError'?'Источник не ответил вовремя':error.message;renderData()}finally{state.pollBusy=false}
}
function active(channel){return journal.find(x=>x.channel===channel&&x.status==='pending')}
function addWindow(candidate,start=candidate.estimatedAt){
 const channel=candidate.channel,end=start+candidate.windowMs;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=now()||active(channel))return null;
 const id=`${channel}:${Math.round(start)}:${candidate.basisEvent??state.ordered[0]?.id??''}`;
 if(journal.some(x=>x.id===id))return null;
 if(candidate.basisEvent&&journal.some(x=>x.channel===channel&&x.basisEvent===candidate.basisEvent))return null;
 const win={id,channel,target:candidate.target,start,end,issuedAt:now(),status:'pending',confidence:candidate.confidence??null,scoreKind:candidate.scoreKind??'heuristic',reason:candidate.reason??'',modelVersion:candidate.modelVersion??CONFIG.VERSION,basisEvent:candidate.basisEvent??null,sourceCutoff:state.ordered[0]?.timestamp??null,sampleSize:state.ordered.length,actual:null,resultAt:null,checkedAt:null};
 journal.unshift(win);saveJournal();renderStats();return win;
}
function updateAnalysis(force=false){
 if(!state.ordered.length)return;if(!force&&now()-state.lastAnalysis<60000)return;state.lastAnalysis=now();state.report=analyzeReport(state.ordered,now());
 // All independent channels run together. The view switch only changes presentation.
 const candidates=analyzeAll(state.ordered,now());
 for(const c of candidates){if(c.channel==='premium_live'||active(c.channel))continue;if(c.estimatedAt<now()+40000)continue;addWindow(c)}
 renderModelDetails();renderSignal();
}
function maybePremium(){
 const t=now(),rows=state.ordered,report=state.report;
 if(active('premium_live')||state.ingest||t<state.cooldown||!report?.timedRates||!report.fresh||state.lastPremiumRound===rows[0]?.id)return;
 const pred=timedChoose(report.timedRates,rows.slice(0,3),t,t);if(!pred)return;
 state.lastPremiumRound=rows[0].id;state.ingest={kind:timedKind(rows.slice(0,3)),coefs:rows.slice(0,3).reverse().map(x=>x.coefficient),until:t+TIMED_INGEST_MS};renderSignal();
 setTimeout(()=>{if(!state.ingest)return;const chosen=state.report?.timedRates&&timedChoose(state.report.timedRates,state.ordered.slice(0,3),now(),now());state.ingest=null;if(chosen){addWindow({channel:'premium_live',target:chosen.level,windowMs:chosen.minutes*60000,confidence:chosen.chance,scoreKind:'model_probability',reason:chosen.reason,modelVersion:CONFIG.VERSION},now())}renderSignal()},TIMED_INGEST_MS);
}
async function verifyPending(){
 let changed=false;for(const win of journal){if((win.status!=='pending'&&win.status!=='unknown')||now()<=win.end)continue;
 const result=validateWindow(state.ordered,win.target,win.start,win.end,now());
 if(result.status===win.status&&result.actual===win.actual)continue;
 const previous=win.status;Object.assign(win,{status:result.status,actual:result.actual,resultAt:result.resultAt,roundId:result.roundId,checkedAt:now(),verificationReason:result.reason});
 (win.events??=[]).push({from:previous,to:win.status,at:now(),actual:result.actual});changed=true;
 if(win.channel==='premium_live'&&previous==='pending'){state.result=win;state.cooldown=now()+TIMED_RESULT_MS;setTimeout(()=>{state.result=null;renderSignal();maybePremium()},TIMED_RESULT_MS)}
 }
 if(changed){saveJournal();renderStats();renderSignal()}
}
function renderRecent(newest=null){$('recent').innerHTML=state.ordered.slice(0,5).map(r=>`<div class="premium-coef ${color(r.coefficient)} ${r.id===newest?'fresh':''}"><strong>${coef(r.coefficient)}×</strong><time datetime="${new Date(r.timestamp).toISOString()}">${formatTime(r.timestamp)}</time></div>`).join('')}
function picker(){return `<div class="target-picker">${TARGETS.map(t=>`<button data-target="${t}" class="${t===state.target?'selected':''}" aria-pressed="${t===state.target}">${t}×</button>`).join('')}</div>`}
function renderWindow(win,label){
 const before=now()<win.start,remaining=Math.max(0,Math.ceil((win.end-now())/1000)),duration=(win.end-win.start)/1000,prob=win.scoreKind==='heuristic'?`Балл правил <strong>${Number(win.confidence??0).toFixed(0)}/100</strong>`:`Вероятность в окне <strong>${Number(win.confidence??0).toFixed(0)}%</strong>`;
 return `<div class="signal-content">${state.mode==='large'?picker():''}<p class="eyebrow">${esc(label)}</p><p class="target">${coef(win.target)}<span>×+</span></p><p class="window-label">${before?'Начало окна · Киев':'Окно началось · Киев'}</p><p class="window">${formatTime(win.start)}<b>→</b>${formatTime(win.end)}</p><p class="countdown">${before?'Через '+secs(Math.ceil((win.start-now())/1000)):remaining>0?secs(remaining):'Проверка…'}</p><div class="time-track"><span style="width:${before?100:Math.min(100,remaining/duration*100)}%"></span></div><p class="probability">${prob}</p><p class="note">Хотя бы один раунд ≥ цели в этом окне. Это не гарантия следующего раунда.</p></div>`;
}
function renderSignal(){
 if(state.mode==='premium'){
  if(state.ingest){$('signal').innerHTML=`<div class="signal-content"><div class="ingestion">${state.ingest.coefs.map((x,i)=>`<span class="ingestion-coef ${color(x)}" style="--i:${i}">${coef(x)}×</span>`).join('')}</div><p class="eyebrow">${state.ingest.kind==='gold'?'Обнаружен золотой коэффициент':state.ingest.kind==='fall'?'Три небольших коэффициента':'Получены новые раунды'}</p><p class="analysis-label">Анализ истории</p><div class="analysis-track"><span></span></div></div>`;return}
  if(state.result&&now()<state.cooldown){const r=state.result;$('signal').innerHTML=`<div class="signal-content ${r.status}"><div class="result-seal">${r.status==='hit'?'✓':r.status==='miss'?'×':'?'}</div><p class="eyebrow">Цель ${coef(r.target)}×+</p><p class="result-title">${labels[r.status]}</p>${r.actual?`<p class="result-target">${coef(r.actual)}×</p>`:''}<p class="window">${formatTime(r.start)} — ${formatTime(r.end)}</p><p class="note">${r.status==='unknown'?'В истории недостаточно данных для окончательного результата.':'Следующий анализ готовится'}</p></div>`;return}
  const win=active('premium_live');if(win){$('signal').innerHTML=renderWindow(win,'Прогноз в реальном времени');return}
 }else{
  const channel=state.mode==='basic'?'basic':`vip_${state.target}`,win=active(channel);
  if(win){$('signal').innerHTML=renderWindow(win,state.mode==='basic'?'Обычный анализ':'Крупные коэффициенты');return}
 }
 let reason='Загрузка истории…';if(state.ordered.length){reason=state.report?.fresh?(state.mode==='large'?state.report?.thresholds.find(t=>t.target===state.target)?.reason:state.mode==='basic'?'Накопление данных для обычного анализа':state.report?.timedRates?'Подготовка нового окна':`Измерение частот · ${Math.min(500,state.ordered.length)}/500 раундов`):'Данные устарели · анализ приостановлен'}
 $('signal').innerHTML=`<div class="signal-content">${state.mode==='large'?picker():''}<div class="scan-reticle"></div><p class="eyebrow">${state.mode==='large'?'Цель '+state.target+'×':'GOD PREDITOR'}</p><p class="analysis-label">${state.mode==='large'?'Историческая оценка':'Анализ коэффициентов'}</p><p class="note">${esc(reason)}</p></div>`;
}
function renderData(){
 const age=state.ordered.length?(now()-state.ordered[0].timestamp)/1000:null,connected=state.lastPoll&&now()-state.lastPoll<30000&&!state.error,fresh=age!==null&&age<=180;
 $('liveDot').className=connected&&fresh?'live':'stale';$('connection').textContent=connected?(fresh?'Supabase LIVE · время по Киеву':'Supabase · ожидание новых раундов'):state.error?'Переподключение к Supabase':'Подключение к Supabase…';
 $('dataAge').textContent=age==null?'—':`${Math.max(0,age).toFixed(0)} сек назад · ${formatTime(state.ordered[0].timestamp)}`;
 $('pollAge').textContent=state.lastPoll?`${Math.max(0,(now()-state.lastPoll)/1000).toFixed(0)} сек назад`:'—';$('responseTime').textContent=state.lastLatency?`${Math.round(state.lastLatency)} мс`:'—';$('sampleCount').textContent=state.ordered.length.toLocaleString('ru-RU');$('workingSample').textContent=`${Math.min(state.ordered.length,5000).toLocaleString('ru-RU')} · Premium; ${state.ordered.length.toLocaleString('ru-RU')} · крупные X`;
 $('archiveCoverage').textContent=state.ordered.length?`${formatDate(state.ordered.at(-1).timestamp)} ${formatTime(state.ordered.at(-1).timestamp)} → ${formatDate(state.ordered[0].timestamp)} ${formatTime(state.ordered[0].timestamp)}`:'—';if(!state.storageError)$('dataError').textContent=state.error;
 $('streamState').innerHTML=`<i></i>${connected?(fresh?'Поток в реальном времени':'Новые раунды пока не поступают'):'Подключение к источнику'} · ${state.ordered.length.toLocaleString('ru-RU')} раундов`;
}
function renderHistory(){
 const minimum=Number($('historyTarget').value),rows=state.ordered.filter(r=>r.coefficient>=minimum),shown=rows.slice(0,state.historyShown);
 $('historyCount').textContent=`Загружено ${state.ordered.length.toLocaleString('ru-RU')} · по фильтру ${rows.length.toLocaleString('ru-RU')} · ${state.allLoaded?'вся доступная история':'есть более ранние данные'}`;
 $('historyRows').innerHTML=shown.map(r=>`<div class="history-row"><strong class="${color(r.coefficient)}">${coef(r.coefficient)}×</strong><time datetime="${new Date(r.timestamp).toISOString()}">${formatDate(r.timestamp)} · ${formatTime(r.timestamp)}</time></div>`).join('')+(rows.length>shown.length?'<button class="quiet" id="showMoreRows">Показать ещё 200 загруженных</button>':'');
 $('historyProgress').textContent=state.allBusy?`Загрузка всей истории: ${state.ordered.length.toLocaleString('ru-RU')} раундов. Можно остановить и продолжить позже.`:state.allLoaded?'Загружена вся история, доступная этому подключению.':'';
 updateHistoryControls();
}
function updateHistoryControls(){$('moreHistory').disabled=state.moreBusy||state.allBusy||state.allLoaded;$('allHistory').disabled=state.moreBusy||state.allBusy||state.allLoaded;$('stopHistory').hidden=!state.allBusy}
function renderStats(){
 const c={hit:0,miss:0,unknown:0,pending:0};for(const r of journal)if(r.status in c)c[r.status]++;
 $('statTiles').innerHTML=['hit','miss','unknown','pending'].map(k=>`<div><strong>${c[k]}</strong><span>${k==='hit'?'Зашло':k==='miss'?'Не зашло':k==='unknown'?'Нет полных данных':'Ожидают'}</span></div>`).join('');const verified=c.hit+c.miss;
 $('statRate').textContent=verified?`${c.hit} из ${verified} полностью проверенных окон (${(100*c.hit/verified).toFixed(1)}%). Окна разных целей и режимов пересекаются; это не независимые испытания и не точность следующего раунда.`:'Проверенных результатов пока нет. Статистика появится после закрытия созданных окон.';
 const targets=[...new Set(journal.map(x=>x.target))].sort((a,b)=>a-b);$('targetStats').innerHTML=targets.map(t=>{const rows=journal.filter(r=>r.target===t);return`<tr><td>${coef(t)}×</td>${['hit','miss','unknown','pending'].map(k=>`<td>${rows.filter(r=>r.status===k).length}</td>`).join('')}</tr>`}).join('');
 $('journalRows').innerHTML=journal.slice(0,100).map(r=>`<div class="journal-row ${r.status}"><div><strong>${coef(r.target)}×</strong> · ${esc(names[r.channel]??'История крупных X')}<small>${formatDate(r.start)} · ${formatTime(r.start)}–${formatTime(r.end)}</small>${r.actual?`<small>Максимум окна: ${coef(r.actual)}×</small>`:''}</div><span class="status">${labels[r.status]??esc(r.status)}</span></div>`).join('');
}
function ruPattern(value){if(!value)return'Обычный анализ';if(value.includes('Cycle'))return'Медианный цикл коэффициентов ≥10×';if(value.startsWith('Série'))return'Серия из 15 небольших коэффициентов';if(value.includes('cotes ≥20'))return'Кластер коэффициентов ≥20×';if(value.startsWith('Phase mixte'))return'Смешанная фаза · коэффициенты 5–9×';if(value.startsWith('Phase favorable'))return'Фаза коэффициентов 5–9×';if(value.includes('favorable'))return'Повышенная историческая частота в этот час';if(value.includes('faible'))return'Пониженная историческая частота в этот час';return'Анализ нескольких статистических признаков'}
function renderModelDetails(){
 const r=state.report;if(!r)return;const rates=r.timedRates;$('modelSummary').innerHTML=`<div class="model-card"><h3>Premium · временные окна</h3><p>${rates?`${rates.sample.toLocaleString('ru-RU')} раундов · ${rates.perHour.toFixed(1)} раунда/час по медианному интервалу`:'Для расчёта необходимо не менее 500 точных раундов.'}</p><p>Перенесены правила текущего клиентского модуля: приоритет 100×/20× по нижней границе Уилсона, отдельные сценарии 5× и 10×, выбор цели по частоте. Проценты относятся ко всему окну, а не к следующему раунду.</p></div>`;
 if(rates){const durations=TIMED_DURATIONS.map(m=>({minutes:m,pred:timedLargest(m,rates.pct,rates.perHour)}));$('modelSummary').insertAdjacentHTML('beforeend',`<details><summary>Временные оценки по длительности · 6 интервалов</summary><p class="muted">Максимальная цель из исходной сетки 2/5/10/100/1000×, чья модельная вероятность в выбранном интервале ≥69%. Это справочные оценки; они не создают дополнительную рекомендацию на основном экране.</p><div class="table-scroll"><table><thead><tr><th>Длительность</th><th>Цель</th><th>Оценка за окно</th></tr></thead><tbody>${durations.map(d=>`<tr><td>${d.minutes} мин</td><td>${d.pred?d.pred.level+'×':'Нет подходящей цели'}</td><td>${d.pred?d.pred.chance.toFixed(1)+'%':'—'}</td></tr>`).join('')}</tbody></table></div></details>`)}
 const legacy=r.legacyDiagnostics;if(legacy){const ai=legacy.ai_analyze,archive=Object.entries(legacy.three_archive_analysis??{}).filter(([,v])=>v);$('modelSummary').insertAdjacentHTML('beforeend',`<details><summary>Сохранённые модели из Python-файла · диагностика</summary><p class="muted">Локальный AI-анализ: ${ai?.ok?'активен · '+ai.n+' раундов':'недостаточно событий'}. Архивные сравнения: ${archive.map(([t])=>t+'×').join(', ')||'недостаточно событий'}. Эти коррелирующие эвристики сохранены для сопоставления с источником. Их старое принудительное смещение просроченной отметки в будущее не используется как подтверждённое время входа.</p><p class="muted">Приватная серверная AI-формула в клиентских файлах отсутствует. Непроверенные внешние ключи не вызываются браузером.</p></details>`)}
 $('thresholdCards').innerHTML=r.thresholds.map(t=>{const win=active(`vip_${t.target}`),interval=t.interval95?`${(t.interval95[0]*100).toFixed(1)}–${(t.interval95[1]*100).toFixed(1)}%`:'—';return`<article class="threshold-card"><h3>${t.target}×+</h3><div class="next-time">${win?`${formatTime(win.start)} → ${formatTime(win.end)}`:t.estimatedAt?formatTime(t.estimatedAt):'Будущая отметка не подтверждена'}</div><p>${t.events} исторических событий · медианный интервал ${t.medianGapMs?(t.medianGapMs/60000).toFixed(1)+' мин':'—'}</p><p>За 3 минуты: ${t.probability==null?'—':(t.probability*100).toFixed(1)+'%'} · диапазон 95%: ${interval}</p><p>${esc(t.reason)}</p><button data-focus-target="${t.target}" class="quiet">Показать на круге ↗</button></article>`}).join('');
 const b=r.basic;$('ordinaryCard').innerHTML=b?`<h3>Обычный анализ · ${coef(b.estimatedCoef)}×</h3><p>${ruPattern(b.pattern)}</p><p>Окно: ${formatTime(b.estimatedAt)} → ${formatTime(b.estimatedAt+b.windowMs)}</p><p>Балл правил: ${b.reliability}/100. Это эвристическая оценка, а не измеренная вероятность.</p><p>Базовый модуль и исходный TS-профиль сохранены отдельно в проекте.</p>`:'<h3>Обычный анализ</h3><p>Недостаточно свежих данных.</p>';
}

document.addEventListener('click',event=>{
 const close=event.target.closest('[data-close]');if(close)$(close.dataset.close).close();
 const mode=event.target.closest('[data-mode]');if(mode){state.mode=mode.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>{const selected=b===mode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected))});renderSignal()}
 const target=event.target.closest('[data-target]');if(target){state.target=Number(target.dataset.target);renderSignal()}
 const focus=event.target.closest('[data-focus-target]');if(focus){state.target=Number(focus.dataset.focusTarget);document.querySelector('[data-mode=large]').click();$('insightsDialog').close()}
 const tab=event.target.closest('[data-tab]');if(tab){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b===tab));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==tab.dataset.tab)}
 if(event.target.id==='showMoreRows'){state.historyShown+=200;renderHistory()}
});
$('openHistory').onclick=()=>{renderHistory();$('historyDialog').showModal()};$('openInsights').onclick=()=>{renderStats();renderModelDetails();renderData();$('insightsDialog').showModal()};
$('historyTarget').onchange=()=>{state.historyShown=200;renderHistory()};$('moreHistory').onclick=moreHistory;
$('allHistory').onclick=async()=>{state.allBusy=true;state.stop=false;updateHistoryControls();while(!state.stop&&!state.allLoaded){await moreHistory();if(state.error)break;await new Promise(resolve=>setTimeout(resolve,100))}state.allBusy=false;updateHistoryControls();renderHistory()};$('stopHistory').onclick=()=>{state.stop=true};
$('historyDialog').addEventListener('close',()=>{state.stop=true});
$('exportHistory').onclick=()=>{const rows=state.ordered.slice().reverse();download('GOD-PREDITOR-history.csv','id,coefficient,timestamp_utc\n'+rows.map(r=>`${JSON.stringify(r.id)},${r.coefficient},${new Date(r.timestamp).toISOString()}`).join('\n'),'text/csv;charset=utf-8')};
$('exportJournal').onclick=()=>download('GOD-PREDITOR-journal.json',JSON.stringify({version:CONFIG.VERSION,scope:'this_browser',exportedAt:new Date(now()).toISOString(),signals:journal},null,2),'application/json');
$('refreshData').onclick=()=>poll();
for(const[id,key]of[['spiderVisible','spider'],['economyMode','economy'],['vividMode','vivid']])$(id).onchange=()=>{prefs[key]=$(id).checked;applyPrefs();scene.resize()};
$('pageBrightness').oninput=()=>{prefs.brightness=Number($('pageBrightness').value);applyPrefs()};
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d&&e.clientX<d.getBoundingClientRect().left)d.close()});
setInterval(()=>{$('clock').textContent=formatTime(now())+' КИЕВ';renderData();if(!state.ingest)renderSignal()},1000);
setInterval(poll,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});window.addEventListener('online',poll);
renderStats();await poll();for(let i=0;i<4&&!state.allLoaded;i++)await moreHistory();maybePremium();
