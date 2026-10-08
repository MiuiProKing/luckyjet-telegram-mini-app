import {createRoundTracker,findToken} from './protocol.js';
const BASE='https://crash-gateway-grm-cr.gamedev-tech.cc',ORIGIN='https://1play.gamedev-tech.cc';
const key=()=>Deno.env.get('LUCKYJET_MIRROR_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
async function db(route:string,body:unknown,method='POST'){
 const credential=key();const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/'+route,{method,headers:{apikey:credential,...(credential.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+credential}),'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('DATABASE_HTTP_'+response.status);return response;
}
async function gameToken(){
 const config=JSON.parse(Deno.env.get('LUCKYJET_GAME_SESSION')||'{}');
 if(!/^[0-9a-f-]{32,64}$/i.test(config.session_id||''))throw Error('GAME_SESSION_REQUIRED');
 const headers:Record<string,string>={'customer-id':config.customer_id||'077dee8d-c923-4c02-9bee-757573662e69','session-id':config.session_id,accept:'application/json','content-type':'application/json',origin:ORIGIN,referer:ORIGIN+'/'};
 if(config.auth_header){headers.authorization=config.auth_header;}else{
  const response=await fetch(BASE+'/user/auth',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('GAME_AUTH_HTTP_'+response.status);
  const token=findToken(await response.json());if(token)headers.authorization='Bearer '+token;
  const cookies=response.headers.getSetCookie();if(cookies.length)headers.cookie=cookies.map(c=>c.split(';')[0]).join('; ');
 }
 const response=await fetch(BASE+'/user/token',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('GAME_TOKEN_HTTP_'+response.status);
 const token=findToken(await response.json());if(!token)throw Error('GAME_TOKEN_MISSING');return token;
}
async function collect(){
 const id=crypto.randomUUID(),started=Date.now(),expires=new Date(started+125000).toISOString();let rounds=0,connected=false,error='';
 const state=()=>db('luckyjet_cloud_workers?on_conflict=id',{id,started_at:new Date(started).toISOString(),checked_at:new Date().toISOString(),expires_at:expires,connected,error,rounds});
 await state();
 try{
  // Expired game authorization stops retries until the owner provides a new session.
  const blocked=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/luckyjet_cloud_workers?select=error&error=in.(GAME_AUTH_HTTP_401,GAME_AUTH_HTTP_403,GAME_TOKEN_HTTP_401,GAME_TOKEN_HTTP_403,GAME_STREAM_AUTH_REJECTED,GAME_SESSION_EXPIRED)&limit=1',{headers:{apikey:key(),...(key().startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key()})},signal:AbortSignal.timeout(8000)});
  if(!blocked.ok)throw Error('DATABASE_HTTP_'+blocked.status);
  const recent=await blocked.json();if(recent.length){error='GAME_SESSION_EXPIRED';await state();return;}
  const token=await gameToken(),tracker=createRoundTracker();
  await new Promise<void>((resolve,reject)=>{
   const socket=new WebSocket(BASE.replace('https:','wss:')+'/websocket/lifecycle');let done=false,lastPacket=Date.now(),queue=Promise.resolve();
   const finish=(reason?:Error)=>{if(done)return;done=true;connected=false;clearTimeout(deadline);clearInterval(heartbeat);try{socket.close();}catch{}queue.finally(()=>reason?reject(reason):resolve());};
   const deadline=setTimeout(()=>finish(),Math.max(1000,started+115000-Date.now()));
   const heartbeat=setInterval(()=>{if(Date.now()-lastPacket>45000){finish(Error('GAME_SOCKET_STALE'));return;}state().catch(()=>finish(Error('DATABASE_UNAVAILABLE')));},10000);
   socket.onopen=()=>socket.send(JSON.stringify({id:1,connect:{token,name:'js'}}));
   socket.onmessage=event=>{
    if(done)return;
    lastPacket=Date.now();for(const line of String(event.data).split('\n')){
     if(line.trim()==='{}'){socket.send('{}');continue;}
     if(!/startGame|endGame|"connect"|"error"/.test(line))continue;
     try{const frame=JSON.parse(line);if(frame.error||frame.connect?.error){finish(Error('GAME_STREAM_AUTH_REJECTED'));return;}
      if(frame.connect){connected=true;queue=queue.then(()=>state());}
      const round=tracker.handle(frame);if(connected&&round)queue=queue.then(async()=>{await db('rpc/luckyjet_save_cloud_round',{p_id:round.id,p_coefficient:round.coefficient,p_timestamp:round.timestamp,p_estimated:round.estimated});rounds++;await state();});
      queue.catch(()=>finish(Error('DATABASE_SAVE_FAILED')));
     }catch(cause){finish(cause instanceof Error?cause:Error('GAME_PROTOCOL_ERROR'));return;}
    }
   };
   socket.onerror=()=>finish(Error('GAME_SOCKET_ERROR'));socket.onclose=()=>finish();
  });
 }catch(cause){const message=cause instanceof Error?cause.message:'';error=/^(GAME|DATABASE)_[A-Z_]+(?:_\d+)?$/.test(message)?message:'COLLECTOR_FAILED';}
 connected=false;await state();
}
Deno.serve(async(request:Request)=>{
 if(request.method!=='POST'||request.headers.get('x-collector-token')!==Deno.env.get('LUCKYJET_COLLECTOR_TOKEN'))return new Response('Forbidden',{status:403});
 EdgeRuntime.waitUntil(collect().catch(()=>{}));return Response.json({ok:true,started:true});
});
