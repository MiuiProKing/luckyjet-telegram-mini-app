import {forecastBasic} from './basic-forecast.mjs?v=20261109-4';

const MAX_LIVE = 2000, MAX_GAP_MS = 300000, FRESH_MS = 180000;
const TARGETS = [2, 10, 20, 50, 100];

function normalized(rounds, now) {
  const values = new Map(), conflicts = new Set();
  for (const row of rounds ?? []) {
    if (!row || row.completed === false || row.estimated === true ||
        !Number.isFinite(row.coefficient) || row.coefficient < 1 ||
        !Number.isFinite(row.timestamp) || row.timestamp <= 0 || row.timestamp > now ||
        !['string', 'number'].includes(typeof row.id) || !String(row.id).trim()) continue;
    const id = String(row.id), previous = values.get(id);
    if (conflicts.has(id)) continue;
    if (previous && (previous.timestamp !== row.timestamp || previous.coefficient !== row.coefficient)) {
      values.delete(id); conflicts.add(id); continue;
    }
    values.set(id, {id, coefficient: row.coefficient, timestamp: row.timestamp});
  }
  return [...values.values()].sort((a,b) => a.timestamp-b.timestamp || a.id.localeCompare(b.id));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b), m = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[m] : sorted[m-1]/2 + sorted[m]/2;
}

function mean(values) {
  if (!values.length) return null;
  let value = 0;
  values.forEach((x,i) => {value += (x-value)/(i+1);});
  return value;
}

function ema(rows, length, alpha) {
  const values = rows.slice(-length);
  if (!values.length) return null;
  let value = values[0].coefficient;
  for (let i=1;i<values.length;i++) value = alpha*values[i].coefficient+(1-alpha)*value;
  return value;
}

function wilson(hits, count) {
  if (!count) return null;
  const z=1.959963984540054, p=hits/count, d=1+z*z/count;
  const center=(p+z*z/(2*count))/d;
  const radius=z*Math.sqrt(p*(1-p)/count+z*z/(4*count*count))/d;
  return [100*Math.max(0,center-radius),100*Math.min(1,center+radius)];
}

function statistics(rows) {
  const values=rows.map(r=>r.coefficient), count=rows.length;
  const low=values.filter(x=>x<2).length, gold=values.filter(x=>x>=10).length;
  const frequencies={};
  for (const target of TARGETS) {
    const hits=values.filter(x=>x>=target).length;
    frequencies[String(target)]={hits,count,pct:count?100*hits/count:null,interval95:wilson(hits,count)};
  }
  return {count,mean:mean(values),median:median(values),
    geometricMean:count?Math.exp(mean(values.map(x=>Math.log(x)))):null,
    ema20:ema(rows,20,.25),ema50:ema(rows,50,.12),
    lowPct:count?100*low/count:null,goldPct:count?100*gold/count:null,frequencies};
}

function russianPattern(pattern='') {
  if (pattern.startsWith('Cycle des cotes')) return 'Цикл золотых коэффициентов';
  if (pattern.startsWith('Série basse')) return 'Серия из 15 раундов ниже 2×';
  if (pattern.includes('cotes ≥20x récentes')) return 'Кластер коэффициентов ≥20×';
  if (pattern.startsWith('Phase mixte')) return 'Смешанная фаза: коэффициенты 5–9×';
  if (pattern.startsWith('Phase favorable')) return 'Фаза с коэффициентами 5–9×';
  if (pattern.startsWith('Plage horaire favorable')) return 'Часовая группа выше исторической средней';
  if (pattern.startsWith('Plage horaire faible')) return 'Часовая группа ниже исторической средней';
  return 'Смешанная локальная эвристика';
}

function validPrevious(value, now) {
  return value && Number.isFinite(value.estimatedCoef) && value.estimatedCoef>=1 &&
    Number.isFinite(value.reliability) && value.reliability>=0 && value.reliability<=100 &&
    Number.isFinite(value.estimatedAt) && value.estimatedAt>0 &&
    Number.isFinite(value.windowMs) && value.windowMs>0 &&
    Number.isFinite(value.generatedAt) && value.generatedAt>0 && value.generatedAt<=now;
}

function annotatedForecast(value) {
  if (!value || !Number.isFinite(value.estimatedCoef) || value.estimatedCoef<1 ||
      !Number.isFinite(value.reliability) || !Number.isFinite(value.estimatedAt) ||
      !Number.isFinite(value.windowMs)) return null;
  if (value.scoreType==='heuristic' && value.scoreIsProbability===false && value.patternRu) return value;
  return {...value,patternRu:russianPattern(value.pattern),scoreType:'heuristic',scoreIsProbability:false,
    bigOpportunity:value.bigOpportunity?{...value.bigOpportunity,scoreIsProbability:false}:null};
}

export function analyzeAttachedModels({historyRounds=[],liveRounds=[],now=Date.now(),previousForecast=null}={}) {
  if (!Number.isFinite(now) || now<=0) throw new TypeError('Требуется действительное время анализа');
  const historyRows=normalized(historyRounds,now), liveInput=normalized(liveRounds,now);
  const bounded=liveInput.slice(-MAX_LIVE);
  let start=0;
  for (let i=1;i<bounded.length;i++) {
    const gap=bounded[i].timestamp-bounded[i-1].timestamp;
    if (gap<=0 || gap>MAX_GAP_MS) start=i;
  }
  const current=bounded.slice(start), latestAt=current.at(-1)?.timestamp??null;
  const ageMs=latestAt===null?null:now-latestAt;
  const status=current.length<20?'learning':ageMs>FRESH_MS?'stale':'ready';
  const live={...statistics(current),status,inputCount:liveInput.length,
    discardedByGap:bounded.length-current.length,discardedByLimit:Math.max(0,liveInput.length-MAX_LIVE),
    latestAt,ageMs,segmentStartedAt:current[0]?.timestamp??null};
  let forecast=null;
  if (status==='ready') {
    const previous=validPrevious(previousForecast,now) && previousForecast.generatedAt>=live.segmentStartedAt ? previousForecast:null;
    forecast=annotatedForecast(forecastBasic(current,previous,now));
  }
  const events=live.frequencies['100'].hits;
  const exposureMs=current.length>=2?latestAt-current[0].timestamp:0;
  const poissonStatus=status==='stale'?'stale':current.length>=200 && events>=5 && exposureMs>0?'ready':'insufficient';
  const probabilityPct=poissonStatus==='ready'?100*(-Math.expm1(-events/exposureMs*180000)):null;
  const poisson={status:poissonStatus,threshold:100,windowMs:180000,events,exposureMs,probabilityPct,
    model:'stationary_poisson',calibrated:false,
    assumption:'Приближение с постоянной интенсивностью; не зависит от времени после последнего большого X.'};
  return {status,history:statistics(historyRows),live,forecast,poisson};
}
