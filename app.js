/* SONORA — application controller.
   State lives in store.js, pure markup in views/components, playback in media.js. */
import { KEYBOARD_SHORTCUTS, MOODS, PLATFORM_GUIDE, PLAYLIST_COLORS, SOURCE_META } from './data.js';
import * as store from './store.js';
import {
  clamp,
  cleanTrackTitle,
  copyText,
  debounce,
  detectMediaFile,
  detectSource,
  downloadJson,
  escapeAttr,
  escapeHTML,
  formatTime,
  hashString,
  hexToRgb,
  makeCover,
  normalizeUserUrl,
  parseTitleArtist,
  safeUrl,
  uid
} from './utils.js';
import {
  parseLyrics,
  findActiveLyricIndex,
  renderLyricLines,
  fetchLyrics as fetchLyricsFromApi,
  lyricsPayloadToText,
  lyricsRecognition,
  lyricProgress,
  searchLyricsCandidates
} from './lyrics.js';
import { MediaEngine } from './media.js';
import * as spotify from './spotify.js';
import {
  renderHome,
  renderSearch,
  renderRadio,
  renderLibrary,
  renderPlaylist,
  renderLiked,
  renderNotFound,
  renderLyricsSpotlight
} from './views.js';
import {
  icon,
  renderUpNext,
  renderQueueBody,
  renderSidebarPlaylists,
  renderPlaylistPicker,
  trackCover
} from './components.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const PLACEHOLDER_COVER = makeCover('SONORA', 'Vũ trụ âm nhạc', 'placeholder');
const PALETTE_LABELS = {
  auto: 'Tự động',
  aurora: 'Aurora',
  ember: 'Hổ phách',
  ocean: 'Đại dương',
  mono: 'Đơn sắc'
};
const REPEAT_LABELS = {
  off: 'Tắt lặp lại',
  all: 'Lặp toàn bộ danh sách',
  one: 'Lặp lại một bài'
};
const PLAYABLE_EMBED_SOURCES = new Set(['spotify', 'soundcloud', 'suno', 'audiomack', 'vimeo']);

const dom = {};
const app = {
  route: { name: 'home', id: '', params: new URLSearchParams() },
  engine: null,
  lyrics: [],
  lyricsTrackId: '',
  lyricsToken: 0,
  lyricsRadarToken: 0,
  lyricsRadarTrackId: '',
  lyricsCandidates: [],
  activeLyricIndex: -1,
  userLyricsScrollAt: 0,
  seeking: false,
  lastFrame: 0,
  lastLyricsCheck: 0,
  lastPositionPush: 0,
  listeningAccumulator: 0,
  lastListenSave: 0,
  queueTab: 'next',
  commandItems: [],
  commandIndex: 0,
  commandOpen: false,
  add: null,
  modalOpen: false,
  lastFocus: null,
  sleepEndsAt: 0,
  sleepEndTrack: false,
  sleepTimer: null,
  sleepTimeout: null,
  searchTimer: null,
  toastTimers: new Set(),
  dragDepth: 0,
  initialized: false,
  lastProgressPaint: 0,
  lyricsFetched: new Set(),
  paletteColors: [],
  seekTarget: 0,
  menuOpen: false,
  lastDraw: 0,
  lyricScrollGuard: 0,
  playlistModal: null,
  confirmAction: null,
  mediaSessionReady: false,
  sleepFiring: false,
  addToken: 0
};

/* --------------------------------------------------------------------------
   DOM cache & boot
   -------------------------------------------------------------------------- */
function cacheDom() {
  const ids = [
    'appShell', 'sidebar', 'sidebarScrim', 'main', 'view', 'nowPanel', 'nowScroll', 'nowStage', 'nowCanvas',
    'discScene', 'vinylDisc', 'nowCover', 'vinylYear', 'stagePlayBtn', 'embedWrap', 'embedStage',
    'videoStageHint', 'stageSourceBadge', 'nowTitle', 'nowLikeBtn', 'nowArtist', 'nowAlbum',
    'nowYear', 'nowSource', 'nowStatus', 'nowFormat', 'nowContext', 'lyricsCard', 'lyricsSource',
    'lyricsScroll', 'nowLyrics', 'lyricsOffsetLabel', 'lyricsSyncState', 'nowUpNext', 'player',
    'playerCover', 'playerTitle', 'playerArtist', 'playerSource', 'playerLikeBtn', 'mainPlayBtn',
    'shuffleBtn', 'repeatBtn', 'seekBar', 'currentTime', 'durationTime', 'timelineBuffer',
    'timelineFill', 'timeline', 'volumeBar', 'volumeFill', 'muteBtn', 'lyricsBtn', 'playerMiniEq',
    'cinema', 'cinemaBackdrop', 'cinemaCover', 'cinemaArtShell', 'cinemaVideoShell', 'videoEngine',
    'cinemaYoutube', 'cinemaEmbedNote', 'cinemaSource', 'cinemaTrackIndex', 'cinemaContext', 'cinemaCanvas',
    'cinemaTitle', 'cinemaArtist', 'cinemaAlbum', 'cinemaYear', 'cinemaSourceChip', 'cinemaLyricsScroll',
    'cinemaLyrics', 'cinemaCurrent', 'cinemaDuration', 'cinemaProgressFill', 'queueDrawer',
    'karaokeStage', 'karaokeAmbient', 'karaokeCover', 'karaokeTitle', 'karaokeArtist', 'karaokeContext',
    'karaokeAlbum', 'karaokeYear', 'karaokeSource', 'karaokeSyncBadge', 'karaokeLineCount',
    'karaokeLyricsScroll', 'karaokeLyrics', 'karaokeCurrent', 'karaokeDuration', 'karaokeProgressFill',
    'karaokeSeek', 'karaokeOffsetLabel', 'karaokeFullscreenBtn',
    'queueBackdrop', 'queueBody', 'queueSummary', 'queueShuffleLabel', 'commandPalette',
    'commandInput', 'commandResults', 'modalLayer', 'modalCard', 'contextMenu', 'toastHost',
    'dropOverlay', 'engineAudio', 'sleepButton', 'sleepCountdown', 'sidebarPlaylists',
    'likedCount', 'playerArtworkBtn'
  ];
  for (const id of ids) dom[id] = document.getElementById(id);
  dom.volumeControl = dom.muteBtn?.closest('.volume-control');
  dom.timeline = dom.timeline || document.getElementById('timeline');
}

function createLocalFileInput() {
  dom.fileInput = document.createElement('input');
  dom.fileInput.type = 'file';
  dom.fileInput.accept = 'audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.mp4,.webm,.mov';
  dom.fileInput.multiple = true;
  dom.fileInput.hidden = true;
  dom.fileInput.id = 'sonoraFileInput';
  document.body.appendChild(dom.fileInput);
  dom.fileInput.addEventListener('change', () => {
    const files = [...(dom.fileInput.files || [])];
    dom.fileInput.value = '';
    if (files.length) handleLocalFiles(files);
  });
}

function setupEngine() {
  const engine = new MediaEngine({
    audio: dom.engineAudio,
    video: dom.videoEngine,
    youtubeStage: dom.cinemaYoutube,
    embedStage: dom.embedStage
  });
  app.engine = engine;
  engine.setVolume(store.state.settings.volume, { silent: true });
  engine.setRate(store.state.settings.rate);
  engine.setMuted(store.state.settings.muted);

  engine.onPlay = () => {
    updatePlaybackUI();
    syncMediaSessionState();
  };
  engine.onPause = () => {
    updatePlaybackUI();
    syncMediaSessionState();
  };
  engine.onEnded = () => {
    updatePlaybackUI();
    handleAutomaticTrackEnd();
  };
  engine.onDuration = () => {
    const track = store.getTrack(store.state.currentId);
    if (track) {
      const duration = engine.getDuration();
      if (duration > 0) {
        track.duration = Math.round(duration);
        store.save();
      }
      paintProgress(engine.getTime(), duration);
    }
  };
  engine.onTime = (time) => {
    if (!app.seeking) paintProgress(time, engine.getDuration());
  };
  engine.onError = (error) => {
    const message = error?.message || 'Không thể phát bài hát này.';
    toast(message, { type: 'error', icon: 'x', detail: 'Bạn có thể thử mở liên kết gốc.' });
    updatePlaybackUI();
  };
  engine.onMode = () => {
    updateStageVisibility();
    updatePlaybackUI();
  };
  engine.onEmbedReady = () => {
    updateStageVisibility();
    updatePlaybackUI();
  };
  engine.onBuffering = () => {
    updatePlaybackUI();
  };
  engine.onSpotifyFallback = (error) => {
    updatePlaybackUI();
    toast('Đang chuyển sang Spotify Web', {
      detail: error?.message || 'Thiết bị này chưa phát đầy đủ được, nhưng bạn vẫn có thể nghe trong khung Spotify.',
      type: 'warning',
      icon: 'spotify',
      duration: 5200
    });
  };
  engine.onYoutubeRecovery = () => {
    toast('Đang kết nối lại YouTube…', { detail: 'Video đang tải lâu. SONORA sẽ thử tiếp tục phát.', type: 'warning', icon: 'video', duration: 3200 });
  };
  engine.onYtReady = () => {
    updateStageVisibility();
    const track = store.getTrack(store.state.currentId);
    if (track?.type === 'youtube') {
      track.duration = Math.round(engine.getDuration() || track.duration || 0);
      paintProgress(0, engine.getDuration());
    }
  };
  engine.onMuted = () => updateVolumeUI();
  engine.onVolume = () => updateVolumeUI();
}

function boot() {
  cacheDom();
  createLocalFileInput();
  setupEngine();
  bindEvents();
  applyAllSettings();
  renderSidebar();
  renderRoute({ initial: true });
  renderQueue();
  renderUpNextArea();
  const track = store.getTrack(store.state.currentId);
  if (track) {
    updateTrackChrome(track);
    loadLyricsForTrack(track, { auto: true });
    updateStageVisibility();
    if (track.type !== 'embed' && track.type !== 'external') {
      app.engine.load(track, { autoplay: false }).catch(() => {});
    }
  } else {
    updateTrackChrome(null);
    loadLyricsForTrack(null);
  }
  updatePlaybackUI();
  updateVolumeUI();
  updateModeButtons();
  updateSleepUI();
  setupMediaSessionHandlers();
  setupLyricsScrollTracking();
  app.initialized = true;
  window.__sonoraDebug = { app, store };
  initializeSpotifyIntegration();
  requestAnimationFrame(animationLoop);
  window.addEventListener('beforeunload', () => store.save());
}

/* --------------------------------------------------------------------------
   Routing
   -------------------------------------------------------------------------- */
function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/home';
  const [pathname, queryString = ''] = raw.split('?');
  const parts = pathname.split('/').filter(Boolean);
  return {
    name: parts[0] || 'home',
    id: parts[1] || '',
    params: new URLSearchParams(queryString)
  };
}

function navigate(hash, { replace = false } = {}) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (replace) {
    history.replaceState(null, '', target);
    renderRoute({ preserveScroll: true });
    return;
  }
  if (location.hash === target) {
    renderRoute();
    return;
  }
  location.hash = target;
}

function renderRoute({ initial = false, preserveScroll = false, focusSearch = false } = {}) {
  app.route = parseRoute();
  const { name, id, params } = app.route;
  let html = '';
  let title = 'SONORA — vũ trụ âm nhạc của bạn';

  switch (name) {
    case 'home':
      html = renderHome();
      title = 'SONORA — vũ trụ âm nhạc của bạn';
      break;
    case 'search': {
      const query = params.get('q') || '';
      html = renderSearch(query);
      title = query ? `Tìm “${query}” — SONORA` : 'Tìm kiếm — SONORA';
      break;
    }
    case 'radio':
      html = renderRadio(id);
      title = id ? `${MOODS.find((mood) => mood.id === id)?.label || 'Radio'} — SONORA` : 'La bàn cảm xúc — SONORA';
      break;
    case 'library': {
      const tab = params.get('tab') || 'playlists';
      html = renderLibrary(tab);
      title = 'Thư viện — SONORA';
      break;
    }
    case 'playlist': {
      const playlist = store.playlistById(id);
      html = renderPlaylist(id);
      title = playlist ? `${playlist.name} — SONORA` : 'Playlist — SONORA';
      break;
    }
    case 'liked':
      html = renderLiked();
      title = 'Bài hát đã thích — SONORA';
      break;
    default:
      html = renderNotFound();
      title = 'Không tìm thấy — SONORA';
  }

  dom.view.innerHTML = html;
  document.title = title;
  if (!preserveScroll) dom.view.scrollTop = 0;
  updateNav();
  renderSidebar();
  updatePlayingRowStates();
  if (focusSearch || (name === 'search' && initial)) {
    requestAnimationFrame(() => {
      const input = $('#searchPageInput');
      if (input) {
        input.focus();
        const length = input.value.length;
        input.setSelectionRange(length, length);
      }
    });
  }
  if (window.innerWidth <= 1330) {
    closeNowPanel({ silent: true });
  }
  closeSidebar();
}

function updateNav() {
  const route = app.route;
  const isPlaylist = route.name === 'playlist' || route.name === 'liked';
  const libraryTab = route.params?.get('tab') || 'playlists';
  $$('.nav-item').forEach((item) => {
    const target = item.dataset.route;
    const active = target === route.name || (target === 'library' && isPlaylist);
    item.classList.toggle('is-active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  const likedShortcut = $('.library-shortcut[data-route="liked"]');
  if (likedShortcut) likedShortcut.classList.toggle('is-active', route.name === 'liked');
  const uploadShortcut = $('.library-shortcut[data-tab="uploads"]');
  if (uploadShortcut) uploadShortcut.classList.toggle('is-active', route.name === 'library' && libraryTab === 'uploads');
}

/* --------------------------------------------------------------------------
   Chrome, sidebar & profile
   -------------------------------------------------------------------------- */
function renderSidebar() {
  if (!dom.sidebarPlaylists) return;
  dom.sidebarPlaylists.innerHTML = renderSidebarPlaylists();
  if (dom.likedCount) {
    dom.likedCount.textContent = `${store.state.liked.length} bài hát`;
  }
  const activePlaylist = app.route?.name === 'playlist' ? app.route.id : '';
  $$('.sidebar-playlist', dom.sidebarPlaylists).forEach((button) => {
    button.classList.toggle('is-active', button.dataset.id === activePlaylist);
  });
  renderProfile();
}

function renderProfile() {
  const name = store.state.settings.name || 'Nguyên';
  const letter = (name.trim()[0] || 'N').toUpperCase();
  const profileAvatar = $('.profile-avatar');
  if (profileAvatar?.firstChild?.nodeType === Node.TEXT_NODE) {
    profileAvatar.firstChild.nodeValue = letter;
  }
  const profileName = $('.profile-text strong');
  if (profileName) profileName.textContent = name;
  const topAvatar = $('.top-avatar');
  if (topAvatar) topAvatar.textContent = letter;
  const sideName = $('.profile-text small');
  if (sideName) {
    const stats = store.libraryStats();
    sideName.textContent = `${stats.tracks} bài hát · ${stats.playlists} playlist`;
  }
}

function applyAllSettings() {
  const settings = store.state.settings;
  dom.appShell.dataset.motion = settings.motion;
  dom.appShell.dataset.visualizer = settings.visualizer ? 'on' : 'off';
  applyPalette(store.getTrack(store.state.currentId));
  app.engine?.setVolume(settings.volume, { silent: true });
  app.engine?.setMuted(settings.muted);
  app.engine?.setRate(settings.rate);
  app.engine?.setYoutubeQuality(settings.youtubeQuality);
  if (app.engine) app.engine.preferSpotifyFull = settings.spotifyFullPlayback !== false;
  updateVolumeUI();
  updateModeButtons();
  renderProfile();
}

function applyPalette(track = store.getTrack(store.state.currentId)) {
  const settings = store.state.settings;
  const root = dom.appShell;
  const props = [
    '--accent', '--accent-2', '--accent-3', '--accent-4',
    '--accent-rgb', '--accent-2-rgb', '--accent-3-rgb', '--accent-4-rgb'
  ];
  for (const prop of props) root.style.removeProperty(prop);
  if (settings.palette === 'auto') {
    root.dataset.palette = 'auto';
    const colors = track?.colors?.length ? track.colors : ['#ff6b9a', '#9d7bff', '#5ee8c1', '#ffc06b'];
    const palette = [
      colors[0] || '#ff6b9a',
      colors[1] || '#9d7bff',
      colors[2] || '#5ee8c1',
      colors[3] || colors[2] || '#ffc06b'
    ];
    root.style.setProperty('--accent', palette[0]);
    root.style.setProperty('--accent-2', palette[1]);
    root.style.setProperty('--accent-3', palette[2]);
    root.style.setProperty('--accent-4', palette[3]);
    root.style.setProperty('--accent-rgb', hexToRgb(palette[0]));
    root.style.setProperty('--accent-2-rgb', hexToRgb(palette[1]));
    root.style.setProperty('--accent-3-rgb', hexToRgb(palette[2]));
    root.style.setProperty('--accent-4-rgb', hexToRgb(palette[3]));
  } else {
    root.dataset.palette = settings.palette;
  }
  const computed = getComputedStyle(root);
  app.paletteColors = ['--accent', '--accent-2', '--accent-3', '--accent-4']
    .map((name) => computed.getPropertyValue(name).trim())
    .filter(Boolean);
}

function cyclePalette() {
  const current = store.state.settings.palette;
  const index = store.PALETTES.indexOf(current);
  const next = store.PALETTES[(index + 1) % store.PALETTES.length];
  store.updateSettings({ palette: next });
  applyPalette();
  toast(`Bảng màu: ${PALETTE_LABELS[next] || next}`, { detail: 'Bấm lại để đổi tiếp', icon: 'palette' });
}

/* --------------------------------------------------------------------------
   Toasts
   -------------------------------------------------------------------------- */
function toast(message, options = {}) {
  if (!dom.toastHost) return;
  const {
    detail = '',
    type = 'success',
    icon: iconName = type === 'error' ? 'x' : type === 'warning' ? 'sparkles' : 'check',
    action = '',
    actionLabel = '',
    actionId = '',
    duration = 3800
  } = options;

  while (dom.toastHost.children.length >= 4) {
    dom.toastHost.firstElementChild?.remove();
  }

  const element = document.createElement('div');
  element.className = `toast${type !== 'success' ? ` toast-${type}` : ''}`;
  element.innerHTML = `
    <span class="toast-icon">${icon(iconName)}</span>
    <span class="toast-copy"><strong>${escapeHTML(message)}</strong>${detail ? `<span>${escapeHTML(detail)}</span>` : ''}</span>
    ${action && actionLabel ? `<button type="button" class="toast-action" data-action="${escapeAttr(action)}"${actionId ? ` data-id="${escapeAttr(actionId)}"` : ''}>${escapeHTML(actionLabel)}</button>` : ''}
  `;
  dom.toastHost.appendChild(element);

  const timer = setTimeout(() => {
    element.classList.add('is-out');
    const removeTimer = setTimeout(() => {
      element.remove();
      app.toastTimers.delete(removeTimer);
    }, 300);
    app.toastTimers.add(removeTimer);
  }, duration);
  app.toastTimers.add(timer);
}

/* --------------------------------------------------------------------------
   Tracks, player chrome & stage
   -------------------------------------------------------------------------- */
function updateTrackChrome(track) {
  updateNowPanel(track);
  updatePlayerPanel(track);
  updateCinemaPanel(track);
  updateKaraokePanel(track);
  updateModeButtons();
  renderUpNextArea();
  updateStageVisibility();
  applyMediaSessionMetadata(track);
  if (track) {
    document.title = `${track.title} · ${track.artist} — SONORA`;
  }
  updatePlayingRowStates();
}

function updateNowPanel(track) {
  const cover = track ? trackCover(track) : PLACEHOLDER_COVER;
  const meta = track ? sourceMetaFor(track) : { label: 'SONORA', short: 'SONORA' };
  if (dom.nowCover) dom.nowCover.src = cover;
  if (dom.vinylYear) dom.vinylYear.textContent = track?.year || new Date().getFullYear();
  if (dom.nowTitle) dom.nowTitle.textContent = track?.title || 'Chọn một bài hát';
  if (dom.nowArtist) dom.nowArtist.textContent = track?.artist || 'SONORA đang chờ bạn';
  if (dom.nowAlbum) dom.nowAlbum.textContent = track?.album || 'Vũ trụ âm nhạc cá nhân';
  if (dom.nowYear) dom.nowYear.textContent = track?.year || '2026';
  if (dom.nowSource) dom.nowSource.textContent = meta.short;
  if (dom.nowFormat) dom.nowFormat.textContent = formatLabel(track);
  if (dom.stageSourceBadge) dom.stageSourceBadge.textContent = meta.label.toUpperCase();
  if (dom.nowContext) {
    dom.nowContext.textContent = track
      ? `${store.state.context?.label || 'SONORA'} · ${meta.label}`
      : 'SONORA · Bản địa';
  }
  const liked = track ? store.isLiked(track.id) : false;
  dom.nowLikeBtn?.classList.toggle('is-liked', liked);
  dom.playerLikeBtn?.classList.toggle('is-liked', liked);
  if (dom.nowLikeBtn) dom.nowLikeBtn.setAttribute('aria-pressed', String(liked));
  if (dom.playerLikeBtn) dom.playerLikeBtn.setAttribute('aria-pressed', String(liked));
  updatePlaybackUI();
}

function updatePlayerPanel(track) {
  if (dom.playerCover) dom.playerCover.src = track ? trackCover(track) : PLACEHOLDER_COVER;
  if (dom.playerTitle) dom.playerTitle.textContent = track?.title || 'Chọn một bài hát';
  if (dom.playerArtist) dom.playerArtist.textContent = track?.artist || 'SONORA';
  if (dom.playerSource) dom.playerSource.textContent = track ? sourceMetaFor(track).label : 'SONORA';
  if (dom.durationTime) dom.durationTime.textContent = formatTime(track?.duration || 0);
  if (dom.currentTime) dom.currentTime.textContent = '0:00';
  if (dom.timelineFill) dom.timelineFill.style.width = '0%';
  if (dom.timelineBuffer) dom.timelineBuffer.style.width = '0%';
}

function updateCinemaPanel(track) {
  const cover = track ? trackCover(track) : PLACEHOLDER_COVER;
  const meta = track ? sourceMetaFor(track) : { label: 'SONORA', short: 'SONORA' };
  const order = store.state.order || [];
  const position = order.indexOf(track?.id || '');
  const total = order.length || store.allTracks().length;
  if (dom.cinemaCover) dom.cinemaCover.src = cover;
  if (dom.cinemaTitle) dom.cinemaTitle.textContent = track?.title || 'Chọn một bài hát';
  if (dom.cinemaArtist) dom.cinemaArtist.textContent = track?.artist || 'Vũ trụ âm nhạc của bạn';
  if (dom.cinemaAlbum) dom.cinemaAlbum.textContent = track?.album || 'SONORA';
  if (dom.cinemaYear) dom.cinemaYear.textContent = track?.year || '2026';
  if (dom.cinemaSourceChip) dom.cinemaSourceChip.textContent = meta.short;
  if (dom.cinemaSource) {
    dom.cinemaSource.textContent = track?.source === 'studio'
      ? 'SONORA ORIGINAL'
      : `${meta.label.toUpperCase()} · ĐANG PHÁT`;
  }
  if (dom.cinemaContext) dom.cinemaContext.textContent = store.state.context?.label || 'Đang phát';
  if (dom.cinemaTrackIndex) {
    dom.cinemaTrackIndex.textContent = `${String(Math.max(0, position) + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  }
  if (dom.cinemaBackdrop && track) {
    dom.cinemaBackdrop.style.backgroundImage = `url("${cover.replace(/"/g, '%22')}")`;
  }
  const hasVideo = Boolean(track && (track.type === 'video' || track.type === 'youtube'));
  const isEmbed = track?.type === 'embed';
  if (dom.cinemaArtShell) dom.cinemaArtShell.hidden = hasVideo;
  if (dom.cinemaVideoShell) dom.cinemaVideoShell.hidden = !hasVideo;
  if (dom.cinemaEmbedNote) dom.cinemaEmbedNote.hidden = !isEmbed;
  const cinemaPlay = $('.cinema-play-button');
  if (cinemaPlay) cinemaPlay.hidden = isEmbed || !track;
  if (dom.cinemaTitle) dom.cinemaTitle.style.opacity = track ? '1' : '0.6';
  updateCinemaProgress(0, track?.duration || 0);
  updatePlaybackUI();
}

function updateKaraokePanel(track) {
  const cover = track ? trackCover(track) : PLACEHOLDER_COVER;
  if (dom.karaokeCover) dom.karaokeCover.src = cover;
  if (dom.karaokeTitle) dom.karaokeTitle.textContent = track?.title || 'Chọn một bài hát';
  if (dom.karaokeArtist) dom.karaokeArtist.textContent = track?.artist || 'Vũ trụ âm nhạc của bạn';
  if (dom.karaokeAlbum) dom.karaokeAlbum.textContent = track?.album || 'SONORA';
  if (dom.karaokeYear) dom.karaokeYear.textContent = track?.year || '2026';
  if (dom.karaokeContext) {
    dom.karaokeContext.innerHTML = `<span class="karaoke-live-dot"></span>${escapeHTML(store.state.context?.label || 'Đang phát')}`;
  }
  if (dom.karaokeAmbient) {
    dom.karaokeAmbient.style.backgroundImage = `url("${cover.replace(/"/g, '%22')}")`;
  }
  updateKaraokeProgress(app.engine?.getTime?.() || 0, app.engine?.getDuration?.() || track?.duration || 0);
}

function updateStageVisibility() {
  if (!app.engine) return;
  const track = store.getTrack(store.state.currentId);
  const mode = app.engine.mode;
  const isEmbed = mode === 'embed';
  if (dom.embedWrap) dom.embedWrap.hidden = !isEmbed;
  if (dom.videoStageHint) {
    const hasVisual = Boolean(track && (track.type === 'video' || track.type === 'youtube'));
    dom.videoStageHint.hidden = !hasVisual || isEmbed;
  }
  if (dom.discScene) dom.discScene.style.opacity = isEmbed ? '0.25' : '1';
  if (dom.nowStage) dom.nowStage.classList.toggle('has-embed', isEmbed);
  updateTimelineDisabled();
}

function updateTimelineDisabled() {
  const track = store.getTrack(store.state.currentId);
  const mode = app.engine?.mode || '';
  const disabled = !track || mode === 'embed' || mode === 'external';
  dom.timeline?.classList.toggle('is-disabled', disabled);
  if (dom.seekBar) dom.seekBar.disabled = disabled;
}

function formatLabel(track, mode = '') {
  if (!track) return 'HI-RES';
  if (track.type === 'youtube') return 'YOUTUBE';
  if (track.type === 'video') return 'VIDEO';
  if (track.type === 'spotify' || track.source === 'spotify') {
    if (mode === 'spotify') return 'SPOTIFY FULL';
    if (mode === 'embed') return 'SPOTIFY WEB';
    return 'SPOTIFY';
  }
  if (track.type === 'embed') return 'EMBED';
  if (track.source === 'spotify') return 'PREVIEW';
  if (track.source === 'local') return 'LOCAL';
  return 'HI-RES';
}

function sourceMetaFor(track) {
  const key = track?.source === 'generic' ? 'other' : track?.source;
  return SOURCE_META[key] || SOURCE_META.other;
}

/* --------------------------------------------------------------------------
   Playback & queue
   -------------------------------------------------------------------------- */
function playCollection(ids, { type = 'collection', id = '', label = 'SONORA', startId = '', shuffle = null } = {}) {
  const tracks = ids.map((trackId) => store.getTrack(trackId)).filter(Boolean);
  if (!tracks.length) {
    toast('Chưa có bài hát nào để phát.', { type: 'warning', icon: 'music' });
    return;
  }
  if (shuffle !== null) {
    store.updateSettings({ shuffle: Boolean(shuffle) });
    updateModeButtons();
  }
  store.setContext({ type, id, label, trackIds: tracks.map((track) => track.id) });
  if (store.state.settings.shuffle) store.rebuildOrder({ shuffle: true, keepCurrent: false });
  const order = store.state.order.length ? store.state.order : tracks.map((track) => track.id);
  let chosen = startId && order.includes(startId) ? startId : order[0];
  if (!chosen) chosen = tracks[0].id;
  store.state.currentId = chosen;
  store.state.orderPos = order.indexOf(chosen);
  store.save();
  startTrack(chosen, { preserveOrder: true });
}

function playPlaylistById(playlistId, { shuffle = false } = {}) {
  const playlist = store.playlistById(playlistId);
  if (!playlist) {
    toast('Không tìm thấy playlist.', { type: 'error', icon: 'x' });
    return;
  }
  const tracks = store.playlistTracks(playlist);
  if (!tracks.length) {
    toast('Playlist này chưa có bài hát.', { type: 'warning', icon: 'folder' });
    return;
  }
  playCollection(tracks.map((track) => track.id), {
    type: 'playlist',
    id: playlist.id,
    label: playlist.name,
    shuffle: shuffle ? true : (store.state.settings.shuffle ? true : null)
  });
}

function playLikedSongs({ shuffle = false } = {}) {
  const tracks = store.likedTracks();
  if (!tracks.length) {
    toast('Bạn chưa thích bài hát nào.', { type: 'warning', icon: 'heart' });
    return;
  }
  playCollection(tracks.map((track) => track.id), {
    type: 'liked',
    id: 'liked',
    label: 'Bài hát đã thích',
    shuffle: shuffle ? true : null
  });
}

function playMoodById(moodId, { shuffle = false } = {}) {
  const mood = MOODS.find((item) => item.id === moodId);
  if (!mood) return;
  const tracks = store.moodTracks(mood, 24);
  if (!tracks.length) {
    toast('Chưa đủ bài hát cho tần số này.', { type: 'warning', icon: 'compass' });
    return;
  }
  playCollection(tracks.map((track) => track.id), {
    type: 'mood',
    id: mood.id,
    label: `Đài ${mood.label}`,
    shuffle: shuffle ? true : null
  });
}

function queueMoodById(moodId) {
  const mood = MOODS.find((item) => item.id === moodId);
  if (!mood) return;
  const tracks = store.moodTracks(mood, 24);
  tracks.forEach((track) => store.queueTrack(track.id));
  renderQueue();
  renderUpNextArea();
  toast(`Đã thêm ${tracks.length} bài vào hàng đợi`, { detail: `Đài ${mood.label}`, icon: 'queue' });
}

function findContextFromElement(element, fallbackId) {
  const table = element?.closest?.('[data-track-ids]');
  if (table) {
    const ids = (table.dataset.trackIds || '').split(',').filter(Boolean);
    return {
      ids,
      type: table.dataset.contextType || 'collection',
      id: table.dataset.contextId || '',
      label: table.dataset.contextLabel || 'SONORA'
    };
  }
  const current = store.state.context;
  if (fallbackId && current?.trackIds?.includes(fallbackId)) {
    return {
      ids: current.trackIds,
      type: current.type,
      id: current.id,
      label: current.label
    };
  }
  return {
    ids: store.allTrackIds(),
    type: 'library',
    id: 'all',
    label: 'Tất cả bài hát'
  };
}

function startTrack(trackId, { preserveOrder = false, fromContext = null } = {}) {
  const track = store.getTrack(trackId);
  if (!track) return false;

  if (fromContext) {
    const contextIds = Array.isArray(fromContext.ids) ? fromContext.ids : fromContext.trackIds;
    if (Array.isArray(contextIds) && contextIds.length) {
      const currentContext = store.state.context;
      const same = currentContext?.type === fromContext.type
        && currentContext?.id === fromContext.id
        && currentContext?.trackIds?.length === contextIds.length;
      if (!same) {
        store.setContext({
          type: fromContext.type,
          id: fromContext.id,
          label: fromContext.label,
          trackIds: contextIds
        });
      }
    }
  }

  if (!preserveOrder) {
    if (!store.state.order.includes(trackId)) {
      const contextIds = store.state.context?.trackIds || [];
      if (contextIds.includes(trackId)) {
        store.state.order = store.state.settings.shuffle
          ? [trackId, ...contextIds.filter((id) => id !== trackId)]
          : [...contextIds];
      } else {
        store.state.order = [trackId];
      }
    }
  }
  store.state.orderPos = store.state.order.indexOf(trackId);

  const previousId = store.state.currentId;
  store.state.currentId = trackId;
  store.save();
  if (previousId !== trackId) {
    store.recordPlay(trackId);
    applyPalette(track);
    updateTrackChrome(track);
    loadLyricsForTrack(track, { auto: true });
    renderQueue();
    renderUpNextArea();
    renderSidebar();
    if (dom.nowScroll) dom.nowScroll.scrollTop = 0;
  }

  const isExternal = track.type === 'external';
  if (isExternal) {
    updatePlaybackUI();
    toast('Bài này phát trên nền tảng gốc.', {
      type: 'warning',
      icon: 'external',
      detail: track.url ? 'Mở liên kết để nghe toàn bộ bài hát.' : 'Không có liên kết phát trực tiếp.',
      action: track.url ? 'openExternalTrack' : '',
      actionLabel: track.url ? 'Mở' : '',
      actionId: track.id
    });
    return false;
  }

  app.engine.load(track, { autoplay: true }).then((ok) => {
    if (ok) {
      updatePlaybackUI();
      if (track.type === 'embed' || app.engine.mode === 'embed') {
        openNowPanel();
        toast('Đã mở trình phát chính thức.', {
          detail: 'Nhấn play trong khung nhúng để tiếp tục.',
          icon: 'cloud'
        });
      }
    }
  }).catch((error) => {
    console.warn(error);
    updatePlaybackUI();
  });

  return true;
}

async function togglePlayback() {
  let track = store.getTrack(store.state.currentId);
  if (!track) {
    const ids = store.allTrackIds();
    if (!ids.length) {
      openAddModal();
      return;
    }
    startTrack(ids[0]);
    return;
  }

  if (track.type === 'external') {
    if (track.url) openExternalTrack(track.id);
    else toast('Bài này không có liên kết phát.', { type: 'error', icon: 'x' });
    return;
  }

  if (track.type === 'embed' || app.engine.mode === 'embed') {
    if (app.engine.mode !== 'embed') {
      openNowPanel();
      await app.engine.load(track, { autoplay: true });
    } else {
      openNowPanel();
      toast('Điều khiển phát nằm trong khung chính thức.', { detail: 'Bạn vẫn có thể xem lời và quản lý hàng đợi.', icon: 'cloud' });
    }
    updatePlaybackUI();
    return;
  }

  if (app.engine.track?.id !== track.id || app.engine.mode === 'idle') {
    const previousId = store.state.currentId;
    store.state.currentId = track.id;
    if (previousId !== track.id) store.recordPlay(track.id);
    await app.engine.load(track, { autoplay: true });
    updateTrackChrome(track);
    loadLyricsForTrack(track, { auto: true });
  } else if (app.engine.isPlaying) {
    app.engine.pause();
  } else {
    await app.engine.play();
  }
  updatePlaybackUI();
}

function playNext({ automatic = false } = {}) {
  const nextId = store.nextTrackId({ auto: automatic });
  if (!nextId) {
    if (automatic) {
      updatePlaybackUI();
      toast('Danh sách đã kết thúc.', { detail: 'Bật lặp lại hoặc chọn một playlist khác.', icon: 'check' });
    } else {
      toast('Đã hết hàng đợi.', { type: 'warning', icon: 'queue' });
    }
    return false;
  }
  if (nextId === store.state.currentId) {
    app.engine.seek(0);
    app.engine.play();
    return true;
  }
  return startTrack(nextId, { preserveOrder: true });
}

function playPrevious() {
  if (app.engine.getTime() > 3) {
    app.engine.seek(0);
    return;
  }
  const previousId = store.previousTrackId();
  if (!previousId) {
    return;
  }
  if (previousId === store.state.currentId) {
    app.engine.seek(0);
    return;
  }
  startTrack(previousId, { preserveOrder: true });
}

function similarTracksFor(track, limit = 6, excludeIds = new Set()) {
  if (!track) return [];
  const tags = new Set((track.tags || []).map((tag) => String(tag).toLowerCase()));
  const genre = String(track.genre || '').toLowerCase();
  const artist = String(track.artist || '').toLowerCase();
  const scored = store.allTracks()
    .filter((candidate) => candidate.id !== track.id && !excludeIds.has(candidate.id))
    .map((candidate) => {
      let score = 0;
      const candidateTags = (candidate.tags || []).map((tag) => String(tag).toLowerCase());
      for (const tag of candidateTags) if (tags.has(tag)) score += 4;
      if (genre && String(candidate.genre || '').toLowerCase() === genre) score += 5;
      if (artist && String(candidate.artist || '').toLowerCase() === artist) score += 2;
      if (track.source && candidate.source === track.source) score += 0.6;
      score += Math.min(1.2, (Number(candidate.plays) || 0) / 5000);
      return { candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, limit).map((item) => item.candidate);
  if (picked.length >= Math.min(limit, 3)) return picked;
  const fallback = store.allTracks()
    .filter((candidate) => candidate.id !== track.id && !excludeIds.has(candidate.id) && !picked.includes(candidate))
    .sort((a, b) => (Number(b.plays) || 0) - (Number(a.plays) || 0));
  return [...picked, ...fallback].slice(0, limit);
}

function queueSimilarAction() {
  const track = currentTrack();
  if (!track) return;
  const suggestions = similarTracksFor(track, 5);
  if (!suggestions.length) {
    toast('Chưa tìm thấy bài tương tự', { detail: 'Thêm vài bài nữa để SONORA hiểu gu của bạn hơn.', type: 'warning', icon: 'sparkles' });
    return;
  }
  for (const suggestion of suggestions) store.queueTrack(suggestion.id);
  renderQueue();
  renderUpNextArea();
  toast(`Đã thêm ${suggestions.length} bài cùng gu`, {
    detail: suggestions.map((item) => item.title).slice(0, 3).join(' · ') + (suggestions.length > 3 ? '…' : ''),
    icon: 'sparkles'
  });
}

function handleAutomaticTrackEnd() {
  if (app.sleepEndTrack) {
    app.sleepEndTrack = false;
    app.sleepEndsAt = 0;
    updateSleepUI();
    toast('Đã dừng theo hẹn giờ ngủ', {
      detail: 'Bài vừa rồi là bài cuối cùng của phiên nghe này.',
      icon: 'moon'
    });
    updatePlaybackUI();
    return;
  }
  let nextId = store.nextTrackId({ auto: true });
  if (!nextId && store.state.settings.autoplaySimilar) {
    const track = currentTrack();
    const suggestions = similarTracksFor(track, 8);
    if (suggestions.length) {
      store.setContext({
        type: 'auto-similar',
        id: `similar-${track?.id || 'sonora'}`,
        label: 'Tự động phát tiếp',
        trackIds: suggestions.map((suggestion) => suggestion.id)
      });
      nextId = store.nextTrackId({ auto: false });
      if (nextId) {
        toast('Tiếp tục theo gu của bạn', {
          detail: `SONORA tự chọn ${suggestions[0].title} và ${suggestions.length - 1} bài tương tự.`,
          icon: 'sparkles'
        });
      }
    }
  }
  if (!nextId) {
    updatePlaybackUI();
    return;
  }
  startTrack(nextId, { preserveOrder: true });
}

function toggleShuffle() {
  const enabled = store.toggleShuffle();
  updateModeButtons();
  renderQueue();
  renderUpNextArea();
  toast(enabled ? 'Đã bật xáo bài' : 'Đã tắt xáo bài', {
    detail: enabled ? 'Thứ tự phát sẽ được làm mới.' : 'Danh sách trở về thứ tự ban đầu.',
    icon: 'shuffle'
  });
}

function cycleRepeatMode() {
  const mode = store.cycleRepeat();
  updateModeButtons();
  toast(REPEAT_LABELS[mode], { icon: 'repeat' });
}

function toggleMuteState() {
  const settings = store.state.settings;
  const muted = !settings.muted;
  const patch = { muted };
  if (!muted && Number(settings.volume) <= 0.001) patch.volume = 0.65;
  store.updateSettings(patch);
  app.engine.setVolume(patch.volume ?? settings.volume, { silent: true });
  app.engine.setMuted(muted);
  updateVolumeUI();
  toast(muted ? 'Đã tắt tiếng' : 'Đã bật tiếng', { icon: muted ? 'mute' : 'volume' });
}

function updateVolumeUI() {
  const settings = store.state.settings;
  const volume = clamp(Number(settings.volume) || 0, 0, 1);
  if (dom.volumeBar) dom.volumeBar.value = String(Math.round(volume * 100));
  if (dom.volumeFill) dom.volumeFill.style.width = `${Math.round((settings.muted ? 0 : volume) * 100)}%`;
  dom.volumeControl?.classList.toggle('is-muted', Boolean(settings.muted));
  if (dom.muteBtn) {
    const use = dom.muteBtn.querySelector('use');
    const iconName = settings.muted || volume === 0 ? 'mute' : volume < 0.45 ? 'volume-low' : 'volume';
    if (use) use.setAttribute('href', `#i-${iconName}`);
    dom.muteBtn.setAttribute('aria-label', settings.muted ? 'Bật tiếng' : 'Tắt tiếng');
  }
}

function updateModeButtons() {
  const settings = store.state.settings;
  $$('[data-action="toggleShuffle"]').forEach((button) => {
    button.classList.toggle('is-active', settings.shuffle);
    if (button.id === 'shuffleBtn') button.setAttribute('aria-pressed', String(settings.shuffle));
  });
  $$('.repeat-btn').forEach((button) => {
    button.classList.toggle('is-active', settings.repeat !== 'off');
    button.classList.toggle('repeat-one', settings.repeat === 'one');
    button.setAttribute('aria-pressed', String(settings.repeat !== 'off'));
  });
  if (dom.queueShuffleLabel) dom.queueShuffleLabel.textContent = settings.shuffle ? 'Đang xáo' : 'Xáo bài';
}

function updatePlaybackUI() {
  const track = store.getTrack(store.state.currentId);
  const playing = Boolean(app.engine?.isPlaying);
  const buffering = Boolean(app.engine?.isBuffering);
  const spotifyFull = app.engine?.mode === 'spotify' && track?.type === 'spotify';
  dom.player?.classList.toggle('is-playing', playing);
  dom.player?.classList.toggle('is-buffering', buffering);
  dom.player?.classList.toggle('is-spotify-full', spotifyFull);
  dom.nowPanel?.classList.toggle('is-playing', playing);
  dom.nowPanel?.classList.toggle('is-buffering', buffering);
  dom.cinema?.classList.toggle('is-playing', playing);
  dom.cinema?.classList.toggle('is-buffering', buffering);
  dom.karaokeStage?.classList.toggle('is-playing', playing);
  dom.karaokeStage?.classList.toggle('is-buffering', buffering);
  dom.karaokeStage?.classList.toggle('is-spotify-full', spotifyFull);
  $$('.playing-bars, .mini-eq').forEach((element) => element.setAttribute('data-playing', String(playing)));
  $$('.track-row.is-current').forEach((row) => {
    row.classList.toggle('is-playing', playing);
    row.querySelectorAll('.eq-bars').forEach((bars) => bars.setAttribute('data-playing', String(playing)));
  });
  if (dom.nowStatus) {
    dom.nowStatus.textContent = track ? (playing ? 'Đang phát' : 'Tạm dừng') : 'Sẵn sàng phát';
  }
  if (buffering && dom.nowStatus) dom.nowStatus.textContent = 'Đang tải…';
  if (dom.playerSource && track) {
    const mode = app.engine?.mode || '';
    let sourceLabel = sourceMetaFor(track).label;
    if (track.type === 'spotify' || track.source === 'spotify') {
      sourceLabel += mode === 'spotify' ? ' · Full' : mode === 'embed' ? ' · Web' : '';
    }
    dom.playerSource.textContent = sourceLabel;
  }
  if (dom.nowFormat) dom.nowFormat.textContent = formatLabel(track, app.engine?.mode);
  const playButton = dom.mainPlayBtn;
  if (playButton) playButton.setAttribute('aria-label', playing ? 'Tạm dừng' : 'Phát');
  const stagePlay = dom.stagePlayBtn;
  if (stagePlay) stagePlay.setAttribute('aria-label', playing ? 'Tạm dừng' : 'Phát');
  updateTimelineDisabled();
  syncMediaSessionState();
}

function updatePlayingRowStates() {
  const currentId = store.state.currentId;
  const playing = Boolean(app.engine?.isPlaying);
  $$('.track-row').forEach((row) => {
    const isCurrent = row.dataset.id === currentId;
    row.classList.toggle('is-current', isCurrent);
    row.classList.toggle('is-playing', isCurrent && playing);
    row.querySelectorAll('.eq-bars').forEach((bars) => bars.setAttribute('data-playing', String(isCurrent && playing)));
  });
  $$('.media-card[data-action="playTrack"]').forEach((card) => {
    card.classList.toggle('is-current', card.dataset.id === currentId);
  });
}

function paintProgress(rawTime, rawDuration) {
  const time = Math.max(0, Number(rawTime) || 0);
  const duration = Math.max(0, Number(rawDuration) || 0);
  if (!app.seeking) {
    const percentage = duration > 0 ? clamp((time / duration) * 100, 0, 100) : 0;
    if (dom.timelineFill) dom.timelineFill.style.width = `${percentage}%`;
    if (dom.seekBar) dom.seekBar.value = String(Math.round(percentage * 10));
    if (dom.currentTime) dom.currentTime.textContent = formatTime(time);
    updateCinemaProgress(time, duration);
    updateKaraokeProgress(time, duration);
  }
  if (duration > 0 && dom.durationTime) dom.durationTime.textContent = formatTime(duration);
  const buffer = getBufferedPercentage();
  if (buffer > 0 && dom.timelineBuffer) {
    dom.timelineBuffer.style.width = `${Math.min(100, buffer)}%`;
  }
}

function getBufferedPercentage() {
  try {
    const element = app.engine?.activeElement?.();
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0) return 0;
    if (!element.buffered?.length) return 0;
    return (element.buffered.end(element.buffered.length - 1) / element.duration) * 100;
  } catch {
    return 0;
  }
}

function updateCinemaProgress(time, duration) {
  const percentage = duration > 0 ? clamp((time / duration) * 100, 0, 100) : 0;
  if (dom.cinemaProgressFill) dom.cinemaProgressFill.style.width = `${percentage}%`;
  if (dom.cinemaCurrent) dom.cinemaCurrent.textContent = formatTime(time);
  if (dom.cinemaDuration) dom.cinemaDuration.textContent = formatTime(duration);
}

function updateKaraokeProgress(time, duration) {
  const safeTime = Math.max(0, Number(time) || 0);
  const safeDuration = Math.max(0, Number(duration) || 0);
  const percentage = safeDuration > 0 ? clamp((safeTime / safeDuration) * 100, 0, 100) : 0;
  if (dom.karaokeProgressFill) dom.karaokeProgressFill.style.width = `${percentage}%`;
  if (dom.karaokeSeek && !app.seeking) dom.karaokeSeek.value = String(Math.round(percentage * 10));
  if (dom.karaokeCurrent) dom.karaokeCurrent.textContent = formatTime(safeTime);
  if (dom.karaokeDuration) dom.karaokeDuration.textContent = formatTime(safeDuration);
}

/* --------------------------------------------------------------------------
   Events & global actions
   -------------------------------------------------------------------------- */
function bindEvents() {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('submit', onDocumentSubmit);
  document.addEventListener('input', onDocumentInput);
  document.addEventListener('change', onDocumentChange);
  document.addEventListener('keydown', onDocumentKeydown);
  window.addEventListener('hashchange', () => renderRoute());
  window.addEventListener('resize', handleResize);
  document.addEventListener('fullscreenchange', updateKaraokeFullscreenButton);
  document.addEventListener('scroll', hideContextMenu, true);
  bindDragAndDrop();
  if (!app.sleepTimer) app.sleepTimer = setInterval(updateSleepUI, 1000);
}

function handleResize() {
  hideContextMenu();
  if (window.innerWidth > 860) closeSidebar();
}

function onDocumentClick(event) {
  const commandItem = event.target.closest('[data-command-index]');
  if (commandItem) {
    event.preventDefault();
    runCommandByIndex(Number(commandItem.dataset.commandIndex));
    return;
  }

  const queueTab = event.target.closest('[data-queue-tab]');
  if (queueTab) {
    event.preventDefault();
    app.queueTab = queueTab.dataset.queueTab === 'history' ? 'history' : 'next';
    renderQueue();
    return;
  }

  const addTab = event.target.closest('[data-add-tab]');
  if (addTab) {
    event.preventDefault();
    showAddTab(addTab.dataset.addTab);
    return;
  }

  const lyricLine = event.target.closest('.lyric-line[data-lyric-time]');
  if (lyricLine && !lyricLine.disabled) {
    event.preventDefault();
    const time = Number(lyricLine.dataset.lyricTime);
    if (Number.isFinite(time) && time >= 0) {
      app.engine.seek(time);
      paintProgress(time, app.engine.getDuration());
      updateLyricsSync(time, { force: true });
    }
    return;
  }

  const actionElement = event.target.closest('[data-action]');
  if (actionElement) {
    if (actionElement.disabled || actionElement.getAttribute('aria-disabled') === 'true') return;
    event.preventDefault();
    const action = actionElement.dataset.action;
    if (!['trackMenu', 'playlistMenu', 'openNowMenu'].includes(action)) hideContextMenu();
    handleAction(action, actionElement, event);
    return;
  }

  if (!event.target.closest('#contextMenu')) hideContextMenu();
}

function onDocumentSubmit(event) {
  const searchForm = event.target.closest('[data-search-form]');
  if (searchForm) {
    event.preventDefault();
    const input = searchForm.querySelector('[name="q"]');
    navigateSearch(input?.value || '');
    return;
  }
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.form;
  if (type === 'addTrack') submitAddForm(form);
  else if (type === 'createPlaylist') submitPlaylistForm(form, false);
  else if (type === 'editPlaylist') submitPlaylistForm(form, true);
  else if (type === 'importLyrics') submitLyricsImport(form);
  else if (type === 'lyricsRadar') submitLyricsRadarForm(form);
  else if (type === 'settings') submitSettingsForm(form);
  else if (type === 'confirm') {
    const action = app.confirmAction;
    app.confirmAction = null;
    closeModal();
    if (typeof action === 'function') action();
  }
}

function onDocumentInput(event) {
  const target = event.target;
  if (target.id === 'addUrlInput' && app.add) {
    app.add.inputUrl = target.value;
    return;
  }
  if (target.id === 'commandInput') {
    renderCommandResults(target.value);
    return;
  }
  if (target.id === 'seekBar') {
    const duration = app.engine?.getDuration() || 0;
    app.seeking = true;
    app.seekTarget = (Number(target.value) / 1000) * duration;
    const percentage = Number(target.value) / 10;
    if (dom.timelineFill) dom.timelineFill.style.width = `${percentage}%`;
    if (dom.currentTime) dom.currentTime.textContent = formatTime(app.seekTarget);
    updateCinemaProgress(app.seekTarget, duration);
    return;
  }
  if (target.id === 'karaokeSeek') {
    const duration = app.engine?.getDuration() || 0;
    app.seeking = true;
    app.seekTarget = (Number(target.value) / 1000) * duration;
    const percentage = Number(target.value) / 10;
    if (dom.karaokeProgressFill) dom.karaokeProgressFill.style.width = `${percentage}%`;
    if (dom.currentTime) dom.currentTime.textContent = formatTime(app.seekTarget);
    if (dom.seekBar) dom.seekBar.value = String(target.value);
    if (dom.timelineFill) dom.timelineFill.style.width = `${percentage}%`;
    if (dom.karaokeCurrent) dom.karaokeCurrent.textContent = formatTime(app.seekTarget);
    return;
  }
  if (target.id === 'volumeBar') {
    const volume = clamp(Number(target.value) / 100, 0, 1);
    store.updateSettings({ volume, muted: false });
    app.engine.setVolume(volume);
    updateVolumeUI();
    return;
  }
  if (target.matches('[data-setting]') && target.type === 'range') {
    const output = $(`[data-setting-value="${target.dataset.setting}"]`);
    if (output) output.textContent = formatSettingValue(target.dataset.setting, target.value);
  }
}

function onDocumentChange(event) {
  const target = event.target;
  if (target.id === 'seekBar') {
    const duration = app.engine?.getDuration() || 0;
    const time = (Number(target.value) / 1000) * duration;
    app.seeking = false;
    app.engine.seek(time);
    paintProgress(time, duration);
    updateLyricsSync(time, { force: true });
    return;
  }
  if (target.id === 'karaokeSeek') {
    const duration = app.engine?.getDuration() || 0;
    const time = (Number(target.value) / 1000) * duration;
    app.seeking = false;
    app.engine.seek(time);
    paintProgress(time, duration);
    updateLyricsSync(time, { force: true, forceScroll: true });
    return;
  }
  if (target.id === 'volumeBar') {
    const volume = clamp(Number(target.value) / 100, 0, 1);
    store.updateSettings({ volume, muted: false });
    app.engine.setVolume(volume);
    updateVolumeUI();
    return;
  }
  if (target.matches('[data-local-input]')) {
    const files = [...(target.files || [])];
    const playlistId = $('#addFilePlaylist')?.value || '';
    target.value = '';
    if (files.length) {
      if (app.modalOpen) closeModal();
      handleLocalFiles(files, { playlistId, playFirst: true });
    }
    return;
  }
  if (target.matches('[data-lyrics-file]')) {
    const file = target.files?.[0];
    if (file) {
      file.text().then((text) => {
        const textarea = $('#lyricsTextarea');
        if (textarea) {
          textarea.value = text;
          textarea.focus();
        }
        toast('Đã đọc tệp lời', { detail: file.name, icon: 'check' });
      }).catch(() => toast('Không đọc được tệp lời.', { type: 'error', icon: 'x' }));
    }
    target.value = '';
    return;
  }
  if (target.matches('[data-setting]')) {
    const key = target.dataset.setting;
    if (!key) return;
    const value = target.type === 'range' ? Number(target.value) : target.value;
    store.updateSettings({ [key]: value });
    applyAllSettings();
    if (key === 'rate') app.engine.setRate(Number(value));
  }
}

function onDocumentKeydown(event) {
  const target = event.target;
  const typing = Boolean(target?.matches?.('input, textarea, select, [contenteditable="true"]') || target?.isContentEditable);

  if (app.commandOpen) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!app.commandItems.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      app.commandIndex = (app.commandIndex + direction + app.commandItems.length) % app.commandItems.length;
      updateCommandActive();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runCommandByIndex(app.commandIndex);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      app.commandIndex = event.key === 'Home' ? 0 : app.commandItems.length - 1;
      updateCommandActive();
      return;
    }
  }

  if (event.key === 'Escape') {
    if (app.menuOpen) { hideContextMenu(); return; }
    if (app.modalOpen) { closeModal(); return; }
    if (app.commandOpen) { closeCommandPalette(); return; }
    if (dom.karaokeStage?.classList.contains('is-open')) { closeKaraoke(); return; }
    if (dom.queueDrawer?.classList.contains('is-open')) { closeQueue(); return; }
    if (dom.cinema?.classList.contains('is-open')) { closeCinema(); return; }
    if (dom.appShell?.classList.contains('sidebar-open')) { closeSidebar(); return; }
    if (dom.appShell?.classList.contains('now-open')) { closeNowPanel(); return; }
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (app.commandOpen) closeCommandPalette();
    else openCommandPalette();
    return;
  }

  if (target.id === 'addUrlInput' && event.key === 'Enter') {
    event.preventDefault();
    analyzeAddUrl();
    return;
  }

  if (typing) return;

  if (app.modalOpen && event.key === 'Tab') {
    const focusables = [...dom.modalCard.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }

  if (app.modalOpen || app.commandOpen) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const key = event.key;
  if (key === ' ') {
    event.preventDefault();
    togglePlayback();
  } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
    event.preventDefault();
    seekBy((key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 30 : 5));
  } else if (key.toLowerCase() === 'm') {
    toggleMuteState();
  } else if (key.toLowerCase() === 's') {
    toggleShuffle();
  } else if (key.toLowerCase() === 'r') {
    cycleRepeatMode();
  } else if (key.toLowerCase() === 'l') {
    openLyricsView();
  } else if (key.toLowerCase() === 'k') {
    toggleKaraoke();
  } else if (key.toLowerCase() === 'c') {
    toggleCinema();
  } else if (key.toLowerCase() === 'n') {
    openAddModal();
  } else if (key === '/') {
    event.preventDefault();
    openCommandPalette();
  } else if (key === '?') {
    openShortcutsModal();
  }
}

function seekBy(seconds) {
  if (!app.engine) return;
  const track = currentTrack();
  if (!track || ['embed', 'external', 'idle'].includes(app.engine.mode)) return;
  const duration = app.engine.getDuration();
  const time = clamp(app.engine.getTime() + seconds, 0, duration || Number.MAX_SAFE_INTEGER);
  app.engine.seek(time);
  paintProgress(time, duration);
  updateLyricsSync(time, { force: true });
}

function handleAction(action, element, event) {
  const id = element.dataset.id || '';
  switch (action) {
    case 'togglePlay':
      togglePlayback();
      break;
    case 'next':
      playNext();
      break;
    case 'previous':
      playPrevious();
      break;
    case 'toggleShuffle':
      toggleShuffle();
      break;
    case 'cycleRepeat':
      cycleRepeatMode();
      break;
    case 'toggleMute':
      toggleMuteState();
      break;
    case 'openNowPanel':
      openNowPanel();
      break;
    case 'closeNowPanel':
      closeNowPanel();
      break;
    case 'openCinema':
      openCinema();
      break;
    case 'closeCinema':
      closeCinema();
      break;
    case 'toggleCinemaQueue':
      if (dom.queueDrawer?.classList.contains('is-open')) closeQueue();
      else openQueue();
      break;
    case 'openQueue':
      openQueue({ tab: element.dataset.tab || 'next' });
      break;
    case 'smartQueue':
      queueSimilarAction();
      break;
    case 'shareCard':
      openShareCard(id);
      break;
    case 'downloadShareCard':
      downloadShareCardAction();
      break;
    case 'closeQueue':
      closeQueue();
      break;
    case 'clearQueue':
      clearQueueAction();
      break;
    case 'removeQueueAt':
      removeQueueAtAction(Number(element.dataset.index));
      break;
    case 'queueTrack':
      queueTrackAction(id);
      break;
    case 'queueNext':
      queueNextAction(id);
      break;
    case 'queuePlaylist':
      queuePlaylistAction(id);
      break;
    case 'trackMenu':
      openTrackMenu(id, event, element.dataset.playlistId || '');
      break;
    case 'openNowMenu':
      if (store.state.currentId) openTrackMenu(store.state.currentId, event);
      break;
    case 'playTrack':
      playTrackAction(element);
      break;
    case 'likeTrack':
    case 'toggleNowLike':
    case 'togglePlayerLike':
      toggleLikeAction(id);
      break;
    case 'addToPlaylist':
      openPlaylistPicker(id);
      break;
    case 'addNowToPlaylist':
      if (store.state.currentId) openPlaylistPicker(store.state.currentId);
      else openAddModal();
      break;
    case 'playlistMenu':
      openPlaylistMenu(id, event);
      break;
    case 'togglePickPlaylist':
      togglePickPlaylist(element.dataset.id, element.dataset.trackId);
      break;
    case 'createPlaylistFromPicker':
      openCreatePlaylistModal({ forTrackId: element.dataset.trackId || '' });
      break;
    case 'playPlaylist':
      playPlaylistById(id);
      break;
    case 'shufflePlaylist':
      playPlaylistById(id, { shuffle: true });
      break;
    case 'openPlaylist':
      if (id) navigate(`/playlist/${id}`);
      break;
    case 'playLiked':
      playLikedSongs();
      break;
    case 'shuffleLiked':
      playLikedSongs({ shuffle: true });
      break;
    case 'playMood':
      playMoodById(id);
      break;
    case 'shuffleMood':
      playMoodById(id, { shuffle: true });
      break;
    case 'queueMood':
      queueMoodById(id);
      break;
    case 'openMood':
      if (id === '__back') navigate('/radio');
      else if (id) navigate(`/radio/${id}`);
      break;
    case 'shuffleAll':
      shuffleAllAction();
      break;
    case 'playSurpriseMood':
      playSurpriseMood();
      break;
    case 'openAdd':
      openAddModal({ playlistId: element.dataset.playlistId || '' });
      break;
    case 'createPlaylist':
      openCreatePlaylistModal();
      break;
    case 'openSettings':
      openSettingsModal();
      break;
    case 'openSpotifySettings':
      openSpotifySettings();
      break;
    case 'connectSpotify':
      connectSpotifyAction();
      break;
    case 'copySpotifyRedirect':
      copySpotifyRedirectAction();
      break;
    case 'refreshSpotify':
      refreshSpotifyAction();
      break;
    case 'disconnectSpotify':
      disconnectSpotifyAction();
      break;
    case 'openSleepTimer':
      openSleepModal();
      break;
    case 'openShortcuts':
      openShortcutsModal();
      break;
    case 'pickFiles':
      dom.fileInput?.click();
      break;
    case 'openSearch':
      openCommandPalette();
      break;
    case 'closeSearch':
      closeCommandPalette();
      break;
    case 'clearSearch':
      navigateSearch('');
      break;
    case 'clearRecentSearches':
      store.forgetSearches();
      toast('Đã xóa lịch sử tìm kiếm', { icon: 'check' });
      if (app.route.name === 'search') renderRoute({ preserveScroll: true });
      break;
    case 'searchFor':
      navigateSearch(element.dataset.query || '');
      break;
    case 'goBack':
      if (history.length > 1) history.back();
      else navigate('/home');
      break;
    case 'goForward':
      history.forward();
      break;
    case 'goHome':
      navigate('/home');
      break;
    case 'toggleSidebar':
      dom.appShell.classList.toggle('sidebar-open');
      break;
    case 'closeSidebar':
      closeSidebar();
      break;
    case 'cyclePalette':
      cyclePalette();
      break;
    case 'openLyricsView':
      openLyricsView();
      break;
    case 'openKaraoke':
      openKaraoke();
      break;
    case 'closeKaraoke':
      closeKaraoke();
      break;
    case 'toggleKaraokeFullscreen':
      toggleKaraokeFullscreen();
      break;
    case 'lyricsRadar':
      openLyricsRadarModal();
      break;
    case 'lyricsRadarRetry':
      runLyricsRadarSearch();
      break;
    case 'useLyricsCandidate':
      useLyricsCandidateAction(Number(element.dataset.index));
      break;
    case 'fetchLyrics':
      fetchLyricsForCurrent();
      break;
    case 'importLyrics':
      openLyricsImportModal();
      break;
    case 'lyricsOffsetDown':
      adjustLyricsOffset(-0.5);
      break;
    case 'lyricsOffsetUp':
      adjustLyricsOffset(0.5);
      break;
    case 'lyricsOffsetReset':
      adjustLyricsOffset(0, { reset: true });
      break;
    case 'deleteLyrics':
      deleteLyricsAction();
      break;
    case 'openExternalTrack':
    case 'openTrackSource':
      openTrackSource(id);
      break;
    case 'copyTrackLink':
      copyTrackLink(id);
      break;
    case 'copyPlaylistLink':
      copyPlaylistLink(id);
      break;
    case 'removeTrackFromPlaylist':
      removeTrackFromPlaylistAction(id, element.dataset.playlistId || '');
      break;
    case 'removeTrack':
      confirmRemoveTrack(id);
      break;
    case 'editPlaylist':
      openEditPlaylistModal(id);
      break;
    case 'togglePinPlaylist':
      togglePinPlaylist(id);
      break;
    case 'duplicatePlaylist':
      duplicatePlaylist(id);
      break;
    case 'deletePlaylist':
    case 'deletePlaylistAction':
      confirmDeletePlaylist(id);
      break;
    case 'restartTrack':
      if (store.state.currentId) {
        app.engine.seek(0);
        app.engine.play();
      }
      break;
    case 'closeModal':
      closeModal();
      break;
    case 'toggleSetting':
      toggleSettingAction(element.dataset.setting);
      break;
    case 'exportData':
      exportDataAction();
      break;
    case 'resetData':
      confirmResetData();
      break;
    case 'startSleep':
      startSleepTimer(element.dataset.minutes);
      break;
    case 'sleepEndTrack':
      sleepAtTrackEnd();
      break;
    case 'cancelSleep':
      cancelSleepTimer({ notify: true });
      if (app.modalOpen) closeModal();
      break;
    case 'analyzeAddUrl':
      analyzeAddUrl();
      break;
    case 'resetAddAnalysis':
      resetAddAnalysis();
      break;
    case 'showAddTab':
      showAddTab(element.dataset.tab);
      break;
    case 'toggleAddPlayNow':
      toggleAddPlayNow();
      break;
    case 'pickPlaylistColor':
      pickPlaylistColor(element);
      break;
    default:
      break;
  }
}

/* --------------------------------------------------------------------------
   Panels, queue & lightweight controls
   -------------------------------------------------------------------------- */
function currentTrack() {
  return store.getTrack(store.state.currentId);
}

function openSidebar() {
  dom.appShell.classList.add('sidebar-open');
}

function closeSidebar() {
  dom.appShell.classList.remove('sidebar-open');
}

function openNowPanel() {
  dom.appShell.classList.remove('now-collapsed');
  dom.appShell.classList.add('now-open');
}

function closeNowPanel({ silent = false } = {}) {
  dom.appShell.classList.remove('now-open');
  dom.appShell.classList.add('now-collapsed');
  if (!silent && window.innerWidth <= 1330) closeSidebar();
}

function openLyricsView() {
  openNowPanel();
  requestAnimationFrame(() => {
    if (!dom.lyricsCard || !dom.nowScroll) return;
    const top = dom.lyricsCard.offsetTop - 52;
    dom.nowScroll.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  });
}

function openKaraoke() {
  if (!dom.karaokeStage) return;
  closeCinema();
  closeQueue();
  closeCommandPalette();
  hideContextMenu();
  dom.karaokeStage.classList.add('is-open');
  dom.karaokeStage.setAttribute('aria-hidden', 'false');
  document.body.classList.add('karaoke-open');
  updateKaraokePanel(currentTrack());
  updatePlaybackUI();
  updateLyricsSync(app.engine?.getTime?.() || 0, { force: true });
  requestAnimationFrame(() => {
    updateLyricsSync(app.engine?.getTime?.() || 0, { force: true, forceScroll: true });
  });
}

function closeKaraoke() {
  if (!dom.karaokeStage) return;
  if (document.fullscreenElement === dom.karaokeStage && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  dom.karaokeStage.classList.remove('is-open');
  dom.karaokeStage.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('karaoke-open');
  updateKaraokeFullscreenButton();
}

function toggleKaraoke() {
  if (dom.karaokeStage?.classList.contains('is-open')) closeKaraoke();
  else openKaraoke();
}

function toggleKaraokeFullscreen() {
  if (!dom.karaokeStage) return;
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
    return;
  }
  if (!dom.karaokeStage.requestFullscreen) {
    toast('Trình duyệt này không hỗ trợ toàn màn hình.', { type: 'warning', icon: 'expand' });
    return;
  }
  dom.karaokeStage.requestFullscreen().catch(() => {
    toast('Không mở được toàn màn hình.', { type: 'warning', icon: 'expand' });
  });
}

function updateKaraokeFullscreenButton() {
  if (!dom.karaokeFullscreenBtn) return;
  const active = document.fullscreenElement === dom.karaokeStage;
  const use = dom.karaokeFullscreenBtn.querySelector('use');
  if (use) use.setAttribute('href', active ? '#i-compress' : '#i-expand');
  dom.karaokeFullscreenBtn.setAttribute('aria-label', active ? 'Thoát toàn màn hình' : 'Bật toàn màn hình');
}

function openCinema() {
  if (!dom.cinema) return;
  dom.cinema.classList.add('is-open');
  dom.cinema.setAttribute('aria-hidden', 'false');
  closeSidebar();
  hideContextMenu();
  updatePlaybackUI();
}

function closeCinema() {
  dom.cinema?.classList.remove('is-open');
  dom.cinema?.setAttribute('aria-hidden', 'true');
  hideContextMenu();
}

function toggleCinema() {
  if (dom.cinema?.classList.contains('is-open')) closeCinema();
  else openCinema();
}

function openQueue({ tab = 'next' } = {}) {
  if (!dom.queueDrawer) return;
  app.queueTab = tab === 'history' ? 'history' : 'next';
  renderQueue();
  dom.queueDrawer.classList.add('is-open');
  dom.queueDrawer.setAttribute('aria-hidden', 'false');
  dom.queueBackdrop?.classList.add('is-open');
  closeCommandPalette();
  hideContextMenu();
}

function closeQueue() {
  dom.queueDrawer?.classList.remove('is-open');
  dom.queueDrawer?.setAttribute('aria-hidden', 'true');
  dom.queueBackdrop?.classList.remove('is-open');
}

function renderQueue() {
  if (!dom.queueBody) return;
  dom.queueBody.innerHTML = renderQueueBody(app.queueTab);
  $$('.drawer-tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.queueTab === app.queueTab);
  });
  if (dom.queueSummary) {
    const currentPos = store.state.order.indexOf(store.state.currentId);
    const remaining = currentPos >= 0 ? store.state.order.length - currentPos - 1 : store.state.order.length;
    dom.queueSummary.textContent = `${store.state.queue.length} chờ thêm · ${Math.max(0, remaining)} tiếp theo`;
  }
  updateModeButtons();
}

function renderUpNextArea() {
  if (!dom.nowUpNext) return;
  dom.nowUpNext.innerHTML = renderUpNext(4);
}

function clearQueueAction() {
  const count = store.state.queue.length;
  if (!count) {
    toast('Hàng đợi thủ công đang trống.', { icon: 'queue' });
    return;
  }
  store.clearQueue();
  renderQueue();
  renderUpNextArea();
  toast('Đã xóa hàng đợi thủ công', { detail: `${count} bài đã bỏ khỏi danh sách chờ.`, icon: 'trash' });
}

function removeQueueAtAction(index) {
  if (!Number.isInteger(index) || index < 0) return;
  store.removeQueueAt(index);
  renderQueue();
  renderUpNextArea();
}

function queueTrackAction(trackId) {
  if (!trackId || !store.queueTrack(trackId)) return;
  renderQueue();
  renderUpNextArea();
  const track = store.getTrack(trackId);
  toast('Đã thêm vào hàng đợi', { detail: track ? `${track.title} · ${track.artist}` : '', icon: 'queue' });
}

function queueNextAction(trackId) {
  if (!trackId || !store.queueTrack(trackId, { next: true })) return;
  renderQueue();
  renderUpNextArea();
  const track = store.getTrack(trackId);
  toast('Sẽ phát tiếp theo', { detail: track ? `${track.title} · ${track.artist}` : '', icon: 'queue' });
}

function queuePlaylistAction(playlistId) {
  const playlist = store.playlistById(playlistId);
  if (!playlist) return;
  const tracks = store.playlistTracks(playlist);
  if (!tracks.length) {
    toast('Playlist này chưa có bài hát.', { type: 'warning', icon: 'folder' });
    return;
  }
  tracks.forEach((track) => store.queueTrack(track.id));
  renderQueue();
  renderUpNextArea();
  toast(`Đã thêm ${tracks.length} bài vào hàng đợi`, { detail: playlist.name, icon: 'queue' });
}

function playTrackAction(element) {
  const id = element.dataset.id || '';
  const track = store.getTrack(id);
  if (!track) return;
  const sameLoaded = id === store.state.currentId && app.engine?.track?.id === id && app.engine.mode !== 'idle';
  if (sameLoaded) {
    togglePlayback();
    return;
  }
  const fromContext = findContextFromElement(element, id);
  startTrack(id, { fromContext });
}

function toggleLikeAction(rawId) {
  const id = rawId || store.state.currentId;
  if (!id) {
    openAddModal();
    return;
  }
  const track = store.getTrack(id);
  if (!track) return;
  const liked = store.toggleLike(id);
  syncLikeButtons(id, liked);
  if (id === store.state.currentId) updateNowPanel(track);
  renderSidebar();
  toast(liked ? 'Đã thêm vào bài hát đã thích' : 'Đã bỏ khỏi bài hát đã thích', {
    detail: `${track.title} · ${track.artist}`,
    icon: 'heart'
  });
  if (app.route.name === 'liked' || (app.route.name === 'library' && app.route.params.get('tab') === 'liked')) {
    renderRoute({ preserveScroll: true });
  }
}

function syncLikeButtons(id, liked) {
  $$('[data-action="likeTrack"]').forEach((button) => {
    if (button.dataset.id !== id) return;
    button.classList.toggle('is-liked', liked);
    button.setAttribute('aria-pressed', String(liked));
    button.setAttribute('aria-label', liked ? 'Bỏ thích bài hát' : 'Thích bài hát');
  });
  if (id === store.state.currentId) {
    [dom.nowLikeBtn, dom.playerLikeBtn].forEach((button) => {
      if (!button) return;
      button.classList.toggle('is-liked', liked);
      button.setAttribute('aria-pressed', String(liked));
    });
  }
}

function shuffleAllAction() {
  const ids = store.allTrackIds();
  if (!ids.length) {
    openAddModal();
    return;
  }
  playCollection(ids, { type: 'library', id: 'all', label: 'Tất cả bài hát', shuffle: true });
  toast('Đang phát ngẫu nhiên toàn bộ thư viện', { detail: `${ids.length} bài hát`, icon: 'shuffle' });
}

function playSurpriseMood() {
  if (!MOODS.length) return;
  const mood = MOODS[Math.floor(Math.random() * MOODS.length)];
  playMoodById(mood.id, { shuffle: true });
  toast(`Đài ${mood.label}`, { detail: 'Một tần số ngẫu nhiên cho ngày hôm nay.', icon: 'compass' });
}

function openTrackSource(trackId) {
  const track = store.getTrack(trackId || store.state.currentId);
  if (!track) return;
  const url = safeUrl(track.url || track.embedUrl || track.src);
  if (!url) {
    toast('Bài này không có liên kết nguồn.', { type: 'warning', icon: 'external' });
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) toast('Trình duyệt đã chặn tab mới.', { detail: 'Hãy cho phép pop-up cho SONORA.', type: 'warning', icon: 'external' });
}

async function copyTrackLink(trackId) {
  const track = store.getTrack(trackId || store.state.currentId);
  if (!track) return;
  if (!track.url) {
    toast('Bài hát gốc không có liên kết để sao chép.', { type: 'warning', icon: 'link' });
    return;
  }
  const ok = await copyText(track.url);
  toast(ok ? 'Đã sao chép liên kết bài hát' : 'Không sao chép được liên kết', {
    detail: track.title,
    type: ok ? 'success' : 'error',
    icon: ok ? 'copy' : 'x'
  });
}

async function copyPlaylistLink(playlistId) {
  const playlist = store.playlistById(playlistId);
  if (!playlist) return;
  const url = `${location.origin}${location.pathname}#/playlist/${playlist.id}`;
  const ok = await copyText(url);
  toast(ok ? 'Đã sao chép liên kết playlist' : 'Không sao chép được liên kết', {
    detail: playlist.name,
    type: ok ? 'success' : 'error',
    icon: ok ? 'copy' : 'x'
  });
}

function removeTrackFromPlaylistAction(trackId, playlistId) {
  if (!trackId || !playlistId) return;
  const playlist = store.playlistById(playlistId);
  if (!playlist) return;
  const removed = store.removeTrackFromPlaylist(playlistId, trackId);
  if (!removed) return;
  renderSidebar();
  renderQueue();
  renderUpNextArea();
  if (app.route.name === 'playlist' && app.route.id === playlistId) renderRoute({ preserveScroll: true });
  toast('Đã xóa khỏi playlist', { detail: playlist.name, icon: 'trash' });
}

function confirmRemoveTrack(trackId) {
  const track = store.getTrack(trackId);
  if (!track) return;
  openConfirmModal({
    title: `Xóa “${track.title}”?`,
    message: 'Bài hát sẽ bị xóa khỏi thư viện, playlist, bài đã thích và hàng đợi. Tệp nhạc gốc trên máy của bạn không bị ảnh hưởng.',
    confirmLabel: 'Xóa bài hát',
    onConfirm: () => {
      const wasPlaying = app.engine?.track?.id === track.id && Boolean(app.engine?.isPlaying);
      store.removeTrack(track.id);
      renderSidebar();
      renderRoute({ preserveScroll: true });
      renderQueue();
      const nextTrack = currentTrack();
      if (nextTrack) {
        updateTrackChrome(nextTrack);
        loadLyricsForTrack(nextTrack, { auto: true });
        if (wasPlaying) startTrack(nextTrack.id, { preserveOrder: true });
        else if (app.engine?.track?.id === track.id) app.engine.load(nextTrack, { autoplay: false }).catch(() => {});
      } else {
        app.engine?.stop();
        updateTrackChrome(null);
        loadLyricsForTrack(null);
      }
      toast('Đã xóa bài hát', { detail: track.title, icon: 'trash' });
    }
  });
}

function togglePinPlaylist(playlistId) {
  const playlist = store.playlistById(playlistId);
  if (!playlist) return;
  store.updatePlaylist(playlistId, { pinned: !playlist.pinned });
  renderSidebar();
  renderRoute({ preserveScroll: true });
  toast(playlist.pinned ? 'Đã ghim playlist' : 'Đã bỏ ghim playlist', { detail: playlist.name, icon: 'pin' });
}

function duplicatePlaylist(playlistId) {
  const playlist = store.playlistById(playlistId);
  if (!playlist) return;
  const copy = store.createPlaylist({
    name: `${playlist.name} (bản sao)`,
    description: playlist.description,
    trackIds: [...playlist.trackIds],
    colors: [...playlist.colors]
  });
  if (!copy) return;
  renderSidebar();
  toast('Đã nhân bản playlist', { detail: copy.name, icon: 'copy' });
  navigate(`/playlist/${copy.id}`);
}

function confirmDeletePlaylist(playlistId) {
  const playlist = store.playlistById(playlistId);
  if (!playlist) return;
  openConfirmModal({
    title: `Xóa playlist “${playlist.name}”?`,
    message: 'Playlist sẽ bị xóa vĩnh viễn. Những bài hát bên trong vẫn còn trong thư viện của bạn.',
    confirmLabel: 'Xóa playlist',
    onConfirm: () => {
      store.deletePlaylist(playlist.id);
      renderSidebar();
      if (app.route.name === 'playlist' && app.route.id === playlist.id) navigate('/library?tab=playlists');
      else renderRoute({ preserveScroll: true });
      toast('Đã xóa playlist', { detail: playlist.name, icon: 'trash' });
    }
  });
}

function toggleSettingAction(setting) {
  if (!setting) return;
  const value = !store.state.settings[setting];
  store.updateSettings({ [setting]: value });
  applyAllSettings();
  const button = $(`[data-action="toggleSetting"][data-setting="${setting}"]`);
  if (button) {
    button.classList.toggle('is-on', value);
    button.setAttribute('aria-checked', String(value));
  }
  const labels = {
    visualizer: 'Hiệu ứng sóng âm',
    autoLyrics: 'Tự động tải lời',
    spotifyFullPlayback: 'Spotify Full',
    autoplaySimilar: 'Tự động phát bài tương tự'
  }
  toast(`${value ? 'Đã bật' : 'Đã tắt'} ${labels[setting] || setting}`, { icon: value ? 'sparkles' : 'x' });
}

function exportDataAction() {
  const date = new Date().toISOString().slice(0, 10);
  downloadJson(`sonora-backup-${date}.json`, store.exportState());
  toast('Đã xuất bản sao lưu', { detail: `sonora-backup-${date}.json`, icon: 'download' });
}

function confirmResetData() {
  openConfirmModal({
    title: 'Đặt lại toàn bộ SONORA?',
    message: 'Tất cả playlist, bài hát đã thêm, lượt thích, lời đã lưu và cài đặt sẽ bị xóa khỏi trình duyệt này. Hành động này không thể hoàn tác.',
    confirmLabel: 'Đặt lại tất cả',
    onConfirm: () => {
      store.resetState();
      toast('Đang đặt lại vũ trụ…', { icon: 'sparkles' });
      setTimeout(() => location.reload(), 420);
    }
  });
}

/* --------------------------------------------------------------------------
   Sleep timer
   -------------------------------------------------------------------------- */
function formatSleepRemaining(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updateSleepUI() {
  if (!dom.sleepButton) return;
  if (app.sleepFiring) return;
  if (app.sleepEndsAt && Date.now() >= app.sleepEndsAt) {
    fireSleepTimer();
    return;
  }
  const active = app.sleepEndsAt > Date.now();
  const endTrack = Boolean(app.sleepEndTrack);
  dom.sleepButton.classList.toggle('is-active', active || endTrack);
  if (dom.sleepCountdown) {
    dom.sleepCountdown.textContent = active
      ? formatSleepRemaining(app.sleepEndsAt - Date.now())
      : (endTrack ? '1 bài' : '');
  }
  const modalRemaining = $('#sleepModalRemaining');
  if (modalRemaining) {
    modalRemaining.textContent = active ? formatSleepRemaining(app.sleepEndsAt - Date.now()) : '—';
  }
  const modalState = $('#sleepModalState');
  if (modalState) {
    modalState.textContent = active
      ? 'Đồng hồ đang chạy. SONORA sẽ mờ dần và dừng khi hết giờ.'
      : endTrack
        ? 'Sẽ dừng ngay khi bài hát hiện tại kết thúc.'
        : 'Chưa có hẹn giờ. Nghe liền một mạch hay dừng thật nhẹ?';
  }
}

function openSleepModal() {
  const active = app.sleepEndsAt > Date.now();
  const endTrack = Boolean(app.sleepEndTrack);
  const options = [15, 30, 45, 60, 90, 120];
  const html = `<div class="modal-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">Chăm sóc phiên nghe</span>
      <h2 class="modal-title" id="modalTitle">Hẹn giờ ngủ</h2>
      <p class="modal-sub">Để âm nhạc tự khép lại thay bạn. Nhạc sẽ mờ dần trước khi dừng hẳn.</p>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <div class="modal-body">
    <div class="sleep-options">
      ${options.map((minutes) => `<button type="button" class="sleep-option" data-action="startSleep" data-minutes="${minutes}">${minutes} phút</button>`).join('')}
    </div>
    <div class="modal-note" id="sleepModalState">${active
      ? 'Đồng hồ đang chạy. SONORA sẽ mờ dần và dừng khi hết giờ.'
      : endTrack
        ? 'Sẽ dừng ngay khi bài hát hiện tại kết thúc.'
        : 'Chưa có hẹn giờ. Nghe liền một mạch hay dừng thật nhẹ?'}</div>
    ${active ? `<div class="sleep-current">${icon('moon')}<span>Còn lại</span><strong id="sleepModalRemaining">${formatSleepRemaining(app.sleepEndsAt - Date.now())}</strong></div>` : ''}
    <div class="add-play-row" style="margin-top:16px">
      <div>
        <strong>Dừng sau bài hiện tại</strong>
        <small>Phát hết bài đang mở rồi dừng, không cần chờ đồng hồ.</small>
      </div>
      <button type="button" class="soft-action" data-action="sleepEndTrack" ${endTrack ? 'aria-disabled="true"' : ''}>${icon('moon')}${endTrack ? 'Đang chờ hết bài' : 'Dừng sau bài này'}</button>
    </div>
  </div>
  <div class="modal-foot">
    <span class="foot-note">Mẹo: hẹn giờ vẫn chạy khi bạn chuyển trang.</span>
    ${active || endTrack ? `<button type="button" class="ghost-btn" data-action="cancelSleep">${icon('x')}Hủy hẹn giờ</button>` : ''}
    <button type="button" class="ghost-btn" data-action="closeModal">Đóng</button>
  </div>`;
  openModal({ html, narrow: true });
}

function startSleepTimer(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return;
  if (app.sleepTimeout) clearTimeout(app.sleepTimeout);
  app.sleepEndTrack = false;
  app.sleepEndsAt = Date.now() + value * 60_000;
  app.sleepTimeout = setTimeout(fireSleepTimer, value * 60_000);
  updateSleepUI();
  closeModal();
  toast(`Hẹn giờ ngủ ${value} phút`, {
    detail: 'Nhạc sẽ nhỏ dần và dừng khi hết giờ.',
    icon: 'moon'
  });
}

function sleepAtTrackEnd() {
  if (!currentTrack()) {
    toast('Chưa có bài hát nào đang phát.', { type: 'warning', icon: 'moon' });
    return;
  }
  cancelSleepTimer();
  app.sleepEndTrack = true;
  updateSleepUI();
  closeModal();
  toast('Sẽ dừng sau bài hiện tại', {
    detail: 'SONORA sẽ khép phiên nghe khi bài hát kết thúc.',
    icon: 'moon'
  });
}

function cancelSleepTimer({ notify = false } = {}) {
  const hadTimer = Boolean(app.sleepEndsAt || app.sleepEndTrack);
  if (app.sleepTimeout) {
    clearTimeout(app.sleepTimeout);
    app.sleepTimeout = null;
  }
  app.sleepEndsAt = 0;
  app.sleepEndTrack = false;
  updateSleepUI();
  if (notify && hadTimer) toast('Đã hủy hẹn giờ ngủ', { icon: 'clock' });
}

function fireSleepTimer() {
  if (app.sleepFiring) return;
  if (!app.sleepEndsAt && !app.sleepEndTrack) return;
  app.sleepFiring = true;
  if (app.sleepTimeout) {
    clearTimeout(app.sleepTimeout);
    app.sleepTimeout = null;
  }
  app.sleepEndsAt = 0;
  app.sleepEndTrack = false;
  updateSleepUI();
  if (app.engine?.isPlaying) app.engine.fadeOut(1.6);
  else app.engine?.pause();
  toast('Đã đến giờ ngủ', {
    detail: 'SONORA tạm dừng để bạn nghỉ ngơi. Hẹn gặp lại ở bài tiếp theo.',
    icon: 'moon'
  });
  window.setTimeout(() => { app.sleepFiring = false; }, 900);
}

/* --------------------------------------------------------------------------
   Media Session & operating-system controls
   -------------------------------------------------------------------------- */
function applyMediaSessionMetadata(track) {
  if (!('mediaSession' in navigator)) return;
  if (!track) {
    try { navigator.mediaSession.metadata = null; } catch { /* noop */ }
    return;
  }
  try {
    const cover = trackCover(track);
    const artwork = cover
      ? [{ src: cover, sizes: '512x512', type: cover.startsWith('data:image/svg') ? 'image/svg+xml' : undefined }]
      : [];
    if (typeof MediaMetadata === 'function') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'SONORA',
        artist: track.artist || 'SONORA',
        album: track.album || 'SONORA',
        artwork
      });
    }
  } catch (error) {
    console.warn('Media Session metadata unavailable', error);
  }
}

function setupMediaSessionHandlers() {
  if (!('mediaSession' in navigator) || app.mediaSessionReady) return;
  app.mediaSessionReady = true;
  const setHandler = (name, handler) => {
    try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* unsupported action */ }
  };
  setHandler('play', () => {
    if (!app.engine?.isPlaying) togglePlayback();
  });
  setHandler('pause', () => {
    if (app.engine?.isPlaying) app.engine.pause();
    updatePlaybackUI();
  });
  setHandler('previoustrack', () => playPrevious());
  setHandler('nexttrack', () => playNext());
  setHandler('seekbackward', (details) => seekBy(-(details?.seekOffset || 10)));
  setHandler('seekforward', (details) => seekBy(details?.seekOffset || 10));
  setHandler('seekto', (details) => {
    if (Number.isFinite(details?.seekTime)) {
      app.engine.seek(details.seekTime);
      paintProgress(details.seekTime, app.engine.getDuration());
      updateLyricsSync(details.seekTime, { force: true });
    }
  });
  setHandler('stop', () => {
    app.engine?.pause();
    app.engine?.seek(0);
    updatePlaybackUI();
  });
}

function syncMediaSessionState() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = app.engine?.isPlaying ? 'playing' : 'paused';
  } catch { /* noop */ }
  updateMediaPositionState();
}

function updateMediaPositionState() {
  if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
  const duration = Number(app.engine?.getDuration?.()) || 0;
  if (!(duration > 0)) return;
  const position = clamp(Number(app.engine?.getTime?.()) || 0, 0, Math.max(0, duration - 0.1));
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: clamp(Number(store.state.settings.rate) || 1, 0.5, 2),
      position
    });
  } catch { /* noop */ }
}

/* --------------------------------------------------------------------------
   Lyrics
   -------------------------------------------------------------------------- */
function paintLyricsOffset() {
  const track = currentTrack();
  const value = track ? store.lyricsOffset(track.id) : 0;
  const label = `${value > 0 ? '+' : ''}${value.toFixed(1)}s`;
  if (dom.lyricsOffsetLabel) dom.lyricsOffsetLabel.textContent = label;
  if (dom.karaokeOffsetLabel) dom.karaokeOffsetLabel.textContent = label;
}

function lyricsSourceLabel(source = '') {
  const value = String(source || '').trim();
  return value || 'Chưa tải';
}

function karaokeEmptyMarkup() {
  return `<div class="karaoke-empty">
    <div class="karaoke-empty-orbit" aria-hidden="true"><span></span><span></span><span></span><i></i></div>
    <strong>Chưa nhận diện được lời</strong>
    <p>SONORA có thể dò lời trên LRCLIB, hoặc bạn dán trực tiếp LRC để bắt đầu chế độ lyrics sống động.</p>
    <div class="karaoke-empty-actions">
      <button type="button" class="primary-btn" data-action="lyricsRadar">${icon('compass')}Dò lời phù hợp</button>
      <button type="button" class="ghost-btn" data-action="fetchLyrics">${icon('search')}Tìm tự động</button>
      <button type="button" class="ghost-btn" data-action="importLyrics">${icon('plus')}Dán lời / LRC</button>
    </div>
  </div>`;
}

function paintLyricsRecognition(source = app.lyricsSource || 'Chưa tải') {
  const recognition = lyricsRecognition(app.lyrics);
  const timed = app.lyrics.some((line) => line.time != null);
  if (dom.lyricsSyncState) {
    dom.lyricsSyncState.innerHTML = `<i></i> ${recognition.label}`;
  }
  if (dom.lyricsSource) {
    const label = lyricsSourceLabel(source);
    dom.lyricsSource.textContent = label;
    dom.lyricsSource.title = label;
  }
  if (dom.karaokeSource) {
    const label = lyricsSourceLabel(source);
    dom.karaokeSource.textContent = label;
    dom.karaokeSource.title = label;
  }
  if (dom.karaokeSyncBadge) {
    dom.karaokeSyncBadge.textContent = recognition.label;
    dom.karaokeSyncBadge.dataset.tone = recognition.tone;
  }
  if (dom.karaokeLineCount) {
    const mode = recognition.wordSynced
      ? ' · word sync'
      : recognition.estimated
        ? ' · ước lượng'
        : timed
          ? ' · theo nhạc'
          : '';
    dom.karaokeLineCount.textContent = recognition.total
      ? `${recognition.total} dòng${mode}`
      : 'Chưa có lời';
  }
  return recognition;
}

function renderLyricsViews(source = app.lyricsSource || 'Chưa tải') {
  const track = currentTrack();
  const offset = track ? store.lyricsOffset(track.id) : 0;
  const markup = renderLyricLines(app.lyrics, { offset });
  if (dom.nowLyrics) dom.nowLyrics.innerHTML = markup;
  if (dom.cinemaLyrics) dom.cinemaLyrics.innerHTML = markup;
  if (dom.karaokeLyrics) {
    dom.karaokeLyrics.classList.toggle('is-empty', !app.lyrics.length);
    dom.karaokeLyrics.innerHTML = app.lyrics.length ? markup : karaokeEmptyMarkup();
  }
  paintLyricsRecognition(source);
  paintLyricsOffset();
  app.activeLyricIndex = -1;
  refreshLyricsSpotlight();
}

function refreshLyricsSpotlight() {
  if (app.route.name !== 'home') return;
  const node = $('.lyrics-spotlight');
  const track = currentTrack();
  if (!node || !track) return;
  node.outerHTML = renderLyricsSpotlight(track);
}

function loadLyricsForTrack(track, { auto = false } = {}) {
  app.lyricsToken += 1;
  app.lyricsTrackId = track?.id || '';
  app.activeLyricIndex = -1;
  app.lyrics = [];
  if (!track) {
    app.lyricsSource = 'Chưa tải';
    renderLyricsViews('Chưa tải');
    return;
  }

  const entry = store.getLyricsEntry(track);
  if (entry?.text) {
    app.lyrics = parseLyrics(entry.text, track.duration || 0);
    app.lyricsSource = entry.source || 'Đã lưu';
    renderLyricsViews(app.lyricsSource);
    requestAnimationFrame(() => updateLyricsSync(app.engine?.getTime?.() || 0, { force: true }));
    return;
  }

  app.lyricsSource = 'Chưa tải';
  renderLyricsViews('Chưa tải');
  if (auto && store.state.settings.autoLyrics && !app.lyricsFetched.has(track.id)) {
    app.lyricsFetched.add(track.id);
    fetchLyricsForCurrent({ silent: true });
  }
}

function applyLyricsText(track, { text, source }) {
  if (!track) return;
  app.lyrics = parseLyrics(text, track.duration || 0);
  app.lyricsSource = source || 'Đã lưu';
  renderLyricsViews(app.lyricsSource);
  const time = app.engine?.getTime?.() || 0;
  updateLyricsSync(time, { force: true, forceScroll: true });
}

async function fetchLyricsForCurrent({ silent = false } = {}) {
  const track = currentTrack();
  if (!track) {
    toast('Chọn một bài hát trước đã nhé.', { type: 'warning', icon: 'music' });
    return;
  }
  const trackId = track.id;
  app.lyricsFetched.add(trackId);
  const hadLyrics = app.lyrics.length > 0;
  if (dom.lyricsSource) dom.lyricsSource.textContent = 'Đang tìm trên LRCLIB…';
  if (dom.karaokeSource) dom.karaokeSource.textContent = 'Đang tìm trên LRCLIB…';
  if (dom.lyricsSyncState && !hadLyrics) dom.lyricsSyncState.innerHTML = '<i></i> Đang tìm';
  if (dom.karaokeSyncBadge && !hadLyrics) {
    dom.karaokeSyncBadge.textContent = 'Đang nhận diện';
    dom.karaokeSyncBadge.dataset.tone = 'loading';
  }
  try {
    const payload = await fetchLyricsFromApi(track);
    const { text, synced } = lyricsPayloadToText(payload);
    if (!text.trim()) throw new Error('Không tìm thấy lời cho bài này.');
    if (app.lyricsTrackId !== trackId) return;
    const source = payload?.trackName ? `LRCLIB · ${payload.trackName}` : 'LRCLIB';
    store.setLyrics(trackId, text, source, synced);
    const freshTrack = store.getTrack(trackId);
    applyLyricsText(freshTrack || track, { text, source });
    if (!silent) {
      toast('Đã tìm thấy lời bài hát', {
        detail: synced ? `Đồng bộ theo nhạc · ${payload?.trackName || track.title}` : 'Lời thường, chưa có timestamp.',
        icon: 'sparkles'
      });
    }
  } catch (error) {
    if (app.lyricsTrackId !== trackId) return;
    const notFound = error?.status === 404;
    const source = notFound ? 'Không có trên LRCLIB' : 'Không tải được lời';
    app.lyricsSource = source;
    if (!hadLyrics) renderLyricsViews(source);
    else {
      if (dom.lyricsSource) dom.lyricsSource.textContent = source;
      if (dom.karaokeSource) dom.karaokeSource.textContent = source;
    }
    if (!silent) {
      toast(notFound ? 'Không tìm thấy lời cho bài này' : 'Không tải được lời bài hát', {
        detail: notFound
          ? 'Bạn có thể dán lời hoặc tệp LRC bằng nút dấu cộng.'
          : 'Kiểm tra kết nối máy chủ SONORA rồi thử lại.',
        type: notFound ? 'warning' : 'error',
        icon: notFound ? 'search' : 'x'
      });
    }
  }
}

function updateLyricsSync(time, { force = false, forceScroll = false } = {}) {
  if (!app.lyrics.length) {
    if (app.activeLyricIndex !== -1 || force) {
      app.activeLyricIndex = -1;
      highlightLyricIndex(-1, false);
    }
    return;
  }
  const track = currentTrack();
  if (!track) return;
  const rawTime = Number(time) || 0;
  const offset = store.lyricsOffset(track.id);
  const found = findActiveLyricIndex(app.lyrics, rawTime, offset);
  const index = found < 0 && app.lyrics[0]?.time != null ? 0 : found;
  applyLyricPlayhead(index, rawTime, offset);
  if (index === app.activeLyricIndex && !force) return;
  app.activeLyricIndex = index;
  highlightLyricIndex(index, forceScroll || force);
}

function applyLyricPlayhead(index, rawTime, offset) {
  const progress = lyricProgress(app.lyrics, rawTime, offset);
  for (const root of [dom.nowLyrics, dom.cinemaLyrics, dom.karaokeLyrics]) {
    if (!root) continue;
    const lines = $$('.lyric-line', root);
    const line = lines[index];
    if (!line) continue;
    line.style.setProperty('--line-progress', `${(progress * 100).toFixed(2)}%`);
    const words = $$('.lyric-word', line);
    if (!words.length) continue;
    let activeWord = -1;
    for (const word of words) {
      const wordTime = Number(word.dataset.wordTime);
      const sung = Number.isFinite(wordTime) && rawTime >= wordTime - 0.04;
      word.classList.toggle('is-sung', sung);
      if (sung) activeWord = Number(word.dataset.wordIndex);
    }
    line.classList.toggle('is-word-active', activeWord >= 0);
  }
}

function highlightLyricIndex(index, shouldScroll) {
  for (const root of [dom.nowLyrics, dom.cinemaLyrics, dom.karaokeLyrics]) {
    if (!root) continue;
    const lines = $$('.lyric-line', root);
    lines.forEach((line, lineIndex) => {
      line.classList.toggle('is-active', lineIndex === index);
      line.classList.toggle('is-past', lineIndex < index);
      if (lineIndex === index) line.setAttribute('aria-current', 'true');
      else line.removeAttribute('aria-current');
    });
    if (shouldScroll && index >= 0 && lines[index]) {
      scrollLineIntoView(lines[index]);
    }
  }
}

function scrollLineIntoView(line) {
  if (!line) return;
  if (Date.now() - app.userLyricsScrollAt < 4200) return;
  const container = line.closest('.lyrics-scroll, .cinema-lyrics-scroll, .karaoke-lyrics-scroll');
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  const lineRect = line.getBoundingClientRect();
  if (container.scrollHeight <= container.clientHeight + 8) return;
  const target = container.scrollTop + (lineRect.top - containerRect.top)
    - container.clientHeight / 2 + lineRect.height / 2;
  app.lyricScrollGuard = Date.now() + 800;
  container.scrollTo({
    top: Math.max(0, target),
    behavior: store.state.settings.motion === 'reduced' ? 'auto' : 'smooth'
  });
}

function setupLyricsScrollTracking() {
  for (const element of [dom.lyricsScroll, dom.cinemaLyricsScroll, dom.karaokeLyricsScroll]) {
    element?.addEventListener('scroll', () => {
      if (Date.now() < app.lyricScrollGuard) return;
      app.userLyricsScrollAt = Date.now();
    }, { passive: true });
  }
}

function adjustLyricsOffset(delta, { reset = false } = {}) {
  const track = currentTrack();
  if (!track) {
    toast('Chọn một bài hát để đồng bộ lời.', { type: 'warning', icon: 'lyrics' });
    return;
  }
  const current = Number(delta) || 0;
  const next = reset ? 0 : store.lyricsOffset(track.id) + current;
  const saved = store.setLyricsOffset(track.id, next);
  paintLyricsOffset();
  renderLyricsViews(app.lyricsSource);
  updateLyricsSync(app.engine?.getTime?.() || 0, { force: true, forceScroll: true });
  if (reset) toast('Đã đặt lại đồng bộ lời', { detail: `${saved.toFixed(1)}s`, icon: 'check' });
}

function openLyricsImportModal() {
  const track = currentTrack();
  if (!track) {
    toast('Chọn một bài hát trước đã nhé.', { type: 'warning', icon: 'music' });
    return;
  }
  const entry = store.getLyricsEntry(track);
  const existing = entry?.text ? escapeHTML(entry.text) : '';
  const html = `<div class="modal-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">Lời bài hát · ${escapeHTML(track.title)}</span>
      <h2 class="modal-title" id="modalTitle">Dán lời hoặc tệp LRC</h2>
      <p class="modal-sub">Lời có timestamp dạng [00:12.50] sẽ chạy theo nhạc. Lời thường vẫn được chia nhịp tự động.</p>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <form class="modal-form" data-form="importLyrics">
    <div class="modal-body">
      <div class="field">
        <div class="field-label"><span>Nội dung lời</span><span>Hỗ trợ LRC &amp; văn bản thường</span></div>
        <textarea id="lyricsTextarea" name="lyrics" data-autofocus placeholder="[00:08.40] Streetlights melt into the rain&#10;[00:15.20] We are sparks inside a wire" spellcheck="false">${existing}</textarea>
      </div>
      <div class="field-hint"><strong>Mẹo:</strong> mỗi dòng LRC có thể có nhiều timestamp. Bạn cũng có thể tải tệp .lrc hoặc .txt từ máy.</div>
      <label class="ghost-chip" style="margin-top:10px;cursor:pointer">
        ${icon('upload')}Đọc từ tệp
        <input type="file" accept=".lrc,.txt,text/plain" data-lyrics-file hidden>
      </label>
    </div>
    <div class="modal-foot">
      <span class="foot-note">Lời được lưu cục bộ theo từng bài hát.</span>
      <button type="button" class="ghost-btn" data-action="closeModal">Hủy</button>
      <button type="submit" class="primary-btn">${icon('check')}Lưu lời</button>
    </div>
  </form>`;
  openModal({ html });
}

function submitLyricsImport(form) {
  const track = currentTrack();
  if (!track) return;
  const data = new FormData(form);
  const text = String(data.get('lyrics') || '').trim();
  if (!text) {
    toast('Chưa có nội dung lời để lưu.', { type: 'warning', icon: 'lyrics' });
    return;
  }
  const synced = /\[\d{1,3}:\d{1,2}/.test(text);
  store.setLyrics(track.id, text, 'Dán thủ công', synced);
  applyLyricsText(track, { text, source: 'Dán thủ công' });
  closeModal();
  toast('Đã lưu lời bài hát', {
    detail: synced ? 'Đã nhận timestamp · lời sẽ chạy theo nhạc.' : 'Lời thường · nhịp được ước lượng theo thời lượng.',
    icon: 'check'
  });
}

function deleteLyricsAction() {
  const track = currentTrack();
  if (!track) return;
  const entry = store.getLyricsEntry(track);
  if (!entry?.text) {
    toast('Bài này chưa có lời để xóa.', { type: 'warning', icon: 'lyrics' });
    return;
  }
  openConfirmModal({
    title: 'Xóa lời của bài hát này?',
    message: `Lời của “${track.title}” sẽ bị xóa khỏi bộ nhớ cục bộ. Bạn vẫn có thể tìm lại từ LRCLIB hoặc dán lời mới.`,
    confirmLabel: 'Xóa lời',
    onConfirm: () => {
      store.clearLyrics(track.id);
      if (track.lrc) {
        track.lrc = '';
        track.lyricsSource = '';
        store.save();
      }
      app.lyrics = [];
      app.lyricsSource = 'Chưa tải';
      renderLyricsViews('Chưa tải');
      toast('Đã xóa lời bài hát', { detail: track.title, icon: 'trash' });
    }
  });
}

function openLyricsRadarModal() {
  const track = currentTrack();
  if (!track) {
    toast('Chọn một bài hát trước để dò lời.', { type: 'warning', icon: 'music' });
    return;
  }
  app.lyricsRadarToken += 1;
  app.lyricsRadarTrackId = track.id;
  app.lyricsCandidates = [];
  const current = store.getLyricsEntry(track);
  const currentLabel = current?.text
    ? `${lyricsSourceLabel(current.source || app.lyricsSource)} · ${lyricsRecognition(parseLyrics(current.text, track.duration || 0)).label}`
    : 'Chưa có lời trong thư viện';
  const html = `<div class="modal-head lyrics-radar-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">Lyrics Radar · nhận diện lời</span>
      <h2 class="modal-title" id="modalTitle">Tìm đúng lời cho <em>${escapeHTML(track.title)}</em></h2>
      <p class="modal-sub">SONORA đối chiếu tên bài, nghệ sĩ và thời lượng trên LRCLIB. Chọn bản khớp nhất để đưa thẳng vào Lyrics Live.</p>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <form class="modal-form lyrics-radar-form" data-form="lyricsRadar">
    <div class="modal-body">
      <div class="lyrics-radar-search">
        <label class="field">
          <span class="field-label"><span>Tên bài hát</span></span>
          <input type="text" name="track" value="${escapeAttr(track.title || '')}" placeholder="Tên bài hát" autocomplete="off">
        </label>
        <label class="field">
          <span class="field-label"><span>Nghệ sĩ</span></span>
          <input type="text" name="artist" value="${escapeAttr(track.artist || '')}" placeholder="Nghệ sĩ" autocomplete="off">
        </label>
        <button type="submit" class="primary-btn lyrics-radar-submit">${icon('compass')}Dò lời</button>
      </div>
      <div class="lyrics-radar-meta">
        <span class="lyrics-radar-current">${icon('lyrics')}${escapeHTML(currentLabel)}</span>
        <span class="lyrics-radar-source">Nguồn: LRCLIB</span>
      </div>
      <div class="lyrics-radar-results" id="lyricsRadarResults" aria-live="polite">
        <div class="lyrics-radar-loading">
          <span class="radar-scan" aria-hidden="true"><i></i><i></i><i></i></span>
          <div><strong>Đang quét kho lời…</strong><span>SONORA đang so khớp tên bài, nghệ sĩ và thời lượng.</span></div>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <span class="foot-note">Bạn có thể sửa tên bài hoặc nghệ sĩ nếu bản gốc bị lẫn tên video.</span>
      <button type="button" class="ghost-btn" data-action="closeModal">Đóng</button>
    </div>
  </form>`;
  openModal({ html, wide: true, className: 'lyrics-radar-modal' });
  runLyricsRadarSearch();
}

function submitLyricsRadarForm() {
  runLyricsRadarSearch();
}

async function runLyricsRadarSearch() {
  const form = $('.lyrics-radar-form');
  const results = $('#lyricsRadarResults');
  if (!form || !results) return;
  const track = currentTrack();
  if (!track) return;
  const data = new FormData(form);
  const title = String(data.get('track') || '').trim();
  const artist = String(data.get('artist') || '').trim();
  if (!title) {
    results.innerHTML = `<div class="lyrics-radar-empty"><strong>Thiếu tên bài hát</strong><p>Nhập tên bài hát để SONORA bắt đầu dò lời.</p></div>`;
    return;
  }
  const token = ++app.lyricsRadarToken;
  app.lyricsRadarTrackId = track.id;
  results.innerHTML = `<div class="lyrics-radar-loading">
    <span class="radar-scan" aria-hidden="true"><i></i><i></i><i></i></span>
    <div><strong>Đang quét kho lời…</strong><span>Đối chiếu “${escapeHTML(title)}”${artist ? ` · ${escapeHTML(artist)}` : ''}</span></div>
  </div>`;
  form.querySelector('.lyrics-radar-submit')?.setAttribute('disabled', 'true');
  try {
    const items = await searchLyricsCandidates({ track: title, artist });
    if (token !== app.lyricsRadarToken || app.lyricsRadarTrackId !== store.state.currentId || !app.modalOpen) return;
    app.lyricsCandidates = items;
    results.innerHTML = renderLyricsRadarResults(items);
  } catch (error) {
    if (token !== app.lyricsRadarToken) return;
    results.innerHTML = `<div class="lyrics-radar-empty is-error">
      <strong>Không dò được lời lúc này</strong>
      <p>${escapeHTML(error?.message || 'Máy chủ lời bài hát đang bận. Thử lại sau ít giây nhé.')}</p>
      <button type="button" class="ghost-btn" data-action="lyricsRadarRetry">${icon('search')}Thử lại</button>
    </div>`;
  } finally {
    form.querySelector('.lyrics-radar-submit')?.removeAttribute('disabled');
  }
}

function renderLyricsRadarResults(items = []) {
  if (!items.length) {
    return `<div class="lyrics-radar-empty">
      <span class="lyrics-empty-orb"><span></span><span></span><span></span></span>
      <strong>Không tìm thấy bản lời phù hợp</strong>
      <p>Thử bỏ các hậu tố như “Official Video”, “Lyrics” hoặc nhập tên nghệ sĩ khác.</p>
    </div>`;
  }
  return `${items.map((item, index) => {
    const duration = item.duration ? formatTime(item.duration) : '—';
    const syncLabel = item.synced ? 'Synced' : 'Lời thường';
    const syncTone = item.synced ? 'synced' : 'plain';
    return `<article class="lyrics-match">
      <span class="lyrics-match-rank">${String(index + 1).padStart(2, '0')}</span>
      <div class="lyrics-match-copy">
        <div class="lyrics-match-title">
          <strong>${escapeHTML(item.trackName || 'Không tên')}</strong>
          <span class="lyrics-match-badge" data-tone="${syncTone}">${syncLabel}</span>
        </div>
        <span class="lyrics-match-artist">${escapeHTML(item.artistName || 'Không rõ nghệ sĩ')}${item.albumName ? ` · ${escapeHTML(item.albumName)}` : ''}</span>
        <p class="lyrics-match-excerpt">${escapeHTML(item.excerpt || 'Bản lời này chưa có đoạn xem trước.')}</p>
        <span class="lyrics-match-info">${duration}${item.instrumental ? ' · Instrumental' : ''} · LRCLIB</span>
      </div>
      <button type="button" class="primary-btn lyrics-match-use" data-action="useLyricsCandidate" data-index="${index}">${icon('check')}Dùng lời</button>
    </article>`;
  }).join('')}`;
}

function useLyricsCandidateAction(index) {
  const item = app.lyricsCandidates[index];
  const track = currentTrack();
  if (!item || !track) {
    toast('Bản lời này không còn khả dụng.', { type: 'warning', icon: 'lyrics' });
    return;
  }
  if (app.lyricsRadarTrackId && app.lyricsRadarTrackId !== track.id) {
    toast('Bài đang phát đã thay đổi', { detail: 'Hãy mở Lyrics Radar lại cho bài mới.', type: 'warning', icon: 'lyrics' });
    return;
  }
  const text = String(item.syncedLyrics || item.plainLyrics || '').trim();
  if (!text) {
    toast('Bản lời này đang trống.', { type: 'warning', icon: 'lyrics' });
    return;
  }
  const name = item.trackName || track.title;
  const artist = item.artistName ? ` · ${item.artistName}` : '';
  const source = `LRCLIB · ${name}${artist}`;
  store.setLyrics(track.id, text, source, Boolean(item.syncedLyrics));
  applyLyricsText(track, { text, source });
  closeModal();
  toast('Đã nhận diện lời bài hát', {
    detail: item.synced ? 'Bản lời có timestamp, sẵn sàng cho Lyrics Live.' : 'Bản lời thường, SONORA sẽ ước lượng nhịp theo thời lượng.',
    icon: 'sparkles'
  });
}


/* --------------------------------------------------------------------------
   Modal primitives
   -------------------------------------------------------------------------- */
function openModal({ html = '', wide = false, narrow = false, className = '' } = {}) {
  if (!dom.modalLayer || !dom.modalCard) return;
  app.confirmAction = null;
  dom.modalCard.className = `modal-card${wide ? ' modal-card--wide' : ''}${narrow ? ' modal-card--narrow' : ''}${className ? ` ${className}` : ''}`;
  dom.modalCard.innerHTML = html;
  if (!app.modalOpen) app.lastFocus = document.activeElement;
  dom.modalLayer.classList.add('is-open');
  dom.modalLayer.setAttribute('aria-hidden', 'false');
  app.modalOpen = true;
  document.body.classList.add('has-modal');
  requestAnimationFrame(() => {
    const preferred = dom.modalCard.querySelector('[data-autofocus]');
    const fallback = dom.modalCard.querySelector('input:not([type="hidden"]), textarea, select, button.primary-btn, button.ghost-btn');
    (preferred || fallback)?.focus();
  });
}

function closeModal() {
  if (!dom.modalLayer) return;
  dom.modalLayer.classList.remove('is-open');
  dom.modalLayer.setAttribute('aria-hidden', 'true');
  app.modalOpen = false;
  app.confirmAction = null;
  document.body.classList.remove('has-modal');
  const focusTarget = app.lastFocus;
  app.lastFocus = null;
  if (focusTarget && focusTarget.isConnected && !focusTarget.disabled) {
    requestAnimationFrame(() => focusTarget.focus());
  }
}

function openConfirmModal({ title = 'Xác nhận', message = '', confirmLabel = 'Xác nhận', onConfirm = null } = {}) {
  const html = `<div class="modal-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">Một bước nữa thôi</span>
      <h2 class="modal-title" id="modalTitle">${escapeHTML(title)}</h2>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <form class="modal-form" data-form="confirm">
    <div class="modal-body">
      <div class="modal-note">${escapeHTML(message)}</div>
    </div>
    <div class="modal-foot">
      <button type="button" class="ghost-btn" data-action="closeModal">Hủy</button>
      <button type="submit" class="primary-btn is-danger" data-autofocus>${escapeHTML(confirmLabel)}</button>
    </div>
  </form>`;
  openModal({ html, narrow: true });
  app.confirmAction = typeof onConfirm === 'function' ? onConfirm : null;
}

/* --------------------------------------------------------------------------
   Add music / local imports
   -------------------------------------------------------------------------- */
function playlistOptionsMarkup(selectedId = '') {
  return `<option value="">Không thêm vào playlist</option>${store.state.playlists.map((playlist) => (
    `<option value="${escapeAttr(playlist.id)}"${playlist.id === selectedId ? ' selected' : ''}>${escapeHTML(playlist.name)}</option>`
  )).join('')}`;
}

function addAnalysisFormMarkup(analysis) {
  if (!analysis) return '';
  const duplicate = analysis.duplicateId ? store.getTrack(analysis.duplicateId) : null;
  const statusClass = duplicate || analysis.warning ? ' is-warn' : '';
  const sourceLabel = SOURCE_META[analysis.source]?.label || analysis.platform || 'Liên kết';
  let status = 'Sẵn sàng thêm vào thư viện';
  if (duplicate) status = 'Bài hát này đã có trong thư viện';
  else if (analysis.warning) status = 'Đã đọc thông tin cơ bản';
  else if (analysis.type === 'embed') status = 'Sẽ phát trong khung chính thức';
  else if (analysis.type === 'external') status = 'Sẽ mở trên nền tảng gốc';
  else if (analysis.type === 'youtube') status = 'Sẵn sàng phát qua YouTube';
  else status = 'Sẵn sàng phát trong SONORA';

  if (analysis.type === 'spotify') {
    const spotifyStatus = spotify.getStatus();
    status = store.state.settings.spotifyFullPlayback && spotifyStatus.connected && spotifyStatus.premium
      ? 'Sẵn sàng phát đầy đủ qua Spotify'
      : 'Sẽ mở Spotify Web · đăng nhập Premium để nghe đầy đủ';
  }
  const spotifyPreviewStatus = spotify.getStatus();
  const typeLabel = analysis.type === 'youtube'
    ? 'YouTube'
    : analysis.type === 'spotify'
      ? (spotifyPreviewStatus.connected && spotifyPreviewStatus.premium ? 'Spotify Full' : 'Spotify Web')
      : analysis.type === 'embed'
        ? 'Nhúng chính thức'
        : analysis.type === 'video'
          ? 'Video'
          : analysis.type === 'audio'
            ? 'Âm thanh'
            : 'Liên kết ngoài';

  return `<div class="analysis-preview">
    <span class="analysis-cover"><img src="${escapeAttr(analysis.cover || PLACEHOLDER_COVER)}" alt=""></span>
    <div class="analysis-body">
      <span class="analysis-status${statusClass}"><i></i>${escapeHTML(status)}</span>
      <strong>${escapeHTML(analysis.title || 'Chưa đặt tên')}</strong>
      <p>${escapeHTML(analysis.artist || 'Chưa rõ nghệ sĩ')} · ${escapeHTML(sourceLabel)} · ${escapeHTML(typeLabel)}</p>
    </div>
    <div class="analysis-actions">
      <button type="button" class="text-btn" data-action="resetAddAnalysis">Đổi</button>
      ${duplicate ? `<button type="button" class="text-btn" data-action="playTrack" data-id="${escapeAttr(duplicate.id)}">Nghe</button>` : ''}
    </div>
  </div>
  ${analysis.warning ? `<div class="modal-note">${icon('sparkles')} ${escapeHTML(analysis.warning)}</div>` : ''}
  <div class="analysis-form">
    <div class="field-row">
      <div class="field">
        <label class="field-label" for="addTitleInput"><span>Tên bài hát</span><span>Bắt buộc</span></label>
        <input id="addTitleInput" name="title" value="${escapeAttr(analysis.title)}" maxlength="220" required data-autofocus>
      </div>
      <div class="field">
        <label class="field-label" for="addArtistInput"><span>Nghệ sĩ</span><span>Có thể sửa</span></label>
        <input id="addArtistInput" name="artist" value="${escapeAttr(analysis.artist)}" maxlength="160">
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label class="field-label" for="addAlbumInput"><span>Album</span><span>Không bắt buộc</span></label>
        <input id="addAlbumInput" name="album" value="${escapeAttr(analysis.album || '')}" maxlength="160" placeholder="Album hoặc bộ sưu tập">
      </div>
      <div class="field">
        <label class="field-label" for="addGenreInput"><span>Thể loại</span><span>Không bắt buộc</span></label>
        <input id="addGenreInput" name="genre" value="${escapeAttr(analysis.genre || '')}" maxlength="80" placeholder="Ví dụ: Synthwave, Lo-fi…">
      </div>
    </div>
    <div class="field">
      <label class="field-label" for="addPlaylistSelect"><span>Lưu vào playlist</span><span>Không bắt buộc</span></label>
      <select id="addPlaylistSelect" name="playlistId">${playlistOptionsMarkup(app.add?.playlistId || '')}</select>
    </div>
    <div class="add-play-row">
      <div>
        <strong>Phát ngay sau khi thêm</strong>
        <small>Mở bài hát này và bắt đầu phiên nghe của bạn.</small>
      </div>
      <button type="button" class="switch${app.add?.playNow ? ' is-on' : ''}" data-action="toggleAddPlayNow" role="switch" aria-checked="${Boolean(app.add?.playNow)}" aria-label="Phát ngay sau khi thêm"></button>
    </div>
  </div>`;
}

function addTabMarkup() {
  const add = app.add;
  if (!add) return '';
  if (add.tab === 'file') {
    return `<div class="file-drop">
      <span class="file-drop-icon">${icon('upload')}</span>
      <strong>Thả tệp nhạc vào đây</strong>
      <small>MP3, M4A, WAV, FLAC, OGG, MP4, WEBM… Tệp được phát trực tiếp trong trình duyệt và chỉ tồn tại trong phiên này.</small>
      <label class="ghost-chip" style="cursor:pointer">
        ${icon('folder')}Chọn tệp từ máy
        <input type="file" accept="audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.mp4,.webm,.mov" data-local-input multiple hidden>
      </label>
    </div>
    <div class="field" style="margin-top:14px">
      <label class="field-label" for="addFilePlaylist"><span>Thêm vào playlist</span><span>Không bắt buộc</span></label>
      <select id="addFilePlaylist" name="filePlaylistId">${playlistOptionsMarkup(add.playlistId || '')}</select>
    </div>
    <div class="modal-note">Không có tệp nào được tải lên máy chủ. Video sẽ tự lấy một khung hình làm bìa nếu trình duyệt cho phép.</div>`;
  }

  const analysis = add.analysis;
  const canAnalyze = Boolean(add.inputUrl);
  return `<div class="source-chips" aria-label="Nền tảng được hỗ trợ">
    ${PLATFORM_GUIDE.map((platform) => {
      const meta = SOURCE_META[platform.id === 'file' ? 'local' : platform.id];
      return `<span class="source-chip" title="${escapeAttr(platform.hint)}">${icon(meta?.icon || 'link')}${escapeHTML(platform.label)}</span>`;
    }).join('')}
  </div>
  <div class="url-analyze-row">
    <div class="field">
      <label class="field-label" for="addUrlInput"><span>Liên kết bài hát</span><span>YouTube, Spotify, SoundCloud, MP3…</span></label>
      <div class="url-field">
        ${icon('link')}
        <input id="addUrlInput" name="url" type="url" value="${escapeAttr(add.inputUrl || '')}" placeholder="Dán liên kết bất kỳ hoặc đường dẫn tệp âm thanh…" autocomplete="off" spellcheck="false" data-autofocus>
      </div>
      <div class="field-hint">Hỗ trợ YouTube, YouTube Music, Spotify, SoundCloud, Bandcamp, Suno, Audiomack, Vimeo và tệp MP3/MP4 trực tiếp.</div>
    </div>
    <button type="button" class="primary-btn" data-action="analyzeAddUrl" ${add.loading ? 'disabled' : ''}>${add.loading ? '<span class="spinner"></span>' : icon('sparkles')}Phân tích</button>
  </div>
  ${add.loading ? `<div class="analysis-loading"><span class="spinner"></span><span>Đang đọc thông tin bài hát và ảnh bìa…</span></div>` : ''}
  ${analysis ? addAnalysisFormMarkup(analysis) : ''}
  ${!analysis && !add.loading ? `<div class="modal-note">${icon('sparkles')} Dán liên kết rồi bấm <strong>Phân tích</strong>. Nếu nền tảng không cung cấp metadata, bạn vẫn có thể tự điền tên bài hát.</div>` : ''}`;
}

function addModalMarkup() {
  const add = app.add || { tab: 'link', playNow: true };
  const linkTab = add.tab !== 'file';
  const analysis = add.analysis;
  const duplicate = analysis?.duplicateId ? store.getTrack(analysis.duplicateId) : null;
  const canSubmit = linkTab && Boolean(analysis) && !duplicate && !add.loading;
  return `<div class="modal-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">Mở rộng vũ trụ âm nhạc</span>
      <h2 class="modal-title" id="modalTitle">Thêm bài hát</h2>
      <p class="modal-sub">Một liên kết, một tệp, một mảnh ký ức. SONORA sẽ đưa nó vào đúng chỗ.</p>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <form class="modal-form" data-form="addTrack">
    <div class="modal-body">
      <div class="modal-tabs" role="tablist" aria-label="Cách thêm bài hát">
        <button type="button" class="modal-tab${linkTab ? ' is-active' : ''}" data-add-tab="link" role="tab" aria-selected="${linkTab}">${icon('link')}Liên kết</button>
        <button type="button" class="modal-tab${linkTab ? '' : ' is-active'}" data-add-tab="file" role="tab" aria-selected="${!linkTab}">${icon('upload')}Tệp từ máy</button>
      </div>
      <div id="addTabContent">${addTabMarkup()}</div>
    </div>
    <div class="modal-foot">
      <span class="foot-note">${linkTab ? 'Bài hát được lưu vào thư viện của riêng bạn.' : 'Tệp chỉ tồn tại trong phiên nghe này.'}</span>
      <button type="button" class="ghost-btn" data-action="closeModal">Hủy</button>
      ${linkTab ? `<button type="submit" class="primary-btn" ${canSubmit ? '' : 'disabled'}>${icon('plus')}Thêm bài hát</button>` : ''}
    </div>
  </form>`;
}

function refreshAddModal({ focusSelector = '' } = {}) {
  if (!app.modalOpen || !dom.modalCard?.querySelector('[data-add-tab]')) return;
  dom.modalCard.innerHTML = addModalMarkup();
  if (focusSelector) {
    requestAnimationFrame(() => $(focusSelector, dom.modalCard)?.focus());
  }
}

function openAddModal({ playlistId = '', tab = 'link' } = {}) {
  app.addToken += 1;
  app.add = {
    tab: tab === 'file' ? 'file' : 'link',
    inputUrl: '',
    loading: false,
    analysis: null,
    playlistId: playlistId || '',
    playNow: true
  };
  openModal({ html: addModalMarkup(), wide: true });
}

function showAddTab(tab) {
  if (!app.add) return;
  const next = tab === 'file' ? 'file' : 'link';
  if (next === app.add.tab) return;
  const urlInput = $('#addUrlInput');
  if (urlInput) app.add.inputUrl = urlInput.value;
  app.add.tab = next;
  refreshAddModal();
  requestAnimationFrame(() => $(`[data-add-tab="${next}"]`, dom.modalCard)?.focus());
}

function resetAddAnalysis() {
  if (!app.add) return;
  const currentUrl = $('#addUrlInput')?.value || app.add.inputUrl;
  app.addToken += 1;
  app.add.inputUrl = currentUrl;
  app.add.analysis = null;
  app.add.loading = false;
  refreshAddModal({ focusSelector: '#addUrlInput' });
}

function toggleAddPlayNow() {
  if (!app.add) return;
  app.add.playNow = !app.add.playNow;
  const button = $('[data-action="toggleAddPlayNow"]', dom.modalCard);
  if (button) {
    button.classList.toggle('is-on', app.add.playNow);
    button.setAttribute('aria-checked', String(app.add.playNow));
  }
}

function findDuplicateTrack({ url = '', embedUrl = '', videoId = '', source = '', title = '', artist = '' }) {
  const normalizedTitle = store.normalizeText(title);
  const normalizedArtist = store.normalizeText(artist);
  return store.allTracks().find((track) => {
    if (url && track.url && track.url === url) return true;
    if (embedUrl && track.embedUrl && track.embedUrl === embedUrl) return true;
    if (videoId && (track.videoId === videoId || track.id === videoId)) return true;
    if (source && track.source === source && normalizedTitle
      && store.normalizeText(track.title) === normalizedTitle
      && store.normalizeText(track.artist) === normalizedArtist) return true;
    return false;
  }) || null;
}

function buildAddAnalysis(detected, metadata = null) {
  const provider = String(metadata?.provider || detected.source || 'other');
  const source = provider === 'generic' ? 'other' : provider;
  const previewUrl = safeUrl(metadata?.previewUrl || '');
  const metadataEmbed = safeUrl(metadata?.embedUrl || '');
  const embedUrl = metadataEmbed || detected.embedUrl || '';
  const directUrl = detected.directUrl || (detected.type === 'audio' || detected.type === 'video' ? detected.url : '');
  const metadataTitle = String(metadata?.title || '').trim();
  const parsedTitle = detected.source === 'youtube' || detected.source === 'youtube-music'
    ? parseTitleArtist(metadataTitle, metadata?.artist || '')
    : { title: metadataTitle, artist: metadata?.artist || '' };
  const fallbackHost = (() => {
    try { return new URL(detected.url).hostname.replace(/^www\./, ''); } catch { return 'Liên kết'; }
  })();
  const title = cleanTrackTitle(parsedTitle.title || metadataTitle || '') || fallbackHost || 'Bài hát mới';
  const artist = String(parsedTitle.artist || metadata?.artist || (detected.source === 'other' ? fallbackHost : 'Nghệ sĩ chưa rõ')).trim();
  const cover = safeUrl(metadata?.cover || '') || makeCover(title, artist, detected.url);
  let type = detected.type;
  let src = directUrl;

  if (detected.type === 'youtube') {
    type = 'youtube';
    src = '';
  } else if (detected.source === 'spotify') {
    type = 'spotify';
    src = previewUrl;
  } else if (['soundcloud', 'suno', 'audiomack', 'vimeo'].includes(detected.source)) {
    type = 'embed';
    src = '';
  } else if (detected.source === 'bandcamp') {
    if (previewUrl) {
      type = 'audio';
      src = previewUrl;
    } else if (embedUrl && detectMediaFile(embedUrl) === 'video') {
      type = 'video';
      src = embedUrl;
    } else {
      type = 'external';
      src = '';
    }
  } else if (directUrl) {
    type = detected.type === 'video' ? 'video' : 'audio';
    src = directUrl;
  } else if (previewUrl) {
    type = 'audio';
    src = previewUrl;
  } else if (detected.source === 'generic' || detected.source === 'other') {
    type = 'external';
    src = '';
  } else if (embedUrl && metadata?.type === 'embed') {
    type = 'embed';
    src = '';
  } else {
    type = 'external';
    src = '';
  }

  const finalUrl = String(metadata?.url || detected.url || '');
  const duplicate = findDuplicateTrack({
    url: finalUrl,
    embedUrl: type === 'embed' ? embedUrl : '',
    videoId: detected.type === 'youtube' ? detected.id : '',
    source,
    title,
    artist
  });
  const warning = metadata?.warning
    || (!metadata && !directUrl ? 'Không đọc được metadata tự động. Bạn vẫn có thể tự điền thông tin bên dưới.' : '');
  return {
    source,
    platform: detected.platform,
    type,
    title,
    artist,
    album: String(metadata?.album || '').trim(),
    genre: String(metadata?.genre || detected.label || '').trim(),
    cover,
    description: String(metadata?.description || '').slice(0, 500),
    duration: Math.max(0, Number(metadata?.duration) || 0),
    url: finalUrl,
    src,
    embedUrl,
    videoId: detected.id || '',
    spotifyId: detected.source === 'spotify' ? detected.id || '' : '',
    spotifyType: detected.source === 'spotify' ? detected.subtype || 'track' : '',
    previewUrl: previewUrl || '',
    warning,
    duplicateId: duplicate?.id || ''
  };
}

async function analyzeAddUrl() {
  if (!app.add) return;
  const input = $('#addUrlInput');
  const raw = String(input?.value || app.add.inputUrl || '').trim();
  app.add.inputUrl = raw;
  if (!raw) {
    toast('Dán một liên kết trước đã nhé.', { type: 'warning', icon: 'link' });
    input?.focus();
    return;
  }
  const detected = detectSource(raw);
  if (!detected.url) {
    toast('Liên kết này chưa đúng định dạng.', { type: 'warning', icon: 'link' });
    input?.focus();
    return;
  }

  const token = ++app.addToken;
  app.add.loading = true;
  app.add.analysis = null;
  app.add.tab = 'link';
  refreshAddModal();
  const localLike = detected.type === 'audio' || detected.type === 'video' || detected.source === 'local';
  let metadata = null;
  let warning = '';
  if (!localLike) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 16000);
    try {
      const response = await fetch(`/api/metadata?url=${encodeURIComponent(detected.url)}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (response.ok) {
        metadata = await response.json().catch(() => null);
      } else {
        const payload = await response.json().catch(() => null);
        warning = payload?.error || 'Không đọc được metadata tự động. Bạn vẫn có thể tự điền thông tin.';
      }
    } catch (error) {
      warning = error?.name === 'AbortError'
        ? 'Máy chủ phản hồi hơi lâu. Bạn vẫn có thể thêm bài hát với thông tin tự điền.'
        : 'Không kết nối được dịch vụ đọc metadata. Bạn vẫn có thể thêm thủ công.';
    } finally {
      window.clearTimeout(timeout);
    }
  }
  if (token !== app.addToken) return;
  const analysis = buildAddAnalysis(detected, metadata);
  if (warning) analysis.warning = warning;
  app.add.analysis = analysis;
  app.add.loading = false;
  refreshAddModal({ focusSelector: '#addTitleInput' });
  if (analysis.duplicateId) {
    toast('Bài hát này đã có trong thư viện', {
      detail: 'Bạn có thể nghe ngay thay vì thêm một bản trùng.',
      type: 'warning',
      icon: 'check'
    });
  }
}

function buildTrackFromAnalysis(analysis, overrides = {}) {
  const sourceMeta = SOURCE_META[analysis.source] || SOURCE_META.other;
  const title = String(overrides.title || analysis.title || 'Bài hát mới').trim().slice(0, 220);
  const artist = String(overrides.artist || analysis.artist || 'Nghệ sĩ chưa rõ').trim().slice(0, 160);
  const album = String(overrides.album || analysis.album || 'SONORA').trim().slice(0, 160);
  const genre = String(overrides.genre || analysis.genre || '').trim().slice(0, 80);
  const cover = safeUrl(overrides.cover || analysis.cover, { allowData: true }) || makeCover(title, artist, analysis.url);
  return {
    id: uid('tr'),
    title,
    artist,
    album,
    year: new Date().getFullYear(),
    cover,
    src: analysis.src || '',
    type: analysis.type,
    source: analysis.source || 'other',
    url: analysis.url || '',
    embedUrl: analysis.embedUrl || '',
    videoId: analysis.videoId || '',
    spotifyId: analysis.spotifyId || '',
    spotifyType: analysis.spotifyType || '',
    previewUrl: analysis.previewUrl || '',
    duration: Math.max(0, Number(analysis.duration) || 0),
    genre: genre || sourceMeta.label,
    tags: [sourceMeta.label, genre].filter(Boolean),
    description: analysis.description || '',
    colors: [sourceMeta.color || '#ff6b9a', '#8b5cf6', '#5ee8c1', '#ffc06b'],
    addedAt: Date.now(),
    plays: 0
  };
}

async function submitAddForm(form) {
  if (!app.add) return;
  if (app.add.tab === 'file') {
    toast('Chọn một tệp từ máy để thêm vào thư viện nhé.', { type: 'warning', icon: 'upload' });
    return;
  }
  const data = new FormData(form);
  const rawUrl = String(data.get('url') || app.add.inputUrl || '').trim();
  const analysis = app.add.analysis;
  if (!analysis) {
    if (rawUrl) {
      app.add.inputUrl = rawUrl;
      await analyzeAddUrl();
    } else {
      toast('Dán liên kết rồi bấm Phân tích trước nhé.', { type: 'warning', icon: 'link' });
      $('#addUrlInput')?.focus();
    }
    return;
  }
  if (analysis.duplicateId) {
    toast('Bài hát này đã có trong thư viện', {
      detail: 'Mở bài hát cũ để tiếp tục nghe.',
      type: 'warning',
      icon: 'check'
    });
    return;
  }
  const title = String(data.get('title') || analysis.title || '').trim();
  if (!title) {
    toast('Đặt một cái tên cho bài hát nhé.', { type: 'warning', icon: 'music' });
    $('#addTitleInput')?.focus();
    return;
  }
  const playlistId = String(data.get('playlistId') || '');
  const track = buildTrackFromAnalysis(analysis, {
    title,
    artist: data.get('artist'),
    album: data.get('album'),
    genre: data.get('genre')
  });
  const saved = store.addTrack(track);
  if (!saved) {
    toast('Không thêm được bài hát này.', { type: 'error', icon: 'x' });
    return;
  }
  const playlist = playlistId ? store.playlistById(playlistId) : null;
  if (playlist) store.addTracksToPlaylist(playlist.id, [saved.id]);
  const playNow = Boolean(app.add.playNow);
  closeModal();
  renderSidebar();
  renderRoute({ preserveScroll: true });
  renderQueue();
  renderUpNextArea();
  if (playNow) {
    const allAdded = store.addedTracks(999).map((item) => item.id);
    const fromContext = playlist
      ? { type: 'playlist', id: playlist.id, label: playlist.name, ids: playlist.trackIds }
      : { type: 'library', id: 'uploads', label: 'Tệp của tôi', ids: allAdded };
    startTrack(saved.id, { fromContext });
  }
  toast('Đã thêm vào thư viện', {
    detail: playlist ? `${saved.title} · ${playlist.name}` : saved.title,
    icon: 'check'
  });
}

/* --------------------------------------------------------------------------
   Local files
   -------------------------------------------------------------------------- */
function probeLocalMedia(file, type, objectUrl) {
  return new Promise((resolve) => {
    const el = document.createElement(type === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.muted = true;
    el.playsInline = true;
    let settled = false;
    let poster = '';
    const finish = (duration = 0) => {
      if (settled) return;
      settled = true;
      el.removeAttribute('src');
      el.load();
      resolve({ duration: Math.max(0, Number(duration) || 0), poster });
    };
    const capturePoster = () => {
      if (type !== 'video' || !el.videoWidth || !el.videoHeight) {
        finish(el.duration);
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        const width = 640;
        const height = Math.round((el.videoHeight / el.videoWidth) * width);
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(el, 0, 0, width, height);
        poster = canvas.toDataURL('image/jpeg', 0.72);
      } catch {
        poster = '';
      }
      finish(el.duration);
    };
    el.addEventListener('loadedmetadata', () => {
      if (type === 'video' && Number.isFinite(el.duration) && el.duration > 0.2) {
        try { el.currentTime = Math.min(1.2, el.duration * 0.12); } catch { capturePoster(); }
      } else {
        finish(el.duration);
      }
    }, { once: true });
    el.addEventListener('seeked', capturePoster, { once: true });
    el.addEventListener('error', () => finish(0), { once: true });
    window.setTimeout(() => finish(el.duration), 7000);
    el.src = objectUrl;
    el.load();
  });
}

async function handleLocalFiles(files, { playlistId = '', playFirst = true } = {}) {
  const accepted = [...files].filter((file) => file && (file.type.startsWith('audio/') || file.type.startsWith('video/') || ['audio', 'video'].includes(detectMediaFile(file.name))));
  if (!accepted.length) {
    toast('Chưa tìm thấy tệp âm thanh hoặc video nào.', { type: 'warning', icon: 'upload' });
    return;
  }
  const added = [];
  toast(`Đang chuẩn bị ${accepted.length} tệp…`, { detail: 'Đọc thời lượng và tạo ảnh bìa ngay trên máy.', icon: 'upload' });
  for (const file of accepted) {
    const isVideo = file.type.startsWith('video/') || detectMediaFile(file.name) === 'video';
    const blobUrl = URL.createObjectURL(file);
    let probe = { duration: 0, poster: '' };
    try {
      probe = await probeLocalMedia(file, isVideo ? 'video' : 'audio', blobUrl);
    } catch {
      probe = { duration: 0, poster: '' };
    }
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
    const parsed = parseTitleArtist(baseName, '');
    const title = cleanTrackTitle(parsed.title || baseName) || 'Tệp âm thanh';
    const artist = parsed.artist && parsed.artist !== 'Unknown artist' ? parsed.artist : 'Tệp của tôi';
    const track = store.addSessionTrack({
      id: uid('tr'),
      title,
      artist,
      album: 'Tệp từ máy',
      year: new Date().getFullYear(),
      cover: probe.poster || makeCover(title, artist, file.name),
      src: blobUrl,
      type: isVideo ? 'video' : 'audio',
      source: 'local',
      url: '',
      duration: Math.round(probe.duration),
      genre: isVideo ? 'Video' : 'Âm thanh',
      tags: ['local', isVideo ? 'video' : 'audio'],
      description: file.name,
      colors: isVideo ? ['#b4b2ff', '#8b5cf6', '#55c7ff', '#ffc06b'] : ['#9be2c1', '#5ee8c1', '#2f7ea5', '#ffc06b'],
      addedAt: Date.now(),
      plays: 0
    });
    if (track) added.push(track);
  }
  if (!added.length) {
    toast('Không thêm được tệp nào.', { type: 'error', icon: 'x' });
    return;
  }
  const playlist = playlistId ? store.playlistById(playlistId) : null;
  if (playlist) store.addTracksToPlaylist(playlist.id, added.map((track) => track.id));
  renderSidebar();
  if (app.route.name === 'library') renderRoute({ preserveScroll: true });
  renderQueue();
  renderUpNextArea();
  if (playFirst) {
    const ids = added.map((track) => track.id);
    const fromContext = playlist
      ? { type: 'playlist', id: playlist.id, label: playlist.name, ids: playlist.trackIds }
      : { type: 'library', id: 'uploads', label: 'Tệp của tôi', ids };
    startTrack(ids[0], { fromContext });
  }
  toast(`Đã thêm ${added.length} tệp`, {
    detail: playlist ? `Đã lưu vào ${playlist.name}` : 'Tệp chỉ tồn tại trong phiên nghe này.',
    icon: 'upload'
  });
}

/* --------------------------------------------------------------------------
   Playlist creation, editing & picker
   -------------------------------------------------------------------------- */
function playlistColorChoices(selectedIndex = 0) {
  return PLAYLIST_COLORS.map((colors, index) => `<button type="button" class="color-dot${index === selectedIndex ? ' is-active' : ''}" data-action="pickPlaylistColor" data-index="${index}" style="background:linear-gradient(135deg, ${escapeAttr(colors[0])}, ${escapeAttr(colors[1])})" aria-label="Bảng màu ${index + 1}" aria-pressed="${index === selectedIndex}"></button>`).join('');
}

function openCreatePlaylistModal({ forTrackId = '' } = {}) {
  app.playlistModal = { mode: 'create', forTrackId, colorIndex: 0 };
  const html = `<div class="modal-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">Bộ sưu tập mới</span>
      <h2 class="modal-title" id="modalTitle">Tạo playlist</h2>
      <p class="modal-sub">Một chiếc hộp nhỏ cho những bài hát cùng tần số.</p>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <form class="modal-form" data-form="createPlaylist">
    <div class="modal-body">
      <div class="field">
        <label class="field-label" for="playlistName"><span>Tên playlist</span><span>Bắt buộc</span></label>
        <input id="playlistName" name="name" maxlength="100" required data-autofocus placeholder="Ví dụ: Những đêm không ngủ">
      </div>
      <div class="field">
        <label class="field-label" for="playlistDescription"><span>Mô tả</span><span>Không bắt buộc</span></label>
        <textarea id="playlistDescription" name="description" maxlength="500" rows="3" placeholder="Một dòng ghi chú cho bộ sưu tập này…"></textarea>
      </div>
      <div class="field">
        <span class="field-label"><span>Màu nhận diện</span><span>Chọn một tông</span></span>
        <div class="color-choices">${playlistColorChoices(0)}</div>
      </div>
      <div class="modal-note">${forTrackId ? 'Bài hát đang chọn sẽ được thêm vào playlist mới ngay sau khi tạo.' : 'Bạn có thể thêm bài hát vào playlist bất cứ lúc nào.'}</div>
    </div>
    <div class="modal-foot">
      <span class="foot-note">Playlist được lưu trong trình duyệt này.</span>
      <button type="button" class="ghost-btn" data-action="closeModal">Hủy</button>
      <button type="submit" class="primary-btn">${icon('plus')}Tạo playlist</button>
    </div>
  </form>`;
  openModal({ html });
}

function openEditPlaylistModal(playlistId) {
  const playlist = store.playlistById(playlistId);
  if (!playlist) {
    toast('Không tìm thấy playlist.', { type: 'error', icon: 'x' });
    return;
  }
  const colorIndex = Math.max(0, PLAYLIST_COLORS.findIndex((colors) => colors[0] === playlist.colors[0] && colors[1] === playlist.colors[1]));
  app.playlistModal = { mode: 'edit', id: playlist.id, colorIndex };
  const html = `<div class="modal-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">Chỉnh sửa bộ sưu tập</span>
      <h2 class="modal-title" id="modalTitle">Sửa playlist</h2>
      <p class="modal-sub">${escapeHTML(playlist.name)} · ${playlist.trackIds.length} bài hát</p>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <form class="modal-form" data-form="editPlaylist">
    <input type="hidden" name="id" value="${escapeAttr(playlist.id)}">
    <div class="modal-body">
      <div class="field">
        <label class="field-label" for="playlistName"><span>Tên playlist</span><span>Bắt buộc</span></label>
        <input id="playlistName" name="name" maxlength="100" required value="${escapeAttr(playlist.name)}" data-autofocus>
      </div>
      <div class="field">
        <label class="field-label" for="playlistDescription"><span>Mô tả</span><span>Không bắt buộc</span></label>
        <textarea id="playlistDescription" name="description" maxlength="500" rows="3">${escapeHTML(playlist.description || '')}</textarea>
      </div>
      <div class="field">
        <span class="field-label"><span>Màu nhận diện</span><span>Chọn một tông</span></span>
        <div class="color-choices">${playlistColorChoices(colorIndex)}</div>
      </div>
    </div>
    <div class="modal-foot">
      <span class="foot-note">Thay đổi được lưu ngay trên máy của bạn.</span>
      <button type="button" class="ghost-btn" data-action="closeModal">Hủy</button>
      <button type="submit" class="primary-btn">${icon('check')}Lưu thay đổi</button>
    </div>
  </form>`;
  openModal({ html });
}

function pickPlaylistColor(button) {
  if (!app.playlistModal || !button) return;
  const index = Number(button.dataset.index);
  if (!Number.isInteger(index) || !PLAYLIST_COLORS[index]) return;
  app.playlistModal.colorIndex = index;
  $$('.color-dot', dom.modalCard).forEach((dot, dotIndex) => {
    const active = dotIndex === index;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-pressed', String(active));
  });
}

function submitPlaylistForm(form, isEdit = false) {
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  if (!name) {
    toast('Đặt tên cho playlist trước nhé.', { type: 'warning', icon: 'folder' });
    $('#playlistName')?.focus();
    return;
  }
  const colors = PLAYLIST_COLORS[app.playlistModal?.colorIndex] || PLAYLIST_COLORS[0];
  if (isEdit) {
    const playlistId = String(data.get('id') || '');
    const updated = store.updatePlaylist(playlistId, {
      name,
      description: String(data.get('description') || ''),
      colors
    });
    if (!updated) {
      toast('Không tìm thấy playlist để cập nhật.', { type: 'error', icon: 'x' });
      return;
    }
    closeModal();
    renderSidebar();
    renderRoute({ preserveScroll: true });
    toast('Đã cập nhật playlist', { detail: updated.name, icon: 'check' });
    return;
  }
  const playlist = store.createPlaylist({
    name,
    description: String(data.get('description') || ''),
    colors
  });
  if (!playlist) {
    toast('Không tạo được playlist.', { type: 'error', icon: 'x' });
    return;
  }
  const forTrackId = app.playlistModal?.forTrackId || '';
  if (forTrackId && store.getTrack(forTrackId)) {
    store.addTracksToPlaylist(playlist.id, [forTrackId]);
  }
  closeModal();
  renderSidebar();
  if (forTrackId) {
    renderRoute({ preserveScroll: true });
    toast('Đã tạo playlist và thêm bài hát', { detail: playlist.name, icon: 'folder-plus' });
  } else {
    toast('Đã tạo playlist mới', { detail: playlist.name, icon: 'folder-plus' });
    navigate(`/playlist/${playlist.id}`);
  }
}

function openPlaylistPicker(trackId) {
  const track = store.getTrack(trackId);
  if (!track) {
    toast('Không tìm thấy bài hát.', { type: 'error', icon: 'x' });
    return;
  }
  const list = renderPlaylistPicker(track.id);
  const html = `<div class="modal-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">Lưu bài hát</span>
      <h2 class="modal-title" id="modalTitle">Thêm vào playlist</h2>
      <p class="modal-sub">${escapeHTML(track.title)} · ${escapeHTML(track.artist)}</p>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <div class="modal-body">
    <div class="playlist-pick-list" id="playlistPickList">${list || '<div class="modal-note">Chưa có playlist nào. Tạo một bộ sưu tập mới bên dưới nhé.</div>'}</div>
    <div class="modal-note">${icon('check')} Nhấn vào một playlist để thêm hoặc bỏ bài hát. Thay đổi được lưu tức thì.</div>
  </div>
  <div class="modal-foot">
    <span class="foot-note">Bài hát vẫn ở trong thư viện của bạn.</span>
    <button type="button" class="ghost-btn" data-action="closeModal">Đóng</button>
    <button type="button" class="primary-btn" data-action="createPlaylistFromPicker" data-track-id="${escapeAttr(track.id)}">${icon('plus')}Playlist mới</button>
  </div>`;
  openModal({ html });
}

function togglePickPlaylist(playlistId, trackId) {
  const playlist = store.playlistById(playlistId);
  const track = store.getTrack(trackId);
  if (!playlist || !track) return;
  const hasTrack = playlist.trackIds.includes(trackId);
  if (hasTrack) {
    store.removeTrackFromPlaylist(playlistId, trackId);
  } else {
    store.addTracksToPlaylist(playlistId, [trackId]);
  }
  const list = $('#playlistPickList');
  if (list) list.innerHTML = renderPlaylistPicker(trackId);
  renderSidebar();
  toast(hasTrack ? 'Đã bỏ khỏi playlist' : 'Đã thêm vào playlist', { detail: playlist.name, icon: hasTrack ? 'minus' : 'check' });
}

/* --------------------------------------------------------------------------
   Settings, shortcuts & command palette
   -------------------------------------------------------------------------- */
function formatSettingValue(key, value) {
  if (key === 'rate') return `${Number(value || 1).toFixed(2)}×`;
  if (key === 'volume') return `${Math.round(Number(value || 0) * 100)}%`;
  if (typeof value === 'boolean') return value ? 'Bật' : 'Tắt';
  return String(value ?? '');
}

function spotifySettingsMarkup(settings) {
  const spotifyStatus = spotify.getStatus();
  const clientId = settings.spotifyClientId || spotify.getClientId();
  const redirectUri = spotify.getRedirectUri();
  const connected = spotifyStatus.connected;
  const cardClass = connected
    ? `is-connected${spotifyStatus.ready ? ' is-ready' : ''}${spotifyStatus.premium ? '' : ' is-limited'}`
    : '';
  const connectedCopy = connected
    ? `${escapeHTML(spotifyStatus.name || 'Tài khoản Spotify')} · ${spotifyStatus.premium ? 'Premium' : 'Spotify Free'}`
    : 'Chưa kết nối tài khoản';
  return `<section class="settings-section spotify-settings">
    <h3 class="settings-section-title">${icon('spotify')}Spotify Full Playback</h3>
    <div class="spotify-connect-card ${cardClass}">
      <div class="spotify-connect-head">
        <span class="spotify-mark">${icon('spotify')}</span>
        <div class="spotify-connect-copy">
          <strong>Phát trọn bài, không chỉ 30 giây</strong>
          <span class="spotify-connect-status"><i></i>${connectedCopy}</span>
        </div>
        <span class="spotify-state-pill">${connected ? (spotifyStatus.ready ? 'Sẵn sàng' : 'Đã kết nối') : 'Chưa thiết lập'}</span>
      </div>
      <p class="spotify-connect-desc">SONORA dùng Web Playback SDK chính thức. Cần Spotify Premium, và chỉ cần thiết lập một lần trên trình duyệt này.</p>
      <div class="spotify-client-field">
        <label for="spotifyClientIdInput">Spotify Client ID</label>
        <input id="spotifyClientIdInput" name="spotifyClientId" autocomplete="off" spellcheck="false" placeholder="Dán Client ID từ Spotify Developer Dashboard" value="${escapeAttr(clientId)}">
      </div>
      <div class="spotify-connect-actions">
        ${connected
          ? `<button type="button" class="soft-action" data-action="refreshSpotify">${icon('wave')}Kích hoạt lại</button>
             <button type="button" class="text-btn settings-danger" data-action="disconnectSpotify">${icon('x')}Ngắt kết nối</button>`
          : `<button type="button" class="soft-action spotify-primary" data-action="connectSpotify">${icon('spotify')}Kết nối Spotify</button>`}
        <button type="button" class="text-btn" data-action="copySpotifyRedirect">${icon('copy')}Chép Redirect URI</button>
      </div>
      ${spotifyStatus.error ? `<div class="spotify-error">${icon('x')}${escapeHTML(spotifyStatus.error)}</div>` : ''}
      ${connected && spotifyStatus.premium ? `<div class="settings-row spotify-inline-toggle">
        <div class="settings-label"><strong>Ưu tiên Spotify Full</strong><small>Chuyển sang Spotify Web nếu thiết bị này không phát được.</small></div>
        <button type="button" class="switch${settings.spotifyFullPlayback ? ' is-on' : ''}" data-action="toggleSetting" data-setting="spotifyFullPlayback" role="switch" aria-checked="${Boolean(settings.spotifyFullPlayback)}" aria-label="Bật hoặc tắt Spotify Full"></button>
      </div>` : ''}
      <details class="spotify-help">
        <summary>${icon('sparkles')}Thiết lập trong 60 giây</summary>
        <ol>
          <li>Tạo app tại <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Spotify Developer Dashboard</a>.</li>
          <li>Thêm Redirect URI chính xác: <code>${escapeHTML(redirectUri)}</code>.</li>
          <li>Bật Web Playback SDK, dán Client ID ở trên rồi bấm Kết nối.</li>
          <li>Tài khoản cần Spotify Premium để phát đầy đủ. Bản Free vẫn dùng Spotify Web/30 giây.</li>
        </ol>
      </details>
    </div>
  </section>`;
}

function playbackSettingsMarkup(settings) {
  return `<section class="settings-section">
    <h3 class="settings-section-title">${icon('wave')}Phát mượt mà</h3>
    <div class="settings-list">
      <div class="settings-row">
        <div class="settings-label"><strong>Chất lượng YouTube</strong><small>Hạ độ phân giải nếu video tải lâu hoặc mạng yếu.</small></div>
        <div class="settings-control">
          <select name="youtubeQuality" data-setting="youtubeQuality">
            <option value="auto"${settings.youtubeQuality === 'auto' ? ' selected' : ''}>Tự động</option>
            <option value="hd720"${settings.youtubeQuality === 'hd720' ? ' selected' : ''}>720p</option>
            <option value="large"${settings.youtubeQuality === 'large' ? ' selected' : ''}>480p</option>
            <option value="medium"${settings.youtubeQuality === 'medium' ? ' selected' : ''}>360p</option>
          </select>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-label"><strong>Tự động phát bài tương tự</strong><small>Khi hàng đợi kết thúc, SONORA gợi ý bài cùng gu để nghe tiếp.</small></div>
        <button type="button" class="switch${settings.autoplaySimilar ? ' is-on' : ''}" data-action="toggleSetting" data-setting="autoplaySimilar" role="switch" aria-checked="${Boolean(settings.autoplaySimilar)}" aria-label="Bật hoặc tắt tự động phát bài tương tự"></button>
      </div>
    </div>
  </section>`;
}

function canvasCoverSource(track) {
  const cover = trackCover(track);
  if (!cover || cover.startsWith('data:')) return cover || '';
  try {
    const url = new URL(cover, location.href);
    if (url.origin === location.origin) return url.href;
    return `/api/image?url=${encodeURIComponent(url.href)}`;
  } catch {
    return '';
  }
}

function loadCanvasImage(src, timeout = 9000) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeout);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      clearTimeout(timer);
      finish(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    image.src = src;
  });
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const finalLines = lines.slice(0, maxLines);
  if (finalLines.length === maxLines && words.length) {
    let last = finalLines[finalLines.length - 1];
    if (ctx.measureText(last).width > maxWidth) {
      while (last.length > 4 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      finalLines[finalLines.length - 1] = `${last}…`;
    }
  }
  finalLines.forEach((entry, index) => ctx.fillText(entry, x, y + index * lineHeight));
  return finalLines.length;
}

async function buildShareCard(track) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  const colors = (track.colors?.length ? track.colors : ['#ff6b9a', '#8b5cf6', '#5ee8c1']).slice(0, 3);
  const safeColor = (value, fallback) => /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : fallback;
  const c1 = safeColor(colors[0], '#ff6b9a');
  const c2 = safeColor(colors[1], '#8b5cf6');
  const c3 = safeColor(colors[2], '#5ee8c1');

  const background = ctx.createLinearGradient(0, 0, 1080, 1350);
  background.addColorStop(0, '#0b0b12');
  background.addColorStop(0.45, c1);
  background.addColorStop(1, c2);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1080, 1350);

  ctx.globalCompositeOperation = 'screen';
  const glowA = ctx.createRadialGradient(780, 180, 10, 780, 180, 520);
  glowA.addColorStop(0, `${c3}bb`);
  glowA.addColorStop(1, 'transparent');
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, 1080, 1350);
  const glowB = ctx.createRadialGradient(180, 1080, 10, 180, 1080, 560);
  glowB.addColorStop(0, `${c2}aa`);
  glowB.addColorStop(1, 'transparent');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = 'rgba(7, 7, 12, 0.48)';
  ctx.fillRect(0, 0, 1080, 1350);

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillText('SONORA', 90, 96);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '500 22px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('NOW PLAYING', 990, 96);
  ctx.textAlign = 'left';

  const artSize = 720;
  const artX = (1080 - artSize) / 2;
  const artY = 180;
  const image = await loadCanvasImage(canvasCoverSource(track));
  ctx.save();
  roundedRect(ctx, artX, artY, artSize, artSize, 42);
  ctx.clip();
  if (image) {
    ctx.drawImage(image, artX, artY, artSize, artSize);
  } else {
    const fallback = ctx.createLinearGradient(artX, artY, artX + artSize, artY + artSize);
    fallback.addColorStop(0, c1);
    fallback.addColorStop(1, c2);
    ctx.fillStyle = fallback;
    ctx.fillRect(artX, artY, artSize, artSize);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 180px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('S', 540, artY + 430);
    ctx.textAlign = 'left';
  }
  ctx.restore();
  ctx.save();
  roundedRect(ctx, artX, artY, artSize, artSize, 42);
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 64px "Segoe UI", system-ui, sans-serif';
  drawWrappedText(ctx, track.title, 540, 1040, 900, 74, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '500 34px "Segoe UI", system-ui, sans-serif';
  drawWrappedText(ctx, track.artist, 540, 1112, 820, 42, 1);

  const lyric = app.lyrics[app.activeLyricIndex]?.text;
  const quote = lyric || track.description || 'Một không gian âm nhạc của riêng bạn.';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'italic 500 28px "Segoe UI", system-ui, sans-serif';
  drawWrappedText(ctx, `“${quote}”`, 540, 1195, 800, 38, 2);
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.font = '500 22px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(sourceMetaFor(track).label.toUpperCase(), 90, 1290);
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('vi-VN'), 990, 1290);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

async function openShareCard(trackId = store.state.currentId) {
  const track = store.getTrack(trackId);
  if (!track) return;
  app.shareCard = { trackId: track.id, dataUrl: '' };
  const html = `<div class="modal-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">${icon('sparkles')} Khoảnh khắc của bạn</span>
      <h2 class="modal-title" id="modalTitle">Tạo ảnh chia sẻ</h2>
      <p class="modal-sub">Một tấm poster 1080 × 1350 mang đúng màu sắc và lời bài hát đang phát.</p>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <div class="modal-body share-modal-body">
    <div class="share-preview is-loading" id="shareCardPreview">
      <div class="share-loader"><span></span><span></span><span></span></div>
      <p>Đang pha màu cho tấm ảnh…</p>
    </div>
    <p class="share-hint">${icon('sparkles')} Ảnh được tạo ngay trên trình duyệt. Không tải nhạc hay dữ liệu của bạn lên máy chủ.</p>
  </div>
  <div class="modal-foot">
    <span class="foot-note">1080 × 1350 · PNG</span>
    <div class="share-actions">
      <button type="button" class="ghost-btn" data-action="closeModal">Đóng</button>
      <button type="button" class="primary-btn" id="downloadShareCardBtn" data-action="downloadShareCard" disabled>${icon('download')}Tải ảnh</button>
    </div>
  </div>`;
  openModal({ html, className: 'share-modal' });
  try {
    const dataUrl = await buildShareCard(track);
    if (app.shareCard?.trackId !== track.id) return;
    app.shareCard.dataUrl = dataUrl;
    const preview = document.querySelector('#shareCardPreview');
    if (preview) {
      preview.classList.remove('is-loading');
      preview.innerHTML = `<img src="${dataUrl}" alt="Ảnh chia sẻ ${escapeAttr(track.title)}">`;
    }
    const button = document.querySelector('#downloadShareCardBtn');
    if (button) button.disabled = false;
  } catch (error) {
    console.warn(error);
    const preview = document.querySelector('#shareCardPreview');
    if (preview) {
      preview.classList.remove('is-loading');
      preview.innerHTML = `<p class="share-error">${icon('x')} Không tạo được ảnh. Hãy thử lại.</p>`;
    }
  }
}

function downloadShareCardAction() {
  const dataUrl = app.shareCard?.dataUrl;
  if (!dataUrl) return;
  const track = store.getTrack(app.shareCard.trackId);
  const slug = String(track?.title || 'sonora').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `sonora-${slug || 'share'}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast('Đã tải ảnh chia sẻ', { detail: 'PNG 1080 × 1350 sẵn sàng để đăng.', icon: 'download' });
}

function updateSpotifyIndicators() {
  const quick = document.querySelector('#spotifyQuickBtn');
  const spotifyStatus = spotify.getStatus();
  if (quick) {
    quick.classList.toggle('is-connected', spotifyStatus.connected);
    quick.classList.toggle('is-ready', spotifyStatus.ready);
    quick.classList.toggle('has-error', Boolean(spotifyStatus.error));
    quick.dataset.tooltip = spotifyStatus.connected
      ? `Spotify · ${spotifyStatus.premium ? 'Full' : 'Free'}${spotifyStatus.ready ? ' · sẵn sàng' : ''}`
      : 'Kết nối Spotify Full';
    quick.setAttribute('aria-label', quick.dataset.tooltip);
  }
  const statusLine = document.querySelector('.spotify-connect-status');
  if (statusLine) {
    const label = spotifyStatus.connected
      ? `${spotifyStatus.name || 'Spotify'} · ${spotifyStatus.premium ? 'Premium' : 'Free'}`
      : 'Chưa kết nối tài khoản';
    statusLine.innerHTML = `<i></i>${escapeHTML(label)}`;
  }
  const pill = document.querySelector('.spotify-state-pill');
  if (pill) pill.textContent = spotifyStatus.connected ? (spotifyStatus.ready ? 'Sẵn sàng' : 'Đã kết nối') : 'Chưa thiết lập';
}

function syncSpotifyClientId() {
  const input = document.querySelector('#spotifyClientIdInput');
  const id = String(input?.value || store.state.settings.spotifyClientId || '').trim().slice(0, 120);
  if (!id) return '';
  store.updateSettings({ spotifyClientId: id });
  if (id !== spotify.getClientId()) spotify.setClientId(id);
  return id;
}

async function connectSpotifyAction() {
  const id = syncSpotifyClientId();
  if (!id) {
    toast('Hãy dán Spotify Client ID trước.', { type: 'warning', icon: 'spotify' });
    document.querySelector('#spotifyClientIdInput')?.focus();
    return;
  }
  try {
    toast('Đang chuyển đến Spotify để xác thực…', { icon: 'spotify' });
    await spotify.startAuth(id);
  } catch (error) {
    toast(error.message || 'Không bắt đầu được kết nối Spotify.', { type: 'error', icon: 'x' });
  }
}

async function copySpotifyRedirectAction() {
  const uri = spotify.getRedirectUri();
  const copied = await copyText(uri);
  toast(copied ? 'Đã chép Redirect URI' : 'Redirect URI của bạn', {
    detail: uri,
    icon: copied ? 'check' : 'copy',
    duration: 7000
  });
}

async function refreshSpotifyAction() {
  try {
    await spotify.refreshProfile();
    await spotify.ensurePlayer();
    updateSpotifyIndicators();
    const settingsModal = document.querySelector('.spotify-settings');
    if (settingsModal) settingsModal.outerHTML = spotifySettingsMarkup(store.state.settings);
    toast('Loa Spotify đã sẵn sàng', { detail: 'Bạn có thể phát trọn bài bằng Spotify Premium.', icon: 'check' });
  } catch (error) {
    updateSpotifyIndicators();
    toast(error.message || 'Chưa kích hoạt được Spotify player.', { type: 'warning', icon: 'spotify' });
  }
}

function disconnectSpotifyAction() {
  openConfirmModal({
    title: 'Ngắt kết nối Spotify?',
    message: 'SONORA sẽ quên token Spotify trên trình duyệt này. Thư viện, playlist và các bài hát đã thêm vẫn được giữ nguyên.',
    confirmLabel: 'Ngắt kết nối',
    danger: true,
    onConfirm: async () => {
      await spotify.disconnect();
      updateSpotifyIndicators();
      const settingsModal = document.querySelector('.spotify-settings');
      if (settingsModal) settingsModal.outerHTML = spotifySettingsMarkup(store.state.settings);
      toast('Đã ngắt kết nối Spotify', { icon: 'check' });
    }
  });
}

async function initializeSpotifyIntegration() {
  const storedClientId = String(store.state.settings.spotifyClientId || '').trim();
  if (storedClientId && !spotify.getClientId()) spotify.setClientId(storedClientId);
  spotify.onStatusChange(() => updateSpotifyIndicators());
  let redirected = false;
  try {
    redirected = await spotify.handleRedirect();
    if (redirected) toast('Đã kết nối Spotify', { detail: 'SONORA đang chuẩn bị loa phát đầy đủ.', icon: 'check' });
  } catch (error) {
    toast(error.message || 'Không kết nối được Spotify.', { type: 'error', icon: 'x', duration: 6000 });
  }
  if (spotify.hasStoredAuth()) {
    await spotify.refreshProfile().catch(() => {});
    if (spotify.getStatus().premium && store.state.settings.spotifyFullPlayback) {
      const warm = () => spotify.ensurePlayer().then(updateSpotifyIndicators).catch(() => {});
      if (redirected) warm();
      else window.setTimeout(warm, 1400);
    }
  }
  updateSpotifyIndicators();
}

function openSpotifySettings() {
  openSettingsModal();
  requestAnimationFrame(() => {
    document.querySelector('.spotify-settings')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    document.querySelector('#spotifyClientIdInput')?.focus({ preventScroll: true });
  });
}

function openSettingsModal() {
  const settings = store.state.settings;
  const stats = store.libraryStats();
  const html = `<div class="modal-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">Cá nhân hóa</span>
      <h2 class="modal-title" id="modalTitle">Cài đặt</h2>
      <p class="modal-sub">Chỉnh gu thẩm mỹ, tốc độ và cách vũ trụ SONORA phản hồi bạn.</p>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <form class="modal-form" data-form="settings">
    <div class="modal-body">
      ${spotifySettingsMarkup(settings)}
      ${playbackSettingsMarkup(settings)}
      <section class="settings-section">
        <h3 class="settings-section-title">${icon('settings')}Hồ sơ người nghe</h3>
        <div class="settings-list">
          <div class="settings-row">
            <div class="settings-label"><strong>Tên hiển thị</strong><small>Dùng cho lời chào và góc hồ sơ của bạn.</small></div>
            <div class="settings-control"><input name="name" maxlength="40" value="${escapeAttr(settings.name || '')}" data-autofocus></div>
          </div>
          <div class="settings-row">
            <div class="settings-label"><strong>Bảng màu</strong><small>Màu nhấn thay đổi theo bài hát hoặc cố định.</small></div>
            <div class="settings-control">
              <select name="palette" data-setting="palette">
                ${store.PALETTES.map((palette) => `<option value="${escapeAttr(palette)}"${settings.palette === palette ? ' selected' : ''}>${escapeHTML(PALETTE_LABELS[palette] || palette)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-label"><strong>Chuyển động</strong><small>Giảm hiệu ứng nếu bạn thích một không gian tĩnh hơn.</small></div>
            <div class="settings-control">
              <select name="motion" data-setting="motion">
                <option value="full"${settings.motion === 'full' ? ' selected' : ''}>Đầy đủ</option>
                <option value="reduced"${settings.motion === 'reduced' ? ' selected' : ''}>Giảm chuyển động</option>
              </select>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-label"><strong>Tốc độ phát</strong><small>Áp dụng cho tệp, YouTube và video trực tiếp.</small></div>
            <div class="settings-control settings-control--range">
              <input type="range" name="rate" data-setting="rate" min="0.5" max="2" step="0.05" value="${Number(settings.rate) || 1}">
              <output data-setting-value="rate">${formatSettingValue('rate', settings.rate)}</output>
            </div>
          </div>
        </div>
      </section>
      <section class="settings-section">
        <h3 class="settings-section-title">${icon('sparkles')}Trải nghiệm nghe</h3>
        <div class="settings-list">
          <div class="settings-row">
            <div class="settings-label"><strong>Phổ nhạc sống động</strong><small>Vẽ vòng năng lượng theo nhịp bài hát đang phát.</small></div>
            <button type="button" class="switch${settings.visualizer ? ' is-on' : ''}" data-action="toggleSetting" data-setting="visualizer" role="switch" aria-checked="${Boolean(settings.visualizer)}" aria-label="Bật hoặc tắt phổ nhạc"></button>
          </div>
          <div class="settings-row">
            <div class="settings-label"><strong>Tự động tìm lời</strong><small>Tra lời đồng bộ từ LRCLIB khi bài hát chưa có lời.</small></div>
            <button type="button" class="switch${settings.autoLyrics ? ' is-on' : ''}" data-action="toggleSetting" data-setting="autoLyrics" role="switch" aria-checked="${Boolean(settings.autoLyrics)}" aria-label="Bật hoặc tắt tự động tìm lời"></button>
          </div>
        </div>
      </section>
      <section class="settings-section">
        <h3 class="settings-section-title">${icon('cloud')}Dữ liệu & bộ nhớ</h3>
        <div class="settings-list">
          <div class="settings-row">
            <div class="settings-label"><strong>${stats.tracks} bài hát · ${stats.playlists} playlist</strong><small>${stats.local ? `${stats.local} tệp cục bộ chỉ tồn tại trong phiên này.` : 'Mọi thứ được lưu ngay trên trình duyệt của bạn.'}</small></div>
            <div class="settings-control settings-control--actions">
              <button type="button" class="soft-action" data-action="exportData">${icon('download')}Xuất dữ liệu</button>
              <button type="button" class="text-btn settings-danger" data-action="resetData">${icon('trash')}Đặt lại</button>
            </div>
          </div>
        </div>
      </section>
    </div>
    <div class="modal-foot">
      <span class="foot-note">Thay đổi được lưu tự động trên máy này.</span>
      <button type="button" class="ghost-btn" data-action="closeModal">Hủy</button>
      <button type="submit" class="primary-btn">${icon('check')}Lưu cài đặt</button>
    </div>
  </form>`;
  openModal({ html, wide: true });
}

function submitSettingsForm(form) {
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  if (!name) {
    toast('Tên hiển thị không được để trống.', { type: 'warning', icon: 'settings' });
    form.querySelector('[name="name"]')?.focus();
    return;
  }
  const rate = clamp(Number(data.get('rate')) || 1, 0.5, 2);
  const palette = store.PALETTES.includes(String(data.get('palette'))) ? String(data.get('palette')) : store.state.settings.palette;
  const motion = String(data.get('motion')) === 'reduced' ? 'reduced' : 'full';
  const youtubeQuality = ['auto', 'hd720', 'large', 'medium'].includes(String(data.get('youtubeQuality')))
    ? String(data.get('youtubeQuality'))
    : store.state.settings.youtubeQuality;
  const spotifyClientId = String(data.get('spotifyClientId') || store.state.settings.spotifyClientId || '').trim().slice(0, 120);
  store.updateSettings({ name, palette, motion, rate, youtubeQuality, spotifyClientId });
  if (spotifyClientId !== spotify.getClientId()) spotify.setClientId(spotifyClientId);
  applyAllSettings();
  app.engine?.setRate(rate);
  closeModal();
  renderSidebar();
  toast('Đã lưu cài đặt', { detail: `Chào ${name}, không gian đã được điều chỉnh.`, icon: 'check' });
}

function openShortcutsModal() {
  const html = `<div class="modal-head">
    <div class="modal-head-copy">
      <span class="modal-eyebrow">Điều khiển bằng bàn phím</span>
      <h2 class="modal-title" id="modalTitle">Phím tắt</h2>
      <p class="modal-sub">Một vài phím để đi nhanh hơn mà không rời khỏi dòng nhạc.</p>
    </div>
    <button type="button" class="icon-btn modal-close" data-action="closeModal" aria-label="Đóng">${icon('x')}</button>
  </div>
  <div class="modal-body">
    <div class="shortcut-grid">
      ${KEYBOARD_SHORTCUTS.map(([keys, label]) => `<div class="shortcut-row"><span>${escapeHTML(label)}</span><kbd>${escapeHTML(keys)}</kbd></div>`).join('')}
    </div>
    <div class="modal-note">${icon('sparkles')} Phím tắt hoạt động khi bạn không đang gõ trong ô nhập liệu.</div>
  </div>
  <div class="modal-foot">
    <span class="foot-note">Mẹo: nhấn <kbd>Ctrl</kbd> + <kbd>K</kbd> để mở tìm kiếm nhanh từ bất cứ đâu.</span>
    <button type="button" class="primary-btn" data-action="closeModal">${icon('check')}Đã hiểu</button>
  </div>`;
  openModal({ html, narrow: true });
}

function commandActionDefinitions() {
  return [
    {
      label: 'Thêm bài hát mới',
      hint: 'Dán liên kết hoặc tải tệp',
      icon: 'plus',
      keywords: 'them bai hat add link youtube spotify mp3 upload tep',
      run: () => openAddModal()
    },
    {
      label: 'Tạo playlist mới',
      hint: 'Một bộ sưu tập cho tâm trạng mới',
      icon: 'folder-plus',
      keywords: 'tao playlist moi bo suu tap folder',
      run: () => openCreatePlaylistModal()
    },
    {
      label: 'Mở thư viện',
      hint: 'Tất cả bài hát và bộ sưu tập',
      icon: 'library',
      keywords: 'thu vien library bai hat playlist',
      run: () => navigate('/library?tab=all')
    },
    {
      label: 'Khám phá radio cảm xúc',
      hint: 'Để SONORA chọn theo tâm trạng',
      icon: 'compass',
      keywords: 'radio cam xuc mood kham pha',
      run: () => navigate('/radio')
    },
    {
      label: 'Trộn tất cả bài hát',
      hint: 'Một danh sách ngẫu nhiên mới',
      icon: 'shuffle',
      keywords: 'shuffle tron ngau nhien tat ca',
      run: () => shuffleAllAction()
    },
    {
      label: 'Hẹn giờ ngủ',
      hint: 'Dừng nhạc khi bạn chìm vào giấc',
      icon: 'moon',
      keywords: 'sleep hen gio ngu timer',
      run: () => openSleepModal()
    },
    {
      label: `${store.state.settings.visualizer ? 'Tắt' : 'Bật'} phổ nhạc sống động`,
      hint: 'Hiệu ứng vòng năng lượng',
      icon: 'wave',
      keywords: 'visualizer pho nhac hieu ung bat tat',
      run: () => toggleSettingAction('visualizer')
    },
    {
      label: 'Xuất bản sao lưu',
      hint: 'Tải dữ liệu SONORA thành JSON',
      icon: 'download',
      keywords: 'xuat backup du lieu json tai ve',
      run: () => exportDataAction()
    },
    {
      label: 'Cài đặt',
      hint: 'Giao diện, tốc độ và dữ liệu',
      icon: 'settings',
      keywords: 'cai dat settings giao dien',
      run: () => openSettingsModal()
    },
    {
      label: 'Phím tắt',
      hint: 'Xem toàn bộ điều khiển',
      icon: 'keyboard',
      keywords: 'phim tat shortcuts keyboard',
      run: () => openShortcutsModal()
    },
    {
      label: 'Mở Lyrics Live',
      hint: 'Lời bài hát lớn, chạy theo từng câu và từng chữ',
      icon: 'sparkles',
      keywords: 'lyrics live karaoke loi bai hat man hinh lon',
      run: () => openKaraoke()
    },
    {
      label: 'Dò lời bài hát',
      hint: 'Nhận diện đúng bản lời từ LRCLIB',
      icon: 'compass',
      keywords: 'do loi lyrics radar tim loi lrclib nhan dien',
      run: () => openLyricsRadarModal()
    },
    {
      label: 'Tạo ảnh chia sẻ bài đang phát',
      hint: 'Poster 1080 × 1350 với màu bìa và lời bài hát',
      icon: 'sparkles',
      keywords: 'share card anh chia se poster download tai anh',
      run: () => openShareCard()
    },
    {
      label: 'Gợi ý bài cùng gu',
      hint: 'Thêm 5 bài tương tự vào hàng đợi',
      icon: 'sparkles',
      keywords: 'goi y smart queue similar bai tuong tu',
      run: () => queueSimilarAction()
    },
    {
      label: 'Kết nối Spotify Full',
      hint: 'Phát trọn bài bằng Spotify Premium',
      icon: 'spotify',
      keywords: 'spotify full premium ket noi playback sdk',
      run: () => openSpotifySettings()
    },
    {
      label: 'Về trang chủ',
      hint: 'Quay lại vũ trụ của bạn',
      icon: 'home',
      keywords: 'trang chu home',
      run: () => navigate('/home')
    }
  ];
}

function buildCommandEntries(query = '') {
  const q = String(query || '').trim();
  const normalizedQuery = store.normalizeText(q);
  const actions = commandActionDefinitions();
  const matchAction = (action) => {
    if (!normalizedQuery) return true;
    return store.normalizeText(`${action.label} ${action.keywords || ''}`).includes(normalizedQuery);
  };
  const groups = [];
  const addGroup = (label, items) => {
    if (items.length) groups.push({ label, items });
  };

  if (q) {
    const results = store.searchLibrary(q, 24);
    const trackIds = results.tracks.map((track) => track.id);
    const trackContext = {
      type: 'search',
      id: 'command',
      label: `Tìm kiếm: ${q}`,
      trackIds
    };
    const trackItems = results.tracks.slice(0, 7).map((track) => ({
      kind: 'track',
      title: track.title,
      subtitle: `${track.artist} · ${sourceMetaFor(track).label}`,
      art: trackCover(track),
      hint: sourceMetaFor(track).short,
      run: () => startTrack(track.id, { fromContext: trackContext })
    }));
    const playlistItems = results.playlists.slice(0, 4).map((playlist) => ({
      kind: 'playlist',
      title: playlist.name,
      subtitle: `${playlist.trackIds.length} bài hát · Playlist`,
      art: store.playlistCover(playlist),
      hint: 'PLAYLIST',
      run: () => playPlaylistById(playlist.id)
    }));
    addGroup('Tìm kiếm', [{
      kind: 'action',
      title: `Xem tất cả kết quả cho “${q}”`,
      subtitle: 'Mở trang tìm kiếm đầy đủ',
      icon: 'search',
      hint: 'ENTER',
      run: () => navigateSearch(q)
    }]);
    addGroup('Bài hát', trackItems);
    addGroup('Playlist', playlistItems);
    addGroup('Hành động', actions.filter(matchAction).slice(0, 7).map((action) => ({
      kind: 'action',
      title: action.label,
      subtitle: action.hint,
      icon: action.icon,
      hint: 'LỆNH',
      run: action.run
    })));
  } else {
    const top = store.topTracks(6);
    const topIds = top.map((track) => track.id);
    const topContext = {
      type: 'library',
      id: 'command-top',
      label: 'Đang thịnh hành',
      trackIds: topIds
    };
    addGroup('Hành động', actions.slice(0, 7).map((action) => ({
      kind: 'action',
      title: action.label,
      subtitle: action.hint,
      icon: action.icon,
      hint: 'LỆNH',
      run: action.run
    })));
    addGroup('Đang thịnh hành', top.map((track) => ({
      kind: 'track',
      title: track.title,
      subtitle: `${track.artist} · ${sourceMetaFor(track).label}`,
      art: trackCover(track),
      hint: sourceMetaFor(track).short,
      run: () => startTrack(track.id, { fromContext: topContext })
    })));
    addGroup('Playlist của bạn', store.state.playlists.slice(0, 4).map((playlist) => ({
      kind: 'playlist',
      title: playlist.name,
      subtitle: `${playlist.trackIds.length} bài hát · Playlist`,
      art: store.playlistCover(playlist),
      hint: 'PLAYLIST',
      run: () => playPlaylistById(playlist.id)
    })));
  }

  const items = [];
  for (const group of groups) {
    group.items.forEach((item) => {
      item.index = items.length;
      items.push(item);
    });
  }
  return { groups, items };
}

function renderCommandResults(query = '') {
  if (!dom.commandResults) return;
  const { groups, items } = buildCommandEntries(query);
  app.commandItems = items;
  if (app.commandIndex >= items.length) app.commandIndex = 0;
  if (!items.length) {
    dom.commandResults.innerHTML = `<div class="command-empty">${icon('search')}<strong>Không tìm thấy gì</strong><span>Thử một từ khóa khác, hoặc dán một liên kết vào bảng thêm bài hát.</span></div>`;
    return;
  }
  dom.commandResults.innerHTML = groups.map((group) => `<div class="command-group">
    <div class="command-group-label">${escapeHTML(group.label)}</div>
    ${group.items.map((item) => `<button type="button" class="command-item${item.index === app.commandIndex ? ' is-active' : ''}" data-command-index="${item.index}" aria-selected="${item.index === app.commandIndex}">
      ${item.art
        ? `<span class="command-item-art"><img src="${escapeAttr(item.art)}" alt="" loading="lazy"></span>`
        : `<span class="command-icon">${icon(item.icon || 'sparkles')}</span>`}
      <span class="command-copy"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.subtitle || '')}</small></span>
      <span class="command-hint">${escapeHTML(item.hint || '')}</span>
    </button>`).join('')}
  </div>`).join('');
  updateCommandActive();
}

function updateCommandActive() {
  if (!dom.commandResults) return;
  const items = $$('.command-item', dom.commandResults);
  items.forEach((item) => {
    const active = Number(item.dataset.commandIndex) === app.commandIndex;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
  });
  const active = items.find((item) => Number(item.dataset.commandIndex) === app.commandIndex);
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function openCommandPalette() {
  if (!dom.commandPalette || !dom.commandInput) return;
  if (!app.commandOpen) {
    dom.commandInput.value = '';
    app.commandIndex = 0;
    renderCommandResults('');
  }
  dom.commandPalette.classList.add('is-open');
  dom.commandPalette.setAttribute('aria-hidden', 'false');
  app.commandOpen = true;
  requestAnimationFrame(() => {
    dom.commandInput.focus();
    dom.commandInput.select();
  });
}

function closeCommandPalette() {
  if (!dom.commandPalette) return;
  dom.commandPalette.classList.remove('is-open');
  dom.commandPalette.setAttribute('aria-hidden', 'true');
  app.commandOpen = false;
  dom.commandInput?.blur();
}

function runCommandByIndex(index) {
  const item = app.commandItems[Number(index)];
  if (!item || typeof item.run !== 'function') return;
  closeCommandPalette();
  item.run();
}

/* --------------------------------------------------------------------------
   Context menus, search navigation & drag-and-drop
   -------------------------------------------------------------------------- */
function contextMenuButton({ action = '', id = '', playlistId = '', label, iconName = 'sparkles', shortcut = '', danger = false }) {
  const attributes = [
    'type="button"',
    `class="context-item${danger ? ' danger' : ''}"`,
    `data-action="${escapeAttr(action)}"`
  ];
  if (id) attributes.push(`data-id="${escapeAttr(id)}"`);
  if (playlistId) attributes.push(`data-playlist-id="${escapeAttr(playlistId)}"`);
  return `<button ${attributes.join(' ')}>${icon(iconName)}<span>${escapeHTML(label)}</span>${shortcut ? `<span class="context-shortcut">${escapeHTML(shortcut)}</span>` : ''}</button>`;
}

function openTrackMenu(trackId, event = null, playlistId = '') {
  const track = store.getTrack(trackId) || currentTrack();
  if (!track) return;
  const playlist = playlistId ? store.playlistById(playlistId) : null;
  const liked = store.isLiked(track.id);
  const inPlaylist = Boolean(playlist?.trackIds.includes(track.id));
  const html = `<div class="context-head">${escapeHTML(track.title)}</div>
    ${contextMenuButton({ action: 'playTrack', id: track.id, label: 'Phát bài hát', iconName: 'play', shortcut: 'SPACE' })}
    ${contextMenuButton({ action: 'queueNext', id: track.id, label: 'Phát tiếp theo', iconName: 'queue' })}
    ${contextMenuButton({ action: 'queueTrack', id: track.id, label: 'Thêm vào hàng đợi', iconName: 'plus' })}
    ${contextMenuButton({ action: 'smartQueue', id: track.id, label: 'Gợi ý bài cùng gu', iconName: 'sparkles' })}
    ${contextMenuButton({ action: 'shareCard', id: track.id, label: 'Tạo ảnh chia sẻ', iconName: 'sparkles' })}
    <div class="context-sep"></div>
    ${contextMenuButton({ action: 'likeTrack', id: track.id, label: liked ? 'Bỏ yêu thích' : 'Yêu thích bài hát', iconName: 'heart' })}
    ${contextMenuButton({ action: 'addToPlaylist', id: track.id, label: 'Lưu vào playlist', iconName: 'folder-plus' })}
    ${track.url ? contextMenuButton({ action: 'copyTrackLink', id: track.id, label: 'Sao chép liên kết', iconName: 'copy' }) : ''}
    ${track.url || track.type === 'external' ? contextMenuButton({ action: 'openTrackSource', id: track.id, label: 'Mở nguồn gốc', iconName: 'external' }) : ''}
    ${playlist && inPlaylist ? `<div class="context-sep"></div>${contextMenuButton({ action: 'removeTrackFromPlaylist', id: track.id, playlistId: playlist.id, label: 'Bỏ khỏi playlist này', iconName: 'minus' })}` : ''}
    <div class="context-sep"></div>
    ${contextMenuButton({ action: 'removeTrack', id: track.id, label: 'Xóa khỏi thư viện', iconName: 'trash', danger: true })}`;
  showContextMenu(html, event);
}

function openPlaylistMenu(playlistId, event = null) {
  const playlist = store.playlistById(playlistId);
  if (!playlist) return;
  const html = `<div class="context-head">${escapeHTML(playlist.name)}</div>
    ${contextMenuButton({ action: 'playPlaylist', id: playlist.id, label: 'Phát playlist', iconName: 'play' })}
    ${contextMenuButton({ action: 'shufflePlaylist', id: playlist.id, label: 'Phát ngẫu nhiên', iconName: 'shuffle' })}
    ${contextMenuButton({ action: 'queuePlaylist', id: playlist.id, label: 'Thêm vào hàng đợi', iconName: 'queue' })}
    <div class="context-sep"></div>
    ${contextMenuButton({ action: 'editPlaylist', id: playlist.id, label: 'Chỉnh sửa playlist', iconName: 'edit' })}
    ${contextMenuButton({ action: 'togglePinPlaylist', id: playlist.id, label: playlist.pinned ? 'Bỏ ghim playlist' : 'Ghim playlist', iconName: 'pin' })}
    ${contextMenuButton({ action: 'duplicatePlaylist', id: playlist.id, label: 'Nhân bản playlist', iconName: 'copy' })}
    ${contextMenuButton({ action: 'copyPlaylistLink', id: playlist.id, label: 'Sao chép liên kết', iconName: 'link' })}
    <div class="context-sep"></div>
    ${contextMenuButton({ action: 'deletePlaylist', id: playlist.id, label: 'Xóa playlist', iconName: 'trash', danger: true })}`;
  showContextMenu(html, event);
}

function showContextMenu(html, event = null) {
  if (!dom.contextMenu) return;
  dom.contextMenu.innerHTML = html;
  dom.contextMenu.hidden = false;
  app.menuOpen = true;
  const rect = dom.contextMenu.getBoundingClientRect();
  const margin = 12;
  let x = Number(event?.clientX) || window.innerWidth / 2;
  let y = Number(event?.clientY) || window.innerHeight / 2;
  if (x + rect.width + margin > window.innerWidth) x = window.innerWidth - rect.width - margin;
  if (y + rect.height + margin > window.innerHeight) y = window.innerHeight - rect.height - margin;
  dom.contextMenu.style.left = `${Math.max(margin, x)}px`;
  dom.contextMenu.style.top = `${Math.max(margin, y)}px`;
}

function hideContextMenu() {
  if (!dom.contextMenu || !app.menuOpen) return;
  dom.contextMenu.hidden = true;
  dom.contextMenu.innerHTML = '';
  app.menuOpen = false;
}

function navigateSearch(query = '') {
  const trimmed = String(query || '').trim();
  if (trimmed) store.rememberSearch(trimmed);
  closeCommandPalette();
  navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search');
}

function bindDragAndDrop() {
  if (!dom.dropOverlay) return;
  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files');
  const hideOverlay = () => {
    app.dragDepth = 0;
    dom.dropOverlay.classList.remove('is-active');
    dom.dropOverlay.setAttribute('aria-hidden', 'true');
  };
  document.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    app.dragDepth += 1;
    dom.dropOverlay.classList.add('is-active');
    dom.dropOverlay.setAttribute('aria-hidden', 'false');
  });
  document.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    app.dragDepth = Math.max(0, app.dragDepth - 1);
    if (!app.dragDepth) hideOverlay();
  });
  document.addEventListener('drop', (event) => {
    if (!hasFiles(event) && !event.dataTransfer?.files?.length) return;
    event.preventDefault();
    hideOverlay();
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length) handleLocalFiles(files);
  });
  window.addEventListener('blur', hideOverlay);
}

/* --------------------------------------------------------------------------
   Ambient animation, progress & lyrics heartbeat
   -------------------------------------------------------------------------- */
function clearVisualCanvas(canvas) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (context) context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawSpectrumCanvas(canvas, spectrum, intensity = 1) {
  if (!canvas) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 8 || height < 8) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const colors = app.paletteColors.length ? app.paletteColors : ['#ff6b9a', '#9d7bff', '#5ee8c1', '#ffc06b'];
  const accent = hexToRgb(colors[0]);
  const secondary = hexToRgb(colors[1] || colors[0]);
  const tertiary = hexToRgb(colors[2] || colors[0]);
  const centerX = width / 2;
  const centerY = height / 2;
  const base = Math.min(width, height) * 0.285;
  const now = performance.now();

  context.globalCompositeOperation = 'lighter';
  const glow = context.createRadialGradient(centerX, centerY, base * 0.25, centerX, centerY, base * 1.85);
  glow.addColorStop(0, `rgba(${accent}, ${0.14 * intensity})`);
  glow.addColorStop(0.55, `rgba(${secondary}, ${0.055 * intensity})`);
  glow.addColorStop(1, `rgba(${secondary}, 0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  const count = Math.min(spectrum.length || 0, 68);
  if (!count) return;
  context.lineCap = 'round';
  for (let index = 0; index < count; index += 1) {
    const energy = clamp(Number(spectrum[index]) || 0, 0, 1);
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2 + now * 0.000045;
    const inner = base * (1.04 + energy * 0.055);
    const outer = inner + (1.8 + energy * base * 0.62) * intensity;
    const color = index % 5 === 0 ? tertiary : index % 2 === 0 ? accent : secondary;
    context.beginPath();
    context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
    context.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
    context.lineWidth = index % 3 === 0 ? 1.8 : 1.15;
    context.strokeStyle = `rgba(${color}, ${0.12 + energy * 0.45})`;
    context.stroke();
  }
  context.globalCompositeOperation = 'source-over';
}

function animationLoop(timestamp) {
  requestAnimationFrame(animationLoop);
  if (!app.initialized) return;
  const now = Number(timestamp) || performance.now();
  const delta = app.lastFrame ? Math.min(now - app.lastFrame, 250) : 16;
  app.lastFrame = now;
  const settings = store.state.settings;
  const engine = app.engine;
  const playing = Boolean(engine?.isPlaying);
  const track = currentTrack();

  engine?.pollYoutubeState?.(now);
  engine?.pollSpotifyProgress?.(now);

  if (playing && !document.hidden) {
    app.listeningAccumulator += delta / 1000;
    if (app.listeningAccumulator >= 5) {
      store.addListeningTime(app.listeningAccumulator);
      app.listeningAccumulator = 0;
    }
  }

  if (playing && engine && !app.seeking && now - app.lastProgressPaint >= 180) {
    const time = engine.getTime();
    const duration = engine.getDuration();
    paintProgress(time, duration);
    app.lastProgressPaint = now;
    if (now - app.lastLyricsCheck >= 120) {
      updateLyricsSync(time);
      app.lastLyricsCheck = now;
    }
  }

  if (playing && now - app.lastPositionPush >= 1000) {
    updateMediaPositionState();
    app.lastPositionPush = now;
  }

  if (settings.visualizer && !document.hidden) {
    if (now - app.lastDraw >= 55) {
      const spectrum = engine?.getSpectrum(68) || [];
      drawSpectrumCanvas(dom.nowCanvas, spectrum, 0.92);
      drawSpectrumCanvas(dom.cinemaCanvas, spectrum, 1.15);
      app.lastDraw = now;
      app.canvasCleared = false;
    }
  } else if (!app.canvasCleared) {
    clearVisualCanvas(dom.nowCanvas);
    clearVisualCanvas(dom.cinemaCanvas);
    app.canvasCleared = true;
  }

  if (track && engine && engine.mode === 'youtube' && playing && now - app.lastProgressPaint >= 180) {
    paintProgress(engine.getTime(), engine.getDuration());
    app.lastProgressPaint = now;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

