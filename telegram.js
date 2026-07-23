(() => {
  "use strict";

  const webApp = window.Telegram && window.Telegram.WebApp;
  const creatorUrl = "https://t.me/V0xFF3";

  function addCreatorCredit() {
    if (document.getElementById("appCreatorCredit")) return;

    const host = document.querySelector(".catalog-shell");
    if (!host) return;

    const style = document.createElement("style");
    style.textContent = `
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
    `;
    document.head.appendChild(style);

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addCreatorCredit, { once: true });
  } else {
    addCreatorCredit();
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
