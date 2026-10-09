'use strict';
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/classic-calculations.js','utf8');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);
process.stdin.on('end',()=>{
 const data=JSON.parse(input),now=data.now||Date.now();
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}getHours(){return +new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',hourCycle:'h23'}).format(this)}getMinutes(){return +new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',minute:'2-digit'}).format(this)}}
 const context=vm.createContext({window:{},Date:Clock,Intl,input:data});
 const setup=`const ENGINE=window.GodPreditor,MODEL_LIMIT=2000,COVERAGE_MS=15000,FRESH_MS=180000;let rounds=[],collectorStatus=input.collector,online=true,lastPollAt=${now};`;
 const marker=code.indexOf('// CLASSIC_PAGE_RULES');
 vm.runInContext(code.slice(0,marker)+setup+code.slice(marker),context,{timeout:3000});
 const result=vm.runInContext(`rounds=normalizeFeed(input.rows.map((r,i)=>({...r,_sequence:input.rows.length-i}))).rows;JSON.stringify({normal:ordinaryAnalysis(),vip:vipPrediction(),big:bigOpportunity(),version:ENGINE.version,rows:rounds.length})`,context,{timeout:3000});
 process.stdout.write(result);
});
