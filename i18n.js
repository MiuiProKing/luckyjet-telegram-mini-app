(() => {
  "use strict";

  const STORAGE_KEY = "allpredictor_language_v1";
  const SUPPORTED = ["ru", "en", "id"];
  const LABELS = {
    ru: { flag: "🇷🇺", short: "RU", name: "Русский" },
    en: { flag: "🇬🇧", short: "EN", name: "English" },
    id: { flag: "🇮🇩", short: "ID", name: "Indonesia" }
  };

  const messages = {
    language: {
      ru: "Язык",
      en: "Language",
      id: "Bahasa"
    },
    games: { ru: "ИГРЫ", en: "GAMES", id: "PERMAINAN" },
    open: { ru: "ОТКРЫТЬ", en: "OPEN", id: "BUKA" },
    soon: { ru: "СКОРО", en: "SOON", id: "SEGERA" },
    comingSoon: { ru: "СКОРО БУДЕТ", en: "COMING SOON", id: "SEGERA HADIR" },
    predictors: { ru: "ПРОГНОЗАТОРЫ", en: "PREDICTORS", id: "PREDIKTOR" },
    premiumLive: { ru: "ПРЕМИУМ LIVE", en: "PREMIUM LIVE", id: "PREMIUM LIVE" },
    proSubtitle: {
      ru: "Два локальных LIVE-анализатора. Выберите игру — код откроется прямо внутри приложения.",
      en: "Two local LIVE analyzers. Choose a game and it will open inside the app.",
      id: "Dua analis LIVE lokal. Pilih permainan dan buka langsung di aplikasi."
    },
    creator: { ru: "Создатель приложения:", en: "App creator:", id: "Pembuat aplikasi:" },
    settings: { ru: "Настройки", en: "Settings", id: "Pengaturan" },
    history: { ru: "История", en: "History", id: "Riwayat" },
    time: { ru: "Время", en: "Time", id: "Waktu" },
    round: { ru: "Раунд", en: "Round", id: "Putaran" },
    lastCoef: { ru: "Последний коэф.", en: "Last coef", id: "Koef. terakhir" },
    wins: { ru: "Победы ✅", en: "Wins ✅", id: "Menang ✅" },
    losses: { ru: "Проигрыши ❌", en: "Losses ❌", id: "Kalah ❌" },
    total: { ru: "Всего", en: "Total", id: "Total" },
    signal: { ru: "ПРОГНОЗ", en: "SIGNAL", id: "PREDIKSI" },
    auto: { ru: "АВТО", en: "AUTO", id: "OTOMATIS" },
    analysis: { ru: "АНАЛИЗ", en: "ANALYSIS", id: "ANALISIS" },
    collecting: { ru: "Сбор данных.", en: "Collecting data.", id: "Mengumpulkan data." },
    exportCsv: { ru: "ЭКСПОРТ CSV", en: "EXPORT CSV", id: "EKSPOR CSV" },
    all: { ru: "ВСЕ", en: "ALL", id: "SEMUA" },
    win: { ru: "ПОБЕДА", en: "WIN", id: "MENANG" },
    loss: { ru: "ПРОИГРЫШ", en: "LOSS", id: "KALAH" },
    noPredictions: { ru: "Прогнозов пока нет.", en: "No predictions yet.", id: "Belum ada prediksi." },
    lockedGame: { ru: "🔒 Эта игра пока в разработке", en: "🔒 This game is still in development", id: "🔒 Permainan ini masih dalam pengembangan" },
    trial: { ru: "ТЕСТ", en: "TRIAL", id: "UJI COBA" },
    fullAccess: { ru: "✓ ПОЛНЫЙ ДОСТУП", en: "✓ FULL ACCESS", id: "✓ AKSES PENUH" },
    trialEndedTitle: { ru: "🔒 Тестовый режим завершён", en: "🔒 Trial mode ended", id: "🔒 Mode uji coba berakhir" },
    trialEndedBody: {
      ru: "Вы исчерпали тестовый режим из 10 прогнозов. Введите пароль для полного доступа.",
      en: "You have used all 10 trial predictions. Enter the password for full access.",
      id: "Anda telah menggunakan semua 10 prediksi uji coba. Masukkan kata sandi untuk akses penuh."
    },
    purchaseContact: {
      ru: "Для покупки обращайтесь:",
      en: "To purchase access, contact:",
      id: "Untuk membeli akses, hubungi:"
    },
    enterPassword: { ru: "Введите пароль", en: "Enter password", id: "Masukkan kata sandi" },
    unlock: { ru: "РАЗБЛОКИРОВАТЬ", en: "UNLOCK", id: "BUKA AKSES" },
    contact: { ru: "НАПИСАТЬ", en: "CONTACT", id: "HUBUNGI" },
    wrongPassword: { ru: "Неверный пароль", en: "Incorrect password", id: "Kata sandi salah" },
    accessGranted: { ru: "Доступ открыт!", en: "Access granted!", id: "Akses diberikan!" },
    accessSaved: {
      ru: "После правильного пароля окно больше не появится на этом устройстве.",
      en: "After the correct password, this window will no longer appear on this device.",
      id: "Setelah kata sandi benar, jendela ini tidak akan muncul lagi di perangkat ini."
    },
    profile: { ru: "Профиль", en: "Profile", id: "Profil" },
    plans: { ru: "Тарифы", en: "Plans", id: "Paket" },
    news: { ru: "Новости", en: "News", id: "Berita" },
    faq: { ru: "Вопросы", en: "FAQ", id: "FAQ" },
    support: { ru: "Поддержка", en: "Support", id: "Dukungan" },
    referral: { ru: "Реферальная ссылка", en: "Referral link", id: "Tautan referal" },
    copy: { ru: "КОПИРОВАТЬ", en: "COPY", id: "SALIN" },
    copied: { ru: "Скопировано", en: "Copied", id: "Disalin" },
    close: { ru: "ЗАКРЫТЬ", en: "CLOSE", id: "TUTUP" },
    buy: { ru: "КУПИТЬ ДОСТУП", en: "BUY ACCESS", id: "BELI AKSES" },
    status: { ru: "Статус", en: "Status", id: "Status" },
    user: { ru: "Пользователь", en: "User", id: "Pengguna" },
    telegramId: { ru: "Telegram ID", en: "Telegram ID", id: "ID Telegram" },
    predictionsLeft: { ru: "Осталось прогнозов", en: "Predictions left", id: "Prediksi tersisa" },
    version: { ru: "Версия", en: "Version", id: "Versi" },
    server: { ru: "Сервер", en: "Server", id: "Server" },
    connected: { ru: "Подключён", en: "Connected", id: "Terhubung" },
    notConnected: { ru: "Не подключён", en: "Not connected", id: "Belum terhubung" },
    responsible: {
      ru: "Приложение предоставляет статистический анализ и не гарантирует выигрыш. Играйте ответственно.",
      en: "The app provides statistical analysis and does not guarantee winnings. Play responsibly.",
      id: "Aplikasi menyediakan analisis statistik dan tidak menjamin kemenangan. Bermainlah secara bertanggung jawab."
    }
  };

  const exactGroups = [
    ["GAMES", "ИГРЫ", "PERMAINAN", "games"],
    ["OPEN", "ОТКРЫТЬ", "BUKA", "open"],
    ["🔒 SOON", "🔒 СКОРО", "🔒 SEGERA", "soon", "lock"],
    ["COMING SOON", "СКОРО БУДЕТ", "SEGERA HADIR", "comingSoon"],
    ["PREDICTORS", "ПРОГНОЗАТОРЫ", "PREDIKTOR", "predictors"],
    ["PREMIUM LIVE", "ПРЕМИУМ LIVE", "premiumLive"],
    ["Time", "Время", "Waktu", "time"],
    ["Round", "Раунд", "Putaran", "round"],
    ["Last coef", "Последний коэф.", "Koef. terakhir", "lastCoef"],
    ["wins ✅", "Wins ✅", "Победы ✅", "Menang ✅", "wins"],
    ["losses ❌", "Losses ❌", "Проигрыши ❌", "Kalah ❌", "losses"],
    ["Total", "Всего", "total"],
    ["SIGNAL", "ПРОГНОЗ", "PREDIKSI", "signal"],
    ["AUTO", "АВТО", "OTOMATIS", "auto"],
    ["ANALYSIS", "АНАЛИЗ", "ANALISIS", "analysis"],
    ["Collecting data.", "Сбор данных.", "Mengumpulkan data.", "collecting"],
    ["EXPORT CSV", "ЭКСПОРТ CSV", "EKSPOR CSV", "exportCsv"],
    ["ALL", "ВСЕ", "SEMUA", "all"],
    ["WIN", "ПОБЕДА", "MENANG", "win"],
    ["LOSS", "ПРОИГРЫШ", "KALAH", "loss"],
    ["No predictions yet.", "Прогнозов пока нет.", "Belum ada prediksi.", "noPredictions"],
    ["🔒 Эта игра пока в разработке", "🔒 This game is still in development", "🔒 Permainan ini masih dalam pengembangan", "lockedGame"],
    ["Создатель приложения:", "App creator:", "Pembuat aplikasi:", "creator"]
  ];

  const reverse = new Map();
  exactGroups.forEach(group => {
    const key = group[group.length - 1] === "lock" ? group[group.length - 2] : group[group.length - 1];
    group.slice(0, group[group.length - 1] === "lock" ? -2 : -1).forEach(value => reverse.set(value, key));
  });

  function normalizeLanguage(value) {
    const code = String(value || "").toLowerCase().split("-")[0];
    return SUPPORTED.includes(code) ? code : "ru";
  }

  function getLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return normalizeLanguage(saved);
    } catch (_error) {}

    const telegramCode = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    if (telegramCode) return normalizeLanguage(telegramCode);
    return normalizeLanguage(navigator.language || "ru");
  }

  let currentLanguage = getLanguage();

  function t(key, language = currentLanguage) {
    const row = messages[key];
    if (!row) return key;
    return row[language] || row.en || row.ru || key;
  }

  function setText(selector, key) {
    const element = document.querySelector(selector);
    if (element) element.textContent = t(key);
  }

  function translateKnownInterface() {
    document.documentElement.lang = currentLanguage === "id" ? "id" : currentLanguage;

    document.querySelectorAll(".app-tab[data-app-tab='games']").forEach(el => { el.textContent = t("games"); });
    document.querySelectorAll(".app-tab[data-app-tab='pro']").forEach(el => { el.textContent = "⚡ PRO"; });
    document.querySelectorAll(".open-pill").forEach(el => { el.textContent = t("open"); });
    document.querySelectorAll("[data-locked-game] .lock-pill").forEach(el => { el.textContent = `🔒 ${t("soon")}`; });
    document.querySelectorAll("[data-locked-game] .card-studio").forEach(el => { el.textContent = t("comingSoon"); });

    setText(".catalog-title", "predictors");
    setText(".pro-kicker", "premiumLive");
    setText(".pro-subtitle", "proSubtitle");
    setText("#catalogToast", "lockedGame");

    const creator = document.querySelector("#appCreatorCredit span");
    if (creator) creator.textContent = t("creator");

    setText("#trialAccessTitle", "trialEndedTitle");
    const ru = document.querySelector("#trialAccessDialog .access-ru");
    const en = document.querySelector("#trialAccessDialog .access-en");
    if (ru) ru.textContent = t("trialEndedBody");
    if (en) en.textContent = t("accessSaved");

    const contact = document.querySelector("#trialAccessDialog .access-contact");
    if (contact) contact.innerHTML = `${t("purchaseContact")} <strong>@V0xFF3</strong>`;

    const password = document.getElementById("trialPasswordInput");
    if (password) password.placeholder = t("enterPassword");
    const unlock = document.getElementById("trialUnlockButton");
    if (unlock) unlock.textContent = t("unlock");
    const contactButton = document.getElementById("trialContactButton");
    if (contactButton) contactButton.textContent = `${t("contact")} @V0xFF3`;
    const note = document.getElementById("trialAccessNote");
    if (note) note.textContent = t("accessSaved");

    document.querySelectorAll("[data-i18n]").forEach(element => {
      element.textContent = t(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
      element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
    });

    updateTrialCounter();
    updateSwitcher();
  }

  function translateTextNodes(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const tag = node.parentElement?.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const raw = node.nodeValue.trim();
      const key = reverse.get(raw);
      if (!key) return;
      const prefix = node.nodeValue.match(/^\s*/)?.[0] || "";
      const suffix = node.nodeValue.match(/\s*$/)?.[0] || "";
      node.nodeValue = prefix + t(key) + suffix;
    });
  }

  function updateTrialCounter() {
    const badge = document.getElementById("trialAccessCounter");
    if (!badge) return;
    let unlocked = false;
    let used = 0;
    try {
      unlocked = localStorage.getItem("allpredictor_full_access_v1") === "1";
      used = Math.max(0, Math.min(10, Number(localStorage.getItem("allpredictor_trial_predictions_v1")) || 0));
    } catch (_error) {}
    badge.textContent = unlocked ? t("fullAccess") : `${t("trial")}: ${used}/10`;
  }

  function createSwitcher() {
    if (document.getElementById("globalLanguageSwitcher")) return;

    const style = document.createElement("style");
    style.id = "globalLanguageStyles";
    style.textContent = `
      #globalLanguageSwitcher{position:fixed;z-index:2147482500;top:calc(10px + env(safe-area-inset-top));right:11px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
      #globalLanguageButton{width:auto!important;min-width:64px!important;height:38px!important;padding:0 10px!important;margin:0!important;border:1px solid rgba(255,255,255,.2)!important;border-radius:999px!important;background:rgba(10,8,17,.9)!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;font-size:12px!important;font-weight:900!important;letter-spacing:.4px!important;box-shadow:0 8px 24px rgba(0,0,0,.35)!important;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
      #globalLanguageMenu{position:absolute;top:44px;right:0;width:162px;padding:7px;border:1px solid rgba(255,255,255,.16);border-radius:16px;background:rgba(13,10,22,.97);box-shadow:0 16px 42px rgba(0,0,0,.55);display:none}
      #globalLanguageMenu.open{display:grid;gap:5px}
      #globalLanguageMenu button{width:100%!important;height:42px!important;margin:0!important;padding:0 12px!important;border:0!important;border-radius:11px!important;background:transparent!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:9px!important;font-size:13px!important;font-weight:800!important;box-shadow:none!important}
      #globalLanguageMenu button.active{background:linear-gradient(135deg,rgba(109,40,217,.65),rgba(139,92,246,.5))!important}
      #globalLanguageMenu button:active{transform:scale(.98)}
      @media(max-width:520px){#globalLanguageSwitcher{top:calc(7px + env(safe-area-inset-top));right:7px}#globalLanguageButton{height:35px!important;min-width:58px!important}}
    `;
    document.head.appendChild(style);

    const host = document.createElement("div");
    host.id = "globalLanguageSwitcher";
    host.innerHTML = `
      <button id="globalLanguageButton" type="button" aria-label="Language"></button>
      <div id="globalLanguageMenu" role="menu">
        ${SUPPORTED.map(code => `<button type="button" data-language="${code}" role="menuitem"><span>${LABELS[code].flag}</span><span>${LABELS[code].name}</span></button>`).join("")}
      </div>
    `;
    document.body.appendChild(host);

    const button = host.querySelector("#globalLanguageButton");
    const menu = host.querySelector("#globalLanguageMenu");
    button.addEventListener("click", event => {
      event.stopPropagation();
      menu.classList.toggle("open");
    });
    host.querySelectorAll("[data-language]").forEach(item => {
      item.addEventListener("click", () => {
        setLanguage(item.dataset.language);
        menu.classList.remove("open");
      });
    });
    document.addEventListener("click", event => {
      if (!host.contains(event.target)) menu.classList.remove("open");
    });
    updateSwitcher();
  }

  function updateSwitcher() {
    const button = document.getElementById("globalLanguageButton");
    if (button) button.innerHTML = `<span>${LABELS[currentLanguage].flag}</span><span>${LABELS[currentLanguage].short}</span><span>▾</span>`;
    document.querySelectorAll("#globalLanguageMenu [data-language]").forEach(item => {
      item.classList.toggle("active", item.dataset.language === currentLanguage);
    });
  }

  function translatePage() {
    translateKnownInterface();
    translateTextNodes();
  }

  function setLanguage(language) {
    currentLanguage = normalizeLanguage(language);
    try { localStorage.setItem(STORAGE_KEY, currentLanguage); } catch (_error) {}
    translatePage();
    window.dispatchEvent(new CustomEvent("allpredictor:languagechange", { detail: { language: currentLanguage } }));
  }

  function boot() {
    createSwitcher();
    translatePage();

    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        translatePage();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.AllPredictorI18n = Object.freeze({
    getLanguage: () => currentLanguage,
    setLanguage,
    t,
    translatePage,
    supported: SUPPORTED.slice()
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
