import test from 'node:test';
import assert from 'node:assert/strict';
import {goldenTailPercent, buildRecommendation} from '../model.mjs';

const now = Date.parse('2026-11-09T20:00:00Z');
const round = (id, coefficient, iso) => ({id, coefficient, timestamp: Date.parse(iso)});
const rows = [
  round('below-target', 15, '2026-11-08T20:01:00Z'),
  round('next-target', 40, '2026-11-08T20:03:00Z'),
  round('later-high', 100, '2026-11-08T20:10:00Z'),
  round('exact-target', 20, '2026-11-08T21:00:00Z'),
];

test('tail estimate is explicitly conditional on reaching gold; invalid targets are rejected', () => {
  assert.equal(goldenTailPercent(20), 50);
  assert.equal(goldenTailPercent(50), 20);
  assert.equal(goldenTailPercent(100), 10);
  assert.equal(goldenTailPercent(500), 2);
  for (const target of [NaN, Infinity, -1, 2, '20']) assert.equal(goldenTailPercent(target), null);
});

test('default recommendation uses 20x and the nearest actual historical event reaching that target', () => {
  const result = buildRecommendation(rows, {now});
  assert.equal(result.target, 20); assert.equal(result.modeledPct, 50);
  assert.equal(result.mark.id, 'next-target');
  assert.equal(result.mark.coefficient, 40);
  assert.equal(result.mark.timestamp, Date.parse('2026-11-08T20:03:00Z'));
  assert.equal(result.mark.nextAt, Date.parse('2026-11-09T20:03:00Z'));
});

test('theoretical estimate is kept separate from the observed session frequency', () => {
  const result = buildRecommendation(rows, {now});
  assert.equal(result.goldenCount, 4); assert.equal(result.hits, 3);
  assert.equal(result.empiricalPct, 75); assert.equal(result.modeledPct, 50);
});

test('model target follows a higher card filter without changing the golden population denominator', () => {
  const result = buildRecommendation(rows, {now, filterThreshold: 50});
  assert.equal(result.target, 50); assert.equal(result.modeledPct, 20);
  assert.equal(result.goldenCount, 4); assert.equal(result.hits, 1);
  assert.equal(result.mark.id, 'later-high');
});

test('outside-session, future, duplicate and unconfirmed rounds cannot enter recommendation', () => {
  const result = buildRecommendation([...rows, rows[0],
    round('old', 500, '2026-11-07T20:00:01Z'),
    round('after-session', 100, '2026-11-09T09:00:00Z'),
    round('future', 200, '2026-11-10T20:00:00Z'),
    {...rows[0], id:'estimated', estimated:true},
    {...rows[0], id:'incomplete', completed:false},
    round('not-gold', 2, '2026-11-08T19:00:00Z'),
  ], {now});
  assert.equal(result.goldenCount, 4); assert.equal(result.mark.id, 'next-target');
});

test('missing history or missing target events never fabricate a recommendation time', () => {
  const empty = buildRecommendation([], {now});
  assert.equal(empty.status, 'no-data'); assert.equal(empty.mark, null); assert.equal(empty.empiricalPct, null);
  const noTarget = buildRecommendation(rows, {now, filterThreshold: 500});
  assert.equal(noTarget.status, 'no-time'); assert.equal(noTarget.mark, null); assert.equal(noTarget.hits, 0);
  assert.equal(noTarget.modeledPct, 2);
});
