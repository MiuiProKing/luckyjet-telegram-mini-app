/* GOD PREDITOR SPIDER LIVE · Supabase confirmed-history dashboard.
   No fictitious coefficients, private keys, Premium bypasses or server-AI claims. */
'use strict';

const CONFIG = Object.freeze({
  url: 'https://stzrirukuxcyalrsstxx.supabase.co',
  // Publishable/anon key only. Do NOT put Telegram, Gemini or service_role here.
  key: 'sb_publishable_ZhoUzbPBM33K3qoL-HY20Q_oVU4ebc7',
  primary: 'god_bayes_rounds_v1',
  fallback: 'luckyjet_rounds',
  batchSize: 1000,
  maxRows: 5000,
  refreshMs: 15000,
  maxLagMs: 180000,
  timezone: 'Europe/Kyiv'
});

const $ = (id) => document.getElementById(id);
const kyivStamp = new Intl.DateTimeFormat('ru-RU', {
  timeZone: CONFIG.timezone, day:'2-digit', month:'2-digit', hour:'2-digit',
  minute:'2-digit',second:'2-digit',hour12:false
});
const kyivTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone:CONFIG.timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
});
const kyivMinute = new Intl.DateTimeFormat('en-GB', {timeZone: CONFIG.timezone,minute:'2-digit'});
const kyivSecond = new Intl.DateTimeFormat('en-GB', {timeZone: CONFIG.timezone,second:'2-digit'});
const kyivDay = new Intl.DateTimeFormat('ru-RU', {timeZone: CONFIG.timezone,day:'2-digit',month:'2-digit',year:'numeric'});
const fmtCoef = (x) => Number.isFinite(x) ? `${x.toFixed(2)}×` : '—';
const fmtTime = (ms) => Number.isFinite(ms) ? kyivTime.format(new Date(ms)) : '—';
const fmtStamp = (ms) => Number.isFinite(ms) ? kyivStamp.format(new Date(ms)) : '—';
const fmtNumber = (x, dec=2) => Number.isFinite(x) ? x.toLocaleString('ru-RU',{maximumFractionDigits:dec}) : '—';
const clamp = (x,min,max) => Math.max(min,Math.min(max,x));
const median = (a) => {if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const isRecent = (ms) => Number.isFinite(ms) && Date.now()-ms <= CONFIG.maxLagMs && ms <= Date.now()+30000;

const state = {
  rows:[],target:20,table:CONFIG.primary,schema:'god',phase:'loading',
  lastSync:null,lastResponse:null,stream:'REST',socket:null,hasRealtime:false,
  loading:false, filter:'10',visibleCount:35,error:null,
  signals:readSignals(), toastTimer:null, refreshTimer:null, heartbeatTimer:null,
  reconnectTimer:null, socketRef:1, active:false
};

function readSignals(){
  try {const raw=JSON.parse(localStorage.getItem('god-spider-signals-v1')||'[]');
    return Array.isArray(raw)?raw.filter(x=>x && [20,40,200,500].includes(x.target)).slice(0,30):[];
  }catch{return [];}
}
function saveSignals(){try{localStorage.setItem('god-spider-signals-v1',JSON.stringify(state.signals.slice(0,30)));}catch{}}
function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>t.classList.remove('show'),4000);}

// A round is usable only if a real source supplies a finite coefficient and timestamp.
function normalizeRound(raw,schema){
  if(!raw || typeof raw!=='object')return null;
  if(schema==='god' && raw.estimated!==false)return null;
  const coef=Number(raw.coefficient);
  const timestamp=Date.parse(schema==='god'?raw.round_timestamp:raw.played_at);
  if(!Number.isFinite(coef)||coef<1||!Number.isFinite(timestamp)||timestamp<=0||timestamp>Date.now()+30000)return null;
  return {id:String(raw.id ?? `${timestamp}:${coef}`),coefficient:coef,timestamp,
    order:raw.feed_order!=null?Number(raw.feed_order):null, confirmed:true};
}
function mergeRoundRows(newRows){
  const seen=new Map(state.rows.map(row=>[row.id,row]));
  for(const row of newRows){const prev=seen.get(row.id);if(!prev||row.timestamp>=prev.timestamp)seen.set(row.id,row);}
  const previous=state.rows[0]?.id;
  state.rows=Array.from(seen.values()).sort((a,b)=>b.timestamp-a.timestamp||(b.order||0)-(a.order||0)).slice(0,CONFIG.maxRows);
  return Boolean(previous && state.rows[0]?.id!==previous);
}

function apiUrl(table,schema,before,limit){
  const fields=schema==='god'?'id,coefficient,round_timestamp,estimated,feed_order':'coefficient,played_at';
  const order=schema==='god'?'feed_order.desc':'played_at.desc';
  const qs=new URLSearchParams({select:fields,order,limit:String(limit)});
  if(schema==='god'){
    qs.set('estimated','eq.false');
    if(before!==null)qs.set('feed_order','lt.'+String(before));
  }else if(before!==null)qs.set('played_at','lt.'+String(before));
  return `${CONFIG.url}/rest/v1/${table}?${qs.toString()}`;
}
async function fetchPage(table,schema,before=null,limit=CONFIG.batchSize){
  const controller=new AbortController();
  const abort=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(apiUrl(table,schema,before,limit),{
      method:'GET',headers:{apikey:CONFIG.key,Accept:'application/json'},
      cache:'no-store',signal:controller.signal,redirect:'error'});
    const raw=await response.text();
    if(!response.ok){let message=`Supabase HTTP ${response.status}`;
      try{const parsed=JSON.parse(raw);message+=` · ${String(parsed.message||parsed.code||'').slice(0,130)}`;}catch{}
      throw new Error(message);}
    let arr;try{arr=JSON.parse(raw);}catch{throw new Error('Supabase вернул не JSON');}
    if(!Array.isArray(arr))throw new Error('Supabase вернул неожиданный формат');
    return arr;
  }finally{clearTimeout(abort);}
}

async function fullRefresh(){
  if(state.loading)return;
  state.loading=true;state.error=null;
  try{
    const tableOptions=[{name:CONFIG.primary,schema:'god'},{name:CONFIG.fallback,schema:'simple'}];
    let selected=null,firstPage=null,errors=[];
    for(const candidate of tableOptions){
      try{firstPage=await fetchPage(candidate.name,candidate.schema);selected=candidate;break;}
      catch(error){errors.push(`${candidate.name}: ${error.message}`);}
    }
    if(!selected)throw new Error(errors.join(' | '));
    state.table=selected.name;state.schema=selected.schema;
    let pages=[firstPage],cursor=null;
    for(let page=1;page<Math.ceil(CONFIG.maxRows/CONFIG.batchSize);page++){
      const last=pages[pages.length-1];if(last.length<CONFIG.batchSize)break;
      const tail=last[last.length-1];
      cursor=selected.schema==='god'?tail.feed_order:tail.played_at;
      if(cursor===null||cursor===undefined)break;
      const next=await fetchPage(selected.name,selected.schema,cursor);
      if(!next.length)break;
      pages.push(next);
    }
    const source=pages.flat();
    state.rows=[];mergeRoundRows(source.map(row=>normalizeRound(row,selected.schema)).filter(Boolean));
    state.lastSync=Date.now();state.lastResponse=Date.now();state.error=null;
    state.phase=state.rows.length?'connected':'empty';
    render();connectRealtime();
  }catch(error){state.phase='error';state.error=String(error.message||error);render();}
  finally{state.loading=false;}
}

async function syncHead(){
  if(state.loading)return;
  state.loading=true;
  try{
    const page=await fetchPage(state.table,state.schema,null,CONFIG.batchSize);
    mergeRoundRows(page.map(row=>normalizeRound(row,state.schema)).filter(Boolean));
    state.lastSync=Date.now();state.lastResponse=Date.now();state.error=null;
    state.phase=state.rows.length?'connected':'empty';
    render();
  }catch(error){state.error=String(error.message||error);state.phase='error';renderStatus();}
  finally{state.loading=false;}
}

function disconnectRealtime(){
  clearInterval(state.heartbeatTimer);clearTimeout(state.reconnectTimer);
  if(state.socket){try{state.socket.onclose=null;state.socket.close();}catch{}}
  state.socket=null;state.hasRealtime=false;state.stream='REST';
}
function connectRealtime(){
  disconnectRealtime();
  if(state.schema!=='god' || !('WebSocket' in window))return;
  const origin=new URL(CONFIG.url);
  const address=`wss://${origin.host}/realtime/v1/websocket?apikey=${encodeURIComponent(CONFIG.key)}&vsn=1.0.0`;
  try{
    const ws=new WebSocket(address);
    state.socket=ws;let joined=false;
    ws.onopen=()=>{
      ws.send(JSON.stringify({topic:`realtime:public:${state.table}`,event:'phx_join',
        payload:{config:{postgres_changes:[{event:'INSERT',schema:'public',table:state.table}],
          broadcast:{ack:false,self:false},presence:{key:''}},access_token:CONFIG.key},
        ref:'1',join_ref:'1'}));
      state.heartbeatTimer=setInterval(()=>{
        if(ws.readyState===WebSocket.OPEN){state.socketRef++;
          ws.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:String(state.socketRef)}));}
      },25000);
    };
    ws.onmessage=(event)=>{
      let msg;try{msg=JSON.parse(event.data);}catch{return;}
      if(msg.event==='phx_reply'&&msg.ref==='1'){
        joined=msg.payload?.status==='ok';state.hasRealtime=joined;
        state.stream=joined?'REALTIME + REST':'REST';renderStatus();
        if(!joined)ws.close();
      }
      if(msg.event==='postgres_changes'&&joined){
        // Trigger an authoritative REST read; never treat an unverified socket
        // message as a confirmed winning coefficient.
        state.stream='REALTIME + REST';syncHead();
      }
      if(msg.event==='phx_error'||msg.event==='phx_close')ws.close();
    };
    ws.onclose=()=>{
      if(state.socket!==ws)return;
      state.hasRealtime=false;state.stream='REST';renderStatus();
      clearInterval(state.heartbeatTimer);
      state.reconnectTimer=setTimeout(connectRealtime,30000);
    };
    ws.onerror=()=>{state.hasRealtime=false;state.stream='REST';renderStatus();};
  }catch{state.stream='REST';renderStatus();}
}

function roundHistory(){return state.rows.filter(row=>row.confirmed).sort((a,b)=>a.timestamp-b.timestamp);}
function calculate(target=state.target, now=Date.now()){
  const points=roundHistory().filter(r=>r.timestamp<=now+5000);
  if(points.length<200)return {ok:false,reason:`Нужно ≥200 подтверждённых раундов, есть ${points.length}`};
  if(!isRecent(points[points.length-1].timestamp))return {ok:false,reason:'История устарела: новых раундов нет более 180 секунд'};
  const hits=points.filter(r=>r.coefficient>=target);
  if(hits.length<5)return {ok:false,reason:`Недостаточно событий ≥${target}×: найдено ${hits.length}, нужно ≥5`};
  const gaps=hits.slice(1).map((r,i)=>r.timestamp-hits[i].timestamp).filter(x=>x>0);
  const medianGap=median(gaps), avgGap=gaps.reduce((a,b)=>a+b,0)/gaps.length;
  if(!medianGap)return {ok:false,reason:'Недостаточно валидных интервалов'};
  const madGap=median(gaps.map(x=>Math.abs(x-medianGap)));
  const elapsed=Math.max(0,now-hits[hits.length-1].timestamp);
  const cycles=Math.max(1,Math.ceil((now+15000-hits[hits.length-1].timestamp)/medianGap));
  const start=Math.max(now+15000,hits[hits.length-1].timestamp+cycles*medianGap);
  const spanMinutes=Math.max((points[points.length-1].timestamp-points[0].timestamp)/60000,1/60);
  const perMinute=hits.length/spanMinutes;
  const frequencyPct=100*hits.length/points.length;
  const probNext3MinPct=100*-Math.expm1(-3*perMinute);
  return {ok:true,target,hits:hits.length,sample:points.length,frequencyPct,
    avgGapMinutes:avgGap/60000,medianGapMinutes:medianGap/60000,
    madGapMinutes:madGap/60000,last: hits[hits.length-1],elapsedMinutes:elapsed/60000,
    start,end:start+180000,probNext3MinPct:clamp(probNext3MinPct,0,100),
    recentAt:points[points.length-1].timestamp,
    source:'Исторический медианный интервал + базовая пуассоновская частота'};
}

function insuranceX(){
  const big=state.rows.slice(0,30).map(r=>r.coefficient).filter(x=>x>=20);
  if(big.length<3)return null;
  const divisor=big.length>=5?3:big.length===4?4:5;
  const geometric=Math.exp(big.reduce((a,x)=>a+Math.log(x),0)/big.length);
  return clamp(geometric/divisor,2,12);
}

function verifySignals(){
  let changed=false;
  if(!state.rows.length)return;
  const points=roundHistory();
  const newest=points[points.length-1].timestamp;
  const roundsGaps=points.slice(-200).slice(1).map((r,i)=>r.timestamp-points.slice(-200)[i].timestamp).filter(g=>g>0);
  const pace=median(roundsGaps)||30000;
  const maxGap=Math.min(180000,Math.max(60000,3*pace));
  for(const signal of state.signals){
    if(signal.status!=='pending'||Date.now()<signal.end+10000||newest<signal.end)continue;
    const before=points.filter(x=>x.timestamp<=signal.start).at(-1);
    const after=points.find(x=>x.timestamp>=signal.end);
    const window=points.filter(x=>x.timestamp>signal.start&&x.timestamp<=signal.end);
    if(!before||!after||!window.length)continue;
    const path=[before,...window,after].sort((a,b)=>a.timestamp-b.timestamp);
    if(path.some((r,i)=>i>0&&r.timestamp-path[i-1].timestamp>maxGap))continue;
    const best=Math.max(...window.map(x=>x.coefficient));
    signal.status=best>=signal.target?'hit':'miss';signal.best=best;
    signal.checkedAt=Date.now();changed=true;
  }
  if(changed){saveSignals();toast('Проверка окон обновлена по подтверждённой истории');}
}

function csvDownload(filename,header,rows){
  const escapeCsv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const data='\ufeff'+[header,...rows].map(row=>row.map(escapeCsv).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function renderStatus(){
  const latest=state.rows[0];
  const stale=latest&&!isRecent(latest.timestamp);
  const problem=state.phase==='error'||stale;
  const status=$('connection-status');
  status.className=`status ${problem?'status-error':state.phase==='connected'?'status-live':'status-wait'}`;
  status.querySelector('span').textContent=state.phase==='error'?'ОШИБКА ИСТОЧНИКА':stale?'ИСТОРИЯ УСТАРЕЛА':state.phase==='connected'?'БАЗА ПОДКЛЮЧЕНА':state.phase==='empty'?'НЕТ РАУНДОВ':'ПОДКЛЮЧЕНИЕ';
  $('stream-label').textContent=state.stream==='REALTIME + REST'?'● SUPABASE REALTIME':`● SUPABASE ${state.stream}`;
  $('scanner-state').textContent=problem?'OFFLINE':latest?'TRACKING':'WAITING';
  $('scanner-count').textContent=String(state.rows.length);
  $('feed-health-pill').textContent=problem?'WARNING':state.phase==='connected'?'ONLINE':state.phase==='empty'?'NO DATA':'CHECKING';
  $('feed-health-pill').style.color=problem?'#ff9aaa':state.phase==='connected'?'#82f4bd':'';
  $('last-sync').textContent=fmtStamp(state.lastSync);
  $('transport').textContent=state.stream;
  $('feed-explainer').textContent=state.error
    ?`Данные источника недоступны: ${state.error}`
    :stale?`Последний подтверждённый раунд ${fmtStamp(latest.timestamp)}. Новые коэффициенты пока не приходят.`
    :state.phase==='empty'?'База ответила, но подтверждённых раундов пока нет.'
    :state.phase==='connected'?`Подтверждённая история ${state.table}. Опрос 15 с, Realtime — если разрешён для таблицы.`
    :'Подключаемся к Supabase…';
  $('footer-timestamp').textContent=fmtStamp(state.lastSync);
}

function renderRecent(){
  const latest=state.rows[0];
  $('current-coef').textContent=latest?fmtCoef(latest.coefficient):'—';
  $('current-time').textContent=latest?`${fmtStamp(latest.timestamp)} · Киев`:'Нет подтверждённых данных';
  const wrap=$('recent-list');wrap.replaceChildren();
  if(!latest){const empty=document.createElement('span');empty.className='empty-inline';empty.textContent='Подтверждённых коэффициентов пока нет';wrap.append(empty);return;}
  for(const round of state.rows.slice(0,5)){
    const tile=document.createElement('div');
    tile.className=`coef-tile ${round.coefficient>=100?'mega':round.coefficient>=10?'gold':'blue'}`;
    const coef=document.createElement('b');coef.textContent=fmtCoef(round.coefficient);
    const time=document.createElement('span');time.textContent=fmtTime(round.timestamp);
    tile.append(coef,time);wrap.append(tile);
  }
}

function renderStats(){
  const points=state.rows;
  const max=points.reduce((a,b)=>!a||b.coefficient>a.coefficient?b:a,null);
  const over10=points.filter(r=>r.coefficient>=10);
  const over100=points.find(r=>r.coefficient>=100);
  $('metric-total').textContent=points.length?fmtNumber(points.length,0):'—';
  $('metric-source').textContent=points.length?`${state.table} · последние ${fmtNumber(points.length,0)}`:'Supabase · нет данных';
  $('metric-max').textContent=max?fmtCoef(max.coefficient):'—';
  $('metric-max-time').textContent=max?fmtStamp(max.timestamp):'—';
  $('metric-big-count').textContent=points.length?String(over10.length):'—';
  $('metric-big-rate').textContent=points.length?`Частота ${(100*over10.length/points.length).toFixed(2)}%`:'Частота —';
  $('metric-last-100').textContent=over100?fmtCoef(over100.coefficient):'—';
  $('metric-last-100-time').textContent=over100?fmtStamp(over100.timestamp):'Не обнаружен в выборке';
}

function allTargetStats(target){
  const points=roundHistory(),hits=points.filter(r=>r.coefficient>=target);
  const gaps=hits.slice(1).map((r,i)=>(r.timestamp-hits[i].timestamp)/60000).filter(x=>x>0);
  return {points,hits,gaps,avg:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null,med:median(gaps)};
}

function renderForecast(){
  $('summary-target').textContent=String(state.target);
  const {points,hits,avg,med}=allTargetStats(state.target);
  $('detail-events').textContent=points.length?String(hits.length):'—';
  $('detail-average').textContent=avg!==null?`${fmtNumber(avg)} мин`:'—';
  $('detail-median').textContent=med!==null?`${fmtNumber(med)} мин`:'—';
  $('detail-last').textContent=hits.length?fmtCoef(hits.at(-1).coefficient):'—';
  const calc=calculate(state.target);
  const panel=$('forecast-panel');panel.replaceChildren();
  $('signal-button').disabled=!calc.ok;
  $('export-report').disabled=!points.length;
  if(!calc.ok){const block=document.createElement('div');block.className='forecast-empty';
    block.textContent=calc.reason;panel.append(block);return;}
  // Every interpolated value here is locally generated numeric/date output.
  const card=document.createElement('div');
  card.innerHTML=`<div class="forecast-top"><div class="forecast-target"><strong>≥${calc.target}×</strong><small>СТАТИСТИЧЕСКАЯ ЗОНА</small></div><span class="forecast-tag">ОЦЕНКА · 3 МИН</span></div>
    <div class="forecast-data"><div><small>РАСЧЁТНОЕ НАЧАЛО · КИЕВ</small><strong>${fmtStamp(calc.start)}</strong></div><div><small>ЗАКРЫТИЕ ОКНА · КИЕВ</small><strong>${fmtStamp(calc.end)}</strong></div><div><small>ОЦЕНКА ЧАСТОТЫ В 3 МИН</small><strong>${fmtNumber(calc.probNext3MinPct)}%</strong></div><div><small>ИСТОРИЧЕСКАЯ ЧАСТОТА</small><strong>${fmtNumber(calc.frequencyPct)}%</strong></div><div><small>МЕДИАННЫЙ ИНТЕРВАЛ</small><strong>${fmtNumber(calc.medianGapMinutes)} мин</strong></div><div><small>ПОСЛЕДНИЙ ≥${calc.target}×</small><strong>${fmtStamp(calc.last.timestamp)}</strong></div></div>
    <p class="forecast-note">Основа: ${calc.hits} событий / ${calc.sample} раундов. Это описание статистики и ориентировочное окно, не сигнал с гарантией выигрыша.</p>`;
  panel.append(card);
  const latest=state.signals.find(s=>s.target===state.target);
  if(latest){const note=document.createElement('p');note.className='forecast-note';
    note.textContent=`Последний сохранённый расчёт ${fmtStamp(latest.start)}–${fmtTime(latest.end)}: ${latest.status==='pending'?'ожидание проверки':latest.status==='hit'?`✅ ≥${latest.target}× зашло (${fmtCoef(latest.best)})`:`❌ ≥${latest.target}× не зашло; максимум ${fmtCoef(latest.best)}`}`;
    panel.append(note);}
}

function renderHeatmap(){
  const source=roundHistory(),total=Array(60).fill(0),hits=Array(60).fill(0);
  const secondTotals=Array(6).fill(0),secondHits=Array(6).fill(0);
  for(const row of source){
    const min=Number(kyivMinute.format(new Date(row.timestamp)));
    const sec=Number(kyivSecond.format(new Date(row.timestamp)));
    if(!Number.isInteger(min)||!Number.isInteger(sec))continue;
    total[min]++;secondTotals[Math.floor(sec/10)]++;
    if(row.coefficient>=state.target){hits[min]++;secondHits[Math.floor(sec/10)]++;}
  }
  const root=$('minute-heatmap');root.replaceChildren();
  const rates=total.map((n,i)=>n?hits[i]/n:0),maxRate=Math.max(...rates,0.00001);
  for(let minute=0;minute<60;minute++){
    const item=document.createElement('div');item.className='minute-cell';
    const intensity=total[minute]?(rates[minute]/maxRate):0;
    item.style.background=total[minute]?`rgba(159,87,255,${0.08+intensity*0.72})`:'rgba(81,73,99,.13)';
    item.style.borderColor=total[minute]?`rgba(216,165,255,${0.14+intensity*.46})`:'#242137';
    item.title=`:${String(minute).padStart(2,'0')} · ≥${state.target}×: ${hits[minute]} из ${total[minute]} (${(rates[minute]*100).toFixed(1)}%)`;
    const m=document.createElement('b');m.textContent=`:${String(minute).padStart(2,'0')}`;
    const n=document.createElement('small');n.textContent=total[minute]?`${hits[minute]}/${total[minute]}`:'—';item.append(m,n);root.append(item);
  }
  const ranking=$('top-minutes');ranking.replaceChildren();
  const ordered=Array.from({length:60},(_,i)=>i).filter(i=>total[i]>=3)
    .sort((a,b)=>rates[b]-rates[a]||hits[b]-hits[a]).slice(0,5);
  if(!ordered.length){const li=document.createElement('li');li.textContent='Недостаточно истории';ranking.append(li);}
  for(const i of ordered){const li=document.createElement('li');
    const left=document.createElement('span');left.className='ranking-time';left.textContent=`:${String(i).padStart(2,'0')}`;
    const right=document.createElement('span');right.className='ranking-info';
    right.textContent=`${(100*rates[i]).toFixed(1)}% · ${hits[i]}/${total[i]}`;
    li.append(left,right);ranking.append(li);}
  const bars=$('seconds-distribution');bars.replaceChildren();
  for(let i=0;i<6;i++){
    const row=document.createElement('div');row.className='second-row';
    const label=document.createElement('span');label.textContent=`:${String(i*10).padStart(2,'0')}–${String(i*10+9).padStart(2,'0')}`;
    const track=document.createElement('div');track.className='bar-track';
    const fill=document.createElement('div');fill.className='bar-fill';
    const rate=secondTotals[i]?secondHits[i]/secondTotals[i]:0;
    fill.style.width=`${rate*100}%`;track.append(fill);
    const number=document.createElement('b');number.textContent=secondTotals[i]?`${(rate*100).toFixed(1)}%`:'—';
    row.append(label,track,number);bars.append(row);
  }
}

function filteredHistory(){
  const t=state.filter==='all'?1:Number(state.filter);
  return state.rows.filter(r=>r.coefficient>=t);
}

function renderHistory(){
  const matches=filteredHistory(),page=matches.slice(0,state.visibleCount),table=$('rounds-tbody');
  table.replaceChildren();
  if(!page.length){const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=4;td.className='empty-table';td.textContent=state.rows.length?'Нет событий по этому фильтру':'Нет подтверждённых раундов';tr.append(td);table.append(tr);}
  for(const round of page){
    const tr=document.createElement('tr');
    const coef=document.createElement('td');coef.className=round.coefficient>=100?'coef-hot':round.coefficient>=10?'coef-big':'';
    const value=document.createElement('b');value.textContent=fmtCoef(round.coefficient);coef.append(value);
    const date=document.createElement('td');date.textContent=kyivDay.format(new Date(round.timestamp));
    const time=document.createElement('td');time.className='mono';time.textContent=fmtTime(round.timestamp);
    const event=document.createElement('td');const badge=document.createElement('span');badge.className='event-badge';
    badge.textContent=round.coefficient>=500?'MEGA 500×':round.coefficient>=200?'BIG 200×':round.coefficient>=100?'BIG 100×':round.coefficient>=40?'BIG 40×':round.coefficient>=20?'BIG 20×':round.coefficient>=10?'10×+':'ORDINARY';
    event.append(badge);tr.append(coef,date,time,event);table.append(tr);
  }
  $('shown-count').textContent=`${page.length} из ${matches.length} записей · загружено ${state.rows.length} раундов`;
  $('show-more').hidden=page.length>=matches.length;
  $('download-history').disabled=!matches.length;
}

function canvasScale(canvas){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
  if(rect.width<=0||rect.height<=0)return null;
  const width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx,w:rect.width,h:rect.height};
}

function drawChart(){
  const info=canvasScale($('history-chart'));if(!info)return;
  const {ctx,w,h}=info;ctx.clearRect(0,0,w,h);
  const data=state.rows.slice(0,120).reverse(),pad={left:32,right:13,top:14,bottom:23};
  ctx.font='10px monospace';ctx.strokeStyle='#43344d';ctx.lineWidth=1;
  const ymax=Math.max(2,...data.map(r=>Math.log10(r.coefficient)));
  for(let j=0;j<=4;j++){
    const yy=pad.top+(h-pad.top-pad.bottom)*(j/4);
    ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(w-pad.right,yy);ctx.stroke();
    ctx.fillStyle='#95889f';ctx.fillText(`${Math.round(10**(ymax*(1-j/4)))}x`,1,yy+3);
  }
  if(!data.length){ctx.fillStyle='#a894c0';ctx.textAlign='center';ctx.fillText('Данные ещё не получены',w/2,h/2);ctx.textAlign='left';return;}
  const dx=(w-pad.left-pad.right)/Math.max(1,data.length);
  for(let i=0;i<data.length;i++){
    const value=Math.log10(data[i].coefficient);
    const x=pad.left+i*dx+dx/2,y=h-pad.bottom-(h-pad.top-pad.bottom)*value/ymax;
    ctx.fillStyle=data[i].coefficient>=100?'#ff82c0':data[i].coefficient>=10?'#ffb861':'#9361ff';
    ctx.fillRect(x-Math.max(1,dx*.29),y,Math.max(1.1,dx*.58),h-pad.bottom-y);
  }
}

function saveReport(){
  const c=calculate(state.target),s=allTargetStats(state.target);
  const row=c.ok?[c.target,fmtStamp(c.start),fmtStamp(c.end),c.hits,c.sample,c.frequencyPct,c.probNext3MinPct,c.avgGapMinutes,c.medianGapMinutes,fmtStamp(c.last.timestamp),'Историческая оценка · не гарантия']
    :[state.target,'Нет расчёта',c.reason,s.hits.length,s.points.length,'','','','','',''];
  csvDownload(`god-preditor-report-${state.target}x.csv`,['Цель X','Окно начало Киев','Окно конец Киев','Попадания','Раунды','Историческая частота %','Базовая частота за 3 минуты %','Средний интервал мин','Медианный интервал мин','Последнее событие Киев','Примечание'],[row]);
}

function generateSignal(){
  const c=calculate(state.target);if(!c.ok){toast(c.reason);return;}
  const active=state.signals.find(s=>s.target===state.target&&s.status==='pending'&&s.end>Date.now());
  if(active){toast(`Расчёт ≥${state.target}× уже активен до ${fmtTime(active.end)}`);return;}
  state.signals.unshift({id:Date.now(),target:state.target,start:c.start,end:c.end,status:'pending',best:null});
  state.signals=state.signals.slice(0,30);saveSignals();renderForecast();
  toast(`📡 Расчёт ≥${c.target}× сохранён · ${fmtStamp(c.start)} → ${fmtTime(c.end)} Киев`);
}

function render(){verifySignals();renderStatus();renderRecent();renderStats();renderForecast();renderHeatmap();renderHistory();drawChart();}

function animateSpider(){
  const canvas=$('vortex-canvas');if(!canvas)return;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let frame=0;
  function paint(time){
    const info=canvasScale(canvas);if(!info)return;
    const {ctx,w,h}=info,cx=w/2,cy=h*.47,scale=Math.min(w/690,h/460,1.2);
    ctx.clearRect(0,0,w,h);
    const t=reduced?0:time/1000;
    const rx=Math.min(w*.39,260),ry=Math.min(h*.31,132);
    for(let band=0;band<14;band++){
      const depth=band/14,ang=t*(.13+depth*.14)+band*.43;
      ctx.beginPath();ctx.ellipse(cx,cy+Math.sin(ang)*4,rx*(.36+depth*.78),ry*(.45+depth*.55),-.28,0,Math.PI*2);
      ctx.strokeStyle=`rgba(${band%4===0?'223,141,255':'115,70,225'},${.05+depth*.09})`;
      ctx.lineWidth=band%3===0?1.8:.7;ctx.stroke();
    }
    for(let k=0;k<180;k++){
      const theta=k*2.399963+t*(.12+(k%7)*.007),r=Math.sqrt(k/180),
        x=cx+Math.cos(theta)*rx*r,y=cy+Math.sin(theta)*ry*r;
      ctx.fillStyle=`rgba(${k%3===0?'255,191,114':'159,105,255'},${.13+.35*(1-r)})`;
      ctx.fillRect(x,y,k%7===0?1.8:1,1);
    }
    // A visible, hand-drawn eight-legged robotic spider traverses the orbit.
    const theta=t*.46+Math.PI*.8;
    const px=cx+Math.cos(theta)*rx*.87,py=cy+Math.sin(theta)*ry*.9;
    const bob=Math.sin(t*10)*2.2, size=Math.max(19,Math.min(29,25*scale));
    ctx.save();ctx.translate(px,py+bob);ctx.rotate(theta+Math.PI/2);
    ctx.shadowColor='#b771ff';ctx.shadowBlur=12;
    ctx.lineCap='round';ctx.lineJoin='round';
    for(let side of[-1,1])for(let leg=0;leg<4;leg++){
      const attachY=(leg-1.5)*size*.37;
      const motion=Math.sin(t*11+leg*1.3+(side===-1?Math.PI:0))*size*.17;
      ctx.beginPath();ctx.moveTo(side*size*.26,attachY);
      ctx.lineTo(side*(size*.85+motion*.12),attachY+motion-size*.16);
      ctx.lineTo(side*(size*1.33),attachY+(leg-1.5)*size*.58+motion);
      ctx.strokeStyle='#e1bcff';ctx.lineWidth=2.3;ctx.stroke();
      ctx.strokeStyle='#6b42ce';ctx.lineWidth=.7;ctx.stroke();
    }
    ctx.fillStyle='#160f2a';ctx.strokeStyle='#dfb0ff';ctx.lineWidth=2.1;
    ctx.beginPath();ctx.ellipse(0,size*.26,size*.43,size*.55,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.ellipse(0,-size*.33,size*.51,size*.47,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fd98e6';ctx.shadowBlur=8;
    for(const e of[-1,1]){ctx.beginPath();ctx.arc(e*size*.17,-size*.42,size*.065,0,2*Math.PI);ctx.fill();}
    ctx.restore();
    if(!reduced)frame=requestAnimationFrame(paint);
  }
  frame=requestAnimationFrame(paint);
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame),{once:true});
}

function init(){
  $('kyiv-clock').textContent=fmtTime(Date.now());
  document.querySelectorAll('[data-target]').forEach(btn=>btn.addEventListener('click',()=>{
    state.target=Number(btn.dataset.target);
    document.querySelectorAll('[data-target]').forEach(b=>{
      const active=b===btn;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
    });renderForecast();renderHeatmap();
  }));
  $('history-filter').addEventListener('change',e=>{state.filter=e.target.value;state.visibleCount=35;renderHistory();});
  $('show-more').addEventListener('click',()=>{state.visibleCount+=35;renderHistory();});
  $('retry-button').addEventListener('click',()=>{toast('Проверяем Supabase…');fullRefresh();});
  $('signal-button').addEventListener('click',generateSignal);
  $('export-report').addEventListener('click',saveReport);
  $('download-history').addEventListener('click',()=>{
    const rows=filteredHistory().map(r=>[r.coefficient,kyivDay.format(new Date(r.timestamp)),fmtTime(r.timestamp),new Date(r.timestamp).toISOString(),state.table]);
    csvDownload('god-preditor-confirmed-history.csv',['Коэффициент X','Дата Киев','Время Киев','UTC','Таблица Supabase'],rows);
  });
  window.addEventListener('resize',drawChart);
  animateSpider();fullRefresh();
  setInterval(()=>{
    $('kyiv-clock').textContent=fmtTime(Date.now());
    if(state.rows.length){const fresh=isRecent(state.rows[0].timestamp);if(!fresh&&state.phase==='connected')renderStatus();}
    if(state.signals.some(s=>s.status==='pending'))verifySignals();
  },1000);
  state.refreshTimer=setInterval(syncHead,CONFIG.refreshMs);
  // Occasionally repaginate history to correct gaps after browser suspension.
  setInterval(fullRefresh,10*60*1000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
