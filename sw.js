/**
 * sw.js — Service Worker for Telugu IPTV
 * Caches app shell for instant startup + offline capability.
 * M3U playlists cached via Cache API (separate from IndexedDB).
 */

'use strict';

const CACHE_VER   = 'tiptv-v1';
const SHELL_CACHE = `${CACHE_VER}-shell`;
const M3U_CACHE   = `${CACHE_VER}-playlists`;

// App shell files to pre-cache
const SHELL_URLS = [
  './',
  './index.html',
  './m3u-worker.js',
];

// CDN resources to cache on first use
const CDN_ORIGINS = [
  'https://unpkg.com',
  'https://cdnjs.cloudflare.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// ── Install: pre-cache shell ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      cache.addAll(SHELL_URLS).catch(() => {
        // Non-fatal: some files may not exist yet
      })
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('tiptv-') && k !== SHELL_CACHE && k !== M3U_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache strategy ─────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // M3U playlist requests → Network-first, fallback to cache (1h TTL)
  if (
    url.pathname.endsWith('.m3u') ||
    url.pathname.endsWith('.m3u8') ||
    url.hostname.includes('iptv-org') ||
    url.hostname.includes('corsproxy') ||
    url.hostname.includes('allorigins')
  ) {
    event.respondWith(networkFirstM3u(event.request));
    return;
  }

  // CDN resources → Cache-first
  if (CDN_ORIGINS.some(o => event.request.url.startsWith(o))) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
    return;
  }

  // App shell (local HTML/JS) → Cache-first, update in background
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Everything else (stream URLs etc.) → pass through
  event.respondWith(fetch(event.request));
});

// ── Cache strategies ──────────────────────────────────────

async function staleWhileRevalidate(request) {
  const cache    = await caches.open(SHELL_CACHE);
  const cached   = await cache.match(request);
  const fetchPromise = fetch(request)
    .then(resp => { if (resp.ok) cache.put(request, resp.clone()); return resp; })
    .catch(() => null);
  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstM3u(request) {
  const cache = await caches.open(M3U_CACHE);
  try {
    const resp = await fetch(request, { signal: AbortSignal.timeout?.(20000) });
    if (resp.ok) {
      cache.put(request, resp.clone());
      return resp;
    }
  } catch { /* fall through to cache */ }
  const cached = await cache.match(request);
  if (cached) return cached;
  return new Response('#EXTM3U\n', { status: 200, headers: { 'Content-Type': 'application/x-mpegurl' } });
}

// ── Message: cache M3U text directly ─────────────────────
self.addEventListener('message', async ({ data }) => {
  if (data?.type === 'CACHE_M3U') {
    try {
      const cache = await caches.open(M3U_CACHE);
      const resp  = new Response(data.text, {
        headers: { 'Content-Type': 'application/x-mpegurl', 'X-Cached-At': Date.now().toString() },
      });
      await cache.put(data.url, resp);
    } catch { /* non-fatal */ }
  }
  if (data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
