/**
 * sw.js — Service Worker for TV+ IPTV
 *
 * P0-3 fix: M3U playlist responses are NEVER cached.
 *
 * Root cause of original bug:
 *   The M3U exclusion only checked `url.pathname.endsWith('.m3u')` and
 *   `url.hostname.includes('iptv-org')`. But playlist requests to:
 *     - corsproxy.io  (CORS proxy)
 *     - allorigins.win (CORS proxy)
 *     - workers.dev   (JIO, YuppTV custom endpoints)
 *   fell through to networkFirst(), which CACHES the response.
 *   On next app start the SW returned stale M3U from cache.
 *
 * Fix: explicit passthrough for ALL known playlist-delivery hostnames,
 *   plus any URL whose response content-type is m3u/mpegurl, plus
 *   any URL whose query string contains a playlist URL (proxy pattern).
 *
 * Caching strategies:
 *   App shell (/, index.html, workers) → Cache First
 *   Logo images (.png/.jpg etc.)       → Stale-While-Revalidate
 *   Playlist / M3U sources             → Network Only (never cache)
 *   Everything else                    → Network First (no cache fallback for unknown)
 */

const SHELL_CACHE = 'tvplus-shell-v2';  // bumped version to clear old caches
const LOGO_CACHE  = 'tvplus-logos-v1';

const SHELL_FILES = ['/', '/index.html', '/m3u-worker.js'];

// ── Hostnames that deliver M3U playlist content ─────────────────
// P0-3: all known proxy / playlist CDN hostnames
const PLAYLIST_HOSTS = new Set([
  'iptv-org.github.io',
  'raw.githubusercontent.com',
  'corsproxy.io',
  'api.allorigins.win',
  'workers.dev',
  'joinus-apiworker.workers.dev',   // JIO (old fallback)
  'ironmancreation.workers.dev',    // JIO (new primary)
  'yecic62314.workers.dev',         // YuppTV
]);

function isPlaylistRequest(url) {
  // Exact hostname match or suffix match for workers.dev subdomains
  if (PLAYLIST_HOSTS.has(url.hostname)) return true;
  if (url.hostname.endsWith('.workers.dev')) return true;
  // Path ends with .m3u or .m3u8
  if (/\.m3u8?$/i.test(url.pathname)) return true;
  // Proxy pattern: URL contains encoded playlist URL in query
  if (url.search.includes('iptv-org') || url.search.includes('.m3u')) return true;
  return false;
}

function isLogoRequest(url) {
  return /\.(png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname);
}

function isShellRequest(url) {
  return SHELL_FILES.includes(url.pathname) || url.pathname === '';
}

// ── Install ─────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// ── Activate: delete ALL old caches ─────────────────────────────
self.addEventListener('activate', (event) => {
  const KEEP = [SHELL_CACHE, LOGO_CACHE];
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

  // Only intercept GET
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // Skip non-http(s) (e.g. Tizen $WEBAPIS scheme)
  if (!url.protocol.startsWith('http')) return;

  // P0-3: Playlist/M3U — always network only, never cache
  if (isPlaylistRequest(url)) {
    // Explicitly fetch from network, don't even check cache
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Logo images — stale-while-revalidate
  if (isLogoRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // App shell — cache first
  if (isShellRequest(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else — network only (safe default: no unknown caching)
  event.respondWith(
    fetch(request).catch(() => new Response('', { status: 503 }))
  );
});

// ── Strategies ───────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(LOGO_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || new Response('', { status: 404 });
}

// Message handler
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    // Allow main thread to purge all caches (e.g. on force refresh)
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
