/* LuckyJet BeeAI overlay — HTML adaptation of the BeeAI interaction pattern.
   Statistical analysis only; it does not know a future server-side game result. */
(() => {
  'use strict';

  const API_URL = 'https://crash-gateway-grm-cr.100hp.app/history';
  const API_HEADERS = {
    'customer-id': '077dee8d-c923-4c02-9bee-757573662e69',
    'session-id': 'ceab7738-1e49-4ed1-8d92-751b22e958cd',
    'accept': 'application/json'
  };
  const STORE = {
    settings: 'lj_beeai_settings_v1',
    rounds: 'lj_beeai_rounds_v1',
    predictions: 'lj_beeai_predictions_v1'
  };
  const MAX_ROUNDS = 200;
  const MIN_ROUNDS = 8;
  const POLL_MS = 4500;

  const state = {
    rounds: load(STORE.rounds, []),
    predictions: load(STORE.predictions, []),
    settings: Object.assign({
      auto: true,
      geminiKey: '',
      role: 'Ты аналитик LuckyJet. Объясняй расчёт кратко, по-русски, без обещаний гарантированного результата.',
      knowledge: 'Используй только переданные коэффициенты и статистику. Не выдумывай будущий исход.'
    }, load(STORE.settings, {})),
    open: false,
    polling: false,
    lastKey: '',
    touchTimer: 0,
    aiBusy: false
  };

  function load(key, fallback){
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; }
    catch (_) { return fallback; }
  }
  function save(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function num(v){
    if(typeof v==='string') v=v.replace(/x/ig,'').replace(',','.').trim();
    const n=Number(v); return Number.isFinite(n)&&n>=1?n:null;
  }
  function coefOf(row){
    if(!row||typeof row!=='object') return null;
    let v=row.coef ?? row.crash ?? row.value ?? row.topCoefficient ?? row.multiplier ?? row.coefficient;
    if(v==null && Array.isArray(row.finalValues) && row.finalValues.length) v=row.finalValues[0];
    const n=num(v); return n==null?null:Number((n===1?1.01:n).toFixed(2));
  }
  function timeOf(row){
    const raw=row?.timestamp ?? row?.round_timestamp ?? row?.played_at ?? row?.created_at ?? row?.createdAt ?? row?.time ?? row?.stateChangedAt ?? row?.endedAt ?? row?.updatedAt;
    if(raw==null) return 0;
    if(typeof raw==='number') return raw<1e11?raw*1000:raw;
    const n=Number(raw); if(Number.isFinite(n)) return n<1e11?n*1000:n;
    const t=Date.parse(raw); return Number.isFinite(t)?t:0;
  }
  function idOf(row,coef,index){
    return String(row?.id ?? row?.roundId ?? row?.round_id ?? row?.gameId ?? row?.hash ?? (timeOf(row)||('c:'+coef+':'+index)));
  }
  function rowsOf(data){
    if(Array.isArray(data)) return data;
    for(const k of ['history','rounds','data','items','results']){
      if(Array.isArray(data?.[k])) return data[k];
    }
    return data && typeof data==='object' ? [data] : [];
  }
  function mergePayload(data){
    const rows=rowsOf(data);
    if(!rows.length) return 0;
    const normalized=rows.slice(0,100).map((row,index)=>{
      const coef=coefOf(row); if(coef==null) return null;
      return { id:idOf(row,coef,index), coef, ts:timeOf(row)||0 };
    }).filter(Boolean);
    // /history is newest-first on this source. Store chronologically.
    const old=new Map(state.rounds.map(r=>[String(r.id),r]));
    let added=0;
    for(const r of normalized.slice().reverse()){
      const key=String(r.id);
      if(!old.has(key)){ old.set(key,r); added++; }
      else if(r.ts && !old.get(key).ts) old.set(key,r);
    }
    state.rounds=[...old.values()].sort((a,b)=>{
      if(a.ts&&b.ts) return a.ts-b.ts;
      return 0;
    }).slice(-MAX_ROUNDS);
    save(STORE.rounds,state.rounds);
    if(normalized[0]) state.lastKey=String(normalized[0].id);
    return added;
  }

  function mean(a){ return a.length?a.reduce((s,x)=>s+x,0)/a.length:0; }
  function median(a){
    if(!a.length) return 0;
    const s=[...a].sort((a,b)=>a-b),m=s.length>>1;
    return s.length%2?s[m]:(s[m-1]+s[m])/2;
  }
  function quantile(a,p){
    if(!a.length) return 0;
    const s=[...a].sort((a,b)=>a-b),i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
    return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(i-lo);
  }
  function ema(a,period){
    if(!a.length) return 0;
    const k=2/(period+1); let e=a[0];
    for(let i=1;i<a.length;i++) e=a[i]*k+e*(1-k);
    return e;
  }
  function std(a){
    if(a.length<2) return 0;
    const m=mean(a); return Math.sqrt(mean(a.map(x=>(x-m)**2)));
  }
  function analyze(){
    const values=state.rounds.slice(-40).map(r=>r.coef).filter(Number.isFinite);
    if(values.length<MIN_ROUNDS) return null;
    const recent=values.slice(-20);
    const last8=values.slice(-8);
    const med=median(recent);
    const q35=quantile(recent,.35);
    const e5=ema(recent,5);
    const e12=ema(recent,12);
    const sigma=std(recent);
    const lowRatio=recent.filter(x=>x<1.5).length/recent.length;
    const highRatio=recent.filter(x=>x>=5).length/recent.length;
    const trend=(e5-e12)/Math.max(.01,e12);

    // Robust target: deliberately downweights huge outliers.
    let target=q35*.45+med*.30+e5*.15+e12*.10;
    if(lowRatio>.55) target*=.88;
    if(trend>.12) target*=1.06;
    if(trend<-.12) target*=.94;
    target=clamp(target,1.15,8);

    const stability=1-clamp(sigma/Math.max(2,med*2.5),0,1);
    const sampleScore=clamp(values.length/30,0,1);
    const score=Math.round(clamp(42+stability*24+sampleScore*14+(Math.abs(trend)<.12?8:3)-(highRatio>.2?4:0),35,88));
    const spread=clamp(sigma*.35,.18,2.2);
    const low=clamp(target-spread,1.01,50);
    const high=clamp(target+spread,1.05,50);
    return {
      target:Number(target.toFixed(2)),
      low:Number(low.toFixed(2)),
      high:Number(high.toFixed(2)),
      score,
      sample:values.length,
      median:Number(med.toFixed(2)),
      ema5:Number(e5.toFixed(2)),
      ema12:Number(e12.toFixed(2)),
      lowRatio,
      trend,
      sigma:Number(sigma.toFixed(2)),
      last:last8
    };
  }

  function createPrediction(source='manual'){
    const a=analyze();
    if(!a){ setMessage('Нужно минимум '+MIN_ROUNDS+' завершённых раундов. Сейчас: '+state.rounds.length,'warn'); return null; }
    const p={...a,id:Date.now(),at:Date.now(),source,status:'open'};
    state.predictions.unshift(p);
    state.predictions=state.predictions.slice(0,50);
    save(STORE.predictions,state.predictions);
    renderPrediction(p);
    setMessage('Статистическая оценка сформирована по завершённым раундам. Будущий серверный результат неизвестен.','ok');
    return p;
  }

  async function fetchHistory(){
    if(state.polling) return;
    state.polling=true;
    try{
      const r=await fetch(API_URL,{headers:API_HEADERS,cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const data=await r.json();
      const added=mergePayload(data);
      setSource('LIVE /history','ok');
      renderRounds();
      if(added>0 && state.settings.auto) createPrediction('auto');
    }catch(e){
      setSource('API '+(e?.message||'offline'),'bad');
    }finally{ state.polling=false; }
  }

  function injectStyle(){
    if(document.getElementById('ljBeeAiStyle')) return;
    const s=document.createElement('style'); s.id='ljBeeAiStyle';
    s.textContent=`
#ljBeeAiFab{position:fixed;z-index:99970;right:16px;bottom:calc(82px + env(safe-area-inset-bottom));width:52px;height:52px;border:1px solid rgba(255,255,255,.18);border-radius:50%;background:linear-gradient(145deg,#111827,#312e81);color:#fff;box-shadow:0 12px 28px rgba(0,0,0,.45),0 0 22px rgba(99,102,241,.28);font-size:23px;display:grid;place-items:center;padding:0}
#ljBeeAiOverlay{position:fixed;z-index:99980;inset:0;background:rgba(4,7,13,.78);backdrop-filter:blur(12px);display:none;align-items:flex-end;justify-content:center;padding:12px}
#ljBeeAiOverlay.open{display:flex}
#ljBeeAiCard{width:min(640px,100%);max-height:88dvh;overflow:auto;background:#0b1018;color:#fff;border:1px solid rgba(255,255,255,.13);border-radius:28px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.7)}
.ljba-head{display:flex;align-items:center;gap:12px}.ljba-logo{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:#151b27;border:1px solid rgba(255,255,255,.12);font-size:22px}.ljba-title{font-size:20px;font-weight:900}.ljba-sub{font-size:11px;opacity:.62;margin-top:2px}.ljba-close{margin-left:auto!important;width:40px!important;height:40px!important;border-radius:50%!important;background:#1d2430!important;box-shadow:none!important;font-size:20px!important}
.ljba-source{margin-top:14px;padding:9px 12px;border-radius:13px;background:#111824;border:1px solid rgba(255,255,255,.1);font-size:12px;font-weight:800}.ljba-source.ok{color:#34d399}.ljba-source.bad{color:#fb7185}
.ljba-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.ljba-stat{background:#111824;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:10px;text-align:center}.ljba-stat small{display:block;font-size:10px;opacity:.55}.ljba-stat b{display:block;margin-top:4px;font-size:16px}
#ljbaPrediction{margin-top:12px;padding:16px;border-radius:20px;background:radial-gradient(circle at 50% 0,rgba(99,102,241,.28),transparent 55%),#101624;border:1px solid rgba(129,140,248,.24);text-align:center}.ljba-target{font-size:42px;font-weight:1000;color:#86efac;text-shadow:0 0 20px rgba(34,197,94,.2)}.ljba-range{font-size:12px;opacity:.7;margin-top:2px}.ljba-score{margin-top:8px;font-size:13px;font-weight:900}
#ljbaRounds{display:flex;gap:6px;overflow-x:auto;margin-top:12px;padding-bottom:4px}.ljba-chip{flex:0 0 auto;padding:7px 9px;border-radius:10px;background:#151d2b;border:1px solid rgba(255,255,255,.08);font-size:11px;font-weight:900}.ljba-chip.hi{color:#fde68a}.ljba-chip.lo{color:#fda4af}
.ljba-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.ljba-actions button{width:100%!important;height:46px!important;border-radius:14px!important}.ljba-auto.on{background:linear-gradient(135deg,#10b981,#047857)!important}
#ljbaMessage{font-size:11px;line-height:1.4;opacity:.78;margin-top:10px;min-height:16px}.ljba-warn{color:#fbbf24}.ljba-ok{color:#86efac}
.ljba-details{margin-top:14px;border-top:1px solid rgba(255,255,255,.09);padding-top:12px}.ljba-details summary{cursor:pointer;font-weight:900;font-size:13px}.ljba-field{margin-top:10px}.ljba-field label{display:block;font-size:10px;opacity:.62;margin-bottom:5px}.ljba-field input,.ljba-field textarea{width:100%;background:#111824;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;font:inherit}.ljba-field textarea{min-height:70px;resize:vertical}
#ljbaAskGemini{width:100%!important;margin-top:10px;height:44px!important;border-radius:14px!important;background:linear-gradient(135deg,#7c3aed,#4338ca)!important}.ljba-aianswer{margin-top:10px;padding:11px;border-radius:12px;background:#111824;font-size:12px;line-height:1.5;white-space:pre-wrap}
@media(max-width:430px){#ljBeeAiCard{border-radius:24px 24px 18px 18px;padding:15px}.ljba-target{font-size:36px}.ljba-grid{gap:6px}.ljba-stat{padding:8px 4px}}
`;
    document.head.appendChild(s);
  }

  function injectUI(){
    if(document.getElementById('ljBeeAiOverlay')) return;
    injectStyle();
    const fab=document.createElement('button');
    fab.id='ljBeeAiFab'; fab.type='button'; fab.title='LuckyJet AI'; fab.textContent='🤖';
    const overlay=document.createElement('div'); overlay.id='ljBeeAiOverlay';
    overlay.innerHTML=`
<div id="ljBeeAiCard" role="dialog" aria-modal="true" aria-label="LuckyJet AI">
  <div class="ljba-head">
    <div class="ljba-logo">🤖</div>
    <div><div class="ljba-title">LuckyJet AI</div><div class="ljba-sub">BeeAI-style • LIVE statistical analysis</div></div>
    <button class="ljba-close" id="ljbaClose" type="button">×</button>
  </div>
  <div class="ljba-source" id="ljbaSource">Подключение к /history…</div>
  <div class="ljba-grid">
    <div class="ljba-stat"><small>Последний</small><b id="ljbaLast">—</b></div>
    <div class="ljba-stat"><small>Раундов</small><b id="ljbaCount">0</b></div>
    <div class="ljba-stat"><small>Оценка</small><b id="ljbaConf">—</b></div>
  </div>
  <div id="ljbaPrediction">
    <div style="font-size:11px;opacity:.62;font-weight:900;letter-spacing:1px">СТАТИСТИЧЕСКАЯ ОЦЕНКА ПО ИСТОРИИ</div>
    <div class="ljba-target" id="ljbaTarget">—</div>
    <div class="ljba-range" id="ljbaRange">Сначала собираю завершённые раунды</div>
    <div class="ljba-score" id="ljbaStats"></div>
  </div>
  <div id="ljbaRounds"></div>
  <div class="ljba-actions">
    <button type="button" id="ljbaPredict">АНАЛИЗ AI</button>
    <button type="button" id="ljbaAuto" class="ljba-auto">АВТО: ВЫКЛ</button>
  </div>
  <div id="ljbaMessage">Долгое нажатие двумя пальцами в любом месте страницы снова открывает этот экран.</div>
  <details class="ljba-details">
    <summary>BeeAI • настройки ИИ</summary>
    <div class="ljba-field"><label>AI API key (хранится только в этом браузере)</label><input id="ljbaKey" type="password" autocomplete="off" placeholder="AIza…"></div>
    <div class="ljba-field"><label>Роль и стиль ИИ</label><textarea id="ljbaRole"></textarea></div>
    <div class="ljba-field"><label>База знаний</label><textarea id="ljbaKnowledge"></textarea></div>
    <button type="button" id="ljbaAskGemini">AI АНАЛИЗ ИСТОРИИ</button>
    <div class="ljba-aianswer" id="ljbaAiAnswer" style="display:none"></div>
  </details>
  <div style="margin-top:12px;font-size:9px;opacity:.45;text-align:center">История коэффициентов не позволяет достоверно знать будущий серверный результат. Показана статистическая оценка.</div>
</div>`;
    document.body.append(fab,overlay);
    fab.addEventListener('click',open);
    overlay.addEventListener('click',e=>{ if(e.target===overlay) close(); });
    document.getElementById('ljbaClose').onclick=close;
    document.getElementById('ljbaPredict').onclick=()=>createPrediction('manual');
    document.getElementById('ljbaAuto').onclick=()=>{
      state.settings.auto=!state.settings.auto; save(STORE.settings,state.settings); renderAuto();
      setMessage(state.settings.auto?'Автоанализ включён: новый расчёт после каждого нового завершённого раунда.':'Автоанализ выключен.','ok');
    };
    const key=document.getElementById('ljbaKey'),role=document.getElementById('ljbaRole'),knowledge=document.getElementById('ljbaKnowledge');
    key.value=state.settings.geminiKey||''; role.value=state.settings.role||''; knowledge.value=state.settings.knowledge||'';
    const persistSettings=()=>{
      state.settings.geminiKey=key.value.trim(); state.settings.role=role.value; state.settings.knowledge=knowledge.value;
      save(STORE.settings,state.settings);
    };
    key.addEventListener('change',persistSettings); role.addEventListener('change',persistSettings); knowledge.addEventListener('change',persistSettings);
    document.getElementById('ljbaAskGemini').onclick=async()=>{ persistSettings(); await askGemini(); };
    renderAuto(); renderRounds();
  }

  function open(){ state.open=true; document.getElementById('ljBeeAiOverlay')?.classList.add('open'); renderRounds(); }
  function close(){ state.open=false; document.getElementById('ljBeeAiOverlay')?.classList.remove('open'); }
  function setSource(text,kind=''){ const el=document.getElementById('ljbaSource'); if(!el)return; el.textContent=text; el.className='ljba-source '+kind; }
  function setMessage(text,kind=''){ const el=document.getElementById('ljbaMessage'); if(!el)return; el.textContent=text; el.className=kind==='ok'?'ljba-ok':kind==='warn'?'ljba-warn':''; }
  function renderAuto(){ const el=document.getElementById('ljbaAuto'); if(!el)return; el.textContent=state.settings.auto?'АВТО: ВКЛ':'АВТО: ВЫКЛ'; el.classList.toggle('on',state.settings.auto); }
  function renderRounds(){
    const last=state.rounds[state.rounds.length-1];
    const lastEl=document.getElementById('ljbaLast'),count=document.getElementById('ljbaCount'),box=document.getElementById('ljbaRounds');
    if(lastEl) lastEl.textContent=last?last.coef.toFixed(2)+'X':'—';
    if(count) count.textContent=String(state.rounds.length);
    if(box) box.innerHTML=state.rounds.slice(-12).reverse().map(r=>'<span class="ljba-chip '+(r.coef<1.5?'lo':r.coef>=5?'hi':'')+'">'+r.coef.toFixed(2)+'X</span>').join('');
    const a=analyze(); if(a && !state.predictions.length) renderPreview(a);
  }
  function renderPreview(a){
    const target=document.getElementById('ljbaTarget'),range=document.getElementById('ljbaRange'),conf=document.getElementById('ljbaConf'),stats=document.getElementById('ljbaStats');
    if(target) target.textContent=a.target.toFixed(2)+'X';
    if(range) range.textContent='Ориентир '+a.low.toFixed(2)+'–'+a.high.toFixed(2)+'X';
    if(conf) conf.textContent=a.score+'/100';
    if(stats) stats.textContent='Median '+a.median.toFixed(2)+' • EMA5 '+a.ema5.toFixed(2)+' • EMA12 '+a.ema12.toFixed(2)+' • σ '+a.sigma.toFixed(2);
  }
  function renderPrediction(p){ renderPreview(p); }

  async function askGemini(){
    const key=state.settings.geminiKey;
    const out=document.getElementById('ljbaAiAnswer');
    if(!key){ setMessage('Добавь AI API key в настройках.','warn'); return; }
    const a=state.predictions[0]||createPrediction('gemini');
    if(!a) return;
    if(state.aiBusy)return; state.aiBusy=true;
    const btn=document.getElementById('ljbaAskGemini'); if(btn)btn.disabled=true;
    if(out){out.style.display='block';out.textContent='AI анализирует историю…';}
    try{
      const recent=state.rounds.slice(-20).map(r=>r.coef.toFixed(2)+'x').join(', ');
      const prompt='Последние коэффициенты LuckyJet: '+recent+'\nРасчёт модели: '+a.target.toFixed(2)+'x, ориентир '+a.low.toFixed(2)+'–'+a.high.toFixed(2)+'x, оценка стабильности '+a.score+'/100.\n'+(state.settings.knowledge||'')+'\nОбъясни в 3–5 коротких предложениях текущие тенденции, волатильность и статистический ориентир по истории. Не утверждай, что будущий исход известен и не давай команды на ставку.';
      const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(key),{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({system_instruction:{parts:[{text:state.settings.role}]},contents:[{role:'user',parts:[{text:prompt}]}]})
      });
      if(!r.ok) throw new Error('Gemini HTTP '+r.status);
      const data=await r.json();
      const text=data?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('\n').trim()||'Нет ответа.';
      if(out)out.textContent=text;
    }catch(e){ if(out)out.textContent='Ошибка AI: '+(e?.message||e); }
    finally{state.aiBusy=false;if(btn)btn.disabled=false}
  }

  // BeeAI-style two-finger long press.
  function setupGesture(){
    document.addEventListener('touchstart',e=>{
      if(e.touches&&e.touches.length===2){
        clearTimeout(state.touchTimer);
        state.touchTimer=setTimeout(()=>{ if(e.touches?.length===2) open(); },650);
      }
    },{passive:true});
    const cancel=()=>{clearTimeout(state.touchTimer);state.touchTimer=0};
    document.addEventListener('touchend',cancel,{passive:true});
    document.addEventListener('touchcancel',cancel,{passive:true});
    document.addEventListener('touchmove',e=>{ if(!e.touches||e.touches.length!==2)cancel(); },{passive:true});
  }

  // Also consume the shared live bridge if present.
  if(typeof window.addEventListener==='function'){
    window.addEventListener('liveCoefficient',e=>{
      const d=e.detail;
      if(!d||d.game!=='lucky-jet')return;
      const before=state.rounds.length;
      if(d.payload)mergePayload(d.payload);
      else if(Number.isFinite(Number(d.coef))){
        const c=Number(d.coef),id='event:'+Date.now()+':'+c;
        state.rounds.push({id,coef:c,ts:Date.now()});state.rounds=state.rounds.slice(-MAX_ROUNDS);save(STORE.rounds,state.rounds);
      }
      setSource('LIVE • shared bridge','ok');renderRounds();
      if(state.settings.auto&&state.rounds.length>before)createPrediction('auto');
    });
  }

  function boot(){
    injectUI(); setupGesture(); fetchHistory(); setInterval(fetchHistory,POLL_MS);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
