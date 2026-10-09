export const TARGETS=[1.5,2,3,5,10,20,50,100];
export const INSURANCE_TARGETS=[1.5,2,3,5];
export const RESPONSE_SCHEMA={type:'object',properties:{
 decision:{type:'string',enum:['observe','estimate']},
 target:{type:'number',nullable:true},horizon:{type:'integer'},
 insurance_target:{type:'number',nullable:true},
 explanation:{type:'string'}
},required:['decision','target','horizon','insurance_target','explanation']};
export function validate(value,allowed){
 if(!value||!['observe','estimate'].includes(value.decision)||!Number.isInteger(value.horizon)||value.horizon<1||value.horizon>3||typeof value.explanation!=='string'||!value.explanation.length||value.explanation.length>1600)throw Error('BEE_INVALID_REPLY');
 if(value.decision==='estimate'&&(typeof value.target!=='number'||!Number.isFinite(value.target)||value.target<10||!allowed.includes(value.target)))throw Error('BEE_INVALID_TARGET');
 if(value.decision==='observe'&&value.target!==null)throw Error('BEE_INVALID_TARGET');
 if(!Object.hasOwn(value,'insurance_target')||(value.insurance_target!==null&&(!INSURANCE_TARGETS.includes(value.insurance_target)||value.decision!=='estimate'||value.insurance_target>=value.target)))throw Error('BEE_INVALID_INSURANCE');
 return {decision:value.decision,target:value.target,horizon:value.horizon,insurance_target:value.insurance_target,explanation:value.explanation};
}
export function readinessReason(status,rows,now=Date.now()){
 if(status?.source_connected!==true)return 'source_disconnected';
 if(status.fresh!==true)return 'source_stale';
 if(status.error||status.gap||status.has_gap)return 'source_gap';
 const required=Math.max(200,Number(status.warmup_required)||200);
 if(rows.length<required||(status.session_rounds!=null&&(!Number.isFinite(Number(status.session_rounds))||Number(status.session_rounds)<required)))return 'warmup';
 const sample=rows.slice(0,required),seen=new Set(),seqs=new Set();
 for(let i=0;i<sample.length;i++){
  const r=sample[i],seq=Number(r.source_seq),received=Date.parse(r.live_received_at);
  if(!r.id||seen.has(String(r.id))||!Number.isSafeInteger(seq)||seq<=0||seqs.has(seq)||r.collection_backend!=='cloud'||r.origin!=='live'||!Number.isFinite(Number(r.coefficient))||Number(r.coefficient)<1)return 'source_invalid';
  seen.add(String(r.id));seqs.add(seq);
  if(!Number.isFinite(received)||received>now+30000)return 'source_invalid';
  if(i===0&&now-received>=180000)return 'source_stale';
  if(i>0&&(seq>=Number(sample[i-1].source_seq)||received>Date.parse(sample[i-1].live_received_at)||Date.parse(sample[i-1].live_received_at)-received>=180000))return 'source_gap';
 }
 return null;
}
export function ready(status,rows,now=Date.now()){return readinessReason(status,rows,now)===null}
export function stripClientSnapshot(knowledge){
 const text=String(knowledge||''),start=text.indexOf('[VIP_AI_CONTEXT]');
 if(start<0)return text;
 const end=text.indexOf('[/VIP_AI_CONTEXT]',start);
 if(end<0)throw Error('BEE_INVALID_CLIENT_CONTEXT');
 const instruction=text.lastIndexOf('VIP AI: используй этот снимок',start);
 return (text.slice(0,instruction<0?start:instruction)+text.slice(end+'[/VIP_AI_CONTEXT]'.length)).trim();
}
export function errorReason(code){return /^DATABASE_HTTP_/.test(code)?'database_error':/_429$/.test(code)?'rate_limited':/_(401|403)$/.test(code)?'provider_auth':'analysis_error'}
export function resultReason(state){return ({pending:'pending_window',observe:'observing_no_basis',late:'response_late',unknown:'paused',duplicate:'duplicate_anchor'})[state]||'analysis_error'}
export function settle(prediction,rows,connected,now=Date.now()){
 const window=rows.slice(0,prediction.horizon),created=Date.parse(prediction.created_at);
 if(!connected||!Number.isFinite(created)||window.some((r,i)=>r.estimated||!Number.isFinite(Date.parse(r.round_timestamp))||!Number.isFinite(Date.parse(r.live_received_at))||Date.parse(r.round_timestamp)<=created||Date.parse(r.live_received_at)<=created||Date.parse(r.live_received_at)-(i?Date.parse(window[i-1].live_received_at):created)>=180000)||(!window.length&&now-created>=180000))return {status:'unknown',observed:prediction.observed};
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
