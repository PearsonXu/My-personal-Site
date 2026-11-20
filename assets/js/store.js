/**
 * store.js — 浏览器本地持久化。
 *
 * 明确边界：这里保存的一切只在**当前浏览器**。不是账号，不是云同步。
 * 跨设备同步属于 adapters.js 里的扩展点，未配置时页面会如实显示「未配置」。
 */

import { MODES } from './core/queue.js';
import { isSafeSlug } from './core/util.js';

const KEY = 'zx.music.v1';
const BROKEN_KEY = 'zx.music.v1.broken';
const THEME_KEY = 'zx.music.theme';
const LAYOUT_KEY = 'zx.music.layout';
const LRC_FONT_KEY = 'zx.music.lrcFont';
const RECENT_LIMIT = 50;
const OFFSET_LIMIT = 200;

const VIEWS = ['list', 'grid', 'vinyl'];
const STAGES = ['cover', 'vinyl', 'lyrics'];

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

/** 歌词字号三档：小 / 中 / 大，默认中。只影响歌词文字，不影响其他 UI。 */
export const LRC_FONTS = ['s', 'm', 'l'];
export function normalizeLrcFont(value) {
  return LRC_FONTS.includes(value) ? value : 'm';
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
  lyricOffsets: {},
  audioSession: false,
  theme: 'cloud',
  layout: 'auto',
  viewLocked: false,
  stageLocked: false,
  updatedAt: 0
};

/**
 * 逐字段校验 + 就地回退。
 *
 * 原则：**只替换坏掉的字段**，有效数据（收藏、最近播放、队列…）一律保留。
 * 之前是 `{...DEFAULTS, ...parsed}` 全盘照收，任何一个字段形状不对
 * 都可能在后续渲染里抛异常，而且刷新会再次读到同一份坏数据。
 *
 * @param {any} raw 解析出来的对象
 * @param {string[]} repaired 收集被修过的字段名，便于给用户一个温和提示
 */
export function sanitizeState(raw, repaired = []) {
  const out = { ...DEFAULTS };
  const fix = (field) => { repaired.push(field); };
  const num = (v, min, max, fallback, field) => {
    if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) return v;
    if (v !== undefined) fix(field);
    return fallback;
  };
  const bool = (v, fallback, field) => {
    if (typeof v === 'boolean') return v;
    if (v !== undefined) fix(field);
    return fallback;
  };
  const pick = (v, allowed, fallback, field) => {
    if (allowed.includes(v)) return v;
    if (v !== undefined) fix(field);
    return fallback;
  };

  out.version = num(raw.version, 1, 99, 1, 'version');
  out.position = num(raw.position, 0, 24 * 3600, 0, 'position');
  out.volume = num(raw.volume, 0, 1, 1, 'volume');
  out.updatedAt = num(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0, 'updatedAt');
  out.muted = bool(raw.muted, false, 'muted');
  out.audioSession = bool(raw.audioSession, false, 'audioSession');
  out.viewLocked = bool(raw.viewLocked, false, 'viewLocked');
  out.stageLocked = bool(raw.stageLocked, false, 'stageLocked');
  out.mode = pick(raw.mode, MODES, 'order', 'mode');
  out.view = pick(raw.view, VIEWS, 'list', 'view');
  out.stage = pick(raw.stage, STAGES, 'cover', 'stage');
  out.theme = normalizeTheme(raw.theme);
  out.layout = normalizeLayout(raw.layout);

  // 队列：形状不对就只丢队列，不动收藏
  if (raw.queue == null) out.queue = null;
  else if (typeof raw.queue === 'object' && !Array.isArray(raw.queue) && Array.isArray(raw.queue.items)) {
    const items = raw.queue.items.filter((it) => it && typeof it === 'object' && isSafeSlug(it.slug));
    if (items.length !== raw.queue.items.length) fix('queue.items');
    out.queue = {
      items: items.map((it) => ({ id: typeof it.id === 'string' ? it.id : undefined, slug: it.slug })),
      cursor: Number.isInteger(raw.queue.cursor) ? raw.queue.cursor : -1,
      mode: MODES.includes(raw.queue.mode) ? raw.queue.mode : out.mode,
      history: Array.isArray(raw.queue.history) ? raw.queue.history.filter((x) => typeof x === 'string') : [],
      bag: Array.isArray(raw.queue.bag) ? raw.queue.bag.filter((x) => typeof x === 'string') : []
    };
  } else { fix('queue'); out.queue = null; }

  // 收藏：逐条过滤，保留合法的 slug
  if (Array.isArray(raw.favorites)) {
    const good = raw.favorites.filter((s) => isSafeSlug(s));
    if (good.length !== raw.favorites.length) fix('favorites');
    out.favorites = [...new Set(good)];
  } else if (raw.favorites !== undefined) { fix('favorites'); }

  // 最近播放：逐条过滤，坏条目不会让 pushRecent 里的 r.slug 抛异常
  if (Array.isArray(raw.recent)) {
    const good = raw.recent.filter((r) => r && typeof r === 'object' && isSafeSlug(r.slug));
    if (good.length !== raw.recent.length) fix('recent');
    out.recent = good.slice(0, RECENT_LIMIT).map((r) => ({
      slug: r.slug,
      at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0
    }));
  } else if (raw.recent !== undefined) { fix('recent'); }

  // 歌词校准：逐曲偏移（slug → 秒，±30）。坏键 / 坏值单独丢，不影响其他曲目
  out.lyricOffsets = {};
  if (raw.lyricOffsets != null) {
    if (typeof raw.lyricOffsets === 'object' && !Array.isArray(raw.lyricOffsets)) {
      for (const [slug, v] of Object.entries(raw.lyricOffsets).slice(0, OFFSET_LIMIT)) {
        if (!isSafeSlug(slug) || typeof v !== 'number' || !Number.isFinite(v) || v < -30 || v > 30) { fix('lyricOffsets'); continue; }
        out.lyricOffsets[slug] = Math.round(v * 10) / 10;
      }
    } else { fix('lyricOffsets'); }
  }

  return out;
}

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
    this.repaired = [];
    if (!this.available) return this.data;
    let raw = null;
    try {
      raw = this.storage.getItem(KEY);
    } catch {
      this.available = false; // 连读都不行（隐私模式 / 被策略禁用）：降级为内存态
      return this.data;
    }
    if (!raw) return this.data;

    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      // 整块读不出来：留一份原文备份，不要静默销毁；本次用默认值继续跑
      this.repaired.push('json');
      try { this.storage.setItem(BROKEN_KEY, raw); } catch { /* ignore */ }
      return this.data;
    }
    this.data = sanitizeState(parsed, this.repaired);
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

  /* ── 歌词字号（当前浏览器偏好）───────────────────────── */
  getLrcFont() {
    if (!this.available) return 'm';
    try { return normalizeLrcFont(this.storage.getItem(LRC_FONT_KEY)); } catch { return 'm'; }
  }

  setLrcFont(size) {
    const value = normalizeLrcFont(size);
    if (!this.available) return value;
    try { this.storage.setItem(LRC_FONT_KEY, value); } catch { /* ignore */ }
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