export const TARGETS=[1.5,2];
export const MODEL='small-targets-frequency-v1';
const med=a=>{const v=[...a].sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length?(v.length%2?v[i]:(v[i-1]+v[i])/2):0};
const ema=(a,k)=>a.reduce((v,x,i)=>i?k*x+(1-k)*v:x,0);
export function wilson(h,n){if(!n)return [0,1];const z=1.95996398454,p=h/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,r=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [Math.max(0,c-r),Math.min(1,c+r)]}
export function analyze(rounds,now=Date.now()){
 const rows=rounds.filter(r=>Number.isFinite(r.coefficient)&&r.coefficient>=1&&r.timestamp>0&&r.timestamp<=now).sort((a,b)=>a.timestamp-b.timestamp);
 const values=rows.map(r=>r.coefficient),recent=values.slice(-50),m=med(recent),last=rows.at(-1),gaps=rows.slice(-101).slice(1).map((r,i)=>r.timestamp-rows.slice(-101)[i].timestamp).filter(x=>x>0&&x<=180000),cadence=med(gaps);
 return {model:MODEL,n:rows.length,ready:rows.length>=200&&!!last&&now-last.timestamp<=180000,fresh:!!last&&now-last.timestamp<=180000,lastId:last?.id,lastAt:last?.timestamp,ema20:ema(values.slice(-20),.25),ema50:ema(recent,.12),median50:m,mad50:med(recent.map(x=>Math.abs(x-m))),cadenceMs:cadence,nextReferenceAt:last&&cadence?last.timestamp+cadence:null,
  targets:TARGETS.map(target=>{const events=rows.filter(r=>r.coefficient>=target),count=events.length,intervals=events.slice(1).map((r,i)=>r.timestamp-events[i].timestamp),all=rows.length?count/rows.length:0;return {target,count,probability:all,range:wilson(count,rows.length),recentRate:values.length?values.slice(-100).filter(v=>v>=target).length/Math.min(100,values.length):0,medianGapMs:med(intervals),lastHitAt:events.at(-1)?.timestamp??null}})};
}
export function advanceJournal(journal,rounds,stats,now=Date.now(),enabled=true){
 let changed=false;const sorted=[...rounds].filter(r=>r.timestamp<=now).sort((a,b)=>a.timestamp-b.timestamp);
 const next=journal.map(x=>{
  if(x.status!=='pending')return x;
  const result=sorted.find(r=>r.timestamp>x.acceptedAt&&r.id!==x.anchorId);
  if(result){changed=true;const gap=result.timestamp-x.anchorAt,valid=gap<=Math.max(90000,3*(x.cadenceMs||30000))&&result.timestamp<=x.deadline;return {...x,status:valid?(result.coefficient>=x.target?'hit':'miss'):'unknown',actual:result.coefficient,resultId:result.id,resolvedAt:now};}
  if(now>x.deadline){changed=true;return {...x,status:'unknown',resolvedAt:now};}return x;
 });
 if(enabled&&stats.ready)for(const s of stats.targets){
  if(next.some(x=>x.target===s.target&&(x.status==='pending'||x.anchorId===stats.lastId)))continue;
  next.push({key:`${s.target}:${stats.lastId}`,model:MODEL,target:s.target,anchorId:stats.lastId,anchorAt:stats.lastAt,acceptedAt:now,deadline:now+180000,cadenceMs:stats.cadenceMs,probability:s.probability,range:s.range,n:stats.n,status:'pending'});changed=true;
 }
 return {journal:next.slice(-500),changed};
}
export function summary(journal){const known=journal.filter(x=>['hit','miss'].includes(x.status));return {known:known.length,hits:known.filter(x=>x.status==='hit').length,unknown:journal.filter(x=>x.status==='unknown').length,brier:known.length?known.reduce((s,x)=>s+(x.probability-(x.status==='hit'?1:0))**2,0)/known.length:null}}
