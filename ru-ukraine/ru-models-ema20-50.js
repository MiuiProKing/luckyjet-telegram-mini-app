/* Separate RU model layer: EMA20 + EMA50. Existing index.html is untouched. */
(function () {
  'use strict';
  const CFG = { minHistory: 20, emaFast: 20, emaSlow: 50, madWindow: 20, bigThreshold: 10, safeTarget: 2.0, turboTarget: 3.0 };
  const $ = s => document.querySelector(s);
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  const mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
  const median = a => { if(!a.length) return 0; const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2); return b.length%2?b[m]:(b[m-1]+b[m])/2; };
  const ema = (a,n) => { if(!a.length)return 0; const k=2/(n+1); let e=a[0]; for(let i=1;i<a.length;i++) e=a[i]*k+e*(1-k); return e; };
  const mad = a => { const m=median(a); return mean(a.map(x=>Math.abs(x-m))); };
  function history(){ return [...document.querySelectorAll('.recent-coef')].map(el=>parseFloat(String(el.textContent).replace(',','.').replace(/x/i,''))).filter(Number.isFinite).slice(-50); }
  function model(h){
    if(h.length<CFG.minHistory)return {ready:false};
    const fast=ema(h,CFG.emaFast), slow=ema(h,CFG.emaSlow), vol=mad(h.slice(-CFG.madWindow)), med=median(h.slice(-CFG.madWindow));
    const lows=h.slice(-8).filter(x=>x<2).length;
    let roundsSinceBig=0; for(let i=h.length-1;i>=0;i--){if(h[i]>=CFG.bigThreshold)break; roundsSinceBig++;}
    const trend=clamp((fast-slow)/Math.max(.01,slow),-1,1);
    const stability=clamp(1-vol/Math.max(.5,med*.8),0,1);
    const pressure=clamp(lows/8,0,1);
    const cooldown=clamp(roundsSinceBig/18,0,1);
    const agreement=clamp(.38*(trend>-.10?1:0)+.28*stability+.20*pressure+.14*cooldown,0,1);
    let state='ЖДАТЬ',reason='EMA20/50 и остальные признаки не согласованы';
    if(agreement>=.72&&stability>=.55&&trend>=-.08){state='МОЖНО СТАВИТЬ';reason='EMA20/50 + MAD + давление низких раундов согласованы';}
    else if(agreement>=.56){state='ОСТОРОЖНО';reason='есть частичное совпадение признаков';}
    return {ready:true,confidence:Math.round(agreement*100),state,reason,fast,slow,vol,med,lows,roundsSinceBig,target:state==='МОЖНО СТАВИТЬ'?(agreement>=.84?CFG.turboTarget:CFG.safeTarget):null};
  }
  function mount(){
    if(document.getElementById('ru-model-ema20-50'))return;
    const status=$('.status'); if(!status)return;
    const box=document.createElement('div'); box.id='ru-model-ema20-50'; box.setAttribute('aria-live','polite');
    box.style.cssText='min-height:20px;margin-top:2px;font-size:12px;font-weight:800;text-align:center;opacity:.95;'; status.insertAdjacentElement('afterend',box);
    const render=()=>{const m=model(history()); if(!m.ready){box.textContent='RU EMA20/50: сбор истории…';box.style.color='';return;} const target=m.target?` • цель ${m.target.toFixed(2)}x`:''; box.textContent=`КОГДА СТАВИТЬ: ${m.state} • ${m.confidence}%${target}`; box.title=`${m.reason}. EMA20 ${m.fast.toFixed(2)} / EMA50 ${m.slow.toFixed(2)}, MAD ${m.vol.toFixed(2)}, BIG: ${m.roundsSinceBig} раундов.`; box.style.color=m.state==='МОЖНО СТАВИТЬ'?'#10b981':(m.state==='ОСТОРОЖНО'?'#f59e0b':'#ef4444');};
    render(); new MutationObserver(render).observe(document.body,{subtree:true,childList:true,characterData:true}); setInterval(render,1500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();