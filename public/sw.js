const CACHE = 'crewstat-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only cache complete, same-origin, successful responses — never redirects,
// opaque responses, or error pages (which could poison the cached app shell).
function cachePut(request, res) {
  if (res && res.ok && res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API/auth

  if (request.mode === 'navigate') {
    // network-first; fall back to cached page, then to cached root shell
    event.respondWith(
      fetch(request)
        .then((res) => cachePut(request, res))
        .catch(() => caches.match(request).then((r) => r || caches.match('/')))
    );
    return;
  }

  // static assets: cache-first with background refresh
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => cachePut(request, res)).catch(() => cached);
      return cached || network;
    })
  );
});
