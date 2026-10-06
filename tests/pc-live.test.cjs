const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'bog-hishchnik-alert/pc-live.js'),'utf8');
const html=fs.readFileSync(path.join(root,'bog-hishchnik-alert/index.html'),'utf8');
let now=Date.UTC(2026,9,6,9),host='https://aaaaaaaaaaaaaa.lhr.life',offline=false,requests=[];
const access='testReadOnlyCodeWithExactlyLongEnoughLength';
const elements=new Map(),store=new Map();
const node=()=>({textContent:'',value:'',innerHTML:'',children:[],style:{setProperty(){}},classList:{toggle(){}},append(){},appendChild(){},replaceChildren(){},setAttribute(){},addEventListener(){},click(){},hidden:false});
const el=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id)};
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
let data={ok:true,total:220,history:Array.from({length:220},(_,i)=>({id:'past'+i,coefficient:1.5,timestamp:now-i*1000,estimated:false})),collector:{migration:'sqlite-local-v1',fresh:false,source_connected:true,session_rounds:10,warmup_required:200,live_count:10}};
const context=vm.createContext({console,Date:Clock,Intl,Math,Number,String,JSON,Map,Set,Array,Object,URL,URLSearchParams,Blob,AbortController,AbortSignal,Event,
 location:{hash:'#access='+access,pathname:'/bog-hishchnik-alert/index.html',search:''},history:{replaceState(_,__,value){assert(!value.includes(access))}},
 sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},
 document:{readyState:'complete',getElementById:el,createElement:node,addEventListener(){},hidden:false},
 setTimeout(){return 1},clearTimeout(){},setInterval(){},
 fetch:async(url,options)=>{requests.push({url,options});
  if(url.includes('raw.githubusercontent.com')){assert(!options.headers?.Authorization);return {ok:true,json:async()=>({version:1,source:'pc-sqlite',host})}}
  assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,'Bearer '+access);
  if(offline)throw Error('Offline');
  return {ok:true,status:200,json:async()=>data};
 }});context.window=context;context.dispatchEvent=()=>{};context.addEventListener=()=>{};
vm.runInContext(source,context);
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);scripts.forEach(s=>new vm.Script(s));
vm.runInContext(scripts[0],context);
const end=scripts[1].lastIndexOf("window.addEventListener('pc-live-connect'");assert(end>0);
vm.runInContext(scripts[1].slice(0,end)+"globalThis.test={refreshModel,checkForNewRound,fresh,ordinaryAnalysis,bigOpportunity,state:()=>({rows:rounds,signals:signalJournal})}",context);
(async()=>{
 await context.test.refreshModel();assert.equal(context.test.fresh(),false);assert.equal(context.test.ordinaryAnalysis(),null);
 now+=10000;data={...data,history:[{id:'live-new',coefficient:10,timestamp:now,estimated:false},...data.history],collector:{...data.collector,fresh:true,session_rounds:201,live_count:201}};
 await context.test.checkForNewRound();assert.equal(context.test.fresh(),true,el('updated').textContent);assert.equal(context.test.state().rows.filter(r=>r.id==='live-new').length,1);
 await context.test.checkForNewRound();assert.equal(context.test.state().rows.filter(r=>r.id==='live-new').length,1);
 const before=requests.length;offline=true;await context.test.checkForNewRound();assert.equal(context.test.fresh(),false);assert.equal(context.test.bigOpportunity(),null);
 await context.test.checkForNewRound();assert.equal(requests.length,before+1,'Backoff prevents repeated network requests');
 now+=6000;offline=false;host='https://bbbbbbbbbbbbbb.lhr.life';await context.test.checkForNewRound();assert.equal(context.test.fresh(),true);assert(requests.at(-1).url.startsWith(host));
 const registryRequests=requests.filter(r=>r.url.includes('raw.githubusercontent.com'));assert(registryRequests.length>=2);
 console.log('PASS actual classic page: warmup, completed LIVE, replay, outage blocks signals, backoff, domain rotation, bearer-only API, no credential sent to GitHub');
})().catch(error=>{console.error(error);process.exitCode=1});
