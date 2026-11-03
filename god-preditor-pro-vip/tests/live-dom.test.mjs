import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLiveMultiplier, hitLiveMultiplier, createLiveMultiplierMonitor,
  inspectCashoutButton, clickCashoutButton, pickLiveMultiplier} from '../safari/src/live-dom.mjs';

function fixture() {
  let nativeClicks = 0, ownClicks = 0;
  const doc = {hidden: false, visibilityState: 'visible', baseURI: 'https://example.test/', location: {origin: 'https://example.test'}};
  const win = {document: doc, innerWidth: 600, innerHeight: 800,
    getComputedStyle: element => ({display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto', ...element.styles}),
    HTMLElement: {prototype: {click() {nativeClicks++;}}}};
  win.top = win; doc.defaultView = win;
  doc.hits = []; doc.elementsFromPoint = () => doc.hits; doc.elementFromPoint = () => doc.hits[0] || null;
  function element(localName = 'span', label = '1.74x', props = {}) {
    const attributes = {...props.attributes}, handlers = new Map();
    const node = {localName, ownerDocument: doc, isConnected: true, innerText: label, textContent: label,
      parentElement: null, disabled: false, style: {}, styles: {}, id: '',
      rect: {left: 20, top: 30, width: 100, height: 40},
      getBoundingClientRect() {return {...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height};},
      getAttribute(name) {return Object.hasOwn(attributes, name) ? attributes[name] : null;},
      getRootNode() {return this.root || this.ownerDocument;},
      matches(selector) {return selector === ':disabled' && this.disabled;},
      contains(other) {for (let item = other; item; item = item.parentElement) if (item === this) return true; return false;},
      click() {ownClicks++;},
      addEventListener(type, handler) {if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(handler);},
      emit(type, event = {}) {for (const handler of handlers.get(type) || []) handler({isTrusted: true, button: 0, pointerId: 1, clientX: 30, clientY: 40, detail: 0, preventDefault() {}, stopImmediatePropagation() {}, ...event});},
      setPointerCapture() {},
      ...props};
    return node;
  }
  const counter = element(), button = element('button', 'Cashout 174.00');
  const selection = {element: button, document: doc, label: 'Bet 100'};
  doc.hits = [button];
  return {doc, win, element, counter, button, selection, nativeClicks: () => nativeClicks, ownClicks: () => ownClicks};
}

test('strict whole coefficients allow marked integers and decimal comma or point', () => {
  for (const [text, number] of [['1.74x', 1.74], ['x1.74', 1.74], ['1,74×', 1.74], ['Х 2,25', 2.25],
    ['\u00a01.74\u202f×\u00a0', 1.74], ['1.00', 1], ['2,50', 2.5], ['1x', 1], ['1000000×', 1e6]])
    assert.equal(parseLiveMultiplier(text), number, text);
});

test('currency, labels, multiple values, bare amounts and invalid numbers never parse', () => {
  for (const text of ['', '1', '100', 'x', 'x1x', '1.74x 2.00x', 'live: 1.74x', '$1.74x', '1.74 €',
    'NaN×', 'Infinityx', '-1.74x', '+1.74x', '0.99x', '1000000.01x', '1e3x', '1,74.0x', '1 000x', '1.x', 'x.99'])
    assert.equal(parseLiveMultiplier(text), null, text);
});

test('reticle ignores overlay hosts and their shadow descendants', () => {
  const f = fixture(), overlay = f.element('div', '', {id: 'god-preditor-safari-overlay'});
  const child = f.element('span', '200x', {root: {host: overlay}});
  f.doc.hits = [child, overlay, f.counter];
  const selected = hitLiveMultiplier(f.doc, 50, 50);
  assert.equal(selected.element, f.counter);
  assert.equal(selected.label, '1.74x');
  assert.equal(f.nativeClicks(), 0);
  assert.equal(f.ownClicks(), 0);
});

test('reticle selects the smallest parseable hit and a short split-number wrapper', () => {
  const f = fixture(); f.doc.hits = [f.counter];
  assert.equal(hitLiveMultiplier(f.doc, 50, 50).element, f.counter);
  const wrapper = f.element('span', '2×'), digit = f.element('span', '2', {parentElement: wrapper});
  f.doc.hits = [digit, wrapper];
  assert.equal(hitLiveMultiplier(f.doc, 50, 50).element, wrapper);
  wrapper.innerText = 'A large panel with historical values 2× 3×';
  assert.ok(hitLiveMultiplier(f.doc, 50, 50).error);
});

test('canvas fallback, images, video, svg descendants and interactive ancestors are unreadable', () => {
  const f = fixture();
  for (const tag of ['canvas', 'img', 'video', 'svg']) {
    const drawn = f.element(tag), child = f.element('span', '1.74x', {parentElement: drawn});
    f.doc.hits = [child, drawn];
    assert.match(hitLiveMultiplier(f.doc, 50, 50).error, /нарисован/u);
  }
  for (const tag of ['button', 'input', 'a', 'select', 'textarea']) {
    const control = f.element(tag), child = f.element('span', '1.74x', {root: {host: control}});
    Object.defineProperty(control, 'value', {get() {throw Error('input values must never be read');}});
    f.doc.hits = [child];
    assert.ok(hitLiveMultiplier(f.doc, 50, 50).error, tag);
  }
  const editor = f.element('div', '1.74x', {attributes: {contenteditable: ''}});
  f.doc.hits = [editor]; assert.ok(hitLiveMultiplier(f.doc, 50, 50).error);
});

test('reticle traverses open shadow and same-origin frames with transformed coordinates', () => {
  const outer = fixture(), inner = fixture(); let point;
  const frame = outer.element('iframe', '', {contentDocument: inner.doc, offsetWidth: 200, offsetHeight: 200, clientLeft: 2, clientTop: 3,
    rect: {left: 100, top: 200, width: 400, height: 400}});
  outer.doc.hits = [frame];
  const host = inner.element('div', '');
  host.shadowRoot = {elementsFromPoint(x, y) {point = [x, y]; return [inner.counter];}};
  inner.doc.hits = [host];
  const selected = hitLiveMultiplier(outer.doc, 200, 300);
  assert.deepEqual(point, [48, 47]);
  assert.equal(selected.element, inner.counter);
  assert.equal(selected.document, inner.doc);
  frame.contentDocument = null; frame.src = 'https://other.test/game';
  assert.equal(hitLiveMultiplier(outer.doc, 200, 300).frameOrigin, 'https://other.test');
});

test('monitor preserves freshness on repeated numeric values and waiting, tracks resets, and clears', () => {
  const f = fixture(); let at = 1000;
  const monitor = createLiveMultiplierMonitor({now: () => at});
  monitor.setSource({element: f.counter, document: f.doc, label: '1.74x'});
  let sample = monitor.read();
  assert.deepEqual([sample.state, sample.value, sample.at, sample.changedAt, sample.epoch], ['ready', 1.74, 1000, 1000, 0]);
  for (let i = 0; i < 10; i++) {at += 100; assert.equal(monitor.read().changedAt, 1000);}
  f.counter.innerText = '1.740x'; at += 100; assert.equal(monitor.read().changedAt, 1000);
  f.counter.innerText = 'ожидание'; at += 100;
  sample = monitor.read(); assert.equal(sample.state, 'waiting'); assert.equal(sample.value, null); assert.equal(sample.epoch, 0); assert.equal(sample.changedAt, 1000);
  f.counter.innerText = '1.74x'; at += 100; assert.equal(monitor.read().changedAt, 1000);
  f.counter.innerText = '1.73x'; at += 100; sample = monitor.read(); assert.equal(sample.epoch, 0); assert.equal(sample.changedAt, at);
  f.counter.innerText = '1.00x'; at += 100; sample = monitor.read(); assert.equal(sample.epoch, 1); assert.equal(sample.changedAt, at);
  at += 100; assert.equal(monitor.read().epoch, 1);
  monitor.clear(); assert.equal(monitor.read().state, 'unsafe');
  monitor.setSource({element: f.counter, document: f.doc}); sample = monitor.read(); assert.equal(sample.epoch, 0); assert.equal(sample.changedAt, at);
});

test('monitor freezes source references, rejects detachment, foreign documents, hidden and drawn counters', () => {
  const f = fixture(), monitor = createLiveMultiplierMonitor({now: () => 1000});
  const source = {element: f.counter, document: f.doc}; monitor.setSource(source);
  source.element = f.element('span', '99x'); assert.equal(monitor.read().value, 1.74);
  f.counter.isConnected = false; assert.equal(monitor.read().state, 'unsafe');
  f.counter.isConnected = true; f.counter.ownerDocument = {}; assert.equal(monitor.read().state, 'unsafe');
  f.counter.ownerDocument = f.doc; f.counter.styles.opacity = '0'; assert.equal(monitor.read().state, 'unsafe');
  f.counter.styles.opacity = '1'; f.doc.hidden = true; assert.equal(monitor.read().state, 'unsafe');
  f.doc.hidden = false; f.counter.localName = 'canvas'; assert.equal(monitor.read().state, 'unsafe');
});

test('monitor never reads input values and faults on invalid or backwards clocks until reselection', () => {
  const f = fixture(); let at = 1000;
  const monitor = createLiveMultiplierMonitor({now: () => at}), input = f.element('input');
  Object.defineProperty(input, 'value', {get() {throw Error('private input');}});
  monitor.setSource({element: input, document: f.doc}); assert.equal(monitor.read().state, 'unsafe');
  monitor.setSource({element: f.counter, document: f.doc}); assert.equal(monitor.read().state, 'ready');
  at = 999; assert.equal(monitor.read().state, 'unsafe');
  at = 1001; assert.equal(monitor.read().state, 'unsafe');
  monitor.setSource({element: f.counter, document: f.doc}); assert.equal(monitor.read().state, 'ready');
  at = Infinity; assert.equal(monitor.read().state, 'unsafe');
  at = 1002; assert.equal(monitor.read().state, 'unsafe');
  monitor.setSource({element: f.counter, document: f.doc}); at = NaN; assert.equal(monitor.read().state, 'unsafe');
});

test('cashout accepts only an available original Bet button with an action prefix', () => {
  const f = fixture();
  for (const label of ['Cashout 174.00', 'Cash Out', 'Cash-out', 'Collect', 'Забрать 174 ₽', 'ЗАБРАТИ 174 ₴']) {
    f.button.innerText = label; assert.equal(inspectCashoutButton(f.selection).state, 'ready', label);
  }
  for (const label of ['Withdraw', 'Account cashout', 'Collect bonus', 'Cashout to wallet', 'Забрать со счёта', 'Collective', 'cashoutside', 'Win 1.74x']) {
    f.button.innerText = label; assert.equal(inspectCashoutButton(f.selection).state, 'unsafe', label);
  }
  f.button.innerText = 'Bet 100'; assert.equal(inspectCashoutButton(f.selection).state, 'closed');
  for (const label of ['Cancel', 'Отменить', 'Скасувати', 'Ожидание', 'Waiting']) {
    f.button.innerText = label; assert.equal(inspectCashoutButton(f.selection).state, 'waiting', label);
  }
  f.button.innerText = 'Cashout';
  assert.equal(inspectCashoutButton({...f.selection, label: 'Cashout'}).state, 'unsafe');
  assert.equal(inspectCashoutButton({...f.selection, label: 'Bet cashout'}).state, 'unsafe');
});

test('cashout refuses disabled, covered, hidden, detached or moved controls', () => {
  const f = fixture();
  f.button.disabled = true; assert.equal(inspectCashoutButton(f.selection).state, 'waiting');
  f.button.disabled = false; f.doc.hits = [f.element('div', 'cover')]; assert.equal(inspectCashoutButton(f.selection).state, 'waiting');
  f.doc.hits = [f.button]; f.button.styles.pointerEvents = 'none'; assert.equal(inspectCashoutButton(f.selection).state, 'waiting');
  f.button.styles.pointerEvents = 'auto'; f.button.styles.display = 'none'; assert.equal(inspectCashoutButton(f.selection).state, 'unsafe');
  f.button.styles.display = 'block'; f.button.isConnected = false; assert.equal(inspectCashoutButton(f.selection).state, 'unsafe');
  f.button.isConnected = true; f.button.ownerDocument = {}; assert.equal(inspectCashoutButton(f.selection).state, 'unsafe');
});

test('cashout validates shadow hit coverage and parent frame coverage', () => {
  const f = fixture(), host = f.element('div', ''), cover = f.element('span', 'cover');
  const shadow = {host, elementsFromPoint: () => [f.button]};
  host.shadowRoot = shadow; f.button.root = shadow; f.doc.hits = [host];
  assert.equal(inspectCashoutButton(f.selection).state, 'ready');
  shadow.elementsFromPoint = () => [cover]; assert.equal(inspectCashoutButton(f.selection).state, 'waiting');
  shadow.elementsFromPoint = () => [f.button];
  const parent = fixture(), frame = parent.element('iframe', '', {contentDocument: f.doc, offsetWidth: 600, offsetHeight: 800, clientLeft: 0, clientTop: 0,
    rect: {left: 0, top: 0, width: 600, height: 800}});
  f.win.top = parent.win; f.win.frameElement = frame; parent.doc.hits = [frame];
  assert.equal(inspectCashoutButton(f.selection).state, 'ready');
  parent.doc.hits = [parent.element('div', 'cover')]; assert.equal(inspectCashoutButton(f.selection).state, 'waiting');
  parent.doc.hits = [frame]; frame.styles.opacity = '0'; assert.equal(inspectCashoutButton(f.selection).state, 'unsafe');
});

test('only the known cross-origin host can defer its parent check to the visibility bridge', () => {
  const f = fixture(); f.win.top = {}; f.win.frameElement = null;
  assert.equal(inspectCashoutButton(f.selection).state, 'unsafe');
  f.doc.location.origin = 'https://1play.gamedev-tech.cc'; assert.equal(inspectCashoutButton(f.selection).state, 'ready');
});

test('cashout click rechecks immediately and invokes owner-window native click exactly once', () => {
  const f = fixture();
  clickCashoutButton(f.selection); assert.equal(f.nativeClicks(), 1); assert.equal(f.ownClicks(), 0);
  f.button.innerText = 'Bet'; assert.throws(() => clickCashoutButton(f.selection));
  f.button.innerText = 'Cancel'; assert.throws(() => clickCashoutButton(f.selection));
  f.button.innerText = 'Cashout'; f.button.disabled = true; assert.throws(() => clickCashoutButton(f.selection));
  f.button.disabled = false; f.doc.hits = []; assert.throws(() => clickCashoutButton(f.selection));
  assert.equal(f.nativeClicks(), 1);
});

test('picker rejects synthetic confirmation and shields the delayed touch after trusted confirmation', context => {
  context.mock.timers.enable({apis: ['setTimeout', 'setInterval']});
  const f = fixture(), nodes = Object.fromEntries(['.pick-cursor', '.pick-info', '.pick-confirm', '.pick-cancel'].map(key => [key, f.element('button', '')]));
  const picker = f.element('div', ''); let removed = false, selected;
  picker.querySelector = key => nodes[key]; picker.remove = () => {removed = true;};
  f.doc.createElement = () => picker; f.doc.hits = [f.counter];
  const root = {host: {ownerDocument: f.doc}, append() {}};
  pickLiveMultiplier(root, value => {selected = value;});
  nodes['.pick-confirm'].emit('click', {isTrusted: false});
  context.mock.timers.tick(400); assert.equal(selected, undefined); assert.equal(removed, false);
  nodes['.pick-confirm'].emit('pointerdown'); nodes['.pick-confirm'].emit('pointerup');
  assert.equal(picker.style.opacity, '0'); assert.equal(picker.style.pointerEvents, 'auto');
  context.mock.timers.tick(399); assert.equal(removed, false); assert.equal(selected, undefined);
  context.mock.timers.tick(1); assert.equal(removed, true); assert.equal(selected.element, f.counter);
  assert.equal(f.nativeClicks(), 0); assert.equal(f.ownClicks(), 0);
});
