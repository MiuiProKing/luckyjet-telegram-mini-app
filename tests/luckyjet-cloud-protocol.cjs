const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const source=fs.readFileSync('supabase/functions/luckyjet-collector/protocol.js','utf8').replace(/export /g,'');
 const context={Date,Number,Error};vm.createContext(context);vm.runInContext(source+';this.tracker=createRoundTracker;',context);
 const frame=data=>({push:{pub:{data}}});let n=0;
 const start=(id='real-id',fair={})=>frame({eventType:'startGame',roundInfo:{id,provablyFair:fair}});
 const end=(values=[12.3],extra={})=>frame({eventType:'endGame',finalCoefficientValues:values,currentTime:1780000000,...extra});
 let t=context.tracker();assert.equal(t.handle(end()),null);n++;
 t.handle(start());let r=t.handle(end());assert.equal(r.id,'real-id');assert.equal(r.coefficient,12.3);assert.equal(r.estimated,false);n++;
 assert.equal(t.handle(end()),null);n++;
 t.handle(start());assert.throws(()=>t.handle(start('other')),/SEQUENCE_GAP/);n++;
 t=context.tracker();t.handle(start());assert.throws(()=>t.handle(end([10,20])),/AMBIGUOUS/);n++;
 t=context.tracker();t.handle(start());assert.throws(()=>t.handle(end([10,null])),/AMBIGUOUS/);n++;
 t=context.tracker();t.handle(start());assert.throws(()=>t.handle(end([10],{roundId:'other'})),/ID_MISMATCH/);n++;
 t=context.tracker();t.handle(start('a',{hash:'before'}));assert.throws(()=>t.handle(end([10],{provablyFair:{hash:'after'}})),/HASH_MISMATCH/);n++;
 t=context.tracker();t.handle(start());r=t.handle(end([10],{currentTime:null}));assert.equal(r.timestamp,null);assert.equal(r.estimated,true);n++;
 console.log(JSON.stringify({protocol_tests:n,passed:true}));
})();
