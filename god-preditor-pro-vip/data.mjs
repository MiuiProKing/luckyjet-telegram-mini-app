export const LIMIT=10000;
export function parseTime(value,now=Date.now()){
 if(value==null||value==='')return now;
 const numeric=typeof value==='number'||/^\d+(\.\d+)?$/.test(String(value));
 const v=numeric?Number(value):Date.parse(value);
 return numeric&&v<1e12?v*1000:v;
}
export function normalizeRound(input,source='custom',now=Date.now()){
 const o=typeof input==='number'?{coefficient:input}:input;
 if(!o||typeof o!=='object')throw Error('Раунд должен быть объектом или числом');
 const coefficient=Number(o.coefficient??o.multiplier??o.coef??o.value);
 const rawTimestamp=o.timestamp??o.played_at??o.time;
 if(rawTimestamp==null||String(rawTimestamp).trim()==='')throw Error('Для проверки временного окна нужно время раунда');
 const timestamp=parseTime(rawTimestamp,now);
 if(!Number.isFinite(coefficient)||coefficient<1)throw Error('Коэффициент должен быть числом ≥ 1');
 if(!Number.isFinite(timestamp)||timestamp<=0||timestamp>now)throw Error('Неверное или будущее время раунда');
 const id=String(o.id??`${timestamp}:${coefficient}`);
 if(id.length>300)throw Error('Слишком длинный ID');
 return {id,coefficient,timestamp,source:String(o.source??source).slice(0,100)};
}
export function mergeRounds(current,incoming,source,now=Date.now()){
 if(!Array.isArray(incoming))incoming=[incoming];
 if(incoming.length>50000)throw Error('За один импорт допускается до 50 000 записей');
 const map=new Map(current.map(r=>[r.id,r]));let added=0,rejected=0;
 for(const raw of incoming){try{const r=normalizeRound(raw,source,now);if(!map.has(r.id)){map.set(r.id,r);added++}}catch{rejected++}}
 return {rounds:[...map.values()].sort((a,b)=>b.timestamp-a.timestamp).slice(0,LIMIT),added,rejected};
}
export function parseCSV(text){
 const first=text.replace(/^\uFEFF/,'').split(/\r?\n/)[0];
 const sep=first.includes(';')?';':',';const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===sep&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=c}
 if(quoted)throw Error('Незакрытая кавычка CSV');if(cell||row.length){row.push(cell);rows.push(row)}
 if(rows.length<2)throw Error('CSV должен содержать заголовок и хотя бы одну строку');
 const headers=rows.shift().map(x=>x.trim().replace(/^\uFEFF/,''));
 return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]?.trim()??''])));
}
export function parsePayload(value,path=''){
 let data=value;if(path)for(const part of path.split('.'))data=data?.[part];
 if(Array.isArray(data))return {rounds:data,vipStats:value?.vipStats};
 if(data&&typeof data==='object'){
  if(data.coefficient!=null||data.multiplier!=null||data.coef!=null)return {rounds:[data],vipStats:value?.vipStats};
  return {rounds:data.rounds??data.data??[],vipStats:data.vipStats??value?.vipStats};
 }
 if(typeof data==='number')return {rounds:[data]};
 throw Error('Не найден массив раундов. Проверь путь к данным.');
}
export function validateVipStats(stats,now=Date.now()){
 if(!stats||!Array.isArray(stats.thresholds))throw Error('VIP: нужен массив thresholds');
 const cutoff=parseTime(stats.dataCutoff,now),avg=Number(stats.avgRoundSeconds),sample=Number(stats.sampleSize);
 if(!Number.isFinite(cutoff)||cutoff>now||!Number.isFinite(avg)||avg<=0||!Number.isFinite(sample)||sample<0)throw Error('VIP: неверный срез данных, размер выборки или длительность');
 const thresholds=stats.thresholds.map(t=>{
  const threshold=Number(t.threshold),expected=t.estimatedNextAt==null?null:parseTime(t.estimatedNextAt,now),prob=t.probNext3MinPct==null?null:Number(t.probNext3MinPct);
  if(![40,200,500].includes(threshold)||(expected!=null&&!Number.isFinite(expected))||(prob!=null&&(!Number.isFinite(prob)||prob<0||prob>100)))throw Error('VIP: пороги 40/200/500, вероятность 0–100');
  return {...t,threshold,estimatedNextAt:expected,probNext3MinPct:prob};
 });
 if(new Set(thresholds.map(x=>x.threshold)).size!==thresholds.length)throw Error('VIP: повторные пороги');
 return {...stats,dataCutoff:cutoff,avgRoundSeconds:avg,sampleSize:sample,fresh:stats.fresh===true,thresholds};
}
