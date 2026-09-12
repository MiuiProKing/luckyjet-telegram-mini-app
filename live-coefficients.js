/* Public read-only live coefficient bridge for LuckyJet / Rocket Queen.
   Uses the existing public gateway and rotates the client session locally when the gateway rejects it.
   It does not bypass authentication or recover private credentials. */
(() => {
  'use strict';
  const STATE_URL='https://crash-gateway-grm-cr.100hp.app/state';
  const CUSTOMER_ID='077dee8d-c923-4c02-9bee-757573662e69';
  const DEFAULT_SESSION='783ee79e-dafc-479e-bf22-834336380cdf';
  const SESSION_KEY='lumorax_live_gateway_session_v2';
  const INTERVAL=1800;
  const MAX_HISTORY=200;
  const HISTORY_KEY='lumorax_live_coefficients_v2';
  const ROTATE_AFTER_ERRORS=2;
  const ROTATE_COOLDOWN=10000;
  let consecutiveErrors=0,lastRotation=0;

  function uuid(){
    if(globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function') return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)});
  }
  function getSession(){try{return localStorage.getItem(SESSION_KEY)||DEFAULT_SESSION}catch(_){return DEFAULT_SESSION}}
  function setSession(session){
    if(!session)return;
    try{localStorage.setItem(SESSION_KEY,session)}catch(_){ }
    try{if(typeof window.setRocketQueenSession==='function')window.setRocketQueenSession(session)}catch(_){ }
    window.dispatchEvent(new CustomEvent('gatewaySessionChanged',{detail:{session}}));
  }
  function rotateSession(reason){
    const now=Date.now();
    if(now-lastRotation<ROTATE_COOLDOWN)return getSession();
    lastRotation=now;
    const next=uuid();
    setSession(next);
    console.debug('[live-coefficients] gateway session rotated:',reason||'error');
    return next;
  }
  function gatewayHeaders(base){
    const h=new Headers(base||{});
    h.set('customer-id',CUSTOMER_ID);
    h.set('session-id',getSession());
    h.set('accept','application/json');
    return h;
  }

  // Replace only the session header for the known public gateway.
  // This also covers LuckyJet's existing hard-coded GATEWAY_HEADERS object.
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    try{
      const url=typeof input==='string'?input:(input&&input.url)||'';
      if(url===STATE_URL){
        return nativeFetch(input,{...init,headers:gatewayHeaders(init.headers||(input&&input.headers))});
      }
    }catch(_){ }
    return nativeFetch(input,init);
  };

  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  function extract(value,out=[]){
    if(value==null)return out;
    if(Array.isArray(value)){value.forEach(v=>extract(v,out));return out}
    if(typeof value!=='object')return out;
    for(const v of [value.coef,value.coefficient,value.multiplier,value.crashPoint,value.crash_point,value.result,value.value]){
      const n=num(v);if(n!=null&&n>=1)out.push(n);
    }
    for(const[k,v]of Object.entries(value)){
      if(/coef|coefficient|multiplier|crash|result|round/i.test(k))extract(v,out);
      else if(Array.isArray(v))extract(v,out);
    }
    return out;
  }
  function roundKey(item){return String(item?.roundId??item?.round_id??item?.id??item?.timestamp??item?.time??'')}
  function parseState(payload){
    if(Array.isArray(payload?.stopCoefficients)&&payload.stopCoefficients.length){
      const n=num(String(payload.stopCoefficients[0]).replace('x','').replace(',','.'));
      if(n!=null&&n>=1)return Number(n.toFixed(2));
    }
    const values=extract(payload,[]);
    return values.length?Number(values[values.length-1].toFixed(2)):null;
  }
  function historyRead(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch(_){return[]}}
  function historyWrite(h){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(-MAX_HISTORY)))}catch(_){} }
  function setText(id,value){const el=document.getElementById(id);if(el&&value!=null)el.textContent=`${Number(value).toFixed(2)}X`}
  function updateUI(coef){
    if(coef==null)return;
    ['multiplier','lastCoef','last-coef','multiplierText','lastCoefficient','latestCoef'].forEach(id=>setText(id,coef));
    document.querySelectorAll('[data-live-coef],[data-last-coef]').forEach(el=>{el.textContent=`${coef.toFixed(2)}X`});
  }
  async function poll(){
    try{
      const r=await nativeFetch(STATE_URL,{headers:gatewayHeaders(),cache:'no-store'});
      if(!r.ok){consecutiveErrors++;if(consecutiveErrors>=ROTATE_AFTER_ERRORS)rotateSession(`HTTP ${r.status}`);return}
      consecutiveErrors=0;
      const payload=await r.json();
      const coef=parseState(payload);
      if(coef==null)return;
      const h=historyRead(),key=roundKey(payload),last=h[h.length-1];
      if(!last||(key&&last.key!==key)||(!key&&Number(last.coef)!==coef)){h.push({key,coef,ts:Date.now()});historyWrite(h)}
      updateUI(coef);
      window.dispatchEvent(new CustomEvent('liveCoefficient',{detail:{game:/rocket/i.test(document.title)?'rocket-queen':'lucky-jet',coef,payload,sessionId:getSession()}}));
    }catch(error){consecutiveErrors++;if(consecutiveErrors>=ROTATE_AFTER_ERRORS)rotateSession(error?.message||'network')}
  }
  function start(){
    if(window.__LIVE_COEFFICIENT_BRIDGE__)return;
    window.__LIVE_COEFFICIENT_BRIDGE__=true;
    try{if(!localStorage.getItem(SESSION_KEY))setSession(DEFAULT_SESSION)}catch(_){ }
    poll();setInterval(poll,INTERVAL);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
