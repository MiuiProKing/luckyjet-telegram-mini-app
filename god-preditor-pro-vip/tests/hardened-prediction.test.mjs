import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAdditionalOpportunity, EVIDENCE_STATUS, generatePrediction,
  normalizeRounds, poissonWindowProbability, POISSON_HORIZON_MS,
} from '../safari/src/prediction-v2.ts';

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 2, 12, 5, 17, 123);
const rows = (count = 80, now = NOW, coefficient = 2.2) => Array.from({ length: count }, (_, index) => ({
  id: `r${index}`, coefficient, timestamp: now - index * 15_000,
}));
const withMegaCycle = (now = NOW, count = 6) => {
  const result = rows(80, now);
  for (let index = 0; index < count; index++) result[index * 4].coefficient = 100;
  return result;
};
const primaryFields = ({ estimatedCoef, estimatedAt, windowMs, generatedAt, pattern, basis, heuristicScore, evidenceStatus }) =>
  ({ estimatedCoef, estimatedAt, windowMs, generatedAt, pattern, basis, heuristicScore, evidenceStatus });
const assertNoLegacyScores = (value) => {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(!['confidence', 'reliability', 'overdueProb', 'successProbability'].includes(key), `legacy field ${key}`);
    assertNoLegacyScores(nested);
  }
};

test('normalization requires stable IDs and strict finite numeric values in epoch milliseconds', () => {
  const good = rows(20);
  const malformed = [
    null, {}, { ...good[0], id: '' }, { ...good[0], id: ' ' }, { ...good[0], id: ' spaced ' },
    { ...good[0], id: undefined }, { ...good[0], id: {} },
    ...['2.2', null, NaN, Infinity, -Infinity, 0.99].map((coefficient, i) => ({ ...good[0], id: `bad-coef-${i}`, coefficient })),
    ...['1700000000000', NaN, Infinity, NOW / 1000, NOW + 0.5, -1].map((timestamp, i) => ({ ...good[0], id: `bad-time-${i}`, timestamp })),
    { ...good[0], id: 'bad-estimated', estimated: 'true' }, { ...good[0], id: 'bad-completed', completed: 'false' },
  ];
  assert.deepEqual(normalizeRounds([...good, ...malformed], NOW), good);
  assert.equal(generatePrediction(malformed, null, NOW), null);
});

test('normalization removes future, estimated and incomplete rows and reports exclusions', () => {
  const result = generatePrediction([
    ...rows(20),
    { id: 'future', coefficient: 100, timestamp: NOW + 1 },
    { id: 'estimate', coefficient: 100, timestamp: NOW, estimated: true },
    { id: 'unfinished', coefficient: 100, timestamp: NOW, completed: false },
  ], null, NOW);
  assert.ok(result);
  assert.equal(result.diagnostics.normalization.acceptedCount, 20);
  assert.equal(result.diagnostics.normalization.futureCount, 1);
  assert.equal(result.diagnostics.normalization.estimatedCount, 1);
  assert.equal(result.diagnostics.normalization.incompleteCount, 1);
});

test('duplicates cannot manufacture the 20-round minimum', () => {
  const history = rows(19);
  assert.equal(normalizeRounds([...history, ...history], NOW).length, 19);
  assert.equal(generatePrediction([...history, ...history], null, NOW), null);
});

test('identical duplicate IDs collapse; conflicting coefficients or times reject every copy', () => {
  const history = rows(21);
  const identical = generatePrediction([...history, { ...history[0] }], null, NOW);
  assert.equal(identical.diagnostics.normalization.acceptedCount, 21);
  assert.equal(identical.diagnostics.normalization.duplicateCount, 1);
  for (const conflict of [{ ...history[0], coefficient: 300 }, { ...history[0], timestamp: NOW - 1 }]) {
    const result = generatePrediction([...history, conflict], null, NOW);
    assert.equal(result.diagnostics.normalization.acceptedCount, 20);
    assert.equal(result.diagnostics.normalization.conflictingIdCount, 1);
    assert.equal(result.diagnostics.normalization.conflictingRecordCount, 2);
    assert.ok(!normalizeRounds([...history, conflict], NOW).some(({ id }) => id === history[0].id));
  }
  assert.equal(generatePrediction([...rows(20), { ...rows(20)[0], coefficient: 400 }], null, NOW), null);
});

test('canonical ordering and outputs are independent of input order without mutating input', () => {
  const history = rows(80);
  history[10].coefficient = 3.5;
  const snapshot = structuredClone(history);
  const reversed = [...history].reverse();
  assert.deepEqual(generatePrediction(history, null, NOW), generatePrediction(reversed, null, NOW));
  assert.deepEqual(history, snapshot);
  assert.notEqual(normalizeRounds(history, NOW)[0], history[0]);
});

test('numeric stable IDs are canonicalized and collide conservatively with equivalent string IDs', () => {
  const history = rows(20);
  history[0].id = 123;
  const normalized = normalizeRounds([...history, { ...history[0], id: '123' }], NOW);
  assert.equal(normalized.length, 20);
  assert.equal(normalized[0].id, '123');
});

test('20 completed rows and freshness <=180 seconds are mandatory', () => {
  assert.equal(generatePrediction(rows(19), null, NOW), null);
  assert.ok(generatePrediction(rows(20), null, NOW));
  assert.ok(generatePrediction(rows(20, NOW - 180_000), null, NOW));
  assert.equal(generatePrediction(rows(20, NOW - 180_001), null, NOW), null);
  assert.equal(generatePrediction(rows(20, NOW + MIN), null, NOW), null);
});

test('invalid arrays and clocks fail closed', () => {
  for (const input of [null, undefined, {}, 'history']) assert.equal(generatePrediction(input, null, NOW), null);
  for (const clock of [NaN, Infinity, '1700000000000', NOW / 1000, NOW + 0.1]) {
    assert.equal(generatePrediction(rows(20), null, clock), null);
    assert.deepEqual(normalizeRounds(rows(20), clock), []);
  }
});

test('fallback ETA is minute aligned, deterministic and at least 120 seconds away', () => {
  for (const offset of [0, 1, 17_123, 59_999]) {
    const now = Date.UTC(2026, 10, 2, 12, 5) + offset;
    const result = generatePrediction(rows(80, now), null, now);
    assert.equal(result.pattern, 'Analyse multi-signaux');
    assert.equal(result.estimatedAt % MIN, 0);
    assert.equal(result.estimatedAt, Math.ceil((now + 120_000) / MIN) * MIN);
    assert.ok(result.estimatedAt - now >= 120_000);
    assert.ok(result.estimatedAt - now < 180_000);
    assert.deepEqual(generatePrediction(rows(80, now), null, now), result);
  }
});

test('output exposes unvalidated heuristic scores without legacy probability-like confidence fields', () => {
  for (const history of [rows(), rows(80, NOW, 1.2), withMegaCycle()]) {
    const result = generatePrediction(history, null, NOW);
    assert.equal(result.evidenceStatus, EVIDENCE_STATUS);
    assert.ok(result.heuristicScore >= 0 && result.heuristicScore <= 100);
    assertNoLegacyScores(result);
  }
});

test('valid held primary is immutable while fresh additional analysis continues', () => {
  const previous = generatePrediction(rows(), null, NOW);
  const snapshot = structuredClone(previous);
  const later = NOW + 8_000;
  const held = generatePrediction(withMegaCycle(later), previous, later);
  assert.deepEqual(primaryFields(held), primaryFields(previous));
  assert.equal(held.diagnostics.primaryHeld, true);
  assert.equal(held.diagnostics.analyzedAt, later);
  assert.equal(held.diagnostics.additional.analyzedAt, later);
  assert.ok(held.bigOpportunity);
  assert.equal(held.bigOpportunity.generatedAt, later);
  assert.deepEqual(previous, snapshot);
});

test('additional publication holds its own interval while diagnostics continue and rejects invalid expiry', () => {
  const previous = generatePrediction(withMegaCycle(), null, NOW);
  assert.ok(previous.bigOpportunity);
  const later = NOW + 8_000;
  const held = generatePrediction(rows(80, later), previous, later);
  assert.equal(held.diagnostics.primaryHeld, true);
  assert.equal(held.diagnostics.additionalHeld, true);
  assert.equal(held.diagnostics.additional.candidateCount, 0);
  assert.deepEqual(held.bigOpportunity, previous.bigOpportunity);
  const expired = { ...previous, bigOpportunity: { ...previous.bigOpportunity, expiresAt: NOW - 1 } };
  assert.equal(generatePrediction(rows(80, later), expired, later).bigOpportunity, null);
});

test('stale or insufficient new data cannot be rescued by a valid held primary', () => {
  const previous = generatePrediction(rows(), null, NOW);
  assert.equal(generatePrediction(rows(19, NOW + 8_000), previous, NOW + 8_000), null);
  assert.equal(generatePrediction(rows(), previous, NOW + 180_001), null);
});

test('malformed, legacy and implausible previous predictions never lock the primary', () => {
  const previous = generatePrediction(rows(), null, NOW);
  const later = NOW + 8_000;
  const cases = [
    {}, { ...previous, estimatedCoef: NaN }, { ...previous, heuristicScore: 101 },
    { ...previous, generatedAt: later + 1 }, { ...previous, generatedAt: 'yesterday' },
    { ...previous, estimatedAt: NOW + 365 * 24 * 60 * MIN },
    { ...previous, estimatedAt: NOW - 1 }, { ...previous, windowMs: -1 },
    { ...previous, windowMs: Infinity }, { ...previous, pattern: '' },
    { ...previous, evidenceStatus: undefined }, { ...previous, heuristicScore: undefined, reliability: 90, confidence: 'Élevé' },
  ];
  for (const invalid of cases) {
    const result = generatePrediction(rows(80, later, 1.2), invalid, later);
    assert.equal(result.diagnostics.primaryHeld, false);
    assert.equal(result.generatedAt, later);
    assert.match(result.pattern, /Série basse/);
    assertNoLegacyScores(result);
  }
});

test('held objects are reconstructed so unknown legacy fields cannot leak into output', () => {
  const previous = { ...generatePrediction(rows(), null, NOW), confidence: 'Élevé', reliability: 99, arbitraryProbability: 0.99 };
  const held = generatePrediction(rows(80, NOW + 1_000), previous, NOW + 1_000);
  assert.equal(held.diagnostics.primaryHeld, true);
  assertNoLegacyScores(held);
  assert.equal('arbitraryProbability' in held, false);
});

test('the primary expires at the closure boundary and a new primary is generated', () => {
  const previous = generatePrediction(rows(), null, NOW);
  const closure = previous.estimatedAt + previous.windowMs;
  const held = generatePrediction(rows(80, closure - 1), previous, closure - 1);
  assert.equal(held.diagnostics.primaryHeld, true);
  const replaced = generatePrediction(rows(80, closure), previous, closure);
  assert.equal(replaced.diagnostics.primaryHeld, false);
  assert.equal(replaced.generatedAt, closure);
});

test('a lone high-scoring cluster cannot publish an additional opportunity', () => {
  const history = rows();
  for (let index = 0; index < 8; index++) history[index].coefficient = 60;
  const result = generatePrediction(history, null, NOW);
  assert.equal(result.diagnostics.additional.clusterCandidate.heuristicScore, 82);
  assert.equal(result.diagnostics.additional.cycleCandidate, null);
  assert.equal(result.diagnostics.additional.candidateCount, 1);
  assert.equal(result.bigOpportunity, null);
});

test('a lone cycle cannot publish an additional opportunity', () => {
  const result = generatePrediction(withMegaCycle(NOW, 5), null, NOW);
  assert.ok(result.diagnostics.additional.cycleCandidate);
  assert.equal(result.diagnostics.additional.clusterCandidate, null);
  assert.equal(result.bigOpportunity, null);
});

test('MAD=0 positive cycles are retained as unvalidated candidates and require overlapping cluster windows', () => {
  const result = generatePrediction(withMegaCycle(), null, NOW);
  const additional = result.diagnostics.additional;
  assert.equal(additional.candidateCount, 2);
  assert.equal(additional.decision, 'overlapping-heuristics');
  assert.ok(additional.cycleCandidate);
  assert.ok(additional.clusterCandidate);
  assert.equal(result.bigOpportunity.expectedAt, additional.overlap.start);
  assert.equal(result.bigOpportunity.expiresAt, additional.overlap.end);
  assert.equal(result.bigOpportunity.windowMs, additional.overlap.end - additional.overlap.start);
  assert.equal(result.bigOpportunity.heuristicScore,
    Math.min(additional.cycleCandidate.heuristicScore, additional.clusterCandidate.heuristicScore));
  assert.equal(result.bigOpportunity.evidenceStatus, EVIDENCE_STATUS);
});

test('two candidates with disjoint windows cannot publish an additional opportunity', () => {
  const history = rows(2353);
  for (let index = 0; index < 5; index++) history[(108 + index * 120) * 4].coefficient = 100;
  for (let index = 0; index < 6; index++) history[index].coefficient = 50;
  const result = generatePrediction(history, null, NOW);
  assert.equal(result.diagnostics.additional.candidateCount, 2);
  assert.equal(result.diagnostics.additional.decision, 'disjoint-windows');
  assert.equal(result.diagnostics.additional.overlap, null);
  assert.equal(result.bigOpportunity, null);
});

test('identical timestamps cannot masquerade as a stable positive mega cycle', () => {
  const history = rows();
  for (let index = 0; index < 6; index++) { history[index].coefficient = 100; history[index].timestamp = NOW; }
  const result = generatePrediction(history, null, NOW);
  assert.equal(result.diagnostics.additional.cycleCandidate, null);
  assert.equal(result.bigOpportunity, null);
});

test('Poisson next fixed-window calculation has a constant hazard, not an overdue boost', () => {
  const lambda = 1 / (10 * MIN);
  assert.ok(Math.abs(poissonWindowProbability(lambda, 3 * MIN) - (1 - Math.exp(-0.3))) < 1e-14);
  assert.equal(poissonWindowProbability(0, 3 * MIN), 0);
  assert.equal(poissonWindowProbability(lambda, 0), 0);
  for (const [rate, horizon] of [[-1, MIN], [Infinity, MIN], [lambda, -1], [lambda, NaN]])
    assert.equal(poissonWindowProbability(rate, horizon), null);
  const history = withMegaCycle();
  const first = analyzeAdditionalOpportunity(history, NOW).diagnostics.poisson;
  const later = analyzeAdditionalOpportunity(history, NOW + MIN).diagnostics.poisson;
  assert.equal(first.model, 'stationary-poisson-assumption');
  assert.equal(first.evidenceStatus, 'assumption-only-not-calibrated');
  assert.equal(first.horizonMs, POISSON_HORIZON_MS);
  assert.deepEqual(later, first);
  assert.equal('sinceLast' in first, false);
  assert.equal('overdueProb' in first, false);
});

test('primary arithmetic bounds survive representative low, dense, mid and fallback histories', () => {
  const low = generatePrediction(rows(80, NOW, 1.2), null, NOW);
  assert.equal(low.estimatedCoef, 4.2);
  assert.equal(low.estimatedAt, NOW + 90_000);
  assert.equal(low.windowMs, 2 * MIN);
  const denseRows = rows();
  for (let index = 0; index < 3; index++) denseRows[index].coefficient = 30;
  const dense = generatePrediction(denseRows, null, NOW);
  assert.equal(dense.estimatedCoef, 6);
  assert.equal(dense.estimatedAt, NOW + 2 * MIN);
  const midRows = rows();
  for (let index = 0; index < 3; index++) midRows[index].coefficient = 6;
  const mid = generatePrediction(midRows, null, NOW);
  assert.equal(mid.estimatedCoef, 4.2);
  const fallback = generatePrediction(rows(), null, NOW);
  assert.ok(fallback.estimatedCoef >= 1.8 && fallback.estimatedCoef <= 12);
});

test('MAD=0 golden cycles can be detected without treating them as validated predictions', () => {
  const history = rows(80);
  for (let index = 0; index < 8; index++) history[index * 4].coefficient = 10;
  // Shift most recent hit 30 seconds into the past, retaining 60 second positive gaps.
  for (const round of history) if (round.coefficient === 10) round.timestamp -= 30_000;
  const result = generatePrediction(history, null, NOW);
  assert.match(result.pattern, /Cycle des cotes/);
  assert.equal(result.estimatedCoef, 2.5);
  assert.equal(result.evidenceStatus, EVIDENCE_STATUS);
});

test('finite extreme coefficients do not overflow the primary output', () => {
  const result = generatePrediction(rows(80, NOW, Number.MAX_VALUE), null, NOW);
  for (const value of [result.estimatedCoef, result.estimatedAt, result.windowMs, result.generatedAt, result.heuristicScore])
    assert.ok(Number.isFinite(value));
  assertNoLegacyScores(result);
});

test('only the newest contiguous observation segment feeds cycles and Poisson diagnostics', () => {
  const current = rows(80);
  const old = withMegaCycle(NOW - 18 * 60 * MIN).map((round) => ({ ...round, id: `old-${round.id}` }));
  const history = [...current, ...old];
  assert.equal(normalizeRounds(history, NOW).length, 160);
  const result = generatePrediction(history, null, NOW);
  assert.deepEqual(primaryFields(result), primaryFields(generatePrediction(current, null, NOW)));
  assert.equal(result.diagnostics.continuity.currentSegmentCount, 80);
  assert.equal(result.diagnostics.continuity.discardedOlderSegmentRows, 80);
  assert.equal(result.diagnostics.continuity.status, 'continuity-unknown-before-gap');
  assert.ok(result.diagnostics.continuity.boundaryGapMs > 180_000);
  assert.equal(result.diagnostics.additional.cycleCandidate, null);
  assert.equal(result.diagnostics.additional.poisson, null);
  assert.equal(analyzeAdditionalOpportunity(history, NOW).diagnostics.poisson, null);
});

test('older observations cannot fill an undersized fresh observation segment', () => {
  const current = rows(19);
  const old = rows(80, NOW - 18 * 60 * MIN).map((round) => ({ ...round, id: `old-${round.id}` }));
  assert.equal(generatePrediction([...current, ...old], null, NOW), null);
  assert.equal(analyzeAdditionalOpportunity([...current, ...old], NOW), null);
});

test('the continuity cutoff is strictly greater than 180 seconds', () => {
  const current = rows(19);
  const oldest = current.at(-1).timestamp;
  const boundary = { id: 'boundary', coefficient: 2.2, timestamp: oldest - 180_000 };
  assert.ok(generatePrediction([...current, boundary], null, NOW));
  assert.equal(generatePrediction([...current, { ...boundary, timestamp: boundary.timestamp - 1 }], null, NOW), null);
});

test('an additional publication survives primary expiry until its own fixed expiry', () => {
  const olderPrimary = generatePrediction(rows(80, NOW - 2 * MIN), null, NOW - 2 * MIN);
  const first = generatePrediction(withMegaCycle(), olderPrimary, NOW);
  const primaryEnd = first.estimatedAt + first.windowMs;
  assert.ok(primaryEnd < first.bigOpportunity.expiresAt);
  const next = generatePrediction(rows(80, primaryEnd), first, primaryEnd);
  assert.equal(next.diagnostics.primaryHeld, false);
  assert.equal(next.generatedAt, primaryEnd);
  assert.equal(next.diagnostics.additionalHeld, true);
  assert.deepEqual(next.bigOpportunity, first.bigOpportunity);
});

test('an additional publication expires during a held primary without extending its window', () => {
  const first = generatePrediction(withMegaCycle(), null, NOW);
  const bigEnd = first.bigOpportunity.expiresAt;
  assert.ok(bigEnd < first.estimatedAt + first.windowMs);
  const before = generatePrediction(rows(80, bigEnd - 1), first, bigEnd - 1);
  assert.deepEqual(before.bigOpportunity, first.bigOpportunity);
  const expired = generatePrediction(rows(80, bigEnd), first, bigEnd);
  assert.equal(expired.diagnostics.primaryHeld, true);
  assert.equal(expired.diagnostics.additionalHeld, false);
  assert.equal(expired.bigOpportunity, null);
  assert.deepEqual(primaryFields(expired), primaryFields(first));
});

test('fractional golden-cycle arithmetic publishes integer timing that remains holdable', () => {
  const history = rows(1300);
  for (let index = 0; index < 8; index++) history.push({
    id: `gold-${index}`, coefficient: 10, timestamp: NOW - (242_000 + index * 360_003),
  });
  const first = generatePrediction(history, null, NOW);
  assert.match(first.pattern, /Cycle des cotes/);
  assert.equal(first.windowMs, 90_001);
  assert.ok(Number.isSafeInteger(first.estimatedAt));
  const next = generatePrediction(rows(80, NOW + 8_000), first, NOW + 8_000);
  assert.equal(next.diagnostics.primaryHeld, true);
  assert.deepEqual(primaryFields(next), primaryFields(first));
});
