/**
 * m3u-worker.js — Web Worker for M3U parsing
 * Runs off the main thread so large playlists (800+ channels)
 * don't freeze the UI during parsing.
 *
 * Protocol:
 *   Main → Worker:  { type: 'PARSE', content: string, sourceId: string }
 *   Worker → Main:  { type: 'RESULT', channels: [], sourceId: string }
 *                   { type: 'ERROR',  message: string, sourceId: string }
 */

self.onmessage = function(e) {
  const { type, content, sourceId } = e.data || {};

  if (type === 'PARSE') {
    try {
      const channels = parseM3U(content);
      self.postMessage({ type: 'RESULT', channels, sourceId });
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: String(err.message || err), sourceId });
    }
    return;
  }

  if (type === 'PING') {
    self.postMessage({ type: 'PONG' });
    return;
  }
};

function parseM3U(content) {
  if (!content || typeof content !== 'string') return [];
  const channels = [];
  let current = null;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      current = parseExtInf(line);
    } else if (line.startsWith('#')) {
      continue;
    } else if (current && (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('rtp'))) {
      current.url = line;
      current.id  = 'ch_' + channels.length;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

function parseExtInf(line) {
  function safe(re) {
    try { return (line.match(re) || [])[1] || ''; } catch { return ''; }
  }
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
