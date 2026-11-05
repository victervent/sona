/* SONORA — page views. */
import { DISCOVER_CARDS, MOODS } from './data.js';
import * as store from './store.js';
import { lyricsRecognition, parseLyrics } from './lyrics.js';
import {
  escapeAttr,
  escapeHTML,
  formatCount,
  greetingForHour,
  hashString,
  hexToRgb,
  makeCover,
  pluralize,
  relativeDate,
  sumDuration,
  totalDurationLabel
} from './utils.js';
import {
  collectionCard,
  emptyState,
  heroPanel,
  icon,
  moodCard,
  newPlaylistCard,
  playlistCard,
  playlistHero,
  quickCard,
  trackCard,
  trackCover,
  trackTable
} from './components.js';

const HOME_QUOTES = [
  'Một vũ trụ nhỏ, nơi mỗi bài hát đều có chỗ của riêng nó.',
  'Hôm nay nghe gì, để ngày mai nhớ điều gì?',
  'Có những giai điệu chỉ cần mở ra là cả căn phòng đổi màu.',
  'Bật một bài, để thành phố chậm lại một chút.',
  'Đây là nơi những bài hát yêu thích không bao giờ bị lãng quên.'
];

function dateLabel() {
  const now = new Date();
  const value = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  }).format(now);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function clockLabel() {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());
}

function miniTrackRow(track) {
  return `<button type="button" class="mini-track${store.state.currentId === track.id ? ' is-current' : ''}" data-action="playTrack" data-id="${escapeAttr(track.id)}">
    <span class="mini-art"><img src="${escapeAttr(trackCover(track))}" alt="" loading="lazy"></span>
    <span class="mini-copy"><strong>${escapeHTML(track.title)}</strong><small>${escapeHTML(track.artist)}</small></span>
    <span class="mini-time">${Math.floor((track.duration || 0) / 60)}:${String(Math.floor((track.duration || 0) % 60)).padStart(2, '0')}</span>
  </button>`;
}

export function renderHome() {
  const tracks = store.allTracks();
  const name = store.state.settings.name || 'bạn';
  if (!tracks.length) {
    return `<div class="view view-home">
      ${renderHomeIntro(name)}
      ${heroPanel(null)}
      <div class="content-section">
        ${emptyState({
          icon: 'music',
          title: 'Thư viện đang trống',
          description: 'Thêm một liên kết YouTube, Spotify, SoundCloud hoặc kéo thả một tệp MP3 để bắt đầu vũ trụ âm nhạc của bạn.',
          actions: `<button class="primary-btn" data-action="openAdd">${icon('plus')}Thêm bài hát</button>`
        })}
      </div>
    </div>`;
  }

  const featured = store.featuredTrack();
  const current = store.getTrack(store.state.currentId);
  const sortedPlaylists = [...store.state.playlists].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const quickPlaylists = sortedPlaylists.slice(0, 4);
  const recommended = sortedPlaylists.slice(0, 5);
  const recent = store.recentTracks(6);
  const recentList = recent.length ? recent : store.topTracks(6);
  const top = store.topTracks(5);
  const latest = store.addedTracks(5);
  const stats = store.libraryStats();
  const quote = HOME_QUOTES[hashString(dateLabel()) % HOME_QUOTES.length];

  return `<div class="view view-home">
    ${renderHomeIntro(name)}
    ${heroPanel(featured)}
    ${current ? renderLyricsSpotlight(current) : ''}
    <div class="quick-strip">
      ${quickPlaylists.map(quickCard).join('')}
    </div>

    <section class="content-section">
      <div class="section-head">
        <div class="section-head-copy">
          <span class="section-kicker">${icon('sparkles')}Biên tập cho bạn</span>
          <h2 class="section-title">Những bộ sưu tập đúng tần số</h2>
          <p class="section-sub">${escapeHTML(quote)}</p>
        </div>
        <a class="text-link" href="#/library?tab=playlists">Tất cả playlist ${icon('chevron-right')}</a>
      </div>
      <div class="media-grid">
        ${recommended.map(playlistCard).join('')}
      </div>
    </section>

    <section class="home-split">
      <div class="recent-panel">
        <div class="section-head">
          <div class="section-head-copy">
            <span class="section-kicker">${icon('clock')}Nghe tiếp</span>
            <h2 class="section-title">Quay lại chỗ đã dừng</h2>
          </div>
          <button class="text-link" data-action="openQueue">Hàng đợi ${icon('chevron-right')}</button>
        </div>
        ${trackTable(recentList.slice(0, 5), {
          compact: true,
          playlistId: '',
          contextType: 'recent',
          contextId: 'recent',
          contextLabel: 'Nghe gần đây',
          emptyText: 'Chưa có lịch sử nghe.'
        })}
      </div>
      <aside class="mood-column" aria-label="La bàn cảm xúc">
        ${MOODS.map((mood) => moodCard(mood)).join('')}
      </aside>
    </section>

    <section class="content-section">
      <div class="section-head">
        <div class="section-head-copy">
          <span class="section-kicker">${icon('wave')}Được nghe nhiều</span>
          <h2 class="section-title">Những bài hát đang giữ nhịp</h2>
        </div>
        <a class="text-link" href="#/library?tab=all">Mở thư viện ${icon('chevron-right')}</a>
      </div>
      <div class="media-grid">
        ${top.map(trackCard).join('')}
      </div>
    </section>

    <section class="content-section">
      <div class="section-head">
        <div class="section-head-copy">
          <span class="section-kicker">${icon('compass')}Khám phá</span>
          <h2 class="section-title">Đi xa hơn một chút</h2>
        </div>
      </div>
      <div class="discover-grid">
        ${DISCOVER_CARDS.map(discoverCard).join('')}
      </div>
    </section>

    <section class="content-section">
      <div class="section-head">
        <div class="section-head-copy">
          <span class="section-kicker">${icon('library')}Tất cả bài hát</span>
          <h2 class="section-title">Vũ trụ của ${escapeHTML(name)}</h2>
          <p class="section-sub">${tracks.length} bài hát · ${totalDurationLabel(sumDuration(tracks))} âm nhạc</p>
        </div>
        <a class="text-link" href="#/library?tab=all">Xem tất cả ${icon('chevron-right')}</a>
      </div>
      ${trackTable([...tracks].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 8), {
        contextType: 'library',
        contextId: 'all',
        contextLabel: 'Tất cả bài hát'
      })}
    </section>

    ${latest.length ? `<section class="content-section">
      <div class="section-head">
        <div class="section-head-copy">
          <span class="section-kicker">${icon('plus')}Mới trong thư viện</span>
          <h2 class="section-title">Vừa bước vào vũ trụ</h2>
        </div>
        <a class="text-link" href="#/library?tab=uploads">Tệp của tôi ${icon('chevron-right')}</a>
      </div>
      <div class="media-grid">${latest.map(trackCard).join('')}</div>
    </section>` : ''}

    <section class="stat-strip" aria-label="Thống kê thư viện">
      <div class="stat-card"><strong>${stats.tracks}</strong><span>Bài hát trong thư viện</span></div>
      <div class="stat-card"><strong>${store.totalListeningLabel()}</strong><span>Thời gian đã nghe</span></div>
      <div class="stat-card"><strong>${stats.playlists}</strong><span>Bộ sưu tập cá nhân</span></div>
    </section>
  </div>`;
}

function renderHomeIntro(name) {
  const greeting = greetingForHour();
  return `<section class="home-intro">
    <div class="page-head-copy">
      <span class="home-date">${escapeHTML(dateLabel())}<span class="dot-sep"></span>${clockLabel()} · Sài Gòn</span>
      <h1 class="page-title">${escapeHTML(greeting.text)}, <em>${escapeHTML(name)}.</em></h1>
      <p class="page-subtitle">Vũ trụ âm nhạc của bạn đã sẵn sàng. Một bài hát, một cảnh phim, và phần còn lại để âm thanh lo.</p>
    </div>
    <div class="home-intro-actions">
      <button class="ghost-btn" data-action="openAdd">${icon('link')}Thêm liên kết</button>
      <button class="primary-btn" data-action="shuffleAll">${icon('shuffle')}Phát ngẫu nhiên</button>
    </div>
  </section>`;
}

export function renderLyricsSpotlight(track) {
  const entry = store.getLyricsEntry(track);
  const lines = entry?.text ? parseLyrics(entry.text, track.duration || 0) : [];
  const recognition = lyricsRecognition(lines);
  const sample = lines.length
    ? lines[Math.min(lines.length - 1, Math.max(0, Math.floor(lines.length * 0.22)))]
    : null;
  const quote = String(sample?.text || track.description || 'Bài hát này chưa có lời. Hãy dò một bản lời để mở Lyrics Live.').slice(0, 150);
  const cover = trackCover(track);
  const colorA = hexToRgb(track.colors?.[0] || '#ff5d8a');
  const colorB = hexToRgb(track.colors?.[1] || '#8b5cf6');
  const source = entry?.source || 'Chưa nhận diện';

  return `<section class="lyrics-spotlight" style="--spot-a-rgb:${colorA};--spot-b-rgb:${colorB}" aria-label="Lyrics Live cho ${escapeAttr(track.title)}">
    <div class="lyrics-spotlight-bg" style="background-image:url(&quot;${escapeAttr(cover)}&quot;)"></div>
    <div class="lyrics-spotlight-glow"></div>
    <div class="lyrics-spotlight-copy">
      <div class="lyrics-spotlight-top">
        <span class="spotlight-kicker"><span class="live-dot"></span>Lyrics Live</span>
        <span class="spotlight-source">${escapeHTML(source)}</span>
        <span class="lyrics-match-badge" data-tone="${recognition.tone}">${recognition.label}</span>
      </div>
      <blockquote class="lyrics-spotlight-quote">“${escapeHTML(quote)}”</blockquote>
      <div class="lyrics-spotlight-track">
        <span>${escapeHTML(track.title)}</span><span class="dot-sep"></span><span>${escapeHTML(track.artist || 'SONORA')}</span>
      </div>
      <div class="lyrics-spotlight-actions">
        <button type="button" class="primary-btn" data-action="openKaraoke">${icon('sparkles')}Mở Lyrics Live</button>
        <button type="button" class="ghost-btn" data-action="lyricsRadar">${icon('compass')}${lines.length ? 'Dò lại lời' : 'Nhận diện lời'}</button>
      </div>
    </div>
    <div class="lyrics-spotlight-visual" aria-hidden="true">
      <span class="spotlight-mark">“</span>
      <div class="spotlight-cover-frame"><img src="${escapeAttr(cover)}" alt=""></div>
      <div class="spotlight-wave">${Array.from({ length: 14 }, () => '<span></span>').join('')}</div>
    </div>
  </section>`;
}

function discoverCard(card) {
  return `<button type="button" class="discover-card" data-action="openPlaylist" data-id="${escapeAttr(card.action?.id || '')}">
    <span class="discover-art"><img src="${escapeAttr(card.art)}" alt="" loading="lazy" draggable="false"></span>
    <span class="discover-copy">
      <span class="eyebrow">${escapeHTML(card.eyebrow)}</span>
      <strong class="discover-title">${escapeHTML(card.title)}</strong>
      <span class="discover-desc">${escapeHTML(card.description)}</span>
      <span class="discover-cta">Mở bộ sưu tập ${icon('arrow-right')}</span>
    </span>
  </button>`;
}

export function renderSearch(query = '') {
  const trimmed = String(query || '').trim();
  const results = trimmed ? store.searchLibrary(trimmed, 50) : null;
  const hasResults = results && (results.tracks.length || results.playlists.length || results.artists.length);
  const recent = store.state.recentSearches;
  const top = store.topTracks(8);
  const playlists = store.state.playlists.slice(0, 5);

  return `<div class="view search-view">
    <div class="page-head">
      <div class="page-head-copy">
        <span class="eyebrow">${icon('search')}Tìm trong vũ trụ</span>
        <h1 class="page-title">${trimmed ? 'Kết quả cho <em>“' + escapeHTML(trimmed) + '”</em>' : 'Bạn muốn nghe <em>điều gì?</em>'}</h1>
        <p class="page-subtitle">Tìm bài hát, nghệ sĩ, album hoặc playlist. Gõ không dấu vẫn tìm được — SONORA hiểu tiếng Việt.</p>
      </div>
    </div>

    <form class="search-hero" data-search-form role="search">
      <div class="search-input-shell">
        ${icon('search')}
        <input id="searchPageInput" name="q" type="search" value="${escapeAttr(trimmed)}" placeholder="Thử “Neon Bloom”, “Café 3AM”, “mưa”…" autocomplete="off" spellcheck="false" aria-label="Tìm kiếm trong thư viện">
        ${trimmed
          ? `<button type="button" class="search-clear" data-action="clearSearch" aria-label="Xóa tìm kiếm">${icon('x')}</button>`
          : `<kbd>Ctrl K</kbd>`}
      </div>
    </form>

    ${!trimmed ? renderSearchIdle(recent, top, playlists) : ''}
    ${trimmed && !hasResults ? emptyState({
      icon: 'search',
      title: 'Không tìm thấy gì',
      description: `Không có bài hát hay playlist nào khớp với “${trimmed}”. Thử một từ khóa ngắn hơn, hoặc thêm liên kết mới vào thư viện.`,
      actions: `<button class="primary-btn" data-action="openAdd">${icon('plus')}Thêm bài hát</button><button class="ghost-btn" data-action="clearSearch">Xóa tìm kiếm</button>`
    }) : ''}
    ${trimmed && hasResults ? renderSearchResults(trimmed, results) : ''}
  </div>`;
}

function renderSearchIdle(recent, top, playlists) {
  return `<div class="search-suggest">
    ${recent.length ? `<div class="section-head">
      <div class="section-head-copy">
        <span class="section-kicker">${icon('clock')}Gần đây</span>
        <h2 class="section-title">Bạn vừa tìm</h2>
      </div>
      <button class="text-link" data-action="clearRecentSearches">Xóa lịch sử tìm</button>
    </div>
    <div class="search-tag-row">
      ${recent.map((item) => `<button type="button" class="search-tag" data-action="searchFor" data-query="${escapeAttr(item)}">${icon('search')}${escapeHTML(item)}</button>`).join('')}
    </div>` : ''}

    <div class="section-head" style="margin-top:24px">
      <div class="section-head-copy">
        <span class="section-kicker">${icon('compass')}La bàn cảm xúc</span>
        <h2 class="section-title">Bắt đầu từ một cảm giác</h2>
      </div>
      <a class="text-link" href="#/radio">Mở la bàn ${icon('chevron-right')}</a>
    </div>
    <div class="search-moods">
      ${MOODS.map((mood) => moodCard(mood)).join('')}
    </div>

    <div class="search-result-head">
      <h2>Đang được nghe nhiều</h2>
      <span>${top.length} bài hát</span>
    </div>
    <div class="media-grid">
      ${top.map(trackCard).join('')}
    </div>

    <div class="search-result-head">
      <h2>Playlist dành cho bạn</h2>
      <a class="text-link" href="#/library?tab=playlists">Xem tất cả ${icon('chevron-right')}</a>
    </div>
    <div class="media-grid">
      ${playlists.map(playlistCard).join('')}
    </div>
  </div>`;
}

function renderSearchResults(query, results) {
  return `<div class="search-results">
    ${results.tracks.length ? `<div class="search-result-head">
      <h2>Bài hát</h2>
      <span>${results.tracks.length} kết quả</span>
    </div>
    ${trackTable(results.tracks, {
      contextType: 'search',
      contextId: query,
      contextLabel: `Tìm kiếm: ${query}`
    })}` : ''}

    ${results.artists.length ? `<div class="search-result-head"><h2>Nghệ sĩ</h2><span>${results.artists.length} kết quả</span></div>
    <div class="search-artists">
      ${results.artists.map((artist) => `<button type="button" class="artist-card" data-action="searchFor" data-query="${escapeAttr(artist.name)}">
        <span class="artist-avatar"><img src="${escapeAttr(artist.cover || makeCover(artist.name, 'Artist', artist.name))}" alt="" loading="lazy"></span>
        <span class="artist-copy"><strong>${escapeHTML(artist.name)}</strong><span>${artist.trackCount} bài hát</span></span>
      </button>`).join('')}
    </div>` : ''}

    ${results.playlists.length ? `<div class="search-result-head"><h2>Playlist</h2><span>${results.playlists.length} kết quả</span></div>
    <div class="collection-grid">
      ${results.playlists.map((playlist) => collectionCard(playlist)).join('')}
    </div>` : ''}
  </div>`;
}

export function renderRadio(moodId = '') {
  const mood = MOODS.find((item) => item.id === moodId);
  if (mood) return renderMoodDetail(mood);
  const recent = store.recentTracks(6);
  const top = store.topTracks(5);
  return `<div class="view radio-view">
    <section class="radio-hero">
      <div class="radio-copy">
        <span class="eyebrow"><span class="live-dot"></span>SONORA RADIO · 24/7</span>
        <h1 class="radio-title">Một đài phát<br><em>theo cảm xúc.</em></h1>
        <p class="radio-desc">Không cần chọn bài. Chỉ cần chọn tâm trạng — những giai điệu phù hợp sẽ tự tìm đến bạn, theo đúng nhịp của ngày hôm nay.</p>
        <div class="radio-actions">
          <button class="primary-btn" data-action="playSurpriseMood">${icon('play')}Bắt đầu phát</button>
          <button class="ghost-btn" data-action="shuffleAll">${icon('shuffle')}Xáo toàn bộ</button>
        </div>
      </div>
      <div class="radio-orb" aria-hidden="true">
        <span class="orb-ring"></span>
        <span class="orb-ring ring-b"></span>
        <span class="orb-core"></span>
        <span class="orb-label">on air</span>
      </div>
    </section>

    <section class="content-section" style="margin-top:0">
      <div class="section-head">
        <div class="section-head-copy">
          <span class="section-kicker">${icon('compass')}Chọn tần số</span>
          <h2 class="section-title">Hôm nay bạn cảm thấy thế nào?</h2>
          <p class="section-sub">Mỗi tần số là một danh sách phát được cá nhân hóa từ thư viện của bạn.</p>
        </div>
      </div>
      <div class="mood-mosaic">
        ${MOODS.map((item) => moodCard(item, { tile: true })).join('')}
      </div>
    </section>

    <div class="radio-columns">
      <div class="recent-panel">
        <div class="section-head">
          <div class="section-head-copy">
            <span class="section-kicker">${icon('clock')}Vừa phát</span>
            <h2 class="section-title">Không khí gần đây</h2>
          </div>
        </div>
        ${recent.length ? trackTable(recent.slice(0, 5), {
          compact: true,
          contextType: 'recent',
          contextId: 'radio-recent',
          contextLabel: 'Radio gần đây'
        }) : `<div class="track-empty">Nghe một bài để đài ghi nhớ bầu không khí của bạn.</div>`}
      </div>
      <div class="radio-side">
        <div class="section-mini-head">
          <span class="eyebrow">Bảng xếp hạng nhỏ</span>
          <span class="badge-soft">Tuần này</span>
        </div>
        <div class="upnext-list">
          ${top.map(miniTrackRow).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

function renderMoodDetail(mood) {
  const tracks = store.moodTracks(mood, 16);
  const a = hexToRgb(mood.colors[0]);
  const b = hexToRgb(mood.colors[1]);
  const cover = tracks[0] ? trackCover(tracks[0]) : makeCover(mood.label, 'SONORA Radio', mood.id);
  const back = tracks[1] ? trackCover(tracks[1]) : cover;
  const actions = `<button class="primary-btn" data-action="playMood" data-id="${escapeAttr(mood.id)}">${icon('play')}Phát đài này</button>
    <button class="ghost-btn" data-action="shuffleMood" data-id="${escapeAttr(mood.id)}">${icon('shuffle')}Xáo bài</button>
    <button class="icon-btn" data-action="queueMood" data-id="${escapeAttr(mood.id)}" data-tooltip="Thêm vào hàng đợi" aria-label="Thêm đài vào hàng đợi">${icon('plus')}</button>`;

  return `<div class="view radio-view">
    ${playlistHero({
      kind: 'Đài cảm xúc',
      title: mood.label,
      description: `Một danh sách phát sống động cho tần số “${mood.label.toLowerCase()}”. ${mood.sub}.`,
      tracks,
      colors: mood.colors,
      meta: `<strong>SONORA Radio</strong><span class="dot-sep"></span><span>Cập nhật theo thư viện</span>`,
      actions,
      cover,
      backCover: back,
      coverIcon: mood.icon
    })}
    <div class="playlist-toolbar">
      <div class="toolbar-left">${icon('wave')}Đang phát theo tần số cảm xúc · ${a && b ? `<span>${mood.sub}</span>` : ''}</div>
      <button class="ghost-chip" data-action="openMood" data-id="__back">${icon('compass')}Đổi tần số</button>
    </div>
    ${trackTable(tracks, {
      contextType: 'mood',
      contextId: mood.id,
      contextLabel: `Đài ${mood.label}`
    })}
    <section class="content-section">
      <div class="section-head">
        <div class="section-head-copy">
          <span class="section-kicker">${icon('sparkles')}Cùng bầu không khí</span>
          <h2 class="section-title">Có thể bạn cũng muốn nghe</h2>
        </div>
      </div>
      <div class="media-grid">${store.topTracks(5).map(trackCard).join('')}</div>
    </section>
  </div>`;
}

export function renderLibrary(tab = 'playlists') {
  const tabs = [
    { id: 'playlists', label: 'Playlist', count: store.state.playlists.length },
    { id: 'uploads', label: 'Tệp của tôi', count: store.addedTracks(999).length },
    { id: 'liked', label: 'Đã thích', count: store.state.liked.length },
    { id: 'all', label: 'Tất cả bài hát', count: store.allTracks().length }
  ];
  const active = tabs.some((item) => item.id === tab) ? tab : 'playlists';
  return `<div class="view library-view">
    <div class="page-head">
      <div class="page-head-copy">
        <span class="eyebrow">${icon('library')}Bộ sưu tập</span>
        <h1 class="page-title">Thư viện <em>của bạn.</em></h1>
        <p class="page-subtitle">Mọi bài hát, playlist và tệp bạn đã mang vào SONORA — được sắp xếp để luôn tìm thấy đúng lúc.</p>
      </div>
      <div class="page-head-actions">
        <button class="ghost-btn" data-action="openAdd">${icon('link')}Thêm liên kết</button>
        <button class="primary-btn" data-action="createPlaylist">${icon('plus')}Playlist mới</button>
      </div>
    </div>

    <div class="library-tabs" role="tablist">
      ${tabs.map((item) => `<a class="tab-btn${active === item.id ? ' is-active' : ''}" href="#/library?tab=${item.id}" role="tab" aria-selected="${active === item.id}">${item.label}<span class="tab-count">${item.count}</span></a>`).join('')}
    </div>

    ${active === 'playlists' ? renderLibraryPlaylists() : ''}
    ${active === 'uploads' ? renderLibraryUploads() : ''}
    ${active === 'liked' ? renderLibraryLiked() : ''}
    ${active === 'all' ? renderLibraryAll() : ''}
  </div>`;
}

function renderLibraryPlaylists() {
  return `<div class="collection-grid">
    ${newPlaylistCard()}
    ${store.state.playlists.map((playlist) => collectionCard(playlist)).join('')}
  </div>`;
}

function renderLibraryUploads() {
  const tracks = store.addedTracks(200);
  return `<div class="upload-banner">
    <span class="upload-banner-icon">${icon('upload')}</span>
    <div class="upload-banner-copy">
      <strong>Mang nhạc từ máy lên vũ trụ</strong>
      <p>Thả tệp MP3, MP4, WAV, M4A hoặc OGG vào đây. Tệp được phát trực tiếp trong trình duyệt và chỉ tồn tại trong phiên này — không tải lên máy chủ nào.</p>
      <div class="upload-note">${icon('check')}Không dùng ffmpeg · Không chờ tải lên · Phát ngay lập tức</div>
    </div>
    <button class="primary-btn" data-action="pickFiles">${icon('upload')}Chọn tệp</button>
  </div>
  ${tracks.length
    ? trackTable(tracks, {
      contextType: 'library',
      contextId: 'uploads',
      contextLabel: 'Tệp của tôi'
    })
    : emptyState({
      icon: 'upload',
      title: 'Chưa có tệp nào',
      description: 'Chọn tệp từ máy hoặc dán liên kết YouTube, Spotify, SoundCloud, Suno… để thêm bài hát đầu tiên.',
      actions: `<button class="primary-btn" data-action="pickFiles">${icon('upload')}Chọn tệp từ máy</button><button class="ghost-btn" data-action="openAdd">${icon('link')}Dán liên kết</button>`
    })}`;
}

function renderLibraryLiked() {
  const tracks = store.likedTracks();
  if (!tracks.length) {
    return emptyState({
      icon: 'heart',
      title: 'Chưa thích bài nào',
      description: 'Nhấn vào trái tim cạnh bài hát để lưu nó vào bộ sưu tập yêu thích. Nơi này sẽ trở thành danh sách phát của riêng bạn.',
      actions: `<button class="primary-btn" data-action="shuffleAll">${icon('play')}Phát ngẫu nhiên</button>`
    });
  }
  return `<div class="search-result-head" style="margin-top:0">
    <h2>Những bài hát bạn đã thích</h2>
    <span>${tracks.length} bài · ${totalDurationLabel(sumDuration(tracks))}</span>
  </div>
  ${trackTable(tracks, {
    contextType: 'liked',
    contextId: 'liked',
    contextLabel: 'Bài hát đã thích'
  })}`;
}

function renderLibraryAll() {
  const tracks = [...store.allTracks()].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  if (!tracks.length) {
    return emptyState({
      icon: 'music',
      title: 'Thư viện trống',
      description: 'Thêm một liên kết hoặc tệp nhạc để bắt đầu.',
      actions: `<button class="primary-btn" data-action="openAdd">${icon('plus')}Thêm bài hát</button>`
    });
  }
  return `<div class="search-result-head" style="margin-top:0">
    <h2>Tất cả bài hát</h2>
    <span>${tracks.length} bài · ${totalDurationLabel(sumDuration(tracks))}</span>
  </div>
  ${trackTable(tracks, {
    contextType: 'library',
    contextId: 'all',
    contextLabel: 'Tất cả bài hát'
  })}`;
}

export function renderPlaylist(id) {
  const playlist = store.playlistById(id);
  if (!playlist) {
    return renderNotFound('Playlist này không còn tồn tại', 'Có thể nó đã bị xóa hoặc chưa được tạo. Hãy quay lại thư viện để chọn một bộ sưu tập khác.');
  }
  const tracks = store.playlistTracks(playlist);
  const covers = tracks.map(trackCover);
  const actions = `<button class="primary-btn" data-action="playPlaylist" data-id="${escapeAttr(playlist.id)}" ${tracks.length ? '' : 'disabled'}>${icon('play')}Phát</button>
    <button class="ghost-btn" data-action="shufflePlaylist" data-id="${escapeAttr(playlist.id)}" ${tracks.length ? '' : 'disabled'}>${icon('shuffle')}Xáo bài</button>
    <button class="icon-btn" data-action="playlistMenu" data-id="${escapeAttr(playlist.id)}" data-tooltip="Tùy chọn playlist" aria-label="Tùy chọn playlist">${icon('more')}</button>`;

  return `<div class="view playlist-view">
    ${playlistHero({
      kind: 'Playlist',
      title: playlist.name,
      description: playlist.description || 'Một bộ sưu tập chờ được lấp đầy bằng những bài hát bạn yêu.',
      tracks,
      colors: playlist.colors,
      meta: `<strong>${escapeHTML(store.state.settings.name || 'Nguyên')}</strong><span class="dot-sep"></span><span>${tracks.length ? pluralize(tracks.length, 'bài hát', 'bài hát') : 'Chưa có bài hát'}</span><span class="dot-sep"></span><span>Tạo ${relativeDate(playlist.createdAt)}</span>`,
      actions,
      cover: covers[0] || makeCover(playlist.name, 'Playlist', playlist.id),
      backCover: covers[1] || covers[0]
    })}

    <div class="playlist-toolbar">
      <div class="toolbar-left">${icon('disc')}${tracks.length ? `${pluralize(tracks.length, 'bài hát', 'bài hát')} · ${totalDurationLabel(sumDuration(tracks))}` : 'Bộ sưu tập đang chờ bài hát đầu tiên'}</div>
      <div class="toolbar-left">
        <button class="ghost-chip" data-action="openAdd" data-playlist-id="${escapeAttr(playlist.id)}">${icon('plus')}Thêm bài hát</button>
        <button class="ghost-chip" data-action="openQueue">${icon('queue')}Hàng đợi</button>
      </div>
    </div>

    ${tracks.length
      ? trackTable(tracks, {
        playlistId: playlist.id,
        contextType: 'playlist',
        contextId: playlist.id,
        contextLabel: playlist.name
      })
      : emptyState({
        icon: 'folder-plus',
        title: 'Playlist đang trống',
        description: 'Thêm những bài hát cùng một bầu không khí để bộ sưu tập này có linh hồn.',
        actions: `<button class="primary-btn" data-action="openAdd" data-playlist-id="${escapeAttr(playlist.id)}">${icon('plus')}Thêm bài hát</button><button class="ghost-btn" data-action="playlistMenu" data-id="${escapeAttr(playlist.id)}">${icon('more')}Tùy chọn</button>`
      })}

    ${renderSuggestedForPlaylist(playlist)}
  </div>`;
}

function renderSuggestedForPlaylist(playlist) {
  const tracks = store.topTracks(10).filter((track) => !playlist.trackIds.includes(track.id)).slice(0, 5);
  if (!tracks.length) return '';
  return `<section class="content-section">
    <div class="section-head">
      <div class="section-head-copy">
        <span class="section-kicker">${icon('sparkles')}Gợi ý</span>
        <h2 class="section-title">Thêm vào bầu không khí này</h2>
      </div>
    </div>
    <div class="media-grid">${tracks.map(trackCard).join('')}</div>
  </section>`;
}

export function renderLiked() {
  const tracks = store.likedTracks();
  const cover = tracks[0] ? trackCover(tracks[0]) : makeCover('Bài hát đã thích', 'SONORA', 'liked');
  const back = tracks[1] ? trackCover(tracks[1]) : cover;
  const actions = `<button class="primary-btn" data-action="playLiked" ${tracks.length ? '' : 'disabled'}>${icon('play')}Phát tất cả</button>
    <button class="ghost-btn" data-action="shuffleLiked" ${tracks.length ? '' : 'disabled'}>${icon('shuffle')}Xáo bài</button>`;

  return `<div class="view liked-view">
    ${playlistHero({
      kind: 'Bộ sưu tập',
      title: 'Bài hát đã thích',
      description: 'Tất cả những gì bạn đã chạm vào trái tim. Một danh sách phát tự viết nên theo thời gian.',
      tracks,
      colors: ['#ff6b9a', '#9d7bff'],
      meta: `<strong>${escapeHTML(store.state.settings.name || 'Nguyên')}</strong><span class="dot-sep"></span><span>${pluralize(tracks.length, 'bài hát', 'bài hát')}</span>`,
      actions,
      cover,
      backCover: back,
      coverIcon: 'heart'
    })}
    ${tracks.length
      ? trackTable(tracks, {
        contextType: 'liked',
        contextId: 'liked',
        contextLabel: 'Bài hát đã thích'
      })
      : emptyState({
        icon: 'heart',
        title: 'Trái tim đang chờ',
        description: 'Thả tim những bài hát bạn yêu để xây dựng bộ sưu tập này.',
        actions: `<button class="primary-btn" data-action="shuffleAll">${icon('sparkles')}Khám phá nhạc</button>`
      })}
  </div>`;
}

export function renderNotFound(title = 'Không tìm thấy trang', description = 'Đường dẫn này không dẫn đến đâu trong vũ trụ SONORA.') {
  return `<div class="view">
    ${emptyState({
      icon: 'compass',
      title,
      description,
      actions: `<button class="primary-btn" data-action="goHome">${icon('home')}Về trang chủ</button>`
    })}
  </div>`;
}
