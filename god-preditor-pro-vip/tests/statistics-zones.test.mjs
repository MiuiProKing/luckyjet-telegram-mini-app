import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateTimeZones, currentQualifiedZones, circularClockDistance} from '../safari/src/statistics/time-zones.mjs';
import {chronologicalFolds} from '../safari/src/statistics/validation.mjs';
import {localClock} from '../safari/src/statistics/time-models.mjs';

const ORIGIN = Date.UTC(2026, 7, 1);
const DAY = 86400000;
const noYield = async () => {};
// 14 initial TRAIN dates, five DEV dates, then fourteen untouched CONF dates.
// Coefficients belong to the NEXT completed round, so the relation is explicitly
// with the known decision clock rather than that future completion's clock.
function fixture({nullEffect = false, count = 33} = {}) {
  const result = [];
  for (let day = 0; day < count; day++) {
    for (let index = 0; index < 60; index++) result.push({id: `${day}-inside-${index}`,
      timestamp: ORIGIN + day * DAY + 9 * 3600000 - 15000 + index * 500, coefficient: 1.1,
      hit: nullEffect ? index % 5 === 0 : index % 5 !== 0});
    for (let index = 0; index < 120; index++) result.push({id: `${day}-outside-${index}`,
      timestamp: ORIGIN + day * DAY + 14 * 3600000 + index * 500, coefficient: 1.1,
      hit: nullEffect ? index % 5 === 0 : index % 20 === 0});
  }
  for (let index = 1; index < result.length; index++) result[index].coefficient = result[index - 1].hit ? 15 : 1.1;
  return result.map(({hit, ...row}) => row);
}
const options = (history, extra = {}) => ({now: ORIGIN + 33 * DAY, targets: [10],
  bootstrapSamples: 128, yieldTask: noYield, ...extra});

test('stable frozen zone qualifies on separate dates using all-round daily exposure', async () => {
  const history = fixture(), before = JSON.stringify(history);
  const ledger = await validateTimeZones(history, options(history));
  assert.equal(JSON.stringify(history), before);
  assert.equal(ledger.protocol.developmentDays, 5);
  assert.equal(ledger.protocol.confirmationDays, 14);
  assert.equal(ledger.grid.centerStepSeconds, 60);
  assert.ok(ledger.qualifiedZones.length >= 1);
  assert.ok(ledger.candidates.length <= 9);
  for (const zone of ledger.qualifiedZones) {
    assert.equal(zone.confirmationDays, 14); assert.equal(zone.insideDays, 14);
    assert.equal(zone.eventDays, 14); assert.ok(zone.insideRounds >= 200); assert.ok(zone.insideHits >= 20);
    assert.ok(zone.insideInterval95[0] > zone.outsideInterval95[1]);
    assert.ok(zone.validation.brierGain > 0 && zone.validation.logLossGain > 0);
    assert.ok(zone.validation.adjustedP < .05 / 3);
    assert.equal(zone.validation.known, zone.insideRounds + zone.outsideRounds);
    assert.equal(zone.validation.issued, zone.insideExposures + zone.outsideExposures);
    assert.equal(zone.validation.unknown, zone.insideUnknown + zone.outsideUnknown);
    assert.ok(zone.insideUnknown + zone.outsideUnknown >= 28);
    assert.equal(zone.validation.multipleTesting.hypotheses, ledger.candidates.length);
    assert.ok(zone.dailyForecasts.every(day => day.trainingDays >= 14 &&
      day.trainingCutoff < history.find(row => localClock(row.timestamp).date === day.day).timestamp));
  }
  for (const radius of [30, 60, 120]) {
    const siblings = ledger.candidates.filter(zone => zone.radiusSeconds === radius);
    assert.ok(siblings.length <= 3);
    for (let i = 0; i < siblings.length; i++) for (let j = i + 1; j < siblings.length; j++)
      assert.ok(circularClockDistance(siblings[i].centerSecond, siblings[j].centerSecond) > 2 * radius);
  }
});

test('frequency-matched null data and short confirmation cannot qualify', async () => {
  const nullHistory = fixture({nullEffect: true});
  const nullLedger = await validateTimeZones(nullHistory, options(nullHistory));
  assert.deepEqual(nullLedger.qualifiedZones, []);
  const short = fixture({count: 25});
  const shortLedger = await validateTimeZones(short, options(short, {now: ORIGIN + 25 * DAY}));
  assert.deepEqual(shortLedger.qualifiedZones, []);
  assert.equal(shortLedger.protocol.qualificationPossible, false);
  assert.ok(shortLedger.candidates.every(zone => !zone.qualified));
});

test('CONF labels never select centers or enter the first CONF day probabilities', async () => {
  const history = fixture(), protocol = chronologicalFolds(history, options(history));
  const firstConfirmation = protocol.folds.find(fold => fold.stage === 'confirmation');
  const changed = history.map(row => row.timestamp >= history[firstConfirmation.from].timestamp
    ? {...row, coefficient: 1.01, timestamp: row.timestamp + 1000} : {...row});
  const before = await validateTimeZones(history, options(history, {protocol}));
  const after = await validateTimeZones(changed, options(changed, {protocol}));
  assert.deepEqual(after.frozenCandidates, before.frozenCandidates);
  assert.ok(before.candidates.length > 0);
  for (let index = 0; index < before.candidates.length; index++)
    assert.deepEqual(after.candidates[index].dailyForecasts[0], before.candidates[index].dailyForecasts[0]);
  assert.deepEqual(after.qualifiedZones, []);
});

test('supplied protocols cannot overlap or place DEV dates after CONF dates', async () => {
  const history = fixture(), protocol = chronologicalFolds(history, options(history));
  const confirmation = protocol.folds.find(fold => fold.stage === 'confirmation');
  const overlap = {...protocol, folds: [...protocol.folds, {...confirmation, stage: 'development'}]};
  await assert.rejects(validateTimeZones(history, options(history, {protocol: overlap})), /disjoint chronological/);
  const reversed = {...protocol, folds: protocol.folds.map(fold => ({...fold,
    stage: fold.day === confirmation.day ? 'development' : fold.stage === 'development' ? 'confirmation' : fold.stage}))};
  await assert.rejects(validateTimeZones(history, options(history, {protocol: reversed})), /disjoint chronological/);
});

test('unknown gap/tied outcomes remain exposures instead of becoming misses', async () => {
  const history = fixture(), protocol = chronologicalFolds(history, options(history));
  const first = protocol.folds.find(fold => fold.stage === 'confirmation').from;
  const changed = structuredClone(history);
  changed[first + 10].timestamp = changed[first + 9].timestamp;
  const ledger = await validateTimeZones(changed, options(changed, {protocol}));
  const zone = ledger.candidates.find(value => value.radiusSeconds === 30);
  assert.ok(zone); assert.ok(zone.insideUnknown >= 3);
  assert.equal(zone.insideExposures, 60 * 14);
  assert.equal(zone.insideRounds + zone.insideUnknown, zone.insideExposures);
  assert.equal(zone.outsideRounds + zone.outsideUnknown, zone.outsideExposures);
  assert.ok(zone.validation.unknownReasons['ambiguous-origin-time'] >= 2);
  assert.ok(zone.validation.unknownReasons['ambiguous-target-time'] >= 1);
  assert.ok(zone.validation.unknownReasons['coverage-gap'] >= 14);
});

test('zone membership uses the decision origin even when its next completion is inside', async () => {
  const history = fixture(), protocol = chronologicalFolds(history, options(history));
  const first = protocol.folds.find(fold => fold.stage === 'confirmation').from;
  const changed = structuredClone(history);
  // First completion was at 11:59:45 Kyiv. Move only that known origin outside
  // the ±30s window; its next completion stays inside and the pair stays known.
  changed[first].timestamp -= 16000;
  const before = await validateTimeZones(history, options(history, {protocol}));
  const after = await validateTimeZones(changed, options(changed, {protocol}));
  const oldZone = before.candidates.find(zone => zone.radiusSeconds === 30 && zone.centerSecond === 43200);
  const newZone = after.candidates.find(zone => zone.validationKey === oldZone.validationKey);
  assert.equal(newZone.insideExposures, oldZone.insideExposures - 1);
  assert.equal(newZone.insideRounds, oldZone.insideRounds - 1);
  assert.equal(newZone.outsideRounds, oldZone.outsideRounds + 1);
  assert.deepEqual(after.frozenCandidates, before.frozenCandidates);
  assert.deepEqual(newZone.dailyForecasts[0], oldZone.dailyForecasts[0]);
});

test('strict support requires inside rounds, event days and independent confirmation, not training counts', async () => {
  const history = fixture();
  const ledger = await validateTimeZones(history, options(history, {validationOptions: {minKnown: 100000}}));
  assert.ok(ledger.candidates.length > 0); assert.deepEqual(ledger.qualifiedZones, []);
  assert.ok(ledger.candidates.every(zone => zone.reason === 'insufficient-confirmation-zone-support'));
  const eventDays = await validateTimeZones(history, options(history, {validationOptions: {minEventDays: 15}}));
  assert.deepEqual(eventDays.qualifiedZones, []);
});

test('current clock filtering is circular, second-precise, pure and follows Kyiv DST', () => {
  const zone = {target: 10, centerSecond: 0, radiusSeconds: 30, timeZone: 'Europe/Kyiv', qualified: true};
  const ledger = {qualifiedZones: [zone, {...zone, qualified: false}]};
  const before = JSON.stringify(ledger);
  assert.equal(currentQualifiedZones(ledger, Date.UTC(2026, 7, 1, 20, 59, 30)).length, 1);
  assert.equal(currentQualifiedZones(ledger, Date.UTC(2026, 7, 1, 20, 59, 29)).length, 0);
  assert.equal(currentQualifiedZones(ledger, Date.UTC(2026, 7, 1, 21, 0, 30)).length, 1);
  assert.equal(currentQualifiedZones(ledger, Date.UTC(2026, 7, 1, 21, 0, 31)).length, 0);
  const repeated = {qualifiedZones: [{...zone, centerSecond: 3 * 3600 + 30 * 60}]};
  assert.equal(currentQualifiedZones(repeated, Date.UTC(2026, 9, 25, 0, 30)).length, 1);
  assert.equal(currentQualifiedZones(repeated, Date.UTC(2026, 9, 25, 1, 30)).length, 1);
  assert.equal(JSON.stringify(ledger), before);
  assert.equal(circularClockDistance(86399, 1), 2);
  assert.deepEqual(currentQualifiedZones(ledger, NaN), []);
});

test('future and current partial-date rows do not enter selection or confirmation', async () => {
  const history = fixture(), now = ORIGIN + 33 * DAY;
  const before = await validateTimeZones(history, options(history));
  const extra = history.concat([{id: 'partial', timestamp: now + 1000, coefficient: 100},
    {id: 'future', timestamp: now + DAY, coefficient: 100}]);
  const after = await validateTimeZones(extra, options(extra));
  assert.deepEqual(after, before);
});
