export function createHistory(){
 const fallback=new Map();
 const ready=new Promise(resolve=>{if(!globalThis.indexedDB)return resolve(null);const r=indexedDB.open('neurojet-history',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('rounds',{keyPath:'id'});s.createIndex('time','timestamp')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null)});
 const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 return {
  async append(rows){const db=await ready;if(!db){rows.forEach(r=>fallback.set(r.id,r));return}await new Promise((resolve,reject)=>{const tx=db.transaction('rounds','readwrite');for(const r of rows)tx.objectStore('rounds').put(r);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})},
  async count(){const db=await ready;return db?request(db.transaction('rounds').objectStore('rounds').count()):fallback.size},
  async page(limit=200){const db=await ready;if(!db)return [...fallback.values()].sort((a,b)=>b.timestamp-a.timestamp).slice(0,limit);return new Promise((resolve,reject)=>{const out=[],r=db.transaction('rounds').objectStore('rounds').index('time').openCursor(null,'prev');r.onsuccess=()=>{const c=r.result;if(!c||out.length>=limit)return resolve(out);out.push(c.value);c.continue()};r.onerror=()=>reject(r.error)})},
  async all(){const db=await ready;return db?request(db.transaction('rounds').objectStore('rounds').getAll()):[...fallback.values()]},
  async clear(){const db=await ready;fallback.clear();if(db)await request(db.transaction('rounds','readwrite').objectStore('rounds').clear())}
 };
}
