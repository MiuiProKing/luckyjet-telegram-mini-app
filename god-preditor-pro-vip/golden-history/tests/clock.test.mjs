import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEvent, buildTimeline, createClockProjection, zonedParts, formatCountdown, formatOccurrenceDay, previousMorningWindow} from '../clock.mjs';

const event = (id, coefficient, iso) => prepareEvent({id, coefficient, timestamp: Date.parse(iso)});

test('19:46 Kyiv: historical 19:50 precedes 20:01; coefficients remain exact', () => {
  const now = Date.parse('2026-11-09T17:46:00Z');
  const result = buildTimeline([
    event('later', 1670, '2026-11-08T18:01:00Z'),
    event('near', 10, '2026-11-08T17:50:00Z'),
    event('passed', 70, '2026-11-08T17:40:00Z'),
  ], {now});
  assert.deepEqual(result.cards.map(x => x.id), ['near', 'later', 'passed']);
  assert.deepEqual(result.cards.map(x => x.coefficient), [10, 1670, 70]);
  assert.equal(result.cards[0].nextAt, Date.parse('2026-11-09T17:50:00Z'));
  assert.equal(result.cards[2].nextAt, Date.parse('2026-11-10T17:40:00Z'));
});

test('midnight uses the next Kyiv calendar date, independently of machine timezone', () => {
  const now = Date.parse('2026-11-09T21:58:00Z');
  const result = buildTimeline([
    event('midnight', 23, '2026-11-08T22:01:00Z'),
    event('tonight', 11, '2026-11-08T21:59:00Z'),
  ], {now});
  assert.deepEqual(result.cards.map(x => x.id), ['tonight', 'midnight']);
  assert.equal(result.cards[1].nextAt, Date.parse('2026-11-09T22:01:00Z'));
  assert.equal(zonedParts(result.cards[1].nextAt).date, '2026-11-10');
});

test('spring DST: missing 03:30 is skipped until the next valid day', () => {
  const now = Date.parse('2026-03-29T00:45:00Z');
  const project = createClockProjection(now);
  assert.equal(project(3 * 3600 + 30 * 60), Date.parse('2026-03-30T00:30:00Z'));
  assert.equal(project(4 * 3600), Date.parse('2026-03-29T01:00:00Z'));
});

test('autumn DST: a night event within the session can recur in the repeated hour', () => {
  const now = Date.parse('2026-10-25T00:40:00Z');
  const result = buildTimeline([
    event('repeated', 120, '2026-10-25T00:20:00Z'),
    event('outside-session', 17, '2026-10-24T00:50:00Z'),
  ], {now});
  assert.deepEqual(result.cards.map(x => x.id), ['repeated']);
  assert.equal(result.cards[0].nextAt, Date.parse('2026-10-25T01:20:00Z'));
  assert.equal(createClockProjection(now)(3 * 3600 + 50 * 60), Date.parse('2026-10-25T00:50:00Z'));
});

test('a passed clock mark missing tomorrow during DST uses the actual day-after-tomorrow date label', () => {
  const now = Date.parse('2026-03-28T02:00:00Z'); // 04:00 Kyiv
  const nextAt = createClockProjection(now)(3 * 3600 + 30 * 60);
  assert.equal(nextAt, Date.parse('2026-03-30T00:30:00Z'));
  assert.equal(formatOccurrenceDay(nextAt, now), '30.03.2026');
  assert.equal(formatOccurrenceDay(Date.parse('2026-03-28T02:01:00Z'), now), 'СЕГОДНЯ');
  assert.equal(formatOccurrenceDay(Date.parse('2026-03-29T01:01:00Z'), now), 'ЗАВТРА');
});

test('outside-session days, future events, duplicate IDs and values below the threshold are excluded', () => {
  const now = Date.parse('2026-11-09T17:46:00Z');
  const older = event('older', 100, '2026-11-08T18:01:00Z');
  const result = buildTimeline([
    older, older,
    event('after-session', 999, '2026-11-09T10:00:00Z'),
    event('future', 100, '2026-11-10T18:00:00Z'),
    event('small', 10, '2026-11-08T17:50:00Z'),
    event('old', 999, '2026-10-01T17:49:00Z'),
  ], {now, threshold: 50});
  assert.equal(result.total, 1);
  assert.equal(result.cards[0].id, 'older');
});

test('equal clock seconds prefer the latest original timestamp within the same session', () => {
  const now = Date.parse('2026-11-09T17:46:00Z');
  const result = buildTimeline([
    event('old', 999, '2026-11-08T17:50:00.100Z'),
    event('recent', 10, '2026-11-08T17:50:00.900Z'),
  ], {now, limit: 1});
  assert.equal(result.total, 2);
  assert.equal(result.cards[0].id, 'recent');
});

test('November 9 selects exactly November 8 at 08:00 through November 9 at 08:00 Kyiv', () => {
  const now = Date.parse('2026-11-09T17:46:00Z');
  const window = previousMorningWindow(now);
  assert.equal(window.start, Date.parse('2026-11-08T06:00:00Z'));
  assert.equal(window.end, Date.parse('2026-11-09T06:00:00Z'));
  const result = buildTimeline([
    event('before', 40, '2026-11-08T05:59:59.999Z'),
    event('start', 10, '2026-11-08T06:00:00Z'),
    event('night-01', 100, '2026-11-08T23:00:00Z'),
    event('night-05', 500, '2026-11-09T03:00:00Z'),
    event('last', 30, '2026-11-09T05:59:59.999Z'),
    event('end', 999, '2026-11-09T06:00:00Z'),
    event('last-month', 1000, '2026-10-08T18:00:00Z'),
  ], {now});
  assert.equal(result.total, 4);
  assert.deepEqual(new Set(result.cards.map(x => x.id)), new Set(['start','night-01','night-05','last']));
});

test('before 08:00 the same yesterday-to-today session includes only night events already observed', () => {
  const now = Date.parse('2026-11-09T02:00:00Z'); // 04:00 Kyiv
  const window = previousMorningWindow(now);
  assert.equal(window.ongoing, true);
  const result = buildTimeline([
    event('past-night', 100, '2026-11-09T01:00:00Z'),
    event('future-night', 500, '2026-11-09T03:00:00Z'),
  ], {now});
  assert.deepEqual(result.cards.map(x => x.id), ['past-night']);
});

test('08-to-08 sessions follow calendar days across 23-hour and 25-hour DST days', () => {
  const spring = previousMorningWindow(Date.parse('2026-03-29T10:00:00Z'));
  const autumn = previousMorningWindow(Date.parse('2026-10-25T10:00:00Z'));
  assert.equal(spring.end - spring.start, 23 * 3600000);
  assert.equal(autumn.end - autumn.start, 25 * 3600000);
  const next = previousMorningWindow(Date.parse('2026-11-09T22:01:00Z')); // November 10 Kyiv
  assert.equal(next.startDate, '2026-11-09');
  assert.equal(next.endDate, '2026-11-10');
});

test('the moment a clock mark passes, that event rotates to tomorrow', () => {
  const rows = [event('mark', 20, '2026-11-08T17:50:00Z')];
  assert.equal(buildTimeline(rows, {now: Date.parse('2026-11-09T17:50:00Z')}).cards[0].nextAt, Date.parse('2026-11-09T17:50:00Z'));
  assert.equal(buildTimeline(rows, {now: Date.parse('2026-11-09T17:50:00.001Z')}).cards[0].nextAt, Date.parse('2026-11-10T17:50:00Z'));
  assert.equal(formatCountdown(3000, 1), '00:03');
  assert.equal(formatCountdown(0, 1000), '00:00');
});
