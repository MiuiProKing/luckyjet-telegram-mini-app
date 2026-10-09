import {evaluateClassic,CLASSIC_CODE} from './classic.js';
import {TARGETS,readinessReason,stripClientSnapshot} from './logic.js';
import {modelContext} from './ml-context.js';
export const REVISION='20261010-server-ml-v1';
export function analysisContext(history,status,config,now=Date.now()){
 const reason=readinessReason(status,history,now);if(reason)throw Error('BEE_INPUT_'+reason);
 const head=history[0],data=history.map(r=>({...r,timestamp:r.round_timestamp?Date.parse(r.round_timestamp):null,coefficient:Number(r.coefficient)}));
 const classic=evaluateClassic(data,{source_connected:true,fresh:true,session_rounds:history.length,warmup_required:200},now);
 const allowed=[...new Set([...TARGETS.filter(t=>t>=10),...['normal','vip','big'].map(k=>classic[k]?.target).filter(t=>Number.isFinite(t)&&t>=10&&t<=1000).map(t=>Number(t.toFixed(2)))])];
 const ml_models=modelContext(history),lower_targets=Object.fromEntries([1.5,2,3,5].map(t=>[String(t),{hits:history.slice(0,200).filter(r=>Number(r.coefficient)>=t).length,sample:200}]));
 const context={revision:REVISION,ml_models,lower_targets,source:'Lucky Jet → Supabase cloud',time_zone:'Europe/Kyiv',source_order_verified:false,game_round_start_verified:false,anchor_id:head.id,allowed_targets:allowed,classic,classic_sample_size:history.length,historical_frequencies_not_forecast:Object.fromEntries(TARGETS.map(t=>[String(t),{hits:history.filter(r=>Number(r.coefficient)>=t).length,sample:history.length}])),rounds_newest_first:data.slice(0,200).map(({coefficient,timestamp,estimated})=>({coefficient,timestamp,estimated})),role:config.persona,knowledge:stripClientSnapshot(config.knowledge),exact_classic_calculation_code:CLASSIC_CODE};
 return context;
}
