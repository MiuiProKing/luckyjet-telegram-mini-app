// ==UserScript==
// @name         GOD PREDITOR PRO VIP — LuckyJet Safari
// @namespace    https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/
// @version      1.7.0
// @description  Полный архив Supabase и отдельные экспериментальные статистические модели с проверкой по дням. Преимущество требует подтверждения; авто выключено до явного включения.
// @match        https://one-vv3016.com/*
// @match        https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/safari/preview.html
// @match        https://1play.gamedev-tech.cc/*
// @run-at       document-idle
// @inject-into  content
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      stzrirukuxcyalrsstxx.supabase.co
// ==/UserScript==

// Generated from the Safari-only hardened v2 model and the existing feed/scene.
// Build: npm ci && npm run build (inside god-preditor-pro-vip/safari).
// No remote JavaScript or credential reads. Live mode may click ONLY the two
// user-selected bet buttons; default is OFF, test mode never clicks them.
(() => {
  // src/autocashout.mjs
  var CASHOUT_FRESH_MS = 750;
  var CASHOUT_TICK_MS = 1e3;
  var CASHOUT_WAIT_MS = 12e4;
  var CASHOUT_ACK_MS = 2500;
  function createAutoCashout({
    now = Date.now,
    monotonic = () => performance.now(),
    context,
    readMultiplier,
    inspectCashout,
    clickCashout,
    onChange = () => {
    },
    onFatal = () => {
    }
  }) {
    let armed = false, mode = "test", generation = 0, busy = false, failing = false, notifying = false;
    let armedAt = 0, previousNow = 0, previousMono = 0, latestSource = null;
    let message = "Автовывод выключен", logs = [];
    const pending = /* @__PURE__ */ new Map(), acknowledgements = /* @__PURE__ */ new Map();
    const receipts = /* @__PURE__ */ new Set(), consumed = /* @__PURE__ */ new Set();
    function record4(text) {
      if (text !== message) {
        message = text;
        logs.push({ at: previousNow, text });
        logs = logs.slice(-30);
      }
    }
    function clear() {
      generation++;
      armed = false;
      pending.clear();
      acknowledgements.clear();
    }
    function fail(reason2) {
      if (failing) return false;
      failing = true;
      clear();
      record4(reason2);
      if (!notifying) {
        notifying = true;
        try {
          onChange();
        } catch {
        } finally {
          notifying = false;
        }
      }
      try {
        onFatal(reason2);
      } catch {
      } finally {
        failing = false;
      }
      return false;
    }
    function notify(text) {
      if (text) record4(text);
      if (notifying) return;
      notifying = true;
      try {
        onChange();
      } catch {
        fail("Автовывод выключен: ошибка обновления состояния");
      } finally {
        notifying = false;
      }
    }
    function disarm(reason2 = "Автовывод выключен") {
      clear();
      notify(reason2);
    }
    function clock3(initial = false) {
      const time = now(), mono = monotonic();
      if (!Number.isFinite(time) || !Number.isFinite(mono) || mono < 0) throw Error("Некорректные часы");
      if (!initial) {
        const wallGap = time - previousNow, monoGap = mono - previousMono;
        if (wallGap < 0 || monoGap < 0 || wallGap > CASHOUT_TICK_MS || monoGap > CASHOUT_TICK_MS || Math.abs(wallGap - monoGap) > 1500) throw Error("Таймер задержался или изменились часы");
      }
      return { time, mono };
    }
    function checkContext() {
      const state = context();
      if (!state || state.visible !== true || state.fresh !== true) throw Error("Вкладка скрыта или связь устарела");
      const configured = state.buttonsConfigured === true || Array.isArray(state.buttonsConfigured) && state.buttonsConfigured.length === 2 && state.buttonsConfigured.every(Boolean);
      if (mode === "live" && (state.autoBetArmed !== true || state.autoBetMode !== "live" || !configured)) {
        throw Error("Для реального автовывода нужны автоставки и две выбранные кнопки");
      }
      return state;
    }
    function sourceAt(time) {
      const readMono = monotonic();
      const source = readMultiplier();
      const observedAt = now(), observedMono = monotonic();
      if (!Number.isFinite(readMono) || readMono < 0 || !Number.isFinite(observedAt) || !Number.isFinite(observedMono) || observedMono < 0 || observedAt < time || observedMono < readMono || observedAt - time > CASHOUT_TICK_MS || observedMono - readMono > CASHOUT_TICK_MS || Math.abs(observedAt - time - (observedMono - readMono)) > 1500) throw Error("Чтение коэффициента задержалось или изменились часы");
      if (!source || !["ready", "waiting"].includes(source.state)) throw Error(source?.reason || "Живой коэффициент недоступен");
      if (!Number.isFinite(source.at) || source.at > observedAt || observedAt - source.at > CASHOUT_FRESH_MS || !Number.isInteger(source.epoch) || source.epoch < 0) throw Error("Живой коэффициент имеет неверное время или раунд");
      if (source.changedAt != null && (!Number.isFinite(source.changedAt) || source.changedAt > source.at)) {
        throw Error("Неверное время изменения живого коэффициента");
      }
      if (source.state === "ready" && (!Number.isFinite(source.value) || source.value < 1 || !Number.isFinite(source.changedAt))) {
        throw Error("Нет читаемого числового коэффициента");
      }
      if (latestSource && (source.epoch < latestSource.epoch || source.changedAt != null && latestSource.changedAt != null && source.changedAt < latestSource.changedAt)) {
        throw Error("Источник коэффициента сменился или время пошло назад");
      }
      latestSource = { ...source, observedAt };
      return latestSource;
    }
    function inspect(button) {
      const checked = inspectCashout(button);
      if (!checked || !["ready", "waiting", "closed"].includes(checked.state)) {
        throw Error(checked?.reason || "Кнопка вывода недоступна");
      }
      return checked;
    }
    function close(entry, reason2) {
      pending.delete(entry.index);
      notify(`Поле ${entry.index + 1}: ${reason2} · жду новую автоставку`);
    }
    function freshChange(source, time) {
      time = Math.max(time, source.observedAt);
      return source.state === "ready" && source.changedAt <= time && time - source.changedAt <= CASHOUT_FRESH_MS;
    }
    function arm(nextMode = "test") {
      if (busy || failing || notifying) return false;
      busy = true;
      try {
        clear();
        latestSource = null;
        if (!["test", "live"].includes(nextMode)) throw Error("Неизвестный режим автовывода");
        mode = nextMode;
        const { time, mono } = clock3(true);
        checkContext();
        const source = sourceAt(time);
        if (source.state !== "ready") throw Error("Сначала выбери читаемый живой коэффициент");
        armedAt = previousNow = time;
        previousMono = mono;
        armed = true;
        const ticket = generation;
        notify(mode === "live" ? "Автовывод включён · жду новую автоставку" : "Тест автовывода · реальных нажатий нет");
        return armed && generation === ticket;
      } catch (error) {
        return fail(`Автовывод выключен: ${error.message}`);
      } finally {
        busy = false;
      }
    }
    function onBetDispatched(receipt) {
      if (!armed || busy || failing) return false;
      if (!receipt || receipt.mode !== mode || ![0, 1].includes(receipt.index) || typeof receipt.windowKey !== "string" || !receipt.windowKey || receipt.windowKey.length > 500 || !Number.isFinite(receipt.target) || receipt.target < 1 || !receipt.button) return false;
      const id = `${receipt.windowKey}:${receipt.index}`;
      if (receipts.has(id)) return false;
      busy = true;
      try {
        const { time } = clock3();
        if (!Number.isFinite(receipt.at) || receipt.at < armedAt || receipt.at > time || time - receipt.at > CASHOUT_FRESH_MS) return false;
        checkContext();
        const source = sourceAt(time);
        if (pending.has(receipt.index) || acknowledgements.has(receipt.index)) throw Error("Новая ставка до завершения предыдущего наблюдения");
        receipts.add(id);
        pending.set(receipt.index, {
          id,
          index: receipt.index,
          windowKey: receipt.windowKey,
          receiptId: receipt.receiptId ?? id,
          target: receipt.target,
          button: receipt.button,
          at: receipt.at,
          mode,
          baselineEpoch: source.epoch,
          epoch: source.epoch,
          roundSeen: false,
          phase: "waiting",
          active: false,
          sawQueued: false,
          increases: 0,
          readyBaseline: false,
          lastValue: null,
          lastChangeAt: null
        });
        notify(`Поле ${receipt.index + 1}: цель ${receipt.target.toFixed(2)}× закреплена · жду новый полёт`);
        return armed;
      } catch (error) {
        return fail(`Автовывод выключен: ${error.message}`);
      } finally {
        busy = false;
      }
    }
    function canTrackBet(index) {
      if (!armed || mode !== "live" || busy || failing || ![0, 1].includes(index)) return false;
      busy = true;
      try {
        const { time } = clock3();
        checkContext();
        sourceAt(time);
        clock3();
        checkContext();
        if (pending.has(index) || acknowledgements.has(index)) throw Error(`Поле ${index + 1}: предыдущее наблюдение ещё не завершено`);
        return armed;
      } catch (error) {
        return fail(`Автовывод выключен: ${error.message}`);
      } finally {
        busy = false;
      }
    }
    function tick() {
      if (!armed || busy || failing) return;
      busy = true;
      const ticket = generation;
      try {
        const { time, mono } = clock3();
        previousNow = time;
        previousMono = mono;
        checkContext();
        const source = sourceAt(time);
        for (const [index, ack] of acknowledgements) {
          const checked = inspect(ack.button);
          if (checked.state !== "ready") {
            acknowledgements.delete(index);
            notify(`Поле ${index + 1}: запрос отправлен, кнопка изменилась · проверь игру`);
          } else if (time >= ack.until) throw Error(`Поле ${index + 1}: кнопка не подтвердила запрос · повторения нет`);
          if (!armed || generation !== ticket) return;
        }
        for (const entry of [...pending.values()]) {
          if (!armed || generation !== ticket) return;
          checkContext();
          const checked = inspect(entry.button);
          if (checked.state === "waiting") entry.sawQueued = true;
          if (checked.state === "closed" && (entry.active || entry.sawQueued)) {
            close(entry, "полёт или ставка завершились, результат не подтверждён");
            continue;
          }
          if (checked.state === "ready") entry.active = true;
          if (entry.phase === "waiting" && time - entry.at > CASHOUT_WAIT_MS) throw Error(`Поле ${entry.index + 1}: новый полёт не подтверждён за 120 секунд`);
          if (source.state === "waiting") {
            if (entry.phase === "tracking") throw Error("Живой коэффициент пропал во время полёта");
            continue;
          }
          if (entry.roundSeen && (source.epoch !== entry.epoch || source.value < entry.lastValue)) {
            close(entry, "коэффициент сбросился, прежнее наблюдение завершено");
            continue;
          }
          if (!entry.roundSeen) {
            const afterDispatch = source.at > entry.at && source.changedAt > entry.at;
            if (checked.state !== "ready") continue;
            if (!(source.epoch > entry.baselineEpoch || afterDispatch && source.value <= 1.2)) continue;
            entry.roundSeen = true;
            entry.epoch = source.epoch;
            entry.lastValue = source.value;
            entry.lastChangeAt = source.changedAt;
          }
          if (checked.state !== "ready") {
            entry.readyBaseline = false;
            entry.increases = 0;
            entry.lastValue = source.value;
            entry.lastChangeAt = source.changedAt;
            continue;
          }
          entry.active = true;
          entry.phase = "tracking";
          if (!freshChange(source, time)) throw Error("Живой коэффициент перестал обновляться");
          if (!entry.readyBaseline) {
            entry.readyBaseline = true;
            entry.lastValue = source.value;
            entry.lastChangeAt = source.changedAt;
            continue;
          }
          if (source.changedAt > entry.lastChangeAt && source.value > entry.lastValue) entry.increases++;
          entry.lastValue = source.value;
          entry.lastChangeAt = source.changedAt;
          if (entry.increases < 2 || source.value < entry.target) continue;
          const beforeRead = clock3();
          checkContext();
          const finalSource = sourceAt(beforeRead.time), finalButton = inspect(entry.button);
          const finalClock = clock3();
          checkContext();
          if (!armed || generation !== ticket) return;
          if (finalButton.state === "closed") {
            close(entry, "ставка завершилась до запроса");
            continue;
          }
          if (finalButton.state !== "ready") {
            entry.readyBaseline = false;
            entry.increases = 0;
            continue;
          }
          if (finalSource.state !== "ready") throw Error("Живой коэффициент пропал перед запросом");
          if (finalSource.epoch !== entry.epoch || finalSource.value < entry.lastValue) {
            close(entry, "коэффициент сбросился до запроса");
            continue;
          }
          if (!freshChange(finalSource, finalClock.time)) throw Error("Живой коэффициент устарел перед запросом");
          if (finalSource.value < entry.target) continue;
          pending.delete(entry.index);
          consumed.add(entry.id);
          if (mode === "test") {
            notify(`ТЕСТ ${entry.index + 1}: порог ${entry.target.toFixed(2)}× достигнут · нажатий нет`);
            continue;
          }
          acknowledgements.set(entry.index, { button: entry.button, until: finalClock.time + CASHOUT_ACK_MS });
          clickCashout(entry.button);
          if (!armed || generation !== ticket) return;
          notify(`Поле ${entry.index + 1}: запрос вывода отправлен · проверь подтверждение в игре`);
        }
      } catch (error) {
        fail(`Автовывод выключен: ${error.message}`);
      } finally {
        busy = false;
      }
    }
    return {
      arm,
      disarm,
      canTrackBet,
      onBetDispatched,
      tick,
      get state() {
        return {
          armed,
          mode,
          message,
          logs: logs.map((entry) => ({ ...entry })),
          pending: [...pending.values()].map(({ index, target, windowKey, receiptId, at, phase, increases }) => ({ index, target, windowKey, receiptId, at, phase, increases })),
          acknowledgements: [...acknowledgements.keys()],
          consumed: [...consumed],
          source: latestSource ? { ...latestSource } : null
        };
      }
    };
  }

  // src/activation.mjs
  function activate(button, action) {
    let pointer = null, suppressUntil = 0;
    button.addEventListener("pointerdown", (event) => {
      if (!event.isTrusted || event.button !== 0 || button.disabled) return;
      event.preventDefault();
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener("pointerup", (event) => {
      if (!event.isTrusted || !pointer || pointer.id !== event.pointerId) return;
      const start2 = pointer;
      pointer = null;
      suppressUntil = Date.now() + 700;
      const rect = button.getBoundingClientRect();
      if (!button.disabled && Math.hypot(event.clientX - start2.x, event.clientY - start2.y) < 12 && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) action(event);
    });
    button.addEventListener("pointercancel", () => {
      pointer = null;
    });
    button.addEventListener("lostpointercapture", () => {
      pointer = null;
    });
    button.addEventListener("click", (event) => {
      if (Date.now() < suppressUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.isTrusted && !button.disabled && event.detail === 0) action(event);
    });
  }

  // src/live-dom.mjs
  var OVERLAY_ID = "god-preditor-safari-overlay";
  var GAME_ORIGIN = "https://1play.gamedev-tech.cc";
  var DRAWN = /* @__PURE__ */ new Set(["canvas", "img", "svg", "video"]);
  var INTERACTIVE = /* @__PURE__ */ new Set(["button", "input", "a", "select", "textarea", "option"]);
  var BET = /^(?:сделать\s+ставку|зробити\s+ставку|ставка|поставить|place\s+bet|bet)(?:$|\s|[\d₴$€])/iu;
  var CASHOUT = /^(?:забрать|забрати|cash[\s-]?out|collect)(?:$|\s|[\d(₴$€₽])/iu;
  var WAITING = /^(?:cancel|отмен\S*|скасув\S*|очікуван\S*|ожидан\S*|waiting|placed|accepted|принят\S*)(?:$|\s|[\d(])/iu;
  var ACCOUNT = /withdraw|account|deposit|wallet|bonus|вывод|вывести|сч[её]т|кошел[её]к|пополн|бонус|вивести|рахунок|гаманець/iu;
  var PREBET_BUSY = /забра|cash[\s-]?out|collect|cancel|отмен|скасув|очікуван|ожидан|waiting|placed|accepted|принят/iu;
  var normalize = (text) => String(text ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  var textOf = (element) => normalize(typeof element.innerText === "string" ? element.innerText : element.textContent || "");
  var labelOf = (element) => normalize(element.innerText || element.getAttribute?.("aria-label") || element.textContent || "");
  function parseLiveMultiplier(text) {
    const value = normalize(text);
    if (!value || value.length > 40) return null;
    const match = /^(?:[x×х]\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*[x×х]|(\d+[.,]\d+))$/iu.exec(value);
    if (!match) return null;
    const number2 = Number((match[1] || match[2] || match[3]).replace(",", "."));
    return Number.isFinite(number2) && number2 >= 1 && number2 <= 1e6 ? number2 : null;
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
    return ancestors(element).some((item) => item.id === OVERLAY_ID);
  }
  function counterHazard(element) {
    for (const item of ancestors(element)) {
      if (DRAWN.has(item.localName)) return "Счётчик нарисован: DOM-текст недоступен. Выбери текстовый счётчик.";
      const editable = item.getAttribute?.("contenteditable");
      if (INTERACTIVE.has(item.localName) || item.getAttribute?.("role") === "button" || item.getAttribute?.("role") === "link" || item.isContentEditable || editable != null && editable !== "false")
        return "Выбери сам текст текущего коэффициента, вне кнопок и полей ввода.";
      if (item.id === OVERLAY_ID) return "Наведи прицел на счётчик игры.";
    }
    return null;
  }
  function topHit(root, x, y, ignoreOverlay = false) {
    const hits = root.elementsFromPoint?.(x, y) || [root.elementFromPoint?.(x, y)];
    return hits.find((item) => item && (!ignoreOverlay || !inOverlay(item))) || null;
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
    try {
      return new URL(frame.src, frame.ownerDocument.baseURI).origin;
    } catch {
      return "неизвестный домен";
    }
  }
  function hitLiveMultiplier(document2, x, y) {
    let doc = document2, px = x, py = y;
    try {
      for (let depth = 0; depth < 10; depth++) {
        const element = shadowHit(topHit(doc, px, py, true), px, py, true);
        if (!element) return { error: "Наведи центр прицела на текст текущего коэффициента." };
        if (element.localName === "iframe") {
          let child;
          try {
            child = element.contentDocument;
          } catch {
          }
          if (!child) return { error: "Игра в отдельном фрейме. Нужен доступ к домену: " + frameOrigin(element), frameOrigin: frameOrigin(element) };
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height || !element.offsetWidth || !element.offsetHeight) return { error: "Игровой фрейм скрыт." };
          px = (px - rect.left) * element.offsetWidth / rect.width - (element.clientLeft || 0);
          py = (py - rect.top) * element.offsetHeight / rect.height - (element.clientTop || 0);
          doc = child;
          continue;
        }
        const hazard = counterHazard(element);
        if (hazard) return { error: hazard };
        let candidate = element;
        for (let depth2 = 0; candidate && depth2 < 3; depth2++, candidate = parentOf(candidate)) {
          if (counterHazard(candidate)) break;
          const label = textOf(candidate);
          if (label.length > 40) break;
          if (parseLiveMultiplier(label) != null) return { element: candidate, document: doc, label };
        }
        return { error: "Здесь нет одного читаемого коэффициента (например, 1.74×)." };
      }
      return { error: "Слишком глубокое вложение игрового поля." };
    } catch {
      return { error: "Браузер не разрешает прочитать этот счётчик." };
    }
  }
  function visibleElement(element, doc) {
    if (!element || !doc || element.ownerDocument !== doc || !element.isConnected) return "элемент исчез, выбери его заново";
    const win = doc.defaultView;
    if (!win || win.document !== doc) return "игра перезагрузилась";
    if (doc.hidden || doc.visibilityState === "hidden") return "игровая вкладка скрыта";
    const rect = element.getBoundingClientRect();
    if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return "элемент скрыт";
    if (Number.isFinite(win.innerWidth) && (rect.left >= win.innerWidth || rect.left + rect.width <= 0) || Number.isFinite(win.innerHeight) && (rect.top >= win.innerHeight || rect.top + rect.height <= 0)) return "элемент вне видимой области";
    for (const item of ancestors(element)) {
      const style = win.getComputedStyle(item);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) return "элемент скрыт";
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
      if (!frame && current.location?.origin === GAME_ORIGIN) return null;
      if (!frame || frame.contentDocument !== current) return "доступ к игровому фрейму изменился";
      const parent = frame.ownerDocument, visibility = visibleElement(frame, parent);
      if (visibility) return visibility;
      const rect = frame.getBoundingClientRect();
      if (!frame.offsetWidth || !frame.offsetHeight) return "игровой фрейм скрыт";
      x = rect.left + (x + (frame.clientLeft || 0)) * rect.width / frame.offsetWidth;
      y = rect.top + (y + (frame.clientTop || 0)) * rect.height / frame.offsetHeight;
      if (checkCover && !isInside(frame, shadowHit(topHit(parent, x, y), x, y))) return "игровое поле перекрыто";
      current = parent;
    }
    return "слишком глубокое вложение игрового поля";
  }
  function createLiveMultiplierMonitor({ now = Date.now } = {}) {
    let source = null, previous = null, changedAt = null, epoch = 0, lastAt = null, clockUnsafe = false;
    function reset(selected) {
      source = selected ? { element: selected.element, document: selected.document, label: selected.label } : null;
      previous = null;
      changedAt = null;
      epoch = 0;
      lastAt = null;
      clockUnsafe = false;
    }
    function read() {
      let at;
      try {
        at = now();
      } catch {
        at = NaN;
      }
      const result = (state, reason2, value = null) => ({ state, value, at, changedAt, epoch, reason: reason2 });
      if (clockUnsafe || !Number.isFinite(at) || at < 0 || lastAt != null && at < lastAt || changedAt != null && changedAt > at) {
        clockUnsafe = true;
        return result("unsafe", "время изменилось — выбери счётчик заново");
      }
      lastAt = at;
      if (!source) return result("unsafe", "счётчик не выбран");
      try {
        const element = source.element, doc = source.document;
        const hazard = counterHazard(element);
        if (hazard) return result("unsafe", hazard);
        const visibility = visibleElement(element, doc);
        if (visibility && visibility !== "элемент скрыт") return result("unsafe", visibility);
        const rect = element.getBoundingClientRect();
        if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0)
          return result("unsafe", "неверные размеры выбранного счётчика");
        const frame = frameChain(doc, rect.left + rect.width / 2, rect.top + rect.height / 2, false);
        if (frame) return result("unsafe", frame);
        if (visibility) return result("waiting", "счётчик временно скрыт — ждём новый полёт");
        const label = textOf(element);
        if (label.length > 40) return result("unsafe", "выбранный текст изменился — выбери счётчик заново");
        const value = parseLiveMultiplier(label);
        if (value == null) return result("waiting", "ждём читаемый текущий коэффициент");
        if (previous == null || previous !== value) {
          if (previous != null && previous - value > 0.01 + Number.EPSILON * Math.max(previous, value) * 4) epoch++;
          changedAt = at;
        }
        previous = value;
        return result("ready", "коэффициент читается", value);
      } catch {
        return result("unsafe", "доступ к счётчику закрыт браузером");
      }
    }
    return { setSource: reset, clear: () => reset(null), read };
  }
  function inspectCashoutButton(selected) {
    const element = selected?.element, doc = selected?.document;
    try {
      const originalLabel = normalize(selected?.label);
      if (!BET.test(originalLabel) || ACCOUNT.test(originalLabel) || PREBET_BUSY.test(originalLabel)) return { state: "unsafe", reason: "нужна ранее выбранная кнопка «Ставка»" };
      if (!element || element.localName !== "button" && element.getAttribute?.("role") !== "button" || inOverlay(element)) return { state: "unsafe", reason: "это не выбранная игровая кнопка" };
      const visibility = visibleElement(element, doc);
      if (visibility) return { state: "unsafe", reason: visibility };
      const label = labelOf(element);
      if (ACCOUNT.test(label)) return { state: "unsafe", reason: "кнопка относится к счёту или выводу средств", label };
      if (BET.test(label)) return { state: "closed", reason: "поле снова принимает ставки", label };
      if (WAITING.test(label)) return { state: "waiting", reason: "кнопка ожидает игровой раунд", label };
      if (!CASHOUT.test(label)) return { state: "unsafe", reason: "это не кнопка «Забрать»", label };
      const style = doc.defaultView.getComputedStyle(element);
      if (element.disabled || element.matches?.(":disabled") || element.getAttribute?.("aria-disabled") === "true" || style.pointerEvents === "none")
        return { state: "waiting", reason: "кнопка «Забрать» пока недоступна", label };
      const rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const hit = shadowHit(topHit(doc, x, y), x, y);
      const root = element.getRootNode?.();
      if (!isInside(element, hit) && !(root?.host === hit && !root.elementFromPoint && !root.elementsFromPoint))
        return { state: "waiting", reason: "кнопка перекрыта — отодвинь панель", label };
      const frame = frameChain(doc, x, y, true);
      if (frame) return { state: /перекрыто/u.test(frame) ? "waiting" : "unsafe", reason: frame, label };
      return { state: "ready", reason: "кнопка «Забрать» доступна", label };
    } catch {
      return { state: "unsafe", reason: "доступ к кнопке закрыт браузером" };
    }
  }
  function clickCashoutButton(selected) {
    if (inspectCashoutButton(selected).state !== "ready") throw Error("Кнопка «Забрать» уже недоступна");
    selected.document.defaultView.HTMLElement.prototype.click.call(selected.element);
  }
  function pickLiveMultiplier(root, done) {
    const doc = root.host.ownerDocument, win = doc.defaultView;
    const picker = doc.createElement("div");
    picker.className = "picker";
    picker.innerHTML = `<div class="pick-bar"><b>Выбрать живой коэффициент</b><p>Перетащи прицел на текущий летящий коэффициент, затем нажми «Выбрать». История и суммы не подходят.</p><div class="pick-info"></div><button class="pick-confirm" disabled>Выбрать</button><button class="pick-cancel">Отмена</button></div><div class="pick-cursor" role="button" aria-label="Прицел выбора текущего коэффициента">＋</div>`;
    root.append(picker);
    const cursor = picker.querySelector(".pick-cursor"), info = picker.querySelector(".pick-info"), confirm = picker.querySelector(".pick-confirm");
    let point = { x: win.innerWidth / 2, y: win.innerHeight * 0.7 }, candidate = null, drag = null, stopped = false;
    function update() {
      cursor.style.left = point.x - 25 + "px";
      cursor.style.top = point.y - 25 + "px";
      candidate = hitLiveMultiplier(doc, point.x, point.y);
      info.textContent = candidate.error || candidate.label;
      confirm.disabled = !!candidate.error;
    }
    cursor.addEventListener("pointerdown", (event) => {
      if (!event.isTrusted || event.button !== 0) return;
      event.preventDefault();
      cursor.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, dx: point.x - event.clientX, dy: point.y - event.clientY };
    });
    cursor.addEventListener("pointermove", (event) => {
      if (!event.isTrusted || !drag || drag.id !== event.pointerId) return;
      point = { x: Math.max(25, Math.min(win.innerWidth - 25, event.clientX + drag.dx)), y: Math.max(25, Math.min(win.innerHeight - 25, event.clientY + drag.dy)) };
      update();
    });
    const stopDrag = () => {
      drag = null;
    };
    cursor.addEventListener("pointerup", stopDrag);
    cursor.addEventListener("pointercancel", stopDrag);
    cursor.addEventListener("lostpointercapture", stopDrag);
    const timer = setInterval(update, 300);
    function finish(value) {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      picker.style.opacity = "0";
      picker.style.pointerEvents = "auto";
      picker.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      setTimeout(() => {
        picker.remove();
        done(value);
      }, 400);
    }
    activate(picker.querySelector(".pick-cancel"), () => finish({ cancelled: true }));
    activate(confirm, () => {
      if (!stopped) {
        update();
        if (!candidate.error) finish(candidate);
      }
    });
    update();
    return () => finish({ cancelled: true });
  }

  // src/freshness.mjs
  function sourceReady(status, stats, lastSuccessAt, now = Date.now()) {
    if (status !== "connected" || stats?.ready !== true || !Number.isFinite(now) || !Number.isFinite(lastSuccessAt) || !Number.isFinite(stats.lastAt)) return false;
    const pollAge = now - lastSuccessAt, roundAge = now - stats.lastAt;
    return pollAge >= 0 && pollAge <= 12e3 && roundAge >= 0 && roundAge <= 18e4;
  }

  // src/storage.mjs
  async function loadPanelState(gm, model, { key, legacyKey }) {
    const current = await gm.getValue(key, null);
    const saved = current ?? await gm.getValue(legacyKey, null);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    const journal = Array.isArray(saved.journal) ? saved.journal.filter((x) => x && typeof x === "object") : [];
    const legacy = Array.isArray(saved.legacyJournal) ? saved.legacyJournal.filter((x) => x && typeof x === "object") : [];
    const active = saved.model === model ? journal.filter((x) => x.model === model) : [];
    const archived = saved.model === model ? journal.filter((x) => x.model !== model) : journal;
    const rare = current != null && saved.model === model && Array.isArray(saved.rareJournal) ? saved.rareJournal.filter((x) => x && typeof x === "object" && !Array.isArray(x)) : [];
    return {
      model,
      rows: Array.isArray(saved.rows) ? saved.rows : [],
      journal: active.slice(-100),
      rareJournal: rare.slice(-100),
      legacyJournal: [...legacy, ...archived].slice(-200),
      selected: saved.selected === "big" ? "big" : "primary",
      ui: saved.ui && typeof saved.ui === "object" && !Array.isArray(saved.ui) ? saved.ui : {}
    };
  }

  // src/frame-support.mjs
  var GAME_ORIGIN2 = "https://1play.gamedev-tech.cc";
  var CASINO_ORIGIN = "https://one-vv3016.com";
  var READY = "gp-frame-ready-v1";
  var STATE = "gp-parent-state-v1";
  function installFrameSupport(win, onReady = () => {
  }, getProbes = () => []) {
    let parentSeenAt = 0, parentReady = false;
    const framed = win !== win.top;
    if (framed && win.location.origin !== GAME_ORIGIN2) return { invalidate() {
      parentReady = false;
    }, ready: () => false };
    function message(event) {
      if (framed) {
        if (event.source !== win.top || event.origin !== CASINO_ORIGIN || event.data?.type !== STATE) return;
        parentSeenAt = Date.now();
        parentReady = event.data.ready === true;
      } else {
        if (event.origin !== GAME_ORIGIN2 || event.data?.type !== READY) return;
        const frame = [...win.document.querySelectorAll("iframe")].find((f) => f.contentWindow === event.source && new URL(f.src, win.location.href).origin === GAME_ORIGIN2);
        if (!frame) return;
        const rect = frame.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        const probes = Array.isArray(event.data.probes) ? event.data.probes.slice(0, 2) : [];
        const pointsVisible = probes.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= frame.clientWidth && p.y <= frame.clientHeight && win.document.elementFromPoint(rect.left + (p.x + frame.clientLeft) * rect.width / frame.offsetWidth, rect.top + (p.y + frame.clientTop) * rect.height / frame.offsetHeight) === frame);
        const ready = !win.document.hidden && rect.width > 0 && rect.height > 0 && win.document.elementFromPoint(x, y) === frame && pointsVisible;
        event.source.postMessage({ type: STATE, ready }, GAME_ORIGIN2);
        onReady();
      }
    }
    win.addEventListener("message", message);
    const timer = framed ? win.setInterval(() => win.top.postMessage({ type: READY, probes: getProbes() }, CASINO_ORIGIN), 500) : null;
    return {
      invalidate() {
        parentReady = false;
      },
      ready: () => !framed || parentReady && Date.now() - parentSeenAt < 1600,
      stop() {
        win.removeEventListener("message", message);
        if (timer) win.clearInterval(timer);
      }
    };
  }

  // ../supabase-config.mjs
  var SUPABASE_CONFIG = Object.freeze({
    url: "https://stzrirukuxcyalrsstxx.supabase.co",
    publishableKey: "sb_publishable_ZhoUzbPBM33K3qoL-HY20Q_oVU4ebc7",
    table: "luckyjet_rounds",
    initialLimit: 1e3,
    pageSize: 500,
    pollMs: 5e3,
    autoConnect: true
  });

  // ../supabase-feed.mjs
  var COLUMNS = "id,source_seq,coefficient,round_timestamp,estimated,origin";
  function mapSupabaseRound(row, now = Date.now()) {
    const timestamp7 = Date.parse(row.round_timestamp);
    const coefficient = Number(row.coefficient);
    if (row.estimated !== false || !row.round_timestamp || !Number.isFinite(timestamp7) || timestamp7 <= 0 || timestamp7 > now || !Number.isFinite(coefficient) || coefficient < 1 || !row.id) return null;
    return { id: `supabase:luckyjet:${row.id}`, coefficient, timestamp: timestamp7, source: "Supabase · LuckyJet" };
  }
  function createSupabaseFeed(config, { onRounds, onStatus, fetchImpl = fetch, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
    const root = new URL(config.url);
    if (root.protocol !== "https:" || !config.publishableKey?.startsWith("sb_publishable_")) throw Error("Требуются HTTPS и publishable key Supabase");
    if (!/^[a-z_][a-z0-9_]*$/.test(config.table)) throw Error("Неверное имя таблицы");
    let closed = false, timer = null, request = null, cursor = null, lastSuccess = null;
    const report = (state, extra = {}) => {
      if (!closed) onStatus?.({ state, cursor, lastSuccess, ...extra });
    };
    async function getPage(initial) {
      const url = new URL(`/rest/v1/${config.table}`, root);
      url.searchParams.set("select", COLUMNS);
      url.searchParams.set("completed", "eq.true");
      url.searchParams.set("estimated", "eq.false");
      url.searchParams.set("round_timestamp", "not.is.null");
      url.searchParams.set("order", `source_seq.${initial ? "desc" : "asc"}`);
      url.searchParams.set("limit", String(initial ? config.initialLimit : config.pageSize));
      if (!initial) url.searchParams.set("source_seq", "gt." + cursor);
      request = new AbortController();
      const timeout = setTimeout(() => request?.abort(), 15e3);
      try {
        const response = await fetchImpl(url, { headers: { apikey: config.publishableKey, Accept: "application/json" }, signal: request.signal, credentials: "omit", cache: "no-store" });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw Error(`Supabase HTTP ${response.status}${body.code ? " · " + body.code : ""}`);
        }
        const rows = await response.json();
        if (!Array.isArray(rows)) throw Error("Supabase вернул неверный формат истории");
        return rows;
      } finally {
        clearTimeout(timeout);
        request = null;
      }
    }
    async function poll() {
      let nextDelay = config.pollMs;
      try {
        const initial = cursor === null;
        const rows = await getPage(initial);
        if (closed) return;
        const sorted = [...rows].sort((a, b) => BigInt(a.source_seq) < BigInt(b.source_seq) ? -1 : 1);
        const batch = [];
        let candidate = cursor;
        for (const row of sorted) {
          if (Date.parse(row.round_timestamp) > now()) break;
          const mapped = mapSupabaseRound(row, now());
          if (mapped) batch.push(mapped);
          if (candidate === null || BigInt(row.source_seq) > BigInt(candidate)) candidate = String(row.source_seq);
        }
        if (batch.length) await onRounds(batch, { initial });
        if (closed) return;
        cursor = candidate ?? "0";
        lastSuccess = now();
        report("connected", { received: batch.length, initial });
        if (!initial && rows.length >= config.pageSize) nextDelay = 50;
      } catch (error) {
        if (!closed) report("error", { message: error.message });
      } finally {
        if (!closed) timer = schedule(poll, nextDelay);
      }
    }
    report("connecting");
    void poll();
    return { stop() {
      closed = true;
      cancel(timer);
      request?.abort();
    }, status() {
      return { cursor, lastSuccess, closed };
    } };
  }

  // ../data.mjs
  var LIMIT = 1e4;
  function parseTime(value, now = Date.now()) {
    if (value == null || value === "") return now;
    const numeric = typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value));
    const v = numeric ? Number(value) : Date.parse(value);
    return numeric && v < 1e12 ? v * 1e3 : v;
  }
  function normalizeRound(input, source = "custom", now = Date.now()) {
    const o = typeof input === "number" ? { coefficient: input } : input;
    if (!o || typeof o !== "object") throw Error("Раунд должен быть объектом или числом");
    const coefficient = Number(o.coefficient ?? o.multiplier ?? o.coef ?? o.value);
    const rawTimestamp = o.timestamp ?? o.played_at ?? o.time;
    if (rawTimestamp == null || String(rawTimestamp).trim() === "") throw Error("Для проверки временного окна нужно время раунда");
    const timestamp7 = parseTime(rawTimestamp, now);
    if (!Number.isFinite(coefficient) || coefficient < 1) throw Error("Коэффициент должен быть числом ≥ 1");
    if (!Number.isFinite(timestamp7) || timestamp7 <= 0 || timestamp7 > now) throw Error("Неверное или будущее время раунда");
    const id = String(o.id ?? `${timestamp7}:${coefficient}`);
    if (id.length > 300) throw Error("Слишком длинный ID");
    return { id, coefficient, timestamp: timestamp7, source: String(o.source ?? source).slice(0, 100) };
  }
  function mergeRounds(current, incoming, source, now = Date.now()) {
    if (!Array.isArray(incoming)) incoming = [incoming];
    if (incoming.length > 5e4) throw Error("За один импорт допускается до 50 000 записей");
    const map = new Map(current.map((r) => [r.id, r]));
    let added = 0, rejected = 0;
    for (const raw of incoming) {
      try {
        const r = normalizeRound(raw, source, now);
        if (!map.has(r.id)) {
          map.set(r.id, r);
          added++;
        }
      } catch {
        rejected++;
      }
    }
    return { rounds: [...map.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, LIMIT), added, rejected };
  }

  // src/prediction-v2.ts
  var EVIDENCE_STATUS = "experimental-unvalidated";
  var MIN_ROUNDS = 20;
  var MAX_FRESH_AGE_MS = 18e4;
  var POISSON_HORIZON_MS = 18e4;
  var MIN = 6e4;
  var MIN_HOLD_MS = MIN;
  var MIN_TIMESTAMP = 9466848e5;
  var MAX_TIMESTAMP = 864e13;
  var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  var finite = (value) => typeof value === "number" && Number.isFinite(value);
  var validTimestamp = (value) => finite(value) && Number.isSafeInteger(value) && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP;
  var validNow = (value) => validTimestamp(value) && value <= MAX_TIMESTAMP - 30 * MIN;
  function stableId(value) {
    if (typeof value === "string" && value.length > 0 && value.trim() === value) return value;
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
    return null;
  }
  function normalizeWithDiagnostics(input, now) {
    const diagnostics = {
      inputCount: Array.isArray(input) ? input.length : 0,
      acceptedCount: 0,
      invalidCount: 0,
      futureCount: 0,
      estimatedCount: 0,
      incompleteCount: 0,
      duplicateCount: 0,
      conflictingIdCount: 0,
      conflictingRecordCount: 0,
      freshestAgeMs: null,
      fresh: false,
      validInput: Array.isArray(input) && validNow(now)
    };
    if (!diagnostics.validInput || !Array.isArray(input)) return { rounds: [], diagnostics };
    const groups = /* @__PURE__ */ new Map();
    for (const value of input) {
      if (!isRecord(value)) {
        diagnostics.invalidCount++;
        continue;
      }
      const id = stableId(value.id);
      if (id === null || !finite(value.coefficient) || value.coefficient < 1 || !validTimestamp(value.timestamp) || value.estimated !== void 0 && typeof value.estimated !== "boolean" || value.completed !== void 0 && typeof value.completed !== "boolean") {
        diagnostics.invalidCount++;
        continue;
      }
      if (value.estimated === true) {
        diagnostics.estimatedCount++;
        continue;
      }
      if (value.completed === false) {
        diagnostics.incompleteCount++;
        continue;
      }
      if (value.timestamp > now) {
        diagnostics.futureCount++;
        continue;
      }
      const round = { id, coefficient: value.coefficient, timestamp: value.timestamp };
      const existing = groups.get(id);
      if (existing) {
        existing.count++;
        existing.conflict ||= existing.round.coefficient !== round.coefficient || existing.round.timestamp !== round.timestamp;
      } else groups.set(id, { round, count: 1, conflict: false });
    }
    const rounds = [];
    for (const group of groups.values()) {
      if (group.conflict) {
        diagnostics.conflictingIdCount++;
        diagnostics.conflictingRecordCount += group.count;
      } else {
        rounds.push(group.round);
        diagnostics.duplicateCount += group.count - 1;
      }
    }
    rounds.sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    diagnostics.acceptedCount = rounds.length;
    diagnostics.freshestAgeMs = rounds.length ? now - rounds[0].timestamp : null;
    diagnostics.fresh = diagnostics.freshestAgeMs !== null && diagnostics.freshestAgeMs <= MAX_FRESH_AGE_MS;
    return { rounds, diagnostics };
  }
  function normalizeRounds(rounds, now = Date.now()) {
    return normalizeWithDiagnostics(rounds, now).rounds;
  }
  function newestContiguousSegment(rounds) {
    let boundary = rounds.length;
    let boundaryGapMs = null;
    for (let index = 1; index < rounds.length; index++) {
      const gap = rounds[index - 1].timestamp - rounds[index].timestamp;
      if (gap > MAX_FRESH_AGE_MS) {
        boundary = index;
        boundaryGapMs = gap;
        break;
      }
    }
    return {
      rounds: rounds.slice(0, boundary),
      diagnostics: {
        gapThresholdMs: MAX_FRESH_AGE_MS,
        currentSegmentCount: boundary,
        discardedOlderSegmentRows: rounds.length - boundary,
        boundaryGapMs,
        status: boundaryGapMs === null ? "no-large-gap-observed" : "continuity-unknown-before-gap"
      }
    };
  }
  var mean = (xs) => {
    let value = 0;
    for (let i = 0; i < xs.length; i++) value += (xs[i] - value) / (i + 1);
    return value;
  };
  var median = (xs) => {
    if (!xs.length) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
  };
  var safeMax = (xs) => {
    let maximum = 0;
    for (const value of xs) if (value > maximum) maximum = value;
    return maximum;
  };
  var stddev = (xs) => {
    if (xs.length < 2) return 0;
    const average = mean(xs);
    const scale = safeMax(xs);
    return scale ? scale * Math.sqrt(mean(xs.map((x) => ((x - average) / scale) ** 2))) : 0;
  };
  var emaNewestFirst = (xs, alpha) => {
    if (!xs.length) return 0;
    let value = xs[xs.length - 1];
    for (let i = xs.length - 2; i >= 0; i--) value = alpha * xs[i] + (1 - alpha) * value;
    return value;
  };
  var geoMean = (xs) => xs.length ? Math.exp(mean(xs.map((x) => Math.log(Math.max(x, 1.001))))) : 0;
  var mad = (xs) => {
    if (xs.length < 2) return 0;
    const center = median(xs);
    return median(xs.map((x) => Math.abs(x - center)));
  };
  var clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function bucketBy(rounds, keyOf2) {
    const grouped2 = /* @__PURE__ */ new Map();
    for (const round of rounds) {
      const key = keyOf2(round);
      const values = grouped2.get(key) ?? [];
      values.push(round.coefficient);
      grouped2.set(key, values);
    }
    return new Map([...grouped2].map(([key, values]) => [key, { count: values.length, avg: geoMean(values), max: safeMax(values) }]));
  }
  function gapAnalysis(rounds, threshold) {
    const hits = rounds.filter((round) => round.coefficient >= threshold).sort((a, b) => a.timestamp - b.timestamp);
    const gaps = [];
    for (let i = 1; i < hits.length; i++) gaps.push(hits[i].timestamp - hits[i - 1].timestamp);
    return {
      medGap: median(gaps),
      madGap: mad(gaps),
      last: hits.at(-1)?.timestamp ?? null,
      count: hits.length,
      allGapsPositive: gaps.length > 0 && gaps.every((gap) => gap > 0)
    };
  }
  function poissonWindowProbability(lambdaPerMs, horizonMs) {
    if (!finite(lambdaPerMs) || lambdaPerMs < 0 || !finite(horizonMs) || horizonMs < 0) return null;
    return -Math.expm1(-lambdaPerMs * horizonMs);
  }
  function additionalFromNormalized(rounds, now) {
    const sorted = [...rounds].sort((a, b) => a.timestamp - b.timestamp);
    const mega = gapAnalysis(sorted, 100);
    let cycleCandidate = null;
    let clusterCandidate = null;
    if (mega.count >= 5 && mega.last !== null && mega.medGap > 0) {
      const expected = mega.last + mega.medGap;
      const drift = expected - now;
      const tolerance = clamp(mega.madGap * 1.4826 || mega.medGap * 0.35, 2 * MIN, 12 * MIN);
      const sinceLast = now - mega.last;
      const stable = mega.allGapsPositive && mega.madGap < mega.medGap * 0.5;
      if (stable && (Math.abs(drift) <= tolerance * 0.7 || sinceLast >= mega.medGap * 0.9)) {
        const driftScore = clamp(1 - Math.abs(drift) / Math.max(tolerance, 1), 0, 1);
        cycleCandidate = {
          signal: "cycle",
          expectedAt: Math.ceil(drift > 0 ? expected : now + Math.max(2 * MIN, tolerance * 0.4)),
          windowMs: Math.ceil(clamp(tolerance, 3 * MIN, 10 * MIN)),
          estimatedCoef: 100,
          heuristicScore: Math.round(clamp(55 + Math.min(10, mega.count) + driftScore * 12, 55, 82)),
          reason: `Cycle 100x≈${(mega.medGap / MIN).toFixed(1)}min — dernier il y a ${(sinceLast / MIN).toFixed(1)}min (${mega.count} évts)`
        };
      }
    }
    const recent = sorted.slice(-80);
    const big20 = recent.filter((round) => round.coefficient >= 20).length;
    const big50 = recent.filter((round) => round.coefficient >= 50).length;
    if (big50 >= 3 && big20 >= 6) {
      clusterCandidate = {
        signal: "cluster",
        expectedAt: now + 3 * MIN,
        windowMs: 6 * MIN,
        estimatedCoef: 120,
        heuristicScore: Math.round(clamp(55 + big50 * 5 + big20, 55, 82)),
        reason: `Cluster : ${big20}×≥20x + ${big50}×≥50x sur ${recent.length} tours`
      };
    }
    let poisson = null;
    const span = sorted.length ? sorted[sorted.length - 1].timestamp - sorted[0].timestamp : 0;
    if (mega.count >= 4 && sorted.length >= 80 && span > 0) {
      const lambdaPerMs = mega.count / span;
      poisson = {
        model: "stationary-poisson-assumption",
        evidenceStatus: "assumption-only-not-calibrated",
        eventCount: mega.count,
        observedSpanMs: span,
        lambdaPerMs,
        horizonMs: POISSON_HORIZON_MS,
        nextWindowProbabilityUnderStationaryModel: poissonWindowProbability(lambdaPerMs, POISSON_HORIZON_MS)
      };
    }
    const diagnostics = {
      analyzedAt: now,
      candidateCount: Number(cycleCandidate !== null) + Number(clusterCandidate !== null),
      cycleCandidate,
      clusterCandidate,
      overlap: null,
      decision: "insufficient-candidates",
      poisson
    };
    if (!cycleCandidate || !clusterCandidate) return { bigOpportunity: null, diagnostics };
    const start2 = Math.max(cycleCandidate.expectedAt, clusterCandidate.expectedAt);
    const end = Math.min(cycleCandidate.expectedAt + cycleCandidate.windowMs, clusterCandidate.expectedAt + clusterCandidate.windowMs);
    if (end <= start2) {
      diagnostics.decision = "disjoint-windows";
      return { bigOpportunity: null, diagnostics };
    }
    diagnostics.overlap = { start: start2, end };
    diagnostics.decision = "overlapping-heuristics";
    return {
      bigOpportunity: {
        expectedAt: start2,
        windowMs: end - start2,
        estimatedCoef: Math.min(cycleCandidate.estimatedCoef, clusterCandidate.estimatedCoef),
        heuristicScore: Math.min(cycleCandidate.heuristicScore, clusterCandidate.heuristicScore),
        generatedAt: now,
        expiresAt: end,
        evidenceStatus: EVIDENCE_STATUS,
        reason: `${cycleCandidate.reason} ; ${clusterCandidate.reason} — fenêtres communes ; indices corrélés non validés`
      },
      diagnostics
    };
  }
  function validPreviousOpportunity(previous, now) {
    if (!isRecord(previous) || !isRecord(previous.bigOpportunity)) return null;
    const value = previous.bigOpportunity;
    if (value.evidenceStatus !== EVIDENCE_STATUS || !finite(value.estimatedCoef) || value.estimatedCoef < 100 || !finite(value.heuristicScore) || value.heuristicScore < 0 || value.heuristicScore > 100 || !validTimestamp(value.generatedAt) || value.generatedAt > now || !validTimestamp(value.expectedAt) || value.expectedAt < value.generatedAt + 3 * MIN || !finite(value.windowMs) || !Number.isSafeInteger(value.windowMs) || value.windowMs <= 0 || value.windowMs > 6 * MIN || !validTimestamp(value.expiresAt) || value.expiresAt !== value.expectedAt + value.windowMs || value.expiresAt > value.generatedAt + 9 * MIN || now >= value.expiresAt || typeof value.reason !== "string" || !value.reason.trim()) return null;
    return {
      expectedAt: value.expectedAt,
      windowMs: value.windowMs,
      estimatedCoef: value.estimatedCoef,
      heuristicScore: value.heuristicScore,
      generatedAt: value.generatedAt,
      expiresAt: value.expiresAt,
      evidenceStatus: EVIDENCE_STATUS,
      reason: value.reason
    };
  }
  function validPrevious(previous, now) {
    if (!isRecord(previous) || previous.evidenceStatus !== EVIDENCE_STATUS || !finite(previous.estimatedCoef) || previous.estimatedCoef < 1 || !finite(previous.heuristicScore) || previous.heuristicScore < 0 || previous.heuristicScore > 100 || !validTimestamp(previous.generatedAt) || previous.generatedAt > now || !validTimestamp(previous.estimatedAt) || previous.estimatedAt < previous.generatedAt + 9e4 || previous.estimatedAt > previous.generatedAt + 3 * MIN || !finite(previous.windowMs) || !Number.isSafeInteger(previous.windowMs) || previous.windowMs < 9e4 || previous.windowMs > 3 * MIN || typeof previous.pattern !== "string" || !previous.pattern.trim() || typeof previous.basis !== "string" || !previous.basis.trim()) return null;
    return {
      estimatedCoef: previous.estimatedCoef,
      estimatedAt: previous.estimatedAt,
      windowMs: previous.windowMs,
      generatedAt: previous.generatedAt,
      pattern: previous.pattern,
      basis: previous.basis,
      heuristicScore: previous.heuristicScore,
      evidenceStatus: EVIDENCE_STATUS
    };
  }
  function primaryFromNormalized(sorted, now) {
    const coefs = sorted.map((round) => round.coefficient);
    const medAll = median(coefs);
    const geoAll = geoMean(coefs);
    const last20 = coefs.slice(0, 20);
    const last50 = coefs.slice(0, 50);
    const avg50 = mean(last50);
    const ema20 = emaNewestFirst(last20, 0.25);
    const ema50 = emaNewestFirst(last50, 0.12);
    const sd50 = stddev(last50);
    const mad50 = mad(last50);
    const golden = gapAnalysis(sorted, 10);
    const sinceGolden = golden.last === null ? Infinity : now - golden.last;
    const hourBuckets = bucketBy(sorted, (round) => new Date(round.timestamp).getUTCHours());
    const minuteBuckets = bucketBy(sorted, (round) => new Date(round.timestamp).getUTCMinutes());
    const nowDate = new Date(now);
    const hb = hourBuckets.get(nowDate.getUTCHours());
    const mbNext = minuteBuckets.get((nowDate.getUTCMinutes() + 2) % 60);
    const lowStreak = coefs.slice(0, 15).length === 15 && coefs.slice(0, 15).every((coefficient) => coefficient < 2);
    const recentBig = sorted.slice(0, 30).filter((round) => round.coefficient >= 20);
    const finish = (value) => ({ ...value, generatedAt: now, evidenceStatus: EVIDENCE_STATUS });
    if (golden.medGap > 0 && golden.last !== null) {
      const drift = golden.last + golden.medGap - now;
      const tolerance = clamp(golden.madGap * 1.4826 || golden.medGap * 0.55, MIN, 4 * MIN);
      const stable = golden.count >= 8 && golden.allGapsPositive && golden.madGap < golden.medGap * 0.6;
      if (stable && Math.abs(drift) <= tolerance * 0.6) {
        const divisor = recentBig.length >= 3 ? 2 : recentBig.length >= 1 ? 3 : 4;
        const estimated2 = clamp(safeMax(sorted.slice(0, 80).map((round) => round.coefficient)) / divisor, 2, 20);
        const cycleScore = clamp(60 - Math.abs(drift) / tolerance * 15, 40, 62);
        const hourBoost = hb && hb.avg > geoAll ? 3 : 0;
        const sampleBoost = clamp(golden.count / 20, 0, 4);
        return finish({
          estimatedCoef: +estimated2.toFixed(2),
          heuristicScore: Math.round(clamp(cycleScore + hourBoost + sampleBoost, 40, 68)),
          estimatedAt: Math.ceil(drift > 0 ? now + Math.max(drift, 9e4) : now + 2 * MIN),
          windowMs: Math.ceil(clamp(golden.medGap * 0.25, 9e4, 3 * MIN)),
          pattern: "Cycle des cotes d'or détecté",
          basis: `Cycle médian ${(golden.medGap / MIN).toFixed(1)} min — dernier ${(sinceGolden / MIN).toFixed(1)} min — MAD ${(golden.madGap / MIN).toFixed(2)}min`
        });
      }
    }
    if (lowStreak) return finish({
      estimatedCoef: +clamp(geoAll * 2.5 + medAll, 2.5, 15).toFixed(2),
      heuristicScore: Math.round(clamp(70 + Math.min(15, (now - sorted[14].timestamp) / MIN), 65, 92)),
      estimatedAt: now + 9e4,
      windowMs: 2 * MIN,
      pattern: "Série basse — heuristique de rebond non validée",
      basis: `15 tours <2x — moy géo ${geoAll.toFixed(2)}x, médiane ${medAll.toFixed(2)}x`
    });
    if (recentBig.length >= 3) {
      const averageBig = geoMean(recentBig.map((round) => round.coefficient));
      const divisor = recentBig.length >= 5 ? 3 : recentBig.length >= 4 ? 4 : 5;
      return finish({
        estimatedCoef: +clamp(averageBig / divisor, 2, 12).toFixed(2),
        heuristicScore: Math.min(78, 60 + recentBig.length * 3),
        estimatedAt: now + 2 * MIN,
        windowMs: 2.5 * MIN,
        pattern: `${recentBig.length} cotes ≥20x récentes`,
        basis: `Moy. géo grosses cotes ${averageBig.toFixed(2)}x ÷ ${divisor}`
      });
    }
    const recent60 = sorted.slice(0, 60);
    const midZone = recent60.filter((round) => round.coefficient >= 5 && round.coefficient < 10);
    const smallShare60 = recent60.filter((round) => round.coefficient < 2).length / recent60.length;
    if (midZone.length >= 3) {
      const midGeo = geoMean(midZone.map((round) => round.coefficient));
      const cautious = smallShare60 > 0.55 || sd50 > avg50 * 1.4;
      const target = cautious ? clamp(midGeo * 0.45, 2, 4.5) : clamp(midGeo * 0.7, 3, 7);
      return finish({
        estimatedCoef: +target.toFixed(2),
        heuristicScore: Math.round(clamp(64 + midZone.length * 4 + (cautious ? -6 : 6), 58, 90)),
        estimatedAt: now + 2 * MIN,
        windowMs: 2.5 * MIN,
        pattern: cautious ? `Phase mixte — ${midZone.length} cotes 5x-9x sur base fragile` : `Heuristique — ${midZone.length} cotes 5x-9x récentes`,
        basis: `Zone 5x-9x géo ${midGeo.toFixed(2)}x — <2x: ${(smallShare60 * 100).toFixed(0)}% — σ50 ${sd50.toFixed(2)}`
      });
    }
    const hourFactor = hb && hb.count >= 5 ? hb.avg / Math.max(geoAll, 0.1) : 1;
    const minuteFactor = mbNext && mbNext.count >= 5 ? mbNext.avg / Math.max(geoAll, 0.1) : 1;
    const blended = ema20 * 0.5 + ema50 * 0.3 + avg50 * 0.2;
    let estimated = clamp(blended * hourFactor * 0.6 + (mbNext?.max ?? 0) * 0.1 + 1.6, 1.8, 12);
    const fragile = smallShare60 > 0.6 || sd50 > avg50 * 1.6;
    if (fragile) estimated = Math.min(estimated, 3.2);
    else if (smallShare60 > 0.45) estimated = Math.min(estimated, 5);
    const sampleScore = clamp(sorted.length / 25, 0, 28);
    const biasScore = clamp(Math.abs(hourFactor - 1) * 42, 0, 22);
    const minuteScore = clamp(Math.abs(minuteFactor - 1) * 32, 0, 16);
    const stabilityBoost = mad50 > 0 && mad50 < avg50 * 0.6 ? 5 : 0;
    return finish({
      estimatedCoef: +estimated.toFixed(2),
      heuristicScore: Math.round(clamp(52 + sampleScore + biasScore + minuteScore + stabilityBoost + (fragile ? -8 : 0), 50, 92)),
      estimatedAt: Math.ceil((now + 12e4) / MIN) * MIN,
      windowMs: 2.5 * MIN,
      pattern: hourFactor > 1.1 ? "Plage horaire — moyenne supérieure" : hourFactor < 0.9 ? "Plage horaire — moyenne inférieure" : "Analyse multi-signaux",
      basis: `EMA20 ${ema20.toFixed(2)}x — H${nowDate.getUTCHours()}h UTC: géo ${hb?.avg.toFixed(2) ?? "—"}x (${hb?.count ?? 0}) — MAD ${mad50.toFixed(2)} — σ ${sd50.toFixed(2)} — ${sorted.length} tours`
    });
  }
  function generatePrediction(rounds, previous = null, now = Date.now()) {
    const normalized = normalizeWithDiagnostics(rounds, now);
    const segment = newestContiguousSegment(normalized.rounds);
    if (!normalized.diagnostics.fresh || segment.rounds.length < MIN_ROUNDS) return null;
    const additional = additionalFromNormalized(segment.rounds, now);
    const prior = validPrevious(previous, now);
    const priorAdditional = validPreviousOpportunity(previous, now);
    const primaryHeld = prior !== null && now < Math.max(prior.estimatedAt + prior.windowMs, prior.generatedAt + MIN_HOLD_MS);
    const primary = primaryHeld ? prior : primaryFromNormalized(segment.rounds, now);
    return {
      ...primary,
      // Publication holds independently; diagnostics above always analyze the current observation segment.
      bigOpportunity: priorAdditional ?? additional.bigOpportunity,
      diagnostics: {
        analyzedAt: now,
        primaryHeld,
        additionalHeld: priorAdditional !== null,
        normalization: normalized.diagnostics,
        continuity: segment.diagnostics,
        additional: additional.diagnostics
      }
    };
  }

  // ../modules/public-forecast.mjs
  var ARCHIVE_PROFILE = Object.freeze({ low: 2, cycle: 10, cluster: 20, confirmation: 50, midMin: 5, midMax: 10, opportunity: 100 });
  var $ = (t) => t.length ? t.reduce((s, e) => s + e, 0) / t.length : 0;
  var E = (t) => {
    if (!t.length) return 0;
    const s = [...t].sort((o, a) => o - a), e = Math.floor(s.length / 2);
    return s.length % 2 ? s[e] : (s[e - 1] + s[e]) / 2;
  };
  var te = (t) => {
    if (t.length < 2) return 0;
    const s = $(t);
    return Math.sqrt($(t.map((e) => (e - s) ** 2)));
  };
  var X = (t, s) => {
    if (!t.length) return 0;
    let e = t[t.length - 1];
    for (let o = t.length - 2; o >= 0; o--) e = s * t[o] + (1 - s) * e;
    return e;
  };
  var O = (t) => {
    if (!t.length) return 0;
    const s = t.map((e) => Math.log(Math.max(e, 1.001)));
    return Math.exp($(s));
  };
  var se = (t) => {
    if (t.length < 2) return 0;
    const s = E(t);
    return E(t.map((e) => Math.abs(e - s)));
  };
  function ae(t, s) {
    const e = t.filter((a) => a.coefficient >= s).sort((a, i) => a.timestamp - i.timestamp);
    if (e.length < 2)
      return {
        avgGap: 0,
        medGap: 0,
        stdGap: 0,
        madGap: 0,
        last: e[0]?.timestamp ?? null,
        count: e.length
      };
    const o = [];
    for (let a = 1; a < e.length; a++)
      o.push(e[a].timestamp - e[a - 1].timestamp);
    return {
      avgGap: $(o),
      medGap: E(o),
      stdGap: te(o),
      madGap: se(o),
      last: e[e.length - 1].timestamp,
      count: e.length
    };
  }

  // ../modules/signal-validation.mjs
  function m(s, i = 300, e = 1 / 0) {
    const n = /* @__PURE__ */ new Set();
    return [...s].sort((t, a) => a.timestamp - t.timestamp).filter(
      (t) => !Number.isFinite(t.coefficient) || t.coefficient < 1 || !Number.isFinite(t.timestamp) || t.timestamp <= 0 || t.timestamp > e || t.id && n.has(t.id) ? false : (t.id && n.add(t.id), true)
    ).slice(0, i);
  }
  var ze = m;
  function Te(n, o, i, u) {
    const l = i + u, a = n.filter(
      (s) => Number.isFinite(s.coefficient) && s.coefficient >= 1 && Number.isFinite(s.timestamp) && s.timestamp >= i && s.timestamp <= l
    ).reduce((s, t) => !s || t.coefficient > s.coefficient ? t : s, null);
    return {
      reached: !!a && a.coefficient >= o,
      best: a?.coefficient ?? null,
      bestAt: a?.timestamp ?? null
    };
  }
  function We(n, o, i, u) {
    const l = ze(o, o.length, i).reverse(), c = Te(l, n.target, n.start, n.end - n.start);
    if (c.reached && c.best !== null && c.bestAt !== null)
      return {
        target: n.target,
        status: "validated",
        coefficient: c.best,
        at: c.bestAt
      };
    if (i <= n.end || c.best === null) return null;
    const a = l.filter((d) => d.timestamp <= n.start).at(-1), s = l.find((d) => d.timestamp >= n.end);
    if (!a || !s) return null;
    const t = l.filter(
      (d) => d.timestamp >= a.timestamp && d.timestamp <= s.timestamp
    ), r = Math.min(18e4, Math.max(6e4, u * 3e3));
    return !Number.isFinite(r) || t.some(
      (d, f) => f > 0 && d.timestamp - (t[f - 1]?.timestamp ?? d.timestamp) > r
    ) ? null : { target: n.target, status: "failed", coefficient: c.best, at: n.end };
  }

  // src/window-model-v2.mjs
  var MODEL = "hardened-dynamic-windows-v4";
  var TARGETS = Object.freeze(["primary", "big"]);
  var RESULT_GRACE_MS = MAX_FRESH_AGE_MS;
  var MINUTE = 6e4;
  function normalize2(rounds, now = Date.now()) {
    return normalizeRounds(rounds, now);
  }
  function currentSegment(rows) {
    let count3 = rows.length, boundaryGapMs = null;
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i - 1].timestamp - rows[i].timestamp;
      if (gap > MAX_FRESH_AGE_MS) {
        count3 = i;
        boundaryGapMs = gap;
        break;
      }
    }
    return {
      rows: rows.slice(0, count3),
      diagnostics: {
        gapThresholdMs: MAX_FRESH_AGE_MS,
        currentSegmentCount: count3,
        discardedOlderSegmentRows: rows.length - count3,
        boundaryGapMs,
        status: boundaryGapMs === null ? "no-large-gap-observed" : "continuity-unknown-before-gap"
      }
    };
  }
  function wilson(hits, n) {
    if (!n) return [0, 1];
    const z = 1.95996398454, p = hits / n, d = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / d;
    const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, center - radius), Math.min(1, center + radius)];
  }
  function analyzeHistory(input, rows, now, raw) {
    const segment = currentSegment(rows), values = segment.rows.map((r) => r.coefficient);
    const recent = values.slice(0, 50), last = rows[0];
    const gaps = segment.rows.slice(0, 101).slice(1).map((r, i) => segment.rows[i].timestamp - r.timestamp).filter((gap) => gap > 0);
    const fresh = !!last && now - last.timestamp <= MAX_FRESH_AGE_MS;
    const inputCount = Array.isArray(input) ? input.length : 0;
    const normalization = {
      inputCount,
      acceptedCount: rows.length,
      rejectedCount: inputCount - rows.length,
      freshestAgeMs: last ? now - last.timestamp : null,
      fresh,
      ...raw?.diagnostics.normalization
    };
    return {
      model: MODEL,
      evidenceStatus: EVIDENCE_STATUS,
      n: rows.length,
      continuityCount: segment.rows.length,
      ready: fresh && segment.rows.length >= MIN_ROUNDS,
      fresh,
      lastId: last?.id,
      lastAt: last?.timestamp,
      cadenceMs: E(gaps),
      avgRoundSeconds: $(gaps) / 1e3,
      ema20: X(values.slice(0, 20), 0.25),
      ema50: X(recent, 0.12),
      median50: E(recent),
      mad50: se(recent),
      deviation50: te(recent),
      geometricMean: O(values),
      targets: [2, 5, 10, 20, 50, 100].map((target) => {
        const intervals = ae(segment.rows, target), sampleSize = values.length;
        return {
          target,
          count: intervals.count,
          sampleSize,
          historicalFrequency: sampleSize ? intervals.count / sampleSize : 0,
          range: wilson(intervals.count, sampleSize),
          rangeKind: "historical-wilson-interval",
          recentRate: values.length ? values.slice(0, 100).filter((v) => v >= target).length / Math.min(100, values.length) : 0,
          medianGapMs: intervals.medGap,
          lastHitAt: intervals.last,
          intervals,
          profile: ARCHIVE_PROFILE
        };
      }),
      diagnostics: {
        analyzedAt: now,
        primaryHeld: false,
        additionalHeld: false,
        ...raw?.diagnostics,
        normalization,
        continuity: segment.diagnostics,
        additional: raw?.diagnostics.additional ?? null
      }
    };
  }
  function analyze(rounds, now = Date.now()) {
    const rows = normalize2(rounds, now);
    return analyzeHistory(rounds, rows, now, generatePrediction(rounds, null, now));
  }
  var RULES = Object.freeze({
    cycle: "Цикл достижения цели",
    "low-streak": "Серия ниже цели",
    "hot-cluster": "Кластер достижений цели",
    "mid-mixed": "Смешанная фаза",
    "mid-favorable": "Эвристика средней зоны",
    "hour-profile": "Часовой профиль",
    "multi-signal": "Многосигнальный расчёт",
    "big-opportunity": "Пересечение двух эвристических окон"
  });
  function ruleOf(pattern) {
    if (pattern.startsWith("Cycle")) return "cycle";
    if (pattern.startsWith("Série")) return "low-streak";
    if (pattern.includes("cotes ≥")) return "hot-cluster";
    if (pattern.startsWith("Phase mixte")) return "mid-mixed";
    if (pattern.startsWith("Heuristique")) return "mid-favorable";
    if (pattern.startsWith("Plage horaire")) return "hour-profile";
    return "multi-signal";
  }
  function validWindow(x) {
    if (!x || x.model !== MODEL || !TARGETS.includes(x.channel) || x.evidenceStatus !== EVIDENCE_STATUS || x.scoreKind !== "heuristic" || !Number.isFinite(x.target) || x.target < (x.channel === "big" ? 100 : 1) || !Number.isFinite(x.heuristicScore) || x.heuristicScore < 0 || x.heuristicScore > 100 || ![x.generatedAt, x.start, x.end, x.windowMs].every(Number.isSafeInteger) || x.generatedAt < 9466848e5 || x.start <= x.generatedAt || x.end <= x.start || x.end - x.start !== x.windowMs) return false;
    return x.channel === "big" ? x.start >= x.generatedAt + 3 * MINUTE && x.windowMs <= 6 * MINUTE && x.end <= x.generatedAt + 9 * MINUTE : x.start >= x.generatedAt + 9e4 && x.start <= x.generatedAt + 3 * MINUTE && x.windowMs >= 9e4 && x.windowMs <= 3 * MINUTE;
  }
  function acceptedWindow(x, now = Infinity) {
    return validWindow(x) && Number.isSafeInteger(x.acceptedAt) && x.acceptedAt >= x.generatedAt && x.acceptedAt < x.start && x.acceptedAt <= now && ["pending", "hit", "miss", "unknown"].includes(x.status);
  }
  function primaryRaw(entry) {
    const raw = entry?.raw;
    return entry?.channel === "primary" && validWindow(entry) && raw && raw.evidenceStatus === EVIDENCE_STATUS && raw.generatedAt === entry.generatedAt && raw.estimatedAt === entry.start && raw.windowMs === entry.windowMs && raw.estimatedCoef === entry.target && raw.heuristicScore === entry.heuristicScore ? raw : null;
  }
  function bigRaw(entry) {
    const big = entry?.raw?.bigOpportunity;
    return entry?.channel === "big" && validWindow(entry) && big && big.evidenceStatus === EVIDENCE_STATUS && big.generatedAt === entry.generatedAt && big.expectedAt === entry.start && big.windowMs === entry.windowMs && big.expiresAt === entry.end && big.estimatedCoef === entry.target && big.heuristicScore === entry.heuristicScore ? big : null;
  }
  function previousState(primaryEntry, bigEntry) {
    const primary = primaryRaw(primaryEntry), big = bigRaw(bigEntry);
    return {
      ...primary ? {
        estimatedCoef: primary.estimatedCoef,
        estimatedAt: primary.estimatedAt,
        windowMs: primary.windowMs,
        generatedAt: primary.generatedAt,
        heuristicScore: primary.heuristicScore,
        evidenceStatus: primary.evidenceStatus,
        pattern: primary.pattern,
        basis: primary.basis
      } : {},
      bigOpportunity: big ? { ...big } : null
    };
  }
  function forecastFromRaw(raw, channel, analysis) {
    if (!raw) return null;
    const big = raw.bigOpportunity;
    if (channel === "big" && !big) return null;
    const source = channel === "big" ? big : raw;
    const target = source.estimatedCoef;
    const start2 = channel === "big" ? big.expectedAt : raw.estimatedAt;
    const rule = channel === "big" ? "big-opportunity" : ruleOf(raw.pattern);
    const forecast = {
      model: MODEL,
      channel,
      target,
      estimatedCoef: target,
      generatedAt: source.generatedAt,
      start: start2,
      end: start2 + source.windowMs,
      estimatedAt: start2,
      windowMs: source.windowMs,
      heuristicScore: source.heuristicScore,
      evidenceStatus: EVIDENCE_STATUS,
      scoreKind: "heuristic",
      rule,
      pattern: RULES[rule],
      basis: channel === "big" ? big.reason : raw.basis,
      opportunity: big,
      raw,
      diagnostics: {
        ...raw.diagnostics,
        profile: ARCHIVE_PROFILE,
        sampleSize: analysis.n,
        continuityCount: analysis.continuityCount,
        dataCutoff: analysis.lastAt,
        cycle: analysis.targets.find((x) => x.target === 10).intervals
      }
    };
    return validWindow(forecast) ? forecast : null;
  }
  function latestFor(journal, channel) {
    return journal.reduce((latest, entry) => entry.channel === channel && (!latest || entry.acceptedAt >= latest.acceptedAt) ? entry : latest, null);
  }
  function advanceJournal(journal, rounds, _stats, now = Date.now(), enabled = true, coverage = { online: true, lastSuccessAt: now }) {
    const rows = normalize2(rounds, now), inputJournal = Array.isArray(journal) ? journal : [];
    const eligible = inputJournal.filter((entry) => acceptedWindow(entry, now));
    let changed = eligible.length !== inputJournal.length;
    const raw = generatePrediction(rounds, previousState(
      latestFor(eligible, "primary"),
      latestFor(eligible, "big")
    ), now);
    const analysis = analyzeHistory(rounds, rows, now, raw);
    const next = eligible.map((entry) => {
      if (entry.status !== "pending") return entry;
      const result = We(entry, rows, now, entry.avgRoundSeconds || 30);
      const freshFinalPoll = coverage?.online && Number.isFinite(coverage.lastSuccessAt) && coverage.lastSuccessAt >= entry.end && coverage.lastSuccessAt <= now && now - coverage.lastSuccessAt <= RESULT_GRACE_MS && analysis.fresh;
      if (result && (result.status === "validated" || freshFinalPoll)) {
        changed = true;
        return {
          ...entry,
          status: result.status === "validated" ? "hit" : "miss",
          actual: result.coefficient,
          actualAt: result.at,
          resolvedAt: now
        };
      }
      if (now > entry.end + RESULT_GRACE_MS) {
        changed = true;
        return {
          ...entry,
          status: "unknown",
          actual: Te(rows, entry.target, entry.start, entry.windowMs).best,
          resolvedAt: now
        };
      }
      return entry;
    });
    if (enabled && analysis.ready && raw) for (const channel of TARGETS) {
      const latest = latestFor(next, channel);
      if (next.some((entry) => entry.channel === channel && entry.status === "pending") || latest && now < Math.max(latest.end, latest.generatedAt + MINUTE)) continue;
      const forecast = forecastFromRaw(raw, channel, analysis);
      if (!forecast || forecast.generatedAt > now || now >= forecast.start) continue;
      const segment = currentSegment(rows).rows;
      next.push({
        ...forecast,
        key: `${MODEL}:${channel}:${now}`,
        acceptedAt: now,
        avgRoundSeconds: analysis.avgRoundSeconds || 30,
        sampleSize: analysis.n,
        historicalFrequency: segment.filter((r) => r.coefficient >= forecast.target).length / segment.length,
        historicalSampleSize: segment.length,
        status: "pending"
      });
      changed = true;
    }
    return { journal: next.slice(-200), changed, analysis, diagnostics: analysis.diagnostics };
  }

  // src/rare-window-model.mjs
  var MODEL2 = "rare-window-v1";
  var EVIDENCE_STATUS2 = "experimental-unvalidated";
  var THRESHOLD = 100;
  var HORIZON_MS = 18e4;
  var MIN_ROUNDS2 = 500;
  var MAX_WINDOWS = 200;
  var RECENT_WINDOWS = 30;
  var MIN_REFERENCE_WINDOWS = 60;
  var MIN_EVENTS = 5;
  var COVERAGE_ASSUMPTION = "operational-coverage-assumption";
  var MINUTE2 = 6e4;
  var MIN_TIMESTAMP2 = 9466848e5;
  var MAX_NOW = 864e13 - 30 * MINUTE2;
  var clamp01 = (x) => Math.max(0, Math.min(1, x));
  function logGamma(z) {
    if (!Number.isFinite(z) || z <= 0) return NaN;
    const coefficients = [
      676.5203681218851,
      -1259.1392167224028,
      771.3234287776531,
      -176.6150291621406,
      12.507343278686905,
      -0.13857109526572012,
      9984369578019572e-21,
      15056327351493116e-23
    ];
    if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    const shifted = z - 1;
    let sum = 0.9999999999998099;
    for (let i = 0; i < coefficients.length; i++) sum += coefficients[i] / (shifted + i + 1);
    const t = shifted + 7.5;
    return 0.9189385332046727 + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
  }
  function betaFraction(a, b, x) {
    const tiny = 1e-300;
    const nonzero = (value) => Math.abs(value) < tiny ? value < 0 ? -tiny : tiny : value;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 / nonzero(1 - qab * x / qap), h = d;
    for (let m2 = 1; m2 <= 300; m2++) {
      const twice = 2 * m2;
      let aa = m2 * (b - m2) * x / ((qam + twice) * (a + twice));
      d = 1 / nonzero(1 + aa * d);
      c = nonzero(1 + aa / c);
      h *= d * c;
      aa = -(a + m2) * (qab + m2) * x / ((a + twice) * (qap + twice));
      d = 1 / nonzero(1 + aa * d);
      c = nonzero(1 + aa / c);
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 3e-14) return h;
    }
    return NaN;
  }
  function regularizedBeta(x, a, b) {
    if (![x, a, b].every(Number.isFinite) || a <= 0 || b <= 0 || x < 0 || x > 1) return NaN;
    if (x === 0 || x === 1) return x;
    const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
    return clamp01(x < (a + 1) / (a + b + 2) ? factor * betaFraction(a, b, x) / a : 1 - factor * betaFraction(b, a, 1 - x) / b);
  }
  function inverseBetaCDF(p, a, b) {
    if (![p, a, b].every(Number.isFinite) || p < 0 || p > 1 || a <= 0 || b <= 0) return NaN;
    if (p === 0 || p === 1) return p;
    let low = 0, high = 1;
    for (let i = 0; i < 90; i++) {
      const middle = (low + high) / 2;
      const cdf = regularizedBeta(middle, a, b);
      if (!Number.isFinite(cdf)) return NaN;
      if (cdf < p) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  }
  function regularizedGamma(shape, x) {
    if (!Number.isFinite(shape) || shape <= 0 || typeof x !== "number" || Number.isNaN(x) || x < 0) return NaN;
    if (x === 0) return 0;
    if (x === Infinity) return 1;
    const factor = Math.exp(shape * Math.log(x) - x - logGamma(shape));
    if (x < shape + 1) {
      let term = 1 / shape, sum = term;
      for (let i = 1; i <= 2e3; i++) {
        term *= x / (shape + i);
        sum += term;
        if (Math.abs(term) < Math.abs(sum) * 3e-14) return clamp01(sum * factor);
      }
    } else {
      const tiny = 1e-300;
      const nonzero = (value) => Math.abs(value) < tiny ? value < 0 ? -tiny : tiny : value;
      let b = x + 1 - shape, c = 1 / tiny, d = 1 / nonzero(b), h = d;
      for (let i = 1; i <= 2e3; i++) {
        const an = -i * (i - shape);
        b += 2;
        d = 1 / nonzero(an * d + b);
        c = nonzero(b + an / c);
        const delta = d * c;
        h *= delta;
        if (Math.abs(delta - 1) < 3e-14) return clamp01(1 - factor * h);
      }
    }
    return NaN;
  }
  function inverseGammaCDF(p, shape) {
    if (![p, shape].every(Number.isFinite) || p < 0 || p > 1 || shape <= 0) return NaN;
    if (p === 0) return 0;
    if (p === 1) return Infinity;
    let low = 0, high = Math.max(1, shape);
    for (let i = 0; i < 100 && regularizedGamma(shape, high) < p; i++) high *= 2;
    if (regularizedGamma(shape, high) < p) return NaN;
    for (let i = 0; i < 100; i++) {
      const middle = (low + high) / 2;
      const cdf = regularizedGamma(shape, middle);
      if (!Number.isFinite(cdf)) return NaN;
      if (cdf < p) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  }
  function gammaPoissonPosterior(eventCount, exposureMs, horizonMs = HORIZON_MS) {
    if (!Number.isSafeInteger(eventCount) || eventCount < 0 || !Number.isFinite(exposureMs) || exposureMs <= 0 || !Number.isFinite(horizonMs) || horizonMs < 0) return null;
    const shape = eventCount + 0.5;
    const rateInterval95PerMs = [0.025, 0.975].map((p) => inverseGammaCDF(p, shape) / exposureMs);
    if (!rateInterval95PerMs.every(Number.isFinite)) return null;
    return {
      shape,
      rateMs: exposureMs,
      meanRatePerMs: shape / exposureMs,
      rateInterval95PerMs,
      probability: -Math.expm1(-shape * Math.log1p(horizonMs / exposureMs)),
      probabilityInterval95: rateInterval95PerMs.map((rate) => -Math.expm1(-rate * horizonMs))
    };
  }
  function newestSegment(rows) {
    let boundary = rows.length, boundaryGapMs = null;
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i - 1].timestamp - rows[i].timestamp;
      if (gap > HORIZON_MS) {
        boundary = i;
        boundaryGapMs = gap;
        break;
      }
    }
    return {
      rows: rows.slice(0, boundary).reverse(),
      diagnostics: {
        gapThresholdMs: HORIZON_MS,
        currentSegmentCount: boundary,
        discardedOlderSegmentRows: rows.length - boundary,
        boundaryGapMs,
        coverageAssumption: COVERAGE_ASSUMPTION
      }
    };
  }
  function completedWindows(rows) {
    if (rows.length < 2) return [];
    const firstAt = rows[0].timestamp, lastAt = rows.at(-1).timestamp;
    const lastEnd = Math.floor(lastAt / HORIZON_MS) * HORIZON_MS;
    const firstStart = Math.max(Math.ceil(firstAt / HORIZON_MS) * HORIZON_MS, lastEnd - MAX_WINDOWS * HORIZON_MS);
    const windows = [];
    let index = 0;
    for (let start2 = firstStart; start2 + HORIZON_MS <= lastEnd; start2 += HORIZON_MS) {
      const end = start2 + HORIZON_MS;
      while (index < rows.length && rows[index].timestamp <= start2) index++;
      let rowCount = 0, eventCount = 0;
      while (index < rows.length && rows[index].timestamp <= end) {
        rowCount++;
        eventCount += Number(rows[index].coefficient >= THRESHOLD);
        index++;
      }
      windows.push({ start: start2, end, rowCount, eventCount, hit: eventCount > 0 });
    }
    return windows;
  }
  function windowSummary(windows) {
    if (!windows.length) return null;
    const n = windows.length, hits = windows.filter((w) => w.hit).length;
    const a = hits + 0.5, b = n - hits + 0.5;
    return {
      start: windows[0].start,
      end: windows.at(-1).end,
      windowCount: n,
      hitWindowCount: hits,
      eventCount: windows.reduce((sum, w) => sum + w.eventCount, 0),
      observedFrequency: hits / n,
      posteriorMean: a / (a + b),
      interval95: [0.025, 0.975].map((p) => inverseBetaCDF(p, a, b)),
      posterior: { distribution: "beta", alpha: a, beta: b }
    };
  }
  function analyzeRareWindows(input, now = Date.now()) {
    const validNow3 = Number.isSafeInteger(now) && now >= MIN_TIMESTAMP2 && now <= MAX_NOW;
    const normalized = normalizeRounds(input, now);
    const segment = newestSegment(normalized), rows = segment.rows;
    const firstAt = rows[0]?.timestamp ?? null, lastAt = rows.at(-1)?.timestamp ?? null;
    const ageMs = lastAt === null || !validNow3 ? null : now - lastAt;
    const fresh = ageMs !== null && ageMs <= HORIZON_MS;
    const exposureMs = firstAt === null ? 0 : lastAt - firstAt;
    const gateReason = !validNow3 ? "invalid-now" : !Array.isArray(input) ? "invalid-input" : !rows.length ? "no-valid-completed-rounds" : !fresh ? "stale-data" : rows.length < MIN_ROUNDS2 ? "insufficient-contiguous-history" : exposureMs <= 0 ? "no-positive-exposure" : null;
    const ready = gateReason === null;
    const eventCount = rows.filter((r) => r.timestamp > firstAt && r.coefficient >= THRESHOLD).length;
    let poissonReason = gateReason ?? (exposureMs < HORIZON_MS ? "insufficient-exposure" : eventCount < MIN_EVENTS ? "insufficient-events" : null);
    const posterior2 = poissonReason === null ? gammaPoissonPosterior(eventCount, exposureMs) : null;
    if (poissonReason === null && posterior2 === null) poissonReason = "numerical-failure";
    const poisson = {
      status: posterior2 ? "ready" : "insufficient",
      reason: poissonReason,
      model: "stationary-poisson-gamma-jeffreys",
      evidenceStatus: "assumption-only-not-calibrated",
      assumption: "stationary-event-rate",
      coverageAssumption: COVERAGE_ASSUMPTION,
      exposureStart: firstAt,
      exposureEnd: lastAt,
      exposureMs,
      eventCount,
      intervalConvention: "start-exclusive-end-inclusive",
      horizonMs: HORIZON_MS,
      observedRatePerMs: exposureMs > 0 ? eventCount / exposureMs : null,
      posteriorShape: posterior2?.shape ?? null,
      posteriorRateMs: posterior2?.rateMs ?? null,
      posteriorMeanRatePerMs: posterior2?.meanRatePerMs ?? null,
      rateInterval95PerMs: posterior2?.rateInterval95PerMs ?? null,
      probability: posterior2?.probability ?? null,
      probabilityInterval95: posterior2?.probabilityInterval95 ?? null,
      intervalKind: "95-percent-equal-tailed-gamma-posterior"
    };
    const windows = completedWindows(rows);
    const split = Math.max(0, windows.length - RECENT_WINDOWS);
    const recent = windowSummary(windows.slice(split));
    const reference = windowSummary(windows.slice(0, split));
    const numericalSupport = [...recent?.interval95 ?? [], ...reference?.interval95 ?? []].every(Number.isFinite);
    const bayesianReason = gateReason ?? (recent?.windowCount !== RECENT_WINDOWS || (reference?.windowCount ?? 0) < MIN_REFERENCE_WINDOWS ? "insufficient-covered-windows" : recent.hitWindowCount < MIN_EVENTS || reference.hitWindowCount < MIN_EVENTS ? "insufficient-hit-windows" : !numericalSupport ? "numerical-failure" : null);
    const supported = bayesianReason === null;
    const localRise = supported && recent.interval95[0] > reference.interval95[1];
    const bayesian = {
      status: supported ? "ready" : "insufficient",
      reason: bayesianReason ?? (localRise ? "experimental-local-frequency-rise" : "no-supported-local-rise"),
      model: "beta-jeffreys-window-frequency",
      evidenceStatus: EVIDENCE_STATUS2,
      coverageAssumption: COVERAGE_ASSUMPTION,
      assumption: "exchangeable-window-outcomes-within-each-historical-group",
      intervalConvention: "start-exclusive-end-inclusive",
      intervalKind: "95-percent-equal-tailed-beta-posterior",
      windows,
      windowCount: windows.length,
      hitWindowCount: windows.filter((w) => w.hit).length,
      eventCount: windows.reduce((sum, w) => sum + w.eventCount, 0),
      recent,
      reference,
      localFrequencyRise: localRise,
      currentWindowFrequency: supported ? recent.posteriorMean : null,
      currentWindowFrequencyInterval95: supported ? recent.interval95 : null
    };
    const start2 = validNow3 ? Math.ceil((now + 2 * MINUTE2) / MINUTE2) * MINUTE2 : null;
    const candidate = localRise ? {
      model: MODEL2,
      source: "beta-window-frequency",
      target: THRESHOLD,
      generatedAt: now,
      start: start2,
      end: start2 + HORIZON_MS,
      windowMs: HORIZON_MS,
      horizonMs: HORIZON_MS,
      evidenceStatus: EVIDENCE_STATUS2,
      purpose: "observation-only",
      interpretation: "experimental-local-frequency-rise",
      coverageAssumption: COVERAGE_ASSUMPTION,
      currentWindowFrequency: recent.posteriorMean,
      currentWindowFrequencyInterval95: [...recent.interval95],
      referenceWindowFrequency: reference.posteriorMean,
      referenceWindowFrequencyInterval95: [...reference.interval95],
      recentWindowCount: recent.windowCount,
      recentHitWindowCount: recent.hitWindowCount,
      referenceWindowCount: reference.windowCount,
      referenceHitWindowCount: reference.hitWindowCount,
      reason: "Disjoint historical window groups have separated 95% Beta posterior intervals; future performance is unvalidated."
    } : null;
    return {
      ready,
      evidenceStatus: EVIDENCE_STATUS2,
      threshold: THRESHOLD,
      horizonMs: HORIZON_MS,
      poisson,
      bayesian,
      candidate,
      diagnostics: {
        analyzedAt: validNow3 ? now : null,
        reason: gateReason ?? bayesian.reason,
        inputCount: Array.isArray(input) ? input.length : 0,
        acceptedCount: normalized.length,
        rejectedCount: Array.isArray(input) ? input.length - normalized.length : 0,
        lastAt,
        freshestAgeMs: ageMs,
        fresh,
        ...segment.diagnostics
      }
    };
  }

  // src/archive-history.mjs
  var ARCHIVE_MODEL = "rare-archive-history-v1";
  var RARE_ARCHIVE_MODEL = "rare-window-archive-v1";
  var MINUTE3 = 6e4;
  var MIN_TIMESTAMP3 = 9466848e5;
  var MAX_TIMESTAMP2 = 864e13;
  var timestamp = (value) => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP3 && value <= MAX_TIMESTAMP2;
  var count = (value) => Number.isSafeInteger(value) && value >= 0;
  var freezeWindows = (windows) => Object.freeze(windows.map((window2) => Object.freeze(window2)));
  function buildRareArchiveSummary(input, now = Date.now()) {
    const rows = normalizeRounds(input, now).reverse(), windows = [];
    let segmentCount = 0, gapCount = 0, maxGapMs = 0, observedSegmentExposureMs = 0;
    function segment(from, to) {
      if (from >= to) return;
      segmentCount++;
      const first = rows[from].timestamp, last = rows[to - 1].timestamp;
      observedSegmentExposureMs += last - first;
      const firstStart = Math.ceil(first / HORIZON_MS) * HORIZON_MS;
      const lastEnd = Math.floor(last / HORIZON_MS) * HORIZON_MS;
      let cursor = from;
      for (let start2 = firstStart; start2 + HORIZON_MS <= lastEnd; start2 += HORIZON_MS) {
        const end = start2 + HORIZON_MS;
        while (cursor < to && rows[cursor].timestamp <= start2) cursor++;
        let n = 0, events = 0;
        while (cursor < to && rows[cursor].timestamp <= end) {
          n++;
          events += Number(rows[cursor].coefficient >= THRESHOLD);
          cursor++;
        }
        if (n) windows.push([start2, n, events]);
      }
    }
    let beginning = 0;
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i].timestamp - rows[i - 1].timestamp;
      maxGapMs = Math.max(maxGapMs, gap);
      if (gap > HORIZON_MS) {
        segment(beginning, i);
        beginning = i;
        gapCount++;
      }
    }
    segment(beginning, rows.length);
    const largeEvents = rows.filter((row) => row.coefficient >= THRESHOLD).map((row) => Object.freeze({ id: row.id, timestamp: row.timestamp, coefficient: row.coefficient }));
    return Object.freeze({
      model: ARCHIVE_MODEL,
      threshold: THRESHOLD,
      horizonMs: HORIZON_MS,
      builtAt: timestamp(now) ? now : null,
      inputValid: Array.isArray(input) && timestamp(now) && now <= MAX_TIMESTAMP2 - 30 * MINUTE3,
      inputCount: Array.isArray(input) ? input.length : 0,
      acceptedRoundCount: rows.length,
      rejectedCount: Array.isArray(input) ? input.length - rows.length : 0,
      rawLargeEventCount: largeEvents.length,
      largeEvents: Object.freeze(largeEvents),
      firstAt: rows[0]?.timestamp ?? null,
      lastAt: rows.at(-1)?.timestamp ?? null,
      segmentCount,
      gapCount,
      maxGapMs,
      observedSegmentExposureMs,
      coverageAssumption: COVERAGE_ASSUMPTION,
      coveredWindowCount: windows.length,
      coveredExposureMs: windows.length * HORIZON_MS,
      coveredEventCount: windows.reduce((sum, window2) => sum + window2[2], 0),
      windows: freezeWindows(windows)
    });
  }
  function archiveWindows(summary, now) {
    if (!timestamp(now) || now > MAX_TIMESTAMP2 - 30 * MINUTE3 || !summary || summary.inputValid !== true || summary.model !== ARCHIVE_MODEL || summary.threshold !== THRESHOLD || summary.horizonMs !== HORIZON_MS || !timestamp(summary.builtAt) || summary.builtAt > now || !count(summary.acceptedRoundCount) || !count(summary.rawLargeEventCount) || summary.rawLargeEventCount > summary.acceptedRoundCount || !Array.isArray(summary.windows) || summary.coveredWindowCount !== summary.windows.length || summary.coveredExposureMs !== summary.windows.length * HORIZON_MS) return null;
    if (!summary.acceptedRoundCount) {
      return summary.firstAt === null && summary.lastAt === null && summary.windows.length === 0 && summary.coveredEventCount === 0 && summary.rawLargeEventCount === 0 ? [] : null;
    }
    if (!timestamp(summary.firstAt) || !timestamp(summary.lastAt) || summary.firstAt > summary.lastAt || summary.lastAt > summary.builtAt || summary.lastAt > now) return null;
    const result = [];
    let previous = -Infinity, rowCount = 0, eventCount = 0;
    for (const value of summary.windows) {
      if (!Array.isArray(value) || value.length !== 3) return null;
      const [start2, n, events] = value, end = start2 + HORIZON_MS;
      if (!timestamp(start2) || start2 % HORIZON_MS !== 0 || start2 <= previous || start2 < summary.firstAt || end > summary.lastAt || !count(n) || n === 0 || !count(events) || events > n) return null;
      result.push({ start: start2, end, rowCount: n, eventCount: events, hit: events > 0 });
      previous = start2;
      rowCount += n;
      eventCount += events;
    }
    return rowCount <= summary.acceptedRoundCount && eventCount === summary.coveredEventCount && eventCount <= summary.rawLargeEventCount ? result : null;
  }
  function summarize(windows) {
    if (!windows.length) return null;
    const n = windows.length, hits = windows.reduce((sum, window2) => sum + Number(window2.hit), 0);
    const alpha = hits + 0.5, beta = n - hits + 0.5;
    const interval952 = [0.025, 0.975].map((p) => inverseBetaCDF(p, alpha, beta));
    return {
      start: windows[0].start,
      end: windows.at(-1).end,
      windowCount: n,
      hitWindowCount: hits,
      eventCount: windows.reduce((sum, window2) => sum + window2.eventCount, 0),
      observedFrequency: hits / n,
      posteriorMean: alpha / (alpha + beta),
      interval95: interval952,
      posterior: { distribution: "beta", alpha, beta }
    };
  }
  function mergeWindows(archived, current) {
    const windows = [], conflictingStarts = [];
    let a = 0, b = 0;
    while (a < archived.length || b < current.length) {
      if (b >= current.length || a < archived.length && archived[a].start < current[b].start) windows.push(archived[a++]);
      else if (a >= archived.length || current[b].start < archived[a].start) windows.push(current[b++]);
      else {
        if (archived[a].rowCount !== current[b].rowCount || archived[a].eventCount !== current[b].eventCount)
          conflictingStarts.push(current[b].start);
        windows.push(current[b]);
        a++;
        b++;
      }
    }
    return { windows, conflictingStarts };
  }
  function analyzeRareArchive(recentRows, summary, now = Date.now()) {
    const base = analyzeRareWindows(recentRows, now), archived = archiveWindows(summary, now);
    if (archived === null) return {
      ...base,
      candidate: null,
      archive: { model: ARCHIVE_MODEL, status: "unavailable", reason: "archive-summary-unavailable" }
    };
    const current = base.bayesian.windows;
    const { windows, conflictingStarts } = mergeWindows(archived, current);
    const recent = base.bayesian.recent;
    const referenceWindows = recent ? windows.filter((window2) => window2.end <= recent.start) : [];
    const reference = summarize(referenceWindows);
    const recentConflictCount = recent ? conflictingStarts.filter((start3) => start3 >= recent.start && start3 < recent.end).length : 0;
    const gateReason = base.ready ? null : base.diagnostics.reason;
    const numericSupport = [...recent?.interval95 ?? [], ...reference?.interval95 ?? []].every(Number.isFinite);
    const reason2 = gateReason ?? (recent?.windowCount !== RECENT_WINDOWS || (reference?.windowCount ?? 0) < MIN_REFERENCE_WINDOWS ? "insufficient-covered-windows" : recent.hitWindowCount < MIN_EVENTS || reference.hitWindowCount < MIN_EVENTS ? "insufficient-hit-windows" : recentConflictCount > 0 ? "archive-recent-window-conflict" : !numericSupport ? "numerical-failure" : null);
    const supported = reason2 === null;
    const localRise = supported && recent.interval95[0] > reference.interval95[1];
    const eventCount = windows.reduce((sum, window2) => sum + window2.eventCount, 0);
    const exposureMs = windows.length * HORIZON_MS;
    let poissonReason = gateReason ?? (!exposureMs ? "insufficient-exposure" : eventCount < MIN_EVENTS ? "insufficient-events" : null);
    const posterior2 = poissonReason === null ? gammaPoissonPosterior(eventCount, exposureMs) : null;
    if (poissonReason === null && !posterior2) poissonReason = "numerical-failure";
    const poisson = {
      ...base.poisson,
      status: posterior2 ? "ready" : "insufficient",
      reason: poissonReason,
      model: "archive-covered-windows-poisson-gamma-jeffreys",
      historyScope: "all-covered-archive-and-live-windows",
      exposureConvention: "sum-of-disjoint-fully-covered-three-minute-windows",
      exposureStart: windows[0]?.start ?? null,
      exposureEnd: windows.at(-1)?.end ?? null,
      exposureMs,
      eventCount,
      coveredWindowCount: windows.length,
      observedRatePerMs: exposureMs > 0 ? eventCount / exposureMs : null,
      posteriorShape: posterior2?.shape ?? null,
      posteriorRateMs: posterior2?.rateMs ?? null,
      posteriorMeanRatePerMs: posterior2?.meanRatePerMs ?? null,
      rateInterval95PerMs: posterior2?.rateInterval95PerMs ?? null,
      probability: posterior2?.probability ?? null,
      probabilityInterval95: posterior2?.probabilityInterval95 ?? null
    };
    const bayesian = {
      ...base.bayesian,
      status: supported ? "ready" : "insufficient",
      reason: reason2 ?? (localRise ? "experimental-local-frequency-rise" : "no-supported-local-rise"),
      historyScope: "current-thirty-windows-versus-all-earlier-covered-windows",
      windows,
      windowCount: windows.length,
      hitWindowCount: windows.reduce((sum, window2) => sum + Number(window2.hit), 0),
      eventCount,
      recent,
      reference,
      localFrequencyRise: localRise,
      currentWindowFrequency: supported ? recent.posteriorMean : null,
      currentWindowFrequencyInterval95: supported ? recent.interval95 : null
    };
    const start2 = Math.ceil((now + 2 * MINUTE3) / MINUTE3) * MINUTE3;
    const candidate = localRise ? {
      model: RARE_ARCHIVE_MODEL,
      source: "beta-window-frequency",
      target: THRESHOLD,
      historyModel: ARCHIVE_MODEL,
      historyScope: bayesian.historyScope,
      generatedAt: now,
      start: start2,
      end: start2 + HORIZON_MS,
      windowMs: HORIZON_MS,
      horizonMs: HORIZON_MS,
      evidenceStatus: EVIDENCE_STATUS2,
      purpose: "observation-only",
      interpretation: "experimental-local-frequency-rise",
      coverageAssumption: COVERAGE_ASSUMPTION,
      currentWindowFrequency: recent.posteriorMean,
      currentWindowFrequencyInterval95: [...recent.interval95],
      referenceWindowFrequency: reference.posteriorMean,
      referenceWindowFrequencyInterval95: [...reference.interval95],
      recentWindowCount: recent.windowCount,
      recentHitWindowCount: recent.hitWindowCount,
      referenceWindowCount: reference.windowCount,
      referenceHitWindowCount: reference.hitWindowCount,
      reason: "Recent historical frequency differs from all earlier covered archive windows; future performance is unvalidated."
    } : null;
    return {
      ...base,
      poisson,
      bayesian,
      candidate,
      diagnostics: { ...base.diagnostics, reason: gateReason ?? bayesian.reason },
      archive: {
        model: ARCHIVE_MODEL,
        status: "ready",
        historyScope: bayesian.historyScope,
        acceptedRoundCount: summary.acceptedRoundCount,
        rawLargeEventCount: summary.rawLargeEventCount,
        firstAt: summary.firstAt,
        lastAt: summary.lastAt,
        coveredWindowCount: archived.length,
        referenceWindowCount: reference?.windowCount ?? 0,
        referenceHitWindowCount: reference?.hitWindowCount ?? 0,
        recentWindowCount: recent?.windowCount ?? 0,
        recentHitWindowCount: recent?.hitWindowCount ?? 0,
        conflictingWindowCount: conflictingStarts.length,
        recentConflictCount,
        partialEdgesAndGapsExcluded: true,
        coveredExposureMs: exposureMs
      }
    };
  }

  // src/archive-cache.mjs
  var VERSION = 1;
  var MIN_TIMESTAMP4 = 9466848e5;
  var MAX_TIMESTAMP3 = 864e13;
  var MIN_SEQUENCE = -9223372036854775808n;
  var MAX_SEQUENCE = 9223372036854775807n;
  var STORE = "rounds";
  var META = "metadata";
  var COMPLETE = "complete";
  var fields = ["id", "coefficient", "timestamp", "sourceSeq", "completed", "estimated"];
  var record = (value) => value && typeof value === "object" && !Array.isArray(value);
  var timestamp2 = (value) => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP4 && value <= MAX_TIMESTAMP3;
  var ArchiveCacheDataError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "ArchiveCacheDataError";
    }
  };
  function sequence(value) {
    if (typeof value !== "string" || !/^-?\d{1,19}$/.test(value)) throw new ArchiveCacheDataError("Архив: неверный sourceSeq");
    const result = BigInt(value);
    if (result < MIN_SEQUENCE || result > MAX_SEQUENCE) throw new ArchiveCacheDataError("Архив: неверный sourceSeq");
    return result.toString();
  }
  function cleanRow(value, now) {
    if (!record(value) || typeof value.id !== "string" || !value.id.trim() || value.id.length > 300 || typeof value.coefficient !== "number" || !Number.isFinite(value.coefficient) || value.coefficient < 1 || !timestamp2(value.timestamp) || value.timestamp > now || value.completed !== true || value.estimated !== false)
      throw new ArchiveCacheDataError("Архив: неверный подтверждённый раунд");
    return {
      id: value.id,
      coefficient: value.coefficient,
      timestamp: value.timestamp,
      sourceSeq: sequence(value.sourceSeq),
      completed: true,
      estimated: false
    };
  }
  var sameRow = (a, b) => fields.every((field) => a?.[field] === b[field]);
  function createArchiveCache({
    indexedDB = globalThis.indexedDB,
    name = "god-preditor-archive-v1",
    now = Date.now,
    timeoutMs = 15e3
  } = {}) {
    if (typeof name !== "string" || !name || name.length > 250) throw Error("Архив: неверное имя кэша");
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error("Архив: неверный таймаут кэша");
    let database = null, opening = null, closed = false;
    async function open() {
      if (closed) throw Error("Кэш архива закрыт");
      if (database) return database;
      if (!indexedDB?.open) throw Error("IndexedDB недоступна: архив останется в памяти");
      if (!opening) opening = new Promise((resolve, reject) => {
        let settled = false, request;
        const done = (error, db = null) => {
          if (settled) {
            db?.close();
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(db);
        };
        const timer = setTimeout(() => done(Error("Кэш архива не ответил вовремя")), timeoutMs);
        try {
          request = indexedDB.open(name, VERSION);
        } catch (error) {
          done(error);
          return;
        }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
          if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
        };
        request.onerror = () => done(request.error || Error("Не удалось открыть кэш архива"));
        request.onblocked = () => done(Error("Кэш архива заблокирован другой вкладкой"));
        request.onsuccess = () => {
          const db = request.result;
          if (closed || settled) {
            db.close();
            done(Error("Кэш архива закрыт"));
            return;
          }
          db.onversionchange = () => {
            db.close();
            if (database === db) database = null;
          };
          database = db;
          done(null, db);
        };
      }).finally(() => {
        opening = null;
      });
      return opening;
    }
    async function transact(stores, mode, operation) {
      const db = await open();
      if (closed) throw Error("Кэш архива закрыт");
      return new Promise((resolve, reject) => {
        let transaction, result, failure = null, settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(result);
        };
        const fail = (error) => {
          failure = error instanceof Error ? error : Error(String(error));
          try {
            transaction?.abort();
          } catch {
          }
          finish(failure);
        };
        const timer = setTimeout(() => fail(Error("Запись кэша архива задержалась")), timeoutMs);
        try {
          transaction = db.transaction(stores, mode);
          transaction.oncomplete = () => finish();
          transaction.onabort = () => finish(failure || transaction.error || Error("Операция кэша архива отменена"));
          transaction.onerror = (event) => {
            failure ||= event.target?.error || transaction.error || Error("Ошибка кэша архива");
          };
          operation(transaction, (value) => {
            result = value;
          }, fail);
        } catch (error) {
          fail(error);
        }
      });
    }
    async function writePage(input) {
      if (!Array.isArray(input)) throw new ArchiveCacheDataError("Архив: страница должна быть массивом");
      const at = now();
      if (!timestamp2(at)) throw new ArchiveCacheDataError("Архив: неверное время устройства");
      const unique = /* @__PURE__ */ new Map();
      for (const value of input) {
        const clean = cleanRow(value, at), prior = unique.get(clean.id);
        if (prior && !sameRow(prior, clean)) throw new ArchiveCacheDataError("Архив: конфликт ID " + clean.id);
        unique.set(clean.id, clean);
      }
      return transact([STORE], "readwrite", (tx, set, fail) => {
        const store = tx.objectStore(STORE);
        set(unique.size);
        for (const row of unique.values()) {
          const request = store.get(row.id);
          request.onsuccess = () => {
            try {
              const prior = request.result;
              if (prior && !sameRow(prior, row)) {
                fail(new ArchiveCacheDataError("Архив: конфликт ID " + row.id));
                return;
              }
              if (!prior) store.put(row);
            } catch (error) {
              fail(error);
            }
          };
        }
      });
    }
    async function markComplete({ snapshotSeq, savedAt } = {}) {
      const highwater = sequence(snapshotSeq), at = now();
      if (!timestamp2(savedAt) || !timestamp2(at) || savedAt > at) throw new ArchiveCacheDataError("Архив: неверное время снимка");
      return transact([STORE, META], "readwrite", (tx, set, fail) => {
        const store = tx.objectStore(META), request = store.get(COMPLETE);
        request.onsuccess = () => {
          try {
            const previous = request.result;
            if (previous && BigInt(sequence(previous.snapshotSeq)) > BigInt(highwater)) {
              fail(new ArchiveCacheDataError("Архив: снимок не может откатиться назад"));
              return;
            }
            store.put({ key: COMPLETE, version: VERSION, snapshotSeq: highwater, savedAt });
            set({ snapshotSeq: highwater, savedAt });
          } catch (error) {
            fail(error);
          }
        };
      });
    }
    async function loadComplete() {
      const at = now();
      if (!timestamp2(at)) throw new ArchiveCacheDataError("Архив: неверное время устройства");
      return transact([STORE, META], "readonly", (tx, set, fail) => {
        const request = tx.objectStore(META).get(COMPLETE);
        request.onsuccess = () => {
          const meta = request.result;
          if (!meta) {
            set(null);
            return;
          }
          let highwater;
          try {
            if (meta.version !== VERSION || !timestamp2(meta.savedAt) || meta.savedAt > at) throw new ArchiveCacheDataError("Архив: повреждён снимок кэша");
            highwater = sequence(meta.snapshotSeq);
          } catch (error) {
            fail(error);
            return;
          }
          const records = tx.objectStore(STORE).getAll();
          records.onsuccess = () => {
            try {
              const bound = BigInt(highwater), rows = [];
              for (const value of records.result) {
                if (BigInt(sequence(value.sourceSeq)) <= bound) rows.push(cleanRow(value, at));
              }
              set({ rows, snapshotSeq: highwater, savedAt: meta.savedAt });
            } catch (error) {
              fail(error);
            }
          };
        };
      });
    }
    async function clear() {
      return transact([STORE, META], "readwrite", (tx) => {
        tx.objectStore(STORE).clear();
        tx.objectStore(META).clear();
      });
    }
    function close() {
      closed = true;
      database?.close();
      database = null;
    }
    return { loadComplete, writePage, markComplete, clear, close };
  }

  // src/archive-feed.mjs
  var COLUMNS2 = "id,source_seq,coefficient,round_timestamp,completed,estimated";
  var MIN_SEQUENCE2 = -9223372036854775808n;
  var MAX_SEQUENCE2 = 9223372036854775807n;
  var DEFAULT_PAGE_SIZE = 500;
  function sequence2(value) {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) return null;
      value = String(value);
    }
    if (typeof value !== "string" || !/^-?\d{1,19}$/.test(value)) return null;
    const parsed = BigInt(value);
    return parsed >= MIN_SEQUENCE2 && parsed <= MAX_SEQUENCE2 ? String(parsed) : null;
  }
  function mapRound(row, seq, now) {
    if (!row || typeof row !== "object" || Array.isArray(row) || row.completed !== true || row.estimated !== false || typeof row.round_timestamp !== "string" || !row.round_timestamp.trim()) return null;
    const timestamp7 = Date.parse(row.round_timestamp), coefficient = row.coefficient;
    const numeric = typeof coefficient === "number" || typeof coefficient === "string" && coefficient.trim() !== "";
    if (!Number.isSafeInteger(timestamp7) || timestamp7 < 9466848e5 || timestamp7 > now || !numeric || !Number.isFinite(Number(coefficient)) || Number(coefficient) < 1) return null;
    if (!["string", "number"].includes(typeof row.id) || typeof row.id === "number" && !Number.isSafeInteger(row.id)) return null;
    const id = String(row.id);
    const mappedId = `supabase:luckyjet:${id}`;
    if (!id.trim() || mappedId.length > 300) return null;
    return Object.freeze({
      id: mappedId,
      coefficient: Number(coefficient),
      timestamp: timestamp7,
      source: "Supabase · LuckyJet",
      sourceSeq: seq,
      completed: true,
      estimated: false
    });
  }
  var ArchiveDataError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "ArchiveDataError";
    }
  };
  function createArchiveFeed(config, {
    onPage = () => {
    },
    onStatus = () => {
    },
    fetchImpl = fetch,
    now = Date.now,
    schedule = setTimeout,
    cancel = clearTimeout,
    pageSize = DEFAULT_PAGE_SIZE,
    pageDelayMs = 50,
    timeoutMs = 15e3,
    setRequestTimeout = setTimeout,
    clearRequestTimeout = clearTimeout,
    afterSeq: rawAfterSeq = null
  } = {}) {
    const root = new URL(config.url);
    if (root.protocol !== "https:" || !config.publishableKey?.startsWith("sb_publishable_"))
      throw Error("Архиву нужны HTTPS и publishable key Supabase");
    if (!/^[a-z_][a-z0-9_]*$/.test(config.table)) throw Error("Неверное имя таблицы архива");
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1e3) throw Error("Размер страницы архива: 1–1000");
    if (!Number.isFinite(pageDelayMs) || pageDelayMs < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
      throw Error("Неверные интервалы загрузки архива");
    const afterSeq = rawAfterSeq === null ? null : sequence2(rawAfterSeq);
    if (rawAfterSeq !== null && afterSeq === null) throw Error("Неверная нижняя граница архива");
    let state = "idle", generation = 0, timer = null, request = null, snapshotSeq = null, snapshotAt = null, cursor = null;
    let totalReceived = 0, totalScanned = 0, rejected = 0, duplicates = 0, pages = 0, oldestAt = null, latestAt = null;
    let message = "", retryable = false;
    const seen = /* @__PURE__ */ new Map();
    function status() {
      return {
        state,
        snapshotSeq,
        snapshotAt,
        afterSeq,
        cursor,
        totalReceived,
        totalScanned,
        rejected,
        duplicates,
        pages,
        oldestAt,
        latestAt,
        exhausted: state === "complete",
        message,
        retryable
      };
    }
    function report() {
      try {
        onStatus(status());
      } catch {
      }
    }
    function requestURL() {
      const url = new URL(`/rest/v1/${config.table}`, root);
      url.searchParams.set("select", COLUMNS2);
      url.searchParams.set("completed", "eq.true");
      url.searchParams.set("estimated", "eq.false");
      url.searchParams.set("round_timestamp", "not.is.null");
      url.searchParams.set("order", "source_seq.desc");
      url.searchParams.set("limit", String(pageSize));
      const filters = [];
      if (afterSeq !== null) filters.push(`source_seq.gt.${afterSeq}`);
      if (snapshotSeq !== null) filters.push(`source_seq.lte.${snapshotSeq}`);
      if (cursor !== null) filters.push(`source_seq.lt.${cursor}`);
      if (filters.length === 1) url.searchParams.set("source_seq", filters[0].slice("source_seq.".length));
      else if (filters.length) url.searchParams.set("and", `(${filters.join(",")})`);
      return url;
    }
    async function getPage() {
      const controller = new AbortController();
      request = controller;
      let timeout, abortListener;
      const aborted = new Promise((_, reject) => {
        abortListener = () => reject(new DOMException("Aborted", "AbortError"));
        controller.signal.addEventListener("abort", abortListener, { once: true });
        timeout = setRequestTimeout(() => controller.abort(), timeoutMs);
      });
      try {
        return await Promise.race([aborted, (async () => {
          const response = await fetchImpl(requestURL(), {
            method: "GET",
            headers: { apikey: config.publishableKey, Accept: "application/json" },
            signal: controller.signal,
            credentials: "omit",
            cache: "no-store"
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw Error(`Архив Supabase HTTP ${response.status}${body?.code ? " · " + String(body.code).slice(0, 80) : ""}`);
          }
          const rows = await response.json();
          if (!Array.isArray(rows)) throw new ArchiveDataError("Supabase вернул неверный формат архива");
          if (rows.length > pageSize) throw new ArchiveDataError("Источник превысил размер страницы архива");
          return rows;
        })()]);
      } finally {
        clearRequestTimeout(timeout);
        controller.signal.removeEventListener("abort", abortListener);
        if (request === controller) request = null;
      }
    }
    async function step(ticket) {
      if (state !== "loading" || ticket !== generation) return;
      try {
        const raw = await getPage();
        if (state !== "loading" || ticket !== generation) return;
        if (!raw.length) {
          if (snapshotSeq === null) snapshotSeq = afterSeq;
          state = "complete";
          retryable = false;
          message = "";
          report();
          return;
        }
        const batch = [], staged = /* @__PURE__ */ new Map();
        let previousSeq = null, previousRaw = null, pageRejected = 0, pageDuplicates = 0, nextCursor = null;
        let nextOldest = oldestAt, nextLatest = latestAt;
        const pageNow = now();
        if (!Number.isSafeInteger(pageNow) || pageNow <= 0) throw new ArchiveDataError("Некорректное время при загрузке архива");
        for (const row of raw) {
          const seq = sequence2(row?.source_seq);
          if (seq === null) throw new ArchiveDataError("Некорректный source_seq в архиве");
          if (snapshotSeq !== null && BigInt(seq) > BigInt(snapshotSeq) || afterSeq !== null && BigInt(seq) <= BigInt(afterSeq) || cursor !== null && BigInt(seq) >= BigInt(cursor))
            throw new ArchiveDataError("Источник нарушил границы страницы архива");
          if (previousSeq !== null && BigInt(seq) > BigInt(previousSeq))
            throw new ArchiveDataError("Источник нарушил порядок source_seq в архиве");
          if (previousSeq === seq) {
            if (row.id !== previousRaw.id || row.coefficient !== previousRaw.coefficient || row.round_timestamp !== previousRaw.round_timestamp || row.completed !== previousRaw.completed || row.estimated !== previousRaw.estimated)
              throw new ArchiveDataError("Конфликт одинакового source_seq в архиве");
            pageDuplicates++;
            continue;
          }
          previousSeq = seq;
          previousRaw = row;
          nextCursor = seq;
          const round = mapRound(row, seq, pageNow);
          if (!round) {
            pageRejected++;
            continue;
          }
          const prior = staged.get(round.id) ?? seen.get(round.id);
          if (prior) {
            if (prior.coefficient !== round.coefficient || prior.timestamp !== round.timestamp)
              throw new ArchiveDataError("Конфликт ID в истории Supabase; архив не подтверждён");
            pageDuplicates++;
            continue;
          }
          staged.set(round.id, round);
          batch.push(round);
          nextOldest = nextOldest === null ? round.timestamp : Math.min(nextOldest, round.timestamp);
          nextLatest = nextLatest === null ? round.timestamp : Math.max(nextLatest, round.timestamp);
        }
        if (nextCursor === null || cursor !== null && BigInt(nextCursor) >= BigInt(cursor))
          throw new ArchiveDataError("Курсор архива не продвинулся");
        if (snapshotSeq === null) snapshotSeq = sequence2(raw[0].source_seq);
        const meta = Object.freeze({
          snapshotSeq,
          snapshotAt,
          afterSeq,
          cursor: nextCursor,
          previousCursor: cursor,
          page: pages + 1,
          rawCount: raw.length,
          totalReceived: totalReceived + batch.length,
          totalScanned: totalScanned + raw.length,
          rejected: rejected + pageRejected,
          duplicates: duplicates + pageDuplicates,
          oldestAt: nextOldest,
          latestAt: nextLatest
        });
        await onPage(Object.freeze(batch), meta);
        if (state !== "loading" || ticket !== generation) return;
        for (const [id, round] of staged) seen.set(id, round);
        cursor = nextCursor;
        pages++;
        totalScanned += raw.length;
        totalReceived += batch.length;
        rejected += pageRejected;
        duplicates += pageDuplicates;
        oldestAt = nextOldest;
        latestAt = nextLatest;
        report();
        if (state !== "loading" || ticket !== generation) return;
        timer = schedule(() => {
          timer = null;
          void step(ticket);
        }, pageDelayMs);
      } catch (error) {
        if (state !== "loading" || ticket !== generation) return;
        state = "error";
        retryable = !(error instanceof ArchiveDataError);
        message = error?.name === "AbortError" ? "Загрузка архива прервана или превышено время ожидания" : String(error?.message || "Ошибка загрузки архива");
        report();
      }
    }
    function start2() {
      if (state !== "idle") return false;
      snapshotAt = now();
      state = "loading";
      generation++;
      report();
      void step(generation);
      return true;
    }
    function retry() {
      if (state !== "error" || !retryable) return false;
      state = "loading";
      message = "";
      retryable = false;
      generation++;
      report();
      void step(generation);
      return true;
    }
    function stop() {
      if (state === "stopped") return;
      generation++;
      cancel(timer);
      timer = null;
      request?.abort();
      request = null;
      state = "stopped";
      message = "";
      retryable = false;
      report();
    }
    return { start: start2, retry, stop, status };
  }

  // src/archive-service.mjs
  var MAX_SEQUENCE3 = 9223372036854775807n;
  var MIN_SEQUENCE3 = -9223372036854775808n;
  var MIN_TIMESTAMP5 = 9466848e5;
  var MAX_TIMESTAMP4 = 864e13;
  var rowFields = ["id", "coefficient", "timestamp", "sourceSeq", "completed", "estimated"];
  var dataError = (message) => Object.assign(new Error(message), { name: "ArchiveCacheDataError" });
  var sameRow2 = (left, right) => rowFields.every((field) => left[field] === right[field]);
  var timestamp3 = (value) => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP5 && value <= MAX_TIMESTAMP4;
  function checkedTime(value) {
    if (!timestamp3(value)) throw dataError("Архив: неверное время устройства");
    return value;
  }
  function sequence3(value) {
    if (typeof value !== "string" || !/^-?\d{1,19}$/.test(value) || BigInt(value) > MAX_SEQUENCE3 || BigInt(value) < MIN_SEQUENCE3)
      throw dataError("Архив: неверная граница sourceSeq");
    return BigInt(value).toString();
  }
  function cleanRow2(value, at) {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string" || !value.id.trim() || value.id.length > 300 || typeof value.coefficient !== "number" || !Number.isFinite(value.coefficient) || value.coefficient < 1 || !timestamp3(value.timestamp) || value.timestamp > at || value.completed !== true || value.estimated !== false)
      throw dataError("Архив: неверный подтверждённый раунд");
    return {
      id: value.id,
      coefficient: value.coefficient,
      timestamp: value.timestamp,
      sourceSeq: sequence3(value.sourceSeq),
      completed: true,
      estimated: false
    };
  }
  function cleanSnapshot(value, at) {
    if (!value || typeof value !== "object" || !Array.isArray(value.rows) || !timestamp3(value.savedAt) || value.savedAt > at)
      throw dataError("Архив: повреждён сохранённый снимок");
    const snapshotSeq = sequence3(value.snapshotSeq), rows = /* @__PURE__ */ new Map();
    for (const input of value.rows) {
      const row = cleanRow2(input, at), prior = rows.get(row.id);
      if (BigInt(row.sourceSeq) > BigInt(snapshotSeq) || prior && !sameRow2(prior, row))
        throw dataError("Архив: повреждена граница сохранённой истории");
      rows.set(row.id, row);
    }
    return { rows, snapshotSeq, savedAt: value.savedAt };
  }
  function createArchiveService({
    config,
    fetchImpl,
    cache = null,
    onChange = () => {
    },
    now = Date.now,
    createFeed = createArchiveFeed,
    buildSummary = buildRareArchiveSummary
  } = {}) {
    let stopped = false, initialized = false, generation = 0, feed = null, records = null;
    let volatileComplete = null, cacheAvailable = !!cache;
    let summary = null, count3 = 0, snapshotSeq = null, savedAt = null;
    let status = "idle", loading = false, progress = null, error = "", cacheWarning = cache ? "" : "Кэш недоступен; архив хранится в памяти этой вкладки";
    let finishing = null, dataFailure = false;
    function state() {
      return {
        status,
        loading,
        summary,
        count: count3,
        loadedCount: records?.size ?? count3,
        snapshotSeq,
        savedAt,
        progress: progress ? { ...progress } : null,
        error,
        cacheWarning
      };
    }
    function notify() {
      if (!stopped) {
        try {
          onChange(state());
        } catch {
        }
      }
    }
    const current = (ticket) => !stopped && ticket === generation;
    function unavailable(reason2) {
      cacheAvailable = false;
      cacheWarning = "Кэш архива недоступен; история хранится только до закрытия страницы" + (reason2?.message ? " · " + String(reason2.message).slice(0, 180) : "");
    }
    function addPage(input, at) {
      if (!Array.isArray(input)) throw dataError("Архив: страница должна быть массивом");
      const staged = /* @__PURE__ */ new Map();
      for (const value of input) {
        const row = cleanRow2(value, at), prior = staged.get(row.id) ?? records?.get(row.id);
        if (prior && !sameRow2(prior, row)) throw dataError("Архив: конфликт ID в полученной истории");
        staged.set(row.id, row);
      }
      return staged;
    }
    function fail(ticket, failure) {
      if (!current(ticket)) return;
      if (failure?.name === "ArchiveCacheDataError") dataFailure = true;
      loading = false;
      status = "error";
      error = String(failure?.message || failure || "Ошибка архива");
      notify();
    }
    async function finish(ticket, incoming, full) {
      if (!current(ticket) || incoming.exhausted !== true) return;
      try {
        const nextSeq = incoming.snapshotSeq === null ? null : sequence3(incoming.snapshotSeq);
        if (nextSeq === null ? records.size > 0 : [...records.values()].some((row) => BigInt(row.sourceSeq) > BigInt(nextSeq)))
          throw dataError("Архив: граница полного снимка не соответствует истории");
        status = "processing";
        notify();
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!current(ticket)) return;
        const at = checkedTime(now());
        const unchangedSnapshot = !full && summary && snapshotSeq === nextSeq && count3 === records.size;
        const nextSummary = unchangedSnapshot ? summary : await buildSummary([...records.values()], at);
        if (!current(ticket)) return;
        if (!nextSummary || typeof nextSummary !== "object") throw dataError("Архив: анализ полного снимка недоступен");
        if (cacheAvailable && nextSeq !== null) {
          try {
            await cache.markComplete({ snapshotSeq: nextSeq, savedAt: at });
          } catch (failure) {
            if (failure?.name === "ArchiveCacheDataError") throw failure;
            unavailable(failure);
          }
        }
        if (!current(ticket)) return;
        summary = nextSummary;
        count3 = records.size;
        snapshotSeq = nextSeq;
        savedAt = at;
        volatileComplete = cacheAvailable && nextSeq !== null ? null : records;
        records = null;
        status = "complete";
        loading = false;
        error = "";
        notify();
      } catch (failure) {
        fail(ticket, failure);
      }
    }
    async function begin(full = false) {
      if (stopped || loading && !full) return false;
      const ticket = ++generation;
      feed?.stop();
      feed = null;
      finishing = null;
      loading = true;
      status = "cache-loading";
      error = "";
      progress = null;
      dataFailure = false;
      notify();
      let base = null;
      try {
        if (full) {
          cacheAvailable = !!cache;
          cacheWarning = "";
          if (cacheAvailable) {
            try {
              await cache.clear();
            } catch (failure) {
              unavailable(failure);
            }
          }
        } else if (cacheAvailable) {
          try {
            base = await cache.loadComplete();
          } catch (failure) {
            unavailable(failure);
          }
        }
        if (!current(ticket)) return false;
        records = /* @__PURE__ */ new Map();
        let lowerBound = null;
        if (!full && base) {
          const at = checkedTime(now()), restored = cleanSnapshot(base, at), seq = restored.snapshotSeq;
          records = restored.rows;
          let cachedSummary = summary;
          if (!cachedSummary || snapshotSeq !== seq || count3 !== records.size) {
            status = "processing";
            notify();
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (!current(ticket)) return false;
            cachedSummary = await buildSummary([...records.values()], at);
          }
          if (!current(ticket)) return false;
          summary = cachedSummary;
          count3 = records.size;
          snapshotSeq = lowerBound = seq;
          savedAt = restored.savedAt;
          notify();
        } else if (!full && volatileComplete) {
          records = new Map(volatileComplete);
          lowerBound = snapshotSeq;
        }
        if (!current(ticket)) return false;
        status = "loading";
        notify();
        feed = createFeed(config, {
          fetchImpl,
          now,
          afterSeq: lowerBound,
          pageSize: 1e3,
          async onPage(rows) {
            if (!current(ticket)) return;
            try {
              const staged = addPage(rows, checkedTime(now()));
              if (cacheAvailable) {
                try {
                  await cache.writePage([...staged.values()]);
                } catch (failure) {
                  if (failure?.name === "ArchiveCacheDataError") throw failure;
                  unavailable(failure);
                }
              }
              if (!current(ticket)) return;
              for (const [id, row] of staged) records.set(id, row);
            } catch (failure) {
              if (failure?.name === "ArchiveCacheDataError") dataFailure = true;
              throw failure;
            }
          },
          onStatus(incoming) {
            if (!current(ticket)) return;
            progress = { ...incoming };
            if (incoming.state === "error") {
              fail(ticket, incoming.message || "Ошибка загрузки архива");
              return;
            }
            if (incoming.state === "complete") {
              if (incoming.exhausted !== true) {
                fail(ticket, dataError("Архив: источник не подтвердил конец истории"));
                return;
              }
              if (!finishing) finishing = finish(ticket, incoming, full);
              return;
            }
            if (incoming.state === "loading") {
              status = "loading";
              loading = true;
              error = "";
            }
            notify();
          }
        });
        feed.start();
        return current(ticket);
      } catch (failure) {
        fail(ticket, failure);
        return false;
      }
    }
    function start2() {
      if (initialized || stopped) return Promise.resolve(false);
      initialized = true;
      return begin();
    }
    function refresh({ full = false } = {}) {
      initialized = true;
      return begin(full === true);
    }
    function retry() {
      if (stopped || status !== "error" || dataFailure) return false;
      const ticket = generation, selectedFeed = feed;
      if (selectedFeed?.retry() && current(ticket) && feed === selectedFeed) {
        loading = true;
        status = "loading";
        error = "";
        notify();
        return true;
      }
      return false;
    }
    async function getRows() {
      if (stopped || !summary || savedAt === null) return null;
      const ticket = generation, expected = { summary, count: count3, snapshotSeq, savedAt };
      const unchanged = () => current(ticket) && summary === expected.summary && count3 === expected.count && snapshotSeq === expected.snapshotSeq && savedAt === expected.savedAt;
      if (volatileComplete) return [...volatileComplete.values()].map((row) => ({ ...row }));
      if (!cacheAvailable || expected.snapshotSeq === null) return null;
      try {
        const loaded = await cache.loadComplete();
        if (!unchanged()) return null;
        if (!loaded || loaded.snapshotSeq !== expected.snapshotSeq || loaded.savedAt !== expected.savedAt) return null;
        const clean = cleanSnapshot(loaded, checkedTime(now()));
        if (clean.rows.size !== expected.count || !unchanged()) return null;
        return [...clean.rows.values()];
      } catch (failure) {
        if (unchanged()) {
          unavailable(failure);
          notify();
        }
        return null;
      }
    }
    function stop() {
      if (stopped) return;
      stopped = true;
      generation++;
      feed?.stop();
      feed = null;
      loading = false;
      status = "stopped";
      records = null;
      volatileComplete = null;
      cache?.close?.();
    }
    return { start: start2, refresh, retry, getRows, stop, get state() {
      return state();
    } };
  }

  // src/statistics/survival.mjs
  var TARGETS2 = Object.freeze([10, 15, 20, 50, 100]);
  var HORIZONS = Object.freeze([1, 3, 5]);
  var AGE_BINS = Object.freeze([0, 1, 2, 3, 5, 10, 20, 50, 100, 200, 500, Infinity]);
  var EVIDENCE_STATUS3 = "experimental-unvalidated";
  var MAX_GAP_MS = 18e4;
  var MIN_TIMESTAMP6 = 9466848e5;
  var MIN_ROWS = 500;
  var MIN_KNOWN_EVENTS = 20;
  var MIN_BIN_EXPOSURES = 30;
  var MIN_WEIBULL_EVENTS = 30;
  var LOG_SHAPE_MIN = Math.log(0.2);
  var LOG_SHAPE_MAX = Math.log(5);
  var LOG_SCALE_MIN = Math.log(0.1);
  var LOG_SCALE_MAX = Math.log(1e7);
  var clamp012 = (value) => Math.max(0, Math.min(1, value));
  var validTime = (value) => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP6 && value <= 864e13;
  var binIndex = (age) => {
    for (let index = 0; index < AGE_BINS.length - 1; index++) if (age < AGE_BINS[index + 1]) return index;
    return AGE_BINS.length - 2;
  };
  function freeze(object) {
    if (object && typeof object === "object" && !Object.isFrozen(object)) {
      for (const value of Object.values(object)) freeze(value);
      Object.freeze(object);
    }
    return object;
  }
  function grouped(values) {
    const map = /* @__PURE__ */ new Map();
    for (const value of values) map.set(value, (map.get(value) || 0) + 1);
    return [...map].sort((a, b) => a[0] - b[0]);
  }
  function negativeLogLikelihood(parameters, events, censored) {
    const [logShape, logScale] = parameters;
    if (!parameters.every(Number.isFinite) || logShape < LOG_SHAPE_MIN || logShape > LOG_SHAPE_MAX || logScale < LOG_SCALE_MIN || logScale > LOG_SCALE_MAX) return Infinity;
    const shape = Math.exp(logShape), scale = Math.exp(logScale);
    let loss = 0;
    for (const [gap, n] of events) {
      const left = gap === 1 ? 0 : Math.exp(shape * (Math.log(gap - 1) - logScale));
      const right = Math.exp(shape * (Math.log(gap) - logScale));
      const difference = right - left;
      if (!(difference > 0) || !Number.isFinite(right)) return Infinity;
      const logProbability = -left + Math.log(-Math.expm1(-difference));
      if (!Number.isFinite(logProbability)) return Infinity;
      loss -= n * logProbability;
    }
    for (const [duration2, n] of censored) loss += n * (duration2 / scale) ** shape;
    return Number.isFinite(loss) ? loss : Infinity;
  }
  function nelderMead(loss, initial) {
    let points = [initial, [initial[0] + 0.15, initial[1]], [initial[0], initial[1] + 0.15]].map((point) => ({ point: [...point], value: loss(point) }));
    let converged = false;
    for (let iteration = 0; iteration < 240; iteration++) {
      points.sort((a, b) => a.value - b.value);
      if (Math.max(...points.slice(1).flatMap((item) => item.point.map((value, index) => Math.abs(value - points[0].point[index])))) < 1e-7) {
        converged = true;
        break;
      }
      const center = points[0].point.map((value, index) => (value + points[1].point[index]) / 2);
      const proposal = (factor) => center.map((value, index) => value + factor * (value - points[2].point[index]));
      const reflected = { point: proposal(1) };
      reflected.value = loss(reflected.point);
      if (reflected.value < points[0].value) {
        const expanded = { point: proposal(2) };
        expanded.value = loss(expanded.point);
        points[2] = expanded.value < reflected.value ? expanded : reflected;
      } else if (reflected.value < points[1].value) points[2] = reflected;
      else {
        const outside = reflected.value < points[2].value;
        const contracted = { point: proposal(outside ? 0.5 : -0.5) };
        contracted.value = loss(contracted.point);
        if (contracted.value < (outside ? reflected.value : points[2].value)) points[2] = contracted;
        else for (let index = 1; index < 3; index++) {
          points[index].point = points[index].point.map((value, axis) => (value + points[0].point[axis]) / 2);
          points[index].value = loss(points[index].point);
        }
      }
    }
    points.sort((a, b) => a.value - b.value);
    return { ...points[0], converged };
  }
  function hessianCovariance(loss, point) {
    const step = 1e-3, center = loss(point);
    const at = (x, y) => loss([point[0] + x * step, point[1] + y * step]);
    const a = (at(1, 0) - 2 * center + at(-1, 0)) / step ** 2;
    const d = (at(0, 1) - 2 * center + at(0, -1)) / step ** 2;
    const b = (at(1, 1) - at(1, -1) - at(-1, 1) + at(-1, -1)) / (4 * step ** 2);
    const determinant = a * d - b * b;
    if (![a, b, d, determinant].every(Number.isFinite) || a <= 0 || d <= 0 || determinant <= 1e-9) return null;
    const trace = a + d, discriminant = Math.sqrt((a - d) ** 2 + 4 * b * b);
    if ((trace + discriminant) / (trace - discriminant) > 1e10) return null;
    return [[d / determinant, -b / determinant], [-b / determinant, a / determinant]];
  }
  function weibullRoundProbability(shape, scale, ageRounds, horizon) {
    if (![shape, scale].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0) || !Number.isSafeInteger(ageRounds) || ageRounds < 0 || !Number.isSafeInteger(horizon) || horizon < 1) return null;
    const before = ageRounds === 0 ? 0 : (ageRounds / scale) ** shape;
    const after = ((ageRounds + horizon) / scale) ** shape;
    return clamp012(-Math.expm1(-(after - before)));
  }
  function fitDiscreteWeibull(eventGaps, censoredGaps = []) {
    if (!Array.isArray(eventGaps) || !Array.isArray(censoredGaps) || eventGaps.some((value) => !Number.isSafeInteger(value) || value < 1) || censoredGaps.some((value) => !Number.isSafeInteger(value) || value < 0))
      return { status: "insufficient", reason: "invalid-renewal-gaps" };
    if (eventGaps.length < MIN_WEIBULL_EVENTS) return { status: "insufficient", reason: "insufficient-renewal-events", eventCount: eventGaps.length };
    const events = grouped(eventGaps), censored = grouped(censoredGaps.filter((value) => value > 0));
    const totalExposure = [...events, ...censored].reduce((sum, [duration2, n]) => sum + duration2 * n, 0);
    const loss = (parameters) => negativeLogLikelihood(parameters, events, censored);
    const result = nelderMead(loss, [0, Math.log(Math.max(0.2, totalExposure / eventGaps.length))]);
    const [logShape, logScale] = result.point;
    if (!result.converged || !Number.isFinite(result.value) || logShape - LOG_SHAPE_MIN < 1e-3 || LOG_SHAPE_MAX - logShape < 1e-3 || logScale - LOG_SCALE_MIN < 1e-3 || LOG_SCALE_MAX - logScale < 1e-3)
      return { status: "insufficient", reason: "unstable-or-boundary-weibull-fit", eventCount: eventGaps.length };
    const covariance = hessianCovariance(loss, result.point);
    if (!covariance) return { status: "insufficient", reason: "singular-weibull-uncertainty", eventCount: eventGaps.length };
    return {
      status: "ready",
      reason: null,
      shape: Math.exp(logShape),
      scale: Math.exp(logScale),
      logParameters: result.point,
      covariance,
      negativeLogLikelihood: result.value,
      shapeInterval95: [-1.96, 1.96].map((z) => Math.exp(logShape + z * Math.sqrt(covariance[0][0]))),
      scaleInterval95: [-1.96, 1.96].map((z) => Math.exp(logScale + z * Math.sqrt(covariance[1][1]))),
      eventCount: eventGaps.length,
      rightCensoredCount: censoredGaps.filter((value) => value > 0).length,
      totalExposureRounds: totalExposure,
      fitKind: "discrete-interval-weibull-mle-with-right-censoring",
      intervalKind: "asymptotic-log-parameter-observed-hessian"
    };
  }
  function unambiguousChronology(ordered) {
    const rows = [], breakBefore = /* @__PURE__ */ new Set();
    let tiedGroupCount = 0, tiedRoundCount = 0, pendingBreak = true;
    for (let index = 0; index < ordered.length; ) {
      let end = index + 1;
      while (end < ordered.length && ordered[end].timestamp === ordered[index].timestamp) end++;
      if (end - index > 1) {
        tiedGroupCount++;
        tiedRoundCount += end - index;
        pendingBreak = true;
      } else {
        const row = ordered[index], previous = rows.at(-1);
        if (pendingBreak || !previous || row.timestamp - previous.timestamp > MAX_GAP_MS) breakBefore.add(rows.length);
        rows.push(row);
        pendingBreak = false;
      }
      index = end;
    }
    return { rows, breakBefore, tiedGroupCount, tiedRoundCount };
  }
  function targetFit(rows, target, breakBefore) {
    const bins = AGE_BINS.slice(0, -1).map((lower, index) => ({ lower, upper: AGE_BINS[index + 1], exposures: 0, events: 0 }));
    const eventGaps = [], censoredGaps = [];
    let age = null, previousAt = null, knownEvents = 0, allEvents = 0, segments = 0;
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (previousAt === null || breakBefore.has(index) || row.timestamp - previousAt > MAX_GAP_MS) {
        if (age !== null) censoredGaps.push(age);
        age = null;
        segments++;
      }
      const event = row.coefficient >= target;
      if (event) allEvents++;
      if (age !== null) {
        const bin = bins[binIndex(age)];
        bin.exposures++;
        if (event) {
          bin.events++;
          eventGaps.push(age + 1);
          knownEvents++;
          age = 0;
        } else age++;
      } else if (event) age = 0;
      previousAt = row.timestamp;
    }
    if (age !== null) censoredGaps.push(age);
    for (const bin of bins) {
      bin.alpha = bin.events + 0.5;
      bin.beta = bin.exposures - bin.events + 0.5;
      bin.bounds = Array.from({ length: 5 }, (_, index) => {
        const tail = 0.025 / (index + 1);
        return [inverseBetaCDF(tail, bin.alpha, bin.beta), inverseBetaCDF(1 - tail, bin.alpha, bin.beta)];
      });
    }
    const reason2 = rows.length < MIN_ROWS ? "insufficient-training-rounds" : knownEvents < MIN_KNOWN_EVENTS ? "insufficient-known-age-events" : null;
    return {
      target,
      eventCount: allEvents,
      knownAgeEventCount: knownEvents,
      segmentCount: segments,
      lastKnownAgeRounds: age,
      bayesian: {
        status: reason2 ? "insufficient" : "ready",
        reason: reason2,
        bins,
        intervalKind: "at-least-95-percent-bonferroni-posterior-envelope"
      },
      weibull: reason2 ? { status: "insufficient", reason: reason2 } : fitDiscreteWeibull(eventGaps, censoredGaps)
    };
  }
  function fitSurvivalModels(input, { targets = TARGETS2, now = Date.now() } = {}) {
    const accepted = normalizeRounds(input, now).reverse();
    const { rows, breakBefore, tiedGroupCount, tiedRoundCount } = unambiguousChronology(accepted);
    const acceptedTargets = Array.isArray(targets) ? [...new Set(targets.filter((value) => typeof value === "number" && Number.isFinite(value) && value > 1))].sort((a, b) => a - b) : [];
    return freeze({
      modelId: "survival-models-v1",
      evidenceStatus: EVIDENCE_STATUS3,
      trainedAt: validTime(now) ? now : null,
      dataCutoff: accepted.at(-1)?.timestamp ?? null,
      firstAt: accepted[0]?.timestamp ?? null,
      sampleSize: rows.length,
      diagnostics: {
        acceptedRoundCount: accepted.length,
        usableRoundCount: rows.length,
        excludedTiedGroupCount: tiedGroupCount,
        excludedTiedRoundCount: tiedRoundCount,
        tiedTimestampPolicy: "exclude-whole-group-and-break-renewal-segment"
      },
      gapThresholdMs: MAX_GAP_MS,
      horizons: [...HORIZONS],
      targets: acceptedTargets.map((target) => targetFit(rows, target, breakBefore)),
      assumptions: [
        "renewal-within-contiguous-observed-segments",
        "fixed-age-bins",
        "unknown-left-edge-age-excluded",
        "right-censoring-at-segment-ends",
        "equal-timestamp-groups-excluded-and-censored",
        "completed-round-horizons"
      ]
    });
  }
  function bayesianProbability(fit, age, horizon) {
    const usage = /* @__PURE__ */ new Map();
    for (let step = 0; step < horizon; step++) {
      const index = binIndex(age + step);
      usage.set(index, (usage.get(index) || 0) + 1);
    }
    if ([...usage.keys()].some((index) => fit.bins[index].exposures < MIN_BIN_EXPOSURES))
      return { reason: "insufficient-age-bin-exposure" };
    if ([...usage.keys()].some((index) => {
      const bounds = fit.bins[index].bounds?.[usage.size - 1];
      return !Array.isArray(bounds) || bounds.length !== 2 || !bounds.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || bounds[0] > bounds[1];
    })) return { reason: "unstable-hazard-posterior" };
    let expectedSurvival = 1, lowerSurvival = 1, upperSurvival = 1;
    for (const [index, repeats] of usage) {
      const bin = fit.bins[index], bounds = bin.bounds[usage.size - 1];
      for (let j = 0; j < repeats; j++) expectedSurvival *= (bin.beta + j) / (bin.alpha + bin.beta + j);
      lowerSurvival *= (1 - bounds[1]) ** repeats;
      upperSurvival *= (1 - bounds[0]) ** repeats;
    }
    return { probability: clamp012(1 - expectedSurvival), interval95: [clamp012(1 - upperSurvival), clamp012(1 - lowerSurvival)] };
  }
  function weibullProbability(fit, age, horizon) {
    const probability4 = weibullRoundProbability(fit.shape, fit.scale, age, horizon);
    if (probability4 === null || probability4 <= 1e-12 || probability4 >= 1 - 1e-12) return null;
    const logit = (parameters) => {
      const value = weibullRoundProbability(Math.exp(parameters[0]), Math.exp(parameters[1]), age, horizon);
      return value > 0 && value < 1 ? Math.log(value / (1 - value)) : NaN;
    };
    const step = 1e-4;
    const gradient = [0, 1].map((index) => {
      const plus = [...fit.logParameters], minus = [...fit.logParameters];
      plus[index] += step;
      minus[index] -= step;
      return (logit(plus) - logit(minus)) / (2 * step);
    });
    const covariance = fit.covariance;
    const variance = gradient[0] ** 2 * covariance[0][0] + 2 * gradient[0] * gradient[1] * covariance[0][1] + gradient[1] ** 2 * covariance[1][1];
    if (!Number.isFinite(variance) || variance < 0) return null;
    const center = Math.log(probability4 / (1 - probability4)), deviation = 1.96 * Math.sqrt(variance);
    return { probability: probability4, interval95: [center - deviation, center + deviation].map((value) => 1 / (1 + Math.exp(-value))) };
  }
  function predictSurvivalAtAge(fit, { target, ageRounds, now = Date.now(), lastAt = now } = {}) {
    const trained = fit?.targets?.find((item) => item.target === target);
    const sourceReason = fit?.modelId !== "survival-models-v1" || !trained ? "unknown-target-or-fit" : !validTime(now) || !validTime(lastAt) || !validTime(fit.trainedAt) || !validTime(fit.dataCutoff) || fit.trainedAt > now || fit.dataCutoff > lastAt || lastAt > now ? "invalid-as-of-time" : now - lastAt > MAX_GAP_MS ? "stale-live-history" : !Number.isSafeInteger(ageRounds) || ageRounds < 0 ? "unknown-current-renewal-age" : null;
    const records = [];
    for (const [key, modelId] of [["bayesian", "bayesian-hazard-v1"], ["weibull", "weibull-survival-v1"]]) for (const horizon of HORIZONS) {
      const component = trained?.[key];
      let reason2 = sourceReason ?? (component?.status === "ready" ? null : component?.reason || "insufficient-model-fit");
      const computed = reason2 ? null : key === "bayesian" ? bayesianProbability(component, ageRounds, horizon) : weibullProbability(component, ageRounds, horizon);
      if (!reason2 && computed?.reason) reason2 = computed.reason;
      if (!reason2 && !computed) reason2 = "unstable-prediction-uncertainty";
      const result = reason2 ? null : computed;
      records.push({
        modelId,
        target,
        horizon,
        status: result ? "ready" : "insufficient",
        reason: reason2,
        evidenceStatus: EVIDENCE_STATUS3,
        probability: result?.probability ?? null,
        interval95: result?.interval95 ?? null,
        intervalKind: key === "bayesian" ? "at-least-95-percent-bonferroni-posterior-envelope" : "asymptotic-logit-delta-parameter-uncertainty",
        ageRounds: Number.isSafeInteger(ageRounds) && ageRounds >= 0 ? ageRounds : null,
        trainedAt: fit?.trainedAt ?? null,
        dataCutoff: fit?.dataCutoff ?? null,
        generatedAt: now,
        horizonUnit: "completed-rounds",
        assumptions: key === "bayesian" ? "piecewise-constant-age-hazards" : "discrete-weibull-renewal"
      });
    }
    return records;
  }

  // src/statistics/time-models.mjs
  var TIME_MODEL_VERSION = "clock-exposure-v1";
  var TIME_TARGETS = Object.freeze([10, 15, 20, 50, 100]);
  var TIME_RADII = Object.freeze([30, 60, 120]);
  var TIME_BUCKET_SECONDS = 300;
  var TIME_MODEL_IDS = Object.freeze([
    ...TIME_RADII.map((r) => `temporal-pattern-${r}`),
    ...TIME_RADII.map((r) => `circular-kde-${r}`),
    "bayesian-time-buckets-300",
    "multi-day-seasonality-300"
  ]);
  var DAY = 86400;
  var MIN_TIMESTAMP7 = 9466848e5;
  var MAX_TIMESTAMP5 = 864e13;
  var PRIOR_ROUNDS = 20;
  var FORMATTERS = /* @__PURE__ */ new Map();
  var timestamp4 = (value) => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP7 && value <= MAX_TIMESTAMP5;
  var clamp2 = (x) => Math.max(0, Math.min(1, x));
  var mod = (x) => (x % DAY + DAY) % DAY;
  function clockFormatter(timeZone) {
    if (!FORMATTERS.has(timeZone)) FORMATTERS.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }));
    return FORMATTERS.get(timeZone);
  }
  function localClock(timestampMs, timeZone = "Europe/Kyiv") {
    if (!timestamp4(timestampMs)) return null;
    try {
      return clockParts(clockFormatter(timeZone), timestampMs);
    } catch {
      return null;
    }
  }
  function clockParts(formatter, timestampMs) {
    const fields2 = Object.fromEntries(formatter.formatToParts(timestampMs).map((p) => [p.type, p.value]));
    const hour = Number(fields2.hour), minute = Number(fields2.minute), second = Number(fields2.second);
    if (hour > 23 || minute > 59 || second > 59) throw Error("Invalid local clock");
    return { second: hour * 3600 + minute * 60 + second, date: `${fields2.year}-${fields2.month}-${fields2.day}` };
  }
  function moments(counts) {
    const n = new Float64Array(DAY + 1), first = new Float64Array(DAY + 1), second = new Float64Array(DAY + 1);
    for (let i = 0; i < DAY; i++) {
      n[i + 1] = n[i] + counts[i];
      first[i + 1] = first[i] + counts[i] * i;
      second[i + 1] = second[i] + counts[i] * i * i;
    }
    return { n, first, second };
  }
  function rangeMoments(prefix, from, to) {
    if (to < from) return [0, 0, 0];
    let n = 0, first = 0, second = 0;
    const firstPeriod = Math.floor(from / DAY), lastPeriod = Math.floor(to / DAY);
    for (let period = firstPeriod; period <= lastPeriod; period++) {
      const offset = period * DAY, a = Math.max(0, from - offset), b = Math.min(DAY - 1, to - offset);
      if (a > b) continue;
      const count3 = prefix.n[b + 1] - prefix.n[a];
      const one = prefix.first[b + 1] - prefix.first[a];
      const two = prefix.second[b + 1] - prefix.second[a];
      n += count3;
      first += one + offset * count3;
      second += two + 2 * offset * one + offset * offset * count3;
    }
    return [n, first, second];
  }
  function intervalCount(prefix, center, radius) {
    return rangeMoments(prefix, center - radius, center + radius)[0];
  }
  function linearWeight(prefix, from, to, a, b) {
    const [n, first, second] = rangeMoments(prefix, from, to);
    return [Math.max(0, a * n + b * first), Math.max(0, a * a * n + 2 * a * b * first + b * b * second)];
  }
  function triangular(prefix, center, radius) {
    const bandwidth = radius + 1;
    const left = linearWeight(prefix, center - radius, center, 1 - center / bandwidth, 1 / bandwidth);
    const right = linearWeight(prefix, center + 1, center + radius, 1 + center / bandwidth, -1 / bandwidth);
    return [left[0] + right[0], left[1] + right[1]];
  }
  function daySupport(bySecond, dayCount, targetCount, radius) {
    const rounds = new Uint32Array(dayCount), hits = Array.from({ length: targetCount }, () => new Uint32Array(dayCount));
    const supported = new Uint16Array(DAY), eventDays = Array.from({ length: targetCount }, () => new Uint16Array(DAY));
    let days = 0;
    const eventDayCounts = new Uint16Array(targetCount), maskBase = 2 ** targetCount;
    function add2(second, delta) {
      for (const encoded of bySecond[mod(second)] || []) {
        const day = Math.floor(encoded / maskBase), mask = encoded % maskBase;
        if (delta > 0) {
          if (rounds[day]++ === 0) days++;
        } else if (--rounds[day] === 0) days--;
        for (let t = 0; t < targetCount; t++) if (mask & 1 << t) {
          if (delta > 0) {
            if (hits[t][day]++ === 0) eventDayCounts[t]++;
          } else if (--hits[t][day] === 0) eventDayCounts[t]--;
        }
      }
    }
    for (let i = -radius; i <= radius; i++) add2(i, 1);
    for (let center = 0; center < DAY; center++) {
      supported[center] = days;
      for (let t = 0; t < targetCount; t++) eventDays[t][center] = eventDayCounts[t];
      add2(center - radius, -1);
      add2(center + radius + 1, 1);
    }
    return { supported, eventDays };
  }
  function emptyFit(reason2, options) {
    return {
      version: TIME_MODEL_VERSION,
      status: "insufficient",
      reason: reason2,
      evidenceStatus: "experimental-unvalidated",
      timeZone: options.timeZone,
      targets: [...options.targets],
      trainingRoundCount: 0,
      trainingDayCount: 0,
      dataCutoff: null,
      modelIds: [...TIME_MODEL_IDS],
      _state: null
    };
  }
  function fitTimeModels(input, { now = Date.now(), timeZone = "Europe/Kyiv", targets = TIME_TARGETS, lookbackDays = 90 } = {}) {
    const options = { timeZone, targets };
    if (!Array.isArray(targets) || targets.length < 1 || targets.length > 8 || new Set(targets).size !== targets.length || targets.some((t) => !Number.isFinite(t) || t < 1))
      return emptyFit("invalid-targets", { timeZone, targets: [] });
    if (!timestamp4(now)) return emptyFit("invalid-now", options);
    if (!Number.isSafeInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 90) return emptyFit("invalid-lookback", options);
    let formatter;
    try {
      formatter = clockFormatter(timeZone);
    } catch {
      return emptyFit("invalid-time-zone", options);
    }
    const rows = normalizeRounds(input, now).filter((row) => row.timestamp >= now - lookbackDays * DAY * 1e3).reverse();
    if (!rows.length) return emptyFit("no-valid-rounds", options);
    const targetCount = targets.length, maskBase = 2 ** targetCount;
    const total = new Uint32Array(DAY), events = targets.map(() => new Uint32Array(DAY));
    const bySecond = new Array(DAY), days = /* @__PURE__ */ new Map(), bucketDays = Array.from({ length: DAY / TIME_BUCKET_SECONDS }, () => /* @__PURE__ */ new Map());
    for (const row of rows) {
      const clock3 = clockParts(formatter, row.timestamp);
      if (!days.has(clock3.date)) days.set(clock3.date, days.size);
      const day = days.get(clock3.date), second = clock3.second, bucket = Math.floor(second / TIME_BUCKET_SECONDS);
      total[second]++;
      let mask = 0, daily = bucketDays[bucket].get(day);
      if (!daily) {
        daily = new Uint32Array(targetCount + 1);
        bucketDays[bucket].set(day, daily);
      }
      daily[0]++;
      for (let t = 0; t < targetCount; t++) if (row.coefficient >= targets[t]) {
        events[t][second]++;
        daily[t + 1]++;
        mask |= 1 << t;
      }
      (bySecond[second] ||= []).push(day * maskBase + mask);
    }
    const exposure = moments(total), eventPrefixes = events.map(moments);
    const support = Object.fromEntries(TIME_RADII.map((radius) => [radius, daySupport(bySecond, days.size, targetCount, radius)]));
    return {
      version: TIME_MODEL_VERSION,
      status: rows.length >= 500 && days.size >= 7 ? "ready" : "insufficient",
      reason: rows.length < 500 ? "insufficient-training-rounds" : days.size < 7 ? "insufficient-training-days" : null,
      evidenceStatus: "experimental-unvalidated",
      timeZone,
      targets: [...targets],
      modelIds: [...TIME_MODEL_IDS],
      trainingRoundCount: rows.length,
      trainingDayCount: days.size,
      dataStart: rows[0].timestamp,
      dataCutoff: rows.at(-1).timestamp,
      fittedAt: now,
      lookbackDays,
      _state: {
        exposure,
        eventPrefixes,
        support,
        bucketDays: bucketDays.map((map) => [...map.entries()].map(([day, counts]) => [day, ...counts])),
        globalHits: events.map((counts) => counts.reduce((a, b) => a + b, 0))
      }
    };
  }
  function betaEstimate(hits, rounds, outsideHits, outsideRounds, includeIntervals, effectiveRounds = rounds) {
    if (!(rounds > 0) || !(effectiveRounds > 0)) return { probability: null, interval95: null };
    const outside = (outsideHits + 0.5) / (outsideRounds + 1), local = clamp2(hits / rounds);
    const alpha = local * effectiveRounds + 0.5 + PRIOR_ROUNDS * outside;
    const beta = (1 - local) * effectiveRounds + 0.5 + PRIOR_ROUNDS * (1 - outside);
    return { probability: alpha / (alpha + beta), interval95: includeIntervals ? [0.025, 0.975].map((p) => inverseBetaCDF(p, alpha, beta)) : null };
  }
  function supportedReason(fit, globalHits, counts) {
    if (fit.status !== "ready") return fit.reason || "insufficient-training-history";
    if (globalHits < 10) return "insufficient-global-events";
    if (counts.insideRounds < 30) return "insufficient-local-rounds";
    if (counts.insideHits < 3) return "insufficient-local-events";
    if (counts.insideDays < 5) return "insufficient-local-days";
    if (counts.eventDays < 3) return "events-not-repeated-across-days";
    if (counts.outsideRounds < 100) return "insufficient-outside-exposure";
    return null;
  }
  function record2(fit, target, modelId, counts, estimate, reason2, detail = {}) {
    return {
      modelId,
      family: "time",
      target,
      horizon: 1,
      status: reason2 ? "insufficient" : "ready",
      reason: reason2,
      probability: reason2 ? null : estimate.probability,
      interval95: reason2 ? null : estimate.interval95,
      evidenceStatus: "experimental-unvalidated",
      qualified: false,
      qualificationReason: "requires-independent-walk-forward-validation",
      baselineProbability: (counts.globalHits + 0.5) / (fit.trainingRoundCount + 1),
      observedInsideFrequency: counts.insideRounds ? counts.insideHits / counts.insideRounds : null,
      observedOutsideFrequency: counts.outsideRounds ? counts.outsideHits / counts.outsideRounds : null,
      counts,
      priorEquivalentRounds: PRIOR_ROUNDS,
      intervalKind: "conditional-empirical-bayes-95-percent-equal-tail",
      timeZone: fit.timeZone,
      dataCutoff: fit.dataCutoff,
      interpretation: "next-round-conditional-on-decision-clock-approximation",
      intervalAssumption: "exchangeable-conditional-round-outcomes-within-clock-zone; fixed-outside-rate-prior",
      ...detail
    };
  }
  function predictTimeModels(fit, { timestamp: at = Date.now(), target = 10, horizon = 1, includeIntervals = true, intervalModelIds = null } = {}) {
    if (!fit || fit.version !== TIME_MODEL_VERSION || !fit._state || !timestamp4(at) || !timestamp4(fit.dataCutoff) || at < fit.dataCutoff || !Array.isArray(fit.targets) || !fit.targets.includes(target) || horizon !== 1 || !Number.isSafeInteger(fit.trainingRoundCount) || fit.trainingRoundCount < 1 || fit._state.exposure?.n?.length !== DAY + 1 || !Array.isArray(fit._state.eventPrefixes) || fit._state.eventPrefixes.length !== fit.targets.length || !fit._state.support || !Array.isArray(fit._state.bucketDays) || fit._state.bucketDays.length !== DAY / TIME_BUCKET_SECONDS || !Array.isArray(fit._state.globalHits)) return [];
    const clock3 = localClock(at, fit.timeZone);
    if (!clock3) return [];
    const t = fit.targets.indexOf(target), state = fit._state, globalHits = state.globalHits[t];
    const globalRounds = fit.trainingRoundCount, results = [];
    const wantInterval = (id) => includeIntervals && (intervalModelIds === null || Array.isArray(intervalModelIds) && intervalModelIds.includes(id));
    for (const radius of TIME_RADII) {
      const insideRounds2 = intervalCount(state.exposure, clock3.second, radius), insideHits2 = intervalCount(state.eventPrefixes[t], clock3.second, radius);
      const counts2 = {
        insideRounds: insideRounds2,
        insideHits: insideHits2,
        outsideRounds: globalRounds - insideRounds2,
        outsideHits: globalHits - insideHits2,
        insideDays: state.support[radius].supported[clock3.second],
        eventDays: state.support[radius].eventDays[t][clock3.second],
        globalHits
      };
      const reason3 = supportedReason(fit, globalHits, counts2);
      const estimate2 = betaEstimate(insideHits2, insideRounds2, counts2.outsideHits, counts2.outsideRounds, wantInterval(`temporal-pattern-${radius}`) && !reason3);
      results.push(record2(
        fit,
        target,
        `temporal-pattern-${radius}`,
        counts2,
        estimate2,
        reason3,
        { clockSecond: clock3.second, radiusSeconds: radius, windowKind: "circular-inclusive-seconds", futureClockAssumption: "next-round-near-forecast-origin" }
      ));
    }
    for (const radius of TIME_RADII) {
      const [weightedRounds, sumWeightsSquared] = triangular(state.exposure, clock3.second, radius);
      const [weightedHits] = triangular(state.eventPrefixes[t], clock3.second, radius);
      const supportRounds = intervalCount(state.exposure, clock3.second, radius), supportHits = intervalCount(state.eventPrefixes[t], clock3.second, radius);
      const counts2 = {
        insideRounds: supportRounds,
        insideHits: supportHits,
        outsideRounds: globalRounds - supportRounds,
        outsideHits: globalHits - supportHits,
        insideDays: state.support[radius].supported[clock3.second],
        eventDays: state.support[radius].eventDays[t][clock3.second],
        globalHits
      };
      const reason3 = supportedReason(fit, globalHits, counts2);
      const effectiveRounds = sumWeightsSquared > 0 ? weightedRounds ** 2 / sumWeightsSquared : 0;
      const estimate2 = betaEstimate(
        Math.min(weightedHits, weightedRounds),
        weightedRounds,
        counts2.outsideHits,
        counts2.outsideRounds,
        wantInterval(`circular-kde-${radius}`) && !reason3,
        effectiveRounds
      );
      results.push(record2(
        fit,
        target,
        `circular-kde-${radius}`,
        counts2,
        estimate2,
        reason3,
        {
          clockSecond: clock3.second,
          radiusSeconds: radius,
          kernel: "discrete-triangular",
          bandwidthSeconds: radius + 1,
          weightedRounds,
          weightedHits,
          effectiveRounds,
          intervalKind: "approximate-effective-sample-empirical-bayes-95-percent-equal-tail",
          futureClockAssumption: "next-round-near-forecast-origin"
        }
      ));
    }
    const bucket = Math.floor(clock3.second / TIME_BUCKET_SECONDS), from = bucket * TIME_BUCKET_SECONDS, to = from + TIME_BUCKET_SECONDS - 1;
    const insideRounds = rangeMoments(state.exposure, from, to)[0], insideHits = rangeMoments(state.eventPrefixes[t], from, to)[0];
    const daily = state.bucketDays[bucket];
    const supportedDays = daily.filter((row) => row[1] > 0), eventDays = daily.filter((row) => row[t + 2] > 0);
    const counts = {
      insideRounds,
      insideHits,
      outsideRounds: globalRounds - insideRounds,
      outsideHits: globalHits - insideHits,
      insideDays: supportedDays.length,
      eventDays: eventDays.length,
      globalHits
    };
    const reason2 = supportedReason(fit, globalHits, counts);
    const estimate = betaEstimate(
      insideHits,
      insideRounds,
      counts.outsideHits,
      counts.outsideRounds,
      (wantInterval("bayesian-time-buckets-300") || wantInterval("multi-day-seasonality-300")) && !reason2
    );
    results.push(record2(
      fit,
      target,
      "bayesian-time-buckets-300",
      counts,
      estimate,
      reason2,
      {
        clockSecond: clock3.second,
        zoneStartSecond: from,
        zoneEndSecond: to,
        bucketSeconds: TIME_BUCKET_SECONDS,
        interval95: wantInterval("bayesian-time-buckets-300") && !reason2 ? estimate.interval95 : null,
        futureClockAssumption: "next-round-near-forecast-origin"
      }
    ));
    const outsideRate = (counts.outsideHits + 0.5) / (counts.outsideRounds + 1);
    const daysAboveOutside = supportedDays.filter((row) => row[t + 2] / row[1] > outsideRate).length;
    const largestDayEventFraction = insideHits ? Math.max(0, ...eventDays.map((row) => row[t + 2] / insideHits)) : 0;
    const seasonReason = reason2 || (supportedDays.length < 7 ? "insufficient-seasonality-days" : largestDayEventFraction > 0.5 ? "single-day-event-concentration" : daysAboveOutside < Math.ceil(0.6 * supportedDays.length) ? "inconsistent-day-direction" : null);
    results.push(record2(
      fit,
      target,
      "multi-day-seasonality-300",
      { ...counts, daysAboveOutside, largestDayEventFraction },
      estimate,
      seasonReason,
      {
        clockSecond: clock3.second,
        zoneStartSecond: from,
        zoneEndSecond: to,
        interval95: wantInterval("multi-day-seasonality-300") && !seasonReason ? estimate.interval95 : null,
        bucketSeconds: TIME_BUCKET_SECONDS,
        stabilityScope: "training-days-only",
        futureClockAssumption: "next-round-near-forecast-origin"
      }
    ));
    return results;
  }

  // src/statistics/hawkes.mjs
  var HAWKES_MODEL = "hawkes-exponential";
  var HAWKES_TARGETS = Object.freeze([10, 15, 20, 50, 100]);
  var HAWKES_DECAY_SECONDS = Object.freeze([30, 60, 120, 300]);
  var HAWKES_EVIDENCE = "experimental-unvalidated";
  var GAP_MS = 18e4;
  var MIN_EVENTS2 = 20;
  var MIN_ROUNDS3 = 500;
  var MAX_BRANCHING = 0.95;
  var MIN_TIME = 9466848e5;
  var MAX_TIME = 864e13 - 30 * 6e4;
  var finite2 = (value) => typeof value === "number" && Number.isFinite(value);
  var timestamp5 = (value) => Number.isSafeInteger(value) && value >= MIN_TIME && value <= MAX_TIME;
  var validTarget = (value) => finite2(value) && value >= 1;
  var clamp3 = (value, low, high) => Math.max(low, Math.min(high, value));
  var probability = (hazard) => -Math.expm1(-Math.max(0, hazard));
  function freeze2(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze2(child);
      Object.freeze(value);
    }
    return value;
  }
  function segmentsOf(rows) {
    const segments = [];
    let current = [], excludedAmbiguousRows = 0, excludedAmbiguousBlocks = 0, lastAmbiguousAt = null;
    const flush = () => {
      if (current.length) segments.push(current);
      current = [];
    };
    for (let i = 0; i < rows.length; ) {
      let end = i + 1;
      while (end < rows.length && rows[end].timestamp === rows[i].timestamp) end++;
      if (end - i > 1) {
        flush();
        excludedAmbiguousRows += end - i;
        excludedAmbiguousBlocks++;
        lastAmbiguousAt = rows[i].timestamp;
      } else {
        if (current.length && rows[i].timestamp - current.at(-1).timestamp > GAP_MS) flush();
        current.push(rows[i]);
      }
      i = end;
    }
    flush();
    return { segments, excludedAmbiguousRows, excludedAmbiguousBlocks, lastAmbiguousAt };
  }
  function median2(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function targetSegments(segments, target) {
    let exposure = 0, events = 0, tiedEvents = 0;
    const observed = [];
    for (const segment of segments) {
      const first = segment[0].timestamp, duration2 = (segment.at(-1).timestamp - first) / 1e3;
      const eventTimes = [], seeds = segment.filter((row) => row.timestamp === first && row.coefficient >= target).length;
      if (seeds > 1) tiedEvents += seeds - 1;
      if (!(duration2 > 0)) continue;
      let previousEventAt = seeds > 0 ? first : null;
      for (const row of segment) {
        if (row.timestamp <= first || row.coefficient < target) continue;
        if (row.timestamp === previousEventAt) tiedEvents++;
        previousEventAt = row.timestamp;
        eventTimes.push((row.timestamp - first) / 1e3);
      }
      exposure += duration2;
      events += eventTimes.length;
      observed.push({ duration: duration2, seeds, eventTimes });
    }
    return { segments: observed, exposure, events, tiedEvents };
  }
  function hawkesLikelihoodData(segments, beta) {
    if (!finite2(beta) || beta <= 0 || !Array.isArray(segments)) return null;
    const history = [];
    let exposure = 0, integratedKernel = 0, terminal = 0;
    for (const segment of segments) {
      const { duration: duration2, seeds, eventTimes } = segment;
      if (!finite2(duration2) || duration2 <= 0 || !Number.isSafeInteger(seeds) || seeds < 0 || !Array.isArray(eventTimes)) return null;
      let r = seeds, previous = 0;
      integratedKernel += seeds * -Math.expm1(-beta * duration2);
      for (const time of eventTimes) {
        if (!finite2(time) || time <= previous || time > duration2) return null;
        r *= Math.exp(-beta * (time - previous));
        history.push(r);
        r += 1;
        previous = time;
        integratedKernel += -Math.expm1(-beta * (duration2 - time));
      }
      terminal = r * Math.exp(-beta * (duration2 - previous));
      exposure += duration2;
    }
    return { history, exposure, integratedKernel, terminal };
  }
  function objective(data, rate, u, n, derivatives = false) {
    const beta = data.beta;
    if (!(u > 0) || n < 0 || n > MAX_BRANCHING) return { penalized: -Infinity };
    let ll = -rate * u * data.exposure - n * data.integratedKernel;
    let gu = -rate * data.exposure, gn = -data.integratedKernel - 4 * n;
    let auu = 0, aun = 0, ann = 4;
    for (const r of data.history) {
      const lambda = rate * u + beta * n * r;
      if (!(lambda > 0) || !Number.isFinite(lambda)) return { penalized: -Infinity };
      ll += Math.log(lambda);
      if (derivatives) {
        const x = rate / lambda, y = beta * r / lambda;
        gu += x;
        gn += y;
        auu += x * x;
        aun += x * y;
        ann += y * y;
      }
    }
    return { ll, penalized: ll - 2 * n * n, gu, gn, auu, aun, ann };
  }
  function fitDecay(raw, decaySeconds) {
    const beta = 1 / decaySeconds, values = hawkesLikelihoodData(raw.segments, beta);
    if (!values || !raw.events || !values.exposure) return null;
    const data = { ...values, beta }, rate = raw.events / raw.exposure;
    let u = 1, n = 0, value = objective(data, rate, u, n, true);
    for (let iteration = 0; iteration < 60; iteration++) {
      let du, dn;
      if (n <= 1e-12 && value.gn <= 0 || n >= MAX_BRANCHING - 1e-12 && value.gn >= 0) {
        du = value.auu > 0 ? value.gu / value.auu : 0;
        dn = 0;
      } else {
        const determinant2 = value.auu * value.ann - value.aun * value.aun;
        if (!(determinant2 > 0) || !Number.isFinite(determinant2)) break;
        du = (value.ann * value.gu - value.aun * value.gn) / determinant2;
        dn = (value.auu * value.gn - value.aun * value.gu) / determinant2;
      }
      if (![du, dn].every(Number.isFinite)) break;
      let accepted = false;
      for (let step = 1; step >= 1 / 65536; step /= 2) {
        const nextU = clamp3(u + step * du, 1e-8, 100), nextN = clamp3(n + step * dn, 0, MAX_BRANCHING);
        const next = objective(data, rate, nextU, nextN, true);
        if (next.penalized >= value.penalized - 1e-10) {
          const difference = Math.abs(nextU - u) + Math.abs(nextN - n);
          u = nextU;
          n = nextN;
          value = next;
          accepted = true;
          if (difference < 1e-9) iteration = 60;
          break;
        }
      }
      if (!accepted) break;
    }
    const determinant = value.auu * value.ann - value.aun * value.aun;
    const covariance = determinant > 0 ? {
      varianceMu: rate * rate * value.ann / determinant,
      varianceAlpha: beta * beta * value.auu / determinant,
      covarianceMuAlpha: -rate * beta * value.aun / determinant
    } : null;
    return {
      parameters: { mu: rate * u, alpha: beta * n, beta, branchingRatio: n, decaySeconds },
      logLikelihood: value.ll,
      penalizedLogLikelihood: value.penalized,
      covariance,
      terminalExcitation: values.terminal,
      // Two continuous parameters, plus the fixed four-way decay comparison.
      selectionScore: -2 * value.ll + 2 * Math.log(raw.events) + 2 * Math.log(HAWKES_DECAY_SECONDS.length)
    };
  }
  function terminalEventAt(segment, target) {
    for (let i = segment.length - 1; i >= 0; i--) if (segment[i].coefficient >= target) return segment[i].timestamp;
    return null;
  }
  function terminalExcitationFor(segment, target, beta) {
    const end = segment.at(-1)?.timestamp;
    return segment.reduce((sum, row) => sum + (row.coefficient >= target ? Math.exp(-beta * (end - row.timestamp) / 1e3) : 0), 0);
  }
  function fitHawkes(input, { now = Date.now(), targets = HAWKES_TARGETS } = {}) {
    const rows = normalizeRounds(input, now).reverse(), partition = segmentsOf(rows), { segments } = partition;
    const gaps = [];
    for (const segment of segments) for (let i = 1; i < segment.length; i++) {
      const gap = (segment[i].timestamp - segment[i - 1].timestamp) / 1e3;
      if (gap > 0) gaps.push(gap);
    }
    const cadenceSeconds2 = median2(gaps), selectedTargets = [...new Set(Array.isArray(targets) ? targets.filter(validTarget) : [])];
    const finalSegment = segments.at(-1) || [], latest = finalSegment.at(-1);
    const usableRoundCount = rows.length - partition.excludedAmbiguousRows;
    const models = selectedTargets.map((target) => {
      const raw = targetSegments(segments, target), nullRate = raw.events / raw.exposure;
      const nullLogLikelihood = raw.events > 0 && raw.exposure > 0 ? raw.events * Math.log(nullRate) - raw.events : null;
      const base = {
        modelId: HAWKES_MODEL,
        family: "hawkes",
        target,
        eventCount: raw.events,
        exposureSeconds: raw.exposure,
        segmentCount: raw.segments.length,
        tiedEventCount: raw.tiedEvents,
        excludedAmbiguousRows: partition.excludedAmbiguousRows,
        excludedAmbiguousBlocks: partition.excludedAmbiguousBlocks,
        cadenceSeconds: cadenceSeconds2,
        nullLogLikelihood,
        lastEventAt: terminalEventAt(finalSegment, target),
        evidenceStatus: HAWKES_EVIDENCE,
        assumptions: [
          "conditional-empty-presegment-history",
          "known-boundary-events-seed-intensity",
          "all-equal-timestamp-round-groups-excluded-and-exposure-split",
          "ambiguity-exclusion-may-be-nonrandom",
          "observed-spacing-assumes-provider-coverage",
          "fixed-rate-and-exponential-kernel-within-training-period"
        ]
      };
      const reason2 = !timestamp5(now) ? "invalid-clock" : usableRoundCount < MIN_ROUNDS3 ? "insufficient-rounds" : raw.events < MIN_EVENTS2 ? "insufficient-events" : raw.exposure < 1800 ? "insufficient-exposure" : raw.tiedEvents ? "simultaneous-event-timestamps" : !(cadenceSeconds2 > 0) ? "no-positive-cadence" : null;
      if (reason2) return { ...base, status: "insufficient", reason: reason2, parameters: null, covariance: null };
      const candidates = HAWKES_DECAY_SECONDS.map((decay) => fitDecay(raw, decay)).filter(Boolean);
      const nullScore = -2 * nullLogLikelihood + Math.log(raw.events);
      const selected = candidates.sort((a, b) => a.selectionScore - b.selectionScore)[0];
      const useExcitation = selected && selected.selectionScore < nullScore && selected.parameters.branchingRatio > 1e-7;
      if (!useExcitation) return {
        ...base,
        status: "ready",
        reason: "poisson-null-selected",
        trainingSelection: "poisson-null",
        conditionalClustering: false,
        parameters: { mu: nullRate, alpha: 0, beta: 1 / 60, branchingRatio: 0, decaySeconds: 60 },
        covariance: null,
        logLikelihood: nullLogLikelihood,
        selectionScore: nullScore,
        terminalExcitation: 0,
        uncertainty: { kind: "gamma-jeffreys-null", shape: raw.events + 0.5, rateSeconds: raw.exposure }
      };
      const unstable = selected.parameters.branchingRatio >= MAX_BRANCHING - 1e-6 || !selected.covariance;
      return {
        ...base,
        ...selected,
        terminalExcitation: terminalExcitationFor(finalSegment, target, selected.parameters.beta),
        status: unstable ? "insufficient" : "ready",
        reason: unstable ? "near-critical-or-singular-fit" : "training-excitation-selected",
        trainingSelection: "exponential-hawkes",
        conditionalClustering: true,
        uncertainty: {
          kind: "laplace-conditional-on-selected-decay",
          includesModelSelectionUncertainty: false,
          description: "Approximate conditional parameter interval; decay-selection and model misspecification are excluded."
        }
      };
    });
    const result = {
      modelId: HAWKES_MODEL,
      family: "hawkes",
      evidenceStatus: HAWKES_EVIDENCE,
      trainedAt: timestamp5(now) ? now : null,
      trainingStart: rows[0]?.timestamp ?? null,
      trainingEnd: latest?.timestamp ?? null,
      trainingObservedEnd: rows.at(-1)?.timestamp ?? null,
      terminalBarrierAt: partition.lastAmbiguousAt > (latest?.timestamp ?? Infinity) ? partition.lastAmbiguousAt : null,
      roundCount: rows.length,
      usableRoundCount,
      cadenceSeconds: cadenceSeconds2,
      excludedAmbiguousRows: partition.excludedAmbiguousRows,
      excludedAmbiguousBlocks: partition.excludedAmbiguousBlocks,
      lastId: latest?.id ?? null,
      lastCoefficient: latest?.coefficient ?? null,
      models
    };
    result.identity = [result.modelId, result.trainedAt, result.trainingEnd, ...models.flatMap((model) => [model.target, model.parameters?.mu, model.parameters?.alpha, model.parameters?.beta])].join(":");
    return freeze2(result);
  }
  function validFit(fit) {
    return fit?.modelId === HAWKES_MODEL && fit.evidenceStatus === HAWKES_EVIDENCE && typeof fit.identity === "string" && timestamp5(fit.trainingEnd) && timestamp5(fit.trainedAt) && Array.isArray(fit.models);
  }
  function validState(state, fit) {
    return state?.fitIdentity === fit.identity && state.status === "ready" && timestamp5(state.lastAt) && Array.isArray(state.models) && state.models.every((model) => model && validTarget(model.target) && finite2(model.excitation) && model.excitation >= 0 && (model.beta === null || finite2(model.beta) && model.beta > 0));
  }
  function initialState(fit) {
    const barrier = fit.terminalBarrierAt !== null && fit.terminalBarrierAt !== void 0;
    return {
      modelId: HAWKES_MODEL,
      fitIdentity: fit.identity,
      status: "ready",
      reason: null,
      lastAt: barrier ? fit.terminalBarrierAt : fit.trainingEnd,
      lastId: barrier ? null : fit.lastId,
      lastCoefficient: barrier ? null : fit.lastCoefficient,
      awaitingUnambiguous: barrier,
      models: fit.models.map((model) => ({
        target: model.target,
        beta: model.parameters?.beta ?? null,
        excitation: barrier ? 0 : model.terminalExcitation ?? 0,
        lastEventAt: barrier ? null : model.lastEventAt,
        tied: false
      }))
    };
  }
  function ambiguityBarrier(state, at) {
    return {
      ...state,
      lastAt: at,
      lastId: null,
      lastCoefficient: null,
      awaitingUnambiguous: true,
      models: state.models.map((model) => ({ ...model, excitation: 0, lastEventAt: null, tied: false }))
    };
  }
  function advanceTrusted(fit, state, row) {
    if (row.timestamp < state.lastAt || row.id === state.lastId && (row.timestamp !== state.lastAt || row.coefficient !== state.lastCoefficient))
      return { ...state, status: "invalid", reason: "out-of-order-or-conflicting-state-row" };
    if (row.id === state.lastId) return state;
    const gap = row.timestamp - state.lastAt;
    if (gap === 0) return ambiguityBarrier(state, row.timestamp);
    return {
      ...state,
      lastAt: row.timestamp,
      lastId: row.id,
      lastCoefficient: row.coefficient,
      awaitingUnambiguous: false,
      models: state.models.map((model) => {
        const reset = gap > GAP_MS || state.awaitingUnambiguous, hit = row.coefficient >= model.target;
        const old = reset ? 0 : model.excitation * Math.exp(-(model.beta ?? 0) * gap / 1e3);
        const lastEventAt = reset ? null : model.lastEventAt;
        return {
          ...model,
          excitation: old + Number(hit),
          lastEventAt: hit ? row.timestamp : lastEventAt,
          tied: !reset && (model.tied || hit && lastEventAt === row.timestamp)
        };
      })
    };
  }
  function prepareHawkesPredictionState(fit, recentRows = [], { now = Date.now() } = {}) {
    if (!validFit(fit) || !timestamp5(now) || fit.trainedAt > now || fit.trainingEnd > now)
      return freeze2({ modelId: HAWKES_MODEL, status: "invalid", reason: "invalid-or-future-fit" });
    let state = initialState(fit);
    const rows = normalizeRounds(recentRows, now).reverse();
    for (let i = 0; i < rows.length; ) {
      let end = i + 1;
      while (end < rows.length && rows[end].timestamp === rows[i].timestamp) end++;
      const row = rows[i];
      if (row.timestamp >= fit.trainingEnd) {
        if (end - i > 1 && row.timestamp >= state.lastAt) state = ambiguityBarrier(state, row.timestamp);
        else if (row.timestamp > state.lastAt || row.timestamp === state.lastAt && row.id !== state.lastId)
          state = advanceTrusted(fit, state, row);
        if (state.status !== "ready") break;
      }
      i = end;
    }
    return freeze2(state);
  }
  function advanceHawkesPredictionState(fit, state, row, { now = Date.now() } = {}) {
    if (!validFit(fit) || !validState(state, fit) || !timestamp5(now) || fit.trainedAt > now || !row || typeof row.id !== "string" || !row.id.trim() || !finite2(row.coefficient) || row.coefficient < 1 || !timestamp5(row.timestamp) || row.timestamp > now || row.completed === false || row.estimated === true)
      return freeze2({ ...state, status: "invalid", reason: "invalid-stream-row-or-fit" });
    return freeze2(advanceTrusted(fit, state, row));
  }
  function prediction(fit, state, { now, target, horizon, seconds }) {
    const model = Array.isArray(fit?.models) ? fit.models.find((value) => value?.target === target) : null;
    const base = {
      modelId: HAWKES_MODEL,
      family: "hawkes",
      target,
      horizon,
      horizonUnit: seconds === null ? "rounds-via-cadence-approximation" : "seconds",
      evidenceStatus: HAWKES_EVIDENCE,
      status: "insufficient",
      probability: null,
      interval95: null,
      assumptions: ["continuous-time-events", "future-round-count-mapped-using-training-median-cadence"]
    };
    const reason2 = !validFit(fit) || !timestamp5(now) || fit.trainedAt > now || fit.trainingEnd > now ? "invalid-or-future-fit" : !model ? "unknown-target" : model.status !== "ready" ? model.reason : !validState(state, fit) ? state?.reason || "invalid-prediction-state" : state.lastAt > now ? "future-state" : now - state.lastAt > GAP_MS ? "stale-state" : state.awaitingUnambiguous ? "latest-timestamp-ambiguous" : seconds === null && ![1, 3, 5].includes(horizon) ? "unsupported-round-horizon" : seconds !== null && (!finite2(seconds) || seconds <= 0 || seconds > 86400) ? "unsupported-seconds-horizon" : null;
    if (reason2) return { ...base, reason: reason2 };
    const active = state.models.find((value) => value.target === target);
    if (!active || active.tied || !finite2(active.excitation) || active.excitation < 0)
      return { ...base, reason: active?.tied ? "simultaneous-event-timestamps" : "invalid-excitation-state" };
    const p = model.parameters;
    if (![p?.mu, p?.alpha, p?.beta, p?.branchingRatio].every(finite2) || p.mu <= 0 || p.alpha < 0 || p.beta <= 0 || p.branchingRatio < 0 || p.branchingRatio >= 1 || Math.abs(p.alpha / p.beta - p.branchingRatio) > 1e-8)
      return { ...base, reason: "invalid-fitted-parameters" };
    const exposure = seconds === null ? model.cadenceSeconds * horizon : seconds;
    const excitation = active.excitation * Math.exp(-p.beta * (now - state.lastAt) / 1e3);
    const integratedExcitation = excitation * -Math.expm1(-p.beta * exposure) / p.beta;
    let estimate, bounds;
    if (p.alpha === 0) {
      const shape = model.uncertainty?.shape, rate = model.uncertainty?.rateSeconds;
      if (!(shape > 0) || !(rate > 0)) return { ...base, reason: "invalid-null-posterior" };
      estimate = -Math.expm1(-shape * Math.log1p(exposure / rate));
      bounds = [0.025, 0.975].map((q) => probability(inverseGammaCDF(q, shape) * exposure / rate));
    } else {
      const covariance = model.covariance, integrated = p.mu * exposure + p.alpha * integratedExcitation;
      const variance = covariance && exposure ** 2 * covariance.varianceMu + integratedExcitation ** 2 * covariance?.varianceAlpha + 2 * exposure * integratedExcitation * covariance?.covarianceMuAlpha;
      if (!finite2(variance) || variance < -1e-10) return { ...base, reason: "invalid-conditional-uncertainty" };
      const error = 1.959963984540054 * Math.sqrt(Math.max(0, variance));
      estimate = probability(integrated);
      bounds = [probability(integrated - error), probability(integrated + error)];
    }
    if (![estimate, ...bounds].every(finite2)) return { ...base, reason: "numerical-failure" };
    return {
      ...base,
      status: "ready",
      reason: model.reason,
      probability: estimate,
      interval95: bounds,
      trainingSelection: model.trainingSelection,
      conditionalClustering: model.conditionalClustering,
      horizonSeconds: exposure,
      cadenceSeconds: model.cadenceSeconds,
      conditionalIntensityPerSecond: p.mu + p.alpha * excitation,
      uncertaintyKind: model.uncertainty.kind,
      includesModelSelectionUncertainty: false,
      actualRoundTimingKnown: false,
      interpretation: "Conditional probability of at least one event in a time exposure; exact next-round timing is unknown."
    };
  }
  function predictHawkes(fit, recentRows = [], { now = Date.now(), target = 100, horizon = 1, state = null } = {}) {
    return prediction(fit, state ?? prepareHawkesPredictionState(fit, recentRows, { now }), { now, target, horizon, seconds: null });
  }

  // src/statistics/validation.mjs
  var GAP_MS2 = 18e4;
  var VALIDATION_PROTOCOL = "daily-development-then-frozen-confirmation-v1";
  var finite3 = (value) => typeof value === "number" && Number.isFinite(value);
  var probability2 = (value) => finite3(value) && value >= 0 && value <= 1;
  var mean2 = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  var clipped = (value) => Math.max(1e-12, Math.min(1 - 1e-12, value));
  var dayFormatters = /* @__PURE__ */ new Map();
  var forecastKey = (value) => `${value.modelId}:${value.target}:${value.horizon}`;
  function localDay(timestamp7, timeZone = "Europe/Kyiv") {
    if (!dayFormatters.has(timeZone)) dayFormatters.set(timeZone, new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }));
    const parts = dayFormatters.get(timeZone).formatToParts(timestamp7);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }
  function chronologicalFolds(rows, {
    now = Date.now(),
    timeZone = "Europe/Kyiv",
    minTrainDays = 14,
    minTrainRounds = 2e3,
    confirmationDays = 14,
    minDevelopmentDays = 5
  } = {}) {
    const today = localDay(now, timeZone), groups = /* @__PURE__ */ new Map();
    for (let index = 0; index < rows.length; index++) {
      const day = localDay(rows[index].timestamp, timeZone);
      if (day >= today) continue;
      let group = groups.get(day);
      if (!group) {
        group = { day, from: index, to: index + 1, count: 0 };
        groups.set(day, group);
      }
      group.to = index + 1;
      group.count++;
    }
    const days = [...groups.values()].sort((a, b) => a.day.localeCompare(b.day));
    const eligible = days.filter((day, index) => index >= minTrainDays && day.from >= minTrainRounds && day.count >= 30);
    const count3 = eligible.length >= confirmationDays + minDevelopmentDays ? confirmationDays : Math.min(7, eligible.length);
    const split = eligible.length - count3;
    const folds = eligible.map((day, index) => ({
      ...day,
      stage: index < split ? "development" : "confirmation",
      trainingDays: days.filter((prior) => prior.day < day.day).length,
      trainingCutoff: rows[day.from - 1]?.timestamp ?? null
    }));
    return {
      protocol: VALIDATION_PROTOCOL,
      timeZone,
      today,
      minTrainDays,
      minTrainRounds,
      requestedConfirmationDays: confirmationDays,
      confirmationDays: count3,
      minDevelopmentDays,
      qualificationPossible: count3 >= confirmationDays && split >= minDevelopmentDays,
      availableCompleteDays: days.length,
      developmentDays: split,
      folds
    };
  }
  function futureRoundOutcome(rows, index, horizon, target) {
    if (![1, 3, 5].includes(horizon) || !Number.isInteger(index) || index < 0 || index >= rows.length)
      return { status: "unknown", reason: "invalid-request" };
    if (index + horizon >= rows.length) return { status: "unknown", reason: "right-edge-or-next-day" };
    if (rows[index - 1]?.timestamp === rows[index].timestamp || rows[index + 1]?.timestamp === rows[index].timestamp)
      return { status: "unknown", reason: "ambiguous-origin-time" };
    let hit = false, maximum = 1;
    for (let step = 1; step <= horizon; step++) {
      const previous = rows[index + step - 1], row = rows[index + step];
      if (rows[index + step - 1]?.timestamp === row.timestamp || rows[index + step + 1]?.timestamp === row.timestamp)
        return { status: "unknown", reason: "ambiguous-target-time" };
      const gap = row.timestamp - previous.timestamp;
      if (gap <= 0 || gap > GAP_MS2) return { status: "unknown", reason: gap <= 0 ? "unknown-round-order" : "coverage-gap" };
      hit ||= row.coefficient >= target;
      maximum = Math.max(maximum, row.coefficient);
    }
    return { status: "known", hit, maximum, firstAt: rows[index + 1].timestamp, endAt: rows[index + horizon].timestamp };
  }
  function createValidationAccumulator() {
    return /* @__PURE__ */ new Map();
  }
  function recordObservation(accumulator, forecast, { day, baseline, outcome }) {
    const key = forecastKey(forecast);
    let record4 = accumulator.get(key);
    if (!record4) {
      record4 = {
        key,
        modelId: forecast.modelId,
        family: forecast.family || forecast.modelId,
        target: forecast.target,
        horizon: forecast.horizon,
        issued: 0,
        unavailable: 0,
        unknown: 0,
        unknownReasons: {},
        days: /* @__PURE__ */ new Map()
      };
      accumulator.set(key, record4);
    }
    record4.issued++;
    if (forecast.status !== "ready" || !probability2(forecast.probability) || !probability2(baseline)) {
      record4.unavailable++;
      return;
    }
    if (outcome.status !== "known") {
      record4.unknown++;
      record4.unknownReasons[outcome.reason] = (record4.unknownReasons[outcome.reason] || 0) + 1;
      return;
    }
    let daily = record4.days.get(day);
    if (!daily) {
      daily = {
        day,
        n: 0,
        hits: 0,
        brier: 0,
        baselineBrier: 0,
        logLoss: 0,
        baselineLogLoss: 0,
        probability: 0,
        baselineProbability: 0,
        randomGuessExpectedBrier: 0
      };
      record4.days.set(day, daily);
    }
    const y = Number(outcome.hit), p = forecast.probability, q = baseline;
    daily.n++;
    daily.hits += y;
    daily.brier += (p - y) ** 2;
    daily.baselineBrier += (q - y) ** 2;
    daily.logLoss += -y * Math.log(clipped(p)) - (1 - y) * Math.log1p(-clipped(p));
    daily.baselineLogLoss += -y * Math.log(clipped(q)) - (1 - y) * Math.log1p(-clipped(q));
    daily.probability += p;
    daily.baselineProbability += q;
    daily.randomGuessExpectedBrier += y ? 1 - q : q;
  }
  function signFlipP(values) {
    if (!values.length) return 1;
    const observed = values.reduce((sum, value) => sum + value, 0);
    if (!(observed > 0)) return 1;
    const size = values.length <= 16 ? 2 ** values.length : 32768;
    let extreme = 0, seed = 87748946;
    for (let sample = 0; sample < size; sample++) {
      let total = 0;
      for (let j = 0; j < values.length; j++) {
        let positive;
        if (values.length <= 16) positive = !!(sample & 1 << j);
        else {
          seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
          positive = !!(seed & 2147483648);
        }
        total += positive ? values[j] : -values[j];
      }
      if (total >= observed - 1e-14) extreme++;
    }
    return values.length <= 16 ? extreme / size : (extreme + 1) / (size + 1);
  }
  function holmCorrection(values) {
    const sorted = values.map((p, index) => ({ p: probability2(p) ? p : 1, index })).sort((a, b) => a.p - b.p || a.index - b.index);
    const corrected = Array(values.length).fill(1);
    let previous = 0;
    sorted.forEach((value, order) => {
      previous = Math.max(previous, Math.min(1, value.p * (sorted.length - order)));
      corrected[value.index] = previous;
    });
    return corrected;
  }
  function dayBootstrap(days, field, alpha, samples) {
    if (!days.length) return null;
    const draws = [];
    let seed = field === "brier" ? 121743897 : 20107128;
    for (let sample = 0; sample < samples; sample++) {
      let sum = 0, n = 0;
      for (let index = 0; index < days.length; index++) {
        seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
        const day = days[Math.floor(seed / 2 ** 32 * days.length)];
        sum += day[field === "brier" ? "baselineBrier" : "baselineLogLoss"] - day[field === "brier" ? "brier" : "logLoss"];
        n += day.n;
      }
      draws.push(sum / n);
    }
    draws.sort((a, b) => a - b);
    return [draws[Math.max(0, Math.floor(samples * alpha / 2))], draws[Math.min(samples - 1, Math.ceil(samples * (1 - alpha / 2)) - 1)]];
  }
  function summarizeValidation(accumulator, {
    minDays = 5,
    minKnown = 200,
    minEvents = 20,
    alpha = 0.05,
    bootstrapSamples = 8192,
    allowQualification = true
  } = {}) {
    const records = [...accumulator.values()];
    const familySize = Math.max(1, records.length), summaries = records.map((record4) => {
      const days = [...record4.days.values()].sort((a, b) => a.day.localeCompare(b.day));
      const sum = (key) => days.reduce((total, day) => total + day[key], 0);
      const n = sum("n"), hits = sum("hits");
      const losses = days.map((day) => day.baselineBrier - day.brier);
      const brierGain = n ? (sum("baselineBrier") - sum("brier")) / n : null;
      const logLossGain = n ? (sum("baselineLogLoss") - sum("logLoss")) / n : null;
      const enough = days.length >= minDays && n >= minKnown && hits >= minEvents && n - hits >= minEvents;
      const brierGainInterval95 = enough ? dayBootstrap(days, "brier", 0.05, bootstrapSamples) : null;
      const logLossGainInterval95 = enough ? dayBootstrap(days, "log", 0.05, bootstrapSamples) : null;
      const brierGainSimultaneousInterval = enough ? dayBootstrap(days, "brier", alpha / (2 * familySize), bootstrapSamples) : null;
      const logLossGainSimultaneousInterval = enough ? dayBootstrap(days, "log", alpha / (2 * familySize), bootstrapSamples) : null;
      return {
        key: record4.key,
        modelId: record4.modelId,
        family: record4.family,
        target: record4.target,
        horizon: record4.horizon,
        issued: record4.issued,
        known: n,
        unknown: record4.unknown,
        unavailable: record4.unavailable,
        unknownReasons: { ...record4.unknownReasons },
        hitCount: hits,
        hitFrequency: n ? hits / n : null,
        dayCount: days.length,
        days,
        brier: n ? sum("brier") / n : null,
        baselineBrier: n ? sum("baselineBrier") / n : null,
        logLoss: n ? sum("logLoss") / n : null,
        baselineLogLoss: n ? sum("baselineLogLoss") / n : null,
        meanProbability: n ? sum("probability") / n : null,
        meanBaselineProbability: n ? sum("baselineProbability") / n : null,
        frequencyMatchedRandomGuessExpectedBrier: n ? sum("randomGuessExpectedBrier") / n : null,
        brierGain,
        logLossGain,
        brierGainInterval95,
        logLossGainInterval95,
        brierGainSimultaneousInterval,
        logLossGainSimultaneousInterval,
        rawP: enough ? signFlipP(losses) : 1,
        sufficient: enough,
        uncertainty: "approximate paired whole-day bootstrap; conditional on these observed dates",
        pValueMethod: "one-sided paired day-block sign-flip; symmetry assumption"
      };
    });
    const corrected = holmCorrection(summaries.map((value) => value.rawP));
    return summaries.map((value, index) => {
      const qualified = allowQualification && value.sufficient && corrected[index] < alpha && value.brierGainSimultaneousInterval?.[0] > 0 && value.logLossGainSimultaneousInterval?.[0] > 0;
      return {
        ...value,
        adjustedP: corrected[index],
        multipleTesting: {
          method: "Holm",
          hypotheses: summaries.length,
          alpha,
          simultaneousIntervalMetrics: 2
        },
        qualified,
        reason: qualified ? "supported-out-of-sample-loss-improvement" : !allowQualification ? "insufficient-separate-validation-days" : !value.sufficient ? "insufficient-validation-support" : "no-corrected-out-of-sample-advantage"
      };
    });
  }
  function freezeFamilySelection(development) {
    const selected = /* @__PURE__ */ new Map();
    for (const model of development.filter((value) => value.sufficient && value.brierGain > 0 && value.logLossGain > 0)) {
      const key = `${model.target}:${model.horizon}:${model.family}`;
      const previous = selected.get(key);
      if (!previous || model.brierGain > previous.brierGain || model.brierGain === previous.brierGain && model.modelId < previous.modelId) selected.set(key, model);
    }
    return [...selected.values()].map(({ key, modelId, family, target, horizon }) => ({ key, modelId, family, target, horizon }));
  }
  function fixedConsensus(forecasts, members, baselineInterval, { target, horizon }) {
    const selected = members.filter((member) => member.target === target && member.horizon === horizon);
    const byFamily = /* @__PURE__ */ new Map();
    for (const member of selected) {
      const forecast = forecasts.find((value) => value.modelId === member.modelId && value.target === target && value.horizon === horizon);
      if (forecast?.status === "ready" && probability2(forecast.probability) && Array.isArray(forecast.interval95) && forecast.interval95.length === 2 && forecast.interval95.every(probability2) && probability2(baselineInterval?.[1]) && forecast.interval95[0] > baselineInterval[1]) byFamily.set(member.family, forecast);
    }
    const support = [...byFamily.values()];
    return {
      modelId: "fixed-family-consensus-v1",
      family: "consensus",
      target,
      horizon,
      status: support.length >= 2 ? "ready" : "insufficient",
      probability: support.length >= 2 ? mean2(support.map((value) => value.probability)) : null,
      interval95: support.length >= 2 ? [Math.min(...support.map((value) => value.interval95[0])), Math.max(...support.map((value) => value.interval95[1]))] : null,
      agreeingFamilies: [...byFamily.keys()],
      members: support.map((value) => value.modelId),
      intervalKind: "envelope-of-member-conditional-intervals-not-calibrated-ensemble-interval",
      reason: support.length >= 2 ? "frozen-distinct-family-agreement" : "fewer-than-two-distinct-supported-families"
    };
  }

  // src/statistics/time-zones.mjs
  var DAY2 = 86400;
  var CENTER_STEP_SECONDS = 60;
  var TIME_ZONE_PROTOCOL = "fixed-clock-development-frozen-confirmation-v1";
  var DEFAULTS = Object.freeze({
    minDays: 14,
    minKnown: 200,
    minEvents: 20,
    minEventDays: 5,
    minDevelopmentKnown: 200,
    minDevelopmentEvents: 20,
    minDevelopmentDays: 5,
    minDevelopmentEventDays: 5,
    minPositiveDayFraction: 0.7,
    bootstrapSamples: 8192
  });
  var defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));
  var posterior = (hits, n) => (hits + 0.5) / (n + 1);
  var circularClockDistance = (a, b) => {
    const distance = Math.abs(((a - b) % DAY2 + DAY2) % DAY2);
    return Math.min(distance, DAY2 - distance);
  };
  var contains = (zone, second) => circularClockDistance(zone.centerSecond, second) <= zone.radiusSeconds;
  var counters = () => ({ rounds: 0, hits: 0, exposures: 0, unknown: 0 });
  var add = (count3, observation, target) => {
    count3.exposures++;
    if (observation.status !== "known") {
      count3.unknown++;
      return;
    }
    count3.rounds++;
    count3.hits += Number(observation.coefficient >= target);
  };
  function interval95(hits, n) {
    if (!n) return null;
    const z = 1.959963984540054, z2 = z * z, p = hits / n, denominator = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denominator;
    const half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denominator;
    return [Math.max(0, center - half), Math.min(1, center + half)];
  }
  function countPair(zone, observations) {
    const inside = counters(), outside = counters();
    for (const observation of observations) add(contains(zone, observation.second) ? inside : outside, observation, zone.target);
    return { inside, outside };
  }
  function mergeCount(to, from) {
    for (const key of ["rounds", "hits", "exposures", "unknown"]) to[key] += from[key];
  }
  var zoneId = (center, radius) => `clock-zone-${center}-${radius}-v1`;
  async function validateTimeZones(input, {
    protocol = null,
    now = Date.now(),
    timeZone = "Europe/Kyiv",
    targets = TIME_TARGETS,
    alpha = 0.05 / 3,
    yieldTask = defaultYield,
    onProgress = () => {
    },
    validationOptions = {},
    bootstrapSamples = validationOptions.bootstrapSamples ?? DEFAULTS.bootstrapSamples
  } = {}) {
    const thresholds = { ...DEFAULTS, ...validationOptions, bootstrapSamples };
    const requestedTargets = [...new Set(targets)].filter((target) => TIME_TARGETS.includes(target));
    const rows = (Array.isArray(input) ? input : []).filter((row) => Number.isSafeInteger(row?.timestamp) && row.timestamp >= 9466848e5 && row.timestamp <= now && Number.isFinite(row.coefficient) && row.coefficient >= 1).slice().sort((a, b) => a.timestamp - b.timestamp);
    const suppliedProtocol = protocol || chronologicalFolds(rows, { now, timeZone });
    const today = localDay(now, timeZone), dayGroups = /* @__PURE__ */ new Map();
    for (let index = 0; index < rows.length; index++) {
      const clock3 = localClock(rows[index].timestamp, timeZone);
      if (!clock3 || clock3.date >= today) continue;
      const outcome = futureRoundOutcome(rows, index, 1, 10);
      const crossesDay = outcome.status === "known" && localDay(outcome.endAt, timeZone) !== clock3.date;
      const observation = {
        timestamp: rows[index].timestamp,
        second: clock3.second,
        status: crossesDay ? "unknown" : outcome.status,
        reason: crossesDay ? "right-edge-or-next-day" : outcome.reason,
        coefficient: outcome.status === "known" && !crossesDay ? rows[index + 1].coefficient : null
      };
      if (!dayGroups.has(clock3.date)) dayGroups.set(clock3.date, []);
      dayGroups.get(clock3.date).push(observation);
      if (index % 4096 === 4095) await yieldTask();
    }
    const folds = suppliedProtocol.folds.filter((fold) => fold.day < today && dayGroups.has(fold.day));
    const developmentDays = new Set(folds.filter((fold) => fold.stage === "development").map((fold) => fold.day));
    const confirmationDays = new Set(folds.filter((fold) => fold.stage === "confirmation").map((fold) => fold.day));
    if ([...developmentDays].some((day) => confirmationDays.has(day)) || developmentDays.size && confirmationDays.size && [...developmentDays].sort().at(-1) >= [...confirmationDays].sort()[0])
      throw new RangeError("Time-zone protocol requires disjoint chronological development and confirmation dates");
    const developmentTotals = new Map(requestedTargets.map((target) => [target, counters()]));
    const grid = /* @__PURE__ */ new Map();
    for (const day of developmentDays) {
      for (const observation of dayGroups.get(day)) {
        for (const target of requestedTargets) add(developmentTotals.get(target), observation, target);
        for (const radius of TIME_RADII) {
          for (let gridIndex = Math.ceil((observation.second - radius) / CENTER_STEP_SECONDS); gridIndex <= Math.floor((observation.second + radius) / CENTER_STEP_SECONDS); gridIndex++) {
            const center = (gridIndex * CENTER_STEP_SECONDS % DAY2 + DAY2) % DAY2;
            for (const target of requestedTargets) {
              const key = `${target}:${radius}:${center}`;
              if (!grid.has(key)) grid.set(key, {
                target,
                centerSecond: center,
                radiusSeconds: radius,
                inside: counters(),
                days: /* @__PURE__ */ new Set(),
                eventDays: /* @__PURE__ */ new Set()
              });
              const value = grid.get(key);
              add(value.inside, observation, target);
              if (observation.status === "known") {
                value.days.add(day);
                if (observation.coefficient >= target) value.eventDays.add(day);
              }
            }
          }
        }
      }
      onProgress({ stage: "time-zone-development", day });
      await yieldTask();
    }
    const frozen = [];
    for (const target of requestedTargets) for (const radius of TIME_RADII) {
      const ranked = [...grid.values()].filter((zone) => zone.target === target && zone.radiusSeconds === radius).map((zone) => {
        const total = developmentTotals.get(target), outsideRounds = total.rounds - zone.inside.rounds;
        const outsideHits = total.hits - zone.inside.hits;
        return {
          ...zone,
          outsideRounds,
          outsideHits,
          lift: posterior(zone.inside.hits, zone.inside.rounds) - posterior(outsideHits, outsideRounds)
        };
      }).filter((zone) => zone.lift > 0 && zone.inside.rounds >= thresholds.minDevelopmentKnown && zone.inside.hits >= thresholds.minDevelopmentEvents && zone.outsideRounds >= thresholds.minDevelopmentKnown && zone.days.size >= thresholds.minDevelopmentDays && zone.eventDays.size >= thresholds.minDevelopmentEventDays).sort((a, b) => b.lift - a.lift || a.centerSecond - b.centerSecond);
      const selected = [];
      for (const zone of ranked) {
        if (selected.some((other) => circularClockDistance(zone.centerSecond, other.centerSecond) <= 2 * radius)) continue;
        selected.push(zone);
        if (selected.length === 3) break;
      }
      for (const zone of selected) {
        const modelId = zoneId(zone.centerSecond, zone.radiusSeconds);
        frozen.push({
          target,
          centerSecond: zone.centerSecond,
          radiusSeconds: radius,
          timeZone,
          modelId,
          validationKey: forecastKey({ modelId, target, horizon: 1 }),
          development: {
            insideRounds: zone.inside.rounds,
            insideHits: zone.inside.hits,
            outsideRounds: zone.outsideRounds,
            outsideHits: zone.outsideHits,
            dayCount: zone.days.size,
            eventDays: zone.eventDays.size,
            smoothedLift: zone.lift
          }
        });
      }
    }
    const accumulator = createValidationAccumulator();
    const state = frozen.map((zone) => ({
      zone,
      trainingInside: counters(),
      trainingOutside: counters(),
      inside: counters(),
      outside: counters(),
      days: [],
      dailyForecasts: [],
      eventDays: 0,
      insideDays: 0
    }));
    const positiveProtocol = suppliedProtocol.qualificationPossible === true && developmentDays.size >= thresholds.minDevelopmentDays && confirmationDays.size >= thresholds.minDays;
    for (const [day, observations] of [...dayGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const confirmation = confirmationDays.has(day);
      for (const value of state) {
        const { zone, trainingInside, trainingOutside } = value;
        const pair = countPair(zone, observations);
        if (confirmation) {
          const globalRounds = trainingInside.rounds + trainingOutside.rounds;
          const globalHits = trainingInside.hits + trainingOutside.hits;
          const baseline = posterior(globalHits, globalRounds);
          const insideProbability = posterior(trainingInside.hits, trainingInside.rounds);
          const outsideProbability = posterior(trainingOutside.hits, trainingOutside.rounds);
          const trainingDays = [...dayGroups.keys()].filter((prior) => prior < day).length;
          const ready = trainingDays >= (suppliedProtocol.minTrainDays ?? 14) && globalRounds >= (suppliedProtocol.minTrainRounds ?? 2e3);
          value.dailyForecasts.push({
            day,
            probability: insideProbability,
            outsideProbability,
            baseline,
            trainingInsideRounds: trainingInside.rounds,
            trainingInsideHits: trainingInside.hits,
            trainingOutsideRounds: trainingOutside.rounds,
            trainingOutsideHits: trainingOutside.hits,
            trainingDays,
            trainingCutoff: dayGroups.get([...dayGroups.keys()].filter((prior) => prior < day).at(-1))?.at(-1)?.timestamp ?? null
          });
          for (const observation of observations) {
            const inside = contains(zone, observation.second);
            recordObservation(
              accumulator,
              {
                ...zone,
                family: "time-zone",
                horizon: 1,
                probability: inside ? insideProbability : baseline,
                status: ready ? "ready" : "insufficient"
              },
              { day, baseline, outcome: observation.status === "known" ? { status: "known", hit: observation.coefficient >= zone.target } : { status: "unknown", reason: observation.reason } }
            );
          }
          mergeCount(value.inside, pair.inside);
          mergeCount(value.outside, pair.outside);
          value.insideDays += Number(pair.inside.rounds > 0);
          value.eventDays += Number(pair.inside.hits > 0);
          value.days.push({
            day,
            insideRounds: pair.inside.rounds,
            insideHits: pair.inside.hits,
            insideExposures: pair.inside.exposures,
            insideUnknown: pair.inside.unknown,
            outsideRounds: pair.outside.rounds,
            outsideHits: pair.outside.hits,
            outsideExposures: pair.outside.exposures,
            outsideUnknown: pair.outside.unknown
          });
        }
        mergeCount(trainingInside, pair.inside);
        mergeCount(trainingOutside, pair.outside);
      }
      if (confirmation) onProgress({ stage: "time-zone-confirmation", day, candidates: frozen.length });
      await yieldTask();
    }
    const reports = summarizeValidation(accumulator, {
      minDays: thresholds.minDays,
      minKnown: thresholds.minKnown,
      minEvents: thresholds.minEvents,
      alpha,
      bootstrapSamples,
      allowQualification: positiveProtocol
    });
    const byKey = new Map(reports.map((report) => [report.key, report]));
    const candidates = state.map((value) => {
      const report = byKey.get(value.zone.validationKey);
      const insideInterval95 = interval95(value.inside.hits, value.inside.rounds);
      const outsideInterval95 = interval95(value.outside.hits, value.outside.rounds);
      const enough = value.inside.rounds >= thresholds.minKnown && value.inside.hits >= thresholds.minEvents && value.inside.rounds - value.inside.hits >= thresholds.minEvents && value.insideDays >= thresholds.minDays && value.eventDays >= thresholds.minEventDays && value.outside.rounds >= thresholds.minKnown;
      const separated = insideInterval95?.[0] > outsideInterval95?.[1];
      const positiveDays = report?.days.filter((day) => day.baselineBrier - day.brier > 0 && day.baselineLogLoss - day.logLoss > 0).length || 0;
      const stable = positiveDays >= Math.ceil(confirmationDays.size * thresholds.minPositiveDayFraction);
      const qualified = !!(positiveProtocol && enough && separated && stable && report?.qualified);
      return {
        ...value.zone,
        horizon: 1,
        insideRounds: value.inside.rounds,
        insideHits: value.inside.hits,
        outsideRounds: value.outside.rounds,
        outsideHits: value.outside.hits,
        insideExposures: value.inside.exposures,
        outsideExposures: value.outside.exposures,
        insideUnknown: value.inside.unknown,
        outsideUnknown: value.outside.unknown,
        confirmationDays: confirmationDays.size,
        insideDays: value.insideDays,
        eventDays: value.eventDays,
        insideInterval95,
        outsideInterval95,
        positiveGainDays: positiveDays,
        dailyForecasts: value.dailyForecasts,
        dailyExposure: value.days,
        validation: report || null,
        qualified,
        reason: qualified ? "supported-frozen-heldout-clock-zone" : !positiveProtocol ? "insufficient-separate-validation-days" : !enough ? "insufficient-confirmation-zone-support" : !separated ? "heldout-event-intervals-overlap" : !stable ? "unstable-heldout-day-gains" : report?.reason || "no-confirmation-observations"
      };
    });
    return {
      modelId: TIME_ZONE_PROTOCOL,
      protocol: {
        ...suppliedProtocol,
        timeZone,
        centerGridSeconds: CENTER_STEP_SECONDS,
        radiusSeconds: [...TIME_RADII]
      },
      timeZone,
      generatedAt: now,
      targets: requestedTargets,
      candidates,
      qualifiedZones: candidates.filter((zone) => zone.qualified),
      frozenCandidates: frozen.map((zone) => ({ ...zone, development: { ...zone.development } })),
      thresholds,
      grid: {
        centerStepSeconds: CENTER_STEP_SECONDS,
        radiusSeconds: [...TIME_RADII],
        centersPerTargetRadius: 3,
        nonOverlapping: true,
        maxCandidates: requestedTargets.length * TIME_RADII.length * 3
      },
      multipleTesting: { method: "Holm within frozen candidates; Bonferroni suite-family allocation", hypotheses: frozen.length, alpha },
      selectionRule: "DEV positive Jeffreys-smoothed inside-minus-outside frequency lift; at most three nonoverlapping centers per target/radius; no CONF selection",
      decisionTime: "previous completed round timestamp; next-one-round outcome; cross-day, gap and tied pairs unknown",
      lossDenominator: "all known decision origins per heldout day; outside-zone predictions equal training-global baseline",
      intervalMethod: "descriptive Wilson 95% binomial event intervals; whole-day paired bootstrap/sign-flip loss validation",
      limitations: [
        "Clock association is not a payout or profitability guarantee.",
        "Binomial event intervals do not model dependence between rounds; day-block loss inference is approximate.",
        "Timestamp replay assumes the completed round was available immediately."
      ]
    };
  }
  function currentQualifiedZones(ledger, now = Date.now()) {
    if (!ledger || !Number.isSafeInteger(now)) return [];
    const zones = Array.isArray(ledger.qualifiedZones) ? ledger.qualifiedZones : ledger.candidates || [];
    return zones.filter((zone) => zone.qualified === true && Number.isFinite(zone.centerSecond) && Number.isFinite(zone.radiusSeconds) && zone.radiusSeconds >= 0 && zone.radiusSeconds <= 120 && (() => {
      const clock3 = localClock(now, zone.timeZone || ledger.timeZone || "Europe/Kyiv");
      return clock3 !== null && contains(zone, clock3.second);
    })());
  }

  // src/statistics/suite.mjs
  var SUITE_MODEL = "independent-statistical-suite-v1";
  var SUITE_TARGETS = Object.freeze([10, 15, 20, 50, 100]);
  var SUITE_HORIZONS = Object.freeze([1, 3, 5]);
  var EVIDENCE = "experimental-unvalidated";
  var defaultYield2 = () => new Promise((resolve) => setTimeout(resolve, 0));
  function betaSummary(hits, total) {
    const alpha = hits + 0.5, beta = total - hits + 0.5;
    return {
      hits,
      total,
      alpha,
      beta,
      probability: alpha / (alpha + beta),
      interval95: [0.025, 0.975].map((q) => inverseBetaCDF(q, alpha, beta))
    };
  }
  function probabilityHorizon(probability4, horizon) {
    return -Math.expm1(horizon * Math.log1p(-probability4));
  }
  function baselineFor(fits, target, horizon) {
    const record4 = fits.baselines.find((value) => value.target === target);
    if (!record4?.total) return { probability: null, interval95: null };
    return {
      probability: probabilityHorizon(record4.hits / record4.total, horizon),
      interval95: record4.interval95.map((value) => probabilityHorizon(value, horizon))
    };
  }
  function initialSequenceState(targets) {
    return { lastAt: null, lastId: null, history: [], ages: Object.fromEntries(targets.map((target) => [target, null])) };
  }
  function tiedTimes(rows) {
    const times = /* @__PURE__ */ new Set();
    for (let index = 1; index < rows.length; index++) if (rows[index].timestamp === rows[index - 1].timestamp) times.add(rows[index].timestamp);
    return times;
  }
  function advanceSequence(state, row, targets, ambiguous = false) {
    if (ambiguous) {
      state.history = [];
      for (const target of targets) state.ages[target] = null;
      state.lastAt = row.timestamp;
      state.lastId = row.id;
      return;
    }
    if (state.lastAt !== null && row.timestamp <= state.lastAt) {
      state.history = [];
      for (const target of targets) state.ages[target] = null;
      state.lastAt = row.timestamp;
      state.lastId = row.id;
      return;
    }
    if (state.lastAt !== null && (row.timestamp - state.lastAt > GAP_MS2 || row.timestamp <= state.lastAt)) {
      state.history = [];
      for (const target of targets) state.ages[target] = null;
    }
    for (const target of targets) state.ages[target] = row.coefficient >= target ? 0 : state.ages[target] === null ? null : state.ages[target] + 1;
    state.history.push(row.coefficient);
    if (state.history.length > 20) state.history.shift();
    state.lastAt = row.timestamp;
    state.lastId = row.id;
  }
  function sequenceFlag(kind, rule, state, target) {
    if (kind === "cycle") return state.ages[target] === null ? null : Number(state.ages[target] >= rule.cycleAge);
    return state.history.length < 20 ? null : Number(state.history.filter((value) => value >= target).length >= 3 || state.history.slice(-5).filter((value) => value >= target).length >= 2);
  }
  function fitSequence(rows, targets) {
    const ambiguous = tiedTimes(rows);
    const gaps = Object.fromEntries(targets.map((target) => [target, []])), first = initialSequenceState(targets);
    for (const row of rows) {
      if (ambiguous.has(row.timestamp)) {
        advanceSequence(first, row, targets, true);
        continue;
      }
      if (first.lastAt !== null && row.timestamp > first.lastAt && row.timestamp - first.lastAt <= GAP_MS2) {
        for (const target of targets) if (row.coefficient >= target && first.ages[target] !== null) gaps[target].push(first.ages[target] + 1);
      }
      advanceSequence(first, row, targets);
    }
    const rules = targets.map((target) => ({
      target,
      cycleAge: gaps[target].length ? Math.max(1, Math.ceil(gaps[target].reduce((a, b) => a + b, 0) / gaps[target].length)) : null,
      events: rows.filter((row) => row.coefficient >= target).length,
      cycle: [[0, 0], [0, 0]],
      cluster: [[0, 0], [0, 0]]
    }));
    const state = initialSequenceState(targets);
    for (const row of rows) {
      if (ambiguous.has(row.timestamp)) {
        advanceSequence(state, row, targets, true);
        continue;
      }
      if (state.lastAt !== null && (row.timestamp <= state.lastAt || row.timestamp - state.lastAt > GAP_MS2)) {
        state.history = [];
        for (const target of targets) state.ages[target] = null;
      }
      for (const rule of rules) for (const kind of ["cycle", "cluster"]) {
        const flag = sequenceFlag(kind, rule, state, rule.target);
        if (flag !== null) {
          rule[kind][flag][0] += Number(row.coefficient >= rule.target);
          rule[kind][flag][1]++;
        }
      }
      advanceSequence(state, row, targets);
    }
    const jointSummary = ([hits, total]) => {
      const value = betaSummary(hits, total);
      return { ...value, intervalJoint95: [0.0125, 0.9875].map((q) => inverseBetaCDF(q, value.alpha, value.beta)) };
    };
    return rules.map((rule) => ({
      ...rule,
      cycle: rule.cycle.map(jointSummary),
      cluster: rule.cluster.map(jointSummary),
      ready: rows.length >= 500 && rule.events >= 20
    }));
  }
  function sequenceForecasts(fits, state, now) {
    const records = [];
    for (const rule of fits.sequence) for (const kind of ["cycle", "cluster"]) for (const horizon of SUITE_HORIZONS) {
      const synthetic = { history: [...state.history], ages: { ...state.ages } };
      const occurrences = /* @__PURE__ */ new Map();
      let survival = 1, lowerSurvival = 1, upperSurvival = 1;
      let reason2 = !rule.ready ? "insufficient-training-events" : state.lastAt === null || now - state.lastAt > GAP_MS2 || now < state.lastAt ? "stale-current-segment" : null;
      for (let step = 0; !reason2 && step < horizon; step++) {
        const flag = sequenceFlag(kind, rule, synthetic, rule.target), bin = flag === null ? null : rule[kind][flag];
        if (!bin || bin.total < 100 || bin.hits < 5) {
          reason2 = "insufficient-calibrated-feature-support";
          break;
        }
        const repetition = occurrences.get(flag) || 0;
        survival *= (bin.beta + repetition) / (bin.alpha + bin.beta + repetition);
        lowerSurvival *= 1 - bin.intervalJoint95[1];
        upperSurvival *= 1 - bin.intervalJoint95[0];
        occurrences.set(flag, repetition + 1);
        synthetic.ages[rule.target] = synthetic.ages[rule.target] === null ? null : synthetic.ages[rule.target] + 1;
        synthetic.history.push(1);
        if (synthetic.history.length > 20) synthetic.history.shift();
      }
      records.push({
        modelId: `${kind}-calibrated-v1`,
        family: "sequence",
        target: rule.target,
        horizon,
        status: reason2 ? "insufficient" : "ready",
        reason: reason2,
        probability: reason2 ? null : 1 - survival,
        interval95: reason2 ? null : [1 - upperSurvival, 1 - lowerSurvival],
        intervalKind: "at-least-95-percent-bonferroni-two-feature-bin-posterior-envelope",
        evidenceStatus: EVIDENCE,
        horizonUnit: "completed-rounds",
        generatedAt: now,
        feature: kind === "cycle" ? "age-at-least-training-mean-renewal-gap" : "three-in-twenty-or-two-in-five"
      });
    }
    return records;
  }
  function fitCurrentSuite(input, { now = Date.now(), targets = SUITE_TARGETS, timeZone = "Europe/Kyiv", lookbackDays = 90 } = {}) {
    const days = Number.isFinite(lookbackDays) && lookbackDays > 0 && lookbackDays <= 90 ? lookbackDays : 90;
    const rows = normalizeRounds(input, now).reverse().filter((row) => row.timestamp >= now - days * 864e5);
    const acceptedTargets = [...new Set(targets)].filter((value) => SUITE_TARGETS.includes(value));
    return {
      modelId: SUITE_MODEL,
      evidenceStatus: EVIDENCE,
      trainedAt: now,
      dataCutoff: rows.at(-1)?.timestamp ?? null,
      trainingRoundCount: rows.length,
      timeZone,
      targets: acceptedTargets,
      lookbackDays: days,
      baselines: acceptedTargets.map((target) => ({ target, ...betaSummary(rows.filter((row) => row.coefficient >= target).length, rows.length) })),
      sequence: fitSequence(rows, acceptedTargets),
      survival: fitSurvivalModels(rows, { now, targets: acceptedTargets }),
      time: fitTimeModels(rows, { now, targets: acceptedTargets, timeZone }),
      hawkes: fitHawkes(rows, { now, targets: acceptedTargets })
    };
  }
  function stateFromRows(fits, rows, now) {
    const sequence4 = initialSequenceState(fits.targets);
    const ambiguous = tiedTimes(rows);
    for (const row of rows) advanceSequence(sequence4, row, fits.targets, ambiguous.has(row.timestamp));
    return { sequence: sequence4, hawkes: prepareHawkesPredictionState(fits.hawkes, rows, { now }) };
  }
  function predictFromState(fits, state, now, { includeTimeIntervals = true, timeIntervalMembers = null } = {}) {
    const forecasts = sequenceForecasts(fits, state.sequence, now);
    for (const target of fits.targets) {
      forecasts.push(...predictSurvivalAtAge(fits.survival, {
        target,
        ageRounds: state.sequence.ages[target],
        now,
        lastAt: state.sequence.lastAt
      }).map((value) => ({ ...value, family: "survival" })));
      const intervalModelIds = timeIntervalMembers === null ? null : timeIntervalMembers.filter((value) => value.target === target).map((value) => value.modelId);
      forecasts.push(...predictTimeModels(fits.time, {
        timestamp: now,
        target,
        horizon: 1,
        includeIntervals: includeTimeIntervals && (intervalModelIds === null || intervalModelIds.length > 0),
        intervalModelIds
      }));
      for (const horizon of SUITE_HORIZONS) forecasts.push(predictHawkes(fits.hawkes, [], { now, target, horizon, state: state.hawkes }));
    }
    return forecasts;
  }
  function predictCurrentSuite(fits, recentInput, { now = Date.now(), validation = null } = {}) {
    const rows = normalizeRounds(recentInput, now).reverse();
    if (fits?.modelId !== SUITE_MODEL || !fits.targets || !fits.dataCutoff || fits.dataCutoff > now || fits.trainedAt > now)
      return { estimates: [], consensus: { status: "unavailable", reason: "invalid-or-future-fit", signals: [] }, zones: [] };
    const state = stateFromRows(fits, rows, now);
    const estimates = predictFromState(fits, state, now).map((value) => {
      const verified = validation?.models?.find((item) => item.key === forecastKey(value));
      return {
        ...value,
        validation: verified?.qualified ? "qualified-on-confirmation-dates" : "unvalidated-or-no-demonstrated-advantage",
        validationReason: verified?.reason || "no-independent-validation"
      };
    });
    const members = validation?.frozenMembers || [], signals = [];
    for (const target of fits.targets) for (const horizon of SUITE_HORIZONS) {
      const model = fixedConsensus(estimates, members, baselineFor(fits, target, horizon).interval95, { target, horizon });
      const combo = validation?.consensus?.find((value) => value.key === forecastKey(model));
      const qualifiedMembers = members.filter((member) => member.target === target && member.horizon === horizon && validation?.models?.some((value) => value.key === member.key && value.qualified));
      const supportedFamilies = new Set(qualifiedMembers.map((value) => value.family));
      const allFrozenMembersQualified = qualifiedMembers.length === members.filter((value) => value.target === target && value.horizon === horizon).length;
      if (model.status === "ready" && combo?.qualified && supportedFamilies.size >= 2 && allFrozenMembersQualified)
        signals.push({ ...model, evidenceStatus: "conditionally-supported-in-this-walk-forward-check", informationalOnly: true });
    }
    const zones = currentQualifiedZones(validation?.timeZones, now);
    return { estimates, consensus: {
      status: signals.length ? "ready" : "abstain",
      signals,
      reason: signals.length ? "confirmed-frozen-distinct-family-combination" : "no-confirmed-combination-with-current-agreement"
    }, zones };
  }
  async function evaluateFold(fits, train, test, fold, accumulator, consensusAccumulator, frozenMembers, yieldTask, onForecast) {
    const state = stateFromRows(fits, train.slice(-2e3), test[0]?.timestamp ?? fits.trainedAt);
    for (let index = 0; index < test.length; index++) {
      const row = test[index], now = row.timestamp;
      advanceSequence(state.sequence, row, fits.targets);
      state.hawkes = advanceHawkesPredictionState(fits.hawkes, state.hawkes, row, { now });
      const forecasts = predictFromState(fits, state, now, {
        includeTimeIntervals: frozenMembers.some((value) => value.family === "time"),
        timeIntervalMembers: frozenMembers.filter((value) => value.family === "time")
      });
      if (onForecast) onForecast({
        day: fold.day,
        stage: fold.stage,
        issuedAt: now,
        forecasts: forecasts.map(({ modelId, target, horizon, probability: probability4, status }) => ({ modelId, target, horizon, probability: probability4, status }))
      });
      for (const forecast of forecasts) {
        if (index % forecast.horizon !== 0) continue;
        const baseline = baselineFor(fits, forecast.target, forecast.horizon).probability;
        const outcome = futureRoundOutcome(test, index, forecast.horizon, forecast.target);
        recordObservation(accumulator, forecast, { day: fold.day, baseline, outcome });
      }
      if (consensusAccumulator && frozenMembers.length) for (const target of fits.targets) for (const horizon of SUITE_HORIZONS) {
        if (index % horizon !== 0) continue;
        const baseline = baselineFor(fits, target, horizon);
        const combo = fixedConsensus(forecasts, frozenMembers, baseline.interval95, { target, horizon });
        recordObservation(consensusAccumulator, combo, {
          day: fold.day,
          baseline: baseline.probability,
          outcome: futureRoundOutcome(test, index, horizon, target)
        });
      }
      if (index % 512 === 511) await yieldTask();
    }
  }
  async function runStatisticalSuite(input, {
    now = Date.now(),
    onProgress = () => {
    },
    targets = SUITE_TARGETS,
    timeZone = "Europe/Kyiv",
    confirmationDays = 14,
    minTrainDays = 14,
    minTrainRounds = 2e3,
    yieldTask = defaultYield2,
    bootstrapSamples = 8192,
    onForecast = null,
    lookbackDays = 90
  } = {}) {
    const normalized = normalizeRounds(input, now).reverse();
    const days = Number.isFinite(lookbackDays) && lookbackDays > 0 && lookbackDays <= 90 ? lookbackDays : 90;
    const rows = normalized.filter((row) => row.timestamp >= now - days * 864e5);
    const claimAlpha = 0.05 / 3;
    const protocol = chronologicalFolds(rows, { now, timeZone, minTrainDays, minTrainRounds, confirmationDays });
    const development = createValidationAccumulator(), confirmation = createValidationAccumulator(), combinations = createValidationAccumulator();
    let developmentReport = [], frozenMembers = [], frozen = false;
    for (let index = 0; index < protocol.folds.length; index++) {
      const fold = protocol.folds[index];
      if (fold.stage === "confirmation" && !frozen) {
        developmentReport = summarizeValidation(development, { bootstrapSamples, alpha: claimAlpha, allowQualification: protocol.developmentDays >= 5 });
        frozenMembers = freezeFamilySelection(developmentReport);
        frozen = true;
      }
      onProgress({ stage: "walk-forward", fold: index + 1, folds: protocol.folds.length, day: fold.day, partition: fold.stage });
      await yieldTask();
      const train = rows.slice(0, fold.from), test = rows.slice(fold.from, fold.to);
      const fits2 = fitCurrentSuite(train, { now: train.at(-1).timestamp, targets, timeZone, lookbackDays: days });
      await evaluateFold(
        fits2,
        train,
        test,
        fold,
        fold.stage === "development" ? development : confirmation,
        fold.stage === "confirmation" ? combinations : null,
        fold.stage === "confirmation" ? frozenMembers : [],
        yieldTask,
        onForecast
      );
    }
    if (!frozen) developmentReport = summarizeValidation(development, { bootstrapSamples, allowQualification: false });
    const models = summarizeValidation(confirmation, {
      bootstrapSamples,
      minDays: confirmationDays,
      alpha: claimAlpha,
      allowQualification: protocol.qualificationPossible
    });
    const consensus = summarizeValidation(combinations, {
      bootstrapSamples,
      minDays: confirmationDays,
      alpha: claimAlpha,
      allowQualification: protocol.qualificationPossible
    });
    const validation = {
      protocol: { ...protocol, folds: protocol.folds.map(({ day, stage, trainingDays, trainingCutoff, count: count3 }) => ({ day, stage, trainingDays, trainingCutoff, observedRounds: count3 })) },
      development: developmentReport,
      frozenMembers,
      models,
      consensus,
      multipleTestingBudget: {
        totalAlpha: 0.05,
        models: claimAlpha,
        consensus: claimAlpha,
        timeZones: claimAlpha,
        method: "Bonferroni across three claim families; Holm within each family"
      },
      selectionRule: "development-supported positive Brier/log gain ranked per target/horizon/family; fixed lower-bound agreement; equal-weight supporting families; independent confirmation required",
      limitations: [
        "Whole-day bootstrap/sign-flip assumes adequately exchangeable day blocks and is approximate.",
        "Timestamp replay assumes immediate availability; real feed delivery and game actions are not tested.",
        "Several models use the same observations; distinct families are not proof of statistical independence.",
        "Next-k any-event probability is neither payout probability nor profitability of a particular stake.",
        "Hawkes maps round horizons using training cadence; clock models predict only next round near the known origin time."
      ]
    };
    validation.timeZones = await validateTimeZones(rows, {
      protocol,
      now,
      timeZone,
      targets,
      alpha: claimAlpha,
      yieldTask,
      onProgress,
      bootstrapSamples
    });
    onProgress({ stage: "current-fit", fold: protocol.folds.length, folds: protocol.folds.length });
    await yieldTask();
    const fits = fitCurrentSuite(rows, { now, targets, timeZone, lookbackDays: days });
    const current = predictCurrentSuite(fits, rows.slice(-2e3), { now, validation });
    onProgress({ stage: "complete", folds: protocol.folds.length });
    return {
      modelId: SUITE_MODEL,
      evidenceStatus: EVIDENCE,
      generatedAt: now,
      history: {
        inputCount: Array.isArray(input) ? input.length : 0,
        rawInputCount: Array.isArray(input) ? input.length : 0,
        normalizedCount: normalized.length,
        excludedOutsideLookback: normalized.length - rows.length,
        acceptedCount: rows.length,
        lookbackDays: days,
        observedDayCount: protocol.availableCompleteDays + Number(!!rows.length && localDay(rows.at(-1).timestamp, timeZone) === protocol.today),
        dataQuality: { renewal: fits.survival.diagnostics, clockExposure: "all normalized source records; equal-time records are not silently deduplicated" },
        firstAt: rows[0]?.timestamp ?? null,
        lastAt: rows.at(-1)?.timestamp ?? null,
        eventCounts: targets.map((target) => ({ target, count: rows.filter((row) => row.coefficient >= target).length }))
      },
      validation,
      ...current,
      fits
    };
  }

  // src/statistics/runtime.mjs
  var EMBEDDED_WORKER = true ? '(() => {\n  // src/prediction-v2.ts\n  var MAX_FRESH_AGE_MS = 18e4;\n  var MIN = 6e4;\n  var MIN_TIMESTAMP = 9466848e5;\n  var MAX_TIMESTAMP = 864e13;\n  var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);\n  var finite = (value) => typeof value === "number" && Number.isFinite(value);\n  var validTimestamp = (value) => finite(value) && Number.isSafeInteger(value) && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP;\n  var validNow = (value) => validTimestamp(value) && value <= MAX_TIMESTAMP - 30 * MIN;\n  function stableId(value) {\n    if (typeof value === "string" && value.length > 0 && value.trim() === value) return value;\n    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);\n    return null;\n  }\n  function normalizeWithDiagnostics(input, now) {\n    const diagnostics = {\n      inputCount: Array.isArray(input) ? input.length : 0,\n      acceptedCount: 0,\n      invalidCount: 0,\n      futureCount: 0,\n      estimatedCount: 0,\n      incompleteCount: 0,\n      duplicateCount: 0,\n      conflictingIdCount: 0,\n      conflictingRecordCount: 0,\n      freshestAgeMs: null,\n      fresh: false,\n      validInput: Array.isArray(input) && validNow(now)\n    };\n    if (!diagnostics.validInput || !Array.isArray(input)) return { rounds: [], diagnostics };\n    const groups = /* @__PURE__ */ new Map();\n    for (const value of input) {\n      if (!isRecord(value)) {\n        diagnostics.invalidCount++;\n        continue;\n      }\n      const id = stableId(value.id);\n      if (id === null || !finite(value.coefficient) || value.coefficient < 1 || !validTimestamp(value.timestamp) || value.estimated !== void 0 && typeof value.estimated !== "boolean" || value.completed !== void 0 && typeof value.completed !== "boolean") {\n        diagnostics.invalidCount++;\n        continue;\n      }\n      if (value.estimated === true) {\n        diagnostics.estimatedCount++;\n        continue;\n      }\n      if (value.completed === false) {\n        diagnostics.incompleteCount++;\n        continue;\n      }\n      if (value.timestamp > now) {\n        diagnostics.futureCount++;\n        continue;\n      }\n      const round = { id, coefficient: value.coefficient, timestamp: value.timestamp };\n      const existing = groups.get(id);\n      if (existing) {\n        existing.count++;\n        existing.conflict ||= existing.round.coefficient !== round.coefficient || existing.round.timestamp !== round.timestamp;\n      } else groups.set(id, { round, count: 1, conflict: false });\n    }\n    const rounds = [];\n    for (const group of groups.values()) {\n      if (group.conflict) {\n        diagnostics.conflictingIdCount++;\n        diagnostics.conflictingRecordCount += group.count;\n      } else {\n        rounds.push(group.round);\n        diagnostics.duplicateCount += group.count - 1;\n      }\n    }\n    rounds.sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));\n    diagnostics.acceptedCount = rounds.length;\n    diagnostics.freshestAgeMs = rounds.length ? now - rounds[0].timestamp : null;\n    diagnostics.fresh = diagnostics.freshestAgeMs !== null && diagnostics.freshestAgeMs <= MAX_FRESH_AGE_MS;\n    return { rounds, diagnostics };\n  }\n  function normalizeRounds(rounds, now = Date.now()) {\n    return normalizeWithDiagnostics(rounds, now).rounds;\n  }\n\n  // src/rare-window-model.mjs\n  var MINUTE = 6e4;\n  var MAX_NOW = 864e13 - 30 * MINUTE;\n  var clamp01 = (x) => Math.max(0, Math.min(1, x));\n  function logGamma(z) {\n    if (!Number.isFinite(z) || z <= 0) return NaN;\n    const coefficients = [\n      676.5203681218851,\n      -1259.1392167224028,\n      771.3234287776531,\n      -176.6150291621406,\n      12.507343278686905,\n      -0.13857109526572012,\n      9984369578019572e-21,\n      15056327351493116e-23\n    ];\n    if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);\n    const shifted = z - 1;\n    let sum = 0.9999999999998099;\n    for (let i = 0; i < coefficients.length; i++) sum += coefficients[i] / (shifted + i + 1);\n    const t = shifted + 7.5;\n    return 0.9189385332046727 + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);\n  }\n  function betaFraction(a, b, x) {\n    const tiny = 1e-300;\n    const nonzero = (value) => Math.abs(value) < tiny ? value < 0 ? -tiny : tiny : value;\n    const qab = a + b, qap = a + 1, qam = a - 1;\n    let c = 1, d = 1 / nonzero(1 - qab * x / qap), h = d;\n    for (let m = 1; m <= 300; m++) {\n      const twice = 2 * m;\n      let aa = m * (b - m) * x / ((qam + twice) * (a + twice));\n      d = 1 / nonzero(1 + aa * d);\n      c = nonzero(1 + aa / c);\n      h *= d * c;\n      aa = -(a + m) * (qab + m) * x / ((a + twice) * (qap + twice));\n      d = 1 / nonzero(1 + aa * d);\n      c = nonzero(1 + aa / c);\n      const delta = d * c;\n      h *= delta;\n      if (Math.abs(delta - 1) < 3e-14) return h;\n    }\n    return NaN;\n  }\n  function regularizedBeta(x, a, b) {\n    if (![x, a, b].every(Number.isFinite) || a <= 0 || b <= 0 || x < 0 || x > 1) return NaN;\n    if (x === 0 || x === 1) return x;\n    const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));\n    return clamp01(x < (a + 1) / (a + b + 2) ? factor * betaFraction(a, b, x) / a : 1 - factor * betaFraction(b, a, 1 - x) / b);\n  }\n  function inverseBetaCDF(p, a, b) {\n    if (![p, a, b].every(Number.isFinite) || p < 0 || p > 1 || a <= 0 || b <= 0) return NaN;\n    if (p === 0 || p === 1) return p;\n    let low = 0, high = 1;\n    for (let i = 0; i < 90; i++) {\n      const middle = (low + high) / 2;\n      const cdf = regularizedBeta(middle, a, b);\n      if (!Number.isFinite(cdf)) return NaN;\n      if (cdf < p) low = middle;\n      else high = middle;\n    }\n    return (low + high) / 2;\n  }\n  function regularizedGamma(shape, x) {\n    if (!Number.isFinite(shape) || shape <= 0 || typeof x !== "number" || Number.isNaN(x) || x < 0) return NaN;\n    if (x === 0) return 0;\n    if (x === Infinity) return 1;\n    const factor = Math.exp(shape * Math.log(x) - x - logGamma(shape));\n    if (x < shape + 1) {\n      let term = 1 / shape, sum = term;\n      for (let i = 1; i <= 2e3; i++) {\n        term *= x / (shape + i);\n        sum += term;\n        if (Math.abs(term) < Math.abs(sum) * 3e-14) return clamp01(sum * factor);\n      }\n    } else {\n      const tiny = 1e-300;\n      const nonzero = (value) => Math.abs(value) < tiny ? value < 0 ? -tiny : tiny : value;\n      let b = x + 1 - shape, c = 1 / tiny, d = 1 / nonzero(b), h = d;\n      for (let i = 1; i <= 2e3; i++) {\n        const an = -i * (i - shape);\n        b += 2;\n        d = 1 / nonzero(an * d + b);\n        c = nonzero(b + an / c);\n        const delta = d * c;\n        h *= delta;\n        if (Math.abs(delta - 1) < 3e-14) return clamp01(1 - factor * h);\n      }\n    }\n    return NaN;\n  }\n  function inverseGammaCDF(p, shape) {\n    if (![p, shape].every(Number.isFinite) || p < 0 || p > 1 || shape <= 0) return NaN;\n    if (p === 0) return 0;\n    if (p === 1) return Infinity;\n    let low = 0, high = Math.max(1, shape);\n    for (let i = 0; i < 100 && regularizedGamma(shape, high) < p; i++) high *= 2;\n    if (regularizedGamma(shape, high) < p) return NaN;\n    for (let i = 0; i < 100; i++) {\n      const middle = (low + high) / 2;\n      const cdf = regularizedGamma(shape, middle);\n      if (!Number.isFinite(cdf)) return NaN;\n      if (cdf < p) low = middle;\n      else high = middle;\n    }\n    return (low + high) / 2;\n  }\n\n  // src/statistics/survival.mjs\n  var TARGETS = Object.freeze([10, 15, 20, 50, 100]);\n  var HORIZONS = Object.freeze([1, 3, 5]);\n  var AGE_BINS = Object.freeze([0, 1, 2, 3, 5, 10, 20, 50, 100, 200, 500, Infinity]);\n  var EVIDENCE_STATUS = "experimental-unvalidated";\n  var MAX_GAP_MS = 18e4;\n  var MIN_TIMESTAMP2 = 9466848e5;\n  var MIN_ROWS = 500;\n  var MIN_KNOWN_EVENTS = 20;\n  var MIN_BIN_EXPOSURES = 30;\n  var MIN_WEIBULL_EVENTS = 30;\n  var LOG_SHAPE_MIN = Math.log(0.2);\n  var LOG_SHAPE_MAX = Math.log(5);\n  var LOG_SCALE_MIN = Math.log(0.1);\n  var LOG_SCALE_MAX = Math.log(1e7);\n  var clamp012 = (value) => Math.max(0, Math.min(1, value));\n  var validTime = (value) => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP2 && value <= 864e13;\n  var binIndex = (age) => {\n    for (let index = 0; index < AGE_BINS.length - 1; index++) if (age < AGE_BINS[index + 1]) return index;\n    return AGE_BINS.length - 2;\n  };\n  function freeze(object) {\n    if (object && typeof object === "object" && !Object.isFrozen(object)) {\n      for (const value of Object.values(object)) freeze(value);\n      Object.freeze(object);\n    }\n    return object;\n  }\n  function grouped(values) {\n    const map = /* @__PURE__ */ new Map();\n    for (const value of values) map.set(value, (map.get(value) || 0) + 1);\n    return [...map].sort((a, b) => a[0] - b[0]);\n  }\n  function negativeLogLikelihood(parameters, events, censored) {\n    const [logShape, logScale] = parameters;\n    if (!parameters.every(Number.isFinite) || logShape < LOG_SHAPE_MIN || logShape > LOG_SHAPE_MAX || logScale < LOG_SCALE_MIN || logScale > LOG_SCALE_MAX) return Infinity;\n    const shape = Math.exp(logShape), scale = Math.exp(logScale);\n    let loss = 0;\n    for (const [gap, n] of events) {\n      const left = gap === 1 ? 0 : Math.exp(shape * (Math.log(gap - 1) - logScale));\n      const right = Math.exp(shape * (Math.log(gap) - logScale));\n      const difference = right - left;\n      if (!(difference > 0) || !Number.isFinite(right)) return Infinity;\n      const logProbability = -left + Math.log(-Math.expm1(-difference));\n      if (!Number.isFinite(logProbability)) return Infinity;\n      loss -= n * logProbability;\n    }\n    for (const [duration, n] of censored) loss += n * (duration / scale) ** shape;\n    return Number.isFinite(loss) ? loss : Infinity;\n  }\n  function nelderMead(loss, initial) {\n    let points = [initial, [initial[0] + 0.15, initial[1]], [initial[0], initial[1] + 0.15]].map((point) => ({ point: [...point], value: loss(point) }));\n    let converged = false;\n    for (let iteration = 0; iteration < 240; iteration++) {\n      points.sort((a, b) => a.value - b.value);\n      if (Math.max(...points.slice(1).flatMap((item) => item.point.map((value, index) => Math.abs(value - points[0].point[index])))) < 1e-7) {\n        converged = true;\n        break;\n      }\n      const center = points[0].point.map((value, index) => (value + points[1].point[index]) / 2);\n      const proposal = (factor) => center.map((value, index) => value + factor * (value - points[2].point[index]));\n      const reflected = { point: proposal(1) };\n      reflected.value = loss(reflected.point);\n      if (reflected.value < points[0].value) {\n        const expanded = { point: proposal(2) };\n        expanded.value = loss(expanded.point);\n        points[2] = expanded.value < reflected.value ? expanded : reflected;\n      } else if (reflected.value < points[1].value) points[2] = reflected;\n      else {\n        const outside = reflected.value < points[2].value;\n        const contracted = { point: proposal(outside ? 0.5 : -0.5) };\n        contracted.value = loss(contracted.point);\n        if (contracted.value < (outside ? reflected.value : points[2].value)) points[2] = contracted;\n        else for (let index = 1; index < 3; index++) {\n          points[index].point = points[index].point.map((value, axis) => (value + points[0].point[axis]) / 2);\n          points[index].value = loss(points[index].point);\n        }\n      }\n    }\n    points.sort((a, b) => a.value - b.value);\n    return { ...points[0], converged };\n  }\n  function hessianCovariance(loss, point) {\n    const step = 1e-3, center = loss(point);\n    const at = (x, y) => loss([point[0] + x * step, point[1] + y * step]);\n    const a = (at(1, 0) - 2 * center + at(-1, 0)) / step ** 2;\n    const d = (at(0, 1) - 2 * center + at(0, -1)) / step ** 2;\n    const b = (at(1, 1) - at(1, -1) - at(-1, 1) + at(-1, -1)) / (4 * step ** 2);\n    const determinant = a * d - b * b;\n    if (![a, b, d, determinant].every(Number.isFinite) || a <= 0 || d <= 0 || determinant <= 1e-9) return null;\n    const trace = a + d, discriminant = Math.sqrt((a - d) ** 2 + 4 * b * b);\n    if ((trace + discriminant) / (trace - discriminant) > 1e10) return null;\n    return [[d / determinant, -b / determinant], [-b / determinant, a / determinant]];\n  }\n  function weibullRoundProbability(shape, scale, ageRounds, horizon) {\n    if (![shape, scale].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0) || !Number.isSafeInteger(ageRounds) || ageRounds < 0 || !Number.isSafeInteger(horizon) || horizon < 1) return null;\n    const before = ageRounds === 0 ? 0 : (ageRounds / scale) ** shape;\n    const after = ((ageRounds + horizon) / scale) ** shape;\n    return clamp012(-Math.expm1(-(after - before)));\n  }\n  function fitDiscreteWeibull(eventGaps, censoredGaps = []) {\n    if (!Array.isArray(eventGaps) || !Array.isArray(censoredGaps) || eventGaps.some((value) => !Number.isSafeInteger(value) || value < 1) || censoredGaps.some((value) => !Number.isSafeInteger(value) || value < 0))\n      return { status: "insufficient", reason: "invalid-renewal-gaps" };\n    if (eventGaps.length < MIN_WEIBULL_EVENTS) return { status: "insufficient", reason: "insufficient-renewal-events", eventCount: eventGaps.length };\n    const events = grouped(eventGaps), censored = grouped(censoredGaps.filter((value) => value > 0));\n    const totalExposure = [...events, ...censored].reduce((sum, [duration, n]) => sum + duration * n, 0);\n    const loss = (parameters) => negativeLogLikelihood(parameters, events, censored);\n    const result = nelderMead(loss, [0, Math.log(Math.max(0.2, totalExposure / eventGaps.length))]);\n    const [logShape, logScale] = result.point;\n    if (!result.converged || !Number.isFinite(result.value) || logShape - LOG_SHAPE_MIN < 1e-3 || LOG_SHAPE_MAX - logShape < 1e-3 || logScale - LOG_SCALE_MIN < 1e-3 || LOG_SCALE_MAX - logScale < 1e-3)\n      return { status: "insufficient", reason: "unstable-or-boundary-weibull-fit", eventCount: eventGaps.length };\n    const covariance = hessianCovariance(loss, result.point);\n    if (!covariance) return { status: "insufficient", reason: "singular-weibull-uncertainty", eventCount: eventGaps.length };\n    return {\n      status: "ready",\n      reason: null,\n      shape: Math.exp(logShape),\n      scale: Math.exp(logScale),\n      logParameters: result.point,\n      covariance,\n      negativeLogLikelihood: result.value,\n      shapeInterval95: [-1.96, 1.96].map((z) => Math.exp(logShape + z * Math.sqrt(covariance[0][0]))),\n      scaleInterval95: [-1.96, 1.96].map((z) => Math.exp(logScale + z * Math.sqrt(covariance[1][1]))),\n      eventCount: eventGaps.length,\n      rightCensoredCount: censoredGaps.filter((value) => value > 0).length,\n      totalExposureRounds: totalExposure,\n      fitKind: "discrete-interval-weibull-mle-with-right-censoring",\n      intervalKind: "asymptotic-log-parameter-observed-hessian"\n    };\n  }\n  function unambiguousChronology(ordered) {\n    const rows = [], breakBefore = /* @__PURE__ */ new Set();\n    let tiedGroupCount = 0, tiedRoundCount = 0, pendingBreak = true;\n    for (let index = 0; index < ordered.length; ) {\n      let end = index + 1;\n      while (end < ordered.length && ordered[end].timestamp === ordered[index].timestamp) end++;\n      if (end - index > 1) {\n        tiedGroupCount++;\n        tiedRoundCount += end - index;\n        pendingBreak = true;\n      } else {\n        const row = ordered[index], previous = rows.at(-1);\n        if (pendingBreak || !previous || row.timestamp - previous.timestamp > MAX_GAP_MS) breakBefore.add(rows.length);\n        rows.push(row);\n        pendingBreak = false;\n      }\n      index = end;\n    }\n    return { rows, breakBefore, tiedGroupCount, tiedRoundCount };\n  }\n  function targetFit(rows, target, breakBefore) {\n    const bins = AGE_BINS.slice(0, -1).map((lower, index) => ({ lower, upper: AGE_BINS[index + 1], exposures: 0, events: 0 }));\n    const eventGaps = [], censoredGaps = [];\n    let age = null, previousAt = null, knownEvents = 0, allEvents = 0, segments = 0;\n    for (let index = 0; index < rows.length; index++) {\n      const row = rows[index];\n      if (previousAt === null || breakBefore.has(index) || row.timestamp - previousAt > MAX_GAP_MS) {\n        if (age !== null) censoredGaps.push(age);\n        age = null;\n        segments++;\n      }\n      const event = row.coefficient >= target;\n      if (event) allEvents++;\n      if (age !== null) {\n        const bin = bins[binIndex(age)];\n        bin.exposures++;\n        if (event) {\n          bin.events++;\n          eventGaps.push(age + 1);\n          knownEvents++;\n          age = 0;\n        } else age++;\n      } else if (event) age = 0;\n      previousAt = row.timestamp;\n    }\n    if (age !== null) censoredGaps.push(age);\n    for (const bin of bins) {\n      bin.alpha = bin.events + 0.5;\n      bin.beta = bin.exposures - bin.events + 0.5;\n      bin.bounds = Array.from({ length: 5 }, (_, index) => {\n        const tail = 0.025 / (index + 1);\n        return [inverseBetaCDF(tail, bin.alpha, bin.beta), inverseBetaCDF(1 - tail, bin.alpha, bin.beta)];\n      });\n    }\n    const reason = rows.length < MIN_ROWS ? "insufficient-training-rounds" : knownEvents < MIN_KNOWN_EVENTS ? "insufficient-known-age-events" : null;\n    return {\n      target,\n      eventCount: allEvents,\n      knownAgeEventCount: knownEvents,\n      segmentCount: segments,\n      lastKnownAgeRounds: age,\n      bayesian: {\n        status: reason ? "insufficient" : "ready",\n        reason,\n        bins,\n        intervalKind: "at-least-95-percent-bonferroni-posterior-envelope"\n      },\n      weibull: reason ? { status: "insufficient", reason } : fitDiscreteWeibull(eventGaps, censoredGaps)\n    };\n  }\n  function fitSurvivalModels(input, { targets = TARGETS, now = Date.now() } = {}) {\n    const accepted = normalizeRounds(input, now).reverse();\n    const { rows, breakBefore, tiedGroupCount, tiedRoundCount } = unambiguousChronology(accepted);\n    const acceptedTargets = Array.isArray(targets) ? [...new Set(targets.filter((value) => typeof value === "number" && Number.isFinite(value) && value > 1))].sort((a, b) => a - b) : [];\n    return freeze({\n      modelId: "survival-models-v1",\n      evidenceStatus: EVIDENCE_STATUS,\n      trainedAt: validTime(now) ? now : null,\n      dataCutoff: accepted.at(-1)?.timestamp ?? null,\n      firstAt: accepted[0]?.timestamp ?? null,\n      sampleSize: rows.length,\n      diagnostics: {\n        acceptedRoundCount: accepted.length,\n        usableRoundCount: rows.length,\n        excludedTiedGroupCount: tiedGroupCount,\n        excludedTiedRoundCount: tiedRoundCount,\n        tiedTimestampPolicy: "exclude-whole-group-and-break-renewal-segment"\n      },\n      gapThresholdMs: MAX_GAP_MS,\n      horizons: [...HORIZONS],\n      targets: acceptedTargets.map((target) => targetFit(rows, target, breakBefore)),\n      assumptions: [\n        "renewal-within-contiguous-observed-segments",\n        "fixed-age-bins",\n        "unknown-left-edge-age-excluded",\n        "right-censoring-at-segment-ends",\n        "equal-timestamp-groups-excluded-and-censored",\n        "completed-round-horizons"\n      ]\n    });\n  }\n  function bayesianProbability(fit, age, horizon) {\n    const usage = /* @__PURE__ */ new Map();\n    for (let step = 0; step < horizon; step++) {\n      const index = binIndex(age + step);\n      usage.set(index, (usage.get(index) || 0) + 1);\n    }\n    if ([...usage.keys()].some((index) => fit.bins[index].exposures < MIN_BIN_EXPOSURES))\n      return { reason: "insufficient-age-bin-exposure" };\n    if ([...usage.keys()].some((index) => {\n      const bounds = fit.bins[index].bounds?.[usage.size - 1];\n      return !Array.isArray(bounds) || bounds.length !== 2 || !bounds.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || bounds[0] > bounds[1];\n    })) return { reason: "unstable-hazard-posterior" };\n    let expectedSurvival = 1, lowerSurvival = 1, upperSurvival = 1;\n    for (const [index, repeats] of usage) {\n      const bin = fit.bins[index], bounds = bin.bounds[usage.size - 1];\n      for (let j = 0; j < repeats; j++) expectedSurvival *= (bin.beta + j) / (bin.alpha + bin.beta + j);\n      lowerSurvival *= (1 - bounds[1]) ** repeats;\n      upperSurvival *= (1 - bounds[0]) ** repeats;\n    }\n    return { probability: clamp012(1 - expectedSurvival), interval95: [clamp012(1 - upperSurvival), clamp012(1 - lowerSurvival)] };\n  }\n  function weibullProbability(fit, age, horizon) {\n    const probability3 = weibullRoundProbability(fit.shape, fit.scale, age, horizon);\n    if (probability3 === null || probability3 <= 1e-12 || probability3 >= 1 - 1e-12) return null;\n    const logit = (parameters) => {\n      const value = weibullRoundProbability(Math.exp(parameters[0]), Math.exp(parameters[1]), age, horizon);\n      return value > 0 && value < 1 ? Math.log(value / (1 - value)) : NaN;\n    };\n    const step = 1e-4;\n    const gradient = [0, 1].map((index) => {\n      const plus = [...fit.logParameters], minus = [...fit.logParameters];\n      plus[index] += step;\n      minus[index] -= step;\n      return (logit(plus) - logit(minus)) / (2 * step);\n    });\n    const covariance = fit.covariance;\n    const variance = gradient[0] ** 2 * covariance[0][0] + 2 * gradient[0] * gradient[1] * covariance[0][1] + gradient[1] ** 2 * covariance[1][1];\n    if (!Number.isFinite(variance) || variance < 0) return null;\n    const center = Math.log(probability3 / (1 - probability3)), deviation = 1.96 * Math.sqrt(variance);\n    return { probability: probability3, interval95: [center - deviation, center + deviation].map((value) => 1 / (1 + Math.exp(-value))) };\n  }\n  function predictSurvivalAtAge(fit, { target, ageRounds, now = Date.now(), lastAt = now } = {}) {\n    const trained = fit?.targets?.find((item) => item.target === target);\n    const sourceReason = fit?.modelId !== "survival-models-v1" || !trained ? "unknown-target-or-fit" : !validTime(now) || !validTime(lastAt) || !validTime(fit.trainedAt) || !validTime(fit.dataCutoff) || fit.trainedAt > now || fit.dataCutoff > lastAt || lastAt > now ? "invalid-as-of-time" : now - lastAt > MAX_GAP_MS ? "stale-live-history" : !Number.isSafeInteger(ageRounds) || ageRounds < 0 ? "unknown-current-renewal-age" : null;\n    const records = [];\n    for (const [key, modelId] of [["bayesian", "bayesian-hazard-v1"], ["weibull", "weibull-survival-v1"]]) for (const horizon of HORIZONS) {\n      const component = trained?.[key];\n      let reason = sourceReason ?? (component?.status === "ready" ? null : component?.reason || "insufficient-model-fit");\n      const computed = reason ? null : key === "bayesian" ? bayesianProbability(component, ageRounds, horizon) : weibullProbability(component, ageRounds, horizon);\n      if (!reason && computed?.reason) reason = computed.reason;\n      if (!reason && !computed) reason = "unstable-prediction-uncertainty";\n      const result = reason ? null : computed;\n      records.push({\n        modelId,\n        target,\n        horizon,\n        status: result ? "ready" : "insufficient",\n        reason,\n        evidenceStatus: EVIDENCE_STATUS,\n        probability: result?.probability ?? null,\n        interval95: result?.interval95 ?? null,\n        intervalKind: key === "bayesian" ? "at-least-95-percent-bonferroni-posterior-envelope" : "asymptotic-logit-delta-parameter-uncertainty",\n        ageRounds: Number.isSafeInteger(ageRounds) && ageRounds >= 0 ? ageRounds : null,\n        trainedAt: fit?.trainedAt ?? null,\n        dataCutoff: fit?.dataCutoff ?? null,\n        generatedAt: now,\n        horizonUnit: "completed-rounds",\n        assumptions: key === "bayesian" ? "piecewise-constant-age-hazards" : "discrete-weibull-renewal"\n      });\n    }\n    return records;\n  }\n\n  // src/statistics/time-models.mjs\n  var TIME_MODEL_VERSION = "clock-exposure-v1";\n  var TIME_TARGETS = Object.freeze([10, 15, 20, 50, 100]);\n  var TIME_RADII = Object.freeze([30, 60, 120]);\n  var TIME_BUCKET_SECONDS = 300;\n  var TIME_MODEL_IDS = Object.freeze([\n    ...TIME_RADII.map((r) => `temporal-pattern-${r}`),\n    ...TIME_RADII.map((r) => `circular-kde-${r}`),\n    "bayesian-time-buckets-300",\n    "multi-day-seasonality-300"\n  ]);\n  var DAY = 86400;\n  var MIN_TIMESTAMP3 = 9466848e5;\n  var MAX_TIMESTAMP2 = 864e13;\n  var PRIOR_ROUNDS = 20;\n  var FORMATTERS = /* @__PURE__ */ new Map();\n  var timestamp = (value) => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP3 && value <= MAX_TIMESTAMP2;\n  var clamp = (x) => Math.max(0, Math.min(1, x));\n  var mod = (x) => (x % DAY + DAY) % DAY;\n  function clockFormatter(timeZone) {\n    if (!FORMATTERS.has(timeZone)) FORMATTERS.set(timeZone, new Intl.DateTimeFormat("en-CA", {\n      timeZone,\n      year: "numeric",\n      month: "2-digit",\n      day: "2-digit",\n      hour: "2-digit",\n      minute: "2-digit",\n      second: "2-digit",\n      hourCycle: "h23"\n    }));\n    return FORMATTERS.get(timeZone);\n  }\n  function localClock(timestampMs, timeZone = "Europe/Kyiv") {\n    if (!timestamp(timestampMs)) return null;\n    try {\n      return clockParts(clockFormatter(timeZone), timestampMs);\n    } catch {\n      return null;\n    }\n  }\n  function clockParts(formatter, timestampMs) {\n    const fields = Object.fromEntries(formatter.formatToParts(timestampMs).map((p) => [p.type, p.value]));\n    const hour = Number(fields.hour), minute = Number(fields.minute), second = Number(fields.second);\n    if (hour > 23 || minute > 59 || second > 59) throw Error("Invalid local clock");\n    return { second: hour * 3600 + minute * 60 + second, date: `${fields.year}-${fields.month}-${fields.day}` };\n  }\n  function moments(counts) {\n    const n = new Float64Array(DAY + 1), first = new Float64Array(DAY + 1), second = new Float64Array(DAY + 1);\n    for (let i = 0; i < DAY; i++) {\n      n[i + 1] = n[i] + counts[i];\n      first[i + 1] = first[i] + counts[i] * i;\n      second[i + 1] = second[i] + counts[i] * i * i;\n    }\n    return { n, first, second };\n  }\n  function rangeMoments(prefix, from, to) {\n    if (to < from) return [0, 0, 0];\n    let n = 0, first = 0, second = 0;\n    const firstPeriod = Math.floor(from / DAY), lastPeriod = Math.floor(to / DAY);\n    for (let period = firstPeriod; period <= lastPeriod; period++) {\n      const offset = period * DAY, a = Math.max(0, from - offset), b = Math.min(DAY - 1, to - offset);\n      if (a > b) continue;\n      const count = prefix.n[b + 1] - prefix.n[a];\n      const one = prefix.first[b + 1] - prefix.first[a];\n      const two = prefix.second[b + 1] - prefix.second[a];\n      n += count;\n      first += one + offset * count;\n      second += two + 2 * offset * one + offset * offset * count;\n    }\n    return [n, first, second];\n  }\n  function intervalCount(prefix, center, radius) {\n    return rangeMoments(prefix, center - radius, center + radius)[0];\n  }\n  function linearWeight(prefix, from, to, a, b) {\n    const [n, first, second] = rangeMoments(prefix, from, to);\n    return [Math.max(0, a * n + b * first), Math.max(0, a * a * n + 2 * a * b * first + b * b * second)];\n  }\n  function triangular(prefix, center, radius) {\n    const bandwidth = radius + 1;\n    const left = linearWeight(prefix, center - radius, center, 1 - center / bandwidth, 1 / bandwidth);\n    const right = linearWeight(prefix, center + 1, center + radius, 1 + center / bandwidth, -1 / bandwidth);\n    return [left[0] + right[0], left[1] + right[1]];\n  }\n  function daySupport(bySecond, dayCount, targetCount, radius) {\n    const rounds = new Uint32Array(dayCount), hits = Array.from({ length: targetCount }, () => new Uint32Array(dayCount));\n    const supported = new Uint16Array(DAY), eventDays = Array.from({ length: targetCount }, () => new Uint16Array(DAY));\n    let days = 0;\n    const eventDayCounts = new Uint16Array(targetCount), maskBase = 2 ** targetCount;\n    function add2(second, delta) {\n      for (const encoded of bySecond[mod(second)] || []) {\n        const day = Math.floor(encoded / maskBase), mask = encoded % maskBase;\n        if (delta > 0) {\n          if (rounds[day]++ === 0) days++;\n        } else if (--rounds[day] === 0) days--;\n        for (let t = 0; t < targetCount; t++) if (mask & 1 << t) {\n          if (delta > 0) {\n            if (hits[t][day]++ === 0) eventDayCounts[t]++;\n          } else if (--hits[t][day] === 0) eventDayCounts[t]--;\n        }\n      }\n    }\n    for (let i = -radius; i <= radius; i++) add2(i, 1);\n    for (let center = 0; center < DAY; center++) {\n      supported[center] = days;\n      for (let t = 0; t < targetCount; t++) eventDays[t][center] = eventDayCounts[t];\n      add2(center - radius, -1);\n      add2(center + radius + 1, 1);\n    }\n    return { supported, eventDays };\n  }\n  function emptyFit(reason, options) {\n    return {\n      version: TIME_MODEL_VERSION,\n      status: "insufficient",\n      reason,\n      evidenceStatus: "experimental-unvalidated",\n      timeZone: options.timeZone,\n      targets: [...options.targets],\n      trainingRoundCount: 0,\n      trainingDayCount: 0,\n      dataCutoff: null,\n      modelIds: [...TIME_MODEL_IDS],\n      _state: null\n    };\n  }\n  function fitTimeModels(input, { now = Date.now(), timeZone = "Europe/Kyiv", targets = TIME_TARGETS, lookbackDays = 90 } = {}) {\n    const options = { timeZone, targets };\n    if (!Array.isArray(targets) || targets.length < 1 || targets.length > 8 || new Set(targets).size !== targets.length || targets.some((t) => !Number.isFinite(t) || t < 1))\n      return emptyFit("invalid-targets", { timeZone, targets: [] });\n    if (!timestamp(now)) return emptyFit("invalid-now", options);\n    if (!Number.isSafeInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 90) return emptyFit("invalid-lookback", options);\n    let formatter;\n    try {\n      formatter = clockFormatter(timeZone);\n    } catch {\n      return emptyFit("invalid-time-zone", options);\n    }\n    const rows = normalizeRounds(input, now).filter((row) => row.timestamp >= now - lookbackDays * DAY * 1e3).reverse();\n    if (!rows.length) return emptyFit("no-valid-rounds", options);\n    const targetCount = targets.length, maskBase = 2 ** targetCount;\n    const total = new Uint32Array(DAY), events = targets.map(() => new Uint32Array(DAY));\n    const bySecond = new Array(DAY), days = /* @__PURE__ */ new Map(), bucketDays = Array.from({ length: DAY / TIME_BUCKET_SECONDS }, () => /* @__PURE__ */ new Map());\n    for (const row of rows) {\n      const clock = clockParts(formatter, row.timestamp);\n      if (!days.has(clock.date)) days.set(clock.date, days.size);\n      const day = days.get(clock.date), second = clock.second, bucket = Math.floor(second / TIME_BUCKET_SECONDS);\n      total[second]++;\n      let mask = 0, daily = bucketDays[bucket].get(day);\n      if (!daily) {\n        daily = new Uint32Array(targetCount + 1);\n        bucketDays[bucket].set(day, daily);\n      }\n      daily[0]++;\n      for (let t = 0; t < targetCount; t++) if (row.coefficient >= targets[t]) {\n        events[t][second]++;\n        daily[t + 1]++;\n        mask |= 1 << t;\n      }\n      (bySecond[second] ||= []).push(day * maskBase + mask);\n    }\n    const exposure = moments(total), eventPrefixes = events.map(moments);\n    const support = Object.fromEntries(TIME_RADII.map((radius) => [radius, daySupport(bySecond, days.size, targetCount, radius)]));\n    return {\n      version: TIME_MODEL_VERSION,\n      status: rows.length >= 500 && days.size >= 7 ? "ready" : "insufficient",\n      reason: rows.length < 500 ? "insufficient-training-rounds" : days.size < 7 ? "insufficient-training-days" : null,\n      evidenceStatus: "experimental-unvalidated",\n      timeZone,\n      targets: [...targets],\n      modelIds: [...TIME_MODEL_IDS],\n      trainingRoundCount: rows.length,\n      trainingDayCount: days.size,\n      dataStart: rows[0].timestamp,\n      dataCutoff: rows.at(-1).timestamp,\n      fittedAt: now,\n      lookbackDays,\n      _state: {\n        exposure,\n        eventPrefixes,\n        support,\n        bucketDays: bucketDays.map((map) => [...map.entries()].map(([day, counts]) => [day, ...counts])),\n        globalHits: events.map((counts) => counts.reduce((a, b) => a + b, 0))\n      }\n    };\n  }\n  function betaEstimate(hits, rounds, outsideHits, outsideRounds, includeIntervals, effectiveRounds = rounds) {\n    if (!(rounds > 0) || !(effectiveRounds > 0)) return { probability: null, interval95: null };\n    const outside = (outsideHits + 0.5) / (outsideRounds + 1), local = clamp(hits / rounds);\n    const alpha = local * effectiveRounds + 0.5 + PRIOR_ROUNDS * outside;\n    const beta = (1 - local) * effectiveRounds + 0.5 + PRIOR_ROUNDS * (1 - outside);\n    return { probability: alpha / (alpha + beta), interval95: includeIntervals ? [0.025, 0.975].map((p) => inverseBetaCDF(p, alpha, beta)) : null };\n  }\n  function supportedReason(fit, globalHits, counts) {\n    if (fit.status !== "ready") return fit.reason || "insufficient-training-history";\n    if (globalHits < 10) return "insufficient-global-events";\n    if (counts.insideRounds < 30) return "insufficient-local-rounds";\n    if (counts.insideHits < 3) return "insufficient-local-events";\n    if (counts.insideDays < 5) return "insufficient-local-days";\n    if (counts.eventDays < 3) return "events-not-repeated-across-days";\n    if (counts.outsideRounds < 100) return "insufficient-outside-exposure";\n    return null;\n  }\n  function record(fit, target, modelId, counts, estimate, reason, detail = {}) {\n    return {\n      modelId,\n      family: "time",\n      target,\n      horizon: 1,\n      status: reason ? "insufficient" : "ready",\n      reason,\n      probability: reason ? null : estimate.probability,\n      interval95: reason ? null : estimate.interval95,\n      evidenceStatus: "experimental-unvalidated",\n      qualified: false,\n      qualificationReason: "requires-independent-walk-forward-validation",\n      baselineProbability: (counts.globalHits + 0.5) / (fit.trainingRoundCount + 1),\n      observedInsideFrequency: counts.insideRounds ? counts.insideHits / counts.insideRounds : null,\n      observedOutsideFrequency: counts.outsideRounds ? counts.outsideHits / counts.outsideRounds : null,\n      counts,\n      priorEquivalentRounds: PRIOR_ROUNDS,\n      intervalKind: "conditional-empirical-bayes-95-percent-equal-tail",\n      timeZone: fit.timeZone,\n      dataCutoff: fit.dataCutoff,\n      interpretation: "next-round-conditional-on-decision-clock-approximation",\n      intervalAssumption: "exchangeable-conditional-round-outcomes-within-clock-zone; fixed-outside-rate-prior",\n      ...detail\n    };\n  }\n  function predictTimeModels(fit, { timestamp: at = Date.now(), target = 10, horizon = 1, includeIntervals = true, intervalModelIds = null } = {}) {\n    if (!fit || fit.version !== TIME_MODEL_VERSION || !fit._state || !timestamp(at) || !timestamp(fit.dataCutoff) || at < fit.dataCutoff || !Array.isArray(fit.targets) || !fit.targets.includes(target) || horizon !== 1 || !Number.isSafeInteger(fit.trainingRoundCount) || fit.trainingRoundCount < 1 || fit._state.exposure?.n?.length !== DAY + 1 || !Array.isArray(fit._state.eventPrefixes) || fit._state.eventPrefixes.length !== fit.targets.length || !fit._state.support || !Array.isArray(fit._state.bucketDays) || fit._state.bucketDays.length !== DAY / TIME_BUCKET_SECONDS || !Array.isArray(fit._state.globalHits)) return [];\n    const clock = localClock(at, fit.timeZone);\n    if (!clock) return [];\n    const t = fit.targets.indexOf(target), state = fit._state, globalHits = state.globalHits[t];\n    const globalRounds = fit.trainingRoundCount, results = [];\n    const wantInterval = (id) => includeIntervals && (intervalModelIds === null || Array.isArray(intervalModelIds) && intervalModelIds.includes(id));\n    for (const radius of TIME_RADII) {\n      const insideRounds2 = intervalCount(state.exposure, clock.second, radius), insideHits2 = intervalCount(state.eventPrefixes[t], clock.second, radius);\n      const counts2 = {\n        insideRounds: insideRounds2,\n        insideHits: insideHits2,\n        outsideRounds: globalRounds - insideRounds2,\n        outsideHits: globalHits - insideHits2,\n        insideDays: state.support[radius].supported[clock.second],\n        eventDays: state.support[radius].eventDays[t][clock.second],\n        globalHits\n      };\n      const reason2 = supportedReason(fit, globalHits, counts2);\n      const estimate2 = betaEstimate(insideHits2, insideRounds2, counts2.outsideHits, counts2.outsideRounds, wantInterval(`temporal-pattern-${radius}`) && !reason2);\n      results.push(record(\n        fit,\n        target,\n        `temporal-pattern-${radius}`,\n        counts2,\n        estimate2,\n        reason2,\n        { clockSecond: clock.second, radiusSeconds: radius, windowKind: "circular-inclusive-seconds", futureClockAssumption: "next-round-near-forecast-origin" }\n      ));\n    }\n    for (const radius of TIME_RADII) {\n      const [weightedRounds, sumWeightsSquared] = triangular(state.exposure, clock.second, radius);\n      const [weightedHits] = triangular(state.eventPrefixes[t], clock.second, radius);\n      const supportRounds = intervalCount(state.exposure, clock.second, radius), supportHits = intervalCount(state.eventPrefixes[t], clock.second, radius);\n      const counts2 = {\n        insideRounds: supportRounds,\n        insideHits: supportHits,\n        outsideRounds: globalRounds - supportRounds,\n        outsideHits: globalHits - supportHits,\n        insideDays: state.support[radius].supported[clock.second],\n        eventDays: state.support[radius].eventDays[t][clock.second],\n        globalHits\n      };\n      const reason2 = supportedReason(fit, globalHits, counts2);\n      const effectiveRounds = sumWeightsSquared > 0 ? weightedRounds ** 2 / sumWeightsSquared : 0;\n      const estimate2 = betaEstimate(\n        Math.min(weightedHits, weightedRounds),\n        weightedRounds,\n        counts2.outsideHits,\n        counts2.outsideRounds,\n        wantInterval(`circular-kde-${radius}`) && !reason2,\n        effectiveRounds\n      );\n      results.push(record(\n        fit,\n        target,\n        `circular-kde-${radius}`,\n        counts2,\n        estimate2,\n        reason2,\n        {\n          clockSecond: clock.second,\n          radiusSeconds: radius,\n          kernel: "discrete-triangular",\n          bandwidthSeconds: radius + 1,\n          weightedRounds,\n          weightedHits,\n          effectiveRounds,\n          intervalKind: "approximate-effective-sample-empirical-bayes-95-percent-equal-tail",\n          futureClockAssumption: "next-round-near-forecast-origin"\n        }\n      ));\n    }\n    const bucket = Math.floor(clock.second / TIME_BUCKET_SECONDS), from = bucket * TIME_BUCKET_SECONDS, to = from + TIME_BUCKET_SECONDS - 1;\n    const insideRounds = rangeMoments(state.exposure, from, to)[0], insideHits = rangeMoments(state.eventPrefixes[t], from, to)[0];\n    const daily = state.bucketDays[bucket];\n    const supportedDays = daily.filter((row) => row[1] > 0), eventDays = daily.filter((row) => row[t + 2] > 0);\n    const counts = {\n      insideRounds,\n      insideHits,\n      outsideRounds: globalRounds - insideRounds,\n      outsideHits: globalHits - insideHits,\n      insideDays: supportedDays.length,\n      eventDays: eventDays.length,\n      globalHits\n    };\n    const reason = supportedReason(fit, globalHits, counts);\n    const estimate = betaEstimate(\n      insideHits,\n      insideRounds,\n      counts.outsideHits,\n      counts.outsideRounds,\n      (wantInterval("bayesian-time-buckets-300") || wantInterval("multi-day-seasonality-300")) && !reason\n    );\n    results.push(record(\n      fit,\n      target,\n      "bayesian-time-buckets-300",\n      counts,\n      estimate,\n      reason,\n      {\n        clockSecond: clock.second,\n        zoneStartSecond: from,\n        zoneEndSecond: to,\n        bucketSeconds: TIME_BUCKET_SECONDS,\n        interval95: wantInterval("bayesian-time-buckets-300") && !reason ? estimate.interval95 : null,\n        futureClockAssumption: "next-round-near-forecast-origin"\n      }\n    ));\n    const outsideRate = (counts.outsideHits + 0.5) / (counts.outsideRounds + 1);\n    const daysAboveOutside = supportedDays.filter((row) => row[t + 2] / row[1] > outsideRate).length;\n    const largestDayEventFraction = insideHits ? Math.max(0, ...eventDays.map((row) => row[t + 2] / insideHits)) : 0;\n    const seasonReason = reason || (supportedDays.length < 7 ? "insufficient-seasonality-days" : largestDayEventFraction > 0.5 ? "single-day-event-concentration" : daysAboveOutside < Math.ceil(0.6 * supportedDays.length) ? "inconsistent-day-direction" : null);\n    results.push(record(\n      fit,\n      target,\n      "multi-day-seasonality-300",\n      { ...counts, daysAboveOutside, largestDayEventFraction },\n      estimate,\n      seasonReason,\n      {\n        clockSecond: clock.second,\n        zoneStartSecond: from,\n        zoneEndSecond: to,\n        interval95: wantInterval("multi-day-seasonality-300") && !seasonReason ? estimate.interval95 : null,\n        bucketSeconds: TIME_BUCKET_SECONDS,\n        stabilityScope: "training-days-only",\n        futureClockAssumption: "next-round-near-forecast-origin"\n      }\n    ));\n    return results;\n  }\n\n  // src/statistics/hawkes.mjs\n  var HAWKES_MODEL = "hawkes-exponential";\n  var HAWKES_TARGETS = Object.freeze([10, 15, 20, 50, 100]);\n  var HAWKES_DECAY_SECONDS = Object.freeze([30, 60, 120, 300]);\n  var HAWKES_EVIDENCE = "experimental-unvalidated";\n  var GAP_MS = 18e4;\n  var MIN_EVENTS = 20;\n  var MIN_ROUNDS = 500;\n  var MAX_BRANCHING = 0.95;\n  var MIN_TIME = 9466848e5;\n  var MAX_TIME = 864e13 - 30 * 6e4;\n  var finite2 = (value) => typeof value === "number" && Number.isFinite(value);\n  var timestamp2 = (value) => Number.isSafeInteger(value) && value >= MIN_TIME && value <= MAX_TIME;\n  var validTarget = (value) => finite2(value) && value >= 1;\n  var clamp2 = (value, low, high) => Math.max(low, Math.min(high, value));\n  var probability = (hazard) => -Math.expm1(-Math.max(0, hazard));\n  function freeze2(value) {\n    if (value && typeof value === "object" && !Object.isFrozen(value)) {\n      for (const child of Object.values(value)) freeze2(child);\n      Object.freeze(value);\n    }\n    return value;\n  }\n  function segmentsOf(rows) {\n    const segments = [];\n    let current = [], excludedAmbiguousRows = 0, excludedAmbiguousBlocks = 0, lastAmbiguousAt = null;\n    const flush = () => {\n      if (current.length) segments.push(current);\n      current = [];\n    };\n    for (let i = 0; i < rows.length; ) {\n      let end = i + 1;\n      while (end < rows.length && rows[end].timestamp === rows[i].timestamp) end++;\n      if (end - i > 1) {\n        flush();\n        excludedAmbiguousRows += end - i;\n        excludedAmbiguousBlocks++;\n        lastAmbiguousAt = rows[i].timestamp;\n      } else {\n        if (current.length && rows[i].timestamp - current.at(-1).timestamp > GAP_MS) flush();\n        current.push(rows[i]);\n      }\n      i = end;\n    }\n    flush();\n    return { segments, excludedAmbiguousRows, excludedAmbiguousBlocks, lastAmbiguousAt };\n  }\n  function median(values) {\n    if (!values.length) return null;\n    const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;\n    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;\n  }\n  function targetSegments(segments, target) {\n    let exposure = 0, events = 0, tiedEvents = 0;\n    const observed = [];\n    for (const segment of segments) {\n      const first = segment[0].timestamp, duration = (segment.at(-1).timestamp - first) / 1e3;\n      const eventTimes = [], seeds = segment.filter((row) => row.timestamp === first && row.coefficient >= target).length;\n      if (seeds > 1) tiedEvents += seeds - 1;\n      if (!(duration > 0)) continue;\n      let previousEventAt = seeds > 0 ? first : null;\n      for (const row of segment) {\n        if (row.timestamp <= first || row.coefficient < target) continue;\n        if (row.timestamp === previousEventAt) tiedEvents++;\n        previousEventAt = row.timestamp;\n        eventTimes.push((row.timestamp - first) / 1e3);\n      }\n      exposure += duration;\n      events += eventTimes.length;\n      observed.push({ duration, seeds, eventTimes });\n    }\n    return { segments: observed, exposure, events, tiedEvents };\n  }\n  function hawkesLikelihoodData(segments, beta) {\n    if (!finite2(beta) || beta <= 0 || !Array.isArray(segments)) return null;\n    const history = [];\n    let exposure = 0, integratedKernel = 0, terminal = 0;\n    for (const segment of segments) {\n      const { duration, seeds, eventTimes } = segment;\n      if (!finite2(duration) || duration <= 0 || !Number.isSafeInteger(seeds) || seeds < 0 || !Array.isArray(eventTimes)) return null;\n      let r = seeds, previous = 0;\n      integratedKernel += seeds * -Math.expm1(-beta * duration);\n      for (const time of eventTimes) {\n        if (!finite2(time) || time <= previous || time > duration) return null;\n        r *= Math.exp(-beta * (time - previous));\n        history.push(r);\n        r += 1;\n        previous = time;\n        integratedKernel += -Math.expm1(-beta * (duration - time));\n      }\n      terminal = r * Math.exp(-beta * (duration - previous));\n      exposure += duration;\n    }\n    return { history, exposure, integratedKernel, terminal };\n  }\n  function objective(data, rate, u, n, derivatives = false) {\n    const beta = data.beta;\n    if (!(u > 0) || n < 0 || n > MAX_BRANCHING) return { penalized: -Infinity };\n    let ll = -rate * u * data.exposure - n * data.integratedKernel;\n    let gu = -rate * data.exposure, gn = -data.integratedKernel - 4 * n;\n    let auu = 0, aun = 0, ann = 4;\n    for (const r of data.history) {\n      const lambda = rate * u + beta * n * r;\n      if (!(lambda > 0) || !Number.isFinite(lambda)) return { penalized: -Infinity };\n      ll += Math.log(lambda);\n      if (derivatives) {\n        const x = rate / lambda, y = beta * r / lambda;\n        gu += x;\n        gn += y;\n        auu += x * x;\n        aun += x * y;\n        ann += y * y;\n      }\n    }\n    return { ll, penalized: ll - 2 * n * n, gu, gn, auu, aun, ann };\n  }\n  function fitDecay(raw, decaySeconds) {\n    const beta = 1 / decaySeconds, values = hawkesLikelihoodData(raw.segments, beta);\n    if (!values || !raw.events || !values.exposure) return null;\n    const data = { ...values, beta }, rate = raw.events / raw.exposure;\n    let u = 1, n = 0, value = objective(data, rate, u, n, true);\n    for (let iteration = 0; iteration < 60; iteration++) {\n      let du, dn;\n      if (n <= 1e-12 && value.gn <= 0 || n >= MAX_BRANCHING - 1e-12 && value.gn >= 0) {\n        du = value.auu > 0 ? value.gu / value.auu : 0;\n        dn = 0;\n      } else {\n        const determinant2 = value.auu * value.ann - value.aun * value.aun;\n        if (!(determinant2 > 0) || !Number.isFinite(determinant2)) break;\n        du = (value.ann * value.gu - value.aun * value.gn) / determinant2;\n        dn = (value.auu * value.gn - value.aun * value.gu) / determinant2;\n      }\n      if (![du, dn].every(Number.isFinite)) break;\n      let accepted = false;\n      for (let step = 1; step >= 1 / 65536; step /= 2) {\n        const nextU = clamp2(u + step * du, 1e-8, 100), nextN = clamp2(n + step * dn, 0, MAX_BRANCHING);\n        const next = objective(data, rate, nextU, nextN, true);\n        if (next.penalized >= value.penalized - 1e-10) {\n          const difference = Math.abs(nextU - u) + Math.abs(nextN - n);\n          u = nextU;\n          n = nextN;\n          value = next;\n          accepted = true;\n          if (difference < 1e-9) iteration = 60;\n          break;\n        }\n      }\n      if (!accepted) break;\n    }\n    const determinant = value.auu * value.ann - value.aun * value.aun;\n    const covariance = determinant > 0 ? {\n      varianceMu: rate * rate * value.ann / determinant,\n      varianceAlpha: beta * beta * value.auu / determinant,\n      covarianceMuAlpha: -rate * beta * value.aun / determinant\n    } : null;\n    return {\n      parameters: { mu: rate * u, alpha: beta * n, beta, branchingRatio: n, decaySeconds },\n      logLikelihood: value.ll,\n      penalizedLogLikelihood: value.penalized,\n      covariance,\n      terminalExcitation: values.terminal,\n      // Two continuous parameters, plus the fixed four-way decay comparison.\n      selectionScore: -2 * value.ll + 2 * Math.log(raw.events) + 2 * Math.log(HAWKES_DECAY_SECONDS.length)\n    };\n  }\n  function terminalEventAt(segment, target) {\n    for (let i = segment.length - 1; i >= 0; i--) if (segment[i].coefficient >= target) return segment[i].timestamp;\n    return null;\n  }\n  function terminalExcitationFor(segment, target, beta) {\n    const end = segment.at(-1)?.timestamp;\n    return segment.reduce((sum, row) => sum + (row.coefficient >= target ? Math.exp(-beta * (end - row.timestamp) / 1e3) : 0), 0);\n  }\n  function fitHawkes(input, { now = Date.now(), targets = HAWKES_TARGETS } = {}) {\n    const rows = normalizeRounds(input, now).reverse(), partition = segmentsOf(rows), { segments } = partition;\n    const gaps = [];\n    for (const segment of segments) for (let i = 1; i < segment.length; i++) {\n      const gap = (segment[i].timestamp - segment[i - 1].timestamp) / 1e3;\n      if (gap > 0) gaps.push(gap);\n    }\n    const cadenceSeconds = median(gaps), selectedTargets = [...new Set(Array.isArray(targets) ? targets.filter(validTarget) : [])];\n    const finalSegment = segments.at(-1) || [], latest = finalSegment.at(-1);\n    const usableRoundCount = rows.length - partition.excludedAmbiguousRows;\n    const models = selectedTargets.map((target) => {\n      const raw = targetSegments(segments, target), nullRate = raw.events / raw.exposure;\n      const nullLogLikelihood = raw.events > 0 && raw.exposure > 0 ? raw.events * Math.log(nullRate) - raw.events : null;\n      const base = {\n        modelId: HAWKES_MODEL,\n        family: "hawkes",\n        target,\n        eventCount: raw.events,\n        exposureSeconds: raw.exposure,\n        segmentCount: raw.segments.length,\n        tiedEventCount: raw.tiedEvents,\n        excludedAmbiguousRows: partition.excludedAmbiguousRows,\n        excludedAmbiguousBlocks: partition.excludedAmbiguousBlocks,\n        cadenceSeconds,\n        nullLogLikelihood,\n        lastEventAt: terminalEventAt(finalSegment, target),\n        evidenceStatus: HAWKES_EVIDENCE,\n        assumptions: [\n          "conditional-empty-presegment-history",\n          "known-boundary-events-seed-intensity",\n          "all-equal-timestamp-round-groups-excluded-and-exposure-split",\n          "ambiguity-exclusion-may-be-nonrandom",\n          "observed-spacing-assumes-provider-coverage",\n          "fixed-rate-and-exponential-kernel-within-training-period"\n        ]\n      };\n      const reason = !timestamp2(now) ? "invalid-clock" : usableRoundCount < MIN_ROUNDS ? "insufficient-rounds" : raw.events < MIN_EVENTS ? "insufficient-events" : raw.exposure < 1800 ? "insufficient-exposure" : raw.tiedEvents ? "simultaneous-event-timestamps" : !(cadenceSeconds > 0) ? "no-positive-cadence" : null;\n      if (reason) return { ...base, status: "insufficient", reason, parameters: null, covariance: null };\n      const candidates = HAWKES_DECAY_SECONDS.map((decay) => fitDecay(raw, decay)).filter(Boolean);\n      const nullScore = -2 * nullLogLikelihood + Math.log(raw.events);\n      const selected = candidates.sort((a, b) => a.selectionScore - b.selectionScore)[0];\n      const useExcitation = selected && selected.selectionScore < nullScore && selected.parameters.branchingRatio > 1e-7;\n      if (!useExcitation) return {\n        ...base,\n        status: "ready",\n        reason: "poisson-null-selected",\n        trainingSelection: "poisson-null",\n        conditionalClustering: false,\n        parameters: { mu: nullRate, alpha: 0, beta: 1 / 60, branchingRatio: 0, decaySeconds: 60 },\n        covariance: null,\n        logLikelihood: nullLogLikelihood,\n        selectionScore: nullScore,\n        terminalExcitation: 0,\n        uncertainty: { kind: "gamma-jeffreys-null", shape: raw.events + 0.5, rateSeconds: raw.exposure }\n      };\n      const unstable = selected.parameters.branchingRatio >= MAX_BRANCHING - 1e-6 || !selected.covariance;\n      return {\n        ...base,\n        ...selected,\n        terminalExcitation: terminalExcitationFor(finalSegment, target, selected.parameters.beta),\n        status: unstable ? "insufficient" : "ready",\n        reason: unstable ? "near-critical-or-singular-fit" : "training-excitation-selected",\n        trainingSelection: "exponential-hawkes",\n        conditionalClustering: true,\n        uncertainty: {\n          kind: "laplace-conditional-on-selected-decay",\n          includesModelSelectionUncertainty: false,\n          description: "Approximate conditional parameter interval; decay-selection and model misspecification are excluded."\n        }\n      };\n    });\n    const result = {\n      modelId: HAWKES_MODEL,\n      family: "hawkes",\n      evidenceStatus: HAWKES_EVIDENCE,\n      trainedAt: timestamp2(now) ? now : null,\n      trainingStart: rows[0]?.timestamp ?? null,\n      trainingEnd: latest?.timestamp ?? null,\n      trainingObservedEnd: rows.at(-1)?.timestamp ?? null,\n      terminalBarrierAt: partition.lastAmbiguousAt > (latest?.timestamp ?? Infinity) ? partition.lastAmbiguousAt : null,\n      roundCount: rows.length,\n      usableRoundCount,\n      cadenceSeconds,\n      excludedAmbiguousRows: partition.excludedAmbiguousRows,\n      excludedAmbiguousBlocks: partition.excludedAmbiguousBlocks,\n      lastId: latest?.id ?? null,\n      lastCoefficient: latest?.coefficient ?? null,\n      models\n    };\n    result.identity = [result.modelId, result.trainedAt, result.trainingEnd, ...models.flatMap((model) => [model.target, model.parameters?.mu, model.parameters?.alpha, model.parameters?.beta])].join(":");\n    return freeze2(result);\n  }\n  function validFit(fit) {\n    return fit?.modelId === HAWKES_MODEL && fit.evidenceStatus === HAWKES_EVIDENCE && typeof fit.identity === "string" && timestamp2(fit.trainingEnd) && timestamp2(fit.trainedAt) && Array.isArray(fit.models);\n  }\n  function validState(state, fit) {\n    return state?.fitIdentity === fit.identity && state.status === "ready" && timestamp2(state.lastAt) && Array.isArray(state.models) && state.models.every((model) => model && validTarget(model.target) && finite2(model.excitation) && model.excitation >= 0 && (model.beta === null || finite2(model.beta) && model.beta > 0));\n  }\n  function initialState(fit) {\n    const barrier = fit.terminalBarrierAt !== null && fit.terminalBarrierAt !== void 0;\n    return {\n      modelId: HAWKES_MODEL,\n      fitIdentity: fit.identity,\n      status: "ready",\n      reason: null,\n      lastAt: barrier ? fit.terminalBarrierAt : fit.trainingEnd,\n      lastId: barrier ? null : fit.lastId,\n      lastCoefficient: barrier ? null : fit.lastCoefficient,\n      awaitingUnambiguous: barrier,\n      models: fit.models.map((model) => ({\n        target: model.target,\n        beta: model.parameters?.beta ?? null,\n        excitation: barrier ? 0 : model.terminalExcitation ?? 0,\n        lastEventAt: barrier ? null : model.lastEventAt,\n        tied: false\n      }))\n    };\n  }\n  function ambiguityBarrier(state, at) {\n    return {\n      ...state,\n      lastAt: at,\n      lastId: null,\n      lastCoefficient: null,\n      awaitingUnambiguous: true,\n      models: state.models.map((model) => ({ ...model, excitation: 0, lastEventAt: null, tied: false }))\n    };\n  }\n  function advanceTrusted(fit, state, row) {\n    if (row.timestamp < state.lastAt || row.id === state.lastId && (row.timestamp !== state.lastAt || row.coefficient !== state.lastCoefficient))\n      return { ...state, status: "invalid", reason: "out-of-order-or-conflicting-state-row" };\n    if (row.id === state.lastId) return state;\n    const gap = row.timestamp - state.lastAt;\n    if (gap === 0) return ambiguityBarrier(state, row.timestamp);\n    return {\n      ...state,\n      lastAt: row.timestamp,\n      lastId: row.id,\n      lastCoefficient: row.coefficient,\n      awaitingUnambiguous: false,\n      models: state.models.map((model) => {\n        const reset = gap > GAP_MS || state.awaitingUnambiguous, hit = row.coefficient >= model.target;\n        const old = reset ? 0 : model.excitation * Math.exp(-(model.beta ?? 0) * gap / 1e3);\n        const lastEventAt = reset ? null : model.lastEventAt;\n        return {\n          ...model,\n          excitation: old + Number(hit),\n          lastEventAt: hit ? row.timestamp : lastEventAt,\n          tied: !reset && (model.tied || hit && lastEventAt === row.timestamp)\n        };\n      })\n    };\n  }\n  function prepareHawkesPredictionState(fit, recentRows = [], { now = Date.now() } = {}) {\n    if (!validFit(fit) || !timestamp2(now) || fit.trainedAt > now || fit.trainingEnd > now)\n      return freeze2({ modelId: HAWKES_MODEL, status: "invalid", reason: "invalid-or-future-fit" });\n    let state = initialState(fit);\n    const rows = normalizeRounds(recentRows, now).reverse();\n    for (let i = 0; i < rows.length; ) {\n      let end = i + 1;\n      while (end < rows.length && rows[end].timestamp === rows[i].timestamp) end++;\n      const row = rows[i];\n      if (row.timestamp >= fit.trainingEnd) {\n        if (end - i > 1 && row.timestamp >= state.lastAt) state = ambiguityBarrier(state, row.timestamp);\n        else if (row.timestamp > state.lastAt || row.timestamp === state.lastAt && row.id !== state.lastId)\n          state = advanceTrusted(fit, state, row);\n        if (state.status !== "ready") break;\n      }\n      i = end;\n    }\n    return freeze2(state);\n  }\n  function advanceHawkesPredictionState(fit, state, row, { now = Date.now() } = {}) {\n    if (!validFit(fit) || !validState(state, fit) || !timestamp2(now) || fit.trainedAt > now || !row || typeof row.id !== "string" || !row.id.trim() || !finite2(row.coefficient) || row.coefficient < 1 || !timestamp2(row.timestamp) || row.timestamp > now || row.completed === false || row.estimated === true)\n      return freeze2({ ...state, status: "invalid", reason: "invalid-stream-row-or-fit" });\n    return freeze2(advanceTrusted(fit, state, row));\n  }\n  function prediction(fit, state, { now, target, horizon, seconds }) {\n    const model = Array.isArray(fit?.models) ? fit.models.find((value) => value?.target === target) : null;\n    const base = {\n      modelId: HAWKES_MODEL,\n      family: "hawkes",\n      target,\n      horizon,\n      horizonUnit: seconds === null ? "rounds-via-cadence-approximation" : "seconds",\n      evidenceStatus: HAWKES_EVIDENCE,\n      status: "insufficient",\n      probability: null,\n      interval95: null,\n      assumptions: ["continuous-time-events", "future-round-count-mapped-using-training-median-cadence"]\n    };\n    const reason = !validFit(fit) || !timestamp2(now) || fit.trainedAt > now || fit.trainingEnd > now ? "invalid-or-future-fit" : !model ? "unknown-target" : model.status !== "ready" ? model.reason : !validState(state, fit) ? state?.reason || "invalid-prediction-state" : state.lastAt > now ? "future-state" : now - state.lastAt > GAP_MS ? "stale-state" : state.awaitingUnambiguous ? "latest-timestamp-ambiguous" : seconds === null && ![1, 3, 5].includes(horizon) ? "unsupported-round-horizon" : seconds !== null && (!finite2(seconds) || seconds <= 0 || seconds > 86400) ? "unsupported-seconds-horizon" : null;\n    if (reason) return { ...base, reason };\n    const active = state.models.find((value) => value.target === target);\n    if (!active || active.tied || !finite2(active.excitation) || active.excitation < 0)\n      return { ...base, reason: active?.tied ? "simultaneous-event-timestamps" : "invalid-excitation-state" };\n    const p = model.parameters;\n    if (![p?.mu, p?.alpha, p?.beta, p?.branchingRatio].every(finite2) || p.mu <= 0 || p.alpha < 0 || p.beta <= 0 || p.branchingRatio < 0 || p.branchingRatio >= 1 || Math.abs(p.alpha / p.beta - p.branchingRatio) > 1e-8)\n      return { ...base, reason: "invalid-fitted-parameters" };\n    const exposure = seconds === null ? model.cadenceSeconds * horizon : seconds;\n    const excitation = active.excitation * Math.exp(-p.beta * (now - state.lastAt) / 1e3);\n    const integratedExcitation = excitation * -Math.expm1(-p.beta * exposure) / p.beta;\n    let estimate, bounds;\n    if (p.alpha === 0) {\n      const shape = model.uncertainty?.shape, rate = model.uncertainty?.rateSeconds;\n      if (!(shape > 0) || !(rate > 0)) return { ...base, reason: "invalid-null-posterior" };\n      estimate = -Math.expm1(-shape * Math.log1p(exposure / rate));\n      bounds = [0.025, 0.975].map((q) => probability(inverseGammaCDF(q, shape) * exposure / rate));\n    } else {\n      const covariance = model.covariance, integrated = p.mu * exposure + p.alpha * integratedExcitation;\n      const variance = covariance && exposure ** 2 * covariance.varianceMu + integratedExcitation ** 2 * covariance?.varianceAlpha + 2 * exposure * integratedExcitation * covariance?.covarianceMuAlpha;\n      if (!finite2(variance) || variance < -1e-10) return { ...base, reason: "invalid-conditional-uncertainty" };\n      const error = 1.959963984540054 * Math.sqrt(Math.max(0, variance));\n      estimate = probability(integrated);\n      bounds = [probability(integrated - error), probability(integrated + error)];\n    }\n    if (![estimate, ...bounds].every(finite2)) return { ...base, reason: "numerical-failure" };\n    return {\n      ...base,\n      status: "ready",\n      reason: model.reason,\n      probability: estimate,\n      interval95: bounds,\n      trainingSelection: model.trainingSelection,\n      conditionalClustering: model.conditionalClustering,\n      horizonSeconds: exposure,\n      cadenceSeconds: model.cadenceSeconds,\n      conditionalIntensityPerSecond: p.mu + p.alpha * excitation,\n      uncertaintyKind: model.uncertainty.kind,\n      includesModelSelectionUncertainty: false,\n      actualRoundTimingKnown: false,\n      interpretation: "Conditional probability of at least one event in a time exposure; exact next-round timing is unknown."\n    };\n  }\n  function predictHawkes(fit, recentRows = [], { now = Date.now(), target = 100, horizon = 1, state = null } = {}) {\n    return prediction(fit, state ?? prepareHawkesPredictionState(fit, recentRows, { now }), { now, target, horizon, seconds: null });\n  }\n\n  // src/statistics/validation.mjs\n  var GAP_MS2 = 18e4;\n  var VALIDATION_PROTOCOL = "daily-development-then-frozen-confirmation-v1";\n  var finite3 = (value) => typeof value === "number" && Number.isFinite(value);\n  var probability2 = (value) => finite3(value) && value >= 0 && value <= 1;\n  var mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;\n  var clipped = (value) => Math.max(1e-12, Math.min(1 - 1e-12, value));\n  var dayFormatters = /* @__PURE__ */ new Map();\n  var forecastKey = (value) => `${value.modelId}:${value.target}:${value.horizon}`;\n  function localDay(timestamp3, timeZone = "Europe/Kyiv") {\n    if (!dayFormatters.has(timeZone)) dayFormatters.set(timeZone, new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }));\n    const parts = dayFormatters.get(timeZone).formatToParts(timestamp3);\n    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));\n    return `${value.year}-${value.month}-${value.day}`;\n  }\n  function chronologicalFolds(rows, {\n    now = Date.now(),\n    timeZone = "Europe/Kyiv",\n    minTrainDays = 14,\n    minTrainRounds = 2e3,\n    confirmationDays = 14,\n    minDevelopmentDays = 5\n  } = {}) {\n    const today = localDay(now, timeZone), groups = /* @__PURE__ */ new Map();\n    for (let index = 0; index < rows.length; index++) {\n      const day = localDay(rows[index].timestamp, timeZone);\n      if (day >= today) continue;\n      let group = groups.get(day);\n      if (!group) {\n        group = { day, from: index, to: index + 1, count: 0 };\n        groups.set(day, group);\n      }\n      group.to = index + 1;\n      group.count++;\n    }\n    const days = [...groups.values()].sort((a, b) => a.day.localeCompare(b.day));\n    const eligible = days.filter((day, index) => index >= minTrainDays && day.from >= minTrainRounds && day.count >= 30);\n    const count = eligible.length >= confirmationDays + minDevelopmentDays ? confirmationDays : Math.min(7, eligible.length);\n    const split = eligible.length - count;\n    const folds = eligible.map((day, index) => ({\n      ...day,\n      stage: index < split ? "development" : "confirmation",\n      trainingDays: days.filter((prior) => prior.day < day.day).length,\n      trainingCutoff: rows[day.from - 1]?.timestamp ?? null\n    }));\n    return {\n      protocol: VALIDATION_PROTOCOL,\n      timeZone,\n      today,\n      minTrainDays,\n      minTrainRounds,\n      requestedConfirmationDays: confirmationDays,\n      confirmationDays: count,\n      minDevelopmentDays,\n      qualificationPossible: count >= confirmationDays && split >= minDevelopmentDays,\n      availableCompleteDays: days.length,\n      developmentDays: split,\n      folds\n    };\n  }\n  function futureRoundOutcome(rows, index, horizon, target) {\n    if (![1, 3, 5].includes(horizon) || !Number.isInteger(index) || index < 0 || index >= rows.length)\n      return { status: "unknown", reason: "invalid-request" };\n    if (index + horizon >= rows.length) return { status: "unknown", reason: "right-edge-or-next-day" };\n    if (rows[index - 1]?.timestamp === rows[index].timestamp || rows[index + 1]?.timestamp === rows[index].timestamp)\n      return { status: "unknown", reason: "ambiguous-origin-time" };\n    let hit = false, maximum = 1;\n    for (let step = 1; step <= horizon; step++) {\n      const previous = rows[index + step - 1], row = rows[index + step];\n      if (rows[index + step - 1]?.timestamp === row.timestamp || rows[index + step + 1]?.timestamp === row.timestamp)\n        return { status: "unknown", reason: "ambiguous-target-time" };\n      const gap = row.timestamp - previous.timestamp;\n      if (gap <= 0 || gap > GAP_MS2) return { status: "unknown", reason: gap <= 0 ? "unknown-round-order" : "coverage-gap" };\n      hit ||= row.coefficient >= target;\n      maximum = Math.max(maximum, row.coefficient);\n    }\n    return { status: "known", hit, maximum, firstAt: rows[index + 1].timestamp, endAt: rows[index + horizon].timestamp };\n  }\n  function createValidationAccumulator() {\n    return /* @__PURE__ */ new Map();\n  }\n  function recordObservation(accumulator, forecast, { day, baseline, outcome }) {\n    const key = forecastKey(forecast);\n    let record2 = accumulator.get(key);\n    if (!record2) {\n      record2 = {\n        key,\n        modelId: forecast.modelId,\n        family: forecast.family || forecast.modelId,\n        target: forecast.target,\n        horizon: forecast.horizon,\n        issued: 0,\n        unavailable: 0,\n        unknown: 0,\n        unknownReasons: {},\n        days: /* @__PURE__ */ new Map()\n      };\n      accumulator.set(key, record2);\n    }\n    record2.issued++;\n    if (forecast.status !== "ready" || !probability2(forecast.probability) || !probability2(baseline)) {\n      record2.unavailable++;\n      return;\n    }\n    if (outcome.status !== "known") {\n      record2.unknown++;\n      record2.unknownReasons[outcome.reason] = (record2.unknownReasons[outcome.reason] || 0) + 1;\n      return;\n    }\n    let daily = record2.days.get(day);\n    if (!daily) {\n      daily = {\n        day,\n        n: 0,\n        hits: 0,\n        brier: 0,\n        baselineBrier: 0,\n        logLoss: 0,\n        baselineLogLoss: 0,\n        probability: 0,\n        baselineProbability: 0,\n        randomGuessExpectedBrier: 0\n      };\n      record2.days.set(day, daily);\n    }\n    const y = Number(outcome.hit), p = forecast.probability, q = baseline;\n    daily.n++;\n    daily.hits += y;\n    daily.brier += (p - y) ** 2;\n    daily.baselineBrier += (q - y) ** 2;\n    daily.logLoss += -y * Math.log(clipped(p)) - (1 - y) * Math.log1p(-clipped(p));\n    daily.baselineLogLoss += -y * Math.log(clipped(q)) - (1 - y) * Math.log1p(-clipped(q));\n    daily.probability += p;\n    daily.baselineProbability += q;\n    daily.randomGuessExpectedBrier += y ? 1 - q : q;\n  }\n  function signFlipP(values) {\n    if (!values.length) return 1;\n    const observed = values.reduce((sum, value) => sum + value, 0);\n    if (!(observed > 0)) return 1;\n    const size = values.length <= 16 ? 2 ** values.length : 32768;\n    let extreme = 0, seed = 87748946;\n    for (let sample = 0; sample < size; sample++) {\n      let total = 0;\n      for (let j = 0; j < values.length; j++) {\n        let positive;\n        if (values.length <= 16) positive = !!(sample & 1 << j);\n        else {\n          seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;\n          positive = !!(seed & 2147483648);\n        }\n        total += positive ? values[j] : -values[j];\n      }\n      if (total >= observed - 1e-14) extreme++;\n    }\n    return values.length <= 16 ? extreme / size : (extreme + 1) / (size + 1);\n  }\n  function holmCorrection(values) {\n    const sorted = values.map((p, index) => ({ p: probability2(p) ? p : 1, index })).sort((a, b) => a.p - b.p || a.index - b.index);\n    const corrected = Array(values.length).fill(1);\n    let previous = 0;\n    sorted.forEach((value, order) => {\n      previous = Math.max(previous, Math.min(1, value.p * (sorted.length - order)));\n      corrected[value.index] = previous;\n    });\n    return corrected;\n  }\n  function dayBootstrap(days, field, alpha, samples) {\n    if (!days.length) return null;\n    const draws = [];\n    let seed = field === "brier" ? 121743897 : 20107128;\n    for (let sample = 0; sample < samples; sample++) {\n      let sum = 0, n = 0;\n      for (let index = 0; index < days.length; index++) {\n        seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;\n        const day = days[Math.floor(seed / 2 ** 32 * days.length)];\n        sum += day[field === "brier" ? "baselineBrier" : "baselineLogLoss"] - day[field === "brier" ? "brier" : "logLoss"];\n        n += day.n;\n      }\n      draws.push(sum / n);\n    }\n    draws.sort((a, b) => a - b);\n    return [draws[Math.max(0, Math.floor(samples * alpha / 2))], draws[Math.min(samples - 1, Math.ceil(samples * (1 - alpha / 2)) - 1)]];\n  }\n  function summarizeValidation(accumulator, {\n    minDays = 5,\n    minKnown = 200,\n    minEvents = 20,\n    alpha = 0.05,\n    bootstrapSamples = 8192,\n    allowQualification = true\n  } = {}) {\n    const records = [...accumulator.values()];\n    const familySize = Math.max(1, records.length), summaries = records.map((record2) => {\n      const days = [...record2.days.values()].sort((a, b) => a.day.localeCompare(b.day));\n      const sum = (key) => days.reduce((total, day) => total + day[key], 0);\n      const n = sum("n"), hits = sum("hits");\n      const losses = days.map((day) => day.baselineBrier - day.brier);\n      const brierGain = n ? (sum("baselineBrier") - sum("brier")) / n : null;\n      const logLossGain = n ? (sum("baselineLogLoss") - sum("logLoss")) / n : null;\n      const enough = days.length >= minDays && n >= minKnown && hits >= minEvents && n - hits >= minEvents;\n      const brierGainInterval95 = enough ? dayBootstrap(days, "brier", 0.05, bootstrapSamples) : null;\n      const logLossGainInterval95 = enough ? dayBootstrap(days, "log", 0.05, bootstrapSamples) : null;\n      const brierGainSimultaneousInterval = enough ? dayBootstrap(days, "brier", alpha / (2 * familySize), bootstrapSamples) : null;\n      const logLossGainSimultaneousInterval = enough ? dayBootstrap(days, "log", alpha / (2 * familySize), bootstrapSamples) : null;\n      return {\n        key: record2.key,\n        modelId: record2.modelId,\n        family: record2.family,\n        target: record2.target,\n        horizon: record2.horizon,\n        issued: record2.issued,\n        known: n,\n        unknown: record2.unknown,\n        unavailable: record2.unavailable,\n        unknownReasons: { ...record2.unknownReasons },\n        hitCount: hits,\n        hitFrequency: n ? hits / n : null,\n        dayCount: days.length,\n        days,\n        brier: n ? sum("brier") / n : null,\n        baselineBrier: n ? sum("baselineBrier") / n : null,\n        logLoss: n ? sum("logLoss") / n : null,\n        baselineLogLoss: n ? sum("baselineLogLoss") / n : null,\n        meanProbability: n ? sum("probability") / n : null,\n        meanBaselineProbability: n ? sum("baselineProbability") / n : null,\n        frequencyMatchedRandomGuessExpectedBrier: n ? sum("randomGuessExpectedBrier") / n : null,\n        brierGain,\n        logLossGain,\n        brierGainInterval95,\n        logLossGainInterval95,\n        brierGainSimultaneousInterval,\n        logLossGainSimultaneousInterval,\n        rawP: enough ? signFlipP(losses) : 1,\n        sufficient: enough,\n        uncertainty: "approximate paired whole-day bootstrap; conditional on these observed dates",\n        pValueMethod: "one-sided paired day-block sign-flip; symmetry assumption"\n      };\n    });\n    const corrected = holmCorrection(summaries.map((value) => value.rawP));\n    return summaries.map((value, index) => {\n      const qualified = allowQualification && value.sufficient && corrected[index] < alpha && value.brierGainSimultaneousInterval?.[0] > 0 && value.logLossGainSimultaneousInterval?.[0] > 0;\n      return {\n        ...value,\n        adjustedP: corrected[index],\n        multipleTesting: {\n          method: "Holm",\n          hypotheses: summaries.length,\n          alpha,\n          simultaneousIntervalMetrics: 2\n        },\n        qualified,\n        reason: qualified ? "supported-out-of-sample-loss-improvement" : !allowQualification ? "insufficient-separate-validation-days" : !value.sufficient ? "insufficient-validation-support" : "no-corrected-out-of-sample-advantage"\n      };\n    });\n  }\n  function freezeFamilySelection(development) {\n    const selected = /* @__PURE__ */ new Map();\n    for (const model of development.filter((value) => value.sufficient && value.brierGain > 0 && value.logLossGain > 0)) {\n      const key = `${model.target}:${model.horizon}:${model.family}`;\n      const previous = selected.get(key);\n      if (!previous || model.brierGain > previous.brierGain || model.brierGain === previous.brierGain && model.modelId < previous.modelId) selected.set(key, model);\n    }\n    return [...selected.values()].map(({ key, modelId, family, target, horizon }) => ({ key, modelId, family, target, horizon }));\n  }\n  function fixedConsensus(forecasts, members, baselineInterval, { target, horizon }) {\n    const selected = members.filter((member) => member.target === target && member.horizon === horizon);\n    const byFamily = /* @__PURE__ */ new Map();\n    for (const member of selected) {\n      const forecast = forecasts.find((value) => value.modelId === member.modelId && value.target === target && value.horizon === horizon);\n      if (forecast?.status === "ready" && probability2(forecast.probability) && Array.isArray(forecast.interval95) && forecast.interval95.length === 2 && forecast.interval95.every(probability2) && probability2(baselineInterval?.[1]) && forecast.interval95[0] > baselineInterval[1]) byFamily.set(member.family, forecast);\n    }\n    const support = [...byFamily.values()];\n    return {\n      modelId: "fixed-family-consensus-v1",\n      family: "consensus",\n      target,\n      horizon,\n      status: support.length >= 2 ? "ready" : "insufficient",\n      probability: support.length >= 2 ? mean(support.map((value) => value.probability)) : null,\n      interval95: support.length >= 2 ? [Math.min(...support.map((value) => value.interval95[0])), Math.max(...support.map((value) => value.interval95[1]))] : null,\n      agreeingFamilies: [...byFamily.keys()],\n      members: support.map((value) => value.modelId),\n      intervalKind: "envelope-of-member-conditional-intervals-not-calibrated-ensemble-interval",\n      reason: support.length >= 2 ? "frozen-distinct-family-agreement" : "fewer-than-two-distinct-supported-families"\n    };\n  }\n\n  // src/statistics/time-zones.mjs\n  var DAY2 = 86400;\n  var CENTER_STEP_SECONDS = 60;\n  var TIME_ZONE_PROTOCOL = "fixed-clock-development-frozen-confirmation-v1";\n  var DEFAULTS = Object.freeze({\n    minDays: 14,\n    minKnown: 200,\n    minEvents: 20,\n    minEventDays: 5,\n    minDevelopmentKnown: 200,\n    minDevelopmentEvents: 20,\n    minDevelopmentDays: 5,\n    minDevelopmentEventDays: 5,\n    minPositiveDayFraction: 0.7,\n    bootstrapSamples: 8192\n  });\n  var defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));\n  var posterior = (hits, n) => (hits + 0.5) / (n + 1);\n  var circularClockDistance = (a, b) => {\n    const distance = Math.abs(((a - b) % DAY2 + DAY2) % DAY2);\n    return Math.min(distance, DAY2 - distance);\n  };\n  var contains = (zone, second) => circularClockDistance(zone.centerSecond, second) <= zone.radiusSeconds;\n  var counters = () => ({ rounds: 0, hits: 0, exposures: 0, unknown: 0 });\n  var add = (count, observation, target) => {\n    count.exposures++;\n    if (observation.status !== "known") {\n      count.unknown++;\n      return;\n    }\n    count.rounds++;\n    count.hits += Number(observation.coefficient >= target);\n  };\n  function interval95(hits, n) {\n    if (!n) return null;\n    const z = 1.959963984540054, z2 = z * z, p = hits / n, denominator = 1 + z2 / n;\n    const center = (p + z2 / (2 * n)) / denominator;\n    const half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denominator;\n    return [Math.max(0, center - half), Math.min(1, center + half)];\n  }\n  function countPair(zone, observations) {\n    const inside = counters(), outside = counters();\n    for (const observation of observations) add(contains(zone, observation.second) ? inside : outside, observation, zone.target);\n    return { inside, outside };\n  }\n  function mergeCount(to, from) {\n    for (const key of ["rounds", "hits", "exposures", "unknown"]) to[key] += from[key];\n  }\n  var zoneId = (center, radius) => `clock-zone-${center}-${radius}-v1`;\n  async function validateTimeZones(input, {\n    protocol = null,\n    now = Date.now(),\n    timeZone = "Europe/Kyiv",\n    targets = TIME_TARGETS,\n    alpha = 0.05 / 3,\n    yieldTask = defaultYield,\n    onProgress = () => {\n    },\n    validationOptions = {},\n    bootstrapSamples = validationOptions.bootstrapSamples ?? DEFAULTS.bootstrapSamples\n  } = {}) {\n    const thresholds = { ...DEFAULTS, ...validationOptions, bootstrapSamples };\n    const requestedTargets = [...new Set(targets)].filter((target) => TIME_TARGETS.includes(target));\n    const rows = (Array.isArray(input) ? input : []).filter((row) => Number.isSafeInteger(row?.timestamp) && row.timestamp >= 9466848e5 && row.timestamp <= now && Number.isFinite(row.coefficient) && row.coefficient >= 1).slice().sort((a, b) => a.timestamp - b.timestamp);\n    const suppliedProtocol = protocol || chronologicalFolds(rows, { now, timeZone });\n    const today = localDay(now, timeZone), dayGroups = /* @__PURE__ */ new Map();\n    for (let index = 0; index < rows.length; index++) {\n      const clock = localClock(rows[index].timestamp, timeZone);\n      if (!clock || clock.date >= today) continue;\n      const outcome = futureRoundOutcome(rows, index, 1, 10);\n      const crossesDay = outcome.status === "known" && localDay(outcome.endAt, timeZone) !== clock.date;\n      const observation = {\n        timestamp: rows[index].timestamp,\n        second: clock.second,\n        status: crossesDay ? "unknown" : outcome.status,\n        reason: crossesDay ? "right-edge-or-next-day" : outcome.reason,\n        coefficient: outcome.status === "known" && !crossesDay ? rows[index + 1].coefficient : null\n      };\n      if (!dayGroups.has(clock.date)) dayGroups.set(clock.date, []);\n      dayGroups.get(clock.date).push(observation);\n      if (index % 4096 === 4095) await yieldTask();\n    }\n    const folds = suppliedProtocol.folds.filter((fold) => fold.day < today && dayGroups.has(fold.day));\n    const developmentDays = new Set(folds.filter((fold) => fold.stage === "development").map((fold) => fold.day));\n    const confirmationDays = new Set(folds.filter((fold) => fold.stage === "confirmation").map((fold) => fold.day));\n    if ([...developmentDays].some((day) => confirmationDays.has(day)) || developmentDays.size && confirmationDays.size && [...developmentDays].sort().at(-1) >= [...confirmationDays].sort()[0])\n      throw new RangeError("Time-zone protocol requires disjoint chronological development and confirmation dates");\n    const developmentTotals = new Map(requestedTargets.map((target) => [target, counters()]));\n    const grid = /* @__PURE__ */ new Map();\n    for (const day of developmentDays) {\n      for (const observation of dayGroups.get(day)) {\n        for (const target of requestedTargets) add(developmentTotals.get(target), observation, target);\n        for (const radius of TIME_RADII) {\n          for (let gridIndex = Math.ceil((observation.second - radius) / CENTER_STEP_SECONDS); gridIndex <= Math.floor((observation.second + radius) / CENTER_STEP_SECONDS); gridIndex++) {\n            const center = (gridIndex * CENTER_STEP_SECONDS % DAY2 + DAY2) % DAY2;\n            for (const target of requestedTargets) {\n              const key = `${target}:${radius}:${center}`;\n              if (!grid.has(key)) grid.set(key, {\n                target,\n                centerSecond: center,\n                radiusSeconds: radius,\n                inside: counters(),\n                days: /* @__PURE__ */ new Set(),\n                eventDays: /* @__PURE__ */ new Set()\n              });\n              const value = grid.get(key);\n              add(value.inside, observation, target);\n              if (observation.status === "known") {\n                value.days.add(day);\n                if (observation.coefficient >= target) value.eventDays.add(day);\n              }\n            }\n          }\n        }\n      }\n      onProgress({ stage: "time-zone-development", day });\n      await yieldTask();\n    }\n    const frozen = [];\n    for (const target of requestedTargets) for (const radius of TIME_RADII) {\n      const ranked = [...grid.values()].filter((zone) => zone.target === target && zone.radiusSeconds === radius).map((zone) => {\n        const total = developmentTotals.get(target), outsideRounds = total.rounds - zone.inside.rounds;\n        const outsideHits = total.hits - zone.inside.hits;\n        return {\n          ...zone,\n          outsideRounds,\n          outsideHits,\n          lift: posterior(zone.inside.hits, zone.inside.rounds) - posterior(outsideHits, outsideRounds)\n        };\n      }).filter((zone) => zone.lift > 0 && zone.inside.rounds >= thresholds.minDevelopmentKnown && zone.inside.hits >= thresholds.minDevelopmentEvents && zone.outsideRounds >= thresholds.minDevelopmentKnown && zone.days.size >= thresholds.minDevelopmentDays && zone.eventDays.size >= thresholds.minDevelopmentEventDays).sort((a, b) => b.lift - a.lift || a.centerSecond - b.centerSecond);\n      const selected = [];\n      for (const zone of ranked) {\n        if (selected.some((other) => circularClockDistance(zone.centerSecond, other.centerSecond) <= 2 * radius)) continue;\n        selected.push(zone);\n        if (selected.length === 3) break;\n      }\n      for (const zone of selected) {\n        const modelId = zoneId(zone.centerSecond, zone.radiusSeconds);\n        frozen.push({\n          target,\n          centerSecond: zone.centerSecond,\n          radiusSeconds: radius,\n          timeZone,\n          modelId,\n          validationKey: forecastKey({ modelId, target, horizon: 1 }),\n          development: {\n            insideRounds: zone.inside.rounds,\n            insideHits: zone.inside.hits,\n            outsideRounds: zone.outsideRounds,\n            outsideHits: zone.outsideHits,\n            dayCount: zone.days.size,\n            eventDays: zone.eventDays.size,\n            smoothedLift: zone.lift\n          }\n        });\n      }\n    }\n    const accumulator = createValidationAccumulator();\n    const state = frozen.map((zone) => ({\n      zone,\n      trainingInside: counters(),\n      trainingOutside: counters(),\n      inside: counters(),\n      outside: counters(),\n      days: [],\n      dailyForecasts: [],\n      eventDays: 0,\n      insideDays: 0\n    }));\n    const positiveProtocol = suppliedProtocol.qualificationPossible === true && developmentDays.size >= thresholds.minDevelopmentDays && confirmationDays.size >= thresholds.minDays;\n    for (const [day, observations] of [...dayGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {\n      const confirmation = confirmationDays.has(day);\n      for (const value of state) {\n        const { zone, trainingInside, trainingOutside } = value;\n        const pair = countPair(zone, observations);\n        if (confirmation) {\n          const globalRounds = trainingInside.rounds + trainingOutside.rounds;\n          const globalHits = trainingInside.hits + trainingOutside.hits;\n          const baseline = posterior(globalHits, globalRounds);\n          const insideProbability = posterior(trainingInside.hits, trainingInside.rounds);\n          const outsideProbability = posterior(trainingOutside.hits, trainingOutside.rounds);\n          const trainingDays = [...dayGroups.keys()].filter((prior) => prior < day).length;\n          const ready = trainingDays >= (suppliedProtocol.minTrainDays ?? 14) && globalRounds >= (suppliedProtocol.minTrainRounds ?? 2e3);\n          value.dailyForecasts.push({\n            day,\n            probability: insideProbability,\n            outsideProbability,\n            baseline,\n            trainingInsideRounds: trainingInside.rounds,\n            trainingInsideHits: trainingInside.hits,\n            trainingOutsideRounds: trainingOutside.rounds,\n            trainingOutsideHits: trainingOutside.hits,\n            trainingDays,\n            trainingCutoff: dayGroups.get([...dayGroups.keys()].filter((prior) => prior < day).at(-1))?.at(-1)?.timestamp ?? null\n          });\n          for (const observation of observations) {\n            const inside = contains(zone, observation.second);\n            recordObservation(\n              accumulator,\n              {\n                ...zone,\n                family: "time-zone",\n                horizon: 1,\n                probability: inside ? insideProbability : baseline,\n                status: ready ? "ready" : "insufficient"\n              },\n              { day, baseline, outcome: observation.status === "known" ? { status: "known", hit: observation.coefficient >= zone.target } : { status: "unknown", reason: observation.reason } }\n            );\n          }\n          mergeCount(value.inside, pair.inside);\n          mergeCount(value.outside, pair.outside);\n          value.insideDays += Number(pair.inside.rounds > 0);\n          value.eventDays += Number(pair.inside.hits > 0);\n          value.days.push({\n            day,\n            insideRounds: pair.inside.rounds,\n            insideHits: pair.inside.hits,\n            insideExposures: pair.inside.exposures,\n            insideUnknown: pair.inside.unknown,\n            outsideRounds: pair.outside.rounds,\n            outsideHits: pair.outside.hits,\n            outsideExposures: pair.outside.exposures,\n            outsideUnknown: pair.outside.unknown\n          });\n        }\n        mergeCount(trainingInside, pair.inside);\n        mergeCount(trainingOutside, pair.outside);\n      }\n      if (confirmation) onProgress({ stage: "time-zone-confirmation", day, candidates: frozen.length });\n      await yieldTask();\n    }\n    const reports = summarizeValidation(accumulator, {\n      minDays: thresholds.minDays,\n      minKnown: thresholds.minKnown,\n      minEvents: thresholds.minEvents,\n      alpha,\n      bootstrapSamples,\n      allowQualification: positiveProtocol\n    });\n    const byKey = new Map(reports.map((report) => [report.key, report]));\n    const candidates = state.map((value) => {\n      const report = byKey.get(value.zone.validationKey);\n      const insideInterval95 = interval95(value.inside.hits, value.inside.rounds);\n      const outsideInterval95 = interval95(value.outside.hits, value.outside.rounds);\n      const enough = value.inside.rounds >= thresholds.minKnown && value.inside.hits >= thresholds.minEvents && value.inside.rounds - value.inside.hits >= thresholds.minEvents && value.insideDays >= thresholds.minDays && value.eventDays >= thresholds.minEventDays && value.outside.rounds >= thresholds.minKnown;\n      const separated = insideInterval95?.[0] > outsideInterval95?.[1];\n      const positiveDays = report?.days.filter((day) => day.baselineBrier - day.brier > 0 && day.baselineLogLoss - day.logLoss > 0).length || 0;\n      const stable = positiveDays >= Math.ceil(confirmationDays.size * thresholds.minPositiveDayFraction);\n      const qualified = !!(positiveProtocol && enough && separated && stable && report?.qualified);\n      return {\n        ...value.zone,\n        horizon: 1,\n        insideRounds: value.inside.rounds,\n        insideHits: value.inside.hits,\n        outsideRounds: value.outside.rounds,\n        outsideHits: value.outside.hits,\n        insideExposures: value.inside.exposures,\n        outsideExposures: value.outside.exposures,\n        insideUnknown: value.inside.unknown,\n        outsideUnknown: value.outside.unknown,\n        confirmationDays: confirmationDays.size,\n        insideDays: value.insideDays,\n        eventDays: value.eventDays,\n        insideInterval95,\n        outsideInterval95,\n        positiveGainDays: positiveDays,\n        dailyForecasts: value.dailyForecasts,\n        dailyExposure: value.days,\n        validation: report || null,\n        qualified,\n        reason: qualified ? "supported-frozen-heldout-clock-zone" : !positiveProtocol ? "insufficient-separate-validation-days" : !enough ? "insufficient-confirmation-zone-support" : !separated ? "heldout-event-intervals-overlap" : !stable ? "unstable-heldout-day-gains" : report?.reason || "no-confirmation-observations"\n      };\n    });\n    return {\n      modelId: TIME_ZONE_PROTOCOL,\n      protocol: {\n        ...suppliedProtocol,\n        timeZone,\n        centerGridSeconds: CENTER_STEP_SECONDS,\n        radiusSeconds: [...TIME_RADII]\n      },\n      timeZone,\n      generatedAt: now,\n      targets: requestedTargets,\n      candidates,\n      qualifiedZones: candidates.filter((zone) => zone.qualified),\n      frozenCandidates: frozen.map((zone) => ({ ...zone, development: { ...zone.development } })),\n      thresholds,\n      grid: {\n        centerStepSeconds: CENTER_STEP_SECONDS,\n        radiusSeconds: [...TIME_RADII],\n        centersPerTargetRadius: 3,\n        nonOverlapping: true,\n        maxCandidates: requestedTargets.length * TIME_RADII.length * 3\n      },\n      multipleTesting: { method: "Holm within frozen candidates; Bonferroni suite-family allocation", hypotheses: frozen.length, alpha },\n      selectionRule: "DEV positive Jeffreys-smoothed inside-minus-outside frequency lift; at most three nonoverlapping centers per target/radius; no CONF selection",\n      decisionTime: "previous completed round timestamp; next-one-round outcome; cross-day, gap and tied pairs unknown",\n      lossDenominator: "all known decision origins per heldout day; outside-zone predictions equal training-global baseline",\n      intervalMethod: "descriptive Wilson 95% binomial event intervals; whole-day paired bootstrap/sign-flip loss validation",\n      limitations: [\n        "Clock association is not a payout or profitability guarantee.",\n        "Binomial event intervals do not model dependence between rounds; day-block loss inference is approximate.",\n        "Timestamp replay assumes the completed round was available immediately."\n      ]\n    };\n  }\n  function currentQualifiedZones(ledger, now = Date.now()) {\n    if (!ledger || !Number.isSafeInteger(now)) return [];\n    const zones = Array.isArray(ledger.qualifiedZones) ? ledger.qualifiedZones : ledger.candidates || [];\n    return zones.filter((zone) => zone.qualified === true && Number.isFinite(zone.centerSecond) && Number.isFinite(zone.radiusSeconds) && zone.radiusSeconds >= 0 && zone.radiusSeconds <= 120 && (() => {\n      const clock = localClock(now, zone.timeZone || ledger.timeZone || "Europe/Kyiv");\n      return clock !== null && contains(zone, clock.second);\n    })());\n  }\n\n  // src/statistics/suite.mjs\n  var SUITE_MODEL = "independent-statistical-suite-v1";\n  var SUITE_TARGETS = Object.freeze([10, 15, 20, 50, 100]);\n  var SUITE_HORIZONS = Object.freeze([1, 3, 5]);\n  var EVIDENCE = "experimental-unvalidated";\n  var defaultYield2 = () => new Promise((resolve) => setTimeout(resolve, 0));\n  function betaSummary(hits, total) {\n    const alpha = hits + 0.5, beta = total - hits + 0.5;\n    return {\n      hits,\n      total,\n      alpha,\n      beta,\n      probability: alpha / (alpha + beta),\n      interval95: [0.025, 0.975].map((q) => inverseBetaCDF(q, alpha, beta))\n    };\n  }\n  function probabilityHorizon(probability3, horizon) {\n    return -Math.expm1(horizon * Math.log1p(-probability3));\n  }\n  function baselineFor(fits2, target, horizon) {\n    const record2 = fits2.baselines.find((value) => value.target === target);\n    if (!record2?.total) return { probability: null, interval95: null };\n    return {\n      probability: probabilityHorizon(record2.hits / record2.total, horizon),\n      interval95: record2.interval95.map((value) => probabilityHorizon(value, horizon))\n    };\n  }\n  function initialSequenceState(targets) {\n    return { lastAt: null, lastId: null, history: [], ages: Object.fromEntries(targets.map((target) => [target, null])) };\n  }\n  function tiedTimes(rows) {\n    const times = /* @__PURE__ */ new Set();\n    for (let index = 1; index < rows.length; index++) if (rows[index].timestamp === rows[index - 1].timestamp) times.add(rows[index].timestamp);\n    return times;\n  }\n  function advanceSequence(state, row, targets, ambiguous = false) {\n    if (ambiguous) {\n      state.history = [];\n      for (const target of targets) state.ages[target] = null;\n      state.lastAt = row.timestamp;\n      state.lastId = row.id;\n      return;\n    }\n    if (state.lastAt !== null && row.timestamp <= state.lastAt) {\n      state.history = [];\n      for (const target of targets) state.ages[target] = null;\n      state.lastAt = row.timestamp;\n      state.lastId = row.id;\n      return;\n    }\n    if (state.lastAt !== null && (row.timestamp - state.lastAt > GAP_MS2 || row.timestamp <= state.lastAt)) {\n      state.history = [];\n      for (const target of targets) state.ages[target] = null;\n    }\n    for (const target of targets) state.ages[target] = row.coefficient >= target ? 0 : state.ages[target] === null ? null : state.ages[target] + 1;\n    state.history.push(row.coefficient);\n    if (state.history.length > 20) state.history.shift();\n    state.lastAt = row.timestamp;\n    state.lastId = row.id;\n  }\n  function sequenceFlag(kind, rule, state, target) {\n    if (kind === "cycle") return state.ages[target] === null ? null : Number(state.ages[target] >= rule.cycleAge);\n    return state.history.length < 20 ? null : Number(state.history.filter((value) => value >= target).length >= 3 || state.history.slice(-5).filter((value) => value >= target).length >= 2);\n  }\n  function fitSequence(rows, targets) {\n    const ambiguous = tiedTimes(rows);\n    const gaps = Object.fromEntries(targets.map((target) => [target, []])), first = initialSequenceState(targets);\n    for (const row of rows) {\n      if (ambiguous.has(row.timestamp)) {\n        advanceSequence(first, row, targets, true);\n        continue;\n      }\n      if (first.lastAt !== null && row.timestamp > first.lastAt && row.timestamp - first.lastAt <= GAP_MS2) {\n        for (const target of targets) if (row.coefficient >= target && first.ages[target] !== null) gaps[target].push(first.ages[target] + 1);\n      }\n      advanceSequence(first, row, targets);\n    }\n    const rules = targets.map((target) => ({\n      target,\n      cycleAge: gaps[target].length ? Math.max(1, Math.ceil(gaps[target].reduce((a, b) => a + b, 0) / gaps[target].length)) : null,\n      events: rows.filter((row) => row.coefficient >= target).length,\n      cycle: [[0, 0], [0, 0]],\n      cluster: [[0, 0], [0, 0]]\n    }));\n    const state = initialSequenceState(targets);\n    for (const row of rows) {\n      if (ambiguous.has(row.timestamp)) {\n        advanceSequence(state, row, targets, true);\n        continue;\n      }\n      if (state.lastAt !== null && (row.timestamp <= state.lastAt || row.timestamp - state.lastAt > GAP_MS2)) {\n        state.history = [];\n        for (const target of targets) state.ages[target] = null;\n      }\n      for (const rule of rules) for (const kind of ["cycle", "cluster"]) {\n        const flag = sequenceFlag(kind, rule, state, rule.target);\n        if (flag !== null) {\n          rule[kind][flag][0] += Number(row.coefficient >= rule.target);\n          rule[kind][flag][1]++;\n        }\n      }\n      advanceSequence(state, row, targets);\n    }\n    const jointSummary = ([hits, total]) => {\n      const value = betaSummary(hits, total);\n      return { ...value, intervalJoint95: [0.0125, 0.9875].map((q) => inverseBetaCDF(q, value.alpha, value.beta)) };\n    };\n    return rules.map((rule) => ({\n      ...rule,\n      cycle: rule.cycle.map(jointSummary),\n      cluster: rule.cluster.map(jointSummary),\n      ready: rows.length >= 500 && rule.events >= 20\n    }));\n  }\n  function sequenceForecasts(fits2, state, now) {\n    const records = [];\n    for (const rule of fits2.sequence) for (const kind of ["cycle", "cluster"]) for (const horizon of SUITE_HORIZONS) {\n      const synthetic = { history: [...state.history], ages: { ...state.ages } };\n      const occurrences = /* @__PURE__ */ new Map();\n      let survival = 1, lowerSurvival = 1, upperSurvival = 1;\n      let reason = !rule.ready ? "insufficient-training-events" : state.lastAt === null || now - state.lastAt > GAP_MS2 || now < state.lastAt ? "stale-current-segment" : null;\n      for (let step = 0; !reason && step < horizon; step++) {\n        const flag = sequenceFlag(kind, rule, synthetic, rule.target), bin = flag === null ? null : rule[kind][flag];\n        if (!bin || bin.total < 100 || bin.hits < 5) {\n          reason = "insufficient-calibrated-feature-support";\n          break;\n        }\n        const repetition = occurrences.get(flag) || 0;\n        survival *= (bin.beta + repetition) / (bin.alpha + bin.beta + repetition);\n        lowerSurvival *= 1 - bin.intervalJoint95[1];\n        upperSurvival *= 1 - bin.intervalJoint95[0];\n        occurrences.set(flag, repetition + 1);\n        synthetic.ages[rule.target] = synthetic.ages[rule.target] === null ? null : synthetic.ages[rule.target] + 1;\n        synthetic.history.push(1);\n        if (synthetic.history.length > 20) synthetic.history.shift();\n      }\n      records.push({\n        modelId: `${kind}-calibrated-v1`,\n        family: "sequence",\n        target: rule.target,\n        horizon,\n        status: reason ? "insufficient" : "ready",\n        reason,\n        probability: reason ? null : 1 - survival,\n        interval95: reason ? null : [1 - upperSurvival, 1 - lowerSurvival],\n        intervalKind: "at-least-95-percent-bonferroni-two-feature-bin-posterior-envelope",\n        evidenceStatus: EVIDENCE,\n        horizonUnit: "completed-rounds",\n        generatedAt: now,\n        feature: kind === "cycle" ? "age-at-least-training-mean-renewal-gap" : "three-in-twenty-or-two-in-five"\n      });\n    }\n    return records;\n  }\n  function fitCurrentSuite(input, { now = Date.now(), targets = SUITE_TARGETS, timeZone = "Europe/Kyiv", lookbackDays = 90 } = {}) {\n    const days = Number.isFinite(lookbackDays) && lookbackDays > 0 && lookbackDays <= 90 ? lookbackDays : 90;\n    const rows = normalizeRounds(input, now).reverse().filter((row) => row.timestamp >= now - days * 864e5);\n    const acceptedTargets = [...new Set(targets)].filter((value) => SUITE_TARGETS.includes(value));\n    return {\n      modelId: SUITE_MODEL,\n      evidenceStatus: EVIDENCE,\n      trainedAt: now,\n      dataCutoff: rows.at(-1)?.timestamp ?? null,\n      trainingRoundCount: rows.length,\n      timeZone,\n      targets: acceptedTargets,\n      lookbackDays: days,\n      baselines: acceptedTargets.map((target) => ({ target, ...betaSummary(rows.filter((row) => row.coefficient >= target).length, rows.length) })),\n      sequence: fitSequence(rows, acceptedTargets),\n      survival: fitSurvivalModels(rows, { now, targets: acceptedTargets }),\n      time: fitTimeModels(rows, { now, targets: acceptedTargets, timeZone }),\n      hawkes: fitHawkes(rows, { now, targets: acceptedTargets })\n    };\n  }\n  function stateFromRows(fits2, rows, now) {\n    const sequence = initialSequenceState(fits2.targets);\n    const ambiguous = tiedTimes(rows);\n    for (const row of rows) advanceSequence(sequence, row, fits2.targets, ambiguous.has(row.timestamp));\n    return { sequence, hawkes: prepareHawkesPredictionState(fits2.hawkes, rows, { now }) };\n  }\n  function predictFromState(fits2, state, now, { includeTimeIntervals = true, timeIntervalMembers = null } = {}) {\n    const forecasts = sequenceForecasts(fits2, state.sequence, now);\n    for (const target of fits2.targets) {\n      forecasts.push(...predictSurvivalAtAge(fits2.survival, {\n        target,\n        ageRounds: state.sequence.ages[target],\n        now,\n        lastAt: state.sequence.lastAt\n      }).map((value) => ({ ...value, family: "survival" })));\n      const intervalModelIds = timeIntervalMembers === null ? null : timeIntervalMembers.filter((value) => value.target === target).map((value) => value.modelId);\n      forecasts.push(...predictTimeModels(fits2.time, {\n        timestamp: now,\n        target,\n        horizon: 1,\n        includeIntervals: includeTimeIntervals && (intervalModelIds === null || intervalModelIds.length > 0),\n        intervalModelIds\n      }));\n      for (const horizon of SUITE_HORIZONS) forecasts.push(predictHawkes(fits2.hawkes, [], { now, target, horizon, state: state.hawkes }));\n    }\n    return forecasts;\n  }\n  function predictCurrentSuite(fits2, recentInput, { now = Date.now(), validation: validation2 = null } = {}) {\n    const rows = normalizeRounds(recentInput, now).reverse();\n    if (fits2?.modelId !== SUITE_MODEL || !fits2.targets || !fits2.dataCutoff || fits2.dataCutoff > now || fits2.trainedAt > now)\n      return { estimates: [], consensus: { status: "unavailable", reason: "invalid-or-future-fit", signals: [] }, zones: [] };\n    const state = stateFromRows(fits2, rows, now);\n    const estimates = predictFromState(fits2, state, now).map((value) => {\n      const verified = validation2?.models?.find((item) => item.key === forecastKey(value));\n      return {\n        ...value,\n        validation: verified?.qualified ? "qualified-on-confirmation-dates" : "unvalidated-or-no-demonstrated-advantage",\n        validationReason: verified?.reason || "no-independent-validation"\n      };\n    });\n    const members = validation2?.frozenMembers || [], signals = [];\n    for (const target of fits2.targets) for (const horizon of SUITE_HORIZONS) {\n      const model = fixedConsensus(estimates, members, baselineFor(fits2, target, horizon).interval95, { target, horizon });\n      const combo = validation2?.consensus?.find((value) => value.key === forecastKey(model));\n      const qualifiedMembers = members.filter((member) => member.target === target && member.horizon === horizon && validation2?.models?.some((value) => value.key === member.key && value.qualified));\n      const supportedFamilies = new Set(qualifiedMembers.map((value) => value.family));\n      const allFrozenMembersQualified = qualifiedMembers.length === members.filter((value) => value.target === target && value.horizon === horizon).length;\n      if (model.status === "ready" && combo?.qualified && supportedFamilies.size >= 2 && allFrozenMembersQualified)\n        signals.push({ ...model, evidenceStatus: "conditionally-supported-in-this-walk-forward-check", informationalOnly: true });\n    }\n    const zones = currentQualifiedZones(validation2?.timeZones, now);\n    return { estimates, consensus: {\n      status: signals.length ? "ready" : "abstain",\n      signals,\n      reason: signals.length ? "confirmed-frozen-distinct-family-combination" : "no-confirmed-combination-with-current-agreement"\n    }, zones };\n  }\n  async function evaluateFold(fits2, train, test, fold, accumulator, consensusAccumulator, frozenMembers, yieldTask, onForecast) {\n    const state = stateFromRows(fits2, train.slice(-2e3), test[0]?.timestamp ?? fits2.trainedAt);\n    for (let index = 0; index < test.length; index++) {\n      const row = test[index], now = row.timestamp;\n      advanceSequence(state.sequence, row, fits2.targets);\n      state.hawkes = advanceHawkesPredictionState(fits2.hawkes, state.hawkes, row, { now });\n      const forecasts = predictFromState(fits2, state, now, {\n        includeTimeIntervals: frozenMembers.some((value) => value.family === "time"),\n        timeIntervalMembers: frozenMembers.filter((value) => value.family === "time")\n      });\n      if (onForecast) onForecast({\n        day: fold.day,\n        stage: fold.stage,\n        issuedAt: now,\n        forecasts: forecasts.map(({ modelId, target, horizon, probability: probability3, status }) => ({ modelId, target, horizon, probability: probability3, status }))\n      });\n      for (const forecast of forecasts) {\n        if (index % forecast.horizon !== 0) continue;\n        const baseline = baselineFor(fits2, forecast.target, forecast.horizon).probability;\n        const outcome = futureRoundOutcome(test, index, forecast.horizon, forecast.target);\n        recordObservation(accumulator, forecast, { day: fold.day, baseline, outcome });\n      }\n      if (consensusAccumulator && frozenMembers.length) for (const target of fits2.targets) for (const horizon of SUITE_HORIZONS) {\n        if (index % horizon !== 0) continue;\n        const baseline = baselineFor(fits2, target, horizon);\n        const combo = fixedConsensus(forecasts, frozenMembers, baseline.interval95, { target, horizon });\n        recordObservation(consensusAccumulator, combo, {\n          day: fold.day,\n          baseline: baseline.probability,\n          outcome: futureRoundOutcome(test, index, horizon, target)\n        });\n      }\n      if (index % 512 === 511) await yieldTask();\n    }\n  }\n  async function runStatisticalSuite(input, {\n    now = Date.now(),\n    onProgress = () => {\n    },\n    targets = SUITE_TARGETS,\n    timeZone = "Europe/Kyiv",\n    confirmationDays = 14,\n    minTrainDays = 14,\n    minTrainRounds = 2e3,\n    yieldTask = defaultYield2,\n    bootstrapSamples = 8192,\n    onForecast = null,\n    lookbackDays = 90\n  } = {}) {\n    const normalized = normalizeRounds(input, now).reverse();\n    const days = Number.isFinite(lookbackDays) && lookbackDays > 0 && lookbackDays <= 90 ? lookbackDays : 90;\n    const rows = normalized.filter((row) => row.timestamp >= now - days * 864e5);\n    const claimAlpha = 0.05 / 3;\n    const protocol = chronologicalFolds(rows, { now, timeZone, minTrainDays, minTrainRounds, confirmationDays });\n    const development = createValidationAccumulator(), confirmation = createValidationAccumulator(), combinations = createValidationAccumulator();\n    let developmentReport = [], frozenMembers = [], frozen = false;\n    for (let index = 0; index < protocol.folds.length; index++) {\n      const fold = protocol.folds[index];\n      if (fold.stage === "confirmation" && !frozen) {\n        developmentReport = summarizeValidation(development, { bootstrapSamples, alpha: claimAlpha, allowQualification: protocol.developmentDays >= 5 });\n        frozenMembers = freezeFamilySelection(developmentReport);\n        frozen = true;\n      }\n      onProgress({ stage: "walk-forward", fold: index + 1, folds: protocol.folds.length, day: fold.day, partition: fold.stage });\n      await yieldTask();\n      const train = rows.slice(0, fold.from), test = rows.slice(fold.from, fold.to);\n      const fits3 = fitCurrentSuite(train, { now: train.at(-1).timestamp, targets, timeZone, lookbackDays: days });\n      await evaluateFold(\n        fits3,\n        train,\n        test,\n        fold,\n        fold.stage === "development" ? development : confirmation,\n        fold.stage === "confirmation" ? combinations : null,\n        fold.stage === "confirmation" ? frozenMembers : [],\n        yieldTask,\n        onForecast\n      );\n    }\n    if (!frozen) developmentReport = summarizeValidation(development, { bootstrapSamples, allowQualification: false });\n    const models = summarizeValidation(confirmation, {\n      bootstrapSamples,\n      minDays: confirmationDays,\n      alpha: claimAlpha,\n      allowQualification: protocol.qualificationPossible\n    });\n    const consensus = summarizeValidation(combinations, {\n      bootstrapSamples,\n      minDays: confirmationDays,\n      alpha: claimAlpha,\n      allowQualification: protocol.qualificationPossible\n    });\n    const validation2 = {\n      protocol: { ...protocol, folds: protocol.folds.map(({ day, stage, trainingDays, trainingCutoff, count }) => ({ day, stage, trainingDays, trainingCutoff, observedRounds: count })) },\n      development: developmentReport,\n      frozenMembers,\n      models,\n      consensus,\n      multipleTestingBudget: {\n        totalAlpha: 0.05,\n        models: claimAlpha,\n        consensus: claimAlpha,\n        timeZones: claimAlpha,\n        method: "Bonferroni across three claim families; Holm within each family"\n      },\n      selectionRule: "development-supported positive Brier/log gain ranked per target/horizon/family; fixed lower-bound agreement; equal-weight supporting families; independent confirmation required",\n      limitations: [\n        "Whole-day bootstrap/sign-flip assumes adequately exchangeable day blocks and is approximate.",\n        "Timestamp replay assumes immediate availability; real feed delivery and game actions are not tested.",\n        "Several models use the same observations; distinct families are not proof of statistical independence.",\n        "Next-k any-event probability is neither payout probability nor profitability of a particular stake.",\n        "Hawkes maps round horizons using training cadence; clock models predict only next round near the known origin time."\n      ]\n    };\n    validation2.timeZones = await validateTimeZones(rows, {\n      protocol,\n      now,\n      timeZone,\n      targets,\n      alpha: claimAlpha,\n      yieldTask,\n      onProgress,\n      bootstrapSamples\n    });\n    onProgress({ stage: "current-fit", fold: protocol.folds.length, folds: protocol.folds.length });\n    await yieldTask();\n    const fits2 = fitCurrentSuite(rows, { now, targets, timeZone, lookbackDays: days });\n    const current = predictCurrentSuite(fits2, rows.slice(-2e3), { now, validation: validation2 });\n    onProgress({ stage: "complete", folds: protocol.folds.length });\n    return {\n      modelId: SUITE_MODEL,\n      evidenceStatus: EVIDENCE,\n      generatedAt: now,\n      history: {\n        inputCount: Array.isArray(input) ? input.length : 0,\n        rawInputCount: Array.isArray(input) ? input.length : 0,\n        normalizedCount: normalized.length,\n        excludedOutsideLookback: normalized.length - rows.length,\n        acceptedCount: rows.length,\n        lookbackDays: days,\n        observedDayCount: protocol.availableCompleteDays + Number(!!rows.length && localDay(rows.at(-1).timestamp, timeZone) === protocol.today),\n        dataQuality: { renewal: fits2.survival.diagnostics, clockExposure: "all normalized source records; equal-time records are not silently deduplicated" },\n        firstAt: rows[0]?.timestamp ?? null,\n        lastAt: rows.at(-1)?.timestamp ?? null,\n        eventCounts: targets.map((target) => ({ target, count: rows.filter((row) => row.coefficient >= target).length }))\n      },\n      validation: validation2,\n      ...current,\n      fits: fits2\n    };\n  }\n\n  // src/statistics/worker.mjs\n  var generation = null;\n  var fits = null;\n  var validation = null;\n  var publicKeys = ["modelId", "evidenceStatus", "generatedAt", "history", "validation", "estimates", "consensus", "zones"];\n  var reportOf = (result) => Object.fromEntries(publicKeys.filter((key) => Object.hasOwn(result, key)).map((key) => [key, result[key]]));\n  self.onmessage = async (event) => {\n    const data = event?.data;\n    if (!data || !Number.isSafeInteger(data.generation) || !Array.isArray(data.rows)) return;\n    try {\n      if (data.type === "train") {\n        generation = data.generation;\n        fits = null;\n        validation = null;\n        const id = generation;\n        const result = await runStatisticalSuite(data.rows, {\n          now: data.now,\n          onProgress(progress) {\n            if (generation === id) self.postMessage({ type: "progress", generation: id, progress });\n          }\n        });\n        if (generation !== id) return;\n        fits = result.fits;\n        validation = result.validation;\n        if (!fits) throw Error("Не удалось рассчитать параметры моделей");\n        self.postMessage({ type: "trained", generation: id, report: reportOf(result) });\n      } else if (data.type === "predict" && generation === data.generation && fits) {\n        const forecast = predictCurrentSuite(fits, data.rows, { now: data.now, validation });\n        self.postMessage({ type: "predicted", generation, predictionId: data.predictionId, now: data.now, forecast });\n      }\n    } catch (error) {\n      if (generation === data.generation) self.postMessage({\n        type: "error",\n        generation,\n        message: String(error?.message || error || "Ошибка статистического расчёта").slice(0, 350)\n      });\n    }\n  };\n})();\n' : "";
  var PUBLIC_KEYS = ["modelId", "evidenceStatus", "generatedAt", "sourceLastAt", "sourceLastId", "sourceHeadSignature", "history", "validation", "estimates", "consensus", "zones"];
  var PRIVATE_KEYS = /* @__PURE__ */ new Set(["fits", "rows", "rounds", "rawRows", "raw", "samples", "observations", "losses", "residuals", "trainingRows"]);
  function safeValue(value, depth = 0) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (depth > 16 || !value || typeof value !== "object" || ArrayBuffer.isView(value)) return null;
    if (Array.isArray(value)) return Object.freeze(value.map((item) => safeValue(item, depth + 1)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return null;
    const result = {};
    for (const [key, item] of Object.entries(value)) if (!PRIVATE_KEYS.has(key)) result[key] = safeValue(item, depth + 1);
    return Object.freeze(result);
  }
  function publicStatisticsReport(value) {
    const result = {};
    for (const key of PUBLIC_KEYS) if (value && Object.hasOwn(value, key)) result[key] = safeValue(value[key]);
    return Object.freeze(result);
  }
  var messageOf = (error) => String(error?.message || error || "Ошибка статистического расчёта").slice(0, 350);
  var interrupted = () => Object.assign(Error("Расчёт отложен, пока работают автонажатия"), { name: "StatisticsDeferred" });
  var cancelled = () => Object.assign(Error("Расчёт заменён или остановлен"), { name: "StatisticsCancelled" });
  var taskYield = () => new Promise((resolve) => setTimeout(resolve, 0));
  function createStatisticsRunner({
    onChange = () => {
    },
    now = Date.now,
    canRunFallback = () => true,
    WorkerClass = globalThis.Worker,
    BlobClass = globalThis.Blob,
    createObjectURL = (value) => URL.createObjectURL(value),
    revokeObjectURL = (value) => URL.revokeObjectURL(value),
    workerSource = EMBEDDED_WORKER,
    runSuite = runStatisticalSuite,
    predictSuite = predictCurrentSuite,
    yieldTask = taskYield
  } = {}) {
    let stopped = false, generation = 0, predictionId = 0, worker = null, workerURL = null;
    let workerDisabled = false, runningFallback = false, pending = null, latestPrediction = null;
    let fits = null, validation = null, status = "idle", mode = null, progress = null;
    let report = null, forecast = null, forecastAt = null, message = "Статистические модели ещё не рассчитаны";
    const current = (id) => !stopped && id === generation;
    const fallbackAllowed = () => {
      try {
        return canRunFallback() === true;
      } catch {
        return false;
      }
    };
    function state() {
      return { status, mode, progress, report, forecast, forecastAt, message, generation };
    }
    function notify() {
      if (!stopped) {
        try {
          onChange(state());
        } catch {
        }
      }
    }
    function disposeWorker() {
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        try {
          worker.terminate();
        } catch {
        }
        worker = null;
      }
      if (workerURL !== null) {
        try {
          revokeObjectURL(workerURL);
        } catch {
        }
        workerURL = null;
      }
    }
    function fail(error) {
      status = "error";
      message = messageOf(error);
      pending = null;
      fits = null;
      validation = null;
      forecast = null;
      forecastAt = null;
      disposeWorker();
      notify();
    }
    function acceptForecast(value, request) {
      forecast = publicStatisticsReport({
        ...value,
        generatedAt: request.now,
        sourceLastAt: request.lastAt,
        sourceLastId: request.lastId,
        sourceHeadSignature: request.headSignature
      });
      forecastAt = request.now;
      notify();
    }
    function submitPrediction() {
      if (!latestPrediction || status !== "ready" || stopped) return;
      const request = latestPrediction, id = generation;
      if (worker) {
        try {
          worker.postMessage({ type: "predict", generation: id, predictionId: request.id, rows: request.rows, now: request.now });
        } catch (error) {
          fail(error);
        }
      } else if (fits) {
        try {
          const result = predictSuite(fits, request.rows, { now: request.now, validation });
          if (current(id) && request.id === latestPrediction?.id) acceptForecast(result, request);
        } catch (error) {
          fail(error);
        }
      }
    }
    async function runMain(job) {
      if (!current(job.id) || runningFallback) return;
      if (!fallbackAllowed()) {
        status = "waiting";
        mode = "main-thread";
        message = "Модели ждут: тяжёлый расчёт начнётся после выключения авто";
        notify();
        return;
      }
      runningFallback = true;
      status = "training";
      mode = "main-thread";
      message = "Статистическая проверка по дням";
      notify();
      try {
        await yieldTask();
        if (!current(job.id)) throw cancelled();
        if (!fallbackAllowed()) throw interrupted();
        const result = await runSuite(job.rows, {
          now: job.now,
          onProgress(value) {
            if (current(job.id)) {
              progress = safeValue(value);
              notify();
            }
          },
          async yieldTask() {
            if (!current(job.id)) throw cancelled();
            if (!fallbackAllowed()) throw interrupted();
            await yieldTask();
            if (!current(job.id)) throw cancelled();
            if (!fallbackAllowed()) throw interrupted();
          }
        });
        if (!current(job.id)) return;
        if (!result?.fits) throw Error("Статистические модели не вернули рассчитанные параметры");
        fits = result.fits;
        validation = result.validation;
        report = publicStatisticsReport(result);
        job.rows = null;
        pending = null;
        status = "ready";
        message = "Модели рассчитаны; преимущество подтверждается только отдельной проверкой";
        notify();
        submitPrediction();
      } catch (error) {
        if (!current(job.id)) return;
        if (error?.name === "StatisticsDeferred") {
          status = "waiting";
          message = "Расчёт отложен, пока работают автонажатия";
          notify();
        } else fail(error);
      } finally {
        runningFallback = false;
        if (!stopped && pending && pending.id !== job.id) void launch(pending);
      }
    }
    function launch(job) {
      if (!current(job.id) || runningFallback) return Promise.resolve(false);
      if (!workerDisabled && typeof WorkerClass === "function" && typeof BlobClass === "function" && workerSource) {
        try {
          workerURL = createObjectURL(new BlobClass([workerSource], { type: "text/javascript" }));
          worker = new WorkerClass(workerURL);
          status = "training";
          mode = "worker";
          message = "Статистическая проверка по дням";
          notify();
          worker.onmessage = (event) => {
            const data = event?.data;
            if (!current(job.id) || data?.generation !== job.id) return;
            if (data.type === "progress") {
              progress = safeValue(data.progress);
              notify();
            } else if (data.type === "trained") {
              if (pending?.id === job.id) pending.rows = null;
              report = publicStatisticsReport(data.report);
              pending = null;
              status = "ready";
              message = "Модели рассчитаны; преимущество подтверждается только отдельной проверкой";
              notify();
              submitPrediction();
            } else if (data.type === "predicted" && data.predictionId === latestPrediction?.id) acceptForecast(data.forecast, latestPrediction);
            else if (data.type === "error") fail(data.message);
          };
          worker.onerror = (event) => {
            if (!current(job.id)) return;
            event?.preventDefault?.();
            disposeWorker();
            workerDisabled = true;
            if (pending) void runMain(pending);
            else fail("Фоновый расчёт остановлен браузером; пересчитай модели при выключенном авто");
          };
          worker.postMessage({ type: "train", generation: job.id, rows: job.rows, now: job.now });
          return Promise.resolve(true);
        } catch {
          disposeWorker();
          workerDisabled = true;
        }
      }
      return runMain(job);
    }
    function train(rows, { now: at = now() } = {}) {
      if (stopped) return Promise.resolve(false);
      if (!Array.isArray(rows) || !Number.isSafeInteger(at) || at < 9466848e5) {
        generation++;
        fail("Некорректная история или время статистического расчёта");
        return Promise.resolve(false);
      }
      generation++;
      disposeWorker();
      fits = null;
      validation = null;
      forecast = null;
      forecastAt = null;
      progress = null;
      const job = { id: generation, rows, now: at };
      pending = job;
      if (runningFallback) {
        status = "training";
        message = "Предыдущий расчёт завершается; новая история ожидает";
        notify();
        return Promise.resolve(true);
      }
      void launch(job);
      return Promise.resolve(true);
    }
    function predict(rows, { now: at = now() } = {}) {
      if (stopped || !Array.isArray(rows) || !Number.isSafeInteger(at) || at < 9466848e5) return false;
      const normalized = normalizeRounds(rows, at), lastAt = normalized[0]?.timestamp ?? null;
      const headIds = [...new Set(normalized.filter((row) => row.timestamp === lastAt).map((row) => row.id))].sort();
      const signature = headIds.length ? JSON.stringify(headIds) : null;
      const headSignature = signature !== null && signature.length <= 2e3 ? signature : null;
      latestPrediction = { id: ++predictionId, rows: normalized, now: at, lastAt, lastId: normalized[0]?.id ?? null, headSignature };
      if (forecast && (forecast.sourceLastAt !== lastAt || forecast.sourceHeadSignature !== headSignature)) {
        forecast = null;
        forecastAt = null;
        notify();
      }
      submitPrediction();
      return true;
    }
    function resume() {
      if (stopped || status !== "waiting" || !pending || runningFallback || !fallbackAllowed()) return false;
      void launch(pending);
      return true;
    }
    function stop() {
      if (stopped) return;
      stopped = true;
      generation++;
      disposeWorker();
      pending = null;
      latestPrediction = null;
      fits = null;
      validation = null;
      status = "stopped";
      forecast = null;
      forecastAt = null;
      report = null;
      progress = null;
    }
    return { train, predict, resume, stop, get state() {
      return state();
    } };
  }

  // src/rare-alerts.mjs
  var MODEL3 = "rare-alert-v1";
  var RESULT_GRACE_MS2 = 18e4;
  var MAX_ALERTS = 100;
  var BIG_MODEL = "hardened-dynamic-windows-v4";
  var RARE_MODEL = "rare-window-v1";
  var RARE_ARCHIVE_MODEL2 = "rare-window-archive-v1";
  var BIG_SOURCE = "existing-big-opportunity";
  var BETA_SOURCE = "beta-window-frequency";
  var MINUTE4 = 6e4;
  var POLL_FRESH_MS = 12e3;
  var MIN_TIMESTAMP8 = 9466848e5;
  var MAX_TIMESTAMP6 = 864e13;
  var STATUSES = /* @__PURE__ */ new Set(["pending", "hit", "miss", "unknown"]);
  var record3 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  var finite4 = (value) => typeof value === "number" && Number.isFinite(value);
  var timestamp6 = (value) => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP8 && value <= MAX_TIMESTAMP6;
  var validNow2 = (value) => timestamp6(value) && value <= MAX_TIMESTAMP6 - 30 * MINUTE4;
  var safeTarget = (value) => Number.isSafeInteger(value) && value >= 100;
  function validTimes(value) {
    return record3(value) && safeTarget(value.target) && [value.generatedAt, value.start, value.end].every(timestamp6) && Number.isSafeInteger(value.windowMs) && value.windowMs > 0 && value.windowMs <= 10 * MINUTE4 && value.end - value.start === value.windowMs && value.start - value.generatedAt >= 2 * MINUTE4 && value.start - value.generatedAt <= 15 * MINUTE4;
  }
  function candidateFromBig(value, now) {
    if (!record3(value) || value.model !== BIG_MODEL || value.channel !== "big" || value.evidenceStatus !== EVIDENCE_STATUS || value.scoreKind !== "heuristic" || !finite4(value.heuristicScore) || value.heuristicScore < 0 || value.heuristicScore > 100 || !validTimes(value) || value.start < value.generatedAt + 3 * MINUTE4 || value.windowMs > 6 * MINUTE4 || value.end > value.generatedAt + 9 * MINUTE4 || value.generatedAt > now || value.start <= now) return null;
    return {
      source: BIG_SOURCE,
      sourceModel: BIG_MODEL,
      target: value.target,
      generatedAt: value.generatedAt,
      start: value.start,
      end: value.end,
      windowMs: value.windowMs
    };
  }
  function candidateFromBeta(value, now) {
    if (!record3(value) || ![RARE_MODEL, RARE_ARCHIVE_MODEL2].includes(value.model) || value.source !== BETA_SOURCE || value.evidenceStatus !== EVIDENCE_STATUS || value.target !== 100) return null;
    const candidate = { ...value, windowMs: value.end - value.start };
    if (!validTimes(candidate) || candidate.generatedAt > now || candidate.start <= now) return null;
    return {
      source: BETA_SOURCE,
      sourceModel: candidate.model,
      target: candidate.target,
      generatedAt: candidate.generatedAt,
      start: candidate.start,
      end: candidate.end,
      windowMs: candidate.windowMs
    };
  }
  function keyOf(value) {
    return `${MODEL3}:${value.source}:${value.generatedAt}:${value.start}:${value.end}:${value.target}:${value.acceptedAt}`;
  }
  function validResult(value, now) {
    if (value.status === "pending") {
      return value.actual === void 0 && value.actualAt === void 0 && value.resolvedAt === void 0;
    }
    if (!timestamp6(value.resolvedAt) || value.resolvedAt < value.acceptedAt || value.resolvedAt > now) return false;
    if (value.status === "hit") {
      return finite4(value.actual) && value.actual >= value.target && timestamp6(value.actualAt) && value.actualAt >= value.start && value.actualAt <= value.end && value.actualAt <= value.resolvedAt;
    }
    if (value.status === "miss") {
      return finite4(value.actual) && value.actual >= 1 && value.actual < value.target && value.actualAt === value.end && value.resolvedAt > value.end;
    }
    return value.resolvedAt > value.end + RESULT_GRACE_MS2 && (value.actual === null || finite4(value.actual) && value.actual >= 1 && value.actual < value.target) && (value.actual === null ? value.actualAt === null : timestamp6(value.actualAt) && value.actualAt >= value.start && value.actualAt <= value.end);
  }
  function validEntry(value, now) {
    if (!record3(value) || value.model !== MODEL3 || value.evidenceStatus !== EVIDENCE_STATUS || !validTimes(value) || !timestamp6(value.acceptedAt) || value.acceptedAt < value.generatedAt || value.acceptedAt >= value.start || value.acceptedAt > now || !STATUSES.has(value.status) || !finite4(value.avgRoundSeconds) || value.avgRoundSeconds <= 0 || value.avgRoundSeconds > 180 || value.key !== keyOf(value) || !validResult(value, now)) return false;
    if (value.source === BIG_SOURCE) {
      return value.sourceModel === BIG_MODEL && value.start >= value.generatedAt + 3 * MINUTE4 && value.windowMs <= 6 * MINUTE4 && value.end <= value.generatedAt + 9 * MINUTE4;
    }
    return value.source === BETA_SOURCE && [RARE_MODEL, RARE_ARCHIVE_MODEL2].includes(value.sourceModel) && value.target === 100;
  }
  function cleanEntry(value) {
    const clean = {
      model: MODEL3,
      key: value.key,
      source: value.source,
      sourceModel: value.sourceModel,
      evidenceStatus: EVIDENCE_STATUS,
      target: value.target,
      generatedAt: value.generatedAt,
      acceptedAt: value.acceptedAt,
      start: value.start,
      end: value.end,
      windowMs: value.windowMs,
      avgRoundSeconds: value.avgRoundSeconds,
      status: value.status
    };
    if (value.status !== "pending") {
      clean.actual = value.actual;
      clean.actualAt = value.actualAt;
      clean.resolvedAt = value.resolvedAt;
    }
    return clean;
  }
  function sameFields(a, b) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key]);
  }
  function sanitize(journal) {
    const input = Array.isArray(journal) ? journal : [];
    const eligible = input.filter((value) => validEntry(value, Infinity)).sort((a, b) => a.acceptedAt - b.acceptedAt || a.start - b.start || a.key.localeCompare(b.key));
    const clean = [], keys = /* @__PURE__ */ new Set();
    for (const value of eligible) {
      const previous = clean.at(-1);
      const blockedUntil = previous?.status === "pending" ? Infinity : Math.max(previous?.end ?? 0, previous?.resolvedAt ?? 0);
      if (keys.has(value.key) || value.acceptedAt < blockedUntil) continue;
      keys.add(value.key);
      clean.push(cleanEntry(value));
    }
    const capped = clean.slice(-MAX_ALERTS);
    return {
      journal: capped,
      changed: capped.length !== input.length || capped.some((value, i) => !sameFields(value, input[i]))
    };
  }
  function currentSegment2(rows) {
    let count3 = rows.length;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].timestamp - rows[i].timestamp > MAX_FRESH_AGE_MS) {
        count3 = i;
        break;
      }
    }
    return rows.slice(0, count3);
  }
  function cadenceSeconds(rows) {
    const gaps = rows.slice(1, 101).map((row, i) => rows[i].timestamp - row.timestamp).filter((gap) => gap > 0).sort((a, b) => a - b);
    if (!gaps.length) return 30;
    const middle = Math.floor(gaps.length / 2);
    const median3 = gaps.length % 2 ? gaps[middle] : gaps[middle - 1] / 2 + gaps[middle] / 2;
    return Math.min(180, Math.max(1e-3, median3 / 1e3));
  }
  function sourceFresh(online, lastSuccessAt, now) {
    return online === true && timestamp6(lastSuccessAt) && lastSuccessAt <= now && now - lastSuccessAt <= POLL_FRESH_MS;
  }
  function analysisFresh(analysis, rows, segment, now) {
    return analysis?.ready === true && analysis.evidenceStatus === EVIDENCE_STATUS && analysis.threshold === 100 && analysis.horizonMs === 18e4 && segment.length >= MIN_ROUNDS2 && rows.length > 0 && now - rows[0].timestamp <= MAX_FRESH_AGE_MS;
  }
  function advanceRareAlerts(journal, rounds, options = {}) {
    const { analysis = null, bigForecast = null, now = Date.now(), online = false, lastSuccessAt = null } = options ?? {};
    const sanitized = sanitize(journal);
    if (!validNow2(now) || sanitized.journal.some((entry) => entry.acceptedAt > now || entry.resolvedAt !== void 0 && entry.resolvedAt > now)) {
      return {
        journal: Object.freeze(sanitized.journal.map((entry) => Object.freeze(entry))),
        changed: sanitized.changed,
        active: null,
        latestResult: null
      };
    }
    const rows = normalizeRounds(rounds, now), segment = currentSegment2(rows);
    let changed = sanitized.changed;
    const freshPoll = sourceFresh(online, lastSuccessAt, now);
    const freshAnalysis = analysisFresh(analysis, rows, segment, now);
    const next = sanitized.journal.map((entry) => {
      if (entry.status !== "pending") return entry;
      const result = We(entry, rows, now, entry.avgRoundSeconds);
      const freshFinalPoll = freshPoll && lastSuccessAt >= entry.end && rows.length > 0 && now - rows[0].timestamp <= MAX_FRESH_AGE_MS;
      if (result && (result.status === "validated" || freshFinalPoll)) {
        changed = true;
        return {
          ...entry,
          status: result.status === "validated" ? "hit" : "miss",
          actual: result.coefficient,
          actualAt: result.at,
          resolvedAt: now
        };
      }
      if (now > entry.end + RESULT_GRACE_MS2) {
        const best = Te(rows, entry.target, entry.start, entry.windowMs);
        changed = true;
        return { ...entry, status: "unknown", actual: best.best, actualAt: best.bestAt, resolvedAt: now };
      }
      return entry;
    });
    const blocked = next.some((entry) => entry.status === "pending" || now < entry.end);
    if (!blocked && freshPoll && freshAnalysis) {
      const candidate = candidateFromBig(bigForecast, now) ?? candidateFromBeta(analysis.candidate, now);
      if (candidate) {
        const entry = {
          ...candidate,
          model: MODEL3,
          evidenceStatus: EVIDENCE_STATUS,
          acceptedAt: now,
          avgRoundSeconds: cadenceSeconds(segment),
          status: "pending"
        };
        entry.key = keyOf(entry);
        next.push(cleanEntry(entry));
        changed = true;
      }
    }
    const frozen = Object.freeze(next.slice(-MAX_ALERTS).map((entry) => Object.freeze(entry)));
    const active = freshPoll && freshAnalysis ? [...frozen].reverse().find((entry) => now < entry.end && (entry.status === "pending" || entry.status === "hit")) ?? null : null;
    const latestResult = frozen.reduce((latest, entry) => entry.status !== "pending" && (!latest || entry.resolvedAt > latest.resolvedAt || entry.resolvedAt === latest.resolvedAt && entry.acceptedAt > latest.acceptedAt) ? entry : latest, null);
    return { journal: frozen, changed, active, latestResult };
  }

  // src/rare-presentation.mjs
  var EVIDENCE_STATUS4 = "experimental-unvalidated";
  var POLL_FRESH_MS2 = 12e3;
  var MINUTE5 = 6e4;
  var MIN_TIMESTAMP9 = 9466848e5;
  var MAX_TIMESTAMP7 = 864e13;
  var clock = (value) => Number.isSafeInteger(value) && value >= MIN_TIMESTAMP9 && value <= MAX_TIMESTAMP7;
  var finite5 = (value) => typeof value === "number" && Number.isFinite(value);
  var probability3 = (value) => finite5(value) && value >= 0 && value <= 1;
  var count2 = (value) => Number.isSafeInteger(value) && value >= 0;
  var percentFormatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var coefficientFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  var dayFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit" });
  var timeFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  var sources = {
    "beta-window-frequency": "Бета: частота окон",
    "existing-big-opportunity": "пересечение эвристик"
  };
  var reasons = {
    "invalid-now": "некорректное время устройства",
    "invalid-input": "нет корректной истории",
    "no-valid-completed-rounds": "нет корректных завершённых результатов",
    "stale-data": "последний результат устарел",
    "insufficient-contiguous-history": "нужно минимум 500 непрерывно наблюдавшихся завершённых результатов",
    "no-positive-exposure": "интервал наблюдения не измерен",
    "insufficient-exposure": "наблюдаемый интервал короче 3 минут",
    "insufficient-events": "наблюдалось меньше 5 результатов ≥100×",
    "insufficient-covered-windows": "нужны 30 последних и не менее 60 предыдущих полных окон",
    "insufficient-hit-windows": "нужно минимум 5 окон с ≥100× в каждой группе; не обязательно подряд",
    "archive-recent-window-conflict": "обнаружено расхождение архива и текущих окон; сигнал отложен",
    "numerical-failure": "численная оценка недоступна",
    "no-supported-local-rise": "поддержанного роста локальной частоты нет",
    "experimental-local-frequency-rise": "экспериментальный рост локальной частоты"
  };
  var reason = (value) => reasons[value] ?? "недостаточно данных";
  function percent(value) {
    if (!probability3(value)) return null;
    if (value === 0) return "0%";
    if (value === 1) return "100%";
    if (value < 1e-3) return "<0,1%";
    if (value > 0.999) return ">99,9%";
    return `${percentFormatter.format(value * 100)}%`;
  }
  function range(value) {
    return Array.isArray(value) && value.length === 2 && value.every(probability3) && value[0] <= value[1] ? `${percent(value[0])}–${percent(value[1])}` : null;
  }
  function windowLabel(value) {
    if (!clock(value?.start) || !clock(value?.end) || value.start >= value.end) return null;
    const fromDay = dayFormatter.format(value.start), toDay = dayFormatter.format(value.end);
    return `${fromDay}, ${timeFormatter.format(value.start)}–${fromDay === toDay ? "" : `${toDay}, `}${timeFormatter.format(value.end)} · Киев`;
  }
  function futureClockAnomaly(analysis, alerts, now) {
    if (!clock(now) || now > MAX_TIMESTAMP7 - 30 * MINUTE5) return true;
    const fields2 = [
      analysis?.diagnostics?.analyzedAt,
      analysis?.diagnostics?.lastAt,
      analysis?.poisson?.exposureEnd,
      analysis?.bayesian?.recent?.end,
      alerts?.active?.generatedAt,
      alerts?.active?.acceptedAt,
      alerts?.active?.resolvedAt,
      alerts?.latestResult?.resolvedAt
    ];
    return fields2.some((value) => value !== void 0 && value !== null && (!clock(value) || value > now));
  }
  function validPending(value, now) {
    return value?.status === "pending" && value.model === "rare-alert-v1" && value.evidenceStatus === EVIDENCE_STATUS4 && Object.hasOwn(sources, value.source) && Number.isSafeInteger(value.target) && value.target >= 100 && [value.generatedAt, value.acceptedAt, value.start, value.end].every(clock) && value.generatedAt <= value.acceptedAt && value.acceptedAt <= now && value.acceptedAt < value.start && value.start - value.generatedAt >= 2 * MINUTE5 && value.start - value.generatedAt <= 15 * MINUTE5 && value.end > value.start && value.end - value.start <= 10 * MINUTE5 && value.windowMs === value.end - value.start && now < value.end && value.actual === void 0 && value.actualAt === void 0 && value.resolvedAt === void 0;
  }
  function betaLine(label, summary) {
    const interval = range(summary?.interval95);
    if (!summary || !count2(summary.windowCount) || summary.windowCount === 0 || !count2(summary.hitWindowCount) || summary.hitWindowCount > summary.windowCount || !probability3(summary.posteriorMean) || !interval) return null;
    return `${label} ${summary.windowCount} окон: ${percent(summary.posteriorMean)} · 95% байесовский интервал ${interval}; ${summary.hitWindowCount}/${summary.windowCount} окон с ≥100×.`;
  }
  function journalLabel(latest, now) {
    if (!latest || !["hit", "miss", "unknown"].includes(latest.status)) return "Журнал: завершённых окон пока нет.";
    const label = windowLabel(latest);
    if (!label || !Number.isSafeInteger(latest.target) || latest.target < 100 || !clock(latest.resolvedAt) || latest.resolvedAt > now) return "Журнал: результат недоступен из-за некорректного времени.";
    const result = { hit: "цель отмечена", miss: "цель не отмечена", unknown: "покрытие неизвестно" }[latest.status];
    const actual = finite5(latest.actual) && latest.actual >= 1 ? `зафиксированный коэффициент ${coefficientFormatter.format(latest.actual)}×` : "зафиксированный коэффициент неизвестен";
    return `Журнал: ${result} · цель ≥${coefficientFormatter.format(latest.target)}× · ${label} · источник: ${sources[latest.source] ?? "неизвестен"} · ${actual}.`;
  }
  function formatRarePresentation({ analysis = null, alerts = null, now = Date.now(), online = false, lastSuccessAt = null } = {}) {
    const anomaly = futureClockAnomaly(analysis, alerts, now) || lastSuccessAt !== null && lastSuccessAt !== void 0 && (!clock(lastSuccessAt) || lastSuccessAt > now);
    const freshPoll = online === true && clock(lastSuccessAt) && lastSuccessAt <= now && now - lastSuccessAt <= POLL_FRESH_MS2;
    const freshAnalysis = clock(analysis?.diagnostics?.lastAt) && clock(analysis?.diagnostics?.analyzedAt) && now - analysis.diagnostics.lastAt <= 18e4 && now - analysis.diagnostics.analyzedAt <= 18e4;
    const ready = analysis?.ready === true && analysis.evidenceStatus === EVIDENCE_STATUS4 && analysis.threshold === 100 && analysis.horizonMs === 18e4;
    let readiness = reason(analysis?.diagnostics?.reason);
    if (ready && !analysis?.diagnostics?.reason) readiness = "история готова";
    if (anomaly) readiness = "расхождение времени; оповещение скрыто";
    else if (online !== true) readiness = "источник недоступен";
    else if (!freshPoll) readiness = "свежий опрос не подтверждён (не старше 12 с)";
    else if (ready && !freshAnalysis) readiness = "данные анализа устарели";
    const diagnostics = [`Данные: ${readiness}.`];
    const poisson = analysis?.poisson, poissonInterval = range(poisson?.probabilityInterval95);
    const sample = count2(poisson?.eventCount) && finite5(poisson?.exposureMs) && poisson.exposureMs >= 0 ? ` Событий: ${poisson.eventCount}; наблюдение: ${coefficientFormatter.format(poisson.exposureMs / MINUTE5)} мин.` : "";
    diagnostics.push(poisson?.status === "ready" && probability3(poisson.probability) && poissonInterval ? `Гамма–Пуассон, следующие 3 мин: ${percent(poisson.probability)} · 95% байесовский интервал ${poissonInterval} — при постоянной интенсивности.${sample}` : `Гамма–Пуассон: оценка недоступна — ${reason(poisson?.reason)}.`);
    const beta = analysis?.bayesian;
    const recent = betaLine("Бета, последние", beta?.recent);
    const reference = betaLine(analysis?.archive?.status === "ready" ? "Архив для сравнения," : "Предыдущие", beta?.reference);
    if (beta?.status !== "ready") diagnostics.push(`Бета: сигнал недоступен — ${reason(beta?.reason)}.`);
    if (recent) diagnostics.push(recent);
    if (reference) diagnostics.push(reference);
    if (!recent && !reference && beta?.status === "ready") diagnostics.push("Бета: описание групп недоступно.");
    diagnostics.push(
      "Эксперимент: частоты прошлых окон не являются откалиброванным шансом будущего окна.",
      "Долгое отсутствие ≥100× само по себе не повышает оценку.",
      "Покрытие истории предполагается по наблюдавшимся интервалам между результатами."
    );
    const active = alerts?.active;
    const banner = !anomaly && freshPoll && freshAnalysis && ready && validPending(active, now) ? {
      title: `В эти минуты оценивается возможность большого скачка ≥${coefficientFormatter.format(active.target)}×`,
      windowLabel: windowLabel(active),
      detail: `Экспериментальная оценка для наблюдения · источник: ${sources[active.source]}. Будущий результат не гарантирован. Не запускает автоставки.`
    } : null;
    return { banner, diagnostics, journalLabel: journalLabel(alerts?.latestResult, now) };
  }

  // ../scene.mjs
  function mountScene(canvas, { onDelivery = () => {
  }, compact = false } = {}) {
    const c = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1, raf = 0, clock3 = 0, last = 0, deliveries = 0, flash = 0, paused = false, mouse = null, job = null, queue = [];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const random = (i) => {
      const n = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    let strands = [], core = { x: 0, y: 0 };
    const resize = () => {
      delete canvas.dataset.sceneReady;
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      core = { x: W / 2, y: H * 0.45 };
      strands = Array.from({ length: compact ? 80 : W < 800 ? 340 : 500 }, (_, i) => ({ x: random(i + 1) * W, y: random(i + 6) * H, length: compact ? 25 + random(i + 19) * Math.min(110, W * 0.5) : 50 + random(i + 19) * 250, phase: random(i + 45) * 6.28, points: Array.from({ length: 30 }, () => ({ x: random(i + 1) * W, y: random(i + 6) * H, a: 0 })) }));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const brain = () => {
      const a = clock3 * 0.34, span = compact ? Math.min(W * 0.18, H * 0.2) : Math.min(W * 0.26, H * 0.29), target = mouse ?? { x: W / 2 + span * Math.sqrt(2) * Math.cos(a) / (1 + Math.sin(a) ** 2), y: H * 0.52 + span * 0.65 * Math.cos(a) * Math.sin(a) / (1 + Math.sin(a) ** 2) };
      core.x += (Math.max(compact ? 30 : 65, Math.min(W - (compact ? 30 : 65), target.x)) - core.x) * 0.08;
      core.y += (Math.max(compact ? 30 : W < 800 ? 290 : 270, Math.min(H - (compact ? 25 : W < 800 ? 250 : 230), target.y)) - core.y) * 0.08;
      return { x: core.x, y: core.y, scale: (compact ? 0.22 : W < 800 ? 0.47 : 0.58) * (1 + Math.min(deliveries, 30) / 30 * 0.24) };
    };
    const pointer = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const leave = () => mouse = null;
    canvas.addEventListener("pointermove", pointer);
    canvas.addEventListener("pointerleave", leave);
    let previous = { x: W / 2, y: H * 0.43 };
    function field(b) {
      const moved = Math.hypot(b.x - previous.x, b.y - previous.y) + 5;
      for (const [i, s] of strands.entries()) {
        const distance = Math.hypot(b.x - s.x, b.y - s.y), active = distance <= s.length;
        c.fillStyle = active ? "rgba(220,250,255,.7)" : "rgba(0,95,100,.6)";
        c.beginPath();
        c.arc(s.x, s.y, active ? 1 + random(i + 100) * 2 : random(i + 100) * 1.6, 0, Math.PI * 2);
        c.fill();
        if (!active) continue;
        const angle = Math.atan2(b.y - s.y, b.x - s.x), len = s.length / s.points.length;
        let tx = b.x - 0.8 * moved * Math.cos(angle), ty = b.y - 0.8 * moved * Math.sin(angle);
        for (let j = s.points.length - 1; j >= 0; j--) {
          const p = s.points[j];
          p.a = Math.atan2(ty - p.y, tx - p.x);
          p.x = tx - len * Math.cos(p.a);
          p.y = ty - len * Math.sin(p.a);
          tx = p.x;
          ty = p.y;
        }
        let x = s.x, y = s.y;
        c.beginPath();
        c.moveTo(x, y);
        for (const p of s.points) {
          p.x = x;
          p.y = y;
          x += len * Math.cos(p.a);
          y += len * Math.sin(p.a);
          c.lineTo(x, y);
        }
        c.globalCompositeOperation = "lighter";
        c.strokeStyle = `hsla(${180 + random(i + 34) * 60},100%,${25 + random(i + 67) * 60}%,.75)`;
        c.lineWidth = 0.2 + random(i + 96) * 1.6;
        c.lineCap = "round";
        c.lineJoin = "round";
        c.stroke();
        c.globalCompositeOperation = "source-over";
      }
      previous = { x: b.x, y: b.y };
    }
    const hemisphere = new Path2D("M -4 -89 C -15 -112 -44 -115 -57 -93 C -84 -103 -107 -79 -100 -56 C -128 -46 -129 -15 -111 -2 C -130 24 -111 53 -91 53 C -95 80 -63 99 -43 83 C -27 104 -4 86 -4 65 Z");
    const folds = [[-8, -73, -45, -97, -67, -74, -51, -55], [-51, -55, -24, -48, -19, -69, -7, -59], [-92, -51, -65, -68, -72, -24, -46, -24], [-8, -37, -40, -49, -27, -8, -55, -5], [-106, -10, -85, -29, -66, 8, -83, 23], [-8, 1, -34, -20, -30, 26, -57, 22], [-74, 49, -58, 24, -28, 61, -7, 39], [-85, 66, -51, 86, -52, 48, -34, 50], [-16, 76, -28, 54, -15, 60, -9, 55], [-93, 11, -103, 34, -74, 41, -64, 27]];
    function drawBrain(b) {
      c.save();
      c.translate(b.x, b.y);
      const breath = 1 + 0.012 * Math.sin(clock3 * 1.8) + flash * 0.035;
      c.scale(b.scale * breath, b.scale * breath);
      const glow = c.createRadialGradient(0, 0, 5, 0, 0, 160);
      glow.addColorStop(0, "#20f0be12");
      glow.addColorStop(0.5, "#1cdabc09");
      glow.addColorStop(1, "transparent");
      c.fillStyle = glow;
      c.fillRect(-170, -170, 340, 340);
      for (const side of [1, -1]) {
        c.save();
        c.scale(side, 1);
        c.fillStyle = "#041b1de8";
        c.shadowColor = "#59fbd6";
        c.shadowBlur = 17 + flash * 20;
        c.strokeStyle = "#71f4d9cc";
        c.lineWidth = 1.2;
        c.fill(hemisphere);
        c.stroke(hemisphere);
        c.shadowBlur = 5;
        c.lineWidth = 0.8;
        for (const [i, f] of folds.entries()) {
          c.strokeStyle = i % 3 === 0 ? "#aca5fd99" : "#66d7ca99";
          c.beginPath();
          c.moveTo(f[0], f[1]);
          c.bezierCurveTo(...f.slice(2));
          c.stroke();
        }
        c.clip(hemisphere);
        c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 48; i++) {
          const x = -10 - random(i + 21) * 98, y = -100 + random(i + 74) * 200, alpha = 0.15 + 0.5 * Math.max(0, Math.sin(clock3 * 1.1 + i));
          c.fillStyle = `rgba(125,255,225,${alpha})`;
          c.beginPath();
          c.arc(x, y, 0.7 + flash, 0, Math.PI * 2);
          c.fill();
          if (i % 3 === 0) {
            c.strokeStyle = "#73ddca18";
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x + 15 * Math.sin(i), y + 22 * Math.cos(i));
            c.stroke();
          }
        }
        c.restore();
      }
      c.shadowColor = "#7bf9eb";
      c.shadowBlur = 7;
      c.strokeStyle = "#76eedac0";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-4, 67);
      c.bezierCurveTo(-8, 96, -13, 99, -9, 113);
      c.moveTo(4, 67);
      c.bezierCurveTo(8, 96, 13, 99, 9, 113);
      c.stroke();
      c.restore();
    }
    function drawSpider(x, y, angle, carry) {
      c.save();
      c.translate(x, y);
      c.rotate(angle);
      const scale = compact ? 0.45 : W < 800 ? 0.8 : 1;
      c.scale(scale, scale);
      c.lineCap = "round";
      c.shadowColor = "#84cce5";
      c.shadowBlur = 3;
      for (let side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const a = side * (0.65 + i * 0.62), walk = Math.sin(clock3 * 12 + i * Math.PI + side) * 4;
        const hx = Math.cos(a) * 5, hy = Math.sin(a) * 5, fx = Math.cos(a) * (31 + walk), fy = Math.sin(a) * (31 + walk);
        const kx = (hx + fx) * 0.5 - side * (fy - hy) * 0.45, ky = (hy + fy) * 0.5 + side * (fx - hx) * 0.45;
        c.strokeStyle = "#b8dbedbb";
        c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(hx, hy);
        c.lineTo(kx, ky);
        c.lineTo(fx, fy);
        c.stroke();
        c.fillStyle = "#93f7dc";
        c.beginPath();
        c.arc(kx, ky, 1, 0, 7);
        c.fill();
      }
      c.strokeStyle = "#ddf7fc";
      c.fillStyle = "#0c2532";
      c.beginPath();
      c.ellipse(-5, 0, 7, 5, 0, 0, 7);
      c.fill();
      c.stroke();
      c.beginPath();
      c.ellipse(5, 0, 4, 3, 0, 0, 7);
      c.stroke();
      c.fillStyle = "#ef95d1";
      c.beginPath();
      c.arc(7, 0, 1.3, 0, 7);
      c.fill();
      c.restore();
      if (carry) {
        const text = Number(carry.coefficient).toFixed(2) + "×";
        c.font = "11px monospace";
        const w = c.measureText(text).width;
        c.fillStyle = "#05191ee8";
        c.strokeStyle = "#63c9c36b";
        c.lineWidth = 1;
        c.beginPath();
        c.roundRect(x - w / 2 - 8, y - 37, w + 16, 23, 5);
        c.fill();
        c.stroke();
        c.fillStyle = "#b9ffec";
        c.textAlign = "center";
        c.fillText(text, x, y - 21);
      }
    }
    function frame(ms) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.04, last ? (ms - last) / 1e3 : 0.016);
      last = ms;
      if (paused && canvas.dataset.sceneReady === "true") return;
      clock3 += dt;
      flash = Math.max(0, flash - dt * 1.7);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      const b = brain();
      field(b);
      drawBrain(b);
      if (!job && queue.length) {
        const data = queue.shift();
        job = { data, t: 0, side: deliveries % 2 ? 1 : -1, delivered: false };
      }
      let x, y, a = 0, carry = null;
      if (job) {
        job.t += dt;
        const u = Math.min(1, job.t / 3), e = u * u * (3 - 2 * u), start2 = { x: job.side > 0 ? W - 35 : 35, y: H * (W < 800 ? 0.78 : 0.79) };
        x = start2.x + (b.x - start2.x) * e;
        y = start2.y + (b.y - start2.y) * e - Math.sin(u * Math.PI) * 50;
        a = Math.atan2(b.y - start2.y, b.x - start2.x);
        carry = job.data;
        if (u >= 1) {
          deliveries++;
          flash = 1;
          onDelivery(deliveries, job.data);
          job = null;
          carry = null;
        }
      } else {
        x = b.x + Math.cos(clock3 * 0.44) * Math.min(compact ? 55 : 180, W * (compact ? 0.22 : 0.32));
        y = b.y + Math.sin(clock3 * 0.66) * (compact ? Math.min(32, H * 0.25) : 116);
        a = Math.atan2(Math.cos(clock3 * 0.66) * 0.66, -Math.sin(clock3 * 0.44) * 0.44);
      }
      drawSpider(x, y, a, carry);
      canvas.dataset.sceneReady = "true";
    }
    raf = requestAnimationFrame(frame);
    return { push(rows, { initial = false } = {}) {
      const picked = initial ? rows.slice(-4) : rows.slice(-12);
      queue.push(...picked);
      if (queue.length > 16) queue = queue.slice(-16);
    }, setPaused(value) {
      paused = value;
      if (reduced.matches && !value) flash = 0;
    }, destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointermove", pointer);
      canvas.removeEventListener("pointerleave", leave);
    } };
  }

  // src/transport.mjs
  function createExtensionFetch(gm, config) {
    if (typeof gm?.xmlHttpRequest !== "function") throw Error("Нужно включить расширение Userscripts");
    const origin = new URL(config.url).origin;
    return async function extensionFetch(input, options = {}) {
      const url = new URL(String(input));
      if (url.origin !== origin || url.pathname !== `/rest/v1/${config.table}` || options.method && options.method !== "GET") throw Error("Разрешено только чтение нашей таблицы коэффициентов");
      const { signal } = options;
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      let task, listener;
      try {
        const response = await new Promise((resolve, reject) => {
          listener = () => {
            task?.abort?.();
            reject(new DOMException("Aborted", "AbortError"));
          };
          signal?.addEventListener("abort", listener, { once: true });
          task = gm.xmlHttpRequest({
            method: "GET",
            url: url.href,
            timeout: 15e3,
            responseType: "text",
            headers: { apikey: config.publishableKey, Accept: "application/json" },
            onload: resolve,
            onerror: () => reject(Error("Userscripts: нет соединения с источником")),
            ontimeout: () => reject(Error("Userscripts: источник не ответил за 15 секунд")),
            onabort: () => reject(new DOMException("Aborted", "AbortError"))
          });
          if (typeof task?.then === "function") task.then(resolve, reject);
        });
        const status = Number(response.status) || 0;
        return {
          ok: status >= 200 && status < 300,
          status,
          async json() {
            if (typeof response.responseText === "string") return JSON.parse(response.responseText);
            if (typeof response.response === "string") return JSON.parse(response.response);
            if (Array.isArray(response.response) || response.response?.constructor === Object) return response.response;
            throw Error("Userscripts: неверный ответ источника");
          }
        };
      } finally {
        signal?.removeEventListener("abort", listener);
      }
    };
  }
  function permittedPage(location2) {
    return location2.protocol === "https:" && (location2.hostname === "one-vv3016.com" || location2.hostname === "1play.gamedev-tech.cc" || location2.hostname === "miuiproking.github.io" && location2.pathname === "/luckyjet-telegram-mini-app/god-preditor-pro-vip/safari/preview.html");
  }

  // src/style.mjs
  var CSS = `
.suite-signal{flex:0 0 auto;border:1px solid #84e9c4;border-radius:9px;padding:7px;color:#b8fbe0;font-size:9px;line-height:1.5;white-space:pre-line}.model-estimate{border-top:1px solid #ffffff18;padding-top:7px}#statistics-zones{white-space:pre-line;overflow-wrap:anywhere;color:#b5ddc8}
.auto-brief{flex:0 0 auto;padding:5px 7px;border:1px solid #b99bc533;border-radius:7px;white-space:pre-line;overflow-wrap:anywhere;font-size:8px;line-height:1.5;color:#edb1b5}.auto-brief.armed{color:#98e4c1;border-color:#77ceaa44}#archive-status{white-space:pre-line}#archive-status+button:disabled,#archive-full:disabled{opacity:.4}
.rare-alert{flex:0 0 auto;border:1px solid #ff758a99;border-radius:9px;background:#510c244d;padding:8px;color:#ff9daf;text-align:center;overflow-wrap:anywhere}.rare-alert b{display:block;font-size:10px;line-height:1.4;color:#ff7d94}.rare-alert time{display:block;font:700 10px/1.5 ui-monospace,monospace;margin-top:4px;color:#ffd0d8}.rare-alert small{display:block;font-size:8px;margin-top:3px;color:#d8a5b1}.rare-diagnostics{width:100%;border-top:1px solid #ffffff14;padding-top:5px}.rare-diagnostics summary{cursor:pointer;color:#d4b7e9}.rare-diagnostics p{white-space:pre-line;overflow-wrap:anywhere;font-size:8px;line-height:1.6;color:#bda9cb}
:host{all:initial;color-scheme:dark!important}*{box-sizing:border-box}button,a{touch-action:manipulation}button{font:inherit;color:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid #71efd9;outline-offset:2px}[hidden]{display:none!important}
.panel{--header-height:94px;position:fixed;display:flex;flex-direction:column;pointer-events:auto;overflow:hidden;min-width:218px;min-height:220px;border:1px solid #a77beb70;border-radius:18px;background:#090716f2;color:#eae4fa;box-shadow:0 10px 40px #0008;backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);font:11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;isolation:isolate;text-align:left}
.handle{display:flex;flex-direction:column;align-items:stretch;gap:6px;height:var(--header-height);flex:0 0 var(--header-height);padding:7px 9px;background:#171125;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}.window-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;flex:0 0 44px}.window-controls .icon{width:100%;height:44px;min-width:44px;font-size:24px;border-radius:10px;touch-action:manipulation}.handle:active{cursor:grabbing}.brand{flex:1;min-width:0}.brand strong{font-size:11px;font-weight:900;letter-spacing:.5px;color:#d9a4ff}.brand img{display:block;width:145px;max-width:100%;height:auto}.brand small{display:block;font-size:7px;color:#ab93bd;letter-spacing:1px}.icon{display:grid;place-items:center;flex:0 0 25px;width:25px;height:25px;padding:0;border:1px solid #bc90eb35;border-radius:8px;background:#ffffff08;font-size:16px}.body{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;flex:1;display:flex;flex-direction:column;padding:7px 10px 10px;gap:6px}.status{font-size:8px;color:#90ddbd;min-height:12px;overflow-wrap:anywhere}.status.error{color:#ff9fa8}.status.warn{color:#d1baa1}.recent{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px}.chip{padding:4px 0;text-align:center;border-radius:7px;background:#ffffff05;border:1px solid #ffffff0e;overflow:hidden}.chip b{font:700 10px ui-monospace,monospace;color:#d7a4ff;white-space:nowrap}.chip.low b{color:#80d5ff}.chip time{display:block;font:6px ui-monospace,monospace;color:#9b89a8;margin-top:3px}.neural{position:relative;min-height:65px;flex:1 0 95px;max-height:190px;border-radius:10px;overflow:hidden;background:radial-gradient(ellipse,#12372e44,transparent 70%)}canvas{display:block;width:100%;height:100%;position:absolute;inset:0;pointer-events:none}.vip{position:absolute;right:3px;top:1px;width:31px;max-height:18px;object-fit:contain}.signal{text-align:center;font:900 30px/1.1 ui-monospace,monospace;color:#f0d0ff;letter-spacing:-1px;overflow-wrap:anywhere}.window{text-align:center;font:9px/1.4 ui-monospace,monospace;white-space:pre-line;color:#e8dcf7;min-height:26px}.note{text-align:center;font-size:8px;line-height:1.5;color:#ac99bf;min-height:12px;overflow-wrap:anywhere}.targets{display:flex;justify-content:center;gap:8px}.targets button{padding:5px 12px;min-height:27px;border:1px solid #b979eb38;border-radius:7px;background:#140d22;color:#c5a5d9;font-size:10px}.targets button.active{background:#53306e66;border-color:#d4a4ee;color:#fff}.result{min-height:22px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:9px;text-align:center;color:#b8a9c6}.result.hit{color:#a2e8ac}.result.miss{color:#ff9ca8}.result img{width:26px;height:26px;object-fit:contain}.result strong{font-size:19px}.footer{display:flex;justify-content:space-between;align-items:center;padding:0 10px 7px;gap:4px}.link{color:#bc9ed6;font-size:8px;background:transparent;border:0;padding:4px;text-decoration:none}.grip{width:27px;height:27px;border:0;background:transparent;color:#baa2c8;font-size:18px;touch-action:none;cursor:nwse-resize;flex:0 0 27px}.tools{border-top:1px solid #ffffff14;padding-top:6px;display:flex;gap:5px;flex-wrap:wrap;font-size:9px}.tools button{border:1px solid #bf8be535;border-radius:6px;background:#ffffff07;padding:5px 8px;min-height:27px}.hint{font-size:8px;color:#aa9cb4;margin:0}.history{position:absolute;inset:var(--header-height) 0 0;background:#0d091bf5;z-index:3;display:flex;flex-direction:column;padding:10px}.history-head{display:flex;align-items:center;justify-content:space-between;gap:6px}.history-head b{font-size:11px}.history small{font-size:8px;color:#ac9cbb;margin:5px 0}.history-list{overflow:auto;flex:1;margin-top:5px;overscroll-behavior:contain}.row{display:flex;justify-content:space-between;gap:5px;padding:7px 2px;border-bottom:1px solid #ffffff10;font:10px ui-monospace,monospace}.row time{font-size:8px;color:#9b8aaa}.launcher{position:fixed;display:flex;align-items:center;gap:5px;pointer-events:auto;min-width:55px;min-height:41px;border:1px solid #aa78d8b0;border-radius:14px;background:#120b20eb;box-shadow:0 5px 20px #0008;color:#f2d0ff;font:900 12px -apple-system,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;padding:8px}.launcher span{font:700 10px ui-monospace,monospace;color:#8af3ce}

.auto-panel{position:absolute;inset:var(--header-height) 0 0;background:#10091bf8;z-index:4;padding:10px;overflow:auto;overscroll-behavior:contain}.auto-panel p{font-size:9px;line-height:1.5;color:#c1aecb;margin:8px 0}.auto-panel button,.auto-panel select{font:10px -apple-system,sans-serif;color:#eadcf5;background:#372344;border:1px solid #c99fe34d;border-radius:7px;padding:7px 8px;min-height:30px}.auto-panel label{display:block;font-size:10px;margin:10px 0}.auto-panel select{width:100%;margin-top:4px}.auto-slot{margin:9px 0;display:flex;gap:6px;align-items:center}.auto-slot small{font-size:8px;overflow-wrap:anywhere}.auto-panel #auto-toggle{display:block;width:100%;background:#24473d;border-color:#68c5a3}.auto-panel #auto-toggle.armed{background:#713636;border-color:#eb8f8f}.auto-panel #auto-message{color:#d8c1f0}.auto-panel #auto-diagnostic{color:#ffd598;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text}#auto-log{font:8px/1.6 ui-monospace,monospace;color:#aa96b6}#auto-log>div{border-top:1px solid #ffffff14;padding:5px 0}.launcher[data-auto=live]:after{content:'А';background:#d87660;color:#200a08;border-radius:4px;font-size:8px;padding:2px}.launcher[data-auto=test]:after{content:'Т';color:#e5ca83;font-size:8px}.picker{position:fixed;inset:0;pointer-events:none;z-index:20;font:12px/1.45 -apple-system,sans-serif;color:#f2e6ff}.pick-bar{position:fixed;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top,0px));pointer-events:auto;padding:12px;background:#150c25f5;border:1px solid #d5b2ed88;border-radius:13px;box-shadow:0 5px 30px #0008}.pick-bar p{font-size:11px;margin:5px 0;color:#bba6cd}.pick-info{font-size:10px;color:#ffe0a4;overflow-wrap:anywhere;margin:7px 0}.pick-bar button{font:12px -apple-system,sans-serif;color:#f1e1ff;background:#694081;border:1px solid #e5bff266;border-radius:8px;padding:9px 12px;margin-right:8px}.pick-bar button:disabled{opacity:.4}.pick-cursor{position:fixed;width:50px;height:50px;border:2px solid #9ef8d5;border-radius:50%;display:grid;place-items:center;background:#153a2ca0;color:#b5ffe2;font:32px/1 sans-serif;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 0 15px #80ffd74d}
#cashout-toggle{display:block;width:100%;background:#24473d;border-color:#68c5a3}#cashout-toggle.armed{background:#713636;border-color:#eb8f8f}#live-value{font:10px/1.5 ui-monospace,monospace;color:#9ef8d5}#cashout-log{font:8px/1.6 ui-monospace,monospace;color:#aa96b6}.launcher[data-cashout=live]:before{content:"З";color:#9ef8d5;font-size:9px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;

  // ../modules/supplied-prediction.mjs
  var ARCHIVE_PROFILE2 = Object.freeze({ low: 2, cycle: 10, cluster: 20, confirmation: 50, midMin: 5, midMax: 10, opportunity: 100 });

  // ../window-model.mjs
  var TARGETS3 = Object.freeze(["primary", "big"]);
  var MODEL4 = "supplied-dynamic-windows-v3";
  var RULES2 = Object.freeze({
    cycle: "Цикл достижения цели",
    "low-streak": "Серия ниже цели",
    "hot-cluster": "Кластер достижений цели",
    "mid-mixed": "Смешанная фаза",
    "mid-favorable": "Благоприятная фаза",
    "hour-favorable": "Благоприятный часовой профиль",
    "hour-weak": "Слабый часовой профиль",
    "multi-signal": "Многосигнальный расчёт",
    "opportunity-cycle": "Окно по циклу цели",
    "opportunity-cluster": "Окно по кластеру цели",
    "opportunity-poisson-delay": "Окно по интервалам цели"
  });

  // src/autobet.mjs
  var AUTO_KEY = "god-preditor-autobet-receipts-v1";
  var ACCEPT_WAIT_MS = 15e3;
  async function acquireAutoLock(locks) {
    if (!locks?.request) throw Error("Авто недоступно: Safari не поддерживает блокировку вкладок");
    return new Promise((resolve, reject) => {
      locks.request("god-preditor-autobet-session-v1", { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        let release;
        const held = new Promise((done) => {
          release = done;
        });
        resolve({ release });
        await held;
      }).catch(reject);
    });
  }
  function createAutoBet({
    now = Date.now,
    monotonic = () => performance.now(),
    context,
    inspect,
    click,
    acquireLock,
    readReceipts,
    writeReceipts,
    onChange = () => {
    },
    onBetDispatched = () => {
    },
    beforeBet = () => true,
    model = MODEL4
  }) {
    let armed = false, mode = "test", generation = 0, busy = false, lock = null;
    let initialized = false, storageOK = false, armedAt = 0, previousNow = 0, previousMono = 0;
    let receipts = [], message = "Авто выключено", logs = [];
    const buttons = [null, null], consumed = /* @__PURE__ */ new Set(), acknowledgements = [];
    const notify = (text) => {
      if (text && text !== message) {
        message = text;
        logs.push({ at: now(), text });
        logs = logs.slice(-15);
      }
      onChange();
    };
    function disarm(reason2 = "Авто выключено") {
      generation++;
      armed = false;
      lock?.release();
      lock = null;
      acknowledgements.length = 0;
      notify(reason2);
    }
    async function initialize() {
      try {
        const saved = await readReceipts();
        receipts = Array.isArray(saved) ? saved.filter((x) => x && typeof x.id === "string" && x.id.length < 500).slice(-200) : [];
        for (const entry of receipts) consumed.add("live:" + entry.id);
        storageOK = true;
      } catch {
        notify("Хранилище недоступно: только тест без нажатий");
      }
      initialized = true;
      onChange();
    }
    function setButton(index, button) {
      disarm("Привязка изменена — авто выключено");
      if (![0, 1].includes(index)) throw Error("Неизвестное поле");
      if (buttons[1 - index]?.element === button?.element) throw Error("Нужны две разные кнопки");
      buttons[index] = button;
      onChange();
    }
    function checks() {
      return buttons.map((button) => button ? inspect(button) : { state: "missing", reason: "Кнопка не выбрана" });
    }
    function checkOnly() {
      const states = checks();
      notify(states.map((s, i) => `${i + 1}: ${s.state === "ready" ? "готова" : s.reason}`).join(" · ") + " · нажатий нет");
      return states;
    }
    async function arm(nextMode = "test") {
      disarm();
      if (!initialized) {
        notify("Дождись загрузки настроек");
        return false;
      }
      mode = nextMode === "live" ? "live" : "test";
      const states = checks();
      if (states.some((s) => !["ready", "waiting"].includes(s.state))) {
        checkOnly();
        return false;
      }
      if (!context().fresh) {
        notify("Нет свежей связи с Supabase");
        return false;
      }
      if (mode === "live" && !storageOK) {
        notify("Без сохранения отметок автонажатия недоступны");
        return false;
      }
      const ticket = generation;
      if (mode === "live") {
        try {
          const obtained = await acquireLock();
          if (ticket !== generation) {
            obtained?.release();
            return false;
          }
          if (!obtained) {
            notify("Авто уже включено в другой вкладке");
            return false;
          }
          lock = obtained;
        } catch (error) {
          notify(error.message);
          return false;
        }
      }
      if (!context().fresh || !context().visible) {
        disarm("Вкладка или связь не готовы");
        return false;
      }
      armed = true;
      armedAt = previousNow = now();
      previousMono = monotonic();
      notify(mode === "live" ? "Авто включено · по одному нажатию на поле и окно" : "Тест включён · реальные кнопки не нажимаются");
      return true;
    }
    async function tick() {
      if (!armed || busy) return;
      const time = now(), mono = monotonic(), state = context();
      if (!state.visible || !state.fresh) {
        disarm("Авто выключено: фон или потеря свежей связи");
        return;
      }
      if (time - previousNow > 3500 || Math.abs(time - previousNow - (mono - previousMono)) > 1500) {
        disarm("Авто выключено: таймер задержался или изменились часы");
        return;
      }
      previousNow = time;
      previousMono = mono;
      for (let i = acknowledgements.length - 1; i >= 0; i--) {
        const ack = acknowledgements[i], checked = inspect(ack.button);
        if (checked.state === "busy") {
          notify(`Поле ${ack.index + 1}: кнопка изменилась после нажатия; повторения нет`);
          acknowledgements.splice(i, 1);
        } else if (checked.state === "unsafe" || time > ack.until) {
          disarm(`Поле ${ack.index + 1}: результат нажатия не подтверждён · проверь игру`);
          return;
        }
      }
      busy = true;
      const ticket = generation;
      try {
        for (const index of [0, 1]) {
          if (!armed || ticket !== generation) break;
          const window2 = state.forecasts.find((x) => x?.model === model && x.channel === "primary");
          if (!window2 || !Number.isFinite(window2.start) || !Number.isFinite(window2.end) || !(window2.acceptedAt < window2.start && window2.start < window2.end) || typeof window2.key !== "string") continue;
          const target = window2.target;
          if (!Number.isFinite(target) || target < 1) continue;
          const id = `${window2.key}:${index}`, seen = mode + ":" + id;
          if (consumed.has(seen)) continue;
          if (window2.start < armedAt || window2.status !== "pending") {
            consumed.add(seen);
            continue;
          }
          if (time < window2.start) continue;
          if (time > Math.min(window2.end, window2.start + ACCEPT_WAIT_MS)) {
            consumed.add(seen);
            notify(`Поле ${index + 1}: время приёма пропущено · без нажатия`);
            continue;
          }
          const checked = inspect(buttons[index]);
          if (checked.state === "waiting") {
            notify(`Поле ${index + 1}: жду доступную «Ставку», не более 15 секунд`);
            continue;
          }
          if (checked.state !== "ready") {
            disarm(`Поле ${index + 1}: ${checked.reason}`);
            break;
          }
          consumed.add(seen);
          if (mode === "test") {
            try {
              onBetDispatched(Object.freeze({ index, target, windowKey: window2.key, receiptId: id, at: time, button: Object.freeze({ ...buttons[index] }), mode: "test", generation: ticket }));
            } catch {
              disarm("Ошибка тестового отслеживания — авто выключено");
              break;
            }
            notify(`ТЕСТ ${index + 1}: здесь было бы нажатие ${target.toFixed(2)}× · кнопка не нажата`);
            continue;
          }
          receipts.push({ id, target, at: time, state: "reserved" });
          receipts = receipts.slice(-200);
          const savedAt = monotonic();
          try {
            await writeReceipts(receipts);
          } catch {
            disarm("Авто выключено: отметка нажатия не сохранилась");
            break;
          }
          const currentTime = now(), currentState = context(), final = inspect(buttons[index]);
          const latestWindow = currentState.forecasts.find((x) => x.model === model && x.channel === "primary");
          if (!armed || ticket !== generation) break;
          if (!currentState.visible || !currentState.fresh || currentTime > Math.min(window2.end, window2.start + ACCEPT_WAIT_MS) || monotonic() - savedAt > 2e3 || final.state !== "ready" || latestWindow?.key !== window2.key || latestWindow.status !== "pending") {
            disarm("Авто выключено: условия изменились перед нажатием");
            break;
          }
          try {
            if (beforeBet(Object.freeze({ index, target, windowKey: window2.key, at: currentTime })) !== true) {
              disarm("Отслеживание не готово — новая ставка не нажата");
              break;
            }
          } catch {
            disarm("Ошибка проверки перед ставкой — новая ставка не нажата");
            break;
          }
          if (!armed || ticket !== generation) break;
          try {
            click(buttons[index]);
          } catch {
            disarm(`Поле ${index + 1}: нажатие не выполнено · повторения нет`);
            break;
          }
          acknowledgements.push({ index, button: buttons[index], until: currentTime + 2500 });
          try {
            onBetDispatched(Object.freeze({ index, target, windowKey: window2.key, receiptId: id, at: currentTime, button: Object.freeze({ ...buttons[index] }), mode: "live", generation: ticket }));
          } catch {
            disarm("Ставка нажата, отслеживание не запущено — проверь игру вручную");
            break;
          }
          notify(`Поле ${index + 1}: нажатие отправлено · проверь подтверждение в игре`);
        }
      } finally {
        busy = false;
      }
    }
    return {
      initialize,
      setButton,
      checks,
      checkOnly,
      arm,
      disarm,
      tick,
      get state() {
        return { armed, mode, message, logs: [...logs], configured: buttons.map(Boolean), initialized };
      }
    };
  }

  // src/betting-dom.mjs
  var BUSY = /забра|забрати|cash[\s-]?out|collect|cancel|отмен|скасув|очікуван|ожидан|waiting|placed|accepted|принят/iu;
  var BET2 = /^(?:сделать\s+ставку|зробити\s+ставку|ставка|поставить|place\s+bet|bet)(?:$|\s|[\d₴$€])/iu;
  var labelOf2 = (element) => String(element.innerText || element.getAttribute("aria-label") || element.textContent || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  var originOf = (frame) => {
    try {
      return new URL(frame.src, frame.ownerDocument.baseURI).origin;
    } catch {
      return "неизвестный домен";
    }
  };
  function hitBetButton(document2, x, y) {
    let doc = document2, px = x, py = y;
    for (let depth = 0; depth < 10; depth++) {
      let element = doc.elementsFromPoint(px, py).find((item) => item.id !== "god-preditor-safari-overlay");
      for (let i = 0; i < 8 && element?.shadowRoot; i++) {
        const child = element.shadowRoot.elementFromPoint?.(px, py);
        if (!child || child === element) break;
        element = child;
      }
      if (element?.localName === "iframe") {
        let child;
        try {
          child = element.contentDocument;
        } catch {
        }
        if (!child) return { error: "Игра в отдельном фрейме. Нужен доступ к домену: " + originOf(element), frameOrigin: originOf(element) };
        const r = element.getBoundingClientRect();
        px = (px - r.left) * element.offsetWidth / r.width - element.clientLeft;
        py = (py - r.top) * element.offsetHeight / r.height - element.clientTop;
        doc = child;
        continue;
      }
      const button = element?.closest?.('button,[role="button"]');
      if (!button || !button.click || button.getRootNode().host?.id === "god-preditor-safari-overlay") return { error: "Наведи центр прицела на саму кнопку «Ставка»" };
      const label = labelOf2(button);
      if (!BET2.test(label) || BUSY.test(label)) return { error: "Это не доступная «Ставка»: " + label.slice(0, 70) };
      return { element: button, document: doc, label };
    }
    return { error: "Слишком глубокое вложение игрового поля" };
  }
  function inspectBetButton(selected) {
    const element = selected?.element, doc = selected?.document;
    if (!element || !doc || !element.isConnected) return { state: "unsafe", reason: "кнопка исчезла, выбери её заново" };
    try {
      if (doc.defaultView.document !== doc) return { state: "unsafe", reason: "игра перезагрузилась" };
      const label = labelOf2(element), style = doc.defaultView.getComputedStyle(element), rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || style.visibility !== "visible" || style.display === "none") return { state: "unsafe", reason: "кнопка скрыта" };
      if (BUSY.test(label)) return { state: "busy", reason: "поле занято: это не «Ставка»", label };
      if (!BET2.test(label)) return { state: "unsafe", reason: "подпись кнопки изменилась", label };
      if (element.disabled || element.matches(":disabled") || element.getAttribute("aria-disabled") === "true" || style.pointerEvents === "none")
        return { state: "waiting", reason: "игра пока не принимает ставку", label };
      let currentDoc = doc, x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const hit = currentDoc.elementFromPoint(x, y);
      const root = element.getRootNode();
      const inside = element.contains(hit) || root.host && root.host === hit;
      if (!inside) return { state: "waiting", reason: "кнопка перекрыта — отодвинь панель", label };
      while (currentDoc.defaultView !== currentDoc.defaultView.top) {
        const frame = currentDoc.defaultView.frameElement;
        if (!frame && currentDoc.location?.origin === "https://1play.gamedev-tech.cc") break;
        if (!frame || frame.contentDocument !== currentDoc) return { state: "unsafe", reason: "доступ к игровому фрейму изменился" };
        const r = frame.getBoundingClientRect();
        x = r.left + (x + frame.clientLeft) * r.width / frame.offsetWidth;
        y = r.top + (y + frame.clientTop) * r.height / frame.offsetHeight;
        currentDoc = frame.ownerDocument;
        if (currentDoc.elementFromPoint(x, y) !== frame) return { state: "waiting", reason: "игровое поле перекрыто", label };
      }
      return { state: "ready", reason: "готова", label };
    } catch {
      return { state: "unsafe", reason: "доступ к кнопке закрыт браузером" };
    }
  }
  function clickSelectedBet(selected) {
    if (inspectBetButton(selected).state !== "ready") throw Error("Кнопка уже недоступна");
    selected.document.defaultView.HTMLElement.prototype.click.call(selected.element);
  }
  function pickButton(root, index, done) {
    const doc = root.host.ownerDocument, win = doc.defaultView;
    const picker = doc.createElement("div");
    picker.className = "picker";
    picker.innerHTML = `<div class="pick-bar"><b>Выбрать поле ${index + 1}</b><p>Перетащи прицел на «Ставка», затем нажми «Выбрать». Ставка сейчас не отправляется.</p><div class="pick-info"></div><button class="pick-confirm" disabled>Выбрать</button><button class="pick-cancel">Отмена</button></div><div class="pick-cursor" role="button" aria-label="Прицел выбора кнопки">＋</div>`;
    root.append(picker);
    const cursor = picker.querySelector(".pick-cursor"), info = picker.querySelector(".pick-info"), confirm = picker.querySelector(".pick-confirm");
    let point = { x: win.innerWidth / 2, y: win.innerHeight * 0.7 }, candidate = null, drag = null, stopped = false;
    function update() {
      cursor.style.left = point.x - 25 + "px";
      cursor.style.top = point.y - 25 + "px";
      candidate = hitBetButton(doc, point.x, point.y);
      info.textContent = candidate.error || candidate.label.slice(0, 85);
      confirm.disabled = !!candidate.error;
    }
    cursor.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      cursor.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, dx: point.x - e.clientX, dy: point.y - e.clientY };
    });
    cursor.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      point = { x: Math.max(25, Math.min(win.innerWidth - 25, e.clientX + drag.dx)), y: Math.max(25, Math.min(win.innerHeight - 25, e.clientY + drag.dy)) };
      update();
    });
    cursor.addEventListener("pointerup", () => {
      drag = null;
    });
    cursor.addEventListener("pointercancel", () => {
      drag = null;
    });
    const timer = setInterval(update, 300);
    const finish = (value) => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      picker.style.opacity = "0";
      picker.style.pointerEvents = "auto";
      picker.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      setTimeout(() => {
        picker.remove();
        done(value);
      }, 400);
    };
    activate(picker.querySelector(".pick-cancel"), () => finish({ error: info.textContent, cancelled: true }));
    activate(confirm, () => {
      if (stopped) return;
      update();
      if (!candidate.error) finish(candidate);
    });
    update();
    return () => finish({ cancelled: true });
  }

  // src/entry.mjs
  var ID = "god-preditor-safari-overlay";
  var KEY = "god-preditor-safari-v4";
  var LEGACY_KEY = "god-preditor-safari-v1";
  var HOME = "https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/";
  var ASSETS = HOME + "assets/";
  var RARE_HISTORY_LIMIT = 2e3;
  var number = (n) => Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  var clock2 = (t) => new Date(t).toLocaleTimeString("ru-RU", { timeZone: "Europe/Kyiv" });
  var duration = (ms) => {
    const n = Math.max(0, Math.ceil(ms / 1e3));
    return `${Math.floor(n / 60).toString().padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
  };
  async function start(gm) {
    if (window !== window.top && location.origin !== GAME_ORIGIN2 || !permittedPage(location) || document.getElementById(ID)) return;
    const host = document.createElement("div");
    host.id = ID;
    host.dataset.version = "1.7.0";
    host.dataset.model = MODEL;
    for (const [k, v] of Object.entries({
      position: "fixed",
      inset: "0 auto auto 0",
      width: "0",
      height: "0",
      "z-index": "2147483647",
      "pointer-events": "none",
      transform: "none"
    })) host.style.setProperty(k, v, "important");
    const root = host.attachShadow({ mode: "open" });
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
    const $2 = (selector) => root.querySelector(selector);
    const panel = $2(".panel"), launcher = $2(".launcher");
    let rows = [], journal = [], legacyJournal = [], selected = "primary", feed = null, status = "connecting", lastSuccessAt = null;
    let rareJournal = [], rareAnalysis = null, rareAnalysisKey = "", rowsRevision = 0;
    let archive = null, archiveSummary = null, archiveRevision = 0, historyMode = "recent";
    let statistics = null, statisticsDay = "", statisticsLoading = false, statisticsPredictKey = "", statisticsListKey = "", latestStatisticsReport = null;
    let destroyed = false, saveTimer = null, storageWarning = false, historyVersion = "", latestResult = "";
    let latestStats = analyze([]), cancelPicker = null, requestedAutoMode = "test", requestedCashoutMode = "test";
    let cashout = null, liveSelection = null;
    const liveMonitor = createLiveMultiplierMonitor();
    const manualListeners = [null, null];
    const ui = { x: 10, y: 115, width: 238, height: 390, opacity: 0.97, collapsed: false };
    const scene = mountScene($2("canvas"), { compact: true });
    const current = (target) => [...journal].reverse().find((x) => x.channel === target && x.model === MODEL);
    let closeOverlay = () => {
    };
    const selectedButtons = [null, null];
    const frameSupport = installFrameSupport(window, () => {
      if (window === window.top && !destroyed) closeOverlay();
    }, () => selectedButtons.filter(Boolean).map((b) => {
      const r = b.element.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }));
    const auto = createAutoBet({
      model: MODEL,
      context: () => ({
        visible: !document.hidden && !destroyed,
        fresh: frameSupport.ready() && sourceReady(status, latestStats, lastSuccessAt),
        forecasts: [current("primary")].filter(Boolean)
      }),
      inspect: inspectBetButton,
      click: clickSelectedBet,
      acquireLock: () => acquireAutoLock(navigator.locks),
      readReceipts: () => gm.getValue(AUTO_KEY, []),
      writeReceipts: (receipts) => gm.setValue(AUTO_KEY, receipts),
      onChange: renderAuto,
      onBetDispatched: (receipt) => {
        if (cashout?.state.armed) cashout.onBetDispatched(receipt);
      },
      beforeBet: ({ index }) => cashout?.state.armed && cashout.state.mode === "live" ? cashout.canTrackBet(index) : true
    });
    cashout = createAutoCashout({
      context: () => ({
        visible: !document.hidden && !destroyed,
        fresh: frameSupport.ready() && sourceReady(status, latestStats, lastSuccessAt),
        autoBetArmed: auto.state.armed,
        autoBetMode: auto.state.mode,
        buttonsConfigured: selectedButtons.every(Boolean) && selectedButtons[0]?.element !== selectedButtons[1]?.element && selectedButtons.every((button) => button?.document === liveSelection?.document)
      }),
      readMultiplier: () => liveMonitor.read(),
      inspectCashout: inspectCashoutButton,
      clickCashout: clickCashoutButton,
      onChange: renderCashout,
      onFatal: (reason2) => auto.disarm("Автозабирание остановлено: " + reason2)
    });
    function renderAutoBrief() {
      if (!cashout || destroyed) return;
      const bet = auto.state, collect = cashout.state;
      $2("#auto-brief").hidden = !(bet.armed || collect.armed || bet.logs.length || collect.logs.length);
      $2("#auto-brief").classList.toggle("armed", bet.armed || collect.armed);
      $2("#auto-brief").textContent = `Авто: ${bet.armed ? bet.mode === "live" ? "включено" : "тест" : "выключено"} · Забрать: ${collect.armed ? collect.mode === "live" ? "включено" : "тест" : "выключено"}
${bet.message}${collect.logs.length || collect.armed ? "\n" + collect.message : ""}`;
      statistics?.resume();
    }
    function renderCashout() {
      if (!cashout || destroyed) return;
      const state = cashout.state, sample = liveMonitor.read();
      $2("#cashout-title").textContent = state.armed ? state.mode === "live" ? "Автозабирание включено" : "Тест счётчика включён" : "Автозабирание выключено";
      $2("#cashout-toggle").textContent = state.armed ? "Выключить автозабирание" : requestedCashoutMode === "live" ? "Включить автозабирание" : "Включить тест счётчика";
      $2("#cashout-toggle").classList.toggle("armed", state.armed);
      $2("#cashout-message").textContent = state.message;
      $2("#live-value").textContent = sample.state === "ready" ? "Сейчас " + number(sample.value) + "× · возраст изменения " + Math.max(0, Date.now() - sample.changedAt) + " мс" : sample.reason || "Счётчик не читается";
      $2("#pick-live").disabled = state.pending.length > 0;
      $2("#cashout-log").replaceChildren(...state.logs.slice(-5).map((entry) => {
        const row = document.createElement("div");
        row.textContent = clock2(entry.at) + " · " + entry.text;
        return row;
      }));
      launcher.dataset.cashout = state.armed ? state.mode : "off";
      renderAutoBrief();
    }
    function watchManualInput(index, selection) {
      manualListeners[index]?.();
      const handler = (event) => {
        if (!event.isTrusted || !cashout.state.armed) return;
        cashout.disarm("Ручное действие — автоотслеживание выключено");
        auto.disarm("Ручное действие — авто выключено");
      };
      selection.element.addEventListener("pointerdown", handler, true);
      selection.element.addEventListener("click", handler, true);
      manualListeners[index] = () => {
        selection.element.removeEventListener("pointerdown", handler, true);
        selection.element.removeEventListener("click", handler, true);
      };
    }
    $2("#pick-live").onclick = () => {
      if (cashout.state.pending.length) return;
      cashout.disarm("Выбор счётчика — отслеживание выключено");
      auto.disarm("Выбор счётчика — авто выключено");
      panel.hidden = true;
      launcher.hidden = true;
      cancelPicker = pickLiveMultiplier(root, (selection) => {
        cancelPicker = null;
        layout();
        $2(".auto-panel").hidden = false;
        if (selection.element) {
          liveSelection = selection;
          liveMonitor.setSource(selection);
          $2("#auto-diagnostic").textContent = "";
        } else $2("#auto-diagnostic").textContent = selection.error || "Выбор отменён";
        renderCashout();
      });
    };
    $2("#cashout-mode").onchange = (event) => {
      if (!event.isTrusted) {
        event.target.value = requestedCashoutMode;
        return;
      }
      requestedCashoutMode = event.target.value === "live" ? "live" : "test";
      cashout.disarm("Режим изменён — отслеживание выключено");
    };
    $2("#cashout-toggle").onclick = () => {
      if (cashout.state.armed) {
        cashout.disarm();
        return;
      }
      if (requestedCashoutMode === "live" && (!liveSelection || selectedButtons.some((button) => !button || button.document !== liveSelection.document))) {
        $2("#cashout-message").textContent = "Выбери живой счётчик и оба поля в одном игровом документе";
        return;
      }
      cashout.arm(requestedCashoutMode);
    };
    function renderAuto() {
      const state = auto.state;
      if (cashout?.state.armed && cashout.state.mode === "live" && (!state.armed || state.mode !== "live")) cashout.disarm("Автоставки выключены — автозабирание выключено");
      $2("#auto-title").textContent = state.armed ? state.mode === "live" ? "Автонажатия включены" : "Тест включён" : "Авто выключено";
      $2("#auto-message").textContent = state.message;
      $2("#auto-toggle").textContent = state.armed ? "Выключить" : requestedAutoMode === "live" ? "Включить автонажатия" : "Включить тест";
      $2("#auto-toggle").classList.toggle("armed", state.armed);
      $2("#auto-open").textContent = state.armed ? state.mode === "live" ? "Авто ON" : "Тест ON" : "Авто";
      launcher.dataset.auto = state.armed ? state.mode : "off";
      const checks = auto.checks();
      checks.forEach((checked, i) => {
        $2("#slot-" + i).textContent = `${i + 1} → основной прогноз · ${checked.state === "ready" ? "готова" : checked.reason}`;
      });
      $2("#auto-log").replaceChildren(...state.logs.slice(-5).map((entry) => {
        const line = document.createElement("div");
        line.textContent = clock2(entry.at) + " · " + entry.text;
        return line;
      }));
      renderAutoBrief();
    }
    $2("#auto-open").onclick = () => {
      $2(".auto-panel").hidden = false;
      renderAuto();
    };
    $2("#auto-close").onclick = () => {
      $2(".auto-panel").hidden = true;
    };
    $2("#auto-check").onclick = () => {
      auto.checkOnly();
    };
    $2("#auto-mode").onchange = (event) => {
      if (!event.isTrusted) {
        event.target.value = requestedAutoMode;
        return;
      }
      requestedAutoMode = event.target.value === "live" ? "live" : "test";
      auto.disarm("Режим изменён — запуск выключен");
    };
    activate($2("#auto-toggle"), (event) => {
      if (auto.state.armed) {
        auto.disarm();
        return;
      }
      if (!event.isTrusted) return;
      void auto.arm(requestedAutoMode);
    });
    for (const index of [0, 1]) activate($2("#pick-" + index), (event) => {
      if (!event.isTrusted) return;
      if (cashout.state.pending.length) {
        $2("#auto-diagnostic").textContent = "Сначала выключи отслеживание активного поля";
        return;
      }
      cashout.disarm("Выбор кнопки — отслеживание выключено");
      auto.disarm("Выбор кнопки — авто выключено");
      panel.hidden = true;
      launcher.hidden = true;
      cancelPicker = pickButton(root, index, (selection) => {
        cancelPicker = null;
        layout();
        $2(".auto-panel").hidden = false;
        if (selection.element) {
          try {
            auto.setButton(index, selection);
            selectedButtons[index] = selection;
            watchManualInput(index, selection);
            frameSupport.invalidate();
            $2("#auto-diagnostic").textContent = "";
          } catch (error) {
            $2("#auto-diagnostic").textContent = error.message;
          }
        } else $2("#auto-diagnostic").textContent = selection.error || "Выбор отменён";
        renderAuto();
      });
    });
    const viewport = () => ({
      left: visualViewport?.offsetLeft || 0,
      top: visualViewport?.offsetTop || 0,
      width: visualViewport?.width || innerWidth,
      height: visualViewport?.height || innerHeight
    });
    const clamp4 = (v, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), v));
    function layout() {
      const v = viewport(), width = Math.min(ui.width, v.width - 16), height = Math.min(ui.height, v.height - 16);
      const w = ui.collapsed ? 84 : width, h = ui.collapsed ? 43 : height;
      ui.x = clamp4(ui.x, v.left + 8, v.left + v.width - w - 8);
      ui.y = clamp4(ui.y, v.top + 8, v.top + v.height - h - 8);
      Object.assign(panel.style, { left: ui.x + "px", top: ui.y + "px", width: width + "px", height: height + "px", opacity: ui.opacity });
      Object.assign(launcher.style, { left: ui.x + "px", top: ui.y + "px" });
      panel.hidden = ui.collapsed;
      launcher.hidden = !ui.collapsed;
      scene.setPaused(ui.collapsed || document.hidden);
    }
    function saveSoon() {
      if (destroyed) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try {
          await gm.setValue(KEY, { model: MODEL, rows: rows.slice(0, 2e3), journal: journal.slice(-100), rareJournal: rareJournal.slice(-100), legacyJournal: legacyJournal.slice(-200), selected, ui: { ...ui } });
        } catch {
          storageWarning = true;
        }
      }, 500);
    }
    function collapse(value) {
      ui.collapsed = value;
      layout();
      saveSoon();
    }
    function movable(element, resize = false) {
      let active = null;
      element.addEventListener("pointerdown", (event) => {
        if (!resize && element !== launcher && event.target.closest("button,a")) return;
        if (event.button !== 0) return;
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        active = { id: event.pointerId, x: event.clientX, y: event.clientY, left: ui.x, top: ui.y, width: ui.width, height: ui.height, moved: false };
      });
      element.addEventListener("pointermove", (event) => {
        if (!active || event.pointerId !== active.id) return;
        const dx = event.clientX - active.x, dy = event.clientY - active.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) active.moved = true;
        if (resize) {
          const v = viewport();
          ui.width = clamp4(active.width + dx, 218, v.width - 16);
          ui.height = clamp4(active.height + dy, 265, v.height - 16);
        } else {
          ui.x = active.left + dx;
          ui.y = active.top + dy;
        }
        layout();
      });
      const finish = (event) => {
        if (!active) return;
        const reopen = element === launcher && !active.moved && event.type === "pointerup";
        active = null;
        saveSoon();
        if (reopen && event.isTrusted) collapse(false);
      };
      element.addEventListener("pointerup", finish);
      element.addEventListener("pointercancel", finish);
      element.addEventListener("lostpointercapture", finish);
    }
    launcher.addEventListener("click", (event) => {
      if (event.isTrusted && event.detail === 0) collapse(false);
    });
    movable($2(".handle"));
    movable(launcher);
    movable($2("#resize"), true);
    function changeSize(direction) {
      const v = viewport();
      const width = Math.min(ui.width, v.width - 16), height = Math.min(ui.height, v.height - 16);
      ui.width = clamp4(width + direction * 30, 218, v.width - 16);
      ui.height = clamp4(height + direction * 45, 265, v.height - 16);
      layout();
      saveSoon();
    }
    $2("#size-up").onclick = () => changeSize(1);
    $2("#size-down").onclick = () => changeSize(-1);
    $2("#minimize").onclick = () => collapse(true);
    $2("#tools-open").onclick = () => {
      $2("#tools").hidden = !$2("#tools").hidden;
      renderStatistics();
    };
    $2("#opacity").onclick = () => {
      ui.opacity = ui.opacity > 0.94 ? 0.82 : ui.opacity > 0.8 ? 0.68 : 0.97;
      layout();
      saveSoon();
    };
    $2("#reset").onclick = () => {
      Object.assign(ui, { x: 10, y: 115, width: 238, height: 390, opacity: 0.97 });
      layout();
      saveSoon();
    };
    for (const button of root.querySelectorAll("[data-target]")) button.onclick = () => {
      selected = button.dataset.target;
      saveSoon();
      render();
    };
    $2("#history-open").onclick = () => {
      historyMode = "recent";
      $2(".history").hidden = false;
      renderHistory();
    };
    $2("#history-close").onclick = () => {
      $2(".history").hidden = true;
    };
    $2("#archive-events").onclick = () => {
      historyMode = "archive";
      $2(".history").hidden = false;
      renderHistory();
    };
    $2("#archive-retry").onclick = () => {
      if (archive?.state.status === "error") void archive.retry();
      else void archive?.refresh();
    };
    $2("#archive-full").onclick = () => {
      void archive?.refresh({ full: true });
    };
    $2("#statistics-refresh").onclick = () => {
      void trainStatistics(true);
    };
    $2("#statistics-details").addEventListener("toggle", () => renderStatistics());
    $2("#statistics-export").onclick = () => {
      if (!statistics?.state.report) return;
      const blob = new Blob([JSON.stringify(statistics.state.report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url;
      link.download = "god-preditor-model-validation.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    };
    $2("#rare-export").onclick = () => {
      const blob = new Blob([JSON.stringify({ model: "rare-alert-v1", evidenceStatus: "experimental-unvalidated", exportedAt: Date.now(), journal: rareJournal }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url;
      link.download = "god-preditor-rare-alerts.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    };
    function renderHistory() {
      const version = historyMode + ":" + archiveRevision + ":" + rows.length + ":" + rows[0]?.id;
      if (version === historyVersion) return;
      historyVersion = version;
      $2("#history-title").textContent = historyMode === "archive" ? "Архив коэффициентов 100×+" : "Полученные коэффициенты";
      const displayed = historyMode === "archive" ? [...archiveSummary?.largeEvents || []].reverse() : rows.slice(0, 100);
      if (historyMode === "archive") $2("#history-count").textContent = archiveSummary ? `${displayed.length} результатов ≥100× · весь загруженный архив · Киев` : "Архив ещё загружается — смотри Настроить → Модели 100×";
      else
        $2("#history-count").textContent = `${rows.length} в рабочей истории · последние 100 · время по Киеву${legacyJournal.length ? " · прежних проверок: " + legacyJournal.length : ""}`;
      const fragment = document.createDocumentFragment();
      for (const row of displayed) {
        const line = document.createElement("div");
        line.className = "row";
        const value = document.createElement("b");
        value.textContent = number(row.coefficient) + "×";
        const time = document.createElement("time");
        time.textContent = historyMode === "archive" ? new Date(row.timestamp).toLocaleString("ru-RU", { timeZone: "Europe/Kyiv" }) : clock2(row.timestamp);
        line.append(value, time);
        fragment.append(line);
      }
      $2(".history-list").replaceChildren(fragment);
    }
    function renderArchiveStatus() {
      const state = archive?.state;
      if (!state) return;
      const summary = state.summary;
      const label = state.loading ? `Архив загружается: ${number(state.loadedCount || state.count || 0)} раундов` : state.status === "error" ? `Загрузка архива остановлена: ${state.error || "проверь связь"}` : summary ? `Архив: ${number(summary.acceptedRoundCount)} раундов · ${number(summary.rawLargeEventCount)} результатов ≥100×` : "Архив ещё не загружен";
      const range2 = summary?.firstAt && summary?.lastAt ? "\n" + new Date(summary.firstAt).toLocaleDateString("ru-RU", { timeZone: "Europe/Kyiv" }) + " — " + new Date(summary.lastAt).toLocaleDateString("ru-RU", { timeZone: "Europe/Kyiv" }) + " · исходное время раундов" : "";
      $2("#archive-status").textContent = label + range2 + (state.cacheWarning ? "\nКэш недоступен: архив хранится в памяти этой вкладки" : "");
      $2("#archive-retry").disabled = state.loading;
      $2("#archive-full").disabled = state.loading;
    }
    async function trainStatistics(force = false) {
      if (destroyed || !statistics || !archive?.state.summary || archive.state.loading || statisticsLoading) return;
      const day = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
      if (!force && statisticsDay === day) return;
      statisticsLoading = true;
      try {
        const history = await archive.getRows();
        if (!destroyed && history?.length) {
          statisticsDay = day;
          statistics.train(history, { now: Date.now() });
        }
      } catch {
        if (!destroyed) $2("#statistics-status").textContent = "Не удалось прочитать полный архив для моделей; обнови архив";
      } finally {
        statisticsLoading = false;
      }
    }
    function renderStatistics() {
      if (!statistics || destroyed) return;
      const state = statistics.state, report = state.report, forecast = state.forecast;
      const progress = state.progress;
      $2("#statistics-status").textContent = state.status === "ready" ? "Модели рассчитаны · оценки экспериментальные" : progress?.day && progress.stage?.startsWith("time-zone") ? `Проверяем временные зоны · ${progress.day}` : progress?.day ? `Проверяем ${progress.day} · ${progress.fold || 0}/${progress.folds || 0} дней` : state.message || "Подготовка моделей";
      $2("#statistics-refresh").disabled = ["training", "running", "fitting"].includes(state.status) || statisticsLoading || archive?.state.loading || !archive?.state.summary;
      $2("#statistics-export").disabled = !report;
      const protocol = report?.validation?.protocol;
      const checkedDates = protocol?.folds?.filter((value) => value.stage === "confirmation").map((value) => value.day) || [];
      $2("#statistics-summary").textContent = report ? `${number(report.history?.acceptedCount || 0)} раундов · обучение только на предыдущих днях.
Дней для подбора: ${protocol?.developmentDays || 0}; для отдельной проверки: ${protocol?.confirmationDays || 0}.${checkedDates.length ? "\nПроверка: " + checkedDates[0] + " — " + checkedDates.at(-1) + " · Киев." : ""}
Моделей с подтверждённой пользой: ${report.validation?.models?.filter((value) => value.qualified).length || 0}. Общий сигнал требует отдельной проверки комбинации и согласия разных семейств.
Оценки для следующих раундов не подтверждают выигрыш ставки.` : "Архив загружается, затем выполняется последовательная проверка на новых днях.";
      const headSignature = JSON.stringify([...new Set(rows.filter((row) => row.timestamp === latestStats.lastAt).map((row) => row.id))].sort());
      const now = Date.now(), fresh = state.status === "ready" && sourceReady(status, latestStats, lastSuccessAt, now) && Number.isFinite(forecast?.generatedAt) && now >= forecast.generatedAt && now - forecast.generatedAt <= 18e4 && forecast.sourceLastAt === latestStats.lastAt && forecast.sourceLastId === latestStats.lastId && headSignature.length <= 2e3 && forecast.sourceHeadSignature === headSignature && Number.isFinite(forecast.sourceLastAt) && now >= forecast.sourceLastAt && now - forecast.sourceLastAt <= 18e4;
      if (state.status === "ready" && !fresh) $2("#statistics-status").textContent = "Ожидаем свежую оценку для текущего раунда";
      const signals = fresh ? forecast?.consensus?.signals || [] : [];
      $2("#suite-signal").hidden = signals.length === 0;
      $2("#suite-signal").textContent = signals.length ? signals.map((value) => `Согласование моделей: ≥${number(value.target)}× · следующие ${value.horizon} раундов
Поддержано в отдельной проверке; не гарантия события`).join("\n") : "";
      if ($2("#tools").hidden || !$2("#statistics-details").open) return;
      const key = state.status + ":" + (report?.generatedAt || "") + ":" + (forecast?.generatedAt || "") + ":" + fresh + ":" + headSignature;
      if (statisticsListKey === key) return;
      statisticsListKey = key;
      const names = { "bayesian-hazard-v1": "Bayesian Hazard", "weibull-survival-v1": "Weibull Survival", "hawkes-exponential": "Hawkes Process", "cycle-calibrated-v1": "Цикл", "cluster-calibrated-v1": "Кластер", "bayesian-time-buckets-300": "Bayesian Time Buckets", "multi-day-seasonality-300": "Multi-day Seasonality" };
      const percent2 = (value) => Number.isFinite(value) ? number(value * 100) + "%" : "—";
      const estimates = forecast?.estimates || report?.estimates || [];
      const elements = estimates.map((value) => {
        const item = document.createElement("p");
        item.className = "model-estimate";
        const validation = report?.validation?.models?.find((model) => model.key === `${value.modelId}:${value.target}:${value.horizon}`);
        const interval = value.interval95?.length === 2 ? `${percent2(value.interval95[0])}–${percent2(value.interval95[1])}` : "нет оценки диапазона";
        const heading = names[value.modelId] || value.modelId.replace("temporal-pattern-", "Temporal Pattern ±").replace("circular-kde-", "Circular KDE ±");
        const approximation = value.family === "hawkes" ? "\nПриближение по историческому темпу раундов." : value.family === "time" ? "\nОценка по известному сейчас времени; время следующего раунда неизвестно." : "";
        item.textContent = `${heading} · ≥${number(value.target)}× · ${value.horizon} раунд.
${value.status === "ready" ? percent2(value.probability) + " · условный диапазон " + interval : "Пока нет устойчивой оценки для этой цели"}${approximation}
Проверка: ${validation?.qualified ? "есть подтверждение на последующих днях" : "преимущество не подтверждено"} · ${validation?.known || 0} окон / ${validation?.dayCount || 0} дней`;
        return item;
      });
      $2("#statistics-models").replaceChildren(...elements);
      const zones = fresh ? forecast?.zones || [] : [];
      const timeOfDay = (seconds) => `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
      $2("#statistics-zones").textContent = zones.length ? zones.map((zone) => `Подтверждённая зона ≥${number(zone.target)}×: ${timeOfDay(zone.centerSecond)} ±${zone.radiusSeconds} сек · Киев
${zone.insideHits}/${zone.insideRounds} попаданий; проверка ${zone.confirmationDays} дней.`).join("\n\n") : "Устойчивые текущие временные зоны пока не подтверждены.";
    }
    function render() {
      if (destroyed) return;
      const now = Date.now(), stats = analyze(rows, now);
      latestStats = stats;
      const result = advanceJournal(journal, rows, stats, now, true, { online: status === "connected", lastSuccessAt });
      journal = result.journal;
      host.dataset.ready = String(stats.ready);
      host.dataset.continuityCount = String(stats.continuityCount);
      if (result.changed) saveSoon();
      const rareKey = rowsRevision + ":" + archiveRevision + ":" + Math.floor(now / 6e4) + ":" + (stats.fresh === true);
      if (rareKey !== rareAnalysisKey) {
        rareAnalysis = archiveSummary ? analyzeRareArchive(rows.slice(0, RARE_HISTORY_LIMIT), archiveSummary, now) : analyzeRareWindows(rows.slice(0, RARE_HISTORY_LIMIT), now);
        rareAnalysisKey = rareKey;
      }
      if (statistics && statisticsPredictKey !== rareKey) {
        statisticsPredictKey = rareKey;
        statistics.predict(rows.slice(0, RARE_HISTORY_LIMIT), { now });
      }
      renderStatistics();
      const rare = advanceRareAlerts(rareJournal, rows, { analysis: rareAnalysis, bigForecast: current("big"), now, online: status === "connected", lastSuccessAt });
      rareJournal = rare.journal;
      if (rare.changed) saveSoon();
      const rareView = formatRarePresentation({ analysis: rareAnalysis, alerts: rare, now, online: status === "connected", lastSuccessAt });
      $2("#rare-alert").hidden = !rareView.banner;
      $2("#rare-title").textContent = rareView.banner?.title || "";
      $2("#rare-window").textContent = rareView.banner?.windowLabel || "";
      $2("#rare-detail").textContent = rareView.banner?.detail || "";
      $2("#rare-diagnostics").textContent = rareView.diagnostics.join("\n\n");
      $2("#rare-result").textContent = rareView.journalLabel;
      const forecast = current(selected), occupied = stats.ready && forecast && now <= forecast.end;
      $2("#status").className = "status" + (status === "error" ? " error" : !stats.fresh && rows.length ? " warn" : "");
      $2("#status").textContent = status === "error" ? host.dataset.error || "Ошибка связи · открой «Настроить»" : status === "connected" ? stats.fresh ? `● Supabase · ${rows.length} · Киев` : "● Связь есть · история устарела" : status === "paused" ? "Пауза в фоне" : "Подключение к нашему Supabase…";
      if (storageWarning) $2("#status").textContent += " · сохранение недоступно";
      const signature = rows.slice(0, 5).map((x) => x.id).join("|");
      if ($2(".recent").dataset.signature !== signature) {
        $2(".recent").dataset.signature = signature;
        $2(".recent").replaceChildren(...rows.slice(0, 5).map((row) => {
          const chip = document.createElement("div");
          chip.className = "chip" + (row.coefficient < 2 ? " low" : "");
          const value = document.createElement("b");
          value.textContent = number(row.coefficient) + "×";
          const time = document.createElement("time");
          time.textContent = clock2(row.timestamp);
          chip.append(value, time);
          return chip;
        }));
      }
      $2("#signal").textContent = stats.ready && occupied ? number(forecast.target) + "×" : stats.n && !stats.fresh ? "Пауза" : "—";
      $2("#window").textContent = !stats.ready ? "Пауза · нужно 20 свежих\nпоследовательных раундов" : forecast && occupied ? `${clock2(forecast.start)} — ${clock2(forecast.end)}
Окно · Киев` : forecast?.status === "pending" ? "Проверяем покрытие окна" : selected === "big" && stats.ready ? "Дополнительного окна сейчас нет" : "Нужно 20 раундов\nи свежий поток";
      $2("#note").textContent = forecast && occupied ? `${now < forecast.start ? "До окна " + duration(forecast.start - now) : "До конца " + duration(forecast.end - now)} · ${forecast.pattern} · балл ${forecast.heuristicScore}/100 · эксперимент` : "Балл правила не равен вероятности выигрыша";
      launcher.querySelector("span").textContent = stats.ready && occupied ? number(forecast.target) + "×" : "…";
      for (const button of root.querySelectorAll("[data-target]")) button.classList.toggle("active", button.dataset.target === selected);
      const completed = [...journal].reverse().find((x) => x.channel === selected && ["hit", "miss", "unknown"].includes(x.status));
      const key = completed ? completed.key + completed.status : "";
      if (key !== latestResult) {
        latestResult = key;
        $2("#result").className = "result " + (completed?.status || "");
        $2("#result-image").hidden = !completed || completed.status === "unknown";
        if (completed && completed.status !== "unknown") $2("#result-image").src = ASSETS + `result-${completed.status}.webp`;
      }
      $2("#result-label").textContent = completed ? (completed.status === "hit" ? "ЦЕЛЬ В ОКНЕ" : completed.status === "miss" ? "НИЖЕ ЦЕЛИ В ОКНЕ" : "НЕТ ДАННЫХ") + (completed.actual != null ? " · макс. окна " + number(completed.actual) + "×" : "") : "Проверка: достижение цели в окне";
      if (!$2(".history").hidden) renderHistory();
      if (!$2(".auto-panel").hidden) {
        renderAuto();
        renderCashout();
      }
    }
    const fetchImpl = createExtensionFetch(gm, SUPABASE_CONFIG);
    let cache = null;
    try {
      cache = createArchiveCache({ name: "god-preditor-archive-v1:" + new URL(SUPABASE_CONFIG.url).hostname + ":" + SUPABASE_CONFIG.table });
    } catch {
    }
    statistics = createStatisticsRunner({ canRunFallback: () => !document.hidden && !destroyed && !auto.state.armed && !cashout.state.armed, onChange(state) {
      if (destroyed) return;
      const changed = latestStatisticsReport !== state.report;
      latestStatisticsReport = state.report;
      renderStatistics();
      if (changed && state.report) statistics.predict(rows.slice(0, RARE_HISTORY_LIMIT), { now: Date.now() });
    } });
    archive = createArchiveService({ config: SUPABASE_CONFIG, fetchImpl, cache, onChange(state) {
      if (destroyed) return;
      const changed = archiveSummary !== state.summary;
      archiveSummary = state.summary;
      if (changed) {
        archiveRevision++;
        render();
      }
      if (state.status === "complete" && !state.loading) void trainStatistics();
      renderArchiveStatus();
    } });
    function startFeed() {
      if (destroyed || document.hidden) return;
      feed?.stop();
      status = "connecting";
      feed = createSupabaseFeed(SUPABASE_CONFIG, {
        fetchImpl,
        onRounds(batch, { initial = false } = {}) {
          if (destroyed) return;
          const seen = new Set(rows.map((x) => x.id));
          rows = mergeRounds(rows, batch, "Supabase · LuckyJet").rounds;
          rowsRevision++;
          scene.push(batch.filter((x) => !seen.has(x.id)), { initial });
          saveSoon();
          render();
        },
        onStatus(s) {
          if (destroyed) return;
          status = s.state;
          if (s.lastSuccess) lastSuccessAt = s.lastSuccess;
          if (s.state === "error") {
            cashout.disarm("Ошибка связи — отслеживание выключено");
            auto.disarm("Ошибка связи — авто выключено");
          }
          if (s.message) host.dataset.error = s.message;
          render();
        }
      });
      render();
    }
    $2("#retry").onclick = startFeed;
    const onVisibility = () => {
      if (document.hidden) {
        cashout.disarm("Safari ушёл в фон — отслеживание выключено");
        auto.disarm("Safari ушёл в фон — авто выключено");
        cancelPicker?.();
        feed?.stop();
        feed = null;
        status = "paused";
        scene.setPaused(true);
      } else {
        layout();
        startFeed();
        statistics?.resume();
      }
    };
    const onPageHide = () => {
      cashout.disarm("Страница закрыта — отслеживание выключено");
      auto.disarm("Страница закрыта — авто выключено");
      cancelPicker?.();
      feed?.stop();
      feed = null;
      scene.setPaused(true);
    };
    const onPageShow = (event) => {
      if (event.persisted && !document.hidden) {
        layout();
        startFeed();
      }
    };
    const onResize = () => layout();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("resize", onResize);
    visualViewport?.addEventListener("resize", onResize);
    visualViewport?.addEventListener("scroll", onResize);
    const observer = new MutationObserver(() => {
      if (!destroyed && !document.documentElement.contains(host)) document.documentElement.append(host);
    });
    observer.observe(document.documentElement, { childList: true });
    const tick = setInterval(() => {
      if (!document.hidden) render();
    }, 1e3);
    const archiveTick = setInterval(() => {
      if (!document.hidden && !destroyed && archive && !archive.state.loading) void archive.refresh();
    }, 15 * 6e4);
    const autoTick = setInterval(() => {
      void auto.tick().catch(() => auto.disarm("Ошибка авто — режим выключен"));
    }, 250);
    let cashoutFrame = null, lastCashoutRender = 0;
    function cashoutLoop() {
      if (destroyed) return;
      if (!document.hidden) {
        try {
          cashout.tick();
        } catch {
          cashout.disarm("Ошибка отслеживания — выключено");
          auto.disarm("Ошибка отслеживания — авто выключено");
        }
        if (!$2(".auto-panel").hidden && performance.now() - lastCashoutRender > 250) {
          renderCashout();
          lastCashoutRender = performance.now();
        }
      }
      cashoutFrame = requestAnimationFrame(cashoutLoop);
    }
    cashoutFrame = requestAnimationFrame(cashoutLoop);
    closeOverlay = $2("#close").onclick = () => {
      cashout.disarm("Панель закрыта — отслеживание выключено");
      liveMonitor.clear();
      manualListeners.forEach((stop) => stop?.());
      cancelAnimationFrame(cashoutFrame);
      auto.disarm("Панель закрыта — авто выключено");
      cancelPicker?.();
      destroyed = true;
      if (window !== window.top) frameSupport.stop();
      clearInterval(tick);
      clearInterval(archiveTick);
      clearInterval(autoTick);
      clearTimeout(saveTimer);
      feed?.stop();
      archive?.stop();
      statistics?.stop();
      scene.destroy();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("resize", onResize);
      visualViewport?.removeEventListener("resize", onResize);
      visualViewport?.removeEventListener("scroll", onResize);
      host.remove();
    };
    const brandImage = $2("#brand-image");
    brandImage.onload = () => {
      brandImage.hidden = false;
      $2("#brand-text").hidden = true;
    };
    brandImage.onerror = () => {
      brandImage.hidden = true;
      $2("#brand-text").hidden = false;
    };
    brandImage.src = ASSETS + "god-preditor-original.webp";
    $2(".vip").src = ASSETS + "vip-original.webp";
    $2(".vip").onerror = (event) => {
      event.target.hidden = true;
    };
    $2("#result-image").onerror = () => {
      $2("#result-image").hidden = true;
    };
    for (const button of root.querySelectorAll("button")) {
      if (button === launcher || !button.onclick) continue;
      const handler = button.onclick;
      button.onclick = null;
      activate(button, handler);
    }
    layout();
    render();
    try {
      const saved = await loadPanelState(gm, MODEL, { key: KEY, legacyKey: LEGACY_KEY });
      if (saved && !destroyed) {
        rows = mergeRounds([], Array.isArray(saved.rows) ? saved.rows : [], "Supabase · LuckyJet").rounds;
        rowsRevision++;
        journal = saved.model === MODEL && Array.isArray(saved.journal) ? saved.journal.slice(-100) : [];
        rareJournal = Array.isArray(saved.rareJournal) ? saved.rareJournal : [];
        legacyJournal = saved.legacyJournal;
        selected = saved.selected === "big" ? "big" : "primary";
        if (saved.ui && typeof saved.ui === "object") {
          for (const key of ["x", "y", "width", "height", "opacity"]) if (Number.isFinite(saved.ui[key])) ui[key] = saved.ui[key];
          ui.width = clamp4(ui.width, 218, 600);
          ui.height = clamp4(ui.height, 265, 700);
          ui.opacity = clamp4(ui.opacity, 0.6, 1);
          ui.collapsed = saved.ui.collapsed === true;
        }
        layout();
        render();
      }
    } catch {
      storageWarning = true;
    }
    await auto.initialize();
    startFeed();
    void archive.start();
  }
  if (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function") {
    void start(GM).catch((error) => console.error("GOD PREDITOR:", error.message));
  }
})();
