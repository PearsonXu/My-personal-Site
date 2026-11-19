/**
 * ui/me-ui.js — /me/ 页面：收藏 / 最近播放 / 当前队列（全部来自本机 localStorage）。
 */

import { escapeHtml as esc, escapeAttr as attr, formatTime } from '../core/util.js';
import { toast, download } from './common.js';
import { byId } from './dom.js';
import { icon } from '../core/icons.js';

export class MeUI {
  constructor(player, { resolve, link }) {
    this.player = player;
    this.resolve = resolve;
    this.link = link;
    player.on('favorites', () => this.render());
    player.on('queue', () => this.render());
    player.on('track', () => this.render());
  }

  rowHtml(song, extra = '') {
    return `<li class="row" data-song="${attr(song.slug)}">
      <button class="row__play" type="button" data-act="play-song" data-slug="${attr(song.slug)}" aria-label="播放 ${attr(song.title)}">${icon('play', { size: 20 })}</button>
      <a class="row__main" href="${attr(this.link(`songs/${song.slug}/`))}">
        <img class="row__art" src="${attr(this.resolve(song.cover))}" alt="" width="44" height="44" loading="lazy">
        <span class="row__txt"><span class="row__t">${esc(song.title)}</span><span class="row__a">${esc(song.artist)}${extra}</span></span>
      </a>
      <span class="row__al c-mute">${esc(song.albumTitle || '单曲')}</span>
      <span class="row__d">${formatTime(song.duration)}</span>
      <div class="acts">
        <button class="iact iact--sm" type="button" data-act="queue-next" data-slug="${attr(song.slug)}" aria-label="下一首播放">${icon('queue-next', { size: 18 })}</button>
        <button class="iact iact--sm" type="button" data-act="fav" data-slug="${attr(song.slug)}" aria-pressed="${this.player.isFavorite(song.slug)}" aria-label="收藏">${icon(this.player.isFavorite(song.slug) ? 'heart-filled' : 'heart', { size: 18 })}</button>
      </div>
    </li>`;
  }

  list(host, songs, emptyText) {
    if (!host) return;
    host.innerHTML = songs.length
      ? `<ol class="rows">${songs.map((s) => this.rowHtml(s)).join('')}</ol>`
      : `<div class="empty"><p class="empty__icon">${icon('note', { size: 32 })}</p><p class="empty__text">${emptyText}</p></div>`;
  }

  render() {
    const favHost = byId('favList');
    if (!favHost) return;
    const store = this.player.store;
    const songs = this.player.catalog.songs;
    const bySlug = new Map(songs.map((s) => [s.slug, s]));

    const favs = (store?.data.favorites || []).map((s) => bySlug.get(s)).filter(Boolean);
    const recent = (store?.data.recent || []).map((r) => bySlug.get(r.slug)).filter(Boolean);
    const queue = this.player.queueInfo().items.map((it) => it.song).filter(Boolean);

    this.list(favHost, favs, '还没有收藏。在任意歌曲上点心形图标即可。');
    this.list(byId('recentList'), recent, '还没有播放记录。');
    this.list(byId('queueList'), queue, '队列是空的。');

    const set = (id, n) => { const el = byId(id); if (el) el.textContent = String(n); };
    set('favCount', favs.length);
    set('recentCount', recent.length);
    set('queueCount', queue.length);
    this.player.ui?.markCurrent(this.player.currentSong?.slug || null);
  }

  exportLocal() {
    const json = this.player.store?.exportJson() || '{}';
    download('xuzhaoqing-music-local.json', json);
    toast('已导出本机数据（不含任何账号信息）', 'ok');
  }
}