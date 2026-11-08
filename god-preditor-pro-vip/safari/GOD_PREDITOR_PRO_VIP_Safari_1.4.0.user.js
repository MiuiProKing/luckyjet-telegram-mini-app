// ==UserScript==
// @name         GOD PREDITOR PRO VIP — LuckyJet Safari
// @namespace    https://miuiproking.github.io/MiuiProKing/luckyjet-analysis-live/
// @version      1.4.0
// @description  Исправленная экспериментальная модель v2; преимущество в точности не установлено. Автонажатия выключены до явного включения и выбора двух кнопок.
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
    return {
      model,
      rows: Array.isArray(saved.rows) ? saved.rows : [],
      journal: active.slice(-100),
      legacyJournal: [...legacy, ...archived].slice(-200),
      selected: saved.selected === "big" ? "big" : "primary",
      ui: saved.ui && typeof saved.ui === "object" && !Array.isArray(saved.ui) ? saved.ui : {}
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

  // src/frame-support.mjs
  var GAME_ORIGIN = "https://1play.gamedev-tech.cc";
  var CASINO_ORIGIN = "https://one-vv3016.com";
  var READY = "gp-frame-ready-v1";
  var STATE = "gp-parent-state-v1";
  function installFrameSupport(win, onReady = () => {
  }, getProbes = () => []) {
    let parentSeenAt = 0, parentReady = false;
    const framed = win !== win.top;
    if (framed && win.location.origin !== GAME_ORIGIN) return { invalidate() {
      parentReady = false;
    }, ready: () => false };
    function message(event) {
      if (framed) {
        if (event.source !== win.top || event.origin !== CASINO_ORIGIN || event.data?.type !== STATE) return;
        parentSeenAt = Date.now();
        parentReady = event.data.ready === true;
      } else {
        if (event.origin !== GAME_ORIGIN || event.data?.type !== READY) return;
        const frame = [...win.document.querySelectorAll("iframe")].find((f) => f.contentWindow === event.source && new URL(f.src, win.location.href).origin === GAME_ORIGIN);
        if (!frame) return;
        const rect = frame.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        const probes = Array.isArray(event.data.probes) ? event.data.probes.slice(0, 2) : [];
        const pointsVisible = probes.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= frame.clientWidth && p.y <= frame.clientHeight && win.document.elementFromPoint(rect.left + (p.x + frame.clientLeft) * rect.width / frame.offsetWidth, rect.top + (p.y + frame.clientTop) * rect.height / frame.offsetHeight) === frame);
        const ready = !win.document.hidden && rect.width > 0 && rect.height > 0 && win.document.elementFromPoint(x, y) === frame && pointsVisible;
        event.source.postMessage({ type: STATE, ready }, GAME_ORIGIN);
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
  function bucketBy(rounds, keyOf) {
    const grouped = /* @__PURE__ */ new Map();
    for (const round of rounds) {
      const key = keyOf(round);
      const values = grouped.get(key) ?? [];
      values.push(round.coefficient);
      grouped.set(key, values);
    }
    return new Map([...grouped].map(([key, values]) => [key, { count: values.length, avg: geoMean(values), max: safeMax(values) }]));
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
  function normalize(rounds, now = Date.now()) {
    return normalizeRounds(rounds, now);
  }
  function currentSegment(rows) {
    let count = rows.length, boundaryGapMs = null;
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i - 1].timestamp - rows[i].timestamp;
      if (gap > MAX_FRESH_AGE_MS) {
        count = i;
        boundaryGapMs = gap;
        break;
      }
    }
    return {
      rows: rows.slice(0, count),
      diagnostics: {
        gapThresholdMs: MAX_FRESH_AGE_MS,
        currentSegmentCount: count,
        discardedOlderSegmentRows: rows.length - count,
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
    const rows = normalize(rounds, now);
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
    const rows = normalize(rounds, now), inputJournal = Array.isArray(journal) ? journal : [];
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
    return location2.protocol === "https:" && (location2.hostname === "one-vv3016.com" || location2.hostname === "1play.gamedev-tech.cc" || location2.hostname === "miuiproking.github.io" && location2.pathname === "/luckyjet-telegram-mini-app/god-preditor-pro-vip/safari/preview.html");
  }

  // src/style.mjs
  var CSS = `
:host{all:initial;color-scheme:dark!important}*{box-sizing:border-box}button,a{touch-action:manipulation}button{font:inherit;color:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid #71efd9;outline-offset:2px}[hidden]{display:none!important}
.panel{--header-height:94px;position:fixed;display:flex;flex-direction:column;pointer-events:auto;overflow:hidden;min-width:218px;min-height:220px;border:1px solid #a77beb70;border-radius:18px;background:#090716f2;color:#eae4fa;box-shadow:0 10px 40px #0008;backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);font:11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;isolation:isolate;text-align:left}
.handle{display:flex;flex-direction:column;align-items:stretch;gap:6px;height:var(--header-height);flex:0 0 var(--header-height);padding:7px 9px;background:#171125;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}.window-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;flex:0 0 44px}.window-controls .icon{width:100%;height:44px;min-width:44px;font-size:24px;border-radius:10px;touch-action:manipulation}.handle:active{cursor:grabbing}.brand{flex:1;min-width:0}.brand strong{font-size:11px;font-weight:900;letter-spacing:.5px;color:#d9a4ff}.brand img{display:block;width:145px;max-width:100%;height:auto}.brand small{display:block;font-size:7px;color:#ab93bd;letter-spacing:1px}.icon{display:grid;place-items:center;flex:0 0 25px;width:25px;height:25px;padding:0;border:1px solid #bc90eb35;border-radius:8px;background:#ffffff08;font-size:16px}.body{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;flex:1;display:flex;flex-direction:column;padding:7px 10px 10px;gap:6px}.status{font-size:8px;color:#90ddbd;min-height:12px;overflow-wrap:anywhere}.status.error{color:#ff9fa8}.status.warn{color:#d1baa1}.recent{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px}.chip{padding:4px 0;text-align:center;border-radius:7px;background:#ffffff05;border:1px solid #ffffff0e;overflow:hidden}.chip b{font:700 10px ui-monospace,monospace;color:#d7a4ff;white-space:nowrap}.chip.low b{color:#80d5ff}.chip time{display:block;font:6px ui-monospace,monospace;color:#9b89a8;margin-top:3px}.neural{position:relative;min-height:65px;flex:1 0 95px;max-height:190px;border-radius:10px;overflow:hidden;background:radial-gradient(ellipse,#12372e44,transparent 70%)}canvas{display:block;width:100%;height:100%;position:absolute;inset:0;pointer-events:none}.vip{position:absolute;right:3px;top:1px;width:31px;max-height:18px;object-fit:contain}.signal{text-align:center;font:900 30px/1.1 ui-monospace,monospace;color:#f0d0ff;letter-spacing:-1px;overflow-wrap:anywhere}.window{text-align:center;font:9px/1.4 ui-monospace,monospace;white-space:pre-line;color:#e8dcf7;min-height:26px}.note{text-align:center;font-size:8px;line-height:1.5;color:#ac99bf;min-height:12px;overflow-wrap:anywhere}.targets{display:flex;justify-content:center;gap:8px}.targets button{padding:5px 12px;min-height:27px;border:1px solid #b979eb38;border-radius:7px;background:#140d22;color:#c5a5d9;font-size:10px}.targets button.active{background:#53306e66;border-color:#d4a4ee;color:#fff}.result{min-height:22px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:9px;text-align:center;color:#b8a9c6}.result.hit{color:#a2e8ac}.result.miss{color:#ff9ca8}.result img{width:26px;height:26px;object-fit:contain}.result strong{font-size:19px}.footer{display:flex;justify-content:space-between;align-items:center;padding:0 10px 7px;gap:4px}.link{color:#bc9ed6;font-size:8px;background:transparent;border:0;padding:4px;text-decoration:none}.grip{width:27px;height:27px;border:0;background:transparent;color:#baa2c8;font-size:18px;touch-action:none;cursor:nwse-resize;flex:0 0 27px}.tools{border-top:1px solid #ffffff14;padding-top:6px;display:flex;gap:5px;flex-wrap:wrap;font-size:9px}.tools button{border:1px solid #bf8be535;border-radius:6px;background:#ffffff07;padding:5px 8px;min-height:27px}.hint{font-size:8px;color:#aa9cb4;margin:0}.history{position:absolute;inset:var(--header-height) 0 0;background:#0d091bf5;z-index:3;display:flex;flex-direction:column;padding:10px}.history-head{display:flex;align-items:center;justify-content:space-between;gap:6px}.history-head b{font-size:11px}.history small{font-size:8px;color:#ac9cbb;margin:5px 0}.history-list{overflow:auto;flex:1;margin-top:5px;overscroll-behavior:contain}.row{display:flex;justify-content:space-between;gap:5px;padding:7px 2px;border-bottom:1px solid #ffffff10;font:10px ui-monospace,monospace}.row time{font-size:8px;color:#9b8aaa}.launcher{position:fixed;display:flex;align-items:center;gap:5px;pointer-events:auto;min-width:55px;min-height:41px;border:1px solid #aa78d8b0;border-radius:14px;background:#120b20eb;box-shadow:0 5px 20px #0008;color:#f2d0ff;font:900 12px -apple-system,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;padding:8px}.launcher span{font:700 10px ui-monospace,monospace;color:#8af3ce}

.auto-panel{position:absolute;inset:var(--header-height) 0 0;background:#10091bf8;z-index:4;padding:10px;overflow:auto;overscroll-behavior:contain}.auto-panel p{font-size:9px;line-height:1.5;color:#c1aecb;margin:8px 0}.auto-panel button,.auto-panel select{font:10px -apple-system,sans-serif;color:#eadcf5;background:#372344;border:1px solid #c99fe34d;border-radius:7px;padding:7px 8px;min-height:30px}.auto-panel label{display:block;font-size:10px;margin:10px 0}.auto-panel select{width:100%;margin-top:4px}.auto-slot{margin:9px 0;display:flex;gap:6px;align-items:center}.auto-slot small{font-size:8px;overflow-wrap:anywhere}.auto-panel #auto-toggle{display:block;width:100%;background:#24473d;border-color:#68c5a3}.auto-panel #auto-toggle.armed{background:#713636;border-color:#eb8f8f}.auto-panel #auto-message{color:#d8c1f0}.auto-panel #auto-diagnostic{color:#ffd598;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text}#auto-log{font:8px/1.6 ui-monospace,monospace;color:#aa96b6}#auto-log>div{border-top:1px solid #ffffff14;padding:5px 0}.launcher[data-auto=live]:after{content:'А';background:#d87660;color:#200a08;border-radius:4px;font-size:8px;padding:2px}.launcher[data-auto=test]:after{content:'Т';color:#e5ca83;font-size:8px}.picker{position:fixed;inset:0;pointer-events:none;z-index:20;font:12px/1.45 -apple-system,sans-serif;color:#f2e6ff}.pick-bar{position:fixed;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top,0px));pointer-events:auto;padding:12px;background:#150c25f5;border:1px solid #d5b2ed88;border-radius:13px;box-shadow:0 5px 30px #0008}.pick-bar p{font-size:11px;margin:5px 0;color:#bba6cd}.pick-info{font-size:10px;color:#ffe0a4;overflow-wrap:anywhere;margin:7px 0}.pick-bar button{font:12px -apple-system,sans-serif;color:#f1e1ff;background:#694081;border:1px solid #e5bff266;border-radius:8px;padding:9px 12px;margin-right:8px}.pick-bar button:disabled{opacity:.4}.pick-cursor{position:fixed;width:50px;height:50px;border:2px solid #9ef8d5;border-radius:50%;display:grid;place-items:center;background:#153a2ca0;color:#b5ffe2;font:32px/1 sans-serif;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 0 15px #80ffd74d}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;

  // ../modules/supplied-prediction.mjs
  var ARCHIVE_PROFILE2 = Object.freeze({ low: 2, cycle: 10, cluster: 20, confirmation: 50, midMin: 5, midMax: 10, opportunity: 100 });

  // ../window-model.mjs
  var TARGETS2 = Object.freeze(["primary", "big"]);
  var MODEL2 = "supplied-dynamic-windows-v3";
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
    model = MODEL2
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
  var number = (n) => Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  var clock = (t) => new Date(t).toLocaleTimeString("ru-RU", { timeZone: "Europe/Kyiv" });
  var duration = (ms) => {
    const n = Math.max(0, Math.ceil(ms / 1e3));
    return `${Math.floor(n / 60).toString().padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
  };
  async function start(gm) {
    if (window !== window.top && location.origin !== GAME_ORIGIN || !permittedPage(location) || document.getElementById(ID)) return;
    const host = document.createElement("div");
    host.id = ID;
    host.dataset.version = "1.4.0";
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
        <div class="brand"><strong id="brand-text">GOD PREDITOR</strong><img id="brand-image" alt="GOD PREDITOR" hidden referrerpolicy="no-referrer"><small>PRO · VIP · 1.4</small></div>
        <div class="window-controls" role="group" aria-label="Управление окном">
          <button class="icon" id="size-up" aria-label="Увеличить окно" title="Увеличить окно">+</button>
          <button class="icon" id="size-down" aria-label="Уменьшить окно" title="Уменьшить окно">−</button>
          <button class="icon" id="minimize" aria-label="Свернуть окно" title="Свернуть окно">▁</button>
          <button class="icon" id="close" aria-label="Закрыть окно" title="Закрыть до перезагрузки">×</button>
        </div>
      </header>
      <div class="body">
        <div class="status" id="status" role="status">Подключение к нашему Supabase…</div>
        <div class="recent" aria-label="Пять последних коэффициентов"></div>
        <div class="neural"><canvas aria-label="Неоновый мозг и паук"></canvas><img class="vip" alt="VIP" referrerpolicy="no-referrer"></div>
        <div class="signal" id="signal">—</div>
        <div class="window" id="window">Получаем историю</div>
        <div class="note" id="note"></div>
        <div class="targets" aria-label="Цель"><button data-target="primary">Основной</button><button data-target="big">Доп. окно</button></div>
        <div class="result" id="result" role="status"><img id="result-image" hidden alt="" referrerpolicy="no-referrer"><span id="result-label">Проверка по окну</span></div>
        <div class="tools" id="tools" hidden><button id="retry">Обновить связь</button><button id="opacity">Прозрачность</button><button id="reset">Сбросить размер</button><p class="hint">Кнопки + и − вверху меняют размер. Перетащи за заголовок. Угол ↘ тоже меняет размер. × скрывает до перезагрузки. Данные — наш Supabase.</p></div>
      </div>
      <footer class="footer"><button class="link" id="history-open">История</button><button class="link" id="auto-open">Авто</button><button class="link" id="tools-open">Настроить</button><a class="link" href="${HOME}" target="_blank" rel="noopener noreferrer">Страница ↗</a><button class="grip" id="resize" aria-label="Изменить размер панели">↘</button></footer>
      <section class="history" hidden><div class="history-head"><b>Полученные коэффициенты</b><button class="icon" id="history-close" aria-label="Закрыть историю">×</button></div><small id="history-count"></small><div class="history-list"></div></section>
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
      </section>
    </section>
    <button class="launcher" hidden aria-label="Открыть панель GOD PREDITOR">GP <span>—</span></button>`;
    document.documentElement.append(host);
    const $2 = (selector) => root.querySelector(selector);
    const panel = $2(".panel"), launcher = $2(".launcher");
    let rows = [], journal = [], legacyJournal = [], selected = "primary", feed = null, status = "connecting", lastSuccessAt = null;
    let destroyed = false, saveTimer = null, storageWarning = false, historyVersion = "", latestResult = "";
    let latestStats = analyze([]), cancelPicker = null, requestedAutoMode = "test";
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
        $2("#slot-" + i).textContent = `${i + 1} → основной прогноз · ${checked.state === "ready" ? "готова" : checked.reason}`;
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
    const clamp2 = (v, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), v));
    function layout() {
      const v = viewport(), width = Math.min(ui.width, v.width - 16), height = Math.min(ui.height, v.height - 16);
      const w = ui.collapsed ? 84 : width, h = ui.collapsed ? 43 : height;
      ui.x = clamp2(ui.x, v.left + 8, v.left + v.width - w - 8);
      ui.y = clamp2(ui.y, v.top + 8, v.top + v.height - h - 8);
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
          await gm.setValue(KEY, { model: MODEL, rows: rows.slice(0, 2e3), journal: journal.slice(-100), legacyJournal: legacyJournal.slice(-200), selected, ui: { ...ui } });
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
          ui.width = clamp2(active.width + dx, 218, v.width - 16);
          ui.height = clamp2(active.height + dy, 265, v.height - 16);
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
      ui.width = clamp2(width + direction * 30, 218, v.width - 16);
      ui.height = clamp2(height + direction * 45, 265, v.height - 16);
      layout();
      saveSoon();
    }
    $2("#size-up").onclick = () => changeSize(1);
    $2("#size-down").onclick = () => changeSize(-1);
    $2("#minimize").onclick = () => collapse(true);
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
      selected = button.dataset.target;
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
      $2("#history-count").textContent = `${rows.length} в рабочей истории · последние 100 · время по Киеву${legacyJournal.length ? " · прежних проверок: " + legacyJournal.length : ""}`;
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
      host.dataset.ready = String(stats.ready);
      host.dataset.continuityCount = String(stats.continuityCount);
      if (result.changed) saveSoon();
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
          time.textContent = clock(row.timestamp);
          chip.append(value, time);
          return chip;
        }));
      }
      $2("#signal").textContent = stats.ready && occupied ? number(forecast.target) + "×" : stats.n && !stats.fresh ? "Пауза" : "—";
      $2("#window").textContent = !stats.ready ? "Пауза · нужно 20 свежих\nпоследовательных раундов" : forecast && occupied ? `${clock(forecast.start)} — ${clock(forecast.end)}
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
    closeOverlay = $2("#close").onclick = () => {
      auto.disarm("Панель закрыта — авто выключено");
      cancelPicker?.();
      destroyed = true;
      if (window !== window.top) frameSupport.stop();
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
        journal = saved.model === MODEL && Array.isArray(saved.journal) ? saved.journal.slice(-100) : [];
        legacyJournal = saved.legacyJournal;
        selected = saved.selected === "big" ? "big" : "primary";
        if (saved.ui && typeof saved.ui === "object") {
          for (const key of ["x", "y", "width", "height", "opacity"]) if (Number.isFinite(saved.ui[key])) ui[key] = saved.ui[key];
          ui.width = clamp2(ui.width, 218, 600);
          ui.height = clamp2(ui.height, 265, 700);
          ui.opacity = clamp2(ui.opacity, 0.6, 1);
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
