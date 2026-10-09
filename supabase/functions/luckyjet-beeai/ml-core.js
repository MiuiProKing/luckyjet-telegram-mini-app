/* Numeric inference for trained models. No requests, account access or fabricated results. */
'use strict';
const sigmoid=x=>1/(1+Math.exp(-Math.max(-40,Math.min(40,x))));
const bounded=p=>Math.max(1e-6,Math.min(1-1e-6,p));
function timeOptions(options){try{new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv'});return {...options,timeZone:'Europe/Kyiv'}}catch(_){return {...options,timeZone:'Europe/Kiev'}}}
function displayTime(value){return new Date(value).toLocaleTimeString('ru-RU',timeOptions({hour:'2-digit',minute:'2-digit',second:'2-digit'}))}
function dateKey(value){const parts=new Intl.DateTimeFormat('en-CA',timeOptions({year:'numeric',month:'2-digit',day:'2-digit'})).formatToParts(new Date(value)),get=k=>parts.find(p=>p.type===k).value;return get('year')+'-'+get('month')+'-'+get('day')}
function features(history){
 if(!Array.isArray(history)||history.length<200)return null;
 const a=history.slice(-200).map(Number);if(a.some(n=>!Number.isFinite(n)||n<1))return null;
 const result=[];
 for(const width of [20,50,200]){const part=a.slice(-width),logs=part.map(n=>Math.log(Math.min(n,1000))),mean=logs.reduce((s,n)=>s+n,0)/width;
  result.push(mean,Math.sqrt(logs.reduce((s,n)=>s+(n-mean)**2,0)/width));
  for(const t of [2,5,10])result.push(part.filter(n=>n>=t).length/width);
 }
 result.push(...a.slice(-5).reverse().map(n=>Math.log(Math.min(n,1000))));
 for(const t of [5,10,20,50]){let gap=200;for(let i=199;i>=0;i--)if(a[i]>=t){gap=199-i;break}result.push(gap/200)}
 const logs=a.map(n=>Math.log(Math.min(n,1000)));
 for(const width of [5,10,20,50,100]){const part=logs.slice(-width),alpha=2/(width+1);let value=part[0];for(const item of part.slice(1))value=alpha*item+(1-alpha)*value;result.push(value)}
 for(const width of [20,50,200]){const sorted=logs.slice(-width).sort((a,b)=>a-b);for(const q of [.25,.5,.75]){const at=(width-1)*q,lo=Math.floor(at);result.push(sorted[lo]+(sorted[Math.ceil(at)]-sorted[lo])*(at-lo))}}
 for(const t of [1.5,2,3]){let streak=0;for(let i=199;i>=0&&a[i]<t;i--)streak++;result.push(streak/200)}
 return result.map(Math.fround);
}
function rawProbability(model,x){
 if(!model||!Array.isArray(x)||x.some(n=>!Number.isFinite(n)))throw Error('Invalid numeric model input');
 let z=0;
 if(model.type==='logistic'){z=model.intercept;for(let i=0;i<x.length;i++)z+=(x[i]-model.mean[i])/model.std[i]*model.coefficients[i]}
 else if(model.type==='catboost'){for(const tree of model.trees){let leaf=0;tree.splits.forEach(([feature,border],i)=>{if(Math.fround(x[feature])>border)leaf|=1<<i});z+=tree.leaves[leaf]}z=z*model.scale+model.bias}
 else if(model.type==='lightgbm'){for(const tree of model.trees){let node=tree;while(Array.isArray(node))node=x[node[0]]<=node[1]?node[2]:node[3];z+=node}}
 else if(model.type==='xgboost'){z=model.bias;for(const tree of model.trees){let node=tree;while(Array.isArray(node))node=Math.fround(x[node[0]])<Math.fround(node[1])?node[2]:node[3];z+=node}}
 else throw Error('Unsupported model');
 return bounded(sigmoid(z));
}
function predict(model,x){const p=rawProbability(model,x),cal=model.calibration||[1,0];return bounded(sigmoid(cal[0]*Math.log(p/(1-p))+cal[1]))}
function decision(artifact,task,quality={}){
 const reasons=[...(task?.reasons||[])];
 if(!artifact?.source_certified||!artifact?.actual_game_order_verified)reasons.push('Полнота и игровой порядок источника не подтверждены');
 if(!quality.fresh)reasons.push('Нет свежего подтверждённого обновления');
 if(quality.gap)reasons.push('Есть разрыв наблюдения');
 if(quality.approximate)reasons.push('Время наблюдения оценочное');
 const ci=task?.improvement_interval;if(!ci||ci[0]<=0)reasons.push('Преимущество над базовой частотой не подтверждено');
 return {promoted:!!task?.promoted&&reasons.length===0,reasons:[...new Set(reasons)]};
}
function score(records){
 const good=records.filter(r=>r.status==='observed'&&[r.outcome,r.probability,r.baseline].every(Number.isFinite));
 if(!good.length)return {count:0,brier:null,baselineBrier:null};
 return {count:good.length,brier:good.reduce((s,r)=>s+(r.outcome-r.probability)**2,0)/good.length,baselineBrier:good.reduce((s,r)=>s+(r.outcome-r.baseline)**2,0)/good.length};
}
export {features,rawProbability,predict,decision,score,displayTime,dateKey,timeOptions};
