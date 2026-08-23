(function () {
  'use strict';

  const BASE = 'https://allpredictor.com/api/v1';
  const API_KEY = 'ap_de0cc6901c6303fe93388c94934c30ceac8baf126e2474b6';
  const DIRECT_HISTORY_URL = 'https://crash-gateway-grm-cr.100hp.app/history';
  const DIRECT_HISTORY_HEADERS = {
    'customer-id': '077dee8d-c923-4c02-9bee-757573662e69',
    'session-id': '783ee79a-dafc-479e-bf22-834336380cdf',
    'accept': 'application/json'
  };
  const KYIV_TZ = 'Europe/Kyiv';
  const API_TIMEOUT_MS = 15000;
  const API_RETRY_DELAY_MS = 5 * 60 * 1000;
  const DIRECT_CACHE_MS = 1500;
  const SIGNAL_DELAY_MS = 60 * 1000;
  const ACTIVE_MAX_AGE_MS = 30 * 60 * 1000;
  const RANGE_MIN = 1.50;
  const RANGE_MAX = 10.00;
  const DAILY_LIMIT = 30;

  const COUNTS_KEY = 'kk_pred_counts_v1';
  const HISTORY_KEY = 'kk_pred_history_v1';
  const RANGE_KEY = 'kk_pred_range_classic_v2';
  const ACTIVE_KEY = 'luckyjet_classic_active_v2';
  const WAKE_KEY = 'luckyjet_classic_wake_v1';
  const VOICE_KEY = 'lj_voice_enabled';
  const DAILY_START_KEY = 'kk_daily_start_v1';
  const DAILY_USED_KEY = 'kk_daily_used_v1';
  const DAILY_LOCK_KEY = 'kk_daily_lock_v1';

  const multEl = document.getElementById('multiplier');
  const circle = document.getElementById('circle');
  const spin = circle ? circle.querySelector('.ring-spin') : null;
  const circleInner = document.getElementById('circleInner');
  const generateButton = document.getElementById('generateButton');
  const autoButton = document.getElementById('autoButton');
  const keepAwakeButton = document.getElementById('keepAwakeButton');
  const roundEl = document.getElementById('roundStatus');
  const lastEl = document.getElementById('lastCoef');
  const betTimeEl = document.getElementById('betTime');
  const countOkEl = document.getElementById('countOk');
  const countKoEl = document.getElementById('countKo');
  const countTotalEl = document.getElementById('countTotal');
  const statusEl = document.getElementById('verifyStatus');
  const countdownEl = document.getElementById('countdown');
  const marketSignalEl = document.getElementById('marketSignal');
  const msIconEl = document.getElementById('msIcon');
  const msTitleEl = document.getElementById('msTitle');
  const msDescEl = document.getElementById('msDesc');
  const msScoreEl = document.getElementById('msScore');
  const coefBarsEl = document.getElementById('coefBars');
  const voiceToggleBtn = document.getElementById('voiceToggle');
  const voiceToast = document.getElementById('voiceToast');
  const speakingIndicator = document.getElementById('speakingIndicator');
  const fbIndicator = document.getElementById('fbIndicator');
  const fbMsg = document.getElementById('fbMsg');

  if (!multEl || !circle || !generateButton || !autoButton || !statusEl) return;

  let currentPredicted = null;
  let currentConfidence = null;
  let currentSignal = null;
  let pending = null;
  let scheduledStart = null;
  let verificationStarted = false;
  let lastRoundSignature = null;
  let lastCrashAt = null;
  let lastGeneratedCoef = null;
  let coefficientTimer = null;
  let autoTimer = null;
  let autoMode = false;
  let requestInFlight = false;
  let coefficientRequestInFlight = false;
  let coefficientErrors = 0;
  let apiUnavailableUntil = 0;
  let directHistoryCache = null;
  let directHistoryCachedAt = 0;
  let wakeLock = null;
  let wakeRequested = storageGet(WAKE_KEY) === '1';
  let voiceEnabled = storageGet(VOICE_KEY) !== 'false';
  let lastVoiceMsg = '';
  let fbTimer = null;

  let counts = loadCounts();
  let history = loadHistory();
  let range = loadRange();

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Приложение продолжает работать без постоянного хранилища.
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // Нечего удалять.
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function loadCounts() {
    try {
      const value = JSON.parse(storageGet(COUNTS_KEY) || '{}');
      return {ok: Number(value.ok) || 0, ko: Number(value.ko) || 0};
    } catch (error) {
      return {ok: 0, ko: 0};
    }
  }

  function loadHistory() {
    try {
      const value = JSON.parse(storageGet(HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function loadRange() {
    try {
      const value = JSON.parse(storageGet(RANGE_KEY) || '{}');
      const min = Number(value.min);
      const max = Number(value.max);
      const loaded = {
        min: isFinite(min) ? clamp(min, RANGE_MIN, RANGE_MAX - 0.01) : RANGE_MIN,
        max: isFinite(max) ? clamp(max, RANGE_MIN + 0.01, RANGE_MAX) : RANGE_MAX
      };
      return loaded.max > loaded.min ? loaded : {min: RANGE_MIN, max: RANGE_MAX};
    } catch (error) {
      return {min: RANGE_MIN, max: RANGE_MAX};
    }
  }

  function saveCounts() {
    storageSet(COUNTS_KEY, JSON.stringify(counts));
  }

  function saveHistory() {
    storageSet(HISTORY_KEY, JSON.stringify(history));
  }

  function saveRange() {
    storageSet(RANGE_KEY, JSON.stringify(range));
  }

  function pushHistory(item) {
    history.unshift(item);
    if (history.length > 200) history.length = 200;
    saveHistory();
  }

  function setStatus(message, kind, voice) {
    statusEl.className = 'status ' + (kind || '');
    statusEl.textContent = message || '';
    if (voice) speakOnce(voice, kind === 'ok' || kind === 'ko');
  }

  function showSourceMessage(message) {
    if (!fbIndicator || !fbMsg) return;
    fbMsg.textContent = message;
    fbIndicator.classList.add('show');
    if (fbTimer) clearTimeout(fbTimer);
    fbTimer = setTimeout(function () {
      fbIndicator.classList.remove('show');
    }, 3200);
  }

  function updateVoiceButton() {
    if (!voiceToggleBtn) return;
    voiceToggleBtn.textContent = voiceEnabled ? '🔊' : '🔇';
    voiceToggleBtn.className = 'voice-toggle ' + (voiceEnabled ? 'on' : 'off');
  }

  function showVoiceToast(message) {
    if (!voiceToast) return;
    voiceToast.textContent = message;
    voiceToast.classList.add('show');
    setTimeout(function () {
      voiceToast.classList.remove('show');
    }, 2500);
  }

  function speak(text, priority) {
    if (!voiceEnabled || !window.speechSynthesis) return;
    if (priority) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.volume = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const ruVoice = voices.find(function (voice) {
      return voice.name.includes('Google') && voice.lang.includes('ru');
    }) || voices.find(function (voice) {
      return /Milena|Милена|Irina|Ирина/.test(voice.name);
    }) || voices.find(function (voice) {
      return voice.lang === 'ru-RU' || voice.lang === 'ru';
    });
    if (ruVoice) utterance.voice = ruVoice;
    utterance.onstart = function () {
      if (speakingIndicator) speakingIndicator.classList.add('show');
    };
    utterance.onend = utterance.onerror = function () {
      if (speakingIndicator) speakingIndicator.classList.remove('show');
    };
    window.speechSynthesis.speak(utterance);
  }

  function speakOnce(text, priority) {
    if (!text || text === lastVoiceMsg) return;
    lastVoiceMsg = text;
    speak(text, priority);
  }

  function formatInKyiv(date, withSeconds) {
    const options = {
      timeZone: KYIV_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    if (withSeconds) options.second = '2-digit';
    try {
      return new Intl.DateTimeFormat('ru-RU', options).format(date);
    } catch (error) {
      options.timeZone = 'Europe/Kiev';
      return new Intl.DateTimeFormat('ru-RU', options).format(date);
    }
  }

  function formatKyivTime(timestamp, withSeconds) {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '--:--';
    return formatInKyiv(date, Boolean(withSeconds));
  }

  function apiError(status, message) {
    const error = new Error(message || ('HTTP ' + status));
    error.status = status;
    return error;
  }

  async function apiGet(path) {
    if (!API_KEY) throw apiError(401, 'API-ключ отсутствует');
    if (Date.now() < apiUnavailableUntil) {
      throw apiError(503, 'Основной API временно недоступен');
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(function () {
      controller.abort();
    }, API_TIMEOUT_MS) : null;

    try {
      const response = await fetch(BASE + path, {
        method: 'GET',
        headers: {'X-API-Key': API_KEY},
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw apiError(response.status);
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error('Основной API вернул неверный ответ');
      }
      apiUnavailableUntil = 0;
      return data;
    } catch (error) {
      if (
        error.status === 401 ||
        error.status === 403 ||
        error.status >= 500 ||
        error.name === 'AbortError' ||
        error.name === 'TimeoutError'
      ) {
        apiUnavailableUntil = Date.now() + API_RETRY_DELAY_MS;
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function coefficientValue(item) {
    if (!item || typeof item !== 'object') return null;
    let value = item.topCoefficient;
    if (value === undefined || value === null) value = item.coef;
    if (value === undefined || value === null) value = item.crash;
    if (value === undefined || value === null) value = item.value;
    if (
      (value === undefined || value === null) &&
      Array.isArray(item.finalValues) &&
      item.finalValues.length
    ) {
      value = item.finalValues[0];
    }
    value = Number(value);
    return isFinite(value) && value >= 1 ? value : null;
  }

  function normalizeCoefficientRows(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (item, index) {
      const coef = coefficientValue(item);
      if (coef === null) return null;
      return {
        coef: coef,
        id: String(
          item.id ||
          item.round_id ||
          item.hash ||
          item.roundHash ||
          (coef.toFixed(2) + ':' + index)
        )
      };
    }).filter(Boolean);
  }

  async function fetchDirectHistory(force) {
    const now = Date.now();
    if (!force && directHistoryCache && now - directHistoryCachedAt < DIRECT_CACHE_MS) {
      renderCoefficientRows(directHistoryCache);
      return directHistoryCache;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(function () {
      controller.abort();
    }, API_TIMEOUT_MS) : null;

    try {
      const response = await fetch(DIRECT_HISTORY_URL, {
        method: 'GET',
        headers: DIRECT_HISTORY_HEADERS,
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) {
        const error = apiError(response.status, 'Резервный источник недоступен');
        error.source = 'direct';
        throw error;
      }
      const rows = normalizeCoefficientRows(await response.json());
      if (!rows.length) {
        const error = new Error('Резервный источник не вернул коэффициенты');
        error.source = 'direct';
        throw error;
      }
      directHistoryCache = rows;
      directHistoryCachedAt = Date.now();
      renderCoefficientRows(rows);
      return rows;
    } catch (error) {
      error.source = error.source || 'direct';
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function fetchRecentCoefficientRows(limit, force) {
    try {
      const rows = await fetchDirectHistory(force);
      return rows.slice(0, limit);
    } catch (directError) {
      try {
        const data = await apiGet('/luckyjet/coefficients?limit=' + limit);
        const rows = normalizeCoefficientRows(data && data.data);
        if (!rows.length) throw directError;
        renderCoefficientRows(rows);
        return rows.slice(0, limit);
      } catch (apiFailure) {
        throw directError;
      }
    }
  }

  function analyzeMarket(rows) {
    const values = rows.slice(0, 8).map(function (item) {
      return item.coef;
    });
    if (!values.length) return {level: 'warn', score: 50, reason: 'Сбор данных…'};
    const average = values.reduce(function (sum, value) {
      return sum + value;
    }, 0) / values.length;
    const aboveTwo = values.filter(function (value) {
      return value >= 2;
    }).length;
    let lowStreak = 0;
    for (let index = 0; index < values.length; index += 1) {
      if (values[index] <= 1.3) lowStreak += 1;
      else break;
    }
    let level = 'warn';
    if (lowStreak >= 4 || average < 1.35) level = 'danger';
    else if (aboveTwo >= 4 && average >= 2) level = 'safe';
    const score = clamp(Math.round(
      35 + aboveTwo * 7 + Math.min(average, 5) * 5 - lowStreak * 8
    ), 0, 100);
    const reason = level === 'safe'
      ? 'История стабильная — условия благоприятные'
      : level === 'danger'
        ? 'Серия низких коэффициентов — сигнал пропущен'
        : 'История подключена — продолжаем анализ';
    return {level: level, score: score, reason: reason};
  }

  function buildDirectPrediction(rows) {
    const values = rows.slice(0, 20).map(function (item) {
      return item.coef;
    }).filter(isFinite);
    if (values.length < 5) {
      throw new Error('Недостаточно завершённых раундов для анализа');
    }
    const sorted = values.slice().sort(function (a, b) {
      return a - b;
    });
    const index = Math.floor((sorted.length - 1) * 0.4);
    const predicted = clamp(sorted[index], range.min, range.max);
    const hits = values.filter(function (value) {
      return value >= predicted;
    }).length;
    const confidence = clamp(Math.round(hits / values.length * 100), 35, 88);
    return {
      success: true,
      predicted_coef: Number(predicted.toFixed(2)),
      confidence: confidence,
      signal: confidence >= 70 ? 'safe' : (confidence >= 50 ? 'warn' : 'danger'),
      source: 'direct-history'
    };
  }

  function apiErrorText(error) {
    if (!error) return 'Неизвестная ошибка подключения';
    if (error.source === 'direct') return 'Не удалось получить реальные коэффициенты';
    if (error.status === 401 || error.status === 403) return 'Доступ к источнику закрыт';
    if (error.status === 429) return 'Лимит запросов исчерпан. Повторяем позже';
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'Источник не ответил вовремя';
    if (navigator.onLine === false) return 'Нет подключения к интернету';
    return error.message || 'Ошибка подключения';
  }

  function renderCoefficientRows(rows) {
    const recent = rows.slice(0, 8);
    if (lastEl && recent.length) lastEl.textContent = recent[0].coef.toFixed(2) + 'X';
    if (!coefBarsEl || !recent.length) return;
    const maxCoef = Math.max.apply(null, recent.map(function (item) {
      return item.coef;
    }).concat([3]));
    coefBarsEl.innerHTML = recent.map(function (item) {
      const height = Math.max(item.coef / maxCoef * 40, 4);
      const cls = item.coef >= 2 ? 'high' : (item.coef >= 1.5 ? 'mid' : 'low');
      return '<div class="coef-bar-wrap"><div class="coef-bar ' + cls + '" style="height:' +
        height.toFixed(1) + 'px"></div><div class="coef-val">' +
        item.coef.toFixed(1) + '</div></div>';
    }).join('');
  }

  function applyMarketUi(analysis) {
    const level = analysis.level || 'warn';
    marketSignalEl.className = 'market-signal ' + level;
    msScoreEl.textContent = String(analysis.score) + '/100';
    msDescEl.textContent = analysis.reason;
    if (level === 'safe') {
      msIconEl.textContent = '✅';
      msTitleEl.textContent = 'Рынок благоприятный';
    } else if (level === 'danger') {
      msIconEl.textContent = '🚨';
      msTitleEl.textContent = 'Рынок опасный';
    } else {
      msIconEl.textContent = '⚠️';
      msTitleEl.textContent = 'Рынок умеренный';
    }
  }

  async function pollMarket(silent) {
    try {
      const data = await apiGet('/luckyjet/market');
      const level = data.level || 'warn';
      applyMarketUi({
        level: level,
        score: Number(data.score || data.market_score || 50),
        reason: data.reason || 'Основной BETA API подключён'
      });
      return level;
    } catch (primaryError) {
      try {
        const rows = await fetchRecentCoefficientRows(20, false);
        const analysis = analyzeMarket(rows);
        applyMarketUi(analysis);
        showSourceMessage('Основной API недоступен — включён резервный источник');
        return analysis.level;
      } catch (directError) {
        applyMarketUi({level: 'warn', score: 0, reason: 'Источники данных недоступны'});
        if (!silent) setStatus(apiErrorText(directError), 'ko');
        throw directError;
      }
    }
  }

  async function checkMarket() {
    try {
      const data = await apiGet('/luckyjet/check');
      return !(data.blocked || data.safe === false);
    } catch (primaryError) {
      const rows = await fetchRecentCoefficientRows(20, true);
      applyMarketUi(analyzeMarket(rows));
      showSourceMessage('Проверка рынка идёт по резервной истории');
      return rows.length >= 5;
    }
  }

  async function fetchPrediction() {
    try {
      const rows = await fetchRecentCoefficientRows(20, true);
      showSourceMessage('Сигнал рассчитан по 20 завершённым раундам');
      return buildDirectPrediction(rows);
    } catch (historyError) {
      const data = await apiGet('/luckyjet/predict');
      if (!data || data.success !== true) throw historyError;
      data.source = data.source || 'beta-api';
      showSourceMessage('История недоступна — включён резервный BETA API');
      return data;
    }
  }

  async function fetchLatestRound() {
    const rows = await fetchRecentCoefficientRows(5, true);
    if (!rows.length) return null;
    return {
      coef: rows[0].coef,
      signature: rows.map(function (item) {
        return item.id;
      }).join('|')
    };
  }

  function updateStreakDots() {
    const recent = history.slice(0, 5);
    for (let index = 0; index < 5; index += 1) {
      const dot = document.getElementById('sd' + index);
      if (!dot) continue;
      const item = recent[index];
      dot.className = 'sdot ' + (item ? item.status : '');
    }
    const streakInfo = document.getElementById('streakInfo');
    if (!streakInfo) return;
    if (!recent.length) {
      streakInfo.textContent = 'Ожидание…';
      return;
    }
    const latestStatus = recent[0].status;
    let streak = 0;
    for (let index = 0; index < recent.length; index += 1) {
      if (recent[index].status === latestStatus) streak += 1;
      else break;
    }
    streakInfo.textContent = latestStatus === 'ok'
      ? '🟢 ' + streak + ' успех подряд'
      : '🔴 ' + streak + ' неудач. Работа продолжается';
  }

  function refreshUi() {
    countOkEl.textContent = counts.ok;
    countKoEl.textContent = counts.ko;
    countTotalEl.textContent = counts.ok + counts.ko;
    updateStreakDots();
  }

  function renderHistory() {
    const container = document.getElementById('chipsContainer');
    if (!container) return;
    container.innerHTML = '';
    if (!history.length) {
      const empty = document.createElement('div');
      empty.textContent = 'История пуста.';
      empty.style.opacity = '.85';
      container.appendChild(empty);
      return;
    }
    history.forEach(function (item) {
      const chip = document.createElement('div');
      chip.className = 'chip ' + (item.status === 'ok' ? 'ok' : 'ko');
      chip.textContent = Number(item.coef).toFixed(2) + 'x · ' +
        (item.status === 'ok' ? 'Успех' : 'Неудача') + ' · раунд ' + item.round;
      container.appendChild(chip);
    });
  }

  function signalLabel(signal) {
    return {
      safe: 'БЕЗОПАСНО',
      warn: 'ОСТОРОЖНО',
      danger: 'ОПАСНО'
    }[String(signal || '').toLowerCase()] || 'ГОТОВ';
  }

  function setTenXEffect(active) {
    const enabled = Boolean(active);
    circle.classList.toggle('ten-x', enabled);
    if (circleInner) circleInner.classList.toggle('ten-x-inner', enabled);
    if (enabled) {
      multEl.style.color = '#ff314f';
    } else if (!circle.classList.contains('ok') && !circle.classList.contains('ko')) {
      multEl.style.color = '#00ff66';
    }
  }

  function isCycleActive() {
    return scheduledStart !== null || verificationStarted || pending !== null;
  }

  function updateMainButton() {
    generateButton.disabled = requestInFlight;
    if (requestInFlight) generateButton.textContent = 'ПОЛУЧАЕМ СИГНАЛ...';
    else if (isCycleActive()) generateButton.textContent = 'ОТМЕНИТЬ СИГНАЛ';
    else generateButton.textContent = 'HACK SIGNAL';
  }

  function saveActiveState() {
    if (!isCycleActive() || !isFinite(currentPredicted)) {
      storageRemove(ACTIVE_KEY);
      return;
    }
    storageSet(ACTIVE_KEY, JSON.stringify({
      version: 2,
      currentPredicted: currentPredicted,
      currentConfidence: currentConfidence,
      currentSignal: currentSignal,
      pending: pending,
      scheduledStart: scheduledStart,
      verificationStarted: verificationStarted,
      lastRoundSignature: lastRoundSignature,
      lastCrashAt: lastCrashAt,
      savedAt: Date.now()
    }));
  }

  function restoreActiveState() {
    let saved;
    try {
      saved = JSON.parse(storageGet(ACTIVE_KEY) || 'null');
    } catch (error) {
      storageRemove(ACTIVE_KEY);
      return false;
    }
    const age = saved ? Date.now() - Number(saved.savedAt) : Infinity;
    const predicted = saved ? Number(saved.currentPredicted) : NaN;
    const restoredStart = saved ? Number(saved.scheduledStart) : NaN;
    if (
      !saved ||
      saved.version !== 2 ||
      !isFinite(predicted) ||
      predicted < RANGE_MIN ||
      predicted > RANGE_MAX ||
      !isFinite(restoredStart) ||
      age < -5 * 60 * 1000 ||
      age > ACTIVE_MAX_AGE_MS
    ) {
      storageRemove(ACTIVE_KEY);
      return false;
    }

    currentPredicted = predicted;
    currentConfidence = saved.currentConfidence;
    currentSignal = saved.currentSignal;
    scheduledStart = restoredStart;
    verificationStarted = Boolean(saved.verificationStarted);
    pending = verificationStarted
      ? {
          predictedOdds: Number(saved.pending && saved.pending.predictedOdds) || predicted,
          currentRound: clamp(Number(saved.pending && saved.pending.currentRound) || 0, 0, 2)
        }
      : null;
    lastRoundSignature = typeof saved.lastRoundSignature === 'string'
      ? saved.lastRoundSignature
      : null;
    lastCrashAt = isFinite(Number(saved.lastCrashAt)) ? Number(saved.lastCrashAt) : null;

    multEl.textContent = currentPredicted.toFixed(2) + 'X';
    setTenXEffect(currentPredicted >= RANGE_MAX);
    betTimeEl.textContent = formatKyivTime(scheduledStart, false);
    roundEl.textContent = pending ? String(pending.currentRound) : '0';
    circle.classList.add('verifying');
    setStatus(
      verificationStarted
        ? 'Сигнал восстановлен. Проверяем результат…'
        : 'Сигнал восстановлен. Время ставки: ' + betTimeEl.textContent,
      ''
    );
    updateMainButton();
    startCoefficientPolling();
    updateClockAndCountdown();
    return true;
  }

  function beginVerification() {
    if (verificationStarted || currentPredicted === null) return;
    verificationStarted = true;
    pending = {predictedOdds: currentPredicted, currentRound: 0};
    roundEl.textContent = '0';
    setStatus('СТАВЬ СЕЙЧАС. Проверяем следующие 3 раунда', '', 'Ставь сейчас. Проверяем следующие три раунда.');
    countdownEl.textContent = 'Проверяем результат сигнала';
    circle.classList.add('verifying');
    saveActiveState();
  }

  function updateClockAndCountdown() {
    if (scheduledStart === null) {
      countdownEl.textContent = '';
      return;
    }
    const remaining = scheduledStart - Date.now();
    if (remaining > 0) {
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      countdownEl.textContent = 'До сигнала: ' + minutes + ':' + seconds;
      return;
    }
    if (!verificationStarted) beginVerification();
    else countdownEl.textContent = 'Проверяем результат сигнала';
  }

  function startCoefficientPolling() {
    if (coefficientTimer) return;
    pollCoefficient();
    coefficientTimer = setInterval(pollCoefficient, 5000);
  }

  function stopCoefficientPolling() {
    if (coefficientTimer) clearInterval(coefficientTimer);
    coefficientTimer = null;
  }

  async function pollCoefficient() {
    if (!isCycleActive() || coefficientRequestInFlight) return;
    coefficientRequestInFlight = true;
    try {
      const latest = await fetchLatestRound();
      coefficientErrors = 0;
      if (!latest) return;
      lastEl.textContent = latest.coef.toFixed(2) + 'X';

      if (lastRoundSignature === null) {
        lastRoundSignature = latest.signature;
        lastCrashAt = Date.now();
        saveActiveState();
        return;
      }
      if (latest.signature === lastRoundSignature) return;

      lastRoundSignature = latest.signature;
      lastCrashAt = Date.now();
      saveActiveState();

      if (!verificationStarted) {
        if (scheduledStart !== null && Date.now() >= scheduledStart) beginVerification();
        return;
      }
      if (!pending) return;

      const rounded = Number((latest.coef === 1 ? 1.01 : latest.coef).toFixed(2));
      pending.currentRound += 1;
      roundEl.textContent = pending.currentRound;
      saveActiveState();

      if (rounded >= pending.predictedOdds) {
        finishResult(true);
      } else if (pending.currentRound >= 3) {
        finishResult(false);
      }
    } catch (error) {
      coefficientErrors += 1;
      if (coefficientErrors >= 3) {
        setStatus(apiErrorText(error) + '. Переключаемся и повторяем автоматически', 'ko');
        showSourceMessage('Ошибка источника — автоматическая повторная попытка');
      }
    } finally {
      coefficientRequestInFlight = false;
    }
  }

  function clearCycleState() {
    pending = null;
    verificationStarted = false;
    scheduledStart = null;
    currentPredicted = null;
    currentConfidence = null;
    currentSignal = null;
    lastRoundSignature = null;
    lastCrashAt = null;
    coefficientErrors = 0;
    coefficientRequestInFlight = false;
    storageRemove(ACTIVE_KEY);
    stopCoefficientPolling();
    setTenXEffect(false);
    updateClockAndCountdown();
    updateMainButton();
  }

  function finishResult(success) {
    const predicted = pending ? pending.predictedOdds : currentPredicted;
    const currentRound = pending ? pending.currentRound : 0;
    lastVoiceMsg = '';

    if (success) {
      setStatus('✅ Успешно на раунде ' + currentRound, 'ok', 'Предсказание подтверждено.');
      multEl.textContent = 'УСПЕШНО ✅';
      multEl.style.color = '#10b981';
      circle.classList.remove('verifying', 'ko');
      circle.classList.add('ok');
      if (spin) spin.classList.remove('ko');
      if (spin) spin.classList.add('ok');
      counts.ok += 1;
    } else {
      setStatus('❌ Неудача после 3 раундов. Анализ продолжается', 'ko', 'Неудача. Анализ продолжается без паузы.');
      multEl.textContent = 'НЕУДАЧА ❌';
      multEl.style.color = '#ef4444';
      circle.classList.remove('verifying', 'ok');
      circle.classList.add('ko');
      if (spin) spin.classList.remove('ok');
      if (spin) spin.classList.add('ko');
      counts.ko += 1;
    }

    saveCounts();
    pushHistory({
      coef: predicted,
      status: success ? 'ok' : 'ko',
      time: new Date().toISOString(),
      round: currentRound
    });
    refreshUi();
    renderHistory();
    incrementDaily();
    clearCycleState();
    if (autoMode) scheduleAuto(3000);
  }

  function cancelSignal() {
    if (autoMode) setAutoMode(false);
    clearCycleState();
    multEl.textContent = '0.00X';
    multEl.style.color = '#00ff66';
    betTimeEl.textContent = '--:--';
    roundEl.textContent = '0';
    circle.classList.remove('verifying', 'ok', 'ko');
    if (spin) spin.classList.remove('ok', 'ko');
    setStatus('Сигнал отменён. Можно получить новый', '');
  }

  async function generateSignal() {
    if (requestInFlight || isCycleActive()) return false;
    const daily = getDailyWindow();
    if (daily.locked && daily.start) {
      openDailyLock(daily.resetAt);
      return false;
    }

    ensureDailyWindow();
    requestInFlight = true;
    updateMainButton();
    multEl.textContent = 'АНАЛИЗ...';
    multEl.style.color = '#f4a51c';
    circle.classList.remove('ok', 'ko');
    if (spin) spin.classList.remove('ok', 'ko');
    setTenXEffect(false);
    setStatus('Загружаем 20 завершённых раундов и рассчитываем сигнал…', '');

    try {
      const level = await pollMarket(true);
      const safe = await checkMarket();
      if (!safe || level === 'danger') {
        multEl.textContent = 'НЕТ СИГНАЛА';
        multEl.style.color = '#f4a51c';
        circle.classList.remove('verifying');
        setStatus('Рынок опасный. Анализ продолжается, попробуем снова', 'warn');
        return false;
      }

      const prediction = await fetchPrediction();
      let coefficient = Number(prediction.predicted_coef);
      if (!isFinite(coefficient)) throw new Error('Источник вернул неверный коэффициент');
      coefficient = clamp(coefficient, range.min, range.max);
      currentPredicted = Number(coefficient.toFixed(2));
      if (currentPredicted === lastGeneratedCoef) {
        const step = currentPredicted < range.max ? 0.01 : -0.01;
        currentPredicted = Number(clamp(currentPredicted + step, range.min, range.max).toFixed(2));
      }
      lastGeneratedCoef = currentPredicted;
      currentConfidence = prediction.confidence === undefined ? null : Number(prediction.confidence);
      currentSignal = prediction.signal || 'warn';
      scheduledStart = Date.now() + SIGNAL_DELAY_MS;
      verificationStarted = false;
      pending = null;
      lastRoundSignature = null;
      lastCrashAt = null;

      multEl.textContent = currentPredicted.toFixed(2) + 'X';
      setTenXEffect(currentPredicted >= RANGE_MAX);
      circle.classList.add('verifying');
      betTimeEl.textContent = formatKyivTime(scheduledStart, false);
      roundEl.textContent = '0';
      lastVoiceMsg = '';
      const confidenceText = isFinite(currentConfidence) ? ' · ' + currentConfidence + '%' : '';
      setStatus(
        'Сигнал: ' + signalLabel(currentSignal) + confidenceText +
        '. Ставка через 1 минуту в ' + betTimeEl.textContent,
        '',
        'Сигнал готов. Коэффициент ' + currentPredicted.toFixed(2) + '. Ставка через одну минуту.'
      );
      saveActiveState();
      startCoefficientPolling();
      updateClockAndCountdown();
      return true;
    } catch (error) {
      setStatus(apiErrorText(error) + '. Повторите — резервный источник подключится автоматически', 'ko');
      multEl.textContent = 'ОШИБКА';
      multEl.style.color = '#ef4444';
      circle.classList.remove('verifying');
      showSourceMessage('Не удалось получить данные — повторяем автоматически');
      return false;
    } finally {
      requestInFlight = false;
      updateMainButton();
    }
  }

  function scheduleAuto(delay) {
    if (!autoMode) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(runAuto, delay);
  }

  async function runAuto() {
    if (!autoMode) return;
    if (requestInFlight || isCycleActive()) {
      scheduleAuto(5000);
      return;
    }
    const started = await generateSignal();
    if (!started && autoMode) scheduleAuto(15000);
  }

  function setAutoMode(enabled) {
    autoMode = Boolean(enabled);
    autoButton.classList.toggle('active', autoMode);
    autoButton.textContent = autoMode ? 'АВТО: ВКЛ' : 'АВТОМАТИЧЕСКИЙ';
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = null;
    if (autoMode) {
      setStatus('Автоматический режим включён. Работа продолжается без пауз', '');
      speak('Автоматический режим включён.');
      scheduleAuto(500);
    } else if (!isCycleActive()) {
      setStatus('Автоматический режим выключен', '');
    }
  }

  function getDailyWindow() {
    const start = Number(storageGet(DAILY_START_KEY) || 0);
    if (!start) return {start: 0, resetAt: 0, locked: false};
    const resetAt = start + 24 * 60 * 60 * 1000;
    if (Date.now() >= resetAt) {
      storageRemove(DAILY_LOCK_KEY);
      storageRemove(DAILY_START_KEY);
      storageSet(DAILY_USED_KEY, '0');
      return {start: 0, resetAt: 0, locked: false};
    }
    return {start: start, resetAt: resetAt, locked: storageGet(DAILY_LOCK_KEY) === '1'};
  }

  function ensureDailyWindow() {
    let start = Number(storageGet(DAILY_START_KEY) || 0);
    if (!start) {
      start = Date.now();
      storageSet(DAILY_START_KEY, String(start));
      storageSet(DAILY_USED_KEY, '0');
      storageRemove(DAILY_LOCK_KEY);
    }
    return start;
  }

  function incrementDaily() {
    const start = ensureDailyWindow();
    const resetAt = start + 24 * 60 * 60 * 1000;
    const used = Number(storageGet(DAILY_USED_KEY) || 0) + 1;
    storageSet(DAILY_USED_KEY, String(used));
    if (used >= DAILY_LIMIT) {
      storageSet(DAILY_LOCK_KEY, '1');
      openDailyLock(resetAt);
    }
  }

  function openDailyLock(resetAt) {
    setAutoMode(false);
    const lockOverlay = document.getElementById('lockOverlay');
    const lockMsg = document.getElementById('lockMsg');
    const lockNote = document.getElementById('lockNote');
    if (lockMsg) lockMsg.textContent = 'Лимит ' + DAILY_LIMIT + ' прогнозов исчерпан.';
    if (lockNote) lockNote.textContent = 'Доступ восстановится в ' + formatKyivTime(resetAt, false);
    if (lockOverlay) lockOverlay.classList.add('open');
    setStatus('🔒 Дневной лимит достигнут', 'ko');
  }

  function updateWakeButton() {
    if (!keepAwakeButton) return;
    const active = Boolean(wakeLock && wakeLock.released !== true);
    keepAwakeButton.classList.toggle('active', active);
    keepAwakeButton.textContent = active ? 'ЭКРАН НЕ ГАСНЕТ' : 'НЕ ГАСИТЬ ЭКРАН';
  }

  async function requestWakeLock(userInitiated) {
    if (!keepAwakeButton) return false;
    if (!('wakeLock' in navigator)) {
      wakeRequested = false;
      storageRemove(WAKE_KEY);
      updateWakeButton();
      if (userInitiated) setStatus('Режим не поддерживается этой версией iOS', 'ko');
      return false;
    }
    if (document.visibilityState && document.visibilityState !== 'visible') return false;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      wakeLock = sentinel;
      wakeRequested = true;
      storageSet(WAKE_KEY, '1');
      updateWakeButton();
      sentinel.addEventListener('release', function () {
        if (wakeLock === sentinel) wakeLock = null;
        updateWakeButton();
      });
      if (userInitiated) setStatus('Экран не погаснет, пока CLASSIC открыт', 'ok');
      return true;
    } catch (error) {
      wakeLock = null;
      wakeRequested = false;
      storageRemove(WAKE_KEY);
      updateWakeButton();
      if (userInitiated) setStatus('Не удалось включить режим экрана', 'ko');
      return false;
    }
  }

  async function disableWakeLock() {
    wakeRequested = false;
    storageRemove(WAKE_KEY);
    const activeLock = wakeLock;
    wakeLock = null;
    if (activeLock && activeLock.released !== true) {
      try {
        await activeLock.release();
      } catch (error) {
        // Блокировка уже снята системой.
      }
    }
    updateWakeButton();
    if (!isCycleActive()) setStatus('Обычный режим экрана включён', '');
  }

  function togglePanel(element, open) {
    if (element) element.classList.toggle('open', open);
  }

  function bindUi() {
    generateButton.addEventListener('click', function () {
      if (isCycleActive()) cancelSignal();
      else generateSignal();
    });
    autoButton.addEventListener('click', function () {
      setAutoMode(!autoMode);
    });
    if (keepAwakeButton) {
      keepAwakeButton.addEventListener('click', function () {
        if (wakeRequested || (wakeLock && wakeLock.released !== true)) disableWakeLock();
        else requestWakeLock(true);
      });
    }
    if (voiceToggleBtn) {
      voiceToggleBtn.addEventListener('click', function () {
        voiceEnabled = !voiceEnabled;
        storageSet(VOICE_KEY, String(voiceEnabled));
        updateVoiceButton();
        if (voiceEnabled) {
          showVoiceToast('🔊 Голос включён');
          speak('Голосовая озвучка включена.');
        } else {
          if (window.speechSynthesis) window.speechSynthesis.cancel();
          showVoiceToast('🔇 Голос выключен');
        }
      });
    }

    document.getElementById('openHistory').addEventListener('click', function () {
      renderHistory();
      togglePanel(document.getElementById('historyPanel'), true);
    });
    document.getElementById('closeHistory').addEventListener('click', function () {
      togglePanel(document.getElementById('historyPanel'), false);
    });
    document.getElementById('openSettings').addEventListener('click', function () {
      document.getElementById('minOddsInput').value = range.min.toFixed(2);
      document.getElementById('maxOddsInput').value = range.max.toFixed(2);
      document.getElementById('settingsMsg').textContent = '';
      togglePanel(document.getElementById('settingsPanel'), true);
    });
    document.getElementById('closeSettings').addEventListener('click', function () {
      togglePanel(document.getElementById('settingsPanel'), false);
    });
    document.getElementById('saveRange').addEventListener('click', function () {
      const min = Number(document.getElementById('minOddsInput').value);
      const max = Number(document.getElementById('maxOddsInput').value);
      const message = document.getElementById('settingsMsg');
      if (!isFinite(min) || !isFinite(max)) {
        message.textContent = 'Введите правильные числа';
        return;
      }
      if (min < RANGE_MIN || max > RANGE_MAX || max <= min) {
        message.textContent = 'Допустимый диапазон: 1.50x–10.00x';
        return;
      }
      range = {min: Number(min.toFixed(2)), max: Number(max.toFixed(2))};
      saveRange();
      message.textContent = 'Сохранено: ' + range.min.toFixed(2) + 'x–' + range.max.toFixed(2) + 'x';
    });
    document.getElementById('resetStats').addEventListener('click', function () {
      counts = {ok: 0, ko: 0};
      saveCounts();
      refreshUi();
      document.getElementById('settingsMsg').textContent = 'Статистика сброшена.';
    });
    document.getElementById('resetHistory').addEventListener('click', function () {
      history = [];
      saveHistory();
      renderHistory();
      refreshUi();
      document.getElementById('settingsMsg').textContent = 'История сброшена.';
    });
  }

  function resumeFromBackground() {
    updateClockAndCountdown();
    pollMarket(true).catch(function () {});
    if (isCycleActive()) {
      startCoefficientPolling();
      pollCoefficient();
    }
    if (wakeRequested && (!wakeLock || wakeLock.released === true)) {
      requestWakeLock(false);
    }
  }

  function bootApp() {
    bindUi();
    refreshUi();
    renderHistory();
    updateVoiceButton();
    updateWakeButton();
    updateMainButton();

    const daily = getDailyWindow();
    if (daily.locked && daily.start) openDailyLock(daily.resetAt);

    const restored = restoreActiveState();
    if (!restored) setStatus('Загружаем 20 завершённых раундов…', '');
    pollMarket(false).then(function () {
      if (!restored && !isCycleActive()) setStatus('Данные подключены. Можно получить сигнал', 'ok');
    }).catch(function () {});

    setInterval(updateClockAndCountdown, 1000);
    setInterval(function () {
      pollMarket(true).catch(function () {});
    }, 30000);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        saveActiveState();
        return;
      }
      resumeFromBackground();
    });
    window.addEventListener('pagehide', saveActiveState);
    window.addEventListener('pageshow', resumeFromBackground);

    document.getElementById('appWrap').style.display = 'flex';
    if (voiceToggleBtn) voiceToggleBtn.style.display = 'flex';
    document.getElementById('gate-checking').style.display = 'none';
  }

  window.LuckyJetClassic = {
    generateSignal: generateSignal,
    cancelSignal: cancelSignal,
    fetchRecentCoefficientRows: fetchRecentCoefficientRows,
    restoreActiveState: restoreActiveState,
    requestWakeLock: requestWakeLock,
    disableWakeLock: disableWakeLock
  };

  bootApp();
})();
