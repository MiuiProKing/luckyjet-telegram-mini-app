(()=>{"use strict";
const key="god-v3-window-journal-"+(document.body.dataset.mode||"science");
const api="https://stzrirukuxcyalrsstxx.supabase.co/rest/v1/luckyjet_rounds?select=id,coefficient,round_timestamp&order=round_timestamp.desc&limit=80";
const token="sb_publishable_ZhoUzbPBM33K3qoL-HY20Q_oVU4ebc7";
let rounds=[],tab="checks",loading=false;
const css=document.createElement("style");css.textContent=`
#v3AuditDrawer{display:none;position:fixed;inset:0;z-index:2147483647;background:#080512;color:#f2e6ff;overflow:auto;padding:20px 15px 80px;font-family:Inter,-apple-system,system-ui,sans-serif}
#v3AuditDrawer.open{display:block!important}
#v3AuditDrawer .inner{max-width:700px;margin:auto}
#v3AuditDrawer .head{display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#080512;padding:12px 0;z-index:2}
#v3AuditDrawer button{border:1px solid #9c66ca70;border-radius:15px;background:#281539;color:#f5ddff;padding:11px 14px;font-size:13px}
#v3AuditDrawer .tabs{display:flex;gap:9px;margin:14px 0}
#v3AuditDrawer .tabs button.active{background:#7435a4}
#v3AuditDrawer .entry{background:#1c102b;border:1px solid #8751a43d;border-radius:15px;padding:13px;margin:9px 0}
#v3AuditDrawer .row{display:flex;justify-content:space-between;gap:10px;align-items:center}
#v3AuditDrawer small{color:#b7a0c7;display:block;margin-top:7px;font-size:11px;line-height:1.5}
#v3AuditDrawer .x{font-size:20px;color:#e9b9ff;font-weight:900}
#v3AuditDrawer .hit{color:#70e7b4}#v3AuditDrawer .miss{color:#ff9ba4}
`;document.head.appendChild(css);
const el=document.createElement("div");el.id="v3AuditDrawer";el.innerHTML='<div class="inner"><div class="head"><b>◷ История GOD PREDITOR</b><button id="v3AuditClose" type="button">✕ Закрыть</button></div><div class="tabs"><button id="v3AuditChecks" type="button">Проверки сигналов</button><button id="v3AuditRounds" type="button">Коэффициенты</button></div><div id="v3AuditCount"></div><div id="v3AuditContent"></div></div>';document.body.appendChild(el);
const $=id=>document.getElementById(id);
const when=t=>new Date(t).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
const fmt=n=>Number(n).toFixed(2)+"×";
function journal(){try{const j=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(j)?j:[]}catch{return []}}
function checks(){return journal().slice().reverse().map(w=>{
let status=w.status==="hit"?"✅ ЗАШЛО":w.status==="miss"?"❌ НЕ ЗАШЛО":w.status==="unknown"?"⚪ НЕТ ДАННЫХ":"⏳ В ПРОЦЕССЕ";
let cls=w.status==="hit"?"hit":w.status==="miss"?"miss":"";
return '<div class="entry"><div class="row"><b class="'+cls+'">'+status+'</b><b class="x">ЦЕЛЬ '+fmt(w.target)+'</b></div><small>'+when(w.start)+' — '+when(w.end)+'</small><small>Выпало: '+(w.actual==null?"ожидаем результат":fmt(w.actual))+'</small></div>'
}).join("")}
function render(){
$("v3AuditChecks").classList.toggle("active",tab==="checks");$("v3AuditRounds").classList.toggle("active",tab==="rounds");
const j=journal();
$("v3AuditCount").textContent=tab==="checks"?"Сохранённых прогнозных окон: "+j.length:"Последние фактические раунды из Supabase: "+rounds.length;
if(tab==="checks"){$("v3AuditContent").innerHTML=checks()||'<div class="entry">Пока нет сохранённых прогнозных окон. Для результата «ЗАШЛО / НЕ ЗАШЛО» сигнал должен быть записан до начала проверки. Открой «Коэффициенты», чтобы увидеть реальные выпавшие X.</div>';return}
$("v3AuditContent").innerHTML=rounds.length?rounds.map(r=>'<div class="entry"><div class="row"><b>ВЫПАЛО</b><b class="x">'+fmt(r.coefficient)+'</b></div><small>'+when(r.round_timestamp)+'</small></div>').join(""):'<div class="entry">'+(loading?"Загружаем реальные коэффициенты…":"Нет данных. Проверь подключение к Supabase.")+'</div>'
}
async function fetchRounds(){if(loading)return;loading=true;render();try{const r=await fetch(api,{headers:{apikey:token,Accept:"application/json"},cache:"no-store"});if(!r.ok)throw Error("Supabase HTTP "+r.status);const d=await r.json();rounds=Array.isArray(d)?d:[];rounds.sort((a,b)=>Date.parse(b.round_timestamp)-Date.parse(a.round_timestamp));}catch(e){$("v3AuditCount").textContent="Ошибка загрузки: "+e.message}finally{loading=false;render()}}
function open(){el.classList.add("open");document.body.style.overflow="hidden";tab="checks";render();fetchRounds()}
function close(){el.classList.remove("open");document.body.style.overflow=""}
$("v3AuditClose").onclick=close;$("v3AuditChecks").onclick=()=>{tab="checks";render()};$("v3AuditRounds").onclick=()=>{tab="rounds";render();if(!rounds.length)fetchRounds()};
document.addEventListener("click",e=>{const b=e.target.closest("#openHistory");if(!b)return;e.preventDefault();e.stopImmediatePropagation();el.classList.contains("open")?close():open()},true);
window.addEventListener("storage",()=>{if(el.classList.contains("open"))render()});
setInterval(()=>{if(el.classList.contains("open")){render();fetchRounds()}},15000);
})();