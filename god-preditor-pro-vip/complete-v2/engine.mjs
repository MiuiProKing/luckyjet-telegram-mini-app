/** GOD PREDITOR complete reviewed local engines. No network or credentials.
 * Original rule scores are not measured accuracy. Threshold timings are hypotheses.
 */
import {timedAnalyze,timedChoose,timedLargest,TIMED_DURATIONS} from './timed-engine.mjs';
import {legacyLocalDiagnostics} from './legacy-ai.mjs';
export const VERSION='complete-public-20261120-v1';
export const TARGETS=[10,20,40,50,100,200,500];
const Ee=18e4;function z(t,a=300,e=1/0){const o=new Set;return[...t].sort((n,i)=>i.timestamp-n.timestamp).filter(n=>!Number.isFinite(n.coefficient)||n.coefficient<1||!Number.isFinite(n.timestamp)||n.timestamp<=0||n.timestamp>e||n.id&&o.has(n.id)?!1:(n.id&&o.add(n.id),!0)).slice(0,a)}function He(t,a=Date.now()){const e=t[0]?.timestamp;return e!==void 0&&e<=a+3e4&&a-e<=Ee}const l=6e4,Be=6e4,_=t=>t.length?t.reduce((a,e)=>a+e,0)/t.length:0,R=t=>{if(!t.length)return 0;const a=[...t].sort((o,n)=>o-n),e=Math.floor(a.length/2);return a.length%2?a[e]:(a[e-1]+a[e])/2},ne=t=>{if(t.length<2)return 0;const a=_(t);return Math.sqrt(_(t.map(e=>(e-a)**2)))},W=(t,a)=>{if(!t.length)return 0;let e=t[t.length-1];for(let o=t.length-2;o>=0;o--)e=a*t[o]+(1-a)*e;return e},q=t=>{if(!t.length)return 0;const a=t.map(e=>Math.log(Math.max(e,1.001)));return Math.exp(_(a))},se=t=>{let a=-1/0;for(const e of t)e>a&&(a=e);return a===-1/0?0:a},ae=t=>{if(t.length<2)return 0;const a=R(t);return R(t.map(e=>Math.abs(e-a)))},c=(t,a,e)=>Math.max(a,Math.min(e,t));function ee(t,a){const e=new Map;for(const n of t){const i=a(n),f=e.get(i)??{coefs:[],g:0,mg:0};f.coefs.push(n.coefficient),n.coefficient>=10&&f.g++,n.coefficient>=100&&f.mg++,e.set(i,f)}const o=new Map;for(const[n,i]of e)o.set(n,{count:i.coefs.length,goldenCount:i.g,megaCount:i.mg,avg:q(i.coefs),max:se(i.coefs)});return o}function oe(t,a){const e=t.filter(n=>n.coefficient>=a).sort((n,i)=>n.timestamp-i.timestamp);if(e.length<2)return{avgGap:0,medGap:0,stdGap:0,madGap:0,last:e[0]?.timestamp??null,count:e.length};const o=[];for(let n=1;n<e.length;n++)o.push(e[n].timestamp-e[n-1].timestamp);return{avgGap:_(o),medGap:R(o),stdGap:ne(o),madGap:ae(o),last:e[e.length-1].timestamp,count:e.length}}function Oe(t,a){const e=[...t].sort((x,u)=>x.timestamp-u.timestamp),o=[],n=oe(e,100);if(n.count>=5&&n.last&&n.medGap>0){const x=n.last+n.medGap,u=x-a,g=c(n.madGap*1.4826||n.medGap*.35,2*l,12*l),y=a-n.last;if(n.madGap>0&&n.madGap<n.medGap*.5&&(Math.abs(u)<=g*.7||y>=n.medGap*.9)){const $=c(1-Math.abs(u)/Math.max(g,1),0,1),C=Math.min(10,n.count),h=c(55+C+$*12,55,82);o.push({expectedAt:u>0?x:a+Math.max(2*l,g*.4),windowMs:c(g,3*l,10*l),estimatedCoef:100,confidence:Math.round(h),reason:`Cycle 100x≈${(n.medGap/l).toFixed(1)}min — dernier il y a ${(y/l).toFixed(1)}min (${n.count} évts)`})}}const i=e.slice(-80);let f=0,d=0;for(const x of i)x.coefficient>=20&&f++,x.coefficient>=50&&d++;if(d>=3&&f>=6){const x=c(55+d*5+f,55,82);o.push({expectedAt:a+3*l,windowMs:6*l,estimatedCoef:120,confidence:Math.round(x),reason:`Cluster chaud : ${f}×≥20x + ${d}×≥50x sur 80 tours`})}const p=e.filter(x=>x.coefficient>=100);if(p.length>=4&&n.last&&e.length>=80){const x=a-n.last,u=e[e.length-1].timestamp-e[0].timestamp,g=u>0?p.length/u:0;if(g>0){const y=1-Math.exp(-g*x);if(y>=.75){const m=c(1/g,9e4,8*l),$=c(50+y*30,50,80);o.push({expectedAt:a+m,windowMs:c(m*.8,3*l,7*l),estimatedCoef:100,confidence:Math.round($),reason:`Hazard Poisson : P(retard)=${(y*100).toFixed(0)}% (λ⁻¹≈${(1/g/l).toFixed(1)}min)`})}}}if(!o.length)return null;o.sort((x,u)=>u.confidence-x.confidence);const v=o[0];return o.length<2&&v.confidence<75?null:(o.length>=2&&(v.confidence=Math.min(92,v.confidence+5)),v)}function qe(t,a,e=Date.now()){if(t=z(t,t.length,e),!He(t,e)||t.length<20)return null;if(a){const r=Math.max(a.estimatedAt+a.windowMs,a.generatedAt+Be);if(e<r)return a}const o=[...t].sort((r,b)=>b.timestamp-r.timestamp),n=o.map(r=>r.coefficient);_(n);const i=R(n),f=q(n),d=n.slice(0,20),p=n.slice(0,50);_(d);const v=_(p),x=W(d,.25),u=W(p,.12),g=ne(p),y=ae(p),m=oe(o,10),$=m.last?e-m.last:1/0,C=ee(o,r=>new Date(r.timestamp).getUTCHours()),h=ee(o,r=>new Date(r.timestamp).getUTCMinutes()),M=new Date(e),j=C.get(M.getUTCHours()),ie=(M.getUTCMinutes()+2)%60,P=h.get(ie),X=n.slice(0,15),re=X.length===15&&X.every(r=>r<2),F=o.slice(0,30).filter(r=>r.coefficient>=20),S=Oe(t,e);if(m.medGap>0&&m.last){const b=m.last+m.medGap-e,k=c(m.madGap*1.4826||m.medGap*.55,6e4,4*l),w=m.count>=8&&m.madGap>0&&m.madGap<m.medGap*.6,D=Math.abs(b)<=k*.6;if(w&&D){const Z=F.length,ge=Z>=3?2:Z>=1?3:4,he=se(o.slice(0,80).map(je=>je.coefficient)),be=c(he/ge,2,20),ve=c(60-Math.abs(b)/k*15,40,62),ye=j&&j.avg>f?3:0,Me=c(m.count/20,0,4),V=Math.round(c(ve+ye+Me,40,68));return{estimatedCoef:+be.toFixed(2),confidence:V>=66?"Moyen":"Faible",reliability:V,estimatedAt:b>0?e+c(b,45e3,2*l):e+9e4,windowMs:c(m.medGap*.25,9e4,3*l),pattern:"Cycle des cotes d'or détecté",basis:`Cycle médian ${(m.medGap/l).toFixed(1)} min — dernier ${($/l).toFixed(1)} min — MAD ${(m.madGap/l).toFixed(2)}min`,generatedAt:e,bigOpportunity:S}}}if(re){const r=c(f*2.5+i,2.5,15),b=Math.round(c(70+Math.min(15,(e-o[14].timestamp)/6e4),65,92));return{estimatedCoef:+r.toFixed(2),confidence:b>=82?"Élevé":"Moyen",reliability:b,estimatedAt:e+9e4,windowMs:2*l,pattern:"Série basse — rebond statistique",basis:`15 tours <2x — moy géo ${f.toFixed(2)}x, médiane ${i.toFixed(2)}x`,generatedAt:e,bigOpportunity:S}}if(F.length>=3){const r=q(F.map(D=>D.coefficient)),b=F.length>=5?3:F.length>=4?4:5,k=c(r/b,2,12),w=Math.min(78,60+F.length*3);return{estimatedCoef:+k.toFixed(2),confidence:w>=72?"Élevé":"Moyen",reliability:w,estimatedAt:e+9e4,windowMs:2.5*l,pattern:`${F.length} cotes ≥20x récentes`,basis:`Moy. géo grosses cotes ${r.toFixed(2)}x ÷ ${b}`,generatedAt:e,bigOpportunity:S}}const I=o.slice(0,60),G=I.filter(r=>r.coefficient>=5&&r.coefficient<10),E=I.length?I.filter(r=>r.coefficient<2).length/I.length:0;if(G.length>=3){const r=q(G.map(D=>D.coefficient)),b=E>.55||g>v*1.4,k=b?c(r*.45,2,4.5):c(r*.7,3,7),w=Math.round(c(64+G.length*4+(b?-6:6),58,90));return{estimatedCoef:+k.toFixed(2),confidence:w>=82?"Élevé":w>=68?"Moyen":"Faible",reliability:w,estimatedAt:e+9e4,windowMs:2.5*l,pattern:b?`Phase mixte — ${G.length} cotes 5x-9x sur base fragile`:`Phase favorable — ${G.length} cotes 5x-9x récentes`,basis:`Zone 5x-9x géo ${r.toFixed(2)}x — <2x: ${(E*100).toFixed(0)}% — σ50 ${g.toFixed(2)}`,generatedAt:e,bigOpportunity:S}}const H=j&&j.count>=5?j.avg/Math.max(f,.1):1,ce=P&&P.count>=5?P.avg/Math.max(f,.1):1,le=x*.5+u*.3+v*.2;let T=c(le*H*.6+(P?.max??0)*.1+1.6,1.8,12);const Q=E>.6||g>v*1.6;Q?T=Math.min(T,3.2):E>.45&&(T=Math.min(T,5));const de=c(t.length/25,0,28),me=c(Math.abs(H-1)*42,0,22),fe=c(Math.abs(ce-1)*32,0,16),xe=y>0&&y<v*.6?5:0,pe=Q?-8:0,U=Math.round(c(52+de+me+fe+xe+pe,50,92)),ue=l+(60-M.getUTCSeconds())*1e3%6e4;return{estimatedCoef:+T.toFixed(2),confidence:U>=82?"Élevé":U>=66?"Moyen":"Faible",reliability:U,estimatedAt:e+ue,windowMs:2.5*l,pattern:H>1.1?"Plage horaire favorable":H<.9?"Plage horaire faible":"Analyse multi-signaux",basis:`EMA20 ${x.toFixed(2)}x — H${M.getUTCHours()}h UTC: géo ${j?.avg.toFixed(2)??"—"}x (${j?.count??0}) — MAD ${y.toFixed(2)} — σ ${g.toFixed(2)} — ${t.length} tours`,generatedAt:e,bigOpportunity:S}}
export function parseTime(value){
 if(typeof value==='number'&&Number.isFinite(value))return value>0&&value<1e11?value*1000:value;
 if(typeof value!=='string'||!value.trim())return NaN;
 const numeric=Number(value);if(Number.isFinite(numeric))return numeric>0&&numeric<1e11?numeric*1000:numeric;
 const explicit=/([zZ]|[+-]\d\d(:?\d\d)?)$/.test(value);
 return Date.parse(explicit?value:value.replace(' ','T')+'Z');
}
export function normalizeRounds(rows,now=Date.now(),limit=Infinity){
 const seen=new Set,out=[];
 for(const r of rows??[]){
  if(!r||r.estimated===true||r.completed===false||typeof(r.coefficient??r.x)==='boolean'||(r.coefficient??r.x)==null)continue;
  const coefficient=Number(r.coefficient??r.x),timestamp=parseTime(r.timestamp??r.round_timestamp??r.played_at);
  if(!Number.isFinite(coefficient)||coefficient<1||!Number.isFinite(timestamp)||timestamp<=0||timestamp>now)continue;
  const key=r.id!=null?'id:'+r.id:'fallback:'+timestamp+':'+coefficient;
  if(seen.has(key))continue;seen.add(key);
  out.push({...r,id:r.id!=null?String(r.id):`${timestamp}:${coefficient}`,coefficient,timestamp});
 }
 return out.sort((a,b)=>b.timestamp-a.timestamp||String(b.id).localeCompare(String(a.id))).slice(0,limit);
}
export function gapAnalysis(rows,target){return oe(rows,target)}
export function analyzeBasic(rows,previous=null,now=Date.now(),profile='compiled'){
 const normalized=normalizeRounds(rows,now), result=qe(normalized,previous,now);
 if(!result||previous===result||profile==='compiled')return result;
 const old={...result};
 if(result.pattern==="Cycle des cotes d'or détecté"){
  const gap=oe(normalized,10),drift=gap.last+gap.medGap-now;
  old.estimatedAt=now+(drift>0?Math.max(drift,90000):120000);
 }else if(result.pattern.includes('cotes ≥20x')||result.pattern.startsWith('Phase '))old.estimatedAt=now+120000;
 else if(!result.pattern.startsWith('Série basse'))old.estimatedAt=now+120000+((60-new Date(now).getUTCSeconds())*1000)%45000;
 return old;
}
function betaCF(a,b,x){let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;if(Math.abs(d)<1e-300)d=1e-300;d=1/d;let h=d;
 for(let m=1;m<=400;m++){let m2=2*m,aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1+aa*d;c=1+aa/c;if(Math.abs(d)<1e-300)d=1e-300;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;h*=d*c;aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1+aa*d;c=1+aa/c;if(Math.abs(d)<1e-300)d=1e-300;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;let delta=d*c;h*=delta;if(Math.abs(delta-1)<3e-14)break;}return h;}
// Lanczos log-gamma for positive shapes; checked against Python math.lgamma.
function logGamma(z){const co=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);z-=1;let x=.99999999999980993;for(let i=0;i<co.length;i++)x+=co[i]/(z+i+1);const t=z+co.length-.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);}
export function betaCDF(x,a,b){if(x<=0)return 0;if(x>=1)return 1;const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));return x<(a+1)/(a+b+2)?bt*betaCF(a,b,x)/a:1-bt*betaCF(b,a,1-x)/b;}
export function betaQuantile(q,a,b){let lo=0,hi=1;for(let i=0;i<75;i++){const m=(lo+hi)/2;if(betaCDF(m,a,b)<q)lo=m;else hi=m;}return(lo+hi)/2;}
export function gammaCDF(x,a){if(x<=0)return 0;const gln=logGamma(a);if(x<a+1){let ap=a,term=1/a,sum=term;for(let i=0;i<10000;i++){ap++;term*=x/ap;sum+=term;if(Math.abs(term)<Math.abs(sum)*3e-14)break;}return sum*Math.exp(-x+a*Math.log(x)-gln);}let b=x+1-a,c=1e300,d=1/b,h=d;for(let i=1;i<=10000;i++){let an=-i*(i-a);b+=2;d=an*d+b;c=b+an/c;if(Math.abs(d)<1e-300)d=1e-300;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<3e-14)break;}return 1-Math.exp(-x+a*Math.log(x)-gln)*h;}
export function gammaQuantile(q,a){let lo=0,hi=Math.max(1,a);while(gammaCDF(hi,a)<q)hi*=2;for(let i=0;i<75;i++){const m=(lo+hi)/2;if(gammaCDF(m,a)<q)lo=m;else hi=m;}return(lo+hi)/2;}
export function bayesThreshold(rows,target,windowMs=180000){
 const n=rows.length,hits=rows.filter(r=>r.coefficient>=target).length;if(!n)return null;
 const a=hits+.5,b=n-hits+.5,perRoundProbability=a/(a+b),nextRounds={};
 for(const k of [1,3,5]){let miss=1;for(let i=0;i<k;i++)miss*=(b+i)/(a+b+i);nextRounds[k]=1-miss;}
 const perRoundInterval95=[betaQuantile(.025,a,b),betaQuantile(.975,a,b)],span=n>1?(rows[0].timestamp-rows[n-1].timestamp)/60000:0;
 const base={target,sampleSize:n,hits,perRoundProbability,perRoundInterval95,nextRounds};
 if(span<=0)return{...base,probability:null,interval95:null};
 const events=hits-Number(rows[n-1].coefficient>=target),shape=events+.5,rate=span,w=windowMs/60000;
 return{...base,events,exposureMinutes:span,probability:-Math.expm1(-shape*Math.log1p(w/rate)),interval95:[.025,.975].map(q=>-Math.expm1(-gammaQuantile(q,shape)/rate*w)),calibrated:false};
}
export function analyzeThreshold(input,target,now=Date.now(),windowMs=180000,minEvents=5,leadMs=40000){
 const rows=normalizeRounds(input,now),gap=oe(rows,target),stats=bayesThreshold(rows,target,windowMs);
 const out={channel:`vip_${target}`,target,estimatedCoef:target,estimatedAt:null,windowMs,generatedAt:now,status:'waiting',confidence:stats?.probability!=null?stats.probability*100:null,scoreKind:'model_probability',reason:'',modelVersion:VERSION,modelKind:'median_gap_hypothesis',originalVipServerFormula:false,calibrated:false,events:gap.count,lastHitAt:gap.last,medianGapMs:gap.medGap,madGapMs:gap.madGap,dataCutoff:rows[0]?.timestamp??null,sampleSize:rows.length,probability:stats?.probability??null,interval95:stats?.interval95??null};
 if(rows.length<200){out.reason='Нужно не менее 200 завершённых раундов';return out;}
 if(now-rows[0].timestamp>180000){out.reason='История устарела; расчёт приостановлен';return out;}
 if(gap.count<minEvents||gap.medGap<=0){out.reason=`Для ≥${target}× недостаточно исторических событий (${gap.count}/${minEvents})`;return out;}
 const expected=gap.last+gap.medGap;out.historicalExpectedAt=expected;
 if(expected<=now){out.status='overdue';out.reason='Медианная историческая отметка уже прошла; новая точная дата не доказана';return out;}
 if(expected-now<leadMs){out.reason='До исторической отметки недостаточно времени для уведомления';return out;}
 return{...out,estimatedAt:expected,status:'candidate',start:expected,end:expected+windowMs,reason:`Оценка по ${gap.count} событиям ≥${target}×; медианный интервал ${(gap.medGap/60000).toFixed(1)} мин`,basisEvent:`${target}:${gap.last}`};
}
export function legacyBigCandidates(rows,now){
 const s=[...rows].sort((a,b)=>a.timestamp-b.timestamp),gap=oe(s,100),out=[];
 if(gap.count>=5&&gap.last&&gap.medGap>0){const expected=gap.last+gap.medGap,drift=expected-now,tol=c(gap.madGap*1.4826||gap.medGap*.35,120000,720000),elapsed=now-gap.last;if(gap.madGap>0&&gap.madGap<gap.medGap*.5&&(Math.abs(drift)<=tol*.7||elapsed>=gap.medGap*.9))out.push({expectedAt:drift>0?expected:now+Math.max(120000,tol*.4),windowMs:c(tol,180000,600000),estimatedCoef:100,confidence:Math.round(c(55+Math.min(10,gap.count)+c(1-Math.abs(drift)/Math.max(tol,1),0,1)*12,55,82)),rule:'cycle100',historicalExpectedAt:expected,reason:`Cycle 100x≈${(gap.medGap/60000).toFixed(1)}min`});}
 const recent=s.slice(-80),big20=recent.filter(r=>r.coefficient>=20).length,big50=recent.filter(r=>r.coefficient>=50).length;
 if(big50>=3&&big20>=6)out.push({expectedAt:now+180000,windowMs:360000,estimatedCoef:120,confidence:Math.round(c(55+big50*5+big20,55,82)),rule:'hot_cluster',reason:`Cluster chaud : ${big20}×≥20x + ${big50}×≥50x sur 80 tours`});
 if(gap.count>=4&&gap.last&&s.length>=80){const span=s.at(-1).timestamp-s[0].timestamp,rate=span>0?gap.count/span:0;if(rate>0){const elapsedCDF=-Math.expm1(-rate*(now-gap.last));if(elapsedCDF>=.75){const eta=c(1/rate,90000,480000);out.push({expectedAt:now+eta,windowMs:c(eta*.8,180000,420000),estimatedCoef:100,confidence:Math.round(c(50+elapsedCDF*30,50,80)),rule:'elapsed_poisson_diagnostic',elapsedCDF,reason:'Original elapsed-wait CDF; not probability of a future event'});}}}
 return out;
}
export function validateWindow(input,target,start,end,now=Date.now(),avgRoundSeconds=null){
 const rows=normalizeRounds(input,now).sort((a,b)=>a.timestamp-b.timestamp),inside=rows.filter(r=>r.timestamp>=start&&r.timestamp<=end),best=inside.reduce((a,b)=>!a||b.coefficient>a.coefficient?b:a,null);
 const base={reached:!!best&&best.coefficient>=target,actual:best?.coefficient??null,resultAt:best?.timestamp??null,roundId:best?.id??null};
 if(now<=end)return{...base,status:'pending',reason:'Окно ещё не закрыто'};
 if(base.reached)return{...base,status:'hit',reason:'Цель достигнута в пределах окна'};
 const before=rows.filter(r=>r.timestamp<start),after=rows.filter(r=>r.timestamp>end);
 if(!before.length||!after.length||!inside.length)return{...base,status:'unknown',reason:'Нет полного покрытия границ окна'};
 const gaps=rows.slice(1).map((r,i)=>r.timestamp-rows[i].timestamp).filter(x=>x>0),avg=avgRoundSeconds||R(gaps)/1000,maximum=Math.min(180000,Math.max(60000,avg*3000)),coverage=[before.at(-1),...inside,after[0]];
 if(coverage.slice(1).some((r,i)=>r.timestamp-coverage[i].timestamp>maximum))return{...base,status:'unknown',reason:'В истории есть большой разрыв'};
 return{...base,status:'miss',reason:'Цель не достигнута при проверенном покрытии окна'};
}
export function analyzeReport(input,now=Date.now()){
 const rows=normalizeRounds(input,now),fresh=!!rows.length&&now-rows[0].timestamp<=180000;
 const timedRates=timedAnalyze(rows.slice(0,5000),now),latest=rows.slice(0,3).map(r=>({coefficient:r.coefficient,played_at:r.timestamp}));
 return{version:VERSION,now,sampleSize:rows.length,dataCutoff:rows[0]?.timestamp??null,fresh,basic:analyzeBasic(rows.slice(0,2000),null,now),thresholds:TARGETS.map(t=>analyzeThreshold(rows,t,now)),bigDiagnostics:legacyBigCandidates(rows,now),originalVipServerFormula:false,originalAiServerFormula:false,legacyDiagnostics:legacyLocalDiagnostics(rows,now),timedRates,timedDurations:timedRates?TIMED_DURATIONS.map(minutes=>({minutes,proposal:timedLargest(minutes,timedRates.pct,timedRates.perHour)})):[],timed:timedRates?timedChoose(timedRates,latest,now+3600,now):null};
}
export function analyzeAll(input,now=Date.now()){
 const rows=normalizeRounds(input,now),report=analyzeReport(rows,now),out=[];if(!report.fresh)return out;
 const basic=report.basic;
 if(basic)out.push({...basic,channel:'basic',target:basic.estimatedCoef,confidence:basic.reliability,scoreKind:'heuristic',reason:basic.basis,modelVersion:VERSION,calibrated:false,basisEvent:rows[0].id});
 out.push(...report.thresholds.filter(r=>r.estimatedAt!=null));
 for(const candidate of report.bigDiagnostics){const rule=candidate.rule;if(rule==='elapsed_poisson_diagnostic'||rule==='cycle100'&&candidate.historicalExpectedAt<=now+40000)continue;out.push({...candidate,channel:'big_'+rule,target:candidate.estimatedCoef,estimatedAt:candidate.expectedAt,scoreKind:'heuristic',modelVersion:VERSION,calibrated:false,basisEvent:rule==='hot_cluster'?rows[0].id:String(candidate.historicalExpectedAt)});}
 const pred=report.timed;
 if(pred)out.push({channel:'premium_live',target:pred.level,estimatedAt:parseTime(pred.startAt),windowMs:pred.minutes*60000,confidence:pred.chance,scoreKind:'independence_model_probability',reason:pred.reason,modelVersion:'public-timed-20261120-v1',calibrated:false,basisEvent:rows[0].id,noticeSeconds:3.6,liveWindow:true,issuedAt:now});
 return out;
}
