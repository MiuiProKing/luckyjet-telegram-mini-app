(() => {
  "use strict";

  const config = window.ALLPREDICTOR_CONFIG || {};
  const LICENSE_KEY = "allpredictor_license_v1";
  const UNLOCK_KEY = "allpredictor_full_access_v1";
  const DEVICE_KEY = "allpredictor_device_id_v1";

  function endpoint(name) {
    const base = String(config.supabaseUrl || "").replace(/\/$/, "");
    return base ? `${base}/functions/v1/${name}` : "";
  }

  function deviceId() {
    try {
      let value = localStorage.getItem(DEVICE_KEY);
      if (!value) {
        value = typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(byte => byte.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(DEVICE_KEY, value);
      }
      return value;
    } catch (_error) {
      return "device-unavailable";
    }
  }

  function telegramPayload() {
    const webApp = window.Telegram && window.Telegram.WebApp;
    return {
      initData: webApp?.initData || "",
      user: webApp?.initDataUnsafe?.user || null,
      deviceId: deviceId(),
      platform: webApp?.platform || navigator.platform || "unknown"
    };
  }

  function getStoredLicense() {
    try {
      const raw = localStorage.getItem(LICENSE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function storeLicense(license) {
    try {
      localStorage.setItem(LICENSE_KEY, JSON.stringify(license));
      localStorage.setItem(UNLOCK_KEY, "1");
    } catch (_error) {}
    window.dispatchEvent(new CustomEvent("allpredictor:licensechange", { detail: license }));
  }

  function clearLicense() {
    try {
      localStorage.removeItem(LICENSE_KEY);
      localStorage.removeItem(UNLOCK_KEY);
    } catch (_error) {}
    window.dispatchEvent(new CustomEvent("allpredictor:licensechange", { detail: null }));
  }

  async function request(functionName, body) {
    const url = endpoint(functionName);
    if (!url || !config.supabaseAnonKey) throw new Error("LICENSE_SERVER_NOT_CONFIGURED");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseAnonKey
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    let data = null;
    try { data = await response.json(); } catch (_error) {}
    if (!response.ok || !data?.ok) throw new Error(data?.message || `LICENSE_SERVER_${response.status}`);
    return data;
  }

  async function activate(key) {
    const cleanKey = String(key || "").trim().toUpperCase();
    if (!cleanKey) throw new Error("EMPTY_LICENSE_KEY");
    const data = await request("activate-license", { key: cleanKey, ...telegramPayload() });
    storeLicense(data.license);
    return data;
  }

  async function refresh() {
    const license = getStoredLicense();
    if (!license?.activationToken) return { ok: false, license: null };
    try {
      const data = await request("check-license", {
        activationToken: license.activationToken,
        ...telegramPayload()
      });
      storeLicense(data.license);
      return data;
    } catch (error) {
      if (["LICENSE_REVOKED", "LICENSE_EXPIRED", "LICENSE_NOT_FOUND", "LICENSE_DEVICE_MISMATCH"].includes(error.message)) clearLicense();
      throw error;
    }
  }

  function getStatus() {
    const license = getStoredLicense();
    if (!license) return { active: false, plan: "trial", expiresAt: null };
    const expiresAt = license.expiresAt ? new Date(license.expiresAt) : null;
    const active = !expiresAt || expiresAt.getTime() > Date.now();
    return {
      active,
      plan: license.plan || "pro",
      expiresAt: expiresAt?.toISOString() || null,
      deviceId: deviceId(),
      license
    };
  }

  window.AllPredictorLicense = Object.freeze({
    activate,
    refresh,
    getStatus,
    getStoredLicense,
    clearLicense,
    deviceId,
    configured: Boolean(config.supabaseUrl && config.supabaseAnonKey)
  });

  if (config.supabaseUrl && config.supabaseAnonKey && getStoredLicense()?.activationToken) {
    setTimeout(() => refresh().catch(() => {}), 1000);
  }
})();
