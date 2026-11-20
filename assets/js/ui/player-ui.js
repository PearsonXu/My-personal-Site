/**
 * ui/player-ui.js — 把播放器状态映射到持久 DOM。
 * 这里只**更新**已存在的节点，从不重建播放器结构。
 */

import { formatTime } from '../core/util.js';
import { MODE_LABELS } from '../core/queue.js';
import { MODE_ICON, STAGE_ICON, icon } from '../core/icons.js';
import { setText, setSvg, paintRange, toast } from './common.js';
import { byId, qsa } from './dom.js';

const STAGES = ['cover', 'vinyl', 'lyrics'];

export class PlayerUI {
  constructor(player, { resolve }) {
    this.player = player;
    this.resolve = resolve;
    this.root = byId('player-root');
    this.seeking = false;
    this.stage = player.store?.data?.stage || 'cover';
    /** 「词」三态循环里工具栏的开关（纯享=false / 设置=true）。
     *  运行时状态，不持久化：刷新 / 收起后第一次点「词」永远回到纯享。
     *  字号偏好（按浏览器）与校准偏移（按歌曲）各自持久化，不受三态切换影响。 */
    this.lyricsTools = false;
    /** @type {null | ((stage: string) => void)} 由 app.js 注入：歌词面板重新可见时立即定位当前行 */
    this.onStageChange = null;

    this.el = {
      cover: byId('plCover'),
      bigCover: byId('plBigCover'),
      seek: byId('plSeek'),
      seekFull: byId('plSeekFull'),
      vol: byId('plVol'),
      full: byId('plFull'),
      stage: byId('plStage')
    };

    this._bindControls();
    this._bindPlayer();
    this.setStage(player.store?.data?.stage || 'cover', { lock: false });
    this._applyVolumeSupport();
    this.refreshFavorites();
  }

  _bindControls() {
    const p = this.player;
    for (const input of [this.el.seek, this.el.seekFull]) {
      if (!input) continue;
      input.addEventListener('input', () => {
        this.seeking = true;
        paintRange(input);
        const dur = p.duration || p.currentSong?.duration || 0;
        const t = (Number(input.value) / 1000) * dur;
        setText(input === this.el.seek ? 'plCur' : 'plCurFull', formatTime(t));
      });
      const commit = () => { this.seeking = false; p.seekRatio(Number(input.value) / 1000); };
      input.addEventListener('change', commit);
      input.addEventListener('pointerup', commit);
      input.addEventListener('keyup', commit);
    }
    this.el.vol?.addEventListener('input', () => {
      this.player.setVolume(Number(this.el.vol.value) / 100);
      paintRange(this.el.vol);
    });
  }

  _bindPlayer() {
    const p = this.player;
    p.on('track', ({ song }) => this.renderTrack(song));
    p.on('state', ({ state, detail }) => this.renderState(state, detail));
    p.on('time', (info) => this.renderTime(info));
    p.on('volume', (v) => this.renderVolume(v));
    p.on('queue', (q) => this.renderQueue(q));
    p.on('favorites', () => this.refreshFavorites());
    p.on('error', ({ message }) => toast(message, 'bad', 4000));
  }

  renderTrack(song) {
    const cover = song ? this.resolve(song.cover) : this.resolve('assets/img/placeholder.svg');
    if (this.el.cover) this.el.cover.src = cover;
    if (this.el.bigCover) this.el.bigCover.src = cover;
    setText('plTitle', song ? song.title : '还没有在播放');
    setText('plSub', song ? `${song.artist}${song.demo ? ' · DEMO 测试音' : ''}` : '挑一首歌开始 · 免登录试听');
    setText('plFullTitle', song ? song.title : '还没有在播放');
    setText('plFullArtist', song ? song.artist : '—');
    this.markCurrent(song?.slug || null);
    this.refreshFavorites();
    for (const input of [this.el.seek, this.el.seekFull]) {
      if (input) { input.disabled = !song; input.value = '0'; paintRange(input); }
    }
  }

  renderState(state, detail) {
    if (this.root) this.root.dataset.state = state;
    // 播放 / 暂停图标由 CSS 按 data-state 切换（两个 SVG 都已渲染，盒子不动 → 不跳位）
    const label = state === 'playing' || state === 'buffering' ? '暂停' : '播放';
    for (const id of ['plToggle', 'plToggleFull']) {
      const btn = byId(id);
      if (!btn) continue;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-pressed', String(label === '暂停'));
    }
    const fallback = { loading: '加载中…', buffering: '缓冲中…', error: '播放出错', blocked: '浏览器拦截了自动播放，请点一下播放按钮' };
    const text = detail || fallback[state] || '';
    setText('plState', text);
    setText('plStateFull', text);
    this.markCurrent(this.player.currentSong?.slug || null);
  }
  renderTime({ currentTime, duration }) {
    setText('plCur', formatTime(currentTime));
    setText('plCurFull', formatTime(currentTime));
    setText('plDur', formatTime(duration));
    setText('plDurFull', formatTime(duration));
    if (this.seeking || !duration) return;
    const value = String(Math.round((currentTime / duration) * 1000));
    for (const input of [this.el.seek, this.el.seekFull]) {
      if (input && input.value !== value) { input.value = value; paintRange(input); }
    }
  }

  renderVolume({ volume, muted }) {
    if (this.el.vol) { this.el.vol.value = String(Math.round(volume * 100)); paintRange(this.el.vol); }
    setSvg('plMute', muted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume', 22);
  }

  renderQueue(q) {
    for (const id of ['plMode', 'plModeFull']) {
      const node = byId(id);
      if (!node) continue;
      setSvg(id, MODE_ICON[q.mode], 22);
      node.setAttribute('aria-label', `播放模式：${MODE_LABELS[q.mode]}（点击切换）`);
      node.setAttribute('title', `播放模式：${MODE_LABELS[q.mode]}`);
      node.classList.toggle('is-active', q.mode !== 'order');
    }
    byId('plQueueBtn')?.setAttribute('title', `播放队列（${q.items.length} 首）`);
  }

  refreshFavorites() {
    const cur = this.player.currentSong?.slug;
    for (const btn of qsa('[data-act="fav"],[data-act="toggle-fav"]')) {
      const slug = btn.dataset.slug || cur;
      if (!slug) continue;
      const on = this.player.isFavorite(slug);
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-on', on);
      // 只替换图标本身，保留按钮里的文字（例如单曲页的「收藏」）
      const size = btn.classList.contains('pbtn') ? 22 : 18;
      const svg = btn.querySelector('svg.icon');
      const html = icon(on ? 'heart-filled' : 'heart', { size });
      if (svg) svg.outerHTML = html;
      else btn.insertAdjacentHTML('afterbegin', html);
    }
  }

  markCurrent(slug) {
    for (const node of qsa('[data-song]')) {
      node.classList.toggle('is-current', !!slug && node.dataset.song === slug);
    }
  }

  _applyVolumeSupport() {
    if (this.player.volumeSupported) { paintRange(this.el.vol); return; }
    const wrap = byId('plVolWrap');
    if (this.el.vol) { this.el.vol.disabled = true; this.el.vol.title = '当前浏览器不允许网页调节音量，请用系统音量键'; }
    if (wrap) wrap.title = '当前浏览器（如 iOS Safari）不允许网页调节音量，请用设备音量键';
  }

  /* ── 展开 / 收起 / 展示模式 ───────────────────────── */
  expand(stage = null) {
    if (stage) this.setStage(stage);
    if (this.el.full) this.el.full.hidden = false;
    if (this.root) this.root.dataset.expanded = 'true';
    document.body.classList.add('is-locked');
    this._syncPanelButtons();
  }

  collapse() {
    if (this.el.full) this.el.full.hidden = true;
    if (this.root) this.root.dataset.expanded = 'false';
    document.body.classList.remove('is-locked');
    this._syncPanelButtons();
  }

  /** 「词」按钮三态：off（不显示歌词）/ pure（歌词纯享，无工具栏）/ settings（歌词 + 字号/校准工具栏） */
  get lyricsMode() {
    if (this.root?.dataset.expanded !== 'true' || this.stage !== 'lyrics') return 'off';
    return this.lyricsTools ? 'settings' : 'pure';
  }

  /**
   * 工具栏显隐（纯享 ↔ 设置）。只改 data 属性与按钮态：不重建 DOM、不碰 audio、不动时间轴。
   * @returns {'off'|'pure'|'settings'} 切换后的三态
   */
  setLyricsTools(on) {
    this.lyricsTools = !!on;
    if (this.el.stage) this.el.stage.dataset.tools = String(this.lyricsTools);
    this._syncPanelButtons();
    return this.lyricsMode;
  }

  /**
   * 歌词「词」按钮三态循环：隐藏 → 纯享 → 设置 → 隐藏（回封面普通播放页）。
   * 唯一点击入口是委托的 data-act="toggle-lyrics"，一次点击只推进一态，不会连跳。
   * @returns {'off'|'pure'|'settings'} 点击后的状态
   */
  toggleLyrics() {
    const expanded = this.root?.dataset.expanded === 'true';
    if (expanded && this.stage === 'lyrics') {
      if (!this.lyricsTools) return this.setLyricsTools(true); // 纯享 → 设置
      this.setLyricsTools(false); // 设置 → 隐藏（收起歌词与全部工具）
      this.setStage('cover');
      return 'off';
    }
    this.setLyricsTools(false); // 隐藏 → 纯享（工具栏保持收起）
    this.expand('lyrics');
    return 'pure';
  }

  /** 迷你条与展开页的「词」按钮状态同步。
   *  data-mode=off/pure/settings —— off 普通样式；pure/settings 由 aria-expanded 驱动主题红底；
   *  settings 额外露出小齿轮（CSS .pbtn__gear）。aria-label 描述下一次点击的动作。 */
  _syncPanelButtons() {
    const mode = this.lyricsMode;
    const lyricsLabel = mode === 'settings' ? '收起歌词' : mode === 'pure' ? '显示歌词设置' : '显示歌词';
    for (const id of ['plLyricsBtn', 'plLyricsBtnFull']) {
      const btn = byId(id);
      if (!btn) continue;
      btn.dataset.mode = mode;
      btn.setAttribute('aria-expanded', String(mode !== 'off'));
      btn.setAttribute('aria-label', lyricsLabel);
      btn.setAttribute('title', lyricsLabel);
    }
  }

  toggleExpand() {
    if (this.root?.dataset.expanded === 'true') this.collapse();
    else this.expand();
  }

  setStage(stage, { lock = true } = {}) {
    this.stage = STAGES.includes(stage) ? stage : 'cover';
    if (this.el.stage) {
      this.el.stage.dataset.stage = this.stage;
      this.el.stage.dataset.tools = String(this.lyricsTools);
    }
    setSvg('plViewIcon', STAGE_ICON[this.stage], 22);
    if (lock) this.player.store?.save({ stage: this.stage, stageLocked: true }, { immediate: true });
    else this.player.store?.save({ stage: this.stage });
    this._syncPanelButtons();
    this.onStageChange?.(this.stage);
  }

  cycleStage() {
    const next = STAGES[(STAGES.indexOf(this.stage) + 1) % STAGES.length];
    this.setStage(next);
    return next;
  }
}