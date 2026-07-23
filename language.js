(() => {
  "use strict";

  const STORAGE_KEY = "allpredictor_language_v1";
  const SUPPORTED = ["ru", "en", "id"];

  const translations = {
    ru: {
      languageLabel: "Язык",
      title: "ПРОГНОЗЫ",
      open: "ОТКРЫТЬ",
      soon: "СКОРО",
      comingSoon: "СКОРО",
      games: "ИГРЫ",
      pro: "⚡ PRO",
      proSubtitle: "Два локальных LIVE-анализатора. Выберите игру — код откроется прямо внутри приложения.",
      lockedToast: "🔒 Эта игра пока в разработке",
      creator: "Создатель приложения:",
      trialCounter: used => `ТЕСТ: ${used}/10`,
      fullAccess: "✓ ПОЛНЫЙ ДОСТУП",
      trialTitle: "🔒 Тестовый режим завершён",
      trialText: "Вы исчерпали тестовый режим из 10 прогнозов. Введите пароль для полного доступа.",
      contactHtml: "Для покупки обращайтесь: <strong>@V0xFF3</strong>",
      passwordPlaceholder: "Введите пароль",
      unlock: "РАЗБЛОКИРОВАТЬ",
      contact: "НАПИСАТЬ @V0xFF3",
      note: "После правильного пароля окно больше не появится на этом устройстве.",
      wrongPassword: "Неверный пароль",
      accessGranted: "Доступ открыт!"
    },
    en: {
      languageLabel: "Language",
      title: "PREDICTORS",
      open: "OPEN",
      soon: "SOON",
      comingSoon: "COMING SOON",
      games: "GAMES",
      pro: "⚡ PRO",
      proSubtitle: "Two local LIVE analyzers. Select a game and it will open directly inside the app.",
      lockedToast: "🔒 This game is still in development",
      creator: "App creator:",
      trialCounter: used => `TRIAL: ${used}/10`,
      fullAccess: "✓ FULL ACCESS",
      trialTitle: "🔒 Trial mode has ended",
      trialText: "You have used all 10 trial predictions. Enter the password for full access.",
      contactHtml: "To purchase access, contact: <strong>@V0xFF3</strong>",
      passwordPlaceholder: "Enter password",
      unlock: "UNLOCK",
      contact: "CONTACT @V0xFF3",
      note: "After the correct password, this window will no longer appear on this device.",
      wrongPassword: "Incorrect password",
      accessGranted: "Access granted!"
    },
    id: {
      languageLabel: "Bahasa",
      title: "PREDIKSI",
      open: "BUKA",
      soon: "SEGERA",
      comingSoon: "AKAN HADIR",
      games: "GAME",
      pro: "⚡ PRO",
      proSubtitle: "Dua penganalisis LIVE lokal. Pilih game dan buka langsung di dalam aplikasi.",
      lockedToast: "🔒 Game ini masih dalam pengembangan",
      creator: "Pembuat aplikasi:",
      trialCounter: used => `UJI COBA: ${used}/10`,
      fullAccess: "✓ AKSES PENUH",
      trialTitle: "🔒 Mode uji coba telah berakhir",
      trialText: "Anda telah menggunakan semua 10 prediksi uji coba. Masukkan kata sandi untuk akses penuh.",
      contactHtml: "Untuk membeli akses, hubungi: <strong>@V0xFF3</strong>",
      passwordPlaceholder: "Masukkan kata sandi",
      unlock: "BUKA AKSES",
      contact: "HUBUNGI @V0xFF3",
      note: "Setelah kata sandi benar, jendela ini tidak akan muncul lagi di perangkat ini.",
      wrongPassword: "Kata sandi salah",
      accessGranted: "Akses diberikan!"
    }
  };

  function telegramLanguage() {
    try {
      const code = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || "").toLowerCase();
      if (code.startsWith("ru")) return "ru";
      if (code.startsWith("id")) return "id";
    } catch (_error) {}
    return "en";
  }

  function getLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (SUPPORTED.includes(saved)) return saved;
    } catch (_error) {}
    return telegramLanguage();
  }

  let currentLanguage = getLanguage();
  let applyQueued = false;

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function setHtml(element, value) {
    if (element && element.innerHTML !== value) element.innerHTML = value;
  }

  function addStyles() {
    if (document.getElementById("allPredictorLanguageStyles")) return;
    const style = document.createElement("style");
    style.id = "allPredictorLanguageStyles";
    style.textContent = `
      #allPredictorLanguageSelector{
        width:100%;display:flex;align-items:center;justify-content:center;gap:7px;
        margin:0 auto 14px;padding:5px;border:1px solid rgba(255,255,255,.14);
        border-radius:17px;background:rgba(14,11,26,.82);box-shadow:0 10px 28px rgba(0,0,0,.26);
        backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
      }
      #allPredictorLanguageSelector .language-caption{
        padding:0 5px;color:#a9a4b7;font-size:10px;font-weight:900;letter-spacing:.7px;text-transform:uppercase;
      }
      #allPredictorLanguageSelector button{
        width:auto!important;min-width:0!important;height:38px!important;margin:0!important;padding:0 10px!important;
        border:1px solid transparent!important;border-radius:12px!important;background:transparent!important;
        color:#bdb8ca!important;box-shadow:none!important;font-size:11px!important;font-weight:900!important;
        letter-spacing:.2px!important;white-space:nowrap!important;
      }
      #allPredictorLanguageSelector button.active{
        border-color:rgba(139,92,246,.7)!important;background:linear-gradient(135deg,#6d28d9,#8b5cf6)!important;
        color:#fff!important;box-shadow:0 5px 15px rgba(109,40,217,.35)!important;
      }
      #appCreatorCredit{
        margin:7px auto 14px!important;position:relative!important;z-index:2!important;
      }
      @media(max-width:390px){
        #allPredictorLanguageSelector{gap:4px}
        #allPredictorLanguageSelector .language-caption{display:none}
        #allPredictorLanguageSelector button{padding:0 8px!important;font-size:10px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function buildSelector() {
    const host = document.querySelector(".catalog-shell");
    if (!host || document.getElementById("allPredictorLanguageSelector")) return;

    const selector = document.createElement("div");
    selector.id = "allPredictorLanguageSelector";
    selector.setAttribute("role", "group");
    selector.setAttribute("aria-label", "Language selector");
    selector.innerHTML = `
      <span class="language-caption"></span>
      <button type="button" data-language="ru">🇷🇺 Рус</button>
      <button type="button" data-language="en">🇬🇧 EN</button>
      <button type="button" data-language="id">🇮🇩 Indonesia</button>
    `;

    selector.addEventListener("click", event => {
      const button = event.target.closest("button[data-language]");
      if (!button) return;
      setLanguage(button.dataset.language);
    });

    host.insertBefore(selector, host.firstChild);
  }

  function translateAccessUi(t) {
    const counter = document.getElementById("trialAccessCounter");
    if (counter) {
      const unlocked = counter.classList.contains("is-unlocked") || /FULL ACCESS|ПОЛНЫЙ ДОСТУП|AKSES PENUH/i.test(counter.textContent);
      const usedMatch = counter.textContent.match(/(\d+)\s*\/\s*10/);
      const used = usedMatch ? Number(usedMatch[1]) : Number(localStorage.getItem("allpredictor_trial_predictions_v1") || 0);
      setText(counter, unlocked ? t.fullAccess : t.trialCounter(Math.max(0, Math.min(10, used))));
    }

    setText(document.getElementById("trialAccessTitle"), t.trialTitle);
    const primary = document.querySelector("#trialAccessDialog .access-ru");
    const secondary = document.querySelector("#trialAccessDialog .access-en");
    setText(primary, t.trialText);
    if (secondary) secondary.style.display = "none";
    setHtml(document.querySelector("#trialAccessDialog .access-contact"), t.contactHtml);

    const input = document.getElementById("trialPasswordInput");
    if (input && input.placeholder !== t.passwordPlaceholder) input.placeholder = t.passwordPlaceholder;
    setText(document.getElementById("trialUnlockButton"), t.unlock);
    setText(document.getElementById("trialContactButton"), t.contact);

    const note = document.getElementById("trialAccessNote");
    setText(note, t.note);

    const error = document.getElementById("trialAccessError");
    if (error) {
      if (/Неверный пароль|Incorrect password|Kata sandi salah/i.test(error.textContent)) setText(error, t.wrongPassword);
      if (/Доступ открыт|Access granted|Akses diberikan/i.test(error.textContent)) setText(error, t.accessGranted);
    }
  }

  function applyLanguage() {
    applyQueued = false;
    addStyles();
    buildSelector();

    const t = translations[currentLanguage];
    document.documentElement.lang = currentLanguage === "id" ? "id" : currentLanguage;

    setText(document.querySelector("#allPredictorLanguageSelector .language-caption"), t.languageLabel);
    document.querySelectorAll("#allPredictorLanguageSelector button[data-language]").forEach(button => {
      button.classList.toggle("active", button.dataset.language === currentLanguage);
      button.setAttribute("aria-pressed", button.dataset.language === currentLanguage ? "true" : "false");
    });

    setText(document.querySelector(".catalog-title"), t.title);
    document.querySelectorAll(".lock-pill.open-pill").forEach(element => setText(element, t.open));
    document.querySelectorAll("[data-locked-game] .lock-pill").forEach(element => setText(element, `🔒 ${t.soon}`));
    document.querySelectorAll("[data-locked-game] .card-studio").forEach(element => setText(element, t.comingSoon));
    setText(document.querySelector('.app-tab[data-app-tab="games"]'), t.games);
    setText(document.querySelector('.app-tab[data-app-tab="pro"]'), t.pro);
    setText(document.querySelector(".pro-subtitle"), t.proSubtitle);
    setText(document.getElementById("catalogToast"), t.lockedToast);

    const creator = document.getElementById("appCreatorCredit");
    if (creator) {
      setText(creator.querySelector("span"), t.creator);
      const title = document.querySelector(".catalog-title");
      if (title && title.nextElementSibling !== creator) title.insertAdjacentElement("afterend", creator);
    }

    translateAccessUi(t);
  }

  function queueApply() {
    if (applyQueued) return;
    applyQueued = true;
    queueMicrotask(applyLanguage);
  }

  function setLanguage(language) {
    if (!SUPPORTED.includes(language)) return;
    currentLanguage = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch (_error) {}
    applyLanguage();
    window.dispatchEvent(new CustomEvent("allpredictor:languagechange", { detail: { language } }));
  }

  window.AllPredictorI18n = Object.freeze({
    getLanguage: () => currentLanguage,
    setLanguage,
    t: key => translations[currentLanguage]?.[key]
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyLanguage, { once: true });
  } else {
    applyLanguage();
  }

  window.addEventListener("load", applyLanguage, { once: true });

  const observer = new MutationObserver(queueApply);
  const startObserver = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();
})();
