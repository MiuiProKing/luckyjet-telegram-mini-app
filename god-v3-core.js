const SUPA="https://stzrirukuxcyalrsstxx.supabase.co",KEY="sb_publishable_ZhoUzbPBM33K3qoL-HY20Q_oVU4ebc7",TABLE="luckyjet_rounds";let data=[];let loading=false;const $=s=>document.getElementById(s),fmt=(v,n=2)=>Number.isFinite(v)?v.toFixed(n):"—",median=a=>{if(!a.length)return NaN;let b=[...a].sort((x,y)=>x-y),i=b.length>>1;return b.length%2?b[i]:(b[i-1]+b[i])/2},quant=(a,p)=>{if(!a.length)return NaN;let b=[...a].sort((x,y)=>x-y),v=(b.length-1)*p,i=Math.floor(v);return b[i]+(b[Math.min(i+1,b.length-1)]-b[i])*(v-i)},mad=a=>median(a.map(x=>Math.abs(x-median(a)))),sum=a=>a.reduce((x,y)=>x+y,0),avg=a=>sum(a)/Math.max(1,a.length);function qn(a){let b=a.slice(-120),d=[];for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++)d.push(Math.abs(b[i]-b[j]));let h=Math.floor(b.length/2)+1;return 2.2219*quant(d,Math.max(0,(h*(h-1)/2-1)/(d.length-1)))}function sn(a){let b=a.slice(-80);return 1.1926*median(b.map(x=>median(b.map(y=>Math.abs(x-y)))))}function bootstrap(a){if(a.length<3)return [NaN,NaN];let b=[];for(let i=0;i<120;i++)b.push(median(Array.from({length:a.length},()=>a[Math.floor(Math.random()*a.length)])));return [quant(b,.025),quant(b,.975)]}function lg(z){let p=[.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-lg(1-z);z--;let x=p[0];for(let i=1;i<p.length;i++)x+=p[i]/(z+i);let t=z+7.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x)}function gp(a,x){if(x<=0)return 0;if(x<a+1){let s=1/a,d=s,ap=a;for(let n=1;n<120;n++){ap++;d*=x/ap;s+=d;if(Math.abs(d)<Math.abs(s)*1e-9)break}return Math.max(0,Math.min(1,s*Math.exp(-x+a*Math.log(x)-lg(a))))}let b=x+1-a,c=1e30,d=1/b,h=d;for(let i=1;i<120;i++){let an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<1e-30)d=1e-30;c=b+an/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;let dl=d*c;h*=dl;if(Math.abs(dl-1)<1e-9)break}return Math.max(0,Math.min(1,1-Math.exp(-x+a*Math.log(x)-lg(a))*h))}function survival(g,elapsed,dt){if(g.length<6)return null;let mean=avg(g),v=sum(g.map(x=>(x-mean)**2))/(g.length-1);if(v<=0)return null;let shape=Math.max(.3,Math.min(8,(mean*mean/v)**.65)),scale=mean/Math.exp(lg(1+1/shape)),ga=mean*mean/v,gb=v/mean;let w=t=>Math.exp(-Math.pow(Math.max(0,t)/scale,shape)),gm=t=>Math.max(1e-10,1-gp(ga,Math.max(0,t)/gb));return {w:Math.max(0,Math.min(1,1-w(elapsed+dt)/Math.max(1e-10,w(elapsed)))),g:Math.max(0,Math.min(1,1-gm(elapsed+dt)/gm(elapsed))),shape}}function change(f){if(f.length<120)return NaN;let b=f.slice(-1000),best=0;for(let i=50;i<b.length-50;i+=10){let a=avg(b.slice(0,i)),c=avg(b.slice(i)),p=avg(b),se=Math.sqrt(Math.max(.00001,p*(1-p))*(1/i+1/(b.length-i)));best=Math.max(best,Math.abs(a-c)/se)}return best}function cusum(f){let p=avg(f),u=0,d=0;for(let x of f){u=Math.max(0,u+x-p-.015);d=Math.max(0,d+p-x-.015)}return [u,d]}function clusters(f){let p=f.flatMap((x,i)=>x?[i]:[]),c=0;for(let i=0;i<p.length;){let j=i+1;while(j<p.length&&p[j]-p[j-1]<=6)j++;if(j-i>=3)c++;i=j}return c}function backtest(f,N){let start=Math.max(150,Math.floor(f.length*.35)),b=[],base=[],a=[];for(let i=start;i<f.length-N;i+=Math.max(1,Math.floor(N/2))){let tr=f.slice(Math.max(0,i-500),i),p=(sum(tr)+.5)/(tr.length+1),q=(sum(f.slice(0,i))+.5)/(i+1);b.push(1-(1-p)**N);base.push(1-(1-q)**N);a.push(f.slice(i,i+N).some(Boolean)?1:0)}let score=p=>avg(p.map((v,i)=>(v-a[i])**2));return {n:b.length,m:score(b),b:score(base),actual:avg(a)}}function box(t,v){return '<div class="box"><small>'+t+'</small><div class="value">'+v+'</div></div>'}async function load(){if(loading)return;loading=true;try{$("status").textContent="Загрузка из Supabase…";let lim=+$("limit").value,out=[];for(let off=0;off<lim;off+=1000){let url=SUPA+"/rest/v1/"+TABLE+"?select=id,coefficient,round_timestamp&order=round_timestamp.desc,id.desc&limit="+Math.min(1000,lim-off)+"&offset="+off,r=await fetch(url,{headers:{apikey:KEY,Accept:"application/json"}});if(!r.ok)throw Error("Supabase HTTP "+r.status+" "+(await r.text()).slice(0,140));let x=await r.json();out.push(...x);if(x.length===0)break}let ids=new Set();data=out.filter(r=>{let n=+r.coefficient,t=Date.parse(r.round_timestamp),id=String(r.id);if(n<1||!Number.isFinite(n)||!Number.isFinite(t)||ids.has(id))return false;ids.add(id);return true}).map(r=>({id:r.id,x:+r.coefficient,t:Date.parse(r.round_timestamp)})).sort((a,b)=>a.t-b.t);if(!data.length)throw Error("Нет данных. Проверь RLS таблицы luckyjet_rounds.");$("status").textContent="● LIVE · "+data.length+" раундов · "+new Date().toLocaleTimeString("ru-RU");render()}catch(e){$("status").textContent="Ошибка: "+e.message}finally{loading=false}}function render(){if(!data.length)return;let T=+$("target").value,N=+$("horizon").value,f=data.map(x=>x.x>=T?1:0),hits=sum(f),p=(hits+.5)/(f.length+1),sd=Math.sqrt(p*(1-p)/(f.length+2)),lo=Math.max(0,p-1.96*sd),hi=Math.min(1,p+1.96*sd),pn=1-(1-p)**N,events=data.filter(x=>x.x>=T),g=events.slice(1).map((e,i)=>(e.t-events[i].t)/1000),step=median(data.slice(1).map((r,i)=>(r.t-data[i].t)/1000).filter(x=>x>0&&x<300))||30,elapsed=events.length?(data.at(-1).t-events.at(-1).t)/1000:NaN,s=survival(g,elapsed,N*step),ci=bootstrap(g),bt=backtest(f,N),cs=cusum(f);$("metrics").innerHTML=box("Загружено",data.length)+box("Последний X",fmt(data.at(-1).x)+"×")+box("Событий ≥"+T+"×",hits)+box("Вероятность за "+N+" раундов",fmt(pn*100,1)+"%");$("analysis").innerHTML=box("95% приближённый интервал",fmt((1-(1-lo)**N)*100,1)+"–"+fmt((1-(1-hi)**N)*100,1)+"%")+box("Медиана интервала",fmt(median(g)/60)+" мин")+box("MAD / Qn / Sn",fmt(mad(g)/60)+" / "+fmt(qn(g)/60)+" / "+fmt(sn(g)/60)+" мин")+box("IQR",fmt(quant(g,.25)/60)+"–"+fmt(quant(g,.75)/60)+" мин")+box("Bootstrap 95% медианы",fmt(ci[0]/60)+"–"+fmt(ci[1]/60)+" мин")+box("Weibull / Gamma",s?fmt(s.w*100,1)+"% / "+fmt(s.g*100,1)+"%":"Недостаточно событий")+box("Change-point z / CUSUM",fmt(change(f))+" / "+fmt(cs[0])+" / "+fmt(cs[1]))+box("Walk-forward Brier (ниже лучше)",fmt(bt.m,4)+" против базы "+fmt(bt.b,4)+" · "+bt.n+" проверок");if(document.body.dataset.mode==="experimental"){$("analysis").innerHTML+=box("Кластеры / Hawkes-диагностика",clusters(f)+" групп; частота последних 80: "+fmt(avg(f.slice(-80))*100,1)+"%")+box("HMM / DeepHit","HMM: не обучена; DeepHit: нет весов модели. Не выдаём фиктивные прогнозы.")+box("Bayesian Hazard","Beta(½,½): "+fmt(p*100,2)+"% на раунд")}else{$("analysis").innerHTML+=box("Адаптивное окно",Math.min(data.length,Math.max(100,Math.round(10/Math.max(p,.005))))+" раундов")+box("Контроль качества",bt.m<bt.b?"Лучше базы на внутреннем тесте — нужна внешняя проверка":"Преимущества перед базой не обнаружено")} $("recent").innerHTML=data.slice(-80).reverse().map(r=>'<tr><td>'+new Date(r.t).toLocaleTimeString("ru-RU")+'</td><td>'+fmt(r.x)+'×</td><td>'+(r.x>=T?"✓":"—")+"</td></tr>").join("")}["target","horizon"].forEach(x=>$(x).onchange=render);$("limit").onchange=load;$("reload").onclick=load;
function setupLive(){
const tools=document.querySelector(".tools");
tools.insertAdjacentHTML("beforeend",'<button id="exportAll" type="button">⬇ Скачать ВСЮ историю CSV</button><button id="exportLoaded" type="button">⬇ Скачать загруженные CSV</button>');
const area=document.getElementById("metrics");
area.insertAdjacentHTML("beforebegin",'<section class="box" style="margin-top:14px"><strong>📡 ПОТОК КОЭФФИЦИЕНТОВ SUPABASE</strong><div id="liveStrip" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:12px"></div><div id="feedNote" style="color:#9eb2d3;font-size:12px;margin-top:9px">Последние 30 раундов · обновление каждые 15 секунд</div></section>');
const recent=document.getElementById("recent").closest(".box");
recent.insertAdjacentHTML("beforebegin",'<p style="color:#9eb2d3">Последние 80 раундов. Для всей истории используй кнопку CSV выше.</p>');
document.getElementById("exportLoaded").onclick=()=>saveCsv(data,"luckyjet_loaded_"+data.length+".csv");
document.getElementById("exportAll").onclick=exportAll;
}
function saveCsv(rows,name){
let chunks=["id,round_timestamp,coefficient\r\n"];
for(let r of rows)chunks.push((r.id??"")+","+new Date(r.t).toISOString()+","+r.x+"\r\n");
let blob=new Blob(chunks,{type:"text/csv;charset=utf-8"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)
}
async function exportAll(){
let btn=$("exportAll");btn.disabled=true;let rows=[],offset=0,seen=new Set(),max=200000;
try{
while(offset<max){
btn.textContent="Загрузка: "+rows.length+" раундов…";
let url=SUPA+"/rest/v1/"+TABLE+"?select=id,coefficient,round_timestamp&order=round_timestamp.desc,id.desc&limit=1000&offset="+offset;
let resp=await fetch(url,{headers:{apikey:KEY,Accept:"application/json"}});
if(!resp.ok)throw Error("HTTP "+resp.status+": "+(await resp.text()).slice(0,160));
let batch=await resp.json();
if(!Array.isArray(batch)||!batch.length)break;
for(let r of batch){let t=Date.parse(r.round_timestamp),x=Number(r.coefficient),id=String(r.id);if(Number.isFinite(t)&&Number.isFinite(x)&&!seen.has(id)){rows.push({id:r.id,t,x});seen.add(id)}}
offset+=batch.length;
if(batch.length<1000)break;
}
if(!rows.length)throw Error("Supabase не вернул коэффициенты");
rows.sort((a,b)=>a.t-b.t);
saveCsv(rows,"luckyjet_full_history_"+rows.length+".csv");
$("feedNote").textContent="CSV сформирован: "+rows.length+" раундов"+(offset>=max?" (достигнут лимит безопасности 200000)":"");
}catch(e){$("feedNote").textContent="Ошибка выгрузки: "+e.message}finally{btn.disabled=false;btn.textContent="⬇ Скачать ВСЮ историю CSV"}
}
const oldRender=render;render=function(){oldRender();let strip=$("liveStrip");if(strip)strip.innerHTML=data.slice(-30).reverse().map(r=>'<span style="padding:7px 10px;border-radius:9px;background:'+(r.x>=100?'#623163':r.x>=10?'#184b54':r.x>=2?'#154334':'#263148')+';font-weight:700;font-size:14px">'+fmt(r.x)+'×</span>').join("");};

function setupSignalPanel(){
let panel=document.createElement("section");panel.id="signalPanel";panel.className="box";panel.style.cssText="margin:16px 0;border:1px solid #245a87;background:radial-gradient(circle at top right,#182d59,#080e20 75%);box-shadow:0 0 30px #0a3e7030;padding:20px;text-align:center";
panel.innerHTML='<div style="font-size:12px;letter-spacing:3px;color:#8bd9ff">⚡ GOD PREDITOR · СИГНАЛ</div><div id="signalState" style="font-size:clamp(27px,7vw,48px);font-weight:900;color:#f8c86d;margin:16px 0 8px">ОЖИДАНИЕ ДАННЫХ</div><div id="signalTime" style="font-size:clamp(24px,7vw,44px);font-weight:800;color:#fff;font-variant-numeric:tabular-nums">--:--:--</div><div id="signalCountdown" style="font-size:18px;color:#8bd9ff;margin:8px">—</div><div id="signalTarget" style="color:#c5d8ee;margin:9px">Цель: —</div><div id="signalReason" style="color:#9eb2d3;font-size:13px;line-height:1.6">Исторические интервалы — не гарантия будущих результатов</div><div style="font-size:11px;color:#7187a8;margin-top:15px">Время локальное · сигналы экспериментальные · не рекомендация делать ставку</div>';
let metrics=document.getElementById("metrics");metrics.parentNode.insertBefore(panel,metrics);
}
let candidate=null;
function computeSignal(){
if(!data.length)return;
let target=Number($("target").value),events=data.filter(x=>x.x>=target),g=events.slice(1).map((x,i)=>(x.t-events[i].t)/1000).filter(x=>x>0);
if(g.length<5){candidate=null;paintSignal();return}
let recent=g.slice(-Math.min(60,g.length)),med=median(recent),scatter=mad(recent),now=Date.now(),last=events.at(-1).t,base=last+med*1000;
let width=Math.max(15000,Math.min(180000,scatter*1000*1.5));
let step=median(data.slice(1).map((x,i)=>(x.t-data[i].t)/1000).filter(x=>x>0&&x<300))||20;
let until=base+width;
while(until<now){base+=med*1000;until=base+width;if(med<=0)break}
let f=data.map(x=>x.x>=target?1:0),test=backtest(f,Math.max(1,Number($("horizon").value)));
candidate={target,at:base,from:base-width,to:base+width,med,scatter,validated:Number.isFinite(test.m)&&Number.isFinite(test.b)&&test.n>=30&&test.m<test.b*.98,tests:test.n};
paintSignal()
}
function paintSignal(){
let state=$("signalState");if(!state)return;
if(!candidate){state.textContent="МАЛО ИСТОРИИ";state.style.color="#f8c86d";$("signalTime").textContent="—";$("signalCountdown").textContent="Недостаточно повторений выбранной цели";$("signalTarget").textContent="Цель: "+$("target").value+"×";$("signalReason").textContent="";return}
let c=candidate,now=Date.now(),active=now>=c.from&&now<=c.to,remaining=now<c.from?c.from-now:now<=c.to?c.to-now:0;
let fmtTime=t=>new Date(t).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
let dur=t=>{let sec=Math.max(0,Math.ceil(t/1000));return String(Math.floor(sec/3600)).padStart(2,"0")+":"+String(Math.floor(sec%3600/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0")};
state.textContent=active?"🟡 ОКНО АНАЛИЗА":"⏳ ЖДАТЬ";state.style.color=active?"#63e8b5":"#f8c86d";
$("signalTime").textContent=fmtTime(c.from)+" — "+fmtTime(c.to);
$("signalCountdown").textContent=active?"До завершения окна: "+dur(remaining):"До начала окна: "+dur(remaining);
$("signalTarget").textContent="";
$("signalReason").textContent=(c.validated?"Внутренний тест показал улучшение, но независимая проверка необходима. ":"Преимущество перед базовой частотой не подтверждено. ")+"Расчёт по медиане последних интервалов; точное время выпадения неизвестно.";
}
const previousRender=render;render=function(){previousRender();computeSignal()};
setupSignalPanel();setInterval(paintSignal,1000);

const JOURNAL_KEY="god-v3-window-journal-"+document.body.dataset.mode;
let journal=[];try{journal=JSON.parse(localStorage.getItem(JOURNAL_KEY)||"[]");if(!Array.isArray(journal))journal=[]}catch{journal=[]}
function persistJournal(){try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(journal.slice(-300)))}catch{}}
function recordWindow(c){
if(!c||!Number.isFinite(c.from)||!Number.isFinite(c.to))return;
const last=journal.at(-1);
if(last&&last.target===c.target&&Math.abs(last.start-c.from)<60000)return;
if(journal.some(w=>w.target===c.target&&w.start===c.from))return;
journal.push({id:Date.now()+"-"+c.target,target:c.target,start:c.from,end:c.to,created:Date.now(),status:"pending",actual:null});
journal=journal.slice(-300);persistJournal();
}
function verifyJournal(){
if(!data.length)return;let changed=false,now=Date.now();
for(let w of journal){
if(w.status!=="pending"||now<=w.end)continue;
let slice=data.filter(r=>r.t>=w.start&&r.t<=w.end);
let hit=slice.find(r=>r.x>=w.target);
if(hit){w.status="hit";w.actual=hit.x;w.resultAt=hit.t;changed=true;continue}
let before=data.findLast(r=>r.t<w.start),after=data.find(r=>r.t>w.end);
if(before&&after&&slice.length){w.status="miss";w.actual=Math.max(...slice.map(r=>r.x));changed=true}
else if(now-w.end>86400000){w.status="unknown";changed=true}
}
if(changed)persistJournal();renderJournal();
}
function renderJournal(){
let host=$("journalList");if(!host)return;
let rows=journal.slice().reverse();
host.innerHTML=rows.length?rows.map(w=>{
let color=w.status==="hit"?"#65e7ad":w.status==="miss"?"#ff858d":"#d5b7ff";
let label=w.status==="hit"?"✅ ЗАШЛО":w.status==="miss"?"❌ НЕ ЗАШЛО":w.status==="unknown"?"⚪ НЕТ ДАННЫХ":"⏳ ПРОВЕРЯЕТСЯ";
let when=t=>new Date(t).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
return '<div style="padding:13px;border-bottom:1px solid #ffffff20"><strong style="color:'+color+'">'+label+'</strong><div style="font-size:12px;margin-top:5px">Цель ≥'+w.target+'× · '+when(w.start)+' — '+when(w.end)+'</div><small>Результат: '+(w.actual==null?"ожидание":fmt(w.actual)+"×")+'</small></div>'
}).join(""):'<p style="color:#bda5d5">Пока нет сохранённых окон. Новые окна будут записываться автоматически.</p>';
}
function setupJournal(){
let host=document.createElement("div");host.id="journalList";
let h=$("history");if(h){h.insertBefore(host,h.querySelector(".history"));let t=h.querySelector("h2");if(t)t.textContent="История проверок · ЗАШЛО / НЕ ЗАШЛО";
let details=h.querySelector(".history");if(details){details.style.display="none";let b=document.createElement("button");b.textContent="Показать коэффициенты";b.onclick=()=>{details.style.display=details.style.display==="none"?"block":"none";b.textContent=details.style.display==="none"?"Показать коэффициенты":"Скрыть коэффициенты"};h.appendChild(b)}}
renderJournal()
}
const previousSignal=computeSignal;computeSignal=function(){previousSignal();if(candidate&&candidate.from>Date.now()&&candidate.from-Date.now()<86400000)recordWindow(candidate);verifyJournal()};
setupJournal();


setupLive();
setInterval(()=>{if($("auto").checked)load()},15000);load();