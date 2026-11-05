import { clamp, escapeHTML } from './utils.js';

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG_G = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function fractionToSeconds(frac) {
  if (!frac) return 0;
  if (frac.length === 1) return Number(frac) / 10;
  if (frac.length === 2) return Number(frac) / 100;
  return Number(frac) / 1000;
}

function tagToSeconds(minutes, seconds, fraction) {
  return Number(minutes) * 60 + Number(seconds) + fractionToSeconds(fraction);
}

function parseWordTimings(content, fallbackTime, offsetSeconds) {
  const matches = [...content.matchAll(WORD_TAG_G)];
  if (!matches.length) return null;
  const words = [];
  const lead = content.slice(0, matches[0].index).replace(WORD_TAG, '').replace(/\s+/g, ' ').trim();
  if (lead) words.push({ time: Math.max(0, fallbackTime), text: lead });
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextIndex = matches[index + 1]?.index ?? content.length;
    const text = content
      .slice(match.index + match[0].length, nextIndex)
      .replace(WORD_TAG, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const time = tagToSeconds(match[1], match[2], match[3]) + offsetSeconds;
    words.push({ time: Math.max(0, time), text });
  }
  return words.length ? words : null;
}

export function parseLrc(text = '') {
  const lines = [];
  if (!text) return lines;
  let offsetSeconds = 0;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const offsetMatch = line.match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
    if (offsetMatch) {
      offsetSeconds = Number(offsetMatch[1]) / 1000;
      continue;
    }
    if (/^\[(ar|al|ti|by|re|ve|length):/i.test(line)) continue;
    const tags = [...line.matchAll(TIME_TAG)];
    if (!tags.length) continue;
    const rawContent = line.replace(TIME_TAG, '').trim();
    const content = rawContent.replace(WORD_TAG, '').replace(/\s+/g, ' ').trim();
    if (!content) continue;
    for (const match of tags) {
      const time = Math.max(0, tagToSeconds(match[1], match[2], match[3]) + offsetSeconds);
      const words = parseWordTimings(rawContent, time, offsetSeconds);
      const entry = { time, text: words ? words.map((word) => word.text).join(' ') : content };
      if (words) entry.words = words;
      lines.push(entry);
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

export function plainToTimed(text = '', duration = 0) {
  const rawLines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rawLines.length) return [];
  if (!duration || duration < 10) return rawLines.map((line) => ({ time: null, text: line }));
  const start = Math.min(10, Math.max(3, duration * 0.07));
  const endPad = Math.min(8, duration * 0.06);
  const span = Math.max(1, duration - start - endPad);
  const step = span / rawLines.length;
  return rawLines.map((text, index) => ({
    time: Number((start + index * step).toFixed(2)),
    text,
    estimated: true
  }));
}

export function parseLyrics(text, duration = 0) {
  const timed = parseLrc(text);
  if (timed.length) return timed;
  const cleaned = String(text || '').replace(TIME_TAG, '').replace(WORD_TAG, '').trim();
  if (!cleaned || /^\[?instrumental\]?$/i.test(cleaned)) return [];
  return plainToTimed(cleaned, duration);
}

export function findActiveLyricIndex(lines, currentTime, offset = 0) {
  if (!lines?.length || !Number.isFinite(currentTime)) return -1;
  const time = currentTime - offset;
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const lineTime = lines[mid].time;
    if (lineTime == null) return -1;
    if (lineTime <= time + 0.05) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

export function renderLyricLines(lines, { compact = false, offset = 0 } = {}) {
  if (!lines?.length) {
    return `<div class="lyrics-empty">
      <div class="lyrics-empty-orb"><span></span><span></span><span></span></div>
      <strong>Chưa có lời cho bài này</strong>
      <p>Tìm tự động từ LRCLIB hoặc dán file LRC để chạy lời theo nhạc.</p>
    </div>`;
  }
  return lines.map((line, index) => {
    const time = line.time == null ? '' : Math.max(0, line.time + offset).toFixed(2);
    const clickable = line.time != null;
    const hasWords = Array.isArray(line.words) && line.words.length > 0;
    const content = hasWords
      ? line.words.map((word, wordIndex) => {
        const wordTime = Math.max(0, Number(word.time) + offset).toFixed(2);
        return `<span class="lyric-word" data-word-index="${wordIndex}" data-word-time="${wordTime}">${escapeHTML(word.text)}</span>`;
      }).join(' ')
      : escapeHTML(line.text);
    return `<button type="button" class="lyric-line${hasWords ? ' has-words' : ''}${line.estimated ? ' is-estimated' : ''}${clickable ? ' is-clickable' : ''}" data-lyric-index="${index}" data-lyric-time="${time}" ${clickable ? '' : 'disabled'} tabindex="${clickable ? '0' : '-1'}">
      <span class="lyric-text">${content}</span>
    </button>`;
  }).join('');
}

export function lyricsRecognition(lines = []) {
  const total = Array.isArray(lines) ? lines.length : 0;
  const timed = total ? lines.filter((line) => line.time != null).length : 0;
  const wordSynced = total ? lines.some((line) => Array.isArray(line.words) && line.words.length) : false;
  const estimated = total ? lines.some((line) => line.estimated) : false;
  let label = 'Chưa nhận diện';
  let tone = 'idle';
  if (wordSynced) {
    label = 'Word sync';
    tone = 'word';
  } else if (estimated) {
    label = 'Ước lượng';
    tone = 'estimated';
  } else if (timed) {
    label = 'Đã đồng bộ';
    tone = 'synced';
  } else if (total) {
    label = 'Lời thường';
    tone = 'plain';
  }
  return { total, timed, wordSynced, estimated, synced: timed > 0, label, tone };
}

export async function fetchLyrics(track) {
  const params = new URLSearchParams({
    track: track.title || '',
    artist: track.artist || '',
    album: track.album || '',
    duration: track.duration ? String(Math.round(track.duration)) : ''
  });
  const response = await fetch(`/api/lyrics?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    let message = 'Không tìm thấy lời bài hát.';
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch { /* noop */ }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function searchLyricsCandidates({ track = '', artist = '', duration = 0, q = '' } = {}) {
  const params = new URLSearchParams({
    list: '1',
    track: String(track || '').trim(),
    artist: String(artist || '').trim()
  });
  if (duration) params.set('duration', String(Math.round(duration)));
  if (q) params.set('q', String(q).trim());
  const response = await fetch(`/api/lyrics?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    let message = 'Không dò được lời bài hát.';
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch { /* noop */ }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  return Array.isArray(payload?.items) ? payload.items : [];
}

export function lyricsPayloadToText(payload) {
  if (!payload) return { text: '', synced: false };
  if (payload.syncedLyrics) return { text: payload.syncedLyrics, synced: true };
  if (payload.plainLyrics) return { text: payload.plainLyrics, synced: false };
  return { text: '', synced: false };
}

export function normalizeOffset(value) {
  return Number(clamp(Number(value) || 0, -20, 20).toFixed(1));
}

export function lyricProgress(lines, currentTime, offset = 0) {
  if (!lines?.length) return 0;
  const idx = findActiveLyricIndex(lines, currentTime, offset);
  if (idx < 0) return 0;
  const start = lines[idx].time;
  const end = lines[idx + 1]?.time ?? (start + 6);
  if (!Number.isFinite(start) || end <= start) return 1;
  return clamp((currentTime - offset - start) / (end - start), 0, 1);
}
