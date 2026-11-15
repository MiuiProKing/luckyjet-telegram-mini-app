import {analyzeHistory,evaluateWindow as evaluateModelWindow} from './model.mjs';
export {gammaQuantile,betaQuantile} from './model.mjs';
export const VERSION = 'god-bayes-frequency-20261114-v1';
export const TARGETS = [10, 40, 200, 500];
export const WINDOW_MS = 180000;
export const MAX_GAP_MS = 180000;
export const GRACE_MS = 180000;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
export function normalizeRows(input, now) {
  const values = new Map(), conflicts = new Set();
  for (const row of Array.isArray(input) ? input : []) {
    if (!row || row.estimated !== false || row.completed === false) continue;
    const id = typeof row.id === 'string' ? row.id : null;
    const coefficient = Number(row.coefficient), timestamp = Date.parse(row.round_timestamp);
    const order = Number(row.feed_order);
    if (!id || !Number.isFinite(coefficient) || coefficient < 1 || !Number.isFinite(timestamp)
        || timestamp <= 0 || timestamp > now+10000 || !Number.isSafeInteger(order)) continue;
    const normalized = {id,coefficient,timestamp,order};
    const old = values.get(id);
    if (old && (old.coefficient !== coefficient || old.timestamp !== timestamp || old.order !== order)) conflicts.add(id);
    else values.set(id,normalized);
  }
  return [...values.values()].filter(r=>!conflicts.has(r.id)).sort((a,b)=>a.timestamp-b.timestamp||a.order-b.order);
}

export function statistics(rows,target,now) {
  const analysis=analyzeHistory(rows,now), estimate=analysis.targets.find(t=>t.target===target);
  if(!analysis.ready||!estimate?.next3Minutes)return {ready:false,fresh:analysis.fresh,sampleSize:analysis.sampleSize,cutoff:analysis.cutoff};
  return {ready:true,fresh:analysis.fresh,target,sampleSize:analysis.sampleSize,hits:estimate.hits,
    cutoff:analysis.cutoff,first:rows[0].timestamp,
    exposureSeconds:analysis.observedMs/1000,poissonEvents:estimate.next3Minutes.events,
    perRoundProbability:estimate.perRound.probability,perRound:estimate.perRound,
    nextRounds:estimate.nextRounds,probability:estimate.next3Minutes.probability,
    interval95:estimate.next3Minutes.interval95,coverageGapMs:analysis.coverageGapMs,
    assumption:'constant_poisson',probabilityKind:'posterior_predictive_window',
    prior:{roundAlpha:.5,roundBeta:.5,poissonShape:.5,poissonRate:0},
    coverage:'full_observed_span_including_unknown_gaps; provider sequence not verified'};
}

export function plannedWindow(stats, now) {
  if(!stats?.ready||!TARGETS.includes(stats.target))return null;
  const start=Math.ceil((now+30000)/WINDOW_MS)*WINDOW_MS,end=start+WINDOW_MS;
  return {id:`${VERSION}:${stats.target}:${start}`,target:stats.target,start,end,issuedAt:now,
    modelVersion:VERSION,probability:stats.probability,interval95:stats.interval95,
    perRoundProbability:stats.perRoundProbability,sampleSize:stats.sampleSize,hits:stats.hits,
    cutoff:stats.cutoff,first:stats.first,exposureSeconds:stats.exposureSeconds,
    poissonEvents:stats.poissonEvents,coverageGapMs:stats.coverageGapMs,perRound:stats.perRound,nextRounds:stats.nextRounds,assumption:stats.assumption,status:'pending',
    timingKind:'fixed_future_statistical_window',validatedEdge:false};
}

export function evaluateWindow(window,rows,now) {
  if(!window||!finite(window.start)||!finite(window.end)||!finite(window.target)||now<=window.end)return null;
  const result=evaluateModelWindow(window,rows,now);
  if(result.status==='unknown'&&now<=window.end+GRACE_MS)return null;
  return result;
}
