export const CASHOUT_FRESH_MS = 750;
export const CASHOUT_TICK_MS = 1000;
export const CASHOUT_WAIT_MS = 120000;
export const CASHOUT_ACK_MS = 2500;

// This controller has no selectors, persistence, network access or timers. Only
// a new receipt from our own Bet dispatcher can create a cashout target.
export function createAutoCashout({now = Date.now, monotonic = () => performance.now(),
  context, readMultiplier, inspectCashout, clickCashout, onChange = () => {}, onFatal = () => {}}) {
  let armed = false, mode = 'test', generation = 0, busy = false, failing = false, notifying = false;
  let armedAt = 0, previousNow = 0, previousMono = 0, latestSource = null;
  let message = 'Автовывод выключен', logs = [];
  const pending = new Map(), acknowledgements = new Map();
  const receipts = new Set(), consumed = new Set();

  function record(text) {
    if (text !== message) {
      message = text;
      logs.push({at: previousNow, text});
      logs = logs.slice(-30);
    }
  }
  function clear() {
    generation++;
    armed = false;
    pending.clear();
    acknowledgements.clear();
  }
  function fail(reason) {
    if (failing) return false;
    failing = true;
    clear();
    record(reason);
    // A failing observer must not recurse into another failure notification or
    // re-arm while the failure is being delivered.
    if (!notifying) {
      notifying = true;
      try {onChange();} catch {}
      finally {notifying = false;}
    }
    try {onFatal(reason);} catch {}
    finally {failing = false;}
    return false;
  }
  function notify(text) {
    if (text) record(text);
    if (notifying) return;
    notifying = true;
    try {onChange();}
    catch {fail('Автовывод выключен: ошибка обновления состояния');}
    finally {notifying = false;}
  }
  function disarm(reason = 'Автовывод выключен') {
    clear();
    notify(reason);
  }
  function clock(initial = false) {
    const time = now(), mono = monotonic();
    if (!Number.isFinite(time) || !Number.isFinite(mono) || mono < 0) throw Error('Некорректные часы');
    if (!initial) {
      const wallGap = time - previousNow, monoGap = mono - previousMono;
      if (wallGap < 0 || monoGap < 0 || wallGap > CASHOUT_TICK_MS || monoGap > CASHOUT_TICK_MS ||
          Math.abs(wallGap - monoGap) > 1500) throw Error('Таймер задержался или изменились часы');
    }
    return {time, mono};
  }
  function checkContext() {
    const state = context();
    if (!state || state.visible !== true || state.fresh !== true) throw Error('Вкладка скрыта или связь устарела');
    const configured = state.buttonsConfigured === true ||
      (Array.isArray(state.buttonsConfigured) && state.buttonsConfigured.length === 2 && state.buttonsConfigured.every(Boolean));
    if (mode === 'live' && (state.autoBetArmed !== true || state.autoBetMode !== 'live' || !configured)) {
      throw Error('Для реального автовывода нужны автоставки и две выбранные кнопки');
    }
    return state;
  }
  function sourceAt(time) {
    const readMono = monotonic();
    const source = readMultiplier();
    const observedAt = now(), observedMono = monotonic();
    // The DOM adapter timestamps the value during its own read, after the
    // caller's clock snapshot. Compare against the clock AFTER that read;
    // there is no allowance for genuinely future source timestamps.
    if (!Number.isFinite(readMono) || readMono < 0 || !Number.isFinite(observedAt) || !Number.isFinite(observedMono) || observedMono < 0 ||
        observedAt < time || observedMono < readMono || observedAt - time > CASHOUT_TICK_MS ||
        observedMono - readMono > CASHOUT_TICK_MS ||
        Math.abs((observedAt - time) - (observedMono - readMono)) > 1500) throw Error('Чтение коэффициента задержалось или изменились часы');
    if (!source || !['ready', 'waiting'].includes(source.state)) throw Error(source?.reason || 'Живой коэффициент недоступен');
    if (!Number.isFinite(source.at) || source.at > observedAt || observedAt - source.at > CASHOUT_FRESH_MS ||
        !Number.isInteger(source.epoch) || source.epoch < 0) throw Error('Живой коэффициент имеет неверное время или раунд');
    if (source.changedAt != null && (!Number.isFinite(source.changedAt) || source.changedAt > source.at)) {
      throw Error('Неверное время изменения живого коэффициента');
    }
    if (source.state === 'ready' && (!Number.isFinite(source.value) || source.value < 1 || !Number.isFinite(source.changedAt))) {
      throw Error('Нет читаемого числового коэффициента');
    }
    if (latestSource && (source.epoch < latestSource.epoch ||
        (source.changedAt != null && latestSource.changedAt != null && source.changedAt < latestSource.changedAt))) {
      throw Error('Источник коэффициента сменился или время пошло назад');
    }
    latestSource = {...source, observedAt};
    return latestSource;
  }
  function inspect(button) {
    const checked = inspectCashout(button);
    if (!checked || !['ready', 'waiting', 'closed'].includes(checked.state)) {
      throw Error(checked?.reason || 'Кнопка вывода недоступна');
    }
    return checked;
  }
  function close(entry, reason) {
    pending.delete(entry.index);
    notify(`Поле ${entry.index + 1}: ${reason} · жду новую автоставку`);
  }
  function freshChange(source, time) {
    time = Math.max(time, source.observedAt);
    return source.state === 'ready' && source.changedAt <= time && time - source.changedAt <= CASHOUT_FRESH_MS;
  }
  function arm(nextMode = 'test') {
    if (busy || failing || notifying) return false;
    busy = true;
    try {
      clear();
      latestSource = null;
      if (!['test', 'live'].includes(nextMode)) throw Error('Неизвестный режим автовывода');
      mode = nextMode;
      const {time, mono} = clock(true);
      checkContext();
      const source = sourceAt(time);
      if (source.state !== 'ready') throw Error('Сначала выбери читаемый живой коэффициент');
      armedAt = previousNow = time;
      previousMono = mono;
      armed = true;
      const ticket = generation;
      notify(mode === 'live' ? 'Автовывод включён · жду новую автоставку' : 'Тест автовывода · реальных нажатий нет');
      return armed && generation === ticket;
    } catch (error) {return fail(`Автовывод выключен: ${error.message}`);}
    finally {busy = false;}
  }
  function onBetDispatched(receipt) {
    if (!armed || busy || failing) return false;
    // Test and live receipts cannot cross modes, and no history is scanned.
    if (!receipt || receipt.mode !== mode || ![0, 1].includes(receipt.index) ||
        typeof receipt.windowKey !== 'string' || !receipt.windowKey || receipt.windowKey.length > 500 ||
        !Number.isFinite(receipt.target) || receipt.target < 1 || !receipt.button) return false;
    const id = `${receipt.windowKey}:${receipt.index}`;
    if (receipts.has(id)) return false;
    busy = true;
    try {
      const {time} = clock();
      // A hook delivered after rearming, or replayed from history, owns nothing.
      if (!Number.isFinite(receipt.at) || receipt.at < armedAt || receipt.at > time || time - receipt.at > CASHOUT_FRESH_MS) return false;
      checkContext();
      const source = sourceAt(time);
      if (pending.has(receipt.index) || acknowledgements.has(receipt.index)) throw Error('Новая ставка до завершения предыдущего наблюдения');
      receipts.add(id);
      pending.set(receipt.index, {
        id, index: receipt.index, windowKey: receipt.windowKey, receiptId: receipt.receiptId ?? id,
        target: receipt.target, button: receipt.button, at: receipt.at, mode,
        baselineEpoch: source.epoch, epoch: source.epoch, roundSeen: false, phase: 'waiting',
        active: false, sawQueued: false, increases: 0, readyBaseline: false, lastValue: null, lastChangeAt: null
      });
      notify(`Поле ${receipt.index + 1}: цель ${receipt.target.toFixed(2)}× закреплена · жду новый полёт`);
      return armed;
    } catch (error) {return fail(`Автовывод выключен: ${error.message}`);}
    finally {busy = false;}
  }
  function canTrackBet(index) {
    if (!armed || mode !== 'live' || busy || failing || ![0, 1].includes(index)) return false;
    busy = true;
    try {
      const {time} = clock();
      checkContext();
      // A previously selected counter may display a waiting message between
      // flights. Keep the own new bet queued; never infer a live multiplier.
      sourceAt(time);
      clock();
      checkContext();
      if (pending.has(index) || acknowledgements.has(index)) throw Error(`Поле ${index + 1}: предыдущее наблюдение ещё не завершено`);
      return armed;
    } catch (error) {return fail(`Автовывод выключен: ${error.message}`);}
    finally {busy = false;}
  }
  function tick() {
    if (!armed || busy || failing) return;
    busy = true;
    const ticket = generation;
    try {
      const {time, mono} = clock();
      previousNow = time;
      previousMono = mono;
      checkContext();
      const source = sourceAt(time);
      for (const [index, ack] of acknowledgements) {
        const checked = inspect(ack.button);
        if (checked.state !== 'ready') {
          acknowledgements.delete(index);
          notify(`Поле ${index + 1}: запрос отправлен, кнопка изменилась · проверь игру`);
        } else if (time >= ack.until) throw Error(`Поле ${index + 1}: кнопка не подтвердила запрос · повторения нет`);
        if (!armed || generation !== ticket) return;
      }
      for (const entry of [...pending.values()]) {
        if (!armed || generation !== ticket) return;
        checkContext();
        const checked = inspect(entry.button);
        if (checked.state === 'waiting') entry.sawQueued = true;
        if (checked.state === 'closed' && (entry.active || entry.sawQueued)) {
          close(entry, 'полёт или ставка завершились, результат не подтверждён');
          continue;
        }
        if (checked.state === 'ready') entry.active = true;
        if (entry.phase === 'waiting' && time - entry.at > CASHOUT_WAIT_MS) throw Error(`Поле ${entry.index + 1}: новый полёт не подтверждён за 120 секунд`);
        if (source.state === 'waiting') {
          if (entry.phase === 'tracking') throw Error('Живой коэффициент пропал во время полёта');
          continue;
        }
        if (entry.roundSeen && (source.epoch !== entry.epoch || source.value < entry.lastValue)) {
          close(entry, 'коэффициент сбросился, прежнее наблюдение завершено');
          continue;
        }
        if (!entry.roundSeen) {
          const afterDispatch = source.at > entry.at && source.changedAt > entry.at;
          // A queued Bet can be waiting while the PREVIOUS flight is still
          // below 1.20. Only the selected field becoming Cashout-ready may
          // commit that evidence to a flight owned by this receipt.
          if (checked.state !== 'ready') continue;
          if (!(source.epoch > entry.baselineEpoch || (afterDispatch && source.value <= 1.20))) continue;
          entry.roundSeen = true;
          entry.epoch = source.epoch;
          entry.lastValue = source.value;
          entry.lastChangeAt = source.changedAt;
        }
        if (checked.state !== 'ready') {
          entry.readyBaseline = false;
          entry.increases = 0;
          entry.lastValue = source.value;
          entry.lastChangeAt = source.changedAt;
          continue;
        }
        entry.active = true;
        entry.phase = 'tracking';
        if (!freshChange(source, time)) throw Error('Живой коэффициент перестал обновляться');
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

        // Re-read every dependency per field. A first field's synchronous click
        // may change the other field, visibility, clock, or armed state.
        const beforeRead = clock();
        checkContext();
        const finalSource = sourceAt(beforeRead.time), finalButton = inspect(entry.button);
        const finalClock = clock();
        checkContext();
        if (!armed || generation !== ticket) return;
        if (finalButton.state === 'closed') {close(entry, 'ставка завершилась до запроса'); continue;}
        if (finalButton.state !== 'ready') {entry.readyBaseline = false; entry.increases = 0; continue;}
        if (finalSource.state !== 'ready') throw Error('Живой коэффициент пропал перед запросом');
        if (finalSource.epoch !== entry.epoch || finalSource.value < entry.lastValue) {
          close(entry, 'коэффициент сбросился до запроса');
          continue;
        }
        if (!freshChange(finalSource, finalClock.time)) throw Error('Живой коэффициент устарел перед запросом');
        if (finalSource.value < entry.target) continue;
        // Reserve before invoking user code. Neither a throw nor reentrancy can
        // restore this target or retry a possibly dispatched monetary request.
        pending.delete(entry.index);
        consumed.add(entry.id);
        if (mode === 'test') {
          notify(`ТЕСТ ${entry.index + 1}: порог ${entry.target.toFixed(2)}× достигнут · нажатий нет`);
          continue;
        }
        acknowledgements.set(entry.index, {button: entry.button, until: finalClock.time + CASHOUT_ACK_MS});
        clickCashout(entry.button);
        if (!armed || generation !== ticket) return;
        notify(`Поле ${entry.index + 1}: запрос вывода отправлен · проверь подтверждение в игре`);
      }
    } catch (error) {fail(`Автовывод выключен: ${error.message}`);}
    finally {busy = false;}
  }
  return {arm, disarm, canTrackBet, onBetDispatched, tick,
    get state() {
      return {armed, mode, message, logs: logs.map(entry => ({...entry})),
        pending: [...pending.values()].map(({index, target, windowKey, receiptId, at, phase, increases}) =>
          ({index, target, windowKey, receiptId, at, phase, increases})),
        acknowledgements: [...acknowledgements.keys()], consumed: [...consumed],
        source: latestSource ? {...latestSource} : null};
    }};
}
