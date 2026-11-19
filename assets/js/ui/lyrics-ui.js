/**
 * ui/lyrics-ui.js — 歌词渲染 / 高亮 / 自动滚动 / 点击跳转。
 *
 * 兼容三种形态：带时间轴 LRC、纯文本、无歌词（含纯音乐）。
 *
 * 自动跟随的滚动来源判定（修过两个真实故障）：
 *  1. 自己的 scrollTo 也会触发 scroll 事件 —— 若把它当用户滚动，自动跟随会自我暂停，
 *     可见行落后 audible 行一句以上。程序化滚动期间打标记（scrollend + 兜底定时器）忽略。
 *  2. 用户意图用 wheel / touchstart / pointerdown / 键盘翻页事件判定，比 scroll 更早也更准。
 * 用户手动滚动后停止跟随并显示「回到当前歌词」按钮；点击 / 拖动进度 / 切歌 / 重开面板恢复。
 * 只滚动歌词容器自己，绝不带动整页；尊重 prefers-reduced-motion。
 */

import { escapeHtml } from '../core/util.js';
import { isTimed } from '../core/lrc.js';
import { normalizeLrcFont } from '../store.js';
import { byId, qs, qsa, tgt } from './dom.js';

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
    this.pending = false;
    this.activeIndex = -1;
    this.backBtn = byId('plLyricsBack');
    this._followPaused = false;
    this._autoScroll = false;
    this._autoScrollTimer = null;

    const c = this.container;
    c?.addEventListener('scroll', () => {
      if (this._autoScroll) return; // 自动跟随自己产生的滚动，不算用户意图
      this._pauseFollow();
    }, { passive: true });
    // 用户意图事件：滚轮 / 触摸 / 指针（含拖滚动条）/ 键盘翻页
    for (const ev of ['wheel', 'touchstart', 'pointerdown']) {
      c?.addEventListener(ev, () => this._pauseFollow(), { passive: true });
    }
    c?.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].includes(e.key)) this._pauseFollow();
    });
    // scrollend 并非全平台都有（旧 Safari 没有）→ _scrollTo 里另有兜底定时器
    c?.addEventListener('scrollend', () => { this._autoScroll = false; }, { passive: true });
    c?.addEventListener('click', (e) => this._onClick(e));
    this.backBtn?.addEventListener('click', () => this._resumeFollow());

    player.on('lyrics', ({ song, lyrics, pending }) => this.render(song, lyrics, pending));
    player.on('lyric-line', ({ index }) => this.highlight(index));
    player.on('lyric-offset', ({ offset }) => this.renderOffset(offset));
    player.on('seek', () => this._reposition());
    player.on('track', ({ song }) => {
      this._resetFollow();
      if (!song) this.render(null, { format: 'none', lines: [] }, false);
    });

    // 字号偏好：当前浏览器保存，启动即恢复（只影响歌词文字）
    this.font = normalizeLrcFont(player.store?.getLrcFont?.());
    this._applyFont(this.font);
  }

  /* ── 字号（工具栏「小 / 中 / 大」）───────────────────── */
  /** 立即生效并持久化偏好；不触碰音频与时间轴 */
  setFont(size) {
    const value = normalizeLrcFont(size);
    this.player.store?.setLrcFont?.(value);
    this.font = value;
    this._applyFont(value);
    return value;
  }

  _applyFont(value) {
    if (this.container) this.container.dataset.font = value;
    for (const b of qsa('[data-act="lyric-font"]')) b.setAttribute('aria-pressed', String(b.dataset.size === value));
  }

  /* ── 自动跟随 ─────────────────────────────────────── */
  _resetFollow() {
    this._followPaused = false;
    this._autoScroll = false;
    clearTimeout(this._autoScrollTimer);
    if (this.backBtn) this.backBtn.hidden = true;
  }

  _pauseFollow() {
    if (!this.timed || !this.container || this._followPaused) return;
    this._followPaused = true;
    if (this.backBtn) this.backBtn.hidden = false;
  }

  _resumeFollow() {
    this._followPaused = false;
    if (this.backBtn) this.backBtn.hidden = true;
    this._scrollToCurrent();
  }

  /** 拖动进度 / seeked 落地：即使行号没变也立即定位，并恢复跟随 */
  _reposition() {
    if (!this.timed || !this.container) return;
    this._followPaused = false;
    if (this.backBtn) this.backBtn.hidden = true;
    this._scrollToCurrent();
  }

  /** 歌词面板重新可见（「词」按钮 / 展示模式 / 键盘 L）：立即回到当前行 */
  refollow() {
    if (!this.timed || !this.container) return;
    this._resumeFollow();
  }

  _scrollToCurrent() {
    if (!this.container) return;
    const node = this.activeIndex >= 0
      ? this.container.querySelector(`.lrc__line[data-i="${this.activeIndex}"]`)
      : null;
    const top = node
      ? node.offsetTop - this.container.clientHeight / 2 + node.clientHeight / 2
      : 0;
    this._scrollTo(Math.max(0, top));
  }

  _scrollTo(top) {
    const c = this.container;
    if (!c) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._autoScroll = true;
    clearTimeout(this._autoScrollTimer);
    this._autoScrollTimer = setTimeout(() => { this._autoScroll = false; }, reduce ? 80 : 900);
    if (typeof c.scrollTo === 'function') c.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    else c.scrollTop = top;
  }

  _onClick(e) {
    const li = tgt(e).closest('.lrc__line');
    if (!li || !this.timed) return;
    const t = Number(li.dataset.t);
    if (Number.isFinite(t)) {
      // seek 会发 'seek' 事件 → _reposition 恢复跟随并定位，这里不用手动清状态
      this.player.seek(t);
      if (this.player.state !== 'playing') this.player.play();
    }
  }

  render(song, lyrics, pending) {
    this.slug = song?.slug || null;
    this.lines = lyrics?.lines || [];
    this.timed = isTimed(lyrics);
    this.pending = !!pending;
    this.activeIndex = -1;
    this._resetFollow();
    // 歌词校准只对「已加载的带时间轴歌词」有意义，其余情况禁用（按钮仍可见）
    const canCalib = !!song && !pending && !lyrics?.error && this.timed && this.lines.length > 0;
    for (const b of qsa('.pl__calib__btn')) b.disabled = !canCalib;
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

  /** 校准量读数：正值 = 歌词提前（与 LRC [offset:] 同一约定） */
  renderOffset(offset) {
    const el = byId('plCalibVal');
    if (el) el.textContent = `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`;
  }

  highlight(index) {
    if (!this.container || !this.timed) return;
    if (index === this.activeIndex) return;
    const prev = this.container.querySelector('.lrc__line.is-active');
    prev?.classList.remove('is-active');
    this.activeIndex = index;
    // 首句之前：回到容器顶部（只滚容器，不带动整页）
    if (index < 0) {
      if (!this._followPaused) this._scrollTo(0);
      return;
    }
    const node = this.container.querySelector(`.lrc__line[data-i="${index}"]`);
    if (!node) return;
    node.classList.add('is-active');
    // 仅在当前行变化时滚动；用户手动滚动期间不打扰
    if (!this._followPaused) this._scrollToCurrent();
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