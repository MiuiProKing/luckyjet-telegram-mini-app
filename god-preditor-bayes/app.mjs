import './visual.mjs';
import { CONFIG } from './config.mjs';
import { LuckyFeed } from './feed.mjs';
import { analyzeHistory } from './model.mjs';

const $ = (id) => document.getElementById(id);
const clock = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtX = (x) => Number(x).toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '×';
const pct = (p) => Number.isFinite(p) ? (100 * p).toLocaleString('ru-RU', {maximumFractionDigits: p < .01 ? 2 : 1}) + '%' : '—';
const stamp = (t) => Number.isFinite(t) ? clock.format(t) : '—';
const count = (n) => Number(n || 0).toLocaleString('ru-RU');
const tone = (x) => x >= 10 ? 'high' : x >= 2 ? 'mid' : 'low';
const state = { rows: [], meta: {}, analysis: null, target: 10, journal: [], window: null,
  edgeReady: false, edgeError: '', edgeChecked: 0, offset: 0, roundVisible: 150, lastAnalysis: 0, archiveWasComplete: false };
try { const t = Number(localStorage.getItem('god-bayes-selected-target')); if ([10,40,200,500].includes(t)) state.target = t; } catch {}
const now = () => Date.now() + state.offset;

function text(id, value) { const node = $(id); if (node) node.textContent = value; }
function element(tag, content, className) { const node = document.createElement(tag); if (content != null) node.textContent = content; if (className) node.className = className; return node; }
function drawFeed() {
  const fragment = document.createDocumentFragment();
  for (const r of state.rows.slice(-5).reverse()) {
    const chip = element('article', null, 'chip ' + tone(r.coefficient));
    chip.dataset.roundId = r.id;
    chip.append(element('b', fmtX(r.coefficient), r.coefficient >= 1000 ? 'long' : ''), element('time', stamp(r.timestamp)));
    fragment.append(chip);
  }
  $('feed')?.replaceChildren(fragment);
  $('orb')?.setRounds?.(state.rows.slice(-5).reverse());
}
function drawCards() {
  const fragment = document.createDocumentFragment();
  for (const t of state.analysis?.ready ? state.analysis.targets : []) {
    const card = element('article', null, 'threshold-card' + (t.target === state.target ? ' selected' : ''));
    card.append(element('b', t.target + '×'), element('strong', pct(t.next3Minutes?.probability)),
      element('small', 'за следующие 3 минуты'), element('small', count(t.hits) + ' событий · ' + count(t.sampleSize) + ' раундов'));
    fragment.append(card);
  }
  $('thresholdCards')?.replaceChildren(fragment);
  for (const button of document.querySelectorAll('[data-target]')) {
    const selected = Number(button.dataset.target) === state.target;
    button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('active', selected);
  }
  const t = state.analysis?.ready ? state.analysis.targets?.find((v) => v.target === state.target) : null;
  if (t) {
    text('modelDetails', `Bayes V1. Частота за один раунд: ${pct(t.perRound.probability)}. ` +
      `Хотя бы одно ≥${t.target}× за 1 / 3 / 5 раундов: ${[1,3,5].map(n=>pct(t.nextRounds[n].probability)).join(' / ')}. ` +
      `Оценка минутного окна предполагает постоянную интенсивность событий. ` +
      `Давность последнего большого X не повышает вероятность сама по себе. ` +
      `Проценты — оценки модели, а не измеренная точность её сигналов. Серверный журнал хранит все созданные окна. ` +
      `Базовая модель ещё не подтвердила преимущество в выборе момента входа на новых днях.`);
  }
}
function drawRoundHistory() {
  const fragment = document.createDocumentFragment();
  const rows = state.rows.slice(-state.roundVisible).reverse();
  for (const r of rows) {
    const card = element('article', null, 'chip history-round ' + tone(r.coefficient));
    card.append(element('b', fmtX(r.coefficient), r.coefficient >= 1000 ? 'long' : ''), element('time', stamp(r.timestamp)), element('small',date.format(r.timestamp)));
    fragment.append(card);
  }
  $('roundHistory')?.replaceChildren(fragment);
  text('historyStats', 'Загружено ' + count(state.rows.length) + ' раундов');
  text('historyNote', state.meta.complete ? 'Загружена вся доступная история за последние 90 дней.' : 'Архив загружается из Supabase. Новые раунды поступают параллельно.');
  if ($('moreHistory')) { $('moreHistory').hidden = state.roundVisible >= state.rows.length; text('moreHistory', 'Показать ещё 150'); }
}
function windowStatus(w) {
  return ({pending:'Ожидает проверки',hit:'🟢 Зашло',miss:'🔴 Не зашло',unknown:'⚪ Неполные данные'})[w.status] || 'Ожидает проверки';
}
function drawSignals() {
  const fragment = document.createDocumentFragment();
  for (const w of state.journal) {
    const row = element('article', null, 'signal-row ' + w.status);
    row.append(element('b', 'Цель ' + fmtX(w.target)),
      element('time', date.format(w.start) + ' · ' + stamp(w.start) + ' — ' + stamp(w.end)),
      element('strong', windowStatus(w), 'outcome'));
    if (Number.isFinite(w.actual)) row.append(element('small', 'Выпало ' + fmtX(w.actual) + (w.resultAt ? ' · ' + stamp(w.resultAt) : '')));
    fragment.append(row);
  }
  if (!state.journal.length) fragment.append(element('p', state.edgeError || 'Журнал появится после первого созданного окна.', 'empty-history'));
  $('signalHistory')?.replaceChildren(fragment);
}
function renderClock() {
  const t = now(); text('kyivClock', stamp(t) + ' КИЕВ');
  const fresh = state.rows.length > 0 && t - state.rows.at(-1).timestamp <= 180000 && t >= state.rows.at(-1).timestamp - 10000;
  const sourceOkay = fresh && !state.meta.error;
  $('connectionDot')?.classList.toggle('offline', !sourceOkay);
  $('connectionDot')?.classList.toggle('connecting', !state.rows.length);
  text('connectionText', sourceOkay ? 'Supabase LIVE · время по Киеву' : state.rows.length ? 'Источник задерживается · история сохранена' : 'Подключение к Supabase…');
  text('sampleCount', count(state.rows.length) + ' раундов' + (state.meta.complete ? ' в истории' : ' · загрузка архива'));
  const w = state.window?.target === state.target ? state.window : null;
  const staleEdge = Date.now() - state.edgeChecked > 90000;
  let phase = 'reasoning';
  if (!sourceOkay) {
    phase = state.rows.length ? 'offline' : 'reasoning'; text('entryLabel', 'ИСТОЧНИК · КИЕВ');
    text('entryTime', state.rows.length ? 'Источник задерживается' : 'Загрузка истории');
    text('target', 'Цели 10× · 40× · 200× · 500×');
    text('stageText', state.rows.length ? 'Новые окна приостановлены' : 'Подключаем историю и свежие раунды'); text('countdown','');
  } else if (w && t <= w.end && !staleEdge) {
    phase = t < w.start ? 'scheduled' : 'checking';
    text('entryLabel', 'РАСЧЁТНОЕ ОКНО · КИЕВ'); text('entryTime', stamp(w.start)); text('target', 'Цель ' + fmtX(w.target));
    text('stageText', t < w.start ? 'До начала окна' : 'Проверка коэффициента');
    const seconds = Math.max(0,Math.ceil(((t < w.start ? w.start : w.end)-t)/1000));
    text('countdown', (t < w.start ? 'До начала · ' : 'До закрытия · ') + String(Math.floor(seconds/60)).padStart(2,'0') + ':' + String(seconds%60).padStart(2,'0'));
  } else {
    text('entryLabel', 'РАСЧЁТНОЕ ОКНО · КИЕВ'); text('entryTime', w && t > w.end ? 'Проверяем результат' : 'Загрузка расчёта');
    text('target', 'Цель ' + fmtX(state.target));
    text('stageText', state.edgeError ? 'Сервер расчёта временно недоступен' : 'Получаем окно с сервера'); text('countdown','');
  }
  const resolved = state.journal.find(x => x.target === state.target && x.status !== 'pending' && t > x.end && t - x.end < 15000);
  if (resolved) {
    phase = 'result'; text('entryLabel','РЕЗУЛЬТАТ ОКНА'); text('entryTime',windowStatus(resolved));
    text('target', Number.isFinite(resolved.actual) ? 'Выпало ' + fmtX(resolved.actual) : 'Недостаточно данных для проверки');
    text('countdown', stamp(resolved.start) + ' — ' + stamp(resolved.end));
    text('stageText', 'Цель ' + fmtX(resolved.target));
  }
  $('orb')?.setAttribute('phase', phase);
  $('entryTime')?.classList.toggle('status-text', !/^\d{2}:\d{2}:\d{2}$/.test($('entryTime')?.textContent || ''));
  $('entryTime')?.classList.toggle('result-hit', resolved?.status === 'hit');
  $('entryTime')?.classList.toggle('result-miss', resolved?.status === 'miss');
  if ($('ring')) {
    const ratio = w && phase === 'checking' ? Math.min(1,Math.max(0,(t-w.start)/(w.end-w.start))) : 0;
    $('ring').style.strokeDashoffset=String(100*(1-ratio));
    $('ring').closest('svg')?.classList.toggle('visible',phase==='checking');
  }
  const current = w && w.target === state.target ? w : null;
  const analysisTarget = state.analysis?.ready ? state.analysis.targets?.find(x=>x.target===state.target) : null;
  const p = current?.probability ?? analysisTarget?.next3Minutes?.probability;
  const interval = current?.interval95 ?? analysisTarget?.next3Minutes?.interval95;
  text('probability', pct(p));
  text('probabilityLabel', current ? 'Окно · ' + count(current.sampleSize) + ' раундов в расчёте' : 'Оценка ближайших 3 минут по архиву');
  text('probabilityRange', Array.isArray(interval) ? 'Диапазон оценки: ' + pct(interval[0]) + ' — ' + pct(interval[1]) : 'Диапазон оценки загружается');
  text('forecastNote', 'Хотя бы одно ≥' + state.target + '× за 3 минуты. Это статистический ориентир; точный момент события не определён.');
}
function decodeWindow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const time = v => typeof v === 'number' ? v : Date.parse(v);
  const start = time(raw.start ?? raw.start_ms ?? raw.starts_at), end = time(raw.end ?? raw.end_ms ?? raw.ends_at);
  const target = Number(raw.target);
  if (!raw.id || ![10,40,200,500].includes(target) || !Number.isFinite(start) || !(end > start)) return null;
  const actualRaw = raw.actual ?? raw.actual_max;
  const rawProbability = raw.probability ?? raw.probability_3min;
  const probability = rawProbability == null ? NaN : Number(rawProbability);
  const interval95 = raw.interval95 ?? raw.probability_interval ?? null;
  const validInterval = Array.isArray(interval95) && interval95.length===2 && interval95.every(x=>x!=null&&Number.isFinite(Number(x))&&Number(x)>=0&&Number(x)<=1) && Number(interval95[0])<=Number(interval95[1]);
  return {...raw,id:String(raw.id),target,start,end,status:raw.status || 'pending',
    actual: actualRaw == null ? null : Number(actualRaw),
    resultAt:raw.resultAt || raw.actual_at ? time(raw.resultAt ?? raw.actual_at) : null,
    probability:Number.isFinite(probability)&&probability>=0&&probability<=1 ? probability : null,
    sampleSize:Number(raw.sampleSize ?? raw.sample_size)||0,
    interval95:validInterval ? interval95.map(Number) : null};
}
let ledgerBusy = false;
async function loadLedger() {
  if (ledgerBusy) return;
  ledgerBusy = true; const target = state.target; const before = Date.now();
  try {
    const controller = new AbortController(); const timeout = setTimeout(()=>controller.abort(),18000);
    let response;
    try { response = await fetch(CONFIG.EDGE_URL, {method:'POST', headers:{'Content-Type':'application/json',apikey:CONFIG.SUPABASE_KEY,Authorization:'Bearer '+CONFIG.EDGE_TOKEN},body:JSON.stringify({target}),signal:controller.signal,cache:'no-store'}); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (target !== state.target) return;
    const serverNow = Number(data.serverNow);
    if (Number.isFinite(serverNow)) state.offset = serverNow - (before+Date.now())/2;
    state.window = decodeWindow(data.window);
    state.journal = (Array.isArray(data.signals) ? data.signals : []).map(decodeWindow).filter(Boolean).sort((a,b)=>b.start-a.start);
    state.edgeReady = true; state.edgeError = ''; state.edgeChecked = Date.now();
    drawSignals(); renderClock();
  } catch { state.edgeError = 'Серверный расчёт временно недоступен. Повторяем подключение.'; drawSignals(); }
  finally { ledgerBusy = false; }
}
const feed = new LuckyFeed(CONFIG, {
  onUpdate(rows, meta) {
    state.rows = rows; state.meta = meta;
    if (!state.edgeChecked && Number.isFinite(meta.serverOffsetMs)) state.offset = meta.serverOffsetMs;
    drawFeed();
    if (Date.now()-state.lastAnalysis>10000 || !state.analysis || (meta.complete&&!state.archiveWasComplete)) {
      state.analysis = analyzeHistory(rows,now()); state.lastAnalysis=Date.now(); drawCards();
    }
    state.archiveWasComplete=!!meta.complete;
    if ($('historyDialog')?.open) drawRoundHistory();
    renderClock();
  },
  onStatus(meta) { state.meta = meta; renderClock(); }
});
document.querySelectorAll('[data-target]').forEach(button => button.addEventListener('click', async () => {
  const target = Number(button.dataset.target); if (![10,40,200,500].includes(target) || target === state.target) return;
  state.target = target; state.window = null;
  try { localStorage.setItem('god-bayes-selected-target',String(target)); } catch {}
  drawCards(); renderClock(); await loadLedger();
  if (state.window?.target !== state.target) setTimeout(loadLedger,1000);
}));
$('openHistory')?.addEventListener('click',()=>{drawRoundHistory();drawSignals();});
$('moreHistory')?.addEventListener('click',()=>{state.roundVisible+=150;drawRoundHistory();});
$('refreshData')?.addEventListener('click',()=>{feed.loadMore();loadLedger();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderClock();loadLedger();}});
window.addEventListener('online',loadLedger);
window.addEventListener('pagehide',event=>{if(!event.persisted)feed.stop();});
window.addEventListener('pageshow',event=>{if(event.persisted){void feed.poll();renderClock();loadLedger();}});
drawCards(); renderClock();
feed.start().catch(()=>{text('connectionText','Не удалось подключиться к истории. Повторяем…');});
loadLedger(); setInterval(loadLedger,20000); setInterval(renderClock,1000);
