(() => {
  "use strict";

  const STORAGE_KEY = "allpredictor_language_v1";
  const languages = {
    ru: { flag: "🇷🇺", short: "RU", name: "Русский" },
    en: { flag: "🇬🇧", short: "EN", name: "English" },
    id: { flag: "🇮🇩", short: "ID", name: "Indonesia" }
  };

  const dictionary = {
    games:{ru:"ИГРЫ",en:"GAMES",id:"PERMAINAN"},
    open:{ru:"ОТКРЫТЬ",en:"OPEN",id:"BUKA"},
    soon:{ru:"СКОРО",en:"SOON",id:"SEGERA"},
    comingSoon:{ru:"СКОРО БУДЕТ",en:"COMING SOON",id:"SEGERA HADIR"},
    predictors:{ru:"ПРОГНОЗАТОРЫ",en:"PREDICTORS",id:"PREDIKTOR"},
    premiumLive:{ru:"ПРЕМИУМ LIVE",en:"PREMIUM LIVE",id:"PREMIUM LIVE"},
    proSubtitle:{ru:"Два локальных LIVE-анализатора. Выберите игру — код откроется прямо внутри приложения.",en:"Two local LIVE analyzers. Choose a game and it will open inside the app.",id:"Dua analis LIVE lokal. Pilih permainan dan buka langsung di aplikasi."},
    creator:{ru:"Создатель приложения:",en:"App creator:",id:"Pembuat aplikasi:"},
    settings:{ru:"Настройки",en:"Settings",id:"Pengaturan"},
    history:{ru:"История",en:"History",id:"Riwayat"},
    time:{ru:"Время",en:"Time",id:"Waktu"},
    round:{ru:"Раунд",en:"Round",id:"Putaran"},
    lastCoef:{ru:"Последний коэф.",en:"Last coef",id:"Koef. terakhir"},
    wins:{ru:"Победы ✅",en:"Wins ✅",id:"Menang ✅"},
    losses:{ru:"Проигрыши ❌",en:"Losses ❌",id:"Kalah ❌"},
    total:{ru:"Всего",en:"Total",id:"Total"},
    signal:{ru:"ПРОГНОЗ",en:"SIGNAL",id:"PREDIKSI"},
    auto:{ru:"АВТО",en:"AUTO",id:"OTOMATIS"},
    analysis:{ru:"АНАЛИЗ",en:"ANALYSIS",id:"ANALISIS"},
    collecting:{ru:"Сбор данных.",en:"Collecting data.",id:"Mengumpulkan data."},
    exportCsv:{ru:"ЭКСПОРТ CSV",en:"EXPORT CSV",id:"EKSPOR CSV"},
    all:{ru:"ВСЕ",en:"ALL",id:"SEMUA"},
    win:{ru:"ПОБЕДА",en:"WIN",id:"MENANG"},
    loss:{ru:"ПРОИГРЫШ",en:"LOSS",id:"KALAH"},
    lockedGame:{ru:"🔒 Эта игра пока в разработке",en:"🔒 This game is still in development",id:"🔒 Permainan ini masih dalam pengembangan"},
    profile:{ru:"Профиль",en:"Profile",id:"Profil"},
    plans:{ru:"Тарифы",en:"Plans",id:"Paket"},
    news:{ru:"Новости",en:"News",id:"Berita"},
    faq:{ru:"Вопросы",en:"FAQ",id:"FAQ"},
    support:{ru:"Поддержка",en:"Support",id:"Dukungan"},
    trial:{ru:"ТЕСТ",en:"TRIAL",id:"UJI COBA"},
    fullAccess:{ru:"✓ ПОЛНЫЙ ДОСТУП",en:"✓ FULL ACCESS",id:"✓ AKSES PENUH"},
    trialEndedTitle:{ru:"🔒 Тестовый режим завершён",en:"🔒 Trial mode ended",id:"🔒 Mode uji coba berakhir"},
    trialEndedBody:{ru:"Вы исчерпали тестовый режим из 10 прогнозов. Введите пароль для полного доступа.",en:"You have used all 10 trial predictions. Enter the password for full access.",id:"Anda telah menggunakan semua 10 prediksi uji coba. Masukkan kata sandi untuk akses penuh."},
    purchaseContact:{ru:"Для покупки обращайтесь:",en:"To purchase access, contact:",id:"Untuk membeli akses, hubungi:"},
    enterPassword:{ru:"Введите пароль",en:"Enter password",id:"Masukkan kata sandi"},
    unlock:{ru:"РАЗБЛОКИРОВАТЬ",en:"UNLOCK",id:"BUKA AKSES"},
    contact:{ru:"НАПИСАТЬ",en:"CONTACT",id:"HUBUNGI"},
    accessSaved:{ru:"После правильного пароля окно больше не появится на этом устройстве.",en:"After the correct password, this window will no longer appear on this device.",id:"Setelah kata sandi benar, jendela ini tidak akan muncul lagi di perangkat ini."},
    copy:{ru:"КОПИРОВАТЬ",en:"COPY",id:"SALIN"},
    close:{ru:"ЗАКРЫТЬ",en:"CLOSE",id:"TUTUP"},
    buy:{ru:"КУПИТЬ ДОСТУП",en:"BUY ACCESS",id:"BELI AKSES"}
  };

  const exact = new Map();
  Object.entries(dictionary).forEach(([key, row]) => {
    Object.values(row).forEach(value => exact.set(value, key));
  });
  [
    ["wins ✅","wins"],["losses ❌","losses"],["Last coef","lastCoef"],
    ["Создатель приложения:","creator"],["App creator:","creator"],["Pembuat aplikasi:","creator"]
  ].forEach(([value,key])=>exact.set(value,key));

  function normalize(value) {
    const code = String(value || "").toLowerCase().split("-")[0];
    return Object.hasOwn(languages, code) ? code : "ru";
  }

  function initialLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return normalize(stored);
    } catch (_error) {}
    const telegramLanguage = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    return normalize(telegramLanguage || navigator.language || "ru");
  }

  let current = initialLanguage();
  let applying = false;
  let queued = false;

  function t(key, language = current) {
    const row = dictionary[key];
    return row?.[language] || row?.en || row?.ru || key;
  }

  function writeText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function writeHtml(element, value) {
    if (element && element.innerHTML !== value) element.innerHTML = value;
  }

  function setText(selector, key) {
    document.querySelectorAll(selector).forEach(element => writeText(element, t(key)));
  }

  function updateStaticInterface() {
    document.documentElement.lang = current;
    setText(".app-tab[data-app-tab='games']", "games");
    document.querySelectorAll(".app-tab[data-app-tab='pro']").forEach(element => writeText(element, "⚡ PRO"));
    setText(".open-pill", "open");
    document.querySelectorAll("[data-locked-game] .lock-pill").forEach(element => writeText(element, `🔒 ${t("soon")}`));
    setText("[data-locked-game] .card-studio", "comingSoon");
    setText(".catalog-title", "predictors");
    setText(".pro-kicker", "premiumLive");
    setText(".pro-subtitle", "proSubtitle");
    setText("#catalogToast", "lockedGame");
    setText("#appCreatorCredit span", "creator");

    const title = document.getElementById("trialAccessTitle");
    const body = document.getElementById("trialAccessBody");
    const contact = document.querySelector("#trialAccessDialog .access-contact");
    const input = document.getElementById("trialPasswordInput");
    const unlock = document.getElementById("trialUnlockButton");
    const contactButton = document.getElementById("trialContactButton");
    const note = document.getElementById("trialAccessNote");
    writeText(title, t("trialEndedTitle"));
    writeText(body, t("trialEndedBody"));
    writeHtml(contact, `${t("purchaseContact")} <strong>@V0xFF3</strong>`);
    if (input && input.placeholder !== t("enterPassword")) input.placeholder = t("enterPassword");
    writeText(unlock, t("unlock"));
    writeText(contactButton, `${t("contact")} @V0xFF3`);
    writeText(note, t("accessSaved"));

    document.querySelectorAll("[data-i18n]").forEach(element => writeText(element, t(element.dataset.i18n)));
    document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
      const value = t(element.dataset.i18nPlaceholder);
      if (element.getAttribute("placeholder") !== value) element.setAttribute("placeholder", value);
    });
  }

  function updateExactText(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const value = node.nodeValue?.trim();
        if (!value || !exact.has(value)) return NodeFilter.FILTER_REJECT;
        const tag = node.parentElement?.tagName;
        return tag === "SCRIPT" || tag === "STYLE" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const raw = node.nodeValue.trim();
      const translated = t(exact.get(raw));
      if (raw === translated) return;
      const prefix = node.nodeValue.match(/^\s*/)?.[0] || "";
      const suffix = node.nodeValue.match(/\s*$/)?.[0] || "";
      node.nodeValue = prefix + translated + suffix;
    });
  }

  function updateTrialCounter() {
    const badge = document.getElementById("trialAccessCounter");
    if (!badge) return;
    if (window.AllPredictorAccess?.updateCounter) {
      window.AllPredictorAccess.updateCounter();
      return;
    }
    let unlocked = false;
    let used = 0;
    try {
      unlocked = localStorage.getItem("allpredictor_full_access_v1") === "1";
      used = Math.max(0, Math.min(10, Number(localStorage.getItem("allpredictor_trial_predictions_v1")) || 0));
    } catch (_error) {}
    writeText(badge, unlocked ? t("fullAccess") : `${t("trial")}: ${used}/10`);
  }

  function createSwitcher() {
    if (document.getElementById("globalLanguageSwitcher")) return;
    const style = document.createElement("style");
    style.id = "globalLanguageStyles";
    style.textContent = `#globalLanguageSwitcher{position:fixed;z-index:2147482500;top:calc(10px + env(safe-area-inset-top));right:11px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}#globalLanguageButton{width:auto!important;min-width:64px!important;height:38px!important;padding:0 10px!important;margin:0!important;border:1px solid rgba(255,255,255,.2)!important;border-radius:999px!important;background:rgba(10,8,17,.92)!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;font-size:12px!important;font-weight:900!important;box-shadow:0 8px 24px rgba(0,0,0,.35)!important;backdrop-filter:blur(12px)}#globalLanguageMenu{position:absolute;top:44px;right:0;width:165px;padding:7px;border:1px solid rgba(255,255,255,.16);border-radius:16px;background:rgba(13,10,22,.98);box-shadow:0 16px 42px rgba(0,0,0,.55);display:none}#globalLanguageMenu.open{display:grid;gap:5px}#globalLanguageMenu button{width:100%!important;height:42px!important;margin:0!important;padding:0 12px!important;border:0!important;border-radius:11px!important;background:transparent!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:9px!important;font-size:13px!important;font-weight:800!important;box-shadow:none!important}#globalLanguageMenu button.active{background:linear-gradient(135deg,rgba(109,40,217,.65),rgba(139,92,246,.5))!important}@media(max-width:520px){#globalLanguageSwitcher{top:calc(7px + env(safe-area-inset-top));right:7px}#globalLanguageButton{height:35px!important;min-width:58px!important}}`;
    document.head.appendChild(style);

    const host = document.createElement("div");
    host.id = "globalLanguageSwitcher";
    host.innerHTML = `<button id="globalLanguageButton" type="button"></button><div id="globalLanguageMenu">${Object.entries(languages).map(([code, meta]) => `<button type="button" data-language="${code}"><span>${meta.flag}</span><span>${meta.name}</span></button>`).join("")}</div>`;
    document.body.appendChild(host);

    const button = host.querySelector("#globalLanguageButton");
    const menu = host.querySelector("#globalLanguageMenu");
    button.addEventListener("click", event => { event.stopPropagation(); menu.classList.toggle("open"); });
    host.querySelectorAll("[data-language]").forEach(item => item.addEventListener("click", () => {
      setLanguage(item.dataset.language);
      menu.classList.remove("open");
    }));
    document.addEventListener("click", event => { if (!host.contains(event.target)) menu.classList.remove("open"); });
  }

  function updateSwitcher() {
    const meta = languages[current];
    const button = document.getElementById("globalLanguageButton");
    writeHtml(button, `<span>${meta.flag}</span><span>${meta.short}</span><span>▾</span>`);
    document.querySelectorAll("#globalLanguageMenu [data-language]").forEach(item => item.classList.toggle("active", item.dataset.language === current));
  }

  function translatePage() {
    if (applying) return;
    applying = true;
    try {
      updateStaticInterface();
      updateExactText();
      updateTrialCounter();
      updateSwitcher();
    } finally {
      applying = false;
    }
  }

  function scheduleTranslate() {
    if (queued || applying) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      translatePage();
    });
  }

  function setLanguage(value) {
    const next = normalize(value);
    if (next === current) {
      translatePage();
      return;
    }
    current = next;
    try { localStorage.setItem(STORAGE_KEY, current); } catch (_error) {}
    translatePage();
    window.dispatchEvent(new CustomEvent("allpredictor:languagechange", { detail: { language: current } }));
  }

  function boot() {
    createSwitcher();
    translatePage();
    const observer = new MutationObserver(scheduleTranslate);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.AllPredictorI18n = Object.freeze({
    getLanguage: () => current,
    setLanguage,
    t,
    translatePage,
    supported: Object.keys(languages)
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
