/**
 * ui/appearance-ui.js — 外观（三套主题）与布局（自动 / 桌面 / 手机）。
 *
 * ★ 两者都只改 <html> 上的 data 属性 + 写 localStorage：
 *   不重建 DOM、不碰 <audio>、不重新加载歌曲。
 *   因此切换时播放/暂停状态、进度、队列、模式、随机历史、音量、收藏、歌词全部原样保留。
 */

import { THEMES, LAYOUTS, normalizeTheme, normalizeLayout } from '../store.js';
import { escapeHtml as esc, escapeAttr as attr } from '../core/util.js';
import { icon } from '../core/icons.js';
import { openSheet, toast } from './common.js';
import { qs, qsa, tgt } from './dom.js';

export const THEME_META = {
  cloud: {
    name: '清爽云音乐',
    desc: '白 / 浅灰 / 红色强调，结构清楚，操作简洁。方形封面 + 列表优先。',
    swatches: ['#ffffff', '#eceef2', '#e02f2f'],
    color: '#f5f6f8',
    view: 'list',
    stage: 'cover'
  },
  forest: {
    name: '森林音乐小屋',
    desc: '森林绿 / 暖纸 / 琥珀，温暖安静。衬线标题 + 插画封面 + 复古唱片。',
    swatches: ['#f6efe0', '#2f6b46', '#c1832b'],
    color: '#f6efe0',
    view: 'grid',
    stage: 'vinyl'
  },
  midnight: {
    name: '午夜黑胶',
    desc: '深蓝紫 / 夜景 / 黑胶唱片，沉浸式歌词。手机上自动关闭模糊与持续动画。',
    swatches: ['#0a0918', '#9d8cff', '#57d2e8'],
    color: '#0a0918',
    view: 'grid',
    stage: 'lyrics'
  }
};

export const LAYOUT_META = {
  auto: { name: '自动', desc: '按屏幕尺寸适配' },
  desktop: { name: '桌面', desc: '完整导航 + 常驻播放器' },
  mobile: { name: '手机', desc: '迷你播放器 + 展开播放页' }
};

export class Appearance {
  /** @param {any} options */
  constructor({ store, player, library, ui }) {
    this.store = store;
    this.player = player;
    this.library = library;
    this.ui = ui;
    this.sheet = null;
    this.theme = normalizeTheme(store.getTheme());
    this.layout = normalizeLayout(store.getLayout());
    this._apply(this.theme, this.layout, { persist: false, announce: false });
  }

  /** 只改属性与样式变量，绝不动播放器 */
  _apply(theme, layout, { persist = true, announce = false } = {}) {
    this.theme = normalizeTheme(theme);
    this.layout = normalizeLayout(layout);
    const root = document.documentElement;
    root.dataset.theme = this.theme;
    root.dataset.layout = this.layout;

    const meta = qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_META[this.theme].color);

    if (persist) {
      this.store.setTheme(this.theme);
      this.store.setLayout(this.layout);
    }

    // 主题的推荐展示方式：用户手动选过就不再覆盖
    const preset = THEME_META[this.theme];
    if (!this.store.data.viewLocked) this.library.setView(preset.view, { lock: false });
    if (!this.store.data.stageLocked) this.ui.setStage(preset.stage, { lock: false });

    this._syncButtons();
    if (announce) toast(`外观：${preset.name} · 布局：${LAYOUT_META[this.layout].name}`);
  }

  setTheme(theme, { announce = true } = {}) {
    if (!THEMES.includes(normalizeTheme(theme))) return;
    this._apply(theme, this.layout, { persist: true, announce });
    this.render();
  }

  setLayout(layout, { announce = true } = {}) {
    this._apply(this.theme, layout, { persist: true, announce });
    this.render();
  }

  cycleTheme() {
    const next = THEMES[(THEMES.indexOf(this.theme) + 1) % THEMES.length];
    this.setTheme(next);
    return next;
  }

  reset() {
    this.store.save({ viewLocked: false, stageLocked: false }, { immediate: true });
    this._apply('cloud', 'auto', { persist: true, announce: true });
    this.render();
  }

  _syncButtons() {
    for (const btn of qsa('[data-act="open-appearance"]')) {
      btn.setAttribute('title', `外观：${THEME_META[this.theme].name} · 布局：${LAYOUT_META[this.layout].name}`);
    }
    const label = qs('[data-appearance-label]');
    if (label) label.textContent = THEME_META[this.theme].name;
  }
  open() {
    this.sheet = openSheet({ title: '外观与布局', bodyHtml: '<div id="appearanceBody"></div>', footHtml: '<button class="btn btn--quiet" type="button" data-ap="reset">恢复默认（清爽云音乐 · 自动布局）</button>' });
    this.sheet.root.addEventListener('click', (e) => {
      const btn = tgt(e).closest('[data-ap]');
      if (!btn) return;
      const act = btn.dataset.ap;
      if (act === 'theme') this.setTheme(btn.dataset.theme);
      else if (act === 'layout') this.setLayout(btn.dataset.layout);
      else if (act === 'reset') this.reset();
    });
    this.render();
  }

  render() {
    const host = this.sheet?.root.querySelector('#appearanceBody');
    if (!host) return;
    const themes = THEMES.map((id) => {
      const m = THEME_META[id];
      const on = id === this.theme;
      return `<button class="theme-card${on ? ' is-on' : ''}" type="button" data-ap="theme" data-theme="${attr(id)}" aria-pressed="${on}">
        <span class="theme-card__swatches" aria-hidden="true">${m.swatches.map((c) => `<i style="background:${attr(c)}"></i>`).join('')}</span>
        <span class="theme-card__body">
          <span class="theme-card__name">${esc(m.name)}${on ? `<span class="theme-card__tick">${icon('check', { size: 16 })}</span>` : ''}</span>
          <span class="theme-card__desc">${esc(m.desc)}</span>
        </span>
      </button>`;
    }).join('');

    const layouts = LAYOUTS.map((id) => {
      const on = id === this.layout;
      return `<button class="chip${on ? ' is-on' : ''}" type="button" data-ap="layout" data-layout="${attr(id)}" aria-pressed="${on}">${esc(LAYOUT_META[id].name)}</button>`;
    }).join('');

    host.innerHTML = `
      <p class="panel__head">外观</p>
      <div class="theme-list">${themes}</div>
      <p class="panel__head" style="margin-top:var(--sp5)">布局</p>
      <div class="chips">${layouts}</div>
      <p class="note">自动 = 按屏幕尺寸适配；桌面 / 手机 = 手动固定，便于对照验证。布局与外观互相独立。</p>
      <p class="note">切换外观或布局<strong>不会中断播放</strong>：同一个音频实例、同一份队列与进度，暂停时切换仍保持暂停。</p>
      <p class="note">首次访问默认「清爽云音乐」，系统深色偏好不会覆盖它。你的主动选择会记在本浏览器里。</p>`;
  }
}