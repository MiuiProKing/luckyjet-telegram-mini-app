import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generatePrediction} from '../modules/supplied-prediction.mjs';
import {forecastArchive} from './fixtures/archive-forecast.mjs';
import {MODEL, analyze, forecastForTarget, advanceJournal} from '../window-model.mjs';
const NOW=Date.UTC(2026,10,2,12,10,17);
const rows=values=>values.map((coefficient,i)=>({id:'r'+i,coefficient,timestamp:NOW-i*20000}));
const advance=(journal,input,now=NOW,enabled=true,coverage)=>advanceJournal(journal,input,analyze(input,now),now,enabled,coverage).journal;
test('supplied TypeScript preserves complete original arithmetic and dynamic outputs across 100 histories',()=>{
  let seed=15;
  for(let i=0;i<100;i++){
    const input=rows(Array.from({length:20+i*5},()=>{seed=(seed*1664525+1013904223)>>>0;return 1+(seed%10000)/100;}));
    const raw=generatePrediction(input,null,NOW);
    assert.deepEqual(raw,forecastArchive(input,null,NOW));
    const primary=forecastForTarget(input,'primary',null,NOW);
    assert.equal(primary.target,raw.estimatedCoef);
    assert.equal(primary.start,raw.estimatedAt);assert.equal(primary.windowMs,raw.windowMs);
    assert.equal(primary.score,raw.reliability);assert.deepEqual(primary.raw,raw);
    const big=forecastForTarget(input,'big',null,NOW);
    if(raw.bigOpportunity){assert.equal(big.target,raw.bigOpportunity.estimatedCoef);assert.equal(big.start,raw.bigOpportunity.expectedAt);assert.equal(big.score,raw.bigOpportunity.confidence);}
    else assert.equal(big,null);
  }
});
test('original low streak and 5–9x cluster produce their own coefficient, not fixed 1.50/2',()=>{
  for(const input of [rows(Array(40).fill(1.1)),rows([6,7,8,...Array(37).fill(2.5)])]){
    const f=forecastForTarget(input,'primary',null,NOW);assert.ok(f.target>2);assert.notEqual(f.target,1.5);
    assert.equal(forecastForTarget(input,'primary',f,NOW+1000),f);
  }
  assert.deepEqual(analyze(rows(Array(40).fill(1.1)),NOW).targets.map(x=>x.target),[2,5,10,20,50,100]);
});
test('original independent >=100x opportunity is retained without replacing primary by its score',()=>{
  const input=rows(Array.from({length:80},(_,i)=>i%3===0?120:i%2===0?55:2.5));
  const journal=advance([],input);assert.equal(journal.length,2);
  const primary=journal.find(x=>x.channel==='primary'),big=journal.find(x=>x.channel==='big');
  assert.ok(big.target>=100);assert.equal(primary.target,generatePrediction(input,null,NOW).estimatedCoef);
  assert.notEqual(primary.key,big.key);assert.ok(big.start>NOW);
});
test('dynamic windows freeze before announcement and resolve observed threshold, never reassigning earlier history',()=>{
  const input=rows(Array(40).fill(1.1));const initial=advance([],input),f=initial[0];
  assert.equal(f.channel,'primary');assert.equal(f.status,'pending');assert.equal(f.model,MODEL);
  const after=[{id:'future-hit',timestamp:f.start+1000,coefficient:f.target+.01},...input];
  const resolved=advance(initial,after,f.start+1000,false);assert.equal(resolved[0].status,'hit');
  assert.equal(advance(resolved,after,f.start+2000).filter(x=>x.channel==='primary').length,1);
  assert.equal(advance([],rows(Array(19).fill(20))).length,0);
  assert.equal(forecastForTarget(input,'primary',null,NOW+180001),null);
});
test('complete low-result coverage is a miss; missing coverage is unknown',()=>{
  const input=rows(Array(40).fill(1.1)),f=advance([],input)[0];
  const full=Array.from({length:Math.ceil((f.end-NOW)/20000)+2},(_,i)=>({id:'new'+i,coefficient:1.1,timestamp:NOW+i*20000}));
  const now=full.at(-1).timestamp;
  assert.equal(advance([f],[...full,...input],now,false,{online:true,lastSuccessAt:now})[0].status,'miss');
  assert.equal(advance([f],input,f.end+180001,false,{online:false})[0].status,'unknown');
});
