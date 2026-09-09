const CACHE_NAME = 'luckyjet-ru-v4-20260909-models';
const APP_SHELL = [
  './',
  './index.html',
  './LuckyJet_RU_Ukraine.html',
  './ru-models.js',
  './manifest.webmanifest',
  './icon.png',
  './luckyjet.jpg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (name) {
          if (name !== CACHE_NAME) return caches.delete(name);
          return Promise.resolve(false);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function injectModels(response) {
  if (!response || !response.ok) return response;
  return response.text().then(function (html) {
    if (html.indexOf('ru-models.js') !== -1) return new Response(html, { headers: response.headers, status: response.status });
    const tag = '<script src="./ru-models.js?v=20260909-models"></script>';
    const patched = html.replace(/<\/body>/i, tag + '</body>');
    const headers = new Headers(response.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    return new Response(patched, { headers: headers, status: response.status, statusText: response.statusText });
  });
}

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
          return injectModels(response);
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            return cached ? injectModels(cached) : caches.match('./index.html').then(injectModels);
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      const fresh = fetch(request).then(function (response) {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
      return cached || fresh;
    })
  );
});
