import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeRareWindows, logGamma, regularizedBeta, inverseBetaCDF,
  regularizedGamma, inverseGammaCDF, gammaPoissonPosterior,
  MODEL, EVIDENCE_STATUS, HORIZON_MS, COVERAGE_ASSUMPTION,
} from '../safari/src/rare-window-model.mjs';

const ORIGIN = 1_800_000_000_000; // Exactly aligned to the three-minute epoch grid.
const near = (actual, expected, tolerance = 2e-11) => {
  assert.ok(Number.isFinite(actual), String(actual));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};
const probabilities = [.025, .5, .975];
function history(n = 120, hits = new Set(), origin = ORIGIN, prefix = 'r') {
  return Array.from({length: n * 6 + 1}, (_, i) => ({
    id: `${prefix}:${i}`, timestamp: origin + i * 30_000,
    coefficient: i > 0 && (i - 1) % 6 === 0 && hits.has(Math.floor((i - 1) / 6)) ? 100 : 1.25,
  }));
}
const nowOf = rows => Math.max(...rows.map(r => r.timestamp)) + 20_000;
const risingHits = (n = 120) => new Set(Array.from({length: n}, (_, i) => i)
  .filter(i => i >= n - 30 || i % 12 === 0));

test('special functions match independent Beta and Gamma quantile fixtures', () => {
  // Reference values: scipy.stats.beta.ppf / scipy.stats.gamma.ppf, rate=1.
  const betaFixtures = [
    [1, 1, [.025, .5, .975]],
    [.5, .5, [.001541333133436012, .5, .9984586668665639]],
    [5.5, 25.5, [.06657395356745498, .17043715298905351, .3274277516634612]],
    [.5, 30.5, [.000016231861223464347, .007491115292764968, .07967817381725999]],
    [30.5, .5, [.9203218261827399, .9925088847072351, .9999837681387765]],
  ];
  for (const [a, b, values] of betaFixtures) probabilities.forEach((p, i) => {
    near(inverseBetaCDF(p, a, b), values[i]);
    near(regularizedBeta(values[i], a, b), p);
  });
  const gammaFixtures = [
    [.5, [.0004910345585876278, .227468211559786, 2.511943093657444]],
    [1, [.025317807984289876, .6931471805599455, 3.6888794541139354]],
    [5.5, [1.9078741261180496, 5.170499037195913, 10.9600246305106]],
    [100.5, [81.81501408848392, 100.16686392940771, 121.07793174019264]],
  ];
  for (const [shape, values] of gammaFixtures) probabilities.forEach((p, i) => {
    near(inverseGammaCDF(p, shape), values[i], 2e-9);
    near(regularizedGamma(shape, values[i]), p);
  });
  near(logGamma(.5), Math.log(Math.sqrt(Math.PI)));
  near(logGamma(6), Math.log(120));
  assert.equal(inverseBetaCDF(0, .5, .5), 0);
  assert.equal(inverseBetaCDF(1, .5, .5), 1);
  assert.equal(inverseGammaCDF(0, .5), 0);
  assert.equal(inverseGammaCDF(1, .5), Infinity);
  assert.equal(regularizedGamma(.5, Infinity), 1);
  for (const value of [inverseBetaCDF(-1, 1, 1), inverseBetaCDF(.5, 0, 1),
    regularizedBeta(2, 1, 1), inverseGammaCDF(.5, 0), regularizedGamma(1, -1), logGamma(0)]) {
    assert.ok(Number.isNaN(value));
  }
});

test('Gamma-Poisson prediction integrates rate uncertainty and transforms true credible quantiles', () => {
  const fixtures = [
    [0, 18_000_000, .004962809790010864, [.000004910333530149124, .024806563192400412]],
    [5, 18_000_000, .053256255622565404, [.018897894015953726, .10380768010983733]],
    [10, 5_400_000, .29127885666578235, [.1575000109129817, .4464009542672387]],
  ];
  for (const [k, exposure, probability, interval] of fixtures) {
    const posterior = gammaPoissonPosterior(k, exposure);
    near(posterior.probability, probability);
    posterior.probabilityInterval95.forEach((p, i) => near(p, interval[i]));
    assert.equal(posterior.shape, k + .5);
    assert.equal(posterior.rateMs, exposure);
  }
  assert.equal(gammaPoissonPosterior(5, 0), null);
  assert.equal(gammaPoissonPosterior(5.5, 1), null);
  assert.equal(gammaPoissonPosterior(-1, 1), null);
  assert.equal(gammaPoissonPosterior(1, 1, -1), null);
  assert.equal(gammaPoissonPosterior(5, 1000, 0).probability, 0);
});

test('only a supported historical rise creates an experimental observation window', () => {
  const rows = history(120, risingHits()), now = nowOf(rows);
  const result = analyzeRareWindows(rows, now);
  assert.equal(result.ready, true);
  assert.equal(result.evidenceStatus, EVIDENCE_STATUS);
  assert.equal(result.threshold, 100);
  assert.equal(result.horizonMs, 180_000);
  assert.equal(result.poisson.status, 'ready');
  assert.equal(result.bayesian.status, 'ready');
  assert.equal(result.bayesian.recent.windowCount, 30);
  assert.equal(result.bayesian.reference.windowCount, 90);
  assert.equal(result.bayesian.recent.hitWindowCount, 30);
  assert.equal(result.bayesian.reference.hitWindowCount, 8);
  near(result.bayesian.recent.posteriorMean, 30.5 / 31);
  near(result.bayesian.reference.posteriorMean, 8.5 / 91);
  assert.ok(result.bayesian.recent.interval95[0] > result.bayesian.reference.interval95[1]);
  assert.equal(result.candidate.model, MODEL);
  assert.equal(result.candidate.source, 'beta-window-frequency');
  assert.equal(result.candidate.target, 100);
  assert.equal(result.candidate.generatedAt, now);
  assert.equal(result.candidate.start % 60_000, 0);
  assert.ok(result.candidate.start >= now + 120_000);
  assert.ok(result.candidate.start < now + 180_000);
  assert.equal(result.candidate.end - result.candidate.start, HORIZON_MS);
  assert.equal(result.candidate.purpose, 'observation-only');
  assert.equal(result.candidate.evidenceStatus, 'experimental-unvalidated');
  for (const key of ['bet', 'stake', 'amount', 'action', 'trigger', 'confidence', 'heuristicScore', 'probability']) {
    assert.equal(Object.hasOwn(result.candidate, key), false, key);
  }
  assert.equal(result.bayesian.coverageAssumption, COVERAGE_ASSUMPTION);
  assert.match(result.candidate.reason, /future performance is unvalidated/);
});

test('stationary and declining samples do not create a candidate despite usable probabilities', () => {
  const stable = history(120, new Set(Array.from({length: 24}, (_, i) => i * 5)));
  const result = analyzeRareWindows(stable, nowOf(stable));
  assert.equal(result.poisson.status, 'ready');
  assert.equal(result.bayesian.status, 'ready');
  assert.equal(result.bayesian.reason, 'no-supported-local-rise');
  assert.ok(result.bayesian.currentWindowFrequency > 0);
  assert.equal(result.candidate, null);
  const declining = history(120, new Set(Array.from({length: 120}, (_, i) => i)
    .filter(i => i < 90 || i % 5 === 0)));
  assert.equal(analyzeRareWindows(declining, nowOf(declining)).candidate, null);
});

test('minimum disjoint window and hit support uses Jeffreys credible intervals', () => {
  const hits = new Set([0, 10, 20, 30, 40, 60, 65, 70, 75, 80]);
  const rows = history(90, hits), now = nowOf(rows);
  const result = analyzeRareWindows(rows, now);
  assert.equal(result.bayesian.status, 'ready');
  assert.equal(result.bayesian.reference.windowCount, 60);
  assert.equal(result.bayesian.recent.hitWindowCount, 5);
  near(result.bayesian.recent.posteriorMean, 5.5 / 31);
  near(result.bayesian.recent.interval95[0], .06657395356745498);
  near(result.bayesian.recent.interval95[1], .3274277516634612);
  assert.equal(result.candidate, null);
  const oneWindowShort = history(89, hits);
  assert.equal(analyzeRareWindows(oneWindowShort, nowOf(oneWindowShort)).bayesian.reason,
    'insufficient-covered-windows');
  for (const removedWindow of [40, 80]) {
    const oneHitShort = rows.map(r => r.timestamp === ORIGIN + removedWindow * HORIZON_MS + 30_000
      ? {...r, coefficient: 1.25} : r);
    const insufficient = analyzeRareWindows(oneHitShort, now);
    assert.equal(insufficient.bayesian.reason, 'insufficient-hit-windows');
    assert.equal(insufficient.bayesian.currentWindowFrequency, null);
    assert.equal(insufficient.candidate, null);
  }
});

test('known exposure excludes every left-boundary result and never includes raw waiting time', () => {
  const rows = history(120, risingHits());
  rows[0].coefficient = 1000;
  rows.push({...rows[0], id: 'another-left-boundary-event'});
  const now = nowOf(rows), first = analyzeRareWindows(rows, now);
  assert.equal(first.poisson.eventCount, 38);
  assert.equal(first.poisson.exposureMs, 120 * HORIZON_MS);
  assert.equal(first.poisson.exposureStart, ORIGIN);
  assert.equal(first.poisson.exposureEnd, ORIGIN + 120 * HORIZON_MS);
  const later = analyzeRareWindows(rows, now + 120_000);
  assert.deepEqual(later.poisson, first.poisson);
  assert.deepEqual(later.bayesian, first.bayesian);
  const stale = analyzeRareWindows(rows, now + 180_000);
  assert.equal(stale.ready, false);
  assert.equal(stale.poisson.probability, null);
  assert.equal(stale.bayesian.currentWindowFrequency, null);
  assert.equal(stale.candidate, null);
  assert.equal(stale.diagnostics.reason, 'stale-data');
});

test('the pool contains at most 200 nonoverlapping bracketed windows and disjoint groups', () => {
  const rows = history(240, risingHits(240));
  const result = analyzeRareWindows(rows, nowOf(rows));
  const {windows, recent, reference} = result.bayesian;
  assert.equal(windows.length, 200);
  assert.equal(reference.windowCount, 170);
  assert.equal(recent.windowCount, 30);
  assert.equal(reference.end, recent.start);
  assert.equal(reference.start, ORIGIN + 40 * HORIZON_MS);
  for (let i = 0; i < windows.length; i++) {
    assert.equal(windows[i].start % HORIZON_MS, 0);
    assert.equal(windows[i].end - windows[i].start, HORIZON_MS);
    assert.equal(windows[i].rowCount, 6);
    assert.ok(windows[i].start >= rows[0].timestamp);
    assert.ok(windows[i].end <= rows.at(-1).timestamp);
    if (i) assert.equal(windows[i - 1].end, windows[i].start);
  }
  assert.equal(windows.reduce((sum, w) => sum + w.rowCount, 0), 1200);
  assert.equal(result.bayesian.intervalConvention, 'start-exclusive-end-inclusive');
});

test('the actual last observation must bracket a completed window and exact boundaries count once', () => {
  const rows = history(120);
  rows[6].coefficient = 100; // Exactly the end of window zero.
  const complete = analyzeRareWindows(rows, nowOf(rows));
  assert.equal(complete.bayesian.windows[0].eventCount, 1);
  assert.equal(complete.bayesian.windows[1].eventCount, 0);
  assert.equal(complete.bayesian.eventCount, 1);
  const truncated = rows.slice(1, -1);
  const result = analyzeRareWindows(truncated, nowOf(rows));
  assert.equal(result.bayesian.windowCount, 118);
  assert.equal(result.bayesian.windows[0].start, ORIGIN + HORIZON_MS);
  assert.equal(result.bayesian.windows.at(-1).end, ORIGIN + 119 * HORIZON_MS);
});

test('insufficient rows, exposure, windows or rare events stay unknown with no candidate', () => {
  const low = history(120), now = nowOf(low);
  const noEvents = analyzeRareWindows(low, now);
  assert.equal(noEvents.ready, true);
  assert.equal(noEvents.poisson.status, 'insufficient');
  assert.equal(noEvents.poisson.reason, 'insufficient-events');
  assert.equal(noEvents.poisson.probability, null);
  assert.equal(noEvents.poisson.probabilityInterval95, null);
  assert.equal(noEvents.bayesian.status, 'insufficient');
  assert.equal(noEvents.bayesian.reason, 'insufficient-hit-windows');
  assert.equal(noEvents.bayesian.currentWindowFrequency, null);
  assert.equal(noEvents.candidate, null);
  const short = analyzeRareWindows(low.slice(-499), now);
  assert.equal(short.ready, false);
  assert.equal(short.diagnostics.reason, 'insufficient-contiguous-history');
  assert.equal(short.candidate, null);
  const dense = Array.from({length: 500}, (_, i) => ({id: `dense:${i}`, coefficient: 100,
    timestamp: ORIGIN + i * 100}));
  const denseResult = analyzeRareWindows(dense, nowOf(dense));
  assert.equal(denseResult.poisson.reason, 'insufficient-exposure');
  assert.equal(denseResult.bayesian.reason, 'insufficient-covered-windows');
  assert.equal(denseResult.candidate, null);
  const sameTime = dense.map(r => ({...r, timestamp: ORIGIN}));
  assert.equal(analyzeRareWindows(sameTime, ORIGIN).diagnostics.reason, 'no-positive-exposure');
  for (const input of [null, {}, [], 'rounds']) {
    const result = analyzeRareWindows(input, now);
    assert.equal(result.ready, false);
    assert.equal(result.candidate, null);
    assert.equal(result.poisson.probability, null);
  }
  assert.equal(analyzeRareWindows(low, NaN).diagnostics.reason, 'invalid-now');
});

test('future, malformed, conflicting, estimated and incomplete records cannot support the analysis', () => {
  const rows = history(120, risingHits()), now = nowOf(rows);
  const baseline = analyzeRareWindows(rows, now);
  const extra = [
    {...rows[0]},
    {id: 'future', timestamp: now + 1, coefficient: 10000},
    {id: 'string-value', timestamp: now, coefficient: '10000'},
    {id: 'seconds', timestamp: Math.floor(now / 1000), coefficient: 10000},
    {id: 'estimated', timestamp: now, coefficient: 10000, estimated: true},
    {id: 'incomplete', timestamp: now, coefficient: 10000, completed: false},
    {id: 'bad-flag', timestamp: now, coefficient: 10000, estimated: 'false'},
    {id: 'conflict', timestamp: now, coefficient: 10000},
    {id: 'conflict', timestamp: now, coefficient: 1.1},
    {id: ' padded ', timestamp: now, coefficient: 10000},
    null,
  ];
  const input = [...rows, ...extra].reverse(), before = structuredClone(input);
  const actual = analyzeRareWindows(input, now);
  assert.deepEqual(actual.poisson, baseline.poisson);
  assert.deepEqual(actual.bayesian, baseline.bayesian);
  assert.deepEqual(actual.candidate, baseline.candidate);
  assert.deepEqual(input, before);
  assert.equal(actual.diagnostics.rejectedCount, extra.length);
  const unrelatedIds = rows.map((r, i) => ({...r, id: `arbitrary-${rows.length - i}X`, source_seq: -i}));
  assert.deepEqual(analyzeRareWindows(unrelatedIds, now).poisson, baseline.poisson);
  assert.deepEqual(analyzeRareWindows(unrelatedIds, now).bayesian, baseline.bayesian);
});

test('only the latest contiguous segment can support either model after a gap', () => {
  const old = history(120, risingHits(), ORIGIN, 'old');
  const recentStart = old.at(-1).timestamp + HORIZON_MS + 1;
  const recovered = history(20, new Set([1, 2, 3, 4, 5]), recentStart, 'new');
  const result = analyzeRareWindows([...old, ...recovered], nowOf(recovered));
  assert.equal(result.ready, false);
  assert.equal(result.diagnostics.currentSegmentCount, recovered.length);
  assert.equal(result.diagnostics.discardedOlderSegmentRows, old.length);
  assert.equal(result.diagnostics.boundaryGapMs, HORIZON_MS + 1);
  assert.equal(result.poisson.exposureStart, recentStart);
  assert.equal(result.poisson.eventCount, 5);
  assert.equal(result.poisson.probability, null);
  assert.equal(result.candidate, null);
});
