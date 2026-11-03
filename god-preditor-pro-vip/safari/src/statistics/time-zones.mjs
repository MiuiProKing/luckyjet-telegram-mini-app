import {localClock, TIME_TARGETS, TIME_RADII} from './time-models.mjs';
import {chronologicalFolds, localDay, futureRoundOutcome, createValidationAccumulator, recordObservation,
  summarizeValidation, forecastKey} from './validation.mjs';

const DAY = 86400;
const CENTER_STEP_SECONDS = 60;
export const TIME_ZONE_PROTOCOL = 'fixed-clock-development-frozen-confirmation-v1';
const DEFAULTS = Object.freeze({minDays: 14, minKnown: 200, minEvents: 20, minEventDays: 5,
  minDevelopmentKnown: 200, minDevelopmentEvents: 20, minDevelopmentDays: 5,
  minDevelopmentEventDays: 5, minPositiveDayFraction: .7, bootstrapSamples: 8192});
const defaultYield = () => new Promise(resolve => setTimeout(resolve, 0));
const posterior = (hits, n) => (hits + .5) / (n + 1);
export const circularClockDistance = (a, b) => {
  const distance = Math.abs(((a - b) % DAY + DAY) % DAY);
  return Math.min(distance, DAY - distance);
};
const contains = (zone, second) => circularClockDistance(zone.centerSecond, second) <= zone.radiusSeconds;
const counters = () => ({rounds: 0, hits: 0, exposures: 0, unknown: 0});
const add = (count, observation, target) => {
  count.exposures++;
  if (observation.status !== 'known') {count.unknown++; return;}
  count.rounds++; count.hits += Number(observation.coefficient >= target);
};

/** Wilson intervals are descriptive binomial intervals; loss inference resamples whole days. */
function interval95(hits, n) {
  if (!n) return null;
  const z = 1.959963984540054, z2 = z * z, p = hits / n, denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function countPair(zone, observations) {
  const inside = counters(), outside = counters();
  for (const observation of observations) add(contains(zone, observation.second) ? inside : outside, observation, zone.target);
  return {inside, outside};
}
function mergeCount(to, from) {for (const key of ['rounds', 'hits', 'exposures', 'unknown']) to[key] += from[key];}
const zoneId = (center, radius) => `clock-zone-${center}-${radius}-v1`;

/**
 * The fixed grid is selected using DEV only. Every selected rule, including
 * unsupported confirmation rules, remains in the confirmation Holm family.
 * Test-only thresholds may be supplied explicitly; the production defaults
 * require 14 separate confirmation dates and never qualify from training hits.
 */
export async function validateTimeZones(input, {protocol = null, now = Date.now(), timeZone = 'Europe/Kyiv',
  targets = TIME_TARGETS, alpha = .05 / 3, yieldTask = defaultYield, onProgress = () => {},
  validationOptions = {}, bootstrapSamples = validationOptions.bootstrapSamples ?? DEFAULTS.bootstrapSamples} = {}) {
  const thresholds = {...DEFAULTS, ...validationOptions, bootstrapSamples};
  const requestedTargets = [...new Set(targets)].filter(target => TIME_TARGETS.includes(target));
  const rows = (Array.isArray(input) ? input : []).filter(row => Number.isSafeInteger(row?.timestamp) &&
    row.timestamp >= 946684800000 && row.timestamp <= now && Number.isFinite(row.coefficient) && row.coefficient >= 1)
    .slice().sort((a, b) => a.timestamp - b.timestamp);
  const suppliedProtocol = protocol || chronologicalFolds(rows, {now, timeZone});
  const today = localDay(now, timeZone), dayGroups = new Map();
  // The origin is a completed round known when the prediction is issued. A
  // future completion's clock is never used as the predictor. Day-edge pairs
  // are unknown, so all training labels are available before the next fold.
  for (let index = 0; index < rows.length; index++) {
    const clock = localClock(rows[index].timestamp, timeZone);
    if (!clock || clock.date >= today) continue;
    const outcome = futureRoundOutcome(rows, index, 1, 10);
    const crossesDay = outcome.status === 'known' && localDay(outcome.endAt, timeZone) !== clock.date;
    const observation = {timestamp: rows[index].timestamp, second: clock.second,
      status: crossesDay ? 'unknown' : outcome.status,
      reason: crossesDay ? 'right-edge-or-next-day' : outcome.reason,
      coefficient: outcome.status === 'known' && !crossesDay ? rows[index + 1].coefficient : null};
    if (!dayGroups.has(clock.date)) dayGroups.set(clock.date, []);
    dayGroups.get(clock.date).push(observation);
    if (index % 4096 === 4095) await yieldTask();
  }
  const folds = suppliedProtocol.folds.filter(fold => fold.day < today && dayGroups.has(fold.day));
  const developmentDays = new Set(folds.filter(fold => fold.stage === 'development').map(fold => fold.day));
  const confirmationDays = new Set(folds.filter(fold => fold.stage === 'confirmation').map(fold => fold.day));
  if ([...developmentDays].some(day => confirmationDays.has(day)) ||
    (developmentDays.size && confirmationDays.size && [...developmentDays].sort().at(-1) >= [...confirmationDays].sort()[0]))
    throw new RangeError('Time-zone protocol requires disjoint chronological development and confirmation dates');
  const developmentTotals = new Map(requestedTargets.map(target => [target, counters()]));
  const grid = new Map();
  // Direct neighborhood updates touch at most five fixed centers per radius,
  // rather than scanning the complete grid for every observation.
  for (const day of developmentDays) {
    for (const observation of dayGroups.get(day)) {
      for (const target of requestedTargets) add(developmentTotals.get(target), observation, target);
      for (const radius of TIME_RADII) {
        for (let gridIndex = Math.ceil((observation.second - radius) / CENTER_STEP_SECONDS);
          gridIndex <= Math.floor((observation.second + radius) / CENTER_STEP_SECONDS); gridIndex++) {
        const center = ((gridIndex * CENTER_STEP_SECONDS) % DAY + DAY) % DAY;
        for (const target of requestedTargets) {
          const key = `${target}:${radius}:${center}`;
          if (!grid.has(key)) grid.set(key, {target, centerSecond: center, radiusSeconds: radius,
            inside: counters(), days: new Set(), eventDays: new Set()});
          const value = grid.get(key); add(value.inside, observation, target);
          if (observation.status === 'known') {
            value.days.add(day);
            if (observation.coefficient >= target) value.eventDays.add(day);
          }
        }
        }
      }
    }
    onProgress({stage: 'time-zone-development', day}); await yieldTask();
  }
  const frozen = [];
  for (const target of requestedTargets) for (const radius of TIME_RADII) {
    const ranked = [...grid.values()].filter(zone => zone.target === target && zone.radiusSeconds === radius)
      .map(zone => {
        const total = developmentTotals.get(target), outsideRounds = total.rounds - zone.inside.rounds;
        const outsideHits = total.hits - zone.inside.hits;
        return {...zone, outsideRounds, outsideHits,
          lift: posterior(zone.inside.hits, zone.inside.rounds) - posterior(outsideHits, outsideRounds)};
      }).filter(zone => zone.lift > 0 && zone.inside.rounds >= thresholds.minDevelopmentKnown &&
        zone.inside.hits >= thresholds.minDevelopmentEvents && zone.outsideRounds >= thresholds.minDevelopmentKnown &&
        zone.days.size >= thresholds.minDevelopmentDays && zone.eventDays.size >= thresholds.minDevelopmentEventDays)
      .sort((a, b) => b.lift - a.lift || a.centerSecond - b.centerSecond);
    const selected = [];
    for (const zone of ranked) {
      if (selected.some(other => circularClockDistance(zone.centerSecond, other.centerSecond) <= 2 * radius)) continue;
      selected.push(zone);
      if (selected.length === 3) break;
    }
    for (const zone of selected) {
      const modelId = zoneId(zone.centerSecond, zone.radiusSeconds);
      frozen.push({target, centerSecond: zone.centerSecond, radiusSeconds: radius, timeZone, modelId,
        validationKey: forecastKey({modelId, target, horizon: 1}),
        development: {insideRounds: zone.inside.rounds, insideHits: zone.inside.hits,
          outsideRounds: zone.outsideRounds, outsideHits: zone.outsideHits, dayCount: zone.days.size,
          eventDays: zone.eventDays.size, smoothedLift: zone.lift}});
    }
  }
  const accumulator = createValidationAccumulator();
  const state = frozen.map(zone => ({zone, trainingInside: counters(), trainingOutside: counters(),
    inside: counters(), outside: counters(), days: [], dailyForecasts: [], eventDays: 0, insideDays: 0}));
  const positiveProtocol = suppliedProtocol.qualificationPossible === true &&
    developmentDays.size >= thresholds.minDevelopmentDays && confirmationDays.size >= thresholds.minDays;
  // Counts advance after scoring the whole day. Earlier confirmation dates may
  // inform later daily probability estimates, but cannot change the frozen grid.
  for (const [day, observations] of [...dayGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const confirmation = confirmationDays.has(day);
    for (const value of state) {
      const {zone, trainingInside, trainingOutside} = value;
      const pair = countPair(zone, observations);
      if (confirmation) {
        const globalRounds = trainingInside.rounds + trainingOutside.rounds;
        const globalHits = trainingInside.hits + trainingOutside.hits;
        const baseline = posterior(globalHits, globalRounds);
        const insideProbability = posterior(trainingInside.hits, trainingInside.rounds);
        const outsideProbability = posterior(trainingOutside.hits, trainingOutside.rounds);
        const trainingDays = [...dayGroups.keys()].filter(prior => prior < day).length;
        const ready = trainingDays >= (suppliedProtocol.minTrainDays ?? 14) && globalRounds >= (suppliedProtocol.minTrainRounds ?? 2000);
        value.dailyForecasts.push({day, probability: insideProbability, outsideProbability, baseline,
          trainingInsideRounds: trainingInside.rounds, trainingInsideHits: trainingInside.hits,
          trainingOutsideRounds: trainingOutside.rounds, trainingOutsideHits: trainingOutside.hits,
          trainingDays, trainingCutoff: dayGroups.get([...dayGroups.keys()].filter(prior => prior < day).at(-1))?.at(-1)?.timestamp ?? null});
        for (const observation of observations) {
          const inside = contains(zone, observation.second);
          // Outside-zone predictions equal baseline: paired loss improvement
          // comes only from predictions actually issued inside the frozen zone.
          recordObservation(accumulator, {...zone, family: 'time-zone', horizon: 1,
            probability: inside ? insideProbability : baseline, status: ready ? 'ready' : 'insufficient'},
          {day, baseline, outcome: observation.status === 'known'
            ? {status: 'known', hit: observation.coefficient >= zone.target}
            : {status: 'unknown', reason: observation.reason}});
        }
        mergeCount(value.inside, pair.inside); mergeCount(value.outside, pair.outside);
        value.insideDays += Number(pair.inside.rounds > 0); value.eventDays += Number(pair.inside.hits > 0);
        value.days.push({day, insideRounds: pair.inside.rounds, insideHits: pair.inside.hits,
          insideExposures: pair.inside.exposures, insideUnknown: pair.inside.unknown,
          outsideRounds: pair.outside.rounds, outsideHits: pair.outside.hits,
          outsideExposures: pair.outside.exposures, outsideUnknown: pair.outside.unknown});
      }
      mergeCount(trainingInside, pair.inside); mergeCount(trainingOutside, pair.outside);
    }
    if (confirmation) onProgress({stage: 'time-zone-confirmation', day, candidates: frozen.length});
    await yieldTask();
  }
  const reports = summarizeValidation(accumulator, {minDays: thresholds.minDays, minKnown: thresholds.minKnown,
    minEvents: thresholds.minEvents, alpha, bootstrapSamples, allowQualification: positiveProtocol});
  const byKey = new Map(reports.map(report => [report.key, report]));
  const candidates = state.map(value => {
    const report = byKey.get(value.zone.validationKey);
    const insideInterval95 = interval95(value.inside.hits, value.inside.rounds);
    const outsideInterval95 = interval95(value.outside.hits, value.outside.rounds);
    const enough = value.inside.rounds >= thresholds.minKnown && value.inside.hits >= thresholds.minEvents &&
      value.inside.rounds - value.inside.hits >= thresholds.minEvents && value.insideDays >= thresholds.minDays &&
      value.eventDays >= thresholds.minEventDays && value.outside.rounds >= thresholds.minKnown;
    const separated = insideInterval95?.[0] > outsideInterval95?.[1];
    const positiveDays = report?.days.filter(day => day.baselineBrier - day.brier > 0 && day.baselineLogLoss - day.logLoss > 0).length || 0;
    const stable = positiveDays >= Math.ceil(confirmationDays.size * thresholds.minPositiveDayFraction);
    const qualified = !!(positiveProtocol && enough && separated && stable && report?.qualified);
    return {...value.zone, horizon: 1, insideRounds: value.inside.rounds, insideHits: value.inside.hits,
      outsideRounds: value.outside.rounds, outsideHits: value.outside.hits,
      insideExposures: value.inside.exposures, outsideExposures: value.outside.exposures,
      insideUnknown: value.inside.unknown, outsideUnknown: value.outside.unknown,
      confirmationDays: confirmationDays.size, insideDays: value.insideDays, eventDays: value.eventDays,
      insideInterval95, outsideInterval95, positiveGainDays: positiveDays, dailyForecasts: value.dailyForecasts,
      dailyExposure: value.days, validation: report || null, qualified,
      reason: qualified ? 'supported-frozen-heldout-clock-zone' : !positiveProtocol ? 'insufficient-separate-validation-days' :
        !enough ? 'insufficient-confirmation-zone-support' : !separated ? 'heldout-event-intervals-overlap' :
          !stable ? 'unstable-heldout-day-gains' : report?.reason || 'no-confirmation-observations'};
  });
  return {modelId: TIME_ZONE_PROTOCOL, protocol: {...suppliedProtocol, timeZone,
    centerGridSeconds: CENTER_STEP_SECONDS, radiusSeconds: [...TIME_RADII]}, timeZone, generatedAt: now,
    targets: requestedTargets, candidates, qualifiedZones: candidates.filter(zone => zone.qualified),
    frozenCandidates: frozen.map(zone => ({...zone, development: {...zone.development}})), thresholds,
    grid: {centerStepSeconds: CENTER_STEP_SECONDS, radiusSeconds: [...TIME_RADII], centersPerTargetRadius: 3, nonOverlapping: true,
      maxCandidates: requestedTargets.length * TIME_RADII.length * 3},
    multipleTesting: {method: 'Holm within frozen candidates; Bonferroni suite-family allocation', hypotheses: frozen.length, alpha},
    selectionRule: 'DEV positive Jeffreys-smoothed inside-minus-outside frequency lift; at most three nonoverlapping centers per target/radius; no CONF selection',
    decisionTime: 'previous completed round timestamp; next-one-round outcome; cross-day, gap and tied pairs unknown',
    lossDenominator: 'all known decision origins per heldout day; outside-zone predictions equal training-global baseline',
    intervalMethod: 'descriptive Wilson 95% binomial event intervals; whole-day paired bootstrap/sign-flip loss validation',
    limitations: ['Clock association is not a payout or profitability guarantee.',
      'Binomial event intervals do not model dependence between rounds; day-block loss inference is approximate.',
      'Timestamp replay assumes the completed round was available immediately.']};
}

/** Pure filtering: the ledger is never updated or reselected by the current clock. */
export function currentQualifiedZones(ledger, now = Date.now()) {
  if (!ledger || !Number.isSafeInteger(now)) return [];
  const zones = Array.isArray(ledger.qualifiedZones) ? ledger.qualifiedZones : ledger.candidates || [];
  return zones.filter(zone => zone.qualified === true && Number.isFinite(zone.centerSecond) &&
    Number.isFinite(zone.radiusSeconds) && zone.radiusSeconds >= 0 && zone.radiusSeconds <= 120 &&
    (() => {const clock = localClock(now, zone.timeZone || ledger.timeZone || 'Europe/Kyiv');
      return clock !== null && contains(zone, clock.second);})());
}
