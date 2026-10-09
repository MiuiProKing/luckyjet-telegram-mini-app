import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {stripTypeScriptTypes} from 'node:module';
const root=new URL('./',import.meta.url),folder=new URL('../supabase/functions/luckyjet-beeai/',root);
const context=vm.createContext({Date,Intl,console,Number,Math,Set,JSON});
async function module(name){const value=new vm.SourceTextModule(fs.readFileSync(new URL(name,folder),'utf8'),{context});await value.link(()=>{throw Error('UNEXPECTED_IMPORT')});await value.evaluate();return value.namespace;}
const logic=await module('logic.js'),classic=await module('classic.js');let count=0;
function test(name,run){run();count++;console.log('PASS '+name);}
const now=Date.UTC(2026,9,9,10,0),p={created_at:new Date(now).toISOString(),horizon:3,target:10,observed:0};
const round=(id,coefficient,at=now+1000)=>({id,coefficient,round_timestamp:new Date(at).toISOString(),live_received_at:new Date(at+10).toISOString(),estimated:false,origin:'live',collection_backend:'cloud'});
test('Future hit is identified once within registered horizon',()=>{const result=logic.settle(p,[round('low',1.2),round('hit',12,now+2000)],true);assert.equal(result.status,'hit');assert.equal(result.result_id,'hit');assert.equal(result.observed,2)});
test('Miss retains the actual maximum and last ID',()=>{const result=logic.settle(p,[round('a',1.1),round('b',5,now+2000),round('c',2,now+3000)],true);assert.equal(result.status,'miss');assert.equal(result.actual,5);assert.equal(result.result_id,'c')});
test('A later hit outside the window cannot score',()=>assert.equal(logic.settle(p,[round('a',1),round('b',1),round('c',1),round('later',100)],true).status,'miss'));
test('Past and approximate coefficients cannot score',()=>{for(const r of [round('past',100,now-1000),{...round('estimated',100),estimated:true}])assert.equal(logic.settle(p,[r],true).status,'unknown')});
test('Disconnected source and delivery gaps become unknown',()=>{assert.equal(logic.settle(p,[round('hit',100)],false).status,'unknown');assert.equal(logic.settle(p,[round('gap',100,now+181000)],true).status,'unknown')});
test('Unfinished window remains pending and ages out',()=>{assert.equal(logic.settle(p,[round('low',1)],true,now+5000).status,'pending');assert.equal(logic.settle(p,[],true,now+181000).status,'unknown')});
test('Replies are schema validated; abstention clears target',()=>{assert.equal(logic.validate({decision:'observe',target:10,horizon:3,explanation:'Наблюдение'},[10]).target,null);for(const value of [{target:NaN,horizon:1},{target:1000,horizon:1},{target:10,horizon:4},{target:10,horizon:true}])assert.throws(()=>logic.validate({decision:'estimate',explanation:'text',...value},[10]))});
test('Arbitrary settings and browser API keys cannot be submitted',()=>{assert.throws(()=>logic.settingsChange({api_key:'no'}));assert.throws(()=>logic.settingsChange({enabled:'yes'}));assert.equal(logic.settingsChange({enabled:false}).enabled,false)});
const history=Array.from({length:200},(_,i)=>({...round('r'+i,i%15===0?20:1.5,now-i*10000-1000),timestamp:now-i*10000-1000,_sequence:200-i}));
const status={source_connected:true,fresh:true,error:''};
test('Warmup requires 200 continuous cloud rounds, not imported archive',()=>{assert(logic.ready(status,history,now));assert(!logic.ready(status,history.slice(1),now));assert(!logic.ready(status,history.map(r=>({...r,collection_backend:'pc_import'})),now));assert(!logic.ready({...status,error:'failed'},history,now))});
test('Cloud functions preserve exact classic code hash',()=>{const manifest=JSON.parse(fs.readFileSync(new URL('bee-build-manifest.json',root),'utf8'));assert.equal(manifest.classic_calculation_sha256,'1969c3ff26d93314d21089573258c580e1734a4c90554fde7c49519097bcfb14')});
test('Cloud classic functions run without DOM, PC or network',()=>{const value=classic.evaluateClassic(history,{...status,session_rounds:200,warmup_required:200},now);assert.equal(value.rows,200);assert(value.normal);assert(value.vip);assert(Number.isFinite(value.normal.target))});
test('Edge TypeScript parses as a module with stripped types',()=>{const source=stripTypeScriptTypes(fs.readFileSync(new URL('index.ts',folder),'utf8'),{mode:'strip'});new vm.SourceTextModule(source,{context})});
console.log('PASS '+count+' BeeAI cloud scenarios');
