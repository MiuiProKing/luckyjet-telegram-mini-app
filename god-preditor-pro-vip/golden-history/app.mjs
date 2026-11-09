import {SUPABASE_CONFIG} from '../supabase-config.mjs';
import {TIME_ZONE, zonedParts, prepareEvent, buildTimeline, formatClock, formatCountdown, formatOccurrenceDay, previousMorningWindow} from './clock.mjs?v=20261109-2';
import {createReader, readLivePage, readCache, writeCache, sequence} from './data.mjs?v=20261109-2';

const $ = id => document.getElementById(id);
const reader = createReader(SUPABASE_CONFIG);
const cacheIdentity = () => `${SUPABASE_CONFIG.url}/${SUPABASE_CONFIG.table}/session-08-v2/${state.window.key}`;
const state = {events: new Map(), recent: new Map(), cursor: null, highWater: null, complete: false,
  historyBusy: false, liveBusy: false, online: false, syncedAt: null, limit: 25, cards: [], total: 0,
  day: null, window: previousMorningWindow(), renderTimer: null, pollTimer: null, saveTimer: null, cached: false};
const coefficient = value => new Intl.NumberFormat('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2,
  ...(value >= 1000000 ? {notation: 'compact'} : {})}).format(value) + '×';
const dateFormat = new Intl.DateTimeFormat('ru-RU', {timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric'});

function sourceLabel(event) {
  const p = zonedParts(Date.now());
  const yesterday = new Date(Date.UTC(p.year, p.month - 1, p.day) - 86400000).toISOString().slice(0, 10);
  return `${event.sourceDate === yesterday ? 'Вчера · ' : event.sourceDate === p.date ? 'Сегодня · ' : ''}${dateFormat.format(event.timestamp)}`;
}

function mergeRounds(rounds, isLive = false) {
  let changed = false;
  for (const round of rounds) {
    if (isLive) state.recent.set(round.id, round);
    if (round.coefficient < 10 || state.events.has(round.id) || round.timestamp < state.window.start || round.timestamp >= state.window.end) continue;
    const event = prepareEvent(round);
    if (event) {state.events.set(event.id, event); changed = true;}
  }
  if (isLive) {
    const newest = [...state.recent.values()].sort((a, b) => b.timestamp - a.timestamp || (BigInt(a.seq) < BigInt(b.seq) ? 1 : -1)).slice(0, 20);
    state.recent = new Map(newest.map(round => [round.id, round]));
    renderRecent(newest.slice(0, 5));
  }
  if (changed) scheduleRender();
}

function renderRecent(rounds) {
  if (!rounds.length) return;
  $('recent').replaceChildren(...rounds.map(round => {
    const item = document.createElement('li');
    if (round.coefficient >= 10) item.className = 'big-round';
    const value = document.createElement('b'), time = document.createElement('time');
    value.textContent = coefficient(round.coefficient); time.textContent = formatClock(round.timestamp); time.dateTime = new Date(round.timestamp).toISOString();
    item.append(value, time); return item;
  }));
}

function scheduleRender() {
  if (state.renderTimer !== null) return;
  state.renderTimer = setTimeout(() => {state.renderTimer = null; render();}, 100);
}

function render() {
  const now = Date.now();
  const result = buildTimeline(state.events.values(), {now, threshold: Number($('threshold').value), sourceWindow: state.window, limit: state.limit});
  state.cards = result.cards; state.total = result.total; state.day = result.today;
  $('eligible-count').textContent = result.total.toLocaleString('ru-RU');
  const first = state.cards[0];
  $('spotlight').hidden = !first;
  $('empty').hidden = Boolean(first);
  if (first) {
    $('spotlight-day').textContent = formatOccurrenceDay(first.nextAt, now);
    $('spotlight-time').textContent = formatClock(first.nextAt); $('spotlight-time').dateTime = new Date(first.nextAt).toISOString();
    $('spotlight-coefficient').textContent = coefficient(first.coefficient);
    $('spotlight-source').textContent = `${sourceLabel(first)} · ${formatClock(first.timestamp)}`;
  } else {
    $('empty-title').textContent = state.historyBusy ? 'Загружаем реальные события' : 'Нет событий по этому фильтру';
    $('empty-text').textContent = state.historyBusy ? 'Карточки появятся по мере загрузки истории Supabase.' :
      'За эту сессию пока нет подходящих завершённых раундов. Попробуй снизить порог коэффициента.';
  }
  const fragment = document.createDocumentFragment();
  state.cards.slice(1).forEach((event, index) => {
    const card = $('event-template').content.firstElementChild.cloneNode(true);
    card.dataset.mega = String(event.coefficient >= 100);
    card.querySelector('.card-index').textContent = `${String(index + 2).padStart(2, '0')} / ИСТОРИЯ`;
    card.querySelector('.card-day').textContent = formatOccurrenceDay(event.nextAt, now);
    const time = card.querySelector('.echo-time'); time.textContent = formatClock(event.nextAt); time.dateTime = new Date(event.nextAt).toISOString();
    card.querySelector('.echo-coefficient').textContent = coefficient(event.coefficient);
    card.querySelector('.source-date').textContent = sourceLabel(event);
    card.querySelector('.card-countdown').dataset.nextAt = String(event.nextAt);
    fragment.append(card);
  });
  $('cards').replaceChildren(fragment);
  $('more').hidden = state.cards.length >= state.total;
  updateCountdowns(now); renderSummary();
}

function updateCountdowns(now) {
  if (state.cards[0]) $('spotlight-countdown').textContent = formatCountdown(state.cards[0].nextAt, now);
  for (const node of document.querySelectorAll('[data-next-at]')) node.textContent = formatCountdown(Number(node.dataset.nextAt), now);
}

function renderSummary() {
  const date = timestamp => dateFormat.format(timestamp).slice(0, 5);
  $('session-start').textContent = `${date(state.window.start)} 08:00`;
  $('session-end').textContent = `${date(state.window.end)} 08:00`;
  $('archive-summary').textContent = `Supabase · ${dateFormat.format(state.window.start)} 08:00 → ${dateFormat.format(state.window.end)} 08:00 · ${state.events.size.toLocaleString('ru-RU')} событий от 10×${state.complete ? ' · период загружен' : ' · загрузка периода'}${Date.now() < state.window.end ? ' · ночная часть сессии ещё идёт' : ''}${state.syncedAt ? ` · обновлено ${formatClock(state.syncedAt)}` : ''}`;
}

function connection(stateName, label) {$('connection').dataset.state = stateName; $('connection-label').textContent = label;}

async function syncHistory() {
  if (state.historyBusy) return;
  const scope = state.window;
  state.historyBusy = true; $('refresh').disabled = true; $('loading').hidden = false; $('history-error').hidden = true;
  $('loading-label').textContent = state.complete ? 'Проверяем события выбранной сессии…' : 'Загружаем сессию: вчера 08:00 → сегодня 08:00…';
  try {
    const result = await reader.loadHistory({after: state.complete ? state.highWater : null, start: scope.start, end: scope.end, onBatch: batch => {
      if (scope.key !== state.window.key) return;
      mergeRounds(batch); $('loading-label').textContent = `Загружено ${state.events.size.toLocaleString('ru-RU')} событий от 10×…`;
    }});
    if (scope.key !== state.window.key) return;
    state.highWater = result.highWater; state.complete = true; state.cached = false; state.syncedAt = result.syncedAt;
    saveSoon();
  } catch (error) {
    if (scope.key !== state.window.key) return;
    $('history-error').hidden = false;
    $('history-error').textContent = `${error.message}. ${state.events.size ? 'Показана уже загруженная история.' : 'История пока недоступна.'} Нажми ↻ для повторной загрузки.`;
  } finally {
    state.historyBusy = false;
    if (scope.key !== state.window.key) {void syncHistory(); return;}
    $('refresh').disabled = false; $('loading').hidden = true; render();
  }
}

function saveSoon() {
  clearTimeout(state.saveTimer);
  if (!state.complete) return;
  state.saveTimer = setTimeout(() => {
    void writeCache({identity: cacheIdentity(), complete: true, highWater: state.highWater, syncedAt: state.syncedAt,
      rows: [...state.events.values()].map(({id, seq, coefficient, timestamp}) => ({id, seq, coefficient, timestamp}))});
  }, 800);
}

async function pollLive() {
  if (state.liveBusy || document.hidden) return;
  state.liveBusy = true; clearTimeout(state.pollTimer);
  let againSoon = false;
  try {
    const initial = state.cursor === null;
    const previousCursor = state.cursor;
    const rows = await reader.page({after: state.cursor, ascending: !initial, limit: initial ? 5 : 500});
    const result = readLivePage(rows, state.cursor);
    mergeRounds(result.rounds, true);
    state.cursor = result.cursor ?? (rows.length ? null : '0');
    state.online = true;
    const latest = [...state.recent.values()].reduce((value, round) => Math.max(value, round.timestamp), 0);
    connection(latest && Date.now() - latest > 180000 ? 'error' : 'connected', latest && Date.now() - latest > 180000 ? 'Нет свежих раундов' : 'Supabase подключён');
    againSoon = !initial && rows.length >= 500 && result.cursor !== null && result.cursor !== previousCursor;
    if (result.rounds.some(round => round.coefficient >= 10)) saveSoon();
  } catch {
    state.online = false; connection('error', navigator.onLine ? 'Повторяем подключение…' : 'Нет интернета');
  } finally {
    state.liveBusy = false;
    if (!document.hidden) state.pollTimer = setTimeout(pollLive, againSoon ? 50 : SUPABASE_CONFIG.pollMs);
  }
}

function tick() {
  const now = Date.now();
  const window = previousMorningWindow(now);
  if (window.key !== state.window.key) {
    state.window = window; state.events.clear(); state.cards = []; state.highWater = null; state.complete = false; state.syncedAt = null;
    state.limit = 25; clearTimeout(state.saveTimer); render(); void syncHistory();
  }
  $('clock').textContent = formatClock(now); $('clock').dateTime = new Date(now).toISOString();
  $('today-label').textContent = dateFormat.format(now);
  if (state.day !== zonedParts(now).date || (state.cards[0] && state.cards[0].nextAt < now)) render();
  else updateCountdowns(now);
}

$('threshold').addEventListener('change', () => {state.limit = 25; render();});
$('more').addEventListener('click', () => {state.limit += 24; render();});
$('refresh').addEventListener('click', () => {void syncHistory(); void pollLive();});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(state.pollTimer);
  else {tick(); void pollLive(); void syncHistory();}
});
window.addEventListener('online', () => {void pollLive(); void syncHistory();});
window.addEventListener('pageshow', event => {if (event.persisted) {tick(); void pollLive(); void syncHistory();}});

tick(); setInterval(tick, 1000);
void pollLive();
const cacheScope = state.window.key;
const cached = await readCache(cacheIdentity());
if (cached && cacheScope === state.window.key) {
  const valid = cached.rows.filter(round => round && sequence(round.seq) && typeof round.id === 'string' &&
    Number.isFinite(round.coefficient) && round.coefficient >= 10 && Number.isFinite(round.timestamp) && round.timestamp > 0 && round.timestamp <= Date.now());
  mergeRounds(valid); state.highWater = cached.highWater; state.complete = true; state.cached = true; state.syncedAt = cached.syncedAt;
  $('loading-label').textContent = 'История из кэша · проверяем обновления…'; render();
}
void syncHistory();
