/**
 * ui/lyrics-ui.js — 歌词渲染 / 高亮 / 自动滚动 / 点击跳转。
 *
 * 兼容三种形态：带时间轴 LRC、纯文本、无歌词（含纯音乐）。
 * 自动滚动在用户手动滚动后暂停 4 秒，避免「想看上一句却被拽回去」。
 */

import { escapeHtml } from '../core/util.js';
import { isTimed } from '../core/lrc.js';
import { byId, qs, tgt } from './dom.js';

const EMPTY_TEXT = {
  instrumental: '纯音乐 · 这首没有歌词',
  none: '暂无歌词',
  text: '纯文本歌词 · 没有时间轴，不做逐句高亮',
  loading: '歌词加载中…',
  error: '歌词读取失败（可能是网络或跨域限制），播放不受影响'
};

export class LyricsUI {
  constructor(player) {
    this.player = player;
    this.container = byId('plLyrics');
    this.slug = null;
    this.lines = [];
    this.timed = false;
    this.activeIndex = -1;
    this._userScrollUntil = 0;

    this.container?.addEventListener('scroll', () => { this._userScrollUntil = Date.now() + 4000; }, { passive: true });
    this.container?.addEventListener('click', (e) => this._onClick(e));

    player.on('lyrics', ({ song, lyrics, pending }) => this.render(song, lyrics, pending));
    player.on('lyric-line', ({ index }) => this.highlight(index));
    player.on('track', ({ song }) => { if (!song) this.render(null, { format: 'none', lines: [] }, false); });
  }

  _onClick(e) {
    const li = tgt(e).closest('.lrc__line');
    if (!li || !this.timed) return;
    const t = Number(li.dataset.t);
    if (Number.isFinite(t)) {
      this._userScrollUntil = 0;
      this.player.seek(t);
      if (this.player.state !== 'playing') this.player.play();
    }
  }

  render(song, lyrics, pending) {
    this.slug = song?.slug || null;
    this.lines = lyrics?.lines || [];
    this.timed = isTimed(lyrics);
    this.activeIndex = -1;
    if (!this.container) return;

    if (!song) { this.container.innerHTML = `<p class="lyrics-empty">${EMPTY_TEXT.none}</p>`; return; }
    if (pending) { this.container.innerHTML = `<p class="lyrics-empty">${EMPTY_TEXT.loading}</p>`; return; }
    if (lyrics?.error) { this.container.innerHTML = `<p class="lyrics-empty">${EMPTY_TEXT.error}</p>`; return; }
    if (song.instrumental) { this.container.innerHTML = `<p class="lyrics-empty">${EMPTY_TEXT.instrumental}</p>`; return; }
    if (!this.lines.length) { this.container.innerHTML = `<p class="lyrics-empty">${EMPTY_TEXT.none}</p>`; return; }

    const head = this.timed ? '' : `<p class="lyrics-empty">${EMPTY_TEXT.text}</p>`;
    const items = this.lines.map((line, i) => this.timed
      ? `<li class="lrc__line" data-i="${i}" data-t="${line.time}">${escapeHtml(line.text) || '&nbsp;'}</li>`
      : `<li class="lrc__line lrc__line--plain" data-i="${i}">${escapeHtml(line.text)}</li>`).join('');
    this.container.innerHTML = `${head}<ol class="lrc${this.timed ? '' : ' lrc--plain'}">${items}</ol>`;
    this.container.scrollTop = 0;
  }

  highlight(index) {
    if (!this.container || !this.timed) return;
    if (index === this.activeIndex) return;
    const prev = this.container.querySelector('.lrc__line.is-active');
    prev?.classList.remove('is-active');
    this.activeIndex = index;
    if (index < 0) return;
    const node = this.container.querySelector(`.lrc__line[data-i="${index}"]`);
    if (!node) return;
    node.classList.add('is-active');
    if (Date.now() < this._userScrollUntil) return;
    const target = node.offsetTop - this.container.clientHeight / 2 + node.clientHeight / 2;
    this.container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }
}

/** 单曲页内嵌歌词：点击跳转 + 跟随高亮（与全屏歌词共用同一份时间轴） */
export function bindPageLyrics(player) {
  const list = qs('[data-lrc]');
  if (!list) return;
  list.addEventListener('click', (e) => {
    const li = tgt(e).closest('.lrc__line');
    if (!li || list.dataset.timed !== 'true') return;
    const slug = list.dataset.lrc;
    const t = Number(li.dataset.t);
    if (!Number.isFinite(t)) return;
    if (player.currentSong?.slug !== slug) {
      player.playSong(slug).then(() => player.seek(t));
    } else {
      player.seek(t);
      if (player.state !== 'playing') player.play();
    }
  });

  const sync = () => {
    const active = player.currentSong?.slug === list.dataset.lrc;
    for (const li of list.querySelectorAll('.lrc__line')) li.classList.remove('is-active');
    if (!active || player.lyricIndex < 0) return;
    const node = list.querySelectorAll('.lrc__line')[player.lyricIndex];
    node?.classList.add('is-active');
  };
  player.on('lyric-line', sync);
  player.on('track', sync);
}