/* SONORA — optional Spotify Premium full-track playback.
   Uses OAuth PKCE and the Spotify Web Playback SDK. Tokens stay in this
   browser; the local server only relays the PKCE token exchange to avoid CORS. */

import { getSpotifyInfo } from './utils.js';

const CONFIG_KEY = 'sonora.spotify.config.v1';
const AUTH_KEY = 'sonora.spotify.auth.v1';
const PKCE_KEY = 'sonora.spotify.pkce.v1';
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing'
].join(' ');

const status = {
  configured: false,
  connected: false,
  premium: false,
  ready: false,
  name: '',
  product: '',
  deviceId: '',
  error: ''
};

let auth = loadAuth();
let profile = null;
let sdkPromise = null;
let player = null;
let playerPromise = null;
let playbackState = null;
let playbackStateAt = 0;
let statusListeners = new Set();
let stateListeners = new Set();
let volume = 0.72;

function loadConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveConfig(patch = {}) {
  const config = { ...loadConfig(), ...patch };
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch { /* noop */ }
  notifyStatus({ configured: Boolean(String(config.clientId || '').trim()) });
  return config;
}

function loadAuth() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveAuth(payload) {
  if (!payload || !payload.access_token) return;
  auth = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || auth?.refresh_token || '',
    token_type: payload.token_type || 'Bearer',
    scope: payload.scope || '',
    expires_at: Date.now() + Math.max(30, Number(payload.expires_in) || 3600) * 1000
  };
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch { /* noop */ }
  notifyStatus({ connected: true });
}

function clearAuth() {
  auth = null;
  profile = null;
  try { localStorage.removeItem(AUTH_KEY); } catch { /* noop */ }
  notifyStatus({ connected: false, premium: false, ready: false, name: '', product: '', error: '' });
}

function notifyStatus(patch = {}) {
  Object.assign(status, patch);
  status.configured = Boolean(getClientId());
  const snapshot = getStatus();
  statusListeners.forEach((listener) => {
    try { listener(snapshot); } catch { /* noop */ }
  });
}

export function getClientId() {
  return String(loadConfig().clientId || '').trim();
}

export function setClientId(clientId = '') {
  return saveConfig({ clientId: String(clientId || '').trim() });
}

export function getRedirectUri() {
  return `${location.origin}/`;
}

export function getStatus() {
  return { ...status, configured: Boolean(getClientId()) };
}

export function hasStoredAuth() {
  return Boolean(auth?.access_token || auth?.refresh_token);
}

export function onStatusChange(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function onPlaybackState(listener) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[byte % 62]).join('');
}

async function sha256base64Url(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function startAuth(clientId = '') {
  const id = String(clientId || '').trim();
  if (!id) throw new Error('Hãy nhập Spotify Client ID trước.');
  setClientId(id);
  const verifier = randomString(72);
  const challenge = await sha256base64Url(verifier);
  const stateToken = randomString(24);
  const redirectUri = getRedirectUri();
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({
    verifier,
    state: stateToken,
    redirectUri,
    createdAt: Date.now()
  }));
  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id', id);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('state', stateToken);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('show_dialog', 'true');
  location.assign(url.toString());
}

async function tokenRequest(payload) {
  const response = await fetch('/api/spotify/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Spotify không trả về token.');
  }
  return data;
}

export async function handleRedirect() {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return false;
  const stored = (() => {
    try { return JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null'); } catch { return null; }
  })();
  sessionStorage.removeItem(PKCE_KEY);

  // Remove Spotify's query parameters before the hash router sees them.
  const cleanUrl = `${location.pathname}${location.hash || '#/home'}`;
  history.replaceState(null, '', cleanUrl);

  if (params.has('error')) {
    throw new Error(params.get('error_description') || 'Bạn đã từ chối kết nối Spotify.');
  }
  if (!stored || params.get('state') !== stored.state) {
    throw new Error('Phiên kết nối Spotify không hợp lệ. Hãy thử lại.');
  }
  const clientId = getClientId();
  if (!clientId) throw new Error('Chưa lưu Spotify Client ID.');
  const payload = await tokenRequest({
    grant_type: 'authorization_code',
    code: params.get('code'),
    redirect_uri: stored.redirectUri,
    client_id: clientId,
    code_verifier: stored.verifier
  });
  saveAuth(payload);
  await refreshProfile().catch(() => {});
  return true;
}

async function refreshAccessToken() {
  if (!auth?.refresh_token) return null;
  const clientId = getClientId();
  if (!clientId) return null;
  const latest = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: auth.refresh_token,
    client_id: clientId
  });
  saveAuth({ ...latest, refresh_token: latest.refresh_token || auth.refresh_token });
  return auth.access_token;
}

export async function getAccessToken(force = false) {
  if (!auth) return null;
  if (!force && auth.access_token && Number(auth.expires_at) > Date.now() + 60_000) {
    return auth.access_token;
  }
  return refreshAccessToken();
}

async function spotifyApi(path, options = {}) {
  let token = await getAccessToken();
  if (!token) throw new Error('Chưa kết nối Spotify.');
  const request = async (accessToken) => fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`
    }
  });
  let response = await request(token);
  if (response.status === 401) {
    token = await getAccessToken(true);
    if (!token) throw new Error('Phiên Spotify đã hết hạn. Hãy kết nối lại.');
    response = await request(token);
  }
  return response;
}

async function spotifyJson(path, options = {}) {
  const response = await spotifyApi(path, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data?.error?.message || data?.error_description || `Spotify API lỗi ${response.status}.`;
    if (response.status === 403 && /premium/i.test(message)) {
      throw new Error('Spotify Web Playback yêu cầu tài khoản Premium.');
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

export async function refreshProfile() {
  if (!auth) {
    notifyStatus({ connected: false, premium: false, ready: false, name: '', product: '' });
    return null;
  }
  try {
    profile = await spotifyJson('/me');
    notifyStatus({
      connected: true,
      premium: profile?.product === 'premium',
      name: profile?.display_name || profile?.id || 'Spotify',
      product: profile?.product || '',
      error: ''
    });
    return profile;
  } catch (error) {
    notifyStatus({ connected: hasStoredAuth(), premium: false, error: error.message || 'Không tải được hồ sơ Spotify.' });
    throw error;
  }
}

function loadSdk() {
  if (window.Spotify?.Player) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    window.onSpotifyWebPlaybackSDKReady = () => finish(resolve, window.Spotify);
    const existing = document.querySelector('script[data-spotify-sdk]');
    if (existing) {
      const check = setInterval(() => {
        if (window.Spotify?.Player) {
          clearInterval(check);
          finish(resolve, window.Spotify);
        }
      }, 180);
      setTimeout(() => {
        clearInterval(check);
        if (!window.Spotify?.Player) finish(reject, new Error('Spotify Web Playback SDK không phản hồi.'));
      }, 15000);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.dataset.spotifySdk = 'true';
    script.onerror = () => finish(reject, new Error('Không tải được Spotify Web Playback SDK.'));
    document.head.appendChild(script);
    setTimeout(() => {
      if (!window.Spotify?.Player) finish(reject, new Error('Spotify Web Playback SDK quá thời gian chờ.'));
    }, 18000);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

export async function ensurePlayer() {
  if (player && status.ready) return player;
  if (playerPromise) return playerPromise;
  playerPromise = (async () => {
    if (!hasStoredAuth()) throw new Error('Chưa kết nối Spotify.');
    if (!status.product) await refreshProfile().catch(() => {});
    if (status.product && status.product !== 'premium') {
      throw new Error('Spotify Web Playback yêu cầu tài khoản Premium.');
    }
    await getAccessToken();
    await loadSdk();
    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Loa Spotify chưa sẵn sàng. Hãy thử kết nối lại.'));
      }, 18000);
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      player = new window.Spotify.Player({
        name: 'SONORA · Personal Universe',
        getOAuthToken: async (callback) => {
          try {
            const token = await getAccessToken();
            if (token) callback(token);
            else finish(new Error('Phiên Spotify đã hết hạn.'));
          } catch (error) {
            finish(error);
          }
        },
        volume
      });
      player.addListener('ready', ({ device_id: deviceId }) => {
        notifyStatus({ ready: true, deviceId, error: '' });
        finish();
      });
      player.addListener('not_ready', ({ device_id: deviceId }) => {
        notifyStatus({ ready: false, deviceId: deviceId || status.deviceId });
      });
      player.addListener('player_state_changed', (state) => {
        playbackState = state || null;
        playbackStateAt = Date.now();
        stateListeners.forEach((listener) => {
          try { listener(playbackState); } catch { /* noop */ }
        });
      });
      player.addListener('initialization_error', ({ message }) => {
        notifyStatus({ ready: false, error: message || 'Không khởi tạo được Spotify player.' });
        finish(new Error(message || 'Không khởi tạo được Spotify player.'));
      });
      player.addListener('authentication_error', ({ message }) => {
        notifyStatus({ ready: false, error: 'Spotify cần xác thực lại.' });
        finish(new Error(message || 'Spotify cần xác thực lại.'));
      });
      player.addListener('account_error', ({ message }) => {
        notifyStatus({ ready: false, error: 'Tài khoản Spotify này cần Premium để phát đầy đủ.' });
        finish(new Error(message || 'Tài khoản Spotify này cần Premium để phát đầy đủ.'));
      });
      player.addListener('playback_error', ({ message }) => {
        notifyStatus({ error: message || 'Spotify playback gặp lỗi.' });
      });
      player.addListener('autoplay_failed', () => {
        notifyStatus({ error: 'Trình duyệt chặn tự động phát Spotify. Hãy bấm phát lại.' });
      });
      player.connect().catch((error) => finish(error));
    });
    return player;
  })().catch((error) => {
    playerPromise = null;
    throw error;
  });
  return playerPromise;
}

function spotifyUri(track) {
  if (!track) return '';
  let id = String(track.spotifyId || '').trim();
  let type = String(track.spotifyType || '').trim();
  if (!id || !type) {
    const info = getSpotifyInfo(track.url || '');
    if (info) {
      id = info.id;
      type = info.type;
    }
  }
  if (!id || !type) return '';
  return `spotify:${type}:${id}`;
}

async function transferToDevice() {
  if (!status.deviceId) return;
  try {
    await spotifyApi('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [status.deviceId], play: false })
    });
  } catch { /* The play request will try to select the device anyway. */ }
}

export async function playTrack(track) {
  const uri = spotifyUri(track);
  if (!uri) throw new Error('Không tìm thấy Spotify ID cho bài hát này.');
  const activePlayer = await ensurePlayer();
  if (!activePlayer) throw new Error('Spotify player chưa sẵn sàng.');
  try { await activePlayer.activateElement?.(); } catch { /* noop */ }
  await transferToDevice();
  const type = track.spotifyType || uri.split(':')[1];
  const body = ['track', 'episode'].includes(type)
    ? { uris: [uri], position_ms: 0 }
    : { context_uri: uri };
  const response = await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(status.deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data?.error?.message || `Spotify không thể phát bài này (${response.status}).`;
    if (response.status === 403 && /premium/i.test(message)) {
      throw new Error('Spotify Web Playback yêu cầu tài khoản Premium.');
    }
    throw new Error(message);
  }
  return true;
}

export async function resume() {
  if (!player) throw new Error('Spotify player chưa sẵn sàng.');
  await player.resume();
  return true;
}

export async function pause() {
  if (!player) return false;
  await player.pause();
  return true;
}

export async function seek(positionMs = 0) {
  if (!player) return false;
  const target = Math.max(0, Number(positionMs) || 0);
  await player.seek(target);
  if (playbackState) {
    playbackState = { ...playbackState, position: target };
    playbackStateAt = Date.now();
  }
  return true;
}

export async function setVolume(value = 0.72) {
  volume = Math.max(0, Math.min(1, Number(value) || 0));
  if (player) {
    try { await player.setVolume(volume); } catch { /* noop */ }
  }
}

export function getPosition() {
  if (!playbackState) return 0;
  const base = Number(playbackState.position) || 0;
  const elapsed = playbackState.paused ? 0 : Math.max(0, Date.now() - playbackStateAt);
  return Math.min(Number(playbackState.duration) || Number.MAX_SAFE_INTEGER, base + elapsed);
}

export function getDuration() {
  return Number(playbackState?.duration) || 0;
}

export function getPlaybackState() {
  return playbackState;
}

export async function disconnect() {
  try { await player?.disconnect(); } catch { /* noop */ }
  player = null;
  playerPromise = null;
  playbackState = null;
  playbackStateAt = 0;
  clearAuth();
  notifyStatus({ ready: false, deviceId: '', premium: false });
}
