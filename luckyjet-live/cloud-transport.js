/* Classic calculation engine is unchanged. Cloud transport uses read-only REST and Realtime. */
window.ClassicCloud=(()=>{
 'use strict';
 const config=window.BOG_CLOUD,base=config.url,key=config.anonKey;
 const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
 let latestStatus=null,statusAt=0,joined=false,socket=null,callback=null,onReady=null,retry=1000,retryTimer=null,heartbeat=null,ref=0;
 // Realtime emits the physical table row, without the view's feed_order column.
 const convert=row=>({id:row.id,coefficient:Number(row.coefficient),topCoefficient:Number(row.coefficient),timestamp:row.round_timestamp?Date.parse(row.round_timestamp):null,round_timestamp:row.round_timestamp,estimated:row.estimated,source_seq:Number(row.source_seq),feed_order:Number(row.feed_order??(1e12+Number(row.source_seq))),origin:row.origin});
 async function getStatus(force=false){
  if(!force&&latestStatus&&Date.now()-statusAt<10000)return latestStatus;
  const response=await fetch(base+'/rest/v1/rpc/luckyjet_cloud_status',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('SUPABASE_STATUS_HTTP_'+response.status);
  latestStatus=await response.json();statusAt=Date.now();
  const banner=document.getElementById('cloudConnection');if(banner)banner.textContent=latestStatus.source_connected?'LIVE из Supabase · ПК не требуется'+(joined?' · Realtime подключён':' · обновление через API'):'Сборщик Supabase не подключён · '+(latestStatus.error||'проверка соединения');
  return latestStatus;
 }
 async function page(limit,offset=0){
  // Archive remains available during a source outage; a failed source must not count as LIVE.
  const status=await getStatus();
  const response=await fetch(base+'/rest/v1/luckyjet_classic_history?select=id,coefficient,round_timestamp,estimated,source_seq,origin,feed_order&order=feed_order.desc&limit='+Math.min(1000,limit)+'&offset='+offset,{headers:{...headers,Prefer:'count=exact'},cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok){const error=Error('SUPABASE_HTTP_'+response.status);error.status=response.status;throw error;}
  const rows=await response.json(),range=response.headers.get('content-range')||'';
  return {rows:rows.map(convert),total:Number(range.split('/')[1])||rows.length,sourceConnected:!!status.source_connected,cloudStatus:status};
 }
 function send(topic,event,payload){if(socket?.readyState===1)socket.send(JSON.stringify({topic,event,payload,ref:String(++ref),...(topic==='phoenix'?{}:{join_ref:'1'})}));}
 function connect(onRound,afterConnect){
  callback=onRound;
  if(afterConnect)onReady=afterConnect;
  if(socket&&socket.readyState<2)return;
  socket=new WebSocket(base.replace('https:','wss:')+'/realtime/v1/websocket?apikey='+encodeURIComponent(key)+'&vsn=1.0.0');
  socket.onopen=()=>{ref=0;send('realtime:classic-cloud','phx_join',{config:{broadcast:{self:false},presence:{enabled:false},postgres_changes:[{event:'INSERT',schema:'public',table:'luckyjet_rounds'}]},access_token:key});heartbeat=setInterval(()=>send('phoenix','heartbeat',{}),25000);};
  socket.onmessage=event=>{
   let frame;try{frame=JSON.parse(event.data);}catch{return;}
   if(frame.event==='phx_reply'&&frame.topic==='realtime:classic-cloud'){
    joined=frame.payload?.status==='ok';if(joined){retry=1000;getStatus(true).catch(()=>{});onReady?.();}else socket.close();
   }
   if(frame.event==='postgres_changes'){
    const data=frame.payload?.data;if(data?.type==='INSERT'&&data.record?.origin==='live'&&data.record?.collection_backend==='cloud'){statusAt=0;callback?.(convert(data.record));}
   }
   if(frame.event==='system'&&frame.payload?.status==='error')socket.close();
  };
  socket.onerror=()=>socket.close();socket.onclose=()=>{joined=false;window.BogMLClient?.onError();clearInterval(heartbeat);socket=null;if(!retryTimer){retryTimer=setTimeout(()=>{retryTimer=null;connect(callback);},retry);retry=Math.min(30000,retry*2);}};
 }
 return {page,connect,getStatus,connected:()=>joined};
})();
