const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(process.argv[2]||'http://127.0.0.1:8789',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.BogMLClient?.getState().artifactLoaded,{timeout:30000});
 await page.waitForFunction(()=>window.BogMLClient?.getState().storedCount>=200,{timeout:30000});
 await page.evaluate(()=>window.BogMLClient.flush());
 const state=await page.evaluate(()=>({title:document.title,ml:document.getElementById('mlState').textContent,stats:document.getElementById('mlStorage').textContent,tableRows:document.querySelectorAll('#mlComparison tr').length,client:window.BogMLClient.getState(),overflow:document.documentElement.scrollWidth>innerWidth}));
 try{await page.screenshot({path:path.join(root,'browser-desktop.png'),timeout:10000,animations:'disabled'})}catch(e){console.log('Screenshot unavailable: '+e.message.split('\n')[0])}
 await page.setViewportSize({width:390,height:844});await page.locator('#mlTarget').selectOption('50');await page.locator('#mlHorizon').selectOption('1');
 const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,text:document.getElementById('mlEvent').textContent,tableRows:document.querySelectorAll('#mlComparison tr').length}));
 try{await page.screenshot({path:path.join(root,'browser-mobile.png'),timeout:10000,animations:'disabled'})}catch(e){console.log('Screenshot unavailable: '+e.message.split('\n')[0])}
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.BogMLClient?.getState().artifactLoaded&&window.BogMLClient?.getState().storedCount>=200);
 const reload=await page.evaluate(()=>window.BogMLClient.getState());
 fs.writeFileSync(path.join(root,'browser-validation.json'),JSON.stringify({errors,state,mobile,reload},null,2));
 console.log(JSON.stringify({errors,stored:state.client.storedCount,predictions:state.client.predictions.length,tableRows:state.tableRows,mobile,afterReload:reload.storedCount}));
 await browser.close();if(errors.length||mobile.overflow||state.overflow)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
