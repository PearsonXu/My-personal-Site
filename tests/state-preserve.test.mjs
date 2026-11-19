import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, click, wait } from './helpers/dom-app.mjs';

const THEMES = ['cloud', 'forest', 'midnight'];
const LAYOUTS = ['desktop', 'mobile'];

/** 抓一份「播放业务状态」快照，切换前后逐项比对 */
function snapshot(app, audio) {
  return {
    src: audio.getAttribute('src'),
    currentTime: audio.currentTime,
    paused: audio.paused,
    state: app.player.state,
    song: app.player.currentSong?.slug,
    queueIds: app.player.queue.items.map((i) => i.id).join('|'),
    queueCursor: app.player.queue.cursor,
    mode: app.player.queue.mode,
    history: app.player.queue.history.join('|'),
    bag: app.player.queue.bag.join('|'),
    volume: audio.volume,
    muted: audio.muted,
    favorites: app.store.data.favorites.join('|'),
    lyricIndex: app.player.lyricIndex,
    lyricLines: app.player.lyrics.lines.length
  };
}

function assertNodes(app, window, audio, playerRoot) {
  assert.equal(window.document.getElementById('zx-audio'), audio, 'audio 实例被换掉了');
  assert.equal(app.ui.root, playerRoot, '播放器根节点被重建了');
}

function assertSame(before, after, label) {
  for (const key of Object.keys(before)) {
    assert.deepEqual(after[key], before[key], `${label} 之后 ${key} 变了`);
  }
}

for (const theme of THEMES) {
  for (const layout of LAYOUTS) {
    test(`state · ${theme} × ${layout}：播放中切换外观与布局，全部业务状态不变`, async () => {
      const { window, app, audio } = await makeApp('/songs/demo-night-ferry/');
      click(window, window.document.querySelector('[data-act="play-song"]'));
      await wait(60);
      app.player.addLast('demo-paper-boat');
      app.player.setMode('shuffle');
      app.player.toggleFavorite('demo-night-ferry');
      app.player.seek(8);
      await wait(20);

      const before = snapshot(app, audio);
      const playerRoot = app.ui.root;
      assert.equal(before.paused, false);

      app.appearance.setTheme(theme, { announce: false });
      app.appearance.setLayout(layout, { announce: false });
      await wait(20);

      assert.equal(window.document.documentElement.dataset.theme, theme);
      assert.equal(window.document.documentElement.dataset.layout, layout);
      assertSame(before, snapshot(app, audio), `${theme}/${layout}`);
      assertNodes(app, window, audio, playerRoot);
    });
  }
}

test('state · 暂停时切换外观 / 布局，仍保持暂停且不从头播放', async () => {
  const { window, app, audio } = await makeApp('/songs/demo-night-ferry/');
  click(window, window.document.querySelector('[data-act="play-song"]'));
  await wait(60);
  app.player.seek(12);
  app.player.pause();
  await wait(20);
  const before = snapshot(app, audio);
  assert.equal(before.paused, true);
  assert.equal(before.currentTime, 12);

  for (const theme of THEMES) {
    for (const layout of ['auto', ...LAYOUTS]) {
      app.appearance.setTheme(theme, { announce: false });
      app.appearance.setLayout(layout, { announce: false });
      await wait(10);
      const after = snapshot(app, audio);
      assert.equal(after.paused, true, `${theme}/${layout} 把暂停变成了播放`);
      assert.equal(after.currentTime, 12, `${theme}/${layout} 重置了进度`);
      assertSame(before, after, `${theme}/${layout}`);
    }
  }
});

test('state · 切换外观后站内导航，audio 仍是同一个实例', async () => {
  const { window, app, audio } = await makeApp('/');
  click(window, window.document.querySelector('[data-act="play-song"]'));
  await wait(60);
  app.appearance.setTheme('midnight', { announce: false });
  app.appearance.setLayout('mobile', { announce: false });
  const before = snapshot(app, audio);
  const playerRoot = app.ui.root;
  await app.router.navigate('https://www.xuzhaoqing.com/notes/hello-music-house/');
  await wait(40);
  const after = snapshot(app, audio);
  assertNodes(app, window, audio, playerRoot);
  assert.equal(after.src, before.src);
  assert.equal(after.song, before.song);
  assert.equal(after.state, 'playing');
  assert.equal(window.document.documentElement.dataset.theme, 'midnight', '导航不应重置外观');
  assert.equal(window.document.documentElement.dataset.layout, 'mobile', '导航不应重置布局');
});

test('state · 记住的外观与布局在下次启动时恢复', async () => {
  const { window } = await makeApp('/', { storage: { 'zx.music.theme': 'forest', 'zx.music.layout': 'desktop' } });
  assert.equal(window.document.documentElement.dataset.theme, 'forest');
  assert.equal(window.document.documentElement.dataset.layout, 'desktop');
});

test('state · 非法 / 旧版存储值启动时回退或迁移', async () => {
  const bad = await makeApp('/', { storage: { 'zx.music.theme': 'neon', 'zx.music.layout': 'tablet' } });
  assert.equal(bad.window.document.documentElement.dataset.theme, 'cloud');
  assert.equal(bad.window.document.documentElement.dataset.layout, 'auto');
  const legacy = await makeApp('/', { storage: { 'zx.music.theme': 'dark' } });
  assert.equal(legacy.window.document.documentElement.dataset.theme, 'midnight');
});

test('state · 用户手动选过展示方式后，切主题不再覆盖它', async () => {
  const { window, app } = await makeApp('/songs/');
  click(window, window.document.querySelector('[data-act="set-view"][data-view="vinyl"]'));
  await wait(); // 点击分发经过错误边界的微任务
  assert.equal(app.store.data.viewLocked, true);
  app.appearance.setTheme('cloud', { announce: false });
  assert.equal(app.library.view, 'vinyl', '用户的选择被主题预设覆盖了');
});