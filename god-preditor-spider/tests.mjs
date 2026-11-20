import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const futureSignals=[];
const storage=new Map();
const fakeElement={textContent:'',classList:{add(){},remove(){}}};
const context={
  Date,Intl,URL,URLSearchParams,Math,Number,String,Array,Set,Map,JSON,
  setTimeout,clearTimeout,setInterval,clearInterval,AbortController,
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
  document:{readyState:'loading',addEventListener(){},getElementById:()=>fakeElement},
  window:{},futureSignals
};
runInNewContext(source,context,{filename:'app.js'});
const evaluate=expr=>runInNewContext(expr,context);

test('Only confirmed source rows enter analysis',()=>{
  const time=new Date().toISOString();
  assert.equal(evaluate(`normalizeRound({coefficient:41,round_timestamp:'${time}',estimated:true},'god')`),null);
  assert.equal(evaluate(`normalizeRound({coefficient:41,round_timestamp:'${time}',estimated:false},'god')`).coefficient,41);
  assert.equal(evaluate(`normalizeRound({coefficient:1,played_at:'${time}'},'simple')`).coefficient,1);
});

test('Statistical report refuses insufficient history',()=>{
  const result=evaluate('calculate(40)');
  assert.equal(result.ok,false);
  assert.match(result.reason,/200/);
});

test('Stats are calculated from repeated real-shaped records, without randomness',()=>{
  const base=Date.now()-600*15000;
  const records=Array.from({length:600},(_,i)=>({
    id:String(i),coefficient:i%17===0?60:1.5,round_timestamp:new Date(base+i*15000).toISOString(),estimated:false,feed_order:i
  }));
  context.records=records;
  evaluate(`state.rows=records.map(x=>normalizeRound(x,'god')).filter(Boolean).reverse()`);
  const report=evaluate('calculate(40)');
  assert.equal(report.ok,true);
  assert.equal(report.target,40);
  assert.equal(report.sample,600);
  assert.equal(report.hits,36);
  assert.ok(Math.abs(report.medianGapMinutes-4.25)<1e-8);
  assert.ok(report.probNext3MinPct>0&&report.probNext3MinPct<100);
  assert.equal(evaluate('calculate(500)').ok,false);
});

test('Thresholds and 3-minute times are internally consistent',()=>{
  const report=evaluate('calculate(20)');
  assert.equal(report.ok,true);
  assert.equal(report.end-report.start,180000);
  assert.ok(report.start>Date.now());
  assert.ok(Math.abs(report.frequencyPct-6)<1e-6);
});
