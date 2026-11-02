import {MODEL} from '../../window-model.mjs';

export const AUTO_KEY = 'god-preditor-autobet-receipts-v1';
export const ACCEPT_WAIT_MS = 15000;
const TARGETS = [1.5, 2];

export async function acquireAutoLock(locks) {
  if (!locks?.request) throw Error('Авто недоступно: Safari не поддерживает блокировку вкладок');
  return new Promise((resolve, reject) => {
    locks.request('god-preditor-autobet-session-v1', {mode: 'exclusive', ifAvailable: true}, async lock => {
      if (!lock) {resolve(null); return;}
      let release; const held = new Promise(done => {release = done;});
      resolve({release}); await held;
    }).catch(reject);
  });
}

// This controller contains no casino selectors or network calls. The adapter
// can act only on the two button objects explicitly selected in this session.
export function createAutoBet({now = Date.now, monotonic = () => performance.now(),
  context, inspect, click, acquireLock, readReceipts, writeReceipts, onChange = () => {}}) {
  let armed = false, mode = 'test', generation = 0, busy = false, lock = null;
  let initialized = false, storageOK = false, armedAt = 0, previousNow = 0, previousMono = 0;
  let receipts = [], message = 'Авто выключено', logs = [];
  const buttons = [null, null], consumed = new Set(), acknowledgements = [];
  const notify = text => {
    if (text && text !== message) {message = text; logs.push({at: now(), text}); logs = logs.slice(-15);}
    onChange();
  };
  function disarm(reason = 'Авто выключено') {
    generation++; armed = false; lock?.release(); lock = null;
    acknowledgements.length = 0;
    notify(reason);
  }
  async function initialize() {
    try {
      const saved = await readReceipts();
      receipts = Array.isArray(saved) ? saved.filter(x => x && typeof x.id === 'string' && x.id.length < 500).slice(-200) : [];
      for (const entry of receipts) consumed.add('live:' + entry.id);
      storageOK = true;
    } catch {notify('Хранилище недоступно: только тест без нажатий');}
    initialized = true; onChange();
  }
  function setButton(index, button) {
    disarm('Привязка изменена — авто выключено');
    if (![0, 1].includes(index)) throw Error('Неизвестное поле');
    if (buttons[1 - index]?.element === button?.element) throw Error('Нужны две разные кнопки');
    buttons[index] = button; onChange();
  }
  function checks() {return buttons.map(button => button ? inspect(button) : {state: 'missing', reason: 'Кнопка не выбрана'});}
  function checkOnly() {
    const states = checks();
    notify(states.map((s, i) => `${i + 1}: ${s.state === 'ready' ? 'готова' : s.reason}`).join(' · ') + ' · нажатий нет');
    return states;
  }
  async function arm(nextMode = 'test') {
    disarm();
    if (!initialized) {notify('Дождись загрузки настроек'); return false;}
    mode = nextMode === 'live' ? 'live' : 'test';
    const states = checks();
    if (states.some(s => !['ready', 'waiting'].includes(s.state))) {checkOnly(); return false;}
    if (!context().fresh) {notify('Нет свежей связи с Supabase'); return false;}
    if (mode === 'live' && !storageOK) {notify('Без сохранения отметок автонажатия недоступны'); return false;}
    const ticket = generation;
    if (mode === 'live') {
      try {
        const obtained = await acquireLock();
        if (ticket !== generation) {obtained?.release(); return false;}
        if (!obtained) {notify('Авто уже включено в другой вкладке'); return false;}
        lock = obtained;
      } catch (error) {notify(error.message); return false;}
    }
    if (!context().fresh || !context().visible) {disarm('Вкладка или связь не готовы'); return false;}
    armed = true; armedAt = previousNow = now(); previousMono = monotonic();
    notify(mode === 'live' ? 'Авто включено · по одному нажатию на поле и окно' : 'Тест включён · реальные кнопки не нажимаются');
    return true;
  }
  async function tick() {
    if (!armed || busy) return;
    const time = now(), mono = monotonic(), state = context();
    if (!state.visible || !state.fresh) {disarm('Авто выключено: фон или потеря свежей связи'); return;}
    if (time - previousNow > 3500 || Math.abs((time - previousNow) - (mono - previousMono)) > 1500) {
      disarm('Авто выключено: таймер задержался или изменились часы'); return;
    }
    previousNow = time; previousMono = mono;
    for (let i = acknowledgements.length - 1; i >= 0; i--) {
      const ack = acknowledgements[i], checked = inspect(ack.button);
      if (checked.state === 'busy') {
        notify(`Поле ${ack.index + 1}: кнопка изменилась после нажатия; повторения нет`);
        acknowledgements.splice(i, 1);
      } else if (checked.state === 'unsafe' || time > ack.until) {
        disarm(`Поле ${ack.index + 1}: результат нажатия не подтверждён · проверь игру`); return;
      }
    }
    busy = true;
    const ticket = generation;
    try {
      for (const [index, target] of TARGETS.entries()) {
        if (!armed || ticket !== generation) break;
        const window = state.forecasts.find(x => x?.model === MODEL && x.target === target);
        if (!window || !Number.isFinite(window.start) || !Number.isFinite(window.end) ||
            !(window.acceptedAt < window.start && window.start < window.end) || typeof window.key !== 'string') continue;
        const id = `${window.key}:${index}`, seen = mode + ':' + id;
        if (consumed.has(seen)) continue;
        if (window.start < armedAt || window.status !== 'pending') {consumed.add(seen); continue;}
        if (time < window.start) continue;
        if (time > Math.min(window.end, window.start + ACCEPT_WAIT_MS)) {
          consumed.add(seen); notify(`Поле ${index + 1}: время приёма пропущено · без нажатия`); continue;
        }
        const checked = inspect(buttons[index]);
        if (checked.state === 'waiting') {notify(`Поле ${index + 1}: жду доступную «Ставку», не более 15 секунд`); continue;}
        if (checked.state !== 'ready') {disarm(`Поле ${index + 1}: ${checked.reason}`); break;}
        consumed.add(seen);
        if (mode === 'test') {notify(`ТЕСТ ${index + 1}: здесь было бы нажатие ${target.toFixed(2)}× · кнопка не нажата`); continue;}
        // Commit the at-most-once reservation BEFORE dispatch. Uncertainty never
        // retries a monetary action, including after a reload or storage error.
        receipts.push({id, target, at: time, state: 'reserved'}); receipts = receipts.slice(-200);
        const savedAt = monotonic();
        try {await writeReceipts(receipts);}
        catch {disarm('Авто выключено: отметка нажатия не сохранилась'); break;}
        const currentTime = now(), currentState = context(), final = inspect(buttons[index]);
        const latestWindow = currentState.forecasts.find(x => x.target === target);
        if (!armed || ticket !== generation) break;
        if (!currentState.visible || !currentState.fresh || currentTime > Math.min(window.end, window.start + ACCEPT_WAIT_MS) ||
            monotonic() - savedAt > 2000 || final.state !== 'ready' ||
            latestWindow?.key !== window.key || latestWindow.status !== 'pending') {
          disarm('Авто выключено: условия изменились перед нажатием'); break;
        }
        try {click(buttons[index]);}
        catch {disarm(`Поле ${index + 1}: нажатие не выполнено · повторения нет`); break;}
        acknowledgements.push({index, button: buttons[index], until: currentTime + 2500});
        notify(`Поле ${index + 1}: нажатие отправлено · проверь подтверждение в игре`);
      }
    } finally {busy = false;}
  }
  return {initialize, setButton, checks, checkOnly, arm, disarm, tick,
    get state() {return {armed, mode, message, logs: [...logs], configured: buttons.map(Boolean), initialized};}};
}
