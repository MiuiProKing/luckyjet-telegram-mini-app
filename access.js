(() => {
  "use strict";

  const config = window.ALLPREDICTOR_CONFIG || {};
  const TRIAL_LIMIT = Number(config.trialLimit) || 10;
  const ACCESS_PASSWORD = "Random";
  const CREATOR_URL = config.creatorUrl || "https://t.me/V0xFF3";
  const USED_KEY = "allpredictor_trial_predictions_v1";
  const UNLOCKED_KEY = "allpredictor_full_access_v1";
  const WRAPPED_KEY = "__allpredictorAccessWrapped";
  const webApp = window.Telegram && window.Telegram.WebApp;

  const fallback = {
    ru: {
      trial: "ТЕСТ", full: "✓ ПОЛНЫЙ ДОСТУП", title: "🔒 Тестовый режим завершён",
      body: "Вы исчерпали тестовый режим из 10 прогнозов. Введите пароль для полного доступа.",
      contact: "Для покупки обращайтесь:", placeholder: "Введите пароль", unlock: "РАЗБЛОКИРОВАТЬ",
      write: "НАПИСАТЬ", note: "После правильного пароля окно больше не появится на этом устройстве.",
      granted: "Доступ открыт!", wrong: "Неверный пароль", remaining: "Осталось прогнозов"
    },
    en: {
      trial: "TRIAL", full: "✓ FULL ACCESS", title: "🔒 Trial mode ended",
      body: "You have used all 10 trial predictions. Enter the password for full access.",
      contact: "To purchase access, contact:", placeholder: "Enter password", unlock: "UNLOCK",
      write: "CONTACT", note: "After the correct password, this window will no longer appear on this device.",
      granted: "Access granted!", wrong: "Incorrect password", remaining: "Predictions left"
    },
    id: {
      trial: "UJI COBA", full: "✓ AKSES PENUH", title: "🔒 Mode uji coba berakhir",
      body: "Anda telah menggunakan semua 10 prediksi uji coba. Masukkan kata sandi untuk akses penuh.",
      contact: "Untuk membeli akses, hubungi:", placeholder: "Masukkan kata sandi", unlock: "BUKA AKSES",
      write: "HUBUNGI", note: "Setelah kata sandi benar, jendela ini tidak akan muncul lagi di perangkat ini.",
      granted: "Akses diberikan!", wrong: "Kata sandi salah", remaining: "Prediksi tersisa"
    }
  };

  function language() {
    return window.AllPredictorI18n?.getLanguage?.() || (() => {
      try { return localStorage.getItem("allpredictor_language_v1") || "ru"; } catch (_error) { return "ru"; }
    })();
  }

  function tr(key) {
    return fallback[language()]?.[key] || fallback.en[key] || key;
  }

  function readNumber(key) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    } catch (_error) {
      return 0;
    }
  }

  function writeValue(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_error) {}
  }

  function isUnlocked() {
    const licenseActive = window.AllPredictorLicense?.getStatus?.().active;
    if (licenseActive) return true;
    try { return localStorage.getItem(UNLOCKED_KEY) === "1"; } catch (_error) { return false; }
  }

  function getUsed() {
    return Math.min(TRIAL_LIMIT, readNumber(USED_KEY));
  }

  function remaining() {
    return Math.max(0, TRIAL_LIMIT - getUsed());
  }

  function updateCounter() {
    const badge = document.getElementById("trialAccessCounter");
    if (!badge) return;
    if (isUnlocked()) {
      badge.textContent = tr("full");
      badge.classList.add("is-unlocked");
    } else {
      badge.classList.remove("is-unlocked");
      badge.textContent = `${tr("trial")}: ${getUsed()}/${TRIAL_LIMIT} · ${tr("remaining")}: ${remaining()}`;
    }
  }

  function openCreator() {
    try {
      if (webApp && typeof webApp.openTelegramLink === "function") {
        webApp.openTelegramLink(CREATOR_URL);
        return;
      }
      if (webApp && typeof webApp.openLink === "function") {
        webApp.openLink(CREATOR_URL);
        return;
      }
    } catch (_error) {}
    window.open(CREATOR_URL, "_blank", "noopener,noreferrer");
  }

  function addStyles() {
    if (document.getElementById("trialAccessStyles")) return;
    const style = document.createElement("style");
    style.id = "trialAccessStyles";
    style.textContent = `
      #trialAccessCounter{width:fit-content;max-width:calc(100% - 28px);margin:8px auto 2px;padding:7px 12px;border:1px solid rgba(250,204,21,.55);border-radius:999px;background:rgba(250,204,21,.1);color:#ffe27a;text-align:center;font:900 10px/1.25 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;letter-spacing:.6px;box-shadow:0 0 18px rgba(250,204,21,.12)}
      #trialAccessCounter.is-unlocked{border-color:rgba(16,185,129,.6);background:rgba(16,185,129,.12);color:#8fffc8;box-shadow:0 0 18px rgba(16,185,129,.15)}
      #trialAccessOverlay{position:fixed;z-index:2147483000;inset:0;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.84);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
      #trialAccessOverlay.is-open{display:flex}
      #trialAccessDialog{width:min(430px,100%);max-height:calc(100vh - 36px);overflow:auto;padding:22px;border:1px solid rgba(250,204,21,.5);border-radius:24px;background:linear-gradient(180deg,#191426,#0c0a13);color:#fff;box-shadow:0 24px 70px rgba(0,0,0,.7),0 0 35px rgba(250,204,21,.13);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
      #trialAccessDialog h2{margin:0 0 10px;font-size:22px;line-height:1.2;color:#ffe27a;text-align:center}
      #trialAccessBody{margin:0;text-align:center;line-height:1.5;font-size:14px;font-weight:800}
      #trialAccessDialog .access-contact{margin:14px 0;text-align:center;color:#ddd7eb;font-size:13px;line-height:1.4}
      #trialAccessDialog .access-contact strong{color:#7aa7ff}
      #trialPasswordInput{display:block;width:100%;height:50px;margin-top:8px;padding:0 14px;border:1px solid rgba(255,255,255,.2);border-radius:14px;background:#09070e;color:#fff;outline:none;font-size:17px;font-weight:800;text-align:center}
      #trialPasswordInput:focus{border-color:#facc15;box-shadow:0 0 0 3px rgba(250,204,21,.12)}
      #trialAccessError{min-height:20px;margin:8px 0 0;color:#ff8a8a;text-align:center;font-size:12px;font-weight:800}
      #trialAccessActions{display:grid;grid-template-columns:1fr;gap:9px;margin-top:10px}
      #trialAccessActions button{width:100%!important;height:48px!important;margin:0!important;border:0!important;border-radius:14px!important;font-size:13px!important;font-weight:1000!important;letter-spacing:.5px!important;cursor:pointer!important}
      #trialUnlockButton{background:linear-gradient(135deg,#fde047,#fb923c)!important;color:#231400!important}
      #trialContactButton{background:#262033!important;color:#fff!important;border:1px solid rgba(255,255,255,.15)!important}
      #trialAccessNote{margin-top:12px;color:#817b8e;text-align:center;font-size:10px;line-height:1.35}
    `;
    document.head.appendChild(style);
  }

  function refreshUiLanguage() {
    const title = document.getElementById("trialAccessTitle");
    const body = document.getElementById("trialAccessBody");
    const contact = document.querySelector("#trialAccessDialog .access-contact");
    const input = document.getElementById("trialPasswordInput");
    const unlock = document.getElementById("trialUnlockButton");
    const contactButton = document.getElementById("trialContactButton");
    const note = document.getElementById("trialAccessNote");
    if (title) title.textContent = tr("title");
    if (body) body.textContent = tr("body");
    if (contact) contact.innerHTML = `${tr("contact")} <strong>@V0xFF3</strong>`;
    if (input) input.placeholder = tr("placeholder");
    if (unlock) unlock.textContent = tr("unlock");
    if (contactButton) contactButton.textContent = `${tr("write")} @V0xFF3`;
    if (note) note.textContent = tr("note");
    updateCounter();
  }

  function buildUi() {
    addStyles();
    if (!document.getElementById("trialAccessCounter")) {
      const firstSignalButton = document.querySelector("#generateButton,#signalButton,#grandButton,#trainedButton,[data-generate-signal],.signal-btn");
      if (firstSignalButton?.parentElement) {
        const badge = document.createElement("div");
        badge.id = "trialAccessCounter";
        firstSignalButton.parentElement.insertBefore(badge, firstSignalButton);
      }
    }

    if (!document.getElementById("trialAccessOverlay")) {
      const overlay = document.createElement("div");
      overlay.id = "trialAccessOverlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.innerHTML = `
        <div id="trialAccessDialog">
          <h2 id="trialAccessTitle"></h2>
          <p id="trialAccessBody"></p>
          <p class="access-contact"></p>
          <input id="trialPasswordInput" type="password" inputmode="text" autocomplete="off">
          <div id="trialAccessError" aria-live="polite"></div>
          <div id="trialAccessActions">
            <button id="trialUnlockButton" type="button"></button>
            <button id="trialContactButton" type="button"></button>
          </div>
          <div id="trialAccessNote"></div>
        </div>`;
      document.body.appendChild(overlay);

      const input = overlay.querySelector("#trialPasswordInput");
      const error = overlay.querySelector("#trialAccessError");
      const unlock = overlay.querySelector("#trialUnlockButton");
      const contact = overlay.querySelector("#trialContactButton");

      function submitPassword() {
        const entered = String(input.value || "").trim();
        if (entered.toLowerCase() === ACCESS_PASSWORD.toLowerCase()) {
          writeValue(UNLOCKED_KEY, "1");
          error.style.color = "#8fffc8";
          error.textContent = tr("granted");
          updateCounter();
          const autoButton = document.getElementById("autoButton");
          if (autoButton) autoButton.disabled = false;
          window.dispatchEvent(new CustomEvent("allpredictor:accesschange", { detail: { unlocked: true } }));
          setTimeout(() => {
            overlay.classList.remove("is-open");
            input.value = "";
            error.textContent = "";
          }, 500);
          return;
        }
        error.style.color = "#ff8a8a";
        error.textContent = tr("wrong");
        input.select();
      }

      unlock.addEventListener("click", submitPassword);
      contact.addEventListener("click", openCreator);
      input.addEventListener("keydown", event => { if (event.key === "Enter") submitPassword(); });
    }

    refreshUiLanguage();
  }

  function showGate() {
    buildUi();
    const overlay = document.getElementById("trialAccessOverlay");
    const input = document.getElementById("trialPasswordInput");
    if (overlay) overlay.classList.add("is-open");
    if (input) setTimeout(() => input.focus(), 50);
    const autoButton = document.getElementById("autoButton");
    if (autoButton) {
      autoButton.classList.remove("on");
      autoButton.textContent = "AUTO";
      autoButton.disabled = true;
    }
  }

  function allowPrediction() {
    if (isUnlocked()) return true;
    const used = getUsed();
    if (used >= TRIAL_LIMIT) {
      showGate();
      return false;
    }
    writeValue(USED_KEY, used + 1);
    updateCounter();
    window.dispatchEvent(new CustomEvent("allpredictor:trialchange", { detail: { used: used + 1, remaining: TRIAL_LIMIT - used - 1 } }));
    return true;
  }

  function wrapFunction(name) {
    const original = window[name];
    if (typeof original !== "function" || original[WRAPPED_KEY]) return false;
    function wrappedPredictionFunction(...args) {
      if (!allowPrediction()) return false;
      return original.apply(this, args);
    }
    wrappedPredictionFunction[WRAPPED_KEY] = true;
    wrappedPredictionFunction.__original = original;
    window[name] = wrappedPredictionFunction;
    return true;
  }

  function installGate() {
    buildUi();
    const wrapped = ["startSignal", "startPrediction", "generatePrediction", "showPrediction", "createSignal"].some(wrapFunction);
    if (!wrapped && !document.documentElement.dataset.accessClickFallback) {
      document.documentElement.dataset.accessClickFallback = "1";
      document.addEventListener("click", event => {
        const button = event.target?.closest?.("#generateButton,#signalButton,#grandButton,#trainedButton,[data-generate-signal],.signal-btn");
        if (!button) return;
        if (!allowPrediction()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    }
  }

  window.AllPredictorAccess = Object.freeze({
    isUnlocked,
    getUsed,
    remaining,
    showGate,
    updateCounter
  });

  window.addEventListener("allpredictor:languagechange", refreshUiLanguage);
  window.addEventListener("allpredictor:licensechange", updateCounter);
  window.addEventListener("allpredictor:accesschange", updateCounter);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installGate, { once: true });
  else installGate();

  window.addEventListener("load", () => {
    installGate();
    setTimeout(installGate, 250);
  }, { once: true });
})();
