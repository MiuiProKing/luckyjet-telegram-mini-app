import {SUPABASE_CONFIG} from './supabase-config.mjs';
import {mapSupabaseRound,createSupabaseFeed} from './supabase-feed.mjs';
import {mergeRounds,parsePayload,parseCSV} from './data.mjs';
import {MODEL,analyze,advanceJournal,summary} from './window-model.mjs';
import {mountScene} from './scene.mjs';
import {createHistory} from './history.mjs';
const $=s=>document.querySelector(s),KEY='neurojet-small-v1';
let rows=[],journal=[],legacyJournal=[],selected=1.5,monitor=true,auto=true,mode='live',feed=null,status='connecting',lastSuccessAt=null,stats=analyze([]),paused=matchMedia('(prefers-reduced-motion:reduce)').matches;
try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s){rows=mergeRounds([],s.rows??[],'saved').rounds;journal=Array.isArray(s.journal)?s.journal.slice(-500):[];selected=s.selected===2?2:1.5;monitor=s.monitor!==false;auto=s.auto!==false;mode=s.mode==='demo'?'demo':'live'}}catch{}
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');legacyJournal=[...(saved?.legacyJournal??[]),...journal.filter(x=>x.model!==MODEL)].slice(-500);journal=journal.filter(x=>x.model===MODEL)}catch{journal=[]}
const archive=createHistory();let historyLimit=200,archiveAbort=null;archive.append(rows);
const num=x=>Number(x).toLocaleString('ru-RU',{maximumFractionDigits:2});
const clock=t=>new Date(t).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv'});
const remaining=ms=>{const sec=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(sec/60).toString().padStart(2,'0')}:${(sec%60).toString().padStart(2,'0')}`};
const activeFor=target=>[...journal].reverse().find(x=>x.model===MODEL&&x.target===target);
const windowLabel=x=>`${clock(x.start)} — ${clock(x.end)}`;
const announcedResults=new Set(journal.filter(x=>x.status!=='pending').map(x=>x.key+':'+x.status));let resultTimer=null,checkMarkup='';
const resultPicture=status=>`<picture><source media="(prefers-reduced-motion: reduce)" srcset="assets/result-${status}-still.png"><img src="assets/result-${status}.webp" width="240" height="240" alt=""></picture>`;
function renderVerification(){
 const enabled=$('#check-view').checked,completed=journal.filter(x=>x.target===selected&&['hit','miss','unknown'].includes(x.status)),latest=completed.at(-1),pending=journal.find(x=>x.target===selected&&x.status==='pending');
 $('#visible-check').hidden=!enabled;
 const text=latest?`${num(latest.target)}× · ${latest.status==='hit'?'ЗАШЛО':latest.status==='miss'?'НЕ ЗАШЛО':'НЕТ ДАННЫХ'}${latest.actual!=null?' · макс. окна '+num(latest.actual)+'×':''}`:'Проверка ожидает начало окна';
 const markup=`<div class="check-result ${latest?.status??''}">${latest&&latest.status!=='unknown'?resultPicture(latest.status):''}<span>${text}</span></div>${pending?'<small class="next-check">Проверка окна '+windowLabel(pending)+' · Киев</small>':''}`;
 if(markup!==checkMarkup){$('#visible-check').innerHTML=markup;checkMarkup=markup}
 const fresh=completed.filter(x=>!announcedResults.has(x.key+':'+x.status));
 for(const x of journal)if(x.status!=='pending')announcedResults.add(x.key+':'+x.status);
 if(!enabled){clearTimeout(resultTimer);$('#result-flash').hidden=true;return}
 const result=fresh.at(-1);if(!result||result.status==='unknown')return;
 const flash=$('#result-flash');flash.className=result.status;flash.innerHTML=resultPicture(result.status)+`<strong>${result.status==='hit'?'ЗАШЛО':'НЕ ЗАШЛО'}</strong><small>Цель ${num(result.target)}× · макс. окна ${num(result.actual)}×</small><small class="result-next">${windowLabel(result)} · Киев</small>`;flash.hidden=false;
 clearTimeout(resultTimer);resultTimer=setTimeout(()=>flash.hidden=true,4500);
}
function save(){try{localStorage.setItem(KEY,JSON.stringify({rows,journal,legacyJournal,selected,monitor,auto,mode}))}catch{toast('Не удалось сохранить данные браузера')}}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4500)}
const scene=mountScene($('#scene'),{onDelivery(n){$('#deliveries').textContent='Доставлено в этом сеансе: '+n}});scene.setPaused(paused);
function receive(batch,{initial=false}={}){
 if(initial&&rows.some(r=>!r.id.startsWith('supabase:luckyjet:'))){rows=[];journal=[];mode='live'}
 archive.append(batch).then(()=>{if($('#statistics').open)renderHistory()}).catch(()=>toast('История не сохранена: проверь место браузера'));
 const before=new Set(rows.map(r=>r.id)),merged=mergeRounds(rows,batch,'Supabase · LuckyJet');rows=merged.rounds;
 const added=batch.filter(r=>!before.has(r.id)).sort((a,b)=>a.timestamp-b.timestamp);if(added.length)scene.push(added,{initial});save();render();return merged;
}
function render(){const now=Date.now();stats=analyze(rows,now);const a=advanceJournal(journal,rows,stats,now,monitor,{online:status==='connected'||mode==='demo',lastSuccessAt:mode==='demo'?now:lastSuccessAt});journal=a.journal;if(a.changed)save();
 $('#status').textContent=mode==='demo'?'◌ Синтетическое демо':status==='connected'?'● Supabase live':status==='error'?'⚠ Ошибка источника':status==='stopped'?'◌ Поток остановлен':'◌ Подключение';$('#status').classList.toggle('error',status==='error');
 $('#brain-label').textContent=stats.ready?'NEURAL CORE / '+num(stats.n)+' РАУНДОВ':stats.n?'NEURAL CORE / ИСТОРИЯ '+num(stats.n):'NEURAL CORE / ОЖИДАНИЕ ПОТОКА';$('#last-arrival').textContent=stats.lastAt?'Последний раунд '+clock(stats.lastAt):'Ожидаем коэффициенты';
 $('#targets').innerHTML=stats.targets.map(t=>{const f=activeFor(t.target);return `<article class="target ${t.target===2?'pink':''} ${selected===t.target?'selected':''}"><header><h3>${num(t.target)}×</h3><span class="tag">${t.target===1.5?'МАЛАЯ ЦЕЛЬ':'ДВОЙНАЯ ЦЕЛЬ'}</span></header><strong class="prob">${f?.score??'—'}<small>/100</small></strong><p>${f?.pattern??'Ожидание истории'} · эвристический балл</p><p>Частота в истории: ${num(t.probability*100)}% · Wilson ${t.range.map(x=>num(x*100)).join('–')}%</p><div class="target-foot"><span>${t.count} / ${stats.n} достижений</span><span>Цикл ${num(t.medianGapMs/1000)} сек</span></div></article>`}).join('');
 const chosen=activeFor(selected),current=chosen&&now<=chosen.end;
 $('#signal').textContent=stats.ready&&current?`${selected===1.5?'1,50':'2,00'}×`:!stats.fresh&&stats.n?'История устарела':monitor?'Собираем историю':'Наблюдение на паузе';
 $('#minimal-live').textContent=mode==='demo'?'◌ Синтетическое демо · время по Киеву':status==='connected'?'● Supabase LIVE · время по Киеву':status==='error'?'⚠ Ошибка источника':status==='stopped'?'◌ Поток остановлен':'◌ Подключение Supabase';
 $('#window').textContent=chosen&&current?windowLabel(chosen)+' · Киев':chosen?.status==='pending'?'Проверяем полноту истории окна':'Нужно 20 раундов и свежий поток';
 $('#signal-note').textContent=chosen&&current?(now<chosen.start?'До окна '+remaining(chosen.start-now):'До конца окна '+remaining(chosen.end-now))+' · '+chosen.pattern+' · '+chosen.score+'/100':'';
 $('#signal-note').title=chosen?chosen.basis+' · балл не является вероятностью выигрыша':'';
 $('#latest-five').innerHTML=rows.slice(0,5).map(r=>`<span class="${r.coefficient<2?'below':''}" title="${clock(r.timestamp)}"><strong>${num(r.coefficient)}×</strong><small>${clock(r.timestamp)}</small></span>`).join('')||'Ожидаем данные';
 renderVerification();
 for(const b of document.querySelectorAll('[data-target]'))b.classList.toggle('active',Number(b.dataset.target)===selected);
 $('#count').textContent=num(stats.n);$('#ema').textContent=stats.n?num(stats.ema20)+'×':'—';$('#median').textContent=stats.n?num(stats.median50)+'×':'—';$('#mad').textContent=stats.n?num(stats.mad50):'—';
 $('#recent').innerHTML=rows.slice(0,18).map(r=>`<span class="chip ${r.coefficient<selected?'low':''}">${num(r.coefficient)}×<small>${clock(r.timestamp)}</small></span>`).join('')||'<p class="muted">Ждём первый пакет данных…</p>';
 const s=summary(journal);$('#summary').textContent=`${s.known} проверок окон · ${s.hits} с достижением цели · ${s.unknown} без полных данных. Попадание — любой раунд в окне.${legacyJournal.length?' Старых проверок следующего раунда: '+legacyJournal.length+' (отдельно в экспорте).':''}`;
 const labels={pending:'ОЖИДАНИЕ ОКНА',hit:'ДОСТИГНУТО В ОКНЕ',miss:'НИЖЕ ЦЕЛИ ВО ВСЁМ ОКНЕ',unknown:'НЕТ ПОЛНЫХ ДАННЫХ'};$('#journal').innerHTML=[...journal].reverse().slice(0,20).map(x=>`<div class="journal-row"><span>${num(x.target)}× <small>· ${windowLabel(x)}<br>${x.pattern} · балл ${x.score}/100</small></span><span class="${x.status}">${labels[x.status]??'—'}${x.actual!=null?'<br>Макс. '+num(x.actual)+'×':''}</span></div>`).join('');
 $('#auto-connect').checked=auto;$('#monitor').checked=monitor;$('#motion').textContent=paused?'▷':'Ⅱ';
}
function disconnect(){feed?.stop();feed=null;status='stopped';auto=false;$('#connection-info').textContent='Поток остановлен. История сохранена.';save();render()}
function connect(){feed?.stop();auto=true;status='connecting';mode='live';feed=createSupabaseFeed(SUPABASE_CONFIG,{onRounds:receive,onStatus(s){status=s.state;if(s.lastSuccess)lastSuccessAt=s.lastSuccess;$('#connection-info').textContent=s.state==='error'?s.message+' · повтор через 5 секунд':s.state==='connected'?'Последняя проверка '+clock(s.lastSuccess)+' · курсор '+s.cursor:'Загрузка подтверждённых раундов…';render()}});save();render()}
$('#settings').onclick=()=>$('#preferences').showModal();$('#close-settings').onclick=()=>$('#preferences').close();$('#connect').onclick=connect;$('#disconnect').onclick=disconnect;$('#auto-connect').onchange=e=>{auto=e.target.checked;save()};$('#monitor').onchange=e=>{monitor=e.target.checked;save();render()};$('#motion').onclick=()=>{paused=!paused;scene.setPaused(paused);render()};
for(const b of document.querySelectorAll('[data-target]'))b.onclick=()=>{selected=Number(b.dataset.target);save();render()};
function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#export-rounds').onclick=()=>download('neurojet-rounds.json',rows);$('#export-journal').onclick=()=>download('neurojet-journal-v2.json',{model:MODEL,semantics:'any-hit-in-frozen-window',windows:journal,legacyNextRoundChecks:legacyJournal});
$('#demo').onclick=()=>{if(rows.length&&!confirm('Заменить локальную историю синтетическими данными?'))return;disconnect();rows=[];journal=[];mode='demo';const now=Date.now(),data=Array.from({length:400},(_,i)=>({id:'demo-'+i,coefficient:Math.max(1,Math.round(.97/Math.max(.015,Math.random())*100)/100),timestamp:now-(399-i)*20000,source:'Синтетическое демо'}));receive(data);$('#preferences').close();toast('Демо: синтетика. Коэффициенты не являются результатами игры.')};
$('#clear').onclick=()=>{if(!confirm('Очистить историю и журнал этого браузера?'))return;disconnect();rows=[];journal=[];save();render()};
$('#file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>10*1024*1024)throw Error('Файл больше 10 МБ');const text=await f.text(),raw=/^\s*[\[{]/.test(text)?parsePayload(JSON.parse(text)).rounds:parseCSV(text);disconnect();rows=[];journal=[];mode='live';const normalized=mergeRounds([],raw,'Импорт');rows=normalized.rounds;scene.push(rows.slice(0,4).reverse(),{initial:true});save();render();toast(`Загружено ${rows.length}, отклонено ${normalized.rejected}`)}catch(e){toast(e.message)}};
async function renderHistory(){const total=await archive.count();$('#history-total').textContent='Все полученные / загруженные: '+total;const items=await archive.page(historyLimit);$('#full-history').innerHTML=items.map(r=>`<div class="history-row"><strong>${num(r.coefficient)}×</strong><time>${new Date(r.timestamp).toLocaleString('ru-RU',{timeZone:'Europe/Kyiv'})}</time></div>`).join('');$('#history-more').hidden=items.length>=total}
$('#history-open').onclick=()=>{$('#statistics').showModal();renderHistory()};$('#history-more').onclick=()=>{historyLimit+=200;renderHistory()};$('#check-view').onchange=()=>render();$('#history-source').onclick=()=>$('#preferences').showModal();
$('#archive-export').onclick=async()=>download('all-neurojet-rounds.json',await archive.all());
$('#cancel-archive').onclick=()=>archiveAbort?.abort();
$('#load-archive').onclick=async()=>{if(archiveAbort)return;archiveAbort=new AbortController();$('#cancel-archive').hidden=false;$('#load-archive').disabled=true;let cursor=null,total=0;try{while(!archiveAbort.signal.aborted){const url=new URL('/rest/v1/'+SUPABASE_CONFIG.table,SUPABASE_CONFIG.url);url.search=new URLSearchParams({select:'id,source_seq,coefficient,round_timestamp,estimated',order:'source_seq.desc',limit:'1000',estimated:'eq.false',completed:'eq.true',round_timestamp:'not.is.null',...(cursor?{source_seq:'lt.'+cursor}:{})});const response=await fetch(url,{headers:{apikey:SUPABASE_CONFIG.publishableKey},signal:archiveAbort.signal,credentials:'omit',cache:'no-store'});if(!response.ok)throw Error('Supabase HTTP '+response.status);const page=await response.json();if(!page.length)break;cursor=String(page.at(-1).source_seq);await archive.append(page.map(r=>mapSupabaseRound(r)).filter(Boolean));total+=page.length;$('#archive-progress').textContent='Обработано '+total+' записей…';await renderHistory()}$('#archive-progress').textContent='Полная доступная история загружена.'}catch(e){$('#archive-progress').textContent=e.name==='AbortError'?'Загрузка остановлена; полученное сохранено.':e.message}finally{archiveAbort=null;$('#cancel-archive').hidden=true;$('#load-archive').disabled=false}};
window.NeuroJet=Object.freeze({getRounds:()=>structuredClone(rows),getJournal:()=>structuredClone(journal),getStats:()=>structuredClone(stats),getForecasts:()=>structuredClone(stats.targets.map(t=>activeFor(t.target)).filter(Boolean)),pushRounds:data=>{const m=mergeRounds(rows,data,'API');return receive(m.rounds.filter(r=>!rows.some(x=>x.id===r.id)))},version:'2.0.0',model:MODEL});
render();setInterval(()=>{if(!document.hidden)render()},1000);if(auto)connect();else {status='stopped';render();}
