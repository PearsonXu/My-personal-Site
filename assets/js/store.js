/**
 * store.js — 浏览器本地持久化。
 *
 * 明确边界：这里保存的一切只在**当前浏览器**。不是账号，不是云同步。
 * 跨设备同步属于 adapters.js 里的扩展点，未配置时页面会如实显示「未配置」。
 */

const KEY = 'zx.music.v1';
const THEME_KEY = 'zx.music.theme';
const LAYOUT_KEY = 'zx.music.layout';
const RECENT_LIMIT = 50;

/** 三套外观。cloud 是首次访问的默认值，系统深色偏好不参与决策。 */
export const THEMES = ['cloud', 'forest', 'midnight'];
export const LAYOUTS = ['auto', 'desktop', 'mobile'];
/** 旧版本存过 light / dark，迁移到新的三套外观 */
const THEME_ALIAS = { light: 'cloud', dark: 'midnight' };

export function normalizeTheme(value) {
  const v = THEME_ALIAS[value] || value;
  return THEMES.includes(v) ? v : 'cloud';
}

export function normalizeLayout(value) {
  return LAYOUTS.includes(value) ? value : 'auto';
}

const DEFAULTS = {
  version: 1,
  queue: null,
  position: 0,
  volume: 1,
  muted: false,
  mode: 'order',
  view: 'list',
  stage: 'cover',
  favorites: [],
  recent: [],
  audioSession: false,
  theme: 'cloud',
  layout: 'auto',
  viewLocked: false,
  stageLocked: false,
  updatedAt: 0
};

export class Store {
  constructor(storage) {
    // 某些环境（隐私模式 / 被策略禁用）连读取 localStorage 都会抛异常，必须整体兜住
    let resolved = storage || null;
    if (!resolved) {
      try { resolved = typeof localStorage !== 'undefined' ? localStorage : null; } catch { resolved = null; }
    }
    this.storage = resolved;
    this.available = !!resolved;
    this.data = { ...DEFAULTS };
    this._timer = null;
    this.read();
  }

  read() {
    if (!this.available) return this.data;
    try {
      const raw = this.storage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.data = { ...DEFAULTS, ...parsed };
          if (!Array.isArray(this.data.favorites)) this.data.favorites = [];
          if (!Array.isArray(this.data.recent)) this.data.recent = [];
        }
      }
    } catch {
      this.available = false; // 隐私模式 / 配额耗尽：静默降级为内存态
    }
    return this.data;
  }

  /** 立即写入 */
  persist() {
    if (!this.available) return false;
    try {
      this.data.updatedAt = Date.now();
      this.storage.setItem(KEY, JSON.stringify(this.data));
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }

  /** 合并写入（节流，避免 timeupdate 每 250ms 打一次 localStorage） */
  save(patch, { immediate = false, wait = 1200 } = {}) {
    Object.assign(this.data, patch);
    if (immediate) { this.persist(); return; }
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => { this._timer = null; this.persist(); }, wait);
  }

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this.persist();
  }

  /* ── 收藏 ─────────────────────────────────────────── */
  isFavorite(slug) { return this.data.favorites.includes(slug); }

  toggleFavorite(slug) {
    const i = this.data.favorites.indexOf(slug);
    if (i >= 0) this.data.favorites.splice(i, 1);
    else this.data.favorites.unshift(slug);
    this.persist();
    return i < 0;
  }

  clearFavorites() { this.data.favorites = []; this.persist(); }

  /* ── 最近播放 ─────────────────────────────────────── */
  pushRecent(slug) {
    this.data.recent = [{ slug, at: Date.now() }, ...this.data.recent.filter((r) => r.slug !== slug)].slice(0, RECENT_LIMIT);
    this.persist();
  }

  clearRecent() { this.data.recent = []; this.persist(); }

  /* ── 外观 / 布局 ──────────────────────────────────── */
  getTheme() {
    if (!this.available) return 'cloud';
    try { return normalizeTheme(this.storage.getItem(THEME_KEY)); } catch { return 'cloud'; }
  }

  setTheme(theme) {
    const value = normalizeTheme(theme);
    this.data.theme = value;
    if (!this.available) return value;
    try { this.storage.setItem(THEME_KEY, value); } catch { /* ignore */ }
    return value;
  }

  getLayout() {
    if (!this.available) return 'auto';
    try { return normalizeLayout(this.storage.getItem(LAYOUT_KEY)); } catch { return 'auto'; }
  }

  setLayout(layout) {
    const value = normalizeLayout(layout);
    this.data.layout = value;
    if (!this.available) return value;
    try { this.storage.setItem(LAYOUT_KEY, value); } catch { /* ignore */ }
    return value;
  }

  clearAll() {
    this.data = { ...DEFAULTS };
    this.persist();
  }

  exportJson() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      notice: '仅本机数据：收藏 / 最近播放 / 队列 / 进度。这不是账号备份。',
      favorites: this.data.favorites,
      recent: this.data.recent,
      queue: this.data.queue,
      position: this.data.position,
      mode: this.data.mode
    }, null, 2);
  }
}