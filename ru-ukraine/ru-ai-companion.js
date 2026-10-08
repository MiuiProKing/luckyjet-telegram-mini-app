/* LuckyJet RU AI Companion
   Runs only when the same RU page logic accepts market conditions.
   Statistical analysis only; no client-side code can know a future server result. */
(function(){
  'use strict';

  const STORE='ru_ai_companion_v1';
  const AI_MODEL='gemini-2.5-flash';
  const POLL_MS=4000;
  const AUTO_SCAN_MS=8000;

  const state=Object.assign({
    enabled:true,
    apiKey:'',
    counts:{ok:0,ko:0},
    history:[],
    cycle:null,
    verifyTimer:null,
    aiBusy:false,
    lastAutoTry:0
  },load());

  if(!state.apiKey){
    try{
      const legacy=JSON.parse(localStorage.getItem('lj_beeai_settings_v1')||'null');
      if(legacy&&legacy.geminiKey)state.apiKey=String(legacy.geminiKey);
    }catch(_){}
  }

  function load(){
    try{
      const x=JSON.parse(localStorage.getItem(STORE)||'null');
      return x&&typeof x==='object'?x:{};
    }catch(_){return{}}
  }
  function save(){
    try{
      const out={
        enabled:!!state.enabled,
        apiKey:state.apiKey||'',
        counts:state.counts||{ok:0,ko:0},
        history:Array.isArray(state.history)?state.history.slice(0,50):[]
      };
      localStorage.setItem(STORE,JSON.stringify(out));
    }catch(_){}
  }
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
  function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}
  function median(a){
    if(!a.length)return 0;
    const s=[...a].sort((a,b)=>a-b),m=s.length>>1;
    return s.length%2?s[m]:(s[m-1]+s[m])/2;
  }
  function quantile(a,p){
    if(!a.length)return 0;
    const s=[...a].sort((a,b)=>a-b),i=(s.length-1)*p,l=Math.floor(i),h=Math.ceil(i);
    return l===h?s[l]:s[l]+(s[h]-s[l])*(i-l);
  }
  function ema(a,n){
    if(!a.length)return 0;
    const k=2/(n+1);let e=a[0];
    for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);
    return e;
  }
  function stdev(a){
    if(a.length<2)return 0;
    const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));
  }
  function fmtKyiv(ts){
    try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(ts))}
    catch(_){return new Date(ts).toLocaleTimeString('ru-RU')}
  }
  function normalizeRows(rows){
    if(!Array.isArray(rows))return[];
    return rows.map((r,i)=>{
      const coef=Number(r&&r.coef);
      if(!Number.isFinite(coef)||coef<1)return null;
      return {id:String(r.id??('r:'+i+':'+coef)),coef:Number(coef.toFixed(2))};
    }).filter(Boolean);
  }
  function localAi(rows,mainTarget){
    const chronological=normalizeRows(rows).slice().reverse();
    const values=chronological.map(x=>x.coef).slice(-30);
    if(values.length<5)return null;
    const recent=values.slice(-20);
    const med=median(recent),q40=quantile(recent,.40),e5=ema(recent,5),e12=ema(recent,12),sigma=stdev(recent);
    const lowRatio=recent.filter(x=>x<1.5).length/recent.length;
    const midRatio=recent.filter(x=>x>=2&&x<5).length/recent.length;
    const trend=(e5-e12)/Math.max(.01,e12);
    let target=q40*.38+med*.24+e5*.18+e12*.12+(Number(mainTarget)||med)*.08;
    if(lowRatio>.55)target*=.90;
    if(trend>.12)target*=1.05;
    if(trend<-.12)target*=.95;
    target=clamp(target,1.15,8);
    const stability=1-clamp(sigma/Math.max(2,med*2.7),0,1);
    const confidence=Math.round(clamp(44+stability*24+clamp(values.length/30,0,1)*12+(midRatio>.25?5:0)-Math.abs(trend)*8,35,88));
    const spread=clamp(sigma*.30,.18,2);
    return {
      target:Number(target.toFixed(2)),
      low:Number(clamp(target-spread,1.01,target).toFixed(2)),
      high:Number(clamp(target+spread,target,10).toFixed(2)),
      confidence,
      reason:'Медиана '+med.toFixed(2)+'X · EMA5 '+e5.toFixed(2)+' · EMA12 '+e12.toFixed(2)+' · σ '+sigma.toFixed(2),
      values
    };
  }

  function style(){
    if(document.getElementById('ruAiCompanionStyle'))return;
    const s=document.createElement('style');s.id='ruAiCompanionStyle';
    s.textContent=`
#ruAiCompanion{width:100%;max-width:560px;border:1px solid rgba(96,165,250,.34);border-radius:16px;background:linear-gradient(180deg,rgba(4,12,28,.95),rgba(2,8,20,.98));padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.28),0 0 22px rgba(37,99,235,.12)}
.ruai-head{display:flex;align-items:center;gap:9px}.ruai-dot{width:9px;height:9px;border-radius:50%;background:#64748b}.ruai-dot.on{background:#34d399;box-shadow:0 0 10px #34d399}.ruai-title{font-size:13px;font-weight:1000;letter-spacing:1px}.ruai-sub{font-size:9px;opacity:.58;margin-top:2px}.ruai-toggle{margin-left:auto;width:auto!important;height:32px!important;padding:0 10px!important;border-radius:999px!important;border:1px solid #2563eb!important;font-size:10px!important;background:#050b16!important}.ruai-toggle.on{background:#064e3b!important;border-color:#10b981!important}
.ruai-main{display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:7px;margin-top:10px}.ruai-cell{border:1px solid rgba(255,255,255,.11);border-radius:12px;background:rgba(255,255,255,.045);padding:9px 7px;text-align:center;min-width:0}.ruai-cell small{display:block;font-size:9px;opacity:.58}.ruai-cell b{display:block;font-size:16px;margin-top:3px;overflow-wrap:anywhere}
#ruAiTarget{color:#86efac;font-size:22px}.ruai-status{margin-top:9px;padding:9px 10px;border-radius:11px;background:rgba(255,255,255,.045);font-size:11px;line-height:1.4}.ruai-status.go{color:#86efac;border:1px solid rgba(16,185,129,.28)}.ruai-status.wait{color:#facc15}.ruai-status.bad{color:#fda4af}
.ruai-rounds{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}.ruai-round{border-radius:10px;padding:7px 5px;text-align:center;background:#111827;border:1px solid rgba(255,255,255,.08);font-size:10px;font-weight:900}.ruai-round.hit{background:#064e3b}.ruai-round.miss{background:#4c0519}
.ruai-reason{font-size:10px;opacity:.66;margin-top:8px;line-height:1.35}
.ruai-key{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)}.ruai-key label{display:block;font-size:10px;font-weight:900;margin-bottom:5px}.ruai-keyrow{display:grid;grid-template-columns:1fr auto;gap:6px}.ruai-key input{min-width:0;background:#020617;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:9px}.ruai-key button{width:auto!important;height:38px!important;padding:0 10px!important;border-radius:10px!important}.ruai-keyhint{font-size:9px;opacity:.55;margin-top:5px}
.ruai-counts{display:flex;gap:12px;margin-top:8px;font-size:10px;opacity:.8}
#ruAiOpenHistory{width:100%!important;height:38px!important;margin-top:8px!important;border-radius:10px!important;background:#0b1220!important;border:1px solid #2563eb!important}
.ruai-history-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px}
.ruai-history-tab{width:100%!important;height:38px!important;border-radius:10px!important;background:#111827!important;border:1px solid rgba(255,255,255,.12)!important;font-size:10px!important}
.ruai-history-tab.active{background:#1d4ed8!important;border-color:#60a5fa!important}
#ruAiHistoryView{display:none}
.ruai-hstats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
.ruai-hstat{padding:8px 5px;border-radius:10px;background:#111827;border:1px solid rgba(255,255,255,.08);text-align:center}
.ruai-hstat small{display:block;font-size:9px;opacity:.58}.ruai-hstat b{display:block;font-size:15px;margin-top:2px}
.ruai-round-dist{font-size:10px;line-height:1.5;padding:8px 9px;margin-bottom:8px;border-radius:10px;background:#0f172a;border:1px solid rgba(255,255,255,.08)}
.ruai-history-list{display:grid;gap:8px}
.ruai-hitem{padding:10px;border-radius:12px;background:#111827;border:1px solid rgba(255,255,255,.10)}
.ruai-hitem.ok{border-color:rgba(16,185,129,.35)}.ruai-hitem.ko{border-color:rgba(239,68,68,.35)}
.ruai-htop{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:1000}
.ruai-hmain{margin-top:6px;font-size:12px;font-weight:900}.ruai-hsub{margin-top:4px;font-size:10px;opacity:.72;line-height:1.45}
.ruai-mini-rounds{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.ruai-mini{padding:5px 7px;border-radius:8px;background:#0b1220;border:1px solid rgba(255,255,255,.08);font-size:9px;font-weight:900}.ruai-mini.hit{background:#064e3b}.ruai-empty{opacity:.65;font-size:11px;padding:10px 2px}
@media(max-width:380px){.ruai-main{grid-template-columns:1fr 1fr 1fr}.ruai-cell b{font-size:13px}#ruAiTarget{font-size:18px}}
`;
    document.head.appendChild(s);
  }

  function ui(){
    if(document.getElementById('ruAiCompanion'))return;
    style();
    const box=document.createElement('section');box.id='ruAiCompanion';
    box.innerHTML=`
      <div class="ruai-head">
        <div id="ruAiDot" class="ruai-dot"></div>
        <div><div class="ruai-title">AI • ПАРАЛЛЕЛЬНЫЙ ПРОГНОЗ</div><div class="ruai-sub">Те же условия страницы • свой расчёт • проверка 3 раунда</div></div>
        <button id="ruAiToggle" class="ruai-toggle" type="button">AI: ВКЛ</button>
      </div>
      <div class="ruai-main">
        <div class="ruai-cell"><small>AI цель</small><b id="ruAiTarget">—</b></div>
        <div class="ruai-cell"><small>Вход, Киев</small><b id="ruAiTime">—</b></div>
        <div class="ruai-cell"><small>Уверенность</small><b id="ruAiConf">—</b></div>
      </div>
      <div id="ruAiStatus" class="ruai-status wait">Жду условия основной логики страницы.</div>
      <div class="ruai-rounds">
        <div id="ruAiR1" class="ruai-round">1/3 —</div>
        <div id="ruAiR2" class="ruai-round">2/3 —</div>
        <div id="ruAiR3" class="ruai-round">3/3 —</div>
      </div>
      <div id="ruAiReason" class="ruai-reason">AI подключится автоматически, когда основной анализ разрешит сигнал.</div>
      <div class="ruai-key">
        <label>🔑 AI API KEY</label>
        <div class="ruai-keyrow"><input id="ruAiKey" type="password" autocomplete="off" placeholder="Вставь ключ"><button id="ruAiSave" type="button">СОХРАНИТЬ</button></div>
        <div id="ruAiKeyHint" class="ruai-keyhint">Ключ хранится только на этом устройстве в браузере.</div>
      </div>
      <div class="ruai-counts"><span>✅ AI: <b id="ruAiOk">0</b></span><span>❌ AI: <b id="ruAiKo">0</b></span></div>
      <button id="ruAiOpenHistory" type="button">📊 ИСТОРИЯ AI</button>
    `;
    const recent=document.querySelector('.recent-feed');
    if(recent&&recent.parentNode)recent.parentNode.insertBefore(box,recent.nextSibling);
    else document.querySelector('.wrap')?.prepend(box);

    const key=document.getElementById('ruAiKey');
    key.value=state.apiKey||'';
    document.getElementById('ruAiSave').onclick=()=>{
      state.apiKey=key.value.trim();save();renderKey();
      setStatus(state.apiKey?'AI ключ сохранён.':'Вставь ключ и нажми СОХРАНИТЬ.',state.apiKey?'go':'wait');
    };
    document.getElementById('ruAiToggle').onclick=()=>{
      state.enabled=!state.enabled;save();renderToggle();
      if(!state.enabled){clearVerify();state.cycle=null;setStatus('AI выключен.','wait');}
      else setStatus('AI включён. Жду условия основной логики.','wait');
    };
    document.getElementById('ruAiOpenHistory').onclick=()=>openAiHistory();
    ensureHistoryUI();
    renderToggle();renderKey();renderCounts();renderAiHistory();resetRounds();
  }

  function ensureHistoryUI(){
    const chips=document.getElementById('chipsContainer');
    if(!chips)return;
    const body=chips.parentElement;
    if(!body)return;

    let tabs=document.getElementById('ruAiHistoryTabs');
    if(!tabs){
      tabs=document.createElement('div');
      tabs.id='ruAiHistoryTabs';
      tabs.className='ruai-history-tabs';
      tabs.innerHTML='<button type="button" class="ruai-history-tab active" id="ruHistMainTab">ОСНОВНАЯ</button><button type="button" class="ruai-history-tab" id="ruHistAiTab">🤖 AI ИСТОРИЯ</button>';
      body.insertBefore(tabs,chips);
    }

    let ai=document.getElementById('ruAiHistoryView');
    if(!ai){
      ai=document.createElement('div');
      ai.id='ruAiHistoryView';
      body.insertBefore(ai,chips.nextSibling);
    }

    const mainTab=document.getElementById('ruHistMainTab');
    const aiTab=document.getElementById('ruHistAiTab');
    if(mainTab)mainTab.onclick=()=>selectHistoryTab('main');
    if(aiTab)aiTab.onclick=()=>selectHistoryTab('ai');
  }

  function selectHistoryTab(which){
    ensureHistoryUI();
    const chips=document.getElementById('chipsContainer');
    const ai=document.getElementById('ruAiHistoryView');
    const mainTab=document.getElementById('ruHistMainTab');
    const aiTab=document.getElementById('ruHistAiTab');
    const isAi=which==='ai';
    if(chips)chips.style.display=isAi?'none':'grid';
    if(ai)ai.style.display=isAi?'block':'none';
    if(mainTab)mainTab.classList.toggle('active',!isAi);
    if(aiTab)aiTab.classList.toggle('active',isAi);
    if(isAi)renderAiHistory();
  }

  function openAiHistory(){
    ensureHistoryUI();
    const panel=document.getElementById('historyPanel');
    if(panel){panel.classList.add('open');panel.setAttribute('aria-hidden','false')}
    selectHistoryTab('ai');
  }

  function renderAiHistory(){
    ensureHistoryUI();
    const root=document.getElementById('ruAiHistoryView');
    if(!root)return;
    const items=Array.isArray(state.history)?state.history:[];
    const ok=items.filter(x=>x&&x.success===true).length;
    const ko=items.filter(x=>x&&x.success===false).length;
    const byRound=[1,2,3].map(n=>items.filter(x=>x&&x.success===true&&Number(x.round)===n).length);
    let html='<div class="ruai-hstats">'+
      '<div class="ruai-hstat"><small>✅ Зашло AI</small><b>'+ok+'</b></div>'+
      '<div class="ruai-hstat"><small>❌ Не зашло</small><b>'+ko+'</b></div>'+
      '<div class="ruai-hstat"><small>Всего AI</small><b>'+(ok+ko)+'</b></div>'+
      '</div>'+
      '<div class="ruai-round-dist"><b>По раундам:</b> 1-й — '+byRound[0]+' · 2-й — '+byRound[1]+' · 3-й — '+byRound[2]+'</div>';
    if(!items.length){
      root.innerHTML=html+'<div class="ruai-empty">Проверенных AI-прогнозов пока нет.</div>';
      return;
    }
    html+='<div class="ruai-history-list">';
    for(const item of items){
      if(!item)continue;
      const success=item.success===true;
      const target=Number(item.target);
      const actual=Number(item.actual);
      const rounds=Array.isArray(item.rounds)?item.rounds:[];
      const maxActual=rounds.length?Math.max(...rounds.map(x=>Number(x.coef)).filter(Number.isFinite)):actual;
      html+='<div class="ruai-hitem '+(success?'ok':'ko')+'">'+
        '<div class="ruai-htop"><span>'+(success?'✅ AI ЗАШЛО':'❌ AI НЕ ЗАШЛО')+'</span><span>'+fmtKyiv(Number(item.at)||Date.now())+'</span></div>'+
        '<div class="ruai-hmain">Прогноз: '+(Number.isFinite(target)?target.toFixed(2):'—')+'X → '+(success?'выпало '+(Number.isFinite(actual)?actual.toFixed(2):'—')+'X':'максимум '+(Number.isFinite(maxActual)?maxActual.toFixed(2):'—')+'X')+'</div>'+
        '<div class="ruai-hsub">'+(success?'Зашло на раунде '+Number(item.round)+'/3':'Не зашло за 3 раунда')+(Number.isFinite(Number(item.confidence))?' · уверенность '+Math.round(Number(item.confidence))+'%':'')+'</div>';
      if(rounds.length){
        html+='<div class="ruai-mini-rounds">';
        for(const rr of rounds){
          const rn=Number(rr.round),cv=Number(rr.coef),hit=success&&rn===Number(item.round);
          html+='<span class="ruai-mini '+(hit?'hit':'')+'">R'+rn+': '+(Number.isFinite(cv)?cv.toFixed(2):'—')+'X</span>';
        }
        html+='</div>';
      }
      html+='</div>';
    }
    html+='</div>';
    root.innerHTML=html;
  }

  function renderToggle(){
    const b=document.getElementById('ruAiToggle'),d=document.getElementById('ruAiDot');
    if(!b||!d)return;
    b.textContent=state.enabled?'AI: ВКЛ':'AI: ВЫКЛ';
    b.classList.toggle('on',state.enabled);d.classList.toggle('on',state.enabled);
  }
  function renderKey(){
    const h=document.getElementById('ruAiKeyHint');
    if(h)h.textContent=state.apiKey?'✅ Ключ сохранён на этом устройстве.':'Ключ не сохранён — будет работать локальная AI-логика.';
  }
  function renderCounts(){
    const a=document.getElementById('ruAiOk'),b=document.getElementById('ruAiKo');
    if(a)a.textContent=String(state.counts?.ok||0);if(b)b.textContent=String(state.counts?.ko||0);
  }
  function resetRounds(){
    for(let i=1;i<=3;i++){const e=document.getElementById('ruAiR'+i);if(e){e.className='ruai-round';e.textContent=i+'/3 —'}}
  }
  function setStatus(text,kind='wait'){
    const e=document.getElementById('ruAiStatus');if(!e)return;
    e.textContent=text;e.className='ruai-status '+kind;
  }
  function renderCycle(){
    const c=state.cycle;if(!c)return;
    document.getElementById('ruAiTarget').textContent=Number(c.target).toFixed(2)+'X';
    document.getElementById('ruAiTime').textContent=c.displayAt?fmtKyiv(c.displayAt):'—';
    document.getElementById('ruAiConf').textContent=Math.round(c.confidence)+'%';
    document.getElementById('ruAiReason').textContent=c.reason||'Статистический AI-анализ истории.';
  }

  async function fetchRows(limit=30,force=true){
    const api=window.LuckyJetRU;
    if(!api||typeof api.getRecentRows!=='function')throw new Error('основная логика ещё не готова');
    const rows=await api.getRecentRows(limit,force);
    return normalizeRows(rows);
  }

  async function modelAdjust(cycle,rows){
    if(!state.apiKey||state.aiBusy||cycle.frozen)return;
    state.aiBusy=true;
    const id=cycle.id;
    try{
      const chronological=rows.slice().reverse().map(x=>x.coef);
      const prompt=[
        'Ты анализируешь только статистику завершённых раундов LuckyJet.',
        'Коэффициенты от старых к новым: '+chronological.join(', '),
        'Основная страница уже разрешила сигнал по своим условиям.',
        'Основная цель: '+cycle.mainTarget.toFixed(2)+'X.',
        'Локальный AI расчёт: '+cycle.target.toFixed(2)+'X, диапазон '+cycle.low.toFixed(2)+'-'+cycle.high.toFixed(2)+'X.',
        'Сделай независимую оценку по медиане, EMA, волатильности, доле низких результатов и последовательности.',
        'Верни только JSON: {"target":2.10,"confidence":64,"reason":"короткая причина"}.',
        'target 1.10-8.00, confidence 20-88. Не утверждай, что будущий результат известен.'
      ].join('\n');
      const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+AI_MODEL+':generateContent?key='+encodeURIComponent(state.apiKey),{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          contents:[{role:'user',parts:[{text:prompt}]}],
          generationConfig:{temperature:.25,responseMimeType:'application/json'}
        })
      });
      if(!r.ok)throw new Error('AI HTTP '+r.status);
      const data=await r.json();
      const raw=data?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim()||'';
      const p=JSON.parse(raw);
      if(!state.cycle||state.cycle.id!==id||state.cycle.frozen)return;
      let t=Number(p.target),cf=Number(p.confidence);
      if(!Number.isFinite(t)||!Number.isFinite(cf))throw new Error('неверный ответ AI');
      const local=state.cycle.target,maxDelta=Math.max(.35,local*.50);
      t=clamp(t,Math.max(1.10,local-maxDelta),Math.min(8,local+maxDelta));
      state.cycle.target=Number(t.toFixed(2));
      state.cycle.confidence=Math.round(clamp(cf,20,88));
      state.cycle.reason='AI: '+String(p.reason||state.cycle.reason).slice(0,220);
      renderCycle();
    }catch(e){
      document.getElementById('ruAiReason').textContent=(state.cycle?.reason||'')+' · AI API: '+(e?.message||e);
    }finally{state.aiBusy=false}
  }

  async function onMainSignal(detail){
    if(!state.enabled)return;
    clearVerify();resetRounds();
    try{
      const rows=await fetchRows(30,true);
      const local=localAi(rows,Number(detail?.target));
      if(!local){setStatus('Недостаточно завершённых раундов для AI.','wait');return}
      state.cycle={
        id:Date.now(),
        target:local.target,low:local.low,high:local.high,confidence:local.confidence,reason:local.reason,
        mainTarget:Number(detail?.target)||local.target,
        displayAt:Number(detail?.displayAt)||Number(detail?.startAt)||Date.now(),
        startAt:Number(detail?.startAt)||Date.now(),
        frozen:false,active:false,checked:0,seen:[],roundValues:[],source:'parallel'
      };
      renderCycle();
      setStatus('AI готов. Условный вход по тому же окну: '+fmtKyiv(state.cycle.displayAt)+'.','wait');
      modelAdjust(state.cycle,rows);
    }catch(e){setStatus('AI не получил историю: '+(e?.message||e),'bad')}
  }

  async function onVerification(detail){
    if(!state.enabled||!state.cycle)return;
    state.cycle.frozen=true;state.cycle.active=true;state.cycle.checked=0;state.cycle.roundValues=[];
    if(Number(detail?.displayAt))state.cycle.displayAt=Number(detail.displayAt);
    renderCycle();resetRounds();
    setStatus('СЕЙЧАС — началась проверка AI. Следующие 3 завершённых раунда.','go');
    try{
      const rows=await fetchRows(10,true);
      state.cycle.seen=rows.map(x=>x.id);
    }catch(_){state.cycle.seen=[]}
    clearVerify();
    state.verifyTimer=setInterval(verifyPoll,POLL_MS);
  }

  async function verifyPoll(){
    const c=state.cycle;
    if(!state.enabled||!c||!c.active)return;
    try{
      const rows=await fetchRows(10,true);
      const seen=new Set(c.seen||[]);
      const fresh=rows.filter(r=>!seen.has(r.id)).reverse();
      for(const r of fresh){
        if(!state.cycle||!state.cycle.active)break;
        state.cycle.seen.push(r.id);
        state.cycle.checked+=1;
        const n=state.cycle.checked;
        state.cycle.roundValues=Array.isArray(state.cycle.roundValues)?state.cycle.roundValues:[];
        state.cycle.roundValues.push({round:n,coef:Number(r.coef.toFixed(2)),id:r.id});
        if(n>3)break;
        const hit=r.coef>=state.cycle.target;
        const el=document.getElementById('ruAiR'+n);
        if(el){el.textContent=n+'/3 '+r.coef.toFixed(2)+'X';el.classList.add(hit?'hit':'miss')}
        if(hit){finishAi(true,n,r.coef);break}
        if(n>=3){finishAi(false,n,r.coef);break}
      }
    }catch(e){setStatus('AI продолжает проверку: временно нет обновления истории.','wait')}
  }

  function finishAi(success,round,actual){
    const c=state.cycle;if(!c)return;
    clearVerify();c.active=false;c.finished=true;
    state.counts=state.counts||{ok:0,ko:0};
    if(success)state.counts.ok=(state.counts.ok||0)+1;else state.counts.ko=(state.counts.ko||0)+1;
    state.history=Array.isArray(state.history)?state.history:[];
    state.history.unshift({
      target:Number(c.target),
      confidence:Number(c.confidence),
      success:Boolean(success),
      round:Number(round),
      actual:Number(actual),
      rounds:Array.isArray(c.roundValues)?c.roundValues.slice(0,3):[],
      at:Date.now()
    });
    state.history=state.history.slice(0,50);save();renderCounts();renderAiHistory();
    setStatus(success?'✅ AI цель '+c.target.toFixed(2)+'X достигнута на раунде '+round+'.':'❌ AI цель '+c.target.toFixed(2)+'X не достигнута за 3 раунда.',success?'go':'bad');
    setTimeout(()=>{if(state.cycle===c&&!c.active)state.cycle=null},6000);
  }
  function clearVerify(){if(state.verifyTimer)clearInterval(state.verifyTimer);state.verifyTimer=null}

  function onCancel(){clearVerify();state.cycle=null;resetRounds();setStatus('Сигнал отменён. AI ждёт новые условия.','wait')}
  function onMainResult(){/* AI continues its own 3-round check if necessary. */}

  function autoScan(){
    if(!state.enabled)return;
    const api=window.LuckyJetRU;
    if(!api||typeof api.getState!=='function'||typeof api.generateSignal!=='function')return;
    const s=api.getState();
    if(s&&s.active)return;
    if(state.cycle&&state.cycle.active)return;
    const now=Date.now();if(now-state.lastAutoTry<AUTO_SCAN_MS-500)return;
    state.lastAutoTry=now;
    api.generateSignal();
  }

  function boot(){
    ui();
    window.addEventListener('luckyjetru:signal',e=>onMainSignal(e.detail||{}));
    window.addEventListener('luckyjetru:verification',e=>onVerification(e.detail||{}));
    window.addEventListener('luckyjetru:cancel',onCancel);
    window.addEventListener('luckyjetru:result',onMainResult);
    document.getElementById('openHistory')?.addEventListener('click',()=>{ensureHistoryUI();renderAiHistory()});
    setInterval(autoScan,AUTO_SCAN_MS);
    renderCounts();
    setStatus(state.enabled?'AI включён. Жду условия основной логики страницы.':'AI выключен.','wait');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
