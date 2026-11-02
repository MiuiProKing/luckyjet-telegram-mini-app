const BUSY = /забра|забрати|cash[\s-]?out|collect|cancel|отмен|скасув|очікуван|ожидан|waiting|placed|accepted|принят/iu;
const BET = /^(?:сделать\s+ставку|зробити\s+ставку|ставка|поставить|place\s+bet|bet)(?:$|\s|[\d₴$€])/iu;
const labelOf = element => String(element.innerText || element.getAttribute('aria-label') || element.textContent || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const originOf = frame => {try {return new URL(frame.src, frame.ownerDocument.baseURI).origin;} catch {return 'неизвестный домен';}};

export function hitBetButton(document, x, y) {
  let doc = document, px = x, py = y;
  for (let depth = 0; depth < 10; depth++) {
    let element = doc.elementsFromPoint(px, py).find(item => item.id !== 'god-preditor-safari-overlay');
    for (let i = 0; i < 8 && element?.shadowRoot; i++) {
      const child = element.shadowRoot.elementFromPoint?.(px, py);
      if (!child || child === element) break;
      element = child;
    }
    if (element?.localName === 'iframe') {
      let child;
      try {child = element.contentDocument;} catch {}
      if (!child) return {error: 'Игра в отдельном фрейме. Нужен доступ к домену: ' + originOf(element), frameOrigin: originOf(element)};
      const r = element.getBoundingClientRect();
      px = (px - r.left) * element.offsetWidth / r.width - element.clientLeft;
      py = (py - r.top) * element.offsetHeight / r.height - element.clientTop;
      doc = child; continue;
    }
    const button = element?.closest?.('button,[role="button"]');
    if (!button || !button.click || button.getRootNode().host?.id === 'god-preditor-safari-overlay') return {error: 'Наведи центр прицела на саму кнопку «Ставка»'};
    const label = labelOf(button);
    if (!BET.test(label) || BUSY.test(label)) return {error: 'Это не доступная «Ставка»: ' + label.slice(0, 70)};
    return {element: button, document: doc, label};
  }
  return {error: 'Слишком глубокое вложение игрового поля'};
}

export function inspectBetButton(selected) {
  const element = selected?.element, doc = selected?.document;
  if (!element || !doc || !element.isConnected) return {state: 'unsafe', reason: 'кнопка исчезла, выбери её заново'};
  try {
    if (doc.defaultView.document !== doc) return {state: 'unsafe', reason: 'игра перезагрузилась'};
    const label = labelOf(element), style = doc.defaultView.getComputedStyle(element), rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || style.visibility !== 'visible' || style.display === 'none') return {state: 'unsafe', reason: 'кнопка скрыта'};
    if (BUSY.test(label)) return {state: 'busy', reason: 'поле занято: это не «Ставка»', label};
    if (!BET.test(label)) return {state: 'unsafe', reason: 'подпись кнопки изменилась', label};
    if (element.disabled || element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true' || style.pointerEvents === 'none')
      return {state: 'waiting', reason: 'игра пока не принимает ставку', label};
    let currentDoc = doc, x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hit = currentDoc.elementFromPoint(x, y);
    const root = element.getRootNode();
    const inside = element.contains(hit) || (root.host && root.host === hit);
    if (!inside) return {state: 'waiting', reason: 'кнопка перекрыта — отодвинь панель', label};
    while (currentDoc.defaultView !== currentDoc.defaultView.top) {
      const frame = currentDoc.defaultView.frameElement;
      if (!frame || frame.contentDocument !== currentDoc) return {state: 'unsafe', reason: 'доступ к игровому фрейму изменился'};
      const r = frame.getBoundingClientRect();
      x = r.left + (x + frame.clientLeft) * r.width / frame.offsetWidth;
      y = r.top + (y + frame.clientTop) * r.height / frame.offsetHeight;
      currentDoc = frame.ownerDocument;
      if (currentDoc.elementFromPoint(x, y) !== frame) return {state: 'waiting', reason: 'игровое поле перекрыто', label};
    }
    return {state: 'ready', reason: 'готова', label};
  } catch {return {state: 'unsafe', reason: 'доступ к кнопке закрыт браузером'};}
}

export function clickSelectedBet(selected) {
  if (inspectBetButton(selected).state !== 'ready') throw Error('Кнопка уже недоступна');
  selected.document.defaultView.HTMLElement.prototype.click.call(selected.element);
}

// A drag handle keeps pointer capture: the user never taps the real bet button
// while configuring it. Confirmation is a separate button in our own UI.
export function pickButton(root, index, done) {
  const doc = root.host.ownerDocument, win = doc.defaultView;
  const picker = doc.createElement('div'); picker.className = 'picker';
  picker.innerHTML = `<div class="pick-bar"><b>Выбрать поле ${index + 1}</b><p>Перетащи прицел на «Ставка», затем нажми «Выбрать». Ставка сейчас не отправляется.</p><div class="pick-info"></div><button class="pick-confirm" disabled>Выбрать</button><button class="pick-cancel">Отмена</button></div><div class="pick-cursor" role="button" aria-label="Прицел выбора кнопки">＋</div>`;
  root.append(picker);
  const cursor = picker.querySelector('.pick-cursor'), info = picker.querySelector('.pick-info'), confirm = picker.querySelector('.pick-confirm');
  let point = {x: win.innerWidth / 2, y: win.innerHeight * .7}, candidate = null, drag = null, stopped = false;
  function update() {
    cursor.style.left = (point.x - 25) + 'px'; cursor.style.top = (point.y - 25) + 'px';
    candidate = hitBetButton(doc, point.x, point.y);
    info.textContent = candidate.error || candidate.label.slice(0, 85);
    confirm.disabled = !!candidate.error;
  }
  cursor.addEventListener('pointerdown', e => {e.preventDefault(); cursor.setPointerCapture(e.pointerId); drag = {id: e.pointerId, dx: point.x - e.clientX, dy: point.y - e.clientY};});
  cursor.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    point = {x: Math.max(25, Math.min(win.innerWidth - 25, e.clientX + drag.dx)), y: Math.max(25, Math.min(win.innerHeight - 25, e.clientY + drag.dy))};
    update();
  });
  cursor.addEventListener('pointerup', () => {drag = null;});
  cursor.addEventListener('pointercancel', () => {drag = null;});
  const timer = setInterval(update, 300);
  const finish = value => {
    if (stopped) return;
    stopped = true; clearInterval(timer);
    // Keep a short input shield after a touch so a delayed compatibility click
    // cannot land on a real casino control when the picker is removed.
    picker.style.opacity = '0'; picker.style.pointerEvents = 'auto';
    picker.addEventListener('click', event => {event.preventDefault(); event.stopImmediatePropagation();}, true);
    setTimeout(() => {picker.remove(); done(value);}, 400);
  };
  function activate(button, action) {
    let pointer = null;
    button.addEventListener('pointerdown', event => {
      if (!event.isTrusted || event.button !== 0 || button.disabled) return;
      event.preventDefault(); pointer = event.pointerId; button.setPointerCapture(pointer);
    });
    button.addEventListener('pointerup', event => {
      if (!event.isTrusted || event.pointerId !== pointer || button.disabled) return;
      pointer = null; const rect = button.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) action();
    });
    button.addEventListener('pointercancel', () => {pointer = null;});
    button.onclick = event => {if (event.isTrusted && !button.disabled) action();};
  }
  activate(picker.querySelector('.pick-cancel'), () => finish({error: info.textContent, cancelled: true}));
  activate(confirm, () => {if (stopped) return; update(); if (!candidate.error) finish(candidate);});
  update(); return () => finish({cancelled: true});
}
