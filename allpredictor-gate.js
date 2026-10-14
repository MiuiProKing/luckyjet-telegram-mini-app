/* AllPredictor UI-only session PIN gate. Not authorization for public data.
 * Load with defer after allpredictor-premium.css. Opt-in html/body class required.
 * Does not click, navigate, change license state, calculate or fetch game data.
 * Public API: window.AllPredictorGate.lock(), .logout(), .isUnlocked().
 */
(function () {
  'use strict';
  var KEY = 'allpredictor-access';
  var gate = null;
  var previousFocus = null;
  var savedInert = [];
  var observer = null;
  var root = null;
  var memoryUnlocked = false;
  function unlocked() { try { return sessionStorage.getItem(KEY) === 'yes'; } catch (_) { return memoryUnlocked; } }
  function protect(element) {
    if (!(element instanceof HTMLElement) || element === gate || element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return;
    if (savedInert.some(function (item) { return item.element === element; })) return;
    savedInert.push({ element: element, inert: element.inert });
    element.inert = true;
  }
  function restore() {
    if (observer) observer.disconnect();
    observer = null;
    savedInert.forEach(function (item) { item.element.inert = item.inert; });
    savedInert = [];
  }
  function close() {
    restore();
    if (gate) gate.remove();
    gate = null;
    if (root) root.classList.remove('ap-gate-active');
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    document.dispatchEvent(new CustomEvent('allpredictor:unlocked'));
  }
  function mount(force) {
    root = document.documentElement.classList.contains('allpredictor-premium') ? document.documentElement : document.body.classList.contains('allpredictor-premium') ? document.body : null;
    if (!root || gate || (!force && unlocked())) return;
    previousFocus = document.activeElement;
    gate = document.createElement('div');
    gate.id = 'allpredictor-pin-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'ap-gate-title');
    gate.innerHTML = '<div class="ap-gate-content"><p class="ap-wordmark">AllPredictor<span>.</span></p><p class="ap-eyebrow">ВАШЕ ПРОСТРАНСТВО АНАЛИТИКИ</p><h1 id="ap-gate-title" class="ap-gate-title">Доступ к полной картине.</h1><p class="ap-gate-description">Введите персональный код, чтобы продолжить.</p><form><label class="ap-pin-label" for="ap-pin-input">Код доступа</label><div class="ap-pin-field"><input id="ap-pin-input" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" placeholder="• • • •" aria-describedby="ap-pin-error" required><button type="button" aria-label="Показать код" title="Показать код"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div><p id="ap-pin-error" class="ap-pin-error" role="alert" aria-live="polite"></p><button type="submit" class="ap-pin-submit" disabled>Войти в AllPredictor →</button></form><p class="ap-pin-note">Доступ только на время сессии. Лицензия оригинального приложения остаётся без изменений.</p></div>';
    // Fixed overlay is out of flow: no extra flex-column layout item.
    document.body.appendChild(gate);
    root.classList.add('ap-gate-active');
    Array.prototype.forEach.call(document.body.children, protect);
    observer = new MutationObserver(function (changes) { changes.forEach(function (change) { Array.prototype.forEach.call(change.addedNodes, protect); }); });
    observer.observe(document.body, { childList: true });
    var input = gate.querySelector('input');
    var form = gate.querySelector('form');
    var toggle = gate.querySelector('button[type=button]');
    var submit = gate.querySelector('button[type=submit]');
    var error = gate.querySelector('[role=alert]');
    input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(0, 4); error.textContent = ''; input.removeAttribute('aria-invalid'); submit.disabled = input.value.length !== 4; });
    toggle.addEventListener('click', function () { var show = input.type === 'password'; input.type = show ? 'text' : 'password'; toggle.setAttribute('aria-label', show ? 'Скрыть код' : 'Показать код'); toggle.title = show ? 'Скрыть код' : 'Показать код'; input.focus(); });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (input.value !== '1234') { error.textContent = 'Неверный код. Попробуйте ещё раз.'; input.value = ''; input.setAttribute('aria-invalid', 'true'); submit.disabled = true; input.focus(); return; }
      memoryUnlocked = true;
      try { sessionStorage.setItem(KEY, 'yes'); } catch (_) {}
      close();
    });
    gate.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var focusable = Array.prototype.filter.call(gate.querySelectorAll('input,button'), function (el) { return !el.disabled; });
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    input.focus();
  }
  function logout() { memoryUnlocked = false; try { sessionStorage.removeItem(KEY); } catch (_) {} mount(true); }
  window.AllPredictorGate = { lock: logout, logout: logout, isUnlocked: unlocked };
  document.addEventListener('click', function (event) { if (event.target instanceof Element && event.target.closest('[data-allpredictor-logout]')) { event.preventDefault(); logout(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(false); }, { once: true });
  else mount(false);
}());
