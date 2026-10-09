/* VIP AI validation and model context; no requests or secrets. */
(function(root){
'use strict';
const START='[VIP_AI_CONTEXT]',END='[/VIP_AI_CONTEXT]';
function epoch(v){if(v==null||v==='')return null;const n=typeof v==='number'?(v<1e12?v*1000:v):Date.parse(v);return Number.isFinite(n)?n:null}
function clean(rows){const seen=new Map();for(const r of rows||[]){const id=String(r.id||'');const coefficient=Number(r.coefficient??r.coef);if(!id||!Number.isFinite(coefficient)||coefficient<1)continue;if(seen.has(id)){if(seen.get(id).coefficient!==coefficient)throw Error('Конфликт коэффициентов одного раунда');continue}seen.set(id,{...r,id,coefficient,timestamp:epoch(r.timestamp??r.round_timestamp)});}return [...seen.values()]}
function sourceReason(s,rows,now=Date.now()){
 if(!s||s.source_connected!==true)return 'Сборщик Supabase не подключён';
 if(s.fresh!==true)return 'Данные Supabase устарели';
 if(s.error||s.gap||s.has_gap)return 'Источник сообщает ошибку или разрыв';
 const required=Math.max(200,Number(s.warmup_required)||200),session=s.session_rounds==null?null:Number(s.session_rounds);
 if(rows.length<required||(session!=null&&(!Number.isFinite(session)||session<required)))return 'Разогрев: нужны '+required+' свежих последовательных раундов';
 // The cloud RPC has no session counter; confirm warmup from actual cloud LIVE receipts, as the server does.
 const sample=rows.slice(0,required),received=sample.map(r=>epoch(r.live_received_at));
 if(sample.some(r=>r.origin!=='live'||r.collection_backend!=='cloud')||received.some(t=>t==null)||now-received[0]>=180000||received[0]>now+30000)return 'Свежесть LIVE раундов не подтверждена';
 for(let n=1;n<received.length;n++)if(received[n]>received[n-1]||received[n-1]-received[n]>=180000)return 'Разрыв времени получения LIVE раундов';
 return null;
}
function evaluate(p,s,rows,now,reportAt){
 let list;try{list=clean(rows)}catch(e){return {active:false,reason:e.message}}
 const reason=sourceReason(s,list,now);if(reason)return {active:false,reason};
 if(!reportAt||now-reportAt>20000||reportAt>now+30000)return {active:false,reason:'Связь с облачным ИИ не подтверждена'};
 if(!p)return {active:false,reason:'ИИ пока не зарегистрировал прогноз'};
 if(p.status!=='pending')return {active:false,reason:'Окно закрыто: '+p.status};
 if(!(Number(p.target)>=10)||![1,2,3].includes(Number(p.horizon)))return {active:false,reason:'Нет нового прогноза ≥10× на 1–3 раунда'};
 const created=epoch(p.created_at);if(!created||created>now+30000||now-created>180000)return {active:false,reason:'Время или актуальность прогноза не подтверждены'};
 const at=list.findIndex(r=>r.id===String(p.anchor_id));if(at<0)return {active:false,reason:'Опорный раунд отсутствует в текущем LIVE'};
 const subsequent=list.slice(0,at);
 // Never reinterpret a recorded pending forecast as a future opportunity after its target appeared.
 if(subsequent.some(r=>r.coefficient>=Number(p.target)))return {active:false,reason:'Цель уже появилась после опорного раунда; ожидаю результат сервера'};
 const observed=Math.max(Number(p.observed)||0,subsequent.length),remaining=Number(p.horizon)-observed;
 if(remaining<=0)return {active:false,reason:'Окно уже закончилось; ожидаю результат сервера'};
 if(subsequent.some(r=>r.timestamp!=null&&r.timestamp<created-30000))return {active:false,reason:'Порядок времени раундов не подтверждён'};
 return {active:true,reason:'Экспериментальный сигнал, преимущество не доказано',remaining,created,anchorRows:list.slice(at),observed};
}
function modelScores(rows,artifact,ml){const list=clean(rows);const x=ml.features(list.slice(0,200).map(r=>r.coefficient).reverse());if(!x)return null;
 const result={};for(const [key,task] of Object.entries(artifact.tasks)){result[key]={target:task.target,horizon:task.horizon,selected:task.selected,baseline:task.baseline,promoted:false,models:Object.fromEntries(Object.entries(task.models).map(([name,m])=>[name,ml.predict(m,x)]))};}return result;
}
function context(rows,status,classic,scores,now){
 const list=clean(rows),reason=sourceReason(status,list);if(reason)throw Error(reason);
 if(!scores)throw Error('Недостаточно раундов для моделей');
 const compact={version:1,anchor_id:list[0].id,created_at:new Date(now).toISOString(),use_only_if_anchor_matches:true,source_order_certified:false,advantage_proven:false,classic:classic?.vip?{target:classic.vip.target,score:classic.vip.score,at:classic.vip.at,window:classic.vip.window,estimated:classic.vip.estimated,insurance_formula:classic.insurance?.insurance}:null,
 lower_targets:Object.fromEntries([1.5,2,3,5].map(t=>[t,list.slice(0,200).filter(r=>r.coefficient>=t).length/200])),models:Object.fromEntries(Object.entries(scores).map(([k,v])=>[k,{baseline:Number(v.baseline.toFixed(4)),scores:Object.fromEntries(Object.entries(v.models).map(([name,p])=>[name,Number(p.toFixed(4))]))}]))};
 return 'VIP AI: используй этот снимок только при совпадении anchor_id с текущим контекстом; при несовпадении игнорируй его. Цели 10 и выше из allowed_targets, горизонт 1–3; иначе observe. Баллы не достоверные вероятности. Время classic — ориентир наблюдения, не подтверждённая минута ставки. В explanation укажи «Страховка: N×» с N из 1.5,2,3,5, выбрав меньшую цель по истории и insurance_formula; если оснований нет — «Страховка: нет». Объясни выбор. Это цель выхода, не защита денег. Не назначай суммы денег. '+START+JSON.stringify(compact)+END;
}
function mergeKnowledge(previous,block){const prior=String(previous||'');let rest=prior;const a=prior.indexOf(START);if(a>=0){const b=prior.indexOf(END,a);if(b<0)throw Error('Повреждён служебный контекст: сохранение отменено');
 // Remove our instruction prefix together with the marked block, keep other knowledge.
 let start=a;const instruction=prior.lastIndexOf('VIP AI: используй этот снимок',a);if(instruction>=0)start=instruction;rest=(prior.slice(0,start)+prior.slice(b+END.length)).trim();}
 const merged=[rest,block].filter(Boolean).join('\n');if(merged.length>2000)throw Error('База знаний заполнена: для контекста моделей нужно освободить место (настройки BeeAI ниже)');return merged;}
function insurance(p){const m=String(p?.explanation||'').match(/Страховка\s*:\s*(1[.,]5|2|3|5)\s*[×xх]/i);if(!m)return null;const n=Number(m[1].replace(',','.'));return n<Number(p.target)?n:null}
function removeContext(previous){const a=String(previous||'');if(!a.includes(START))return a;return mergeKnowledge(a,'')}
root.VipAICore=Object.freeze({epoch,clean,sourceReason,evaluate,modelScores,context,mergeKnowledge,removeContext,insurance});
})(typeof window==='undefined'?globalThis:window);
