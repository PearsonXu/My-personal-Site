/**
 * player.js — 播放引擎。
 *
 * 工程约束（逐条对应需求）：
 *  1. 全站复用一个原生 <audio>，由外部注入，本模块绝不创建新的音频元素；
 *  2. 播放状态由**媒体事件**驱动，不是由「我调用了 play()」驱动；
 *  3. 每次 play() 的 Promise 都被处理：被策略拒绝 → blocked，其它失败 → error；
 *  4. 快速切歌 A→B→C：每次加载递增 token，过期的异步回调一律丢弃；
 *  5. 同一首歌重复入队 → 不同队列项 id（由 PlayQueue 保证）；
 *  6. 页面进入后台**不主动暂停**；回到前台按真实 currentTime 校准；
 *  7. 刷新后恢复队列与进度，但**等待用户点击**才继续播放。
 */

import { PlayQueue, MODES, MODE_LABELS } from './core/queue.js';
import { parseLrc, lineIndexAt, isTimed } from './core/lrc.js';
import { clamp } from './core/util.js';
import { qs } from './ui/dom.js';

export const STATES = ['idle', 'loading', 'playing', 'paused', 'buffering', 'blocked', 'error'];

export const STATE_TEXT = {
  idle: '',
  loading: '加载中…',
  playing: '',
  paused: '已暂停',
  buffering: '缓冲中…',
  blocked: '浏览器拦截了自动播放，请点一下播放按钮',
  error: '播放出错'
};

const MEDIA_ERRORS = {
  1: '播放被中止',
  2: '网络错误，音频没能下载下来',
  3: '解码失败，文件可能损坏或格式不受支持',
  4: '音源不可用（地址错误、404、或服务器不支持该格式）'
};

/**
 * Media Session 封面：MIME 按扩展名如实声明。
 * 尺寸只有构建期生成的方形封面（assets/img/covers/*.png，600×600）是确定的；
 * 站长自供原图尺寸未知，不谎报 sizes。
 */
function mediaArtwork(src, coverPath) {
  const p = String(coverPath || '');
  const art = { src };
  if (/\.jpe?g$/i.test(p)) art.type = 'image/jpeg';
  else if (/\.webp$/i.test(p)) art.type = 'image/webp';
  else if (/\.png$/i.test(p)) art.type = 'image/png';
  if (/^assets\/img\/covers\/[^/]+\.png$/i.test(p)) art.sizes = '600x600';
  return art;
}

export class Player {
  /** @param {any} options */
  constructor({ audio, catalog, store, resolve, resolveAudio, fetchText }) {
    /** @type {any} 由 app.js 注入的 PlayerUI，避免循环依赖 */
    this.ui = null;
    this.audio = audio;
    this.catalog = catalog;
    this.store = store;
    /** 站点根相对资源（封面 / 歌词 / 二维码） */
    this.resolve = resolve || ((s) => s);
    /** 媒体根相对资源（音频）：mediaBase 为空时挂在 <base>assets/ 下 */
    this.resolveAudio = resolveAudio || this.resolve;
    this.fetchText = fetchText || ((url) => fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }));

    this.songs = new Map((catalog.songs || []).map((s) => [s.slug, s]));
    this.queue = new PlayQueue({ mode: store?.data?.mode || 'order' });
    this.cued = false;
    /** 预置歌曲尚未接到 audio 上的音源 */
    this._deferredSrc = null;
    this.state = 'idle';
    this.stateDetail = '';
    this.currentItem = null;
    this.currentSong = null;
    this.lyrics = { format: 'none', meta: {}, lines: [] };
    this.lyricIndex = -1;
    this.lyricOffset = 0;
    this._lyricsBase = null;
    this.duration = 0;
    this.volumeSupported = true;
    this._token = 0;
    this._expectedSrc = '';
    this._pendingSeek = null;
    this._listeners = new Map();
    this._lastPersist = 0;

    this._bindMedia();
    this._probeVolume();
  }

  /* ── 事件 ─────────────────────────────────────────── */
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this._listeners.get(type)?.delete(fn);
  }

  emit(type, payload) {
    for (const fn of this._listeners.get(type) || []) {
      try { fn(payload); } catch (err) { console.error(`[player] ${type} 监听器出错`, err); }
    }
  }

  songOf(slug) { return this.songs.get(slug) || null; }

  _setState(state, detail = '') {
    if (!STATES.includes(state)) return;
    if (this.state === state && this.stateDetail === detail) return;
    this.state = state;
    this.stateDetail = detail;
    this.emit('state', { state, detail });
  }

  /* ── 媒体事件：唯一的真实状态来源 ─────────────────── */
  _bindMedia() {
    const a = this.audio;
    const guard = () => this._expectedSrc && a.currentSrc && a.currentSrc !== this._expectedSrc;

    a.addEventListener('loadstart', () => { if (this.state !== 'error') this._setState('loading'); });
    a.addEventListener('loadedmetadata', () => {
      if (guard()) return;
      this.duration = Number.isFinite(a.duration) ? a.duration : (this.currentSong?.duration || 0);
      if (this._pendingSeek !== null) {
        const t = clamp(this._pendingSeek, 0, Math.max(0, this.duration - 0.25));
        this._pendingSeek = null;
        try { a.currentTime = t; } catch { /* 某些浏览器要等 canplay */ }
      }
      this.emit('time', this.timeInfo());
      this._updatePositionState();
    });
    a.addEventListener('durationchange', () => {
      if (Number.isFinite(a.duration) && a.duration > 0) this.duration = a.duration;
      this.emit('time', this.timeInfo());
    });
    a.addEventListener('canplay', () => { if (this.state === 'loading' && a.paused) this._setState('paused'); });
    a.addEventListener('playing', () => { if (guard()) return; this._setState('playing'); });
    a.addEventListener('play', () => { if (this.state !== 'playing') this._setState('buffering'); });
    a.addEventListener('pause', () => {
      if (a.ended) return;
      if (this.state !== 'error' && this.state !== 'blocked') this._setState('paused');
      this._persistNow();
    });
    a.addEventListener('waiting', () => { if (this.state === 'playing' || this.state === 'buffering') this._setState('buffering'); });
    a.addEventListener('stalled', () => { if (!a.paused) this._setState('buffering', '网络似乎卡住了'); });
    a.addEventListener('timeupdate', () => {
      if (guard()) return;
      this._onTime();
    });
    a.addEventListener('seeked', () => {
      if (guard()) return;
      // 拖动 / 刷新恢复进度 / 单曲循环重播落地后：立刻按真实 currentTime 重新定位，
      // 不等下一次 timeupdate（后台标签里 timeupdate 可能被节流）。
      this.emit('seek', { time: this.audio.currentTime || 0 });
      this._onTime();
    });
    a.addEventListener('volumechange', () => this.emit('volume', { volume: a.volume, muted: a.muted }));
    a.addEventListener('ended', () => this._onEnded());
    a.addEventListener('error', () => {
      if (guard()) return;
      const code = a.error?.code || 4;
      this._setState('error', MEDIA_ERRORS[code] || '未知播放错误');
      this.emit('error', { code, message: this.stateDetail });
    });
  }
  /* ── 音量能力探测（iOS 上 volume 只读） ───────────── */
  _probeVolume() {
    const a = this.audio;
    try {
      const original = a.volume;
      a.volume = 0.5;
      this.volumeSupported = Math.abs(a.volume - 0.5) < 0.01;
      a.volume = original;
    } catch {
      this.volumeSupported = false;
    }
  }

  timeInfo() {
    return {
      currentTime: Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0,
      duration: this.duration || this.currentSong?.duration || 0,
      buffered: this._bufferedEnd()
    };
  }

  _bufferedEnd() {
    try {
      const b = this.audio.buffered;
      return b && b.length ? b.end(b.length - 1) : 0;
    } catch { return 0; }
  }

  _onTime() {
    const info = this.timeInfo();
    this.emit('time', info);
    if (isTimed(this.lyrics)) {
      const idx = lineIndexAt(this.lyrics.lines, info.currentTime);
      if (idx !== this.lyricIndex) {
        this.lyricIndex = idx;
        this.emit('lyric-line', { index: idx, time: info.currentTime });
      }
    }
    const now = Date.now();
    if (!this.cued && now - this._lastPersist > 4000) {
      this._lastPersist = now;
      this.store?.save({ position: info.currentTime, queue: this.queue.snapshot() });
    }
    this._updatePositionState();
  }

  _persistNow() {
    // 预置的歌访客还没碰过：不写进存储，免得下次被当成「上次听到这里」恢复
    if (this.cued) return;
    this.store?.save({
      position: Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0,
      queue: this.queue.snapshot(),
      mode: this.queue.mode
    }, { immediate: true });
  }

  /* ── 加载（token 守卫的核心） ─────────────────────── */
  /**
   * @param {any} item
   * @param {{ autoplay?: boolean, startTime?: number, cue?: boolean }} [opts]
   *   cue=true：只是把歌放进播放条备着（访客还没点过任何歌）。不写最近播放、不持久化，
   *   这样它既不污染「最近播放」，下次来也不会被当成「上次听到这里」恢复。
   */
  async _load(item, { autoplay = false, startTime = 0, cue = false } = {}) {
    const token = ++this._token;
    /** 当前曲目是否只是预置（未被访客触碰）；play() 或任何用户操作会清掉 */
    this.cued = cue;
    const hadError = !!this.audio.error;
    const song = item ? this.songOf(item.slug) : null;
    if (!song) {
      this.currentItem = null;
      this.currentSong = null;
      this._setState('error', '这首歌不在当前曲库里');
      return;
    }

    this.currentItem = item;
    this.currentSong = song;
    this.lyrics = { format: 'none', meta: {}, lines: [] };
    this.lyricIndex = -1;
    // 歌词校准逐曲保存：换歌加载该曲自己的偏移（没存过 = 0），互不影响
    this.lyricOffset = this.store?.data?.lyricOffsets?.[song.slug] || 0;
    this._lyricsBase = null;
    this.duration = song.duration || 0;
    this._pendingSeek = startTime > 0 ? startTime : null;
    this.stateDetail = '';
    this.emit('track', { song, item });
    this.emit('lyrics', { song, lyrics: this.lyrics, pending: true });
    this.emit('lyric-offset', { offset: this.lyricOffset });
    this._setState('loading');

    const src = this.resolveAudio(song.audio);
    // 预置：只显示歌名 / 封面 / 时长，音频等访客按播放时再接上 —— 不为一首可能不听的歌白下载
    this._deferredSrc = cue ? src : null;
    if (!cue) this._bindSrc(src, { hadError, startTime });

    if (!cue) this.store?.pushRecent(song.slug);
    this._updateMediaSession(song);
    this.emit('queue', this.queueInfo());

    // 歌词异步加载：回来晚了也不能覆盖新歌
    this._loadLyrics(song, token);

    if (autoplay) {
      await this._attemptPlay(token);
    } else {
      // 不自动播放的加载必须真的停下来，否则上一首还在响、状态却写着 paused
      this.audio.pause();
      this._setState('paused', startTime > 0 ? '已恢复上次的进度，点击继续播放' : '');
    }
    if (!cue) this._persistNow();
  }

  /** 把音源接到唯一的 audio 元素上（换源 / 失败复位 / 同源跳进度） */
  _bindSrc(src, { hadError = false, startTime = 0 } = {}) {
    this._expectedSrc = new URL(src, typeof location !== 'undefined' ? location.href : 'https://example.invalid/').href;
    // 上一次加载失败过（404 / 断网）时，即使 src 没变也必须 load() 复位媒体元素，
    // 否则 Chrome 会停留在失败态，后续 play() 一直失败。
    const needsReset = hadError || this.audio.readyState === 0;
    if (this.audio.src !== this._expectedSrc) {
      this.audio.src = src;
      try { this.audio.load(); } catch { /* jsdom 无 load() */ }
    } else {
      if (needsReset) { try { this.audio.load(); } catch { /* ignore */ } }
      if (startTime > 0) {
        try { this.audio.currentTime = startTime; } catch { /* 等 loadedmetadata */ }
        this._pendingSeek = null;
      }
    }
  }

  async _loadLyrics(song, token) {
    if (song.instrumental || !song.lyrics) {
      if (token !== this._token) return;
      this._applyLyrics(song, { format: 'none', meta: {}, lines: [] });
      return;
    }
    // 页面上已经预渲染了这首歌的歌词 → 直接用，省一次请求，也天然没有竞态
    const inline = this._inlineLyrics(song.slug);
    if (inline) {
      if (token !== this._token) return;
      this._applyLyrics(song, inline);
      return;
    }
    try {
      const text = await this.fetchText(this.resolve(song.lyrics));
      if (token !== this._token) return; // ★ 过期回调丢弃
      this._applyLyrics(song, parseLrc(text));
    } catch (err) {
      if (token !== this._token) return;
      this._applyLyrics(song, { format: 'none', meta: {}, lines: [], error: String(err.message || err) });
    }
  }

  /** 歌词落地的唯一入口：记下原始时间轴（供校准反复平移），再按当前偏移生效 */
  _applyLyrics(song, lyrics) {
    this._lyricsBase = lyrics;
    this.lyrics = this.lyricOffset ? this._shiftLyrics(lyrics, this.lyricOffset) : lyrics;
    this.emit('lyrics', { song, lyrics: this.lyrics, pending: false });
    // ★ 落地即定位：异步歌词回来时播放可能已在曲中（刷新恢复进度 / 慢网缓冲后落地）。
    //   这里若只赋值不 emit，高亮会冻在旧行直到「下一句」时间戳到达 ——
    //   真实歌曲句间隔可达 20s+，听感上就是「歌词和音乐差了一段时间」。
    if (isTimed(this.lyrics)) {
      const t = this.audio.currentTime || 0;
      this.lyricIndex = lineIndexAt(this.lyrics.lines, t);
      this.emit('lyric-line', { index: this.lyricIndex, time: t });
    }
  }

  /** 平移时间轴：offset 秒，正值 = 歌词提前（与 LRC [offset:] 同一约定），下钳到 0 */
  _shiftLyrics(lyrics, offset) {
    if (!offset || !lyrics?.lines?.length) return lyrics;
    return { ...lyrics, lines: lyrics.lines.map((l) => (l.time == null ? l : { ...l, time: Math.max(0, l.time - offset) })) };
  }

  /**
   * 歌词校准（歌词面板顶部工具栏内的「歌词校准」控件）。
   * 运行时立即生效，并**按歌曲**持久化到本地存储：切歌互不影响，刷新后仍在。
   * @param seconds 偏移秒数，正值 = 歌词整体提前；钳到 ±30s，步进 0.1s
   */
  setLyricOffset(seconds) {
    const offset = clamp(Math.round((Number(seconds) || 0) * 10) / 10, -30, 30);
    this.lyricOffset = offset;
    const slug = this.currentSong?.slug;
    if (slug && this.store) {
      const map = { ...this.store.data.lyricOffsets };
      if (offset) map[slug] = offset;
      else delete map[slug];
      this.store.save({ lyricOffsets: map }, { immediate: true });
    }
    if (this._lyricsBase) {
      this.lyrics = this._shiftLyrics(this._lyricsBase, offset);
      this.emit('lyrics', { song: this.currentSong, lyrics: this.lyrics, pending: false });
      if (isTimed(this.lyrics)) {
        this.lyricIndex = lineIndexAt(this.lyrics.lines, this.audio.currentTime || 0);
        this.emit('lyric-line', { index: this.lyricIndex, time: this.audio.currentTime || 0 });
      }
    }
    this.emit('lyric-offset', { offset });
    return offset;
  }

  adjustLyricOffset(delta) { return this.setLyricOffset(this.lyricOffset + (Number(delta) || 0)); }

  _inlineLyrics(slug) {
    if (typeof document === 'undefined') return null;
    const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(slug) : slug;
    const el = qs(`[data-lrc="${safe}"]`);
    if (!el) return null;
    const timed = el.dataset.timed === 'true';
    const lines = [...el.querySelectorAll('.lrc__line')].map((li) => ({
      time: timed ? Number(li.dataset.t) : null,
      text: li.textContent.trim()
    }));
    if (!lines.length) return null;
    return { format: timed ? 'lrc' : 'text', meta: {}, lines };
  }

  async _attemptPlay(token) {
    try {
      const p = this.audio.play();
      if (p && typeof p.then === 'function') await p;
      if (token !== this._token) return; // 已经被更新的加载取代
      // 状态以媒体事件为准；但「元素本来就在播」时浏览器不会再发 play/playing，
      // 这里按元素真实的 paused 标志做一次对账，避免永远卡在 buffering。
      if (!this.audio.paused && this.state !== 'playing') this._setState('playing');
    } catch (err) {
      if (token !== this._token) return;
      const name = err?.name || '';
      if (name === 'NotAllowedError') {
        this._setState('blocked', '浏览器拦截了自动播放，请点一下播放按钮');
      } else if (name === 'AbortError') {
        // 切换音源导致的正常中止，不当成错误
      } else {
        this._setState('error', `无法开始播放：${err?.message || name || '未知原因'}`);
      }
    }
  }
  /* ── 对外控制 ─────────────────────────────────────── */

  /** 播放单曲。context 决定队列来源：song-page / album / playlist / library */
  async playSong(slug, { contextSlugs = null, autoplay = true } = {}) {
    const song = this.songOf(slug);
    if (!song) { this._setState('error', '这首歌不在当前曲库里'); return; }
    const slugs = (contextSlugs && contextSlugs.length ? contextSlugs : [slug]).filter((s) => this.songs.has(s));
    const index = Math.max(0, slugs.indexOf(slug));
    const item = this.queue.replace(slugs, index);
    await this._load(item, { autoplay });
  }

  /**
   * 预置一首歌到播放条但不播放（不碰 play()，因此不会触发 NotAllowedError）。
   * 只在访客还没开始听的时候由 app 调用；点播放键即从这首开始。
   */
  async cueSong(slug, { contextSlugs = null } = {}) {
    if (!this.songOf(slug)) return;
    const slugs = (contextSlugs && contextSlugs.length ? contextSlugs : [slug]).filter((s) => this.songs.has(s));
    const item = this.queue.replace(slugs, Math.max(0, slugs.indexOf(slug)));
    await this._load(item, { autoplay: false, cue: true });
  }

  async playSlugs(slugs, { startIndex = 0, autoplay = true } = {}) {
    const list = (slugs || []).filter((s) => this.songs.has(s));
    if (!list.length) { this._setState('idle', '没有可播放的曲目'); return; }
    const item = this.queue.replace(list, startIndex);
    await this._load(item, { autoplay });
  }

  async playCollection(kind, slug, { autoplay = true } = {}) {
    const list = kind === 'albums'
      ? this.catalog.albums.find((a) => a.slug === slug)
      : this.catalog.playlists.find((p) => p.slug === slug);
    if (!list || !list.tracks.length) { this._setState('idle', '这个合集还没有曲目'); return; }
    await this.playSlugs(list.tracks, { autoplay });
  }

  async play() {
    this.cued = false;
    if (this._deferredSrc && this.currentItem) {
      // 预置的歌第一次被按下播放：此刻才接上音源（之前点过的歌词跳转留在 _pendingSeek 里）
      const src = this._deferredSrc;
      const pending = this._pendingSeek;
      this._deferredSrc = null;
      this._bindSrc(src, { hadError: !!this.audio.error });
      this._pendingSeek = pending;
      if (this.currentSong) this.store?.pushRecent(this.currentSong.slug);
      this._persistNow();
    }
    if (!this.currentItem) {
      const first = this.catalog.songs[0];
      if (first) return this.playSong(first.slug);
      this._setState('idle', '曲库是空的');
      return;
    }
    this._setState('buffering');
    await this._attemptPlay(this._token);
  }

  pause() {
    this.audio.pause();
    this._persistNow();
  }

  async toggle() {
    // 以元素真实的 paused 为准，而不是我们自己记的状态
    if (!this.audio.paused) this.pause();
    else await this.play();
  }

  async next({ auto = false } = {}) {
    const item = this.queue.advance({ auto });
    if (!item) {
      this._setState('paused', '队列已经播完了');
      this.emit('queue', this.queueInfo());
      return;
    }
    await this._load(item, { autoplay: true });
  }

  async prev() {
    // 播放超过 3 秒时，「上一首」先回到本曲开头（通行做法）
    if (this.audio.currentTime > 3 && this.currentItem) {
      this.seek(0);
      return;
    }
    const { item, restart } = this.queue.back();
    if (!item) return;
    if (restart) { this.seek(0); await this._attemptPlay(this._token); return; }
    await this._load(item, { autoplay: true });
  }

  seek(seconds) {
    const dur = this.duration || this.currentSong?.duration || 0;
    const t = clamp(seconds, 0, Math.max(0, dur - 0.05));
    if (this._deferredSrc) {
      // 预置的歌还没接音源：记下目标进度，play() 接上音源后由 loadedmetadata 落地
      this._pendingSeek = t;
      this.emit('time', { ...this.timeInfo(), currentTime: t });
      return;
    }
    try {
      this.audio.currentTime = t;
    } catch {
      this._pendingSeek = t;
      return;
    }
    this.emit('time', this.timeInfo());
    if (isTimed(this.lyrics)) {
      this.lyricIndex = lineIndexAt(this.lyrics.lines, t);
      this.emit('lyric-line', { index: this.lyricIndex, time: t });
    }
    this.emit('seek', { time: t });
    this._updatePositionState();
    this._persistNow();
  }

  seekRatio(ratio) {
    const dur = this.duration || this.currentSong?.duration || 0;
    this.seek(clamp(ratio, 0, 1) * dur);
  }

  setVolume(v) {
    const value = clamp(v, 0, 1);
    this.audio.volume = value;
    if (value > 0 && this.audio.muted) this.audio.muted = false;
    this.store?.save({ volume: value, muted: this.audio.muted });
    this.emit('volume', { volume: this.audio.volume, muted: this.audio.muted });
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.store?.save({ muted: this.audio.muted });
    this.emit('volume', { volume: this.audio.volume, muted: this.audio.muted });
  }

  _onEnded() {
    this.emit('ended', { item: this.currentItem });
    const before = this.currentItem;
    const item = this.queue.advance({ auto: true });
    if (!item) {
      this._setState('paused', '队列已经播完了');
      this.emit('queue', this.queueInfo());
      this._persistNow();
      return;
    }
    if (before && item.id === before.id) {
      // 单曲循环：同一队列项，重头再来
      try { this.audio.currentTime = 0; } catch { /* ignore */ }
      this._attemptPlay(this._token);
      return;
    }
    this._load(item, { autoplay: true });
  }
  /* ── 队列操作 ─────────────────────────────────────── */
  queueInfo() {
    return {
      items: this.queue.items.map((it) => ({ ...it, song: this.songOf(it.slug) })),
      currentId: this.currentItem?.id || null,
      mode: this.queue.mode,
      modeLabel: MODE_LABELS[this.queue.mode],
      next: this.queue.peekNext()
    };
  }

  addNext(slug) {
    if (!this.songs.has(slug)) return null;
    const item = this.queue.addNext(slug);
    this.emit('queue', this.queueInfo());
    this._persistNow();
    if (!this.currentItem) this._load(this.queue.current(), { autoplay: false });
    return item;
  }

  addLast(slug) {
    if (!this.songs.has(slug)) return null;
    const item = this.queue.addLast(slug);
    this.emit('queue', this.queueInfo());
    this._persistNow();
    if (!this.currentItem) this._load(this.queue.current(), { autoplay: false });
    return item;
  }

  addMany(slugs, pos = 'last') {
    const added = this.queue.addMany((slugs || []).filter((s) => this.songs.has(s)), pos);
    this.emit('queue', this.queueInfo());
    this._persistNow();
    if (!this.currentItem && this.queue.current()) this._load(this.queue.current(), { autoplay: false });
    return added;
  }

  async removeItem(id) {
    const { removed, removedCurrent } = this.queue.remove(id);
    if (!removed) return;
    this.emit('queue', this.queueInfo());
    if (removedCurrent) {
      const cur = this.queue.current();
      if (cur) await this._load(cur, { autoplay: this.state === 'playing' });
      else { this.audio.pause(); this.audio.removeAttribute('src'); this.currentItem = null; this.currentSong = null; this._setState('idle'); }
    }
    this._persistNow();
  }

  moveItem(from, to) {
    if (this.queue.move(from, to)) {
      this.emit('queue', this.queueInfo());
      this._persistNow();
    }
  }

  clearQueue() {
    this.queue.clear();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this._expectedSrc = '';
    this.currentItem = null;
    this.currentSong = null;
    this.lyrics = { format: 'none', meta: {}, lines: [] };
    this._setState('idle');
    this.emit('track', { song: null, item: null });
    this.emit('queue', this.queueInfo());
    this._persistNow();
  }

  async jumpTo(id) {
    const item = this.queue.jump(id);
    if (item) await this._load(item, { autoplay: true });
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    this.queue.setMode(mode);
    this.store?.save({ mode });
    this.emit('queue', this.queueInfo());
    this._persistNow();
  }

  cycleMode() { this.setMode(this.queue.cycleMode()); return this.queue.mode; }

  /* ── 收藏 ─────────────────────────────────────────── */
  isFavorite(slug) { return !!this.store?.isFavorite(slug); }

  toggleFavorite(slug) {
    if (!this.store) return false;
    const on = this.store.toggleFavorite(slug);
    this.emit('favorites', { slug, on, list: this.store.data.favorites });
    return on;
  }

  /* ── 恢复：只恢复状态，绝不自动出声 ───────────────── */
  restore() {
    const data = this.store?.data;
    if (!data) return;
    if (typeof data.volume === 'number') { try { this.audio.volume = clamp(data.volume, 0, 1); } catch { /* ignore */ } }
    this.audio.muted = !!data.muted;
    const snapshot = data.queue;
    if (snapshot && Array.isArray(snapshot.items)) {
      const alive = snapshot.items.filter((it) => it && this.songs.has(it.slug));
      if (alive.length) {
        const cursor = Math.min(Math.max(-1, snapshot.cursor ?? -1), alive.length - 1);
        this.queue = PlayQueue.restore({ ...snapshot, items: alive, cursor }, { mode: data.mode || snapshot.mode });
        const cur = this.queue.current();
        if (cur) {
          this._load(cur, { autoplay: false, startTime: Number(data.position) || 0 });
          this.emit('queue', this.queueInfo());
          return;
        }
      }
    }
    this.queue.setMode(data.mode || 'order');
    this.emit('queue', this.queueInfo());
  }

  /** 回到前台：按真实 currentTime 校准 UI 与歌词，不做任何推算 */
  resync() {
    const info = this.timeInfo();
    this.emit('time', info);
    if (isTimed(this.lyrics)) {
      const idx = lineIndexAt(this.lyrics.lines, info.currentTime);
      this.lyricIndex = idx;
      this.emit('lyric-line', { index: idx, time: info.currentTime });
    }
    if (!this.audio.paused && this.state !== 'playing') this._setState('playing');
    if (this.audio.paused && this.state === 'playing') this._setState('paused');
    this._updatePositionState();
  }
  /* ── Media Session：锁屏 / 耳机 / 系统媒体控件 ─────── */
  get mediaSession() {
    return typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
  }

  bindMediaSession() {
    const ms = this.mediaSession;
    if (!ms) return false;
    const safe = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* 该动作不受支持 */ } };
    safe('play', () => { this.play(); });
    safe('pause', () => { this.pause(); });
    safe('previoustrack', () => { this.prev(); });
    safe('nexttrack', () => { this.next(); });
    safe('seekto', (d) => { if (typeof d.seekTime === 'number') this.seek(d.seekTime); });
    safe('seekbackward', (d) => { this.seek((this.audio.currentTime || 0) - (d.seekOffset || 10)); });
    safe('seekforward', (d) => { this.seek((this.audio.currentTime || 0) + (d.seekOffset || 10)); });
    safe('stop', () => { this.pause(); this.seek(0); });
    return true;
  }

  _updateMediaSession(song) {
    const ms = this.mediaSession;
    if (!ms || typeof MediaMetadata === 'undefined') return;
    if (!song) { ms.metadata = null; ms.playbackState = 'none'; return; }
    const abs = (p) => {
      try { return new URL(this.resolve(p), location.href).href; } catch { return this.resolve(p); }
    };
    try {
      ms.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.albumTitle || '',
        artwork: [mediaArtwork(abs(song.cover), song.cover)]
      });
      ms.playbackState = this.audio.paused ? 'paused' : 'playing';
    } catch { /* 某些浏览器对 artwork 挑剔，忽略即可 */ }
  }

  _updatePositionState() {
    const ms = this.mediaSession;
    if (!ms || typeof ms.setPositionState !== 'function') return;
    const duration = this.duration;
    const position = this.audio.currentTime || 0;
    if (!Number.isFinite(duration) || duration <= 0 || position > duration) return;
    try {
      ms.setPositionState({ duration, position: Math.max(0, position), playbackRate: this.audio.playbackRate || 1 });
    } catch { /* ignore */ }
  }

  /* ── Audio Session：可关闭的实验性增强，默认关闭 ──── */
  get audioSessionSupported() {
    return typeof navigator !== 'undefined' && 'audioSession' in navigator;
  }

  setAudioSession(enabled) {
    if (!this.audioSessionSupported) return { supported: false, enabled: false };
    try {
      navigator.audioSession.type = enabled ? 'playback' : 'auto';
      this.store?.save({ audioSession: !!enabled }, { immediate: true });
      return { supported: true, enabled: !!enabled, type: navigator.audioSession.type };
    } catch (err) {
      return { supported: true, enabled: false, error: String(err.message || err) };
    }
  }

  /** 供 /status/ 页面与自动化测试读取的能力快照 */
  capabilities() {
    return {
      mediaSession: !!this.mediaSession,
      mediaMetadata: typeof MediaMetadata !== 'undefined',
      setPositionState: !!(this.mediaSession && typeof this.mediaSession.setPositionState === 'function'),
      audioSession: this.audioSessionSupported,
      audioSessionType: this.audioSessionSupported ? navigator.audioSession.type : null,
      volumeControl: this.volumeSupported,
      canPlayMp3: this.audio.canPlayType ? (this.audio.canPlayType('audio/mpeg') || 'no') : 'unknown',
      localStorage: !!this.store?.available,
      persistentStorage: typeof navigator !== 'undefined' && !!navigator.storage?.persist
    };
  }
}