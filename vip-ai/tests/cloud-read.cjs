// Read-only verification of the same public LIVE source the VIP panel uses.
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const html=fs.readFileSync('vip-ai/index.html','utf8'),m=html.match(/window\.BOG_CLOUD\s*=\s*(\{[^\n]+?\});/);
 assert.ok(m,'cloud configuration');const config=JSON.parse(m[1]),headers={apikey:config.anonKey,Authorization:'Bearer '+config.anonKey};
 const statusResponse=await fetch(config.url+'/rest/v1/rpc/luckyjet_cloud_status',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
 assert.equal(statusResponse.status,200,'status RPC accessible');const status=await statusResponse.json();
 const response=await fetch(config.url+'/rest/v1/luckyjet_rounds?select=id,coefficient,round_timestamp,estimated,source_seq,origin,collection_backend,live_received_at&origin=eq.live&collection_backend=eq.cloud&order=source_seq.desc&limit=200',{headers,signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,'public cloud LIVE readable');const rows=await response.json();assert.ok(Array.isArray(rows));assert.ok(rows.length>0,'LIVE database has rounds');
 for(const r of rows){assert.equal(r.origin,'live');assert.equal(r.collection_backend,'cloud');assert.ok(Number(r.coefficient)>=1)}
 const vm=require('node:vm'),box={Date,Intl};box.globalThis=box;vm.createContext(box);vm.runInContext(fs.readFileSync('vip-ai/vip-ai-core.js','utf8'),box);if(status.source_connected&&status.fresh&&!status.error)assert.equal(box.VipAICore.sourceReason(status,box.VipAICore.liveRows(rows)),null,'real LIVE passes warmup gate');
 console.log(JSON.stringify({api:'reachable',rows:rows.length,source_connected:status.source_connected,fresh:status.fresh,session_rounds:status.session_rounds,error:status.error||null,latest_received_at:rows[0]?.live_received_at,sequence_gaps:rows.slice(1).filter((r,i)=>Number(rows[i].source_seq)-Number(r.source_seq)!==1).length}));
 // Reachable API is not evidence that the upstream collector or Gemini quota is healthy.
})().catch(e=>{console.error(e);process.exitCode=1});
