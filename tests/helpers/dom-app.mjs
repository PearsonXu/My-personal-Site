/**
 * tests/helpers/dom-app.mjs — 在 jsdom 里启动完整应用（供多个测试文件复用）。
 * jsdom 不实现媒体播放，这里用可控 stub 模拟真实事件序列。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');

export function buildDemo() {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), '--demo'], { cwd: ROOT, stdio: 'pipe' });
}

/** @param {string} startPath @param {any} [options] */
export async function makeApp(startPath = '/', { storage } = {}) {
  buildDemo();
  const html = fs.readFileSync(path.join(DIST, startPath, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: `https://www.xuzhaoqing.com${startPath}`, pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.Element.prototype.scrollTo = () => {};
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message));

  window.fetch = async (url) => {
    const p = decodeURIComponent(new URL(String(url), 'https://www.xuzhaoqing.com').pathname).replace(/^\/+/, '');
    const file = p.endsWith('/') || p === '' ? path.join(DIST, p, 'index.html') : path.join(DIST, p);
    if (!fs.existsSync(file)) return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
    const body = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => body, json: async () => JSON.parse(body) };
  };
  for (const key of ['window', 'document', 'location', 'history', 'DOMParser', 'Node', 'Event', 'MouseEvent', 'HTMLElement', 'localStorage', 'navigator', 'CSS']) {
    if (window[key] === undefined) continue;
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
  globalThis.fetch = window.fetch;
  if (storage) {
    for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
  }

  const audio = window.document.getElementById('zx-audio');
  let paused = true;
  Object.defineProperty(audio, 'paused', { get: () => paused, configurable: true });
  audio.play = async () => {
    paused = false;
    audio.dispatchEvent(new window.Event('play'));
    audio.dispatchEvent(new window.Event('playing'));
  };
  audio.pause = () => { paused = true; audio.dispatchEvent(new window.Event('pause')); };
  audio.load = () => { audio.dispatchEvent(new window.Event('loadstart')); };

  // 抑制 app.js 的自动启动：测试里只允许显式 boot 一次，避免重复绑定监听器
  globalThis.__ZX_TEST__ = true;
  const { boot } = await import('../../assets/js/app.js');
  const app = await boot({ base: '/' });
  return { window, app, audio, errors };
}

export const click = (window, el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
export const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));