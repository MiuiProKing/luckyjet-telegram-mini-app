/* Read-only Lucky Jet transport. Legacy engines keep their own calculations. */
(() => {
  'use strict';
  if (window.LuckyJetSupabase) return;
  const config = {"url":"https://stzrirukuxcyalrsstxx.supabase.co","anonKey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0enJpcnVrdXhjeWFscnNzdHh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMjQ1OTIsImV4cCI6MjEwODgwMDU5Mn0.0RGmnreFUZYWGPq0j-RYtAzvCwqyP---kJ1mRRf5h10"};
  const nativeFetch = window.fetch.bind(window), NativeDate = window.Date || Date;
  const headers = {apikey: config.anonKey, Authorization: 'Bearer ' + config.anonKey, Accept: 'application/json'};
  const cache = new Map(), flights = new Map();
  let status = null, statusAt = 0, statusFlight = null, offset = 0, newest = null;
  let socket = null, joined = false, heartbeat = null, reconnect = null, retry = 1000, ref = 0;
  const now = () => NativeDate.now() + offset;
  class CloudDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now()])); }
    static now() { return now(); }
  }
  function row(value) {
    const coefficient = Number(value.coefficient), timestamp = Date.parse(value.round_timestamp);
    if (!value.id || !Number.isFinite(coefficient) || coefficient < 1 || !Number.isFinite(timestamp)) return null;
    return {...value, id: String(value.id), coefficient, topCoefficient: coefficient, coef: coefficient,
      timestamp, ts: timestamp, time: value.round_timestamp, createdAt: value.round_timestamp,
      finalValues: [coefficient], estimated: value.estimated === true};
  }
  function paint() {
    if (!document.body) return;
    let el = document.getElementById('luckyjetSupabaseStatus');
    if (!el) {
      el = document.createElement('div'); el.id = 'luckyjetSupabaseStatus'; el.setAttribute('role', 'status');
      el.style.cssText = 'box-sizing:border-box;max-width:720px;margin:8px auto;padding:8px 12px;border-radius:10px;background:#111827;color:#a7f3d0;font:12px/1.5 system-ui;text-align:center;position:relative;z-index:2';
      document.body.prepend(el);
    }
    const live = status?.source_connected === true && status?.fresh === true;
    el.dataset.connected = String(live); el.dataset.roundId = newest?.id || '';
    el.textContent = live ? 'Supabase LIVE · без ПК' + (newest ? ' · ' + newest.coefficient.toFixed(2) + '× · ' + new Intl.DateTimeFormat('ru-RU', {timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new NativeDate(newest.timestamp)) + ' Киев' : '') : 'Supabase · источник сейчас недоступен';
    el.style.color = live ? '#a7f3d0' : '#fbbf24';
  }
  async function request(path, extra = {}) {
    const response = await nativeFetch(config.url + '/rest/v1/' + path, {headers: {...headers, ...extra}, cache: 'no-store', signal: AbortSignal.timeout(10000)});
    if (!response.ok) { const error = Error('SUPABASE_HTTP_' + response.status); error.status = response.status; throw error; }
    return response;
  }
  async function getStatus(force = false) {
    if (!force && status && NativeDate.now() - statusAt < 10000) return status;
    if (statusFlight) return statusFlight;
    statusFlight = (async () => {
      try {
        const started = NativeDate.now(), response = await request('rpc/luckyjet_cloud_status');
        status = await response.json(); statusAt = NativeDate.now();
        const checked = NativeDate.parse(status.checked_at);
        if (Number.isFinite(checked)) offset = checked - (started + statusAt) / 2;
        paint(); return status;
      } catch (error) { status = {source_connected:false,fresh:false,error:'SUPABASE_UNAVAILABLE'}; statusAt = 0; paint(); throw error; }
      finally { statusFlight = null; }
    })();
    return statusFlight;
  }
  async function history(limit = 20, offsetRows = 0, requireLive = true) {
    const cloudStatus = await getStatus();
    if (requireLive && (!cloudStatus.source_connected || !cloudStatus.fresh)) {
      const error = Error('SUPABASE_SOURCE_OFFLINE'); error.status = 503; throw error;
    }
    const count = Math.max(1, Math.min(1000, Number(limit) || 20)), start = Math.max(0, Number(offsetRows) || 0);
    const key = count + ':' + start, ttl = count > 100 ? 30000 : 1500;
    const saved = cache.get(key);
    if (saved && NativeDate.now() - saved.at < ttl) return {...saved.value, cloudStatus};
    if (flights.has(key)) return flights.get(key);
    const flight = (async () => {
      const response = await request('luckyjet_classic_history?select=id,coefficient,round_timestamp,estimated,source_seq,feed_order,origin&order=feed_order.desc&limit=' + count + '&offset=' + start, {Prefer:'count=exact'});
      const raw = await response.json(); if (!Array.isArray(raw)) throw Error('SUPABASE_INVALID_HISTORY');
      const rows = raw.map(row).filter(Boolean), total = Number((response.headers.get('content-range') || '').split('/')[1]);
      const value = {ok:true, rows, history:rows, rounds:rows, total:Number.isFinite(total) ? total : rows.length, cloudStatus, sourceConnected:!!cloudStatus.source_connected, source:'Supabase cloud collector'};
      cache.set(key, {at:NativeDate.now(), value, limit:count, offset:start});
      if (!start && rows.length && (!newest || rows[0].timestamp >= newest.timestamp)) { newest = rows[0]; paint(); }
      return value;
    })();
    flights.set(key, flight);
    try { return await flight; } finally { flights.delete(key); }
  }
  function route(input, options = {}) {
    let url; try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href); } catch { return null; }
    if ((options.method || input?.method || 'GET').toUpperCase() !== 'GET') return null;
    if (/rocket|aviator/i.test(location.pathname + ' ' + document.title)) return null;
    if (/^crash-gateway-grm-cr\.(?:100hp\.app|gamedev-tech\.cc)$/.test(url.hostname) && url.pathname === '/history') return {type:'array', url};
    if (/\.supabase\.co$/.test(url.hostname) && /^\/functions\/v1\/v0xff3-live(?:\/snapshot)?\/?$/.test(url.pathname)) return {type:'proxy', url};
    if (/\.supabase\.co$/.test(url.hostname) && url.origin !== config.url && /^\/rest\/v1\/luckyjet_(?:rounds|classic_history)$/.test(url.pathname)) return {type:'array', url};
    if (url.hostname === 'allpredictor.com' && /^\/api\/v1\/luckyjet\/coefficients\/?$/.test(url.pathname)) return {type:'coefficients', url};
    return null;
  }
  async function compatible(input, options = {}) {
    const match = route(input, options); if (!match) return nativeFetch(input, options);
    const signal = options.signal || input?.signal;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const promise = (async () => {
      try {
        const start = Number(match.url.searchParams.get('offset')) || 0;
        const result = await history(Number(match.url.searchParams.get('limit')) || 20, start, start === 0);
        const body = match.type === 'array' ? result.rows : match.type === 'coefficients' ? {success:true,data:result.rows} : {...result, rows:undefined};
        return new Response(JSON.stringify(body), {status:200,headers:{'Content-Type':'application/json','X-LuckyJet-Source':'Supabase','Content-Range':start+'-'+(start+result.rows.length-1)+'/'+result.total}});
      } catch (error) { return new Response(JSON.stringify({ok:false,error:'SUPABASE_SOURCE_UNAVAILABLE'}), {status:error.status || 503,headers:{'Content-Type':'application/json'}}); }
    })();
    if (!signal) return promise;
    return new Promise((resolve,reject) => {
      const aborted = () => reject(new DOMException('Aborted','AbortError'));
      signal.addEventListener('abort',aborted,{once:true});
      promise.then(resolve,reject).finally(() => signal.removeEventListener('abort',aborted));
    });
  }
  function connect() {
    if (typeof WebSocket === 'undefined' || socket && socket.readyState < 2) return;
    socket = new WebSocket(config.url.replace('https:','wss:') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(config.anonKey) + '&vsn=1.0.0');
    const send = (topic,event,payload) => { if (socket?.readyState === 1) socket.send(JSON.stringify({topic,event,payload,ref:String(++ref),...(topic==='phoenix'?{}:{join_ref:'1'})})); };
    socket.onopen = () => {
      ref = 0; send('realtime:luckyjet-hub','phx_join',{config:{broadcast:{self:false},presence:{enabled:false},postgres_changes:[{event:'INSERT',schema:'public',table:'luckyjet_rounds'}]},access_token:config.anonKey});
      heartbeat = setInterval(() => send('phoenix','heartbeat',{}),25000);
    };
    socket.onmessage = event => {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame.event === 'phx_reply' && frame.topic === 'realtime:luckyjet-hub') { joined = frame.payload?.status === 'ok'; if (joined) retry = 1000; else socket.close(); }
      const record = frame.payload?.data?.record;
      if (frame.event === 'postgres_changes' && record?.origin === 'live' && record?.collection_backend === 'cloud') {
        const added = row(record); if (!added) return;
        for (const [key,entry] of cache) {
          if (entry.offset) { cache.delete(key); continue; }
          if (entry.value.rows.some(r => r.id === added.id)) continue;
          const rows = [added,...entry.value.rows].slice(0,entry.limit);
          entry.value = {...entry.value,rows,history:rows,rounds:rows,total:entry.value.total+1};
        }
        newest = added; statusAt = 0; getStatus().catch(() => {});
        window.dispatchEvent(new CustomEvent('luckyjetSupabaseRound',{detail:added}));
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => { joined = false; clearInterval(heartbeat); socket = null; if (!reconnect) { reconnect=setTimeout(() => {reconnect=null;connect();},retry);retry=Math.min(30000,retry*2); } };
  }
  window.LuckyJetSupabase = Object.freeze({history,getStatus,connect,now,Date:CloudDate,config,connected:() => joined});
  window.fetch = compatible;
  function start() { getStatus().then(() => history(1)).catch(() => {});connect();setInterval(() => getStatus().catch(() => {}),15000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
