/** Canonical, credential-free source-compatible scheduling. All reads are as-of now.
 * Probabilities are model estimates; rule scores and theoretical constants are labelled.
 * Server persists creations, outcomes and this small state atomically under one lease.
 */
import {normalizeRounds,parseTime,analyzeReport,analyzeAll,validateWindow,betaQuantile,gammaQuantile} from '../site/engine.mjs';
import {timedAnalyze,timedChoose,timedRemoteOverrides,timedLargest,timedChance,timedPerHour,TIMED_DURATIONS} from '../site/timed-engine.mjs';
export const SCHEDULER_VERSION='god-complete-canonical-v3-20261121';
export const DURATIONS=[3,6,7,10,30,61];
export const ROUND_TARGETS=[5,10,100];
export const VIP_TARGETS=[10,20,40,50,100,200,500];
const M=60000;
const number=v=>typeof v==='boolean'||v==null?null:Number.isFinite(Number(v))?Number(v):null;
const finite=v=>number(v)!=null;
const median=xs=>{if(!xs.length)return 0;const s=[...xs].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2};
const stamp=v=>typeof v==='number'?v:parseTime(v);
const clone=x=>JSON.parse(JSON.stringify(x??{}));
export function stableSignalId(channel,start,basis,version=SCHEDULER_VERSION){
 const bytes=new TextEncoder().encode([version,channel,Math.round(start),String(basis)].join('|'));
 const hash=seed=>{let h=seed>>>0;for(const b of bytes){h^=b;h=Math.imul(h,16777619)>>>0}return h.toString(16).padStart(8,'0')};
 return 'g3_'+hash(2166136261)+hash(3335557771);
}
export function minimumRounds(pct,minimum=69){
 if(!finite(pct)||pct<=0||pct>100||!finite(minimum)||minimum<=0||minimum>=100)return null;
 if(pct===100)return 1;
 const n=Math.ceil(Math.log(1-minimum/100)/Math.log(1-pct/100));
 return Number.isSafeInteger(n)&&n>0?n:null;
}
export function fullHistoryFrequency(analytics){
 const g=analytics?.global??{},total=number(analytics?.total),first=stamp(analytics?.first),last=stamp(analytics?.last);
 if(!Number.isSafeInteger(total)||total<1||!Number.isFinite(first)||first<=0||!Number.isFinite(last)||last<=first)return null;
 const pct={};for(const level of [2,5,10,100]){const p=number(g['p'+level]);if(p==null||p<0||p>100)return null;pct[level]=p;}
 pct[1000]=.095;
 pct[10000]=finite(g.n10000)?Number(g.n10000)/total*100:0;
 return {pct,perHour:timedPerHour(total,first,last),total,first,last,source:'own_full_history',assumptions:{1000:{pct:.095,kind:'fixed_theoretical_baseline',measured:false}},calibrated:false};
}
export function waitingChanceTable(analytics){
 const full=fullHistoryFrequency(analytics);if(!full)return [];
 return [2,5,10,100,1000,10000].map(target=>({target,pct:full.pct[target],probabilitySource:target===1000?'fixed_theoretical_baseline':'own_full_history',measured:target!==1000,cells:[5,10,30,60,180,1440].map(minutes=>({minutes,chance:timedChance(full.pct[target],minutes,full.perHour)}))}));
}
function unpack(s){
 let meta=s?.metadata??{};if(typeof meta==='string'){try{meta=JSON.parse(meta)}catch{meta={}}}
 const x={...meta,...s};
 for(const [key,alias] of [['start','start_at'],['end','end_at'],['issuedAt','issued_at'],['resultAt','result_at']]){
  const value=x[key]??x[alias];x[key]=value==null?null:stamp(value);
 }
 x.target=number(x.target);x.actual=number(x.actual);x.windowKind=x.windowKind??'time';x.status=x.status??'pending';
 return x;
}
function temporalCoverage(rows,from,to,{needBefore=true,needAfter=true,avgRoundSeconds=null}={}){
 const s=[...rows].sort((a,b)=>a.timestamp-b.timestamp),inside=s.filter(r=>r.timestamp>from&&r.timestamp<=to),before=s.filter(r=>r.timestamp<=from).at(-1),after=s.find(r=>r.timestamp>to);
 if(needBefore&&!before||needAfter&&!after||!inside.length)return {ok:false,reason:'Не подтверждены границы истории'};
 const gaps=s.slice(1).map((r,i)=>r.timestamp-s[i].timestamp).filter(x=>x>0);
 const supplied=number(avgRoundSeconds),pace=supplied!=null&&supplied>0?supplied:gaps.length>=10?median(gaps)/1000:0;
 const maxGap=Math.min(180000,Math.max(60000,pace*3000));
 const relevant=[...(before?[before]:[]),...inside,...(needAfter&&after?[after]:[])];
 if(relevant.slice(1).some((r,i)=>r.timestamp-relevant[i].timestamp>maxGap))return {ok:false,reason:'В истории есть большой разрыв',maxGap};
 return {ok:true,reason:'Покрытие по временным границам и интервалам',maxGap};
}
export function evaluateCanonicalSignal(raw,input,now){
 const s=unpack(raw),rows=normalizeRounds(input,now),open=s.boundaryPolicy!=='closed';
 if(!finite(s.start)||!finite(s.target))return {status:'unknown',actual:null,resultAt:null,roundId:null,reason:'Повреждены неизменяемые поля сигнала'};
 const evidence=s.evidence;
 if(s.windowKind==='rounds'){
  const n=Number(s.roundsRequired??s.plannedRounds??s.rounds);
  if(!Number.isSafeInteger(n)||n<1)return {status:'unknown',actual:null,resultAt:null,roundId:null,reason:'Нет корректного числа раундов'};
  if(evidence&&['pending','hit','miss','unknown'].includes(evidence.status)){
   const count=number(evidence.count??0),actual=number(evidence.actual),at=evidence.resultAt!=null?stamp(evidence.resultAt):null;
   const invalidCount=count==null||!Number.isSafeInteger(count)||count<0||count>n;
   const invalidAt=at!=null&&(!Number.isFinite(at)||at<=s.start||at>now);
   const invalidHit=evidence.status==='hit'&&(actual==null||actual<s.target||at==null||count<1);
   const invalidMiss=evidence.status==='miss'&&(count<n||actual==null||actual>=s.target||at==null);
   return {status:invalidCount||invalidAt||invalidHit||invalidMiss?'unknown':evidence.status,actual,resultAt:invalidAt?null:at,roundId:evidence.roundId??null,reason:invalidCount||invalidAt||invalidHit||invalidMiss?'Некорректное серверное подтверждение количества/границ':evidence.coverageReason??evidence.reason??'Проверено по серверной истории',count:invalidCount?0:count,roundsRemaining:Math.max(0,n-(invalidCount?0:count)),coverageBasis:'received_exact_rounds',providerCompletenessVerified:false};
  }
  const relevant=[...rows].reverse().filter(r=>r.timestamp>s.start).slice(0,n),firstHit=relevant.find(r=>r.coefficient>=s.target),last=relevant.at(-1);
  const result={actual:relevant.length?Math.max(...relevant.map(r=>r.coefficient)):null,resultAt:firstHit?.timestamp??last?.timestamp??null,roundId:firstHit?.id??last?.id??null,count:relevant.length,roundsRemaining:Math.max(0,n-relevant.length),coverageBasis:'received_exact_rounds',providerCompletenessVerified:false};
  if(!firstHit&&relevant.length<n)return {...result,status:'pending',reason:'Ожидаются следующие полученные завершённые раунды'};
  // This channel means first N received exact records, not an unverified provider sequence.
  // A positive observed coefficient is proof under that stated basis, even after a pause.
  if(firstHit)return {...result,status:'hit',reason:'Цель достигнута в первых N полученных завершённых раундах'};
  const stop=last.timestamp,cov=temporalCoverage(rows,s.start,stop,{needAfter:false,avgRoundSeconds:s.avgRoundSeconds});
  if(!cov.ok)return {...result,status:'unknown',reason:cov.reason};
  return {...result,status:firstHit?'hit':'miss',reason:firstHit?'Цель достигнута в первых N полученных завершённых раундах':'Первые N полученных завершённых раундов проверены'};
 }
 if(!finite(s.end)||s.end<=s.start)return {status:'unknown',actual:null,resultAt:null,roundId:null,reason:'Нет корректного конца окна'};
 if(now<=s.end)return {status:'pending',actual:null,resultAt:null,roundId:null,reason:'Окно ещё не закрыто'};
 if(evidence&&['hit','miss','unknown'].includes(evidence.status)){
  const actual=number(evidence.actual),at=evidence.resultAt!=null?stamp(evidence.resultAt):null;
  const invalidAt=at!=null&&(!Number.isFinite(at)||at>now||at>s.end||(open?at<=s.start:at<s.start));
  const invalidHit=evidence.status==='hit'&&(actual==null||actual<s.target||at==null);
  const invalidMiss=evidence.status==='miss'&&(actual==null||actual>=s.target||at==null);
  return {status:invalidAt||invalidHit||invalidMiss?'unknown':evidence.status,actual,resultAt:invalidAt?null:at,roundId:evidence.roundId??null,reason:invalidAt||invalidHit||invalidMiss?'Некорректное серверное подтверждение границ/цели':evidence.coverageReason??evidence.reason??'Проверено по серверной истории',coverageBasis:'temporal_boundaries_and_gaps',providerCompletenessVerified:false};
 }
 const inside=rows.filter(r=>(open?r.timestamp>s.start:r.timestamp>=s.start)&&r.timestamp<=s.end),best=inside.reduce((a,r)=>!a||r.coefficient>a.coefficient?r:a,null);
 const result={actual:best?.coefficient??null,resultAt:best?.timestamp??null,roundId:best?.id??null,coverageBasis:'temporal_boundaries_and_gaps',providerCompletenessVerified:false};
 if(best&&best.coefficient>=s.target)return {...result,status:'hit',reason:'Цель достигнута внутри закрытого окна'};
 const cov=temporalCoverage(rows,open?s.start:s.start-1,s.end,{avgRoundSeconds:s.avgRoundSeconds});
 return {...result,status:cov.ok?'miss':'unknown',reason:cov.ok?'Цель не достигнута при подтверждённом временном покрытии':cov.reason};
}
function fullThreshold(analytics,rows,target,now,fallback){
 const list=analytics?.thresholdStats??analytics?.thresholds;
 let stats=Array.isArray(list)?list.find(x=>Number(x.target??x.threshold)===target):list?.[target];
 if(!stats)return {...fallback,historySource:'latest_loaded_history',fullHistoryAvailable:false};
 const full=fullHistoryFrequency(analytics),n=Number(analytics.total),cutoff=stamp(analytics.last),hit=rows.find(r=>r.coefficient>=target);
 // Keep probability numerator, denominator and exposure at the same cached cutoff.
 // Descriptive last-hit timing may separately use a newer exact head record.
 const count=Number(stats.count??stats.events??stats.hits??0),med=number(stats.medianGapMs??stats.medGap??stats.median_gap_ms),mad=number(stats.madGapMs??stats.madGap??stats.mad_gap_ms)??0,lastFull=stamp(stats.lastHitAt??stats.last),last=Math.max(Number.isFinite(lastFull)?lastFull:0,hit?.timestamp??0);
 if(!full||!Number.isSafeInteger(count)||count<0||count>n)return {...fallback,historySource:'latest_loaded_history',fullHistoryAvailable:false,fullHistoryError:'Некорректный агрегат полной истории'};
 const out={...fallback,modelVersion:'god-full-history-threshold-v3-20261121',sampleSize:n,events:count,lastHitAt:last||null,medianGapMs:med??0,madGapMs:mad,estimatedAt:null,status:'waiting',historySource:'own_full_history',fullHistoryAvailable:true,dataCutoff:rows[0]?.timestamp??null,statisticsCutoff:cutoff,probabilityAsOf:cutoff,reason:''};
 if(full&&count>=0){const shape=Math.max(0,count-Number(analytics.firstCoefficient>=target))+.5,span=(full.last-full.first)/M,w=3,a=count+.5,b=Math.max(.5,n-count+.5);out.probability=-Math.expm1(-shape*Math.log1p(w/span));out.confidence=out.probability*100;out.interval95=[.025,.975].map(q=>-Math.expm1(-gammaQuantile(q,shape)/span*w));out.perRoundProbability=a/(a+b);out.perRoundInterval95=[betaQuantile(.025,a,b),betaQuantile(.975,a,b)];}
 if(count<5||!last||!med||med<=0){out.reason=`Недостаточно событий ≥${target}× для оценки интервала`;return out;}
 const expected=last+med;out.historicalExpectedAt=expected;
 if(expected<=now){out.status='overdue';out.reason='Медианная историческая отметка прошла; новая точная дата не доказана';return out;}
 if(expected-now<40000){out.reason='Недостаточно времени для опережающего уведомления';return out;}
 return {...out,status:'candidate',estimatedAt:expected,start:expected,end:expected+180000,windowMs:180000,basisEvent:`${target}:${last}`,reason:`Оценка по ${count} событиям ≥${target}× всей доступной истории; медианный интервал ${(med/M).toFixed(1)} мин`};
}
function newSignal(fields,now,rows){
 const start=Math.round(fields.start),basis=String(fields.basisId??fields.basisEvent??rows[0]?.id??start),windowKind=fields.windowKind??'time';
 const gaps=rows.slice(1).map((r,i)=>rows[i].timestamp-r.timestamp).filter(v=>v>0&&v<=180000),supplied=number(fields.avgRoundSeconds),pace=supplied!=null&&supplied>0?supplied:gaps.length>=10?median(gaps)/1000:null;
 return {...fields,id:stableSignalId(fields.channel,start,basis),start,end:windowKind==='rounds'?null:Math.round(fields.end),issuedAt:now,basisId:basis,modelVersion:fields.modelVersion??SCHEDULER_VERSION,schedulerVersion:SCHEDULER_VERSION,avgRoundSeconds:pace,windowKind,status:'pending',calibrated:false,sourceCutoff:rows[0]?.timestamp??null,sourceSampleSize:rows.length,boundaryPolicy:fields.boundaryPolicy??'open_start',providerCompletenessVerified:false};
}
export function planSnapshot({now=Date.now(),rounds=[],analytics=null,signals=[],state={}}={}){
 const invalidAnalytics=analytics&&(stamp(analytics.last)>now||stamp(analytics.first)>now);
 if(invalidAnalytics)analytics=null;
 now=Math.round(now);const rows=normalizeRounds(rounds,now),existing=(signals??[]).map(unpack),next=clone(state),created=[],outcomes=[],effective=new Map(existing.map(s=>[s.id,s]));
 next.version=SCHEDULER_VERSION;next.lastBasis??={};next.premium={lastBasisId:null,cooldownUntil:0,ingest:null,...(next.premium??{})};
 if(next.premium.ingest&&now>=next.premium.ingest.readyAt)next.premium.ingest=null;
 const progress={};
 for(const s of existing){
  if(!['pending','unknown'].includes(s.status))continue;
  const result=evaluateCanonicalSignal(s,rows,now);if(s.windowKind==='rounds')progress[s.id]={roundsObserved:result.count??0,roundsRemaining:result.roundsRemaining??s.roundsRequired,remainingRounds:result.roundsRemaining??s.roundsRequired};
  if(result.status==='pending')continue;
  if(result.status!==s.status||result.actual!==s.actual||result.resultAt!==s.resultAt){const o={id:s.id,...result,checkedAt:now};outcomes.push(o);effective.set(s.id,{...s,...o});if(s.channel==='premium_live'){if(s.status==='pending'){next.premium.cooldownUntil=now+40000;next.premium.lastResult={...s,...o};}else if(next.premium.lastResult?.id===s.id)next.premium.lastResult={...s,...o};}}
 }
 const pending=channel=>[...effective.values(),...created].some(s=>s.channel===channel&&s.status==='pending');
 const last=channel=>[...effective.values(),...created].filter(s=>s.channel===channel).sort((a,b)=>(b.issuedAt??0)-(a.issuedAt??0))[0];
 const canBasis=(channel,basis)=>String(next.lastBasis[channel]??last(channel)?.basisId??'')!==String(basis);
 const add=fields=>{if(pending(fields.channel))return null;const basis=fields.basisId??fields.basisEvent??rows[0]?.id;if(!canBasis(fields.channel,basis))return null;const s=newSignal({...fields,basisId:basis},now,rows);created.push(s);next.lastBasis[s.channel]=s.basisId;return s;};
 const fresh=!!rows.length&&now-rows[0].timestamp<=180000;
 const full=fullHistoryFrequency(analytics);
 const diagnostics={version:SCHEDULER_VERSION,now,fresh,sampleSize:rows.length,dataCutoff:rows[0]?.timestamp??null,fullHistory:full,progress,waitingChanceTable:waitingChanceTable(analytics),warnings:[]};
 if(invalidAnalytics)diagnostics.warnings.push('Будущая граница агрегированной истории отклонена');
 if(!fresh){diagnostics.reason='Нет свежей точной завершённой истории';return {signals:created,outcomes,state:next,diagnostics};}
 const report=analyzeReport(rows,now);Object.assign(diagnostics,report,{fullHistory:full,progress,waitingChanceTable:waitingChanceTable(analytics)});
 diagnostics.thresholds=VIP_TARGETS.map(t=>fullThreshold(analytics,rows,t,now,report.thresholds.find(x=>x.target===t)));
 // Main Vortex samples are refreshed once per 60 seconds, then frozen through ingestion.
 if(!next.rates||now-Number(next.rates.computedAt??0)>=60000||now<Number(next.rates.computedAt??0)){
  let value=timedAnalyze(rows.slice(0,5000),now);if(value&&full)value=timedRemoteOverrides(value,analytics);
  next.rates={computedAt:now,value,source:full?'own_full_history_global_override':'own_latest_5000'};
 }
 const sourceRates=next.rates?.value;diagnostics.sourceRates=sourceRates;diagnostics.timedRates=sourceRates;diagnostics.rateSource=next.rates?.source;
 diagnostics.timedDurations=full?DURATIONS.map(minutes=>({minutes,proposal:timedLargest(minutes,full.pct,full.perHour),probabilitySource:'own_full_history',theoretical1000Pct:.095})):[];
 if(!full)diagnostics.warnings.push('Полная агрегированная история недоступна; глубокие каналы приостановлены');
 if(!pending('premium_live')&&now>=Number(next.premium.cooldownUntil??0)&&rows[0].id!==next.premium.lastBasisId){
  const proposal=timedChoose(sourceRates,rows.slice(0,3),now+3600,now);
  if(proposal){const start=now+3600,s=add({channel:'premium_live',target:proposal.level,start,end:start+proposal.minutes*M,windowMs:proposal.minutes*M,minutes:proposal.minutes,confidence:proposal.chance,scoreKind:'independence_model_probability',reason:proposal.reason,modelKind:'original_timed_vortex',probabilitySource:next.rates.source,basisId:rows[0].id,liveWindow:true});
   if(s){next.premium.lastBasisId=rows[0].id;next.premium.ingest={createdAt:now,readyAt:start,signalId:s.id,basisId:rows[0].id,proposal:{level:proposal.level,minutes:proposal.minutes,chance:proposal.chance},coefs:rows.slice(0,3).reverse().map(r=>r.coefficient)};}}
 }
 for(const candidate of analyzeAll(rows,now,report)){
  if(candidate.channel==='premium_live'||candidate.channel.startsWith('vip_'))continue;
  if(!finite(candidate.estimatedAt)||candidate.estimatedAt-now<40000)continue;
  add({...candidate,start:candidate.estimatedAt,end:candidate.estimatedAt+candidate.windowMs,basisId:candidate.basisEvent??rows[0].id,boundaryPolicy:'closed'});
 }
 for(const candidate of diagnostics.thresholds){if(candidate.estimatedAt!=null)add({...candidate,start:candidate.estimatedAt,end:candidate.estimatedAt+candidate.windowMs,basisId:candidate.basisEvent,boundaryPolicy:'closed'});}
 if(full&&full.perHour>0){
  for(const minutes of DURATIONS){const channel='duration_'+minutes;if(pending(channel))continue;const proposal=timedLargest(minutes,full.pct,full.perHour);if(!proposal)continue;
   const start=rows[0].timestamp,end=start+minutes*M;if(end-now<30000)continue;
   add({channel,target:proposal.level,start,end,windowMs:minutes*M,minutes,confidence:proposal.chance,scoreKind:'independence_model_probability',modelKind:'original_deep_duration',probabilitySource:proposal.level===1000?'fixed_theoretical_baseline':'own_full_history',theoretical1000Pct:.095,backdatedStart:start<now,basisId:rows[0].id,anchorRoundId:rows[0].id});
  }
  for(const target of ROUND_TARGETS){const channel='rounds_'+target;if(pending(channel))continue;const required=minimumRounds(full.pct[target]);if(!required)continue;
   const start=rows[0].timestamp,chance=timedChance(full.pct[target],required*60/full.perHour,full.perHour);
   add({channel,target,start,end:null,estimatedEnd:start+required/full.perHour*3600000,windowKind:'rounds',roundsRequired:required,plannedRounds:required,rounds:required,roundsObserved:0,roundsRemaining:required,remainingRounds:required,confidence:chance,scoreKind:'independence_model_probability',modelKind:'original_deep_rounds',probabilitySource:'own_full_history',roundBasis:'received_exact_rounds',backdatedStart:start<now,approximateTime:true,basisId:rows[0].id,anchorRoundId:rows[0].id});
  }
 }
 const all=[...effective.values(),...created];diagnostics.channelStatistics={};diagnostics.channelStatisticsScope='snapshot_visible_signals';
 for(const s of all){const a=diagnostics.channelStatistics[s.channel]??={created:0,hit:0,miss:0,unknown:0,pending:0};a.created++;a[s.status]=(a[s.status]??0)+1;}
 const canonicalPremium=all.find(s=>s.channel==='premium_live'&&s.status==='pending');
 diagnostics.compatibilityOnlyLocalTimed=diagnostics.timed;
 diagnostics.timed=canonicalPremium?{level:canonicalPremium.target,minutes:canonicalPremium.minutes??canonicalPremium.windowMs/M,chance:canonicalPremium.confidence,startAt:canonicalPremium.start,reason:canonicalPremium.reason,canonical:true}:null;
 diagnostics.premium={...next.premium};diagnostics.generated=created.length;
 return {signals:created,outcomes,state:next,diagnostics};
}
