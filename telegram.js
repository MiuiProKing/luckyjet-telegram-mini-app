(() => {
  "use strict";

  const webApp = window.Telegram && window.Telegram.WebApp;
  const creatorUrl = "https://t.me/V0xFF3";

  function addInterfaceFixes() {
    if (document.getElementById("miniAppInterfaceFixes")) return;

    const style = document.createElement("style");
    style.id = "miniAppInterfaceFixes";
    style.textContent = `
      /* Creator credit */
      #appCreatorCredit{
        display:flex;align-items:center;justify-content:center;gap:6px;
        width:fit-content;max-width:calc(100% - 24px);
        margin:18px auto 4px;padding:10px 15px;
        border:1px solid rgba(255,255,255,.16);border-radius:999px;
        background:rgba(255,255,255,.07);color:rgba(255,255,255,.78);
        text-decoration:none;font-size:13px;font-weight:700;
        box-shadow:0 8px 22px rgba(0,0,0,.24);
        -webkit-tap-highlight-color:transparent;
      }
      #appCreatorCredit strong{color:#7aa7ff;font-weight:900}
      #appCreatorCredit:active{transform:scale(.98)}

      /* Bottom navigation fix: global button styles must not stretch tabs */
      .app-tabs{
        overflow:hidden !important;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important;
      }
      .app-tabs .app-tab{
        position:relative !important;
        width:100% !important;
        min-width:0 !important;
        max-width:none !important;
        height:100% !important;
        padding:0 10px !important;
        margin:0 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        overflow:hidden !important;
        white-space:nowrap !important;
        box-shadow:none;
        font-size:13px !important;
        letter-spacing:1.3px !important;
      }

      /* Make the PRO section clearly visible even when it is not selected */
      .app-tabs .app-tab[data-app-tab="pro"]{
        color:#ffe27a !important;
        border:1px solid rgba(250,204,21,.72) !important;
        background:linear-gradient(135deg,rgba(250,204,21,.16),rgba(249,115,22,.12)) !important;
        text-shadow:0 0 10px rgba(250,204,21,.8) !important;
        box-shadow:inset 0 0 18px rgba(250,204,21,.08),0 0 16px rgba(250,204,21,.16) !important;
        animation:proAttention 1.8s ease-in-out infinite !important;
      }
      .app-tabs .app-tab[data-app-tab="pro"].active{
        color:#1d1200 !important;
        border-color:#fff0a6 !important;
        background:linear-gradient(135deg,#fde047,#fb923c) !important;
        text-shadow:none !important;
        box-shadow:0 7px 20px rgba(250,204,21,.48) !important;
        animation:none !important;
      }
      .app-tabs .app-tab[data-app-tab="games"].active{
        box-shadow:0 7px 18px rgba(109,40,217,.4) !important;
      }
      @keyframes proAttention{
        0%,100%{filter:brightness(1);transform:scale(1)}
        50%{filter:brightness(1.25);transform:scale(1.015)}
      }
      @media (prefers-reduced-motion:reduce){
        .app-tabs .app-tab[data-app-tab="pro"]{animation:none !important}
      }
    `;
    document.head.appendChild(style);
  }

  function addCreatorCredit() {
    if (document.getElementById("appCreatorCredit")) return;

    const host = document.querySelector(".catalog-shell");
    if (!host) return;

    const credit = document.createElement("a");
    credit.id = "appCreatorCredit";
    credit.href = creatorUrl;
    credit.target = "_blank";
    credit.rel = "noopener noreferrer";
    credit.innerHTML = "<span>Создатель приложения:</span><strong>@V0xFF3</strong>";

    credit.addEventListener("click", (event) => {
      event.preventDefault();
      try {
        if (webApp && typeof webApp.openTelegramLink === "function") {
          webApp.openTelegramLink(creatorUrl);
          return;
        }
      } catch (_error) {}
      window.open(creatorUrl, "_blank");
    });

    host.appendChild(credit);
  }

  function improveProButton() {
    const proButton = document.querySelector('.app-tab[data-app-tab="pro"]');
    if (!proButton) return;
    proButton.textContent = "⚡ PRO";
    proButton.setAttribute("aria-label", "Открыть PRO режим");
  }

  function prepareInterface() {
    addInterfaceFixes();
    addCreatorCredit();
    improveProButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", prepareInterface, { once: true });
  } else {
    prepareInterface();
  }

  if (!webApp) return;

  document.documentElement.classList.add("telegram-mini-app");

  try {
    webApp.ready();
    webApp.expand();
    if (typeof webApp.disableVerticalSwipes === "function") {
      webApp.disableVerticalSwipes();
    }
  } catch (_error) {
    // The site must remain usable in older Telegram clients.
  }

  const nativeOpen = window.open.bind(window);
  window.open = (url, target, features) => {
    if (
      typeof url === "string" &&
      /^https?:\/\//i.test(url) &&
      typeof webApp.openLink === "function"
    ) {
      try {
        webApp.openLink(url);
        return { closed: false, close() {} };
      } catch (_error) {
        // Fall through to the browser implementation.
      }
    }
    return nativeOpen(url, target, features);
  };
})();
