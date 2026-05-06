// Glo's Creations 3:16 — Service Worker (v3)
// Caches the basic site shell for offline use and faster repeat loads.
// Bumping CACHE_VERSION forces all clients to drop the old cache and refetch.

var CACHE_VERSION = 'gc-v3-2026-05-06';
var CACHE_NAME = 'glos-creations-' + CACHE_VERSION;

var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(STATIC_ASSETS).catch(function(err) {
          console.warn('[SW] Some assets failed to cache:', err);
        });
      })
      .then(function() {
        // Activate the new SW immediately, replacing the old one
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          // Delete every cache that doesn't match the current version
          if (name !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);

  // NEVER cache: third-party APIs, icon/logo files (always fresh), service worker itself
  var skipCache = (
    url.hostname.indexOf('myshopify.com') !== -1 ||
    url.hostname.indexOf('google-analytics.com') !== -1 ||
    url.hostname.indexOf('googletagmanager.com') !== -1 ||
    url.hostname.indexOf('tawk.to') !== -1 ||
    url.hostname.indexOf('judge.me') !== -1 ||
    url.hostname.indexOf('instagram.com') !== -1 ||
    url.hostname.indexOf('cdninstagram.com') !== -1 ||
    url.hostname.indexOf('googleapis.com') !== -1 ||
    url.pathname.indexOf('icon.png') !== -1 ||
    url.pathname.indexOf('logo.png') !== -1 ||
    url.pathname.indexOf('manifest.json') !== -1 ||
    url.pathname.indexOf('sw.js') !== -1
  );
  if (skipCache) return;

  // HTML pages: network-first
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').indexOf('text/html') !== -1) {
    event.respondWith(
      fetch(request)
        .then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
          return response;
        })
        .catch(function() {
          return caches.match(request).then(function(cached) {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // Other assets: cache-first
  event.respondWith(
    caches.match(request).then(function(cached) {
      if (cached) return cached;
      return fetch(request).then(function(response) {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
        return response;
      }).catch(function() {
        return new Response('', { status: 503, statusText: 'Service unavailable' });
      });
    })
  );
});

// Listen for "skipWaiting" message from the page (used by manual refresh)
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
