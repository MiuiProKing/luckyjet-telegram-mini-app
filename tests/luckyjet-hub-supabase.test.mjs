import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('luckyjet-supabase.js',root),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('luckyjet-supabase-pages.json',root),'utf8'));
const game='https://crash-gateway-grm-cr.100hp.app/history';
const iso='2026-10-15T12:00:00Z';
const sample=[{id:'round-3',coefficient:1,round_timestamp:iso,estimated:false,feed_order:3},
 {id:'round-2',coefficient:20,round_timestamp:'2026-10-15T11:59:45Z',estimated:false,feed_order:2},
 {id:'round-1',coefficient:20,round_timestamp:'2026-10-15T11:59:20Z',estimated:false,feed_order:1}];
function harness(path='/index.html'){
 const calls=[],elements=new Map();let connected=true;
 const document={readyState:'loading',title:'Lucky Jet',body:{prepend(){}},addEventListener(){},
  getElementById:id=>elements.get(id),createElement(){const el={dataset:{},style:{},setAttribute(){}};
   Object.defineProperty(el,'id',{set(v){elements.set(v,el)}});return el}};
 const sockets=[];
 class Socket{constructor(){this.readyState=1;sockets.push(this)}send(){}close(){this.readyState=3}}
 const native=async(url,options)=>{
  calls.push({url:String(url),options});
  if(String(url).endsWith('/rpc/luckyjet_cloud_status'))return new Response(JSON.stringify({source_connected:connected,fresh:connected,checked_at:iso,error:connected?'':'offline'}));
  if(String(url).includes('/luckyjet_classic_history?')){const u=new URL(url),offset=Number(u.searchParams.get('offset')),limit=Number(u.searchParams.get('limit'));
   return new Response(JSON.stringify(sample.slice(offset,offset+limit)),{headers:{'content-range':'0-2/3'}})}
  return new Response('passthrough');
 };
 const c=vm.createContext({fetch:native,Date,Intl,URL,Response,AbortSignal,DOMException,CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail}},
  document,location:{pathname:path,href:'https://example.test'+path},WebSocket:Socket,setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},dispatchEvent(){}});
 c.window=c;vm.runInContext(source,c);
 return {c,calls,elements,sockets,setConnected:v=>connected=v};
}
test('All maintained pages load the shared source before their game engines; relative paths resolve',()=>{
 assert(manifest.pages.length>40);
 for(const name of manifest.pages){const file=new URL(name,root),html=fs.readFileSync(file,'utf8');
  const script=html.match(/<script[^>]*src="([^"]+)"/i)?.[1];
  assert(script?.includes('luckyjet-supabase.js?'),name);assert.equal(new URL(script,file).pathname,new URL('luckyjet-supabase.js',root).pathname);
  for(const inline of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(inline[1],{filename:name});
 }
});
test('Legacy game requests use Supabase, preserve exact 1.00 and equal coefficients with different IDs',async()=>{
 const h=harness(),r=await h.c.fetch(game,{headers:{'session-id':'do-not-forward'}}),rows=await r.json();
 assert.equal(rows.length,3);assert.equal(rows[0].coefficient,1);assert.equal(rows[1].coefficient,rows[2].coefficient);assert.notEqual(rows[1].id,rows[2].id);
 assert.equal(rows[0].round_timestamp,iso);assert.equal(rows[0].timestamp,Date.parse(iso));assert.equal(rows[0].estimated,false);
 assert(h.calls.every(c=>c.url.startsWith('https://zulsrqkjkatzjjhacowy.supabase.co/')));
 assert(h.calls.every(c=>!('session-id' in c.options.headers)));
 assert.equal(h.elements.get('luckyjetSupabaseStatus').dataset.connected,'true');
});
test('PRO pagination returns archive totals and disjoint pages through the old proxy URL',async()=>{
 const h=harness(),base='https://old.supabase.co/functions/v1/v0xff3-live';
 const a=await(await h.c.fetch(base+'?limit=2')).json(),b=await(await h.c.fetch(base+'?limit=2&offset=2')).json();
 assert(a.ok);assert.equal(a.total,3);assert.equal(a.history.length,2);assert.equal(b.history[0].id,'round-1');
 assert.equal(new Set([...a.history,...b.history].map(r=>r.id)).size,3);
});
test('V0xFF3 snapshot and Beta coefficient API receive their expected response shape',async()=>{
 const h=harness();assert.equal((await(await h.c.fetch('https://old.supabase.co/functions/v1/v0xff3-live/snapshot?limit=5000')).json()).history.length,3);
 const result=await(await h.c.fetch('https://allpredictor.com/api/v1/luckyjet/coefficients')).json();assert(result.success);assert.equal(result.data[0].id,'round-3');
});
test('Disconnected source fails closed; cached archive is not relabelled LIVE',async()=>{
 const h=harness();await h.c.fetch(game);h.setConnected(false);await h.c.LuckyJetSupabase.getStatus(true);
 const result=await h.c.fetch(game);assert.equal(result.status,503);assert.equal(h.elements.get('luckyjetSupabaseStatus').dataset.connected,'false');
 assert.equal((await(await h.c.fetch('https://old.supabase.co/functions/v1/v0xff3-live?offset=1')).json()).history.length,2);
});
test('Rocket Queen, Aviator, licensing and Gemini requests retain their separate routes',async()=>{
 for(const path of ['/rocketqueen.html','/aviator.html']){const h=harness(path);assert.equal(await(await h.c.fetch(game)).text(),'passthrough');assert.equal(h.calls.length,1)}
 const h=harness();for(const url of ['https://xlidiojdbozxikjloiaj.supabase.co/rest/v1/rpc/check_license','https://generativelanguage.googleapis.com/v1beta/models/test:generateContent']){
  assert.equal(await(await h.c.fetch(url,{method:'POST',body:'{}'})).text(),'passthrough');
 }
});
test('Source clock is aligned only inside Lucky Jet; system Date is unchanged',async()=>{
 const h=harness(),before=Date.now();await h.c.LuckyJetSupabase.getStatus();
 assert(Math.abs(h.c.LuckyJetSupabase.now()-Date.parse(iso))<1000);assert.equal(h.c.Date,Date);assert(Math.abs(Date.now()-before)<3000);
 assert.equal(new h.c.LuckyJetSupabase.Date(iso).toISOString(),new Date(iso).toISOString());
});
test('Concurrent engines share the same network read; already-aborted callers do not load data',async()=>{
 const h=harness();await Promise.all([h.c.fetch(game),h.c.fetch(game)]);assert.equal(h.calls.length,2);
 const ctl=new AbortController();ctl.abort();await assert.rejects(h.c.fetch(game,{signal:ctl.signal}),{name:'AbortError'});
});
test('Realtime new round updates cached history once and carries its real time',async()=>{
 const h=harness();await h.c.LuckyJetSupabase.history(20);h.c.LuckyJetSupabase.connect();const socket=h.sockets[0];socket.onopen();
 const record={id:'round-4',coefficient:250,round_timestamp:'2026-10-15T12:00:15Z',origin:'live',collection_backend:'cloud'};
 const event={data:JSON.stringify({event:'postgres_changes',payload:{data:{record}}})};socket.onmessage(event);socket.onmessage(event);
 const data=await h.c.LuckyJetSupabase.history(20);assert.equal(data.rows[0].id,'round-4');assert.equal(data.rows.filter(r=>r.id==='round-4').length,1);assert.equal(data.total,4);
});
