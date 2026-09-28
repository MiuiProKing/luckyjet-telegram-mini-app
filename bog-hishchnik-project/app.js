(() => {
  'use strict';
  const API = 'https://xrniwkvfrtchtxjrwwgd.supabase.co/functions/v1/v0xff3-live';
  const MODEL_SIZE = 2000, DISPLAY_PAGE = 200, SIGNAL_STORAGE = 'bog-hishchnik-signals-20260928-v2';
  const Model = window.BHModel, Data = window.BHData, $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const time = n => new Date(n).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const number = n => Number(n || 0).toLocaleString('ru-RU');
  const coef = n => Number(n).toFixed(2) + '×';
  const today = () => Data.dayKey(Date.now());
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  let lastSuccess = 0, lastFailure = '', polling = false, pollTimer = null, socket = null, socketReady = false, socketTimer = null, socketDelay = 1500, lastSocketRound = 0;
  let view = 'live', forecastMode = 'normal', selectedDay = today(), minCoef = 1, shown = DISPLAY_PAGE, archiveJob = null, initialLoading = true;
  let lastLiveSignature = '', modelRevision = -1, toastTimer = null, signals = { normal: null, vip: null }, knownNewestId = '';
  const closedGroups = new Set();

  async function request(offset = 0, limit = 500) {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 12000);
    try {
      const url = new URL(API); url.searchParams.set('limit', String(limit)); url.searchParams.set('offset', String(offset)); url.searchParams.set('t', String(Date.now()));
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: abort.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Сервер ответил HTTP ' + response.status);
      const body = await response.json();
      if (!body.ok || !Array.isArray(body.history) || !Number.isFinite(Number(body.total))) throw new Error('Непонятный ответ базы');
      lastSuccess = Date.now(); lastFailure = ''; return body;
    } catch (error) {
      lastFailure = error.name === 'AbortError' ? 'Сервер не ответил за 12 секунд' : error.message;
      throw new Error(lastFailure);
    } finally { clearTimeout(timer); }
  }
  const archive = new Data.Archive(request, { pageSize: 500, overlap: 40 });
  const modelRows = () => archive.rows().slice(0, MODEL_SIZE);
  const newest = () => archive.rows()[0];
  const age = () => newest() ? Date.now() - newest().timestamp : Infinity;
  const fresh = () => age() >= -30000 && age() <= 180000 && Date.now() - lastSuccess < 20000;

  function notify(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
  }
  function roundMarkup(row, isNew = false) {
    const style = row.coefficient < 2 ? 'low' : row.coefficient < 10 ? 'medium' : 'high';
    const title = new Date(row.timestamp).toLocaleString('ru-RU') + ' · ID ' + row.id + (row.estimated ? ' · время приблизительное' : '');
    return '<div class="round ' + style + (row.coefficient >= 100 ? ' mega' : '') + (isNew ? ' new' : '') + '" title="' + escape(title) + '"><strong>' + coef(row.coefficient) + '</strong><time datetime="' + new Date(row.timestamp).toISOString() + '">' + time(row.timestamp) + (row.estimated ? ' ≈' : '') + '</time></div>';
  }
  function renderLive() {
    const rows = archive.rows(), stats = Model.stats(rows.slice(0, 100));
    $('statAvg').textContent = stats.count ? coef(stats.average) : '—';
    $('statMax').textContent = stats.count ? coef(stats.maximum) : '—';
    $('stat2').textContent = stats.count ? Math.round(stats.at2) + '%' : '—';
    $('stat10').textContent = stats.count ? Math.round(stats.at10) + '%' : '—';
    const recent = rows.slice(0, 40), signature = recent.map(r => r.id + ':' + r.coefficient).join('|');
    if (signature !== lastLiveSignature) {
      const oldSignature = lastLiveSignature; lastLiveSignature = signature;
      $('liveGrid').innerHTML = recent.map((r, i) => roundMarkup(r, i === 0 && Boolean(oldSignature))).join('') || '<p class="empty">В базе пока нет доступных раундов.</p>';
    }
    $('liveNote').textContent = 'Последние ' + Math.min(40, rows.length) + ' раундов · записей в базе ' + number(archive.total) + '. Объединено вероятных технических повторов: ' + number(archive.hiddenDuplicates) + '. Одинаковые коэффициенты с настоящими ID разных раундов сохраняются.';
    $('modelSample').textContent = 'В модели ' + number(Math.min(MODEL_SIZE, rows.length)) + ' / ' + number(MODEL_SIZE) + ' раундов';
    renderStatus();
  }
  function renderStatus() {
    $('clock').textContent = time(Date.now());
    const latest = newest(), seconds = latest ? Math.max(0, Math.floor(age() / 1000)) : null, futureTime = age() < -30000;
    const serverOk = Date.now() - lastSuccess < 20000;
    let label = 'Подключение', cls = 'waiting';
    if (futureTime && serverOk) { label = 'Проверьте время'; cls = 'waiting'; }
    else if (latest && serverOk && seconds <= 90) { label = 'Данные обновляются'; cls = 'good'; }
    else if (latest && serverOk) label = 'Ожидаем новый раунд';
    else if (lastFailure) { label = 'Нет связи с базой'; cls = 'error'; }
    $('connection').className = 'connection ' + cls; $('connection').lastElementChild.textContent = label;
    $('liveAge').textContent = latest ? 'Последний раунд: ' + time(latest.timestamp) : 'Ожидание данных';
    $('sourceMode').textContent = socketReady && Date.now() - lastSocketRound < 90000 ? 'Поток событий · ' + seconds + ' с назад' : latest ? 'Проверка базы каждую секунду · ' + (seconds >= 60 ? Math.floor(seconds / 60) + ' мин ' : '') + (seconds % 60) + ' с' : 'Подключаю историю';
    $('diagTotal').textContent = number(archive.total); $('diagLoaded').textContent = number(archive.map.size);
    if (futureTime) $('sourceMode').textContent = 'Время записи опережает часы устройства';
    $('diagLatest').textContent = latest ? new Date(latest.timestamp).toLocaleString('ru-RU') : '—';
    $('diagPoll').textContent = lastSuccess ? time(lastSuccess) : '—';
    $('diagEstimated').textContent = String(modelRows().filter(r => r.estimated).length);
    $('diagTransport').textContent = socketReady ? 'Поток событий + проверка базы' : 'Проверка базы каждую секунду';
    $('diagnosticMessage').textContent = lastFailure || (seconds > 180 ? 'Связь с базой есть, но новых раундов давно нет. Причину нужно проверять в сборщике; новые сигналы при устаревшей истории приостановлены.' : 'Источник: наша база Supabase. При обрыве потока страница продолжает проверять базу. Работа серверного сборщика не зависит от открытого раздела страницы.');
    document.querySelectorAll('[data-countdown]').forEach(el => {
      const state = signals[el.dataset.countdown], s = state?.value;
      if (!s) return;
      const now = Date.now(), end = s.endsAt, remaining = Math.max(0, Math.ceil(((now < s.at ? s.at : end) - now) / 1000));
      const clock = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(Math.floor(remaining % 60)).padStart(2, '0');
      el.textContent = now >= end ? 'Окно завершено · ожидаем новый анализ' : now < s.at ? 'До начала ' + clock : 'До конца окна ' + clock;
    });
    if (futureTime) $('diagnosticMessage').textContent = 'Метка последнего результата находится в будущем относительно часов устройства. Проверьте время устройства и сборщика. Автоматическая поправка не применяется; новые сигналы временно приостановлены.';
  }
  function restoreSignals() {
    try {
      const saved = JSON.parse(localStorage.getItem(SIGNAL_STORAGE) || 'null');
      for (const kind of ['normal', 'vip']) {
        const state = saved?.[kind], value = state?.value;
        if (value && ['at', 'endsAt', 'target', 'score', 'generatedAt'].every(k => Number.isFinite(value[k])) && value.generatedAt <= Date.now() && Date.now() - value.generatedAt < 3600000 && value.endsAt > Date.now()) signals[kind] = state;
      }
    } catch (_) { /* Browser storage is optional. */ }
  }
  function updateSignals(force = false) {
    const rows = modelRows(), now = Date.now(), key = (rows[0]?.id || '') + ':' + rows.length + ':' + (rows.at(-1)?.id || '');
    let changed = force || modelRevision !== archive.revision;
    for (const kind of ['normal', 'vip']) {
      const old = signals[kind];
      if (old?.value && now < Math.max(old.value.endsAt, old.value.generatedAt + 60000)) continue;
      if (!initialLoading && fresh() && rows.length >= 20 && (!old || old.inputKey !== key)) {
        signals[kind] = { inputKey: key, value: kind === 'normal' ? Model.predictNormal(rows, now) : Model.predictVip(rows, now), computedAt: now };
        changed = true;
      }
    }
    if (changed || !fresh()) {
      drawSignal('normal'); drawSignal('vip');
      try { localStorage.setItem(SIGNAL_STORAGE, JSON.stringify(signals)); } catch (_) { /* optional */ }
    }
    modelRevision = archive.revision;
    const normal = signals.normal?.value, vip = signals.vip?.value;
    $('normalPreview').textContent = normal && normal.endsAt > now ? coef(normal.target) + ' · ' + normal.pattern : rows.length < 20 ? 'Набираю историю…' : 'Ожидаем свежий расчёт';
    $('normalPreviewTime').textContent = normal && normal.endsAt > now ? time(normal.at) + ' — ' + time(normal.endsAt) : fresh() ? 'Анализ обновится по новым данным' : 'Нужны свежие раунды из источника';
    $('vipPreview').textContent = vip && vip.endsAt > now ? coef(vip.target) + ' · ' + vip.pattern : 'Ожидание условий';
    $('vipPreviewTime').textContent = vip && vip.endsAt > now ? time(vip.at) + ' — ' + time(vip.endsAt) : 'Циклы 100× и кластеры крупных коэффициентов';
    renderStatus();
  }
  function drawSignal(kind) {
    const s = signals[kind]?.value, vip = kind === 'vip', container = vip ? $('signalVip') : $('signalNormal'), rows = modelRows();
    if (!s) {
      const c = Model.describeVip(rows);
      container.innerHTML = '<article class="signal-card ' + (vip ? 'vip' : '') + '"><div class="signal-head"><span class="tag">' + (vip ? 'VIP / КРУПНЫЕ РЕЗУЛЬТАТЫ' : 'ОБЫЧНЫЙ АНАЛИЗ') + '</span><span class="state-tag">Ожидание</span></div><h2>' + (vip ? 'Сигнал появится при совпадении условий' : rows.length < 20 ? 'Нужно не менее 20 раундов' : 'Ожидаем свежие данные') + '</h2><p>' + (vip ? 'Наличие большой серии само по себе не гарантирует новый крупный коэффициент. В ожидании показываем фактическую выборку.' : 'Первый расчёт выполняется автоматически после загрузки актуальной истории.') + '</p>' + (vip ? '<div class="vip-counters"><div><strong>' + c.above20 + ' / 6</strong><span>результатов от 20×</span></div><div><strong>' + c.above50 + ' / 3</strong><span>результатов от 50×</span></div><div><strong>' + c.above100 + '</strong><span>результатов от 100×</span></div></div><div class="signal-basis">Для кластерного правила нужны оба первых условия в последних 80 раундах. Сейчас доступно ' + c.count + ' из 80. Циклы 100× дополнительно проверяются по всей выборке модели.</div>' : '') + '</article>';
      return;
    }
    const now = Date.now(), expired = now >= s.endsAt, state = !fresh() ? 'История устарела' : expired ? 'Окно завершено' : now < s.at ? 'Сигнал закреплён' : 'Окно сигнала';
    container.innerHTML = '<article class="signal-card ' + (vip ? 'vip' : '') + '"><div class="signal-head"><span class="tag">' + (vip ? 'VIP / КРУПНЫЕ РЕЗУЛЬТАТЫ' : 'ОБЫЧНЫЙ АНАЛИЗ') + '</span><span class="state-tag">' + state + '</span></div><h2>' + escape(s.pattern) + '</h2><div class="signal-main"><div><div class="signal-label">Цель по правилам</div><div class="signal-target">' + coef(s.target) + '</div></div><div class="signal-window"><div class="signal-label">Начало — конец окна</div><div class="window-time">' + time(s.at) + '<br>— ' + time(s.endsAt) + '</div><div class="countdown" data-countdown="' + kind + '"></div></div><div class="signal-score"><div class="signal-label">Оценка правил</div><div class="score-number">' + s.score + '<span>/ 100</span></div><div class="meter"><i style="width:' + Math.min(100, Math.max(0, s.score)) + '%"></i></div></div></div><div class="signal-basis">' + escape(s.basis) + '<br>Выборка: ' + number(s.sample) + ' раундов. ' + (vip ? 'Цели достигали ' + s.hits + ' из ' + s.sampleRecent + ' последних раундов.' : '') + '</div>' + (s.estimated ? '<p class="signal-warning">Временные метки части истории приблизительные. Правила циклов и времени суток для такой выборки отключены.</p>' : '') + (!fresh() ? '<p class="signal-warning">Источник пока не подтвердил свежие данные. Отображается ранее рассчитанный сигнал.</p>' : '') + '</article>';
  }
  function filteredHistory() {
    return archive.rows().filter(r => (!selectedDay || Data.dayKey(r.timestamp) === selectedDay) && r.coefficient >= minCoef);
  }
  function renderHistory() {
    const rows = filteredHistory(), stats = Model.stats(rows), covered = selectedDay ? archive.coveredDay(selectedDay) : archive.complete;
    $('historyCount').textContent = number(stats.count); $('historyAvg').textContent = stats.count ? coef(stats.average) : '—'; $('historyMax').textContent = stats.count ? coef(stats.maximum) : '—';
    $('historyCoverage').textContent = archiveJob ? (archiveJob.stop ? 'Останавливаю загрузку…' : archiveJob.mode === 'all' ? 'Загружаю весь доступный архив…' : 'Загружаю выбранный день…') : covered ? (selectedDay ? 'Выбранный день загружен полностью' : 'Доступный архив загружен до конца') : 'Статистика по загруженной части истории';
    const oldest = archive.oldestScanned ? new Date(archive.oldestScanned).toLocaleString('ru-RU') : '—';
    $('archiveProgress').textContent = number(archive.map.size) + ' записей получено / ' + number(archive.total) + ' в базе · после фильтра повторов ' + number(archive.rows().length) + ' · просмотрено до ' + oldest + (archive.invalid.size ? ' · пропущено некорректных записей: ' + archive.invalid.size : '');
    $('loadDay').hidden = !selectedDay || covered || Boolean(archiveJob); $('loadAll').textContent = archiveJob ? 'Остановить загрузку' : archive.complete ? 'Архив загружен' : 'Загрузить весь архив';
    $('loadAll').disabled = archive.complete && !archiveJob; $('allDates').setAttribute('aria-pressed', String(!selectedDay));
    $('prevDay').disabled = !selectedDay; $('nextDay').disabled = !selectedDay || selectedDay >= today();
    $('hourlyScope').textContent = covered ? 'Полная загруженная выборка' : 'Неполная загруженная выборка';
    const hours = Array(24).fill(0); for (const row of rows) hours[new Date(row.timestamp).getHours()]++;
    const peak = Math.max(1, ...hours);
    $('hourlyChart').innerHTML = hours.map((n, hour) => '<div class="hour-bar" title="' + hour + ':00 — ' + n + ' раундов"><i style="height:' + Math.max(2, Math.round(n / peak * 67)) + 'px"></i><span>' + String(hour).padStart(2, '0') + '</span></div>').join('');
    const visible = rows.slice(0, shown), groups = new Map();
    for (const row of visible) { const key = Data.dayKey(row.timestamp) + '/' + new Date(row.timestamp).getHours(); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
    $('historyGroups').innerHTML = Array.from(groups.entries()).map(([key, group]) => {
      const hour = new Date(group[0].timestamp).getHours(), label = String(hour).padStart(2, '0') + ':00 — ' + String((hour + 1) % 24).padStart(2, '0') + ':00';
      const allInHour = rows.filter(r => Data.dayKey(r.timestamp) + '/' + new Date(r.timestamp).getHours() === key);
      const s = Model.stats(allInHour), date = new Date(group[0].timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      return '<details class="hour-group" data-group="' + key + '"' + (closedGroups.has(key) ? '' : ' open') + '><summary><strong>' + label + '<small>' + date + '</small></strong><span class="hour-details"><span>' + (group.length < allInHour.length ? group.length + ' из ' : '') + allInHour.length + ' раундов</span><span>сред. <b>' + coef(s.average) + '</b></span><span>макс. <b>' + coef(s.maximum) + '</b></span></span></summary><div class="round-grid">' + group.map(r => roundMarkup(r)).join('') + '</div></details>';
    }).join('') || '<div class="empty"><strong>' + (covered ? 'Раунды не найдены' : 'Эта часть истории ещё не загружена') + '</strong>' + (covered ? 'Измените дату или фильтр коэффициентов.' : 'Нажмите «Загрузить выбранный день» или откройте весь архив.') + '</div>';
    document.querySelectorAll('.hour-group').forEach(el => el.addEventListener('toggle', () => { if (el.open) closedGroups.delete(el.dataset.group); else closedGroups.add(el.dataset.group); }));
    $('historyShown').textContent = 'Показано ' + number(visible.length) + ' из ' + number(rows.length) + ' загруженных по фильтру';
    $('historyMore').hidden = visible.length >= rows.length && covered; $('historyMore').disabled = Boolean(archiveJob);
    $('historyMore').textContent = visible.length < rows.length ? 'Показать ещё ' + Math.min(DISPLAY_PAGE, rows.length - visible.length) : 'Загрузить старые раунды';
    $('exportCsv').title = covered ? 'Скачать всю выбранную историю' : 'Скачать только загруженную часть выбранной истории';
  }
  function render() { renderLive(); updateSignals(); if (view === 'history') renderHistory(); }
  async function loadArchive(mode) {
    if (archiveJob) { archiveJob.stop = true; renderHistory(); return; }
    const job = { mode, day: selectedDay, stop: false }; archiveJob = job; renderHistory();
    try {
      if (archive.ended && !archive.complete) { archive.resets = 0; archive.repairPasses = 0; archive.resetScan(); }
      while (!job.stop && !archive.complete && !archive.ended && !(mode === 'day' && job.day && archive.coveredDay(job.day))) {
        await archive.loadNext(); render(); await delay(120);
      }
      if (!job.stop && !archive.complete && archive.ended) notify('Сервер дошёл до конца, но полнота архива не подтверждена. Часть данных могла измениться во время чтения.');
      else if (!job.stop) notify(mode === 'day' ? 'Данные выбранного дня загружены.' : 'Доступный архив загружен. Можно менять фильтры и скачать CSV.');
    } catch (error) { notify('Загрузка остановлена: ' + error.message); }
    finally { if (archiveJob === job) archiveJob = null; renderHistory(); }
  }
  async function pollOnce() {
    if (polling) return; polling = true;
    try {
      const body = await request(0, 1), latest = Data.normalize(body.history[0] || {}), previousId = knownNewestId;
      archive.ingest(body.history, body.total);
      if (latest && latest.id !== knownNewestId) {
        knownNewestId = latest.id;
        const catchup = await request(0, 200); archive.ingest(catchup.history, catchup.total);
        if (previousId && !catchup.history.some(r => String(r.id) === previousId) && !archiveJob && !archive.pending) archive.resetScan();
        render();
      } else renderStatus();
    } catch (_) { renderStatus(); }
    finally { polling = false; }
  }
  async function pollLoop() { await pollOnce(); pollTimer = setTimeout(pollLoop, 1000); }
  function connectStream() {
    if (socket && socket.readyState < 2) return;
    try {
      const ws = new WebSocket(API.replace(/^https:/, 'wss:') + '?mode=live'); socket = ws;
      ws.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'status') { socketReady = message.status === 'connected'; if (socketReady) socketDelay = 1500; }
          if (message.type === 'round' && message.round) {
            const row = Data.normalize(message.round); if (!row) return;
            const added = archive.ingest([message.round]); if (added) archive.total = Math.max(archive.total + added, archive.map.size);
            knownNewestId = archive.rows()[0]?.id || knownNewestId; lastSocketRound = Date.now(); lastSuccess = Date.now(); socketReady = true;
            render();
          }
        } catch (_) { /* Malformed frames do not interrupt the database fallback. */ }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (socket === ws) socket = null; socketReady = false; clearTimeout(socketTimer);
        socketTimer = setTimeout(connectStream, socketDelay); socketDelay = Math.min(30000, Math.round(socketDelay * 1.7)); renderStatus();
      };
    } catch (_) { clearTimeout(socketTimer); socketTimer = setTimeout(connectStream, 15000); }
  }
  function navigate() {
    const route = location.hash.slice(1), next = route === 'vip' ? 'forecast' : ['live', 'forecast', 'history', 'method'].includes(route) ? route : 'live';
    view = next; if (route === 'vip') forecastMode = 'vip';
    document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== 'view-' + view; });
    document.querySelectorAll('[data-view]').forEach(el => { if (el.dataset.view === view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
    $('viewName').textContent = { live: 'ПРЯМОЙ ЭФИР', forecast: 'ПРОГНОЗЫ', history: 'ИСТОРИЯ', method: 'МЕТОДИКА' }[view];
    chooseMode(forecastMode); if (view === 'history') renderHistory(); renderStatus();
  }
  function chooseMode(kind) {
    forecastMode = kind; $('tabNormal').setAttribute('aria-selected', String(kind === 'normal')); $('tabVip').setAttribute('aria-selected', String(kind === 'vip'));
    $('signalNormal').hidden = kind !== 'normal'; $('signalVip').hidden = kind !== 'vip';
  }
  function chooseDay(day) {
    selectedDay = day; if (day) $('historyDate').value = day;
    shown = DISPLAY_PAGE; closedGroups.clear(); renderHistory();
  }
  function stepDay(amount) { if (!selectedDay) return; const d = new Date(selectedDay + 'T12:00:00'); d.setDate(d.getDate() + amount); chooseDay(Data.dayKey(d.getTime())); }
  function exportCsv() {
    const rows = filteredHistory(); if (!rows.length) { notify('Для экспорта сначала загрузите раунды выбранной даты.'); return; }
    const cell = value => { let s = String(value); if (/^[=+@\-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const contents = [['ID раунда', 'Коэффициент', 'Время UTC', 'Местное время', 'Время приблизительное'], ...rows.map(r => [r.id, r.coefficient.toFixed(2).replace('.', ','), new Date(r.timestamp).toISOString(), new Date(r.timestamp).toLocaleString('ru-RU'), r.estimated ? 'да' : 'нет'])].map(row => row.map(cell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + contents], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = 'bog-hishchnik-' + (selectedDay || 'archive') + '.csv'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
    notify(number(rows.length) + ' раундов экспортировано' + (!(selectedDay ? archive.coveredDay(selectedDay) : archive.complete) ? '. Внимание: это загруженная часть архива.' : '.'));
  }

  $('timezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('historyDate').value = selectedDay; $('historyDate').max = today();
  $('tabNormal').addEventListener('click', () => chooseMode('normal')); $('tabVip').addEventListener('click', () => chooseMode('vip'));
  $('historyDate').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value <= today()) chooseDay(e.target.value); });
  $('prevDay').addEventListener('click', () => stepDay(-1)); $('nextDay').addEventListener('click', () => stepDay(1));
  $('today').addEventListener('click', () => chooseDay(today())); $('allDates').addEventListener('click', () => chooseDay(''));
  $('minCoefficient').addEventListener('change', e => { minCoef = Number(e.target.value); shown = DISPLAY_PAGE; renderHistory(); });
  $('loadDay').addEventListener('click', () => loadArchive('day')); $('loadAll').addEventListener('click', () => loadArchive('all'));
  $('historyMore').addEventListener('click', async () => {
    if (filteredHistory().length > shown) { shown += DISPLAY_PAGE; renderHistory(); return; }
    if (selectedDay) { await loadArchive('day'); return; }
    $('historyMore').disabled = true;
    try { await archive.loadNext(); shown += DISPLAY_PAGE; render(); } catch (e) { notify(e.message); }
    finally { renderHistory(); }
  });
  $('exportCsv').addEventListener('click', exportCsv); $('refresh').addEventListener('click', async () => { await pollOnce(); notify(lastFailure || 'База проверена: ' + time(lastSuccess)); });
  window.addEventListener('hashchange', navigate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { pollOnce(); connectStream(); updateSignals(true); } });
  restoreSignals(); navigate(); drawSignal('normal'); drawSignal('vip');
  setInterval(renderStatus, 1000); setInterval(() => updateSignals(true), 8000);
  pollLoop(); connectStream();
  (async () => {
    try { while (archive.rows().length < MODEL_SIZE && !archive.complete && !archive.ended) { await archive.loadNext(); render(); await delay(100); } }
    catch (error) { notify('История пока загружена частично: ' + error.message); }
    finally { initialLoading = false; render(); }
  })();
})();

