(() => {
  "use strict";

  const CONTEXT_KEY = "allpredictor_telegram_context_v1";
  const MAX_AGE_MS = 30 * 60 * 1000;

  function readContext() {
    try {
      const value = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || "null");
      if (!value || !value.savedAt || Date.now() - Number(value.savedAt) > MAX_AGE_MS) return null;
      return value;
    } catch (_error) {
      return null;
    }
  }

  function setProperty(target, name, value) {
    if (!target || value === undefined || value === null || value === "") return false;
    try {
      target[name] = value;
      if (target[name] === value) return true;
    } catch (_error) {}
    try {
      Object.defineProperty(target, name, {
        configurable: true,
        enumerable: true,
        writable: false,
        value
      });
      return target[name] === value;
    } catch (_error) {
      return false;
    }
  }

  function restore() {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    const context = readContext();
    if (!context) return;

    if (!webApp.initData && context.initData) setProperty(webApp, "initData", context.initData);

    const liveUnsafe = webApp.initDataUnsafe || {};
    if (!liveUnsafe.user && context.user) {
      const restoredUnsafe = { ...liveUnsafe, user: context.user };
      setProperty(webApp, "initDataUnsafe", restoredUnsafe);
    }
  }

  restore();
  window.addEventListener("DOMContentLoaded", restore, { once: true });
})();
