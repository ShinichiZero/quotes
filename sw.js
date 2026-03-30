/**
 * sw.js — Saints & Wisdom Service Worker
 *
 * Strategy: Stale-While-Revalidate for all app assets.
 * Offline-first: serves from cache, then updates in background.
 *
 * Security:
 *  - Only caches same-origin responses.
 *  - Validates response status before caching.
 *  - Ignores opaque (cross-origin no-cors) responses.
 */

const CACHE_VERSION  = 'v3';
const STATIC_CACHE   = `saints-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE  = `saints-dynamic-${CACHE_VERSION}`;
const BASE_PATH      = new URL(self.registration.scope).pathname.replace(/\/$/, '');

function withBase(path) {
  return `${BASE_PATH}${path}`;
}

const STATIC_ASSETS = [
  `${BASE_PATH}/`,
  withBase('/index.html'),
  withBase('/manifest.json'),
  withBase('/css/app.css'),
  withBase('/js/app.js'),
  withBase('/js/quotes.js'),
  withBase('/js/crypto.js'),
  withBase('/js/db.js'),
  withBase('/js/platform.js'),
  withBase('/icons/icon-192.png'),
  withBase('/icons/icon-512.png'),
];

/* ── Install: pre-cache static assets ─────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Pre-cache partial failure:', err))
  );
});

/* ── Activate: prune old caches ─────────────────────────────── */
self.addEventListener('activate', (event) => {
  const keep = new Set([STATIC_CACHE, DYNAMIC_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !keep.has(k))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: Stale-While-Revalidate ───────────────────────────── */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests for same-origin or localhost
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(req) {
  const cacheName = isStaticAsset(req.url) ? STATIC_CACHE : DYNAMIC_CACHE;
  const cache     = await caches.open(cacheName);
  const cached    = await cache.match(req);

  // Revalidate in the background regardless
  const networkPromise = fetch(req.clone())
    .then(async (response) => {
      if (isCacheable(response)) {
        await cache.put(req, response.clone());
        // Notify clients that content was updated
        notifyClients({ type: 'CACHE_UPDATED', url: req.url });
      }
      return response;
    })
    .catch(() => null);  // network failure is silent when we have a cache hit

  // Return cached if available, otherwise await network
  return cached ?? (await networkPromise) ?? new Response(
    'Unable to load content. Please check your connection and try again.',
    {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }
  );
}

/** Only cache successful same-origin responses */
function isCacheable(response) {
  return (
    response &&
    response.status === 200 &&
    response.type !== 'opaque'   // reject cross-origin no-cors responses
  );
}

function isStaticAsset(url) {
  return STATIC_ASSETS.some(a => url.endsWith(a) || url.endsWith(a.replace(/^\//, '')));
}

/* ── Periodic Background Sync ────────────────────────────────── */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-quotes') {
    event.waitUntil(refreshQuotesCache());
  }
});

async function refreshQuotesCache() {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const quotesPath = withBase('/js/quotes.js');
    const response = await fetch(quotesPath);
    if (isCacheable(response)) {
      await cache.put(quotesPath, response);
    }
  } catch (err) {
    console.warn('[SW] Periodic sync fetch failed:', err);
  }
}

/* ── Message Handling ────────────────────────────────────────── */
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg?.type) return;

  switch (msg.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'REFRESH_QUOTES':
      refreshQuotesCache();
      break;
    default:
      break;
  }
});

/* ── Helpers ─────────────────────────────────────────────────── */
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => client.postMessage(message));
}
