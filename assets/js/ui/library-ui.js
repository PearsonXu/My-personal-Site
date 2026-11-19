/**
 * ui/library-ui.js — 曲库搜索 / 标签筛选 / 展示模式。
 *
 * 搜索走构建期生成的精简索引（歌名 / 专辑 / 标签 / 歌词全文），
 * 不预加载任何音频。首屏 HTML 已经预渲染好完整列表，JS 只做增强。
 */

import { escapeHtml as esc, escapeAttr as attr, formatTime, debounce } from '../core/util.js';
import { searchSongs, lyricSnippet } from '../core/search.js';
import { byId, qsa, qs } from './dom.js';

export class LibraryUI {
  constructor(player, { catalog, searchIndex, resolve, link }) {
    this.player = player;
    this.catalog = catalog;
    this.index = searchIndex?.entries || [];
    this.resolve = resolve;
    this.link = link || ((p) => p);
    this.songs = new Map(catalog.songs.map((s) => [s.slug, s]));
    this.query = '';
    this.tag = '';
    this.view = player.store?.data?.view || 'list';
    this.visible = catalog.songs.map((s) => s.slug);
    this._debounced = debounce(() => this.apply(), 160);
  }

  /** 每次路由进入页面时调用；页面 DOM 是新的，但本对象与播放器不变 */
  mount() {
    const input = byId('libSearch');
    if (input) {
      input.value = this.query;
      input.addEventListener('input', () => {
        this.query = input.value;
        const clear = qs('[data-act="clear-search"]');
        if (clear) clear.hidden = !this.query;
        this._debounced();
      });
    }
    const params = new URLSearchParams(location.search);
    const tag = params.get('tag');
    if (tag) this.tag = tag;
    this.syncViewButtons();
    this.apply();
  }

  setView(view, { lock = true } = {}) {
    this.view = ['list', 'grid', 'vinyl'].includes(view) ? view : 'list';
    if (lock) this.player.store?.save({ view: this.view, viewLocked: true }, { immediate: true });
    else this.player.store?.save({ view: this.view });
    for (const box of qsa('[data-viewbox]')) {
      box.dataset.view = this.view;
      for (const pane of box.querySelectorAll('[data-viewpane]')) {
        pane.hidden = pane.dataset.viewpane !== this.view;
      }
    }
    this.syncViewButtons();
  }

  syncViewButtons() {
    for (const btn of qsa('[data-act="set-view"]')) {
      const on = btn.dataset.view === this.view;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    for (const btn of qsa('[data-act="filter-tag"]')) {
      const on = (btn.dataset.tag || '') === this.tag;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  setTag(tag) { this.tag = tag || ''; this.syncViewButtons(); this.apply(); }

  clearSearch() {
    this.query = '';
    const input = byId('libSearch');
    if (input) input.value = '';
    const clear = qs('[data-act="clear-search"]');
    if (clear) clear.hidden = true;
    this.apply();
  }

  computeVisible() {
    let slugs;
    if (this.query.trim()) slugs = searchSongs(this.index, this.query, { limit: 500 }).map((r) => r.slug);
    else slugs = this.catalog.songs.map((s) => s.slug);
    if (this.tag) slugs = slugs.filter((slug) => (this.songs.get(slug)?.tags || []).includes(this.tag));
    return slugs;
  }

  apply() {
    const listHost = byId('libList');
    if (!listHost) return;
    this.visible = this.computeVisible();
    const songs = this.visible.map((s) => this.songs.get(s)).filter(Boolean);
    const gridHost = byId('libGrid');
    const vinylHost = byId('libVinyl');
    const empty = byId('libEmpty');
    const count = byId('libCount');

    listHost.innerHTML = songs.length ? `<ol class="rows">${songs.map((s) => this.rowHtml(s)).join('')}</ol>` : '';
    if (gridHost) gridHost.innerHTML = songs.length ? `<div class="grid grid--cards">${songs.map((s) => this.cardHtml(s)).join('')}</div>` : '';
    if (vinylHost) vinylHost.innerHTML = gridHost ? gridHost.innerHTML : '';
    if (empty) empty.hidden = songs.length > 0;
    if (count) {
      const bits = [`${songs.length} 首`];
      if (this.query.trim()) bits.push(`搜索「${this.query.trim()}」`);
      if (this.tag) bits.push(`标签 #${this.tag}`);
      count.textContent = bits.join(' · ');
    }
    this.player.ui?.markCurrent(this.player.currentSong?.slug || null);
    this.player.ui?.refreshFavorites();
  }
  demoBadge(song) {
    return song.demo ? '<span class="badge badge--demo" title="工程验证用合成音源，不是站长作品">DEMO</span>' : '';
  }

  actionsHtml(slug) {
    return `<div class="acts">
      <button class="iact iact--sm" type="button" data-act="queue-next" data-slug="${attr(slug)}" aria-label="下一首播放" title="下一首播放"><span aria-hidden="true">⤒</span></button>
      <button class="iact iact--sm" type="button" data-act="queue-last" data-slug="${attr(slug)}" aria-label="添加到队列末尾" title="添加到队列末尾"><span aria-hidden="true">＋</span></button>
      <button class="iact iact--sm" type="button" data-act="fav" data-slug="${attr(slug)}" aria-label="收藏" aria-pressed="${this.player.isFavorite(slug)}"><span aria-hidden="true">${this.player.isFavorite(slug) ? '♥' : '♡'}</span></button>
    </div>`;
  }

  rowHtml(song) {
    const href = this.link(`songs/${song.slug}/`);
    const album = song.album
      ? `<a class="row__al" href="${attr(this.link(`albums/${song.album}/`))}">${esc(song.albumTitle || song.album)}</a>`
      : '<span class="row__al c-mute">单曲</span>';
    const snippet = this.query.trim() ? lyricSnippet(this.index.find((e) => e.s === song.slug)?.ly, this.query) : '';
    return `<li class="row" data-song="${attr(song.slug)}">
      <button class="row__play" type="button" data-act="play-song" data-slug="${attr(song.slug)}" aria-label="播放 ${attr(song.title)}"><span aria-hidden="true">▶</span></button>
      <a class="row__main" href="${attr(href)}">
        <img class="row__art" src="${attr(this.resolve(song.cover))}" alt="" width="44" height="44" loading="lazy" decoding="async">
        <span class="row__txt">
          <span class="row__t">${esc(song.title)}${this.demoBadge(song)}</span>
          <span class="row__a">${esc(snippet || song.artist)}</span>
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
        <span class="card__art"><img src="${attr(this.resolve(song.cover))}" alt="${attr(song.title)} 封面" width="300" height="300" loading="lazy" decoding="async"></span>
        <span class="card__t">${esc(song.title)}${this.demoBadge(song)}</span>
        <span class="card__s">${esc(song.artist)}</span>
      </a>
      <button class="card__play" type="button" data-act="play-song" data-slug="${attr(song.slug)}" aria-label="播放 ${attr(song.title)}"><span aria-hidden="true">▶</span></button>
      ${this.actionsHtml(song.slug)}
    </article>`;
  }

  /** 「播放当前列表 / 当前列表加入队列」用的就是筛选后的结果 */
  visibleSlugs() { return this.visible.slice(); }
}