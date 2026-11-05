import { clamp, getSpotifyInfo, hashString, safeUrl } from './utils.js';
import * as spotify from './spotify.js';

let youtubeApiPromise = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-youtube-api]');
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      resolve(window.YT);
    };
    if (existing) {
      const check = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(check);
          resolve(window.YT);
        }
      }, 150);
      setTimeout(() => { clearInterval(check); if (!window.YT?.Player) reject(new Error('YouTube API timeout')); }, 12000);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.youtubeApi = 'true';
    script.onerror = () => reject(new Error('Không tải được YouTube API.'));
    document.head.appendChild(script);
    setTimeout(() => {
      if (!window.YT?.Player) reject(new Error('YouTube API timeout'));
    }, 15000);
  }).catch((error) => {
    youtubeApiPromise = null;
    try { document.querySelector('script[data-youtube-api]')?.remove(); } catch { /* noop */ }
    throw error;
  });
  return youtubeApiPromise;
}

function isSameOriginMedia(url = '') {
  if (url.startsWith('blob:')) return true;
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

export class MediaEngine {
  constructor({ audio, video, youtubeStage, embedStage }) {
    this.audio = audio;
    this.video = video;
    // A separate element is used for same-origin audio so that the real
    // analyser can be connected without muting remote, cross-origin MP3s.
    this.localAudio = document.createElement('audio');
    this.localAudio.preload = 'metadata';
    this.localAudio.setAttribute('aria-hidden', 'true');
    this.localAudio.style.display = 'none';
    document.body.appendChild(this.localAudio);
    this.youtubeStage = youtubeStage;
    this.embedStage = embedStage;
    this.mode = 'idle';
    this.track = null;
    this.currentAudio = audio;
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 0.72;
    this.duration = 0;
    this.ytPlayer = null;
    this.ytReady = false;
    this.ytVideoId = '';
    this.loadToken = 0;
    this.analyser = null;
    this.audioContext = null;
    this.localSource = null;
    this.realSpectrum = false;
    this.embedIframe = null;
    this.lastVolume = 0.72;
    this.spotifyFull = false;
    this.spotifyLoadedTrackId = '';
    this.spotifyBase = 0;
    this.spotifyAt = 0;
    this.spotifyPaused = true;
    this.spotifyNearEnd = false;
    this.spotifyEnded = false;
    this.spotifyLastEndPoll = 0;
    this.spotifyState = null;
    this.preferSpotifyFull = true;
    this.isBuffering = false;
    this.ytState = -1;
    this.ytIntentPlaying = false;
    this.ytLastPoll = 0;
    this.ytBufferSince = 0;
    this.ytSoftRecoveryAt = 0;
    this.youtubeQuality = 'auto';
    this.onBuffering = () => {};
    this.onYoutubeRecovery = () => {};
    this.onSpotifyFallback = () => {};
    this.onTime = () => {};
    this.onDuration = () => {};
    this.onPlay = () => {};
    this.onPause = () => {};
    this.onEnded = () => {};
    this.onError = () => {};
    this.onMode = () => {};
    this.onYtReady = () => {};
    this.onEmbedReady = () => {};
    this.setupAudioElement();
    this.setupVideoElement();
    this.unsubscribeSpotify = spotify.onPlaybackState((state) => this.handleSpotifyState(state));
  }

  setupAudioElement() {
    for (const el of [this.audio, this.localAudio]) {
      el.volume = this.volume;
      el.preload = 'metadata';
      for (const evt of ['timeupdate', 'playing', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'error']) {
        el.addEventListener(evt, (event) => this.handleMediaEvent(event, 'audio'));
      }
    }
  }

  setupVideoElement() {
    this.video.volume = this.volume;
    this.video.preload = 'metadata';
    this.video.playsInline = true;
    for (const evt of ['timeupdate', 'playing', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'error']) {
      this.video.addEventListener(evt, (event) => this.handleMediaEvent(event, 'video'));
    }
  }

  handleMediaEvent(event, kind) {
    if (this.mode !== kind) return;
    if (event.currentTarget !== this.activeElement()) return;
    switch (event.type) {
      case 'playing':
        this.isPlaying = true;
        this.onPlay();
        break;
      case 'pause':
        this.isPlaying = false;
        this.onPause();
        break;
      case 'ended':
        this.isPlaying = false;
        this.onEnded();
        break;
      case 'timeupdate':
        this.onTime(this.activeElement()?.currentTime || 0);
        break;
      case 'loadedmetadata':
      case 'durationchange': {
        const el = this.activeElement();
        const duration = Number(el?.duration);
        if (Number.isFinite(duration) && duration > 0) {
          this.duration = duration;
          this.onDuration(duration);
        }
        break;
      }
      case 'error': {
        const message = this.mode === 'audio'
          ? 'Không thể phát tệp âm thanh này. Kiểm tra liên kết hoặc CORS.'
          : 'Không thể phát tệp video này.';
        this.onError(new Error(message));
        break;
      }
    }
  }

  activeElement() {
    if (this.mode === 'video') return this.video;
    if (this.mode === 'audio') return this.currentAudio;
    return null;
  }

  get audioContextInstance() {
    if (!this.audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.audioContext = new Ctx();
    }
    return this.audioContext;
  }

  ensureAnalyser() {
    if (this.analyser) return;
    const ctx = this.audioContextInstance;
    if (!ctx) return;
    try {
      if (!this.localSource) {
        this.localSource = this.localAudio;
        this.sourceNode = ctx.createMediaElementSource(this.localAudio);
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.82;
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(ctx.destination);
      }
    } catch (error) {
      console.warn('Analyser unavailable', error);
      this.analyser = null;
    }
  }

  async resumeContext() {
    const ctx = this.audioContext || this.audioContextInstance;
    if (ctx?.state === 'suspended') {
      try { await ctx.resume(); } catch { /* noop */ }
    }
  }

  clearYoutube() {
    if (this.ytPlayer?.destroy) {
      try { this.ytPlayer.destroy(); } catch { /* noop */ }
    }
    this.ytPlayer = null;
    this.ytReady = false;
    this.ytVideoId = '';
    if (this.youtubeStage) this.youtubeStage.innerHTML = '';
  }

  clearEmbed() {
    if (this.embedStage) {
      this.embedStage.innerHTML = '';
      this.embedStage.hidden = true;
      this.embedStage.classList.remove('has-embed');
    }
    this.embedIframe = null;
  }

  suspendYoutube({ stop = false } = {}) {
    try {
      if (stop) this.ytPlayer?.stopVideo?.();
      else this.ytPlayer?.pauseVideo?.();
    } catch { /* noop */ }
    this.ytIntentPlaying = false;
    this.ytState = -1;
    this.setBuffering(false);
    if (this.mode === 'youtube') this.isPlaying = false;
  }

  setBuffering(value) {
    const next = Boolean(value);
    if (this.isBuffering === next) return;
    this.isBuffering = next;
    this.ytBufferSince = next ? performance.now() : 0;
    this.onBuffering(next);
  }

  handleYoutubeState(state) {
    if (typeof state !== 'number' || state === this.ytState) return;
    const previous = this.ytState;
    this.ytState = state;
    if (state === 1) {
      this.ytIntentPlaying = true;
      this.isPlaying = true;
      this.setBuffering(false);
      const duration = Number(this.ytPlayer?.getDuration?.()) || 0;
      if (duration > 0) {
        this.duration = duration;
        this.onDuration(duration);
      }
      this.onPlay();
    } else if (state === 3) {
      if (this.ytIntentPlaying || previous === 1) this.isPlaying = true;
      this.setBuffering(true);
    } else if (state === 2) {
      this.ytIntentPlaying = false;
      this.isPlaying = false;
      this.setBuffering(false);
      this.onPause();
    } else if (state === 0) {
      const wasPlaying = this.isPlaying || this.ytIntentPlaying;
      this.ytIntentPlaying = false;
      this.isPlaying = false;
      this.setBuffering(false);
      this.onPause();
      if (wasPlaying) this.onEnded();
    } else if (state === 5) {
      this.ytIntentPlaying = false;
      this.isPlaying = false;
      this.setBuffering(false);
      this.onPause();
    }
  }

  pollYoutubeState(now = performance.now()) {
    if (this.mode !== 'youtube' || !this.ytReady || !this.ytPlayer?.getPlayerState) return;
    if (now - this.ytLastPoll < 550) return;
    this.ytLastPoll = now;
    let state = -1;
    try { state = Number(this.ytPlayer.getPlayerState()); } catch { return; }
    if (Number.isFinite(state) && state !== this.ytState) this.handleYoutubeState(state);
    if (state === 3) {
      if (!this.ytBufferSince) this.ytBufferSince = now;
      const stalledFor = now - this.ytBufferSince;
      if (stalledFor > 14_000 && now - this.ytSoftRecoveryAt > 14_000) {
        this.ytSoftRecoveryAt = now;
        this.onYoutubeRecovery('soft');
        try { this.ytPlayer.playVideo(); } catch { /* noop */ }
      }
    }
  }

  pollSpotifyProgress(now = performance.now()) {
    if (this.mode !== 'spotify' || !this.spotifyFull || !this.isPlaying || this.spotifyEnded) return;
    if (now - this.spotifyLastEndPoll < 450) return;
    this.spotifyLastEndPoll = now;
    const duration = Number(spotify.getDuration?.()) || 0;
    if (duration <= 0) return;
    const position = Number(spotify.getPosition?.()) || 0;
    if (position >= duration - 360) {
      this.spotifyEnded = true;
      this.isPlaying = false;
      this.spotifyPaused = true;
      this.onPause();
      this.onEnded();
    }
  }

  handleSpotifyState(state) {
    if (!this.spotifyFull || this.mode !== 'spotify') return;
    if (!state) {
      this.isPlaying = false;
      this.spotifyPaused = true;
      this.setBuffering(false);
      this.onPause();
      return;
    }
    const previousPaused = this.spotifyPaused;
    const previousNearEnd = this.spotifyNearEnd;
    const previousPosition = this.getTime() * 1000;
    const nextDuration = (Number(state.duration) || 0) / 1000;
    this.spotifyState = state;
    this.spotifyBase = Number(state.position) || 0;
    this.spotifyAt = performance.now();
    this.spotifyPaused = Boolean(state.paused);
    this.duration = (Number(state.duration) || 0) / 1000;
    if (this.duration > 0) this.onDuration(this.duration);
    this.spotifyNearEnd = this.duration > 0 && (this.spotifyBase / 1000) >= this.duration - 3;
    this.isPlaying = !this.spotifyPaused;
    this.setBuffering(false);
    this.onTime(this.getTime());
    if (this.isPlaying) {
      if (previousPaused) this.onPlay();
    } else {
      if (!previousPaused) this.onPause();
      const endedAtZero = !previousPaused && this.spotifyBase < 1200
        && nextDuration > 0 && previousPosition >= nextDuration * 1000 - 4000;
      if ((previousNearEnd && this.spotifyBase < 1200) || endedAtZero) {
        this.spotifyNearEnd = false;
        if (!this.spotifyEnded) {
          this.spotifyEnded = true;
          this.onEnded();
        }
      }
    }
  }

  setYoutubeQuality(quality = 'auto') {
    this.youtubeQuality = ['auto', 'hd720', 'large', 'medium'].includes(quality) ? quality : 'auto';
    this.applyYoutubeQuality();
  }

  applyYoutubeQuality() {
    if (!this.ytPlayer?.setPlaybackQuality) return;
    const map = { auto: 'default', hd720: 'hd720', large: 'large', medium: 'medium' };
    try { this.ytPlayer.setPlaybackQuality(map[this.youtubeQuality] || 'default'); } catch { /* noop */ }
  }

  async loadSpotify(track, autoplay, token) {
    const status = spotify.getStatus();
    const canUseFull = this.preferSpotifyFull && status.connected && status.premium;
    if (canUseFull) {
      this.mode = 'spotify';
      this.spotifyFull = true;
      this.spotifyLoadedTrackId = '';
      this.spotifyBase = 0;
      this.spotifyAt = performance.now();
      this.spotifyPaused = !autoplay;
      this.onMode('spotify');
      this.onDuration(Number(track.duration) || 0);
      this.onTime(0);
      if (!autoplay) {
        this.isPlaying = false;
        this.onPause();
        return true;
      }
      this.setBuffering(true);
      try {
        await spotify.playTrack(track);
        if (token !== this.loadToken) return true;
        this.spotifyLoadedTrackId = track.id;
        this.spotifyPaused = false;
        this.spotifyEnded = false;
        this.isPlaying = true;
        this.setBuffering(false);
        this.onPlay();
      } catch (error) {
        if (token !== this.loadToken) return true;
        this.spotifyFull = false;
        this.setBuffering(false);
        this.onSpotifyFallback(error);
        this.mode = 'embed';
        this.onMode('embed');
        this.mountEmbed(track, { autoplay: true });
      }
      return true;
    }
    // Without an active Premium player, the official embed is still the best
    // chance at full playback for a logged-in Spotify listener.
    this.spotifyFull = false;
    this.mode = 'embed';
    this.onMode('embed');
    this.mountEmbed(track, { autoplay });
    return true;
  }

  stop({ keepStage = false } = {}) {
    this.loadToken++;
    if (this.mode === 'spotify' && this.spotifyFull) spotify.pause().catch(() => {});
    this.spotifyFull = false;
    this.spotifyLoadedTrackId = '';
    this.spotifyPaused = true;
    this.setBuffering(false);
    this.audio.pause();
    this.localAudio.pause();
    this.video.pause();
    // Keep the video source in the DOM: removing it would also stop a video
    // that is currently fading between the mini view and cinema view.
    try {
      this.audio.removeAttribute('src');
      this.audio.load();
      this.localAudio.removeAttribute('src');
      this.localAudio.load();
    } catch { /* noop */ }
    this.video.pause();
    if (this.ytPlayer?.stopVideo) {
      try { this.ytPlayer.stopVideo(); } catch { /* noop */ }
    }
    this.clearEmbed();
    if (!keepStage) this.clearYoutube();
    this.mode = 'idle';
    this.isPlaying = false;
    this.duration = 0;
    this.realSpectrum = false;
    this.onMode('idle');
  }

  async load(track, { autoplay = true } = {}) {
    const token = ++this.loadToken;
    this.audio.pause();
    this.localAudio.pause();
    this.video.pause();
    if (this.mode === 'spotify' && this.spotifyFull) {
      spotify.pause().catch(() => {});
    }
    this.clearEmbed();
    this.isPlaying = false;
    this.spotifyFull = false;
    this.spotifyLoadedTrackId = '';
    this.spotifyPaused = true;
    this.spotifyNearEnd = false;
    this.spotifyEnded = false;
    this.spotifyLastEndPoll = 0;
    this.setBuffering(false);

    if (!track) {
      this.stop();
      return false;
    }

    let playbackTrack = track;
    if (track.source === 'spotify' && track.type !== 'spotify') {
      const info = getSpotifyInfo(track.url || '');
      if (info) {
        playbackTrack = {
          ...track,
          type: 'spotify',
          spotifyId: track.spotifyId || info.id,
          spotifyType: track.spotifyType || info.type,
          previewUrl: track.previewUrl || (track.type === 'audio' ? track.src : '')
        };
      }
    }
    this.track = playbackTrack;
    this.duration = Number(playbackTrack.duration) || 0;
    this.onDuration(this.duration);
    this.onTime(0);

    if (playbackTrack.type === 'youtube') {
      this.suspendYoutube({ stop: false });
      this.mode = 'youtube';
      this.onMode('youtube');
      await this.loadYoutube(playbackTrack, autoplay, token);
      return true;
    }

    if (playbackTrack.type === 'spotify') {
      this.mode = 'spotify';
      this.ytIntentPlaying = false;
      this.suspendYoutube({ stop: true });
      await this.loadSpotify(playbackTrack, autoplay, token);
      return true;
    }

    if (playbackTrack.type === 'embed') {
      this.mode = 'embed';
      this.suspendYoutube({ stop: true });
      this.onMode('embed');
      this.mountEmbed(playbackTrack, { autoplay });
      return true;
    }

    if (playbackTrack.type === 'audio' || playbackTrack.type === 'video') {
      this.mode = playbackTrack.type;
      this.suspendYoutube({ stop: true });
      this.onMode(playbackTrack.type);
      await this.loadDirect(playbackTrack, autoplay, token);
      return true;
    }

    this.mode = 'external';
    this.suspendYoutube({ stop: true });
    this.onMode('external');
    return false;
  }

  async loadDirect(track, autoplay, token) {
    const sameOrigin = isSameOriginMedia(track.src || track.directUrl || '');
    const el = track.type === 'video' ? this.video : (sameOrigin ? this.localAudio : this.audio);
    if (track.type === 'audio') this.currentAudio = el;
    const src = safeUrl(track.src || track.directUrl || '');
    if (!src) {
      this.onError(new Error('Liên kết phát không hợp lệ.'));
      return;
    }
    el.src = src;
    el.volume = this.isMuted ? 0 : this.volume;
    el.playbackRate = this.playbackRate || 1;
    this.realSpectrum = track.type === 'audio' && sameOrigin;
    if (this.realSpectrum) {
      this.ensureAnalyser();
    } else {
      this.realSpectrum = false;
    }
    try { el.load(); } catch { /* noop */ }
    el.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        this.duration = el.duration;
        this.onDuration(this.duration);
      }
    }, { once: true });
    if (autoplay) {
      await this.resumeContext();
      try {
        await el.play();
        if (token !== this.loadToken) return;
      } catch (error) {
        // Autoplay can be blocked even when a click initiated the change.
        // The UI simply stays paused; another press of play retries.
        if (error?.name !== 'AbortError' && error?.name !== 'NotAllowedError') {
          this.onError(error);
        }
      }
    }
  }

  mountEmbed(track, { autoplay = true } = {}) {
    if (!this.embedStage) return;
    const src = safeUrl(track.embedUrl || track.src || '');
    if (!src) {
      this.onError(new Error('Liên kết nhúng không hợp lệ.'));
      return;
    }
    this.embedStage.hidden = false;
    this.embedStage.classList.add('has-embed');
    this.embedStage.innerHTML = `<div class="embed-frame-shell">
      <div class="embed-frame-top">
        <span class="embed-live-dot"></span>
        <span>Trình phát chính thức · ${track.source === 'soundcloud' ? 'SoundCloud' : track.source === 'suno' ? 'Suno' : track.source === 'spotify' ? 'Spotify' : 'Web'}</span>
        <a href="${safeUrl(track.url || track.embedUrl)}" target="_blank" rel="noopener noreferrer">Mở tab mới</a>
      </div>
      <iframe
        src="${src}"
        title="${(track.title || 'Nhạc nhúng').replaceAll('"', '&quot;')}"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        referrerpolicy="strict-origin-when-cross-origin"
        loading="eager"
        allowfullscreen></iframe>
      <div class="embed-frame-hint">Một số nền tảng yêu cầu nhấn play trong khung chính thức. Bạn vẫn có thể xem lời, lưu bài và quản lý hàng đợi tại đây.</div>
    </div>`;
    this.embedIframe = this.embedStage.querySelector('iframe');
    // Embedded platforms own their transport controls and do not expose a
    // reliable "playing" event without their private SDK. Start in a paused
    // state so the app never claims an embed is already playing.
    this.isPlaying = false;
    this.onPause();
    this.onEmbedReady(track);
  }

  async loadYoutube(track, autoplay, token) {
    const videoId = track.videoId || track.id;
    try {
      await loadYouTubeApi();
    } catch (error) {
      this.onError(error);
      return;
    }
    if (token !== this.loadToken) return;
    if (!this.youtubeStage) return;
    if (this.ytPlayer?.loadVideoById) {
      try {
        this.ytVideoId = videoId;
        this.ytPlayer.setVolume(Math.round((this.isMuted ? 0 : this.volume) * 100));
        this.applyYoutubeQuality();
        this.ytState = -1;
        this.ytIntentPlaying = Boolean(autoplay);
        if (autoplay) {
          this.setBuffering(true);
          this.ytPlayer.loadVideoById(videoId);
        } else {
          this.setBuffering(false);
          this.ytPlayer.cueVideoById(videoId);
        }
        this.onYtReady({ target: this.ytPlayer });
        return;
      } catch {
        this.ytState = -1;
      }
    }
    if (this.ytPlayer?.destroy) {
      try { this.ytPlayer.destroy(); } catch { /* noop */ }
      this.ytPlayer = null;
    }
    this.youtubeStage.innerHTML = '';
    this.ytReady = false;
    this.ytVideoId = videoId;
    const vars = {
      autoplay: autoplay ? 1 : 0,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      iv_load_policy: 3,
      origin: location.origin
    };
    this.ytPlayer = new window.YT.Player(this.youtubeStage, {
      videoId,
      playerVars: vars,
      events: {
        onReady: (event) => {
          this.ytReady = true;
          this.ytState = -1;
          this.ytPlayer.setVolume(Math.round((this.isMuted ? 0 : this.volume) * 100));
          this.applyYoutubeQuality();
          this.onYtReady(event);
          const dur = this.ytPlayer.getDuration?.() || 0;
          if (dur > 0) {
            this.duration = dur;
            this.onDuration(dur);
          }
          if (autoplay) {
            this.ytIntentPlaying = true;
            this.setBuffering(true);
            try { this.ytPlayer.playVideo(); } catch { /* noop */ }
          } else {
            this.ytIntentPlaying = false;
            this.setBuffering(false);
          }
        },
        onStateChange: (event) => {
          this.handleYoutubeState(Number(event.data));
        },
        onError: (event) => {
          const messages = {
            2: 'Video ID không hợp lệ.',
            5: 'Trình duyệt không phát được video này.',
            100: 'Video không tồn tại hoặc đã bị gỡ.',
            101: 'Chủ video không cho phép nhúng.',
            150: 'Chủ video không cho phép nhúng.'
          };
          this.onError(new Error(messages[event.data] || 'YouTube không thể phát video này.'));
        }
      }
    });
  }

  async play() {
    if (this.mode === 'embed' || this.mode === 'external') return false;
    if (this.mode === 'spotify' && this.spotifyFull) {
      try {
        if (!this.spotifyLoadedTrackId || this.spotifyLoadedTrackId !== this.track?.id) {
          this.setBuffering(true);
          await spotify.playTrack(this.track);
          this.spotifyLoadedTrackId = this.track?.id || '';
          this.setBuffering(false);
        } else {
          await spotify.resume();
        }
        this.spotifyPaused = false;
        this.spotifyEnded = false;
        this.isPlaying = true;
        this.onPlay();
        return true;
      } catch (error) {
        this.spotifyFull = false;
        this.setBuffering(false);
        this.onSpotifyFallback(error);
        this.mode = 'embed';
        this.onMode('embed');
        this.mountEmbed(this.track, { autoplay: true });
        return true;
      }
    }
    if (this.mode === 'youtube') {
      if (!this.ytPlayer?.playVideo) return false;
      try {
        this.ytIntentPlaying = true;
        this.setBuffering(true);
        this.ytPlayer.playVideo();
        this.isPlaying = true;
        this.onPlay();
        return true;
      } catch {
        return false;
      }
    }
    await this.resumeContext();
    const el = this.activeElement();
    if (!el) return false;
    try {
      await el.play();
      return true;
    } catch (error) {
      if (error?.name !== 'NotAllowedError') this.onError(error);
      return false;
    }
  }

  pause() {
    if (this.mode === 'spotify' && this.spotifyFull) {
      spotify.pause().catch(() => {});
      this.spotifyPaused = true;
      this.isPlaying = false;
      this.onPause();
      return true;
    }
    if (this.mode === 'youtube') {
      try { this.ytPlayer?.pauseVideo?.(); } catch { /* noop */ }
      this.ytIntentPlaying = false;
      this.setBuffering(false);
      this.isPlaying = false;
      this.onPause();
      return true;
    }
    if (this.mode === 'embed' || this.mode === 'external') return false;
    this.activeElement()?.pause();
    return true;
  }

  async toggle() {
    if (this.isPlaying) return this.pause();
    return this.play();
  }

  seek(time) {
    const target = Math.max(0, Math.min(Number(time) || 0, this.duration || Number.MAX_SAFE_INTEGER));
    if (this.mode === 'youtube') {
      try {
        this.ytPlayer?.seekTo?.(target, true);
        this.onTime(target);
      } catch { /* noop */ }
      return;
    }
    if (this.mode === 'spotify' && this.spotifyFull) {
      spotify.seek(target * 1000).catch(() => {});
      this.spotifyBase = target * 1000;
      this.spotifyAt = performance.now();
      this.spotifyEnded = false;
      this.spotifyNearEnd = false;
      this.onTime(target);
      return;
    }
    if (this.mode === 'embed' || this.mode === 'external') return;
    const el = this.activeElement();
    if (el && Number.isFinite(el.duration)) {
      el.currentTime = Math.min(target, el.duration);
      this.onTime(el.currentTime);
    }
  }

  getTime() {
    if (this.mode === 'youtube') {
      try { return Number(this.ytPlayer?.getCurrentTime?.()) || 0; } catch { return 0; }
    }
    if (this.mode === 'spotify' && this.spotifyFull) {
      return Math.max(0, Number(spotify.getPosition?.()) || 0) / 1000;
    }
    if (this.mode === 'embed' || this.mode === 'external') return 0;
    return Number(this.activeElement()?.currentTime) || 0;
  }

  getDuration() {
    if (this.mode === 'youtube') {
      try {
        const d = Number(this.ytPlayer?.getDuration?.());
        if (Number.isFinite(d) && d > 0) this.duration = d;
      } catch { /* noop */ }
    } else if (this.mode === 'spotify' && this.spotifyFull) {
      const d = Number(spotify.getDuration?.()) / 1000;
      if (Number.isFinite(d) && d > 0) this.duration = d;
    } else if (this.mode === 'audio' || this.mode === 'video') {
      const d = Number(this.activeElement()?.duration);
      if (Number.isFinite(d) && d > 0) this.duration = d;
    }
    return this.duration || Number(this.track?.duration) || 0;
  }

  setVolume(value, { silent = false } = {}) {
    const vol = clamp(Number(value) || 0, 0, 1);
    this.volume = vol;
    if (vol > 0) this.lastVolume = vol;
    this.audio.volume = this.isMuted ? 0 : vol;
    this.localAudio.volume = this.isMuted ? 0 : vol;
    this.video.volume = this.isMuted ? 0 : vol;
    if (this.ytReady) {
      try { this.ytPlayer?.setVolume?.(Math.round((this.isMuted ? 0 : vol) * 100)); } catch { /* noop */ }
    }
    if (this.mode === 'spotify' && this.spotifyFull) {
      spotify.setVolume(this.isMuted ? 0 : vol).catch(() => {});
    }
    if (!silent) this.onVolume?.(vol, this.isMuted);
    return vol;
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    this.setVolume(this.volume, { silent: true });
    this.onMuted?.(this.isMuted);
  }

  setRate(rate = 1) {
    this.playbackRate = clamp(Number(rate) || 1, 0.5, 2);
    try { this.audio.playbackRate = this.playbackRate; } catch { /* noop */ }
    try { this.localAudio.playbackRate = this.playbackRate; } catch { /* noop */ }
    try { this.video.playbackRate = this.playbackRate; } catch { /* noop */ }
    try { this.ytPlayer?.setPlaybackRate?.(this.playbackRate); } catch { /* noop */ }
  }

  fadeOut(seconds = 0.5) {
    if (this.mode === 'youtube') {
      const start = this.volume;
      const startAt = performance.now();
      const duration = seconds * 1000;
      const tick = () => {
        const p = clamp((performance.now() - startAt) / duration, 0, 1);
        this.setVolume(start * (1 - p));
        if (p < 1) requestAnimationFrame(tick);
        else {
          this.setVolume(start);
          this.pause();
        }
      };
      requestAnimationFrame(tick);
      return;
    }
    if (this.mode === 'audio' || this.mode === 'video') {
      const el = this.activeElement();
      if (!el) return;
      const start = el.volume;
      const startAt = performance.now();
      const duration = seconds * 1000;
      const tick = () => {
        const p = clamp((performance.now() - startAt) / duration, 0, 1);
        el.volume = start * (1 - p);
        if (p < 1) requestAnimationFrame(tick);
        else {
          this.pause();
          el.volume = this.isMuted ? 0 : this.volume;
        }
      };
      requestAnimationFrame(tick);
    }
  }

  getSpectrum(length = 56) {
    if (this.realSpectrum && this.analyser) {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      const out = new Float32Array(length);
      const usable = Math.floor(data.length * 0.72);
      for (let i = 0; i < length; i++) {
        const start = Math.floor((i / length) * usable);
        const end = Math.max(start + 1, Math.floor(((i + 1) / length) * usable));
        let sum = 0;
        for (let j = start; j < end; j++) sum += data[j];
        const normalized = (sum / (end - start)) / 255;
        const boost = 0.5 + (i / length) * 0.8;
        out[i] = clamp(Math.pow(normalized * boost, 0.75), 0, 1);
      }
      return out;
    }
    if (this.mode === 'embed' || this.mode === 'external') {
      return this.syntheticSpectrum(length, 0.22);
    }
    return this.syntheticSpectrum(length, this.isPlaying ? 0.7 : 0.1);
  }

  syntheticSpectrum(length, energy) {
    const out = new Float32Array(length);
    const seed = hashString(this.track?.id || this.track?.title || 'sonora');
    const t = (Number(this.getTime?.()) || 0) * 0.9 + seed % 1000;
    for (let i = 0; i < length; i++) {
      const x = i / length;
      const envelope = Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 1.4;
      const a = Math.sin(t * 1.7 + x * 14 + (seed % 17)) * 0.32;
      const b = Math.sin(t * 3.1 - x * 22 + (seed % 29)) * 0.18;
      const c = Math.sin(t * 0.6 + x * 7 + 1.4) * 0.22;
      out[i] = clamp((0.38 + a + b + c) * envelope * (energy * 1.2), 0.015, 1);
    }
    return out;
  }
}
