// HarmonyApp Service Worker — Network First Strategy
// Sempre busca do servidor. Cache só como fallback offline.
const CACHE_NAME = 'harmony-app-v4';

self.addEventListener('install', (event) => {
  // Ativa imediatamente sem esperar abas antigas fecharem
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Apaga TODOS os caches antigos
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Ignora requests externos (Supabase, Bunny, Google Fonts, etc.)
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Guarda no cache só arquivos estáticos (CSS, JS, imagens)
        if (
          networkResponse.ok &&
          (url.pathname.match(/\.(css|js|png|jpg|jpeg|webp|svg|woff2?)$/) ||
           url.pathname === '/' )
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline: tenta cache
        return caches.match(event.request);
      })
  );
});
