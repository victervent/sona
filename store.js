/* SONORA — persistent state, catalogue selectors and queue logic. */
import {
  DEMO_TRACKS,
  INITIAL_PLAYLISTS,
  INITIAL_LIKED,
  INITIAL_HISTORY,
  PLAYLIST_COLORS,
  MOODS
} from './data.js';
import {
  debounce,
  getSpotifyInfo,
  hashString,
  makeCover,
  shuffleArray,
  sumDuration,
  uid
} from './utils.js';

const STORAGE_KEY = 'sonora.state.v2';
const MAX_HISTORY = 80;

const sessionTracks = new Map();
const DEFAULT_PALETTES = ['auto', 'aurora', 'ember', 'ocean', 'mono'];

export { PLAYLIST_COLORS };

export const PALETTES = DEFAULT_PALETTES;

function defaultSettings() {
  return {
    name: 'Nguyên',
    volume: 0.72,
    muted: false,
    shuffle: false,
    repeat: 'off',
    palette: 'auto',
    visualizer: true,
    autoLyrics: true,
    motion: 'full',
    rate: 1,
    spotifyClientId: '',
    spotifyFullPlayback: true,
    youtubeQuality: 'auto',
    autoplaySimilar: true
  };
}

function createDefaultState() {
  const tracks = {};
  const trackOrder = [];
  for (const track of DEMO_TRACKS) {
    tracks[track.id] = { ...track, colors: [...(track.colors || [])], tags: [...(track.tags || [])] };
    trackOrder.push(track.id);
  }
  const contextTracks = [...trackOrder];
  return {
    version: 2,
    createdAt: Date.now(),
    tracks,
    trackOrder,
    playlists: INITIAL_PLAYLISTS.map((playlist) => ({
      ...playlist,
      trackIds: [...playlist.trackIds],
      colors: [...playlist.colors]
    })),
    liked: [...INITIAL_LIKED],
    history: [...INITIAL_HISTORY],
    recentSearches: [],
    queue: [],
    currentId: DEMO_TRACKS[0]?.id || null,
    context: {
      type: 'home',
      id: 'home',
      label: 'Vũ trụ của bạn',
      trackIds: contextTracks
    },
    order: [...contextTracks],
    orderPos: 0,
    lyricsOffsets: {},
    lyricsCache: {},
    settings: defaultSettings(),
    stats: {
      plays: 168,
      minutes: 42,
      since: Date.now() - 1000 * 60 * 60 * 24 * 128
    }
  };
}

function safeParse(raw) {
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function normalizeTrack(track) {
  if (!track || typeof track !== 'object' || !track.id) return null;
  const normalized = {
    ...track,
    title: String(track.title || 'Không tên').slice(0, 220),
    artist: String(track.artist || 'Unknown artist').slice(0, 160),
    album: String(track.album || 'SONORA').slice(0, 160),
    colors: Array.isArray(track.colors) && track.colors.length ? track.colors.slice(0, 4) : ['#ff6b9a', '#8b5cf6', '#5ee8c1'],
    tags: Array.isArray(track.tags) ? track.tags.slice(0, 12) : [],
    duration: Math.max(0, Number(track.duration) || 0),
    addedAt: Number(track.addedAt) || Date.now(),
    plays: Math.max(0, Number(track.plays) || 0)
  };
  if (!normalized.cover) normalized.cover = makeCover(normalized.title, normalized.artist, normalized.id);
  if (normalized.source === 'spotify' && normalized.type !== 'spotify') {
    const spotifyInfo = getSpotifyInfo(normalized.url || '');
    if (spotifyInfo) {
      normalized.previewUrl = normalized.previewUrl || (normalized.type === 'audio' ? normalized.src : '');
      normalized.spotifyId = normalized.spotifyId || spotifyInfo.id;
      normalized.spotifyType = normalized.spotifyType || spotifyInfo.type;
      normalized.embedUrl = normalized.embedUrl || `https://open.spotify.com/embed/${spotifyInfo.type}/${spotifyInfo.id}?utm_source=generator&theme=0`;
      normalized.type = 'spotify';
    }
  }
  if (normalized.source === 'local' || normalized.type === 'local') normalized.ephemeral = true;
  return normalized;
}

function sanitizeState(raw) {
  const base = createDefaultState();
  if (!raw) return base;
  const state = {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    stats: { ...base.stats, ...(raw.stats || {}) },
    lyricsOffsets: raw.lyricsOffsets && typeof raw.lyricsOffsets === 'object' ? raw.lyricsOffsets : {},
    lyricsCache: raw.lyricsCache && typeof raw.lyricsCache === 'object' ? raw.lyricsCache : {}
  };

  state.settings.repeat = ['off', 'all', 'one'].includes(state.settings.repeat) ? state.settings.repeat : 'off';
  state.settings.palette = DEFAULT_PALETTES.includes(state.settings.palette) ? state.settings.palette : 'auto';
  state.settings.volume = Math.min(1, Math.max(0, Number(state.settings.volume)));
  if (!Number.isFinite(state.settings.volume)) state.settings.volume = 0.72;
  state.settings.muted = Boolean(state.settings.muted);
  state.settings.shuffle = Boolean(state.settings.shuffle);
  state.settings.visualizer = state.settings.visualizer !== false;
  state.settings.autoLyrics = state.settings.autoLyrics !== false;
  state.settings.motion = state.settings.motion === 'reduced' ? 'reduced' : 'full';
  state.settings.rate = Math.min(2, Math.max(0.5, Number(state.settings.rate) || 1));
  state.settings.spotifyClientId = String(state.settings.spotifyClientId || '').trim().slice(0, 120);
  state.settings.spotifyFullPlayback = state.settings.spotifyFullPlayback !== false;
  state.settings.youtubeQuality = ['auto', 'hd720', 'large', 'medium'].includes(state.settings.youtubeQuality)
    ? state.settings.youtubeQuality
    : 'auto';
  state.settings.autoplaySimilar = state.settings.autoplaySimilar !== false;

  // Tracks: remote tracks persist, local files never do.
  const storedTracks = raw.tracks && typeof raw.tracks === 'object' ? raw.tracks : {};
  const tracks = {};
  for (const [id, track] of Object.entries(storedTracks)) {
    const normalized = normalizeTrack(track);
    if (normalized && !normalized.ephemeral) tracks[id] = normalized;
  }
  if (!Object.keys(tracks).length) {
    for (const [id, track] of Object.entries(base.tracks)) tracks[id] = track;
  }

  let order = Array.isArray(raw.trackOrder) ? raw.trackOrder.filter((id) => tracks[id]) : [];
  for (const id of Object.keys(tracks)) if (!order.includes(id)) order.push(id);
  // Guarantee demo staples exist on a fresh/legacy store.
  if (!raw.trackOrder) order = base.trackOrder.filter((id) => tracks[id]);

  state.tracks = tracks;
  state.trackOrder = order;

  const validIds = new Set(Object.keys(tracks));
  const filterIds = (list) => (Array.isArray(list) ? [...new Set(list)].filter((id) => validIds.has(id)) : []);

  state.liked = filterIds(raw.liked);
  state.history = filterIds(raw.history).slice(0, MAX_HISTORY);
  state.queue = filterIds(raw.queue);
  state.recentSearches = Array.isArray(raw.recentSearches)
    ? raw.recentSearches.filter((q) => typeof q === 'string').slice(0, 8)
    : [];

  const playlists = Array.isArray(raw.playlists) ? raw.playlists : base.playlists;
  state.playlists = playlists
    .filter((playlist) => playlist && typeof playlist === 'object' && playlist.id && playlist.name)
    .map((playlist) => ({
      id: String(playlist.id),
      name: String(playlist.name).slice(0, 100),
      description: String(playlist.description || '').slice(0, 500),
      trackIds: filterIds(playlist.trackIds),
      colors: Array.isArray(playlist.colors) && playlist.colors.length >= 2
        ? playlist.colors.slice(0, 2).map(String)
        : PLAYLIST_COLORS[0],
      createdAt: Number(playlist.createdAt) || Date.now(),
      pinned: Boolean(playlist.pinned)
    }));

  if (!state.playlists.length) state.playlists = base.playlists;

  const fallbackId = state.trackOrder[0] || null;
  state.currentId = validIds.has(raw.currentId) ? raw.currentId : fallbackId;

  let contextIds = filterIds(raw.context?.trackIds);
  if (!contextIds.length) contextIds = [...state.trackOrder];
  state.context = {
    type: raw.context?.type || 'home',
    id: raw.context?.id || 'home',
    label: raw.context?.label || 'Vũ trụ của bạn',
    trackIds: contextIds
  };

  let orderList = filterIds(raw.order);
  if (!orderList.length) orderList = [...contextIds];
  if (state.settings.shuffle && state.context.trackIds.length) {
    // Keep a stored shuffle order stable between reloads if possible.
    state.order = orderList;
  } else {
    state.order = orderList;
  }
  state.orderPos = state.order.indexOf(state.currentId);
  if (state.orderPos < 0) state.orderPos = state.order.length ? 0 : -1;
  if (!state.currentId && state.order.length) state.currentId = state.order[0];

  return state;
}

function loadState() {
  let raw = null;
  try {
    raw = safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    raw = null;
  }
  return sanitizeState(raw);
}

export const state = loadState();

const persist = debounce(() => {
  try {
    const serializable = {
      ...state,
      tracks: Object.fromEntries(
        Object.entries(state.tracks).filter(([, track]) => track && !track.ephemeral)
      )
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.warn('SONORA state could not be saved', error);
  }
}, 160);

export function save() {
  persist();
}

export function getTrack(id) {
  if (!id) return null;
  return state.tracks[id] || sessionTracks.get(id) || null;
}

export function isEphemeral(id) {
  return sessionTracks.has(id);
}

export function allTracks() {
  return state.trackOrder.map((id) => getTrack(id)).filter(Boolean);
}

export function allTrackIds() {
  return state.trackOrder.filter((id) => getTrack(id));
}

export function isLiked(id) {
  return state.liked.includes(id);
}

export function toggleLike(id) {
  if (!getTrack(id)) return false;
  const index = state.liked.indexOf(id);
  if (index >= 0) {
    state.liked.splice(index, 1);
  } else {
    state.liked.unshift(id);
  }
  save();
  return index < 0;
}

export function likedTracks() {
  return state.liked.map((id) => getTrack(id)).filter(Boolean);
}

export function playlistById(id) {
  return state.playlists.find((playlist) => playlist.id === id) || null;
}

export function playlistTracks(playlist) {
  if (!playlist) return [];
  return playlist.trackIds.map((id) => getTrack(id)).filter(Boolean);
}

export function playlistCover(playlist) {
  if (!playlist) return makeCover('SONORA', 'Playlist');
  const first = getTrack(playlist.trackIds[0]);
  if (first?.cover) return first.cover;
  return makeCover(playlist.name || 'Playlist', 'SONORA', playlist.id);
}

export function createPlaylist({ name, description = '', trackIds = [], colors = PLAYLIST_COLORS[0], pinned = false }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const playlist = {
    id: uid('pl'),
    name: trimmed.slice(0, 100),
    description: String(description || '').trim().slice(0, 500),
    trackIds: [...new Set(trackIds)].filter((id) => getTrack(id)),
    colors: [...colors],
    createdAt: Date.now(),
    pinned: Boolean(pinned)
  };
  state.playlists.unshift(playlist);
  save();
  return playlist;
}

export function updatePlaylist(id, patch) {
  const playlist = playlistById(id);
  if (!playlist) return null;
  if (typeof patch.name === 'string' && patch.name.trim()) playlist.name = patch.name.trim().slice(0, 100);
  if (typeof patch.description === 'string') playlist.description = patch.description.slice(0, 500);
  if (Array.isArray(patch.colors) && patch.colors.length >= 2) playlist.colors = patch.colors.slice(0, 2);
  if (typeof patch.pinned === 'boolean') playlist.pinned = patch.pinned;
  save();
  return playlist;
}

export function deletePlaylist(id) {
  const index = state.playlists.findIndex((playlist) => playlist.id === id);
  if (index < 0) return false;
  state.playlists.splice(index, 1);
  save();
  return true;
}

export function addTracksToPlaylist(playlistId, trackIds) {
  const playlist = playlistById(playlistId);
  if (!playlist) return 0;
  let added = 0;
  for (const id of trackIds) {
    if (!playlist.trackIds.includes(id) && getTrack(id)) {
      playlist.trackIds.push(id);
      added++;
    }
  }
  if (added) save();
  return added;
}

export function removeTrackFromPlaylist(playlistId, trackId, index = -1) {
  const playlist = playlistById(playlistId);
  if (!playlist) return false;
  if (index >= 0 && playlist.trackIds[index] === trackId) {
    playlist.trackIds.splice(index, 1);
  } else {
    const found = playlist.trackIds.indexOf(trackId);
    if (found < 0) return false;
    playlist.trackIds.splice(found, 1);
  }
  save();
  return true;
}

export function reorderPlaylist(playlistId, from, to) {
  const playlist = playlistById(playlistId);
  if (!playlist) return;
  if (from < 0 || from >= playlist.trackIds.length || to < 0 || to >= playlist.trackIds.length) return;
  const [moved] = playlist.trackIds.splice(from, 1);
  playlist.trackIds.splice(to, 0, moved);
  save();
}

export function addTrack(track, { ephemeral = false, position = 'start' } = {}) {
  if (!track) return null;
  const id = track.id || uid('tr');
  const normalized = normalizeTrack({ ...track, id });
  if (!normalized) return null;
  if (ephemeral) {
    normalized.ephemeral = true;
    sessionTracks.set(id, normalized);
  } else {
    delete normalized.ephemeral;
    state.tracks[id] = normalized;
  }
  state.trackOrder = state.trackOrder.filter((trackId) => trackId !== id);
  if (position === 'start') state.trackOrder.unshift(id);
  else state.trackOrder.push(id);
  save();
  return normalized;
}

export function addSessionTrack(track) {
  return addTrack({ ...track, source: track.source || 'local', type: track.type || 'audio' }, { ephemeral: true });
}

export function removeTrack(id) {
  const track = getTrack(id);
  if (!track) return false;
  if (sessionTracks.has(id)) {
    if (typeof track.src === 'string' && track.src.startsWith('blob:')) {
      try { URL.revokeObjectURL(track.src); } catch { /* noop */ }
    }
    sessionTracks.delete(id);
  } else {
    delete state.tracks[id];
  }
  state.trackOrder = state.trackOrder.filter((trackId) => trackId !== id);
  state.liked = state.liked.filter((trackId) => trackId !== id);
  state.history = state.history.filter((trackId) => trackId !== id);
  state.queue = state.queue.filter((trackId) => trackId !== id);
  state.context.trackIds = state.context.trackIds.filter((trackId) => trackId !== id);
  state.order = state.order.filter((trackId) => trackId !== id);
  for (const playlist of state.playlists) {
    playlist.trackIds = playlist.trackIds.filter((trackId) => trackId !== id);
  }
  if (state.currentId === id) {
    state.currentId = state.order[0] || state.trackOrder[0] || null;
    state.orderPos = state.currentId ? state.order.indexOf(state.currentId) : -1;
  }
  save();
  return true;
}

export function recordPlay(id) {
  const track = getTrack(id);
  if (!track) return;
  track.plays = (Number(track.plays) || 0) + 1;
  state.history = [id, ...state.history.filter((trackId) => trackId !== id)].slice(0, MAX_HISTORY);
  state.stats.plays = (Number(state.stats.plays) || 0) + 1;
  save();
}

export function addListeningTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  state.stats.minutes = (Number(state.stats.minutes) || 0) + seconds / 60;
  save();
}

export function rememberSearch(query) {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 2) return;
  state.recentSearches = [trimmed, ...state.recentSearches.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
  save();
}

export function forgetSearches() {
  state.recentSearches = [];
  save();
}

export function getLyricsEntry(track) {
  if (!track) return null;
  const cached = state.lyricsCache[track.id];
  if (cached?.text) return cached;
  if (track.lrc) {
    return {
      text: track.lrc,
      source: track.lyricsSource || 'SONORA Originals',
      synced: /\[\d{1,3}:\d{1,2}/.test(track.lrc)
    };
  }
  return cached || null;
}

export function setLyrics(trackId, text, source = 'Dán thủ công', synced = false) {
  if (!trackId) return;
  state.lyricsCache[trackId] = {
    text: String(text || ''),
    source: String(source || 'Dán thủ công'),
    synced: Boolean(synced) || /\[\d{1,3}:\d{1,2}/.test(String(text || '')),
    updatedAt: Date.now()
  };
  save();
}

export function clearLyrics(trackId) {
  delete state.lyricsCache[trackId];
  save();
}

export function lyricsOffset(trackId) {
  return Number(state.lyricsOffsets[trackId]) || 0;
}

export function setLyricsOffset(trackId, value) {
  if (!trackId) return 0;
  const next = Math.max(-20, Math.min(20, Math.round((Number(value) || 0) * 10) / 10));
  state.lyricsOffsets[trackId] = next;
  save();
  return next;
}

export function updateSettings(patch) {
  Object.assign(state.settings, patch || {});
  save();
}

export function setCurrent(id, { save: persistNow = true } = {}) {
  if (!getTrack(id)) return false;
  state.currentId = id;
  const pos = state.order.indexOf(id);
  state.orderPos = pos;
  if (persistNow) save();
  return true;
}

export function setContext({ type = 'collection', id = '', label = 'SONORA', trackIds = [] }) {
  const ids = [...new Set(trackIds)].filter((trackId) => getTrack(trackId));
  if (!ids.length) return null;
  state.context = { type, id, label, trackIds: ids };
  state.order = state.settings.shuffle ? shuffleArray(ids) : [...ids];
  state.orderPos = -1;
  return state.context;
}

export function rebuildOrder({ shuffle = state.settings.shuffle, keepCurrent = true } = {}) {
  const ids = state.context.trackIds.filter((id) => getTrack(id));
  if (!ids.length) {
    state.order = [];
    state.orderPos = -1;
    return;
  }
  const current = state.currentId;
  if (shuffle) {
    state.order = shuffleArray(ids);
    if (keepCurrent && current && state.order.includes(current)) {
      const index = state.order.indexOf(current);
      if (index > 0) {
        state.order.splice(index, 1);
        state.order.unshift(current);
      }
    }
  } else {
    state.order = [...ids];
  }
  state.orderPos = state.order.indexOf(current);
  save();
}

export function nextTrackId({ auto = false } = {}) {
  if (state.queue.length) {
    const id = state.queue.shift();
    save();
    if (getTrack(id)) return id;
  }
  if (auto && state.settings.repeat === 'one' && state.currentId) return state.currentId;
  let order = state.order.filter((id) => getTrack(id));
  if (!order.length) order = allTrackIds();
  if (!order.length) return null;
  const current = state.currentId;
  let index = order.indexOf(current);
  if (index < 0) index = auto ? -1 : 0;
  if (index + 1 < order.length) return order[index + 1];
  if (state.settings.repeat === 'all' || !auto) return order[0];
  return null;
}

export function previousTrackId() {
  let order = state.order.filter((id) => getTrack(id));
  if (!order.length) order = allTrackIds();
  if (!order.length) return null;
  const index = order.indexOf(state.currentId);
  if (index > 0) return order[index - 1];
  if (state.settings.repeat === 'all') return order[order.length - 1];
  return order[0] || null;
}

export function queueTrack(id, { next = false } = {}) {
  if (!getTrack(id)) return false;
  if (next) state.queue.unshift(id);
  else state.queue.push(id);
  save();
  return true;
}

export function removeQueueAt(index) {
  if (index < 0 || index >= state.queue.length) return;
  state.queue.splice(index, 1);
  save();
}

export function clearQueue() {
  state.queue = [];
  save();
}

export function cycleRepeat() {
  const order = ['off', 'all', 'one'];
  const index = order.indexOf(state.settings.repeat);
  state.settings.repeat = order[(index + 1) % order.length];
  save();
  return state.settings.repeat;
}

export function toggleShuffle() {
  state.settings.shuffle = !state.settings.shuffle;
  rebuildOrder({ shuffle: state.settings.shuffle });
  save();
  return state.settings.shuffle;
}

export function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreText(haystack, needle, weight) {
  if (!needle) return 0;
  if (haystack === needle) return weight * 2;
  if (haystack.startsWith(needle)) return weight * 1.5;
  if (haystack.includes(needle)) return weight;
  return 0;
}

export function searchLibrary(query, limit = 40) {
  const q = normalizeText(query);
  if (!q) return { tracks: [], playlists: [], artists: [] };
  const words = q.split(' ').filter(Boolean);

  const tracks = allTracks()
    .map((track) => {
      const title = normalizeText(track.title);
      const artist = normalizeText(track.artist);
      const album = normalizeText(track.album);
      const tags = normalizeText((track.tags || []).join(' '));
      let score = 0;
      score += scoreText(title, q, 14);
      score += scoreText(artist, q, 10);
      score += scoreText(album, q, 5);
      score += scoreText(tags, q, 3);
      for (const word of words) {
        if (title.includes(word)) score += 3;
        if (artist.includes(word)) score += 2;
        if (album.includes(word)) score += 1;
      }
      if (isLiked(track.id)) score += 0.5;
      return { track, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.track);

  const playlists = state.playlists
    .map((playlist) => {
      const name = normalizeText(playlist.name);
      const description = normalizeText(playlist.description);
      let score = scoreText(name, q, 14) + scoreText(description, q, 3);
      for (const word of words) if (name.includes(word)) score += 2;
      return { playlist, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.playlist);

  const artistMap = new Map();
  for (const track of allTracks()) {
    const key = track.artist || 'Unknown artist';
    const normalized = normalizeText(key);
    if (!normalized.includes(q) && !q.includes(normalized)) continue;
    const existing = artistMap.get(key) || { name: key, trackCount: 0, cover: track.cover, score: 0 };
    existing.trackCount++;
    existing.score += scoreText(normalized, q, 10);
    artistMap.set(key, existing);
  }
  const artists = [...artistMap.values()].sort((a, b) => b.score - a.score).slice(0, 8);

  return { tracks, playlists, artists };
}

export function artistTracks(name) {
  return allTracks().filter((track) => track.artist === name);
}

export function moodTracks(mood, limit = 12) {
  if (!mood) return allTracks().slice(0, limit);
  const queries = [mood.query, mood.label, ...(mood.tags || [])].map(normalizeText).filter(Boolean);
  const scored = allTracks().map((track) => {
    const haystack = normalizeText([track.title, track.artist, track.album, track.genre, ...(track.tags || [])].join(' '));
    let score = 0;
    for (const query of queries) {
      if (haystack.includes(query)) score += 5;
      for (const word of query.split(' ')) if (word.length > 2 && haystack.includes(word)) score += 1;
    }
    const seed = hashString(`${mood.id}${track.id}`);
    score += (seed % 100) / 100;
    return { track, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.track);
}

export function recentTracks(limit = 8) {
  return state.history.map((id) => getTrack(id)).filter(Boolean).slice(0, limit);
}

export function addedTracks(limit = 12) {
  return allTracks()
    .filter((track) => track.source !== 'studio')
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    .slice(0, limit);
}

export function topTracks(limit = 10) {
  return [...allTracks()].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, limit);
}

export function featuredTrack() {
  return allTracks().find((track) => track.featured) || allTracks()[0] || null;
}

export function totalListeningLabel() {
  const minutes = Math.max(0, Math.round(state.stats.minutes || 0));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

export function playlistDuration(playlist) {
  return sumDuration(playlistTracks(playlist));
}

export function moodsList() {
  return MOODS;
}

export function resetState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
  for (const track of sessionTracks.values()) {
    if (typeof track.src === 'string' && track.src.startsWith('blob:')) {
      try { URL.revokeObjectURL(track.src); } catch { /* noop */ }
    }
  }
  sessionTracks.clear();
}

export function exportState() {
  const read = (value) => JSON.parse(JSON.stringify(value));
  return {
    app: 'SONORA',
    version: 2,
    exportedAt: new Date().toISOString(),
    state: read({
      ...state,
      tracks: Object.fromEntries(Object.entries(state.tracks).filter(([, track]) => !track.ephemeral))
    })
  };
}

export function libraryStats() {
  const tracks = allTracks();
  return {
    tracks: tracks.length,
    liked: state.liked.length,
    playlists: state.playlists.length,
    minutes: Math.round(sumDuration(tracks) / 60),
    stored: Object.keys(state.tracks).length,
    local: sessionTracks.size
  };
}
