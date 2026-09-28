const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./model.js');
const D = require('./data.js');
const now = new Date('2026-09-28T10:00:00Z').getTime();
const rows = coefficients => coefficients.map((coefficient, i) => ({ id: String(i), coefficient, timestamp: now - i * 20000, estimated: false }));

test('Same coefficient and timestamp with distinct round IDs are preserved', () => {
  const a = new D.Archive(async () => {});
  a.ingest([{id:'a', coefficient:1.55,timestamp:now},{id:'b',coefficient:1.55,timestamp:now}],2);
  a.ingest([{id:'a',coefficient:1.55,timestamp:now}],2);
  assert.equal(a.rows().length,2);
});
test('Invalid records are tracked and never enter statistics', () => {
  const a = new D.Archive(async () => {});
  a.ingest([{id:'bad',coefficient:NaN,timestamp:now},{id:'ok',coefficient:2,timestamp:now}],2);
  assert.equal(a.invalid.size,1); assert.equal(a.rows().length,1);
});
test('Archive pagination catches a moving head and server-side page cap', async () => {
  let db = rows(Array(35).fill(2)), calls = 0;
  const a = new D.Archive(async (offset,limit) => {
    calls++;
    if (calls===3) db.unshift({id:'new',coefficient:2,timestamp:now+1000});
    const history=db.slice(offset,offset+Math.min(limit,7));
    return {history,total:db.length,hasMore:offset+history.length<db.length};
  },{pageSize:10,overlap:3});
  for(let i=0;i<30&&!a.complete;i++) await a.loadNext();
  assert.equal(a.complete,true); assert.equal(a.rows().length,36);
  assert.deepEqual(new Set(a.rows().map(r=>r.id)),new Set(db.map(r=>r.id)));
});
test('Concurrent loadNext callers share a single page request', async () => {
  let calls=0;
  const a=new D.Archive(async()=>{calls++;await new Promise(r=>setTimeout(r,5));return{history:rows([2,3]),total:2,hasMore:false};});
  await Promise.all([a.loadNext(),a.loadNext()]); assert.equal(calls,1);assert.equal(a.complete,true);
});
test('A gap discovered after a complete scan invalidates completeness', async () => {
  const a=new D.Archive(async()=>({history:rows([2,3]),total:2,hasMore:false}));
  await a.loadNext(); assert.equal(a.complete,true);
  a.ingest([{id:'later',coefficient:5,timestamp:now+1000}],5);
  assert.equal(a.complete,false);assert.equal(a.ended,false);
});
test('Empty database completes and does not loop', async () => {
  const a=new D.Archive(async()=>({history:[],total:0,hasMore:false}));await a.loadNext();assert.equal(a.complete,true);
});
test('Reference low-series formula and priority',()=>{
  const signal=M.predictNormal(rows(Array(20).fill(1.5)),now);
  assert.equal(signal.rule,'low-series');assert.equal(signal.target,5.25);
  assert.equal(signal.at,now+90000);assert.equal(signal.endsAt,now+210000);
});
test('Reference large cluster formula',()=>{
  const signal=M.predictNormal(rows([30,30,30,...Array(27).fill(2.5)]),now);
  assert.equal(signal.rule,'large-cluster');assert.equal(signal.target,6);assert.equal(signal.score,69);
});
test('Reference middle-zone formula',()=>{
  const signal=M.predictNormal(rows([6,6,6,...Array(57).fill(2.5)]),now);
  assert.equal(signal.rule,'middle-zone');assert.equal(signal.target,4.2);assert.equal(signal.score,82);
});
test('Fallback and VIP evidence threshold',()=>{
  const sample=rows(Array(80).fill(2.5));
  assert.equal(M.predictNormal(sample,now).rule,'ema-time');assert.equal(M.predictVip(sample,now),null);
  const vip=M.predictVip(rows([60,60,60,25,25,25,...Array(74).fill(2.5)]),now);
  assert.equal(vip.rule,'vip-cluster');assert.equal(vip.target,120);assert.equal(vip.score,76);
});
test('Approximate timestamps disable temporal rules',()=>{
  const signal=M.predictNormal(rows(Array(20).fill(1.5)).map(r=>({...r,estimated:true})),now);
  assert.equal(signal.estimated,true);assert.equal(signal.score,70);
});
test('Calendar uses local date, including midnight boundary',()=>{
  const local=new Date(2026,8,28,0,5);assert.equal(D.dayKey(local.getTime()),'2026-09-28');
});
