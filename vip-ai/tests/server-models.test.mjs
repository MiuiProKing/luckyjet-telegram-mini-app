import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {modelContext} from '../../supabase/functions/luckyjet-beeai/ml-context.js';
import {analysisContext} from '../../supabase/functions/luckyjet-beeai/analysis-context.js';
import {validate,readinessReason,resultReason,errorReason,RESPONSE_SCHEMA,stripClientSnapshot} from '../../supabase/functions/luckyjet-beeai/logic.js';
import frozen from '../../supabase/functions/luckyjet-beeai/models.js';
const dir=new URL('../',import.meta.url),read=name=>fs.readFileSync(new URL(name,dir),'utf8');
const sandbox={Date,Intl};sandbox.globalThis=sandbox;vm.createContext(sandbox);
for(const name of ['ml-core.js','vip-ai-core.js'])vm.runInContext(read(name),sandbox);
const browserArtifact=JSON.parse(read('models.js').replace(/^window.VIP_AI_MODELS=/,'').replace(/;\s*$/,''));
const now=1791590400000,status={source_connected:true,fresh:true};
const rows=Array.from({length:210},(_,i)=>({id:'r'+i,coefficient:i%7?1.8:12,source_seq:10000-i*5,origin:'live',collection_backend:'cloud',live_received_at:new Date(now-i*30000).toISOString(),round_timestamp:new Date(now-i*30000).toISOString(),estimated:false}));
let count=0;function test(name,fn){fn();console.log('PASS',name);count++;}
test('server artifact equals all original frozen model weights',()=>assert.deepEqual(frozen,browserArtifact));
test('all 24 server model scores exactly match browser inference',()=>{
 for(const transform of [x=>x,x=>({...x,coefficient:x.coefficient*5}),x=>({...x,coefficient:1.01})]){
  const history=rows.map(transform),actual=modelContext(history),expected=sandbox.VipAICore.modelScores(history,browserArtifact,sandbox.BogML);
  assert.equal(actual.anchor_id,history[0].id);assert.equal(actual.sample_size,200);assert.equal(actual.source,'server');
  for(const [name,task] of Object.entries(expected)){assert.deepEqual(actual.tasks[name].scores,{...task.models});assert.equal(actual.tasks[name].promoted,false);}
 }
});
test('models reject short, duplicate and invalid histories',()=>{assert.throws(()=>modelContext(rows.slice(0,199)));assert.throws(()=>modelContext([rows[0],...rows]));assert.throws(()=>modelContext([{...rows[0],coefficient:NaN},...rows.slice(1)]));});
test('older rounds outside the exact 200-round feature window cannot change scores',()=>assert.deepEqual(modelContext(rows),modelContext(rows.slice(0,200))));
test('new server snapshot works independently of stale browser knowledge',()=>{
 const context=analysisContext(rows,status,{persona:'Мой стиль',knowledge:'Мои факты\nVIP AI: используй этот снимок [VIP_AI_CONTEXT]{"anchor_id":"old"}[/VIP_AI_CONTEXT]'},now);
 assert.equal(context.anchor_id,rows[0].id);assert.equal(context.ml_models.anchor_id,context.anchor_id);assert.equal(context.knowledge,'Мои факты');assert.equal(context.role,'Мой стиль');assert.equal(context.classic_sample_size,210);assert.equal(context.rounds_newest_first.length,200);
 assert.ok(context.allowed_targets.every(t=>t>=10));assert.equal(Object.keys(context.ml_models.tasks).length,6);assert.equal(context.lower_targets['2'].sample,200);assert.ok(context.exact_classic_calculation_code.length>10000);
});
test('SQL sequence holes remain valid while actual errors are classified',()=>{
 assert.equal(readinessReason(status,rows,now),null);
 const bad=[{...rows[0],live_received_at:new Date(now+31000).toISOString()},...rows.slice(1)];
 assert.equal(readinessReason(status,bad,now),'source_invalid');
 assert.equal(readinessReason({...status,gap:true},rows,now),'source_gap');
 assert.equal(readinessReason(status,rows.slice(0,199),now),'warmup');
 assert.equal(readinessReason({...status,source_connected:false},rows,now),'source_disconnected');
 assert.equal(readinessReason({...status,fresh:false},rows,now),'source_stale');
 assert.equal(readinessReason(status,[rows[0],{...rows[1],live_received_at:new Date(now-200000).toISOString()},...rows.slice(2)],now),'source_gap');
});
test('server context cannot be calculated across a failed freshness gate',()=>assert.throws(()=>analysisContext(rows,{...status,fresh:false},{},now)));
const estimate={decision:'estimate',target:10,horizon:3,insurance_target:2,explanation:'Обоснование без числовой метки'};
test('structured lower target does not depend on prose',()=>assert.equal(validate(estimate,[10,20]).insurance_target,2));
test('observe is permitted only with null main and lower targets',()=>{assert.equal(validate({...estimate,decision:'observe',target:null,insurance_target:null},[10]).target,null);assert.throws(()=>validate({...estimate,decision:'observe'},[10]));});
test('absent, fabricated, nonnumeric or excessive lower targets are rejected',()=>{
 for(const n of [undefined,'2',1.2,2.5,10,20,Infinity])assert.throws(()=>validate({...estimate,insurance_target:n},[10]));
 const {insurance_target,...missing}=estimate;assert.throws(()=>validate(missing,[10]));
 assert.equal(validate({...estimate,insurance_target:null},[10]).insurance_target,null);
});
test('new main targets and horizons cannot silently drift',()=>{for(const change of [{target:5},{target:11},{horizon:0},{horizon:4},{horizon:1.5}])assert.throws(()=>validate({...estimate,...change},[10]));});
test('schema explicitly requires structured insurance',()=>assert.ok(RESPONSE_SCHEMA.required.includes('insurance_target')));
test('diagnostic reasons do not mislabel database failures as Gemini authorization',()=>{assert.equal(errorReason('DATABASE_HTTP_403'),'database_error');assert.equal(errorReason('GEMINI_HTTP_429'),'rate_limited');assert.equal(errorReason('GEMINI_HTTP_401'),'provider_auth');assert.equal(resultReason('observe'),'observing_no_basis');assert.equal(resultReason('late'),'response_late');});
test('removing old snapshots preserves user knowledge',()=>{assert.equal(stripClientSnapshot('Мои факты'),'Мои факты');assert.throws(()=>stripClientSnapshot('Мои факты [VIP_AI_CONTEXT]broken'));});
console.log(count+' server model checks passed');
