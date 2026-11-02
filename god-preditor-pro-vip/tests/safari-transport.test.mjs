import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createExtensionFetch, permittedPage} from '../safari/src/transport.mjs';
import {createSupabaseFeed} from '../supabase-feed.mjs';
import {SUPABASE_CONFIG as config} from '../supabase-config.mjs';

const endpoint = config.url + '/rest/v1/' + config.table + '?select=id';
test('Safari transport supports the stable Userscripts Promise and callback API', async () => {
  for (const kind of ['promise','callback']) {
    let request;
    const gm = {xmlHttpRequest(details) {
      request = details;
      const response = {status:200,responseText:'[{"coefficient":1.5}]'};
      if(kind==='promise')return Promise.resolve(response);
      queueMicrotask(()=>details.onload(response));return {abort(){}};
    }};
    const response = await createExtensionFetch(gm,config)(endpoint);
    assert.equal(response.ok,true);assert.deepEqual(await response.json(),[{coefficient:1.5}]);
    assert.equal(request.method,'GET');assert.equal(request.headers.apikey,config.publishableKey);
    assert.equal(request.data,undefined);assert.equal(request.user,undefined);assert.equal(request.password,undefined);
  }
});
test('transport cannot call casino APIs, another table, or a write operation', async () => {
  let requests=0;const fetch=createExtensionFetch({xmlHttpRequest(){requests++;}},config);
  for(const url of ['https://one-vv3016.com/api/bet',config.url+'/rest/v1/users',config.url+'.example.com/rest/v1/'+config.table])
    await assert.rejects(fetch(url),/только чтение/);
  await assert.rejects(fetch(endpoint,{method:'POST'}),/только чтение/);
  assert.equal(requests,0);
});
test('abort and transport errors do not produce successful responses', async () => {
  let aborted=false;
  const controller=new AbortController();
  const fetch=createExtensionFetch({xmlHttpRequest(){return {abort(){aborted=true;}};}},config);
  const pending=fetch(endpoint,{signal:controller.signal});controller.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(aborted,true);
  const failed=createExtensionFetch({xmlHttpRequest(d){queueMicrotask(()=>d.onerror());return {abort(){}};}},config);
  await assert.rejects(failed(endpoint),/нет соединения/);
  const error=createExtensionFetch({xmlHttpRequest(){return Promise.resolve({status:401,responseText:'{"code":"PGRST301"}'});}},config);
  const result=await error(endpoint);assert.equal(result.ok,false);assert.equal(result.status,401);
});
test('the real feed adapter accepts confirmed provider timestamps via GM and retains cursor order', async () => {
  const now=Date.now(),calls=[],batches=[];let connected;
  const done=new Promise(resolve=>connected=resolve);
  const fetchImpl=createExtensionFetch({xmlHttpRequest(d){calls.push(d);return Promise.resolve({status:200,responseText:JSON.stringify([
    {id:'known',source_seq:7,coefficient:1.5,round_timestamp:new Date(now-1000).toISOString(),estimated:false},
    {id:'estimated',source_seq:6,coefficient:500,round_timestamp:new Date(now-2000).toISOString(),estimated:true},
    {id:'untimed',source_seq:5,coefficient:2,round_timestamp:null,estimated:false},
  ])});}},config);
  const feed=createSupabaseFeed(config,{fetchImpl,onRounds:rows=>batches.push(rows),onStatus:s=>{if(s.state==='connected')connected(s);},schedule:()=>1,cancel:()=>{},now:()=>now});
  try{const status=await done;assert.equal(status.cursor,'7');assert.equal(batches[0].length,1);assert.equal(batches[0][0].id,'supabase:luckyjet:known');
    assert.equal(new URL(calls[0].url).searchParams.get('completed'),'eq.true');}
  finally{feed.stop();}
});
test('only the requested casino host and the explicit preview page can mount the overlay', () => {
  for(const url of ['https://one-vv3016.com/casino/play/v_1wingames:luckyjet?p=tmgj','https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/safari/preview.html'])assert.equal(permittedPage(new URL(url)),true);
  for(const url of ['http://one-vv3016.com/','https://one-vv3016.com.example.com/','https://other-casino.com/','https://miuiproking.github.io/other/'])assert.equal(permittedPage(new URL(url)),false);
});
test('installable file is self-contained, frame restricted and declares only its required GM permissions', async () => {
  const source=await readFile(new URL('../safari/god-preditor.user.js',import.meta.url),'utf8');
  assert.ok(source.startsWith('// ==UserScript=='));
  assert.match(source,/@inject-into\s+content/);assert.match(source,/@noframes/);
  const grants=[...source.matchAll(/^\/\/ @grant\s+(.*)$/gm)].map(m=>m[1]);
  assert.deepEqual(grants,['GM.xmlHttpRequest','GM.getValue','GM.setValue']);
  assert.doesNotMatch(source,/@require\s/);assert.doesNotMatch(source,/\beval\s*\(|new Function\s*\(/);
  assert.doesNotMatch(source,/document\.cookie|type=.?password|querySelector\(.?input/);
});
