/* Public read-only coefficient bridge for the LuckyJet / Rocket Queen mini-app. */
(() => {
  'use strict';
  const STATE_URL = 'https://crash-gateway-grm-cr.100hp.app/state';
  const HEADERS = {
    'customer-id': '077dee8d-c923-4c02-9bee-757573662e69',
    'session-id': '783ee79a-dafc-479e-bf22-834336380cdf',
    'accept': 'application/json'
  };
  const INTERVAL = 1800;
  const MAX_HISTORY = 200;
  const HISTORY_KEY = 'lumorax_live_coefficients_v1';
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  function extract(value, out = []) {
    if (value == null) return out;
    if (Array.isArray(value)) { value.forEach(v => extract(v, out)); return out; }
    if (typeof value !== 'object') return out;
    for (const v of [value.coef, value.coefficient, value.multiplier, value.crashPoint, value.crash_point, value.result, value.value]) {
      const n = num(v); if (n != null && n >= 1) out.push(n);
    }
    for (const [k, v] of Object.entries(value)) {
      if (/coef|coefficient|multiplier|crash|result|round/i.test(k)) extract(v, out);
      else if (Array.isArray(v)) extract(v, out);
    }
    return out;
  }
  function roundKey(item) { return String(item?.roundId ?? item?.round_id ?? item?.id ?? item?.timestamp ?? item?.time ?? ''); }
  function parseState(payload) {
    const values = extract(payload, []);
    return values.length ? values[values.length - 1] : null;
  }
  function historyRead() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { return []; } }
  function historyWrite(h) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-MAX_HISTORY))); } catch (_) {} }
  function setText(id, value) { const el = document.getElementById(id); if (el && value != null) el.textContent = `${Number(value).toFixed(2)}X`; }
  function updateUI(coef) {
    if (coef == null) return;
    ['multiplier','lastCoef','last-coef','multiplierText','lastCoefficient','latestCoef'].forEach(id => setText(id, coef));
    document.querySelectorAll('[data-live-coef],[data-last-coef]').forEach(el => { el.textContent = `${coef.toFixed(2)}X`; });
  }
  async function poll() {
    try {
      const r = await fetch(STATE_URL, { headers: HEADERS, cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload = await r.json();
      const coef = parseState(payload);
      if (coef == null) return;
      const h = historyRead(), key = roundKey(payload), last = h[h.length - 1];
      if (!last || (key && last.key !== key) || (!key && Number(last.coef) !== coef)) {
        h.push({ key, coef, ts: Date.now() }); historyWrite(h);
      }
      updateUI(coef);
      window.dispatchEvent(new CustomEvent('liveCoefficient', { detail: { game: /rocket/i.test(document.title) ? 'rocket-queen' : 'lucky-jet', coef, payload } }));
    } catch (_) {}
  }
  function start() {
    if (window.__LIVE_COEFFICIENT_BRIDGE__) return;
    window.__LIVE_COEFFICIENT_BRIDGE__ = true;
    poll(); setInterval(poll, INTERVAL);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
