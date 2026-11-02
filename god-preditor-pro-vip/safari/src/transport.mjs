// Userscripts Safari executes this GET through its extension API. Page fetch,
// site cookies, casino sessions and game DOM are never used for the data feed.
export function createExtensionFetch(gm, config) {
  if (typeof gm?.xmlHttpRequest !== 'function') throw Error('Нужно включить расширение Userscripts');
  const origin = new URL(config.url).origin;
  return async function extensionFetch(input, options = {}) {
    const url = new URL(String(input));
    if (url.origin !== origin || url.pathname !== `/rest/v1/${config.table}` ||
        (options.method && options.method !== 'GET')) throw Error('Разрешено только чтение нашей таблицы коэффициентов');
    const {signal} = options;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let task, listener;
    try {
      const response = await new Promise((resolve, reject) => {
        listener = () => {task?.abort?.(); reject(new DOMException('Aborted', 'AbortError'));};
        signal?.addEventListener('abort', listener, {once: true});
        task = gm.xmlHttpRequest({
          method: 'GET', url: url.href, timeout: 15000, responseType: 'text',
          headers: {apikey: config.publishableKey, Accept: 'application/json'},
          onload: resolve,
          onerror: () => reject(Error('Userscripts: нет соединения с источником')),
          ontimeout: () => reject(Error('Userscripts: источник не ответил за 15 секунд')),
          onabort: () => reject(new DOMException('Aborted', 'AbortError')),
        });
        // The stable Userscripts API provides both a Promise and callbacks.
        if (typeof task?.then === 'function') task.then(resolve, reject);
      });
      const status = Number(response.status) || 0;
      return {
        ok: status >= 200 && status < 300, status,
        async json() {
          if (typeof response.responseText === 'string') return JSON.parse(response.responseText);
          if (typeof response.response === 'string') return JSON.parse(response.response);
          if (Array.isArray(response.response) || response.response?.constructor === Object) return response.response;
          throw Error('Userscripts: неверный ответ источника');
        },
      };
    } finally {signal?.removeEventListener('abort', listener);}
  };
}

export function permittedPage(location) {
  return location.protocol === 'https:' && (
    location.hostname === 'one-vv3016.com' ||
    (location.hostname === 'miuiproking.github.io' &&
      location.pathname === '/luckyjet-telegram-mini-app/god-preditor-pro-vip/safari/preview.html')
  );
}
