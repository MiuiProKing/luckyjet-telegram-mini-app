(() => {
  "use strict";

  const webApp = window.Telegram && window.Telegram.WebApp;
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
