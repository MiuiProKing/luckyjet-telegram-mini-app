import {activate} from './activation.mjs';

const OVERLAY_ID = 'god-preditor-safari-overlay';
const GAME_ORIGIN = 'https://1play.gamedev-tech.cc';
const DRAWN = new Set(['canvas', 'img', 'svg', 'video']);
const INTERACTIVE = new Set(['button', 'input', 'a', 'select', 'textarea', 'option']);
const BET = /^(?:сделать\s+ставку|зробити\s+ставку|ставка|поставить|place\s+bet|bet)(?:$|\s|[\d₴$€])/iu;
const CASHOUT = /^(?:забрать|забрати|cash[\s-]?out|collect)(?:$|\s|[\d(₴$€₽])/iu;
const WAITING = /^(?:cancel|отмен\S*|скасув\S*|очікуван\S*|ожидан\S*|waiting|placed|accepted|принят\S*)(?:$|\s|[\d(])/iu;
const ACCOUNT = /withdraw|account|deposit|wallet|bonus|вывод|вывести|сч[её]т|кошел[её]к|пополн|бонус|вивести|рахунок|гаманець/iu;
const PREBET_BUSY = /забра|cash[\s-]?out|collect|cancel|отмен|скасув|очікуван|ожидан|waiting|placed|accepted|принят/iu;
const normalize = text => String(text ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
const textOf = element => normalize(typeof element.innerText === 'string' ? element.innerText : element.textContent || '');
const labelOf = element => normalize(element.innerText || element.getAttribute?.('aria-label') || element.textContent || '');

// Only a whole coefficient is accepted; currency, labels and a list of historical
// multipliers cannot accidentally become a live reading. Bare integers are not
// distinguishable from amounts, so they require an explicit multiplier mark.
export function parseLiveMultiplier(text) {
  const value = normalize(text);
  if (!value || value.length > 40) return null;
  const match = /^(?:[x×х]\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*[x×х]|(\d+[.,]\d+))$/iu.exec(value);
  if (!match) return null;
  const number = Number((match[1] || match[2] || match[3]).replace(',', '.'));
  return Number.isFinite(number) && number >= 1 && number <= 1e6 ? number : null;
}

function parentOf(element) {
  return element?.parentElement || element?.getRootNode?.()?.host || null;
}

function ancestors(element) {
  const items = [];
  for (let item = element; item && items.length < 80; item = parentOf(item)) items.push(item);
  return items;
}

function inOverlay(element) {
  return ancestors(element).some(item => item.id === OVERLAY_ID);
}

function counterHazard(element) {
  for (const item of ancestors(element)) {
    if (DRAWN.has(item.localName)) return 'Счётчик нарисован: DOM-текст недоступен. Выбери текстовый счётчик.';
    const editable = item.getAttribute?.('contenteditable');
    if (INTERACTIVE.has(item.localName) || item.getAttribute?.('role') === 'button' || item.getAttribute?.('role') === 'link' ||
        item.isContentEditable || (editable != null && editable !== 'false'))
      return 'Выбери сам текст текущего коэффициента, вне кнопок и полей ввода.';
    if (item.id === OVERLAY_ID) return 'Наведи прицел на счётчик игры.';
  }
  return null;
}

function topHit(root, x, y, ignoreOverlay = false) {
  const hits = root.elementsFromPoint?.(x, y) || [root.elementFromPoint?.(x, y)];
  return hits.find(item => item && (!ignoreOverlay || !inOverlay(item))) || null;
}

function shadowHit(element, x, y, ignoreOverlay = false) {
  for (let depth = 0; element?.shadowRoot && depth < 10; depth++) {
    const child = topHit(element.shadowRoot, x, y, ignoreOverlay);
    if (!child || child === element) break;
    element = child;
  }
  return element;
}

function frameOrigin(frame) {
  try {return new URL(frame.src, frame.ownerDocument.baseURI).origin;} catch {return 'неизвестный домен';}
}

export function hitLiveMultiplier(document, x, y) {
  let doc = document, px = x, py = y;
  try {
    for (let depth = 0; depth < 10; depth++) {
      const element = shadowHit(topHit(doc, px, py, true), px, py, true);
      if (!element) return {error: 'Наведи центр прицела на текст текущего коэффициента.'};
      if (element.localName === 'iframe') {
        let child;
        try {child = element.contentDocument;} catch {}
        if (!child) return {error: 'Игра в отдельном фрейме. Нужен доступ к домену: ' + frameOrigin(element), frameOrigin: frameOrigin(element)};
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || !element.offsetWidth || !element.offsetHeight) return {error: 'Игровой фрейм скрыт.'};
        px = (px - rect.left) * element.offsetWidth / rect.width - (element.clientLeft || 0);
        py = (py - rect.top) * element.offsetHeight / rect.height - (element.clientTop || 0);
        doc = child;
        continue;
      }
      const hazard = counterHazard(element);
      if (hazard) return {error: hazard};
      // Permit a short wrapper (e.g. separate number and × spans), never a large
      // panel or a surrounding game area. Start with the smallest actual hit.
      let candidate = element;
      for (let depth = 0; candidate && depth < 3; depth++, candidate = parentOf(candidate)) {
        if (counterHazard(candidate)) break;
        const label = textOf(candidate);
        if (label.length > 40) break;
        if (parseLiveMultiplier(label) != null) return {element: candidate, document: doc, label};
      }
      return {error: 'Здесь нет одного читаемого коэффициента (например, 1.74×).'};
    }
    return {error: 'Слишком глубокое вложение игрового поля.'};
  } catch {return {error: 'Браузер не разрешает прочитать этот счётчик.'};}
}

function visibleElement(element, doc) {
  if (!element || !doc || element.ownerDocument !== doc || !element.isConnected) return 'элемент исчез, выбери его заново';
  const win = doc.defaultView;
  if (!win || win.document !== doc) return 'игра перезагрузилась';
  if (doc.hidden || doc.visibilityState === 'hidden') return 'игровая вкладка скрыта';
  const rect = element.getBoundingClientRect();
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return 'элемент скрыт';
  if ((Number.isFinite(win.innerWidth) && (rect.left >= win.innerWidth || rect.left + rect.width <= 0)) ||
      (Number.isFinite(win.innerHeight) && (rect.top >= win.innerHeight || rect.top + rect.height <= 0))) return 'элемент вне видимой области';
  for (const item of ancestors(element)) {
    const style = win.getComputedStyle(item);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return 'элемент скрыт';
  }
  return null;
}

function isInside(element, hit) {
  if (!hit) return false;
  if (element === hit || element.contains?.(hit)) return true;
  return ancestors(hit).includes(element);
}

function frameChain(doc, x, y, checkCover) {
  let current = doc;
  for (let depth = 0; depth < 10; depth++) {
    const win = current.defaultView;
    if (win === win.top) return null;
    const frame = win.frameElement;
    // When injected directly in the supported cross-origin game, the top-level
    // visibility bridge supplies the parent-frame check to the controller.
    if (!frame && current.location?.origin === GAME_ORIGIN) return null;
    if (!frame || frame.contentDocument !== current) return 'доступ к игровому фрейму изменился';
    const parent = frame.ownerDocument, visibility = visibleElement(frame, parent);
    if (visibility) return visibility;
    const rect = frame.getBoundingClientRect();
    if (!frame.offsetWidth || !frame.offsetHeight) return 'игровой фрейм скрыт';
    x = rect.left + (x + (frame.clientLeft || 0)) * rect.width / frame.offsetWidth;
    y = rect.top + (y + (frame.clientTop || 0)) * rect.height / frame.offsetHeight;
    if (checkCover && !isInside(frame, shadowHit(topHit(parent, x, y), x, y))) return 'игровое поле перекрыто';
    current = parent;
  }
  return 'слишком глубокое вложение игрового поля';
}

export function createLiveMultiplierMonitor({now = Date.now} = {}) {
  let source = null, previous = null, changedAt = null, epoch = 0, lastAt = null, clockUnsafe = false;
  function reset(selected) {
    source = selected ? {element: selected.element, document: selected.document, label: selected.label} : null;
    previous = null; changedAt = null; epoch = 0; lastAt = null; clockUnsafe = false;
  }
  function read() {
    let at;
    try {at = now();} catch {at = NaN;}
    const result = (state, reason, value = null) => ({state, value, at, changedAt, epoch, reason});
    if (clockUnsafe || !Number.isFinite(at) || at < 0 || (lastAt != null && at < lastAt) || (changedAt != null && changedAt > at)) {
      clockUnsafe = true;
      return result('unsafe', 'время изменилось — выбери счётчик заново');
    }
    lastAt = at;
    if (!source) return result('unsafe', 'счётчик не выбран');
    try {
      const element = source.element, doc = source.document;
      const hazard = counterHazard(element);
      if (hazard) return result('unsafe', hazard);
      const visibility = visibleElement(element, doc);
      // Games may hide this same counter between flights. That is an unknown
      // value, not a lost binding: keep an idle observer waiting. A hidden
      // document, detached source, changed document, off-screen element or
      // hidden parent frame remains unsafe. Active tracking rejects waiting.
      if (visibility && visibility !== 'элемент скрыт') return result('unsafe', visibility);
      const rect = element.getBoundingClientRect();
      if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0)
        return result('unsafe', 'неверные размеры выбранного счётчика');
      const frame = frameChain(doc, rect.left + rect.width / 2, rect.top + rect.height / 2, false);
      if (frame) return result('unsafe', frame);
      if (visibility) return result('waiting', 'счётчик временно скрыт — ждём новый полёт');
      const label = textOf(element);
      if (label.length > 40) return result('unsafe', 'выбранный текст изменился — выбери счётчик заново');
      const value = parseLiveMultiplier(label);
      if (value == null) return result('waiting', 'ждём читаемый текущий коэффициент');
      if (previous == null || previous !== value) {
        if (previous != null && previous - value > .01 + Number.EPSILON * Math.max(previous, value) * 4) epoch++;
        changedAt = at;
      }
      previous = value;
      return result('ready', 'коэффициент читается', value);
    } catch {return result('unsafe', 'доступ к счётчику закрыт браузером');}
  }
  return {setSource: reset, clear: () => reset(null), read};
}

export function inspectCashoutButton(selected) {
  const element = selected?.element, doc = selected?.document;
  try {
    const originalLabel = normalize(selected?.label);
    if (!BET.test(originalLabel) || ACCOUNT.test(originalLabel) || PREBET_BUSY.test(originalLabel)) return {state: 'unsafe', reason: 'нужна ранее выбранная кнопка «Ставка»'};
    if (!element || (element.localName !== 'button' && element.getAttribute?.('role') !== 'button') || inOverlay(element)) return {state: 'unsafe', reason: 'это не выбранная игровая кнопка'};
    const visibility = visibleElement(element, doc);
    if (visibility) return {state: 'unsafe', reason: visibility};
    const label = labelOf(element);
    if (ACCOUNT.test(label)) return {state: 'unsafe', reason: 'кнопка относится к счёту или выводу средств', label};
    if (BET.test(label)) return {state: 'closed', reason: 'поле снова принимает ставки', label};
    if (WAITING.test(label)) return {state: 'waiting', reason: 'кнопка ожидает игровой раунд', label};
    if (!CASHOUT.test(label)) return {state: 'unsafe', reason: 'это не кнопка «Забрать»', label};
    const style = doc.defaultView.getComputedStyle(element);
    if (element.disabled || element.matches?.(':disabled') || element.getAttribute?.('aria-disabled') === 'true' || style.pointerEvents === 'none')
      return {state: 'waiting', reason: 'кнопка «Забрать» пока недоступна', label};
    const rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hit = shadowHit(topHit(doc, x, y), x, y);
    const root = element.getRootNode?.();
    if (!isInside(element, hit) && !(root?.host === hit && !root.elementFromPoint && !root.elementsFromPoint))
      return {state: 'waiting', reason: 'кнопка перекрыта — отодвинь панель', label};
    const frame = frameChain(doc, x, y, true);
    if (frame) return {state: /перекрыто/u.test(frame) ? 'waiting' : 'unsafe', reason: frame, label};
    return {state: 'ready', reason: 'кнопка «Забрать» доступна', label};
  } catch {return {state: 'unsafe', reason: 'доступ к кнопке закрыт браузером'};}
}

export function clickCashoutButton(selected) {
  if (inspectCashoutButton(selected).state !== 'ready') throw Error('Кнопка «Забрать» уже недоступна');
  selected.document.defaultView.HTMLElement.prototype.click.call(selected.element);
}

// The reticle captures the configuring touch. Only the separate trusted
// confirmation selects a source; neither path clicks a game element.
export function pickLiveMultiplier(root, done) {
  const doc = root.host.ownerDocument, win = doc.defaultView;
  const picker = doc.createElement('div'); picker.className = 'picker';
  picker.innerHTML = `<div class="pick-bar"><b>Выбрать живой коэффициент</b><p>Перетащи прицел на текущий летящий коэффициент, затем нажми «Выбрать». История и суммы не подходят.</p><div class="pick-info"></div><button class="pick-confirm" disabled>Выбрать</button><button class="pick-cancel">Отмена</button></div><div class="pick-cursor" role="button" aria-label="Прицел выбора текущего коэффициента">＋</div>`;
  root.append(picker);
  const cursor = picker.querySelector('.pick-cursor'), info = picker.querySelector('.pick-info'), confirm = picker.querySelector('.pick-confirm');
  let point = {x: win.innerWidth / 2, y: win.innerHeight * .7}, candidate = null, drag = null, stopped = false;
  function update() {
    cursor.style.left = (point.x - 25) + 'px'; cursor.style.top = (point.y - 25) + 'px';
    candidate = hitLiveMultiplier(doc, point.x, point.y);
    info.textContent = candidate.error || candidate.label;
    confirm.disabled = !!candidate.error;
  }
  cursor.addEventListener('pointerdown', event => {
    if (!event.isTrusted || event.button !== 0) return;
    event.preventDefault(); cursor.setPointerCapture(event.pointerId);
    drag = {id: event.pointerId, dx: point.x - event.clientX, dy: point.y - event.clientY};
  });
  cursor.addEventListener('pointermove', event => {
    if (!event.isTrusted || !drag || drag.id !== event.pointerId) return;
    point = {x: Math.max(25, Math.min(win.innerWidth - 25, event.clientX + drag.dx)), y: Math.max(25, Math.min(win.innerHeight - 25, event.clientY + drag.dy))};
    update();
  });
  const stopDrag = () => {drag = null;};
  cursor.addEventListener('pointerup', stopDrag);
  cursor.addEventListener('pointercancel', stopDrag);
  cursor.addEventListener('lostpointercapture', stopDrag);
  const timer = setInterval(update, 300);
  function finish(value) {
    if (stopped) return;
    stopped = true; clearInterval(timer);
    picker.style.opacity = '0'; picker.style.pointerEvents = 'auto';
    picker.addEventListener('click', event => {event.preventDefault(); event.stopImmediatePropagation();}, true);
    setTimeout(() => {picker.remove(); done(value);}, 400);
  }
  activate(picker.querySelector('.pick-cancel'), () => finish({cancelled: true}));
  activate(confirm, () => {if (!stopped) {update(); if (!candidate.error) finish(candidate);}});
  update();
  return () => finish({cancelled: true});
}
