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
  }

  collapse() {
    if (this.el.full) this.el.full.hidden = true;
    if (this.root) this.root.dataset.expanded = 'false';
    document.body.classList.remove('is-locked');
  }

  toggleExpand() {
    if (this.root?.dataset.expanded === 'true') this.collapse();
    else this.expand();
  }

  setStage(stage, { lock = true } = {}) {
    this.stage = STAGES.includes(stage) ? stage : 'cover';
    if (this.el.stage) this.el.stage.dataset.stage = this.stage;
    setSvg('plViewIcon', STAGE_ICON[this.stage], 22);
    if (lock) this.player.store?.save({ stage: this.stage, stageLocked: true }, { immediate: true });
    else this.player.store?.save({ stage: this.stage });
  }

  cycleStage() {
    const next = STAGES[(STAGES.indexOf(this.stage) + 1) % STAGES.length];
    this.setStage(next);
    return next;
  }
}