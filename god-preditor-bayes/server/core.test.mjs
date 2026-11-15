import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRows,statistics,plannedWindow,evaluateWindow,VERSION,WINDOW_MS} from './core.mjs';
import {analyzeHistory} from './model.mjs';

const NOW=1800000000000;
const source=Array.from({length:250},(_,i)=>({id:'r'+i,coefficient:i%10===0?50:1.5,
  round_timestamp:new Date(NOW-(249-i)*20000).toISOString(),estimated:false,feed_order:1000+i*2}));
const rows=normalizeRows(source,NOW);
test('backend and browser use the identical model probabilities and intervals',()=>{
  const result=statistics(rows,40,NOW), browser=analyzeHistory(rows,NOW).targets.find(t=>t.target===40);
  assert.equal(result.ready,true); assert.equal(result.probability,browser.next3Minutes.probability);
  assert.deepEqual(result.interval95,browser.next3Minutes.interval95);
  assert.equal(result.perRoundProbability,browser.perRound.probability);
});
test('same clock exposure is independent of elapsed time since last event',()=>{
  const a=statistics(rows,40,NOW), b=statistics(rows,40,NOW+100000);
  assert.equal(a.probability,b.probability);assert.deepEqual(a.interval95,b.interval95);
});
test('stale observations cannot create a window',()=>{
  assert.equal(plannedWindow(statistics(rows,40,NOW+180001),NOW+180001),null);
});
test('planned window is fixed future slot with immutable identity',()=>{
  const a=plannedWindow(statistics(rows,40,NOW),NOW);
  const b=plannedWindow(statistics(rows,40,NOW+1000),NOW+1000);
  assert.equal(a.id,b.id);assert.equal(a.modelVersion,VERSION);
  assert.ok(a.start>=NOW+30000);assert.equal(a.end-a.start,WINDOW_MS);
  assert.equal(a.validatedEdge,false);assert.equal(a.timingKind,'fixed_future_statistical_window');
});
test('equal coefficients with different IDs survive; conflicting IDs do not',()=>{
  const data=[source[0],{...source[0],id:'another'}, {...source[1]}, {...source[1],coefficient:1000}];
  const result=normalizeRows(data,NOW);
  assert.equal(result.length,2);assert.equal(result.filter(r=>r.coefficient===source[0].coefficient).length,2);
});
const w={id:'window',target:40,start:NOW+60000,end:NOW+240000,issuedAt:NOW,coverageGapMs:60000};
function observation(id,offset,x=1.2){return {id,coefficient:x,timestamp:NOW+offset,order:offset+1000000,completed:true,estimated:false};}
test('pre-window high coefficient is never a win',()=>{
  const data=[observation('early',50000,500),...Array.from({length:11},(_,i)=>observation('i'+i,50000+i*20000)),observation('after',250000)];
  const result=evaluateWindow(w,data,NOW+250001);
  assert.equal(result.status,'miss');assert.ok(result.actual<40);
});
test('known hit is published strictly after closure',()=>{
  const data=[observation('hit',80000,500)];
  assert.equal(evaluateWindow(w,data,w.end),null);
  assert.equal(evaluateWindow(w,data,w.end+1).status,'hit');
});
test('uncovered history waits through grace and then remains unknown',()=>{
  const data=[observation('before',50000),observation('inside',80000),observation('after',260000)];
  assert.equal(evaluateWindow(w,data,w.end+1000),null);
  assert.equal(evaluateWindow(w,data,w.end+180001).status,'unknown');
});
