const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let rows=Array.from({length:2000},(_,i)=>({id:'base'+i,coefficient:1.1,timestamp:Date.now()-i*12000,estimated:true}));
  await page.addInitScript(()=>{window.__testIntervals=[];const original=setInterval;window.setInterval=(...args)=>{const id=original(...args);window.__testIntervals.push(id);return id}});
  await page.route('**/functions/v1/v0xff3-live?*',route=>{const q=new URL(route.request().url()).searchParams,offset=+q.get('offset')||0,limit=+q.get('limit')||100;return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({ok:true,total:rows.length,history:rows.slice(offset,offset+limit)})})});
  await page.goto('http://127.0.0.1:8789',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.BogMLClient?.getState().artifactLoaded&&window.BogMLClient.getState().predictions.length);
  await page.evaluate(()=>window.__testIntervals.forEach(clearInterval));
  const feed=async(gap=false)=>{await page.evaluate(({rows,gap})=>window.BogMLClient.onFeed(rows,{online:true,fresh:true,pollAt:Date.now(),gap}),{rows,gap});await page.evaluate(()=>window.BogMLClient.flush())};
  let state=()=>page.evaluate(()=>window.BogMLClient.getState());
  const first=(await state()).predictions.find(p=>p.target===2&&p.horizon===3);assert(first&&first.status==='pending');
  await feed();await feed();assert.equal((await state()).predictions.find(p=>p.id===first.id).values.length,0);
  let sequence=0;
  async function add(values){const batch=values.map(v=>({id:'next'+(++sequence),coefficient:v,timestamp:Date.now(),estimated:true}));rows=[...batch.reverse(),...rows];await feed()}
  await add([1.1,1.2,3.5]);const hit=(await state()).predictions.find(p=>p.id===first.id);assert.equal(hit.outcome,1);assert.equal(hit.status,'observed');assert.equal(hit.values.length,3);
  await feed();assert.equal((await state()).predictions.find(p=>p.id===first.id).values.length,3);
  await add([1.1,1.1,1.1]);await add([1.1,1.1,1.1]);assert.equal(await page.locator('#mlResume').isVisible(),true);
  assert.equal((await state()).predictions.filter(p=>p.status==='pending'&&p.target===2).length,0);
  await page.locator('#mlResume').click();await page.evaluate(()=>window.BogMLClient.flush());
  const pending=(await state()).predictions.find(p=>p.status==='pending');assert(pending);
  await feed(true);assert.equal((await state()).predictions.find(p=>p.id===pending.id).status,'unknown');
  await add([2.2]);const before=(await state()).predictions.find(p=>p.status==='pending');assert(before);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.BogMLClient?.getState().artifactLoaded);await page.evaluate(()=>window.BogMLClient.ready);await page.evaluate(()=>window.__testIntervals.forEach(clearInterval));
  assert.equal((await state()).predictions.find(p=>p.id===before.id).status,'unknown');assert.equal(errors.length,0);
  fs.writeFileSync(path.resolve(__dirname,'../browser-journal-validation.json'),JSON.stringify({passed:7,checks:['forecast before future IDs','duplicate feeds ignored','batch results settled once','pause after two losses','manual resume','gap excluded','reload excluded'],errors},null,2));
  console.log('PASS 7 browser journal checks');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
