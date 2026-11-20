/**
 * tests/player-panels.test.mjs — 歌词工具栏（字号 + 校准）与全屏播放页骨架的回归。
 *
 * 覆盖：
 *  1. 构建产物：工具栏在歌词面板顶部、字号三档默认中、校准在工具栏内、简介入口已移除；
 *  2. CSS：字号只缩放歌词文字、选中态清晰、舞台吃满剩余高度 / 歌词不限高 / 间距显式 / 矮屏压缩；
 *  3. store：逐曲偏移逐字段校验、字号偏好持久化；
 *  4. Player：偏移按歌曲保存 / 切歌互不影响 / 刷新恢复；
 *  5. jsdom 整机：字号立即生效 + 刷新恢复、校准逐曲、三舞台循环、切歌更新歌词、audio 不动。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { Player } from '../assets/js/player.js';
import { Store, sanitizeState, normalizeLrcFont } from '../assets/js/store.js';
import { FakeAudio, MemoryStorage, makeCatalog } from './helpers/fake-audio.mjs';
import { buildDemo, makeApp, click, wait } from './helpers/dom-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readDist = (p) => fs.readFileSync(path.join(ROOT, 'dist', p), 'utf8');

/* ── 1. 构建产物 ─────────────────────────────────────── */

test('panels · 工具栏在歌词面板顶部：字号三档默认中 + 校准组在内', () => {
  buildDemo();
  const html = readDist('index.html');
  const wrap = /<div class="pl__lyricswrap">([\s\S]*?)<div class="pl__fullmeta"/.exec(html);
  assert.ok(wrap, '缺歌词舞台包装（工具栏 + 歌词滚动区）');
  const toolbarAt = wrap[1].indexOf('<div class="pl__toolbar">');
  const boxAt = wrap[1].indexOf('<div class="pl__lyricsbox">');
  assert.ok(toolbarAt >= 0 && boxAt > toolbarAt, '工具栏必须在歌词滚动区之前（顶部）');
  const toolbar = /<div class="pl__toolbar">([\s\S]*?)<\/div>\s*<div class="pl__lyricsbox">/.exec(wrap[1]);
  assert.ok(toolbar, '工具栏结构不完整');
  assert.match(toolbar[1], /role="group" aria-label="歌词字号"/);
  const sizes = [...toolbar[1].matchAll(/data-act="lyric-font" data-size="([sml])" aria-pressed="(true|false)"/g)];
  assert.deepEqual(sizes.map((m) => m[1]), ['s', 'm', 'l']);
  assert.deepEqual(sizes.map((m) => m[2]), ['false', 'true', 'false'], '默认选中「中」');
  assert.match(toolbar[1], /class="pl__calib" role="group" aria-label="歌词校准"/, '校准组必须在工具栏内');
  assert.match(toolbar[1], /data-delta="-0\.5"/);
  assert.match(toolbar[1], /data-delta="0\.5"/);
  assert.match(toolbar[1], /data-act="lyric-offset-reset"/);
  assert.match(toolbar[1], /id="plCalibVal"/);
  assert.match(toolbar[1], /提前 = 歌词更早出现 · 延后 = 歌词更晚出现/, '必须说明调整方向');
  assert.ok(!/<div class="pl__calib"/.test(html.replace(wrap[0], '')), '校准组不应再出现在工具栏之外');
});

test('panels · 「简介」按钮与面板已整体移除，迷你条文字键只留「词」', () => {
  buildDemo();
  const html = readDist('index.html');
  for (const gone of ['plAboutBtn', 'plAboutBtnFull', 'id="plAbout"', 'toggle-about', 'pbtn--about', 'pl__about']) {
    assert.ok(!html.includes(gone), `简介残留：${gone}`);
  }
  const extra = /<div class="pl__extra">([\s\S]*?)<\/div>\s*<p class="pl__state"/.exec(html);
  assert.ok(extra && /id="plLyricsBtn"/.test(extra[1]), '「词」不在迷你条操作区');
  const fullbtns = /<div class="pl__fullbtns"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  assert.ok(fullbtns && /id="plLyricsBtnFull"/.test(fullbtns[1]), '「词」不在展开页主控区');
});

test('panels · catalog 携带简介所需元数据', () => {
  buildDemo();
  const catalog = JSON.parse(readDist('assets/data/catalog.json'));
  const song = catalog.songs.find((s) => s.slug === 'qingchun-dagai');
  assert.ok(song, 'demo 构建应含正式歌曲');
  for (const key of ['composer', 'lyricist', 'originalArtist', 'versionNote', 'versionBy', 'tools', 'about', 'credits']) {
    assert.ok(key in song, `catalog 缺字段 ${key}`);
  }
  assert.equal(song.originalArtist, '徐鸣');
  assert.equal(song.versionNote, '翻唱版本');
});

/* ── 2. CSS ─────────────────────────────────────────── */

test('panels · 字号只缩放歌词文字，选中态清晰；全屏骨架吃满高度且间距显式', () => {
  const css = read('assets/css/player.css');
  assert.match(css, /\.pl__lyrics\[data-font="s"\] \{ --lrc-scale:\.86; \}/);
  assert.match(css, /\.pl__lyrics\[data-font="l"\] \{ --lrc-scale:1\.2; \}/);
  assert.match(css, /\.pl__lyrics \.lrc__line \{[^}]*font-size:calc\(1\.02rem \* var\(--lrc-scale,1\)\)/);
  assert.match(css, /\.pl__lyrics \.lrc__line\.is-active \{[^}]*font-size:calc\(1\.14rem \* var\(--lrc-scale,1\)\)/);
  assert.match(css, /\.pl__font__btn\[aria-pressed="true"\] \{ background:var\(--acc\);/);
  // 工具栏允许换行，不产生横向溢出；默认隐藏，仅设置态（data-tools）显示
  assert.match(css, /\.pl__toolbar \{ display:none; flex-wrap:wrap;/);
  assert.match(css, /\.pl__stage\[data-stage="lyrics"\]\[data-tools="true"\] \.pl__toolbar \{ display:flex; \}/);
  assert.match(css, /\.pl__calib \{ display:flex;[^}]*flex-wrap:wrap;/);
  // 骨架：舞台 flex:1 吃满剩余高度（无 max-height / 无纵向 auto margin），歌词容器不限高，
  // 歌名/作者 p 的默认 margin 清零，块间距显式；100dvh + 矮屏 / 横屏压缩
  assert.match(css, /\.pl__full \{[^}]*height:100dvh;/);
  assert.match(css, /\.pl__stage \{ flex:1;[^}]*margin:0 auto 22px; min-height:0; \}/);
  assert.match(css, /\.pl__lyricsbox \{[^}]*flex:1;/);
  assert.match(css, /\.pl__lyrics \{[^}]*max-height:none;/);
  assert.match(css, /\.pl__lyrics \{[^}]*box-sizing:border-box;/, '留白 padding 必须计入 flex 分配高度');
  assert.match(css, /\.pl__fullsong \{ margin:0;/);
  assert.match(css, /\.pl__fullartist \{ margin:6px 0 0;/);
  assert.match(css, /\.pl__fullseek \{[^}]*margin:22px auto 0; \}/);
  assert.match(css, /\.pl__fullbtns \{[^}]*margin:18px auto 0; \}/);
  assert.match(css, /@media \(max-height:700px\)/);
  assert.match(css, /@media \(max-height:520px\)/);
  assert.ok(!/\.pl__about/.test(css), '简介样式应已移除');
  const mobile = read('assets/css/layout-mobile.css');
  assert.match(mobile, /\.pl__stage \{ margin:0 auto 20px; \}/);
  assert.match(mobile, /\.pl__fullseek \{ margin-top:20px; \}/);
  assert.match(mobile, /\.pl__fullbtns \{ margin-top:16px; \}/);
  assert.match(mobile, /\.pl__extra > :not\(\.pbtn--lyrics\) \{ display:none; \}/);
});
/* ── 3. store ───────────────────────────────────────── */

test('panels · sanitizeState 逐曲偏移：坏键坏值单独丢，有效保留', () => {
  const repaired = [];
  const out = sanitizeState({
    lyricOffsets: { 'good-song': 1.5, '../evil': 2, 'ok-two': -3.25, 'bad-val': 'x', 'out-of-range': 99, 'nan': NaN }
  }, repaired);
  assert.deepEqual(out.lyricOffsets, { 'good-song': 1.5, 'ok-two': -3.2 }, '坏条目应被丢弃且不影响好条目');
  assert.ok(repaired.includes('lyricOffsets'));
  const arr = sanitizeState({ lyricOffsets: [1, 2] }, []);
  assert.deepEqual(arr.lyricOffsets, {});
  const none = sanitizeState({}, []);
  assert.deepEqual(none.lyricOffsets, {});
});

test('panels · 字号偏好：非法值回退中，存取走当前浏览器', () => {
  assert.equal(normalizeLrcFont('l'), 'l');
  assert.equal(normalizeLrcFont('xl'), 'm');
  assert.equal(normalizeLrcFont(undefined), 'm');
  const store = new Store(new MemoryStorage());
  assert.equal(store.getLrcFont(), 'm');
  assert.equal(store.setLrcFont('s'), 's');
  assert.equal(store.getLrcFont(), 's');
  store.setLrcFont('nope');
  assert.equal(store.getLrcFont(), 'm', '非法写入应回退默认');
});

/* ── 4. Player 逐曲偏移 ─────────────────────────────── */

function setupPlayer(storage = new MemoryStorage()) {
  const audio = new FakeAudio();
  const store = new Store(storage);
  const catalog = makeCatalog(['a', 'b']);
  catalog.songs.forEach((s) => { s.instrumental = false; s.lyrics = `assets/lyrics/${s.slug}.lrc`; });
  const player = new Player({
    audio, catalog, store,
    resolve: (s) => `https://example.com/${s}`,
    fetchText: async () => '[00:00.00]第一句\n[00:05.00]第二句\n[00:10.00]第三句'
  });
  return { player, audio, store, storage };
}

test('panels · 校准按歌曲保存：切歌互不影响，回到原曲恢复', async () => {
  const { player, store } = setupPlayer();
  await player.playSong('a');
  player.adjustLyricOffset(0.5);
  assert.equal(store.data.lyricOffsets.a, 0.5);
  await player.playSong('b');
  assert.equal(player.lyricOffset, 0, 'b 没校准过 → 0，不能继承 a');
  assert.equal(player.lyrics.lines[1].time, 5);
  player.adjustLyricOffset(-1);
  assert.equal(store.data.lyricOffsets.b, -1);
  assert.equal(store.data.lyricOffsets.a, 0.5, 'b 的调整不能污染 a');
  await player.playSong('a');
  assert.equal(player.lyricOffset, 0.5);
  assert.equal(player.lyrics.lines[1].time, 4.5, '回到 a 应恢复 a 自己的偏移');
  player.setLyricOffset(0);
  assert.equal(store.data.lyricOffsets.a, undefined, '归零应删除该曲条目');
});

test('panels · 刷新恢复：新 Player 读同一存储即拿回该曲偏移', async () => {
  const storage = new MemoryStorage();
  const first = setupPlayer(storage);
  await first.player.playSong('a');
  first.player.adjustLyricOffset(1.5);
  const second = setupPlayer(storage);
  await second.player.playSong('a');
  assert.equal(second.player.lyricOffset, 1.5);
  assert.equal(second.player.lyrics.lines[1].time, 3.5);
});

/* ── 5. jsdom 整机 ──────────────────────────────────── */

test('panels · 整机：字号立即生效、只改歌词、刷新后恢复', async () => {
  const { window, app, audio } = await makeApp('/songs/demo-night-ferry/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"]'));
  await wait();
  click(window, doc.getElementById('plLyricsBtn'));
  await wait();
  click(window, doc.getElementById('plLyricsBtn')); // 纯享 → 设置
  await wait();
  const box = doc.getElementById('plLyrics');
  assert.equal(box.dataset.font, 'm', '默认中');
  assert.ok(box.querySelector('.lrc__line'), '歌词应已渲染');
  click(window, doc.querySelector('[data-act="lyric-font"][data-size="l"]'));
  await wait();
  assert.equal(box.dataset.font, 'l');
  assert.equal(doc.querySelector('[data-act="lyric-font"][data-size="l"]').getAttribute('aria-pressed'), 'true');
  assert.equal(doc.querySelector('[data-act="lyric-font"][data-size="m"]').getAttribute('aria-pressed'), 'false');
  assert.equal(window.localStorage.getItem('zx.music.lrcFont'), 'l');
  assert.equal(app.player.state, 'playing', '字号切换不得中断播放');
  assert.equal(doc.getElementById('zx-audio'), audio);
  const t = app.player.lyrics.lines[1].time;
  click(window, doc.querySelector('[data-act="lyric-font"][data-size="s"]'));
  await wait();
  assert.equal(app.player.lyrics.lines[1].time, t, '字号不得改动时间轴');
  const seed = { 'zx.music.lrcFont': window.localStorage.getItem('zx.music.lrcFont') };
  const again = await makeApp('/songs/demo-night-ferry/', { storage: seed });
  assert.equal(again.window.document.getElementById('plLyrics').dataset.font, 's');
  assert.equal(again.window.document.querySelector('[data-act="lyric-font"][data-size="s"]').getAttribute('aria-pressed'), 'true');
});

test('panels · 整机：校准逐曲保存，切歌不串，读数与存储一致', async () => {
  const { window, app } = await makeApp('/songs/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"][data-slug="demo-night-ferry"]'));
  await wait();
  click(window, doc.getElementById('plLyricsBtn'));
  await wait();
  click(window, doc.getElementById('plLyricsBtn')); // 纯享 → 设置
  await wait();
  click(window, doc.querySelector('[data-act="lyric-offset"][data-delta="0.5"]'));
  await wait();
  assert.equal(app.player.lyricOffset, 0.5);
  assert.equal(doc.getElementById('plCalibVal').textContent, '+0.5s');
  click(window, doc.querySelector('[data-act="play-song"][data-slug="demo-paper-boat"]'));
  await wait();
  assert.equal(app.player.lyricOffset, 0, '纯音乐新歌不应继承上一首偏移');
  assert.equal(doc.getElementById('plCalibVal').textContent, '0.0s');
  click(window, doc.querySelector('[data-act="play-song"][data-slug="demo-night-ferry"]'));
  await wait();
  assert.equal(app.player.lyricOffset, 0.5, '回到原曲恢复其偏移');
  assert.equal(doc.getElementById('plCalibVal').textContent, '+0.5s');
  const saved = JSON.parse(window.localStorage.getItem('zx.music.v1'));
  assert.equal(saved.lyricOffsets['demo-night-ferry'], 0.5);
  assert.equal(saved.lyricOffsets['demo-paper-boat'], undefined);
});

test('panels · 整机：简介入口已移除，展示模式只在 cover/vinyl/lyrics 三舞台循环', async () => {
  const { window, app, audio } = await makeApp('/songs/demo-night-ferry/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"]'));
  await wait();
  assert.equal(doc.getElementById('plAboutBtn'), null);
  assert.equal(doc.getElementById('plAboutBtnFull'), null);
  assert.equal(doc.getElementById('plAbout'), null);
  const stage = doc.getElementById('plStage');
  const view = doc.querySelector('[data-act="cycle-view"]');
  const seen = [stage.dataset.stage];
  for (let i = 0; i < 3; i++) { click(window, view); await wait(); seen.push(stage.dataset.stage); }
  assert.deepEqual(seen, ['cover', 'vinyl', 'lyrics', 'cover'], '展示模式应三舞台循环，不再含 about');
  assert.equal(app.player.state, 'playing');
  assert.equal(doc.getElementById('zx-audio'), audio);
});

test('panels · 整机：「词」连点六次恰好两圈，一次点击只推进一态', async () => {
  const { window, app, audio } = await makeApp('/songs/demo-night-ferry/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"]'));
  await wait();
  const btn = doc.getElementById('plLyricsBtn');
  const modes = [];
  // 委托把 handleClick 包在微任务里：每次点击后 flush 一次再读态。
  // 真实浏览器里每次点击本就是独立任务；这里验的是一次点击只推进一态、不连跳。
  for (let i = 0; i < 6; i++) { click(window, btn); await wait(0); modes.push(app.ui.lyricsMode); }
  await wait();
  assert.deepEqual(modes, ['pure', 'settings', 'off', 'pure', 'settings', 'off'], '三态循环不得连跳或回退');
  assert.equal(doc.getElementById('plStage').dataset.stage, 'cover');
  assert.equal(btn.dataset.mode, 'off');
  assert.equal(app.player.state, 'playing', '连点不得中断播放');
  assert.equal(doc.getElementById('zx-audio'), audio);
});

test('panels · 整机：设置态收起再展开仍在；切歌保持三态但校准逐曲', async () => {
  const { window, app } = await makeApp('/songs/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"][data-slug="demo-night-ferry"]'));
  await wait();
  const btn = doc.getElementById('plLyricsBtn');
  click(window, btn); await wait();
  click(window, btn); await wait();
  assert.equal(app.ui.lyricsMode, 'settings');
  click(window, doc.querySelector('[data-act="collapse"]'));
  await wait();
  assert.equal(app.ui.lyricsMode, 'off', '收起时歌词不显示 → 按钮回普通态');
  assert.equal(app.ui.lyricsTools, true, '会话内工具栏偏好保留');
  click(window, doc.querySelector('[data-act="expand"]'));
  await wait();
  assert.equal(app.ui.lyricsMode, 'settings', '封面展开应恢复设置态');
  click(window, doc.querySelector('[data-act="lyric-offset"][data-delta="0.5"]'));
  await wait();
  assert.equal(app.player.lyricOffset, 0.5);
  click(window, doc.querySelector('[data-act="play-song"][data-slug="demo-paper-boat"]'));
  await wait();
  assert.equal(app.player.lyricOffset, 0, '切歌不得沿用上一首校准');
  assert.equal(app.ui.lyricsMode, 'settings', '切歌不应关掉歌词设置态');
  click(window, doc.querySelector('[data-act="play-song"][data-slug="demo-night-ferry"]'));
  await wait();
  assert.equal(app.player.lyricOffset, 0.5, '回原曲恢复其校准');
  click(window, btn); await wait();
  assert.equal(app.ui.lyricsMode, 'off', '设置态再点一次 → 隐藏');
  assert.equal(doc.getElementById('plStage').dataset.tools, 'false');
});

test('panels · 整机：刷新后首击回纯享（三态不持久化），字号与逐曲校准仍恢复', async () => {
  const state = JSON.stringify({ version: 1, stage: 'lyrics', stageLocked: true, lyricOffsets: { 'demo-night-ferry': 1.5 }, queue: { items: [{ slug: 'demo-night-ferry' }], cursor: 0 } });
  const { window, app } = await makeApp('/songs/demo-night-ferry/', { storage: { 'zx.music.v1': state, 'zx.music.lrcFont': 's' } });
  const doc = window.document;
  await wait(80);
  const btn = doc.getElementById('plLyricsBtn');
  assert.equal(doc.getElementById('player-root').dataset.expanded, 'false');
  assert.equal(btn.dataset.mode, 'off');
  click(window, btn);
  await wait();
  assert.equal(app.ui.lyricsMode, 'pure', '刷新后第一次点击必须是纯享');
  assert.equal(doc.getElementById('plStage').dataset.tools, 'false');
  assert.equal(doc.getElementById('plLyrics').dataset.font, 's', '字号偏好仍恢复');
  assert.equal(app.player.lyricOffset, 1.5, '逐曲校准仍恢复');
  assert.equal(doc.getElementById('plCalibVal').textContent, '+1.5s');
  click(window, btn);
  await wait();
  assert.equal(app.ui.lyricsMode, 'settings');
});

test('panels · 整机：歌词面板随切歌更新，不残留上一首；跨页后仍在', async () => {
  const { window, app } = await makeApp('/songs/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"][data-slug="demo-night-ferry"]'));
  await wait();
  click(window, doc.getElementById('plLyricsBtn'));
  await wait();
  const box = doc.getElementById('plLyrics');
  const first = box.textContent;
  assert.ok(first.length > 0, '歌词应已渲染');
  click(window, doc.querySelector('[data-act="play-song"][data-slug="demo-paper-boat"]'));
  await wait();
  assert.equal(doc.getElementById('plStage').dataset.stage, 'lyrics', '切歌不应关掉歌词面板');
  assert.notEqual(box.textContent, first, '歌词应换为当前曲');
  click(window, doc.querySelector('.nav__ul .nav__a')); // 首页（href 启动时已绝对化）
  await wait(120);
  assert.equal(doc.getElementById('plStage').dataset.stage, 'lyrics');
  assert.equal(app.player.state, 'playing');
});

test('panels · 整机：旧存储的 about 舞台逐字段回退 cover，逐曲偏移仍恢复', async () => {
  // stageLocked:true 与真实点击舞台后的存储一致（未锁定的舞台会被外观预设接管）
  const state = JSON.stringify({ version: 1, stage: 'about', stageLocked: true, lyricOffsets: { 'demo-night-ferry': 1.5 }, queue: { items: [{ slug: 'demo-night-ferry' }], cursor: 0 } });
  const { window, app } = await makeApp('/songs/demo-night-ferry/', { storage: { 'zx.music.v1': state } });
  const doc = window.document;
  await wait(80);
  assert.equal(app.player.lyricOffset, 1.5, '坏舞台字段不得连累逐曲偏移');
  assert.equal(doc.getElementById('plCalibVal').textContent, '+1.5s');
  assert.equal(doc.getElementById('plStage').dataset.stage, 'cover', '已下线的 about 舞台应回退封面');
});