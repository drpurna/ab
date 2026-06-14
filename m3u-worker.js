/**
 * m3u-worker.js — Web Worker for M3U parsing
 *
 * Updated protocol uses reqId (not sourceId) to prevent key collision
 * when the same source is parsed twice in rapid succession.
 *
 * Main → Worker:  { type:'PARSE', content, sourceId, reqId }
 * Worker → Main:  { type:'RESULT', channels, sourceId, reqId }
 *                 { type:'ERROR',  message, sourceId, reqId }
 */

self.onmessage = function(e) {
  const { type, content, sourceId, reqId } = e.data || {};

  if (type === 'PING') {
    self.postMessage({ type: 'PONG' });
    return;
  }

  if (type === 'PARSE') {
    try {
      const channels = parseM3U(content);
      self.postMessage({ type: 'RESULT', channels, sourceId, reqId });
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        message: String(err && err.message ? err.message : err),
        sourceId,
        reqId,
      });
    }
  }
};

function parseM3U(content) {
  if (!content || typeof content !== 'string') return [];
  const channels = [];
  let current    = null;
  const lines    = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      current = parseExtInf(line);
    } else if (line.startsWith('#')) {
      continue;
    } else if (current &&
      (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('rtp'))) {
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
  const lc          = line.lastIndexOf(',');
  const displayName = lc >= 0 ? line.slice(lc + 1).trim() : '';
  return {
    id:       '',
    url:      '',
    name:     (safe(/tvg-name="([^"]*)"/)     || displayName || 'Unknown').trim(),
    logo:      safe(/tvg-logo="([^"]*)"/),
    group:    (safe(/group-title="([^"]*)"/)  || 'General').trim(),
    language:  safe(/tvg-language="([^"]*)"/),
    country:   safe(/tvg-country="([^"]*)"/),
  };
}
