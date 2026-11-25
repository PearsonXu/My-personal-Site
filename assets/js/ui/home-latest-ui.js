/**
 * ui/home-latest-ui.js — 首页「最近分享」：自适应数量 + 换一换。
 *
 * 只负责 #latest 里的三个展示面板与「换一换」按钮：
 *  - 数量按容器实测宽度 / 实测网格列数计算（core/latest.js 的纯规则）；
 *  - ResizeObserver 盯容器宽度，MutationObserver 盯 data-view / 主题 / 布局，
 *    三者任一变化都只重算容量并保序补缩，不重新随机；
 *  - 「换一换」走 core/latest.js 的 nextBatch，未见过优先、批内不重复；
 *  - 重绘只替换面板 innerHTML，事件靠全局 data-act 委托，
 *    不重建播放器、不触碰 <audio>；重绘后同步当前播放高亮与收藏状态。
 */

import { escapeHtml as esc, escapeAttr as attr, formatTime } from '../core/util.js';
import { icon } from '../core/icons.js';
import { songSubline } from '../core/song-meta.js';
import { byId, qs, qsa } from './dom.js';
import { capacityFor, fitBatch, nextBatch } from '../core/latest.js';

export class HomeLatestUI {
  constructor(player, { catalog, resolve, link }) {
    this.player = player;
    this.catalog = catalog;
    this.resolve = resolve;
    this.link = link || ((p) => p);
    this.songs = new Map(catalog.songs.map((s) => [s.slug, s]));
    this.all = catalog.songs.map((s) => s.slug);
    /** 当前批次（slug 有序数组）；跨路由 / 跨展示模式保留 */
    this.batch = [];
    /** 本轮已经出现过的歌 */
    this.seen = new Set();
    this.box = null;
    this._ro = null;
    this._mo = null;
    this._moHtml = null;
    this._lastWidth = -1;
    this._lastSig = '';
  }

  /** 每次路由进入页面时调用；离开首页时拆掉观察器 */
  mount() {
    const box = qs('[data-viewbox="home"]');
    if (!box) { this._teardown(); return; }
    if (box === this.box) { this.update(); return; }
    this._teardown();
    this.box = box;
    if (!this.batch.length) {
      // 首批沿用构建期预渲染（已按更新日期倒序），无 JS 首帧与增强后一致
      const pane = qs('[data-viewpane="list"]', box);
      const dom = pane ? qsa('[data-song]', pane).map((n) => n.dataset.song).filter((s) => this.songs.has(s)) : [];
      this.batch = dom.length ? dom : this.all.slice(0, 6);
      this.seen = new Set(this.batch);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => {
        // 高度随内容变化也会触发：只有宽度变了才重算，避免自反馈环。
        // ★ 重绘推迟到下一帧：在 RO 回调里同步改 DOM 会引起同帧再次布局
        //   （例如滚动条出现导致宽度变化），浏览器报 "ResizeObserver loop…"。
        if (this._roFrame) return;
        const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
        this._roFrame = raf(() => {
          this._roFrame = 0;
          const w = this.box?.clientWidth || 0;
          if (w !== this._lastWidth) this.update();
        });
      });
      this._ro.observe(box);
    }
    if (typeof MutationObserver !== 'undefined') {
      // 展示模式可能由 LibraryUI / 主题预设改，不只在点击处挂钩
      this._mo = new MutationObserver(() => this.update());
      this._mo.observe(box, { attributes: true, attributeFilter: ['data-view'] });
      // 主题改卡片圆角 / 间距、布局改列宽：宽度不变也要重测列数
      this._moHtml = new MutationObserver(() => this.update());
      this._moHtml.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-layout'] });
    }
    this.update();
  }

  _teardown() {
    this._ro?.disconnect();
    this._mo?.disconnect();
    this._moHtml?.disconnect();
    this._ro = this._mo = this._moHtml = null;
    this._roFrame = 0;
    this.box = null;
    this._lastWidth = -1;
  }

  /** 实测当前面板的网格列数；隐藏面板 / 无布局环境拿不到已解析轨道时返回 0（走宽度回退） */
  measureCols(view) {
    const grid = qs(`[data-viewpane="${view}"] .grid--cards`, this.box);
    if (!grid || typeof getComputedStyle !== 'function') return 0;
    const tpl = String(getComputedStyle(grid).gridTemplateColumns || '');
    const tracks = tpl.split(/\s+/).filter(Boolean);
    if (!tracks.length || !tracks.every((t) => /^[\d.]+px$/.test(t))) return 0;
    return tracks.length;
  }

  /** 重算容量 → 保序补缩 → 必要时重绘。幂等：批次没变就不动 DOM。 */
  update() {
    const box = this.box;
    if (!box || !box.isConnected) return;
    const width = box.clientWidth || 0;
    const view = ['list', 'grid', 'vinyl'].includes(box.dataset.view) ? box.dataset.view : 'list';
    const cols = view === 'list' ? 0 : this.measureCols(view);
    const capacity = Math.min(capacityFor(width, view, cols), this.all.length);
    this.batch = fitBatch(this.batch, this.all, capacity, this.seen);
    for (const s of this.batch) this.seen.add(s);
    this._lastWidth = width;
    const sig = this.batch.join(',');
    if (sig !== this._lastSig) {
      this._render();
      this._lastSig = sig;
    }
    // 所有歌都已同时展示时「换一换」没有意义，直接隐藏
    const btn = byId('latestShuffle');
    if (btn) btn.hidden = capacity >= this.all.length;
  }

  /** 换一批：保持当前展示模式与数量，只换歌；播放状态不受影响 */
  shuffle() {
    if (!this.box || this.all.length <= this.batch.length) return;
    const { batch, seen } = nextBatch(this.all, this.batch, this.batch.length, this.seen);
    this.batch = batch;
    this.seen = seen;
    this._render();
    this._lastSig = batch.join(',');
  }


  _render() {
    const box = this.box;
    if (!box) return;
    const songs = this.batch.map((s) => this.songs.get(s)).filter(Boolean);
    const listPane = qs('[data-viewpane="list"]', box);
    const gridPane = qs('[data-viewpane="grid"]', box);
    const vinylPane = qs('[data-viewpane="vinyl"]', box);
    if (listPane) listPane.innerHTML = `<ol class="rows">${songs.map((s) => this.rowHtml(s)).join('\n')}</ol>`;
    const cards = `<div class="grid grid--cards">${songs.map((s) => this.cardHtml(s)).join('\n')}</div>`;
    if (gridPane) gridPane.innerHTML = cards;
    if (vinylPane) vinylPane.innerHTML = cards;
    this.player.ui?.markCurrent(this.player.currentSong?.slug || null);
    this.player.ui?.refreshFavorites();
  }

  demoBadge(song) {
    return song.demo ? '<span class="badge badge--demo" title="工程验证用合成音源，不是站长作品">DEMO</span>' : '';
  }

  actionsHtml(slug) {
    const on = this.player.isFavorite(slug);
    return `<div class="acts">
      <button class="iact iact--sm" type="button" data-act="queue-next" data-slug="${attr(slug)}" aria-label="下一首播放" title="下一首播放">${icon('queue-next', { size: 18 })}</button>
      <button class="iact iact--sm" type="button" data-act="queue-last" data-slug="${attr(slug)}" aria-label="添加到队列末尾" title="添加到队列末尾">${icon('plus', { size: 18 })}</button>
      <button class="iact iact--sm" type="button" data-act="fav" data-slug="${attr(slug)}" aria-label="收藏" title="收藏" aria-pressed="${on}">${icon(on ? 'heart-filled' : 'heart', { size: 18 })}</button>
    </div>`;
  }

  rowHtml(song) {
    const href = this.link(`songs/${song.slug}/`);
    const album = song.album
      ? `<a class="row__al" href="${attr(this.link(`albums/${song.album}/`))}">${esc(song.albumTitle || song.album)}</a>`
      : '<span class="row__al" aria-hidden="true"></span>';
    return `<li class="row" data-song="${attr(song.slug)}">
      <button class="row__play" type="button" data-act="play-song" data-slug="${attr(song.slug)}" aria-label="播放 ${attr(song.title)}">${icon('play', { size: 20 })}</button>
      <a class="row__main" href="${attr(href)}">
        <img class="row__art" src="${attr(this.resolve(song.thumb || song.cover))}" alt="" width="44" height="44" loading="lazy" decoding="async">
        <span class="row__txt">
          <span class="row__t">${esc(song.title)}${this.demoBadge(song)}</span>
          <span class="row__a">${esc(songSubline(song))}</span>
        </span>
      </a>
      ${album}
      <span class="row__d">${formatTime(song.duration)}</span>
      ${this.actionsHtml(song.slug)}
    </li>`;
  }

  cardHtml(song) {
    const href = this.link(`songs/${song.slug}/`);
    return `<article class="card" data-song="${attr(song.slug)}">
      <a class="card__link" href="${attr(href)}">
        <span class="card__art"><img src="${attr(this.resolve(song.thumb || song.cover))}" alt="${attr(song.title)} 封面" width="300" height="300" loading="lazy" decoding="async"></span>
        <span class="card__t">${esc(song.title)}${this.demoBadge(song)}</span>
        <span class="card__s">${esc(songSubline(song))}</span>
      </a>
      <button class="card__play" type="button" data-act="play-song" data-slug="${attr(song.slug)}" aria-label="播放 ${attr(song.title)}">${icon('play', { size: 20 })}</button>
      ${this.actionsHtml(song.slug)}
    </article>`;
  }
}
