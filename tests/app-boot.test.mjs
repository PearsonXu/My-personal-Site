/**
 * tests/app-boot.test.mjs — 整机启动测试（jsdom）。
 * 验证真实接线：目录加载 → 播放器 → UI 绑定 → 路由 → 点击处理。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

async function makeApp(startPath = '/') {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), '--demo'], { cwd: ROOT, stdio: 'pipe' });
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
    // Node 25 的 navigator 等全局是只读 getter，必须用 defineProperty 覆盖
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
  globalThis.fetch = window.fetch;

  // jsdom 不实现媒体播放，且 paused 是只读 getter：用可控 stub 模拟真实事件序列
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

  const { boot } = await import('../assets/js/app.js');
  const app = await boot({ base: '/' });
  return { window, app, audio, errors };
}

const click = (window, el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

test('app · 启动后目录、播放器、UI 全部就位', async () => {
  const { window, app, errors } = await makeApp('/');
  assert.ok(app, 'boot 应返回 app');
  assert.equal(app.catalog.songs.length, 2);
  assert.equal(app.player.state, 'idle');
  assert.equal(window.document.querySelectorAll('audio').length, 1);
  assert.deepEqual(errors, []);
});

test('app · 点击播放按钮真的换源并进入播放态', async () => {
  const { window, app, audio } = await makeApp('/');
  const btn = window.document.querySelector('[data-act="play-song"]');
  assert.ok(btn);
  click(window, btn);
  await wait();
  assert.ok(app.player.currentSong, '没有当前曲目');
  assert.ok(audio.getAttribute('src') || audio.src, 'audio 没有被设置音源');
  assert.equal(app.player.state, 'playing', `状态异常：${app.player.state} / ${app.player.stateDetail}`);
  assert.equal(window.document.getElementById('player-root').dataset.state, 'playing');
});

test('app · 播放中站内跳转到手记，audio 节点与曲目都不变', async () => {
  const { window, app, audio } = await makeApp('/');
  click(window, window.document.querySelector('[data-act="play-song"]'));
  await wait();
  const songBefore = app.player.currentSong.slug;
  const srcBefore = audio.getAttribute('src');
  await app.router.navigate('https://www.xuzhaoqing.com/notes/hello-music-house/');
  await wait();
  assert.equal(window.document.getElementById('zx-audio'), audio);
  assert.equal(audio.getAttribute('src'), srcBefore);
  assert.equal(app.player.currentSong.slug, songBefore);
  assert.equal(app.player.state, 'playing');
  assert.equal(window.document.body.dataset.kind, 'note');
});
test('app · 队列面板可打开、可删除', async () => {
  const { window, app } = await makeApp('/');
  click(window, window.document.querySelector('[data-act="play-song"]'));
  await wait();
  app.player.addLast(app.catalog.songs[1].slug);
  click(window, window.document.querySelector('[data-act="open-queue"]'));
  await wait();
  const items = window.document.querySelectorAll('.qitem');
  assert.equal(items.length, 2);
  click(window, items[1].querySelector('[data-qact="remove"]'));
  await wait();
  assert.equal(app.player.queue.length, 1);
});

test('app · 外观入口可打开，选主题后写入 localStorage', async () => {
  const { window } = await makeApp('/');
  assert.equal(window.document.documentElement.dataset.theme, 'cloud', '首次访问必须是 cloud');
  click(window, window.document.querySelector('[data-act="open-appearance"]'));
  await wait();
  const cards = window.document.querySelectorAll('[data-ap="theme"]');
  assert.equal(cards.length, 3, '外观面板应列出三套主题');
  click(window, window.document.querySelector('[data-ap="theme"][data-theme="forest"]'));
  await wait();
  assert.equal(window.document.documentElement.dataset.theme, 'forest');
  assert.equal(window.localStorage.getItem('zx.music.theme'), 'forest');
});

test('app · 曲库搜索按歌词命中并更新计数', async () => {
  const { window, app } = await makeApp('/songs/');
  const input = window.document.getElementById('libSearch');
  assert.ok(input);
  input.value = 'LRC';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(250);
  assert.ok(app.library.visible.length >= 1);
  assert.match(window.document.getElementById('libCount').textContent, /搜索/);
  input.value = '绝不存在的词';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(250);
  assert.equal(app.library.visible.length, 0);
  assert.equal(window.document.getElementById('libEmpty').hidden, false);
});

test('app · 展示模式切换只改 DOM，不动 audio', async () => {
  const { window, app, audio } = await makeApp('/songs/');
  click(window, window.document.querySelector('[data-act="play-song"]'));
  await wait();
  click(window, window.document.querySelector('[data-act="set-view"][data-view="vinyl"]'));
  assert.equal(window.document.querySelector('[data-viewbox]').dataset.view, 'vinyl');
  assert.equal(window.document.getElementById('zx-audio'), audio);
  assert.equal(app.player.state, 'playing');
});

test('app · 单曲页歌词可点击跳转，深链接直接进入歌曲页', async () => {
  const { window, app } = await makeApp('/songs/demo-night-ferry/');
  assert.equal(window.document.body.dataset.slug, 'demo-night-ferry');
  const lines = window.document.querySelectorAll('[data-lrc] .lrc__line');
  assert.ok(lines.length > 5);
  click(window, lines[3]);
  await wait(60);
  assert.equal(app.player.currentSong.slug, 'demo-night-ferry');
  assert.ok(app.player.audio.currentTime >= 9, `点击歌词应跳转，实际 ${app.player.audio.currentTime}`);
});

test('app · 未配置后端时状态显示为未配置，且不抛错', async () => {
  const { window, app } = await makeApp('/status/');
  for (const s of app.adapters.allStatus()) assert.equal(s.configured, false);
  click(window, window.document.querySelector('[data-act="run-diagnostics"]'));
  await wait();
  assert.match(window.document.getElementById('diagOut').textContent, /Media Session/);
  const sig = await app.adapters.wechatSignature('https://www.xuzhaoqing.com/songs/x/#lyrics');
  assert.equal(sig.ok, false);
  assert.equal(sig.reason, 'not-configured');
});