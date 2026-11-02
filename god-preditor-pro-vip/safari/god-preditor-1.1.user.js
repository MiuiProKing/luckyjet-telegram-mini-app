// ==UserScript==
// @name         GOD PREDITOR PRO VIP — LuckyJet Safari
// @namespace    https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/
// @version      1.1.0
// @description  Панель 1,50× / 2×. Автонажатия выключены до явного включения и выбора двух кнопок.
// @match        https://one-vv3016.com/*
// @match        https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/safari/preview.html
// @noframes
// @run-at       document-idle
// @inject-into  content
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      stzrirukuxcyalrsstxx.supabase.co
// ==/UserScript==

// Generated from the same source model, feed and scene as the main page.
// Build: npm ci && npm run build (inside god-preditor-pro-vip/safari).
// No remote JavaScript or credential reads. Live mode may click ONLY the two
// user-selected bet buttons; default is OFF, test mode never clicks them.
(() => {
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
    const timestamp = Date.parse(row.round_timestamp);
    const coefficient = Number(row.coefficient);
    if (row.estimated !== false || !row.round_timestamp || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now || !Number.isFinite(coefficient) || coefficient < 1 || !row.id) return null;
    return { id: `supabase:luckyjet:${row.id}`, coefficient, timestamp, source: "Supabase · LuckyJet" };
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
    const timestamp = parseTime(rawTimestamp, now);
    if (!Number.isFinite(coefficient) || coefficient < 1) throw Error("Коэффициент должен быть числом ≥ 1");
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now) throw Error("Неверное или будущее время раунда");
    const id = String(o.id ?? `${timestamp}:${coefficient}`);
    if (id.length > 300) throw Error("Слишком длинный ID");
    return { id, coefficient, timestamp, source: String(o.source ?? source).slice(0, 100) };
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

  // ../modules/public-forecast.mjs
  var ARCHIVE_PROFILE = Object.freeze({ low: 2, cycle: 10, cluster: 20, confirmation: 50, midMin: 5, midMax: 10, opportunity: 100 });
  function targetProfile(target) {
    if (![1.5, 2].includes(target)) throw new RangeError("Supported targets: 1.50 and 2");
    return Object.freeze({ low: target, cycle: target, cluster: target, confirmation: 2, midMin: 1 + (target - 1) / 2, midMax: target, opportunity: target });
  }
  function m(s, i = 300, e = 1 / 0) {
    const n = /* @__PURE__ */ new Set();
    return [...s].sort((t, a) => a.timestamp - t.timestamp).filter(
      (t) => !Number.isFinite(t.coefficient) || t.coefficient < 1 || !Number.isFinite(t.timestamp) || t.timestamp <= 0 || t.timestamp > e || t.id && n.has(t.id) ? false : (t.id && n.add(t.id), true)
    ).slice(0, i);
  }
  function f(s, i = Date.now()) {
    const e = s[0]?.timestamp;
    return e !== void 0 && e <= i + 3e4 && i - e <= 18e4;
  }
  var Z = m;
  var Fe = f;
  var l = 6e4;
  var Te = 6e4;
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
  var ne = (t) => {
    let s = -1 / 0;
    for (const e of t) e > s && (s = e);
    return s === -1 / 0 ? 0 : s;
  };
  var se = (t) => {
    if (t.length < 2) return 0;
    const s = E(t);
    return E(t.map((e) => Math.abs(e - s)));
  };
  var d = (t, s, e) => Math.max(s, Math.min(e, t));
  function Y(t, s, profile = ARCHIVE_PROFILE) {
    const e = /* @__PURE__ */ new Map();
    for (const a of t) {
      const i = s(a), f2 = e.get(i) ?? { coefs: [], g: 0, mg: 0 };
      f2.coefs.push(a.coefficient), a.coefficient >= profile.cycle && f2.g++, a.coefficient >= profile.opportunity && f2.mg++, e.set(i, f2);
    }
    const o = /* @__PURE__ */ new Map();
    for (const [a, i] of e)
      o.set(a, {
        count: i.coefs.length,
        goldenCount: i.g,
        megaCount: i.mg,
        avg: O(i.coefs),
        max: ne(i.coefs)
      });
    return o;
  }
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
  function De(t, s, profile = ARCHIVE_PROFILE) {
    const e = [...t].sort((x, u) => x.timestamp - u.timestamp), o = [], a = ae(e, profile.opportunity);
    if (a.count >= 5 && a.last && a.medGap > 0) {
      const x = a.last + a.medGap, u = x - s, h = d(a.madGap * 1.4826 || a.medGap * 0.35, 2 * l, 12 * l), p = s - a.last;
      if (a.madGap > 0 && a.madGap < a.medGap * 0.5 && (Math.abs(u) <= h * 0.7 || p >= a.medGap * 0.9)) {
        const y = d(1 - Math.abs(u) / Math.max(h, 1), 0, 1), U = Math.min(10, a.count), q = d(55 + U + y * 12, 55, 82);
        o.push({
          expectedAt: u > 0 ? x : s + Math.max(2 * l, h * 0.4),
          windowMs: d(h, 3 * l, 10 * l),
          estimatedCoef: 100,
          confidence: Math.round(q),
          reason: `Cycle 100x≈${(a.medGap / l).toFixed(1)}min — dernier il y a ${(p / l).toFixed(1)}min (${a.count} évts)`
        });
      }
    }
    const i = e.slice(-80);
    let f2 = 0, m3 = 0;
    for (const x of i) x.coefficient >= profile.cluster && f2++, x.coefficient >= profile.confirmation && m3++;
    if (m3 >= 3 && f2 >= 6) {
      const x = d(55 + m3 * 5 + f2, 55, 82);
      o.push({
        expectedAt: s + 3 * l,
        windowMs: 6 * l,
        estimatedCoef: 120,
        confidence: Math.round(x),
        reason: `Cluster chaud : ${f2}×≥20x + ${m3}×≥50x sur 80 tours`
      });
    }
    const g = e.filter((x) => x.coefficient >= profile.opportunity);
    if (g.length >= 4 && a.last && e.length >= 80) {
      const x = s - a.last, u = e[e.length - 1].timestamp - e[0].timestamp, h = u > 0 ? g.length / u : 0;
      if (h > 0) {
        const p = 1 - Math.exp(-h * x);
        if (p >= 0.75) {
          const r = d(1 / h, 9e4, 8 * l), y = d(50 + p * 30, 50, 80);
          o.push({
            expectedAt: s + r,
            windowMs: d(r * 0.8, 3 * l, 7 * l),
            estimatedCoef: 100,
            confidence: Math.round(y),
            reason: `Hazard Poisson : P(retard)=${(p * 100).toFixed(0)}% (λ⁻¹≈${(1 / h / l).toFixed(1)}min)`
          });
        }
      }
    }
    if (!o.length) return null;
    o.sort((x, u) => u.confidence - x.confidence);
    const v = o[0];
    return o.length < 2 && v.confidence < 75 ? null : (o.length >= 2 && (v.confidence = Math.min(92, v.confidence + 5)), v);
  }
  function Pe(t, s, e = Date.now(), profile = ARCHIVE_PROFILE) {
    if (t = Z(t, t.length, e), !Fe(t, e) || t.length < 20) return null;
    if (s) {
      const c = Math.max(s.estimatedAt + s.windowMs, s.generatedAt + Te);
      if (e < c) return s;
    }
    const o = [...t].sort((c, b) => b.timestamp - c.timestamp), a = o.map((c) => c.coefficient);
    $(a);
    const i = E(a), f2 = O(a), m3 = a.slice(0, 20), g = a.slice(0, 50);
    $(m3);
    const v = $(g), x = X(m3, 0.25), u = X(g, 0.12), h = te(g), p = se(g), r = ae(o, profile.cycle), y = r.last ? e - r.last : 1 / 0, U = Y(o, (c) => new Date(c.timestamp).getUTCHours(), profile), q = Y(o, (c) => new Date(c.timestamp).getUTCMinutes(), profile), k = new Date(e), w = U.get(k.getUTCHours()), oe = (k.getUTCMinutes() + 2) % 60, T = q.get(oe), J = a.slice(0, 15), ie = J.length === 15 && J.every((c) => c < profile.low), N = o.slice(0, 30).filter((c) => c.coefficient >= profile.cluster), A = De(t, e, profile);
    if (r.medGap > 0 && r.last) {
      const b = r.last + r.medGap - e, F = d(r.madGap * 1.4826 || r.medGap * 0.55, 6e4, 4 * l), M = r.count >= 8 && r.madGap > 0 && r.madGap < r.medGap * 0.6, C = Math.abs(b) <= F * 0.6;
      if (M && C) {
        const Q = N.length, pe = Q >= 3 ? 2 : Q >= 1 ? 3 : 4, ue = ne(o.slice(0, 80).map((Me) => Me.coefficient)), he = d(ue / pe, 2, 20), be = d(60 - Math.abs(b) / F * 15, 40, 62), ve = w && w.avg > f2 ? 3 : 0, ye = d(r.count / 20, 0, 4), V = Math.round(d(be + ve + ye, 40, 68));
        return {
          estimatedCoef: +he.toFixed(2),
          confidence: V >= 66 ? "Moyen" : "Faible",
          reliability: V,
          estimatedAt: b > 0 ? e + Math.max(b, 9e4) : e + 2 * l,
          windowMs: d(r.medGap * 0.25, 9e4, 3 * l),
          pattern: "Cycle des cotes d'or détecté",
          basis: `Cycle médian ${(r.medGap / l).toFixed(1)} min — dernier ${(y / l).toFixed(1)} min — MAD ${(r.madGap / l).toFixed(2)}min`,
          generatedAt: e,
          bigOpportunity: A
        };
      }
    }
    if (ie) {
      const c = d(f2 * 2.5 + i, 2.5, 15), b = Math.round(d(70 + Math.min(15, (e - o[14].timestamp) / 6e4), 65, 92));
      return {
        estimatedCoef: +c.toFixed(2),
        confidence: b >= 82 ? "Élevé" : "Moyen",
        reliability: b,
        estimatedAt: e + 9e4,
        windowMs: 2 * l,
        pattern: "Série basse — rebond statistique",
        basis: `15 tours <2x — moy géo ${f2.toFixed(2)}x, médiane ${i.toFixed(2)}x`,
        generatedAt: e,
        bigOpportunity: A
      };
    }
    if (N.length >= 3) {
      const c = O(N.map((C) => C.coefficient)), b = N.length >= 5 ? 3 : N.length >= 4 ? 4 : 5, F = d(c / b, 2, 12), M = Math.min(78, 60 + N.length * 3);
      return {
        estimatedCoef: +F.toFixed(2),
        confidence: M >= 72 ? "Élevé" : "Moyen",
        reliability: M,
        estimatedAt: e + 2 * l,
        windowMs: 2.5 * l,
        pattern: `${N.length} cotes ≥20x récentes`,
        basis: `Moy. géo grosses cotes ${c.toFixed(2)}x ÷ ${b}`,
        generatedAt: e,
        bigOpportunity: A
      };
    }
    const D = o.slice(0, 60), G = D.filter((c) => c.coefficient >= profile.midMin && c.coefficient < profile.midMax), P = D.length ? D.filter((c) => c.coefficient < profile.low).length / D.length : 0;
    if (G.length >= 3) {
      const c = O(G.map((C) => C.coefficient)), b = P > 0.55 || h > v * 1.4, F = b ? d(c * 0.45, 2, 4.5) : d(c * 0.7, 3, 7), M = Math.round(d(64 + G.length * 4 + (b ? -6 : 6), 58, 90));
      return {
        estimatedCoef: +F.toFixed(2),
        confidence: M >= 82 ? "Élevé" : M >= 68 ? "Moyen" : "Faible",
        reliability: M,
        estimatedAt: e + 2 * l,
        windowMs: 2.5 * l,
        pattern: b ? `Phase mixte — ${G.length} cotes 5x-9x sur base fragile` : `Phase favorable — ${G.length} cotes 5x-9x récentes`,
        basis: `Zone 5x-9x géo ${c.toFixed(2)}x — <2x: ${(P * 100).toFixed(0)}% — σ50 ${h.toFixed(2)}`,
        generatedAt: e,
        bigOpportunity: A
      };
    }
    const B = w && w.count >= 5 ? w.avg / Math.max(f2, 0.1) : 1, re = T && T.count >= 5 ? T.avg / Math.max(f2, 0.1) : 1, ce = x * 0.5 + u * 0.3 + v * 0.2;
    let S = d(ce * B * 0.6 + (T?.max ?? 0) * 0.1 + 1.6, 1.8, 12);
    const K = P > 0.6 || h > v * 1.6;
    K ? S = Math.min(S, 3.2) : P > 0.45 && (S = Math.min(S, 5));
    const le = d(t.length / 25, 0, 28), de = d(Math.abs(B - 1) * 42, 0, 22), me = d(Math.abs(re - 1) * 32, 0, 16), fe = p > 0 && p < v * 0.6 ? 5 : 0, xe = K ? -8 : 0, R = Math.round(d(52 + le + de + me + fe + xe, 50, 92)), ge = 2 * l + (60 - k.getUTCSeconds()) * 1e3 % 45e3;
    return {
      estimatedCoef: +S.toFixed(2),
      confidence: R >= 82 ? "Élevé" : R >= 66 ? "Moyen" : "Faible",
      reliability: R,
      estimatedAt: e + ge,
      windowMs: 2.5 * l,
      pattern: B > 1.1 ? "Plage horaire favorable" : B < 0.9 ? "Plage horaire faible" : "Analyse multi-signaux",
      basis: `EMA20 ${x.toFixed(2)}x — H${k.getUTCHours()}h UTC: géo ${w?.avg.toFixed(2) ?? "—"}x (${w?.count ?? 0}) — MAD ${p.toFixed(2)} — σ ${h.toFixed(2)} — ${t.length} tours`,
      generatedAt: e,
      bigOpportunity: A
    };
  }

  // ../modules/signal-validation.mjs
  function m2(s, i = 300, e = 1 / 0) {
    const n = /* @__PURE__ */ new Set();
    return [...s].sort((t, a) => a.timestamp - t.timestamp).filter(
      (t) => !Number.isFinite(t.coefficient) || t.coefficient < 1 || !Number.isFinite(t.timestamp) || t.timestamp <= 0 || t.timestamp > e || t.id && n.has(t.id) ? false : (t.id && n.add(t.id), true)
    ).slice(0, i);
  }
  var ze = m2;
  function Te2(n, o, i, u) {
    const l2 = i + u, a = n.filter(
      (s) => Number.isFinite(s.coefficient) && s.coefficient >= 1 && Number.isFinite(s.timestamp) && s.timestamp >= i && s.timestamp <= l2
    ).reduce((s, t) => !s || t.coefficient > s.coefficient ? t : s, null);
    return {
      reached: !!a && a.coefficient >= o,
      best: a?.coefficient ?? null,
      bestAt: a?.timestamp ?? null
    };
  }
  function We(n, o, i, u) {
    const l2 = ze(o, o.length, i).reverse(), c = Te2(l2, n.target, n.start, n.end - n.start);
    if (c.reached && c.best !== null && c.bestAt !== null)
      return {
        target: n.target,
        status: "validated",
        coefficient: c.best,
        at: c.bestAt
      };
    if (i <= n.end || c.best === null) return null;
    const a = l2.filter((d2) => d2.timestamp <= n.start).at(-1), s = l2.find((d2) => d2.timestamp >= n.end);
    if (!a || !s) return null;
    const t = l2.filter(
      (d2) => d2.timestamp >= a.timestamp && d2.timestamp <= s.timestamp
    ), r = Math.min(18e4, Math.max(6e4, u * 3e3));
    return !Number.isFinite(r) || t.some(
      (d2, f2) => f2 > 0 && d2.timestamp - (t[f2 - 1]?.timestamp ?? d2.timestamp) > r
    ) ? null : { target: n.target, status: "failed", coefficient: c.best, at: n.end };
  }

  // ../window-model.mjs
  var TARGETS = Object.freeze([1.5, 2]);
  var MODEL = "archive-small-windows-v2";
  var RESULT_GRACE_MS = 18e4;
  var MINUTE = 6e4;
  function normalize(rounds, now = Date.now()) {
    const ids = /* @__PURE__ */ new Set();
    return [...rounds].filter((r) => r && Number.isFinite(r.coefficient) && r.coefficient >= 1 && Number.isFinite(r.timestamp) && r.timestamp > 0 && r.timestamp <= now).sort((a, b) => b.timestamp - a.timestamp || String(a.id ?? "").localeCompare(String(b.id ?? ""))).filter((r) => {
      const id = String(r.id ?? `${r.timestamp}:${r.coefficient}`);
      if (ids.has(id)) return false;
      ids.add(id);
      return true;
    });
  }
  function wilson(hits, n) {
    if (!n) return [0, 1];
    const z = 1.95996398454, p = hits / n, d2 = 1 + z * z / n;
    const center = (p + z * z / (2 * n)) / d2;
    const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d2;
    return [Math.max(0, center - radius), Math.min(1, center + radius)];
  }
  function analyze(rounds, now = Date.now()) {
    const rows = normalize(rounds, now), values = rows.map((r) => r.coefficient);
    const recent = values.slice(0, 50), last = rows[0];
    const gaps = rows.slice(0, 101).slice(1).map((r, i) => rows[i].timestamp - r.timestamp).filter((gap) => gap > 0 && gap <= RESULT_GRACE_MS);
    const fresh = !!last && now - last.timestamp <= RESULT_GRACE_MS;
    return {
      model: MODEL,
      n: rows.length,
      ready: rows.length >= 20 && fresh,
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
      targets: TARGETS.map((target) => {
        const intervals = ae(rows, target);
        return {
          target,
          count: intervals.count,
          probability: rows.length ? intervals.count / rows.length : 0,
          range: wilson(intervals.count, rows.length),
          recentRate: values.length ? values.slice(0, 100).filter((v) => v >= target).length / Math.min(100, values.length) : 0,
          medianGapMs: intervals.medGap,
          lastHitAt: intervals.last,
          intervals,
          profile: targetProfile(target)
        };
      })
    };
  }
  var RULES = Object.freeze({
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
  function ruleOf(pattern) {
    if (pattern.startsWith("Cycle")) return "cycle";
    if (pattern.startsWith("Série")) return "low-streak";
    if (pattern.includes("cotes ≥")) return "hot-cluster";
    if (pattern.startsWith("Phase mixte")) return "mid-mixed";
    if (pattern.startsWith("Phase favorable")) return "mid-favorable";
    if (pattern === "Plage horaire favorable") return "hour-favorable";
    if (pattern === "Plage horaire faible") return "hour-weak";
    return "multi-signal";
  }
  function forecastForTarget(rounds, target, previous = null, now = Date.now()) {
    const profile = targetProfile(target), rows = normalize(rounds, now);
    if (rows.length < 20 || now - rows[0].timestamp > RESULT_GRACE_MS) return null;
    if (previous?.model === MODEL && previous.target === target && validWindow(previous) && now < Math.max(previous.end, previous.generatedAt + MINUTE)) return previous;
    const raw = Pe(rows, null, now, profile);
    if (!raw) return null;
    const values = rows.map((r) => r.coefficient), cycle = ae(rows, target);
    const hours = Y(rows, (r) => new Date(r.timestamp).getUTCHours(), profile);
    const minutes = Y(rows, (r) => new Date(r.timestamp).getUTCMinutes(), profile);
    const utc = new Date(now), rule = ruleOf(raw.pattern);
    const opportunity = raw.bigOpportunity ? {
      target,
      estimatedCoef: target,
      start: raw.bigOpportunity.expectedAt,
      end: raw.bigOpportunity.expectedAt + raw.bigOpportunity.windowMs,
      windowMs: raw.bigOpportunity.windowMs,
      score: raw.bigOpportunity.confidence,
      rule: raw.bigOpportunity.reason.startsWith("Cycle") ? "cycle" : raw.bigOpportunity.reason.startsWith("Cluster") ? "cluster" : "poisson-delay"
      // This is the archive's heuristic delay score, not a calibrated probability.
    } : null;
    const useOpportunity = opportunity && opportunity.score > raw.reliability;
    const chosenRule = useOpportunity ? `opportunity-${opportunity.rule}` : rule;
    return {
      model: MODEL,
      target,
      estimatedCoef: target,
      generatedAt: now,
      start: useOpportunity ? opportunity.start : raw.estimatedAt,
      end: useOpportunity ? opportunity.end : raw.estimatedAt + raw.windowMs,
      estimatedAt: useOpportunity ? opportunity.start : raw.estimatedAt,
      windowMs: useOpportunity ? opportunity.windowMs : raw.windowMs,
      score: useOpportunity ? opportunity.score : raw.reliability,
      scoreKind: "heuristic",
      rule: chosenRule,
      pattern: RULES[chosenRule],
      basis: `Цель ${target.toFixed(2)}× · цикл ${(cycle.medGap / 1e3).toFixed(1)} с · MAD интервала ${(cycle.madGap / 1e3).toFixed(1)} с`,
      opportunity,
      diagnostics: {
        profile,
        sampleSize: rows.length,
        dataCutoff: rows[0].timestamp,
        cycle,
        basicWindow: { rule, start: raw.estimatedAt, end: raw.estimatedAt + raw.windowMs, score: raw.reliability },
        ema20: X(values.slice(0, 20), 0.25),
        ema50: X(values.slice(0, 50), 0.12),
        geometricMean: O(values),
        median: E(values),
        deviation50: te(values.slice(0, 50)),
        mad50: se(values.slice(0, 50)),
        lowRate60: values.slice(0, 60).filter((v) => v < target).length / Math.min(60, values.length),
        lowStreak15: values.slice(0, 15).every((v) => v < target),
        clusterCount30: values.slice(0, 30).filter((v) => v >= profile.cluster).length,
        middleCount60: values.slice(0, 60).filter((v) => v >= profile.midMin && v < profile.midMax).length,
        utcHour: utc.getUTCHours(),
        utcMinuteAhead: (utc.getUTCMinutes() + 2) % 60,
        hourBins: [...hours.entries()],
        minuteBins: [...minutes.entries()]
      }
    };
  }
  function validWindow(x) {
    return x && x.model === MODEL && TARGETS.includes(x.target) && [x.generatedAt, x.start, x.end].every(Number.isFinite) && x.generatedAt > 0 && x.start > x.generatedAt && x.end > x.start && x.end - x.start <= 12 * MINUTE;
  }
  function advanceJournal(journal, rounds, stats, now = Date.now(), enabled = true, coverage = { online: true, lastSuccessAt: now }) {
    const rows = normalize(rounds, now);
    let changed = false;
    const eligible = journal.filter((x) => validWindow(x) && Number.isFinite(x.acceptedAt) && x.acceptedAt < x.start && x.acceptedAt <= now && ["pending", "hit", "miss", "unknown"].includes(x.status));
    if (eligible.length !== journal.length) changed = true;
    const next = eligible.map((entry) => {
      if (entry.status !== "pending") return entry;
      const result = We(entry, rows, now, entry.avgRoundSeconds || 30);
      const freshFinalPoll = coverage.online && Number.isFinite(coverage.lastSuccessAt) && coverage.lastSuccessAt >= entry.end && now - coverage.lastSuccessAt <= RESULT_GRACE_MS && stats.fresh;
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
        return { ...entry, status: "unknown", actual: Te2(rows, entry.target, entry.start, entry.end - entry.start).best, resolvedAt: now };
      }
      return entry;
    });
    if (enabled && stats.ready) for (const target of TARGETS) {
      const latest = [...next].reverse().find((x) => x.target === target);
      if (next.some((x) => x.target === target && x.status === "pending") || latest && now < Math.max(latest.end, latest.generatedAt + MINUTE)) continue;
      const forecast = forecastForTarget(rows, target, null, now);
      if (!forecast) continue;
      next.push({
        ...forecast,
        key: `${MODEL}:${target}:${now}`,
        acceptedAt: now,
        avgRoundSeconds: stats.avgRoundSeconds || 30,
        sampleSize: stats.n,
        historicalFrequency: stats.targets.find((x) => x.target === target)?.probability ?? 0,
        status: "pending"
      });
      changed = true;
    }
    return { journal: next.slice(-200), changed };
  }

  // ../scene.mjs
  function mountScene(canvas, { onDelivery = () => {
  }, compact = false } = {}) {
    const c = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1, raf = 0, clock2 = 0, last = 0, deliveries = 0, flash = 0, paused = false, mouse = null, job = null, queue = [];
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
      const a = clock2 * 0.34, span = compact ? Math.min(W * 0.18, H * 0.2) : Math.min(W * 0.26, H * 0.29), target = mouse ?? { x: W / 2 + span * Math.sqrt(2) * Math.cos(a) / (1 + Math.sin(a) ** 2), y: H * 0.52 + span * 0.65 * Math.cos(a) * Math.sin(a) / (1 + Math.sin(a) ** 2) };
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
      const breath = 1 + 0.012 * Math.sin(clock2 * 1.8) + flash * 0.035;
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
        for (const [i, f2] of folds.entries()) {
          c.strokeStyle = i % 3 === 0 ? "#aca5fd99" : "#66d7ca99";
          c.beginPath();
          c.moveTo(f2[0], f2[1]);
          c.bezierCurveTo(...f2.slice(2));
          c.stroke();
        }
        c.clip(hemisphere);
        c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 48; i++) {
          const x = -10 - random(i + 21) * 98, y = -100 + random(i + 74) * 200, alpha = 0.15 + 0.5 * Math.max(0, Math.sin(clock2 * 1.1 + i));
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
        const a = side * (0.65 + i * 0.62), walk = Math.sin(clock2 * 12 + i * Math.PI + side) * 4;
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
      clock2 += dt;
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
        x = b.x + Math.cos(clock2 * 0.44) * Math.min(compact ? 55 : 180, W * (compact ? 0.22 : 0.32));
        y = b.y + Math.sin(clock2 * 0.66) * (compact ? Math.min(32, H * 0.25) : 116);
        a = Math.atan2(Math.cos(clock2 * 0.66) * 0.66, -Math.sin(clock2 * 0.44) * 0.44);
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
    return location2.protocol === "https:" && (location2.hostname === "one-vv3016.com" || location2.hostname === "miuiproking.github.io" && location2.pathname === "/luckyjet-telegram-mini-app/god-preditor-pro-vip/safari/preview.html");
  }

  // src/style.mjs
  var CSS = `
:host{all:initial;color-scheme:dark!important}*{box-sizing:border-box}button,a{touch-action:manipulation}button{font:inherit;color:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid #71efd9;outline-offset:2px}[hidden]{display:none!important}
.panel{position:fixed;display:flex;flex-direction:column;pointer-events:auto;overflow:hidden;min-width:190px;min-height:220px;border:1px solid #a77beb70;border-radius:18px;background:#090716f2;color:#eae4fa;box-shadow:0 10px 40px #0008;backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);font:11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;isolation:isolate;text-align:left}
.handle{display:flex;align-items:center;gap:4px;min-height:39px;padding:6px 7px 6px 10px;background:#171125;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}.handle:active{cursor:grabbing}.brand{flex:1;min-width:0}.brand strong{font-size:11px;font-weight:900;letter-spacing:.5px;color:#d9a4ff}.brand img{display:block;width:145px;max-width:100%;height:auto}.brand small{display:block;font-size:7px;color:#ab93bd;letter-spacing:1px}.icon{display:grid;place-items:center;flex:0 0 25px;width:25px;height:25px;padding:0;border:1px solid #bc90eb35;border-radius:8px;background:#ffffff08;font-size:16px}.body{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;flex:1;display:flex;flex-direction:column;padding:7px 10px 10px;gap:6px}.status{font-size:8px;color:#90ddbd;min-height:12px;overflow-wrap:anywhere}.status.error{color:#ff9fa8}.status.warn{color:#d1baa1}.recent{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px}.chip{padding:4px 0;text-align:center;border-radius:7px;background:#ffffff05;border:1px solid #ffffff0e;overflow:hidden}.chip b{font:700 10px ui-monospace,monospace;color:#d7a4ff;white-space:nowrap}.chip.low b{color:#80d5ff}.chip time{display:block;font:6px ui-monospace,monospace;color:#9b89a8;margin-top:3px}.neural{position:relative;min-height:65px;flex:1 0 95px;max-height:190px;border-radius:10px;overflow:hidden;background:radial-gradient(ellipse,#12372e44,transparent 70%)}canvas{display:block;width:100%;height:100%;position:absolute;inset:0;pointer-events:none}.vip{position:absolute;right:3px;top:1px;width:31px;max-height:18px;object-fit:contain}.signal{text-align:center;font:900 30px/1.1 ui-monospace,monospace;color:#f0d0ff;letter-spacing:-1px;overflow-wrap:anywhere}.window{text-align:center;font:9px/1.4 ui-monospace,monospace;white-space:pre-line;color:#e8dcf7;min-height:26px}.note{text-align:center;font-size:8px;line-height:1.5;color:#ac99bf;min-height:12px;overflow-wrap:anywhere}.targets{display:flex;justify-content:center;gap:8px}.targets button{padding:5px 12px;min-height:27px;border:1px solid #b979eb38;border-radius:7px;background:#140d22;color:#c5a5d9;font-size:10px}.targets button.active{background:#53306e66;border-color:#d4a4ee;color:#fff}.result{min-height:22px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:9px;text-align:center;color:#b8a9c6}.result.hit{color:#a2e8ac}.result.miss{color:#ff9ca8}.result img{width:26px;height:26px;object-fit:contain}.result strong{font-size:19px}.footer{display:flex;justify-content:space-between;align-items:center;padding:0 10px 7px;gap:4px}.link{color:#bc9ed6;font-size:8px;background:transparent;border:0;padding:4px;text-decoration:none}.grip{width:27px;height:27px;border:0;background:transparent;color:#baa2c8;font-size:18px;touch-action:none;cursor:nwse-resize;flex:0 0 27px}.tools{border-top:1px solid #ffffff14;padding-top:6px;display:flex;gap:5px;flex-wrap:wrap;font-size:9px}.tools button{border:1px solid #bf8be535;border-radius:6px;background:#ffffff07;padding:5px 8px;min-height:27px}.hint{font-size:8px;color:#aa9cb4;margin:0}.history{position:absolute;inset:39px 0 0;background:#0d091bf5;z-index:3;display:flex;flex-direction:column;padding:10px}.history-head{display:flex;align-items:center;justify-content:space-between;gap:6px}.history-head b{font-size:11px}.history small{font-size:8px;color:#ac9cbb;margin:5px 0}.history-list{overflow:auto;flex:1;margin-top:5px;overscroll-behavior:contain}.row{display:flex;justify-content:space-between;gap:5px;padding:7px 2px;border-bottom:1px solid #ffffff10;font:10px ui-monospace,monospace}.row time{font-size:8px;color:#9b8aaa}.launcher{position:fixed;display:flex;align-items:center;gap:5px;pointer-events:auto;min-width:55px;min-height:41px;border:1px solid #aa78d8b0;border-radius:14px;background:#120b20eb;box-shadow:0 5px 20px #0008;color:#f2d0ff;font:900 12px -apple-system,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;padding:8px}.launcher span{font:700 10px ui-monospace,monospace;color:#8af3ce}

.auto-panel{position:absolute;inset:39px 0 0;background:#10091bf8;z-index:4;padding:10px;overflow:auto;overscroll-behavior:contain}.auto-panel p{font-size:9px;line-height:1.5;color:#c1aecb;margin:8px 0}.auto-panel button,.auto-panel select{font:10px -apple-system,sans-serif;color:#eadcf5;background:#372344;border:1px solid #c99fe34d;border-radius:7px;padding:7px 8px;min-height:30px}.auto-panel label{display:block;font-size:10px;margin:10px 0}.auto-panel select{width:100%;margin-top:4px}.auto-slot{margin:9px 0;display:flex;gap:6px;align-items:center}.auto-slot small{font-size:8px;overflow-wrap:anywhere}.auto-panel #auto-toggle{display:block;width:100%;background:#24473d;border-color:#68c5a3}.auto-panel #auto-toggle.armed{background:#713636;border-color:#eb8f8f}.auto-panel #auto-message{color:#d8c1f0}.auto-panel #auto-diagnostic{color:#ffd598;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text}#auto-log{font:8px/1.6 ui-monospace,monospace;color:#aa96b6}#auto-log>div{border-top:1px solid #ffffff14;padding:5px 0}.launcher[data-auto=live]:after{content:'А';background:#d87660;color:#200a08;border-radius:4px;font-size:8px;padding:2px}.launcher[data-auto=test]:after{content:'Т';color:#e5ca83;font-size:8px}.picker{position:fixed;inset:0;pointer-events:none;z-index:20;font:12px/1.45 -apple-system,sans-serif;color:#f2e6ff}.pick-bar{position:fixed;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top,0px));pointer-events:auto;padding:12px;background:#150c25f5;border:1px solid #d5b2ed88;border-radius:13px;box-shadow:0 5px 30px #0008}.pick-bar p{font-size:11px;margin:5px 0;color:#bba6cd}.pick-info{font-size:10px;color:#ffe0a4;overflow-wrap:anywhere;margin:7px 0}.pick-bar button{font:12px -apple-system,sans-serif;color:#f1e1ff;background:#694081;border:1px solid #e5bff266;border-radius:8px;padding:9px 12px;margin-right:8px}.pick-bar button:disabled{opacity:.4}.pick-cursor{position:fixed;width:50px;height:50px;border:2px solid #9ef8d5;border-radius:50%;display:grid;place-items:center;background:#153a2ca0;color:#b5ffe2;font:32px/1 sans-serif;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 0 15px #80ffd74d}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;

  // src/autobet.mjs
  var AUTO_KEY = "god-preditor-autobet-receipts-v1";
  var ACCEPT_WAIT_MS = 15e3;
  var TARGETS2 = [1.5, 2];
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
    }
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
    function disarm(reason = "Авто выключено") {
      generation++;
      armed = false;
      lock?.release();
      lock = null;
      acknowledgements.length = 0;
      notify(reason);
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
        for (const [index, target] of TARGETS2.entries()) {
          if (!armed || ticket !== generation) break;
          const window2 = state.forecasts.find((x) => x?.model === MODEL && x.target === target);
          if (!window2 || !Number.isFinite(window2.start) || !Number.isFinite(window2.end) || !(window2.acceptedAt < window2.start && window2.start < window2.end) || typeof window2.key !== "string") continue;
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
          const latestWindow = currentState.forecasts.find((x) => x.target === target);
          if (!armed || ticket !== generation) break;
          if (!currentState.visible || !currentState.fresh || currentTime > Math.min(window2.end, window2.start + ACCEPT_WAIT_MS) || monotonic() - savedAt > 2e3 || final.state !== "ready" || latestWindow?.key !== window2.key || latestWindow.status !== "pending") {
            disarm("Авто выключено: условия изменились перед нажатием");
            break;
          }
          try {
            click(buttons[index]);
          } catch {
            disarm(`Поле ${index + 1}: нажатие не выполнено · повторения нет`);
            break;
          }
          acknowledgements.push({ index, button: buttons[index], until: currentTime + 2500 });
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
  var BET = /^(?:сделать\s+ставку|зробити\s+ставку|ставка|поставить|place\s+bet|bet)(?:$|\s|[\d₴$€])/iu;
  var labelOf = (element) => String(element.innerText || element.getAttribute("aria-label") || element.textContent || "").normalize("NFKC").replace(/\s+/g, " ").trim();
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
      const label = labelOf(button);
      if (!BET.test(label) || BUSY.test(label)) return { error: "Это не доступная «Ставка»: " + label.slice(0, 70) };
      return { element: button, document: doc, label };
    }
    return { error: "Слишком глубокое вложение игрового поля" };
  }
  function inspectBetButton(selected) {
    const element = selected?.element, doc = selected?.document;
    if (!element || !doc || !element.isConnected) return { state: "unsafe", reason: "кнопка исчезла, выбери её заново" };
    try {
      if (doc.defaultView.document !== doc) return { state: "unsafe", reason: "игра перезагрузилась" };
      const label = labelOf(element), style = doc.defaultView.getComputedStyle(element), rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || style.visibility !== "visible" || style.display === "none") return { state: "unsafe", reason: "кнопка скрыта" };
      if (BUSY.test(label)) return { state: "busy", reason: "поле занято: это не «Ставка»", label };
      if (!BET.test(label)) return { state: "unsafe", reason: "подпись кнопки изменилась", label };
      if (element.disabled || element.matches(":disabled") || element.getAttribute("aria-disabled") === "true" || style.pointerEvents === "none")
        return { state: "waiting", reason: "игра пока не принимает ставку", label };
      let currentDoc = doc, x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const hit = currentDoc.elementFromPoint(x, y);
      const root = element.getRootNode();
      const inside = element.contains(hit) || root.host && root.host === hit;
      if (!inside) return { state: "waiting", reason: "кнопка перекрыта — отодвинь панель", label };
      while (currentDoc.defaultView !== currentDoc.defaultView.top) {
        const frame = currentDoc.defaultView.frameElement;
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
    function activate(button, action) {
      let pointer = null;
      button.addEventListener("pointerdown", (event) => {
        if (!event.isTrusted || event.button !== 0 || button.disabled) return;
        event.preventDefault();
        pointer = event.pointerId;
        button.setPointerCapture(pointer);
      });
      button.addEventListener("pointerup", (event) => {
        if (!event.isTrusted || event.pointerId !== pointer || button.disabled) return;
        pointer = null;
        const rect = button.getBoundingClientRect();
        if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) action();
      });
      button.addEventListener("pointercancel", () => {
        pointer = null;
      });
      button.onclick = (event) => {
        if (event.isTrusted && !button.disabled) action();
      };
    }
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
  var KEY = "god-preditor-safari-v1";
  var HOME = "https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/";
  var ASSETS = HOME + "assets/";
  var number = (n) => Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  var clock = (t) => new Date(t).toLocaleTimeString("ru-RU", { timeZone: "Europe/Kyiv" });
  var duration = (ms) => {
    const n = Math.max(0, Math.ceil(ms / 1e3));
    return `${Math.floor(n / 60).toString().padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
  };
  async function start(gm) {
    if (window !== window.top || !permittedPage(location) || document.getElementById(ID)) return;
    const host = document.createElement("div");
    host.id = ID;
    host.dataset.version = "1.1.0";
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
        <div class="brand"><strong id="brand-text">GOD PREDITOR</strong><img id="brand-image" alt="GOD PREDITOR" hidden referrerpolicy="no-referrer"><small>PRO · VIP · SAFARI</small></div>
        <button class="icon" id="minimize" aria-label="Свернуть панель">−</button>
        <button class="icon" id="close" aria-label="Скрыть до перезагрузки">×</button>
      </header>
      <div class="body">
        <div class="status" id="status" role="status">Подключение к нашему Supabase…</div>
        <div class="recent" aria-label="Пять последних коэффициентов"></div>
        <div class="neural"><canvas aria-label="Неоновый мозг и паук"></canvas><img class="vip" alt="VIP" referrerpolicy="no-referrer"></div>
        <div class="signal" id="signal">—</div>
        <div class="window" id="window">Получаем историю</div>
        <div class="note" id="note"></div>
        <div class="targets" aria-label="Цель"><button data-target="1.5">1,50×</button><button data-target="2">2×</button></div>
        <div class="result" id="result" role="status"><img id="result-image" hidden alt="" referrerpolicy="no-referrer"><span id="result-label">Проверка по окну</span></div>
        <div class="tools" id="tools" hidden><button id="retry">Обновить связь</button><button id="opacity">Прозрачность</button><button id="reset">Сбросить размер</button><p class="hint">Перетащи за заголовок. Угол ↘ меняет размер. × скрывает до перезагрузки. Данные — наш Supabase.</p></div>
      </div>
      <footer class="footer"><button class="link" id="history-open">История</button><button class="link" id="auto-open">Авто</button><button class="link" id="tools-open">Настроить</button><a class="link" href="${HOME}" target="_blank" rel="noopener noreferrer">Страница ↗</a><button class="grip" id="resize" aria-label="Изменить размер панели">↘</button></footer>
      <section class="history" hidden><div class="history-head"><b>Полученные коэффициенты</b><button class="icon" id="history-close" aria-label="Закрыть историю">×</button></div><small id="history-count"></small><div class="history-list"></div></section>
      <section class="auto-panel" hidden><div class="history-head"><b id="auto-title">Авто выключено</b><button class="icon" id="auto-close" aria-label="Закрыть настройки авто">×</button></div>
        <p>Суммы и автозабирание выставь в игре сам. Скрипт их не меняет.</p>
        <div class="auto-slot"><button id="pick-0">Выбрать поле 1</button><small id="slot-0">1 → 1,50× · не выбрана</small></div>
        <div class="auto-slot"><button id="pick-1">Выбрать поле 2</button><small id="slot-1">2 → 2× · не выбрана</small></div>
        <button id="auto-check">Проверить без нажатий</button>
        <label>Режим <select id="auto-mode"><option value="test">Тест без ставок</option><option value="live">Автонажатия</option></select></label>
        <button id="auto-toggle">Включить тест</button>
        <p id="auto-message" role="status">Авто выключено</p>
        <p class="hint">Каждое поле: один раз в начале своего окна. Если «Ставка» недоступна 15 секунд — пропуск. Фон, перезагрузка или ошибка выключают режим. Новая привязка нужна после перезагрузки игры.</p>
        <p class="hint">Результат окна не подтверждает выигрыш твоей ставки. Отправленное нажатие проверяй в самой игре.</p>
        <p id="auto-diagnostic"></p><div id="auto-log"></div>
      </section>
    </section>
    <button class="launcher" hidden aria-label="Открыть панель GOD PREDITOR">GP <span>—</span></button>`;
    document.documentElement.append(host);
    const $2 = (selector) => root.querySelector(selector);
    const panel = $2(".panel"), launcher = $2(".launcher");
    let rows = [], journal = [], selected = 1.5, feed = null, status = "connecting", lastSuccessAt = null;
    let destroyed = false, saveTimer = null, storageWarning = false, historyVersion = "", latestResult = "";
    let latestStats = analyze([]), cancelPicker = null, requestedAutoMode = "test";
    const ui = { x: 10, y: 115, width: 238, height: 390, opacity: 0.97, collapsed: false };
    const scene = mountScene($2("canvas"), { compact: true });
    const current = (target) => [...journal].reverse().find((x) => x.target === target && x.model === MODEL);
    const auto = createAutoBet({
      context: () => ({
        visible: !document.hidden && !destroyed,
        fresh: status === "connected" && latestStats.ready && Date.now() - lastSuccessAt <= 12e3 && Date.now() - latestStats.lastAt <= 18e4,
        forecasts: [current(1.5), current(2)].filter(Boolean)
      }),
      inspect: inspectBetButton,
      click: clickSelectedBet,
      acquireLock: () => acquireAutoLock(navigator.locks),
      readReceipts: () => gm.getValue(AUTO_KEY, []),
      writeReceipts: (receipts) => gm.setValue(AUTO_KEY, receipts),
      onChange: renderAuto
    });
    function renderAuto() {
      const state = auto.state;
      $2("#auto-title").textContent = state.armed ? state.mode === "live" ? "Автонажатия включены" : "Тест включён" : "Авто выключено";
      $2("#auto-message").textContent = state.message;
      $2("#auto-toggle").textContent = state.armed ? "Выключить" : requestedAutoMode === "live" ? "Включить автонажатия" : "Включить тест";
      $2("#auto-toggle").classList.toggle("armed", state.armed);
      $2("#auto-open").textContent = state.armed ? state.mode === "live" ? "Авто ON" : "Тест ON" : "Авто";
      launcher.dataset.auto = state.armed ? state.mode : "off";
      const checks = auto.checks();
      checks.forEach((checked, i) => {
        $2("#slot-" + i).textContent = `${i + 1} → ${i === 0 ? "1,50" : "2"}× · ${checked.state === "ready" ? "готова" : checked.reason}`;
      });
      $2("#auto-log").replaceChildren(...state.logs.slice(-5).map((entry) => {
        const line = document.createElement("div");
        line.textContent = clock(entry.at) + " · " + entry.text;
        return line;
      }));
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
    $2("#auto-toggle").onclick = (event) => {
      if (auto.state.armed) {
        auto.disarm();
        return;
      }
      if (!event.isTrusted) return;
      void auto.arm(requestedAutoMode);
    };
    for (const index of [0, 1]) $2("#pick-" + index).onclick = (event) => {
      if (!event.isTrusted) return;
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
            $2("#auto-diagnostic").textContent = "";
          } catch (error) {
            $2("#auto-diagnostic").textContent = error.message;
          }
        } else $2("#auto-diagnostic").textContent = selection.error || "Выбор отменён";
        renderAuto();
      });
    };
    const viewport = () => ({
      left: visualViewport?.offsetLeft || 0,
      top: visualViewport?.offsetTop || 0,
      width: visualViewport?.width || innerWidth,
      height: visualViewport?.height || innerHeight
    });
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), v));
    function layout() {
      const v = viewport(), width = Math.min(ui.width, v.width - 16), height = Math.min(ui.height, v.height - 16);
      const w = ui.collapsed ? 84 : width, h = ui.collapsed ? 43 : height;
      ui.x = clamp(ui.x, v.left + 8, v.left + v.width - w - 8);
      ui.y = clamp(ui.y, v.top + 8, v.top + v.height - h - 8);
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
          await gm.setValue(KEY, { model: MODEL, rows: rows.slice(0, 2e3), journal: journal.slice(-100), selected, ui: { ...ui } });
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
    let ignoreLauncherClick = false;
    function movable(element, resize = false) {
      let active = null;
      element.addEventListener("pointerdown", (event) => {
        if (!resize && element !== launcher && event.target.closest("button,a")) return;
        if (event.button !== 0) return;
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        active = { id: event.pointerId, x: event.clientX, y: event.clientY, left: ui.x, top: ui.y, width: ui.width, height: ui.height, moved: false };
        ignoreLauncherClick = false;
      });
      element.addEventListener("pointermove", (event) => {
        if (!active || event.pointerId !== active.id) return;
        const dx = event.clientX - active.x, dy = event.clientY - active.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) active.moved = true;
        if (resize) {
          const v = viewport();
          ui.width = clamp(active.width + dx, 190, v.width - 16);
          ui.height = clamp(active.height + dy, 265, v.height - 16);
        } else {
          ui.x = active.left + dx;
          ui.y = active.top + dy;
        }
        layout();
      });
      const finish = () => {
        if (!active) return;
        ignoreLauncherClick = active.moved && element === launcher;
        active = null;
        saveSoon();
      };
      element.addEventListener("pointerup", finish);
      element.addEventListener("pointercancel", finish);
      element.addEventListener("lostpointercapture", finish);
    }
    movable($2(".handle"));
    movable(launcher);
    movable($2("#resize"), true);
    $2("#minimize").onclick = () => collapse(true);
    launcher.onclick = () => {
      if (!ignoreLauncherClick) collapse(false);
      ignoreLauncherClick = false;
    };
    $2("#tools-open").onclick = () => {
      $2("#tools").hidden = !$2("#tools").hidden;
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
      selected = Number(button.dataset.target);
      saveSoon();
      render();
    };
    $2("#history-open").onclick = () => {
      $2(".history").hidden = false;
      renderHistory();
    };
    $2("#history-close").onclick = () => {
      $2(".history").hidden = true;
    };
    function renderHistory() {
      const version = rows.length + ":" + rows[0]?.id;
      if (version === historyVersion) return;
      historyVersion = version;
      $2("#history-count").textContent = `${rows.length} в рабочей истории · последние 100 · время по Киеву`;
      const fragment = document.createDocumentFragment();
      for (const row of rows.slice(0, 100)) {
        const line = document.createElement("div");
        line.className = "row";
        const value = document.createElement("b");
        value.textContent = number(row.coefficient) + "×";
        const time = document.createElement("time");
        time.textContent = clock(row.timestamp);
        line.append(value, time);
        fragment.append(line);
      }
      $2(".history-list").replaceChildren(fragment);
    }
    function render() {
      if (destroyed) return;
      const now = Date.now(), stats = analyze(rows, now);
      latestStats = stats;
      const result = advanceJournal(journal, rows, stats, now, true, { online: status === "connected", lastSuccessAt });
      journal = result.journal;
      if (result.changed) saveSoon();
      const forecast = current(selected), occupied = forecast && now <= forecast.end;
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
          time.textContent = clock(row.timestamp);
          chip.append(value, time);
          return chip;
        }));
      }
      $2("#signal").textContent = stats.ready && occupied ? `${selected === 1.5 ? "1,50" : "2,00"}×` : stats.n && !stats.fresh ? "Пауза" : "—";
      $2("#window").textContent = forecast && occupied ? `${clock(forecast.start)} — ${clock(forecast.end)}
Окно · Киев` : forecast?.status === "pending" ? "Проверяем покрытие окна" : "Нужно 20 раундов\nи свежий поток";
      $2("#note").textContent = forecast && occupied ? `${now < forecast.start ? "До окна " + duration(forecast.start - now) : "До конца " + duration(forecast.end - now)} · ${forecast.pattern} · ${forecast.score}/100` : "Балл правила не равен вероятности выигрыша";
      launcher.querySelector("span").textContent = stats.ready && occupied ? number(selected) + "×" : "…";
      for (const button of root.querySelectorAll("[data-target]")) button.classList.toggle("active", Number(button.dataset.target) === selected);
      const completed = [...journal].reverse().find((x) => x.target === selected && ["hit", "miss", "unknown"].includes(x.status));
      const key = completed ? completed.key + completed.status : "";
      if (key !== latestResult) {
        latestResult = key;
        $2("#result").className = "result " + (completed?.status || "");
        $2("#result-image").hidden = !completed || completed.status === "unknown";
        if (completed && completed.status !== "unknown") $2("#result-image").src = ASSETS + `result-${completed.status}.webp`;
      }
      $2("#result-label").textContent = completed ? (completed.status === "hit" ? "ЦЕЛЬ В ОКНЕ" : completed.status === "miss" ? "НИЖЕ ЦЕЛИ В ОКНЕ" : "НЕТ ДАННЫХ") + (completed.actual != null ? " · макс. окна " + number(completed.actual) + "×" : "") : "Проверка: достижение цели в окне";
      if (!$2(".history").hidden) renderHistory();
      if (!$2(".auto-panel").hidden) renderAuto();
    }
    const fetchImpl = createExtensionFetch(gm, SUPABASE_CONFIG);
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
          scene.push(batch.filter((x) => !seen.has(x.id)), { initial });
          saveSoon();
          render();
        },
        onStatus(s) {
          if (destroyed) return;
          status = s.state;
          if (s.lastSuccess) lastSuccessAt = s.lastSuccess;
          if (s.state === "error") auto.disarm("Ошибка связи — авто выключено");
          if (s.message) host.dataset.error = s.message;
          render();
        }
      });
      render();
    }
    $2("#retry").onclick = startFeed;
    const onVisibility = () => {
      if (document.hidden) {
        auto.disarm("Safari ушёл в фон — авто выключено");
        cancelPicker?.();
        feed?.stop();
        feed = null;
        status = "paused";
        scene.setPaused(true);
      } else {
        layout();
        startFeed();
      }
    };
    const onPageHide = () => {
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
    const autoTick = setInterval(() => {
      void auto.tick().catch(() => auto.disarm("Ошибка авто — режим выключен"));
    }, 250);
    $2("#close").onclick = () => {
      auto.disarm("Панель закрыта — авто выключено");
      cancelPicker?.();
      destroyed = true;
      clearInterval(tick);
      clearInterval(autoTick);
      clearTimeout(saveTimer);
      feed?.stop();
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
    layout();
    render();
    try {
      const saved = await gm.getValue(KEY, null);
      if (saved && !destroyed) {
        rows = mergeRounds([], Array.isArray(saved.rows) ? saved.rows : [], "Supabase · LuckyJet").rounds;
        journal = saved.model === MODEL && Array.isArray(saved.journal) ? saved.journal.slice(-100) : [];
        selected = saved.selected === 2 ? 2 : 1.5;
        if (saved.ui && typeof saved.ui === "object") {
          for (const key of ["x", "y", "width", "height", "opacity"]) if (Number.isFinite(saved.ui[key])) ui[key] = saved.ui[key];
          ui.width = clamp(ui.width, 190, 600);
          ui.height = clamp(ui.height, 265, 700);
          ui.opacity = clamp(ui.opacity, 0.6, 1);
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
  }
  if (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function") {
    void start(GM).catch((error) => console.error("GOD PREDITOR:", error.message));
  }
})();
