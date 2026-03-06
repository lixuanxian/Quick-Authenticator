const CACHE_VERSION = 2;
const CACHE_NAME = `quick-auth-v${CACHE_VERSION}`;

// Derive base path from the SW's own location.
// e.g. /Quick-Authenticator/sw.js → BASE = /Quick-Authenticator/
//      /sw.js                     → BASE = /
const BASE = new URL('./', self.location).pathname;

// Core shell assets — precached on install.
// Vite-hashed JS/CSS are cached dynamically on first request.
const PRECACHE_URLS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icons/192.png',
  BASE + 'icons/512.png',
  BASE + 'icons/icon.svg',
  BASE + 'fonts/fonts.css',
  BASE + 'fonts/inter-300.ttf',
  BASE + 'fonts/inter-400.ttf',
  BASE + 'fonts/inter-500.ttf',
  BASE + 'fonts/inter-600.ttf',
  BASE + 'fonts/jetbrains-mono-400.ttf',
  BASE + 'fonts/jetbrains-mono-600.ttf',
  BASE + 'fonts/jetbrains-mono-700.ttf',
];

// ── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Do NOT skipWaiting — let the app decide when to activate the new version
});

self.addEventListener('activate', (e) => {
  // Delete all caches that don't match the current version
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// App sends 'skipWaiting' when user accepts the update
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// ── Fetch: Cache-First ──────────────────────────────────────────────────────
// Serve from cache if available; otherwise fetch from network and cache the
// response.  Cache never expires — only a new CACHE_VERSION clears it.

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (!url.protocol.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;

      return fetch(e.request).then((response) => {
        // Cache successful same-origin responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      });
    })
  );
});

// ── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (e) => {
  let data = { title: 'Quick Authenticator', body: 'New authentication request received' };
  if (e.data) {
    try { data = e.data.json(); } catch { data.body = e.data.text(); }
  }

  const options = {
    body: data.body || 'New authentication request received',
    icon: BASE + 'icons/192.png',
    badge: BASE + 'icons/192.png',
    tag: data.tag || 'push-' + Date.now(),
    data: data,
    actions: [
      { action: 'approve', title: 'Approve' },
      { action: 'deny', title: 'Deny' },
    ],
    requireInteraction: true,
  };

  e.waitUntil(self.registration.showNotification(data.title || 'Quick Authenticator', options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  const action = e.action; // 'approve' | 'deny' | '' (clicked body)
  const data = e.notification.data || {};

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({
          type: 'push-action',
          action: action || 'open',
          data: data,
        });
      }
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow(BASE);
    })
  );
});
