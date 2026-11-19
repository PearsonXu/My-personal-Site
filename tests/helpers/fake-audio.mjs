/**
 * tests/helpers/fake-audio.mjs — 可控的假 <audio>。
 *
 * 它不发声，但严格模拟媒体事件序列与 play() 的 Promise 语义，
 * 让「状态由事件驱动」「play() 失败处理」「切歌竞态」这些逻辑可以被真实断言。
 */

export class FakeAudio extends EventTarget {
  constructor({ duration = 30, autoplayAllowed = true } = {}) {
    super();
    this._duration = duration;
    this.currentTime = 0;
    this.paused = true;
    this.ended = false;
    this.volume = 1;
    this.muted = false;
    this.playbackRate = 1;
    this.src = '';
    this.currentSrc = '';
    this.error = null;
    this.readyState = 0;
    this.autoplayAllowed = autoplayAllowed;
    this.playCalls = 0;
    this.loadCalls = 0;
    this._buffered = [];
  }

  get duration() { return this.src ? this._duration : NaN; }
  set duration(v) { this._duration = v; }

  get buffered() {
    const ranges = this._buffered;
    return {
      length: ranges.length,
      start: (i) => ranges[i][0],
      end: (i) => ranges[i][1]
    };
  }

  canPlayType(type) { return type === 'audio/mpeg' ? 'probably' : ''; }

  removeAttribute(name) {
    if (name === 'src') { this.src = ''; this.currentSrc = ''; }
  }

  setAttribute(name, value) {
    if (name === 'src') this.src = value;
  }

  load() {
    this.loadCalls++;
    // 真实浏览器的 currentSrc 永远是绝对 URL（IDL 会解析相对 src）；
    // Player 的过期音源守卫拿它和绝对化的 _expectedSrc 比较，假音频必须同语义。
    this.currentSrc = this.src ? new URL(this.src, 'https://example.invalid/').href : '';
    this.ended = false;
    this.error = null;      // 真实媒体元素：load() 会清掉上一次的错误
    this.readyState = 0;
    this.dispatchEvent(new Event('loadstart'));
  }

  /** 模拟元数据就绪 */
  emitLoadedMetadata() {
    this.dispatchEvent(new Event('loadedmetadata'));
    this.dispatchEvent(new Event('durationchange'));
    this.dispatchEvent(new Event('canplay'));
  }

  async play() {
    this.playCalls++;
    if (!this.autoplayAllowed) {
      const err = new Error('play() failed because the user did not interact with the document first.');
      err.name = 'NotAllowedError';
      throw err;
    }
    if (!this.src) {
      const err = new Error('no source');
      err.name = 'NotSupportedError';
      throw err;
    }
    this.paused = false;
    this.ended = false;
    this.readyState = 4;
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
    return undefined;
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  /** 模拟自然播完 */
  finish() {
    this.currentTime = this._duration;
    this.ended = true;
    this.paused = true;
    this.dispatchEvent(new Event('timeupdate'));
    this.dispatchEvent(new Event('ended'));
  }

  tick(seconds) {
    this.currentTime = Math.min(this._duration, this.currentTime + seconds);
    this.dispatchEvent(new Event('timeupdate'));
  }

  fail(code = 4) {
    this.error = { code };
    this.dispatchEvent(new Event('error'));
  }

  waiting() { this.dispatchEvent(new Event('waiting')); }
}

/** 极简内存 localStorage */
export class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

export function makeCatalog(slugs = ['a', 'b', 'c']) {
  return {
    site: { url: 'https://example.com', title: '测试小屋', mediaBase: '' },
    songs: slugs.map((slug, i) => ({
      slug,
      title: `歌曲 ${slug.toUpperCase()}`,
      artist: '测试歌手',
      album: null,
      albumTitle: '',
      tags: ['test'],
      date: '2026-01-01',
      duration: 30,
      cover: `assets/img/covers/${slug}.png`,
      audio: `assets/audio/${slug}.mp3`,
      lyrics: i === 0 ? `assets/lyrics/${slug}.lrc` : null,
      instrumental: i !== 0,
      demo: false
    })),
    albums: [],
    playlists: [],
    notes: []
  };
}

export const flush = () => new Promise((r) => setTimeout(r, 0));