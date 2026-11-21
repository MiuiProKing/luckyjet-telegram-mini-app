import test from 'node:test';
import assert from 'node:assert/strict';
import {planSnapshot,evaluateCanonicalSignal,minimumRounds,fullHistoryFrequency,waitingChanceTable,stableSignalId} from './scheduler.mjs';
const NOW=1795208400000;
function rows(now=NOW,count=5000){return Array.from({length:count},(_,i)=>({id:'round-'+i,coefficient:i%200===199?25:i%31===30?12:i%7===6?3.2:1.1,timestamp:now-1000-i*12000,completed:true,estimated:false}));}
function analytics(now=NOW){return{total:200000,first:now-60*86400000,last:now-1000,firstCoefficient:1.2,global:{p2:47.22,p5:18.88,p10:9.45,p100:.956,n10000:12,n50000:1},thresholdStats:[10,20,40,50,100,200,500].map((target,i)=>({target,count:Math.max(5,Math.floor(200000/target)),lastHitAt:now-(i+1)*30000,medianGapMs:600000+i*300000,madGapMs:60000}))};}
function persist(existing,plan){const by=new Map(existing.map(x=>[x.id,x]));for(const o of plan.outcomes)by.set(o.id,{...by.get(o.id),...o});for(const s of plan.signals)by.set(s.id,s);return[...by.values()];}
function coverage(start,end,target=1.1,hitAt=null){const out=[];for(let at=start-10000,i=0;at<=end+20000;at+=10000,i++)out.push({id:'c'+i,timestamp:at,coefficient:at===hitAt?target:1.1,completed:true});return out;}
test('all source operational channels and full-history VIP extensions exist',()=>{
 const p=planSnapshot({now:NOW,rounds:rows(),analytics:analytics()});
 const channels=new Set(p.signals.map(s=>s.channel));
 for(const channel of ['premium_live','basic','duration_3','duration_6','duration_7','duration_10','duration_30','duration_61','rounds_5','rounds_10','rounds_100','vip_500'])assert(channels.has(channel),channel);
 assert.equal(p.diagnostics.fullHistory.total,200000);assert.equal(p.diagnostics.thresholds.find(x=>x.target===500).historySource,'own_full_history');
 assert.equal(p.signals.find(s=>s.channel==='rounds_100').end,null);
});
test('Premium target and rates freeze before exact3.6s ingestion',()=>{
 const input=rows(),a=analytics(),p1=planSnapshot({now:NOW,rounds:input,analytics:a});const win=p1.signals.find(s=>s.channel==='premium_live');
 assert.equal(win.start,NOW+3600);assert.equal(win.issuedAt,NOW);assert.equal(p1.state.premium.ingest.readyAt,win.start);
 const p2=planSnapshot({now:NOW+1000,rounds:[{id:'NEWGOLD',coefficient:100,timestamp:NOW+500},...input],analytics:a,signals:p1.signals,state:p1.state});
 assert(!p2.signals.some(s=>s.channel==='premium_live'));assert.equal(p2.state.premium.ingest.proposal.level,win.target);assert.equal(p2.state.rates.computedAt,p1.state.rates.computedAt);
});
test('one pending signal per channel; retry is deterministic and creates no second window',()=>{
 const input=rows(),a=analytics(),p=planSnapshot({now:NOW,rounds:input,analytics:a});
 const again=planSnapshot({now:NOW,rounds:input,analytics:a,signals:p.signals,state:p.state});assert.equal(again.signals.length,0);
 assert.deepEqual(planSnapshot({now:NOW,rounds:input,analytics:a}),p);
});
test('time signal uses source open-start inclusive-end and closes only after end',()=>{
 const s={id:'t',channel:'premium_live',target:10,start:NOW,end:NOW+30000,boundaryPolicy:'open_start'};
 assert.equal(evaluateCanonicalSignal(s,[{id:'edge',coefficient:100,timestamp:NOW},...coverage(NOW,NOW+30000)],NOW+50001).status,'miss');
 const withEnd=coverage(NOW,NOW+30000,10,NOW+30000);
 assert.equal(evaluateCanonicalSignal(s,withEnd,NOW+30000).status,'pending');assert.equal(evaluateCanonicalSignal(s,withEnd,NOW+30001).status,'hit');
});
test('time HIT survives gaps, MISS without coverage remains UNKNOWN',()=>{
 const s={id:'t',target:10,start:NOW,end:NOW+180000};
 assert.equal(evaluateCanonicalSignal(s,[{id:'hit',coefficient:11,timestamp:NOW+170000}],NOW+180001).status,'hit');
 assert.equal(evaluateCanonicalSignal(s,[{id:'before',coefficient:1.1,timestamp:NOW-1},{id:'inside',coefficient:1.1,timestamp:NOW+170000},{id:'after',coefficient:1.1,timestamp:NOW+180001}],NOW+180002).status,'unknown');
});
test('server evidence verifies restored windows outside the loaded5000',()=>{
 const s={id:'old',target:200,start:NOW-9999999,end:NOW-9990000,evidence:{status:'hit',actual:233,resultAt:NOW-9990010,roundId:'proof'}};
 assert.equal(evaluateCanonicalSignal(s,rows(),NOW).status,'hit');assert.equal(evaluateCanonicalSignal(s,rows(),NOW).actual,233);
});
test('unknown retained and can revise after backfill; no repeated no-op unknown events',()=>{
 const s={id:'old',channel:'duration_3',target:100,start:NOW-600000,end:NOW-420000,issuedAt:NOW-601000,status:'unknown',actual:null,resultAt:null,basisId:'old',evidence:{status:'unknown',actual:null,resultAt:null,coverageReason:'gap'}};
 const p=planSnapshot({now:NOW,rounds:rows(),analytics:analytics(),signals:[s]});assert(!p.outcomes.some(o=>o.id==='old'));assert(p.signals.some(o=>o.channel==='duration_3'));
 const r=planSnapshot({now:NOW,rounds:rows(),analytics:analytics(),signals:[{...s,evidence:{status:'hit',actual:120,resultAt:NOW-500000,roundId:'late'}}]});assert.equal(r.outcomes.find(o=>o.id==='old').status,'hit');
});
test('Premium persists40second cooldown after a closed result',()=>{
 const first=planSnapshot({now:NOW,rounds:rows(),analytics:analytics()}),s=first.signals.find(s=>s.channel==='premium_live'),at=s.end+1;
 const e={...s,evidence:{status:'hit',actual:s.target+1,resultAt:s.start+10000,roundId:'h'}};
 const data=coverage(s.start,s.end);const p=planSnapshot({now:at,rounds:[...data,...rows()],analytics:analytics(at),signals:[e],state:first.state});
 assert.equal(p.state.premium.cooldownUntil,at+40000);assert(!p.signals.some(x=>x.channel==='premium_live'));
 const p2=planSnapshot({now:at+39999,rounds:[...data,...rows()],analytics:analytics(at),signals:persist([e],p),state:p.state});assert(!p2.signals.some(x=>x.channel==='premium_live'));
});
test('round channels count first N actual received IDs, end is never a clock deadline',()=>{
 const s={id:'r',channel:'rounds_5',target:5,start:NOW,windowKind:'rounds',roundsRequired:3,end:null};
 const r=[{id:'anchor',timestamp:NOW,coefficient:1.1},{id:'1',timestamp:NOW+10000,coefficient:1.1},{id:'2',timestamp:NOW+20000,coefficient:6}];
 assert.equal(evaluateCanonicalSignal(s,r,NOW+25000).status,'hit');
 assert.equal(evaluateCanonicalSignal(s,r.map(x=>({...x,coefficient:1.1})),NOW+1000000).status,'pending');
 assert.equal(evaluateCanonicalSignal(s,[...r.map(x=>({...x,coefficient:1.1})),{id:'3',timestamp:NOW+30000,coefficient:1.1}],NOW+30001).status,'miss');
});
test('round gaps prevent a false MISS and duplicate IDs do not consume N',()=>{
 const s={id:'r',target:5,start:NOW,windowKind:'rounds',roundsRequired:3};
 const r=[{id:'a',timestamp:NOW,coefficient:1.1},{id:'b',timestamp:NOW+10000,coefficient:1.1},{id:'c',timestamp:NOW+170000,coefficient:1.1},{id:'d',timestamp:NOW+180000,coefficient:1.1}];
 assert.equal(evaluateCanonicalSignal(s,r,NOW+200000).status,'unknown');
 assert.equal(evaluateCanonicalSignal(s,[r[0],r[1],r[1]],NOW+1000000).count,1);
});
test('full source frequency and theoretical1000baseline are labelled; waittable exact source formula',()=>{
 const a=analytics(),f=fullHistoryFrequency(a),table=waitingChanceTable(a);assert.equal(f.pct[1000],.095);assert.equal(f.assumptions[1000].measured,false);
 const row=table.find(x=>x.target===1000);assert.equal(row.measured,false);assert.equal(row.cells.length,6);
 const expected=(1-(1-.1888)**Math.round(5*f.perHour/60))*100;assert.equal(table.find(x=>x.target===5).cells[0].chance,expected);
});
test('minimumRounds exactly matches original O for normal and boundary frequencies',()=>{
 for(const p of [100,90,47.22,18.88,9.45,.956,.095,1e-8])assert.equal(minimumRounds(p),p>=100?1:Math.ceil(Math.log(1-.69)/Math.log(1-p/100)));
 for(const p of [0,-1,101,NaN,null])assert.equal(minimumRounds(p),null);
});
test('future, incomplete and estimated rows cannot change a forecast',()=>{
 const data=rows(),a=analytics(),p=planSnapshot({now:NOW,rounds:data,analytics:a});
 const extras=[{id:'f',timestamp:NOW+1,coefficient:50000},{id:'e',timestamp:NOW,coefficient:50000,estimated:true},{id:'i',timestamp:NOW,coefficient:50000,completed:false}];
 assert.deepEqual(planSnapshot({now:NOW,rounds:[...extras,...data],analytics:a}),p);
});
test('stale source stops new signals but still accepts server proof for old outcomes',()=>{
 const p=planSnapshot({now:NOW+300000,rounds:rows(),analytics:analytics(),signals:[{id:'x',channel:'basic',target:5,start:NOW-1000,end:NOW+1000,status:'pending',evidence:{status:'hit',actual:6,resultAt:NOW}}]});
 assert.equal(p.signals.length,0);assert.equal(p.outcomes[0].status,'hit');
});
test('deterministic ID is independent of metadata ordering and uses UTF8 correctly',()=>{
 assert.equal(stableSignalId('rounds_5',NOW,'å-id'),stableSignalId('rounds_5',NOW,'å-id'));assert.notEqual(stableSignalId('rounds_5',NOW,'å-id'),stableSignalId('rounds_10',NOW,'å-id'));
 assert.match(stableSignalId('basic',NOW,'x'),/^g3_[0-9a-f]{16}$/);
});
test('server evidence rejects future, out-of-window and out-of-prefix claims',()=>{
 const time={id:'t',target:10,start:NOW-20000,end:NOW-10000};
 for(const evidence of [{status:'hit',actual:20,resultAt:NOW+1},{status:'hit',actual:20,resultAt:NOW-20000},{status:'hit',actual:2,resultAt:NOW-15000},{status:'miss',actual:20,resultAt:NOW-15000}])assert.equal(evaluateCanonicalSignal({...time,evidence},[],NOW).status,'unknown');
 assert.equal(evaluateCanonicalSignal({...time,end:NOW+100,evidence:{status:'hit',actual:20,resultAt:NOW-15000}},[],NOW).status,'pending');
 const round={id:'r',target:5,start:NOW-30000,windowKind:'rounds',roundsRequired:3};
 for(const evidence of [{status:'hit',actual:6,resultAt:NOW-10000,count:4},{status:'miss',actual:1.1,resultAt:NOW-10000,count:2},{status:'hit',actual:6,resultAt:NOW+1,count:2}])assert.equal(evaluateCanonicalSignal({...round,evidence},[],NOW).status,'unknown');
});
test('large real100x HIT within firstNreceived remains valid after long actual round',()=>{
 const s={id:'r',target:100,start:NOW,windowKind:'rounds',roundsRequired:3};
 const r=[{id:'anchor',timestamp:NOW,coefficient:1.1},{id:'large',timestamp:NOW+170000,coefficient:180}];
 assert.equal(evaluateCanonicalSignal(s,r,NOW+170001).status,'hit');assert.equal(evaluateCanonicalSignal(s,r,NOW+170001).count,1);
});
test('cached full-history numerator and denominator stay aligned when newer hit arrives',()=>{
 const a=analytics(),input=rows(),p1=planSnapshot({now:NOW,rounds:input,analytics:a});
 const newer={id:'new-500',coefficient:600,timestamp:NOW+500,completed:true};
 const p2=planSnapshot({now:NOW+1000,rounds:[newer,...input],analytics:a});
 const x=p1.diagnostics.thresholds.find(t=>t.target===500),y=p2.diagnostics.thresholds.find(t=>t.target===500);
 assert.equal(x.probability,y.probability);assert.equal(x.events,y.events);assert.equal(x.sampleSize,y.sampleSize);assert.equal(y.lastHitAt,newer.timestamp);assert.equal(y.probabilityAsOf,a.last);
});
test('NaN or negative average gap cannot silently certify a missing history',()=>{
 const s={id:'t',target:10,start:NOW,end:NOW+180000};const r=[{id:'a',timestamp:NOW,coefficient:1.1},{id:'b',timestamp:NOW+170000,coefficient:1.1},{id:'c',timestamp:NOW+180001,coefficient:1.1}];
 for(const pace of [NaN,-1,0])assert.equal(evaluateCanonicalSignal({...s,avgRoundSeconds:pace},r,NOW+180002).status,'unknown');
});
test('full-statistics future cutoff is rejected rather than leaking upcoming data',()=>{
 const a=analytics();a.last=NOW+100000;
 const p=planSnapshot({now:NOW,rounds:rows(),analytics:a});assert.equal(p.diagnostics.fullHistory,null);assert(!p.signals.some(s=>s.channel.startsWith('duration_')||s.channel.startsWith('rounds_')));assert(p.diagnostics.warnings.length);
});
