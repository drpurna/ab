/**
 * sw.js — Service Worker for TV+ IPTV
 *
 * Caching strategies:
 *   App shell (/, workers)          → Cache First (immutable)
 *   Logo images (.png/.jpg etc.)    → Stale-While-Revalidate
 *   Playlists (iptv-org)            → Stale-While-Revalidate (pre-cached on install)
 *   Playlists (workers.dev)         → Network Only (ephemeral endpoints)
 *   Everything else                 → Network Only (safe default)
 *
 * Pre-caching: iptv-org playlist URLs are fetched during SW install
 * so the very first app load reads from cache instead of the network.
 * The app's IndexedDB cache still manages its own TTL independently.
 */

const SHELL_CACHE    = 'tvplus-shell-v2';
const LOGO_CACHE     = 'tvplus-logos-v1';
const PLAYLIST_CACHE = 'tvplus-playlists-v1';   // pre-cached on install

const SHELL_FILES = ['/', '/index.html', '/m3u-worker.js'];

// ── Pre-cached playlist URLs (stable iptv-org sources only) ────
// These are fetched during SW install so the first app load is instant.
// workers.dev URLs are NOT pre-cached (they change frequently).
const PRECACHED_PLAYLISTS = [
  'https://iptv-org.github.io/iptv/languages/tel.m3u',
  'https://iptv-org.github.io/iptv/countries/in.m3u',
];

// ── Hostnames that deliver M3U content ─────────────────────────
const WORKERS_DEV_HOSTS = new Set([
  'workers.dev',
  'joinus-apiworker.workers.dev',
  'ironmancreation.workers.dev',
  'yecic62314.workers.dev',
]);
const IPTV_ORG_HOSTS = new Set([
  'iptv-org.github.io',
  'raw.githubusercontent.com',
]);
const CORS_PROXY_HOSTS = new Set([
  'corsproxy.io',
  'api.allorigins.win',
]);

function isPlaylistRequest(url) {
  if (IPTV_ORG_HOSTS.has(url.hostname)) return true;
  if (CORS_PROXY_HOSTS.has(url.hostname)) return true;
  if (WORKERS_DEV_HOSTS.has(url.hostname)) return true;
  if (url.hostname.endsWith('.workers.dev')) return true;
  if (/\.m3u8?$/i.test(url.pathname)) return true;
  if (url.search.includes('iptv-org') || url.search.includes('.m3u')) return true;
  return false;
}

function isIptvOrgRequest(url) {
  return IPTV_ORG_HOSTS.has(url.hostname);
}

function isLogoRequest(url) {
  return /\.(png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname);
}

function isShellRequest(url) {
  return SHELL_FILES.includes(url.pathname) || url.pathname === '';
}

// ── Install: cache shell + pre-cache iptv-org playlists ────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => caches.open(PLAYLIST_CACHE))
      .then(cache => Promise.allSettled(
        PRECACHED_PLAYLISTS.map(url =>
          cache.add(url).catch(() => {/* swallow — non-critical */})
        )
      ))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ─────────────────────────────────
self.addEventListener('activate', (event) => {
  const KEEP = [SHELL_CACHE, LOGO_CACHE, PLAYLIST_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (!url.protocol.startsWith('http')) return;

  // ── Playlist requests ────────────────────────────────────────
  if (isPlaylistRequest(url)) {
    // iptv-org: stale-while-revalidate (pre-cached on install)
    if (isIptvOrgRequest(url)) {
      event.respondWith(staleWhileRevalidate(request, PLAYLIST_CACHE));
      return;
    }
    // workers.dev / CORS proxies: network only (never cache)
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // ── Logo images ───────────────────────────────────────────────
  if (isLogoRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, LOGO_CACHE));
    return;
  }

  // ── App shell ─────────────────────────────────────────────────
  if (isShellRequest(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // ── Everything else: network only ─────────────────────────────
  event.respondWith(
    fetch(request).catch(() => new Response('', { status: 503 }))
  );
});

// ── Strategies ───────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || new Response('', { status: 503 });
}

// ── Message handler ─────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
  if (event.data === 'REFRESH_PLAYLISTS') {
    // Clear playlist cache so next fetch goes to network
    caches.open(PLAYLIST_CACHE).then(cache => {
      cache.keys().then(keys => Promise.all(keys.map(k => cache.delete(k))));
    });
    // Re-fetch and cache
    caches.open(PLAYLIST_CACHE).then(cache =>
      Promise.allSettled(
        PRECACHED_PLAYLISTS.map(url =>
          fetch(url).then(r => { if (r.ok) cache.put(url, r); }).catch(() => {})
        )
      )
    );
  }
});
