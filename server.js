/* SONORA — zero-dependency local web server and small metadata proxy. */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const USER_AGENT = 'SonoraMusic/1.0 (local personal music player)';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const apiCache = new Map();
const CACHE_TTL = 1000 * 60 * 12;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function cacheGet(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    apiCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value, ttl = CACHE_TTL) {
  apiCache.set(key, { value, expires: Date.now() + ttl });
  if (apiCache.size > 250) {
    const oldest = apiCache.keys().next().value;
    apiCache.delete(oldest);
  }
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .trim();
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]);
  }
  return '';
}

function pageTitle(html) {
  const title = metaContent(html, 'og:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  return decodeHtml(String(title).replace(/\s+/g, ' ').trim());
}

function isPrivateHost(hostname = '') {
  const host = hostname.toLowerCase();
  if (!host) return true;
  if (['localhost', '0.0.0.0', '::1', '127.0.0.1'].includes(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const m = host.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^\[?::ffff:/i.test(host)) return true;
  return false;
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      ...options,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'vi,en;q=0.8',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}, limit = 900_000) {
  const response = await fetchWithTimeout(url, options, 12000);
  if (!response.ok) throw new Error(`Remote server returned ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > limit) throw new Error('Remote page too large');
  const text = await response.text();
  return text.slice(0, limit);
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options, 12000);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`Remote server returned ${response.status}`);
    error.status = response.status;
    error.body = text.slice(0, 200);
    throw error;
  }
  return response.json();
}

function platformFromUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) return 'youtube';
  if (host.endsWith('spotify.com')) return 'spotify';
  if (host.endsWith('soundcloud.com')) return 'soundcloud';
  if (host.endsWith('suno.com') || host.endsWith('suno.ai')) return 'suno';
  if (host.endsWith('bandcamp.com')) return 'bandcamp';
  if (host.endsWith('audiomack.com')) return 'audiomack';
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) return 'vimeo';
  return 'generic';
}

function getYoutubeId(parsed) {
  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
  if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) return parts[1] || '';
  return '';
}

function ogMetadata(html, url) {
  return {
    title: pageTitle(html),
    artist: metaContent(html, 'og:site_name') || metaContent(html, 'twitter:site') || new URL(url).hostname.replace(/^www\./, ''),
    album: '',
    cover: metaContent(html, 'og:image') || metaContent(html, 'twitter:image'),
    description: metaContent(html, 'og:description') || metaContent(html, 'description'),
    previewUrl: metaContent(html, 'og:audio') || metaContent(html, 'og:audio:url') || metaContent(html, 'twitter:player:stream'),
    embedUrl: metaContent(html, 'og:video') || metaContent(html, 'og:video:url') || metaContent(html, 'twitter:player'),
    accent: ''
  };
}

async function fetchSpotifyMetadata(parsed) {
  const parts = parsed.pathname.split('/').filter(Boolean).filter((part) => !part.startsWith('intl-'));
  const [type, id] = parts;
  if (!type || !id) throw new Error('Liên kết Spotify không hợp lệ.');
  if (type !== 'track' && type !== 'episode') {
    throw new Error('Hiện tại SONORA hỗ trợ từng bài hát Spotify. Hãy dán liên kết /track/.');
  }
  let embedEntity = null;
  try {
    const html = await fetchText(`https://open.spotify.com/embed/${type}/${id}`);
    const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (match) {
      const data = JSON.parse(match[1]);
      embedEntity = data?.props?.pageProps?.state?.data?.entity || null;
    }
  } catch (error) {
    console.warn('Spotify embed metadata:', error.message);
  }
  if (!embedEntity) {
    const oembed = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.href)}`);
    return {
      title: oembed.title || 'Spotify track',
      artist: '',
      cover: oembed.thumbnail_url || '',
      description: '',
      provider: 'spotify',
      type: 'spotify',
      previewUrl: '',
      embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
      accent: '',
      sourceId: id
    };
  }
  const images = embedEntity.visualIdentity?.image || [];
  const accent = embedEntity.visualIdentity?.backgroundBase
    ? `#${[embedEntity.visualIdentity.backgroundBase.red, embedEntity.visualIdentity.backgroundBase.green, embedEntity.visualIdentity.backgroundBase.blue].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`
    : '';
  return {
    title: embedEntity.title || embedEntity.name || 'Spotify track',
    artist: (embedEntity.artists || []).map((a) => a.name).join(', '),
    album: '',
    cover: images.at(-1)?.url || images[0]?.url || '',
    description: metaContent('', 'og:description'),
    provider: 'spotify',
    type: embedEntity.type || type,
    duration: embedEntity.duration ? Math.round(embedEntity.duration / 1000) : 0,
    previewUrl: embedEntity.audioPreview?.url || '',
    embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
    accent,
    sourceId: id,
    playable: Boolean(embedEntity.audioPreview?.url)
  };
}

async function fetchYoutubeMetadata(parsed) {
  const videoId = getYoutubeId(parsed);
  if (!videoId) throw new Error('Không tìm thấy ID video YouTube.');
  const oembed = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.href)}&format=json`);
  return {
    title: oembed.title || 'YouTube video',
    artist: oembed.author_name || '',
    album: '',
    cover: oembed.thumbnail_url || '',
    description: '',
    provider: parsed.hostname === 'music.youtube.com' ? 'youtube-music' : 'youtube',
    type: 'youtube',
    previewUrl: '',
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    sourceId: videoId,
    playable: true
  };
}

async function fetchSoundCloudMetadata(parsed) {
  try {
    const oembed = await fetchJson(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(parsed.href)}`);
    return {
      title: oembed.title || 'SoundCloud track',
      artist: oembed.author_name || '',
      cover: oembed.thumbnail_url || '',
      description: '',
      provider: 'soundcloud',
      type: 'embed',
      previewUrl: '',
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(parsed.href)}&color=%23ff6b9a&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`,
      playable: true
    };
  } catch {
    const html = await fetchText(parsed.href);
    const meta = ogMetadata(html, parsed.href);
    return { ...meta, provider: 'soundcloud', type: 'embed', playable: true };
  }
}

async function fetchPageMetadata(parsed, provider) {
  const html = await fetchText(parsed.href);
  const meta = ogMetadata(html, parsed.href);
  if (!meta.title && !meta.cover) throw new Error('Không đọc được thông tin từ trang này.');
  let previewUrl = meta.previewUrl;
  if (previewUrl && previewUrl.startsWith('//')) previewUrl = `https:${previewUrl}`;
  if (previewUrl && !/^https?:/i.test(previewUrl)) previewUrl = '';
  let embedUrl = meta.embedUrl;
  if (embedUrl && embedUrl.startsWith('//')) embedUrl = `https:${embedUrl}`;
  if (embedUrl && !/^https?:/i.test(embedUrl)) embedUrl = '';
  return {
    ...meta,
    previewUrl,
    embedUrl,
    provider,
    type: previewUrl ? 'audio' : (embedUrl ? 'embed' : 'external'),
    playable: Boolean(previewUrl || embedUrl),
    title: meta.title || parsed.hostname
  };
}

async function handleMetadata(req, res, requestUrl) {
  const raw = requestUrl.searchParams.get('url') || '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return sendError(res, 400, 'URL không hợp lệ.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateHost(parsed.hostname)) {
    return sendError(res, 400, 'Chỉ hỗ trợ liên kết công khai http/https.');
  }
  const key = `meta:${parsed.href}`;
  const cached = cacheGet(key);
  if (cached) return sendJson(res, 200, cached);
  const platform = platformFromUrl(parsed.href);
  try {
    let metadata;
    if (platform === 'youtube') metadata = await fetchYoutubeMetadata(parsed);
    else if (platform === 'spotify') metadata = await fetchSpotifyMetadata(parsed);
    else if (platform === 'soundcloud') metadata = await fetchSoundCloudMetadata(parsed);
    else metadata = await fetchPageMetadata(parsed, platform);
    metadata.url = parsed.href;
    metadata.platform = platform;
    cacheSet(key, metadata);
    sendJson(res, 200, metadata);
  } catch (error) {
    console.warn(`Metadata failed (${platform}):`, error.message);
    const knownHost = new URL(parsed.href).hostname.replace(/^www\./, '');
    if (platform === 'generic') {
      // A generic URL still deserves a graceful fallback so the user can save it.
      return sendJson(res, 200, {
        title: knownHost,
        artist: '',
        cover: '',
        description: 'Không đọc được metadata tự động. Bạn có thể nhập tên bài hát bên dưới.',
        provider: 'generic',
        platform,
        url: parsed.href,
        type: 'external',
        playable: false,
        warning: 'Không thể đọc metadata tự động.'
      });
    }
    return sendError(res, 422, 'Không lấy được thông tin bài hát. Bạn vẫn có thể nhập thủ công.');
  }
}

function normalizeForMatch(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\((?:official|lyrics?|audio|video|visualizer|remaster|live)[^)]*\)/g, '')
    .replace(/\[(?:official|lyrics?|audio|video|visualizer|remaster|live)[^\]]*\]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(raw = '') {
  let title = String(raw)
    .replace(/\((?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|visualizer|mv|m\/v)[^)]*\)/gi, '')
    .replace(/\[(?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|visualizer|mv|m\/v)[^\]]*\]/gi, '')
    .replace(/\s*[|•]\s*(?:official|lyrics?|visualizer).*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return title;
}

async function lrclibGet(params) {
  const url = `https://lrclib.net/api/get?${params.toString()}`;
  let response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 10000);
  if (response.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 10000);
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`LRCLIB ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function lrclibSearch(query) {
  const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
  let response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 12000);
  if (response.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 12000);
  }
  if (!response.ok) return [];
  const results = await response.json();
  return Array.isArray(results) ? results : [];
}

function pickLyricsResult(results, { track, artist, duration }) {
  if (!results.length) return null;
  const nt = normalizeForMatch(track);
  const na = normalizeForMatch(artist);
  const scored = results.map((item) => {
    let score = 0;
    const itemTitle = normalizeForMatch(item.trackName);
    const itemArtist = normalizeForMatch(item.artistName);
    if (itemTitle === nt) score += 8;
    else if (nt && itemTitle.includes(nt)) score += 5;
    else if (nt && nt.includes(itemTitle)) score += 4;
    if (na && itemArtist === na) score += 8;
    else if (na && (itemArtist.includes(na) || na.includes(itemArtist))) score += 4;
    if (item.syncedLyrics) score += 3;
    if (item.plainLyrics) score += 1;
    if (item.instrumental) score -= 1;
    if (duration && item.duration) {
      const diff = Math.abs(Number(item.duration) - Number(duration));
      if (diff < 3) score += 4;
      else if (diff < 10) score += 2;
      else if (diff > 25) score -= 3;
    }
    return { item, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.item || null;
}

function lyricsResponse(item) {
  return {
    id: item.id,
    trackName: item.trackName,
    artistName: item.artistName,
    albumName: item.albumName,
    duration: item.duration,
    instrumental: Boolean(item.instrumental),
    plainLyrics: item.plainLyrics || '',
    syncedLyrics: item.syncedLyrics || '',
    source: 'LRCLIB'
  };
}

async function handleLyrics(req, res, requestUrl) {
  const rawTrack = (requestUrl.searchParams.get('track') || '').trim();
  const rawArtist = (requestUrl.searchParams.get('artist') || '').trim();
  const album = (requestUrl.searchParams.get('album') || '').trim();
  const durationRaw = requestUrl.searchParams.get('duration') || '';
  const directQuery = (requestUrl.searchParams.get('q') || '').trim();
  const listMode = requestUrl.searchParams.get('list') === '1';
  if (!rawTrack && !directQuery) return sendError(res, 400, 'Thiếu tên bài hát để tìm lời.');

  const track = cleanTitle(rawTrack) || rawTrack;
  const artist = rawArtist.replace(/vevo$/i, '').replace(/\s*-\s*topic$/i, '').trim();
  const duration = Number(durationRaw) || 0;
  const cacheKey = `lyrics:${track}|${artist}|${album}|${duration}|${directQuery}`;
  const cached = cacheGet(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  try {
    if (listMode) {
      const primaryQuery = directQuery || [track, artist].filter(Boolean).join(' ');
      if (!primaryQuery) return sendError(res, 400, 'Chưa có tên bài hát để dò lời.');
      const listKey = `lyrics:list:${primaryQuery}|${artist}|${duration}`;
      const cachedList = cacheGet(listKey);
      if (cachedList) return sendJson(res, 200, cachedList);
      let results = await lrclibSearch(primaryQuery);
      if (!results.length && artist) results = await lrclibSearch(track);
      const items = results
        .filter((item) => item && (item.plainLyrics || item.syncedLyrics))
        .slice(0, 12)
        .map((item) => {
          const payload = lyricsResponse(item);
          const plain = String(item.plainLyrics || item.syncedLyrics || '')
            .replace(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/g, '')
            .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(' · ')
            .slice(0, 190);
          return {
            ...payload,
            synced: Boolean(item.syncedLyrics),
            excerpt: plain
          };
        });
      const payload = { items, query: primaryQuery, source: 'LRCLIB' };
      cacheSet(listKey, payload, 1000 * 60 * 30);
      return sendJson(res, 200, payload);
    }

    if (directQuery) {
      const results = await lrclibSearch(directQuery);
      const best = pickLyricsResult(results, { track: directQuery, artist: '', duration });
      if (!best) return sendError(res, 404, 'Không tìm thấy lời phù hợp.');
      const payload = lyricsResponse(best);
      cacheSet(cacheKey, payload, 1000 * 60 * 30);
      return sendJson(res, 200, payload);
    }

    const exactParams = new URLSearchParams({
      track_name: track,
      artist_name: artist || 'Unknown artist'
    });
    if (album) exactParams.set('album_name', album);
    if (duration) exactParams.set('duration', String(Math.round(duration)));
    let exact = null;
    try {
      exact = await lrclibGet(exactParams);
    } catch (error) {
      if (error.status && error.status !== 429) console.warn('LRCLIB exact lookup:', error.message);
    }
    if (exact && (exact.plainLyrics || exact.syncedLyrics || exact.instrumental)) {
      const payload = lyricsResponse(exact);
      cacheSet(cacheKey, payload, 1000 * 60 * 30);
      return sendJson(res, 200, payload);
    }

    const searches = [
      [track, artist].filter(Boolean).join(' '),
      rawTrack,
      artist ? `${track} ${artist}` : ''
    ].filter((q, index, list) => q && list.indexOf(q) === index);
    for (const query of searches) {
      const results = await lrclibSearch(query);
      const best = pickLyricsResult(results, { track, artist, duration });
      if (best && !best.instrumental && (best.plainLyrics || best.syncedLyrics)) {
        const payload = lyricsResponse(best);
        payload.matchedFrom = 'search';
        cacheSet(cacheKey, payload, 1000 * 60 * 30);
        return sendJson(res, 200, payload);
      }
      if (best?.instrumental) {
        const payload = lyricsResponse(best);
        cacheSet(cacheKey, payload, 1000 * 60 * 30);
        return sendJson(res, 200, payload);
      }
    }
    sendError(res, 404, 'Không tìm thấy lời cho bài này. Bạn có thể dán lời hoặc file .lrc.');
  } catch (error) {
    console.warn('Lyrics lookup failed:', error.message);
    sendError(res, 502, 'Máy chủ lời bài hát đang bận. Thử lại sau ít giây nhé.');
  }
}

async function handleSpotifyToken(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readRequestBody(req, 24_000));
  } catch {
    return sendError(res, 400, 'Invalid JSON body');
  }
  const grantType = String(payload?.grant_type || '');
  const clientId = String(payload?.client_id || '').trim();
  if (!clientId || clientId.length > 120) return sendError(res, 400, 'Missing Spotify client ID');
  const params = new URLSearchParams({ grant_type: grantType, client_id: clientId });
  if (grantType === 'authorization_code') {
    const code = String(payload?.code || '');
    const redirectUri = String(payload?.redirect_uri || '');
    const verifier = String(payload?.code_verifier || '');
    if (!code || !redirectUri || !verifier) return sendError(res, 400, 'Incomplete Spotify authorization payload');
    params.set('code', code);
    params.set('redirect_uri', redirectUri);
    params.set('code_verifier', verifier);
  } else if (grantType === 'refresh_token') {
    const refreshToken = String(payload?.refresh_token || '');
    if (!refreshToken) return sendError(res, 400, 'Missing Spotify refresh token');
    params.set('refresh_token', refreshToken);
  } else {
    return sendError(res, 400, 'Unsupported Spotify grant type');
  }
  try {
    const upstream = await fetchWithTimeout('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: params.toString()
    }, 12000);
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(text)
    });
    res.end(text);
  } catch (error) {
    sendError(res, 502, `Spotify token exchange failed: ${error.message}`);
  }
}

async function handleImageProxy(req, res, requestUrl) {
  const raw = requestUrl.searchParams.get('url') || '';
  let target;
  try {
    target = new URL(raw);
  } catch {
    return sendError(res, 400, 'Invalid image URL');
  }
  if (!['https:', 'http:'].includes(target.protocol) || isPrivateHost(target.hostname)) {
    return sendError(res, 400, 'Image host not allowed');
  }
  try {
    const upstream = await fetchWithTimeout(target.href, {
      headers: { Accept: 'image/*' }
    }, 12000);
    if (!upstream.ok) return sendError(res, 502, `Image server returned ${upstream.status}`);
    if (isPrivateHost(new URL(upstream.url).hostname)) return sendError(res, 400, 'Image redirect not allowed');
    const type = String(upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) return sendError(res, 415, 'Remote content is not an image');
    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > 6_000_000) return sendError(res, 413, 'Image is too large');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > 6_000_000) return sendError(res, 413, 'Image is too large');
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(buffer);
  } catch (error) {
    sendError(res, 502, `Image proxy failed: ${error.message}`);
  }
}

function readRequestBody(req, limit = 20_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(req, res, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    return sendError(res, 400, 'Bad path');
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error('not a file');
    const ext = path.extname(filePath).toLowerCase();
    const cacheControl = ['.mp3', '.mp4', '.svg', '.png', '.webp', '.woff2'].includes(ext)
      ? 'public, max-age=86400'
      : 'no-store';
    const contentType = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Cache-Control': cacheControl,
        'Accept-Ranges': 'bytes'
      });
      return res.end();
    }
    // Basic range support for audio/video seeking.
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [startRaw, endRaw] = range.replace('bytes=', '').split('-');
      const start = startRaw ? Number(startRaw) : 0;
      const end = endRaw ? Math.min(Number(endRaw), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': contentType,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': cacheControl,
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    if (requestUrl.pathname !== '/') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('SONORA root not found');
    }
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (requestUrl.pathname === '/api/spotify/token') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { Allow: 'POST, OPTIONS' });
      return res.end();
    }
    if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');
    return handleSpotifyToken(req, res);
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { Allow: 'GET, HEAD, OPTIONS' });
    return res.end();
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    return sendError(res, 405, 'Method not allowed');
  }
  try {
    if (requestUrl.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, name: 'SONORA', version: '1.0.0', time: new Date().toISOString() });
    }
    if (requestUrl.pathname === '/api/metadata') return await handleMetadata(req, res, requestUrl);
    if (requestUrl.pathname === '/api/lyrics') return await handleLyrics(req, res, requestUrl);
    if (requestUrl.pathname === '/api/image') return await handleImageProxy(req, res, requestUrl);
    return await serveStatic(req, res, requestUrl);
  } catch (error) {
    console.error('Request failed:', error);
    if (!res.headersSent) sendError(res, 500, 'Internal server error');
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  SONORA is playing at  http://localhost:${PORT}\n`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT to another value, e.g. PORT=4174 npm start`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
