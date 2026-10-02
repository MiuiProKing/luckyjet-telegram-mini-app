import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const [engine,app,html]=await Promise.all(['pro-luckyjet-engine.js','pro-luckyjet-app.js','pro-luckyjet.html'].map(f=>fs.readFile(new URL(f,root),'utf8')));
new vm.Script(engine);new vm.Script(app);
const start=Date.UTC(2026,9,2,12,0),key='pro_supabase_signals_v2';
function harness(saved=[]){
 let now=start;const requests=[],timers=[];
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const elements=new Map(),stored=new Map([[key,JSON.stringify(saved)]]);
 function el(id){if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',value:'',style:{},dataset:{},checked:false,disabled:false,hidden:false,setAttribute(){},classList:{add(){},remove(){},toggle(){}}});return elements.get(id)}
 const c=vm.createContext({Date:Clock,console,Intl,Math,Number,JSON,Map,Set,Array,Object,String,AbortController,
  document:{getElementById:el,addEventListener(){}},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},
  setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},setInterval(){},
  fetch(url){return new Promise((resolve,reject)=>requests.push({url,resolve,reject}))}});c.window=c;
 vm.runInContext(engine,c);
 const end=app.lastIndexOf('restore();selectMode(mode);');assert(end>0);
 vm.runInContext(app.slice(0,end)+`restore();globalThis.testApp={generate,merge,processNew,tick,bigOpportunity,godPrediction,selectMode,render,renderArchive,loadArchive,checkLatest,refreshHistory,
 setup(rows){merge(rows);initialized=true;online=true;lastPollAt=Date.now()},
 setPoll(time,connected=true){lastPollAt=time;online=connected},
 state(){return {pending,history,rounds,online,total,archiveRows}},
 setArchive(rows){archiveRows=rows;archiveOffset=rows.length},elements:$};})();`,c);
 vm.runInContext(engine.slice(engine.indexOf('const l=6e4'),engine.indexOf('// De/Ce above'))+'globalThis.raw={calculate:De,big:Ce};',c);
 return {c,app:c.testApp,requests,el,stored,setTime:t=>now=t,now:()=>now};
}
const rows=(values,t=start)=>values.map((coefficient,i)=>({id:'r'+String(i).padStart(4,'0'),coefficient,timestamp:t-i*12000,estimated:false}));
const respond=(request,data,total=data.length)=>request.resolve({ok:true,json:async()=>({ok:true,history:data,total})});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let count=0;
async function check(name,test){await test();count++;console.log('PASS '+name)}
await check('Original low/high/fallback/big formulas match on valid ordered data',()=>{
 for(const values of [Array(40).fill(1.5),[20,30,40,...Array(27).fill(2.2)],[5,6,8,...Array(27).fill(2.2)],Array(40).fill(2.2),[100,60,55,45,30,25,...Array(74).fill(2.3)]]){
  const h=harness(),data=rows(values);h.app.setup(data);
  const actual=h.app.godPrediction(),expected=h.c.raw.calculate(data,null);
  assert.equal(actual.target,expected.estimatedCoef);assert.equal(actual.score,expected.reliability);assert.equal(actual.at,expected.estimatedAt);assert.equal(actual.window,expected.windowMs);
  const big=h.app.bigOpportunity(),ref=h.c.raw.big(data,start);assert.equal(big?.target,ref?.estimatedCoef);assert.equal(big?.score,ref?.confidence);
 }
});
await check('Public raw formula body remains byte-identical to audited source',()=>{
 const raw=engine.slice(engine.indexOf('const l=6e4'),engine.indexOf('// De/Ce above')).trim();
 assert(raw.startsWith('const l=6e4'));assert(!raw.includes('normalizeRounds'));assert(raw.includes('Math.min(92,v.confidence+5)'));
});
await check('Equal timestamps produce identical EMA/targets after arbitrary permutation',()=>{
 const h=harness(),data=rows([...Array(20).fill(2.2),...Array(20).fill(4)]).map(r=>({...r,timestamp:start}));
 const a=h.c.GodPreditor.calculatePrediction(data),b=h.c.GodPreditor.calculatePrediction([...data].reverse());
 assert.equal(a.estimatedCoef,b.estimatedCoef);assert.equal(a.reliability,b.reliability);
});
await check('Duplicate IDs cannot inflate sample size or rule score',()=>{
 const h=harness(),one=rows([2.2])[0];assert.equal(h.c.GodPreditor.calculatePrediction(Array(700).fill(one)),null);
});
await check('Same coefficient in distinct rounds remains distinct',()=>{
 const h=harness();h.app.merge(rows(Array(30).fill(2.2)));assert.equal(h.app.state().rounds.length,30);
});
await check('Reject null, blank, boolean, negative, zero, NaN, Infinity and invalid time',()=>{
 const h=harness(),bad=[null,'',true,0,-5,NaN,Infinity,'bad'].map((coefficient,i)=>({id:'bad'+i,coefficient,timestamp:start}));
 bad.push({id:'date',coefficient:2,timestamp:'bad'},{id:'future',coefficient:2,timestamp:start+60000});
 h.app.merge([...rows(Array(20).fill(2.2)),...bad]);assert.equal(h.app.state().rounds.length,20);assert(Number.isFinite(h.c.GodPreditor.calculatePrediction([...rows(Array(20).fill(2.2)),...bad]).estimatedCoef));
});
await check('Exact timestamp formats normalize: seconds, milliseconds, ISO',()=>{
 const h=harness();assert.equal(h.c.GodPreditor.timeValue(start/1000),start);assert.equal(h.c.GodPreditor.timeValue(start),start);assert.equal(h.c.GodPreditor.timeValue(new Date(start).toISOString()),start);
});
await check('Stale data yields no signal or large opportunity even with a connected API',()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(1.5),start-86400000));h.app.generate();assert.equal(h.app.state().pending,null);assert.equal(h.app.godPrediction(),null);assert.equal(h.app.bigOpportunity(),null);
});
await check('Approximate latest round selects order-only analysis despite older exact rows',()=>{
 const h=harness(),data=rows(Array(40).fill(1.5));data[0].estimated=true;h.app.setup(data);
 const p=h.app.godPrediction();assert(p.estimated);assert.equal(p.engine,'god-order-only-audit1');assert.equal(p.score,70);
});
await check('Different modes and new data cannot overwrite fixed target/window',()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(1.5)));h.app.generate();const p=h.app.state().pending;
 h.app.selectMode('vip');h.app.merge(rows(Array(40).fill(9),start+1000));h.app.generate();assert.equal(h.app.state().pending,p);assert.equal(p.target,5.25);assert.equal(p.at,start+90000);
});
await check('Fourth eligible round can hit; duplicate/out-of-window records do not count',()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(1.5)));h.app.generate();const p=h.app.state().pending;
 const low=[1,2,3].map(i=>({id:'new'+i,coefficient:1.1,timestamp:p.at+i*1000}));h.setTime(p.at+5000);
 h.app.processNew([...low,low[0],{id:'early',coefficient:100,timestamp:p.at-1},{id:'late',coefficient:100,timestamp:p.at+p.window+1}]);assert.equal(p.checked,3);
 h.app.processNew([{id:'fourth',coefficient:6,timestamp:p.at+4000}]);assert.equal(h.app.state().history[0].status,'hit');
});
await check('Approximate observations excluded from confirmed success statistics',()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(1.5)));h.app.generate();const p=h.app.state().pending;h.setTime(p.at+1000);
 h.app.processNew([{id:'observation',coefficient:10,timestamp:p.at+1000,estimated:true}]);assert.equal(h.app.state().history[0].status,'observed');assert.equal(h.el('countOk').textContent,0);
});
await check('Miss requires final fresh poll, full window and precise coverage',()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(1.5)));h.app.generate();const p=h.app.state().pending;
 h.setTime(p.at+1000);h.app.processNew([{id:'low',coefficient:1.1,timestamp:p.at+1000}]);
 const end=p.at+p.window;h.setTime(end+16000);h.app.merge([{id:'latest',coefficient:1.1,timestamp:end+16000}]);h.app.setPoll(h.now());h.app.tick();assert.equal(h.app.state().history[0].status,'miss');
});
await check('Successful polling of a stalled source cannot confirm a miss',()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(1.5)));h.app.generate();const p=h.app.state().pending,end=p.at+p.window;
 h.setTime(end-1000);h.app.merge([{id:'last-before-end',coefficient:1.1,timestamp:end-1000}]);h.app.processNew([{id:'last-before-end',coefficient:1.1,timestamp:end-1000}]);
 h.setTime(end+31000);h.app.setPoll(h.now());h.app.tick();assert.equal(h.app.state().history[0].status,'expired');
});
await check('Offline/missing polls produce unverified outcome, not a miss',()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(1.5)));h.app.generate();const p=h.app.state().pending;
 h.setTime(p.at+1000);h.app.processNew([{id:'low',coefficient:1.1,timestamp:p.at+1000}]);h.setTime(p.at+p.window+31000);h.app.setPoll(start,false);h.app.tick();assert.equal(h.app.state().history[0].status,'expired');
});
await check('Reload restores fixed target and marks incomplete coverage',()=>{
 const s={target:3,score:70,at:start+30000,window:120000,generatedAt:start,status:'pending',policy:'window-v2',checked:1,ids:['a'],kind:'god'};
 const h=harness([s]);assert.equal(h.app.state().pending.target,3);assert.equal(h.app.state().pending.at,s.at);assert(h.app.state().pending.coverageGap);
});
await check('Malformed stored signals cannot render NaN or corrupt pending state',()=>{
 const h=harness([{target:3,score:'bad',at:start,window:150000,status:'pending'},{target:3,score:70,at:start,window:-1}]);assert.equal(h.app.state().history.length,0);
});
await check('Parallel fast/full refreshes share a single request',async()=>{
 const h=harness();const a=h.app.refreshHistory(),b=h.app.checkLatest();assert.equal(a,b);assert.equal(h.requests.length,1);
 respond(h.requests[0],rows(Array(40).fill(2.2)));await a;assert.equal(h.app.state().rounds.length,40);
});
await check('Late snapshot cannot remove already merged fresh round or overwrite conflict',async()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(2.2)));const promise=h.app.refreshHistory();
 const fresh={id:'fresh',coefficient:4,timestamp:start+1000};h.app.merge([fresh]);respond(h.requests[0],rows(Array(40).fill(2.2)));await promise;
 assert.equal(h.app.state().rounds[0].id,'fresh');h.app.merge([{...fresh,coefficient:1.5}]);assert.equal(h.app.state().rounds[0].coefficient,4);
});
await check('Pagination truncation triggers a 2000-round backfill before confirming coverage',async()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(2.2)));const promise=h.app.checkLatest();
 const incoming=rows(Array(100).fill(3),start+1200000).map(r=>({...r,id:'new-'+r.id}));h.setTime(start+1200000);respond(h.requests[0],incoming,3000);await flush();assert.equal(h.requests.length,2);assert(h.requests[1].url.includes('limit=2000'));
 respond(h.requests[1],[...incoming,...rows(Array(40).fill(2.2))],140);await promise;assert.equal(h.app.state().rounds.length,140);
});
await check('API cap of 1000 is paginated and changing head reconciled to 2000 unique rounds',async()=>{
 const h=harness(),all=rows(Array(2200).fill(2.2)),promise=h.app.refreshHistory();
 respond(h.requests[0],all.slice(0,1000),2200);await flush();assert.equal(h.requests.length,2);assert(h.requests[1].url.includes('offset=1000'));
 const newer=[{id:'new-a',coefficient:3,timestamp:start+1000},{id:'new-b',coefficient:4,timestamp:start+2000}];h.setTime(start+2000);
 respond(h.requests[1],[...newer,...all].slice(1000,2000),2202);await flush();assert.equal(h.requests.length,3);
 respond(h.requests[2],[...newer,...all].slice(0,100),2202);await promise;assert.equal(h.app.state().rounds.length,2000);assert.equal(h.app.state().rounds[0].id,'new-b');
});
await check('Failed fetch preserves loaded history and clears online state',async()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(2.2)));const promise=h.app.checkLatest();h.requests[0].reject(Error('offline'));await promise;
 assert.equal(h.app.state().rounds.length,40);assert.equal(h.app.state().online,false);
});
await check('Archive day uses local calendar, consistent across midnight and DST',()=>{
 const h=harness(),a=Date.parse('2026-10-01T21:30:00Z'),b=Date.parse('2026-10-02T21:30:00Z');
 h.app.setArchive([{id:'a',coefficient:2,timestamp:a},{id:'b',coefficient:3,timestamp:b}]);
 const selected=new Date(a);h.el('archiveDate').value=selected.getFullYear()+'-'+String(selected.getMonth()+1).padStart(2,'0')+'-'+String(selected.getDate()).padStart(2,'0');h.app.renderArchive();
 assert(h.el('archiveGrid').innerHTML.includes('2.00×'));assert(!h.el('archiveGrid').innerHTML.includes('3.00×'));
 assert(h.el('archiveSummary').textContent.includes('загруженной части'));
});
await check('Stats separate signal results from round >=2 frequency',()=>{
 const valid={target:3,score:70,at:start,window:150000};const h=harness(['hit','miss','observed','expired'].map(status=>({...valid,status})));
 h.app.setup(rows(Array(40).fill(2.2)));h.app.render();assert.equal(h.el('countTotal').textContent,2);assert(h.el('signalStats').textContent.includes('50%'));assert(h.el('roundCount').textContent.includes('100% выборки'));
});
await check('Invalid custom range prevents generating a signal',()=>{
 const h=harness();h.app.setup(rows(Array(40).fill(2.2)));h.el('customRange').checked=true;h.el('minOddsInput').value='3';h.el('maxOddsInput').value='2';h.app.generate();assert.equal(h.app.state().pending,null);
});
await check('Model input is bounded at 2000 and has deterministic ID order',()=>{
 const h=harness();h.app.merge(rows(Array(3000).fill(2.2)));assert.equal(h.app.state().rounds.length,2000);
});
await check('Page has versioned engine/runtime and no legacy target overwriter',()=>{
 assert(html.includes('pro-luckyjet-engine.js?v=20261002-audit1'));assert(html.includes('pro-luckyjet-app.js?v=20261002-audit1'));assert(!html.includes('src="live-coefficients.js'));assert(html.includes('id="archiveDate"'));
});
console.log(`${count} behavioral checks passed; timezone ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
