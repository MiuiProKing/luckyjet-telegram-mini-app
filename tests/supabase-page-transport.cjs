const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const socketMessages=[],seen=[],banner={textContent:''};let instance,sourceConnected=true;
 class Socket{constructor(url){this.url=url;this.readyState=1;instance=this;}send(value){socketMessages.push(JSON.parse(value));}close(){this.readyState=3;}}
 const context={Date,Number,Error,JSON,encodeURIComponent,AbortSignal,WebSocket:Socket,setInterval(){return 1},clearInterval(){},setTimeout(){return 2},document:{getElementById(){return banner}},BOG_CLOUD:{url:'https://example.supabase.co',anonKey:'public-anon'},async fetch(url){
  if(url.includes('cloud_status'))return{ok:true,json:async()=>({source_connected:sourceConnected,error:sourceConnected?'':'GAME_SESSION_EXPIRED'})};
  assert(url.includes('luckyjet_classic_history'));assert(url.includes('order=feed_order.desc'));return{ok:true,headers:{get:()=> '0-0/57165'},json:async()=>[{id:'a',coefficient:10,round_timestamp:'2026-10-09T09:30:00Z',estimated:false,source_seq:77165,feed_order:1e12+77165,origin:'live'}]};
 }};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('luckyjet-live/cloud-transport.js','utf8'),context);let count=0;
 let page=await context.ClassicCloud.page(2000);assert.equal(page.total,57165);assert.equal(page.rows[0].coefficient,10);assert.equal(page.rows[0].feed_order,1e12+77165);assert.equal(page.sourceConnected,true);count++;
 context.ClassicCloud.connect(row=>seen.push(row));instance.onopen();assert.equal(socketMessages[0].event,'phx_join');assert.equal(socketMessages[0].join_ref,'1');assert.equal(socketMessages[0].payload.config.postgres_changes[0].event,'INSERT');count++;
 const event=record=>instance.onmessage({data:JSON.stringify({event:'postgres_changes',payload:{data:{type:'INSERT',record}}})});
 event({id:'old',coefficient:20,origin:'live',collection_backend:'pc_import'});assert.equal(seen.length,0);count++;
 event({id:'new',coefficient:15,source_seq:77166,origin:'live',collection_backend:'cloud'});assert.equal(seen.length,1);assert.equal(seen[0].id,'new');assert.equal(seen[0].feed_order,1e12+77166);assert(seen[0].feed_order>page.rows[0].feed_order);count++;
 sourceConnected=false;await context.ClassicCloud.getStatus(true);page=await context.ClassicCloud.page(100);assert.equal(page.sourceConnected,false);assert.equal(page.rows.length,1);assert(banner.textContent.includes('GAME_SESSION_EXPIRED'));count++;
 console.log(JSON.stringify({transport_tests:count,passed:true}));
})().catch(error=>{console.error(error);process.exitCode=1});
