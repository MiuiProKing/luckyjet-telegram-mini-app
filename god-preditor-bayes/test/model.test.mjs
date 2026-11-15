import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHistory, betaQuantile, gammaQuantile, createWindow, evaluateWindow, normalizeRounds } from '../model.mjs';

const NOW = Date.UTC(2026, 10, 14, 15, 0, 0);
function history(n = 1000, end = NOW) {
  return Array.from({ length: n }, (_, i) => ({ id: String(i), timestamp: end - (n - i - 1) * 20_000,
    coefficient: i % 200 === 0 ? 700 : i % 40 === 0 ? 210 : i % 10 === 0 ? 45 : i % 5 === 0 ? 12 : 1.2,
    completed: true, estimated: false, order: i }));
}
const near = (actual, expected, error = 1e-10) => assert.ok(Math.abs(actual - expected) <= error, `${actual} != ${expected}`);

test('beta inverse agrees with known uniform/arcsine/large-posterior quantiles', () => {
  near(betaQuantile(.025, 1, 1), .025);
  near(betaQuantile(.975, .5, .5), Math.sin(Math.PI * .975 / 2) ** 2);
  near(betaQuantile(.5, 100, 100), .5);
  // Independent reference: scipy.stats.beta.ppf, not this implementation.
  near(betaQuantile(.025, 10.5, 990.5), .005152700745321492, 1e-12);
  near(betaQuantile(.025, .5, 1000.5), 4.909116947944415e-7, 1e-16);
  near(betaQuantile(.975, 20000.5, 180000.5), .10132057199478925, 1e-10);
});

test('Gamma inverse agrees with independent SciPy reference at sparse and large event counts', () => {
  near(gammaQuantile(.025, .5), .0004910345585876278, 1e-13);
  near(gammaQuantile(.975, .5), 2.511943093657444, 1e-11);
  near(gammaQuantile(.025, 2.5), .41560580674333125, 1e-11);
  near(gammaQuantile(.975, 20000.5), 20278.630163216523, 1e-6);
  assert.ok(Number.isNaN(gammaQuantile(NaN, .5)));
  assert.ok(Number.isNaN(betaQuantile(NaN, 1, 1)));
});

test('only exact completed already observed rounds; IDs dedup, equal coefficients retained', () => {
  const rows = history(5), result = normalizeRounds([...rows, rows[0],
    { ...rows[1], coefficient: 99 }, { ...rows[2], id: 'future', timestamp: NOW + 1 },
    { ...rows[2], id: 'estimated', estimated: true }, { ...rows[2], id: 'incomplete', completed: false },
    { ...rows[2], id: 'bad', coefficient: NaN }], NOW);
  assert.equal(result.length, 4);
  assert.ok(result.every(r => r.id !== rows[1].id));
  assert.equal(result.filter(r => r.coefficient === 1.2).length, 3);
});

test('Beta-Binomial probabilities agree with posterior moments', () => {
  const a = analyzeHistory(history(), NOW), t = a.targets.find(t => t.target === 10), n = 1000;
  near(t.perRound.probability, (200 + .5) / (n + 1));
  const { a: alpha, b } = t.posterior;
  near(t.nextRounds[3].probability, 1 - b * (b + 1) * (b + 2) / ((alpha + b) * (alpha + b + 1) * (alpha + b + 2)));
  assert.equal(a.ready, true);
});

test('probabilities ordered across threshold and future horizon; intervals bounded', () => {
  const a = analyzeHistory(history(10_000), NOW);
  for (const horizon of [1, 3, 5]) for (let i = 1; i < a.targets.length; i++) {
    assert.ok(a.targets[i].nextRounds[horizon].probability <= a.targets[i - 1].nextRounds[horizon].probability);
    assert.ok(a.targets[i].next3Minutes.probability <= a.targets[i - 1].next3Minutes.probability);
  }
  for (const t of a.targets) {
    assert.ok(t.nextRounds[1].probability <= t.nextRounds[3].probability);
    assert.ok(t.nextRounds[3].probability <= t.nextRounds[5].probability);
    for (const estimate of [t.perRound, ...Object.values(t.nextRounds), t.next3Minutes]) {
      assert.ok(0 <= estimate.interval95[0] && estimate.interval95[0] <= estimate.probability);
      assert.ok(estimate.probability <= estimate.interval95[1] && estimate.interval95[1] <= 1);
    }
  }
});

test('waiting does not artificially increase future Poisson probability', () => {
  const rows = history(), early = analyzeHistory(rows, NOW), later = analyzeHistory(rows, NOW + 120_000);
  assert.equal(early.targets[3].next3Minutes.probability, later.targets[3].next3Minutes.probability);
  assert.equal(later.targets[3].calibrated, false);
  assert.equal(later.validatedEdge, false);
});

test('future three-minute estimate uses Gamma posterior predictive and consistent minute units', () => {
  const a = analyzeHistory(history(), NOW), t = a.targets.find(t => t.target === 10);
  assert.equal(a.observedMs, 999 * 20_000);
  assert.equal(t.next3Minutes.events, 199); // First observation has no preceding observed exposure.
  near(t.next3Minutes.exposureMinutes, 333);
  near(t.next3Minutes.probability, 1 - (333 / 336) ** 199.5);
});

test('zero observed rare events produce finite uncertainty, not certainty of absence', () => {
  const a = analyzeHistory(history().map(r => ({ ...r, coefficient: 1.5 })), NOW), t = a.targets[3];
  assert.ok(t.perRound.probability > 0 && t.perRound.probability < .001);
  assert.ok(t.next3Minutes.interval95[0] > 0);
  assert.ok(t.next3Minutes.interval95[1] > t.next3Minutes.probability);
});

test('collector order gaps do not masquerade as missing provider rounds', () => {
  const rows = history(1000), baseline = analyzeHistory(rows, NOW);
  rows[400] = { ...rows[400], order: 100_000 };
  const gaps = analyzeHistory(rows, NOW);
  assert.equal(gaps.observedMs, baseline.observedMs);
  assert.equal(gaps.dataQuality.providerSequenceVerified, false);
});

test('long intervals retain all big-X events instead of outcome-dependent censoring', () => {
  const rows = history(), baseline = analyzeHistory(rows, NOW);
  const changed = rows.map((r, i) => ({ ...r, timestamp: r.timestamp - (i < 400 ? 300_000 : 0) }));
  const gapped = analyzeHistory(changed, NOW);
  assert.equal(gapped.observedMs, baseline.observedMs + 300_000);
  const mega = a => a.targets.find(t => t.target === 500);
  // A >=500 round can take longer to finish; its long preceding interval
  // must not exclude the very event whose frequency we want to estimate.
  assert.equal(mega(gapped).next3Minutes.events, mega(baseline).next3Minutes.events);
  assert.equal(mega(gapped).hits, mega(baseline).hits);
  assert.equal(gapped.dataQuality.timeGapWarnings, 1);
  assert.equal(gapped.dataQuality.coverageVerified, false);
});

test('all 17 long-flight >=500 events survive the rate estimate', () => {
  const rows = [], N = 1000;
  let time = NOW - 30_000_000, big = 0;
  for (let i = 0; i < N; i++) {
    const high = i > 0 && i % 57 === 0;
    time += high ? 140_000 : 15_000;
    if (high) big++;
    rows.push({ id: String(i), coefficient: high ? 800 : 1.4, timestamp: time });
  }
  const analysis = analyzeHistory(rows, time), target = analysis.targets.find(t => t.target === 500);
  assert.equal(big, 17);
  assert.equal(target.hits, 17);
  assert.equal(target.next3Minutes.events, 17);
  assert.equal(analysis.dataQuality.timeGapWarnings, 17);
  assert.ok(target.next3Minutes.probability > 0);
});

test('planning window has immutable metadata and freshness gates', () => {
  const a = analyzeHistory(history(), NOW), w = createWindow(a, NOW, 40);
  assert.equal(w.target, 40);
  assert.equal(w.start, NOW + 20_000);
  assert.equal(w.end - w.start, 180_000);
  assert.equal(w.scheduleKind, 'pace_estimate');
  assert.equal(createWindow(a, NOW + 180_001), null);
  assert.equal(createWindow(analyzeHistory(history(199), NOW), NOW), null);
  assert.equal(createWindow(a, NOW, 100), null);
});

function windowRows() {
  const w = createWindow(analyzeHistory(history(), NOW), NOW, 40);
  const rows = Array.from({ length: 13 }, (_, i) => ({ id: 'new-' + i, coefficient: 1.2,
    timestamp: w.start - 20_000 + i * 20_000, order: i }));
  return { w, rows };
}

test('event before advertised start never wins, result waits for closure', () => {
  const { w, rows } = windowRows();
  rows[0].coefficient = 1000;
  assert.equal(evaluateWindow(w, rows, w.end + 20_000).status, 'miss');
  rows[2].coefficient = 50;
  assert.equal(evaluateWindow(w, rows, w.end).status, 'pending');
  const result = evaluateWindow(w, rows, w.end + 20_000);
  assert.equal(result.status, 'hit');
  assert.equal(result.actual, 50);
  assert.equal(result.resultAt, rows[2].timestamp);
});

test('both window boundaries inclusive; hits verifiable even with an unrelated gap', () => {
  const { w, rows } = windowRows();
  rows[1].coefficient = 40;
  assert.equal(rows[1].timestamp, w.start);
  assert.equal(evaluateWindow(w, rows, w.end + 20_000).status, 'hit');
  rows[1].coefficient = 1.2;
  rows[10].coefficient = 41;
  assert.equal(rows[10].timestamp, w.end);
  assert.equal(evaluateWindow(w, [rows[0], rows[10]], w.end + 20_000).status, 'hit');
});

test('missing window history or an excessive time gap gives UNKNOWN, never a false loss', () => {
  const { w, rows } = windowRows();
  assert.equal(evaluateWindow(w, rows.slice(1, 8), w.end + 20_000).status, 'unknown');
  assert.equal(evaluateWindow(w, [rows[0], rows.at(-1)], w.end + 40_000).status, 'unknown');
  const hole = rows.filter((_, i) => ![4, 5, 6].includes(i));
  assert.equal(evaluateWindow(w, hole, w.end + 40_000).reason, 'history_gap');
  assert.equal(evaluateWindow(w, rows, w.end + 40_000).status, 'miss');
});

test('later backfill can resolve previously unknown; invalid windows rejected', () => {
  const { w, rows } = windowRows();
  assert.equal(evaluateWindow(w, [], w.end + 40_000).status, 'unknown');
  rows[5].coefficient = 45;
  assert.equal(evaluateWindow(w, rows, w.end + 40_000).status, 'hit');
  assert.equal(evaluateWindow({ ...w, issuedAt: w.start + 1 }, rows, w.end + 40_000).reason, 'invalid_window');
});
