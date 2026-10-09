const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('luckyjet-live/bee-cloud-api.js','utf8');let count=0;
const token='a'.repeat(43);
function harness(hash=''){
 const storage=new Map(),requests=[],events=[],elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:'',addEventListener(){}});return elements.get(id)};
 const c={BOG_CLOUD:{url:'https://example.supabase.co',anonKey:'public-read-key'},location:{hash,pathname:'/index.html',search:''},URLSearchParams,AbortSignal,Event,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},history:{replaceState(...args){c.cleaned=args[2]}},document:{readyState:'complete',getElementById:element},dispatchEvent:e=>events.push(e.type),fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({ok:true,source:'supabase-cloud',pc_required:false})}}};c.window=c;vm.runInNewContext(code,c);return {c,storage,requests,events};
}
(async()=>{
 const empty=harness('#overview');await assert.rejects(empty.c.BeeCloud.request(),/персональная/);assert.equal(empty.requests.length,0);count++;
 const h=harness('#access='+token);assert.equal(h.c.cleaned,'/index.html#overview');assert.equal(h.storage.values().next().value,token);count++;
 const response=await h.c.BeeCloud.request();assert.equal(response.pc_required,false);assert.equal(h.requests[0].url,'https://example.supabase.co/functions/v1/luckyjet-beeai');assert.equal(h.requests[0].options.headers['x-bee-access'],token);assert.equal(h.requests[0].options.referrerPolicy,'no-referrer');count++;
 await h.c.BeeCloud.request('POST',{enabled:false});assert.equal(h.requests[1].options.body,'{"enabled":false}');assert(!code.includes('AIza'));assert(!code.includes('127.0.0.1'));assert(!code.includes('lhr.life'));count++;
 h.c.BeeCloud.setAccess(token);assert(h.events.includes('bee-cloud-connect'));count++;
 console.log(JSON.stringify({bee_api_tests:count,passed:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
