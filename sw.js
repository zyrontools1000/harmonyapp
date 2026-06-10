const CACHE_NAME = 'harmony-app-v1';

const APP_SHELL = [
  './',
  './index.html',
  './dashboard.html',
  './7-biblical-healing-frequencies.html',
  './healing-frequencies-vault.html',
  './sacred-bonuses.html',
  './archangel-frequencies.html',
  './divine-accelerator.html',
  './manifest.json',
  './css/styles.css',
  './js/stars.js',
  './js/supabaseClient.js',
  './js/auth.js',
  './js/dashboard.js',
  './js/authGuard.js',
  './js/player.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});
