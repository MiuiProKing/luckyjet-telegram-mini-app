/** Local uploaded AI/time diagnostics. These are transparent statistical heuristics,
 * not the original site's private AI inference and not independent ensemble votes.
 * Future-clamping from the upload is preserved solely for source comparison.
 */
function pyRound(x,n=0){
 if(!Number.isFinite(x)||x===0)return x;
 const negative=x<0;const buffer=new ArrayBuffer(8),view=new DataView(buffer);view.setFloat64(0,Math.abs(x));const bits=view.getBigUint64(0),exponent=Number((bits>>52n)&2047n)-1023-52;
 let numerator=(bits&((1n<<52n)-1n))+(1n<<52n);numerator*=5n**BigInt(n);const shift=exponent+n;let rounded;
 if(shift>=0)rounded=numerator<<BigInt(shift);else{const den=1n<<BigInt(-shift),q=numerator/den,r=numerator%den;rounded=q+(r*2n>den||r*2n===den&&q%2n===1n?1n:0n);}
 return(negative?-1:1)*Number(rounded)/(10**n);
}
const THRESHOLDS=[10,20,50,100,500,1000,5000,50000];
const mean=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
const median=v=>{if(!v.length)return 0;const x=[...v].sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2;};
const deviation=v=>v.length<2?0:Math.sqrt(mean(v.map(x=>(x-mean(v))**2)));
const evenRound=x=>{const lo=Math.floor(x),d=x-lo;return d===.5?(lo%2===0?lo:lo+1):Math.round(x);};
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',minute:'2-digit'});
const minute=ms=>Number(formatter.format(new Date(ms)));
function points(rows,nowMs){return rows.filter(r=>r.timestamp<=nowMs).map(r=>[r.timestamp/1000,r.coefficient]).sort((a,b)=>a[0]-b[0]);}
function minuteTable(pts){const total=Array(60).fill(0);for(const[t]of pts)total[minute(t*1000)]++;return total;}
function ema(v,n){const a=2/(n+1);let value=v[0];for(const x of v.slice(1))value=a*x+(1-a)*value;return value;}
export function legacyAiAnalyze(rows,nowMs=Date.now()){
 const pts=points(rows,nowMs),now=nowMs/1000;
 if(pts.length<200)return{ok:false,reason:`Недостаточно истории: ${pts.length}/200 раундов`};
 if(now-pts.at(-1)[0]>180)return{ok:false,reason:'Нет свежих раундов (более 180 секунд)'};
 const values=pts.slice(-200).map(p=>p[1]),exposure=minuteTable(pts),output=[];
 for(const threshold of THRESHOLDS){const hits=pts.filter(p=>p[1]>=threshold).map(p=>p[0]);if(hits.length<5)continue;
  const gaps=hits.slice(1).map((v,i)=>v-hits[i]).filter(g=>g>0);if(!gaps.length)continue;
  const med=median(gaps),mad=median(gaps.map(g=>Math.abs(g-med))),elapsed=Math.max(0,now-hits.at(-1)),events=Array(60).fill(0);
  for(const t of hits)events[minute(t*1000)]++;
  const hot=Array.from({length:60},(_,i)=>i).sort((a,b)=>(events[b]+1)/(exposure[b]+60)-(events[a]+1)/(exposure[a]+60)).slice(0,3);
  const rate=hits.length/Math.max(1,pts.at(-1)[0]-pts[0][0]);
  output.push({target:threshold,count:hits.length,median_gap_s:evenRound(med),mad_s:evenRound(mad),elapsed_s:evenRound(elapsed),candidate:now+Math.max(15,med-elapsed),base_rate_3m:1-Math.exp(-rate*180),hot_minutes:hot});
 }
 return{ok:!!output.length,n:pts.length,last:pts.at(-1)[0],ema20:ema(values.slice(-20),20),ema50:ema(values.slice(-50),50),median50:median(values.slice(-50)),targets:output,reason:output.length?'':'Нет достаточных событий ≥10x'};
}
export function legacyThreeArchive(rows,target,nowMs=Date.now()){
 const pts=points(rows,nowMs),now=nowMs/1000;
 if(pts.length<20||now-pts.at(-1)[0]>180)return null;
 const coefs=pts.map(p=>p[1]),hits=pts.filter(p=>p[1]>=target).map(p=>p[0]);if(hits.length<5)return null;
 const gaps=hits.slice(1).map((v,i)=>v-hits[i]).filter(g=>g>0);if(!gaps.length)return null;
 const med=median(gaps),mad=median(gaps.map(g=>Math.abs(g-med))),elapsed=Math.max(0,now-hits.at(-1));
 const recent=coefs.slice(-80),clusters={'20':recent.filter(x=>x>=20).length,'50':recent.filter(x=>x>=50).length,mid:coefs.slice(-60).filter(x=>x>=5&&x<10).length,low15:coefs.slice(-15).every(x=>x<2)};
 const rate=hits.length/Math.max(1,pts.at(-1)[0]-pts[0][0]),tol=Math.min(720,Math.max(120,1.4826*mad||med*.35));
 const exposures=minuteTable(pts),events=Array(60).fill(0);for(const t of hits)events[minute(t*1000)]++;
 const top=Array.from({length:60},(_,i)=>i).sort((a,b)=>(events[b]+1)/(exposures[b]+60)-(events[a]+1)/(exposures[a]+60)).slice(0,3),candidates=[];
 for(let delta=1;delta<=15;delta++){const ts=now+delta*60,m=minute(ts*1000);if(top.includes(m)&&exposures[m]>=10)candidates.push(ts);}
 let candidate=now+Math.max(15,med-elapsed);if(candidates.length&&Math.abs(candidates[0]-candidate)<=tol)candidate=candidates[0];
 return{candidate,end:candidate+180,baseline:100*(-Math.expm1(-rate*180)),median_gap:med,mad_gap:mad,elapsed,count:hits.length,clusters,top_minutes:top,consensus:Number(clusters['50']>=3&&clusters['20']>=6)+Number(mad>0&&mad<med*.5)+Number(1-Math.exp(-rate*elapsed)>=.75),class:target>=100?'mega':target>=10?'high':target>=2?'mid':'low',sample:pts.length};
}
export function legacyLocalDiagnostics(rows,nowMs=Date.now()){
 return{available:true,diagnosticOnly:true,originalAiServerFormula:false,scoreKind:'correlated_legacy_heuristics',calibrated:false,futureShiftPolicy:'Legacy future-clamping retained only for source comparison; not an entry recommendation',premium_research_analysis:legacyPremiumResearch(rows,nowMs),ts_full_prediction:legacyTsPrediction(rows,nowMs,'full'),ts_generate_prediction_exact:legacyTsPrediction(rows,nowMs,'exact'),ai_analyze:legacyAiAnalyze(rows,nowMs),three_archive_analysis:Object.fromEntries([10,20,40,50,100,200,500,1000,5000,50000].map(t=>[t,legacyThreeArchive(rows,t,nowMs)]))};
}

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const geo=v=>v.length?Math.exp(mean(v.map(x=>Math.log(Math.max(x,1.001))))):0;
const mad=v=>v.length>=2?median(v.map(x=>Math.abs(x-median(v)))):0;
function directEMA(v,a){if(!v.length)return 0;let result=v.at(-1);for(let i=v.length-2;i>=0;i--)result=a*v[i]+(1-a)*result;return result;}
function gaps(rows,target){const hits=rows.filter(r=>r.coefficient>=target).map(r=>r.timestamp).sort((a,b)=>a-b),values=hits.slice(1).map((t,i)=>t-hits[i]).filter(x=>x>0);return{avgGap:mean(values),medGap:median(values),stdGap:deviation(values),madGap:mad(values),last:hits.at(-1)??null,count:hits.length};}
function buckets(rows,field){const m=new Map();for(const r of rows){const k=field(new Date(r.timestamp));if(!m.has(k))m.set(k,[]);m.get(k).push(r.coefficient);}return new Map([...m].map(([k,v])=>[k,{count:v.length,goldenCount:v.filter(x=>x>=10).length,megaCount:v.filter(x=>x>=100).length,avg:geo(v),max:Math.max(...v)}]));}
export function legacyPremiumResearch(rows,now){
 const ordered=[...rows].sort((a,b)=>a.timestamp-b.timestamp);if(ordered.length<20)return{ok:false,reason:'Менее 20 подтверждённых раундов',windows:[]};
 if(now-ordered.at(-1).timestamp>180000)return{ok:false,reason:'История старше 3 минут',windows:[]};
 const xs=ordered.map(r=>r.coefficient),last50=xs.slice(-50),avg50=mean(last50),med50=median(last50),mad50=mad(last50),geometric=geo(xs),ema20=directEMA(xs.slice(-20).reverse(),.25),ema50=directEMA([...last50].reverse(),.12);
 const low15=xs.length>=15&&xs.slice(-15).every(x=>x<2),big20=xs.slice(-30).filter(x=>x>=20),mid=xs.slice(-60).filter(x=>x>=5&&x<=9),share=xs.slice(-60).filter(x=>x<2).length/xs.slice(-60).length;
 let target,pattern;
 if(low15){target=clamp(geometric*2.5+med50,2.5,15);pattern='15 подряд ниже 2×';}
 else if(big20.length>=3){const d=big20.length>=5?3:big20.length>=4?4:5;target=clamp(geo(big20)/d,2,12);pattern='кластер ≥20×';}
 else if(mid.length>=3){const fragile=share>.55||deviation(last50)>avg50*1.4;target=fragile?clamp(geo(mid)*.45,2,4.5):clamp(geo(mid)*.7,3,7);pattern='зона 5–9×';}
 else{target=clamp((.5*ema20+.3*ema50+.2*avg50)*.6+1.6,1.8,12);if(share>.6)target=Math.min(target,3.2);else if(share>.45)target=Math.min(target,5);pattern='EMA / среднее';}
 const windows=[];
 for(const threshold of [40,200,500]){const gap=gaps(ordered,threshold);if(gap.count<5||gap.medGap<60000||gap.medGap>48*3600000)continue;let expected=gap.last+gap.medGap;if(expected<now)expected+=Math.ceil((now-expected)/gap.medGap)*gap.medGap;if(expected>now+30*60000)continue;const tolerance=Math.trunc(clamp(1.4826*gap.madGap,180000,720000));windows.push({threshold,start:Math.trunc(expected),end:Math.trunc(expected+tolerance),cycle_minutes:pyRound(gap.medGap/60000,2),mad_minutes:pyRound(gap.madGap/60000,2),events:gap.count,method:'median/MAD interval (heuristic)'});}
 return{ok:true,count:xs.length,latest_ms:ordered.at(-1).timestamp,ema20:pyRound(ema20,2),ema50:pyRound(ema50,2),median50:pyRound(med50,2),mad50:pyRound(mad50,2),geo:pyRound(geometric,2),target_x:pyRound(target,2),pattern,cluster20_30:big20.length,windows};
}
export function legacyTsPrediction(rows,now,variant='full'){
 const integer=value=>variant==='full'?Math.trunc(value):value;
 const ordered=[...rows].sort((a,b)=>a.timestamp-b.timestamp);
 if(ordered.length<20)return variant==='full'?{ok:false,reason:'Меньше 20 раундов'}:null;
 if(now-ordered.at(-1).timestamp>180000)return variant==='full'?{ok:false,reason:'История старше 3 минут'}:null;
 const desc=[...ordered].reverse(),coefs=desc.map(r=>r.coefficient),last50=coefs.slice(0,50),avg50=mean(last50),e20=directEMA(coefs.slice(0,20),.25),e50=directEMA(last50,.12),sigma=deviation(last50),robust=mad(last50),allgeo=geo(coefs),allmed=median(coefs),gold=gaps(ordered,10),mega=gaps(ordered,100),current=new Date(now),hb=buckets(ordered,d=>d.getUTCHours()).get(current.getUTCHours()),mb=buckets(ordered,d=>d.getUTCMinutes()).get((current.getUTCMinutes()+2)%60),big20=coefs.slice(0,80).filter(x=>x>=20).length,big50=coefs.slice(0,80).filter(x=>x>=50).length,recentBig=coefs.slice(0,30).filter(x=>x>=20),recent60=coefs.slice(0,60),mid=recent60.filter(x=>x>=5&&x<10),share=recent60.filter(x=>x<2).length/recent60.length,candidates=[];
 if(mega.count>=5&&mega.last&&mega.medGap>0){const expected=mega.last+mega.medGap,drift=expected-now,tol=clamp(mega.madGap*1.4826||mega.medGap*.35,120000,720000);if(mega.madGap>0&&mega.madGap<mega.medGap*.5&&(Math.abs(drift)<=tol*.7||now-mega.last>=mega.medGap*.9))candidates.push({expectedAt:integer(drift>0?expected:now+Math.max(120000,tol*.4)),windowMs:integer(clamp(tol,180000,600000)),estimatedCoef:100,confidence:evenRound(clamp(55+Math.min(10,mega.count)+clamp(1-Math.abs(drift)/Math.max(tol,1),0,1)*12,55,82)),reason:'Cycle ≥100x'});}
 if(big50>=3&&big20>=6)candidates.push({expectedAt:now+180000,windowMs:360000,estimatedCoef:120,confidence:evenRound(clamp(55+big50*5+big20,55,82)),reason:'Cluster ≥20x/≥50x'});
 if(mega.count>=4&&mega.last&&ordered.length>=80){const rate=mega.count/(ordered.at(-1).timestamp-ordered[0].timestamp);if(rate>0){const overdue=1-Math.exp(-rate*Math.max(0,now-mega.last));if(overdue>=.75){const eta=clamp(1/rate,90000,480000);candidates.push({expectedAt:integer(now+eta),windowMs:integer(clamp(eta*.8,180000,420000)),estimatedCoef:100,confidence:evenRound(clamp(50+overdue*30,50,80)),reason:'Poisson overdue heuristic',overduePct:pyRound(overdue*100,1)});}}}
 candidates.sort((a,b)=>b.confidence-a.confidence);let big=candidates.length&&(candidates.length>=2||candidates[0].confidence>=75)?{...candidates[0]}:null;if(big&&candidates.length>=2)big.confidence=Math.min(92,big.confidence+5);
 function result(target,rel,eta,width,pattern,basis){rel=evenRound(rel);return{...(variant==='full'?{ok:true}:{}),estimatedCoef:pyRound(target,2),reliability:rel,confidence:variant==='full'?(rel>=93?'Очень высокая':rel>=82?'Высокая':rel>=68?'Средняя':'Низкая'):(rel>=82?'Élevé':rel>=66?'Moyen':'Faible'),estimatedAt:variant==='exact'?evenRound(eta):Math.trunc(eta),windowMs:variant==='exact'?evenRound(width):Math.trunc(width),pattern,basis,generatedAt:now,bigOpportunity:big,...(variant==='full'?{diagnostics:{ema20:pyRound(e20,2),ema50:pyRound(e50,2),median50:pyRound(median(last50),2),mad50:pyRound(robust,2),goldenGap:gold,megaGap:mega,hourBucket:hb??null,nextMinuteBucket:mb??null,cluster20_30:recentBig.length,midZone60:mid.length,smallShare60:pyRound(share,4),poissonCandidates:candidates.length}}:{})};}
 if(gold.medGap>0&&gold.last){const drift=gold.last+gold.medGap-now,tol=clamp(gold.madGap*1.4826||gold.medGap*.55,60000,240000);if(gold.count>=8&&gold.madGap>0&&gold.madGap<gold.medGap*.6&&Math.abs(drift)<=tol*.6){const div=recentBig.length>=3?2:recentBig.length?3:4,rel=evenRound(clamp(clamp(60-Math.abs(drift)/tol*15,40,62)+(hb&&hb.avg>allgeo?3:0)+clamp(gold.count/20,0,4),40,68)),r=result(clamp(Math.max(...coefs.slice(0,80))/div,2,20),rel,now+(drift>0?Math.max(drift,90000):120000),clamp(gold.medGap*.25,90000,180000),'Golden Cycle ≥10x','Медиана/MAD');if(variant==='exact')r.confidence=rel>=66?'Moyen':'Faible';return r;}}
 if(coefs.length>=15&&coefs.slice(0,15).every(x=>x<2)){const rel=evenRound(clamp(70+Math.min(15,(now-desc[14].timestamp)/60000),65,92)),r=result(clamp(allgeo*2.5+allmed,2.5,15),rel,now+90000,120000,'15 коэффициентов ниже 2x','Геометрическое среднее и медиана');if(variant==='exact')r.confidence=rel>=82?'Élevé':'Moyen';return r;}
 if(recentBig.length>=3){const div=recentBig.length>=5?3:recentBig.length>=4?4:5,rel=Math.min(78,60+recentBig.length*3),r=result(clamp(geo(recentBig)/div,2,12),rel,now+120000,150000,'Кластер ≥20x','Геометрическое среднее');if(variant==='exact')r.confidence=rel>=72?'Élevé':'Moyen';return r;}
 if(mid.length>=3){const cautious=share>.55||sigma>avg50*1.4;return result(clamp(geo(mid)*(cautious?.45:.7),cautious?2:3,cautious?4.5:7),clamp(64+mid.length*4+(cautious?-6:6),58,90),now+120000,150000,'Зона 5–9x',cautious?'Осторожный режим':'Нормальный режим');}
 const hf=hb&&hb.count>=5?hb.avg/Math.max(allgeo,.1):1,mf=mb&&mb.count>=5?mb.avg/Math.max(allgeo,.1):1,fragile=share>.6||sigma>avg50*1.6;let target=clamp((.5*e20+.3*e50+.2*avg50)*hf*.6+(mb?.max??0)*.1+1.6,1.8,12);if(fragile)target=Math.min(target,3.2);else if(share>.45)target=Math.min(target,5);
 return result(target,clamp(52+clamp(coefs.length/25,0,28)+clamp(Math.abs(hf-1)*42,0,22)+clamp(Math.abs(mf-1)*32,0,16)+(robust>0&&robust<avg50*.6?5:0)+(fragile?-8:0),50,92),now+120000+((60-current.getUTCSeconds())*1000)%45000,150000,'EMA / UTC hour-minute buckets','Комбинированный fallback');
}
