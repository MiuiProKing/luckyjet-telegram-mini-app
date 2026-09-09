/* RU Multi Model v1 — additive layer. Legacy index.html and legacy ema20-50.html remain untouched. */
(function(){'use strict';
const KEY='ru_multimodel_coefficients_v1';
const MAX=2000,$=s=>document.querySelector(s),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=x=>{const n=parseFloat(String(x??'').replace(',','.').replace(/x/ig,''));return Number.isFinite(n)&&n>=1?n:null};
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2};
const mad=a=>{if(!a.length)return 0;const m=median(a);return median(a.map(x=>Math.abs(x-m)))};
const std=a=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))};
const ema=(a,n)=>{if(!a.length)return 0;const k=2/(n+1);let e=a[0];for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e};
const pct=(n,d)=>d?100*n/d:0;
function readDOM(){const a=[...document.querySelectorAll('.recent-coef')].map(e=>num(e.textContent)).filter(Boolean);return a.slice(-MAX)}
function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]').filter(x=>Number.isFinite(x)&&x>=1).slice(-MAX)}catch{return[]}}
function save(a){try{localStorage.setItem(KEY,JSON.stringify(a.slice(-MAX)))}catch{}}
function sync(){const d=readDOM(),old=load();if(d.length){const merged=old.concat(d);const out=[];for(const x of merged){if(out.length===0||Math.abs(out[out.length-1]-x)>1e-9||out.length<d.length)out.push(x)}save(out)}return d.length?load():old}
function streak(a,p){let n=0;for(let i=a.length-1;i>=0;i--){if(p(a[i]))n++;else break}return n}
function gap(a,t){let gaps=[],last=-1;for(let i=0;i<a.length;i++)if(a[i]>=t){if(last>=0)gaps.push(i-last);last=i}return{last:last<0?Infinity:a.length-1-last,avg:mean(gaps),med:median(gaps),mad:mad(gaps),count:gaps.length}}
function model(a){if(a.length<20)return null;const r=[...a].slice(-2000),w20=r.slice(-20),w50=r.slice(-50),w100=r.slice(-100),w200=r.slice(-200),w500=r.slice(-500);
 const e5=ema(r.slice(-50),5),e10=ema(r.slice(-50),10),e20=ema(w100,20),e50=ema(w200,50),e100=ema(w500,100);
 const m20=mad(w20),m50=mad(w50),s50=std(w50),med50=median(w50),avg50=mean(w50);
 const g10=gap(r,10),g20=gap(r,20),g50=gap(r,50),g100=gap(r,100);
 const low8=r.slice(-8).filter(x<2).length, low20=r.slice(-20).filter(x<2).length;
 const rate2=pct(w20.filter(x=>x>=2).length,20),rate5=pct(w50.filter(x=>x>=5).length,50),rate10=pct(w100.filter(x=>x>=10).length,100);
 const trend20=clamp((e20-e50)/Math.max(.01,e50),-1,1),trendFast=clamp((e5-e10)/Math.max(.01,e10),-1,1);
 const stable=clamp(1-m50/Math.max(.5,med50*.8),0,1),lowPressure=low8/8,emaScore=clamp(.5+(trend20*.5)+(trendFast*.15),0,1);
 const big20=clamp((g20.last<20?g20.last/20:1),0,1),big50=clamp((g50.last<50?g50.last/50:1),0,1);
 const consensus=clamp(.28*emaScore+.22*stable+.16*lowPressure+.12*(rate2/100)+.10*big20+.12*big50,0,1);
 const market=consensus>=.72?'HOT':consensus>=.56?'NORMAL':consensus>=.42?'LOW':'CHAOTIC';
 let state=consensus>=.72&&trend20>=-.08&&stable>=.5?'МОЖНО СТАВИТЬ':consensus>=.55?'ОСТОРОЖНО':'ЖДАТЬ';
 let target=state==='МОЖНО СТАВИТЬ'?(consensus>=.84?3:2):null;
 return{n:r.length,e5,e10,e20,e50,e100,m20,m50,s50,med50,avg50,g10,g20,g50,g100,low8,low20,rate2,rate5,rate10,trend20,trendFast,stable,consensus,confidence:Math.round(consensus*100),market,state,target};}
function ensureUI(){if($('#ru-mm-box'))return;const anchor=$('.status')||document.body;const box=document.createElement('section');box.id='ru-mm-box';box.style.cssText='margin:8px auto;width:calc(100% - 12px);max-width:560px;padding:10px;border:1px solid rgba(0,220,255,.28);border-radius:14px;background:rgba(3,8,24,.94);color:#fff;font:800 11px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 0 20px rgba(0,160,255,.12)';box.innerHTML='<div style="font-size:12px;color:#7dd3fc;letter-spacing:1px">MULTI-MODEL MARKET SCANNER</div><div id="mm-main" style="font-size:14px;margin-top:4px">Сбор коэффициентов…</div><div id="mm-ema"></div><div id="mm-stats"></div><div id="mm-big"></div><div id="mm-db" style="color:#94a3b8"></div>';anchor.insertAdjacentElement('afterend',box)}
function render(){ensureUI();const a=sync(),m=model(a);if(!m){$('#mm-main').textContent=`Сбор базы: ${a.length}/20`;return}$('#mm-main').textContent=`РЫНОК: ${m.market} • ${m.state} • ${m.confidence}%${m.target?` • цель ${m.target.toFixed(2)}x`:''}`;$('#mm-main').style.color=m.state==='МОЖНО СТАВИТЬ'?'#10b981':m.state==='ОСТОРОЖНО'?'#f59e0b':'#ef4444';$('#mm-ema').textContent=`EMA 5 ${m.e5.toFixed(2)} • 10 ${m.e10.toFixed(2)} • 20 ${m.e20.toFixed(2)} • 50 ${m.e50.toFixed(2)} • 100 ${m.e100.toFixed(2)}`;$('#mm-stats').textContent=`MAD20 ${m.m20.toFixed(2)} • MAD50 ${m.m50.toFixed(2)} • σ50 ${m.s50.toFixed(2)} • <2x: ${m.low8}/8 • ≥2x: ${m.rate2.toFixed(0)}%`;$('#mm-big').textContent=`BIG: ≥10x ${m.g10.last===Infinity?'—':m.g10.last+' р. назад'} • ≥20x ${m.g20.last===Infinity?'—':m.g20.last+' р. назад'} • ≥50x ${m.g50.last===Infinity?'—':m.g50.last+' р. назад'} • ≥100x ${m.g100.last===Infinity?'—':m.g100.last+' р. назад'}`;$('#mm-db').textContent=`База: ${m.n} коэффициентов • модели: EMA/MAD/σ/частоты/BIG/consensus`}
function boot(){ensureUI();render();new MutationObserver(()=>render()).observe(document.body,{subtree:true,childList:true,characterData:true});setInterval(render,2000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();