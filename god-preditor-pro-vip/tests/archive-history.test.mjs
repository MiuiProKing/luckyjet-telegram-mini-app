import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRareArchiveSummary, analyzeRareArchive, ARCHIVE_MODEL, RARE_ARCHIVE_MODEL} from '../safari/src/archive-history.mjs';
import {HORIZON_MS as H, gammaPoissonPosterior} from '../safari/src/rare-window-model.mjs';

const BEGIN = Date.UTC(2026, 8, 24);
function history(windows, hits = new Set(), beginning = BEGIN, prefix = 'r') {
  return Array.from({length: windows * 6 + 1}, (_, i) => ({
    id: `${prefix}-${i}`, timestamp: beginning + i * 30000,
    coefficient: i > 0 && (i - 1) % 6 === 0 && hits.has(Math.floor((i - 1) / 6)) ? 100 + i / 100 : 1.4,
  }));
}
const end = rows => rows.at(-1).timestamp;
const oldHits = n => new Set(Array.from({length: n}, (_, i) => i).filter(i => i % 20 === 0));

test('archive builds every covered epoch window across segments without counting gap exposure', () => {
  const first = history(4, new Set([0, 3])), second = history(3, new Set([1]), BEGIN + 12 * H, 's');
  const rows = [...first, ...second], summary = buildRareArchiveSummary(rows, end(rows));
  assert.equal(summary.model, ARCHIVE_MODEL);
  assert.equal(summary.acceptedRoundCount, rows.length);
  assert.equal(summary.rawLargeEventCount, 3);
  assert.equal(summary.segmentCount, 2); assert.equal(summary.gapCount, 1);
  assert.equal(summary.coveredWindowCount, 7); assert.equal(summary.coveredExposureMs, 7 * H);
  assert.equal(summary.observedSegmentExposureMs, 7 * H);
  assert.equal(summary.coveredEventCount, 3);
  assert.deepEqual(summary.windows.map(window => window[0]), [0, 1, 2, 3, 12, 13, 14].map(i => BEGIN + i * H));
  assert.deepEqual(summary.largeEvents.map(row => row.timestamp), rows.filter(row => row.coefficient >= 100).map(row => row.timestamp));
  assert.ok(Object.isFrozen(summary)); assert.ok(Object.isFrozen(summary.windows));
  assert.ok(summary.windows.every(Object.isFrozen));
});

test('partial segment edges and left-boundary events are excluded from Gamma exposure windows', () => {
  const rows = history(4, new Set([0, 1, 2, 3])).slice(1, -1);
  rows[0] = {...rows[0], coefficient: 300};
  const summary = buildRareArchiveSummary(rows, end(rows));
  assert.equal(summary.rawLargeEventCount, 4);
  assert.equal(summary.coveredWindowCount, 2);
  assert.deepEqual(summary.windows.map(window => window[0]), [BEGIN + H, BEGIN + 2 * H]);
  assert.equal(summary.coveredEventCount, 2);
  assert.equal(summary.coveredExposureMs, 2 * H);
});

test('archive normalization excludes conflicts, approximate, incomplete and future records', () => {
  const rows = history(3, new Set([1])), now = end(rows);
  const conflict = {...rows[2], coefficient: 1000};
  const input = [...rows, rows[1], conflict,
    {id: 'estimated', coefficient: 500, timestamp: BEGIN + 10000, estimated: true},
    {id: 'incomplete', coefficient: 500, timestamp: BEGIN + 20000, completed: false},
    {id: 'future', coefficient: 500, timestamp: now + 1},
    {id: 'bad', coefficient: NaN, timestamp: now}];
  const summary = buildRareArchiveSummary(input, now);
  assert.equal(summary.acceptedRoundCount, rows.length - 1);
  assert.equal(summary.rawLargeEventCount, 1);
  assert.equal(summary.largeEvents[0].id, rows[7].id);
  assert.ok(summary.rejectedCount >= 6);
});

test('all earlier archive windows extend reference beyond the old 170-window cap', () => {
  const hits = oldHits(600), rows = history(600, hits), now = end(rows) + 10000;
  const summary = buildRareArchiveSummary(rows, now);
  const result = analyzeRareArchive(rows.slice(-500), summary, now);
  assert.equal(result.ready, true);
  assert.equal(result.archive.acceptedRoundCount, 3601);
  assert.equal(result.archive.coveredWindowCount, 600);
  assert.equal(result.bayesian.recent.windowCount, 30);
  assert.equal(result.bayesian.reference.windowCount, 570);
  assert.equal(result.bayesian.reference.end, result.bayesian.recent.start);
  assert.equal(result.bayesian.windowCount, 600);
  assert.equal(result.poisson.exposureMs, 600 * H);
  assert.equal(result.poisson.eventCount, hits.size);
  assert.equal(result.poisson.historyScope, 'all-covered-archive-and-live-windows');
  const expected = gammaPoissonPosterior(hits.size, 600 * H);
  assert.equal(result.poisson.probability, expected.probability);
});

test('old archive hits cannot fill the recent five-hit gate or make stale live history ready', () => {
  const hits = oldHits(570), rows = history(600, hits), now = end(rows) + 10000;
  const summary = buildRareArchiveSummary(rows, now);
  const current = rows.slice(-500), result = analyzeRareArchive(current, summary, now);
  assert.equal(result.archive.status, 'ready');
  assert.ok(result.bayesian.reference.hitWindowCount >= 5);
  assert.equal(result.bayesian.recent.hitWindowCount, 0);
  assert.equal(result.bayesian.status, 'insufficient');
  assert.equal(result.bayesian.reason, 'insufficient-hit-windows');
  assert.equal(result.candidate, null);
  assert.equal(result.poisson.status, 'ready');
  assert.equal(analyzeRareArchive(current.slice(-499), summary, now).ready, false);
  const stale = analyzeRareArchive(current, summary, now + H + 1);
  assert.equal(stale.ready, false); assert.equal(stale.candidate, null);
  assert.equal(stale.poisson.probability, null);
});

test('candidate compares current 30 windows with disjoint full archive reference and preserves compatible schema', () => {
  const hits = oldHits(570);
  for (let i = 570; i < 590; i++) hits.add(i);
  const rows = history(600, hits), now = end(rows) + 10000;
  const summary = buildRareArchiveSummary(rows, now);
  const result = analyzeRareArchive(rows.slice(-500), summary, now);
  assert.equal(result.bayesian.status, 'ready');
  assert.ok(result.bayesian.recent.interval95[0] > result.bayesian.reference.interval95[1]);
  assert.equal(result.candidate.model, RARE_ARCHIVE_MODEL);
  assert.equal(result.candidate.source, 'beta-window-frequency');
  assert.equal(result.candidate.historyModel, ARCHIVE_MODEL);
  assert.equal(result.candidate.target, 100);
  assert.equal(result.candidate.referenceWindowCount, 570);
  assert.equal(result.candidate.recentWindowCount, 30);
  assert.ok(result.candidate.start - now >= 120000);
  assert.equal(result.candidate.end - result.candidate.start, H);
  assert.equal(result.candidate.evidenceStatus, 'experimental-unvalidated');
});

test('live overlap replaces snapshot counts once and new live tail extends archive exposure once', () => {
  const rows = history(600, oldHits(600)), snapshotAt = end(rows);
  const summary = buildRareArchiveSummary(rows, snapshotAt);
  const continuation = history(3, new Set([1]), snapshotAt, 'live').slice(1);
  const recent = [...rows.slice(-500), ...continuation], now = end(recent) + 10000;
  const result = analyzeRareArchive(recent, summary, now);
  assert.equal(result.bayesian.windowCount, 603);
  assert.equal(result.poisson.exposureMs, 603 * H);
  assert.equal(result.poisson.eventCount, oldHits(600).size + 1);
  assert.equal(result.archive.conflictingWindowCount, 0);
  assert.equal(result.bayesian.reference.windowCount, 573);
});

test('a recent snapshot/live count mismatch is visible and suppresses a new Beta candidate', () => {
  const hits = oldHits(570);
  for (let i = 570; i < 590; i++) hits.add(i);
  const rows = history(600, hits), now = end(rows) + 10000;
  const summary = buildRareArchiveSummary(rows, now);
  const recent = [...rows.slice(-500), {id: 'late-live', coefficient: 350, timestamp: end(rows) - 20000}];
  const result = analyzeRareArchive(recent, summary, now);
  assert.equal(result.archive.conflictingWindowCount, 1);
  assert.equal(result.archive.recentConflictCount, 1);
  assert.equal(result.bayesian.reason, 'archive-recent-window-conflict');
  assert.equal(result.candidate, null);
  assert.equal(result.poisson.eventCount, hits.size + 1);
  assert.equal(result.poisson.exposureMs, 600 * H);
});

test('invalid or future archive summaries never produce an archive candidate', () => {
  const rows = history(100, new Set(Array.from({length: 30}, (_, i) => 70 + i))), now = end(rows) + 10000;
  const valid = buildRareArchiveSummary(rows, now);
  const variants = [null, {}, {...valid, builtAt: now + 1}, {...valid, builtAt: end(rows) - 1}, {...valid, lastAt: now + 1},
    {...valid, inputValid: false}, {...valid, threshold: 40}, {...valid, coveredEventCount: valid.coveredEventCount + 1},
    {...valid, windows: [...valid.windows, valid.windows.at(-1)], coveredWindowCount: valid.coveredWindowCount + 1, coveredExposureMs: valid.coveredExposureMs + H},
    {...valid, windows: [[valid.windows[0][0], 2, 3], ...valid.windows.slice(1)]}];
  for (const summary of variants) {
    const result = analyzeRareArchive(rows.slice(-500), summary, now);
    assert.equal(result.archive.status, 'unavailable'); assert.equal(result.candidate, null);
  }
  assert.equal(analyzeRareArchive(rows, valid, NaN).candidate, null);
  assert.equal(analyzeRareArchive(rows, valid, now - 1).archive.status, 'unavailable');
});

test('structured-cloned cached summaries retain exact analysis without mutating either input', () => {
  const rows = history(100, oldHits(100)), now = end(rows) + 10000;
  const summary = structuredClone(buildRareArchiveSummary(rows, now));
  const recent = rows.slice(-500), before = structuredClone({summary, recent});
  const result = analyzeRareArchive(recent, summary, now);
  assert.equal(result.archive.status, 'ready');
  assert.deepEqual({summary, recent}, before);
  assert.deepEqual(result.poisson.probabilityInterval95, gammaPoissonPosterior(oldHits(100).size, 100 * H).probabilityInterval95);
});

test('archive-sized reference retains all windows and matches independent SciPy Beta quantiles', () => {
  const rows = history(22850, new Set(Array.from({length: 1252}, (_, i) => i)), Date.UTC(2026, 8, 14));
  const now = end(rows) + 10000, summary = buildRareArchiveSummary(rows, now);
  const result = analyzeRareArchive(rows.slice(-2000), summary, now);
  assert.equal(summary.acceptedRoundCount, 137101);
  assert.equal(result.bayesian.reference.windowCount, 22820);
  assert.equal(result.bayesian.reference.hitWindowCount, 1252);
  // scipy.stats.beta.ppf([.025,.975],1252.5,21568.5)
  const expected = [0.05196595691564926, 0.057875254956372066];
  result.bayesian.reference.interval95.forEach((actual, i) => assert.ok(Math.abs(actual - expected[i]) < 1e-10));
  assert.equal(result.poisson.coveredWindowCount, 22850);
  assert.ok(Number.isFinite(result.poisson.probability));
});
