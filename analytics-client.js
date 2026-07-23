(() => {
  "use strict";

  const config = window.ALLPREDICTOR_CONFIG || {};
  const webApp = window.Telegram && window.Telegram.WebApp;
  const TRACKED_KEY = "allpredictor_tracked_session_v1";

  function configured() {
    return Boolean(config.supabaseUrl && config.supabaseAnonKey && webApp?.initData);
  }

  async function send(eventName, data = {}) {
    if (!configured()) return { ok: false, skipped: true };

    const url = `${String(config.supabaseUrl).replace(/\/$/, "")}/functions/v1/track-user`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseAnonKey
      },
      body: JSON.stringify({
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

    let result = null;
    try { result = await response.json(); } catch (_error) {}
    if (!response.ok) throw new Error(result?.message || `TRACK_${response.status}`);
    return result || { ok: true };
  }

  async function trackOpenOnce() {
    try {
      if (sessionStorage.getItem(TRACKED_KEY) === "1") return;
      sessionStorage.setItem(TRACKED_KEY, "1");
    } catch (_error) {}
    await send("app_open").catch(() => {});
  }

  document.addEventListener("click", (event) => {
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

  window.AllPredictorAnalytics = Object.freeze({ send, configured: configured() });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", trackOpenOnce, { once: true });
  else trackOpenOnce();
})();
