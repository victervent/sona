/* SONORA — reusable HTML components. */
import { SOURCE_META } from './data.js';
import {
  allTracks,
  getTrack,
  isLiked,
  playlistById,
  playlistCover,
  playlistDuration,
  playlistTracks,
  state,
  playlistById as findPlaylist
} from './store.js';
import {
  escapeAttr,
  escapeHTML,
  formatTime,
  hexToRgb,
  makeCover,
  pluralize,
  sumDuration,
  totalDurationLabel
} from './utils.js';

export function icon(name, className = 'icon') {
  return `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function imageUrl(value, fallback = '') {
  const url = String(value || '').trim();
  if (/^(https?:\/\/|data:image\/|blob:|\/|\.{0,2}\/|assets\/)/i.test(url)) {
    if (/^(assets\/|\.{1,2}\/)/i.test(url)) {
      try { return new URL(url, document.baseURI).href; } catch { return url; }
    }
    return url;
  }
  return fallback;
}

export function trackCover(track) {
  const fallback = makeCover(track?.title || 'SONORA', track?.artist || '', track?.id || '');
  return imageUrl(track?.cover, fallback);
}

export function sourceMeta(track) {
  const key = track?.source === 'generic' ? 'other' : track?.source;
  return SOURCE_META[key] || SOURCE_META.other;
}

export function sourceBadge(track) {
  const meta = sourceMeta(track);
  return `<span class="track-badge">${icon(meta.icon || 'link')}${escapeHTML(meta.short || 'URL')}</span>`;
}

export function trackRow(track, index, options = {}) {
  if (!track) return '';
  const { playlistId = '', showIndex = true, contextType = '', contextIds = [] } = options;
  const current = state.currentId === track.id;
  const liked = isLiked(track.id);
  const cover = trackCover(track);
  const meta = sourceMeta(track);
  const hasVideo = ['video', 'youtube'].includes(track.type) || ['youtube', 'youtube-music', 'vimeo'].includes(track.source);
  const rowActions = [
    `data-action="playTrack"`,
    `data-id="${escapeAttr(track.id)}"`
  ];
  if (playlistId) rowActions.push(`data-playlist-id="${escapeAttr(playlistId)}"`);

  return `<div class="track-row${current ? ' is-current' : ''}" ${rowActions.join(' ')} role="button" tabindex="0" aria-label="Phát ${escapeAttr(track.title)} — ${escapeAttr(track.artist)}">
    <span class="row-index">
      ${current
        ? `<span class="eq-bars" data-playing="${current ? 'true' : 'false'}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`
        : (showIndex ? `<span class="row-num">${String(index + 1).padStart(2, '0')}</span>` : '')}
      <button type="button" class="row-play" data-action="playTrack" data-id="${escapeAttr(track.id)}"${playlistId ? ` data-playlist-id="${escapeAttr(playlistId)}"` : ''} aria-label="Phát bài hát">
        ${icon('play', 'icon row-icon-play')}${icon('pause', 'icon row-icon-pause')}
      </button>
    </span>
    <span class="row-art">
      <img src="${escapeAttr(cover)}" alt="" loading="lazy" draggable="false">
      ${hasVideo ? `<span class="row-art-video">${icon('video')}</span>` : ''}
    </span>
    <span class="row-main">
      <span class="track-title" title="${escapeAttr(track.title)}">${escapeHTML(track.title)}</span>
      <span class="track-artist">${escapeHTML(track.artist)}<span class="artist-dot"></span>${escapeHTML(track.genre || meta.label)}</span>
    </span>
    <span class="track-album" title="${escapeAttr(track.album || '')}">${escapeHTML(track.album || '—')}</span>
    ${sourceBadge(track)}
    <button type="button" class="track-like${liked ? ' is-liked' : ''}" data-action="likeTrack" data-id="${escapeAttr(track.id)}" aria-label="${liked ? 'Bỏ thích' : 'Thích'} bài hát" aria-pressed="${liked}">
      ${icon('heart')}
    </button>
    <span class="track-duration">${formatTime(track.duration)}</span>
    <button type="button" class="row-more" data-action="trackMenu" data-id="${escapeAttr(track.id)}"${playlistId ? ` data-playlist-id="${escapeAttr(playlistId)}"` : ''} aria-label="Thêm tùy chọn">${icon('more')}</button>
  </div>`;
}

export function trackTable(tracks, options = {}) {
  const {
    compact = false,
    noAlbum = false,
    playlistId = '',
    contextType = 'collection',
    contextId = '',
    contextLabel = 'SONORA',
    showHeader = true,
    emptyText = 'Chưa có bài hát nào ở đây.',
    limit = 0
  } = options;
  if (!tracks?.length) {
    return `<div class="track-empty">${escapeHTML(emptyText)}</div>`;
  }
  const list = limit > 0 ? tracks.slice(0, limit) : tracks;
  const ids = tracks.map((track) => track.id);
  const classes = ['track-table'];
  if (compact) classes.push('track-table--compact');
  if (noAlbum) classes.push('track-table--noalbum');

  return `<div class="${classes.join(' ')}" data-context-type="${escapeAttr(contextType)}" data-context-id="${escapeAttr(contextId)}" data-context-label="${escapeAttr(contextLabel)}" data-track-ids="${escapeAttr(ids.join(','))}">
    ${showHeader ? `<div class="track-head" aria-hidden="true">
      <span></span>
      <span></span>
      <span>Bài hát</span>
      <span class="thead-album">Album</span>
      <span class="thead-source">Nguồn</span>
      <span class="thead-like">${icon('heart')}</span>
      <span>Thời lượng</span>
      <span class="thead-more"></span>
    </div>` : ''}
    <div class="track-list">
      ${list.map((track, index) => trackRow(track, index, { playlistId, contextType, contextIds: ids })).join('')}
    </div>
  </div>`;
}

export function mediaCard({ title, subtitle, cover, action, id, badge = '', sub = '', current = false }) {
  return `<article class="media-card${current ? ' is-current' : ''}" data-action="${escapeAttr(action)}" data-id="${escapeAttr(id)}" role="button" tabindex="0">
    <span class="media-art">
      <img src="${escapeAttr(cover)}" alt="" loading="lazy" draggable="false">
      ${badge ? `<span class="media-source">${escapeHTML(badge)}</span>` : ''}
      <span class="media-play" aria-hidden="true">${icon('play')}</span>
    </span>
    <span class="media-card-body">
      <strong class="media-title" title="${escapeAttr(title)}">${escapeHTML(title)}</strong>
      <span class="media-sub">${escapeHTML(subtitle)}</span>
    </span>
  </article>`;
}

export function playlistCard(playlist) {
  const tracks = playlistTracks(playlist);
  const sub = tracks.length
    ? `${pluralize(tracks.length, 'bài hát', 'bài hát')} · ${totalDurationLabel(sumDuration(tracks))}`
    : 'Playlist trống · bắt đầu thêm nhạc';
  return mediaCard({
    title: playlist.name,
    subtitle: `${playlistTrackCountLabel(tracks.length)}`,
    sub,
    cover: playlistCover(playlist),
    action: 'openPlaylist',
    id: playlist.id,
    badge: 'Playlist'
  });
}

function playlistTrackCountLabel(count) {
  return count ? `${count} bài hát` : 'Chưa có bài hát';
}

export function trackCard(track) {
  const meta = sourceMeta(track);
  return mediaCard({
    title: track.title,
    subtitle: `${track.artist} · ${track.album || meta.label}`,
    sub: `${track.artist} · ${track.album || meta.label}`,
    cover: trackCover(track),
    action: 'playTrack',
    id: track.id,
    badge: meta.short,
    current: state.currentId === track.id
  });
}

export function quickCard(playlist) {
  const tracks = playlistTracks(playlist);
  return `<button type="button" class="quick-card" data-action="playPlaylist" data-id="${escapeAttr(playlist.id)}" aria-label="Phát playlist ${escapeAttr(playlist.name)}">
    <span class="quick-art"><img src="${escapeAttr(playlistCover(playlist))}" alt="" loading="lazy" draggable="false"></span>
    <span class="quick-copy"><strong>${escapeHTML(playlist.name)}</strong><small>${tracks.length ? `${tracks.length} bài · ${totalDurationLabel(sumDuration(tracks))}` : 'Thêm nhạc vào đây'}</small></span>
    <span class="quick-play" aria-hidden="true">${icon('play')}</span>
  </button>`;
}

export function collectionCard(playlist, { showPlay = true } = {}) {
  const tracks = playlistTracks(playlist);
  return `<article class="collection-card" data-action="openPlaylist" data-id="${escapeAttr(playlist.id)}" role="button" tabindex="0">
    <span class="collection-art">
      <img src="${escapeAttr(playlistCover(playlist))}" alt="" loading="lazy" draggable="false">
      ${playlist.pinned ? `<span class="collection-badge">${icon('pin')}Ghim</span>` : `<span class="collection-badge">${icon('disc')}Playlist</span>`}
      ${showPlay ? `<button type="button" class="collection-play" data-action="playPlaylist" data-id="${escapeAttr(playlist.id)}" aria-label="Phát playlist">${icon('play')}</button>` : ''}
    </span>
    <span class="collection-copy">
      <strong title="${escapeAttr(playlist.name)}">${escapeHTML(playlist.name)}</strong>
      <span>${tracks.length ? `${pluralize(tracks.length, 'bài hát', 'bài hát')} · ${totalDurationLabel(sumDuration(tracks))}` : 'Playlist trống'}</span>
    </span>
  </article>`;
}

export function newPlaylistCard() {
  return `<button type="button" class="collection-card is-new" data-action="createPlaylist">
    <span class="collection-new-inner">
      <span class="collection-new-icon">${icon('plus')}</span>
      <strong>Tạo playlist mới</strong>
      <span>Gom những bài hát cùng một bầu không khí</span>
    </span>
  </button>`;
}

export function moodCard(mood, { tile = false } = {}) {
  const a = hexToRgb(mood.colors?.[0] || '#2d3f68');
  const b = hexToRgb(mood.colors?.[1] || '#472879');
  if (tile) {
    return `<button type="button" class="mood-tile" data-action="openMood" data-id="${escapeAttr(mood.id)}" style="--mood-a-rgb:${a};--mood-b-rgb:${b}">
      <span class="mood-icon">${icon(mood.icon || 'sparkles')}</span>
      <strong>${escapeHTML(mood.label)}</strong>
      <p>${escapeHTML(mood.sub)}</p>
      <span class="mood-tile-foot">Mở đài cảm xúc ${icon('arrow-right')}</span>
    </button>`;
  }
  return `<button type="button" class="mood-card" data-action="openMood" data-id="${escapeAttr(mood.id)}" style="--mood-a-rgb:${a};--mood-b-rgb:${b}">
    <span class="mood-icon">${icon(mood.icon || 'sparkles')}</span>
    <span class="mood-copy"><strong>${escapeHTML(mood.label)}</strong><small>${escapeHTML(mood.sub)}</small></span>
    <span class="mood-arrow">${icon('arrow-right')}</span>
  </button>`;
}

export function heroPanel(track) {
  if (!track) {
    return `<section class="hero-panel">
      <div class="hero-copy">
        <span class="hero-eyebrow">SONORA · Bắt đầu</span>
        <h2 class="hero-title">Vũ trụ này<br>đang chờ bạn.</h2>
        <p class="hero-desc">Thêm một liên kết YouTube, Spotify, SoundCloud hoặc tệp MP3 để bắt đầu hành trình nghe nhạc của riêng bạn.</p>
        <div class="hero-actions"><button class="primary-btn" data-action="openAdd">${icon('plus')}Thêm bài hát đầu tiên</button></div>
      </div>
      <div class="hero-art"><span class="hero-halo"></span><div class="hero-orbit"></div></div>
    </section>`;
  }
  const colorA = hexToRgb(track.colors?.[0] || '#ff5d8a');
  const colorB = hexToRgb(track.colors?.[1] || '#8b5cf6');
  const cover = trackCover(track);
  const liked = isLiked(track.id);
  const meta = sourceMeta(track);
  const tags = [track.genre, ...(track.tags || [])].filter(Boolean).slice(0, 3);

  return `<section class="hero-panel" style="--hero-a-rgb:${colorA};--hero-b-rgb:${colorB};--hero-art:url(&quot;${escapeAttr(cover)}&quot;)">
    <div class="hero-backdrop"></div>
    <div class="hero-copy">
      <span class="hero-eyebrow"><span class="live-dot"></span>Bản chọn hôm nay · ${escapeHTML(meta.label)}</span>
      <h2 class="hero-title">${escapeHTML(track.title)}<span>${escapeHTML(track.artist)}${track.year ? ` · ${track.year}` : ''}</span></h2>
      <p class="hero-desc">${escapeHTML(track.description || 'Một bài hát để giữ lại khoảnh khắc này lâu hơn một chút.')}</p>
      <div class="hero-tags">${tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join('')}</div>
      <div class="hero-actions">
        <button class="primary-btn" data-action="playTrack" data-id="${escapeAttr(track.id)}">${icon('play')}Phát ngay</button>
        <button class="ghost-btn" data-action="addToPlaylist" data-id="${escapeAttr(track.id)}">${icon('folder-plus')}Lưu vào playlist</button>
        <button class="icon-btn hero-like${liked ? ' is-liked' : ''}" data-action="likeTrack" data-id="${escapeAttr(track.id)}" aria-label="Thích bài hát" aria-pressed="${liked}">${icon('heart')}</button>
      </div>
      <div class="hero-wave" aria-hidden="true">${Array.from({ length: 26 }, () => '<span></span>').join('')}</div>
    </div>
    <div class="hero-art">
      <span class="hero-halo"></span>
      <span class="hero-orbit"></span>
      <div class="hero-cover-frame"><img src="${escapeAttr(cover)}" alt="" draggable="false"></div>
      <div class="hero-vinyl" aria-hidden="true"></div>
      <div class="hero-float hero-float-a">${icon('wave')}<span><strong>${escapeHTML(track.format || 'HI-RES')}</strong><small>${escapeHTML(track.genre || 'SONORA')}</small></span></div>
      <div class="hero-float hero-float-b">${icon('sparkles')}<span><strong>${escapeHTML(meta.label)}</strong><small>${track.plays ? `${track.plays.toLocaleString('vi-VN')} lượt nghe` : 'Sẵn sàng phát'}</small></span></div>
    </div>
  </section>`;
}

export function playlistHero({
  kind = 'Playlist',
  title,
  description = '',
  tracks = [],
  colors = ['#ff6b9a', '#8b5cf6'],
  meta = '',
  actions = '',
  cover = '',
  backCover = '',
  coverIcon = 'disc'
}) {
  const colorA = hexToRgb(colors[0] || '#ff6b9a');
  const colorB = hexToRgb(colors[1] || '#8b5cf6');
  const front = imageUrl(cover, makeCover(title, 'SONORA'));
  const back = imageUrl(backCover, front);
  const total = tracks.length
    ? `${pluralize(tracks.length, 'bài hát', 'bài hát')} · ${totalDurationLabel(sumDuration(tracks))}`
    : 'Chưa có bài hát';

  return `<section class="playlist-hero" style="--pl-a-rgb:${colorA};--pl-b-rgb:${colorB}">
    <div class="playlist-hero-bg" style="background-image:url(&quot;${escapeAttr(front)}&quot;)"></div>
    <div class="playlist-art-cluster">
      <div class="playlist-art-back"><img src="${escapeAttr(back)}" alt="" draggable="false"></div>
      <div class="playlist-art-main"><img src="${escapeAttr(front)}" alt="" draggable="false"></div>
      <span class="playlist-art-orbit"></span>
    </div>
    <div class="playlist-copy">
      <span class="playlist-kind">${icon(coverIcon)}${escapeHTML(kind)} · SONORA</span>
      <h1 class="playlist-title">${escapeHTML(title)}</h1>
      ${description ? `<p class="playlist-desc">${escapeHTML(description)}</p>` : ''}
      <div class="playlist-meta">${meta ? `<span>${meta}</span><span class="dot-sep"></span>` : ''}<span>${total}</span></div>
      <div class="playlist-actions">${actions}</div>
    </div>
  </section>`;
}

export function emptyState({ icon: iconName = 'sparkles', title = 'Chưa có gì ở đây', description = '', actions = '' }) {
  return `<div class="empty-view">
    <div class="empty-state">
      <span class="empty-orb">${icon(iconName)}</span>
      <h2>${escapeHTML(title)}</h2>
      <p>${escapeHTML(description)}</p>
      ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
    </div>
  </div>`;
}

export function renderSidebarPlaylists() {
  if (!state.playlists.length) {
    return `<div class="sidebar-playlist-empty">Chưa có playlist nào.<br>Nhấn dấu + để tạo bộ sưu tập đầu tiên.</div>`;
  }
  const sorted = [...state.playlists].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return sorted.slice(0, 12).map((playlist) => {
    const tracks = playlistTracks(playlist);
    return `<button type="button" class="sidebar-playlist" data-action="openPlaylist" data-id="${escapeAttr(playlist.id)}">
      <span class="sidebar-playlist-art"><img src="${escapeAttr(playlistCover(playlist))}" alt="" loading="lazy" draggable="false"></span>
      <span class="sidebar-playlist-info"><strong>${escapeHTML(playlist.name)}</strong><small>${tracks.length} bài hát${playlist.pinned ? ' · Đã ghim' : ''}</small></span>
      ${playlist.pinned ? `<span class="pin-mark">${icon('pin')}</span>` : ''}
    </button>`;
  }).join('');
}

export function renderUpNext(limit = 4) {
  const currentPos = state.order.indexOf(state.currentId);
  const ordered = currentPos >= 0 ? state.order.slice(currentPos + 1) : state.order.slice(0, limit + 1);
  const ids = [...state.queue, ...ordered].filter((id, index, list) => list.indexOf(id) === index).slice(0, limit);
  if (!ids.length) {
    return `<div class="upnext-empty">Hàng đợi đang trống. Thêm vài bài để giữ vũ trụ quay tiếp.</div>`;
  }
  return ids.map((id, index) => {
    const track = getTrack(id);
    if (!track) return '';
    return `<button type="button" class="upnext-item" data-action="playTrack" data-id="${escapeAttr(id)}">
      <span class="upnext-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="upnext-art"><img src="${escapeAttr(trackCover(track))}" alt="" loading="lazy"></span>
      <span class="upnext-copy"><strong>${escapeHTML(track.title)}</strong><span>${escapeHTML(track.artist)}</span></span>
      <span class="upnext-time">${formatTime(track.duration)}</span>
    </button>`;
  }).join('');
}

function queueItem(track, index, { current = false, removeIndex = -1, history = false } = {}) {
  if (!track) return '';
  return `<div class="queue-item${current ? ' is-current' : ''}" data-action="playTrack" data-id="${escapeAttr(track.id)}" role="button" tabindex="0">
    <span class="queue-item-index">${current ? '▶' : String(index + 1).padStart(2, '0')}</span>
    <span class="queue-art"><img src="${escapeAttr(trackCover(track))}" alt="" loading="lazy"></span>
    <span class="queue-copy"><strong>${escapeHTML(track.title)}</strong><small>${escapeHTML(track.artist)} · ${formatTime(track.duration)}</small></span>
    <span class="queue-actions">
      ${history
        ? `<button type="button" class="icon-btn" data-action="queueTrack" data-id="${escapeAttr(track.id)}" data-tooltip="Thêm vào cuối hàng đợi" aria-label="Thêm vào hàng đợi">${icon('plus')}</button>`
        : removeIndex >= 0
          ? `<button type="button" class="icon-btn" data-action="removeQueueAt" data-index="${removeIndex}" data-tooltip="Bỏ khỏi hàng đợi" aria-label="Bỏ khỏi hàng đợi">${icon('x')}</button>`
          : `<button type="button" class="icon-btn" data-action="trackMenu" data-id="${escapeAttr(track.id)}" data-tooltip="Tùy chọn" aria-label="Tùy chọn">${icon('more')}</button>`}
    </span>
  </div>`;
}

export function renderQueueBody(tab = 'next') {
  if (tab === 'history') {
    const history = state.history.map((id) => getTrack(id)).filter(Boolean).slice(0, 60);
    if (!history.length) {
      return `<div class="queue-empty">${icon('clock')}<strong>Chưa có lịch sử</strong>Những bài bạn nghe sẽ xuất hiện ở đây.</div>`;
    }
    return `<div class="queue-section-label">Đã phát gần đây</div>${history.map((track, index) => queueItem(track, index, { history: true, current: state.currentId === track.id })).join('')}`;
  }

  const current = getTrack(state.currentId);
  const currentPos = state.order.indexOf(state.currentId);
  const ordered = currentPos >= 0 ? state.order.slice(currentPos + 1) : state.order.slice();
  const manualQueue = state.queue.map((id, index) => ({ id, index })).filter((entry) => getTrack(entry.id));
  const nextIds = ordered.filter((id) => !manualQueue.some((entry) => entry.id === id));
  const sections = [];

  if (current) {
    sections.push(`<div class="queue-section-label">Đang phát</div>${queueItem(current, 0, { current: true })}`);
  }
  if (manualQueue.length) {
    sections.push(`<div class="queue-section-label">Trong hàng đợi</div>${manualQueue.map((entry, index) => queueItem(getTrack(entry.id), index, { removeIndex: entry.index })).join('')}`);
  }
  if (nextIds.length) {
    const nextTracks = nextIds.map((id) => getTrack(id)).filter(Boolean).slice(0, 40);
    sections.push(`<div class="queue-section-label">Tiếp theo · ${escapeHTML(state.context?.label || 'SONORA')}</div>${nextTracks.map((track, index) => queueItem(track, index)).join('')}`);
  }
  if (!sections.length) {
    return `<div class="queue-empty">${icon('queue')}<strong>Hàng đợi trống</strong>Thêm bài hát từ thư viện hoặc mở một playlist để bắt đầu.</div>`;
  }
  return sections.join('');
}

export function renderPlaylistPicker(trackId) {
  return state.playlists.map((playlist) => {
    const has = playlist.trackIds.includes(trackId);
    return `<button type="button" class="pick-row${has ? ' is-selected' : ''}" data-action="togglePickPlaylist" data-id="${escapeAttr(playlist.id)}" data-track-id="${escapeAttr(trackId)}">
      <span class="pick-art"><img src="${escapeAttr(playlistCover(playlist))}" alt="" loading="lazy"></span>
      <span class="pick-copy"><strong>${escapeHTML(playlist.name)}</strong><small>${playlist.trackIds.length} bài hát</small></span>
      <span class="pick-check">${icon('check')}</span>
    </button>`;
  }).join('');
}

export function moodHeaderMeta(mood) {
  return `${mood.sub} · Đài cảm xúc`;
}
