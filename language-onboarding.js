(() => {
  "use strict";

  const STORAGE_KEY = "allpredictor_language_v1";

  function shouldShow() {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return false;
    } catch (_error) {}
    const path = location.pathname.toLowerCase();
    return path.endsWith("/") || path.endsWith("/index.html") || path.endsWith("index.html");
  }

  function build() {
    if (!shouldShow() || document.getElementById("languageOnboarding")) return;

    const style = document.createElement("style");
    style.id = "languageOnboardingStyles";
    style.textContent = `
      #languageOnboarding{position:fixed;z-index:2147483600;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.9);backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
      #languageOnboardingCard{width:min(420px,100%);padding:24px;border:1px solid rgba(255,255,255,.16);border-radius:27px;background:linear-gradient(180deg,#191326,#09070e);color:#fff;text-align:center;box-shadow:0 28px 80px rgba(0,0,0,.72)}
      #languageOnboardingCard .lo-logo{width:58px;height:58px;margin:0 auto 13px;border-radius:19px;background:linear-gradient(135deg,#6d28d9,#f97316);display:grid;place-items:center;font-size:20px;font-weight:1000}
      #languageOnboardingCard h2{margin:0;font-size:22px;line-height:1.25}
      #languageOnboardingCard p{margin:8px 0 18px;color:#a9a1b5;font-size:13px;line-height:1.5}
      #languageOnboardingOptions{display:grid;gap:9px}
      #languageOnboardingOptions button{width:100%!important;height:54px!important;margin:0!important;padding:0 15px!important;border:1px solid rgba(255,255,255,.13)!important;border-radius:15px!important;background:#211a2b!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:12px!important;font-size:15px!important;font-weight:900!important;box-shadow:none!important}
      #languageOnboardingOptions button span:first-child{font-size:23px}
      #languageOnboardingOptions button:active{transform:scale(.985)}
      #languageOnboardingCard small{display:block;margin-top:14px;color:#6f6879;font-size:10px;line-height:1.4}
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "languageOnboarding";
    overlay.innerHTML = `
      <div id="languageOnboardingCard">
        <div class="lo-logo">AP</div>
        <h2>Выберите язык · Choose language</h2>
        <p>Pilih bahasa aplikasi. Pilihan akan disimpan untuk semua halaman.</p>
        <div id="languageOnboardingOptions">
          <button type="button" data-onboarding-language="ru"><span>🇷🇺</span><span>Русский</span></button>
          <button type="button" data-onboarding-language="en"><span>🇬🇧</span><span>English</span></button>
          <button type="button" data-onboarding-language="id"><span>🇮🇩</span><span>Indonesia</span></button>
        </div>
        <small>Language can be changed later using the button in the upper-right corner.</small>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll("[data-onboarding-language]").forEach(button => {
      button.addEventListener("click", () => {
        const language = button.dataset.onboardingLanguage;
        try { localStorage.setItem(STORAGE_KEY, language); } catch (_error) {}
        window.AllPredictorI18n?.setLanguage?.(language);
        overlay.remove();
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build, { once: true });
  else build();
})();
