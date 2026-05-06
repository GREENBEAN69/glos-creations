// Glo's Creations 3:16 — Service Worker
// Handles offline caching so the site can load even without connection
// for previously-viewed pages.

var CACHE_VERSION = 'gc-v1';
var CACHE_NAME = 'glos-creations-' + CACHE_VERSION;

// Files to cache on install
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event — cache the basic shell
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(STATIC_ASSETS).catch(function(err) {
          console.warn('[SW] Some assets failed to cache:', err);
        });
      })
      .then(function() {
        // Activate the new SW immediately on install
        return self.skipWaiting();
      })
  );
});

// Activate event — clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          if (name.indexOf('glos-creations-') === 0 && name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch event — serve from cache, fall back to network
// Strategy: network-first for HTML (so updates show immediately),
// cache-first for assets (faster repeat loads).
self.addEventListener('fetch', function(event) {
  var request = event.request;

  // Don't try to cache non-GET requests (POST, PUT, etc.)
  if (request.method !== 'GET') return;

  // Don't intercept Shopify, Google Analytics, Tawk.to, Judge.me, or Instagram requests
  // — these need fresh data and have their own caching headers
  var url = new URL(request.url);
  var skipCache = (
    url.hostname.indexOf('myshopify.com') !== -1 ||
    url.hostname.indexOf('google-analytics.com') !== -1 ||
    url.hostname.indexOf('googletagmanager.com') !== -1 ||
    url.hostname.indexOf('tawk.to') !== -1 ||
    url.hostname.indexOf('judge.me') !== -1 ||
    url.hostname.indexOf('instagram.com') !== -1 ||
    url.hostname.indexOf('cdninstagram.com') !== -1 ||
    url.hostname.indexOf('googleapis.com') !== -1
  );
  if (skipCache) return; // Let the browser handle it normally

  // For HTML pages: network-first (so updates are visible immediately on refresh)
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').indexOf('text/html') !== -1) {
    event.respondWith(
      fetch(request)
        .then(function(response) {
          // Cache the fresh page for offline use
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
          return response;
        })
        .catch(function() {
          // Network failed — serve from cache if we have it
          return caches.match(request).then(function(cached) {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // For everything else (images, CSS, fonts): cache-first
  event.respondWith(
    caches.match(request).then(function(cached) {
      if (cached) return cached;
      return fetch(request).then(function(response) {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
        return response;
      }).catch(function() {
        // Both cache and network failed — give up gracefully
        return new Response('', { status: 503, statusText: 'Service unavailable' });
      });
    })
  );
});
