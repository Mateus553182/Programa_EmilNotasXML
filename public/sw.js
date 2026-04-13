const CACHE_NAME = 'emil-notas-xml-v31';
const OFFLINE_URLS = [
  '/',
  '/login',
  '/acesso',
  '/dashboard',
  '/login.html',
  '/acesso.html',
  '/dashboard.html',
  '/styles.css',
  '/login.js',
  '/dashboard.js',
  '/manifest.webmanifest',
  '/logo-emil.svg',
  '/logo-emil-nova.png',
  '/logo-emil-nova.jpeg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Never cache API calls — they return dynamic data.
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  // Always try network first for HTML navigations to avoid stale UI after deploys.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then((cached) => cached || caches.match('/login.html'))
            .then((cached) => cached || caches.match('/login'))
            .then((cached) => cached || new Response('Offline - recarregue a pagina', { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } }))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
