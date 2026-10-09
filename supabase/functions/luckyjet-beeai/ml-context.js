import artifact from './models.js';
import {features,predict} from './ml-core.js';
export function modelContext(history){
 const sample=history.slice(0,200);
 if(sample.length!==200||new Set(sample.map(r=>String(r.id))).size!==200)throw Error('BEE_MODEL_INPUT');
 const x=features(sample.map(r=>Number(r.coefficient)).reverse());
 if(!x||x.length!==artifact.feature_names.length)throw Error('BEE_MODEL_INPUT');
 const tasks={};
 for(const [name,task] of Object.entries(artifact.tasks)){
  const scores=Object.fromEntries(Object.entries(task.models).map(([key,model])=>[key,predict(model,x)]));
  if(Object.values(scores).some(v=>!Number.isFinite(v)||v<=0||v>=1))throw Error('BEE_MODEL_SCORE');
  tasks[name]={target:task.target,horizon:task.horizon,selected:task.selected,baseline:task.baseline,promoted:false,scores};
 }
 return {source:'server',anchor_id:String(sample[0].id),sample_size:200,artifact_version:artifact.version,source_order_certified:false,advantage_proven:false,tasks};
}
