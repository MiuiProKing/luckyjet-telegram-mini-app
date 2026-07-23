(() => {
  "use strict";

  const config = window.ALLPREDICTOR_CONFIG || {
    appName: "AllPredictor 1Win",
    version: "3.0.0",
    creatorUsername: "V0xFF3",
    creatorUrl: "https://t.me/V0xFF3",
    botUsername: "AllPredictorVrs2_bot",
    trialLimit: 10,
    plans: [],
    news: [],
    faq: [],
    supabaseUrl: "",
    adminTelegramIds: []
  };
  const webApp = window.Telegram && window.Telegram.WebApp;
  const TRIAL_KEY = "allpredictor_trial_predictions_v1";
  const UNLOCK_KEY = "allpredictor_full_access_v1";
  const REF_KEY = "allpredictor_ref_code_v1";

  const local = {
    ru: {
      center: "ЦЕНТР",
      profile: "Профиль",
      plans: "Тарифы",
      news: "Новости",
      faq: "Вопросы",
      support: "Поддержка",
      status: "Статус",
      user: "Пользователь",
      telegramId: "Telegram ID",
      username: "Username",
      predictionsLeft: "Осталось прогнозов",
      accessTest: "TEST",
      accessFull: "PRO — полный доступ",
      version: "Версия",
      server: "Сервер лицензий",
      connected: "Подключён",
      notConnected: "Ожидает настройки",
      buy: "КУПИТЬ ДОСТУП",
      contact: "НАПИСАТЬ @V0xFF3",
      referral: "Реферальная ссылка",
      copy: "КОПИРОВАТЬ",
      copied: "Скопировано",
      share: "ПОДЕЛИТЬСЯ",
      activate: "Активация ключа",
      keyPlaceholder: "Введите индивидуальный ключ",
      activateButton: "АКТИВИРОВАТЬ",
      serverRequired: "Сервер лицензий ещё не подключён. Для доступа напишите @V0xFF3.",
      privacy: "Конфиденциальность",
      terms: "Условия",
      responsible: "Приложение предоставляет статистический анализ и не гарантирует выигрыш. Играйте ответственно.",
      privacyText: "Приложение может получать Telegram ID, имя, username, язык и технические данные запуска только для работы доступа и поддержки. Данные не должны продаваться третьим лицам.",
      termsText: "Прогнозы являются аналитической информацией, а не гарантией результата. Пользователь самостоятельно принимает решения и несёт ответственность за свои действия.",
      close: "ЗАКРЫТЬ",
      noUsername: "не указан",
      guest: "Гость Telegram",
      planContact: "Цена и оплата уточняются у @V0xFF3.",
      admin: "Админ-панель"
    },
    en: {
      center: "CENTER",
      profile: "Profile",
      plans: "Plans",
      news: "News",
      faq: "FAQ",
      support: "Support",
      status: "Status",
      user: "User",
      telegramId: "Telegram ID",
      username: "Username",
      predictionsLeft: "Predictions left",
      accessTest: "TRIAL",
      accessFull: "PRO — full access",
      version: "Version",
      server: "License server",
      connected: "Connected",
      notConnected: "Awaiting setup",
      buy: "BUY ACCESS",
      contact: "CONTACT @V0xFF3",
      referral: "Referral link",
      copy: "COPY",
      copied: "Copied",
      share: "SHARE",
      activate: "Activate license",
      keyPlaceholder: "Enter your individual key",
      activateButton: "ACTIVATE",
      serverRequired: "The license server is not connected yet. Contact @V0xFF3 for access.",
      privacy: "Privacy",
      terms: "Terms",
      responsible: "The app provides statistical analysis and does not guarantee winnings. Play responsibly.",
      privacyText: "The app may receive Telegram ID, name, username, language and technical launch data only for access and support. Data should not be sold to third parties.",
      termsText: "Predictions are analytical information, not a guarantee of results. Users make their own decisions and remain responsible for their actions.",
      close: "CLOSE",
      noUsername: "not specified",
      guest: "Telegram guest",
      planContact: "Ask @V0xFF3 about pricing and payment.",
      admin: "Admin panel"
    },
    id: {
      center: "PUSAT",
      profile: "Profil",
      plans: "Paket",
      news: "Berita",
      faq: "FAQ",
      support: "Dukungan",
      status: "Status",
      user: "Pengguna",
      telegramId: "ID Telegram",
      username: "Username",
      predictionsLeft: "Prediksi tersisa",
      accessTest: "UJI COBA",
      accessFull: "PRO — akses penuh",
      version: "Versi",
      server: "Server lisensi",
      connected: "Terhubung",
      notConnected: "Menunggu pengaturan",
      buy: "BELI AKSES",
      contact: "HUBUNGI @V0xFF3",
      referral: "Tautan referal",
      copy: "SALIN",
      copied: "Disalin",
      share: "BAGIKAN",
      activate: "Aktivasi lisensi",
      keyPlaceholder: "Masukkan kunci individual",
      activateButton: "AKTIFKAN",
      serverRequired: "Server lisensi belum terhubung. Hubungi @V0xFF3 untuk mendapatkan akses.",
      privacy: "Privasi",
      terms: "Ketentuan",
      responsible: "Aplikasi menyediakan analisis statistik dan tidak menjamin kemenangan. Bermainlah secara bertanggung jawab.",
      privacyText: "Aplikasi dapat menerima ID Telegram, nama, username, bahasa, dan data teknis peluncuran hanya untuk akses dan dukungan. Data tidak boleh dijual kepada pihak ketiga.",
      termsText: "Prediksi adalah informasi analitis, bukan jaminan hasil. Pengguna membuat keputusan sendiri dan bertanggung jawab atas tindakannya.",
      close: "TUTUP",
      noUsername: "tidak tersedia",
      guest: "Tamu Telegram",
      planContact: "Tanyakan harga dan pembayaran kepada @V0xFF3.",
      admin: "Panel admin"
    }
  };

  function lang() {
    return window.AllPredictorI18n?.getLanguage?.() || "ru";
  }

  function tr(key) {
    return local[lang()]?.[key] || local.en[key] || key;
  }

  function pick(record, base) {
    const suffix = lang() === "ru" ? "Ru" : lang() === "id" ? "Id" : "En";
    return record?.[base + suffix] || record?.[base + "En"] || record?.[base + "Ru"] || "";
  }

  function telegramUser() {
    return webApp?.initDataUnsafe?.user || null;
  }

  function trialUsed() {
    try { return Math.max(0, Math.min(config.trialLimit || 10, Number(localStorage.getItem(TRIAL_KEY)) || 0)); }
    catch (_error) { return 0; }
  }

  function unlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === "1"; }
    catch (_error) { return false; }
  }

  function refCode() {
    try {
      let value = localStorage.getItem(REF_KEY);
      if (!value) {
        const user = telegramUser();
        value = user?.id ? String(user.id) : Math.random().toString(36).slice(2, 10).toUpperCase();
        localStorage.setItem(REF_KEY, value);
      }
      return value;
    } catch (_error) {
      return "V0XFF3";
    }
  }

  function referralUrl() {
    const bot = config.botUsername || "AllPredictorVrs2_bot";
    return `https://t.me/${bot}?start=ref_${encodeURIComponent(refCode())}`;
  }

  function openTelegram(url) {
    try {
      if (webApp && typeof webApp.openTelegramLink === "function") {
        webApp.openTelegramLink(url);
        return;
      }
      if (webApp && typeof webApp.openLink === "function") {
        webApp.openLink(url);
        return;
      }
    } catch (_error) {}
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function addStyles() {
    if (document.getElementById("appCenterStyles")) return;
    const style = document.createElement("style");
    style.id = "appCenterStyles";
    style.textContent = `
      #appCenterOpen{position:fixed;z-index:2147482400;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));width:52px!important;height:52px!important;min-width:52px!important;margin:0!important;padding:0!important;border:1px solid rgba(255,255,255,.18)!important;border-radius:17px!important;background:linear-gradient(135deg,#6d28d9,#8b5cf6)!important;color:#fff!important;font-size:22px!important;box-shadow:0 13px 34px rgba(109,40,217,.38)!important;display:grid!important;place-items:center!important}
      #appCenterOverlay{position:fixed;z-index:2147482600;inset:0;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.76);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
      #appCenterOverlay.open{display:flex}
      #appCenterPanel{width:min(720px,100%);height:min(88vh,820px);padding:16px 14px calc(18px + env(safe-area-inset-bottom));border:1px solid rgba(255,255,255,.14);border-radius:28px 28px 0 0;background:linear-gradient(180deg,#171221,#09070e);color:#fff;box-shadow:0 -18px 65px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:hidden}
      .ac-head{display:flex;align-items:center;gap:10px;padding:2px 4px 12px}.ac-logo{width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,#6d28d9,#f97316);display:grid;place-items:center;font-weight:1000}.ac-title{font-size:17px;font-weight:1000}.ac-sub{font-size:11px;color:#9992aa;margin-top:2px}.ac-close{margin-left:auto!important;width:40px!important;height:40px!important;min-width:40px!important;padding:0!important;border-radius:13px!important;background:#282132!important;color:#fff!important;box-shadow:none!important}
      .ac-tabs{display:flex;gap:7px;overflow-x:auto;padding:0 2px 10px;scrollbar-width:none}.ac-tabs::-webkit-scrollbar{display:none}.ac-tab{width:auto!important;min-width:max-content!important;height:39px!important;padding:0 13px!important;margin:0!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:999px!important;background:#201a2a!important;color:#aaa3b8!important;font-size:11px!important;font-weight:900!important;box-shadow:none!important}.ac-tab.active{background:linear-gradient(135deg,#6d28d9,#8b5cf6)!important;color:#fff!important;border-color:transparent!important}
      .ac-content{flex:1;overflow:auto;padding:3px 2px 20px}.ac-section{display:none}.ac-section.active{display:block}.ac-card{margin:0 0 10px;padding:15px;border:1px solid rgba(255,255,255,.11);border-radius:18px;background:rgba(255,255,255,.055)}.ac-card h3{margin:0 0 9px;font-size:15px}.ac-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ac-stat{padding:12px;border-radius:14px;background:#120e19;border:1px solid rgba(255,255,255,.08)}.ac-label{font-size:10px;color:#8f879c;text-transform:uppercase;letter-spacing:.8px}.ac-value{margin-top:5px;font-size:13px;font-weight:900;overflow-wrap:anywhere}.ac-good{color:#7ef0bc}.ac-warn{color:#ffe27a}.ac-btn{width:100%!important;height:47px!important;margin:8px 0 0!important;border:0!important;border-radius:14px!important;background:linear-gradient(135deg,#6d28d9,#8b5cf6)!important;color:#fff!important;font-size:12px!important;font-weight:1000!important}.ac-btn.gold{background:linear-gradient(135deg,#fde047,#fb923c)!important;color:#251500!important}.ac-btn.dark{background:#282132!important;border:1px solid rgba(255,255,255,.13)!important}.ac-input{width:100%;height:47px;padding:0 13px;border:1px solid rgba(255,255,255,.15);border-radius:13px;background:#09070e;color:#fff;font-size:14px;font-weight:800;outline:none}.ac-row{display:flex;gap:8px}.ac-row .ac-btn{width:auto!important;flex:1}.ac-plan{position:relative;overflow:hidden}.ac-plan::after{content:"PRO";position:absolute;right:-21px;top:10px;transform:rotate(40deg);width:82px;padding:3px;text-align:center;background:#facc15;color:#251500;font-size:9px;font-weight:1000}.ac-plan p,.ac-news p,.ac-legal p{margin:0;color:#b1aaba;font-size:12px;line-height:1.5}.ac-date{color:#7c7488;font-size:10px;margin-bottom:5px}.ac-faq summary{cursor:pointer;font-size:13px;font-weight:900}.ac-faq p{margin:9px 0 0;color:#aaa3b8;font-size:12px;line-height:1.5}.ac-responsible{color:#ffca86!important}.ac-copy{display:flex;gap:7px;margin-top:8px}.ac-copy input{flex:1;min-width:0}.ac-copy button{width:auto!important;min-width:105px!important;height:47px!important;margin:0!important;padding:0 12px!important;border-radius:13px!important;font-size:10px!important;background:#282132!important;box-shadow:none!important}.ac-message{min-height:18px;margin-top:7px;text-align:center;color:#ffe27a;font-size:11px;font-weight:800}
      @media(max-width:520px){#appCenterOpen{right:9px;bottom:calc(80px + env(safe-area-inset-bottom));width:47px!important;height:47px!important;min-width:47px!important}.ac-grid{grid-template-columns:1fr}.ac-copy{flex-direction:column}.ac-copy button{width:100%!important}}
    `;
    document.head.appendChild(style);
  }

  function profileHtml() {
    const user = telegramUser();
    const fullName = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : tr("guest");
    const left = Math.max(0, (config.trialLimit || 10) - trialUsed());
    const full = unlocked();
    const serverConnected = Boolean(config.supabaseUrl && config.supabaseAnonKey);
    return `
      <div class="ac-card">
        <div class="ac-grid">
          <div class="ac-stat"><div class="ac-label">${tr("user")}</div><div class="ac-value">${escapeHtml(fullName)}</div></div>
          <div class="ac-stat"><div class="ac-label">${tr("status")}</div><div class="ac-value ${full ? "ac-good" : "ac-warn"}">${full ? tr("accessFull") : tr("accessTest")}</div></div>
          <div class="ac-stat"><div class="ac-label">${tr("telegramId")}</div><div class="ac-value">${escapeHtml(user?.id || "—")}</div></div>
          <div class="ac-stat"><div class="ac-label">${tr("username")}</div><div class="ac-value">${user?.username ? "@" + escapeHtml(user.username) : tr("noUsername")}</div></div>
          <div class="ac-stat"><div class="ac-label">${tr("predictionsLeft")}</div><div class="ac-value">${full ? "∞" : left + " / " + (config.trialLimit || 10)}</div></div>
          <div class="ac-stat"><div class="ac-label">${tr("version")}</div><div class="ac-value">${escapeHtml(config.version || "3.0.0")}</div></div>
          <div class="ac-stat"><div class="ac-label">${tr("server")}</div><div class="ac-value ${serverConnected ? "ac-good" : "ac-warn"}">${serverConnected ? tr("connected") : tr("notConnected")}</div></div>
        </div>
      </div>
      <div class="ac-card">
        <h3>${tr("activate")}</h3>
        <input class="ac-input" id="acLicenseKey" autocomplete="off" placeholder="${escapeHtml(tr("keyPlaceholder"))}">
        <button class="ac-btn gold" id="acActivate" type="button">${tr("activateButton")}</button>
        <div class="ac-message" id="acLicenseMessage"></div>
      </div>
    `;
  }

  function planHtml() {
    const fallbackPlans = [
      { id: "pro_30", ru: "PRO — 30 дней", en: "PRO — 30 days", idn: "PRO — 30 hari", dru: "Полный доступ ко всем анализаторам на 30 дней.", den: "Full access to all analyzers for 30 days.", did: "Akses penuh ke semua analis selama 30 hari." },
      { id: "pro_90", ru: "PRO — 90 дней", en: "PRO — 90 days", idn: "PRO — 90 hari", dru: "Полный доступ на 90 дней и приоритетная поддержка.", den: "Full access for 90 days with priority support.", did: "Akses penuh 90 hari dengan dukungan prioritas." },
      { id: "lifetime", ru: "LIFETIME", en: "LIFETIME", idn: "SEUMUR HIDUP", dru: "Постоянный доступ для привязанного Telegram-аккаунта.", den: "Permanent access for the linked Telegram account.", did: "Akses permanen untuk akun Telegram yang terhubung." }
    ];
    const plans = config.plans?.length ? config.plans : fallbackPlans;
    return plans.map((plan, index) => {
      const name = config.plans?.length ? pick(plan, "name") : (lang() === "ru" ? plan.ru : lang() === "id" ? plan.idn : plan.en);
      const description = config.plans?.length ? pick(plan, "description") : (lang() === "ru" ? plan.dru : lang() === "id" ? plan.did : plan.den);
      return `<div class="ac-card ac-plan"><h3>${escapeHtml(name)}</h3><p>${escapeHtml(description)}</p><p style="margin-top:8px">${tr("planContact")}</p><button class="ac-btn ${index === 2 ? "gold" : ""}" data-ac-buy="${escapeHtml(plan.id)}" type="button">${tr("buy")}</button></div>`;
    }).join("");
  }

  function newsHtml() {
    const fallback = [{ date: "2026-07-24", titleRu: "Версия 3.0", titleEn: "Version 3.0", titleId: "Versi 3.0", textRu: "Добавлены языки, профиль, тарифы, поддержка и система доступа.", textEn: "Languages, profile, plans, support and access system were added.", textId: "Bahasa, profil, paket, dukungan, dan sistem akses telah ditambahkan." }];
    const items = config.news?.length ? config.news : fallback;
    return items.map(item => `<div class="ac-card ac-news"><div class="ac-date">${escapeHtml(item.date || "")}</div><h3>${escapeHtml(pick(item, "title"))}</h3><p>${escapeHtml(pick(item, "text"))}</p></div>`).join("");
  }

  function faqHtml() {
    const items = config.faq || [];
    return items.map(item => `<details class="ac-card ac-faq"><summary>${escapeHtml(pick(item, "q"))}</summary><p>${escapeHtml(pick(item, "a"))}</p></details>`).join("");
  }

  function supportHtml() {
    return `
      <div class="ac-card">
        <h3>${tr("support")}</h3>
        <p style="color:#aaa3b8;font-size:12px;line-height:1.5">@${escapeHtml(config.creatorUsername || "V0xFF3")}</p>
        <button class="ac-btn gold" id="acContact" type="button">${tr("contact")}</button>
      </div>
      <div class="ac-card">
        <h3>${tr("referral")}</h3>
        <div class="ac-copy"><input class="ac-input" id="acReferral" readonly value="${escapeHtml(referralUrl())}"><button id="acCopyReferral" type="button">${tr("copy")}</button></div>
        <button class="ac-btn dark" id="acShareReferral" type="button">${tr("share")}</button>
        <div class="ac-message" id="acReferralMessage"></div>
      </div>
      <div class="ac-card ac-legal"><h3>${tr("privacy")}</h3><p>${tr("privacyText")}</p></div>
      <div class="ac-card ac-legal"><h3>${tr("terms")}</h3><p>${tr("termsText")}</p></div>
      <div class="ac-card ac-legal"><p class="ac-responsible">${tr("responsible")}</p></div>
    `;
  }

  function panelHtml() {
    return `
      <div class="ac-head">
        <div class="ac-logo">AP</div>
        <div><div class="ac-title">${escapeHtml(config.appName || "AllPredictor")}</div><div class="ac-sub">Official Developer — @${escapeHtml(config.creatorUsername || "V0xFF3")}</div></div>
        <button class="ac-close" id="appCenterClose" type="button">✕</button>
      </div>
      <div class="ac-tabs">
        <button class="ac-tab active" data-ac-tab="profile" type="button">${tr("profile")}</button>
        <button class="ac-tab" data-ac-tab="plans" type="button">${tr("plans")}</button>
        <button class="ac-tab" data-ac-tab="news" type="button">${tr("news")}</button>
        <button class="ac-tab" data-ac-tab="faq" type="button">${tr("faq")}</button>
        <button class="ac-tab" data-ac-tab="support" type="button">${tr("support")}</button>
      </div>
      <div class="ac-content">
        <section class="ac-section active" data-ac-section="profile">${profileHtml()}</section>
        <section class="ac-section" data-ac-section="plans">${planHtml()}</section>
        <section class="ac-section" data-ac-section="news">${newsHtml()}</section>
        <section class="ac-section" data-ac-section="faq">${faqHtml()}</section>
        <section class="ac-section" data-ac-section="support">${supportHtml()}</section>
      </div>
    `;
  }

  function bindPanel() {
    const overlay = document.getElementById("appCenterOverlay");
    const panel = document.getElementById("appCenterPanel");
    document.getElementById("appCenterClose")?.addEventListener("click", () => overlay.classList.remove("open"));
    overlay.addEventListener("click", event => { if (event.target === overlay) overlay.classList.remove("open"); });

    panel.querySelectorAll("[data-ac-tab]").forEach(button => {
      button.addEventListener("click", () => {
        panel.querySelectorAll("[data-ac-tab]").forEach(x => x.classList.toggle("active", x === button));
        panel.querySelectorAll("[data-ac-section]").forEach(section => section.classList.toggle("active", section.dataset.acSection === button.dataset.acTab));
      });
    });

    panel.querySelectorAll("[data-ac-buy]").forEach(button => button.addEventListener("click", () => openTelegram(config.creatorUrl || "https://t.me/V0xFF3")));
    document.getElementById("acContact")?.addEventListener("click", () => openTelegram(config.creatorUrl || "https://t.me/V0xFF3"));
    document.getElementById("acActivate")?.addEventListener("click", async () => {
      const message = document.getElementById("acLicenseMessage");
      const key = document.getElementById("acLicenseKey")?.value?.trim();
      if (!key) return;
      if (window.AllPredictorLicense?.activate) {
        try {
          const result = await window.AllPredictorLicense.activate(key);
          message.textContent = result?.message || "OK";
        } catch (error) {
          message.textContent = error?.message || tr("serverRequired");
        }
      } else {
        message.textContent = tr("serverRequired");
      }
    });

    const copyReferral = async () => {
      const value = referralUrl();
      try { await navigator.clipboard.writeText(value); }
      catch (_error) {
        const input = document.getElementById("acReferral");
        input?.select();
        document.execCommand?.("copy");
      }
      const message = document.getElementById("acReferralMessage");
      if (message) message.textContent = tr("copied");
    };
    document.getElementById("acCopyReferral")?.addEventListener("click", copyReferral);
    document.getElementById("acShareReferral")?.addEventListener("click", async () => {
      const url = referralUrl();
      if (navigator.share) {
        try { await navigator.share({ title: config.appName, url }); return; } catch (_error) {}
      }
      await copyReferral();
    });
  }

  function renderPanel() {
    const panel = document.getElementById("appCenterPanel");
    if (!panel) return;
    panel.innerHTML = panelHtml();
    bindPanel();
  }

  function build() {
    if (document.getElementById("appCenterOpen")) return;
    addStyles();
    const open = document.createElement("button");
    open.id = "appCenterOpen";
    open.type = "button";
    open.textContent = "☰";
    open.setAttribute("aria-label", tr("center"));

    const overlay = document.createElement("div");
    overlay.id = "appCenterOverlay";
    overlay.innerHTML = '<div id="appCenterPanel"></div>';
    document.body.append(open, overlay);
    renderPanel();

    open.addEventListener("click", () => {
      renderPanel();
      overlay.classList.add("open");
    });
  }

  window.addEventListener("allpredictor:languagechange", () => {
    const button = document.getElementById("appCenterOpen");
    if (button) button.setAttribute("aria-label", tr("center"));
    if (document.getElementById("appCenterOverlay")?.classList.contains("open")) renderPanel();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build, { once: true });
  else build();
})();
