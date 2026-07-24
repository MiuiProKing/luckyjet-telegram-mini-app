(() => {
  "use strict";

  const ADMIN_IDS = Object.freeze([8016237913]);
  const ADMIN_PAGE_VERSION = "20260724-23";
  const CONTEXT_KEY = "allpredictor_telegram_context_v1";

  function telegramWebApp() {
    return window.Telegram?.WebApp || null;
  }

  function saveTelegramContext() {
    const webApp = telegramWebApp();
    const initData = String(webApp?.initData || "");
    const user = webApp?.initDataUnsafe?.user || null;
    if (!initData && !user) return false;

    const context = {
      initData,
      user,
      platform: webApp?.platform || "",
      version: webApp?.version || "",
      savedAt: Date.now()
    };

    try {
      sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function currentTelegramId() {
    const liveValue = telegramWebApp()?.initDataUnsafe?.user?.id;
    if (Number.isSafeInteger(Number(liveValue))) return Number(liveValue);

    try {
      const stored = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || "null");
      const storedValue = stored?.user?.id;
      return Number.isSafeInteger(Number(storedValue)) ? Number(storedValue) : null;
    } catch (_error) {
      return null;
    }
  }

  function isAdmin() {
    const id = currentTelegramId();
    return id !== null && ADMIN_IDS.includes(id);
  }

  function isAdminPage() {
    const path = location.pathname.toLowerCase();
    return path.endsWith("/admin.html") || path.endsWith("/setup-server.html");
  }

  function freshAdminUrl() {
    return `admin.html?v=${ADMIN_PAGE_VERSION}&refresh=${Date.now()}`;
  }

  function installAdminButton() {
    saveTelegramContext();
    if (isAdminPage() || !isAdmin() || document.getElementById("allPredictorAdminButton")) return;

    const style = document.createElement("style");
    style.id = "allPredictorAdminStyles";
    style.textContent = `
      #allPredictorAdminButton{position:fixed;z-index:2147482450;left:10px;bottom:calc(84px + env(safe-area-inset-bottom));width:auto!important;min-width:78px!important;height:45px!important;margin:0!important;padding:0 13px!important;border:1px solid rgba(250,204,21,.55)!important;border-radius:15px!important;background:linear-gradient(135deg,#facc15,#fb923c)!important;color:#211300!important;font:1000 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif!important;letter-spacing:.7px!important;box-shadow:0 12px 32px rgba(250,204,21,.22)!important}
      #allPredictorAdminButton:active{transform:scale(.96)}
      @media(max-width:520px){#allPredictorAdminButton{left:8px;bottom:calc(80px + env(safe-area-inset-bottom));height:42px!important;min-width:72px!important}}
    `;
    document.head.appendChild(style);

    const button = document.createElement("button");
    button.id = "allPredictorAdminButton";
    button.type = "button";
    button.textContent = "🔑 ADMIN";
    button.addEventListener("click", () => {
      saveTelegramContext();
      location.href = freshAdminUrl();
    });
    document.body.appendChild(button);
  }

  window.AllPredictorOwner = Object.freeze({
    adminTelegramIds: ADMIN_IDS.slice(),
    currentTelegramId,
    isAdmin,
    freshAdminUrl,
    saveTelegramContext
  });

  window.addEventListener("pagehide", saveTelegramContext);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installAdminButton, { once: true });
  else installAdminButton();
})();
