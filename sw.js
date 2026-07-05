const CACHE_NAME = 'wagetracker-v1';
const ASSETS = [ './', './index.html', './app.js', './manifest.json' ];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

// Network-first strategy for dynamic data, falls back to cache
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
