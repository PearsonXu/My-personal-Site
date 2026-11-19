/**
 * router.js — 单文档外壳路由。
 *
 * ★ 只替换 `#page-root` 的**内容**，不替换节点本身，更不碰 `#player-root` 与 `<audio>`。
 *   因此站内导航、打开手记、切换展示模式都不会中断音乐。
 *
 * 每个目标 URL 都是构建期预渲染的真实 HTML 文件：
 * 直接访问 / 刷新 / 微信分享打开都能正常工作，这里只是「顺便」不整页刷新而已。
 * fetch 失败时回退为真正的整页跳转，绝不会把用户卡在空白页。
 */

import { parseRoute, isInternalNavigable, joinUrl } from './core/paths.js';
import { qsa, qs, tgt } from './ui/dom.js';

const META_SELECTORS = [
  ['meta[name="description"]', 'content'],
  ['link[rel="canonical"]', 'href'],
  ['meta[property="og:title"]', 'content'],
  ['meta[property="og:description"]', 'content'],
  ['meta[property="og:url"]', 'content'],
  ['meta[property="og:image"]', 'content'],
  ['meta[property="og:type"]', 'content'],
  ['meta[name="twitter:title"]', 'content'],
  ['meta[name="twitter:description"]', 'content'],
  ['meta[name="twitter:image"]', 'content']
];

export class Router {
  /** @param {any} options */
  constructor({ base, origin, onNavigate, onError }) {
    this.base = base;
    this.origin = origin;
    this.onNavigate = onNavigate || (() => {});
    this.onError = onError || (() => {});
    this._token = 0;
    this._controller = null;
    this.current = parseRoute(location.pathname, base) || { kind: 'home', slug: null };
  }

  start() {
    document.addEventListener('click', (e) => this._onClick(e));
    window.addEventListener('popstate', () => {
      this._load(location.href, { push: false }).catch(() => {});
    });
    // 首次进入：不 fetch，直接用已经预渲染好的 DOM
    this.onNavigate(this.current, { initial: true });
  }

  _onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = tgt(e).closest?.('a[href]');
    if (!a) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    if (a.dataset.noRouter !== undefined) return;
    const href = a.getAttribute('href');
    if (!isInternalNavigable(href, { base: this.base, origin: this.origin })) return;
    const url = new URL(href, location.href);
    // 同页锚点交给浏览器
    if (url.pathname === location.pathname && url.hash) return;
    e.preventDefault();
    this.navigate(url.href).catch(() => {});
  }

  async navigate(href, { replace = false } = {}) {
    const url = new URL(href, location.href);
    if (replace) history.replaceState({ zx: true }, '', url.href);
    else history.pushState({ zx: true }, '', url.href);
    try {
      await this._load(url.href, { push: true });
    } catch (err) {
      // 回退：真正的整页跳转（音乐会停，但用户不会看到空白页）
      this.onError(err);
      location.assign(url.href);
    }
  }

  async _load(href, { push }) {
    const token = ++this._token;
    if (this._controller) this._controller.abort();
    this._controller = new AbortController();
    document.documentElement.dataset.navigating = 'true';

    const res = await fetch(href, { signal: this._controller.signal, headers: { 'X-ZX-Router': '1' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (token !== this._token) return; // 已经被更新的导航取代

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const incoming = /** @type {any} */ (doc.querySelector('#page-root'));
    const target = qs('#page-root');
    if (!incoming || !target) throw new Error('目标页面缺少 #page-root');

    // ★ 只换内容，节点本身与播放器保持不动
    target.innerHTML = incoming.innerHTML;
    target.dataset.page = incoming.dataset.page || '';

    document.title = doc.title;
    for (const [selector, attr] of META_SELECTORS) {
      const from = doc.querySelector(selector);
      const to = qs(selector);
      if (from && to) to.setAttribute(attr, from.getAttribute(attr));
    }
    const body = doc.body;
    document.body.dataset.kind = body.dataset.kind || '';
    if (body.dataset.slug) document.body.dataset.slug = body.dataset.slug;
    else delete document.body.dataset.slug;

    this._syncNav();
    const route = parseRoute(new URL(href).pathname, this.base) || { kind: 'home', slug: null };
    this.current = route;

    const hash = new URL(href).hash;
    if (hash) {
      const el = qs(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else window.scrollTo({ top: 0 });
    } else {
      window.scrollTo({ top: 0 });
    }

    delete document.documentElement.dataset.navigating;
    this.onNavigate(route, { initial: false, push });
  }

  _syncNav() {
    const here = location.pathname;
    for (const a of qsa('.nav__a')) {
      const target = new URL(a.getAttribute('href'), location.href).pathname;
      const active = target === here
        || (target !== joinUrl(this.base, '') && here.startsWith(target));
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    qs('.nav')?.classList.remove('is-open');
    qs('[data-act="toggle-nav"]')?.setAttribute('aria-expanded', 'false');
  }
}