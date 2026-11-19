/**
 * core/queue.js — 播放队列 / 播放模式 / 洗牌袋 / 播放历史。
 *
 * 设计要点（对应工程要求）：
 *  - 每个队列项都有独立 id，同一首歌重复入队是两个不同的项；
 *  - 随机播放用「洗牌袋」：一轮之内绝不重复，袋空才重填，重填时排除当前曲避免立刻重复；
 *  - 上一首走真实播放历史（history），不是「下标减一」；
 *  - 纯数据结构，不碰 DOM / audio，可在 Node 里完整单测。
 */

import { createIdFactory } from './util.js';

export const MODES = ['order', 'repeat-all', 'repeat-one', 'shuffle'];

export const MODE_LABELS = {
  order: '顺序播放',
  'repeat-all': '列表循环',
  'repeat-one': '单曲循环',
  shuffle: '随机播放'
};

const HISTORY_LIMIT = 200;

export class PlayQueue {
  constructor(options = {}) {
    this.rng = typeof options.rng === 'function' ? options.rng : Math.random;
    this._newId = options.idFactory || createIdFactory('qi');
    this.items = [];
    this.cursor = -1;
    this.mode = MODES.includes(options.mode) ? options.mode : 'order';
    /** 已播放过的队列项 id，最后一项 = 当前 */
    this.history = [];
    /** 本轮随机播放尚未播过的队列项 id */
    this.bag = [];
    if (Array.isArray(options.items) && options.items.length) {
      this.items = options.items
        .filter((it) => it && typeof it.slug === 'string')
        .map((it) => ({ id: typeof it.id === 'string' ? it.id : this._newId(), slug: it.slug }));
      this.cursor = Number.isInteger(options.cursor) ? options.cursor : -1;
      if (this.cursor < -1 || this.cursor >= this.items.length) this.cursor = -1;
      this.history = Array.isArray(options.history) ? options.history.slice(-HISTORY_LIMIT) : [];
      this.bag = Array.isArray(options.bag) ? options.bag.slice() : [];
      this._pruneRefs();
      if (this.cursor >= 0 && this.history[this.history.length - 1] !== this.items[this.cursor].id) {
        this._pushHistory(this.items[this.cursor].id);
      }
      if (this.mode === 'shuffle' && this.bag.length === 0) this._refillBag();
    }
  }

  /* ── 内部 ───────────────────────────────────────────── */

  _pushHistory(id) {
    if (!id) return;
    if (this.history[this.history.length - 1] === id) return;
    this.history.push(id);
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
  }

  _indexOfId(id) {
    return this.items.findIndex((it) => it.id === id);
  }

  _pruneRefs() {
    const alive = new Set(this.items.map((it) => it.id));
    this.history = this.history.filter((id) => alive.has(id));
    this.bag = this.bag.filter((id) => alive.has(id));
  }

  _refillBag() {
    const currentId = this.current()?.id;
    this.bag = this.items.map((it) => it.id).filter((id) => id !== currentId);
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    }
  }

  _takeFromBag() {
    this._pruneRefs();
    if (this.bag.length === 0) this._refillBag();
    if (this.bag.length === 0) return null;
    const id = this.bag.shift();
    const index = this._indexOfId(id);
    return index >= 0 ? index : null;
  }

  _setCursor(index) {
    this.cursor = index;
    if (index >= 0) {
      const id = this.items[index].id;
      this._pushHistory(id);
      this.bag = this.bag.filter((bid) => bid !== id);
    }
    return this.current();
  }

  /* ── 读取 ───────────────────────────────────────────── */

  get length() { return this.items.length; }

  current() {
    return this.cursor >= 0 && this.cursor < this.items.length ? this.items[this.cursor] : null;
  }

  at(index) {
    return index >= 0 && index < this.items.length ? this.items[index] : null;
  }

  byId(id) {
    const i = this._indexOfId(id);
    return i >= 0 ? this.items[i] : null;
  }

  /** 在当前模式下「下一首会是谁」，不改变任何状态。用于 UI 预告。 */
  peekNext() {
    if (this.items.length === 0 || this.cursor < 0) return null;
    if (this.mode === 'repeat-one') return this.current();
    if (this.mode === 'shuffle') {
      const alive = this.bag.filter((id) => this._indexOfId(id) >= 0);
      if (alive.length) return this.byId(alive[0]);
      const currentId = this.current().id;
      const others = this.items.filter((it) => it.id !== currentId);
      return others.length ? others[0] : this.current();
    }
    const next = this.cursor + 1;
    if (next < this.items.length) return this.items[next];
    return this.mode === 'repeat-all' ? this.items[0] : null;
  }
  /* ── 结构性修改 ─────────────────────────────────────── */

  /** 用一组 slug 整体替换队列（播放专辑 / 歌单 / 搜索结果） */
  replace(slugs, startIndex = 0) {
    const list = (Array.isArray(slugs) ? slugs : []).filter((s) => typeof s === 'string' && s);
    this.items = list.map((slug) => ({ id: this._newId(), slug }));
    this.history = [];
    this.bag = [];
    this.cursor = -1;
    if (this.items.length) {
      const idx = Math.min(Math.max(0, startIndex | 0), this.items.length - 1);
      this._setCursor(idx);
      if (this.mode === 'shuffle') this._refillBag();
    }
    return this.current();
  }

  /** 添加为「下一首」；队列为空时直接成为当前曲 */
  addNext(slug) {
    if (!slug) return null;
    const item = { id: this._newId(), slug };
    const at = this.cursor >= 0 ? this.cursor + 1 : 0;
    this.items.splice(at, 0, item);
    if (this.cursor < 0) this._setCursor(0);
    else if (this.mode === 'shuffle') this.bag.push(item.id);
    return item;
  }

  /** 添加到队列末尾 */
  addLast(slug) {
    if (!slug) return null;
    const item = { id: this._newId(), slug };
    this.items.push(item);
    if (this.cursor < 0) this._setCursor(0);
    else if (this.mode === 'shuffle') this.bag.push(item.id);
    return item;
  }

  /** 批量追加（歌单 / 专辑「加入队列」） */
  addMany(slugs, position = 'last') {
    const added = [];
    for (const slug of Array.isArray(slugs) ? slugs : []) {
      added.push(position === 'next' ? this.addNext(slug) : this.addLast(slug));
    }
    return added.filter(Boolean);
  }

  /** 删除队列项。返回 removedCurrent 让播放器决定是否接下一首。 */
  remove(id) {
    const index = this._indexOfId(id);
    if (index < 0) return { removed: false, removedCurrent: false };
    const removedCurrent = index === this.cursor;
    this.items.splice(index, 1);
    if (index < this.cursor) this.cursor -= 1;
    if (removedCurrent) {
      if (this.items.length === 0) this.cursor = -1;
      else if (this.cursor >= this.items.length) this.cursor = this.items.length - 1;
    }
    this._pruneRefs();
    if (this.cursor >= 0 && this.history[this.history.length - 1] !== this.items[this.cursor].id) {
      this._pushHistory(this.items[this.cursor].id);
    }
    return { removed: true, removedCurrent };
  }

  /** 拖拽 / 按钮排序 */
  move(from, to) {
    if (from === to) return false;
    if (from < 0 || from >= this.items.length) return false;
    const target = Math.min(Math.max(0, to), this.items.length - 1);
    const currentId = this.current()?.id;
    const [item] = this.items.splice(from, 1);
    this.items.splice(target, 0, item);
    if (currentId) this.cursor = this._indexOfId(currentId);
    return true;
  }

  clear() {
    this.items = [];
    this.cursor = -1;
    this.history = [];
    this.bag = [];
  }

  /** 跳到队列中的某一项（点击队列列表） */
  jump(id) {
    const index = this._indexOfId(id);
    if (index < 0) return null;
    return this._setCursor(index);
  }

  setMode(mode) {
    if (!MODES.includes(mode) || mode === this.mode) return this.mode;
    this.mode = mode;
    if (mode === 'shuffle') this._refillBag();
    else this.bag = [];
    return this.mode;
  }

  cycleMode() {
    const i = MODES.indexOf(this.mode);
    return this.setMode(MODES[(i + 1) % MODES.length]);
  }
  /* ── 前进 / 后退 ────────────────────────────────────── */

  /**
   * 前进。auto=true 表示「当前曲自然播完」触发，false 表示用户点了下一首。
   * 返回队列项或 null（null = 队列到头，播放器应停止而不是偷偷循环）。
   */
  advance({ auto = false } = {}) {
    if (this.items.length === 0 || this.cursor < 0) return null;
    if (auto && this.mode === 'repeat-one') return this.current();

    let index;
    if (this.mode === 'shuffle') {
      index = this._takeFromBag();
      if (index === null) return null;
    } else {
      index = this.cursor + 1;
      if (index >= this.items.length) {
        if (this.mode === 'order') return null;
        index = 0; // repeat-all，以及 repeat-one 下的手动下一首
      }
    }
    return this._setCursor(index);
  }

  /**
   * 后退：严格走播放历史。
   * 返回 { item, restart }：restart=true 表示没有更早的历史，应当重播当前曲。
   */
  back() {
    const cur = this.current();
    if (!cur) return { item: null, restart: false };
    const alive = this.history.filter((id) => this._indexOfId(id) >= 0);
    const pos = alive.lastIndexOf(cur.id);
    if (pos > 0) {
      const prevId = alive[pos - 1];
      this.history = alive.slice(0, pos); // 丢弃当前及其后，prev 成为新的末尾
      const index = this._indexOfId(prevId);
      this.cursor = index;
      this.bag = this.bag.filter((bid) => bid !== prevId);
      return { item: this.items[index], restart: false };
    }
    return { item: cur, restart: true };
  }

  /* ── 持久化 ─────────────────────────────────────────── */

  snapshot() {
    return {
      items: this.items.map((it) => ({ id: it.id, slug: it.slug })),
      cursor: this.cursor,
      mode: this.mode,
      history: this.history.slice(-HISTORY_LIMIT),
      bag: this.bag.slice()
    };
  }

  static restore(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') return new PlayQueue(options);
    return new PlayQueue({ ...options, ...snapshot });
  }
}