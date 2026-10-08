export function findToken(value, depth=0) {
 if(depth>6||value==null)return null;
 if(typeof value==='string')return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)?value:null;
 if(typeof value==='object')for(const item of Object.values(value)){const token=findToken(item,depth+1);if(token)return token;}
 return null;
}
function coefficient(value){
 if(value==null||typeof value==='boolean')return null;
 if(typeof value==='object'){for(const [key,item] of Object.entries(value))if(/coef|multiplier|value|crash|stop|final/i.test(key)){const n=coefficient(item);if(n!==null)return n;}return null;}
 const n=Number(String(value).replace(/x$/i,'').trim());return Number.isFinite(n)&&n>=1?n:null;
}
export function createRoundTracker(){
 let started=null;
 return {handle(frame){
  const data=frame?.push?.pub?.data;if(!data)return null;
  if(data.eventType==='startGame'){
   const id=data.roundInfo?.id??data.roundId??data.round_id;
   if(started&&id!=null&&started.id!==String(id))throw Error('GAME_ROUND_SEQUENCE_GAP');
   started=id!=null&&String(id).trim()&&String(id).length<=200?{id:String(id),fair:data.roundInfo?.provablyFair||{}}:null;return null;
  }
  if(data.eventType!=='endGame')return null;
  const previous=started;started=null;const explicit=data.roundId??data.round_id,id=explicit??previous?.id;
  if(id==null||!String(id).trim()||String(id).length>200)return null;
  if(previous&&explicit!=null&&previous.id!==String(explicit))throw Error('GAME_ROUND_ID_MISMATCH');
  for(const key of ['hash','digest'])if(previous?.fair?.[key]&&data.provablyFair?.[key]&&previous.fair[key]!==data.provablyFair[key])throw Error('GAME_ROUND_HASH_MISMATCH');
  const values=Array.isArray(data.finalCoefficientValues)?data.finalCoefficientValues:[data.finalCoefficientValues];
  const parsed=values.map(coefficient);
  if(!parsed.length||parsed.some(n=>n===null||n!==parsed[0]))throw Error('GAME_COEFFICIENT_AMBIGUOUS');
  const raw=data.currentTime;let stamp=typeof raw==='number'||/^\d+(?:\.\d+)?$/.test(String(raw))?Number(raw):Date.parse(raw);
  if(Number.isFinite(stamp)&&stamp>0&&stamp<1e11)stamp*=1000;
  const valid=Number.isFinite(stamp)&&stamp>0;
  return {id:String(id),coefficient:parsed[0],timestamp:valid?new Date(stamp).toISOString():null,estimated:!valid};
 }};
}
