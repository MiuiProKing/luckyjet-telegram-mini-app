import {SUPABASE_CONFIG} from '../../supabase-config.mjs';
import {createSupabaseFeed} from '../../supabase-feed.mjs';
import {mergeRounds} from '../../data.mjs';
import {MODEL, analyze, advanceJournal} from '../../window-model.mjs';
import {mountScene} from '../../scene.mjs';
import {createExtensionFetch, permittedPage} from './transport.mjs';
import {CSS} from './style.mjs';

const ID = 'god-preditor-safari-overlay', KEY = 'god-preditor-safari-v1';
const HOME = 'https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/';
const ASSETS = HOME + 'assets/';
const number = n => Number(n).toLocaleString('ru-RU', {maximumFractionDigits: 2});
const clock = t => new Date(t).toLocaleTimeString('ru-RU', {timeZone: 'Europe/Kyiv'});
const duration = ms => {const n = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;};

async function start(gm) {
  // Exact host allowlist, top frame only; no game frames or other websites.
  if (window !== window.top || !permittedPage(location) || document.getElementById(ID)) return;
  const host = document.createElement('div'); host.id = ID;
  host.dataset.version = '1.0.0'; host.dataset.model = MODEL;
  for (const [k, v] of Object.entries({position: 'fixed', inset: '0 auto auto 0', width: '0', height: '0',
    'z-index': '2147483647', 'pointer-events': 'none', transform: 'none'})) host.style.setProperty(k, v, 'important');
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = `<style>${CSS}</style>
    <section class="panel" aria-label="GOD PREDITOR PRO VIP">
      <header class="handle" title="Перетащи панель за эту строку">
        <div class="brand"><strong id="brand-text">GOD PREDITOR</strong><img id="brand-image" alt="GOD PREDITOR" hidden referrerpolicy="no-referrer"><small>PRO · VIP · SAFARI</small></div>
        <button class="icon" id="minimize" aria-label="Свернуть панель">−</button>
        <button class="icon" id="close" aria-label="Скрыть до перезагрузки">×</button>
      </header>
      <div class="body">
        <div class="status" id="status" role="status">Подключение к нашему Supabase…</div>
        <div class="recent" aria-label="Пять последних коэффициентов"></div>
        <div class="neural"><canvas aria-label="Неоновый мозг и паук"></canvas><img class="vip" alt="VIP" referrerpolicy="no-referrer"></div>
        <div class="signal" id="signal">—</div>
        <div class="window" id="window">Получаем историю</div>
        <div class="note" id="note"></div>
        <div class="targets" aria-label="Цель"><button data-target="1.5">1,50×</button><button data-target="2">2×</button></div>
        <div class="result" id="result" role="status"><img id="result-image" hidden alt="" referrerpolicy="no-referrer"><span id="result-label">Проверка по окну</span></div>
        <div class="tools" id="tools" hidden><button id="retry">Обновить связь</button><button id="opacity">Прозрачность</button><button id="reset">Сбросить размер</button><p class="hint">Перетащи за заголовок. Угол ↘ меняет размер. × скрывает до перезагрузки. Данные — наш Supabase.</p></div>
      </div>
      <footer class="footer"><button class="link" id="history-open">История</button><button class="link" id="tools-open">Настроить</button><a class="link" href="${HOME}" target="_blank" rel="noopener noreferrer">Страница ↗</a><button class="grip" id="resize" aria-label="Изменить размер панели">↘</button></footer>
      <section class="history" hidden><div class="history-head"><b>Полученные коэффициенты</b><button class="icon" id="history-close" aria-label="Закрыть историю">×</button></div><small id="history-count"></small><div class="history-list"></div></section>
    </section>
    <button class="launcher" hidden aria-label="Открыть панель GOD PREDITOR">GP <span>—</span></button>`;
  document.documentElement.append(host);
  const $ = selector => root.querySelector(selector);
  const panel = $('.panel'), launcher = $('.launcher');
  let rows = [], journal = [], selected = 1.5, feed = null, status = 'connecting', lastSuccessAt = null;
  let destroyed = false, saveTimer = null, storageWarning = false, historyVersion = '', latestResult = '';
  const ui = {x: 10, y: 115, width: 238, height: 390, opacity: .97, collapsed: false};
  const scene = mountScene($('canvas'), {compact: true});
  const current = target => [...journal].reverse().find(x => x.target === target && x.model === MODEL);

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
      try {await gm.setValue(KEY, {model: MODEL, rows: rows.slice(0, 2000), journal: journal.slice(-100), selected, ui: {...ui}});}
      catch {storageWarning = true;}
    }, 500);
  }
  function collapse(value) {ui.collapsed = value; layout(); saveSoon();}

  let ignoreLauncherClick = false;
  function movable(element, resize = false) {
    let active = null;
    element.addEventListener('pointerdown', event => {
      if (!resize && element !== launcher && event.target.closest('button,a')) return;
      if (event.button !== 0) return;
      event.preventDefault(); element.setPointerCapture(event.pointerId);
      active = {id: event.pointerId, x: event.clientX, y: event.clientY, left: ui.x, top: ui.y, width: ui.width, height: ui.height, moved: false};
      ignoreLauncherClick = false;
    });
    element.addEventListener('pointermove', event => {
      if (!active || event.pointerId !== active.id) return;
      const dx = event.clientX - active.x, dy = event.clientY - active.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) active.moved = true;
      if (resize) {
        const v = viewport();
        ui.width = clamp(active.width + dx, 190, v.width - 16);
        ui.height = clamp(active.height + dy, 265, v.height - 16);
      } else {ui.x = active.left + dx; ui.y = active.top + dy;}
      layout();
    });
    const finish = () => {if (!active) return; ignoreLauncherClick = active.moved && element === launcher; active = null; saveSoon();};
    element.addEventListener('pointerup', finish); element.addEventListener('pointercancel', finish);
    element.addEventListener('lostpointercapture', finish);
  }
  movable($('.handle')); movable(launcher); movable($('#resize'), true);
  $('#minimize').onclick = () => collapse(true);
  launcher.onclick = () => {if (!ignoreLauncherClick) collapse(false); ignoreLauncherClick = false;};
  $('#tools-open').onclick = () => {$('#tools').hidden = !$('#tools').hidden;};
  $('#opacity').onclick = () => {ui.opacity = ui.opacity > .94 ? .82 : ui.opacity > .8 ? .68 : .97; layout(); saveSoon();};
  $('#reset').onclick = () => {Object.assign(ui, {x: 10, y: 115, width: 238, height: 390, opacity: .97}); layout(); saveSoon();};
  for (const button of root.querySelectorAll('[data-target]')) button.onclick = () => {selected = Number(button.dataset.target); saveSoon(); render();};
  $('#history-open').onclick = () => {$('.history').hidden = false; renderHistory();};
  $('#history-close').onclick = () => {$('.history').hidden = true;};

  function renderHistory() {
    const version = rows.length + ':' + rows[0]?.id;
    if (version === historyVersion) return;
    historyVersion = version;
    $('#history-count').textContent = `${rows.length} в рабочей истории · последние 100 · время по Киеву`;
    const fragment = document.createDocumentFragment();
    for (const row of rows.slice(0, 100)) {
      const line = document.createElement('div'); line.className = 'row';
      const value = document.createElement('b'); value.textContent = number(row.coefficient) + '×';
      const time = document.createElement('time'); time.textContent = clock(row.timestamp);
      line.append(value, time); fragment.append(line);
    }
    $('.history-list').replaceChildren(fragment);
  }
  function render() {
    if (destroyed) return;
    const now = Date.now(), stats = analyze(rows, now);
    const result = advanceJournal(journal, rows, stats, now, true, {online: status === 'connected', lastSuccessAt});
    journal = result.journal; if (result.changed) saveSoon();
    const forecast = current(selected), occupied = forecast && now <= forecast.end;
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
    $('#signal').textContent = stats.ready && occupied ? `${selected === 1.5 ? '1,50' : '2,00'}×` : stats.n && !stats.fresh ? 'Пауза' : '—';
    $('#window').textContent = forecast && occupied ? `${clock(forecast.start)} — ${clock(forecast.end)}\nОкно · Киев` :
      forecast?.status === 'pending' ? 'Проверяем покрытие окна' : 'Нужно 20 раундов\nи свежий поток';
    $('#note').textContent = forecast && occupied ?
      `${now < forecast.start ? 'До окна ' + duration(forecast.start - now) : 'До конца ' + duration(forecast.end - now)} · ${forecast.pattern} · ${forecast.score}/100` : 'Балл правила не равен вероятности выигрыша';
    launcher.querySelector('span').textContent = stats.ready && occupied ? number(selected) + '×' : '…';
    for (const button of root.querySelectorAll('[data-target]')) button.classList.toggle('active', Number(button.dataset.target) === selected);
    const completed = [...journal].reverse().find(x => x.target === selected && ['hit', 'miss', 'unknown'].includes(x.status));
    const key = completed ? completed.key + completed.status : '';
    if (key !== latestResult) {
      latestResult = key; $('#result').className = 'result ' + (completed?.status || '');
      $('#result-image').hidden = !completed || completed.status === 'unknown';
      if (completed && completed.status !== 'unknown') $('#result-image').src = ASSETS + `result-${completed.status}.webp`;
    }
    $('#result-label').textContent = completed ? (completed.status === 'hit' ? 'ЗАШЛО' : completed.status === 'miss' ? 'НЕ ЗАШЛО' : 'НЕТ ДАННЫХ') +
      (completed.actual != null ? ' · макс. окна ' + number(completed.actual) + '×' : '') : 'Проверка: достижение цели в окне';
    if (!$('.history').hidden) renderHistory();
  }
  const fetchImpl = createExtensionFetch(gm, SUPABASE_CONFIG);
  function startFeed() {
    if (destroyed || document.hidden) return;
    feed?.stop(); status = 'connecting';
    feed = createSupabaseFeed(SUPABASE_CONFIG, {
      fetchImpl,
      onRounds(batch, {initial = false} = {}) {
        if (destroyed) return;
        const seen = new Set(rows.map(x => x.id));
        rows = mergeRounds(rows, batch, 'Supabase · LuckyJet').rounds;
        scene.push(batch.filter(x => !seen.has(x.id)), {initial});
        saveSoon(); render();
      },
      onStatus(s) {
        if (destroyed) return;
        status = s.state; if (s.lastSuccess) lastSuccessAt = s.lastSuccess;
        if (s.message) host.dataset.error = s.message;
        render();
      },
    });
    render();
  }
  $('#retry').onclick = startFeed;
  const onVisibility = () => {
    if (document.hidden) {feed?.stop(); feed = null; status = 'paused'; scene.setPaused(true);}
    else {layout(); startFeed();}
  };
  const onPageHide = () => {feed?.stop(); feed = null; scene.setPaused(true);};
  const onPageShow = event => {if (event.persisted && !document.hidden) {layout(); startFeed();}};
  const onResize = () => layout();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide); window.addEventListener('pageshow', onPageShow);
  window.addEventListener('resize', onResize); visualViewport?.addEventListener('resize', onResize); visualViewport?.addEventListener('scroll', onResize);
  const observer = new MutationObserver(() => {if (!destroyed && !document.documentElement.contains(host)) document.documentElement.append(host);});
  observer.observe(document.documentElement, {childList: true});
  const tick = setInterval(() => {if (!document.hidden) render();}, 1000);
  $('#close').onclick = () => {
    destroyed = true; clearInterval(tick); clearTimeout(saveTimer); feed?.stop(); scene.destroy(); observer.disconnect();
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
  layout(); render();
  try {
    const saved = await gm.getValue(KEY, null);
    if (saved && !destroyed) {
      rows = mergeRounds([], Array.isArray(saved.rows) ? saved.rows : [], 'Supabase · LuckyJet').rounds;
      journal = saved.model === MODEL && Array.isArray(saved.journal) ? saved.journal.slice(-100) : [];
      selected = saved.selected === 2 ? 2 : 1.5;
      if (saved.ui && typeof saved.ui === 'object') {
        for (const key of ['x', 'y', 'width', 'height', 'opacity']) if (Number.isFinite(saved.ui[key])) ui[key] = saved.ui[key];
        ui.width = clamp(ui.width, 190, 600); ui.height = clamp(ui.height, 265, 700); ui.opacity = clamp(ui.opacity, .6, 1);
        ui.collapsed = saved.ui.collapsed === true;
      }
      layout(); render();
    }
  } catch {storageWarning = true;}
  startFeed();
}

if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
  void start(GM).catch(error => console.error('GOD PREDITOR:', error.message));
}
