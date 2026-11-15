// ==UserScript==
// @name         GOD PREDITOR BAYES AIM 1.1 — Round Watch
// @namespace    miuiproking-round-watch
// @version      1.1.0
// @description  Отслеживание фаз Lucky Jet и коэффициента; без реальных ставок
// @match        https://one-vv1935.com/casino/play/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(()=>{'use strict';if(window.__godRoundWatch)return;window.__godRoundWatch=true;
const box=document.createElement('section');box.style.cssText='position:fixed;bottom:15px;right:10px;z-index:2147483647;background:#100821;color:#fff;border:1px solid #9b48f7;border-radius:15px;padding:12px;width:280px;box-shadow:0 0 30px #7d35f988;font:13px system-ui';box.innerHTML='<b>GOD PREDITOR · ROUND WATCH 1.1</b><p id="gp-phase">Поиск игрового поля…</p><p id="gp-live">X: —</p><label>Цель <input id="gp-target" type="number" min="1.01" step=".01" value="2" style="width:75px"></label><p id="gp-result">Мониторинг без ставок</p><button id="gp-hide">Закрыть</button>';document.body.append(box);
const $=id=>box.querySelector('#'+id);let last='UNKNOWN',lastX=null,hit=false,miss=0;
$('gp-hide').onclick=()=>{clearInterval(timer);box.remove()};
function read(){const nodes=[...document.querySelectorAll('body *')].filter(el=>el.children.length===0&&el.getClientRects().length>0);let wait=false,values=[];for(const el of nodes){const t=(el.textContent||'').trim();if(t.length>90)continue;if(/ожидание следующего раунда/i.test(t))wait=true;const m=t.match(/^(?:x\s*)?(\d{1,5}[.,]\d{2})\s*(?:x|×)?$/i);if(m){const n=Number(m[1].replace(',','.'));if(n>=1&&n<100000){const r=el.getBoundingClientRect();if(r.width>45&&r.height>25)values.push({n,size:r.width*r.height,el})}}}values.sort((a,b)=>b.size-a.size);const flight=values.find(v=>v.el.closest('main,canvas,[class*=game],[class*=Game],[class*=flight],[class*=Flight]'))||values[0];return{phase:wait?'WAITING':flight?'POSSIBLE_FLIGHT':'UNKNOWN',x:wait?null:flight?.n??null}}
function tick(){if(document.hidden)return;const r=read();if(r.phase==='UNKNOWN'){miss++;if(miss<3)return}else miss=0;const phase=r.phase==='UNKNOWN'&&last==='POSSIBLE_FLIGHT'?'ENDED':r.phase;if(phase!==last){if(phase==='POSSIBLE_FLIGHT')hit=false;$('gp-result').textContent=phase==='WAITING'?'Новый раунд ожидается':phase==='POSSIBLE_FLIGHT'?'Возможный полёт: проверь X':'Полёт не обнаружен';last=phase}if(phase==='POSSIBLE_FLIGHT'&&r.x!=null){lastX=r.x;const target=Number($('gp-target').value);if(!hit&&r.x>=target){hit=true;$('gp-result').textContent='Цель '+target+'× достигнута — уведомление, НЕ вывод ставки'}}$('gp-phase').textContent='Фаза: '+({WAITING:'ОЖИДАНИЕ',POSSIBLE_FLIGHT:'ВОЗМОЖНЫЙ ПОЛЁТ',ENDED:'ЗАВЕРШЕНИЕ',UNKNOWN:'НЕ ОПРЕДЕЛЕНО'}[phase]);$('gp-live').textContent='X: '+(r.x==null?'—':r.x.toFixed(2)+'×')+' (проверить вручную)'}
const timer=setInterval(tick,350);tick();
})();