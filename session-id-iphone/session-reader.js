const code = document.getElementById('reader-code');
const copy = document.getElementById('reader-copy');
const status = document.getElementById('reader-status');
let source = '';

function message(text, state = '') {
  status.textContent = text;
  status.dataset.state = state;
}

copy.addEventListener('click', async () => {
  if (!source) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(source);
    message('Код скопирован. Вставь его в Userscripts или Hyperweb.', 'success');
  } catch {
    code.focus();
    code.select();
    code.setSelectionRange(0, source.length);
    message('Код выделен. Нажми на текст и выбери «Скопировать» в меню iPhone.');
  }
});

async function load() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('./session-id-reader.user.js', {
      cache: 'no-store',
      credentials: 'omit',
      headers: {Accept: 'text/plain'},
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Source unavailable');
    const text = await response.text();
    if (!text.startsWith('// ==UserScript==')) throw new Error('Unexpected source');
    source = text;
    code.value = source;
    copy.disabled = false;
    message('Код готов. Можно скопировать его или скачать файл.');
  } catch {
    source = '';
    code.value = '';
    copy.disabled = true;
    message('Код не загрузился. Открой «Открыть текст» или обнови страницу.', 'error');
  } finally { clearTimeout(timer); }
}

load();
