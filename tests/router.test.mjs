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
import { JSDOM, VirtualConsole } from 'jsdom';

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

async function makeDom(startPath = '/', { delay = 0 } = {}) {
  ensureBuild();
  const html = fs.readFileSync(path.join(DIST, startPath, 'index.html'), 'utf8');
  // jsdom 不真正整页跳转，且「assign 到当前地址」会被它静默忽略（pushState 已改地址），
  // 所以用 onError 作为「进入整页回退分支」的观察点：它只在回退前被调用
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {}); // 吞掉 not-implemented 噪音
  const dom = new JSDOM(html, { url: `https://www.xuzhaoqing.com${startPath}`, pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.fetch = async (url, opts = {}) => {
    // 尊重 AbortSignal：真实浏览器里被取代的导航会抛 AbortError，
    // 旧 stub 忽略 signal，导致「abort 被当失败→整页拽回旧 URL」这类缺陷测不出来
    if (delay) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delay);
        opts.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          const e = new Error('The operation was aborted.');
          e.name = 'AbortError';
          reject(e);
        });
      });
    }
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

  // 不绑定具体哪首歌：首页只显示最新 6 首，新歌入库会把旧歌（含 DEMO）挤下去
  const link = [...doc.querySelectorAll('a[href]')].find((a) => /\/songs\/[^/]+\/$/.test(a.getAttribute('href') || ''));
  assert.ok(link, '首页应该有指向单曲页的链接');
  const slug = (link.getAttribute('href').match(/\/songs\/([^/]+)\/$/) || [])[1];
  const songPageTitle = (fs.readFileSync(path.join(DIST, 'songs', slug, 'index.html'), 'utf8').match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(doc.getElementById('zx-audio'), audioBefore, 'audio 元素被重建了 → 音乐会断');
  assert.equal(doc.getElementById('player-root'), playerBefore, '播放器被重建了');
  assert.equal(doc.getElementById('page-root'), pageRootBefore, '#page-root 节点本身也应保持稳定');
  assert.equal(audioBefore.getAttribute('src'), 'https://www.xuzhaoqing.com/assets/audio/_demo/demo-night-ferry.mp3', '音源被换掉了');
  assert.equal(playerBefore.dataset.state, 'playing', '播放状态被重置了');
  assert.equal(doc.body.dataset.kind, 'song');
  assert.ok(songPageTitle && doc.title === songPageTitle, '标题应更新为新页面');
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

test('router · 导航到更深路径后 head 资源仍是绝对 URL（不会 404）', async () => {
  const { window, Router } = await makeDom('/');
  const doc = window.document;
  // 模拟 app.js 的 absolutizeHeadAssets：启动时把相对 head 资源转绝对
  for (const el of doc.querySelectorAll('head link[rel~="icon"], head link[rel="apple-touch-icon"], head link[rel="manifest"], head link[rel="stylesheet"], script[src]')) {
    const attr = el.hasAttribute('href') ? 'href' : 'src';
    const raw = el.getAttribute(attr);
    if (raw && !/^https?:/.test(raw)) el.setAttribute(attr, new window.URL(raw, window.location.href).href);
  }
  const router = new Router({ base: '/', origin: 'https://www.xuzhaoqing.com', onNavigate: () => {} });
  router.start();
  await router.navigate('https://www.xuzhaoqing.com/notes/hello-music-house/');
  const icon = doc.querySelector('head link[rel~="icon"]').getAttribute('href');
  assert.equal(icon, 'https://www.xuzhaoqing.com/assets/img/icons/favicon-v2.ico', `favicon 变成了 ${icon}`);
  const apple = doc.querySelector('head link[rel="apple-touch-icon"]').getAttribute('href');
  assert.equal(apple, 'https://www.xuzhaoqing.com/assets/img/icons/apple-touch-icon-v2.png', `apple-touch-icon 变成了 ${apple}`);
  const mani = doc.querySelector('head link[rel="manifest"]').getAttribute('href');
  assert.equal(mani, 'https://www.xuzhaoqing.com/assets/manifest.webmanifest', `manifest 变成了 ${mani}`);
  for (const el of doc.querySelectorAll('head link[rel="stylesheet"]')) {
    assert.match(el.getAttribute('href'), /^https:\/\/www\.xuzhaoqing\.com\/assets\/css\//);
  }
});

test('router · 子路径部署下路由解析仍然正确', async () => {
  ensureBuild();
  const { parseRoute } = await import('../assets/js/core/paths.js');
  assert.deepEqual(parseRoute('/My-personal-Site/songs/demo-night-ferry/', '/My-personal-Site/'), { kind: 'song', slug: 'demo-night-ferry' });
});

/* ── 导航竞态回归：abort ≠ 失败，禁止整页拽回旧 URL ─────────────── */

test('router · 连点三个导航：最后一次生效，且不做整页回退', async () => {
  const { window, Router } = await makeDom('/', { delay: 40 });
  const doc = window.document;
  const errors = [];
  const router = new Router({ base: '/', origin: 'https://www.xuzhaoqing.com', onNavigate: () => {}, onError: (e) => errors.push(e) });
  router.start();
  const p1 = router.navigate('https://www.xuzhaoqing.com/songs/');
  const p2 = router.navigate('https://www.xuzhaoqing.com/notes/');
  const p3 = router.navigate('https://www.xuzhaoqing.com/about/');
  await Promise.all([p1, p2, p3]);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(window.location.pathname, '/about/', `连点应落在最后一次导航，实际 ${window.location.pathname}`);
  assert.equal(doc.body.dataset.kind, 'about');
  assert.deepEqual(errors.map((e) => e.message), [], 'abort 不应进入整页回退分支');
});

test('router · fetch 途中按后退：地址留在后退目标，不被旧导航拽回', async () => {
  const { window, Router } = await makeDom('/', { delay: 60 });
  const doc = window.document;
  const errors = [];
  const router = new Router({ base: '/', origin: 'https://www.xuzhaoqing.com', onNavigate: () => {}, onError: (e) => errors.push(e) });
  router.start();
  const p = router.navigate('https://www.xuzhaoqing.com/songs/');
  await new Promise((r) => setTimeout(r, 10));
  window.history.back(); // popstate → _load(首页) abort 掉进行中的 /songs/ fetch
  await p;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(window.location.pathname, '/', `后退应生效，实际 ${window.location.pathname}`);
  assert.equal(doc.body.dataset.kind, 'home');
  assert.deepEqual(errors.map((e) => e.message), [], '后退途中不得进入整页回退分支');
});

test('router · 真失败（404）仍回退整页跳转，不留空白', async () => {
  const { window, Router } = await makeDom('/');
  const errors = [];
  const router = new Router({ base: '/', origin: 'https://www.xuzhaoqing.com', onNavigate: () => {}, onError: (e) => errors.push(e) });
  router.start();
  await router.navigate('https://www.xuzhaoqing.com/songs/no-such-song/');
  assert.deepEqual(errors.map((e) => e.message), ['HTTP 404'], '404 应进入整页回退分支一次');
});

test('router · popstate 落到已无真实文件的地址：整页加载当前地址而非半截旧页', async () => {
  const { window, Router } = await makeDom('/');
  const doc = window.document;
  const errors = [];
  const router = new Router({ base: '/', origin: 'https://www.xuzhaoqing.com', onNavigate: () => {}, onError: (e) => errors.push(e) });
  router.start();
  await router.navigate('https://www.xuzhaoqing.com/songs/');
  window.history.pushState({ zx: true }, '', 'https://www.xuzhaoqing.com/songs/gone/');
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(errors.map((e) => e.message), ['HTTP 404'], 'popstate 真失败应进入整页回退分支');
  assert.equal(doc.body.dataset.kind, 'library', '失败回退前内容不应被半截替换');
});