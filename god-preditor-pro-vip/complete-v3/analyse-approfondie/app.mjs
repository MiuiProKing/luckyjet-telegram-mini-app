import {CONFIG} from '../config.mjs';
import {SnapshotClient,normalizeSignal,channelLabel,probabilityText,stamp} from '../canonical.mjs';

const $=id=>document.getElementById(id),client=new SnapshotClient();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const durations=[3,6,7,10,30,61],targets=[5,10,100],signals=new Map();
let snapshot=null,offset=0,busy=false,request=0,ledgerBusy=false,ledgerComplete=false,lastError='',renderedZone='UTC';
const now=()=>Date.now()+offset,zone=()=>$('zone').value;
const number=(x,d=0)=>Number.isFinite(Number(x))?Number(x).toLocaleString('ru-RU',{maximumFractionDigits:d}):'—';
const at=(t,seconds=false)=>t==null?'—':new Intl.DateTimeFormat('ru-RU',{timeZone:zone(),hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{}),hourCycle:'h23'}).format(t);
const date=t=>new Intl.DateTimeFormat('ru-RU',{timeZone:zone(),day:'2-digit',month:'2-digit',year:'numeric'}).format(t);
const statusName={pending:'Ожидание',hit:'Зашло',miss:'Не зашло',unknown:'Нет полных данных'};
const allSignals=()=>[...signals.values()].sort((a,b)=>b.issuedAt-a.issuedAt||b.id.localeCompare(a.id));
const current=channel=>allSignals().find(s=>s.channel===channel&&s.status==='pending');
function diagnostics(){return snapshot?.diagnostics??{}}
function merge(items){for(const item of items)signals.set(item.id,item)}
function channelStats(channel){
 const d=diagnostics(),value=snapshot?.statistics?.byChannel??snapshot?.statistics?.channels??d.channelStatistics;
 let row=Array.isArray(value)?value.find(x=>x.channel===channel):value?.[channel];
 if(row){const hit=Number(row.hit??row.hits??0),miss=Number(row.miss??row.misses??0),unknown=Number(row.unknown??0),pending=Number(row.pending??0);return{hit,miss,unknown,pending,complete:true}}
 const rows=allSignals().filter(s=>s.channel===channel),count=k=>rows.filter(s=>s.status===k).length;
 return{hit:count('hit'),miss:count('miss'),unknown:count('unknown'),pending:count('pending'),complete:ledgerComplete};
}
function rateLine(channel){const s=channelStats(channel),n=s.hit+s.miss;return n?`${s.hit}/${n} · ${number(100*s.hit/n,1)}%${s.unknown?` · ${s.unknown} без полного результата`:''}${s.complete?'':' · по полученным записям'}`:'Проверенных окон пока нет';}
function timer(s){if(s.end==null)return'';const t=now();if(t<s.start)return'Начало через '+number(Math.ceil((s.start-t)/1000))+' сек';if(t>=s.end)return'Окно завершено · проверка';return'До закрытия '+number(Math.ceil((s.end-t)/1000))+' сек';}
function liveCard(channel,title,isRounds=false){
 const s=current(channel),last=allSignals().find(x=>x.channel===channel&&x.status!=='pending');
 if(!s)return `<article class="live-card" data-channel="${channel}"><h3>${esc(title)}</h3><strong class="target">${last?number(last.target,2)+'×+':'—'}</strong><p class="timing">${snapshot?.sourceFresh?'Подготовка следующего окна':'Ожидание свежих завершённых раундов'}</p>${last?`<p class="status-${last.status}">${statusName[last.status]}</p>`:''}<p class="outcome">Результаты: ${rateLine(channel)}</p></article>`;
 const required=s.roundsRequired??s.rounds,remaining=s.roundsRemaining;
 const timing=isRounds?`В следующих <b>${number(required)}</b> раундах${s.estimatedEnd?`<br>Примерно до ${at(s.estimatedEnd)}`:''}`:`${at(s.start)} → ${at(s.end)}`;
 return `<article class="live-card pending" data-channel="${channel}" data-signal-id="${esc(s.id)}"><h3>${esc(title)}</h3><strong class="target">${number(s.target,2)}×+</strong><p class="timing">${timing}</p><p class="chance">Модельная оценка ${probabilityText(s.confidence,1)}</p><p class="remaining">${isRounds?(remaining==null?'Число оставшихся раундов уточняется':'Осталось '+number(remaining)+' раундов'):timer(s)}</p><p class="outcome">Результаты: ${rateLine(channel)}</p></article>`;
}
function renderResults(id,prefix){
 const rows=allSignals().filter(s=>s.channel.startsWith(prefix)&&s.status!=='pending').slice(0,8);
 $(id).innerHTML=rows.length?'<b>Последние результаты</b>'+rows.map(s=>`<p class="status-${s.status}">${s.status==='hit'?'✓':s.status==='miss'?'×':'?'} ${statusName[s.status]} · ${number(s.target,2)}× · ${at(s.start)} → ${at(s.resultAt??s.end)}${s.actual!=null?' · выпало '+number(s.actual,2)+'×':''}</p>`).join(''):'';
}
function renderLive(){
 $('durationCards').innerHTML=durations.map(m=>liveCard('duration_'+m,'В течение '+m+' мин')).join('');
 $('roundCards').innerHTML=targets.map(t=>liveCard('rounds_'+t,'Цель '+t+'×+',true)).join('');
 renderResults('durationResults','duration_');renderResults('roundResults','rounds_');
}
function perHour(a){const first=stamp(a?.first),last=stamp(a?.last);return first!=null&&last>first?Number(a.total)/((last-first)/3600000):0;}
function chance(p,minutes,tempo){const n=Math.max(0,Math.round(minutes*tempo/60));return 100*(-Math.expm1(n*Math.log1p(-Math.min(100,Math.max(0,p))/100)));}
function renderWaiting(a){
 const tempo=perHour(a),g=a.global??{},minutes=[5,10,30,60,180,1440];
 const rows=[['2×+',g.p2],['5×+',g.p5],['10×+',g.p10],['100×+',g.p100],['1 000×+ · теор.',.095],['10 000×+',a.total?100*Number(g.n10000??0)/a.total:0]];
 $('tempo').textContent=`Хотя бы одно событие внутри интервала при постоянной исторической частоте · около ${number(tempo)} раундов/час по всему периоду наблюдения.`;
 $('waitingTable').innerHTML='<thead><tr><th>Цель</th>'+minutes.map(m=>`<th>${m<60?m+' мин':m/60+' ч'}</th>`).join('')+'</tr></thead><tbody>'+rows.map(([label,p])=>'<tr><td>'+label+'</td>'+minutes.map(m=>`<td>${tempo&&p!=null?probabilityText(chance(p,m,tempo),1):'—'}</td>`).join('')+'</tr>').join('')+'</tbody>';
}
function renderGroup(id,rows,label,g){
 const value=(p,base)=>{const diff=p-base,cls=base>0&&Math.abs(diff)/base<.04?'normal':diff>0?'higher':'lower';return`<td class="${cls}">${probabilityText(p,2)}</td>`};
 $(id).innerHTML='<thead><tr><th>Период</th><th>Раундов</th><th>2×+</th><th>5×+</th><th>10×+</th><th>100×+</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${esc(label(r.v))}</td><td>${number(r.n)}</td>${['p2','p5','p10','p100'].map(k=>value(Number(r[k]??0),Number(g[k]??0))).join('')}</tr>`).join('')+'</tbody>';
}
function renderAnalytics(){
 const a=snapshot?.analytics;if(!a)return;
 const g=a.global??{},metrics=[['Раундов в истории',number(a.total)],['2×+',probabilityText(g.p2,2)],['5×+',probabilityText(g.p5,2)],['10×+',probabilityText(g.p10,2)],['100×+',probabilityText(g.p100,3)],['10 000×+ / 50 000×',number(g.n10000??0)+' / '+number(g.n50000??0)]];
 $('totals').innerHTML=metrics.map(([label,value])=>`<div class="glass metric"><p>${label}</p><strong>${value}</strong></div>`).join('');
 const groups=Array.isArray(a.groups)?a.groups:[],by=kind=>groups.filter(x=>x.k===kind).sort((x,y)=>Number(x.v)-Number(y.v));
 const days=['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
 renderGroup('weekdayTable',by('weekday'),v=>days[Number(v)]??v,g);
 renderGroup('hourTable',by('hour'),v=>String(v).padStart(2,'0')+':00 – '+String(v).padStart(2,'0')+':59',g);
 renderGroup('monthTable',by('month'),v=>{const n=Number(v);return new Intl.DateTimeFormat('ru-RU',{month:'short',year:'numeric',timeZone:'UTC'}).format(Date.UTC(Math.floor(n/100),n%100-1,1))},g);
 const minute=by('minute').filter(x=>Number(x.n)>0).sort((x,y)=>x.p10-y.p10),text=rows=>rows.map(x=>':'+String(x.v).padStart(2,'0')+' ('+probabilityText(x.p10,2)+'; '+number(x.n)+' раундов)').join(', ');
 $('weakMinutes').textContent='Ниже общей частоты: '+(text(minute.slice(0,3))||'недостаточно данных');
 $('strongMinutes').textContent='Выше общей частоты: '+(text(minute.slice(-3).reverse())||'недостаточно данных');
 const huge=Array.isArray(a.huge)?a.huge:[];$('hugeTitle').textContent='Коэффициенты 10 000×+ ('+number(g.n10000??huge.length)+')';
 $('hugeEvents').innerHTML=huge.length?huge.map(r=>{const t=stamp(r.t??r.timestamp??r.round_timestamp);return`<div class="huge-event"><span>${t==null?'—':date(t)+' '+at(t)}</span><b>${number(r.c??r.coefficient,2)}×</b></div>`}).join(''):'<p class="empty-message">Такие события в доступной истории не найдены.</p>';
 renderWaiting(a);
 const first=stamp(a.first),last=stamp(a.last);$('coverage').textContent=`${first!=null?date(first):'—'} → ${last!=null?date(last)+' '+at(last,true):'—'} · ${zone()==='UTC'?'GMT · UTC':'Europe/Kyiv'} · ${number(a.total)} точных завершённых раундов · снимок ${at(snapshot.serverNow,true)}`;
}
function renderLedger(){
 const rows=allSignals(),all=snapshot?.statistics,complete=all?.scope==='all_server_created_signals',counts={hit:0,miss:0,unknown:0,pending:0};if(complete){for(const k of Object.keys(counts))counts[k]=Number(all[k]??0)}else for(const s of rows)counts[s.status]++;
 $('ledgerScope').textContent=ledgerComplete?'Общий серверный журнал загружен полностью. Неизвестные исходы не включены в проигрыши.':complete?`Счётчики по всем ${number(all.total)} созданным серверным сигналам. Ниже последние ${Math.min(200,rows.length)} записей; полный журнал загружается отдельно.`:`Показаны ${number(rows.length)} записей из серверного снимка. Полный журнал можно загрузить отдельно.`;
 $('ledgerSummary').innerHTML=Object.entries(counts).map(([k,n])=>`<span>${statusName[k]}: <b>${number(n)}</b></span>`).join('');
 $('ledgerTable').innerHTML='<thead><tr><th>Модель</th><th>Цель</th><th>Начало</th><th>Конец / раунды</th><th>Результат</th></tr></thead><tbody>'+rows.slice(0,200).map(s=>`<tr data-signal-id="${esc(s.id)}"><td>${esc(channelLabel(s.channel))}</td><td>${number(s.target,2)}×</td><td>${date(s.start)} ${at(s.start)}</td><td>${s.windowKind==='rounds'?number(s.roundsRequired)+' раундов':at(s.end)}</td><td class="status-${s.status}">${statusName[s.status]}${s.actual!=null?' · '+number(s.actual,2)+'×':''}</td></tr>`).join('')+'</tbody>';
}
function renderConnection(){const fresh=snapshot?.sourceFresh,connected=snapshot&&!lastError;$('connection').className='live '+(!connected?'error':fresh?'':'loading');$('connection').innerHTML='<i></i>'+(connected?(fresh?'Supabase LIVE':'Ожидание раундов'):'Подключение…');$('error').hidden=true;if(lastError){$('error').hidden=false;$('error').textContent=lastError+'. Показан последний полученный серверный снимок.'}else if(snapshot&&!fresh){$('error').hidden=false;$('error').textContent='Источник завершённых раундов устарел. Создание новых прогнозов приостановлено.'}else $('error').hidden=true;}
async function poll(force=false){
 if(busy&&!force)return;const seq=++request,requestedZone=zone();busy=true;$('refresh').disabled=true;if(requestedZone!==renderedZone)$('coverage').textContent='Загрузка групп для '+(requestedZone==='UTC'?'GMT':'Киева')+'…';
 try{const s=await client.get(requestedZone);if(seq!==request)return;renderedZone=requestedZone;snapshot=s;offset=s.serverNow-Date.now();merge(s.signals);lastError='';renderAnalytics();renderLive();renderLedger();renderConnection();}
 catch(error){if(seq!==request)return;$('zone').value=renderedZone;lastError=error.name==='AbortError'?'Расчётный сервер не ответил вовремя':error.message;renderConnection();}
 finally{if(seq===request){busy=false;$('refresh').disabled=false}}
}
async function loadLedger(){
 if(ledgerBusy)return;ledgerBusy=true;$('loadLedger').disabled=true;let cursor=null;const loaded=[];
 try {for(;;){const q=new URLSearchParams({select:'*',order:'issued_at.desc,id.desc',limit:'1000'});if(cursor)q.set('or',`(issued_at.lt.${cursor.issued_at},and(issued_at.eq.${cursor.issued_at},id.lt.${cursor.id}))`);const response=await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.SIGNAL_TABLE??'god_complete_v3_signals'}?${q}`,{headers:{apikey:CONFIG.SUPABASE_KEY},signal:AbortSignal.timeout(25000),cache:'no-store'});if(!response.ok)throw Error('Журнал: HTTP '+response.status);const rows=await response.json();if(!Array.isArray(rows))throw Error('Неверный формат журнала');for(const raw of rows){const s=normalizeSignal(raw);if(s)loaded.push(s)}if(rows.length<1000)break;const last=rows.at(-1);if(!last?.issued_at||!last?.id||cursor&&cursor.id===last.id&&cursor.issued_at===last.issued_at)throw Error('Курсор журнала не продвигается');cursor=last;}merge(loaded);ledgerComplete=true;renderLedger();renderLive();}
 catch(error){$('ledgerScope').textContent=error.message+'. Журнал на сервере сохранён.'}
 finally{ledgerBusy=false;$('loadLedger').disabled=false}
}
$('zone').addEventListener('change',()=>poll(true));$('refresh').addEventListener('click',()=>poll());$('loadLedger').addEventListener('click',loadLedger);
$('exportLedger').addEventListener('click',async()=>{await loadLedger();const blob=new Blob([JSON.stringify({version:CONFIG.VERSION,scope:'shared_server',complete:ledgerComplete,serverNow:snapshot?.serverNow,signals:allSignals()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='GOD-PREDITOR-server-signals.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
for(const id of ['openMenu','bottomMenu'])$(id)?.addEventListener('click',()=>$('menuDialog').showModal());$('closeMenu').addEventListener('click',()=>$('menuDialog').close());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});window.addEventListener('online',()=>poll());
setInterval(()=>{if(!document.hidden)poll()},5000);setInterval(()=>{if(snapshot&&!document.hidden)renderLive()},1000);
renderLive();await poll();
