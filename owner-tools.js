(() => {
  "use strict";

  const ADMIN_IDS = Object.freeze([8016237913]);
  const API_FUNCTION = "allpredictor-api";
  const QR_CDN = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  let lastUsers = [];
  let lastLicenses = [];
  let lastStats = {};

  const dict = {
    ru: {
      title: "AllPredictor Admin", connecting: "Подключение к серверу ключей…", loading: "Загрузка данных…", connected: "Сервер ключей подключён",
      create: "🔑 Создать ключ", users: "👤 Пользователи", licenses: "Лицензии", comment: "Комментарий", createKey: "CREATE KEY", refresh: "REFRESH",
      totalUsers: "Всего пользователей", todayUsers: "Заходили сегодня", activeLicenses: "Активные лицензии", activatedKeys: "Активировано ключей",
      predictions: "Прогнозов", registrationsToday: "Регистраций сегодня", registrationsMonth: "Регистраций за месяц", totalKeys: "Всего ключей",
      languages: "Языки пользователей", popularApps: "Популярные приложения", copy: "КОПИРОВАТЬ", qr: "QR-КОД", extend: "+30 ДНЕЙ", revoke: "ОТОЗВАТЬ",
      block: "БЛОКИРОВАТЬ", unblock: "РАЗБЛОКИРОВАТЬ", copied: "Ключ скопирован", noUsers: "Пользователей пока нет", noKeys: "Ключей пока нет",
      confirmRevoke: "Отозвать этот ключ? Пользователь потеряет доступ.", confirmBlock: "Заблокировать пользователя и отключить его активные лицензии?",
      confirmUnblock: "Разблокировать пользователя?", created: "Ключ успешно создан", error: "Ошибка", search: "Поиск по имени, username или ID",
      all: "Все", active: "Активные", revoked: "Отозванные", qrTitle: "QR-код лицензии", close: "Закрыть", device: "устройство", devices: "устройства",
      lastLogin: "Последний вход", createdAt: "Создан", expires: "Истекает", never: "Без срока", launches: "запусков", statusActive: "АКТИВЕН", statusBlocked: "ЗАБЛОКИРОВАН"
    },
    en: {
      title: "AllPredictor Admin", connecting: "Connecting to the license server…", loading: "Loading data…", connected: "License server connected",
      create: "🔑 Create a key", users: "👤 Users", licenses: "Licenses", comment: "Comment", createKey: "CREATE KEY", refresh: "REFRESH",
      totalUsers: "Total users", todayUsers: "Active today", activeLicenses: "Active licenses", activatedKeys: "Activated keys",
      predictions: "Predictions", registrationsToday: "Registrations today", registrationsMonth: "Registrations this month", totalKeys: "Total keys",
      languages: "User languages", popularApps: "Popular applications", copy: "COPY", qr: "QR CODE", extend: "+30 DAYS", revoke: "REVOKE",
      block: "BLOCK", unblock: "UNBLOCK", copied: "License key copied", noUsers: "No users yet", noKeys: "No keys yet",
      confirmRevoke: "Revoke this key? The user will lose access.", confirmBlock: "Block this user and disable active licenses?", confirmUnblock: "Unblock this user?",
      created: "License key created", error: "Error", search: "Search by name, username or ID", all: "All", active: "Active", revoked: "Revoked",
      qrTitle: "License QR code", close: "Close", device: "device", devices: "devices", lastLogin: "Last login", createdAt: "Created", expires: "Expires",
      never: "Lifetime", launches: "launches", statusActive: "ACTIVE", statusBlocked: "BLOCKED"
    },
    id: {
      title: "Admin AllPredictor", connecting: "Menghubungkan ke server lisensi…", loading: "Memuat data…", connected: "Server lisensi terhubung",
      create: "🔑 Buat kunci", users: "👤 Pengguna", licenses: "Lisensi", comment: "Komentar", createKey: "BUAT KUNCI", refresh: "MUAT ULANG",
      totalUsers: "Total pengguna", todayUsers: "Aktif hari ini", activeLicenses: "Lisensi aktif", activatedKeys: "Kunci diaktifkan",
      predictions: "Prediksi", registrationsToday: "Pendaftaran hari ini", registrationsMonth: "Pendaftaran bulan ini", totalKeys: "Total kunci",
      languages: "Bahasa pengguna", popularApps: "Aplikasi populer", copy: "SALIN", qr: "KODE QR", extend: "+30 HARI", revoke: "CABUT",
      block: "BLOKIR", unblock: "BUKA BLOKIR", copied: "Kunci lisensi disalin", noUsers: "Belum ada pengguna", noKeys: "Belum ada kunci",
      confirmRevoke: "Cabut kunci ini? Pengguna akan kehilangan akses.", confirmBlock: "Blokir pengguna dan nonaktifkan lisensi aktif?", confirmUnblock: "Buka blokir pengguna?",
      created: "Kunci lisensi berhasil dibuat", error: "Kesalahan", search: "Cari nama, username, atau ID", all: "Semua", active: "Aktif", revoked: "Dicabut",
      qrTitle: "Kode QR lisensi", close: "Tutup", device: "perangkat", devices: "perangkat", lastLogin: "Login terakhir", createdAt: "Dibuat", expires: "Berakhir",
      never: "Seumur hidup", launches: "peluncuran", statusActive: "AKTIF", statusBlocked: "DIBLOKIR"
    }
  };

  function webApp() { return window.Telegram?.WebApp || null; }
  function currentTelegramId() { const value = webApp()?.initDataUnsafe?.user?.id; return Number.isSafeInteger(Number(value)) ? Number(value) : null; }
  function isAdmin() { const id = currentTelegramId(); return id !== null && ADMIN_IDS.includes(id); }
  function lang() { const code = String(webApp()?.initDataUnsafe?.user?.language_code || navigator.language || "ru").toLowerCase(); return code.startsWith("id") ? "id" : code.startsWith("en") ? "en" : "ru"; }
  function t(key) { return dict[lang()]?.[key] || dict.ru[key] || key; }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function config() { return window.ALLPREDICTOR_CONFIG || {}; }
  function apiUrl() { return `${String(config().supabaseUrl || "").replace(/\/$/, "")}/functions/v1/${API_FUNCTION}`; }

  async function api(action, payload = {}) {
    const initData = String(webApp()?.initData || "");
    const cfg = config();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error("SUPABASE_NOT_CONFIGURED");
    if (!initData) throw new Error("TELEGRAM_AUTH_MISSING");
    let response;
    try {
      response = await fetch(apiUrl(), { method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey }, body: JSON.stringify({ initData, action: `admin_${action}`, payload }), cache: "no-store" });
    } catch (_error) { throw new Error("NETWORK_ERROR"); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw new Error(data?.message || `SERVER_${response.status}`);
    return data;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(lang() === "id" ? "id-ID" : lang() === "en" ? "en-GB" : "ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function addStyles() {
    if (document.getElementById("ownerInlineAdminStyles")) return;
    const style = document.createElement("style");
    style.id = "ownerInlineAdminStyles";
    style.textContent = `
      #allPredictorAdminButton{position:fixed;z-index:2147482450;left:10px;bottom:calc(84px + env(safe-area-inset-bottom));min-width:82px!important;height:45px!important;padding:0 14px!important;border:1px solid rgba(250,204,21,.55)!important;border-radius:15px!important;background:linear-gradient(135deg,#facc15,#fb923c)!important;color:#211300!important;font:1000 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif!important;letter-spacing:.7px!important;box-shadow:0 12px 32px rgba(250,204,21,.24)!important;animation:oaPulse 2.4s ease-in-out infinite}
      #allPredictorAdminButton:active{transform:scale(.96)}
      #ownerAdminOverlay{position:fixed;z-index:2147483600;inset:0;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
      #ownerAdminOverlay.open{display:flex;animation:oaFade .22s ease}
      #ownerAdminPanel{width:min(1040px,100%);height:min(95vh,980px);padding:16px 14px calc(18px + env(safe-area-inset-bottom));border:1px solid rgba(255,255,255,.12);border-radius:28px 28px 0 0;background:radial-gradient(circle at 90% 0,rgba(109,40,217,.15),transparent 32%),linear-gradient(180deg,#100b17,#020204);color:#fff;box-shadow:0 -22px 80px rgba(0,0,0,.85);display:flex;flex-direction:column;overflow:hidden;animation:oaUp .28s cubic-bezier(.2,.8,.2,1)}
      .oa-head{display:flex;align-items:center;gap:11px;padding:2px 3px 13px}.oa-logo{width:46px;height:46px;border-radius:15px;background:linear-gradient(135deg,#6d28d9,#f97316);display:grid;place-items:center;font-weight:1000;box-shadow:0 10px 30px rgba(109,40,217,.25)}.oa-title{font-size:18px;font-weight:1000}.oa-sub{margin-top:3px;color:#938b9d;font-size:10px}.oa-close{margin-left:auto!important;width:42px!important;height:42px!important;min-width:42px!important;padding:0!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:14px!important;background:#211929!important;color:#fff!important;box-shadow:none!important}
      .oa-message{padding:13px;border:1px solid rgba(250,204,21,.35);border-radius:16px;background:rgba(250,204,21,.08);color:#ffe27a;font-size:11px;font-weight:850;line-height:1.45;margin-bottom:11px}.oa-message.good{border-color:rgba(16,185,129,.4);background:rgba(16,185,129,.09);color:#8fffc8}
      .oa-scroll{flex:1;overflow:auto;padding:1px 1px 24px;scrollbar-width:none}.oa-scroll::-webkit-scrollbar{display:none}.oa-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:11px}.oa-stat,.oa-card{padding:13px;border:1px solid rgba(255,255,255,.09);border-radius:17px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025))}.oa-stat{position:relative;overflow:hidden}.oa-stat:after{content:"";position:absolute;inset:auto -25px -30px auto;width:70px;height:70px;border-radius:50%;background:rgba(139,92,246,.08)}.oa-label{color:#938a9e;font-size:8.5px;text-transform:uppercase;letter-spacing:.75px}.oa-value{margin-top:6px;font-size:21px;font-weight:1000}.oa-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:10px}.oa-card h3{margin:0 0 11px;font-size:14px}.oa-row{display:flex;gap:7px;flex-wrap:wrap}.oa-field{flex:1;min-width:125px;height:44px;padding:0 11px;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:#07050a;color:#fff;font-size:12px;font-weight:800;outline:none}.oa-field:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.12)}.oa-btn{height:44px!important;margin:0!important;padding:0 13px!important;border:0!important;border-radius:12px!important;background:linear-gradient(135deg,#6d28d9,#8b5cf6)!important;color:#fff!important;font-size:10px!important;font-weight:1000!important;letter-spacing:.5px!important;box-shadow:none!important}.oa-btn.gold{background:linear-gradient(135deg,#fde047,#fb923c)!important;color:#221400!important}.oa-btn.dark{background:#241b2d!important}.oa-list{display:grid;gap:8px;margin-top:10px;max-height:390px;overflow:auto;scrollbar-width:none}.oa-list::-webkit-scrollbar{display:none}.oa-item{padding:11px;border:1px solid rgba(255,255,255,.085);border-radius:14px;background:#08060b;transition:.18s ease}.oa-item:hover{border-color:rgba(139,92,246,.35);transform:translateY(-1px)}.oa-item-head{font-size:11px;font-weight:950;overflow-wrap:anywhere}.oa-item-sub{margin-top:6px;color:#91899e;font-size:9px;line-height:1.55;overflow-wrap:anywhere}.oa-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.oa-actions button{height:33px!important;margin:0!important;padding:0 9px!important;border:0!important;border-radius:9px!important;background:#261d30!important;color:#fff!important;font-size:8.5px!important;font-weight:950!important;box-shadow:none!important}.oa-actions button.danger{background:#7f1d1d!important}.oa-status{min-height:19px;margin-top:8px;color:#ffe27a;font-size:10px;font-weight:850}.oa-empty{color:#8e8698;font-size:11px;padding:9px 0}.oa-tools{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}.oa-chart{min-height:130px}.oa-bars{display:grid;gap:8px}.oa-bar-row{display:grid;grid-template-columns:minmax(58px,90px) 1fr 32px;gap:7px;align-items:center;font-size:9px;color:#aaa2b5}.oa-bar-track{height:8px;border-radius:999px;background:#17111d;overflow:hidden}.oa-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#7c3aed,#f97316);transition:width .5s ease}.oa-filters{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0}.oa-filter{height:32px!important;padding:0 10px!important;border:1px solid rgba(255,255,255,.09)!important;border-radius:9px!important;background:#17111d!important;color:#aaa2b5!important;font-size:9px!important;font-weight:900!important}.oa-filter.active{background:#6d28d9!important;color:#fff!important}.oa-toast{position:fixed;z-index:2147483900;left:50%;bottom:calc(25px + env(safe-area-inset-bottom));transform:translate(-50%,20px);padding:11px 16px;border-radius:13px;background:#121016;border:1px solid rgba(143,255,200,.35);color:#8fffc8;font-size:11px;font-weight:900;opacity:0;pointer-events:none;transition:.25s ease}.oa-toast.show{opacity:1;transform:translate(-50%,0)}.oa-modal{position:fixed;z-index:2147483850;inset:0;display:none;place-items:center;padding:18px;background:rgba(0,0,0,.88);backdrop-filter:blur(10px)}.oa-modal.open{display:grid}.oa-modal-card{width:min(360px,100%);padding:19px;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:#0c0910;text-align:center}.oa-modal-card h3{margin:0 0 13px}.oa-qr{width:220px;height:220px;margin:0 auto 13px;padding:10px;border-radius:17px;background:#fff;display:grid;place-items:center}.oa-qr img,.oa-qr canvas{max-width:100%!important;max-height:100%!important}.oa-key{font-size:11px;font-weight:1000;overflow-wrap:anywhere;margin-bottom:12px}
      @keyframes oaPulse{0%,100%{box-shadow:0 12px 32px rgba(250,204,21,.18)}50%{box-shadow:0 12px 42px rgba(250,204,21,.42)}}@keyframes oaFade{from{opacity:0}to{opacity:1}}@keyframes oaUp{from{transform:translateY(30px);opacity:.6}to{transform:none;opacity:1}}
      @media(max-width:720px){.oa-stats{grid-template-columns:repeat(2,1fr)}.oa-grid,.oa-tools{grid-template-columns:1fr}#ownerAdminPanel{height:96vh}.oa-value{font-size:19px}}
      @media(max-width:420px){#allPredictorAdminButton{left:8px;bottom:calc(79px + env(safe-area-inset-bottom));height:42px!important}.oa-stat{padding:11px}.oa-field{min-width:100%;width:100%}.oa-btn.gold{width:100%!important}.oa-actions button{flex:1}.oa-bar-row{grid-template-columns:68px 1fr 25px}}
    `;
    document.head.appendChild(style);
  }

  function panelHtml() {
    return `<div class="oa-head"><div class="oa-logo">AP</div><div><div class="oa-title">${t("title")}</div><div class="oa-sub">Telegram ID: ${escapeHtml(currentTelegramId())} · ${lang().toUpperCase()}</div></div><button class="oa-close" id="ownerAdminClose" type="button">✕</button></div>
      <div class="oa-message" id="ownerAdminMessage">${t("connecting")}</div><div class="oa-scroll"><div class="oa-stats" id="ownerAdminStats"></div>
      <div class="oa-tools"><section class="oa-card oa-chart"><h3>🌐 ${t("languages")}</h3><div class="oa-bars" id="ownerLanguageChart"></div></section><section class="oa-card oa-chart"><h3>📱 ${t("popularApps")}</h3><div class="oa-bars" id="ownerAppsChart"></div></section></div>
      <div class="oa-grid"><section class="oa-card"><h3>${t("create")}</h3><div class="oa-row"><select class="oa-field" id="ownerPlan"><option value="pro_1">PRO 1 DAY</option><option value="pro_7">PRO 7 DAYS</option><option value="pro_30" selected>PRO 30 DAYS</option><option value="pro_90">PRO 90 DAYS</option><option value="lifetime">LIFETIME</option></select><select class="oa-field" id="ownerDevices"><option value="1">1 DEVICE</option><option value="2">2 DEVICES</option></select><input class="oa-field" id="ownerNote" placeholder="${t("comment")}"><button class="oa-btn gold" id="ownerCreateKey" type="button">${t("createKey")}</button></div><div class="oa-status" id="ownerLicenseStatus"></div><div class="oa-filters"><button class="oa-filter active" data-license-filter="all">${t("all")}</button><button class="oa-filter" data-license-filter="active">${t("active")}</button><button class="oa-filter" data-license-filter="revoked">${t("revoked")}</button></div><div class="oa-list" id="ownerLicenses"></div></section>
      <section class="oa-card"><h3>${t("users")}</h3><div class="oa-row"><input class="oa-field" id="ownerUserSearch" placeholder="${t("search")}"><button class="oa-btn dark" id="ownerRefresh" type="button">${t("refresh")}</button></div><div class="oa-status" id="ownerUserStatus"></div><div class="oa-list" id="ownerUsers"></div></section></div></div>
      <div class="oa-toast" id="ownerToast"></div><div class="oa-modal" id="ownerQrModal"><div class="oa-modal-card"><h3>${t("qrTitle")}</h3><div class="oa-qr" id="ownerQrBox"></div><div class="oa-key" id="ownerQrKey"></div><button class="oa-btn dark" id="ownerQrClose">${t("close")}</button></div></div>`;
  }

  function statValue(stats, key, fallback = 0) { const value = stats?.[key]; return Number.isFinite(Number(value)) ? Number(value) : fallback; }
  function registrationsIn(days) { const min = Date.now() - days * 86400000; return lastUsers.filter(u => new Date(u.first_seen_at || 0).getTime() >= min).length; }
  function statsHtml(stats) {
    const activated = lastLicenses.filter(l => Number(l.activation_count || 0) > 0).length;
    const values = [
      [t("totalUsers"), statValue(stats,"users",lastUsers.length)], [t("todayUsers"), statValue(stats,"activeToday",statValue(stats,"newToday",0))],
      [t("activeLicenses"), statValue(stats,"activeLicenses",0)], [t("activatedKeys"), statValue(stats,"activatedKeys",activated)],
      [t("predictions"), statValue(stats,"predictions",0)], [t("registrationsToday"), statValue(stats,"registrationsToday",registrationsIn(1))],
      [t("registrationsMonth"), statValue(stats,"registrationsMonth",registrationsIn(30))], [t("totalKeys"), statValue(stats,"licenses",lastLicenses.length)]
    ];
    return values.map(([label,value])=>`<div class="oa-stat"><div class="oa-label">${escapeHtml(label)}</div><div class="oa-value">${Number(value)||0}</div></div>`).join("");
  }

  function barChart(items, emptyLabel = "—") {
    const rows = Array.isArray(items) ? items.filter(x=>Number(x.count)>0).slice(0,6) : [];
    if (!rows.length) return `<div class="oa-empty">${emptyLabel}</div>`;
    const max = Math.max(...rows.map(x=>Number(x.count)||0),1);
    return rows.map(x=>`<div class="oa-bar-row"><span>${escapeHtml(x.label || x.name || "—")}</span><div class="oa-bar-track"><div class="oa-bar-fill" style="width:${Math.max(4,(Number(x.count)||0)/max*100)}%"></div></div><b>${Number(x.count)||0}</b></div>`).join("");
  }

  function languageData() {
    const counts = {};
    lastUsers.forEach(u => { const code = String(u.language_code || "other").toLowerCase(); counts[code] = (counts[code]||0)+1; });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([label,count])=>({label:label.toUpperCase(),count}));
  }

  function userHtml(user) {
    const name = [user.first_name,user.last_name].filter(Boolean).join(" ") || "Без имени";
    const status = user.is_blocked ? t("statusBlocked") : t("statusActive");
    return `<div class="oa-item" data-user-search="${escapeHtml(`${name} ${user.username||""} ${user.telegram_id}`.toLowerCase())}"><div class="oa-item-head">${escapeHtml(name)} ${user.username?"@"+escapeHtml(user.username):""}</div><div class="oa-item-sub">ID: ${escapeHtml(user.telegram_id)} · ${escapeHtml((user.language_code||"—").toUpperCase())} · ${escapeHtml(user.launch_count||0)} ${t("launches")}<br>${t("lastLogin")}: ${escapeHtml(formatDate(user.last_seen_at))} · ${status}</div><div class="oa-actions"><button data-owner-block="${escapeHtml(user.telegram_id)}" data-blocked="${user.is_blocked?"0":"1"}" class="${user.is_blocked?"":"danger"}">${user.is_blocked?t("unblock"):t("block")}</button></div></div>`;
  }

  function licenseHtml(license) {
    const limit = Number(license.max_devices || license.max_activations || 1);
    const expires = license.plan === "lifetime" ? t("never") : formatDate(license.expires_at);
    return `<div class="oa-item" data-license-status="${escapeHtml(license.status||"active")}"><div class="oa-item-head">${escapeHtml(license.license_key)} · ${escapeHtml(license.plan)}</div><div class="oa-item-sub">${escapeHtml(String(license.status||"active").toUpperCase())} · ${Number(license.activation_count||0)}/${limit} ${limit===1?t("device"):t("devices")}<br>Telegram ID: ${escapeHtml(license.bound_telegram_id||"—")} · ${t("createdAt")}: ${escapeHtml(formatDate(license.created_at))}<br>${t("expires")}: ${escapeHtml(expires)}</div><div class="oa-actions"><button data-owner-copy="${escapeHtml(license.license_key)}">${t("copy")}</button><button data-owner-qr="${escapeHtml(license.license_key)}">${t("qr")}</button><button data-owner-extend="${escapeHtml(license.id)}">${t("extend")}</button><button data-owner-revoke="${escapeHtml(license.id)}" class="danger">${t("revoke")}</button></div></div>`;
  }

  function toast(text) { const el=document.getElementById("ownerToast"); if(!el)return; el.textContent=text; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),2200); }
  function setMessage(text,good=false){const el=document.getElementById("ownerAdminMessage");if(!el)return;el.textContent=text;el.classList.toggle("good",good);}
  async function copyText(text){try{await navigator.clipboard.writeText(text);}catch(_e){const a=document.createElement("textarea");a.value=text;document.body.appendChild(a);a.select();document.execCommand("copy");a.remove();}}
  function loadQrLib(){if(window.QRCode)return Promise.resolve();return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=QR_CDN;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
  async function showQr(key){const modal=document.getElementById("ownerQrModal"),box=document.getElementById("ownerQrBox");document.getElementById("ownerQrKey").textContent=key;box.innerHTML="";modal.classList.add("open");try{await loadQrLib();new window.QRCode(box,{text:key,width:200,height:200,correctLevel:window.QRCode.CorrectLevel.H});}catch(_e){box.textContent=key;}}

  function renderLists(){
    document.getElementById("ownerUsers").innerHTML=lastUsers.map(userHtml).join("")||`<div class="oa-empty">${t("noUsers")}</div>`;
    document.getElementById("ownerLicenses").innerHTML=lastLicenses.map(licenseHtml).join("")||`<div class="oa-empty">${t("noKeys")}</div>`;
    document.getElementById("ownerAdminStats").innerHTML=statsHtml(lastStats);
    document.getElementById("ownerLanguageChart").innerHTML=barChart(lastStats.languages||languageData(),"—");
    document.getElementById("ownerAppsChart").innerHTML=barChart(lastStats.popularApps||lastStats.topGames||[],"Данные появятся после использования приложений");
    bindItems();
  }

  function bindItems(){
    document.querySelectorAll("[data-owner-copy]").forEach(b=>b.onclick=async()=>{await copyText(b.dataset.ownerCopy);toast(t("copied"));});
    document.querySelectorAll("[data-owner-qr]").forEach(b=>b.onclick=()=>showQr(b.dataset.ownerQr));
    document.querySelectorAll("[data-owner-revoke]").forEach(b=>b.onclick=async()=>{if(!confirm(t("confirmRevoke")))return;await api("revoke_license",{licenseId:b.dataset.ownerRevoke});toast(t("revoke"));await loadAdmin();});
    document.querySelectorAll("[data-owner-extend]").forEach(b=>b.onclick=async()=>{await api("extend_license",{licenseId:b.dataset.ownerExtend,days:30});toast(t("extend"));await loadAdmin();});
    document.querySelectorAll("[data-owner-block]").forEach(b=>b.onclick=async()=>{const blocked=b.dataset.blocked==="1";if(!confirm(blocked?t("confirmBlock"):t("confirmUnblock")))return;await api("block_user",{telegramId:Number(b.dataset.ownerBlock),blocked});await loadAdmin();});
  }

  async function loadAdmin(){
    setMessage(t("loading"));
    const [stats,users,licenses]=await Promise.all([api("stats"),api("list_users",{limit:500}),api("list_licenses",{limit:500})]);
    lastStats=stats.stats||{};lastUsers=users.users||[];lastLicenses=licenses.licenses||[];renderLists();setMessage(t("connected"),true);
  }

  function humanError(error){const code=String(error?.message||error||"UNKNOWN_ERROR");const map={TELEGRAM_AUTH_MISSING:"Telegram authorization data is missing.",TELEGRAM_AUTH_INVALID:"Telegram authorization was rejected.",TELEGRAM_AUTH_EXPIRED:"Telegram session expired. Restart the Mini App.",ADMIN_ACCESS_DENIED:"This Telegram ID is not an administrator.",NETWORK_ERROR:"Unable to connect to Supabase.",SUPABASE_NOT_CONFIGURED:"Supabase is not configured.",INVALID_PLAN:"Invalid license plan."};return map[code]||`${t("error")}: ${code}`;}

  function buildOverlay(){
    if(document.getElementById("ownerAdminOverlay"))return;
    const overlay=document.createElement("div");overlay.id="ownerAdminOverlay";overlay.innerHTML=`<div id="ownerAdminPanel">${panelHtml()}</div>`;document.body.appendChild(overlay);
    document.getElementById("ownerAdminClose").onclick=()=>overlay.classList.remove("open");overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.classList.remove("open");});
    document.getElementById("ownerQrClose").onclick=()=>document.getElementById("ownerQrModal").classList.remove("open");document.getElementById("ownerQrModal").addEventListener("click",e=>{if(e.target.id==="ownerQrModal")e.currentTarget.classList.remove("open");});
    document.getElementById("ownerRefresh").onclick=()=>loadAdmin().catch(e=>setMessage(humanError(e)));
    document.getElementById("ownerUserSearch").addEventListener("input",e=>{const q=e.target.value.toLowerCase().trim();document.querySelectorAll("[data-user-search]").forEach(item=>item.style.display=!q||item.dataset.userSearch.includes(q)?"":"none");});
    document.querySelectorAll("[data-license-filter]").forEach(btn=>btn.onclick=()=>{document.querySelectorAll("[data-license-filter]").forEach(x=>x.classList.remove("active"));btn.classList.add("active");const f=btn.dataset.licenseFilter;document.querySelectorAll("[data-license-status]").forEach(item=>item.style.display=f==="all"||item.dataset.licenseStatus===f?"":"none");});
    document.getElementById("ownerCreateKey").onclick=async()=>{const status=document.getElementById("ownerLicenseStatus");status.textContent="…";try{const result=await api("create_license",{plan:document.getElementById("ownerPlan").value,maxDevices:Number(document.getElementById("ownerDevices").value||1),note:document.getElementById("ownerNote").value});const key=result.license?.license_key||"";status.textContent=key?`${t("created")}: ${key}`:t("created");if(key){await copyText(key);toast(t("copied"));}await loadAdmin();}catch(e){status.textContent=humanError(e);}};
  }

  function openInlineAdmin(){buildOverlay();document.getElementById("ownerAdminOverlay").classList.add("open");loadAdmin().catch(e=>setMessage(humanError(e)));}
  function installAdminButton(){if(!isAdmin()||document.getElementById("allPredictorAdminButton"))return;addStyles();const b=document.createElement("button");b.id="allPredictorAdminButton";b.type="button";b.textContent="🔑 ADMIN";b.addEventListener("click",openInlineAdmin);document.body.appendChild(b);}
  window.AllPredictorOwner=Object.freeze({adminTelegramIds:ADMIN_IDS.slice(),currentTelegramId,isAdmin,openInlineAdmin});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installAdminButton,{once:true});else installAdminButton();
})();
