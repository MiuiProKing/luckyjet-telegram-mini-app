import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatRarePresentation} from '../safari/src/rare-presentation.mjs';
import {analyzeRareWindows} from '../safari/src/rare-window-model.mjs';
import {advanceRareAlerts} from '../safari/src/rare-alerts.mjs';

const NOW = Date.UTC(2026, 10, 3, 12, 10, 17);
const START = Date.UTC(2026, 10, 3, 12, 13);
const END = START + 180_000;
function input() {
  return {
    now: NOW, online: true, lastSuccessAt: NOW,
    analysis: {
      ready: true, evidenceStatus: 'experimental-unvalidated', threshold: 100, horizonMs: 180_000,
      diagnostics: {analyzedAt: NOW, lastAt: NOW - 17_000, reason: 'experimental-local-frequency-rise'},
      poisson: {status: 'ready', eventCount: 5, exposureMs: 18_000_000,
        probability: .053256255622565404, probabilityInterval95: [.018897894015953726, .10380768010983733]},
      bayesian: {status: 'ready',
        recent: {windowCount: 30, hitWindowCount: 5, posteriorMean: 5.5 / 31,
          interval95: [.06657395356745498, .3274277516634612]},
        reference: {windowCount: 60, hitWindowCount: 5, posteriorMean: 5.5 / 61, interval95: [.03, .18]}},
    },
    alerts: {
      active: {model: 'rare-alert-v1', source: 'beta-window-frequency', target: 100,
        evidenceStatus: 'experimental-unvalidated', status: 'pending', generatedAt: NOW,
        acceptedAt: NOW, start: START, end: END, windowMs: END - START},
      latestResult: null,
    },
  };
}

test('pending alert presents Russian experimental text and the actual Kyiv interval', () => {
  const result = formatRarePresentation(input());
  assert.equal(result.banner.title, 'В эти минуты оценивается возможность большого скачка ≥100×');
  assert.equal(result.banner.windowLabel, '03.11, 14:13–14:16 · Киев');
  assert.match(result.banner.detail, /Экспериментальная оценка для наблюдения/);
  assert.match(result.banner.detail, /источник: Бета: частота окон/);
  assert.match(result.banner.detail, /Не запускает автоставки/);
  assert.match(result.banner.detail, /не гарантирован/);
  assert.ok(result.diagnostics.length <= 8);
  assert.match(result.diagnostics.join('\n'), /Гамма–Пуассон, следующие 3 мин: 5,3%/);
  assert.match(result.diagnostics.join('\n'), /95% байесовский интервал 1,9%–10,4%/);
  assert.match(result.diagnostics.join('\n'), /при постоянной интенсивности/);
  assert.match(result.diagnostics.join('\n'), /Событий: 5; наблюдение: 300 мин/);
  assert.match(result.diagnostics.join('\n'), /последние 30 окон: 17,7%/);
  assert.match(result.diagnostics.join('\n'), /5\/30 окон с ≥100×/);
  assert.match(result.diagnostics.join('\n'), /Предыдущие 60 окон/);
  assert.match(result.diagnostics.join('\n'), /не являются откалиброванным шансом будущего окна/);
  assert.match(result.diagnostics.join('\n'), /Долгое отсутствие ≥100× само по себе не повышает оценку/);
  assert.equal(result.journalLabel, 'Журнал: завершённых окон пока нет.');
});

test('freshness is inclusive at 12 seconds and fails for stale, offline and missing polls', () => {
  const exact = input();
  exact.lastSuccessAt = NOW - 12_000;
  assert.ok(formatRarePresentation(exact).banner);
  for (const patch of [{lastSuccessAt: NOW - 12_001}, {online: false}, {lastSuccessAt: null},
    {lastSuccessAt: undefined}, {lastSuccessAt: NOW + 1}, {lastSuccessAt: NaN}]) {
    assert.equal(formatRarePresentation({...input(), ...patch}).banner, null);
  }
});

test('banner appears for the published future interval, stays at start and hides at end', () => {
  for (const now of [NOW, START, END - 1, END, END + 1]) {
    const value = input();
    value.now = now;
    value.lastSuccessAt = now;
    value.analysis.diagnostics = {analyzedAt: now, lastAt: now - 1000};
    assert.equal(formatRarePresentation(value).banner !== null, now < END, String(now));
  }
  for (const status of ['hit', 'miss', 'unknown']) {
    const value = input();
    value.alerts.active.status = status;
    assert.equal(formatRarePresentation(value).banner, null, status);
  }
  const earlyHit = input();
  earlyHit.now = START + 1000;
  earlyHit.lastSuccessAt = earlyHit.now;
  earlyHit.alerts.active = {...earlyHit.alerts.active, status: 'hit', actual: 150,
    actualAt: START + 500, resolvedAt: START + 1000};
  earlyHit.alerts.latestResult = earlyHit.alerts.active;
  const result = formatRarePresentation(earlyHit);
  assert.equal(result.banner, null);
  assert.match(result.journalLabel, /цель отмечена/);
  assert.match(result.journalLabel, /зафиксированный коэффициент 150×/);
});

test('future clock anomalies, stale cached analysis and malformed chronology suppress the banner', () => {
  const variants = [
    value => {value.now = NaN;},
    value => {value.analysis.diagnostics.analyzedAt = NOW + 1;},
    value => {value.analysis.diagnostics.lastAt = NOW + 1;},
    value => {value.analysis.poisson.exposureEnd = NOW + 1;},
    value => {value.analysis.bayesian.recent.end = NOW + 1;},
    value => {value.analysis.diagnostics.lastAt = NOW - 180_001;},
    value => {value.analysis.diagnostics.analyzedAt = NOW - 180_001;},
    value => {delete value.analysis.diagnostics.lastAt;},
    value => {value.alerts.active.generatedAt = NOW + 1;},
    value => {value.alerts.active.acceptedAt = NOW + 1;},
    value => {value.alerts.active.start = NOW + 60_000;},
    value => {value.alerts.active.windowMs++;},
    value => {value.alerts.active.target = 99;},
    value => {value.alerts.active.source = 'unverified';},
    value => {value.alerts.active.model = 'another-model';},
    value => {value.analysis.ready = false;},
  ];
  for (const change of variants) {
    const value = input();
    change(value);
    assert.equal(formatRarePresentation(value).banner, null, change.toString());
  }
});

test('presentation never invents an alert from analysis candidates or diagnostic probabilities', () => {
  const value = input();
  value.analysis.candidate = structuredClone(value.alerts.active);
  value.alerts.active = null;
  assert.equal(formatRarePresentation(value).banner, null);
  delete value.alerts;
  assert.equal(formatRarePresentation(value).banner, null);
  assert.equal(formatRarePresentation().banner, null);
});

test('missing statistical support remains unknown and readiness reasons are Russian', () => {
  const value = input();
  value.analysis.ready = false;
  value.analysis.diagnostics.reason = 'insufficient-contiguous-history';
  value.analysis.poisson = {status: 'insufficient', reason: 'insufficient-events', probability: null, probabilityInterval95: null};
  value.analysis.bayesian = {status: 'insufficient', reason: 'insufficient-covered-windows'};
  const result = formatRarePresentation(value);
  assert.equal(result.banner, null);
  assert.match(result.diagnostics[0], /минимум 500/);
  assert.match(result.diagnostics[1], /оценка недоступна.*меньше 5/);
  assert.match(result.diagnostics[2], /нужны 30 последних и не менее 60 предыдущих полных окон/);
  assert.doesNotMatch(result.diagnostics.join('\n'), /null|undefined|0%|NaN/);
  assert.ok(result.diagnostics.length <= 8);
});

test('insufficient recent hits still display both actual group counts and clarify nonconsecutive windows', () => {
  const value = input();
  value.analysis.bayesian.status = 'insufficient';
  value.analysis.bayesian.reason = 'insufficient-hit-windows';
  value.analysis.bayesian.recent.hitWindowCount = 3;
  value.analysis.archive = {status: 'ready'};
  value.alerts.active = null;
  const view = formatRarePresentation(value);
  assert.equal(view.banner, null);
  assert.match(view.diagnostics.join('\n'), /3\/30 окон/);
  assert.match(view.diagnostics.join('\n'), /Архив для сравнения, 60 окон/);
  assert.match(view.diagnostics.join('\n'), /не обязательно подряд/);
});

test('journal labels report the target, frozen window, source and observed maximum', () => {
  for (const status of ['hit', 'miss', 'unknown']) {
    const value = input();
    value.now = END + 200_000;
    value.alerts.latestResult = {...value.alerts.active, status,
      resolvedAt: value.now, actual: status === 'hit' ? 125.4 : status === 'miss' ? 80 : null};
    value.alerts.active = null;
    const result = formatRarePresentation(value);
    assert.match(result.journalLabel, /цель ≥100×/);
    assert.match(result.journalLabel, /03.11, 14:13–14:16 · Киев/);
    assert.match(result.journalLabel, /источник: Бета: частота окон/);
    assert.match(result.journalLabel, /зафиксированный коэффициент/);
    assert.doesNotMatch(result.journalLabel, /выигрыш|ставк|прибыл|успешн/i);
    if (status === 'unknown') assert.match(result.journalLabel, /покрытие неизвестно.*коэффициент неизвестен/);
  }
  const existing = input();
  existing.alerts.active.source = 'existing-big-opportunity';
  assert.match(formatRarePresentation(existing).banner.detail, /источник: пересечение эвристик/);
});

test('Kyiv labels cross dates and use summer time rather than a fixed UTC offset', () => {
  const value = input();
  value.alerts.latestResult = {...value.alerts.active, status: 'unknown', actual: null,
    start: Date.UTC(2026, 6, 2, 20, 59), end: Date.UTC(2026, 6, 2, 21, 2),
    resolvedAt: Date.UTC(2026, 6, 2, 21, 10)};
  value.now = Date.UTC(2026, 6, 2, 21, 11);
  assert.match(formatRarePresentation(value).journalLabel, /02.07, 23:59–03.07, 00:02 · Киев/);
});

test('real model and publication output format without mutation', () => {
  const origin = Math.floor((NOW - 120 * 180_000) / 180_000) * 180_000;
  const rows = Array.from({length: 721}, (_, i) => {
    const window = Math.floor((i - 1) / 6);
    return {id: `r${i}`, timestamp: origin + i * 30_000,
      coefficient: i > 0 && (i - 1) % 6 === 0 && (window >= 90 || window % 12 === 0) ? 100 : 1.2};
  });
  const now = rows.at(-1).timestamp + 20_000;
  const analysis = analyzeRareWindows(rows, now);
  const alerts = advanceRareAlerts([], rows, {analysis, now, online: true, lastSuccessAt: now});
  const value = {analysis, alerts, now, online: true, lastSuccessAt: now};
  const before = structuredClone(value);
  function freeze(object) {
    if (object && typeof object === 'object') {
      Object.freeze(object);
      for (const child of Object.values(object)) freeze(child);
    }
  }
  freeze(value);
  const result = formatRarePresentation(value);
  assert.ok(result.banner);
  assert.match(result.banner.detail, /Экспериментальная/);
  assert.deepEqual(value, before);
});
