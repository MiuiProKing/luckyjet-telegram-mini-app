import test from 'node:test';
import assert from 'node:assert/strict';

const NOW=1800000000000;
const originalNow=Date.now;
Date.now=()=>NOW;
const source=Array.from({length:250},(_,i)=>({id:'r'+i,coefficient:i%10===0?50:1.5,
  round_timestamp:new Date(NOW-(249-i)*20000).toISOString(),estimated:false,feed_order:1000+i*2}));
const ledger=[];
let handler,networkCalls=0,inserts=0;
globalThis.Deno={env:{get:name=>name==='SUPABASE_URL'?'https://example.test':name==='SUPABASE_SERVICE_ROLE_KEY'?'server-test-key':undefined},serve:fn=>{handler=fn;}};
globalThis.fetch=async(url,options={})=>{
  networkCalls++;
  const requestURL=new URL(url),q=requestURL.searchParams,method=options.method||'GET';
  assert.equal(options.headers.apikey,'server-test-key');
  assert.equal(options.headers.Authorization,'Bearer server-test-key');
  if(requestURL.pathname.endsWith('/god_bayes_rounds_v1'))return Response.json(source);
  assert.ok(requestURL.pathname.endsWith('/god_bayes_signals_v1'));
  if(method==='POST'){
    const row=JSON.parse(options.body);inserts++;
    if(!ledger.some(existing=>existing.id===row.id))ledger.push({...row,actual:null,actual_at:null,round_id:null,checked_at:null,resolution_reason:null});
    return new Response(null,{status:204});
  }
  if(method==='PATCH'){
    const row=ledger.find(row=>'eq.'+row.id===q.get('id')&&'eq.'+row.status===q.get('status'));
    if(row)Object.assign(row,JSON.parse(options.body));
    return new Response(null,{status:204});
  }
  let rows=ledger;
  if(q.has('status'))rows=rows.filter(row=>'eq.'+row.status===q.get('status'));
  if(q.has('end_at'))rows=rows.filter(row=>Date.parse(row.end_at)<NOW);
  if(q.has('checked_at'))rows=rows.filter(row=>row.checked_at&&Date.parse(row.checked_at)<NOW-300000);
  return Response.json([...rows].reverse());
};
await import('./index.ts');

test('rejects client-written outcomes and unknown targets before database access',async()=>{
  const before=networkCalls;
  const invalid=new Request('https://edge.test',{method:'POST',body:JSON.stringify({target:40,status:'hit',actual:9999})});
  assert.equal((await handler(invalid)).status,400);
  assert.equal((await handler(new Request('https://edge.test?target=999'))).status,400);
  assert.equal(networkCalls,before);
});
test('creates a server-derived window and returns the same immutable window on the next request',async()=>{
  const a=await handler(new Request('https://edge.test?target=40'));
  assert.equal(a.status,200);const body=await a.json();
  assert.equal(body.window.target,40);assert.equal(body.phase,'scheduled');
  assert.equal(body.sourceFresh,true);assert.equal(body.window.status,'pending');
  assert.equal(body.window.validatedEdge,false);assert.ok(body.window.start>NOW);
  assert.equal(body.window.end-body.window.start,180000);
  assert.equal(JSON.stringify(body).includes('server-test-key'),false);
  const created=inserts;
  const b=await(await handler(new Request('https://edge.test?target=40'))).json();
  assert.equal(b.window.id,body.window.id);assert.equal(inserts,created);
  assert.deepEqual(b.window.interval95,body.window.interval95);
});
test('OPTIONS and unsupported methods do not read or mutate data',async()=>{
  const before=networkCalls;
  assert.equal((await handler(new Request('https://edge.test',{method:'OPTIONS'}))).status,204);
  assert.equal((await handler(new Request('https://edge.test',{method:'DELETE'}))).status,405);
  assert.equal(networkCalls,before);
});
test.after(()=>{Date.now=originalNow;});
