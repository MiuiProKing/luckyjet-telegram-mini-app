
(function(){
'use strict';
// Extracted from a publicly served client asset at historique-luckyjet.shop.
// Asset: PredictionPanel-BX01Z_sa.js. Retrieved 2026-10-02.
// Pure calculation functions only; no account credentials or network calls.
const l=6e4,ke=6e4,$=n=>n.length?n.reduce((s,e)=>s+e,0)/n.length:0,I=n=>{if(!n.length)return 0;const s=[...n].sort((o,a)=>o-a),e=Math.floor(s.length/2);return s.length%2?s[e]:(s[e-1]+s[e])/2},ee=n=>{if(n.length<2)return 0;const s=$(n);return Math.sqrt($(n.map(e=>(e-s)**2)))},V=(n,s)=>{if(!n.length)return 0;let e=n[n.length-1];for(let o=n.length-2;o>=0;o--)e=s*n[o]+(1-s)*e;return e},E=n=>{if(!n.length)return 0;const s=n.map(e=>Math.log(Math.max(e,1.001)));return Math.exp($(s))},te=n=>{let s=-1/0;for(const e of n)e>s&&(s=e);return s===-1/0?0:s},ne=n=>{if(n.length<2)return 0;const s=I(n);return I(n.map(e=>Math.abs(e-s)))},d=(n,s,e)=>Math.max(s,Math.min(e,n));function W(n,s){const e=new Map;for(const a of n){const i=s(a),f=e.get(i)??{coefs:[],g:0,mg:0};f.coefs.push(a.coefficient),a.coefficient>=10&&f.g++,a.coefficient>=100&&f.mg++,e.set(i,f)}const o=new Map;for(const[a,i]of e)o.set(a,{count:i.coefs.length,goldenCount:i.g,megaCount:i.mg,avg:E(i.coefs),max:te(i.coefs)});return o}function se(n,s){const e=n.filter(a=>a.coefficient>=s).sort((a,i)=>a.timestamp-i.timestamp);if(e.length<2)return{avgGap:0,medGap:0,stdGap:0,madGap:0,last:e[0]?.timestamp??null,count:e.length};const o=[];for(let a=1;a<e.length;a++)o.push(e[a].timestamp-e[a-1].timestamp);return{avgGap:$(o),medGap:I(o),stdGap:ee(o),madGap:ne(o),last:e[e.length-1].timestamp,count:e.length}}function Ce(n,s){const e=[...n].sort((g,u)=>g.timestamp-u.timestamp),o=[],a=se(e,100);if(a.count>=5&&a.last&&a.medGap>0){const g=a.last+a.medGap,u=g-s,h=d(a.madGap*1.4826||a.medGap*.35,2*l,12*l),p=s-a.last;if(a.madGap>0&&a.madGap<a.medGap*.5&&(Math.abs(u)<=h*.7||p>=a.medGap*.9)){const w=d(1-Math.abs(u)/Math.max(h,1),0,1),q=Math.min(10,a.count),R=d(55+q+w*12,55,82);o.push({expectedAt:u>0?g:s+Math.max(2*l,h*.4),windowMs:d(h,3*l,10*l),estimatedCoef:100,confidence:Math.round(R),reason:`Cycle 100x≈${(a.medGap/l).toFixed(1)}min — dernier il y a ${(p/l).toFixed(1)}min (${a.count} évts)`})}}const i=e.slice(-80);let f=0,m=0;for(const g of i)g.coefficient>=20&&f++,g.coefficient>=50&&m++;if(m>=3&&f>=6){const g=d(55+m*5+f,55,82);o.push({expectedAt:s+3*l,windowMs:6*l,estimatedCoef:120,confidence:Math.round(g),reason:`Cluster chaud : ${f}×≥20x + ${m}×≥50x sur 80 tours`})}const x=e.filter(g=>g.coefficient>=100);if(x.length>=4&&a.last&&e.length>=80){const g=s-a.last,u=e[e.length-1].timestamp-e[0].timestamp,h=u>0?x.length/u:0;if(h>0){const p=1-Math.exp(-h*g);if(p>=.75){const r=d(1/h,9e4,8*l),w=d(50+p*30,50,80);o.push({expectedAt:s+r,windowMs:d(r*.8,3*l,7*l),estimatedCoef:100,confidence:Math.round(w),reason:`Hazard Poisson : P(retard)=${(p*100).toFixed(0)}% (λ⁻¹≈${(1/h/l).toFixed(1)}min)`})}}}if(!o.length)return null;o.sort((g,u)=>u.confidence-g.confidence);const v=o[0];return o.length<2&&v.confidence<75?null:(o.length>=2&&(v.confidence=Math.min(92,v.confidence+5)),v)}function De(n,s){if(n.length<20)return null;const e=Date.now();if(s){const c=Math.max(s.estimatedAt+s.windowMs,s.generatedAt+ke);if(e<c)return s}const o=[...n].sort((c,b)=>b.timestamp-c.timestamp),a=o.map(c=>c.coefficient);$(a);const i=I(a),f=E(a),m=a.slice(0,20),x=a.slice(0,50);$(m);const v=$(x),g=V(m,.25),u=V(x,.12),h=ee(x),p=ne(x),r=se(o,10),w=r.last?e-r.last:1/0,q=W(o,c=>new Date(c.timestamp).getHours()),R=W(o,c=>new Date(c.timestamp).getMinutes()),C=new Date(e),j=q.get(C.getHours()),ae=(C.getMinutes()+2)%60,D=R.get(ae),U=a.slice(0,15),oe=U.length===15&&U.every(c=>c<2),N=o.slice(0,30).filter(c=>c.coefficient>=20),A=Ce(n,e);if(r.medGap>0&&r.last){const b=r.last+r.medGap-e,F=d(r.madGap*1.4826||r.medGap*.55,6e4,4*l),y=r.count>=8&&r.madGap>0&&r.madGap<r.medGap*.6,_=Math.abs(b)<=F*.6;if(y&&_){const Q=N.length,ge=Q>=3?2:Q>=1?3:4,pe=te(o.slice(0,80).map(we=>we.coefficient)),ue=d(pe/ge,2,20),he=d(60-Math.abs(b)/F*15,40,62),be=j&&j.avg>f?3:0,ve=d(r.count/20,0,4),J=Math.round(d(he+be+ve,40,68));return{estimatedCoef:+ue.toFixed(2),confidence:J>=66?"Moyen":"Faible",reliability:J,estimatedAt:b>0?e+Math.max(b,9e4):e+2*l,windowMs:d(r.medGap*.25,9e4,3*l),pattern:"Cycle des cotes d'or détecté",basis:`Cycle médian ${(r.medGap/l).toFixed(1)} min — dernier ${(w/l).toFixed(1)} min — MAD ${(r.madGap/l).toFixed(2)}min`,generatedAt:e,bigOpportunity:A}}}if(oe){const c=d(f*2.5+i,2.5,15),b=Math.round(d(70+Math.min(15,(e-o[14].timestamp)/6e4),65,92));return{estimatedCoef:+c.toFixed(2),confidence:b>=82?"Élevé":"Moyen",reliability:b,estimatedAt:e+9e4,windowMs:2*l,pattern:"Série basse — rebond statistique",basis:`15 tours <2x — moy géo ${f.toFixed(2)}x, médiane ${i.toFixed(2)}x`,generatedAt:e,bigOpportunity:A}}if(N.length>=3){const c=E(N.map(_=>_.coefficient)),b=N.length>=5?3:N.length>=4?4:5,F=d(c/b,2,12),y=Math.min(78,60+N.length*3);return{estimatedCoef:+F.toFixed(2),confidence:y>=72?"Élevé":"Moyen",reliability:y,estimatedAt:e+2*l,windowMs:2.5*l,pattern:`${N.length} cotes ≥20x récentes`,basis:`Moy. géo grosses cotes ${c.toFixed(2)}x ÷ ${b}`,generatedAt:e,bigOpportunity:A}}const P=o.slice(0,60),G=P.filter(c=>c.coefficient>=5&&c.coefficient<10),T=P.length?P.filter(c=>c.coefficient<2).length/P.length:0;if(G.length>=3){const c=E(G.map(_=>_.coefficient)),b=T>.55||h>v*1.4,F=b?d(c*.45,2,4.5):d(c*.7,3,7),y=Math.round(d(64+G.length*4+(b?-6:6),58,90));return{estimatedCoef:+F.toFixed(2),confidence:y>=82?"Élevé":y>=68?"Moyen":"Faible",reliability:y,estimatedAt:e+2*l,windowMs:2.5*l,pattern:b?`Phase mixte — ${G.length} cotes 5x-9x sur base fragile`:`Phase favorable — ${G.length} cotes 5x-9x récentes`,basis:`Zone 5x-9x géo ${c.toFixed(2)}x — <2x: ${(T*100).toFixed(0)}% — σ50 ${h.toFixed(2)}`,generatedAt:e,bigOpportunity:A}}const B=j&&j.count>=5?j.avg/Math.max(f,.1):1,ie=D&&D.count>=5?D.avg/Math.max(f,.1):1,re=g*.5+u*.3+v*.2;let S=d(re*B*.6+(D?.max??0)*.1+1.6,1.8,12);const Z=T>.6||h>v*1.6;Z?S=Math.min(S,3.2):T>.45&&(S=Math.min(S,5));const ce=d(n.length/25,0,28),le=d(Math.abs(B-1)*42,0,22),de=d(Math.abs(ie-1)*32,0,16),me=p>0&&p<v*.6?5:0,fe=Z?-8:0,z=Math.round(d(52+ce+le+de+me+fe,50,92)),xe=2*l+(60-C.getSeconds())*1e3%45e3;return{estimatedCoef:+S.toFixed(2),confidence:z>=82?"Élevé":z>=66?"Moyen":"Faible",reliability:z,estimatedAt:e+xe,windowMs:2.5*l,pattern:B>1.1?"Plage horaire favorable":B<.9?"Plage horaire faible":"Analyse multi-signaux",basis:`EMA20 ${g.toFixed(2)}x — H${C.getHours()}h: géo ${j?.avg.toFixed(2)??"—"}x (${j?.count??0}) — MAD ${p.toFixed(2)} — σ ${h.toFixed(2)} — ${n.length} tours`,generatedAt:e,bigOpportunity:A}}
// De/Ce above are the unchanged public Lucky Jet formulas (PredictionPanel-BX01Z_sa.js).
// This boundary validates data and fixes ordering; it does not calibrate rule scores.
function numberValue(value){
 if(value==null||typeof value==='boolean'||(typeof value==='string'&&!value.trim()))return null;
 if(!['number','string'].includes(typeof value))return null;
 const n=Number(value);return Number.isFinite(n)?n:null;
}
function timeValue(value){
 if(value==null||typeof value==='boolean'||!['number','string'].includes(typeof value))return null;
 const n=numberValue(value);const t=n==null?Date.parse(value):(n<1e11?n*1000:n);
 return Number.isFinite(t)&&t>0&&t<=8640000000000000?t:null;
}
function compareRounds(a,b){
 const time=b.timestamp-a.timestamp;if(time)return time;
 const ai=String(a.id),bi=String(b.id);return ai===bi?0:ai<bi?1:-1;
}
function normalizeRounds(input,now=Date.now()){
 const map=new Map();let invalid=0,duplicates=0,conflicts=0;
 for(const raw of Array.isArray(input)?input:[]){
  if(!raw||typeof raw!=='object'){invalid++;continue}
  const coefficient=numberValue(raw.topCoefficient??raw.coefficient??raw.multiplier);
  const timestamp=timeValue(raw.timestamp??raw.round_timestamp??raw.played_at);
  const id=raw.id==null?'':String(raw.id).trim();
  if(!id||id.length>200||coefficient==null||coefficient<1||timestamp==null||timestamp>now+30000){invalid++;continue}
  const estimated=raw.estimated===true||raw.estimated===1||raw.estimated==='true';
  const row={id,coefficient,timestamp,estimated};
  const old=map.get(id);
  if(old){
   duplicates++;
   if(old.coefficient!==coefficient||old.timestamp!==timestamp){conflicts++;continue}
   if(old.estimated&&!estimated)map.set(id,row);
  }else map.set(id,row);
 }
 return {rows:[...map.values()].sort(compareRounds),invalid,duplicates,conflicts};
}
function exactData(input){return normalizeRounds(input).rows.filter(r=>!r.estimated).slice(0,2000)}
function finitePrediction(p,big=false){
 if(!p)return null;
 const score=big?p.confidence:p.reliability,at=big?p.expectedAt:p.estimatedAt;
 return Number.isFinite(p.estimatedCoef)&&p.estimatedCoef>=1&&Number.isFinite(score)&&score>=0&&score<=100&&Number.isFinite(at)&&Number.isFinite(p.windowMs)&&p.windowMs>0?p:null;
}
function freshData(rows,now){return rows.length>=20&&rows[0].timestamp<=now+30000&&now-rows[0].timestamp<=180000}
function calculatePrediction(input,previous=null){
 const rows=exactData(input),now=Date.now();if(!freshData(rows,now))return null;
 const previousValid=finitePrediction(previous)&&Number.isFinite(previous.generatedAt);
 return finitePrediction(De(rows,previousValid?previous:null));
}
function detectBigOpportunity(input,now=Date.now()){
 if(!Number.isFinite(now))return null;
 const rows=exactData(input);return freshData(rows,now)?finitePrediction(Ce(rows,now),true):null;
}
window.GodPreditor=Object.freeze({calculatePrediction,detectBigOpportunity,normalizeRounds,compareRounds,numberValue,timeValue,version:'20261002-audit1',sourceSha256:'46f71171c554726c040a124679f7efb87e9fdded79ccb1f730a4b9caff2686e8'});


})();
