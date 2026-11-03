// Pure Russian presentation for the separate experimental observation journal.
const EVIDENCE_STATUS = 'experimental-unvalidated';
const POLL_FRESH_MS = 12_000;
const MINUTE = 60_000;
const MIN_TIMESTAMP = 946_684_800_000;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const clock = value => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const probability = value => finite(value) && value >= 0 && value <= 1;
const count = value => Number.isSafeInteger(value) && value >= 0;
const percentFormatter = new Intl.NumberFormat('ru-RU', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const coefficientFormatter = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2});
const dayFormatter = new Intl.DateTimeFormat('ru-RU', {timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit'});
const timeFormatter = new Intl.DateTimeFormat('ru-RU', {timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const sources = {
  'beta-window-frequency': 'Бета: частота окон',
  'existing-big-opportunity': 'пересечение эвристик',
};
const reasons = {
  'invalid-now': 'некорректное время устройства',
  'invalid-input': 'нет корректной истории',
  'no-valid-completed-rounds': 'нет корректных завершённых результатов',
  'stale-data': 'последний результат устарел',
  'insufficient-contiguous-history': 'нужно минимум 500 непрерывно наблюдавшихся завершённых результатов',
  'no-positive-exposure': 'интервал наблюдения не измерен',
  'insufficient-exposure': 'наблюдаемый интервал короче 3 минут',
  'insufficient-events': 'наблюдалось меньше 5 результатов ≥100×',
  'insufficient-covered-windows': 'нужны 30 последних и не менее 60 предыдущих полных окон',
  'insufficient-hit-windows': 'нужно минимум 5 окон с ≥100× в каждой группе; не обязательно подряд',
  'archive-recent-window-conflict': 'обнаружено расхождение архива и текущих окон; сигнал отложен',
  'numerical-failure': 'численная оценка недоступна',
  'no-supported-local-rise': 'поддержанного роста локальной частоты нет',
  'experimental-local-frequency-rise': 'экспериментальный рост локальной частоты',
};
const reason = value => reasons[value] ?? 'недостаточно данных';

function percent(value) {
  if (!probability(value)) return null;
  if (value === 0) return '0%';
  if (value === 1) return '100%';
  if (value < .001) return '<0,1%';
  if (value > .999) return '>99,9%';
  return `${percentFormatter.format(value * 100)}%`;
}

function range(value) {
  return Array.isArray(value) && value.length === 2 && value.every(probability) && value[0] <= value[1]
    ? `${percent(value[0])}–${percent(value[1])}` : null;
}

function windowLabel(value) {
  if (!clock(value?.start) || !clock(value?.end) || value.start >= value.end) return null;
  const fromDay = dayFormatter.format(value.start), toDay = dayFormatter.format(value.end);
  return `${fromDay}, ${timeFormatter.format(value.start)}–${fromDay === toDay ? '' : `${toDay}, `}${timeFormatter.format(value.end)} · Киев`;
}

function futureClockAnomaly(analysis, alerts, now) {
  if (!clock(now) || now > MAX_TIMESTAMP - 30 * MINUTE) return true;
  const fields = [analysis?.diagnostics?.analyzedAt, analysis?.diagnostics?.lastAt,
    analysis?.poisson?.exposureEnd, analysis?.bayesian?.recent?.end,
    alerts?.active?.generatedAt, alerts?.active?.acceptedAt,
    alerts?.active?.resolvedAt, alerts?.latestResult?.resolvedAt];
  return fields.some(value => value !== undefined && value !== null && (!clock(value) || value > now));
}

function validPending(value, now) {
  return value?.status === 'pending' && value.model === 'rare-alert-v1' &&
    value.evidenceStatus === EVIDENCE_STATUS && Object.hasOwn(sources, value.source) &&
    Number.isSafeInteger(value.target) && value.target >= 100 &&
    [value.generatedAt, value.acceptedAt, value.start, value.end].every(clock) &&
    value.generatedAt <= value.acceptedAt && value.acceptedAt <= now && value.acceptedAt < value.start &&
    value.start - value.generatedAt >= 2 * MINUTE && value.start - value.generatedAt <= 15 * MINUTE &&
    value.end > value.start && value.end - value.start <= 10 * MINUTE &&
    value.windowMs === value.end - value.start && now < value.end &&
    value.actual === undefined && value.actualAt === undefined && value.resolvedAt === undefined;
}

function betaLine(label, summary) {
  const interval = range(summary?.interval95);
  if (!summary || !count(summary.windowCount) || summary.windowCount === 0 ||
      !count(summary.hitWindowCount) || summary.hitWindowCount > summary.windowCount ||
      !probability(summary.posteriorMean) || !interval) return null;
  return `${label} ${summary.windowCount} окон: ${percent(summary.posteriorMean)} · 95% байесовский интервал ${interval}; ${summary.hitWindowCount}/${summary.windowCount} окон с ≥100×.`;
}

function journalLabel(latest, now) {
  if (!latest || !['hit', 'miss', 'unknown'].includes(latest.status)) return 'Журнал: завершённых окон пока нет.';
  const label = windowLabel(latest);
  if (!label || !Number.isSafeInteger(latest.target) || latest.target < 100 ||
      !clock(latest.resolvedAt) || latest.resolvedAt > now) return 'Журнал: результат недоступен из-за некорректного времени.';
  const result = {hit: 'цель отмечена', miss: 'цель не отмечена', unknown: 'покрытие неизвестно'}[latest.status];
  const actual = finite(latest.actual) && latest.actual >= 1
    ? `зафиксированный коэффициент ${coefficientFormatter.format(latest.actual)}×` : 'зафиксированный коэффициент неизвестен';
  return `Журнал: ${result} · цель ≥${coefficientFormatter.format(latest.target)}× · ${label} · источник: ${sources[latest.source] ?? 'неизвестен'} · ${actual}.`;
}

/** Formatting only: publication, timing and result decisions remain upstream. */
export function formatRarePresentation({analysis = null, alerts = null, now = Date.now(), online = false, lastSuccessAt = null} = {}) {
  const anomaly = futureClockAnomaly(analysis, alerts, now) ||
    (lastSuccessAt !== null && lastSuccessAt !== undefined && (!clock(lastSuccessAt) || lastSuccessAt > now));
  const freshPoll = online === true && clock(lastSuccessAt) && lastSuccessAt <= now && now - lastSuccessAt <= POLL_FRESH_MS;
  const freshAnalysis = clock(analysis?.diagnostics?.lastAt) && clock(analysis?.diagnostics?.analyzedAt) &&
    now - analysis.diagnostics.lastAt <= 180_000 && now - analysis.diagnostics.analyzedAt <= 180_000;
  const ready = analysis?.ready === true && analysis.evidenceStatus === EVIDENCE_STATUS &&
    analysis.threshold === 100 && analysis.horizonMs === 180_000;
  let readiness = reason(analysis?.diagnostics?.reason);
  if (ready && !analysis?.diagnostics?.reason) readiness = 'история готова';
  if (anomaly) readiness = 'расхождение времени; оповещение скрыто';
  else if (online !== true) readiness = 'источник недоступен';
  else if (!freshPoll) readiness = 'свежий опрос не подтверждён (не старше 12 с)';
  else if (ready && !freshAnalysis) readiness = 'данные анализа устарели';
  const diagnostics = [`Данные: ${readiness}.`];
  const poisson = analysis?.poisson, poissonInterval = range(poisson?.probabilityInterval95);
  const sample = count(poisson?.eventCount) && finite(poisson?.exposureMs) && poisson.exposureMs >= 0
    ? ` Событий: ${poisson.eventCount}; наблюдение: ${coefficientFormatter.format(poisson.exposureMs / MINUTE)} мин.` : '';
  diagnostics.push(poisson?.status === 'ready' && probability(poisson.probability) && poissonInterval
    ? `Гамма–Пуассон, следующие 3 мин: ${percent(poisson.probability)} · 95% байесовский интервал ${poissonInterval} — при постоянной интенсивности.${sample}`
    : `Гамма–Пуассон: оценка недоступна — ${reason(poisson?.reason)}.`);
  const beta = analysis?.bayesian;
  const recent = betaLine('Бета, последние', beta?.recent);
  const reference = betaLine(analysis?.archive?.status === 'ready' ? 'Архив для сравнения,' : 'Предыдущие', beta?.reference);
  if (beta?.status !== 'ready') diagnostics.push(`Бета: сигнал недоступен — ${reason(beta?.reason)}.`);
  if (recent) diagnostics.push(recent);
  if (reference) diagnostics.push(reference);
  if (!recent && !reference && beta?.status === 'ready') diagnostics.push('Бета: описание групп недоступно.');
  diagnostics.push(
    'Эксперимент: частоты прошлых окон не являются откалиброванным шансом будущего окна.',
    'Долгое отсутствие ≥100× само по себе не повышает оценку.',
    'Покрытие истории предполагается по наблюдавшимся интервалам между результатами.',
  );
  const active = alerts?.active;
  const banner = !anomaly && freshPoll && freshAnalysis && ready && validPending(active, now) ? {
    title: `В эти минуты оценивается возможность большого скачка ≥${coefficientFormatter.format(active.target)}×`,
    windowLabel: windowLabel(active),
    detail: `Экспериментальная оценка для наблюдения · источник: ${sources[active.source]}. Будущий результат не гарантирован. Не запускает автоставки.`,
  } : null;
  return {banner, diagnostics, journalLabel: journalLabel(alerts?.latestResult, now)};
}
