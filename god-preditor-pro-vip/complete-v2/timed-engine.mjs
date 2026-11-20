/** Public TimedPredictions-CONzHsI0.js math, 2026-11-20.
 * Probabilities are historical independence-model estimates, not measured accuracy.
 * Production supplies own Supabase records; original remote overrides are optional.
 */
export const TIMED_VERSION = 'public-timed-20261120';
export const TIMED_DURATIONS = [3,6,7,10,30,61];
export const TIMED_LEVELS = [2,5,10,100,1000];
export const TIMED_INGEST_MS = 3600;
export const TIMED_RESULT_MS = 40000;
export function timedTime(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value.trim()) return NaN;
  const explicitZone = /([zZ]|[+-]\d\d(:?\d\d)?)$/.test(value);
  const first = new Date(explicitZone ? value : value.replace(' ','T')+'Z').getTime();
  return Number.isFinite(first) ? first : new Date(value).getTime();
}
export function timedRows(rows) {
  return rows.filter(row => row.completed !== false && row.estimated !== true).flatMap(row => {
    const coefficient = Number(row.coefficient ?? row.x);
    const sourceTime = row.played_at ?? row.round_timestamp ?? row.timestamp;
    const stamp = timedTime(sourceTime);
    return Number.isFinite(coefficient) && Number.isFinite(stamp) ? [{coefficient, played_at:typeof sourceTime === 'string' ? sourceTime : new Date(stamp).toISOString()}] : [];
  });
}
export function timedChance(pct, minutes, perHour) {
  const count = Math.max(0, Math.round(minutes*perHour/60));
  return (1-Math.pow(1-pct/100,count))*100;
}
export function timedPerHour(count,start,end) {
  const hours = (timedTime(end)-timedTime(start))/3600000;
  return hours > 0 ? count/hours : 0;
}
export function timedLargest(duration,pct,perHour,minimum=69) {
  let largest=null;
  for (const level of TIMED_LEVELS) {
    const chance=timedChance(pct[level]??0,duration,perHour);
    if (chance>=minimum) largest={level,chance};
  }
  return largest;
}
export function timedValid(prediction) {
  return !!prediction && [5,10,20,100].includes(prediction.level) && Number.isFinite(prediction.chance) && prediction.chance>=0 && prediction.chance<=100 && Number.isFinite(timedTime(prediction.startAt)) && (prediction.level===5 ? prediction.minutes===1.5 : prediction.minutes>=2 && prediction.minutes<=3);
}
export function timedEmpiricalWindows(rows) {
  return [30,61].flatMap(minutes=>{
    const hits={20:0,100:0};
    let sample=0,index=0;
    while(index<rows.length-1) {
      const end=timedTime(rows[index].played_at)+minutes*60000;
      let next=index+1,covered=true,largest=0;
      while(next<rows.length && timedTime(rows[next].played_at)<=end) {
        if(timedTime(rows[next].played_at)-timedTime(rows[next-1].played_at)>180000) covered=false;
        largest=Math.max(largest,rows[next].coefficient);
        next++;
      }
      if(next>=rows.length) break;
      if(timedTime(rows[next].played_at)-timedTime(rows[next-1].played_at)>180000) covered=false;
      if(covered) {
        sample++;
        if(largest>=20) hits[20]++;
        if(largest>=100) hits[100]++;
      }
      index=next;
    }
    return [20,100].map(level=>{
      const p=sample ? hits[level]/sample : 0;
      const z=1.96;
      const lower=sample ? (p+z*z/(2*sample)-z*Math.sqrt(p*(1-p)/sample+z*z/(4*sample*sample)))/(1+z*z/sample)*100 : 0;
      return {level,minutes,sample,chance:p*100,lower};
    });
  });
}
export function timedAnalyze(rows,nowMs=Date.now()) {
  const seen=new Set();
  const clean=timedRows(rows).filter(row=>{
    const at=timedTime(row.played_at);
    if(!Number.isFinite(at)||at>nowMs||!Number.isFinite(row.coefficient)||row.coefficient<1||seen.has(at)) return false;
    seen.add(at); return true;
  }).sort((a,b)=>timedTime(a.played_at)-timedTime(b.played_at));
  if(clean.length<500) return null;
  const gaps=clean.slice(1).map((row,index)=>timedTime(row.played_at)-timedTime(clean[index].played_at)).filter(gap=>gap>0&&gap<=180000).sort((a,b)=>a-b);
  if(gaps.length<100) return null;
  const middle=Math.floor(gaps.length/2);
  const median=gaps.length%2 ? gaps[middle] : (gaps[middle-1]+gaps[middle])/2;
  const pct={};
  for(const level of [2,5,10,20,100,1000]) pct[level]=100*clean.filter(row=>row.coefficient>=level).length/clean.length;
  return {pct,perHour:3600000/median,sample:clean.length,cutoff:clean.at(-1).played_at,windows:timedEmpiricalWindows(clean)};
}
export function timedKind(latest) {
  return latest[0]?.coefficient>=10 ? 'gold' : latest.length>=3&&latest.slice(0,3).every(row=>row.coefficient>=1&&row.coefficient<1.3) ? 'fall' : 'scan';
}
export function timedChoose(rates,latest,startAt,nowMs=Date.now()) {
  if(!rates) return null;
  latest=timedRows(latest);
  const cutoff=timedTime(rates.cutoff), newest=timedTime(latest[0]?.played_at);
  if(!Number.isFinite(cutoff)||cutoff>nowMs||nowMs-cutoff>180000||!Number.isFinite(timedTime(startAt))||!Number.isFinite(newest)||nowMs-newest>180000||newest>nowMs||!Number.isFinite(rates.perHour)||rates.perHour<=0) return null;
  const kind=timedKind(latest);
  for(const level of [100,20]) {
    const observed=rates.pct[level];
    if(!Number.isFinite(observed)||observed<=0||observed>100||rates.sample<500) continue;
    const p=observed/100,n=rates.sample,z=1.96;
    const lower=(p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/(1+z*z/n);
    if(timedChance(lower*100,3,rates.perHour)>=69) return {level,minutes:3,chance:timedChance(observed,3,rates.perHour),startAt,reason:'Fréquence observée · estimation prudente'};
  }
  const choices=kind==='gold'?[[5,1.5]]:kind==='fall'?[[10,3]]:[[5,1.5],[10,2],[10,2.5],[10,3],[20,2],[20,2.5],[20,3],[100,3]];
  let best=null,eligible=null;
  for(const [level,minutes] of choices) {
    const observed=rates.pct[level];
    if(!Number.isFinite(observed)||observed<=0||observed>100) continue;
    const chance=timedChance(observed,minutes,rates.perHour);
    const item={level,minutes,chance,startAt,reason:kind==='gold'?'Après cote d’or':kind==='fall'?'Trois petites cotes':'Analyse des tours'};
    if(!best||chance>best.chance) best=item;
    if(kind==='scan'&&chance>=35&&(!eligible||level>eligible.level||level===eligible.level&&minutes<eligible.minutes)) eligible={...item,reason:'Cote avancée · analyse des tours'};
  }
  return kind!=='scan'?best:eligible??best;
}
export function timedRemoteOverrides(rates,response) {
  const out={...rates,pct:{...rates.pct}};
  for(const level of [2,5,10,100]) {
    const value=response?.global?.['p'+level];
    if(Number.isFinite(value)&&value>=0&&value<=100) out.pct[level]=value;
  }
  return out;
}
export function timedEvaluateOriginal(prediction,rows,latestAt) {
  // Compatibility only. Production outcome checks must separately check coverage.
  const start=timedTime(prediction.startAt), end=start+prediction.minutes*60000;
  if(!Number.isFinite(end)) return null;
  const first=timedRows(rows).sort((a,b)=>timedTime(a.played_at)-timedTime(b.played_at)).find(row=>timedTime(row.played_at)>start&&timedTime(row.played_at)<=end&&Number.isFinite(row.coefficient)&&row.coefficient>=prediction.level);
  return first?{...prediction,ok:true,hit:first.coefficient}:timedTime(latestAt)>end?{...prediction,ok:false,hit:null}:null;
}
