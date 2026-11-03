import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAutoBet} from '../safari/src/autobet.mjs';
import {createAutoCashout} from '../safari/src/autocashout.mjs';
const MODEL='hardened-dynamic-windows-v4',T=1900000000000;
async function fixture(){
 let time=T,mono=0,value=8,epoch=0,changedAt=T;
 const fields=[0,1].map(index=>({index,element:{mode:'bet'},label:'Ставка'}));
 const bets=[],cashouts=[];let forecast={model:MODEL,channel:'primary',key:'first',target:2,acceptedAt:T-1,start:T+1000,end:T+30000,status:'pending'};
 let cash;
 const auto=createAutoBet({model:MODEL,now:()=>time,monotonic:()=>mono,context:()=>({fresh:true,visible:true,forecasts:[forecast]}),
  inspect:b=>({state:b.element.mode==='bet'?'ready':'busy',reason:b.element.mode}),click:b=>{b.element.mode='queued';bets.push(b.index);},
  acquireLock:async()=>({release(){}}),readReceipts:async()=>[],writeReceipts:async()=>{},
  beforeBet:({index})=>cash.canTrackBet(index),onBetDispatched:r=>cash.onBetDispatched(r),
  onChange:()=>{if(cash?.state.armed&&!auto.state.armed)cash.disarm();}});
 cash=createAutoCashout({now:()=>time,monotonic:()=>mono,context:()=>({fresh:true,visible:true,autoBetArmed:auto.state.armed,autoBetMode:auto.state.mode,buttonsConfigured:true}),
  readMultiplier:()=>({state:'ready',value,epoch,at:time,changedAt}),
  inspectCashout:b=>({state:b.element.mode==='cashout'?'ready':b.element.mode==='bet'?'closed':'waiting',reason:b.element.mode}),
  clickCashout:b=>{cashouts.push(b.index);b.element.mode='bet';},onFatal:reason=>auto.disarm(reason)});
 await auto.initialize();fields.forEach((b,i)=>auto.setButton(i,b));await auto.arm('live');assert.equal(cash.arm('live'),true);
 const advance=ms=>{time+=ms;mono+=ms;};
 const sample=(next,{reset=false}={})=>{advance(100);if(reset)epoch++;if(next!==value)changedAt=time;value=next;cash.tick();};
 return {auto,cash,fields,bets,cashouts,advance,sample,async bet(){advance(1000);await auto.tick();cash.tick();advance(100);cash.tick();await auto.tick();},next(target){forecast={...forecast,key:'next',target,acceptedAt:time,start:time+1000,end:time+30000};},retargetOld(target){forecast.target=target;}};
}
test('own dispatch freezes two targets; later forecast changes do not change Cashout threshold',async()=>{
 const f=await fixture();await f.bet();assert.deepEqual(f.bets,[0,1]);f.retargetOld(70);
 f.fields.forEach(b=>b.element.mode='cashout');f.sample(1.01,{reset:true});f.sample(1.5);f.sample(2.02);
 assert.deepEqual(f.cashouts,[0,1]);f.sample(2.2);await f.auto.tick();assert.deepEqual(f.bets,[0,1]);assert.equal(f.cash.state.armed,true);
});
test('round ending below target waits for a NEW forecast and never rebets the old signal',async()=>{
 const f=await fixture();await f.bet();f.fields.forEach(b=>b.element.mode='cashout');f.sample(1.01,{reset:true});f.sample(1.2);
 f.fields.forEach(b=>b.element.mode='bet');f.sample(1.0,{reset:true});await f.auto.tick();
 assert.deepEqual(f.cashouts,[]);assert.deepEqual(f.cash.state.pending,[]);assert.deepEqual(f.bets,[0,1]);assert.equal(f.cash.state.armed,true);
 f.next(70);await f.bet();assert.deepEqual(f.bets,[0,1,0,1]);f.fields.forEach(b=>b.element.mode='cashout');
 f.sample(1.01,{reset:true});f.sample(1.5);f.sample(70.1);assert.deepEqual(f.cashouts,[0,1]);
});
