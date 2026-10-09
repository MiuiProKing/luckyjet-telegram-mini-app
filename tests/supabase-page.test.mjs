import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const dir=process.env.PAGE_DIRECTORY||'luckyjet-live',html=fs.readFileSync(dir+'/index.html','utf8');
let count=0;function test(name,run){run();count++;console.log('PASS '+name);}
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
test('Inline scripts parse and only new cloud endpoints are referenced',()=>{scripts.forEach(s=>new vm.Script(s));assert(html.includes('window.BOG_CLOUD.url'));assert(!html.includes('xrniwkvfrtchtxjrwwgd'));assert(!html.includes('src="pc-live.js"'));});
const elems=new Map();const el=id=>{if(!elems.has(id))elems.set(id,{textContent:'',innerHTML:'',children:[],value:'',style:{setProperty(){}},classList:{toggle(){}},hidden:false,disabled:false,append(...x){this.children.push(...x)},appendChild(x){this.children.push(x)},replaceChildren(...x){this.children=x},setAttribute(){},addEventListener(){}});return elems.get(id)};
let roundCallback=null,status={source_connected:true,fresh:true,error:''};const sample=Array.from({length:1000},(_,i)=>({id:'a'+i,coefficient:1.5+i%30,topCoefficient:1.5+i%30,timestamp:Date.now()-i*1000,source_seq:1000-i,feed_order:1e12+1000-i,estimated:false}));
const pages=[];const c=vm.createContext({Date,Intl,Math,Number,JSON,Map,Set,Array,Object,String,URL,Blob,AbortSignal,BOG_CLOUD:{url:'https://zulsrqkjkatzjjhacowy.supabase.co'},document:{hidden:false,getElementById:el,createElement:()=>el('created'+Math.random()),addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},setTimeout(){},clearTimeout(){},setInterval(){},addEventListener(){}});c.window=c;
c.ClassicCloud={connected:()=>true,getStatus:async()=>status,page:async(limit,offset=0)=>{pages.push({limit,offset});return {rows:sample.slice(offset,offset+Math.min(limit,1000)),total:sample.length,sourceConnected:status.source_connected,cloudStatus:status}},connect(onRound){roundCallback=onRound}};
scripts.forEach(s=>vm.runInContext(s,c));await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
test('Page loads archive and connects the Realtime callback',()=>{assert(pages.length>0);assert(roundCallback);assert(el('grid').children.length>0)});
test('New Realtime coefficient appears once',()=>{const value={id:'new-cloud',coefficient:25,topCoefficient:25,timestamp:Date.now(),source_seq:1001,feed_order:1e12+1001,estimated:false};roundCallback(value);roundCallback(value);const state=vm.runInContext('rounds',c);assert.equal(state.filter(r=>r.id==='new-cloud').length,1);assert.equal(state[0].id,'new-cloud')});
if(dir==='luckyjet-live'){
test('Equal coefficients with different IDs remain and migrated source ordering is stable',()=>{const sorted=vm.runInContext("dedupeRounds([{id:'import',coefficient:25,timestamp:Date.now()+999999,source_seq:-1,feed_order:10},{id:'cloud',coefficient:25,timestamp:Date.now(),source_seq:1002,feed_order:1e12+1002}])",c);assert.equal(sorted.length,2);assert.equal(sorted[0].id,'cloud')});
test('Disconnected cloud source is displayed as archive instead of LIVE',()=>{vm.runInContext("applyCloudStatus({source_connected:false,fresh:false})",c);assert(el('statusText').textContent.includes('отключён'));assert.equal(el('liveLabel').textContent,'Нет связи')});
}
console.log('PASS '+count+' page integration scenarios');
