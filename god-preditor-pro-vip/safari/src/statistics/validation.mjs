// Daily, chronological validation utilities. These contain no model selection
// based on future observations and never send actions to a betting controller.
export const GAP_MS = 180000;
export const VALIDATION_PROTOCOL = 'daily-development-then-frozen-confirmation-v1';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const probability = value => finite(value) && value >= 0 && value <= 1;
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const clipped = value => Math.max(1e-12, Math.min(1 - 1e-12, value));
const dayFormatters = new Map();
export const forecastKey = value => `${value.modelId}:${value.target}:${value.horizon}`;

export function localDay(timestamp, timeZone = 'Europe/Kyiv') {
  if (!dayFormatters.has(timeZone)) dayFormatters.set(timeZone, new Intl.DateTimeFormat('en-US', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}));
  const parts = dayFormatters.get(timeZone).formatToParts(timestamp);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/** The current, incomplete local date is excluded from validation. */
export function chronologicalFolds(rows, {now = Date.now(), timeZone = 'Europe/Kyiv', minTrainDays = 14,
  minTrainRounds = 2000, confirmationDays = 14, minDevelopmentDays = 5} = {}) {
  const today = localDay(now, timeZone), groups = new Map();
  for (let index = 0; index < rows.length; index++) {
    const day = localDay(rows[index].timestamp, timeZone);
    if (day >= today) continue;
    let group = groups.get(day);
    if (!group) {group = {day, from: index, to: index + 1, count: 0}; groups.set(day, group);}
    group.to = index + 1; group.count++;
  }
  const days = [...groups.values()].sort((a, b) => a.day.localeCompare(b.day));
  const eligible = days.filter((day, index) => index >= minTrainDays && day.from >= minTrainRounds && day.count >= 30);
  const count = eligible.length >= confirmationDays + minDevelopmentDays ? confirmationDays : Math.min(7, eligible.length);
  const split = eligible.length - count;
  const folds = eligible.map((day, index) => ({...day, stage: index < split ? 'development' : 'confirmation',
    trainingDays: days.filter(prior => prior.day < day.day).length, trainingCutoff: rows[day.from - 1]?.timestamp ?? null}));
  return {protocol: VALIDATION_PROTOCOL, timeZone, today, minTrainDays, minTrainRounds,
    requestedConfirmationDays: confirmationDays, confirmationDays: count, minDevelopmentDays,
    qualificationPossible: count >= confirmationDays && split >= minDevelopmentDays,
    availableCompleteDays: days.length, developmentDays: split, folds};
}

/** Outcome is read only after a forecast has been issued at rows[index].time. */
export function futureRoundOutcome(rows, index, horizon, target) {
  if (![1, 3, 5].includes(horizon) || !Number.isInteger(index) || index < 0 || index >= rows.length)
    return {status: 'unknown', reason: 'invalid-request'};
  if (index + horizon >= rows.length) return {status: 'unknown', reason: 'right-edge-or-next-day'};
  if (rows[index - 1]?.timestamp === rows[index].timestamp || rows[index + 1]?.timestamp === rows[index].timestamp)
    return {status: 'unknown', reason: 'ambiguous-origin-time'};
  let hit = false, maximum = 1;
  for (let step = 1; step <= horizon; step++) {
    const previous = rows[index + step - 1], row = rows[index + step];
    if (rows[index + step - 1]?.timestamp === row.timestamp || rows[index + step + 1]?.timestamp === row.timestamp)
      return {status: 'unknown', reason: 'ambiguous-target-time'};
    const gap = row.timestamp - previous.timestamp;
    if (gap <= 0 || gap > GAP_MS) return {status: 'unknown', reason: gap <= 0 ? 'unknown-round-order' : 'coverage-gap'};
    hit ||= row.coefficient >= target; maximum = Math.max(maximum, row.coefficient);
  }
  return {status: 'known', hit, maximum, firstAt: rows[index + 1].timestamp, endAt: rows[index + horizon].timestamp};
}

export function createValidationAccumulator() {return new Map();}

export function recordObservation(accumulator, forecast, {day, baseline, outcome}) {
  const key = forecastKey(forecast);
  let record = accumulator.get(key);
  if (!record) {
    record = {key, modelId: forecast.modelId, family: forecast.family || forecast.modelId, target: forecast.target,
      horizon: forecast.horizon, issued: 0, unavailable: 0, unknown: 0, unknownReasons: {}, days: new Map()};
    accumulator.set(key, record);
  }
  record.issued++;
  if (forecast.status !== 'ready' || !probability(forecast.probability) || !probability(baseline)) {record.unavailable++; return;}
  if (outcome.status !== 'known') {
    record.unknown++; record.unknownReasons[outcome.reason] = (record.unknownReasons[outcome.reason] || 0) + 1; return;
  }
  let daily = record.days.get(day);
  if (!daily) {daily = {day, n: 0, hits: 0, brier: 0, baselineBrier: 0, logLoss: 0,
    baselineLogLoss: 0, probability: 0, baselineProbability: 0, randomGuessExpectedBrier: 0}; record.days.set(day, daily);}
  const y = Number(outcome.hit), p = forecast.probability, q = baseline;
  daily.n++; daily.hits += y; daily.brier += (p - y) ** 2; daily.baselineBrier += (q - y) ** 2;
  daily.logLoss += -y * Math.log(clipped(p)) - (1 - y) * Math.log1p(-clipped(p));
  daily.baselineLogLoss += -y * Math.log(clipped(q)) - (1 - y) * Math.log1p(-clipped(q));
  daily.probability += p; daily.baselineProbability += q;
  // A frequency-matched random binary guess is shown descriptively; it is not
  // misrepresented as a probability forecast or a profitable betting baseline.
  daily.randomGuessExpectedBrier += y ? 1 - q : q;
}

function signFlipP(values) {
  if (!values.length) return 1;
  const observed = values.reduce((sum, value) => sum + value, 0);
  if (!(observed > 0)) return 1;
  const size = values.length <= 16 ? 2 ** values.length : 32768;
  let extreme = 0, seed = 0x53af152;
  for (let sample = 0; sample < size; sample++) {
    let total = 0;
    for (let j = 0; j < values.length; j++) {
      let positive;
      if (values.length <= 16) positive = !!(sample & (1 << j));
      else {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; positive = !!(seed & 0x80000000);}
      total += positive ? values[j] : -values[j];
    }
    if (total >= observed - 1e-14) extreme++;
  }
  return values.length <= 16 ? extreme / size : (extreme + 1) / (size + 1);
}

export function holmCorrection(values) {
  const sorted = values.map((p, index) => ({p: probability(p) ? p : 1, index})).sort((a, b) => a.p - b.p || a.index - b.index);
  const corrected = Array(values.length).fill(1); let previous = 0;
  sorted.forEach((value, order) => {previous = Math.max(previous, Math.min(1, value.p * (sorted.length - order))); corrected[value.index] = previous;});
  return corrected;
}

function dayBootstrap(days, field, alpha, samples) {
  if (!days.length) return null;
  const draws = []; let seed = field === 'brier' ? 0x741aa19 : 0x132cf78;
  for (let sample = 0; sample < samples; sample++) {
    let sum = 0, n = 0;
    for (let index = 0; index < days.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const day = days[Math.floor(seed / 2 ** 32 * days.length)];
      sum += day[field === 'brier' ? 'baselineBrier' : 'baselineLogLoss'] - day[field === 'brier' ? 'brier' : 'logLoss']; n += day.n;
    }
    draws.push(sum / n);
  }
  draws.sort((a, b) => a - b);
  return [draws[Math.max(0, Math.floor(samples * alpha / 2))], draws[Math.min(samples - 1, Math.ceil(samples * (1 - alpha / 2)) - 1)]];
}

/** All predeclared model/target/horizon tests enter one Holm family. */
export function summarizeValidation(accumulator, {minDays = 5, minKnown = 200, minEvents = 20,
  alpha = .05, bootstrapSamples = 8192, allowQualification = true} = {}) {
  const records = [...accumulator.values()];
  const familySize = Math.max(1, records.length), summaries = records.map(record => {
    const days = [...record.days.values()].sort((a, b) => a.day.localeCompare(b.day));
    const sum = key => days.reduce((total, day) => total + day[key], 0);
    const n = sum('n'), hits = sum('hits');
    const losses = days.map(day => day.baselineBrier - day.brier);
    const brierGain = n ? (sum('baselineBrier') - sum('brier')) / n : null;
    const logLossGain = n ? (sum('baselineLogLoss') - sum('logLoss')) / n : null;
    const enough = days.length >= minDays && n >= minKnown && hits >= minEvents && n - hits >= minEvents;
    const brierGainInterval95 = enough ? dayBootstrap(days, 'brier', .05, bootstrapSamples) : null;
    const logLossGainInterval95 = enough ? dayBootstrap(days, 'log', .05, bootstrapSamples) : null;
    // Family-wise intervals are deliberately conservative with short histories.
    const brierGainSimultaneousInterval = enough ? dayBootstrap(days, 'brier', alpha / (2 * familySize), bootstrapSamples) : null;
    const logLossGainSimultaneousInterval = enough ? dayBootstrap(days, 'log', alpha / (2 * familySize), bootstrapSamples) : null;
    return {key: record.key, modelId: record.modelId, family: record.family, target: record.target, horizon: record.horizon,
      issued: record.issued, known: n, unknown: record.unknown, unavailable: record.unavailable, unknownReasons: {...record.unknownReasons},
      hitCount: hits, hitFrequency: n ? hits / n : null, dayCount: days.length, days,
      brier: n ? sum('brier') / n : null, baselineBrier: n ? sum('baselineBrier') / n : null,
      logLoss: n ? sum('logLoss') / n : null, baselineLogLoss: n ? sum('baselineLogLoss') / n : null,
      meanProbability: n ? sum('probability') / n : null, meanBaselineProbability: n ? sum('baselineProbability') / n : null,
      frequencyMatchedRandomGuessExpectedBrier: n ? sum('randomGuessExpectedBrier') / n : null,
      brierGain, logLossGain, brierGainInterval95, logLossGainInterval95, brierGainSimultaneousInterval,
      logLossGainSimultaneousInterval, rawP: enough ? signFlipP(losses) : 1, sufficient: enough,
      uncertainty: 'approximate paired whole-day bootstrap; conditional on these observed dates',
      pValueMethod: 'one-sided paired day-block sign-flip; symmetry assumption',
    };
  });
  const corrected = holmCorrection(summaries.map(value => value.rawP));
  return summaries.map((value, index) => {
    const qualified = allowQualification && value.sufficient && corrected[index] < alpha &&
      value.brierGainSimultaneousInterval?.[0] > 0 && value.logLossGainSimultaneousInterval?.[0] > 0;
    return {...value, adjustedP: corrected[index], multipleTesting: {method: 'Holm', hypotheses: summaries.length, alpha,
      simultaneousIntervalMetrics: 2}, qualified,
      reason: qualified ? 'supported-out-of-sample-loss-improvement' : !allowQualification ? 'insufficient-separate-validation-days' :
        !value.sufficient ? 'insufficient-validation-support' : 'no-corrected-out-of-sample-advantage'};
  });
}

/** Selection uses development scores only and picks at most one sibling per family. */
export function freezeFamilySelection(development) {
  const selected = new Map();
  // Development is selection, not evidence: all final claims still require
  // independent confirmation and the exact frozen combination is tested there.
  for (const model of development.filter(value => value.sufficient && value.brierGain > 0 && value.logLossGain > 0)) {
    const key = `${model.target}:${model.horizon}:${model.family}`;
    const previous = selected.get(key);
    if (!previous || model.brierGain > previous.brierGain || (model.brierGain === previous.brierGain && model.modelId < previous.modelId)) selected.set(key, model);
  }
  return [...selected.values()].map(({key, modelId, family, target, horizon}) => ({key, modelId, family, target, horizon}));
}

/** No weights or member choices are learned on the confirmation dates. */
export function fixedConsensus(forecasts, members, baselineInterval, {target, horizon}) {
  const selected = members.filter(member => member.target === target && member.horizon === horizon);
  const byFamily = new Map();
  for (const member of selected) {
    const forecast = forecasts.find(value => value.modelId === member.modelId && value.target === target && value.horizon === horizon);
    if (forecast?.status === 'ready' && probability(forecast.probability) && Array.isArray(forecast.interval95) &&
      forecast.interval95.length === 2 && forecast.interval95.every(probability) && probability(baselineInterval?.[1]) &&
      forecast.interval95[0] > baselineInterval[1]) byFamily.set(member.family, forecast);
  }
  const support = [...byFamily.values()];
  return {modelId: 'fixed-family-consensus-v1', family: 'consensus', target, horizon,
    status: support.length >= 2 ? 'ready' : 'insufficient', probability: support.length >= 2 ? mean(support.map(value => value.probability)) : null,
    interval95: support.length >= 2 ? [Math.min(...support.map(value => value.interval95[0])), Math.max(...support.map(value => value.interval95[1]))] : null,
    agreeingFamilies: [...byFamily.keys()], members: support.map(value => value.modelId),
    intervalKind: 'envelope-of-member-conditional-intervals-not-calibrated-ensemble-interval',
    reason: support.length >= 2 ? 'frozen-distinct-family-agreement' : 'fewer-than-two-distinct-supported-families'};
}
