import {resolveWindow} from './modules/signal-validation.mjs';
export const MODEL_ID='empirical-independent-v1';
export const HORIZON_MS=180000;
const TARGETS=[40,200,500];

export function wilsonInterval(hits,n,z=1.95996398454){
 if(!n)return [0,1];
 const p=hits/n,den=1+z*z/n,center=(p+z*z/(2*n))/den;
 const radius=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
 return [Math.max(0,center-radius),Math.min(1,center+radius)];
}
export function horizonChance(p,rounds){
 if(p<=0)return 0;if(p>=1)return 1;
 return -Math.expm1(rounds*Math.log1p(-p));
}
export function estimateLarge(rounds,now=Date.now()){
 const ids=new Set();
 const valid=rounds.filter(r=>Number.isFinite(r.coefficient)&&r.coefficient>=1&&Number.isFinite(r.timestamp)&&r.timestamp>0&&r.timestamp<=now&&!ids.has(r.id)&&(ids.add(r.id),true)).sort((a,b)=>a.timestamp-b.timestamp);
 const recent=valid.slice(-101),deltas=recent.slice(1).map((r,i)=>r.timestamp-recent[i].timestamp).filter(d=>d>0&&d<=HORIZON_MS);
 const avgRoundSeconds=deltas.length?deltas.reduce((a,b)=>a+b,0)/deltas.length/1000:null;
 const dataCutoff=valid.at(-1)?.timestamp??null;
 const fresh=dataCutoff!==null&&now-dataCutoff<=HORIZON_MS;
 const enough=valid.length>=200&&deltas.length>=10&&avgRoundSeconds>0;
 const expectedRounds=avgRoundSeconds?HORIZON_MS/(avgRoundSeconds*1000):null;
 const thresholds=TARGETS.map(target=>{
  const events=valid.filter(r=>r.coefficient>=target),count=events.length,p=valid.length?count/valid.length:0;
  const gaps=events.slice(1).map((r,i)=>r.timestamp-events[i].timestamp);
  const [lo,hi]=wilsonInterval(count,valid.length);
  return {threshold:target,count,frequencyPct:p*100,lastAt:events.at(-1)?.timestamp??null,
   avgGapMinutes:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length/60000:null,
   probNext3MinPct:enough?horizonChance(p,expectedRounds)*100:null,
   rangePct:enough?[horizonChance(lo,expectedRounds)*100,horizonChance(hi,expectedRounds)*100]:null,
   rare:count<5};
 });
 return {model:MODEL_ID,sampleSize:valid.length,dataCutoff,fresh,ready:fresh&&enough,
  avgRoundSeconds,expectedRounds,thresholds,
  reason:!fresh?'Данные старше 3 минут':!enough?'Нужно 200 раундов и 10 интервалов':'Модель независимых раундов'};
}

// Windows are scheduled observations, not predictions of an exact event time.
// The probability snapshot is frozen BEFORE the three-minute window starts.
export function advanceLocalAudit(audit,rounds,stats,now=Date.now(),enabled=true){
 let changed=false;
 const next=audit.map(entry=>{
  if(entry.model!==MODEL_ID||entry.status!=='pending')return entry;
  const result=resolveWindow(entry,rounds,now,entry.avgRoundSeconds??30);
  if(result){changed=true;return {...entry,status:result.status,coefficient:result.coefficient,resolvedAt:now};}
  if(now>entry.end+HORIZON_MS){changed=true;return {...entry,status:'unknown',resolvedAt:now};}
  return entry;
 });
 if(enabled&&stats.ready){
  for(const s of stats.thresholds){
   if(next.some(x=>x.model===MODEL_ID&&x.target===s.threshold&&x.status==='pending'))continue;
   // Even an early hit keeps this window occupied until its scheduled end.
   if(next.some(x=>x.model===MODEL_ID&&x.target===s.threshold&&x.end>=now))continue;
   const start=now+1000,end=start+HORIZON_MS;
   next.push({key:`local:${s.threshold}:${start}`,model:MODEL_ID,target:s.threshold,start,end,acceptedAt:now,
    probabilityPct:s.probNext3MinPct,rangePct:s.rangePct,sampleSize:stats.sampleSize,
    avgRoundSeconds:stats.avgRoundSeconds,status:'pending'});changed=true;
  }
 }
 return {audit:next.slice(-500),changed};
}
export function auditSummary(audit){
 const known=audit.filter(x=>x.model===MODEL_ID&&['validated','failed'].includes(x.status));
 const complete=known.filter(x=>Number.isFinite(x.probabilityPct));
 return {known:known.length,hits:known.filter(x=>x.status==='validated').length,
  unknown:audit.filter(x=>x.model===MODEL_ID&&x.status==='unknown').length,
  brier:complete.length?complete.reduce((s,x)=>s+(x.probabilityPct/100-(x.status==='validated'?1:0))**2,0)/complete.length:null};
}
