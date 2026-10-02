(function () {
 'use strict';
 const API='https://xrniwkvfrtchtxjrwwgd.supabase.co/functions/v1/v0xff3-live';
 const MODEL_LIMIT=2000, FRESH_MS=180000, COVERAGE_MS=15000, GRACE_MS=15000;
 const KEY='pro_supabase_signals_v2', ENGINE=window.GodPreditor, $=id=>document.getElementById(id);
 let rounds=[],history=[],pending=null,mode='god',autoMode=false,online=false,initialized=false,total=0;
 let lastPollAt=0,syncPromise=null,activeBig=null,invalidRows=0,conflictingRows=0;
 let archiveRows=[],archiveOffset=0,archiveLoading=false,archiveDone=false;
 const coefficient=r=>ENGINE.numberValue(r?.coefficient??r?.topCoefficient??r?.multiplier);
 const millis=ENGINE.timeValue,sortMillis=r=>millis(r?.timestamp)||0;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=t=>new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
 const localDay=t=>{const date=new Date(t);return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')};
 function status(message,kind=''){$('verifyStatus').textContent=message;$('verifyStatus').className='status '+kind}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(history.slice(0,200)))}catch(_){}}
 function finiteSignal(s){return s&&Number.isFinite(s.target)&&s.target>=1&&Number.isFinite(s.score)&&s.score>=0&&s.score<=100&&Number.isFinite(s.at)&&s.at>0&&Number.isFinite(s.window)&&s.window>0&&s.window<=1800000}
 function restore(){
  try{const saved=localStorage.getItem('pro_analysis_mode_v3');if(['normal','vip','god'].includes(saved))mode=saved}catch(_){}
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))history=saved.filter(finiteSignal).slice(0,200)}catch(_){}
  for(const s of history){
   if(!['pending','hit','miss','observed','expired'].includes(s.status))s.status='expired';
   if(s.status!=='pending')continue;
   if(!pending&&['window-v1','window-v2'].includes(s.policy)&&Date.now()<s.at+s.window+GRACE_MS){
    pending=s;s.ids=Array.isArray(s.ids)?s.ids.filter(id=>typeof id==='string').slice(0,2000):[];
    s.checked=s.ids.length;s.coverageGap=true;s.coverageReason='Страница была закрыта или перезагружена';
   }else{s.status='expired';s.finishedAt=Date.now()}
  }
  persist();
 }
 function fresh(){return rounds.length>0&&Date.now()-rounds[0].timestamp<=FRESH_MS}
 function exactRounds(){return rounds.filter(r=>!r.estimated).slice(0,MODEL_LIMIT)}
 function preciseModel(){return fresh()&&rounds.length>=20&&rounds.slice(0,20).every(r=>!r.estimated)}
 function fromGod(p,big=false){
  if(!p)return null;
  const s={target:p.estimatedCoef,score:big?p.confidence:p.reliability,at:big?p.expectedAt:p.estimatedAt,window:p.windowMs,
   pattern:big?'GOD PREDITOR · крупная цель':godPattern(p.pattern),basis:big?p.reason:p.basis,
   estimated:false,engine:ENGINE.version,sampleSize:exactRounds().length};
  return finiteSignal(s)?s:null;
 }
 function godPattern(pattern){
  const names={"Cycle des cotes d'or détecté":'Цикл коэффициентов от 10×','Série basse — rebond statistique':'Серия из 15 раундов ниже 2×','Plage horaire favorable':'Часовая группа выше среднего','Plage horaire faible':'Часовая группа ниже среднего','Analyse multi-signaux':'Мультисигнальный анализ'};
  return 'GOD PREDITOR · '+(names[pattern]||pattern);
 }
 function godPrediction(){
  if(!fresh())return null;
  if(preciseModel())return fromGod(ENGINE.calculatePrediction(exactRounds()));
  const s=ordinaryPrediction(true);return s?{...s,estimated:true,engine:'god-order-only-audit1',sampleSize:rounds.length,pattern:'GOD PREDITOR · '+s.pattern,basis:'Только последовательность раундов; циклы и часовые группы отключены. '+s.basis}:null;
 }
 function bigOpportunity(now=Date.now()){
  if(!fresh())return null;
  if(preciseModel())return fromGod(ENGINE.detectBigOpportunity(exactRounds(),now),true);
  const recent=rounds.slice(0,80),c20=recent.filter(r=>r.coefficient>=20).length,c50=recent.filter(r=>r.coefficient>=50).length;
  if(c50<3||c20<6)return null;
  const score=Math.round(clamp(55+c50*5+c20,55,82));if(score<75)return null;
  return {target:120,score,at:now+180000,window:360000,pattern:'GOD PREDITOR · кластер',basis:c20+' результатов ≥20× и '+c50+' результатов ≥50× за '+recent.length+' раундов; циклы отключены',estimated:true,engine:'god-order-only-audit1',sampleSize:rounds.length};
 }
 // The existing ordinary/VIP formulas are inserted here by prepare-audit-update.mjs.
 function clamp(x,a,b){return Math.max(a,Math.min(b,x))}function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}function median(a){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}function geo(a){if(!a.length)return 0;return Math.exp(mean(a.map(x=>Math.log(Math.max(x,1.001)))))}function deviation(a){const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))}function mad(a){const m=median(a);return median(a.map(x=>Math.abs(x-m)))}function ema(a,alpha){if(!a.length)return 0;let x=a[a.length-1];for(let i=a.length-2;i>=0;i--)x=alpha*a[i]+(1-alpha)*x;return x}function round(x){return Math.floor(x+.5)}function label(score){return score>=82?'Высокая':score>=66?'Средняя':'Слабая'}

function gapStats(rows,threshold){const e=rows.filter(r=>coefficient(r)>=threshold).sort((a,b)=>millis(a.timestamp)-millis(b.timestamp));if(e.length<2)return{count:e.length,last:e.length?millis(e[0].timestamp):null,med:0,mad:0};const gaps=e.slice(1).map((r,i)=>millis(r.timestamp)-millis(e[i].timestamp)).filter(x=>x>0);return{count:e.length,last:millis(e[e.length-1].timestamp),med:median(gaps),mad:mad(gaps)}}

function plan(target,reliability){const main=Math.max(1.01,target);let insurance=main>=20?Math.min(5,Math.max(2,main*.12)):main>=10?Math.min(3,Math.max(1.8,main*.2)):main>=5?Math.min(2.2,Math.max(1.55,main*.35)):main>=2?Math.max(1.3,main*(reliability>=75?.6:.55)):Math.max(1.1,main*.8);insurance=Math.min(insurance,Math.max(1.01,main-.05));return{main,insurance,risk:main>=20||reliability<60?'Высокий':main>=5||reliability<75?'Средний':'Низкий'}}

function ordinaryPrediction(forceOrder=false){const data=rounds.filter(r=>coefficient(r)!==null).slice(0,MODEL_LIMIT),n=data.length;if(n<20)return null;const desc=[...data].sort(ENGINE.compareRounds),c=desc.map(coefficient),medAll=median(c),geoAll=geo(c),last20=c.slice(0,20),last50=c.slice(0,50),avg50=mean(last50),ema20=ema(last20,.25),ema50=ema(last50,.12),sigma50=deviation(last50),mad50=mad(last50),lowRatio=c.slice(0,60).filter(x=>x<2).length/Math.min(60,n),recent20=desc.slice(0,30).filter(r=>coefficient(r)>=20),now=Date.now(),estimated=forceOrder||data.some(r=>r.estimated);let target,score,at,window,pattern,basis; const clock=new Date(now),hourRows=desc.filter(r=>new Date(millis(r.timestamp)).getHours()===clock.getHours()),minuteRows=desc.filter(r=>new Date(millis(r.timestamp)).getMinutes()===(clock.getMinutes()+2)%60),hourGeo=geo(hourRows.map(coefficient)),hourFactor=!estimated&&hourRows.length>=5?hourGeo/Math.max(geoAll,.1):1,minuteFactor=!estimated&&minuteRows.length>=5?geo(minuteRows.map(coefficient))/Math.max(geoAll,.1):1;

 if(!estimated){const g=gapStats(desc,10);if(g.count>=8&&g.med>0&&g.mad>0&&g.mad<g.med*.6){const delta=g.last+g.med-now,width=clamp(g.mad*1.4826||g.med*.55,60000,240000);if(Math.abs(delta)<=width*.6){const peak=Math.max(...c.slice(0,80)),div=recent20.length>=3?2:recent20.length>=1?3:4;target=clamp(peak/div,2,20);score=round(clamp(60-Math.abs(delta)/width*15+(!estimated&&hourGeo>geoAll?3:0)+clamp(g.count/20,0,4),40,68));at=now+(delta>0?Math.max(delta,90000):120000);window=clamp(g.med*.25,90000,180000);pattern='Цикл коэффициентов от 10×';basis=`Медианный интервал ${(g.med/60000).toFixed(1)} мин`;return{target,score,at,window,pattern,basis,estimated}}}}

 if(c.slice(0,15).length===15&&c.slice(0,15).every(x=>x<2)){target=clamp(geoAll*2.5+medAll,2.5,15);score=round(clamp(70+(estimated?0:clamp((now-millis(desc[14].timestamp))/60000,0,15)),65,92));at=now+90000;window=120000;pattern='Низкая серия — статистический отскок';basis=`15 раундов ниже 2× · геометрическое среднее ${geoAll.toFixed(2)}×`;return{target,score,at,window,pattern,basis,estimated}}

 if(recent20.length>=3){const bg=geo(recent20.map(coefficient)),div=recent20.length>=5?3:recent20.length>=4?4:5;target=clamp(bg/div,2,12);score=Math.min(78,60+recent20.length*3);at=now+120000;window=150000;pattern=`${recent20.length} недавних раундов от 20×`;basis=`Геометрическое среднее крупных результатов ${bg.toFixed(2)}×`;return{target,score,at,window,pattern,basis,estimated}}

 const last60=c.slice(0,60),zone=last60.filter(x=>x>=5&&x<10),fragile=lowRatio>.55||sigma50>avg50*1.4;if(zone.length>=3){const zg=geo(zone);target=fragile?clamp(zg*.45,2,4.5):clamp(zg*.7,3,7);score=round(clamp(64+zone.length*4+(fragile?-6:6),58,90));at=now+120000;window=150000;pattern=fragile?'Смешанная фаза 5–9×':'Фаза роста 5–9×';basis=`${zone.length} раундов в диапазоне 5–9×`;return{target,score,at,window,pattern,basis,estimated}}

 const composite=ema20*.5+ema50*.3+avg50*.2;target=clamp(composite*hourFactor*.6+(!estimated&&minuteRows.length?Math.max(...minuteRows.map(coefficient))*.1:0)+1.6,1.8,12);const dangerous=lowRatio>.6||sigma50>avg50*1.6;if(dangerous)target=Math.min(target,3.2);else if(lowRatio>.45)target=Math.min(target,5);score=round(clamp(52+clamp(n/25,0,28)+clamp(Math.abs(hourFactor-1)*42,0,22)+clamp(Math.abs(minuteFactor-1)*32,0,16)+(mad50>0&&mad50<avg50*.6?5:0)+(dangerous?-8:0),50,92));const sec=new Date().getSeconds(),extra=((60-sec)*1000)%45000;at=now+120000+extra;window=150000;pattern=dangerous?'Повышенная нестабильность':'Мультисигнальный анализ';basis=`EMA20 ${ema20.toFixed(2)}× · EMA50 ${ema50.toFixed(2)}× · MAD ${mad50.toFixed(2)} · час ${clock.getHours()}: гео ${hourGeo.toFixed(2)}× (${hourRows.length}) · ${n} раундов${estimated?' · время раундов оценочное':''}`;return{target,score,at,window,pattern,basis,estimated}}

function vipPrediction(){

 const data=rounds.filter(r=>coefficient(r)!==null).slice(0,MODEL_LIMIT),now=Date.now();

 if(!data.length)return null;

 const recent=data.slice(0,80),values=recent.map(coefficient),n=values.length;

 const n10=values.filter(x=>x>=10).length,n20=values.filter(x=>x>=20).length,n50=values.filter(x=>x>=50).length,n100=values.filter(x=>x>=100).length;

 let target=10;

 if(n20>=3)target=20;

 if(n50>=2&&n20>=5)target=50;

 if(n100>=2&&n50>=3&&n20>=5)target=100;

 const hits=values.filter(x=>x>=target).length,hitRate=Math.round(hits*100/Math.max(n,1));

 const estimated=data.some(r=>r.estimated);

 let at=now+120000,window=180000,timeBasis='Вход назначен на ближайшее окно VIP-анализа';

 if(!estimated){

  const g=gapStats(data,target);

  if(g.count>=4&&g.med>=60000&&g.med<=1200000&&g.mad<g.med*.8){

   const expected=g.last+g.med,delta=expected-now;

   if(delta>=60000&&delta<=1200000){

    at=expected;

    window=clamp(g.mad?g.mad*1.4826:g.med*.35,120000,360000);

    timeBasis='Время оценено по медианному интервалу крупных результатов';

   }

  }

 }

 const score=round(clamp(55+Math.min(20,hits*3)+(n>=80?5:0),55,80));

 return{target,score,hitRate,hits,sampleSize:n,at,window,pattern:'Автоматический VIP-анализ крупного коэффициента',basis:'За последние '+n+' раундов: ≥10× - '+n10+', ≥20× - '+n20+', ≥50× - '+n50+'. '+timeBasis+'.',estimated};

}


 function selectMode(kind){
  if(!['normal','vip','god'].includes(kind))return;
  mode=kind;for(const name of ['normal','vip','god']){$(name+'Mode').classList.toggle('selected',name===kind);$(name+'Mode').setAttribute('aria-pressed',String(name===kind))}
  $('modeDescription').textContent=kind==='god'?'GOD PREDITOR · точное время или анализ последовательности':kind==='vip'?'VIP · анализ крупных коэффициентов':'Обычный анализ истории';
  try{localStorage.setItem('pro_analysis_mode_v3',kind)}catch(_){}
  status(pending?'Режим применится к следующему сигналу.':'Метод анализа выбран.');
 }
 function showSignal(s){
  $('circle').classList.remove('ok','ko');$('spin').classList.remove('ok','ko');$('circle').classList.add('verifying');
  $('multiplier').style.color='#00ff66';$('multiplier').textContent=s.target.toFixed(2)+'×';
  $('betTime').textContent=fmt(s.at);$('endTime').textContent=fmt(s.at+s.window);$('confCell').textContent=s.score+' / 100';
  $('roundStatus').textContent=s.checked||0;
  $('signalBasis').textContent=s.pattern+' · '+s.basis+' · '+s.sampleSize+' раундов · '+zone()+(s.estimated?' · время ≈':'')+(s.customTarget?' · цель изменена с '+s.originalTarget.toFixed(2)+'×':'');
  $('generateButton').disabled=true;$('bigSignalButton').disabled=true;
 }
 function generate(big=false){
  if(pending){status('Цель закреплена до результата или конца окна.');return}
  if(!initialized||!online||!fresh()){status('Нужны свежие раунды и связь с базой.','ko');return}
  let s=big?(activeBig&&Date.now()<activeBig.at?{...activeBig}:bigOpportunity()):mode==='god'?godPrediction():mode==='vip'?vipPrediction():ordinaryPrediction();
  if(!finiteSignal(s)){status(big?'Условия крупного сигнала пока не выполнены.':'Для расчёта нужно не менее 20 валидных свежих раундов.');return}
  const min=Number($('minOddsInput').value),max=Number($('maxOddsInput').value);s.originalTarget=s.target;
  if($('customRange').checked){
   if(!Number.isFinite(min)||!Number.isFinite(max)||min<1.01||max<=min){status('Минимум от 1,01×; максимум должен быть больше минимума.','ko');return}
   s.target=clamp(s.target,min,max);s.customTarget=s.target!==s.originalTarget;
  }
  s.target=Number(s.target.toFixed(2));
  pending={...s,kind:big?'god-big':mode,sampleSize:s.sampleSize??rounds.length,generatedAt:Date.now(),checked:0,ids:[],status:'pending',approximate:!!s.estimated,policy:'window-v2',coverageGap:false};
  history.unshift(pending);history=history.slice(0,200);persist();showSignal(pending);renderHistory();tick();
  if($('voiceEnabled').checked&&'speechSynthesis' in window){const utterance=new SpeechSynthesisUtterance('Цель '+s.target.toFixed(2)+'. Начало окна '+fmt(s.at));utterance.lang='ru-RU';speechSynthesis.speak(utterance)}
 }
 function gap(reason){if(!pending)return;pending.coverageGap=true;pending.coverageReason=reason;persist()}
 function merge(items){
  // Prefer existing records over conflicting late snapshots; a precise copy may replace an approximate one.
  const result=ENGINE.normalizeRounds([...rounds,...items]);rounds=result.rows.slice(0,MODEL_LIMIT);
  invalidRows=result.invalid;conflictingRows+=result.conflicts;
  if(result.invalid||result.conflicts)gap('Ответ базы содержит невалидные или конфликтующие записи');
  return ENGINE.normalizeRounds(items).rows;
 }
 function processNew(items){
  const valid=ENGINE.normalizeRounds(items).rows.sort((a,b)=>-ENGINE.compareRounds(a,b));
  for(const r of valid){
   if(!pending)break;const end=pending.at+pending.window;
   if(r.timestamp<pending.at||r.timestamp>end||pending.ids.includes(r.id))continue;
   // Quarantine conflicting versions of an ID rather than accepting a fabricated hit.
   const known=rounds.find(row=>row.id===r.id);
   if(known&&(known.coefficient!==r.coefficient||known.timestamp!==r.timestamp)){gap('Конфликт версий раунда');continue}
   pending.ids.push(r.id);pending.checked++;pending.approximate ||= r.estimated;
   if(r.coefficient>=pending.target){pending.actual=r.coefficient;pending.actualAt=r.timestamp;finish(pending.approximate?'observed':'hit')}
  }
  if(pending)persist();
 }
 async function page(limit,offset=0){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch(API+'?limit='+limit+'&offset='+offset+'&t='+Date.now(),{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   const body=await response.json();if(body.ok!==true||!Array.isArray(body.history))throw Error('Неверный ответ базы');
   return {rows:body.history,total:Number.isFinite(Number(body.total))&&Number(body.total)>=0?Number(body.total):null};
  }finally{clearTimeout(timer)}
 }
 async function modelPage(){
  const first=await page(MODEL_LIMIT);let loaded=first.rows.slice(),offset=first.rows.length,pages=1;
  while(offset<MODEL_LIMIT&&offset>0&&(first.total==null||offset<first.total)&&pages<4){
   const next=await page(MODEL_LIMIT-offset,offset);pages++;if(!next.rows.length)break;
   loaded.push(...next.rows);offset+=next.rows.length;
  }
  if(pages>1){
   // Offset pagination can shift when new rounds arrive. Re-read the head and verify the anchor.
   const head=await page(100),firstId=first.rows[0]?.id;
   if(firstId!=null&&!head.rows.some(row=>String(row.id)===String(firstId)))gap('История изменилась во время загрузки; полнота окна неизвестна');
   loaded=[...head.rows,...loaded];
  }
  return {rows:loaded,total:first.total};
 }
 function pollSucceeded(startedAt){
  const now=Date.now();
  if(pending&&lastPollAt&&startedAt-lastPollAt>COVERAGE_MS&&startedAt>=pending.at&&lastPollAt<pending.at+pending.window)gap('Пропуск обновлений в окне');
  lastPollAt=now;online=true;
 }
 function syncHistory(full=false){
  // A single flight serves both timers: stale requests cannot overwrite newer snapshots.
  if(syncPromise)return syncPromise;
  syncPromise=(async()=>{
   const startedAt=Date.now(),anchor=rounds[0]?.id;
   try{
    let result=full||!initialized?await modelPage():await page(100);
    if(anchor&&result.rows.length&&!result.rows.some(row=>String(row.id)===anchor)&&result.rows[0]?.id!==anchor){
     if(!full)result=await modelPage();
     if(!result.rows.some(row=>String(row.id)===anchor))gap('Старая граница истории не найдена; полнота окна неизвестна');
    }
    if(pending&&lastPollAt&&Date.now()-lastPollAt>COVERAGE_MS&&Date.now()>=pending.at&&lastPollAt<pending.at+pending.window)gap('Пропуск обновлений в окне');
    if(result.total!=null)total=result.total;
    merge(result.rows);pollSucceeded(startedAt);initialized=true;processNew(result.rows);
    if(!archiveRows.length)archiveOffset=result.rows.length;
    archiveRows=ENGINE.normalizeRounds([...archiveRows,...rounds]).rows.slice(0,10000);
    render();analyzeAlert();if(autoMode&&!pending)generate();
   }catch(error){
    online=false;if(pending&&Date.now()>=pending.at&&Date.now()<=pending.at+pending.window+GRACE_MS)gap('Нет связи во время проверки');
    status('История не обновилась: '+error.message,'ko');renderBadge();
   }finally{syncPromise=null}
  })();return syncPromise;
 }
 const refreshHistory=()=>syncHistory(true),checkLatest=()=>syncHistory(false);
 function finish(result){
  if(!pending)return;pending.status=result;pending.finishedAt=Date.now();persist();
  $('circle').classList.remove('verifying');$('circle').classList.toggle('ok',result==='hit');$('circle').classList.toggle('ko',result==='miss');
  $('spin').classList.toggle('ok',result==='hit');$('spin').classList.toggle('ko',result==='miss');
  status(result==='hit'?'Цель достигнута в окне.':result==='observed'?'Цель наблюдалась, но время неточное.':result==='miss'?'Цель не достигнута за всё проверенное окно.':'Окно завершено; данных недостаточно для проверки.',result==='hit'?'ok':result==='miss'?'ko':'');
  pending=null;$('generateButton').disabled=false;renderHistory();analyzeAlert();
  if(autoMode)setTimeout(()=>{if(autoMode&&!pending)generate()},1500);
 }
 function tick(){
  renderBadge();if(!pending)return;
  const now=Date.now(),end=pending.at+pending.window;$('roundStatus').textContent=pending.checked;
  if(lastPollAt&&now-lastPollAt>COVERAGE_MS&&now>=pending.at&&lastPollAt<end)gap('Пропуск обновлений в окне');
  if(now>end+GRACE_MS){
   if(syncPromise&&now<end+30000)return;
   const covered=pending.checked>0&&!pending.approximate&&!pending.coverageGap&&online&&fresh()&&rounds[0].timestamp>=end&&!rounds[0].estimated&&lastPollAt>=end+GRACE_MS&&now-lastPollAt<COVERAGE_MS;
   if(!covered&&now<end+30000&&online)return;
   finish(covered?'miss':'expired');return;
  }
  status(now<pending.at?'До начала окна: '+Math.ceil((pending.at-now)/1000)+' с':now<=end?'Окно открыто · проверено '+pending.checked+' раундов':'Окно закрыто · ожидаю последние результаты');
 }
 function analyzeAlert(){
  if(!online||!fresh())activeBig=null;
  else if(!activeBig||Date.now()>=activeBig.at+activeBig.window)activeBig=bigOpportunity();
  $('bigAlert').textContent=activeBig?'Крупная цель '+activeBig.target+'× · '+fmt(activeBig.at)+' — '+fmt(activeBig.at+activeBig.window)+' · оценка '+activeBig.score+' / 100 · '+activeBig.basis:'Крупные коэффициенты: условия пока не выполнены.';
  $('bigSignalButton').disabled=!activeBig||!!pending;
 }
 function renderBadge(){
  $('mbDot').className='mb-dot '+(online&&fresh()?'safe':'danger');
  const age=rounds.length?Math.max(0,Math.round((Date.now()-rounds[0].timestamp)/1000)):null;
  $('mbText').textContent=(online?'База доступна':'Нет связи')+' · '+(age==null?'нет раундов':'последний раунд '+age+' с назад');
  $('generateButton').disabled=!!pending||!online||!fresh();
  if(!online||!fresh())$('bigSignalButton').disabled=true;
 }
 function stats(){
  const hit=history.filter(s=>s.status==='hit').length,miss=history.filter(s=>s.status==='miss').length;
  const observed=history.filter(s=>s.status==='observed').length,expired=history.filter(s=>s.status==='expired').length,n=hit+miss;
  $('countOk').textContent=hit;$('countKo').textContent=miss;$('countTotal').textContent=n;
  $('signalStats').textContent='Проверено: '+n+' · попадания: '+hit+' · промахи: '+miss+' · '+(n?'доля попаданий '+Math.round(hit/n*100)+'%':'доля попаданий пока не рассчитана')+' · время ≈: '+observed+' · не проверено: '+expired;
 }
 function renderHistory(){
  const labels={pending:'Ожидание',hit:'Цель достигнута в окне',observed:'Цель наблюдалась · время ≈',miss:'Цель не достигнута в окне',expired:'Результат не проверен'};
  $('chipsContainer').innerHTML=history.map(s=>'<div class="chip '+(s.status==='hit'?'ok':s.status==='miss'?'ko':'')+'">'+s.target.toFixed(2)+'×<small>'+esc(s.kind==='god-big'?'GOD · крупная цель':s.kind==='god'?'GOD PREDITOR':s.kind==='vip'?'VIP':'Обычный')+' · '+esc(new Date(s.at).toLocaleDateString('ru-RU'))+' '+fmt(s.at)+' — '+fmt(s.at+s.window)+'<br>'+labels[s.status]+(s.actual&&Number.isFinite(s.actual)?' · '+s.actual.toFixed(2)+'×':'')+(s.status==='expired'&&s.coverageReason?'<br>'+esc(s.coverageReason):'')+'</small></div>').join('')||'Прогнозов пока нет.';stats();
 }
 function renderRounds(){
  $('roundGrid').innerHTML=rounds.slice(0,40).map(r=>'<div class="round-chip" style="background:'+(r.coefficient<2?'#078bd0':r.coefficient<10?'#962bdd':'#ec7900')+'"><b>'+r.coefficient.toFixed(2)+'×</b><small>'+fmt(r.timestamp)+(r.estimated?' ≈':'')+'</small></div>').join('');
  const n=rounds.length,n2=rounds.filter(r=>r.coefficient>=2).length;
  $('roundCount').textContent='В модели '+n+' / '+MODEL_LIMIT+' · в базе '+total.toLocaleString('ru-RU')+' · раунды ≥2×: '+(n?Math.round(n2/n*100):0)+'% выборки';
 }
 function renderArchive(){
  const day=$('archiveDate').value,rows=archiveRows.filter(r=>localDay(r.timestamp)===day);
  $('archiveGrid').innerHTML=rows.map(r=>'<div class="chip">'+r.coefficient.toFixed(2)+'×<small>'+fmt(r.timestamp)+(r.estimated?' ≈':'')+'</small></div>').join('')||'В загруженной части истории раундов за этот день нет.';
  const count=rows.length,exact=rows.filter(r=>!r.estimated).length;
  $('archiveSummary').textContent=day+' · '+zone()+' · загружено за день '+count+' ('+exact+' с точным временем)'+(count?' · средний '+mean(rows.map(coefficient)).toFixed(2)+'× · максимум '+Math.max(...rows.map(coefficient)).toFixed(2)+'×':'')+' · статистика только загруженной части';
  $('olderRounds').hidden=archiveDone;$('olderRounds').disabled=archiveLoading;
 }
 async function loadArchive(){
  if(archiveLoading||archiveDone)return;archiveLoading=true;renderArchive();
  try{
   if(archiveRows.length>=10000){$('archiveSummary').textContent+=' · достигнут лимит отображения 10 000 записей';return}
   const result=await page(500,archiveOffset);archiveOffset+=result.rows.length;
   archiveRows=ENGINE.normalizeRounds([...archiveRows,...result.rows]).rows.slice(0,10000);
   archiveDone=result.rows.length===0||(result.total!=null&&archiveOffset>=result.total);
   renderArchive();
  }catch(error){$('archiveSummary').textContent='Архив не обновился: '+error.message}
  finally{archiveLoading=false;$('olderRounds').disabled=false}
 }
 function render(){
  renderBadge();renderRounds();renderHistory();renderArchive();
  const values=rounds.map(coefficient),exact=exactRounds().length;
  $('sampleQuality').textContent='Точное время: '+exact+' · время ≈: '+(rounds.length-exact)+' · '+zone()+' · '+(preciseModel()?'исходные формулы':'циклы и часовые группы отключены')+(invalidRows?' · исключено невалидных: '+invalidRows:'')+(conflictingRows?' · конфликтов ID: '+conflictingRows:'');
  $('modelInfo').textContent=values.length?'EMA20 '+ema(values.slice(0,20),.25).toFixed(2)+'× · EMA50 '+ema(values.slice(0,50),.12).toFixed(2)+'× · медиана '+median(values).toFixed(2)+'× · MAD '+mad(values.slice(0,50)).toFixed(2)+' · σ '+deviation(values.slice(0,50)).toFixed(2):'Ожидаю историю';
 }
 function toggle(id,open){$(id).classList.toggle('open',open)}
 $('openHistory').onclick=()=>{renderHistory();toggle('historyPanel',true)};$('closeHistory').onclick=()=>toggle('historyPanel',false);
 $('openSettings').onclick=()=>toggle('settingsPanel',true);$('closeSettings').onclick=()=>toggle('settingsPanel',false);
 $('saveRange').onclick=()=>{$('settingsMsg').textContent=$('customRange').checked?'Диапазон изменит цель следующего сигнала.':'Используется исходная цель модели.'};
 $('resetStats').onclick=()=>{$('settingsMsg').textContent='Статистика рассчитана по проверенным окнам, отдельно от частот коэффициентов в базе.'};
 $('resetHistory').onclick=()=>{$('settingsMsg').textContent='Сигналы сохраняются в этом браузере. После перезагрузки полнота проверки окна неизвестна.'};
 $('generateButton').onclick=()=>generate();$('bigSignalButton').onclick=()=>generate(true);
 $('autoButton').onclick=()=>{autoMode=!autoMode;$('autoButton').textContent=autoMode?'АВТО: ВКЛ':'АВТОМАТИЧЕСКИЙ';if(autoMode&&!pending)generate()};
 for(const kind of ['normal','vip','god'])$(kind+'Mode').onclick=()=>selectMode(kind);
 $('olderRounds').onclick=loadArchive;$('archiveDate').value=localDay(Date.now());$('archiveDate').onchange=renderArchive;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkLatest();tick()}});
 restore();selectMode(mode);if(pending)showSignal(pending);render();status('Загружаю историю…');
 refreshHistory();setInterval(checkLatest,2000);setInterval(refreshHistory,30000);setInterval(tick,1000);setInterval(analyzeAlert,8000);
})();
