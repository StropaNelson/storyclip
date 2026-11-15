const CACHE_NAME = 'clipstudio-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/variables.css',
  'css/reset.css',
  'css/layout.css',
  'css/components.css',
  'css/timeline.css',
  'css/player.css',
  'js/config.js',
  'js/db.js',
  'js/storage.js',
  'js/media-library.js',
  'js/player.js',
  'js/timeline.js',
  'js/ui.js',
  'js/app.js',
  'js/episode.js',
  'js/intro-outro.js',
  'js/format.js',
  'js/project.js',
  'js/render.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http schemes
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Cache only same-origin assets
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
