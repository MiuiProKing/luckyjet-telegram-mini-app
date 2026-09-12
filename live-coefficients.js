/* Public read-only live coefficient bridge for LuckyJet / Rocket Queen. */
(() => {
  'use strict';

  const LUCKY_STATE_URL = 'https://crash-gateway-grm-cr.100hp.app/state';
  const ROCKET_HISTORY_URL = 'https://crash-gateway-grm-cr.100hp.app/history';
  const CUSTOMER_ID = '077dee8d-c923-4c02-9bee-757573662e69';
  const LUCKY_SESSION = '783ee79a-dafc-479e-bf22-834336380cdf';
  const ROCKET_SESSION = '16273824-a9b4-4215-b182-7667d16483ca';
  const INTERVAL = 1800;
  const MAX_HISTORY = 200;
  const HISTORY_KEY = 'lumorax_live_coefficients_v3';

  const isRocket = () => /rocket/i.test(document.title) || /rocket[-_ ]?queen/i.test(location.href);

  function headers(session) {
    return {
      'customer-id': CUSTOMER_ID,
      'session-id': session,
      'accept': 'application/json'
    };
  }

  const num = v => {
    if (typeof v === 'string') v = v.replace(/x/gi, '').replace(',', '.').trim();
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  function extract(value, out = []) {
    if (value == null) return out;
    if (Array.isArray(value)) {
      value.forEach(v => extract(v, out));
      return out;
    }
    if (typeof value !== 'object') return out;

    for (const v of [
      value.coef, value.coefficient, value.multiplier,
      value.crashPoint, value.crash_point, value.result,
      value.value, value.stopCoefficient, value.stop_coefficients
    ]) {
      if (Array.isArray(v)) v.forEach(x => { const n = num(x); if (n != null && n >= 1) out.push(n); });
      else { const n = num(v); if (n != null && n >= 1) out.push(n); }
    }

    for (const [k, v] of Object.entries(value)) {
      if (/coef|coefficient|multiplier|crash|result|round|history|stop/i.test(k)) {
        extract(v, out);
      } else if (Array.isArray(v)) {
        extract(v, out);
      }
    }
    return out;
  }

  function parseRocket(payload) {
    if (Array.isArray(payload?.stopCoefficients) && payload.stopCoefficients.length) {
      const values = payload.stopCoefficients.map(num).filter(n => n != null && n >= 1);
      if (values.length) return values[values.length - 1];
    }
    const values = extract(payload, []);
    return values.length ? values[values.length - 1] : null;
  }

  function parseLucky(payload) {
    const values = extract(payload, []);
    return values.length ? values[values.length - 1] : null;
  }

  function historyRead() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function historyWrite(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-MAX_HISTORY))); }
    catch (_) {}
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el && value != null) el.textContent = `${Number(value).toFixed(2)}X`;
  }

  function updateUI(coef) {
    if (coef == null) return;
    ['multiplier', 'lastCoef', 'last-coef', 'multiplierText', 'lastCoefficient', 'latestCoef']
      .forEach(id => setText(id, coef));
    document.querySelectorAll('[data-live-coef],[data-last-coef]').forEach(el => {
      el.textContent = `${Number(coef).toFixed(2)}X`;
    });
  }

  async function poll() {
    const rocket = isRocket();
    const url = rocket ? ROCKET_HISTORY_URL : LUCKY_STATE_URL;
    const session = rocket ? ROCKET_SESSION : LUCKY_SESSION;

    try {
      const response = await fetch(url, {
        headers: headers(session),
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const coef = rocket ? parseRocket(payload) : parseLucky(payload);
      if (coef == null) return;

      const h = historyRead();
      const key = String(
        payload?.roundId ?? payload?.round_id ?? payload?.id ??
        payload?.currentRoundId ?? payload?.timestamp ?? payload?.time ?? ''
      );
      const last = h[h.length - 1];

      if (!last || (key && last.key !== key) || (!key && Number(last.coef) !== Number(coef))) {
        h.push({ key, coef: Number(coef), ts: Date.now(), game: rocket ? 'rocket-queen' : 'lucky-jet' });
        historyWrite(h);
      }

      updateUI(coef);
      window.dispatchEvent(new CustomEvent('liveCoefficient', {
        detail: {
          game: rocket ? 'rocket-queen' : 'lucky-jet',
          coef: Number(coef),
          payload,
          sessionId: session,
          source: url
        }
      }));
    } catch (_) {}
  }

  function start() {
    if (window.__LIVE_COEFFICIENT_BRIDGE__) return;
    window.__LIVE_COEFFICIENT_BRIDGE__ = true;
    poll();
    setInterval(poll, INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
