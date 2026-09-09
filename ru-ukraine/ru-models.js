/* RU model layer: additive only. The existing page/design is left untouched. */
(function () {
  'use strict';

  const CFG = {
    minHistory: 8,
    emaFast: 5,
    emaSlow: 10,
    madWindow: 8,
    bigThreshold: 10,
    safeTarget: 2.0,
    turboTarget: 3.0
  };

  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const median = (a) => {
    if (!a.length) return 0;
    const b = [...a].sort((x, y) => x - y);
    const m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  };
  const ema = (a, n) => {
    if (!a.length) return 0;
    const k = 2 / (n + 1);
    let e = a[0];
    for (let i = 1; i < a.length; i++) e = a[i] * k + e * (1 - k);
    return e;
  };
  const mad = (a) => {
    const m = median(a);
    return mean(a.map(x => Math.abs(x - m)));
  };

  function history() {
    return [...document.querySelectorAll('.recent-coef')]
      .map(el => parseFloat(String(el.textContent).replace(',', '.').replace(/x/i, '')))
      .filter(Number.isFinite)
      .slice(-20);
  }

  function model(h) {
    if (h.length < CFG.minHistory) return { ready: false };
    const fast = ema(h.slice(-CFG.emaFast), CFG.emaFast);
    const slow = ema(h.slice(-CFG.emaSlow), CFG.emaSlow);
    const vol = mad(h.slice(-CFG.madWindow));
    const med = median(h.slice(-CFG.madWindow));
    const lows = h.slice(-6).filter(x => x < 2).length;
    const highs = h.slice(-8).filter(x => x >= CFG.bigThreshold).length;
    let roundsSinceBig = 0;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i] >= CFG.bigThreshold) break;
      roundsSinceBig++;
    }

    const trend = clamp((fast - slow) / Math.max(0.01, slow), -1, 1);
    const stability = clamp(1 - vol / Math.max(0.5, med * 0.8), 0, 1);
    const pressure = clamp(lows / 6, 0, 1);
    const bigCooldown = clamp(roundsSinceBig / 18, 0, 1);
    const agreement = clamp(
      0.32 * (trend > -0.15 ? 1 : 0) +
      0.28 * stability +
      0.22 * pressure +
      0.18 * bigCooldown,
      0, 1
    );

    let state = 'ЖДАТЬ';
    let reason = 'модели не согласованы';
    if (agreement >= 0.72 && stability >= 0.55 && trend >= -0.08) {
      state = 'МОЖНО СТАВИТЬ';
      reason = 'EMA + MAD + давление низких раундов согласованы';
    } else if (agreement >= 0.56) {
      state = 'ОСТОРОЖНО';
      reason = 'есть частичное совпадение моделей';
    }

    return {
      ready: true,
      confidence: Math.round(agreement * 100),
      state, reason, fast, slow, vol, med, lows, highs, roundsSinceBig,
      target: state === 'МОЖНО СТАВИТЬ' ? (agreement >= 0.84 ? CFG.turboTarget : CFG.safeTarget) : null
    };
  }

  function mount() {
    if (document.getElementById('ru-model-layer')) return;
    const status = $('.status');
    if (!status) return;

    const box = document.createElement('div');
    box.id = 'ru-model-layer';
    box.setAttribute('aria-live', 'polite');
    box.style.cssText = 'min-height:20px;margin-top:2px;font-size:12px;font-weight:800;text-align:center;opacity:.95;';
    status.insertAdjacentElement('afterend', box);

    const render = () => {
      const h = history();
      const m = model(h);
      if (!m.ready) {
        box.textContent = 'МОДЕЛИ RU: сбор истории…';
        box.style.color = '';
        return;
      }
      const target = m.target ? ` • цель ${m.target.toFixed(2)}x` : '';
      box.textContent = `КОГДА СТАВИТЬ: ${m.state} • ${m.confidence}%${target}`;
      box.title = `${m.reason}. EMA ${m.fast.toFixed(2)}/${m.slow.toFixed(2)}, MAD ${m.vol.toFixed(2)}, BIG ${m.roundsSinceBig} раундов назад.`;
      box.style.color = m.state === 'МОЖНО СТАВИТЬ' ? '#10b981' : (m.state === 'ОСТОРОЖНО' ? '#f59e0b' : '#ef4444');
    };

    render();
    new MutationObserver(render).observe(document.body, { subtree: true, childList: true, characterData: true });
    setInterval(render, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
