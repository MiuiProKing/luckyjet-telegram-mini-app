(function(){
  const APP_VERSION = "2.2";
  const MODES = {
    SAFE:{label:"SAFE", min:1.50, max:2.00, minHistory:10, minQuality:72, window:12, goal:"many", description:"Строгий фильтр, невысокая цель и редкие тестовые сигналы.", warning:""},
    PRO:{label:"PRO", min:2.00, max:3.50, minHistory:8, minQuality:62, window:12, goal:"balance", description:"Баланс частоты, качества данных и диапазона цели.", warning:""},
    SNIPER_PRO:{label:"SNIPER PRO", min:5.00, max:10.00, minHistory:20, minQuality:74, window:24, goal:"rare", description:"Редкий экспериментальный режим для больших коэффициентов.", warning:"Высокий риск: история раундов не делает случайный результат предсказуемым."}
  };

  const path = location.pathname.toLowerCase();
  const titleHint = (document.title || "").toLowerCase();
  const headingHint = ((document.querySelector("h1") || {}).textContent || "").toLowerCase();
  const hint = path + " " + titleHint + " " + headingHint;
  const game = hint.includes("aviator") ? "Aviator" : hint.includes("rocket queen") || hint.includes("rocketqueen") ? "Rocket Queen" : "Lucky Jet";
  const gameKey = game.toLowerCase().replace(/\s+/g,"-");
  const key = name => "lje22_" + gameKey + "_" + name;
  let currentMode = localStorage.getItem(key("mode")) || "PRO";
  if(!MODES[currentMode]) currentMode = "PRO";
  let voiceEnabled = localStorage.getItem("lje22_voice") !== "off";
  let soundEnabled = localStorage.getItem("lje22_sound") !== "off";
  let sessionMinutes = Math.max(10, Math.min(180, Number(localStorage.getItem("lje22_session_minutes")) || 30));
  const sessionStarted = Date.now();
  let lastSessionNotice = false;
  let lastChartCount = -1;
  let toastTimer = 0;
  let audioContext = null;

  const q = (s, root=document) => root.querySelector(s);
  const qa = (s, root=document) => Array.from(root.querySelectorAll(s));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const mean = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const stdev = arr => {
    if(arr.length < 2) return 0;
    const m = mean(arr); return Math.sqrt(arr.reduce((s,x)=>s+(x-m)*(x-m),0)/arr.length);
  };
  const median = arr => {
    if(!arr.length) return 0;
    const s=arr.slice().sort((a,b)=>a-b), i=Math.floor(s.length/2);
    return s.length%2?s[i]:(s[i-1]+s[i])/2;
  };
  const safeCoefs = () => (typeof coefs !== "undefined" && Array.isArray(coefs)) ? coefs : [];
  const safeHistory = () => (typeof history !== "undefined" && Array.isArray(history)) ? history : [];

  function toast(text){
    let el=q("#v22Toast");
    if(!el){ el=document.createElement("div"); el.id="v22Toast"; el.className="v22-toast"; document.body.appendChild(el); }
    el.textContent=text; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2200);
  }

  function beep(kind){
    if(!soundEnabled) return;
    try{
      audioContext = audioContext || new (window.AudioContext||window.webkitAudioContext)();
      const now=audioContext.currentTime;
      const osc=audioContext.createOscillator();
      const gain=audioContext.createGain();
      osc.type=kind==="ok"?"sine":kind==="bad"?"sawtooth":"triangle";
      osc.frequency.setValueAtTime(kind==="ok"?740:kind==="bad"?190:520,now);
      if(kind==="ok") osc.frequency.exponentialRampToValueAtTime(1040,now+.16);
      gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(.16,now+.025); gain.gain.exponentialRampToValueAtTime(.0001,now+.25);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(now); osc.stop(now+.27);
    }catch(_){ }
  }

  function speak(text){
    if(!voiceEnabled || !window.speechSynthesis || !text) return;
    try{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text); u.lang="ru-RU"; u.rate=.96; u.pitch=.9; u.volume=1;
      const voices=speechSynthesis.getVoices();
      const ru=voices.find(v=>/^ru/i.test(v.lang) && /male|муж/i.test(v.name)) || voices.find(v=>/^ru/i.test(v.lang));
      if(ru) u.voice=ru; speechSynthesis.speak(u);
    }catch(_){ }
  }

  function qualityInfo(){
    const mode=MODES[currentMode];
    const all=safeCoefs();
    const recent=all.slice(-mode.window);
    const losses=(typeof consecutiveLosses==="function"?consecutiveLosses():0);
    if(!recent.length) return {quality:0,risk:"нет данных",vol:0,trend:0,lowStreak:0,count:0,why:"Собираю историю раундов"};
    const m=mean(recent), sd=stdev(recent), normalizedVol=m?sd/m:0;
    const capped=recent.map(x=>Math.min(x,10));
    const first=capped.slice(0,Math.max(1,Math.floor(capped.length/2)));
    const second=capped.slice(-Math.max(1,Math.floor(capped.length/2)));
    const trend=mean(second)-mean(first);
    let lowStreak=0; for(let i=recent.length-1;i>=0&&recent[i]<1.5;i--) lowStreak++;
    const dataScore=clamp(recent.length/mode.minHistory,0,1)*32;
    const stabilityScore=clamp(1-normalizedVol/2.2,0,1)*34;
    const continuityScore=clamp(1-lowStreak/6,0,1)*18;
    const lossScore=clamp(1-losses/3,0,1)*16;
    const quality=Math.round(clamp(dataScore+stabilityScore+continuityScore+lossScore,0,96));
    let risk=quality>=75?"низкий":quality>=58?"средний":"высокий";
    let why=recent.length<mode.minHistory?`Нужно ещё ${mode.minHistory-recent.length} раундов`:
      lowStreak>=4?`Серия низких коэффициентов: ${lowStreak}`:
      normalizedVol>1.4?"Высокая волатильность истории":
      losses>=2?`Неудачных проверок подряд: ${losses}`:
      trend>.35?"Последняя часть выборки выше предыдущей":"Данные стабильны для выбранного фильтра";
    return {quality,risk,vol:normalizedVol,trend,lowStreak,count:recent.length,why,mean:m,median:median(recent),losses};
  }

  function consecutiveLosses(){
    const h=safeHistory(); let n=0;
    for(const item of h){ if(item && item.status==="ko") n++; else break; }
    return n;
  }

  function applyMode(modeName, announce){
    if(!MODES[modeName]) modeName="PRO";
    currentMode=modeName; localStorage.setItem(key("mode"),modeName);
    const mode=MODES[modeName];
    try{
      if(typeof SETTINGS!=="undefined"){
        SETTINGS.mode=modeName==="SNIPER_PRO"?"SNIPER":modeName;
        SETTINGS.goal=mode.goal;
        SETTINGS.range={min:mode.min,max:mode.max};
      }
      const min=q("#minOddsInput"),max=q("#maxOddsInput"),sel=q("#modeSelect"),goal=q("#goalSelect");
      if(min) min.value=mode.min.toFixed(2); if(max) max.value=mode.max.toFixed(2);
      if(sel) sel.value=modeName==="SNIPER_PRO"?"SNIPER":modeName; if(goal) goal.value=mode.goal;
    }catch(_){ }
    qa(".v22-mode-btn").forEach(b=>b.classList.toggle("active",b.dataset.mode===modeName));
    const d=q("#v22ModeDescription"),w=q("#v22ModeWarning");
    if(d) d.textContent=mode.description;
    if(w){w.textContent=mode.warning;w.classList.toggle("show",!!mode.warning)}
    if(typeof writeAnalysis==="function"){
      const info=qualityInfo();
      writeAnalysis(`${mode.label}: ${info.why}. Качество данных ${info.quality}%.`, info.quality>=mode.minQuality?"ok":"", enhancedAnalyze());
    }
    if(announce){beep("tap");toast(`Режим ${mode.label} включён`);}
    updateDashboard();
  }

  function enhancedAnalyze(){
    const info=qualityInfo();
    const mode=MODES[currentMode];
    const level=info.quality>=mode.minQuality?"safe":info.quality>=mode.minQuality-14?"warn":"danger";
    const risk=level==="safe"?"low":level==="warn"?"medium":"high";
    return {score:info.quality,level,risk,why:info.why,conf:info.quality,low_count:info.lowStreak,trend_up:info.trend>0,losses:info.losses,volatility:info.vol};
  }

  function enhancedTarget(minCoef,maxCoef){
    const mode=MODES[currentMode];
    const info=qualityInfo();
    const all=safeCoefs().slice(-mode.window).map(x=>Math.min(x,20));
    let target=mode.min;
    if(currentMode==="SAFE") target=1.50+(info.quality/100)*.50;
    else if(currentMode==="PRO") target=2.00+clamp((median(all)-1.4)*.45,0,1.5);
    else target=5.00+clamp((median(all)-1.5)*.9 + (info.quality-70)*.04,0,5);
    return Number(clamp(target,Math.max(mode.min,minCoef||mode.min),Math.min(mode.max,maxCoef||mode.max)).toFixed(2));
  }

  function enhancedCanSignal(){
    const mode=MODES[currentMode], info=qualityInfo(), all=safeCoefs();
    if(all.length<mode.minHistory){
      const msg=`Нет тестового сигнала: собрано ${all.length}/${mode.minHistory} раундов.`;
      try{lastNoSignal=msg;}catch(_){ }
      if(typeof writeAnalysis==="function") writeAnalysis(msg,"",enhancedAnalyze());
      return false;
    }
    if(info.losses>=2){
      const msg="Пауза после двух неудачных проверок. Дождитесь новых данных.";
      try{lastNoSignal=msg;}catch(_){ }
      if(typeof writeAnalysis==="function") writeAnalysis(msg,"ko",enhancedAnalyze());
      return false;
    }
    if(info.quality<mode.minQuality){
      const msg=`Сигнал пропущен: качество данных ${info.quality}%, нужно ${mode.minQuality}%. ${info.why}.`;
      try{lastNoSignal=msg;}catch(_){ }
      if(typeof writeAnalysis==="function") writeAnalysis(msg,"ko",enhancedAnalyze());
      return false;
    }
    if(currentMode==="SAFE" && info.lowStreak>=3){
      const msg="SAFE пропустил вход: три низких коэффициента подряд.";
      try{lastNoSignal=msg;}catch(_){ }
      if(typeof writeAnalysis==="function") writeAnalysis(msg,"ko",enhancedAnalyze());
      return false;
    }
    if(currentMode==="SNIPER_PRO"){
      const recent=all.slice(-24), high=recent.filter(x=>x>=5).length;
      if(high<2){
        const msg=`SNIPER PRO ждёт больше истории высоких коэффициентов: ${high}/2 в последних 24.`;
        try{lastNoSignal=msg;}catch(_){ }
        if(typeof writeAnalysis==="function") writeAnalysis(msg,"",enhancedAnalyze());
        return false;
      }
    }
    const msg=`${mode.label}: фильтр пройден, качество данных ${info.quality}%.`;
    try{lastNoSignal=msg;}catch(_){ }
    if(typeof writeAnalysis==="function") writeAnalysis(msg,"ok",enhancedAnalyze());
    return true;
  }

  function enhancedExplain(){
    const i=qualityInfo(),m=MODES[currentMode];
    return `${m.label}: качество данных ${i.quality}%, волатильность ${i.vol.toFixed(2)}, история ${safeCoefs().length} раундов. ${i.why}.`;
  }

  function patchLogic(){
    try{
      if(typeof setApiState==="function"){
        const originalApiState=setApiState;
        setApiState=function(text,kind){
          const map={WAIT:"ОЖИДАНИЕ",POLL:"ЗАПРОС",LIVE:"ОНЛАЙН",OFFLINE:"НЕТ СВЯЗИ",TIMEOUT:"ТАЙМАУТ",RECONNECTING:"ПЕРЕПОДКЛЮЧЕНИЕ","NO DATA":"НЕТ ДАННЫХ","WAIT BRIDGE":"ОЖИДАНИЕ ИГРЫ"};
          return originalApiState(map[text]||text,kind);
        };
      }
      if(typeof analyze==="function") analyze=enhancedAnalyze;
      if(typeof smartTarget==="function") smartTarget=enhancedTarget;
      if(typeof canSignal==="function") canSignal=enhancedCanSignal;
      if(typeof explainSignal==="function") explainSignal=enhancedExplain;
      if(typeof analysisStatsText==="function") analysisStatsText=function(){const m=MODES[currentMode],i=qualityInfo();return `${m.label} · цель ${m.min.toFixed(2)}–${m.max.toFixed(2)}x · качество ${i.quality}% · волатильность ${i.vol.toFixed(2)}`;};
      if(typeof runSignalCycle==="function") runSignalCycle=function(){
        const mode=MODES[currentMode];
        const target=enhancedTarget(mode.min,mode.max);
        const entry=typeof chooseEntryTime==="function"?chooseEntryTime():new Date(Date.now()+60000);
        startSignal(target,entry,mode.label,true,`🧭 Тестовый сигнал. ${enhancedExplain()}`);
      };
      if(typeof startSignal==="function"){
        const originalStart=startSignal;
        startSignal=function(target,entryTime,type,skipFirst,detail){
          beep("tap"); speak(`Тестовый сигнал ${MODES[currentMode].label}. Цель ${Number(target).toFixed(2)} икс.`);
          return originalStart(target,entryTime,type,skipFirst,detail);
        };
      }
      if(typeof finishSignal==="function"){
        const originalFinish=finishSignal;
        finishSignal=function(ok,realCoef,roundNumber){
          beep(ok?"ok":"bad"); speak(ok?"Проверка успешна":"Проверка завершилась без достижения цели");
          const r=originalFinish(ok,realCoef,roundNumber); setTimeout(updateDashboard,80); return r;
        };
      }
    }catch(e){console.warn("v2.2 logic patch",e)}
  }

  function drawChart(){
    const canvas=q("#v22Chart"); if(!canvas) return;
    const values=safeCoefs().slice(-30); const rect=canvas.getBoundingClientRect(); const dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(rect.width*dpr)); canvas.height=Math.max(1,Math.round(rect.height*dpr));
    const ctx=canvas.getContext("2d"); ctx.scale(dpr,dpr); const w=rect.width,h=rect.height; ctx.clearRect(0,0,w,h);
    ctx.strokeStyle="rgba(255,255,255,.08)";ctx.lineWidth=1;
    [0.25,.5,.75].forEach(y=>{ctx.beginPath();ctx.moveTo(0,h*y);ctx.lineTo(w,h*y);ctx.stroke()});
    if(!values.length){ctx.fillStyle="#777789";ctx.font="12px -apple-system";ctx.fillText("Ожидание коэффициентов…",8,h/2);return}
    const max=Math.max(3,Math.min(20,Math.max.apply(null,values)));
    const gap=3,bar=Math.max(3,(w-gap*(values.length-1))/values.length);
    values.forEach((v,i)=>{
      const capped=Math.min(v,max),bh=Math.max(3,(capped-1)/(max-1)*(h-12)); const x=i*(bar+gap),y=h-bh;
      const grad=ctx.createLinearGradient(0,y,0,h);
      if(v>=5){grad.addColorStop(0,"#f59e0b");grad.addColorStop(1,"rgba(245,158,11,.18)")}
      else if(v>=2){grad.addColorStop(0,"#22c55e");grad.addColorStop(1,"rgba(34,197,94,.16)")}
      else{grad.addColorStop(0,"#8b5cf6");grad.addColorStop(1,"rgba(139,92,246,.15)")}
      ctx.fillStyle=grad;ctx.beginPath(); if(ctx.roundRect)ctx.roundRect(x,y,bar,bh,3);else ctx.rect(x,y,bar,bh);ctx.fill();
    });
  }

  function updateDashboard(){
    const i=qualityInfo();
    const set=(id,text,cls)=>{const el=q(id);if(el){el.textContent=text;el.className="v22-stat-value "+(cls||"")}};
    set("#v22Quality",i.quality+"%",i.quality>=75?"good":i.quality>=58?"warn":"bad");
    set("#v22Vol",i.vol.toFixed(2),i.vol<.8?"good":i.vol<1.4?"warn":"bad");
    set("#v22Streak",i.lowStreak?i.lowStreak+" низк.":"нет",i.lowStreak>=4?"bad":i.lowStreak>=2?"warn":"good");
    set("#v22Count",String(safeCoefs().length),safeCoefs().length>=MODES[currentMode].minHistory?"good":"warn");
    const reason=q("#v22ChartReason");if(reason)reason.textContent=i.why;
    const session=q("#v22Session"); if(session){const used=Math.floor((Date.now()-sessionStarted)/60000);session.textContent=`Сессия ${used} мин · напоминание через ${sessionMinutes} мин`}
    if(safeCoefs().length!==lastChartCount){lastChartCount=safeCoefs().length;drawChart()}
    if(!lastSessionNotice && Date.now()-sessionStarted>=sessionMinutes*60000){lastSessionNotice=true;toast("Время сделать перерыв");beep("tap");speak("Время сделать перерыв");}
  }

  function translateUI(){
    document.documentElement.lang="ru";document.title=`${game} Exact PRO 2.2`;
    const replacements={
      "Settings":"Настройки","History":"История","Time":"Время","Round":"Раунд","Last coef":"Последний","WAIT":"ОЖИДАНИЕ","POLL":"ЗАПРОС","LIVE":"ОНЛАЙН","OFFLINE":"НЕТ СВЯЗИ","RECONNECTING":"ПЕРЕПОДКЛЮЧЕНИЕ",
      "wins ✅":"Успешные ✅","losses ❌":"Неудачные ❌","Total":"Всего","2x last20":"2x · 20 раундов","10x last120":"10x · 120 раундов",
      "Collecting data.":"Собираю данные…","ANALYSIS":"АНАЛИЗ","ANALYSE":"АНАЛИЗ","Stats reset.":"Статистика сброшена.",
      "No predictions yet.":"История пока пуста.","No predictions for this filter.":"По этому фильтру записей нет."
    };
    qa(".title,.analysis-title,.ttl,.label,.hint,option,#settingsMsg,#analysisReason").forEach(el=>{const t=el.textContent.trim();if(replacements[t])el.textContent=replacements[t]});
    const gen=q("#generateButton");if(gen)gen.textContent="ПОЛУЧИТЬ ТЕСТОВЫЙ СИГНАЛ"; const csv=q("#exportCsv");if(csv)csv.textContent="ЭКСПОРТ CSV"; const openGame=q("#openAviatorGame");if(openGame)openGame.textContent=game==="Rocket Queen"?"ОТКРЫТЬ ROCKET QUEEN":"ОТКРЫТЬ AVIATOR";
    const auto=q("#autoButton");if(auto&&!auto.classList.contains("on"))auto.textContent="АВТО: ВЫКЛ";
    const back=q("#backToCatalog");if(back)back.textContent="‹ Все игры";
    const h=q("#analyzerView h1") || q(".wrap h1");if(h&&game!=="Lucky Jet")h.innerHTML=`<span class="lucky">${game}</span> <span class="jet">Exact</span>`; const pv=q(".pro-title small");if(pv)pv.textContent="2.2";
    qa("#historyFilter option").forEach(o=>{const map={all:"Все",ok:"Успешные",ko:"Неудачные",PRO:"PRO",GRAND:"10X LAB",TRAINED:"V3"};if(map[o.value])o.textContent=map[o.value]});
  }

  function buildUI(){
    const top=q(".topbar");if(top&&!q(".v22-version",top)){const b=document.createElement("div");b.className="v22-version";b.textContent="PRO 2.2";top.appendChild(b)}
    const gen=q("#generateButton"); if(!gen) return;
    const panel=document.createElement("section"); panel.className="v22-mode-panel";panel.innerHTML=`
      <div class="v22-mode-label"><span>РЕЖИМ АНАЛИЗА</span><span>${game}</span></div>
      <div class="v22-mode-tabs">
        <button class="v22-mode-btn" data-mode="SAFE">SAFE</button>
        <button class="v22-mode-btn" data-mode="PRO">PRO</button>
        <button class="v22-mode-btn" data-mode="SNIPER_PRO">SNIPER PRO</button>
      </div>
      <div class="v22-mode-description" id="v22ModeDescription"></div><div class="v22-mode-warning" id="v22ModeWarning"></div>`;
    gen.parentNode.insertBefore(panel,gen);
    qa(".v22-mode-btn",panel).forEach(b=>b.addEventListener("click",()=>applyMode(b.dataset.mode,true)));

    const dash=document.createElement("section");dash.className="v22-dashboard";dash.innerHTML=`
      <div class="v22-stat"><div class="v22-stat-label">Качество данных</div><div class="v22-stat-value" id="v22Quality">0%</div></div>
      <div class="v22-stat"><div class="v22-stat-label">Волатильность</div><div class="v22-stat-value" id="v22Vol">0.00</div></div>
      <div class="v22-stat"><div class="v22-stat-label">Низкая серия</div><div class="v22-stat-value" id="v22Streak">нет</div></div>
      <div class="v22-stat"><div class="v22-stat-label">История</div><div class="v22-stat-value" id="v22Count">0</div></div>`;
    panel.parentNode.insertBefore(dash,panel.nextSibling);
    const chart=document.createElement("section");chart.className="v22-chart-card";chart.innerHTML=`<div class="v22-chart-head"><b>Последние 30 раундов</b><span id="v22ChartReason">Ожидание данных</span></div><canvas class="v22-chart" id="v22Chart"></canvas><div class="v22-session" id="v22Session"></div>`;
    dash.parentNode.insertBefore(chart,dash.nextSibling);

    const settings=q("#settingsPanel .panel-body")||q("#settingsPanel");
    if(settings){
      const block=document.createElement("div");block.className="v22-settings";block.innerHTML=`
        <div class="v22-settings-title">ВОЗМОЖНОСТИ PRO 2.2</div>
        <div class="v22-settings-grid">
          <div class="v22-setting"><label>Русский голос <input id="v22Voice" type="checkbox"></label><small>Озвучивает начало и результат проверки.</small></div>
          <div class="v22-setting"><label>Звуки <input id="v22Sound" type="checkbox"></label><small>Разные сигналы для запуска, успеха и ошибки.</small></div>
          <div class="v22-setting"><label>Напоминание о перерыве</label><input id="v22SessionMinutes" type="number" min="10" max="180" step="5"><small>Минут непрерывной сессии.</small></div>
          <div class="v22-setting"><label>Telegram проекта</label><input id="v22Telegram" type="text" placeholder="https://t.me/your_channel"><small>Ссылка сохраняется только на устройстве.</small></div>
        </div>
        <div class="v22-settings-actions"><button class="v22-mini-btn" id="v22Backup">Резервная копия</button><button class="v22-mini-btn" id="v22Restore">Восстановить</button></div>
        <input type="file" id="v22RestoreFile" accept="application/json" hidden>
        <details class="v22-lab"><summary>Экспериментальная лаборатория</summary><div class="v22-lab-box" id="v22LabBox"></div><small>Режимы лаборатории не гарантируют результат и предназначены для тестирования интерфейса и статистики.</small></details>`;
      settings.appendChild(block);
      q("#v22Voice").checked=voiceEnabled;q("#v22Sound").checked=soundEnabled;q("#v22SessionMinutes").value=sessionMinutes;q("#v22Telegram").value=localStorage.getItem("lje22_telegram")||"";
      q("#v22Voice").addEventListener("change",e=>{voiceEnabled=e.target.checked;localStorage.setItem("lje22_voice",voiceEnabled?"on":"off");toast(voiceEnabled?"Голос включён":"Голос выключен")});
      q("#v22Sound").addEventListener("change",e=>{soundEnabled=e.target.checked;localStorage.setItem("lje22_sound",soundEnabled?"on":"off");if(soundEnabled)beep("tap")});
      q("#v22SessionMinutes").addEventListener("change",e=>{sessionMinutes=clamp(Number(e.target.value)||30,10,180);e.target.value=sessionMinutes;localStorage.setItem("lje22_session_minutes",sessionMinutes)});
      q("#v22Telegram").addEventListener("change",e=>{let v=e.target.value.trim();if(v&&!/^https:\/\/t\.me\/[A-Za-z0-9_+\-]+/.test(v)){toast("Нужна ссылка вида https://t.me/...");return}localStorage.setItem("lje22_telegram",v);toast("Ссылка Telegram сохранена")});
      q("#v22Backup").addEventListener("click",exportBackup);q("#v22Restore").addEventListener("click",()=>q("#v22RestoreFile").click());q("#v22RestoreFile").addEventListener("change",importBackup);
      const lab=q("#v22LabBox"),grand=q("#grandButton"),trained=q("#trainedButton");if(lab){if(grand)lab.appendChild(grand);if(trained)lab.appendChild(trained)}
    }
  }

  function exportBackup(){
    const data={version:APP_VERSION,createdAt:new Date().toISOString(),game,storage:{}};
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&(k.includes("luckyjet")||k.includes("lumorax")||k.startsWith("lje22_")))data.storage[k]=localStorage.getItem(k)}
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`LuckyJetExact-${gameKey}-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast("Резервная копия создана");
  }
  function importBackup(e){
    const f=e.target.files&&e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.storage||typeof d.storage!=="object")throw new Error();Object.entries(d.storage).forEach(([k,v])=>localStorage.setItem(k,String(v)));toast("Данные восстановлены. Перезапускаю…");setTimeout(()=>location.reload(),900)}catch(_){toast("Файл резервной копии повреждён")}};r.readAsText(f);e.target.value="";
  }

  function onboarding(){
    if(localStorage.getItem("lje22_onboarding")==="done")return;
    const m=document.createElement("div");m.className="v22-modal open";m.innerHTML=`<div class="v22-modal-card"><div class="v22-modal-logo">🚀</div><h2>LuckyJet Exact PRO 2.2</h2><p>Обновлённый анализатор истории раундов с тремя фильтрами, графиком, резервной копией и русской озвучкой.</p><ul><li>SAFE — строгий фильтр и низкий диапазон цели</li><li>PRO — сбалансированный режим</li><li>SNIPER PRO — редкий экспериментальный режим</li></ul><p><b>18+.</b> Результаты игр случайны. Приложение не гарантирует выигрыш и не совершает ставки.</p><button id="v22Accept">ПОНЯТНО, ПРОДОЛЖИТЬ</button></div>`;document.body.appendChild(m);q("#v22Accept",m).addEventListener("click",()=>{localStorage.setItem("lje22_onboarding","done");m.remove();beep("tap")});
  }

  function handleDeepLink(){
    const p=new URLSearchParams(location.search),mode=p.get("v22mode");
    if(game==="Lucky Jet"&&mode&&typeof openLuckyJet==="function")openLuckyJet();
    if(mode&&MODES[mode])currentMode=mode;
  }

  function init(){
    handleDeepLink();translateUI();buildUI();patchLogic();applyMode(currentMode,false);updateDashboard();onboarding();
    setInterval(updateDashboard,1000);window.addEventListener("resize",drawChart);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)updateDashboard()});
    const safety=q(".app-safety-note");
    if(safety){
      safety.textContent="18+ · История раундов не предсказывает случайный результат. Приложение не совершает ставки и не гарантирует выигрыш.";
      const target=q("#analyzerView .wrap") || q(".wrap");
      if(target) target.appendChild(safety);
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
