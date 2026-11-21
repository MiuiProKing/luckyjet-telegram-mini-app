import { CONFIG } from '../config.mjs';

export const ZONE = 'Europe/Kyiv';
const parts = new Intl.DateTimeFormat('en-CA', {timeZone:ZONE, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const clock = new Intl.DateTimeFormat('ru-RU', {timeZone:ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function dateParts(stamp) {return Object.fromEntries(parts.formatToParts(new Date(stamp)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}
export function today(now=Date.now()) {const p=dateParts(now);return `${p.year}-${p.month}-${p.day}`;}
export function formatTime(at) {return clock.format(new Date(at));}
export function hourOf(at) {return Number(dateParts(at).hour);}
function midnightUtc(desired) {
  let guess=desired;
  for(let i=0;i<3;i++) {const p=dateParts(guess);const represented=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);guess-=represented-desired;}
  return guess;
}
export function dayBounds(day) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Неверная дата');
  const [y,m,d]=day.split('-').map(Number);const desired=Date.UTC(y,m-1,d);
  if(new Date(desired).toISOString().slice(0,10)!==day)throw new Error('Неверная дата');
  return {start:midnightUtc(desired),end:midnightUtc(desired+86400000)};
}
export function normalize(rows, bounds, now=Date.now()) {
  const result=new Map();
  for(const r of rows||[]) {
    const x=Number(r.coefficient),at=Date.parse(r.round_timestamp||r.played_at||'');
    if(!r.id || typeof r.coefficient==='boolean' || !Number.isFinite(x)||x<1||!Number.isFinite(at)||r.estimated===true||r.completed===false||at>now||at<bounds.start||at>=bounds.end)continue;
    if(!result.has(String(r.id)))result.set(String(r.id),{id:String(r.id),coefficient:x,timestamp:at,round_timestamp:r.round_timestamp||r.played_at});
  }
  return [...result.values()].sort((a,b)=>b.timestamp-a.timestamp||b.id.localeCompare(a.id));
}
export function color(x) {return x<2?'blue':x<10?'purple':x<=50000?'orange':'yellow';}
export function summarize(rows,minimum=0) {
  const filtered=minimum>0?rows.filter(r=>r.coefficient>=minimum):rows;
  const groups=new Map();let total=0,max=0;
  for(const r of filtered) {const h=hourOf(r.timestamp);if(!groups.has(h))groups.set(h,[]);groups.get(h).push(r);total+=r.coefficient;max=Math.max(max,r.coefficient);}
  return {rows:filtered,count:filtered.length,mean:filtered.length?total/filtered.length:0,max,groups:[...groups].sort((a,b)=>b[0]-a[0])};
}

export class HistorySource {
  constructor(config=CONFIG,fetchImpl=(...args)=>fetch(...args)) {this.config=config;this.fetchImpl=fetchImpl;this.abort=null;this.generation=0;}
  cancel(){this.generation++;this.abort?.abort();this.abort=null;}
  async load(day,{onProgress=()=>{},existing=[],headOnly=false}={}) {
    this.cancel();const generation=this.generation;this.abort=new AbortController();const {signal}=this.abort;
    const bounds=dayBounds(day),now=Date.now();let cursor=null,rows=[],pages=0;
    const cutoff=headOnly&&existing.length?Math.max(bounds.start,existing[0].timestamp):bounds.start;
    while(true) {
      const q=new URLSearchParams({select:'id,coefficient,round_timestamp,estimated,completed',completed:'eq.true',estimated:'eq.false',order:'round_timestamp.desc,id.desc',limit:'1000',and:`(round_timestamp.gte.${new Date(cutoff).toISOString()},round_timestamp.lt.${new Date(bounds.end).toISOString()},round_timestamp.lte.${new Date(now).toISOString()})`});
      if(cursor)q.set('or',`(round_timestamp.lt.${cursor.round_timestamp},and(round_timestamp.eq.${cursor.round_timestamp},id.lt.${cursor.id}))`);
      const started=performance.now(),controller=this.abort;const timer=setTimeout(()=>controller.abort(),30000);let response;
      try {response=await this.fetchImpl(this.config.SUPABASE_URL+'/rest/v1/'+this.config.TABLE+'?'+q,{headers:{apikey:this.config.SUPABASE_KEY,Accept:'application/json'},signal,cache:'no-store'});} finally {clearTimeout(timer);}
      if(!response.ok)throw new Error(`История Supabase: HTTP ${response.status}`);
      const page=await response.json();if(!Array.isArray(page))throw new Error('Неверный ответ истории');
      if(generation!==this.generation)throw new DOMException('Загрузка отменена','AbortError');
      rows.push(...page);pages++;onProgress({pages,count:rows.length,latency:Math.round(performance.now()-started)});
      if(page.length<1000)break;
      const next=page.at(-1);if(!next?.id||!next.round_timestamp)throw new Error('Нет курсора страницы');
      const nextKey=next.round_timestamp+'|'+next.id;if(cursor&&nextKey===cursor.round_timestamp+'|'+cursor.id)throw new Error('Курсор истории не продвигается');
      cursor={id:next.id,round_timestamp:next.round_timestamp};
    }
    return {rows:normalize([...rows,...(headOnly?existing:[])],bounds,now),pages,bounds,checkedAt:Date.now()};
  }
}
