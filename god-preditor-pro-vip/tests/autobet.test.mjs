import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAutoBet} from '../safari/src/autobet.mjs';
import {MODEL} from '../window-model.mjs';

const T = 1900000000000;
function fixture(options = {}) {
  let time=T,mono=0,stored=options.stored||[],writes=0,releases=0;
  const clicked=[], buttons=[{element:{},state:'ready'},{element:{},state:'ready'}];
  const context={visible:true,fresh:true,forecasts:[1.5,2].map(target=>({model:MODEL,key:'window-'+target,target,acceptedAt:T-1000,start:T+1000,end:T+30000,status:'pending'}))};
  const controller=createAutoBet({now:()=>time,monotonic:()=>mono,context:()=>context,
    inspect:b=>({state:b?.state||'missing',reason:b?.state||'not selected'}),
    click:b=>{clicked.push(buttons.indexOf(b));if(options.ack!==false)b.state='busy';},
    acquireLock:async()=>options.lock===false?null:{release(){releases++;}},
    readReceipts:async()=>stored,
    writeReceipts:async records=>{writes++;if(options.failWrite)throw Error('quota');stored=structuredClone(records);if(options.defer)await options.defer();},
  });
  const advance=ms=>{time+=ms;mono+=ms;};
  return {controller,context,buttons,clicked,advance,setClock(ms){time+=ms;},get stored(){return stored;},get writes(){return writes;},get releases(){return releases;}};
}
async function prepared(options) {
  const f=fixture(options);await f.controller.initialize();
  f.buttons.forEach((button,i)=>f.controller.setButton(i,button));return f;
}

test('auto starts OFF and dry-run never dispatches a click or writes a financial reservation',async()=>{
  const f=await prepared();f.advance(1000);await f.controller.tick();assert.equal(f.clicked.length,0);
  f.context.forecasts.forEach(x=>x.start+=1000);
  assert.equal(await f.controller.arm('test'),true);f.advance(1000);
  for(let i=0;i<10;i++)await f.controller.tick();
  assert.equal(f.clicked.length,0);assert.equal(f.writes,0);
  assert.match(f.controller.state.message,/ТЕСТ 2/);
});
test('live mode reserves durably before exactly one action per field and window',async()=>{
  const f=await prepared();assert.equal(await f.controller.arm('live'),true);f.advance(1000);
  await f.controller.tick();assert.deepEqual(f.clicked,[0,1]);assert.equal(f.stored.length,2);
  assert.ok(f.stored.every(x=>x.state==='reserved'&&[1.5,2].includes(x.target)));
  for(let i=0;i<10;i++){f.advance(250);await f.controller.tick();}
  assert.deepEqual(f.clicked,[0,1]);assert.equal(f.controller.state.armed,true);
  f.controller.disarm();assert.equal(f.releases,1);
});
test('occupied/cashout controls, duplicate selection and an unavailable tab lock cannot arm live mode',async()=>{
  const f=await prepared();assert.throws(()=>f.controller.setButton(1,f.buttons[0]),/разные/);
  f.buttons[0].state='busy';assert.equal(await f.controller.arm('live'),false);assert.equal(f.clicked.length,0);
  const locked=await prepared({lock:false});assert.equal(await locked.controller.arm('live'),false);assert.equal(locked.clicked.length,0);
});
test('background, stale feed, delayed timers and wall-clock jumps stop before actions',async()=>{
  for(const reason of ['hidden','stale','delay','clock']){
    const f=await prepared();await f.controller.arm('live');
    if(reason==='hidden')f.context.visible=false;
    if(reason==='stale')f.context.fresh=false;
    if(reason==='delay')f.advance(4000);
    if(reason==='clock')f.setClock(2000);
    await f.controller.tick();assert.equal(f.controller.state.armed,false,reason);assert.equal(f.clicked.length,0,reason);
  }
});
test('disabled bet controls may wait briefly, then skip the window without catching up',async()=>{
  const waiting=await prepared();waiting.buttons.forEach(x=>x.state='waiting');await waiting.controller.arm('live');
  waiting.advance(1000);await waiting.controller.tick();assert.equal(waiting.clicked.length,0);
  waiting.buttons.forEach(x=>x.state='ready');waiting.advance(1000);await waiting.controller.tick();assert.deepEqual(waiting.clicked,[0,1]);
  const expired=await prepared();expired.buttons.forEach(x=>x.state='waiting');await expired.controller.arm('live');
  for(let i=0;i<18;i++){expired.advance(1000);await expired.controller.tick();}
  expired.buttons.forEach(x=>x.state='ready');expired.advance(1000);await expired.controller.tick();assert.equal(expired.clicked.length,0);
});
test('starting during an already-open window never sends a late action',async()=>{
  const f=await prepared();f.advance(1100);await f.controller.arm('live');await f.controller.tick();assert.equal(f.clicked.length,0);
});
test('storage failure or disabling while a reservation is pending prevents a click',async()=>{
  const failed=await prepared({failWrite:true});await failed.controller.arm('live');failed.advance(1000);await failed.controller.tick();
  assert.equal(failed.clicked.length,0);assert.equal(failed.controller.state.armed,false);
  let release;const f=await prepared({defer:()=>new Promise(resolve=>release=resolve)});
  await f.controller.arm('live');f.advance(1000);const pending=f.controller.tick();
  await Promise.resolve();f.controller.disarm();release();await pending;assert.equal(f.clicked.length,0);
});
test('the current model window and button are rechecked after asynchronous persistence',async()=>{
  let release;const f=await prepared({defer:()=>new Promise(resolve=>release=resolve)});
  await f.controller.arm('live');f.advance(1000);const pending=f.controller.tick();
  await Promise.resolve();f.context.forecasts[0]={...f.context.forecasts[0],status:'hit'};release();await pending;
  assert.equal(f.clicked.length,0);assert.equal(f.controller.state.armed,false);
});
test('uncertain button acknowledgement stops the session and never retries the same window',async()=>{
  const f=await prepared({ack:false});await f.controller.arm('live');f.advance(1000);await f.controller.tick();
  f.advance(2600);await f.controller.tick();assert.equal(f.controller.state.armed,false);assert.deepEqual(f.clicked,[0,1]);
  assert.match(f.controller.state.message,/не подтверждён/);
  const restored=await prepared({stored:f.stored});await restored.controller.arm('live');restored.advance(1000);await restored.controller.tick();
  assert.equal(restored.clicked.length,0);
});
