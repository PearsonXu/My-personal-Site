/**
 * tests/app-boot.test.mjs — 整机启动测试（jsdom）。
 * 验证真实接线：目录加载 → 播放器 → UI 绑定 → 路由 → 点击处理。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../tools/lib/content.mjs';
import { makeApp, click, wait } from './helpers/dom-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('app · 启动后目录、播放器、UI 全部就位', async () => {
  const { window, app, errors } = await makeApp('/');
  assert.ok(app, 'boot 应返回 app');
  assert.equal(app.catalog.songs.length, loadContent(ROOT, { includeDemo: true }).songs.length);
  // 首次访问：播放条预置最新一首（只显示、不出声），不写最近播放、不持久化队列
  assert.equal(app.player.state, 'paused');
  assert.equal(app.player.currentSong?.slug, app.catalog.songs[0].slug);
  assert.equal(window.document.getElementById('plTitle').textContent, app.catalog.songs[0].title);
  assert.deepEqual(app.store.data.recent || [], [], '预置不算播放过');
  assert.ok(!(app.store.data.queue?.items || []).length, '预置不应持久化成「上次的队列」');
  assert.equal(window.document.querySelectorAll('audio').length, 1);
  assert.deepEqual(errors, []);
});

test('app · 歌曲页预置这首歌；访客点过播放后换页不再改动播放条', async () => {
  const { window, app } = await makeApp('/songs/demo-night-ferry/');
  assert.equal(app.player.currentSong?.slug, 'demo-night-ferry', '歌曲页应预置当前这首');
  await app.router.navigate('https://www.xuzhaoqing.com/songs/demo-paper-boat/');
  await wait(60);
  assert.equal(app.player.currentSong?.slug, 'demo-paper-boat', '还没听过时，换到另一首歌的页面跟着换');
  click(window, window.document.querySelector('[data-act="play-song"][data-slug="demo-paper-boat"]'));
  await wait();
  await app.router.navigate('https://www.xuzhaoqing.com/songs/demo-night-ferry/');
  await wait(60);
  assert.equal(app.player.currentSong?.slug, 'demo-paper-boat', '听过之后换页不能动播放条');
  window.close();
});

test('app · 预置不下载音频；第一次按播放才接上音源，点过的歌词进度保留', async () => {
  const { window, app, audio } = await makeApp('/songs/demo-night-ferry/');
  assert.equal(app.player.currentSong?.slug, 'demo-night-ferry');
  assert.ok(!audio.src, '预置时不应给 audio 设音源（不为可能不听的歌白下载）');
  app.player.seek(12);
  assert.equal(app.player._pendingSeek, 12, '未接音源时的跳转先记下');
  click(window, window.document.getElementById('plToggle'));
  await wait();
  assert.match(audio.src, /assets\/audio\/_demo\/|demo-night-ferry|night-ferry/, '按下播放后应接上这首的音源');
  assert.ok((app.store.data.recent || []).some((r) => r.slug === 'demo-night-ferry'), '真正开始听后才算最近播放');
  assert.equal(app.player.cued, false);
  window.close();
});

test('app · 有恢复的队列时不预置，尊重上次听到的歌', async () => {
  const state = { version: 1, position: 12, queue: { items: [{ slug: 'demo-paper-boat' }], cursor: 0, mode: 'order' } };
  const { app } = await makeApp('/songs/demo-night-ferry/', { storage: { 'zx.music.v1': JSON.stringify(state) } });
  assert.equal(app.player.currentSong?.slug, 'demo-paper-boat');
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

test('app · 导航到更深路径后，外壳导航链接仍是正确的绝对地址（白屏回归）', async () => {
  const { window, app } = await makeApp('/');
  const doc = window.document;
  // 启动后外壳链接应已绝对化
  const before = [...doc.querySelectorAll('.nav__a[href]')].map((a) => a.getAttribute('href'));
  assert.ok(before.every((h) => /^https?:\/\//.test(h)), `外壳链接未绝对化：${before.join(', ')}`);

  await app.router.navigate('https://www.xuzhaoqing.com/notes/hello-music-house/');
  await wait(60);
  const after = [...doc.querySelectorAll('.nav__a[href]')].map((a) => ({ label: a.textContent.trim(), href: a.href }));
  const songs = after.find((a) => a.label.includes('曲库'));
  assert.equal(songs.href, 'https://www.xuzhaoqing.com/songs/', `曲库链接被解析成了 ${songs.href}`);
  for (const a of after) {
    assert.ok(!/\/notes\/hello-music-house\//.test(a.href), `${a.label} 被解析到深层目录：${a.href}`);
  }
  // 再点一次曲库，必须真的落在 /songs/
  await app.router.navigate(songs.href);
  await wait(60);
  assert.equal(window.location.pathname, '/songs/');
  assert.equal(doc.body.dataset.kind, 'library');
});

test('app · 导航后外壳里不残留任何相对引用（链接 + 图片）', async () => {
  const { window, app } = await makeApp('/');
  const doc = window.document;
  const shellRefs = () => {
    const out = [];
    for (const el of doc.querySelectorAll('a[href], img[src], source[src], use[href]')) {
      if (el.closest('#page-root')) continue;
      const raw = el.getAttribute(el.hasAttribute('href') ? 'href' : 'src');
      if (!raw || raw.startsWith('#') || /^(mailto:|tel:|data:)/.test(raw)) continue;
      // 绝对 URL 或站点根路径（/assets/…）都与页面深度无关；./ ../ 和裸相对路径才会随 pushState 漂移
      if (!/^(https?:)?\/\//i.test(raw) && !/^\/(?!\/)/.test(raw)) out.push(`${el.tagName}:${raw}`);
    }
    return out;
  };
  assert.deepEqual(shellRefs(), [], '启动后外壳仍有相对引用');
  await app.router.navigate('https://www.xuzhaoqing.com/notes/hello-music-house/');
  await wait(60);
  assert.deepEqual(shellRefs(), [], '导航后外壳出现相对引用');
  // 播放器封面（预置歌曲的封面）必须指向站点根下的 assets
  const cover = doc.getElementById('plCover');
  assert.match(cover.getAttribute('src'), /^(https:\/\/www\.xuzhaoqing\.com)?\/assets\/img\//);
});

test('app · 从深层页面启动时外壳链接同样正确', async () => {
  const { window } = await makeApp('/songs/demo-night-ferry/');
  const links = [...window.document.querySelectorAll('.nav__a[href]')].map((a) => a.href);
  assert.ok(links.includes('https://www.xuzhaoqing.com/songs/'), links.join(', '));
  assert.ok(links.includes('https://www.xuzhaoqing.com/'), links.join(', '));
});

test('app · 启动时记录运行时 base，供 404 页定位站点根', async () => {
  const { window } = await makeApp('/');
  assert.equal(window.localStorage.getItem('zx.music.base'), '/');
});

test('app · 本地数据坏字段被就地修好，收藏保留且有提示', async () => {
  const { window, app } = await makeApp('/', {
    storage: {
      'zx.music.v1': JSON.stringify({
        view: '坏值', mode: '坏值', volume: 'loud',
        favorites: ['demo-night-ferry', null, 7],
        recent: [null, { slug: 'demo-paper-boat', at: 1 }]
      })
    }
  });
  assert.deepEqual(app.store.data.favorites, ['demo-night-ferry']);
  assert.equal(app.store.data.view, 'list');
  assert.equal(app.store.data.volume, 1);
  assert.ok(app.store.repaired.length > 0);
  assert.equal(window.document.querySelectorAll('audio').length, 1);
});

test('app · 外观入口可打开，选主题后写入 localStorage', async () => {
  const { window } = await makeApp('/');
  assert.equal(window.document.documentElement.dataset.theme, 'cloud', '首次访问必须是 cloud');
  click(window, window.document.querySelector('[data-act="open-appearance"]'));
  await wait();
  const cards = window.document.querySelectorAll('[data-ap="theme"]');
  assert.equal(cards.length, 4, '外观面板应列出四套主题');
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
  await wait(); // 点击分发经过错误边界的微任务，需要让出一拍
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