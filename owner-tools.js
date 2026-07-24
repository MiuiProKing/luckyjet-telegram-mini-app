(() => {
  "use strict";

  const ADMIN_IDS = Object.freeze([8016237913]);
  const API_FUNCTION = "allpredictor-api";

  function webApp() {
    return window.Telegram?.WebApp || null;
  }

  function currentTelegramId() {
    const value = webApp()?.initDataUnsafe?.user?.id;
    return Number.isSafeInteger(Number(value)) ? Number(value) : null;
  }

  function isAdmin() {
    const id = currentTelegramId();
    return id !== null && ADMIN_IDS.includes(id);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function config() {
    return window.ALLPREDICTOR_CONFIG || {};
  }

  function apiUrl() {
    return `${String(config().supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${API_FUNCTION}`;
  }

  async function api(action, payload = {}) {
    const tg = webApp();
    const initData = String(tg?.initData || "");
    const cfg = config();

    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error("SUPABASE_NOT_CONFIGURED");
    if (!initData) throw new Error("TELEGRAM_AUTH_MISSING");

    let response;
    try {
      response = await fetch(apiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.supabaseAnonKey
        },
        body: JSON.stringify({ initData, action: `admin_${action}`, payload }),
        cache: "no-store"
      });
    } catch (_error) {
      throw new Error("NETWORK_ERROR");
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.message || `SERVER_${response.status}`);
    return data;
  }

  function addStyles() {
    if (document.getElementById("ownerInlineAdminStyles")) return;
    const style = document.createElement("style");
    style.id = "ownerInlineAdminStyles";
    style.textContent = `
      #allPredictorAdminButton{position:fixed;z-index:2147482450;left:10px;bottom:calc(84px + env(safe-area-inset-bottom));width:auto!important;min-width:78px!important;height:45px!important;margin:0!important;padding:0 13px!important;border:1px solid rgba(250,204,21,.55)!important;border-radius:15px!important;background:linear-gradient(135deg,#facc15,#fb923c)!important;color:#211300!important;font:1000 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif!important;letter-spacing:.7px!important;box-shadow:0 12px 32px rgba(250,204,21,.22)!important}
      #allPredictorAdminButton:active{transform:scale(.96)}
      #ownerAdminOverlay{position:fixed;z-index:2147483600;inset:0;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
      #ownerAdminOverlay.open{display:flex}
      #ownerAdminPanel{width:min(900px,100%);height:min(92vh,900px);padding:15px 13px calc(18px + env(safe-area-inset-bottom));border:1px solid rgba(255,255,255,.13);border-radius:27px 27px 0 0;background:linear-gradient(180deg,#15101e,#07050b);color:#fff;box-shadow:0 -18px 60px rgba(0,0,0,.65);display:flex;flex-direction:column;overflow:hidden}
      .oa-head{display:flex;align-items:center;gap:10px;padding:2px 3px 12px}.oa-logo{width:43px;height:43px;border-radius:14px;background:linear-gradient(135deg,#6d28d9,#f97316);display:grid;place-items:center;font-weight:1000}.oa-title{font-size:17px;font-weight:1000}.oa-sub{margin-top:2px;color:#8f879b;font-size:10px}.oa-close{margin-left:auto!important;width:40px!important;height:40px!important;min-width:40px!important;padding:0!important;border:0!important;border-radius:13px!important;background:#282132!important;color:#fff!important;box-shadow:none!important}
      .oa-message{padding:12px;border:1px solid rgba(250,204,21,.35);border-radius:15px;background:rgba(250,204,21,.08);color:#ffe27a;font-size:11px;font-weight:800;line-height:1.45;margin-bottom:10px}.oa-message.good{border-color:rgba(16,185,129,.4);background:rgba(16,185,129,.09);color:#8fffc8}
      .oa-scroll{flex:1;overflow:auto;padding:1px 1px 20px}.oa-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}.oa-stat,.oa-card{padding:13px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.05)}.oa-label{color:#898192;font-size:9px;text-transform:uppercase;letter-spacing:.7px}.oa-value{margin-top:5px;font-size:19px;font-weight:1000}.oa-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.oa-card h3{margin:0 0 10px;font-size:14px}.oa-row{display:flex;gap:7px;flex-wrap:wrap}.oa-field{flex:1;min-width:118px;height:43px;padding:0 10px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#0b0810;color:#fff;font-size:12px;font-weight:800}.oa-btn{height:43px!important;margin:0!important;padding:0 12px!important;border:0!important;border-radius:12px!important;background:linear-gradient(135deg,#6d28d9,#8b5cf6)!important;color:#fff!important;font-size:11px!important;font-weight:1000!important;box-shadow:none!important}.oa-btn.gold{background:linear-gradient(135deg,#fde047,#fb923c)!important;color:#221400!important}.oa-btn.dark{background:#282132!important}.oa-list{display:grid;gap:7px;margin-top:10px;max-height:330px;overflow:auto}.oa-item{padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:#0d0912}.oa-item-head{font-size:11px;font-weight:900;overflow-wrap:anywhere}.oa-item-sub{margin-top:5px;color:#91899e;font-size:9px;line-height:1.45;overflow-wrap:anywhere}.oa-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.oa-actions button{height:32px!important;margin:0!important;padding:0 8px!important;border:0!important;border-radius:8px!important;background:#282031!important;color:#fff!important;font-size:9px!important;font-weight:900!important;box-shadow:none!important}.oa-actions button.danger{background:#7f1d1d!important}.oa-status{min-height:18px;margin-top:7px;color:#ffe27a;font-size:10px;font-weight:800}.oa-empty{color:#8e8698;font-size:11px;padding:8px 0}
      @media(max-width:650px){#allPredictorAdminButton{left:8px;bottom:calc(80px + env(safe-area-inset-bottom));height:42px!important;min-width:72px!important}.oa-stats{grid-template-columns:repeat(2,1fr)}.oa-grid{grid-template-columns:1fr}#ownerAdminPanel{height:94vh}}
    `;
    document.head.appendChild(style);
  }

  function panelHtml() {
    return `
      <div class="oa-head">
        <div class="oa-logo">AP</div>
        <div><div class="oa-title">AllPredictor Admin</div><div class="oa-sub">Telegram ID: ${escapeHtml(currentTelegramId())}</div></div>
        <button class="oa-close" id="ownerAdminClose" type="button">✕</button>
      </div>
      <div class="oa-message" id="ownerAdminMessage">Подключение к серверу ключей…</div>
      <div class="oa-scroll">
        <div class="oa-stats" id="ownerAdminStats"></div>
        <div class="oa-grid">
          <section class="oa-card">
            <h3>🔑 Создать ключ</h3>
            <div class="oa-row">
              <select class="oa-field" id="ownerPlan">
                <option value="pro_1">PRO 1 DAY</option>
                <option value="pro_7">PRO 7 DAYS</option>
                <option value="pro_30" selected>PRO 30 DAYS</option>
                <option value="pro_90">PRO 90 DAYS</option>
                <option value="lifetime">LIFETIME</option>
              </select>
              <select class="oa-field" id="ownerDevices"><option value="1">1 DEVICE</option><option value="2">2 DEVICES</option></select>
              <input class="oa-field" id="ownerNote" placeholder="Комментарий">
              <button class="oa-btn gold" id="ownerCreateKey" type="button">CREATE KEY</button>
            </div>
            <div class="oa-status" id="ownerLicenseStatus"></div>
            <div class="oa-list" id="ownerLicenses"></div>
          </section>
          <section class="oa-card">
            <h3>👤 Пользователи</h3>
            <button class="oa-btn dark" id="ownerRefresh" type="button">REFRESH</button>
            <div class="oa-status" id="ownerUserStatus"></div>
            <div class="oa-list" id="ownerUsers"></div>
          </section>
        </div>
      </div>`;
  }

  function statsHtml(stats) {
    const values = [
      ["Пользователи", stats.users], ["Новые сегодня", stats.newToday],
      ["Активные 7 дней", stats.activeWeek], ["Активные 30 дней", stats.activeMonth],
      ["Всего ключей", stats.licenses], ["Активные PRO", stats.activeLicenses]
    ];
    return values.map(([label, value]) => `<div class="oa-stat"><div class="oa-label">${label}</div><div class="oa-value">${Number(value) || 0}</div></div>`).join("");
  }

  function userHtml(user) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени";
    return `<div class="oa-item"><div class="oa-item-head">${escapeHtml(name)} ${user.username ? "@" + escapeHtml(user.username) : ""}</div><div class="oa-item-sub">ID: ${escapeHtml(user.telegram_id)} · ${escapeHtml(user.language_code || "—")} · запусков: ${escapeHtml(user.launch_count || 0)}<br>Последний вход: ${escapeHtml(user.last_seen_at || "—")} · ${user.is_blocked ? "BLOCKED" : "ACTIVE"}</div><div class="oa-actions"><button data-owner-block="${escapeHtml(user.telegram_id)}" data-blocked="${user.is_blocked ? "0" : "1"}" class="${user.is_blocked ? "" : "danger"}">${user.is_blocked ? "UNBLOCK" : "BLOCK"}</button></div></div>`;
  }

  function licenseHtml(license) {
    return `<div class="oa-item"><div class="oa-item-head">${escapeHtml(license.license_key)} · ${escapeHtml(license.plan)}</div><div class="oa-item-sub">${escapeHtml(license.status)} · устройства ${escapeHtml(license.activation_count || 0)}/${escapeHtml(license.max_devices || license.max_activations || 1)}<br>Telegram ID: ${escapeHtml(license.bound_telegram_id || "—")} · создан: ${escapeHtml(license.created_at || "—")}</div><div class="oa-actions"><button data-owner-copy="${escapeHtml(license.license_key)}">COPY</button><button data-owner-extend="${escapeHtml(license.id)}">+30 DAYS</button><button data-owner-revoke="${escapeHtml(license.id)}" class="danger">REVOKE</button></div></div>`;
  }

  function setMessage(text, good = false) {
    const element = document.getElementById("ownerAdminMessage");
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("good", good);
  }

  function bindItems() {
    document.querySelectorAll("[data-owner-copy]").forEach(button => {
      button.onclick = async () => {
        const key = button.dataset.ownerCopy;
        try { await navigator.clipboard.writeText(key); }
        catch (_error) {
          const area = document.createElement("textarea"); area.value = key; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
        }
        document.getElementById("ownerLicenseStatus").textContent = `Скопировано: ${key}`;
      };
    });
    document.querySelectorAll("[data-owner-revoke]").forEach(button => {
      button.onclick = async () => { await api("revoke_license", { licenseId: button.dataset.ownerRevoke }); await loadAdmin(); };
    });
    document.querySelectorAll("[data-owner-extend]").forEach(button => {
      button.onclick = async () => { await api("extend_license", { licenseId: button.dataset.ownerExtend, days: 30 }); await loadAdmin(); };
    });
    document.querySelectorAll("[data-owner-block]").forEach(button => {
      button.onclick = async () => { await api("block_user", { telegramId: Number(button.dataset.ownerBlock), blocked: button.dataset.blocked === "1" }); await loadAdmin(); };
    });
  }

  async function loadAdmin() {
    setMessage("Загрузка данных…");
    const [stats, users, licenses] = await Promise.all([
      api("stats"), api("list_users", { limit: 100 }), api("list_licenses", { limit: 100 })
    ]);
    document.getElementById("ownerAdminStats").innerHTML = statsHtml(stats.stats || {});
    document.getElementById("ownerUsers").innerHTML = (users.users || []).map(userHtml).join("") || '<div class="oa-empty">Пользователей пока нет</div>';
    document.getElementById("ownerLicenses").innerHTML = (licenses.licenses || []).map(licenseHtml).join("") || '<div class="oa-empty">Ключей пока нет</div>';
    setMessage("Сервер ключей подключён", true);
    bindItems();
  }

  function humanError(error) {
    const code = String(error?.message || error || "UNKNOWN_ERROR");
    const map = {
      TELEGRAM_AUTH_MISSING: "Swiftgram не передал подписанные данные Telegram. Открой мини-приложение через официальный Telegram.",
      TELEGRAM_AUTH_INVALID: "Сервер не принял Telegram-авторизацию. Перезапусти мини-приложение.",
      TELEGRAM_AUTH_EXPIRED: "Сессия Telegram устарела. Закрой и открой мини-приложение заново.",
      ADMIN_ACCESS_DENIED: "Этот Telegram ID не добавлен в администраторы Supabase.",
      NETWORK_ERROR: "Не удалось связаться с Supabase. Проверь интернет и Edge Function.",
      SUPABASE_NOT_CONFIGURED: "Supabase не подключён в настройках приложения."
    };
    return map[code] || `Ошибка сервера: ${code}`;
  }

  function buildOverlay() {
    if (document.getElementById("ownerAdminOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "ownerAdminOverlay";
    overlay.innerHTML = `<div id="ownerAdminPanel">${panelHtml()}</div>`;
    document.body.appendChild(overlay);

    document.getElementById("ownerAdminClose").onclick = () => overlay.classList.remove("open");
    overlay.addEventListener("click", event => { if (event.target === overlay) overlay.classList.remove("open"); });
    document.getElementById("ownerRefresh").onclick = () => loadAdmin().catch(error => setMessage(humanError(error)));
    document.getElementById("ownerCreateKey").onclick = async () => {
      const status = document.getElementById("ownerLicenseStatus");
      status.textContent = "Создание ключа…";
      try {
        const result = await api("create_license", {
          plan: document.getElementById("ownerPlan").value,
          maxDevices: Number(document.getElementById("ownerDevices").value || 1),
          note: document.getElementById("ownerNote").value
        });
        const key = result.license?.license_key || "";
        status.textContent = key ? `Создан ключ: ${key}` : "Ключ создан";
        await loadAdmin();
      } catch (error) {
        status.textContent = humanError(error);
      }
    };
  }

  function openInlineAdmin() {
    buildOverlay();
    const overlay = document.getElementById("ownerAdminOverlay");
    overlay.classList.add("open");
    loadAdmin().catch(error => setMessage(humanError(error)));
  }

  function installAdminButton() {
    if (!isAdmin() || document.getElementById("allPredictorAdminButton")) return;
    addStyles();
    const button = document.createElement("button");
    button.id = "allPredictorAdminButton";
    button.type = "button";
    button.textContent = "🔑 ADMIN";
    button.addEventListener("click", openInlineAdmin);
    document.body.appendChild(button);
  }

  window.AllPredictorOwner = Object.freeze({
    adminTelegramIds: ADMIN_IDS.slice(), currentTelegramId, isAdmin, openInlineAdmin
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installAdminButton, { once: true });
  else installAdminButton();
})();
