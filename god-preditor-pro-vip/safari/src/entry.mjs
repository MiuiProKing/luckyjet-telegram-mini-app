import {createAutoCashout} from './autocashout.mjs';
import {createLiveMultiplierMonitor, pickLiveMultiplier, inspectCashoutButton, clickCashoutButton} from './live-dom.mjs';
import {sourceReady} from './freshness.mjs';
import {loadPanelState} from './storage.mjs';
import {activate} from './activation.mjs';
import {installFrameSupport, GAME_ORIGIN} from './frame-support.mjs';
import {SUPABASE_CONFIG} from '../../supabase-config.mjs';
import {createSupabaseFeed} from '../../supabase-feed.mjs';
import {mergeRounds} from '../../data.mjs';
import {MODEL, analyze, advanceJournal} from './window-model-v2.mjs';
import {analyzeRareWindows} from './rare-window-model.mjs';
import {analyzeRareArchive} from './archive-history.mjs';
import {createArchiveCache} from './archive-cache.mjs';
import {createArchiveService} from './archive-service.mjs';
import {createStatisticsRunner} from './statistics/runtime.mjs';
import {advanceRareAlerts} from './rare-alerts.mjs';
import {formatRarePresentation} from './rare-presentation.mjs';
import {mountScene} from '../../scene.mjs';
import {createExtensionFetch, permittedPage} from './transport.mjs';
import {CSS} from './style.mjs';
import {AUTO_KEY, createAutoBet, acquireAutoLock} from './autobet.mjs';
import {pickButton, inspectBetButton, clickSelectedBet} from './betting-dom.mjs';

const ID = 'god-preditor-safari-overlay', KEY = 'god-preditor-safari-v4', LEGACY_KEY = 'god-preditor-safari-v1';
const HOME = 'https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/';
const ASSETS = HOME + 'assets/';
const RARE_HISTORY_LIMIT = 2000;
const number = n => Number(n).toLocaleString('ru-RU', {maximumFractionDigits: 2});
const clock = t => new Date(t).toLocaleTimeString('ru-RU', {timeZone: 'Europe/Kyiv'});
const duration = ms => {const n = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;};

async function start(gm) {
  // Exact casino/game hosts; each frame accesses only its own document.
  if ((window !== window.top && location.origin !== GAME_ORIGIN) || !permittedPage(location) || document.getElementById(ID)) return;
  const host = document.createElement('div'); host.id = ID;
  host.dataset.version = '1.7.0'; host.dataset.model = MODEL;
  for (const [k, v] of Object.entries({position: 'fixed', inset: '0 auto auto 0', width: '0', height: '0',
    'z-index': '2147483647', 'pointer-events': 'none', transform: 'none'})) host.style.setProperty(k, v, 'important');
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = `<style>${CSS}</style>
    <section class="panel" aria-label="GOD PREDITOR PRO VIP">
      <header class="handle" title="Перетащи панель за эту строку">
        <div class="brand"><strong id="brand-text">GOD PREDITOR</strong><img id="brand-image" alt="GOD PREDITOR" hidden referrerpolicy="no-referrer"><small>PRO · VIP · 1.7</small></div>
        <div class="window-controls" role="group" aria-label="Управление окном">
          <button class="icon" id="size-up" aria-label="Увеличить окно" title="Увеличить окно">+</button>
          <button class="icon" id="size-down" aria-label="Уменьшить окно" title="Уменьшить окно">−</button>
          <button class="icon" id="minimize" aria-label="Свернуть окно" title="Свернуть окно">▁</button>
          <button class="icon" id="close" aria-label="Закрыть окно" title="Закрыть до перезагрузки">×</button>
        </div>
      </header>
      <div class="body">
        <div class="status" id="status" role="status">Подключение к нашему Supabase…</div>
        <div class="auto-brief" id="auto-brief" role="status" hidden></div>
        <div class="recent" aria-label="Пять последних коэффициентов"></div>
        <div class="rare-alert" id="rare-alert" role="status" hidden><b id="rare-title"></b><time id="rare-window"></time><small id="rare-detail"></small></div>
        <div class="suite-signal" id="suite-signal" role="status" hidden></div>
        <div class="neural"><canvas aria-label="Неоновый мозг и паук"></canvas><img class="vip" alt="VIP" referrerpolicy="no-referrer"></div>
        <div class="signal" id="signal">—</div>
        <div class="window" id="window">Получаем историю</div>
        <div class="note" id="note"></div>
        <div class="targets" aria-label="Цель"><button data-target="primary">Основной</button><button data-target="big">Доп. окно</button></div>
        <div class="result" id="result" role="status"><img id="result-image" hidden alt="" referrerpolicy="no-referrer"><span id="result-label">Проверка по окну</span></div>
        <div class="tools" id="tools" hidden><button id="retry">Обновить связь</button><button id="opacity">Прозрачность</button><button id="reset">Сбросить размер</button><p class="hint">Кнопки + и − вверху меняют размер. Перетащи за заголовок. Угол ↘ тоже меняет размер. × скрывает до перезагрузки. Данные — наш Supabase.</p><details class="rare-diagnostics"><summary>Модели 100× и журнал предупреждений</summary><p id="archive-status" role="status">Читаем сохранённый архив…</p><button id="archive-retry">Обновить архив</button><button id="archive-full">Перечитать всю историю</button><button id="archive-events">Все 100×+ и время</button><p id="rare-diagnostics"></p><p id="rare-result"></p><button id="rare-export">Скачать журнал JSON</button></details><details class="rare-diagnostics" id="statistics-details"><summary>Все модели и проверка по дням</summary><p id="statistics-status" role="status">Ожидание полного архива</p><button id="statistics-refresh">Пересчитать модели</button><button id="statistics-export">Скачать отчёт JSON</button><p id="statistics-summary"></p><div id="statistics-zones"></div><div id="statistics-models"></div></details></div>
      </div>
      <footer class="footer"><button class="link" id="history-open">История</button><button class="link" id="auto-open">Авто</button><button class="link" id="tools-open">Настроить</button><a class="link" href="${HOME}" target="_blank" rel="noopener noreferrer">Страница ↗</a><button class="grip" id="resize" aria-label="Изменить размер панели">↘</button></footer>
      <section class="history" hidden><div class="history-head"><b id="history-title">Полученные коэффициенты</b><button class="icon" id="history-close" aria-label="Закрыть историю">×</button></div><small id="history-count"></small><div class="history-list"></div></section>
      <section class="auto-panel" hidden><div class="history-head"><b id="auto-title">Авто выключено</b><button class="icon" id="auto-close" aria-label="Закрыть настройки авто">×</button></div>
        <p>Суммы и автозабирание выставь в игре сам. Скрипт их не меняет.</p>
        <div class="auto-slot"><button id="pick-0">Выбрать поле 1</button><small id="slot-0">1 · не выбрана</small></div>
        <div class="auto-slot"><button id="pick-1">Выбрать поле 2</button><small id="slot-1">2 · не выбрана</small></div>
        <p>Обе кнопки — по времени основного прогноза. Суммы и автозабирание проверь в игре перед включением.</p><button id="auto-check">Проверить без нажатий</button>
        <label>Режим <select id="auto-mode"><option value="test">Тест без ставок</option><option value="live">Автонажатия</option></select></label>
        <button id="auto-toggle">Включить тест</button>
        <p id="auto-message" role="status">Авто выключено</p>
        <p class="hint">Оба поля: по одному нажатию в начале основного окна. Если «Ставка» недоступна 15 секунд — пропуск. Фон, перезагрузка или ошибка выключают режим. Новая привязка нужна после перезагрузки игры.</p>
        <p class="hint">Результат окна не подтверждает выигрыш твоей ставки. Отправленное нажатие проверяй в самой игре.</p>
        <p id="auto-diagnostic"></p><div id="auto-log"></div>
        <hr><b id="cashout-title">Автозабирание выключено</b>
        <p>Сначала выбери живой счётчик в самом полёте. Из Supabase идут только завершённые раунды.</p>
        <button id="pick-live">Выбрать живой коэффициент</button>
        <p id="live-value" role="status">Счётчик не выбран</p>
        <label>Забрать <select id="cashout-mode"><option value="test">Тест без нажатий</option><option value="live">Автонажатие «Забрать»</option></select></label>
        <button id="cashout-toggle">Включить тест счётчика</button>
        <p id="cashout-message" role="status">Выключено</p><div id="cashout-log"></div>
        <p class="hint">Для авто сначала включи автоставки. Цель фиксируется отдельно для каждого поля при нашем нажатии «Ставка». После окончания раунда ждём новый прогноз; по старому повторной ставки нет. Ручная ставка не подхватывается.</p>
        <p class="hint">Привязки должны быть в одном игровом документе. Если число нарисовано в Canvas, чтение не поддерживается. Совпадение игрового раунда пока определяется по интерфейсу и не проверено на твоей игре. Сначала тест. Нажатие по порогу может опоздать и не подтверждает выплату.</p>
        <p class="hint">Суммы и штатный автовывод не меняются. Если в игре задан более низкий автовывод, он сработает раньше скрипта. Любое ручное нажатие выбранного поля прекращает автоотслеживание.</p>
      </section>
    </section>
    <button class="launcher" hidden aria-label="Открыть панель GOD PREDITOR">GP <span>—</span></button>`;
  document.documentElement.append(host);
  const $ = selector => root.querySelector(selector);
  const panel = $('.panel'), launcher = $('.launcher');
  let rows = [], journal = [], legacyJournal = [], selected = 'primary', feed = null, status = 'connecting', lastSuccessAt = null;
  let rareJournal = [], rareAnalysis = null, rareAnalysisKey = '', rowsRevision = 0;
  let archive = null, archiveSummary = null, archiveRevision = 0, historyMode = 'recent';
  let statistics = null, statisticsDay = '', statisticsLoading = false, statisticsPredictKey = '', statisticsListKey = '', latestStatisticsReport = null;
  let destroyed = false, saveTimer = null, storageWarning = false, historyVersion = '', latestResult = '';
  let latestStats = analyze([]), cancelPicker = null, requestedAutoMode = 'test', requestedCashoutMode = 'test';
  let cashout = null, liveSelection = null;
  const liveMonitor = createLiveMultiplierMonitor();
  const manualListeners = [null, null];
  const ui = {x: 10, y: 115, width: 238, height: 390, opacity: .97, collapsed: false};
  const scene = mountScene($('canvas'), {compact: true});
  const current = target => [...journal].reverse().find(x => x.channel === target && x.model === MODEL);
  let closeOverlay = () => {};
  const selectedButtons = [null, null];
  const frameSupport = installFrameSupport(window, () => {if (window === window.top && !destroyed) closeOverlay();}, () => selectedButtons.filter(Boolean).map(b => {const r = b.element.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2};}));
  const auto = createAutoBet({
    model: MODEL,
    context: () => ({visible: !document.hidden && !destroyed,
      fresh: frameSupport.ready() && sourceReady(status, latestStats, lastSuccessAt),
      forecasts: [current('primary')].filter(Boolean)}),
    inspect: inspectBetButton, click: clickSelectedBet,
    acquireLock: () => acquireAutoLock(navigator.locks),
    readReceipts: () => gm.getValue(AUTO_KEY, []),
    writeReceipts: receipts => gm.setValue(AUTO_KEY, receipts),
    onChange: renderAuto,
    onBetDispatched: receipt => {if (cashout?.state.armed) cashout.onBetDispatched(receipt);},
    beforeBet: ({index}) => cashout?.state.armed && cashout.state.mode === 'live' ? cashout.canTrackBet(index) : true,
  });
  cashout = createAutoCashout({
    context: () => ({visible: !document.hidden && !destroyed,
      fresh: frameSupport.ready() && sourceReady(status, latestStats, lastSuccessAt),
      autoBetArmed: auto.state.armed, autoBetMode: auto.state.mode,
      buttonsConfigured: selectedButtons.every(Boolean) && selectedButtons[0]?.element !== selectedButtons[1]?.element &&
        selectedButtons.every(button => button?.document === liveSelection?.document)}),
    readMultiplier: () => liveMonitor.read(), inspectCashout: inspectCashoutButton, clickCashout: clickCashoutButton,
    onChange: renderCashout,
    onFatal: reason => auto.disarm('Автозабирание остановлено: ' + reason),
  });
  function renderAutoBrief() {
    if (!cashout || destroyed) return;
    const bet = auto.state, collect = cashout.state;
    $('#auto-brief').hidden = !(bet.armed || collect.armed || bet.logs.length || collect.logs.length);
    $('#auto-brief').classList.toggle('armed', bet.armed || collect.armed);
    $('#auto-brief').textContent = `Авто: ${bet.armed ? bet.mode === 'live' ? 'включено' : 'тест' : 'выключено'} · Забрать: ${collect.armed ? collect.mode === 'live' ? 'включено' : 'тест' : 'выключено'}\n${bet.message}${collect.logs.length || collect.armed ? '\n' + collect.message : ''}`;
    statistics?.resume();
  }
  function renderCashout() {
    if (!cashout || destroyed) return;
    const state = cashout.state, sample = liveMonitor.read();
    $('#cashout-title').textContent = state.armed ? (state.mode === 'live' ? 'Автозабирание включено' : 'Тест счётчика включён') : 'Автозабирание выключено';
    $('#cashout-toggle').textContent = state.armed ? 'Выключить автозабирание' : requestedCashoutMode === 'live' ? 'Включить автозабирание' : 'Включить тест счётчика';
    $('#cashout-toggle').classList.toggle('armed', state.armed);
    $('#cashout-message').textContent = state.message;
    $('#live-value').textContent = sample.state === 'ready' ? 'Сейчас ' + number(sample.value) + '× · возраст изменения ' + Math.max(0, Date.now() - sample.changedAt) + ' мс' : sample.reason || 'Счётчик не читается';
    $('#pick-live').disabled = state.pending.length > 0;
    $('#cashout-log').replaceChildren(...state.logs.slice(-5).map(entry => {const row = document.createElement('div');row.textContent = clock(entry.at) + ' · ' + entry.text;return row;}));
    launcher.dataset.cashout = state.armed ? state.mode : 'off';
    renderAutoBrief();
  }
  function watchManualInput(index, selection) {
    manualListeners[index]?.();
    const handler = event => {if (!event.isTrusted || !cashout.state.armed) return;
      cashout.disarm('Ручное действие — автоотслеживание выключено');auto.disarm('Ручное действие — авто выключено');};
    selection.element.addEventListener('pointerdown', handler, true);
    selection.element.addEventListener('click', handler, true);
    manualListeners[index] = () => {selection.element.removeEventListener('pointerdown', handler, true);selection.element.removeEventListener('click', handler, true);};
  }
  $('#pick-live').onclick = () => {
    if (cashout.state.pending.length) return;
    cashout.disarm('Выбор счётчика — отслеживание выключено');auto.disarm('Выбор счётчика — авто выключено');
    panel.hidden = true;launcher.hidden = true;
    cancelPicker = pickLiveMultiplier(root, selection => {
      cancelPicker = null;layout();$('.auto-panel').hidden = false;
      if (selection.element) {liveSelection = selection;liveMonitor.setSource(selection);$('#auto-diagnostic').textContent = '';}
      else $('#auto-diagnostic').textContent = selection.error || 'Выбор отменён';
      renderCashout();
    });
  };
  $('#cashout-mode').onchange = event => {
    if (!event.isTrusted) {event.target.value = requestedCashoutMode;return;}
    requestedCashoutMode = event.target.value === 'live' ? 'live' : 'test';cashout.disarm('Режим изменён — отслеживание выключено');
  };
  $('#cashout-toggle').onclick = () => {
    if (cashout.state.armed) {cashout.disarm();return;}
    if (requestedCashoutMode === 'live' && (!liveSelection || selectedButtons.some(button => !button || button.document !== liveSelection.document))) {
      $('#cashout-message').textContent = 'Выбери живой счётчик и оба поля в одном игровом документе';return;
    }
    cashout.arm(requestedCashoutMode);
  };
  function renderAuto() {
    const state = auto.state;
    if (cashout?.state.armed && cashout.state.mode === 'live' && (!state.armed || state.mode !== 'live')) cashout.disarm('Автоставки выключены — автозабирание выключено');
    $('#auto-title').textContent = state.armed ? (state.mode === 'live' ? 'Автонажатия включены' : 'Тест включён') : 'Авто выключено';
    $('#auto-message').textContent = state.message;
    $('#auto-toggle').textContent = state.armed ? 'Выключить' : requestedAutoMode === 'live' ? 'Включить автонажатия' : 'Включить тест';
    $('#auto-toggle').classList.toggle('armed', state.armed);
    $('#auto-open').textContent = state.armed ? state.mode === 'live' ? 'Авто ON' : 'Тест ON' : 'Авто';
    launcher.dataset.auto = state.armed ? state.mode : 'off';
    const checks = auto.checks();
    checks.forEach((checked, i) => {$('#slot-' + i).textContent = `${i + 1} → основной прогноз · ${checked.state === 'ready' ? 'готова' : checked.reason}`;});
    $('#auto-log').replaceChildren(...state.logs.slice(-5).map(entry => {
      const line = document.createElement('div'); line.textContent = clock(entry.at) + ' · ' + entry.text; return line;
    }));
    renderAutoBrief();
  }
  $('#auto-open').onclick = () => {$('.auto-panel').hidden = false; renderAuto();};
  $('#auto-close').onclick = () => {$('.auto-panel').hidden = true;};
  $('#auto-check').onclick = () => {auto.checkOnly();};
  $('#auto-mode').onchange = event => {
    if (!event.isTrusted) {event.target.value = requestedAutoMode; return;}
    requestedAutoMode = event.target.value === 'live' ? 'live' : 'test';
    auto.disarm('Режим изменён — запуск выключен');
  };
  activate($('#auto-toggle'), event => {
    if (auto.state.armed) {auto.disarm(); return;}
    if (!event.isTrusted) return;
    void auto.arm(requestedAutoMode);
  });
  for (const index of [0, 1]) activate($('#pick-' + index), event => {
    if (!event.isTrusted) return;
    if (cashout.state.pending.length) {$('#auto-diagnostic').textContent = 'Сначала выключи отслеживание активного поля';return;}
    cashout.disarm('Выбор кнопки — отслеживание выключено');
    auto.disarm('Выбор кнопки — авто выключено');
    panel.hidden = true; launcher.hidden = true;
    cancelPicker = pickButton(root, index, selection => {
      cancelPicker = null; layout(); $('.auto-panel').hidden = false;
      if (selection.element) {
        try {auto.setButton(index, selection); selectedButtons[index] = selection; watchManualInput(index, selection); frameSupport.invalidate(); $('#auto-diagnostic').textContent = '';}
        catch (error) {$('#auto-diagnostic').textContent = error.message;}
      } else $('#auto-diagnostic').textContent = selection.error || 'Выбор отменён';
      renderAuto();
    });
  });

  const viewport = () => ({left: visualViewport?.offsetLeft || 0, top: visualViewport?.offsetTop || 0,
    width: visualViewport?.width || innerWidth, height: visualViewport?.height || innerHeight});
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), v));
  function layout() {
    const v = viewport(), width = Math.min(ui.width, v.width - 16), height = Math.min(ui.height, v.height - 16);
    const w = ui.collapsed ? 84 : width, h = ui.collapsed ? 43 : height;
    ui.x = clamp(ui.x, v.left + 8, v.left + v.width - w - 8);
    ui.y = clamp(ui.y, v.top + 8, v.top + v.height - h - 8);
    Object.assign(panel.style, {left: ui.x + 'px', top: ui.y + 'px', width: width + 'px', height: height + 'px', opacity: ui.opacity});
    Object.assign(launcher.style, {left: ui.x + 'px', top: ui.y + 'px'});
    panel.hidden = ui.collapsed; launcher.hidden = !ui.collapsed;
    scene.setPaused(ui.collapsed || document.hidden);
  }
  function saveSoon() {
    if (destroyed) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {await gm.setValue(KEY, {model: MODEL, rows: rows.slice(0, 2000), journal: journal.slice(-100), rareJournal: rareJournal.slice(-100), legacyJournal: legacyJournal.slice(-200), selected, ui: {...ui}});}
      catch {storageWarning = true;}
    }, 500);
  }
  function collapse(value) {ui.collapsed = value; layout(); saveSoon();}

  function movable(element, resize = false) {
    let active = null;
    element.addEventListener('pointerdown', event => {
      if (!resize && element !== launcher && event.target.closest('button,a')) return;
      if (event.button !== 0) return;
      event.preventDefault(); element.setPointerCapture(event.pointerId);
      active = {id: event.pointerId, x: event.clientX, y: event.clientY, left: ui.x, top: ui.y, width: ui.width, height: ui.height, moved: false};
    });
    element.addEventListener('pointermove', event => {
      if (!active || event.pointerId !== active.id) return;
      const dx = event.clientX - active.x, dy = event.clientY - active.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) active.moved = true;
      if (resize) {
        const v = viewport();
        ui.width = clamp(active.width + dx, 218, v.width - 16);
        ui.height = clamp(active.height + dy, 265, v.height - 16);
      } else {ui.x = active.left + dx; ui.y = active.top + dy;}
      layout();
    });
    const finish = event => {if (!active) return; const reopen = element === launcher && !active.moved && event.type === 'pointerup'; active = null; saveSoon(); if (reopen && event.isTrusted) collapse(false);};
    element.addEventListener('pointerup', finish); element.addEventListener('pointercancel', finish);
    element.addEventListener('lostpointercapture', finish);
  }
  launcher.addEventListener('click', event => {if (event.isTrusted && event.detail === 0) collapse(false);});
  movable($('.handle')); movable(launcher); movable($('#resize'), true);
  function changeSize(direction) {
    const v = viewport();
    const width = Math.min(ui.width, v.width - 16), height = Math.min(ui.height, v.height - 16);
    ui.width = clamp(width + direction * 30, 218, v.width - 16);
    ui.height = clamp(height + direction * 45, 265, v.height - 16);
    layout(); saveSoon();
  }
  $('#size-up').onclick = () => changeSize(1);
  $('#size-down').onclick = () => changeSize(-1);
  $('#minimize').onclick = () => collapse(true);

  $('#tools-open').onclick = () => {$('#tools').hidden = !$('#tools').hidden; renderStatistics();};
  $('#opacity').onclick = () => {ui.opacity = ui.opacity > .94 ? .82 : ui.opacity > .8 ? .68 : .97; layout(); saveSoon();};
  $('#reset').onclick = () => {Object.assign(ui, {x: 10, y: 115, width: 238, height: 390, opacity: .97}); layout(); saveSoon();};
  for (const button of root.querySelectorAll('[data-target]')) button.onclick = () => {selected = button.dataset.target; saveSoon(); render();};
  $('#history-open').onclick = () => {historyMode = 'recent'; $('.history').hidden = false; renderHistory();};
  $('#history-close').onclick = () => {$('.history').hidden = true;};
  $('#archive-events').onclick = () => {historyMode = 'archive'; $('.history').hidden = false; renderHistory();};
  $('#archive-retry').onclick = () => {if (archive?.state.status === 'error') void archive.retry(); else void archive?.refresh();};
  $('#archive-full').onclick = () => {void archive?.refresh({full: true});};
  $('#statistics-refresh').onclick = () => {void trainStatistics(true);};
  $('#statistics-details').addEventListener('toggle', () => renderStatistics());
  $('#statistics-export').onclick = () => {
    if (!statistics?.state.report) return;
    const blob = new Blob([JSON.stringify(statistics.state.report, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'god-preditor-model-validation.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('#rare-export').onclick = () => {
    // Observation records only. Never export credentials, DOM bindings or auto state.
    const blob = new Blob([JSON.stringify({model: 'rare-alert-v1', evidenceStatus: 'experimental-unvalidated', exportedAt: Date.now(), journal: rareJournal}, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'god-preditor-rare-alerts.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  function renderHistory() {
    const version = historyMode + ':' + archiveRevision + ':' + rows.length + ':' + rows[0]?.id;
    if (version === historyVersion) return;
    historyVersion = version;
    $('#history-title').textContent = historyMode === 'archive' ? 'Архив коэффициентов 100×+' : 'Полученные коэффициенты';
    const displayed = historyMode === 'archive' ? [...(archiveSummary?.largeEvents || [])].reverse() : rows.slice(0, 100);
    if (historyMode === 'archive') $('#history-count').textContent = archiveSummary ? `${displayed.length} результатов ≥100× · весь загруженный архив · Киев` : 'Архив ещё загружается — смотри Настроить → Модели 100×';
    else
    $('#history-count').textContent = `${rows.length} в рабочей истории · последние 100 · время по Киеву${legacyJournal.length ? " · прежних проверок: " + legacyJournal.length : ""}`;
    const fragment = document.createDocumentFragment();
    for (const row of displayed) {
      const line = document.createElement('div'); line.className = 'row';
      const value = document.createElement('b'); value.textContent = number(row.coefficient) + '×';
      const time = document.createElement('time'); time.textContent = historyMode === 'archive' ? new Date(row.timestamp).toLocaleString('ru-RU', {timeZone: 'Europe/Kyiv'}) : clock(row.timestamp);
      line.append(value, time); fragment.append(line);
    }
    $('.history-list').replaceChildren(fragment);
  }
  function renderArchiveStatus() {
    const state = archive?.state;
    if (!state) return;
    const summary = state.summary;
    const label = state.loading ? `Архив загружается: ${number(state.loadedCount || state.count || 0)} раундов` :
      state.status === 'error' ? `Загрузка архива остановлена: ${state.error || 'проверь связь'}` :
        summary ? `Архив: ${number(summary.acceptedRoundCount)} раундов · ${number(summary.rawLargeEventCount)} результатов ≥100×` : 'Архив ещё не загружен';
    const range = summary?.firstAt && summary?.lastAt ? '\n' + new Date(summary.firstAt).toLocaleDateString('ru-RU', {timeZone: 'Europe/Kyiv'}) + ' — ' + new Date(summary.lastAt).toLocaleDateString('ru-RU', {timeZone: 'Europe/Kyiv'}) + ' · исходное время раундов' : '';
    $('#archive-status').textContent = label + range + (state.cacheWarning ? '\nКэш недоступен: архив хранится в памяти этой вкладки' : '');
    $('#archive-retry').disabled = state.loading;
    $('#archive-full').disabled = state.loading;
  }
  async function trainStatistics(force = false) {
    if (destroyed || !statistics || !archive?.state.summary || archive.state.loading || statisticsLoading) return;
    const day = new Date().toLocaleDateString('en-CA', {timeZone: 'Europe/Kyiv'});
    if (!force && statisticsDay === day) return;
    statisticsLoading = true;
    try {
      const history = await archive.getRows();
      if (!destroyed && history?.length) {statisticsDay = day; statistics.train(history, {now: Date.now()});}
    } catch {if (!destroyed) $('#statistics-status').textContent = 'Не удалось прочитать полный архив для моделей; обнови архив';}
    finally {statisticsLoading = false;}
  }
  function renderStatistics() {
    if (!statistics || destroyed) return;
    const state = statistics.state, report = state.report, forecast = state.forecast;
    const progress = state.progress;
    $('#statistics-status').textContent = state.status === 'ready' ? 'Модели рассчитаны · оценки экспериментальные' :
      progress?.day && progress.stage?.startsWith('time-zone') ? `Проверяем временные зоны · ${progress.day}` :
      progress?.day ? `Проверяем ${progress.day} · ${progress.fold || 0}/${progress.folds || 0} дней` :
        state.message || 'Подготовка моделей';
    $('#statistics-refresh').disabled = ['training', 'running', 'fitting'].includes(state.status) || statisticsLoading || archive?.state.loading || !archive?.state.summary;
    $('#statistics-export').disabled = !report;
    const protocol = report?.validation?.protocol;
    const checkedDates = protocol?.folds?.filter(value => value.stage === 'confirmation').map(value => value.day) || [];
    $('#statistics-summary').textContent = report ? `${number(report.history?.acceptedCount || 0)} раундов · обучение только на предыдущих днях.\nДней для подбора: ${protocol?.developmentDays || 0}; для отдельной проверки: ${protocol?.confirmationDays || 0}.${checkedDates.length ? '\nПроверка: ' + checkedDates[0] + ' — ' + checkedDates.at(-1) + ' · Киев.' : ''}\nМоделей с подтверждённой пользой: ${report.validation?.models?.filter(value => value.qualified).length || 0}. Общий сигнал требует отдельной проверки комбинации и согласия разных семейств.\nОценки для следующих раундов не подтверждают выигрыш ставки.` : 'Архив загружается, затем выполняется последовательная проверка на новых днях.';
    const headSignature = JSON.stringify([...new Set(rows.filter(row => row.timestamp === latestStats.lastAt).map(row => row.id))].sort());
    const now = Date.now(), fresh = state.status === 'ready' && sourceReady(status, latestStats, lastSuccessAt, now) &&
      Number.isFinite(forecast?.generatedAt) && now >= forecast.generatedAt && now - forecast.generatedAt <= 180000 &&
      forecast.sourceLastAt === latestStats.lastAt && forecast.sourceLastId === latestStats.lastId &&
      headSignature.length <= 2000 && forecast.sourceHeadSignature === headSignature &&
      Number.isFinite(forecast.sourceLastAt) && now >= forecast.sourceLastAt && now - forecast.sourceLastAt <= 180000;
    if (state.status === 'ready' && !fresh) $('#statistics-status').textContent = 'Ожидаем свежую оценку для текущего раунда';
    const signals = fresh ? forecast?.consensus?.signals || [] : [];
    $('#suite-signal').hidden = signals.length === 0;
    $('#suite-signal').textContent = signals.length ? signals.map(value => `Согласование моделей: ≥${number(value.target)}× · следующие ${value.horizon} раундов\nПоддержано в отдельной проверке; не гарантия события`).join('\n') : '';
    if ($('#tools').hidden || !$('#statistics-details').open) return;
    const key = state.status + ':' + (report?.generatedAt || '') + ':' + (forecast?.generatedAt || '') + ':' + fresh + ':' + headSignature;
    if (statisticsListKey === key) return;
    statisticsListKey = key;
    const names = {'bayesian-hazard-v1': 'Bayesian Hazard', 'weibull-survival-v1': 'Weibull Survival', 'hawkes-exponential': 'Hawkes Process', 'cycle-calibrated-v1': 'Цикл', 'cluster-calibrated-v1': 'Кластер', 'bayesian-time-buckets-300': 'Bayesian Time Buckets', 'multi-day-seasonality-300': 'Multi-day Seasonality'};
    const percent = value => Number.isFinite(value) ? number(value * 100) + '%' : '—';
    const estimates = forecast?.estimates || report?.estimates || [];
    const elements = estimates.map(value => {
      const item = document.createElement('p'); item.className = 'model-estimate';
      const validation = report?.validation?.models?.find(model => model.key === `${value.modelId}:${value.target}:${value.horizon}`);
      const interval = value.interval95?.length === 2 ? `${percent(value.interval95[0])}–${percent(value.interval95[1])}` : 'нет оценки диапазона';
      const heading = names[value.modelId] || value.modelId.replace('temporal-pattern-', 'Temporal Pattern ±').replace('circular-kde-', 'Circular KDE ±');
      const approximation = value.family === 'hawkes' ? '\nПриближение по историческому темпу раундов.' : value.family === 'time' ? '\nОценка по известному сейчас времени; время следующего раунда неизвестно.' : '';
      item.textContent = `${heading} · ≥${number(value.target)}× · ${value.horizon} раунд.\n${value.status === 'ready' ? percent(value.probability) + ' · условный диапазон ' + interval : 'Пока нет устойчивой оценки для этой цели'}${approximation}\nПроверка: ${validation?.qualified ? 'есть подтверждение на последующих днях' : 'преимущество не подтверждено'} · ${validation?.known || 0} окон / ${validation?.dayCount || 0} дней`;
      return item;
    });
    $('#statistics-models').replaceChildren(...elements);
    const zones = fresh ? forecast?.zones || [] : [];
    const timeOfDay = seconds => `${Math.floor(seconds / 3600).toString().padStart(2, '0')}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
    $('#statistics-zones').textContent = zones.length ? zones.map(zone => `Подтверждённая зона ≥${number(zone.target)}×: ${timeOfDay(zone.centerSecond)} ±${zone.radiusSeconds} сек · Киев\n${zone.insideHits}/${zone.insideRounds} попаданий; проверка ${zone.confirmationDays} дней.`).join('\n\n') : 'Устойчивые текущие временные зоны пока не подтверждены.';
  }
  function render() {
    if (destroyed) return;
    const now = Date.now(), stats = analyze(rows, now);
    latestStats = stats;
    const result = advanceJournal(journal, rows, stats, now, true, {online: status === 'connected', lastSuccessAt});
    journal = result.journal; host.dataset.ready = String(stats.ready); host.dataset.continuityCount = String(stats.continuityCount); if (result.changed) saveSoon();
    // Cache expensive quantiles per data revision/minute, while rechecking source
    // freshness each render. This isolated journal is never passed to auto/cashout.
    const rareKey = rowsRevision + ':' + archiveRevision + ':' + Math.floor(now / 60000) + ':' + (stats.fresh === true);
    if (rareKey !== rareAnalysisKey) {
      rareAnalysis = archiveSummary ? analyzeRareArchive(rows.slice(0, RARE_HISTORY_LIMIT), archiveSummary, now) : analyzeRareWindows(rows.slice(0, RARE_HISTORY_LIMIT), now);
      rareAnalysisKey = rareKey;
    }
    if (statistics && statisticsPredictKey !== rareKey) {statisticsPredictKey = rareKey; statistics.predict(rows.slice(0, RARE_HISTORY_LIMIT), {now});}
    renderStatistics();
    const rare = advanceRareAlerts(rareJournal, rows, {analysis: rareAnalysis, bigForecast: current('big'), now, online: status === 'connected', lastSuccessAt});
    rareJournal = rare.journal; if (rare.changed) saveSoon();
    const rareView = formatRarePresentation({analysis: rareAnalysis, alerts: rare, now, online: status === 'connected', lastSuccessAt});
    $('#rare-alert').hidden = !rareView.banner;
    $('#rare-title').textContent = rareView.banner?.title || '';
    $('#rare-window').textContent = rareView.banner?.windowLabel || '';
    $('#rare-detail').textContent = rareView.banner?.detail || '';
    $('#rare-diagnostics').textContent = rareView.diagnostics.join('\n\n');
    $('#rare-result').textContent = rareView.journalLabel;
    const forecast = current(selected), occupied = stats.ready && forecast && now <= forecast.end;
    $('#status').className = 'status' + (status === 'error' ? ' error' : !stats.fresh && rows.length ? ' warn' : '');
    $('#status').textContent = status === 'error' ? (host.dataset.error || 'Ошибка связи · открой «Настроить»') :
      status === 'connected' ? (stats.fresh ? `● Supabase · ${rows.length} · Киев` : '● Связь есть · история устарела') :
      status === 'paused' ? 'Пауза в фоне' : 'Подключение к нашему Supabase…';
    if (storageWarning) $('#status').textContent += ' · сохранение недоступно';
    const signature = rows.slice(0, 5).map(x => x.id).join('|');
    if ($('.recent').dataset.signature !== signature) {
      $('.recent').dataset.signature = signature;
      $('.recent').replaceChildren(...rows.slice(0, 5).map(row => {
        const chip = document.createElement('div'); chip.className = 'chip' + (row.coefficient < 2 ? ' low' : '');
        const value = document.createElement('b'); value.textContent = number(row.coefficient) + '×';
        const time = document.createElement('time'); time.textContent = clock(row.timestamp); chip.append(value, time); return chip;
      }));
    }
    $('#signal').textContent = stats.ready && occupied ? number(forecast.target) + '×' : stats.n && !stats.fresh ? 'Пауза' : '—';
    $('#window').textContent = !stats.ready ? 'Пауза · нужно 20 свежих\nпоследовательных раундов' : forecast && occupied ? `${clock(forecast.start)} — ${clock(forecast.end)}\nОкно · Киев` :
      forecast?.status === 'pending' ? 'Проверяем покрытие окна' : selected === 'big' && stats.ready ? 'Дополнительного окна сейчас нет' : 'Нужно 20 раундов\nи свежий поток';
    $('#note').textContent = forecast && occupied ?
      `${now < forecast.start ? 'До окна ' + duration(forecast.start - now) : 'До конца ' + duration(forecast.end - now)} · ${forecast.pattern} · балл ${forecast.heuristicScore}/100 · эксперимент` : 'Балл правила не равен вероятности выигрыша';
    launcher.querySelector('span').textContent = stats.ready && occupied ? number(forecast.target) + '×' : '…';
    for (const button of root.querySelectorAll('[data-target]')) button.classList.toggle('active', button.dataset.target === selected);
    const completed = [...journal].reverse().find(x => x.channel === selected && ['hit', 'miss', 'unknown'].includes(x.status));
    const key = completed ? completed.key + completed.status : '';
    if (key !== latestResult) {
      latestResult = key; $('#result').className = 'result ' + (completed?.status || '');
      $('#result-image').hidden = !completed || completed.status === 'unknown';
      if (completed && completed.status !== 'unknown') $('#result-image').src = ASSETS + `result-${completed.status}.webp`;
    }
    $('#result-label').textContent = completed ? (completed.status === 'hit' ? 'ЦЕЛЬ В ОКНЕ' : completed.status === 'miss' ? 'НИЖЕ ЦЕЛИ В ОКНЕ' : 'НЕТ ДАННЫХ') +
      (completed.actual != null ? ' · макс. окна ' + number(completed.actual) + '×' : '') : 'Проверка: достижение цели в окне';
    if (!$('.history').hidden) renderHistory();
    if (!$('.auto-panel').hidden) {renderAuto();renderCashout();}
  }
  const fetchImpl = createExtensionFetch(gm, SUPABASE_CONFIG);
  let cache = null;
  try {cache = createArchiveCache({name: 'god-preditor-archive-v1:' + new URL(SUPABASE_CONFIG.url).hostname + ':' + SUPABASE_CONFIG.table});}
  catch { /* Safari may deny third-party IndexedDB; the archive can stay in memory. */ }
  statistics = createStatisticsRunner({canRunFallback: () => !document.hidden && !destroyed && !auto.state.armed && !cashout.state.armed, onChange(state) {
    if (destroyed) return;
    const changed = latestStatisticsReport !== state.report;
    latestStatisticsReport = state.report;
    renderStatistics();
    if (changed && state.report) statistics.predict(rows.slice(0, RARE_HISTORY_LIMIT), {now: Date.now()});
  }});
  archive = createArchiveService({config: SUPABASE_CONFIG, fetchImpl, cache, onChange(state) {
    if (destroyed) return;
    const changed = archiveSummary !== state.summary;
    archiveSummary = state.summary;
    if (changed) {archiveRevision++; render();}
    if (state.status === 'complete' && !state.loading) void trainStatistics();
    renderArchiveStatus();
  }});
  function startFeed() {
    if (destroyed || document.hidden) return;
    feed?.stop(); status = 'connecting';
    feed = createSupabaseFeed(SUPABASE_CONFIG, {
      fetchImpl,
      onRounds(batch, {initial = false} = {}) {
        if (destroyed) return;
        const seen = new Set(rows.map(x => x.id));
        rows = mergeRounds(rows, batch, 'Supabase · LuckyJet').rounds;
        rowsRevision++;
        scene.push(batch.filter(x => !seen.has(x.id)), {initial});
        saveSoon(); render();
      },
      onStatus(s) {
        if (destroyed) return;
        status = s.state; if (s.lastSuccess) lastSuccessAt = s.lastSuccess;
        if (s.state === 'error') {cashout.disarm('Ошибка связи — отслеживание выключено');auto.disarm('Ошибка связи — авто выключено');}
        if (s.message) host.dataset.error = s.message;
        render();
      },
    });
    render();
  }
  $('#retry').onclick = startFeed;
  const onVisibility = () => {
    if (document.hidden) {cashout.disarm('Safari ушёл в фон — отслеживание выключено');auto.disarm('Safari ушёл в фон — авто выключено'); cancelPicker?.(); feed?.stop(); feed = null; status = 'paused'; scene.setPaused(true);}
    else {layout(); startFeed(); statistics?.resume();}
  };
  const onPageHide = () => {cashout.disarm('Страница закрыта — отслеживание выключено');auto.disarm('Страница закрыта — авто выключено'); cancelPicker?.(); feed?.stop(); feed = null; scene.setPaused(true);};
  const onPageShow = event => {if (event.persisted && !document.hidden) {layout(); startFeed();}};
  const onResize = () => layout();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide); window.addEventListener('pageshow', onPageShow);
  window.addEventListener('resize', onResize); visualViewport?.addEventListener('resize', onResize); visualViewport?.addEventListener('scroll', onResize);
  const observer = new MutationObserver(() => {if (!destroyed && !document.documentElement.contains(host)) document.documentElement.append(host);});
  observer.observe(document.documentElement, {childList: true});
  const tick = setInterval(() => {if (!document.hidden) render();}, 1000);
  const archiveTick = setInterval(() => {if (!document.hidden && !destroyed && archive && !archive.state.loading) void archive.refresh();}, 15 * 60000);
  const autoTick = setInterval(() => {void auto.tick().catch(() => auto.disarm('Ошибка авто — режим выключен'));}, 250);
  let cashoutFrame = null, lastCashoutRender = 0;
  function cashoutLoop() {
    if (destroyed) return;
    if (!document.hidden) {
      try {cashout.tick();} catch {cashout.disarm('Ошибка отслеживания — выключено');auto.disarm('Ошибка отслеживания — авто выключено');}
      if (!$('.auto-panel').hidden && performance.now() - lastCashoutRender > 250) {renderCashout();lastCashoutRender = performance.now();}
    }
    cashoutFrame = requestAnimationFrame(cashoutLoop);
  }
  cashoutFrame = requestAnimationFrame(cashoutLoop);
  closeOverlay = $('#close').onclick = () => {
    cashout.disarm('Панель закрыта — отслеживание выключено');liveMonitor.clear();manualListeners.forEach(stop => stop?.());cancelAnimationFrame(cashoutFrame);
    auto.disarm('Панель закрыта — авто выключено'); cancelPicker?.();
    destroyed = true; if (window !== window.top) frameSupport.stop(); clearInterval(tick); clearInterval(archiveTick); clearInterval(autoTick); clearTimeout(saveTimer); feed?.stop(); archive?.stop(); statistics?.stop(); scene.destroy(); observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide); window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('resize', onResize); visualViewport?.removeEventListener('resize', onResize); visualViewport?.removeEventListener('scroll', onResize);
    host.remove();
  };
  const brandImage = $('#brand-image');
  brandImage.onload = () => {brandImage.hidden = false; $('#brand-text').hidden = true;};
  brandImage.onerror = () => {brandImage.hidden = true; $('#brand-text').hidden = false;};
  brandImage.src = ASSETS + 'god-preditor-original.webp';
  $('.vip').src = ASSETS + 'vip-original.webp';
  $('.vip').onerror = event => {event.target.hidden = true;};
  $('#result-image').onerror = () => {$('#result-image').hidden = true;};
  for (const button of root.querySelectorAll('button')) {
    if (button === launcher || !button.onclick) continue;
    const handler = button.onclick; button.onclick = null; activate(button, handler);
  }
  layout(); render();
  try {
    const saved = await loadPanelState(gm, MODEL, {key: KEY, legacyKey: LEGACY_KEY});
    if (saved && !destroyed) {
      rows = mergeRounds([], Array.isArray(saved.rows) ? saved.rows : [], 'Supabase · LuckyJet').rounds;
      rowsRevision++;
      journal = saved.model === MODEL && Array.isArray(saved.journal) ? saved.journal.slice(-100) : [];
      rareJournal = Array.isArray(saved.rareJournal) ? saved.rareJournal : [];
      legacyJournal = saved.legacyJournal;
      selected = saved.selected === 'big' ? 'big' : 'primary';
      if (saved.ui && typeof saved.ui === 'object') {
        for (const key of ['x', 'y', 'width', 'height', 'opacity']) if (Number.isFinite(saved.ui[key])) ui[key] = saved.ui[key];
        ui.width = clamp(ui.width, 218, 600); ui.height = clamp(ui.height, 265, 700); ui.opacity = clamp(ui.opacity, .6, 1);
        ui.collapsed = saved.ui.collapsed === true;
      }
      layout(); render();
    }
  } catch {storageWarning = true;}
  await auto.initialize();
  startFeed();
  void archive.start();
}

if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
  void start(GM).catch(error => console.error('GOD PREDITOR:', error.message));
}
