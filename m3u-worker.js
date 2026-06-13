/**
 * m3u-worker.js — Web Worker for M3U parsing
 * Runs off the main thread so the UI never freezes on large playlists.
 *
 * Messages IN:
 *   { type: 'PARSE', id: string, text: string }
 *   { type: 'FETCH_AND_PARSE', id: string, url: string }
 *
 * Messages OUT:
 *   { type: 'RESULT',   id, channels: Array }
 *   { type: 'PROGRESS', id, pct: number, status: string }
 *   { type: 'ERROR',    id, message: string }
 */

'use strict';

const PROXIES = [
  u => u,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

function parseExtInf(line) {
  const safe = re => { try { return line.match(re)?.[1]?.trim() ?? ''; } catch { return ''; } };
  const lastComma = line.lastIndexOf(',');
  const displayName = lastComma >= 0 ? line.slice(lastComma + 1).trim() : '';
  return {
    id: '',
    name: (safe(/tvg-name="([^"]*)"/) || displayName || 'Unknown').trim(),
    logo: safe(/tvg-logo="([^"]*)"/),
    group: (safe(/group-title="([^"]*)"/) || 'General').trim(),
    language: safe(/tvg-language="([^"]*)"/),
    country: safe(/tvg-country="([^"]*)"/),
    url: '',
  };
}

function parseM3U(text, id) {
  const channels = [];
  let current = null;
  const lines = text.split('\n');
  const total = lines.length;

  for (let i = 0; i < total; i++) {
    // Progress every 5000 lines
    if (i % 5000 === 0) {
      self.postMessage({
        type: 'PROGRESS', id,
        pct: Math.round((i / total) * 80) + 10,
        status: `Parsing… ${channels.length} channels`,
      });
    }
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      current = parseExtInf(line);
    } else if (line.startsWith('#')) {
      continue;
    } else if (current && (line.startsWith('http') || line.startsWith('rtmp'))) {
      current.url = line;
      current.id  = `ch_${channels.length}`;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

async function fetchText(url) {
  for (const proxy of PROXIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const resp = await fetch(proxy(url), {
        signal: controller.signal,
        headers: { Accept: 'application/x-mpegurl, */*' },
      });
      clearTimeout(timer);
      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('#EXTINF') || text.includes('#EXTM3U')) return text;
      }
    } catch {
      clearTimeout(timer);
    }
  }
  return null;
}

self.onmessage = async ({ data }) => {
  const { type, id, text, url } = data;

  try {
    if (type === 'PARSE') {
      self.postMessage({ type: 'PROGRESS', id, pct: 10, status: 'Parsing…' });
      const channels = parseM3U(text, id);
      self.postMessage({ type: 'RESULT', id, channels });

    } else if (type === 'FETCH_AND_PARSE') {
      self.postMessage({ type: 'PROGRESS', id, pct: 5, status: 'Fetching…' });
      const content = await fetchText(url);
      if (!content) {
        self.postMessage({ type: 'ERROR', id, message: 'Failed to fetch playlist' });
        return;
      }
      self.postMessage({ type: 'PROGRESS', id, pct: 10, status: 'Parsing…' });
      const channels = parseM3U(content, id);
      self.postMessage({ type: 'RESULT', id, channels });
    }
  } catch (e) {
    self.postMessage({ type: 'ERROR', id, message: e.message });
  }
};
