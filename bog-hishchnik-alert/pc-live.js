/* A separate read-only connection. Game and GitHub credentials never enter this page. */
(()=>{
 'use strict';
 const registry='https://raw.githubusercontent.com/MiuiProKing/luckyjet-telegram-mini-app/classic-pc-live-20261006/bog-hishchnik-alert/pc-connection.json';
 const storageKey='luckyjet_classic_pc_feed_20261006';
 let access='',host='',discoveredAt=0,resolving=null,retryAt=0,failures=0;
 const hash=new URLSearchParams(location.hash.slice(1));
 const provided=hash.get('access');
 try{access=provided||sessionStorage.getItem(storageKey)||'';if(provided)sessionStorage.setItem(storageKey,provided)}catch(_){access=provided||''}
 if(provided)history.replaceState(null,'',location.pathname+location.search+'#overview');
 const status=message=>{const item=document.getElementById('pcConnectionStatus');if(item)item.textContent=message};
 function validHost(value){return typeof value==='string'&&/^https:\/\/[a-z0-9-]{8,}\.(lhr\.life|lhr\.rocks|localhost\.run|trycloudflare\.com)$/.test(value)}
 async function request(url,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{return await fetch(url,{...options,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal})}
  finally{clearTimeout(timer)}
 }
 async function discover(force=false){
  if(host&&!force&&Date.now()-discoveredAt<15000)return host;
  if(resolving)return resolving;
  resolving=(async()=>{
   const response=await request(registry+'?v='+Math.floor(Date.now()/15000));
   if(!response.ok)throw Error('Адрес подключения пока недоступен');
   const document=await response.json();
   if(document.version!==1||document.source!=='pc-sqlite'||!validHost(document.host))throw Error('Неверный адрес подключения');
   host=document.host;discoveredAt=Date.now();return host;
  })();
  try{return await resolving}finally{resolving=null}
 }
 async function get(limit,offset=0){
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(access)){
   status('Откройте персональную ссылку или введите код доступа к данным.');
   throw Error('Нужен персональный доступ к нашему ПК');
  }
  if(Date.now()<retryAt)throw Error('Переподключение к ПК · ожидание');
  try{
   const base=await discover();
   const response=await request(base+'/api/live?limit='+limit+'&offset='+offset+'&t='+Date.now(),{headers:{Accept:'application/json',Authorization:'Bearer '+access}});
   if(response.status===403){status('Код доступа не принят. Используйте персональную ссылку.');throw Error('Нет доступа к данным ПК')}
   if(!response.ok)throw Error('ПК временно недоступен');
   const data=await response.json();
   if(data.ok!==true||!Array.isArray(data.history)||!data.collector||data.collector.migration!=='sqlite-local-v1')throw Error('Нет свежего ответа нашего сборщика');
   failures=0;retryAt=0;
   status(data.collector.source_connected?(data.collector.fresh?'Подключено к нашему ПК · новые коэффициенты каждую секунду':'Подключено · накопление раундов '+data.collector.session_rounds+'/'+data.collector.warmup_required):'ПК доступен · игра пока не подключена');
   return data;
  }catch(error){
   host='';discoveredAt=0;
   failures++;retryAt=Date.now()+Math.min(60000,1000*2**Math.min(failures,6));
   if(!error.message.includes('доступ'))status('Связь с ПК прервана. Переподключаемся автоматически; ноутбук должен работать и не спать.');
   throw error;
  }
 }
 function setAccess(value){
  access=String(value||'').trim();host='';discoveredAt=0;retryAt=0;failures=0;
  try{sessionStorage.setItem(storageKey,access)}catch(_){}
  status('Проверяю подключение к нашему ПК…');
  window.dispatchEvent(new Event('pc-live-connect'));
 }
 window.PC_LIVE=Object.freeze({get,setAccess});
 const setup=()=>{
  const button=document.getElementById('pcConnect'),input=document.getElementById('pcAccess');
  if(button&&input)button.addEventListener('click',()=>{setAccess(input.value);input.value=''});
  status(access?'Проверяю подключение к нашему ПК…':'Нужна персональная ссылка или код доступа к данным.');
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
