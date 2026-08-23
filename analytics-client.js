(() => {
  "use strict";

  const config = window.ALLPREDICTOR_CONFIG || {};
  const webApp = window.Telegram && window.Telegram.WebApp;
  const TRACKED_KEY = "allpredictor_tracked_session_v1";
  const CONTEXT_KEY = "allpredictor_telegram_context_v1";
  const MAX_INIT_RETRIES = 20;
  let initRetries = 0;
  let retryTimer = null;

  function configured() {
    return Boolean(config.supabaseUrl && config.supabaseAnonKey && webApp?.initData);
  }

  function preserveTelegramContext() {
    if (!webApp?.initData) return;
    const value = JSON.stringify({
      initData: webApp.initData,
      user: webApp.initDataUnsafe?.user || null,
      savedAt: Date.now()
    });
    try { sessionStorage.setItem(CONTEXT_KEY, value); } catch (_error) {}
    try { localStorage.setItem(CONTEXT_KEY, value); } catch (_error) {}
  }

  async function send(eventName, data = {}) {
    if (!configured()) return { ok: false, skipped: true };
    const url = `${String(config.supabaseUrl).replace(/\/$/, "")}/functions/v1/allpredictor-api`;
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey },
        body: JSON.stringify({
          action: "track_user",
          initData: webApp.initData,
          startParam: webApp.initDataUnsafe?.start_param || "",
          platform: webApp.platform || "",
          version: webApp.version || "",
          appVersion: config.version || "",
          eventName,
          page: location.pathname,
          game: document.body?.dataset?.game || "",
          data
        }),
        keepalive: true
      });
    } catch (_error) {
      return { ok: false, skipped: true };
    }
    let result = null;
    try { result = await response.json(); } catch (_error) {}
    if (!response.ok) throw new Error(result?.message || `TRACK_${response.status}`);
    return result || { ok: true };
  }

  async function trackOpenOnce() {
    preserveTelegramContext();
    try {
      if (sessionStorage.getItem(TRACKED_KEY) === "1") return;
    } catch (_error) {}
    if (!configured()) {
      if (initRetries < MAX_INIT_RETRIES) {
        initRetries += 1;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(trackOpenOnce, 500);
      }
      return;
    }
    try {
      const result = await send("app_open");
      if (result?.ok) {
        try { sessionStorage.setItem(TRACKED_KEY, "1"); } catch (_error) {}
      }
    } catch (_error) {
      if (initRetries < MAX_INIT_RETRIES) {
        initRetries += 1;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(trackOpenOnce, 1500);
      }
    }
  }

  document.addEventListener("click", event => {
    const target = event.target?.closest?.("[data-open-game],[data-open-pro],#generateButton,#signalButton,#grandButton,#trainedButton,[data-generate-signal]");
    if (!target) return;
    let eventName = "interaction";
    let data = {};
    if (target.matches("[data-open-game]")) {
      eventName = "game_open";
      data = { game: target.dataset.openGame };
    } else if (target.matches("[data-open-pro]")) {
      eventName = "pro_game_open";
      data = { game: target.dataset.openPro };
    } else {
      eventName = "prediction_request";
      data = { button: target.id || target.className || "signal" };
    }
    send(eventName, data).catch(() => {});
  }, true);

  window.AllPredictorAnalytics = Object.freeze({ send, configured, trackOpen: trackOpenOnce, preserveTelegramContext });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", trackOpenOnce, { once: true });
  else trackOpenOnce();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) trackOpenOnce(); });
})();
