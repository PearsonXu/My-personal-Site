/**
 * tests/router.test.mjs — 用 jsdom 证明最关键的一条：
 * **站内导航只换 #page-root 的内容，audio 与播放器节点身份不变** → 音乐不会断。
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

function ensureBuild() {
  if (!fs.existsSync(path.join(DIST, 'songs/demo-night-ferry/index.html'))) {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), '--demo'], { cwd: ROOT, stdio: 'pipe' });
  }
}

function fileForUrl(url) {
  const p = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
  const candidate = p.endsWith('/') || p === '' ? path.join(DIST, p, 'index.html') : path.join(DIST, p);
  return fs.existsSync(candidate) ? candidate : null;
}

async function makeDom(startPath = '/') {
  ensureBuild();
  const html = fs.readFileSync(path.join(DIST, startPath, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: `https://www.xuzhaoqing.com${startPath}`, pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.fetch = async (url) => {
    const file = fileForUrl(String(url));
    if (!file) return { ok: false, status: 404, text: async () => '' };
    const body = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
  };
  for (const key of ['window', 'document', 'location', 'history', 'DOMParser', 'Node', 'Event', 'MouseEvent', 'HTMLElement']) {
    globalThis[key] = window[key];
  }
  globalThis.fetch = window.fetch;
  const { Router } = await import('../assets/js/router.js');
  return { dom, window, Router };
}

test('router · 站内导航后 audio 与播放器是同一个节点（不断歌）', async () => {
  const { window, Router } = await makeDom('/');
  const doc = window.document;
  const routes = [];
  const router = new Router({ base: '/', origin: 'https://www.xuzhaoqing.com', onNavigate: (r) => routes.push(r) });
  router.start();

  const audioBefore = doc.getElementById('zx-audio');
  const playerBefore = doc.getElementById('player-root');
  const pageRootBefore = doc.getElementById('page-root');
  // 模拟「正在播放」：给 audio 设一个源并标记状态
  audioBefore.setAttribute('src', 'https://www.xuzhaoqing.com/assets/audio/_demo/demo-night-ferry.mp3');
  playerBefore.dataset.state = 'playing';

  const link = [...doc.querySelectorAll('a[href]')].find((a) => a.getAttribute('href').includes('songs/demo-night-ferry/'));
  assert.ok(link, '首页应该有指向单曲页的链接');
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(doc.getElementById('zx-audio'), audioBefore, 'audio 元素被重建了 → 音乐会断');
  assert.equal(doc.getElementById('player-root'), playerBefore, '播放器被重建了');
  assert.equal(doc.getElementById('page-root'), pageRootBefore, '#page-root 节点本身也应保持稳定');
  assert.equal(audioBefore.getAttribute('src'), 'https://www.xuzhaoqing.com/assets/audio/_demo/demo-night-ferry.mp3', '音源被换掉了');
  assert.equal(playerBefore.dataset.state, 'playing', '播放状态被重置了');
  assert.equal(doc.body.dataset.kind, 'song');
  assert.ok(doc.title.includes('夜渡'), '标题应更新为新页面');
  assert.equal(routes.at(-1).kind, 'song');
});

test('router · 打开手记同样不断歌，且规范链接随之更新', async () => {
  const { window, Router } = await makeDom('/songs/demo-night-ferry/');
  const doc = window.document;
  const router = new Router({ base: '/', origin: 'https://www.xuzhaoqing.com', onNavigate: () => {} });
  router.start();
  const audioBefore = doc.getElementById('zx-audio');
  audioBefore.setAttribute('src', 'x.mp3');

  await router.navigate('https://www.xuzhaoqing.com/notes/hello-music-house/');
  assert.equal(doc.getElementById('zx-audio'), audioBefore);
  assert.equal(audioBefore.getAttribute('src'), 'x.mp3');
  assert.equal(doc.body.dataset.kind, 'note');
  assert.match(doc.querySelector('link[rel="canonical"]').getAttribute('href'), /notes\/hello-music-house\/$/);
});

test('router · 切换展示模式不涉及路由，audio 不受影响', async () => {
  const { window, Router } = await makeDom('/songs/');
  const doc = window.document;
  const router = new Router({ base: '/', origin: 'https://www.xuzhaoqing.com', onNavigate: () => {} });
  router.start();
  const audioBefore = doc.getElementById('zx-audio');
  const box = doc.querySelector('[data-viewbox]');
  box.dataset.view = 'vinyl';
  assert.equal(doc.getElementById('zx-audio'), audioBefore);
  assert.equal(doc.querySelectorAll('audio').length, 1);
});

test('router · 外链与音频文件不被 SPA 接管', async () => {
  const { window, Router } = await makeDom('/');
  const doc = window.document;
  const router = new Router({ base: '/', origin: 'https://www.xuzhaoqing.com', onNavigate: () => {} });
  router.start();
  const before = doc.body.dataset.kind;
  const external = [...doc.querySelectorAll('a[href]')].find((a) => /^https?:\/\//.test(a.getAttribute('href')) && !a.getAttribute('href').includes('xuzhaoqing.com'));
  assert.ok(external, '页脚应有指向站外的链接');
  const evt = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  external.dispatchEvent(evt);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(evt.defaultPrevented, false, '站外链接必须走整页跳转');
  assert.equal(doc.body.dataset.kind, before);
});

test('router · 子路径部署下路由解析仍然正确', async () => {
  ensureBuild();
  const { parseRoute } = await import('../assets/js/core/paths.js');
  assert.deepEqual(parseRoute('/My-personal-Site/songs/demo-night-ferry/', '/My-personal-Site/'), { kind: 'song', slug: 'demo-night-ferry' });
});