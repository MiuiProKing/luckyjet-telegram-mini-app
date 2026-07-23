(() => {
  "use strict";

  let selectedDevices = 1;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === "string" ? input : input?.url || "";
      if (url.includes("/functions/v1/admin-api") && typeof init.body === "string") {
        const body = JSON.parse(init.body);
        if (body?.action === "create_license") {
          body.payload = body.payload || {};
          body.payload.maxDevices = selectedDevices;
          body.payload.maxActivations = selectedDevices;
          init = { ...init, body: JSON.stringify(body) };
        }
      }
    } catch (_error) {}
    return originalFetch(input, init);
  };

  function install() {
    const plan = document.getElementById("plan");
    if (!plan || document.getElementById("maxDevices")) return;

    const select = document.createElement("select");
    select.className = "field";
    select.id = "maxDevices";
    select.innerHTML = `
      <option value="1">1 DEVICE</option>
      <option value="2">2 DEVICES</option>
    `;
    select.addEventListener("change", () => {
      selectedDevices = Number(select.value) === 2 ? 2 : 1;
    });
    plan.insertAdjacentElement("afterend", select);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
