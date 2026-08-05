const CACHE_NAME = 'snapty-v4.1';

// Static assets to precache (minimal - most loaded on-demand)
// Prefetch editor route so installed PWA opens offline-ready
const PRECACHE_URLS = [
  '/',
  '/editor',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: precache minimal resources, skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() => self.clients.matchAll()).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'NEW_VERSION_READY' }));
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Navigation requests: always network-first to get the latest version
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh response for offline use
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Offline fallback: serve from cache
          return caches.match(request).then((cached) => {
            return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
          });
        })
    );
    return;
  }

  // Static assets (_next/static/*): cache-first with network fallback
  if (request.url.includes('/_next/static/') || request.url.match(/\.(js|css|woff2?|svg|png|jpg|ico)$/i)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response('Offline', { status: 503 }));
      })
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// Handle messages from the update toast
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
