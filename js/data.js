/* SONORA — demo catalogue. All demo audio and artwork are original and local. */
export const DEMO_BASE = 'assets/';

export const DEMO_TRACKS = [
  {
    id: 'tr-neon-bloom',
    title: 'Neon Bloom',
    artist: 'Aster Vale',
    album: 'Neon Bloom',
    year: 2026,
    cover: 'assets/covers/neon-bloom.svg',
    src: 'assets/audio/neon-bloom.mp3',
    type: 'audio',
    source: 'studio',
    duration: 98,
    genre: 'Synthwave',
    tags: ['synthwave', 'night', 'drive', 'electronic'],
    colors: ['#ff5d8a', '#8b5cf6', '#ffbd6b'],
    description: 'Những vòng hoa neon nở ra giữa đường cao tốc lúc 2 giờ sáng.',
    featured: true,
    addedAt: 1763020800000,
    plays: 1248,
    lrc: `[00:08.40] Streetlights melt into the rain
[00:15.20] We are sparks inside a wire
[00:22.80] Every heartbeat draws a flame
[00:30.40] Every shadow climbing higher
[00:38.20] Neon bloom, open in the dark
[00:45.60] Petals made of afterglow
[00:53.10] Hold the night inside your heart
[01:00.40] Let the quiet overflow
[01:08.20] We don't need a map to run
[01:15.60] Chrome horizons pull us near
[01:23.10] One more mile into the sun
[01:30.20] One more song to disappear`
  },
  {
    id: 'tr-velvet-static',
    title: 'Velvet Static',
    artist: 'Lune',
    album: 'Soft Focus',
    year: 2026,
    cover: 'assets/covers/velvet-static.svg',
    src: 'assets/audio/velvet-static.mp3',
    type: 'audio',
    source: 'studio',
    duration: 101,
    genre: 'Lo-fi',
    tags: ['lofi', 'chill', 'study', 'warm'],
    colors: ['#ef9a87', '#9d5169', '#f0cfb3'],
    description: 'Một cuốn băng cũ, tiếng mưa và vòng quay chậm của buổi chiều.',
    addedAt: 1762934400000,
    plays: 2084,
    lrc: `[00:12.00] Soft focus on the avenue
[00:20.40] Rain is writing on the glass
[00:29.00] Every little shade of blue
[00:37.60] Finds a way to make it last
[00:46.20] Velvet static in the room
[00:55.00] Dust is dancing in the light
[01:03.60] Hum a quiet little tune
[01:12.20] Keep the evening soft and bright
[01:21.00] Nothing here needs to be solved
[01:29.80] Let the record turn around`
  },
  {
    id: 'tr-afterglow',
    title: 'Afterglow',
    artist: 'Mira Sol',
    album: 'Night Tapes 002',
    year: 2025,
    cover: 'assets/covers/afterglow.svg',
    src: 'assets/audio/afterglow.mp3',
    type: 'audio',
    source: 'studio',
    duration: 109,
    genre: 'Ambient',
    tags: ['ambient', 'focus', 'sleep', 'calm', 'cinematic'],
    colors: ['#e49b83', '#7f70d0', '#385f8d'],
    description: 'Mặt trời đi xuống rất chậm. Mọi thứ còn lại là ánh sáng.',
    addedAt: 1762761600000,
    plays: 1720,
    lrc: `[00:18.00] Leave the window open wide
[00:28.00] Let the evening breathe inside
[00:38.00] Every color says goodbye
[00:48.00] Slowly, softly, side by side
[00:58.00] Afterglow, stay a little longer
[01:08.00] Hold the sky before it turns
[01:18.00] Afterglow, quieter than wonder
[01:28.00] Everything that glows returns`
  },
  {
    id: 'tr-paper-moon',
    title: 'Paper Moon',
    artist: 'Kai Ito',
    album: 'A Little Orbit for Two',
    year: 2026,
    cover: 'assets/covers/paper-moon.svg',
    src: 'assets/audio/paper-moon.mp3',
    type: 'audio',
    source: 'studio',
    duration: 96,
    genre: 'Dream pop',
    tags: ['dream', 'indie', 'love', 'soft'],
    colors: ['#e4c994', '#263454', '#bd4b42'],
    description: 'Một vầng trăng giấy treo trên cửa sổ, đủ sáng cho hai người.',
    addedAt: 1763193600000,
    plays: 986,
    lrc: `[00:10.20] We made a moon from folded paper
[00:19.40] Hung it over the kitchen door
[00:28.60] You said the real one came in later
[00:37.80] I said I liked our version more
[00:47.00] Paper moon, paper moon
[00:56.20] Keep the ceiling out of view
[01:05.40] Paper moon, stay until June
[01:14.60] Make the ordinary new
[01:23.40] Every shadow learns your shape
[01:31.20] Every morning comes too soon`
  },
  {
    id: 'tr-midnight-garden',
    title: 'Midnight Garden',
    artist: 'Nova Reyes',
    album: 'Grown After Dark',
    year: 2025,
    cover: 'assets/covers/midnight-garden.svg',
    src: 'assets/audio/midnight-garden.mp3',
    type: 'audio',
    source: 'studio',
    duration: 91,
    genre: 'Deep house',
    tags: ['house', 'dance', 'night', 'organic'],
    colors: ['#60d4b1', '#2d7774', '#d3ffc0'],
    description: 'Khu vườn chỉ nở sau nửa đêm, khi beat bắt đầu chạm vào lá.',
    addedAt: 1762675200000,
    plays: 1439,
    lrc: `[00:10.00] Roots are moving under the concrete
[00:18.00] Silver leaves are learning to breathe
[00:26.00] Every step becomes a heartbeat
[00:34.00] Every secret grows a seed
[00:42.00] Meet me where the garden glows
[00:50.00] We can lose the shape of time
[00:58.00] Nobody has to know
[01:06.00] Midnight garden, you and I
[01:16.00] Bloom, bloom, after dark`
  },
  {
    id: 'tr-cafe-at-3',
    title: 'Café 3AM',
    artist: 'The Paper Club',
    album: 'Rainy Window Tapes',
    year: 2026,
    cover: 'assets/covers/cafe-at-3.svg',
    src: 'assets/audio/cafe-at-3.mp3',
    type: 'audio',
    source: 'studio',
    duration: 98,
    genre: 'Jazzhop',
    tags: ['jazzhop', 'rain', 'vietnamese', 'late night', 'chill'],
    colors: ['#f1b66f', '#43627e', '#94b6c4'],
    description: 'Quán cà phê cuối phố, mưa gõ nhịp và một ly đang nguội dần.',
    addedAt: 1762848000000,
    plays: 2367,
    lrc: `[00:11.20] Ba giờ sáng, phố ngủ quên
[00:19.60] Ly cà phê còn thơm trên tay
[00:28.00] Ngọn đèn vàng nghiêng bên thềm
[00:36.40] Mưa kể chuyện bằng những ngón tay
[00:45.00] Ở lại thêm một bài nhạc nữa
[00:53.40] Cho thành phố chậm lại một giây
[01:01.80] Những điều chưa kịp nói thành lời
[01:10.20] Cứ để mưa mang đi hôm nay
[01:19.00] Ba giờ sáng, mình vẫn nơi đây
[01:27.80] Nghe thời gian tan trong ly đầy`
  }
];

export const INITIAL_PLAYLISTS = [
  {
    id: 'pl-late-night',
    name: 'Late Night Drive',
    description: 'Đèn đường, cửa kính hạ xuống và một con đường không có điểm dừng.',
    trackIds: ['tr-neon-bloom', 'tr-midnight-garden', 'tr-cafe-at-3', 'tr-velvet-static', 'tr-afterglow'],
    colors: ['#ff5d8a', '#6f55df'],
    createdAt: 1763020800000,
    pinned: true
  },
  {
    id: 'pl-deep-focus',
    name: 'Deep Focus',
    description: 'Không lời, không thông báo. Chỉ có bạn và những việc cần hoàn thành.',
    trackIds: ['tr-afterglow', 'tr-velvet-static', 'tr-paper-moon', 'tr-cafe-at-3'],
    colors: ['#4e9ab5', '#2f446e'],
    createdAt: 1762934400000,
    pinned: true
  },
  {
    id: 'pl-golden-hour',
    name: 'Golden Hour',
    description: 'Khung cửa sổ vàng, nắng rơi trên sàn và một cuốn sách chưa đọc xong.',
    trackIds: ['tr-paper-moon', 'tr-velvet-static', 'tr-afterglow', 'tr-neon-bloom'],
    colors: ['#e7b774', '#c16f5a'],
    createdAt: 1762761600000,
    pinned: true
  },
  {
    id: 'pl-rainy-window',
    name: 'Rainy Window',
    description: 'Tiếng mưa làm nhịp, hơi nước phủ mờ mọi thứ bên ngoài.',
    trackIds: ['tr-cafe-at-3', 'tr-velvet-static', 'tr-afterglow'],
    colors: ['#7aa6c8', '#35395d'],
    createdAt: 1762675200000,
    pinned: false
  },
  {
    id: 'pl-saigon-3am',
    name: 'Sài Gòn 3AM',
    description: 'Thành phố không ngủ, chỉ hạ giọng xuống một chút.',
    trackIds: ['tr-cafe-at-3', 'tr-midnight-garden', 'tr-neon-bloom'],
    colors: ['#f0b469', '#b2436b'],
    createdAt: 1763193600000,
    pinned: false
  },
  {
    id: 'pl-dream-sequence',
    name: 'Dream Sequence',
    description: 'Một giấc mơ mềm, có ánh bạc và những vì sao bằng giấy.',
    trackIds: ['tr-paper-moon', 'tr-afterglow', 'tr-neon-bloom'],
    colors: ['#b9a3ff', '#5058a8'],
    createdAt: 1762848000000,
    pinned: false
  }
];

export const PLAYLIST_COLORS = [
  ['#ff6b9a', '#8b5cf6'],
  ['#5ee8c1', '#2f7ea5'],
  ['#ffc06b', '#d95f4f'],
  ['#7b8cff', '#3c2f8c'],
  ['#f2eee8', '#8e86a0'],
  ['#ff9a62', '#c66cff']
];

export const INITIAL_LIKED = ['tr-neon-bloom', 'tr-paper-moon', 'tr-cafe-at-3', 'tr-afterglow'];

export const INITIAL_HISTORY = [
  'tr-cafe-at-3',
  'tr-neon-bloom',
  'tr-velvet-static',
  'tr-paper-moon',
  'tr-midnight-garden',
  'tr-afterglow'
];

export const MOODS = [
  {
    id: 'mood-focus',
    label: 'Tập trung',
    sub: 'Không lời · 48 phút',
    icon: 'focus',
    colors: ['#236b73', '#2d3f68'],
    query: 'focus'
  },
  {
    id: 'mood-night',
    label: 'Night Drive',
    sub: 'Synthwave · 1 giờ 12 phút',
    icon: 'car',
    colors: ['#a23060', '#472879'],
    query: 'drive'
  },
  {
    id: 'mood-rain',
    label: 'Mưa Sài Gòn',
    sub: 'Lo-fi · 36 phút',
    icon: 'rain',
    colors: ['#385373', '#212b46'],
    query: 'rain'
  },
  {
    id: 'mood-sunrise',
    label: 'Bình minh',
    sub: 'Ambient · 52 phút',
    icon: 'sun',
    colors: ['#be725e', '#7b4f82'],
    query: 'calm'
  }
];

export const DISCOVER_CARDS = [
  {
    id: 'disc-1',
    eyebrow: 'SONORA SESSIONS',
    title: 'Những bản thu ít người biết',
    description: 'Tuyển chọn ambient, jazzhop và dream pop từ những nghệ sĩ độc lập.',
    art: 'assets/covers/cafe-at-3.svg',
    action: { kind: 'playlist', id: 'pl-rainy-window' }
  },
  {
    id: 'disc-2',
    eyebrow: 'MIX YOUR MOOD',
    title: 'Một đêm không cần kết thúc',
    description: 'Bật chế độ điện ảnh, để màu sắc đi theo từng nốt nhạc.',
    art: 'assets/covers/neon-bloom.svg',
    action: { kind: 'playlist', id: 'pl-late-night' }
  }
];

export const SOURCE_META = {
  studio: { label: 'Sonora', short: 'STUDIO', icon: 'disc', color: '#f2cc8f' },
  youtube: { label: 'YouTube', short: 'YT', icon: 'play', color: '#ff4e4e' },
  'youtube-music': { label: 'YouTube Music', short: 'YTM', icon: 'play', color: '#ff5e57' },
  spotify: { label: 'Spotify', short: 'SP', icon: 'spotify', color: '#1ed760' },
  soundcloud: { label: 'SoundCloud', short: 'SC', icon: 'cloud', color: '#ff8b3d' },
  suno: { label: 'Suno', short: 'SUNO', icon: 'sparkles', color: '#cfb7ff' },
  bandcamp: { label: 'Bandcamp', short: 'BC', icon: 'wave', color: '#63c6d9' },
  audiomack: { label: 'Audiomack', short: 'AM', icon: 'wave', color: '#ffb648' },
  vimeo: { label: 'Vimeo', short: 'V', icon: 'video', color: '#55c7ff' },
  mp3: { label: 'MP3', short: 'MP3', icon: 'music', color: '#9be2c1' },
  mp4: { label: 'MP4', short: 'MP4', icon: 'video', color: '#b4b2ff' },
  local: { label: 'Tệp cục bộ', short: 'FILE', icon: 'upload', color: '#b9c2cf' },
  other: { label: 'Liên kết', short: 'URL', icon: 'link', color: '#a8a2b9' }
};

export const PLATFORM_GUIDE = [
  { id: 'youtube', label: 'YouTube', hint: 'youtube.com/watch · youtu.be' },
  { id: 'spotify', label: 'Spotify', hint: 'open.spotify.com/track/...' },
  { id: 'soundcloud', label: 'SoundCloud', hint: 'soundcloud.com/...' },
  { id: 'suno', label: 'Suno', hint: 'suno.com/song/...' },
  { id: 'file', label: 'Tệp nhạc', hint: '.mp3 · .m4a · .mp4 · .wav' }
];

export const KEYBOARD_SHORTCUTS = [
  ['Space', 'Phát / tạm dừng'],
  ['← / →', 'Tua lùi / tiến 5 giây'],
  ['Shift + ← / →', 'Tua lùi / tiến 30 giây'],
  ['M', 'Bật / tắt tiếng'],
  ['S', 'Bật / tắt xáo bài'],
  ['R', 'Đổi chế độ lặp'],
  ['L', 'Mở lời bài hát'],
  ['K', 'Mở Lyrics Live (karaoke)'],
  ['C', 'Mở chế độ điện ảnh'],
  ['N', 'Mở bảng thêm bài hát'],
  ['⌘ / Ctrl + K', 'Tìm kiếm nhanh'],
  ['?', 'Xem phím tắt']
];
