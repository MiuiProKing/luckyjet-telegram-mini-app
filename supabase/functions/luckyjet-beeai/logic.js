export const TARGETS=[1.5,2,3,5,10,20,50,100];
export function validate(value,allowed){
 if(!value||!['observe','estimate'].includes(value.decision)||!Number.isInteger(value.horizon)||value.horizon<1||value.horizon>3||typeof value.explanation!=='string'||!value.explanation.length||value.explanation.length>1600)throw Error('BEE_INVALID_REPLY');
 if(value.decision==='estimate'&&(typeof value.target!=='number'||!Number.isFinite(value.target)||!allowed.includes(value.target)))throw Error('BEE_INVALID_TARGET');
 return {...value,target:value.decision==='observe'?null:value.target};
}
export function ready(status,rows,now=Date.now()){
 if(!status?.source_connected||!status.fresh||status.error||rows.length<200)return false;
 const sample=rows.slice(0,200).reverse();
 return sample.every((r,i)=>r.collection_backend==='cloud'&&r.origin==='live'&&Number.isFinite(Number(r.coefficient))&&Number(r.coefficient)>=1&&Number.isFinite(Date.parse(r.live_received_at))&&(i===0||Date.parse(r.live_received_at)-Date.parse(sample[i-1].live_received_at)<180000))&&now-Date.parse(rows[0].live_received_at)<180000;
}
export function settle(prediction,rows,connected,now=Date.now()){
 const window=rows.slice(0,prediction.horizon),created=Date.parse(prediction.created_at);
 if(!connected||window.some((r,i)=>r.estimated||!r.round_timestamp||Date.parse(r.round_timestamp)<=created||Date.parse(r.live_received_at)<=created||Date.parse(r.live_received_at)-(i?Date.parse(window[i-1].live_received_at):created)>=180000)||(!window.length&&now-created>=180000))return {status:'unknown',observed:prediction.observed};
 const hit=window.find(r=>Number(r.coefficient)>=Number(prediction.target));
 if(hit)return {status:'hit',observed:window.indexOf(hit)+1,actual:Number(hit.coefficient),result_id:hit.id};
 if(window.length>=prediction.horizon)return {status:'miss',observed:window.length,actual:Math.max(...window.map(r=>Number(r.coefficient))),result_id:window.at(-1).id};
 return {status:'pending',observed:window.length};
}
export function settingsChange(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['enabled','persona','knowledge'].includes(k)))throw Error('BEE_INVALID_SETTINGS');
 if('enabled' in value&&typeof value.enabled!=='boolean')throw Error('BEE_INVALID_SETTINGS');
 for(const [key,limit] of [['persona',1000],['knowledge',2000]])if(key in value&&(typeof value[key]!=='string'||value[key].length>limit))throw Error('BEE_INVALID_SETTINGS');
 return value;
}
