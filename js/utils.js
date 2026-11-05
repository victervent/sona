export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function formatTime(seconds, fallback = '0:00') {
  if (!Number.isFinite(seconds) || seconds < 0) return fallback;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatLongTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} phút ${String(s).padStart(2, '0')} giây`;
}

export function formatCount(n) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}K`;
  return String(n);
}

export function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeAttr(value = '') {
  return escapeHTML(value);
}

export function escapeRegExp(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function uid(prefix = 'id') {
  const rand = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export function debounce(fn, delay = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function throttle(fn, wait = 80) {
  let last = 0;
  let timer;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };
}

export function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function hashString(str = '') {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return '255, 255, 255';
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function rgba(hex, alpha = 1) {
  return `rgba(${hexToRgb(hex)}, ${alpha})`;
}

export function contrastColor(hex) {
  const [r, g, b] = hexToRgb(hex).split(',').map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? '#17151d' : '#fff9f3';
}

export function safeUrl(url, { allowData = false, allowBlob = true } = {}) {
  if (!url) return '';
  const trimmed = String(url).trim();
  try {
    const parsed = new URL(trimmed, location.href);
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href;
    if (allowBlob && parsed.protocol === 'blob:') return parsed.href;
    if (allowData && /^data:image\//i.test(trimmed)) return trimmed;
  } catch {
    return '';
  }
  return '';
}

export function normalizeUserUrl(raw = '') {
  let value = String(raw).trim();
  if (!value) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^(blob:|data:)/i.test(value)) {
    value = `https://${value}`;
  }
  return value;
}

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)(?:$|[?#])/i;
const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)(?:$|[?#])/i;

export function detectMediaFile(url = '') {
  const path = (() => {
    try { return new URL(url, location.href).pathname; } catch { return url; }
  })();
  if (AUDIO_EXT.test(path) || AUDIO_EXT.test(url)) return 'audio';
  if (VIDEO_EXT.test(path) || VIDEO_EXT.test(url)) return 'video';
  return '';
}

export function getYouTubeId(url = '') {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) return parts[1] || '';
    }
  } catch { /* noop */ }
  const raw = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return raw?.[1] || '';
}

export function getSpotifyInfo(url = '') {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (!host.endsWith('spotify.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean).filter((p) => !p.startsWith('intl-'));
    const [type, id] = parts;
    if (!['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(type) || !id) return null;
    return { type, id };
  } catch {
    const m = String(url).match(/spotify:(track|album|playlist|episode):([\w]+)/);
    return m ? { type: m[1], id: m[2] } : null;
  }
}

export function detectSource(rawUrl = '') {
  const url = normalizeUserUrl(rawUrl);
  const result = {
    url,
    source: 'other',
    type: 'external',
    id: '',
    embedUrl: '',
    directUrl: '',
    label: 'Liên kết',
    platform: 'other'
  };
  if (!url) return result;
  let parsed;
  try { parsed = new URL(url); } catch { return result; }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  const ytId = getYouTubeId(url);
  if (ytId) {
    result.id = ytId;
    result.source = host === 'music.youtube.com' ? 'youtube-music' : 'youtube';
    result.type = 'youtube';
    result.platform = 'youtube';
    result.label = result.source === 'youtube-music' ? 'YouTube Music' : 'YouTube';
    result.embedUrl = `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1`;
    return result;
  }

  const spotify = getSpotifyInfo(url);
  if (spotify) {
    result.source = 'spotify';
    result.platform = 'spotify';
    result.id = spotify.id;
    result.subtype = spotify.type;
    result.type = 'spotify';
    result.embedUrl = `https://open.spotify.com/embed/${spotify.type}/${spotify.id}?utm_source=generator&theme=0`;
    result.label = 'Spotify';
    return result;
  }

  if (host.endsWith('soundcloud.com')) {
    const clean = url.split('?')[0];
    result.source = 'soundcloud';
    result.type = 'embed';
    result.embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&color=%23ff6b9a&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`;
    result.platform = 'soundcloud';
    result.label = 'SoundCloud';
    return result;
  }

  if (host.endsWith('suno.com') || host.endsWith('suno.ai')) {
    const parts = parsed.pathname.split('/').filter(Boolean);
    const songIdx = parts.findIndex((p) => p === 'song');
    const id = songIdx >= 0 ? parts[songIdx + 1] : parts.at(-1);
    result.source = 'suno';
    result.type = 'embed';
    result.id = id || '';
    result.embedUrl = id ? `https://suno.com/embed/${id}` : url;
    result.platform = 'suno';
    result.label = 'Suno';
    return result;
  }

  if (host.endsWith('bandcamp.com')) {
    result.source = 'bandcamp';
    result.type = 'external';
    result.platform = 'bandcamp';
    result.label = 'Bandcamp';
    return result;
  }

  if (host.endsWith('audiomack.com')) {
    const parts = parsed.pathname.split('/').filter(Boolean);
    const songIdx = parts.findIndex((p) => p === 'song');
    const embedPath = songIdx >= 0 ? parts.slice(songIdx, songIdx + 3).join('/') : '';
    result.source = 'audiomack';
    result.type = 'embed';
    result.embedUrl = embedPath ? `https://audiomack.com/embed/${embedPath}?theme=dark` : url;
    result.platform = 'audiomack';
    result.label = 'Audiomack';
    return result;
  }

  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    const id = parsed.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part));
    result.source = 'vimeo';
    result.type = 'embed';
    result.id = id || '';
    result.embedUrl = id ? `https://player.vimeo.com/video/${id}?autoplay=1&badge=0&byline=0&title=0` : url;
    result.platform = 'vimeo';
    result.label = 'Vimeo';
    return result;
  }

  if (parsed.protocol === 'blob:') {
    result.source = 'local';
    result.type = 'audio';
    result.directUrl = url;
    result.platform = 'local';
    result.label = 'Tệp cục bộ';
    return result;
  }

  const extensionType = detectMediaFile(url);
  if (extensionType) {
    result.type = extensionType;
    result.directUrl = url;
    result.source = extensionType === 'video' ? 'mp4' : 'mp3';
    result.platform = extensionType;
    result.label = extensionType === 'video' ? 'Video trực tiếp' : 'Âm thanh trực tiếp';
    return result;
  }

  result.type = 'external';
  result.platform = 'other';
  result.label = host.replace(/^www\./, '');
  return result;
}

export function makeCover(title = 'Untitled', artist = '', seed = '') {
  const hash = hashString(`${title}${artist}${seed}`);
  const hue = hash % 360;
  const hue2 = (hue + 54 + (hash % 60)) % 360;
  const hue3 = (hue + 210) % 360;
  const initials = (title.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || 'S').toUpperCase();
  const safeTitle = escapeHTML(title.slice(0, 24));
  const safeArtist = escapeHTML(artist.slice(0, 24));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${hue} 76% 55%)"/>
        <stop offset=".52" stop-color="hsl(${hue2} 68% 36%)"/>
        <stop offset="1" stop-color="hsl(${hue3} 64% 14%)"/>
      </linearGradient>
      <radialGradient id="r"><stop offset="0" stop-color="white" stop-opacity=".75"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>
      <filter id="b"><feGaussianBlur stdDeviation="32"/></filter>
      <filter id="n"><feTurbulence baseFrequency=".8" numOctaves="3"/><feComponentTransfer><feFuncA type="table" tableValues="0 .13"/></feComponentTransfer></filter>
    </defs>
    <rect width="720" height="720" fill="url(#g)"/>
    <circle cx="${160 + hash % 100}" cy="${160 + hash % 70}" r="190" fill="url(#r)" filter="url(#b)" opacity=".6"/>
    <circle cx="540" cy="520" r="270" fill="none" stroke="white" stroke-opacity=".15" stroke-width="1"/>
    <circle cx="540" cy="520" r="215" fill="none" stroke="white" stroke-opacity=".12" stroke-width="1"/>
    <circle cx="540" cy="520" r="160" fill="none" stroke="white" stroke-opacity=".09" stroke-width="1"/>
    <path d="M-40 610 C160 440 300 690 480 540 S700 400 800 500" fill="none" stroke="white" stroke-opacity=".22" stroke-width="1.2"/>
    <text x="64" y="640" font-family="Segoe UI, Arial" font-size="168" font-weight="700" fill="white" fill-opacity=".92">${escapeHTML(initials)}</text>
    <text x="64" y="88" font-family="Segoe UI, Arial" font-size="15" letter-spacing="5" fill="white" fill-opacity=".75">${safeArtist.toUpperCase()}</text>
    <text x="64" y="690" font-family="Segoe UI, Arial" font-size="16" letter-spacing="2" fill="white" fill-opacity=".75">${safeTitle}</text>
    <rect width="720" height="720" filter="url(#n)" opacity=".7"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function cleanTrackTitle(raw = '') {
  let title = String(raw)
    .replace(/\((?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|visualizer|mv|m\/v)[^)]*\)/gi, '')
    .replace(/\[(?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|visualizer|mv|m\/v)[^\]]*\]/gi, '')
    .replace(/\s*[|•]\s*(?:official|lyrics?|visualizer).*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!title) title = String(raw);
  return title;
}

export function parseTitleArtist(rawTitle = '', fallbackArtist = '') {
  const title = String(rawTitle).trim();
  const cleaned = cleanTrackTitle(title);
  const separators = [' - ', ' – ', ' — ', ' • '];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      const [left, ...rest] = cleaned.split(sep);
      if (left.length > 1 && rest.join(sep).length > 1) {
        return { artist: left.trim(), title: rest.join(sep).trim() };
      }
    }
  }
  return { artist: fallbackArtist || 'Unknown artist', title: cleaned || 'Untitled' };
}

export function titleCase(str = '') {
  return str.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

export function greetingForHour(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 11) return { text: 'Chào buổi sáng', icon: 'sun' };
  if (hour >= 11 && hour < 14) return { text: 'Chào buổi trưa', icon: 'sun' };
  if (hour >= 14 && hour < 18) return { text: 'Chào buổi chiều', icon: 'sun' };
  return { text: 'Chào buổi tối', icon: 'moon' };
}

export function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function relativeDate(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const day = 86400000;
  if (diff < 60_000) return 'vừa xong';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} phút trước`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)} giờ trước`;
  if (diff < day * 7) return `${Math.floor(diff / day)} ngày trước`;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' }).format(timestamp);
}

export function sumDuration(tracks) {
  return tracks.reduce((sum, t) => sum + (Number(t?.duration) || 0), 0);
}

export function totalDurationLabel(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h) return `${h} giờ ${m} phút`;
  return `${Math.max(1, m)} phút`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
