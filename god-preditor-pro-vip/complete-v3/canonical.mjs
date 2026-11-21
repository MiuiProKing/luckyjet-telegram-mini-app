import { CONFIG } from './config.mjs';

export function stamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value) return null;
  const normalized=/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value)?value.replace(' ','T')+'Z':value;
  const parsed=Date.parse(normalized);return Number.isFinite(parsed)?parsed:null;
}
export function normalizeSignal(raw) {
  if (!raw || typeof raw!=='object') return null;
  let metadata=raw.metadata??raw.payload??{};
  if(typeof metadata==='string') {try{metadata=JSON.parse(metadata)}catch{metadata={}}}
  const item={...metadata,...raw};
  const id=String(item.id??item.signal_id??''),channel=String(item.channel??''),target=Number(item.target??item.target_x??item.estimatedCoef??item.level);
  const start=stamp(item.start??item.start_at??item.estimatedAt??item.startAt),end=item.windowKind==='rounds'?null:stamp(item.end??item.end_at??item.expectedEnd);
  if(!id||!channel||!Number.isFinite(target)||target<1||start===null)return null;
  const issuedAt=stamp(item.issuedAt??item.issued_at??item.generatedAt)??start;
  const probability=Number(item.probability);
  let confidence=item.confidence??item.chance;
  if(confidence==null&&Number.isFinite(probability))confidence=probability*100;
  const status=String(item.status??'pending').toLowerCase();
  if(!['pending','hit','miss','unknown'].includes(status))return null;
  return {...item,id,channel,target,start,end,issuedAt,status,confidence:confidence==null?null:Number(confidence),
    scoreKind:item.scoreKind??item.score_kind??(channel==='basic'?'heuristic':'model_probability'),
    actual:item.actual==null?null:Number(item.actual),resultAt:stamp(item.resultAt??item.result_at??item.endedAt),
    checkedAt:stamp(item.checkedAt??item.checked_at),estimatedEnd:stamp(item.estimatedEnd),roundsRequired:item.roundsRequired??item.requiredRounds??item.rounds??null,
    roundsRemaining:item.roundsRemaining??item.remainingRounds??null};
}
export function normalizeSnapshot(raw) {
  if(!raw||typeof raw!=='object')throw new Error('Неверный ответ расчётного сервера');
  const serverNow=stamp(raw.serverNow??raw.server_now);
  if(serverNow===null)throw new Error('Сервер не передал время снимка');
  let input=raw.signals??[];
  if(!Array.isArray(input))input=[...(input.active??[]),...(input.recent??[])];
  const unique=new Map();for(const row of input){const s=normalizeSignal(row);if(s)unique.set(s.id,s)}
  const signals=[...unique.values()].sort((a,b)=>b.issuedAt-a.issuedAt||b.id.localeCompare(a.id));
  return {...raw,serverNow,sourceCutoff:stamp(raw.sourceCutoff??raw.source_cutoff),sourceFresh:raw.sourceFresh===true,
    rounds:Array.isArray(raw.rounds)?raw.rounds:[],signals,events:Array.isArray(raw.events)?raw.events:[],
    diagnostics:raw.diagnostics??raw.models??{},analytics:raw.analytics??null};
}
export class SnapshotClient {
  constructor(config=CONFIG,fetchImpl=(...args)=>fetch(...args)) {this.config=config;this.fetch=fetchImpl;this.cursor=0;this.controller=null;}
  async get(zone='Europe/Kyiv') {
    const start=performance.now();this.controller?.abort();this.controller=new AbortController();
    const headers={'Content-Type':'application/json',apikey:this.config.SUPABASE_KEY};
    if(this.config.EDGE_TOKEN)headers.Authorization='Bearer '+this.config.EDGE_TOKEN;
    const timer=setTimeout(()=>this.controller.abort(),35000);
    try {
      const response=await this.fetch(this.config.EDGE_URL??this.config.SUPABASE_URL+'/functions/v1/god-complete-v3',{
        method:'POST',headers,body:JSON.stringify({action:'snapshot',zone,afterEventId:this.cursor}),signal:this.controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error('Расчётный сервер: HTTP '+response.status);
      const snapshot=normalizeSnapshot(await response.json());
      if(Number.isSafeInteger(snapshot.eventCursor))this.cursor=Math.max(this.cursor,snapshot.eventCursor);
      return {...snapshot,latency:performance.now()-start};
    } finally {clearTimeout(timer);}
  }
  stop(){this.controller?.abort()}
}
export function channelLabel(channel) {
  const exact={premium_live:'Premium · временное окно',basic:'Обычный анализ',big_cycle100:'Цикл 100×',big_hot_cluster:'Кластер крупных X'};
  if(exact[channel])return exact[channel];
  let m=channel.match(/^(?:duration|timed|deep_duration)_([\d.]+)$/);if(m)return 'Окно '+m[1]+' мин';
  m=channel.match(/^(?:rounds|auto_rounds|auto)_([\d.]+)$/);if(m)return 'Прогноз '+m[1]+'× по раундам';
  m=channel.match(/^vip_([\d.]+)$/);return m?'История ≥'+m[1]+'×':channel;
}
export function probabilityText(value,digits=1){
  const x=Number(value);if(value==null||typeof value==='boolean'||!Number.isFinite(x))return '—';
  if(x>=100)return '≈100%';if(x>99.9)return '>99,9%';return x.toLocaleString('ru-RU',{maximumFractionDigits:digits})+'%';
}
