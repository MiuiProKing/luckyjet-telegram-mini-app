import {HistorySource,today,dayBounds,summarize,formatTime,color,ZONE} from './data.mjs';

const $=id=>document.getElementById(id),source=new HistorySource();
const filters=[['all','Все коэффициенты',0],['2','2x+',2],['5','5x+',5],['10','10x+',10],['100','100x+',100]];
const games=[['Lucky Jet','1Win'],['Astronaut','1Win'],['Crash','1Win'],['Rocket Queen','1Win'],['JetX','Betclic'],['Aviator','Betclic'],['JetX','1Win'],['High Flyer','Betclic'],["Dragon’s Crash",'Betclic']];
let rows=[],minimum=0,loading=false,generation=0,checkedAt=0,pages=0,currentDay='';
try {minimum=filters.find(x=>x[0]===localStorage.getItem('god_complete_history_min'))?.[2]||0;}catch{}
const query=new URLSearchParams(location.search);let day=query.get('date')||today();
try {dayBounds(day);if(day>today())day=today();}catch{day=today();}
$('day').value=day;$('day').max=today();
const node=(name,cls,text)=>{const n=document.createElement(name);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
for(const [i,[name,platform]] of games.entries()) {
 const button=node('button',i===0?'selected':'');button.type='button';button.disabled=i!==0;button.setAttribute('aria-pressed',String(i===0));button.title=i===0?'Lucky Jet · наш Supabase':'Источник этой игры пока не подключён';
 button.append(node('span','',name+' —'),document.createElement('br'),node('span','',platform));$('gameTabs').append(button);
}
for(const [key,label,value] of filters) {
 const button=node('button',value===minimum?'selected':'',label);button.type='button';button.dataset.minimum=String(value);button.setAttribute('aria-pressed',String(value===minimum));
 button.addEventListener('click',()=>{minimum=value;try{localStorage.setItem('god_complete_history_min',key);}catch{};render();});$('filters').append(button);
}
function connection(state,text) {$('connection').className='live '+state;$('connection').replaceChildren(node('i'),document.createTextNode(text));}
function setStatus(text,error=false) {$('status').textContent=text;$('status').className='status'+(error?' error':'');}
function render(newIds=new Set()) {
 const report=summarize(rows,minimum);
 $('totalRounds').textContent=report.count.toLocaleString('ru-RU');$('average').textContent=report.count?report.mean.toFixed(2)+'x':'—';$('maximum').textContent=report.count?report.max.toFixed(2)+'x':'—';
 $('filteredCount').textContent=minimum?`${report.count.toLocaleString('ru-RU')} из ${rows.length.toLocaleString('ru-RU')} раундов`:'';
 for(const b of $('filters').querySelectorAll('button')) {const active=+b.dataset.minimum===minimum;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));}
 const fragment=document.createDocumentFragment();
 for(const [hour,list] of report.groups) {
  const section=node('section','glass hour'),head=node('div','hour-head'),title=node('h2');
  title.append(node('span','',String(hour).padStart(2,'0')+':00'),document.createTextNode(' — '+String((hour+1)%24).padStart(2,'0')+':00'));
  const stats=node('div','hour-stat');let sum=0,max=0;for(const r of list){sum+=r.coefficient;max=Math.max(max,r.coefficient);}
  stats.append(node('span','',list.length.toLocaleString('ru-RU')+' раундов'));const avg=node('span','', 'сред. ');avg.append(node('b','',(sum/list.length).toFixed(2)+'x'));const top=node('span','', 'макс. ');top.append(node('b','max',max.toFixed(2)+'x'));stats.append(avg,top);head.append(title,stats);
  const grid=node('div','round-grid');
  for(const r of list) {const card=node('div','round '+color(r.coefficient)+(newIds.has(r.id)?' new':''));card.dataset.roundId=r.id;card.dataset.coefficient=String(r.coefficient);card.title=`${r.coefficient.toFixed(2)}x · ${formatTime(r.timestamp)} · ${ZONE}`;const time=node('time','',formatTime(r.timestamp));time.dateTime=new Date(r.timestamp).toISOString();card.append(node('span','coef',r.coefficient.toFixed(2)+'x'),time);grid.append(card);}
  section.append(head,grid);fragment.append(section);
 }
 $('hours').replaceChildren(fragment);$('empty').hidden=!!report.count||loading||!checkedAt;
 $('empty').textContent=minimum&&rows.length?`За этот день нет коэффициентов ${minimum}x+.`:'За этот день пока нет архивных раундов.';
 $('exportCsv').disabled=!report.count;
 if(checkedAt)$('coverage').textContent=`${currentDay} · Киев · ${rows.length.toLocaleString('ru-RU')} раундов · день загружен полностью · обновлено ${formatTime(checkedAt)}`;
}
async function load(headOnly=false) {
 const ticket=++generation,selected=$('day').value;loading=true;
 if(!headOnly){rows=[];checkedAt=0;currentDay=selected;render();$('coverage').textContent='';setStatus('Загрузка истории…');connection('loading','Загрузка истории');}
 $('refresh').disabled=true;$('empty').hidden=true;
 try {
  const before=new Set(rows.map(r=>r.id));const result=await source.load(selected,{headOnly,existing:rows,onProgress:p=>{if(ticket!==generation)return;pages=p.pages;if(!headOnly)setStatus(`Загрузка истории… ${p.count.toLocaleString('ru-RU')} раундов`);}});
  if(ticket!==generation)return;
  const changed=rows.length!==result.rows.length||rows[0]?.id!==result.rows[0]?.id||!headOnly;
  rows=result.rows;checkedAt=result.checkedAt;currentDay=selected;loading=false;
  connection('','Supabase LIVE');setStatus('');
  if(changed)render(headOnly?new Set(rows.filter(r=>!before.has(r.id)).map(r=>r.id)):new Set());
  else $('coverage').textContent=`${currentDay} · Киев · ${rows.length.toLocaleString('ru-RU')} раундов · день загружен полностью · обновлено ${formatTime(checkedAt)}`;
 }catch(error) {
  if(ticket!==generation)return;loading=false;connection('error','Нет связи с Supabase');
  setStatus(error.name==='AbortError'?'Загрузка прервана. Нажми «Обновить», чтобы повторить.':error.message||'Не удалось загрузить историю.',true);render();
 }finally {if(ticket===generation){loading=false;$('refresh').disabled=false;}}
}
$('day').addEventListener('change',()=>{const value=$('day').value;try {dayBounds(value);if(value>today())throw Error();}catch{$('day').value=currentDay||today();return;}const url=new URL(location.href);url.searchParams.set('date',value);history.replaceState(null,'',url);load(false);});
$('refresh').addEventListener('click',()=>load(false));
$('exportCsv').addEventListener('click',()=>{
 const values=summarize(rows,minimum).rows;const csv=['id,coefficient,played_at,kyiv_time',...values.map(r=>[r.id,r.coefficient.toFixed(2),new Date(r.timestamp).toISOString(),formatTime(r.timestamp)].map(x=>'"'+String(x).replaceAll('"','""')+'"').join(','))].join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})),a=node('a');a.href=url;a.download=`luckyjet-${currentDay}-${minimum||'all'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
for(const id of ['openMenu','bottomMenu'])$(id).addEventListener('click',()=>$('menuDialog').showModal());$('closeMenu').addEventListener('click',()=>$('menuDialog').close());
$('menuDialog').addEventListener('click',e=>{if(e.target===$('menuDialog')){const r=e.target.getBoundingClientRect();if(e.clientY<r.top||e.clientX<r.left||e.clientX>r.right||e.clientY>r.bottom)e.target.close();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!loading&&$('day').value===today())load(true);});
setInterval(()=>{const nowDay=today();$('day').max=nowDay;if(!document.hidden&&!loading&&$('day').value===nowDay)load(true);},5000);
load(false);
