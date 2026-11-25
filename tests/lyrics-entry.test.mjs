/**
 * tests/lyrics-entry.test.mjs — 歌词入口「词」按钮与面板内「歌词校准」的回归。
 *
 * 三层：
 *  1. 构建产物：按钮常驻迷你条操作区与展开页主控区、文字标签、aria 状态、校准组在面板内；
 *  2. CSS：圆角边框浅底、展开态主题红、44×44 点击区、移动端迷你条仍可见「词」；
 *  3. 行为：Player 运行时偏移（平移 / 钳位 / 换歌复位 / 事件）+ jsdom 整机 toggle 与空状态提示。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Player } from '../assets/js/player.js';
import { Store } from '../assets/js/store.js';
import { FakeAudio, MemoryStorage, makeCatalog } from './helpers/fake-audio.mjs';
import { buildDemo, makeApp, click, wait } from './helpers/dom-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readDist = (p) => fs.readFileSync(path.join(ROOT, 'dist', p), 'utf8');

/* ── 1. 构建产物 ─────────────────────────────────────── */

test('lyrics-entry · 「词」按钮常驻迷你条操作区与展开页主控区', () => {
  buildDemo();
  const html = readDist('index.html');
  const extra = /<div class="pl__extra">([\s\S]*?)<\/div>\s*<p class="pl__state"/.exec(html);
  assert.ok(extra, '找不到迷你条操作区');
  assert.match(extra[1], /id="plLyricsBtn"/, '「词」不在迷你条操作区（与模式/音量同区）');
  const fullbtns = /<div class="pl__fullbtns"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  assert.ok(fullbtns && /id="plLyricsBtnFull"/.test(fullbtns[1]), '「词」不在展开页主控区');
  for (const id of ['plLyricsBtn', 'plLyricsBtnFull']) {
    const btn = new RegExp(`<button[^>]*id="${id}"[^>]*>([\\s\\S]*?)</button>`).exec(html);
    assert.ok(btn, `缺 #${id}`);
    assert.equal(btn[1].replace(/<[^>]+>/g, '').trim(), '词', `#${id} 可见文字应为「词」`);
    assert.match(btn[0], /data-act="toggle-lyrics"/);
    assert.match(btn[0], /data-mode="off"/, '初始应为隐藏态');
    assert.match(btn[1], /class="pbtn__gear"/, '设置态齿轮标记应预渲染，靠 CSS 切显隐');
    assert.match(btn[1], /<svg class="icon icon--gear"/);
    assert.match(btn[0], /aria-label="显示歌词"/);
    assert.match(btn[0], /aria-expanded="false"/);
    assert.match(btn[0], /aria-controls="plLyrics"/);
    assert.match(btn[0], /pbtn--lyrics/);
  }
  assert.ok(!/data-act="open-lyrics"/.test(html), '旧的图标歌词入口仍在');
});

test('lyrics-entry · 歌词校准组在面板内，标注「歌词校准」，默认禁用', () => {
  buildDemo();
  const html = readDist('index.html');
  const stage = /<div class="pl__stage"[\s\S]*?<\/section>/.exec(html)[0];
  const calib = /<div class="pl__calib"[^>]*>([\s\S]*?)<\/div>/.exec(stage);
  assert.ok(calib, '校准组不在歌词舞台内');
  assert.match(calib[0], /aria-label="歌词校准"/);
  assert.match(calib[1], /歌词校准/);
  assert.match(calib[1], /data-act="lyric-offset" data-delta="-0\.5"/);
  assert.match(calib[1], /data-act="lyric-offset" data-delta="0\.5"/);
  assert.match(calib[1], /data-act="lyric-offset-reset"/);
  assert.match(calib[1], /id="plCalibVal"/);
  for (const m of calib[1].matchAll(/<button[^>]*>/g)) assert.match(m[0], /disabled/, '校准按钮初始应禁用');
  // 面板自带静态空状态：JS 未启动 / 未选歌时也不会是一片空白
  assert.match(html, /id="plLyrics"[^>]*><p class="lyrics-empty">暂无歌词<\/p>/);
});

/* ── 2. CSS ─────────────────────────────────────────── */

test('lyrics-entry · 「词」按钮样式：边框浅底、展开态主题红、44×44', () => {
  const css = read('assets/css/player.css');
  const base = /\.pbtn--lyrics \{([^}]*)\}/.exec(css)[1];
  assert.match(base, /border-color:var\(--line-2\)/);
  assert.match(base, /background:var\(--panel-2\)/);
  assert.match(base, /color:var\(--text\)/);
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(base), '「词」按钮硬编码颜色');
  const on = /\.pbtn--lyrics\[aria-expanded="true"\][^{]*\{([^}]*)\}/.exec(css)[1];
  assert.match(on, /background:var\(--acc\)/);
  assert.match(on, /color:var\(--on-acc\)/);
  // 三态标记：齿轮默认隐藏，仅设置态露出（纯享与设置共用 aria-expanded 高亮）
  assert.match(css, /\.pbtn__gear \{ display:none;/);
  assert.match(css, /\.pbtn--lyrics\[data-mode="settings"\] \.pbtn__gear \{ display:inline-flex; \}/);
  // 点击区沿用 .pbtn 的 --pbtn-size（site.css 44px，移动端未缩小）
  assert.match(read('assets/css/site.css'), /--pbtn-size:44px/);
  assert.ok(!/--pbtn-size/.test(read('assets/css/layout-mobile.css')), '移动端缩小了功能键点击区');
  assert.match(css, /\.pbtn \{[\s\S]*?width:var\(--pbtn-size\); height:var\(--pbtn-size\)/);
  assert.match(css, /\.pbtn \{[\s\S]*?border-radius:12px/);
});

test('lyrics-entry · 移动端迷你条仍显示「词」，其余功能键留在展开页', () => {
  const mobile = read('assets/css/layout-mobile.css');
  assert.match(mobile, /\.pl__extra \{ display:flex; \}/);
  assert.match(mobile, /\.pl__extra > :not\(\.pbtn--lyrics\) \{ display:none; \}/);
  // 单行：封面/信息 | 「词」 | 三主控（grid-area 重排现有节点，不移动 DOM）
  assert.match(mobile, /\.pl__bar \{ grid-template-columns:auto minmax\(0,1fr\) auto auto; grid-template-rows:auto;/);
  assert.match(mobile, /\.pl__extra \{ grid-area:1\/3\/2\/4;/);
  assert.match(mobile, /\.pl__btns \{ grid-area:1\/4\/2\/5; gap:4px; flex-wrap:nowrap; \}/);
});

test('lyrics-entry · 校准组在歌词面板顶部工具栏内，只随歌词舞台显示，触控目标 ≥44px', () => {
  const css = read('assets/css/player.css');
  // 工具栏（字号 + 校准）整体只在歌词舞台显示；校准组不再挂在歌词下方
  assert.match(css, /\.pl__lyricswrap \{ display:none;/);
  assert.match(css, /\.pl__stage\[data-stage="lyrics"\] \.pl__lyricswrap \{ display:flex; \}/);
  assert.match(css, /\.pl__calib \{ display:flex;/);
  const btn = /\.pl__calib__btn \{([^}]*)\}/.exec(css)[1];
  assert.match(btn, /min-width:44px; min-height:44px/);
  assert.match(btn, /border-radius:10px/);
  const font = /\.pl__font__btn \{([^}]*)\}/.exec(css)[1];
  assert.match(font, /min-width:44px; min-height:44px/);
});


/* ── 3a. Player 运行时偏移 ──────────────────────────── */

function setupPlayer({ lyricsText = '[00:00.00]第一句\n[00:05.00]第二句\n[00:10.00]第三句' } = {}) {
  const audio = new FakeAudio();
  const store = new Store(new MemoryStorage());
  const catalog = makeCatalog(['a', 'b']);
  catalog.songs.forEach((s) => { s.instrumental = false; s.lyrics = `assets/lyrics/${s.slug}.lrc`; });
  const player = new Player({
    audio, catalog, store,
    resolve: (s) => `https://example.com/${s}`,
    fetchText: async () => lyricsText
  });
  return { player, audio };
}

test('lyrics-entry · 校准平移时间轴：正值提前、负值延后、下钳到 0', async () => {
  const { player } = setupPlayer();
  await player.playSong('a');
  assert.equal(player.lyrics.lines[1].time, 5);
  player.adjustLyricOffset(0.5);
  assert.equal(player.lyricOffset, 0.5);
  assert.equal(player.lyrics.lines[1].time, 4.5);
  assert.equal(player.lyrics.lines[0].time, 0, '提前后首句应下钳到 0');
  player.adjustLyricOffset(-1);
  assert.equal(player.lyricOffset, -0.5);
  assert.equal(player.lyrics.lines[1].time, 5.5);
  player.setLyricOffset(0);
  assert.equal(player.lyrics.lines[1].time, 5, '重置后应回到原始时间轴');
});

test('lyrics-entry · 校准钳位 ±30s，反复调整不累积误差', async () => {
  const { player } = setupPlayer();
  await player.playSong('a');
  for (let i = 0; i < 100; i++) player.adjustLyricOffset(0.5);
  assert.equal(player.lyricOffset, 30);
  for (let i = 0; i < 200; i++) player.adjustLyricOffset(-0.5);
  assert.equal(player.lyricOffset, -30);
  assert.equal(player.lyrics.lines[1].time, 35, '延后 30s 应基于原始时间轴');
});

test('lyrics-entry · 校准后重算高亮行并发事件；换歌复位', async () => {
  const { player, audio } = setupPlayer();
  await player.playSong('a');
  audio.currentTime = 4.6;
  audio.dispatchEvent(new Event('timeupdate'));
  assert.equal(player.lyricIndex, 0);
  const events = [];
  player.on('lyric-offset', (d) => events.push(d.offset));
  player.on('lyric-line', (d) => events.push(`line:${d.index}`));
  player.adjustLyricOffset(0.5); // 第二句 5 → 4.5，4.6s 应落在第二句
  assert.equal(player.lyricIndex, 1);
  assert.ok(events.includes(0.5) && events.includes('line:1'), `事件缺失：${events}`);
  await player.playSong('b');
  assert.equal(player.lyricOffset, 0, '换歌后校准应复位');
  assert.equal(player.lyrics.lines[1].time, 5);
});

/* ── 3b. jsdom 整机 ─────────────────────────────────── */

test('lyrics-entry · 整机：「词」三态循环 隐藏→纯享→设置→隐藏，aria 与齿轮态同步，audio 不动', async () => {
  const { window, app, audio } = await makeApp('/songs/demo-night-ferry/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"]'));
  await wait();
  const barBtn = doc.getElementById('plLyricsBtn');
  const fullBtn = doc.getElementById('plLyricsBtnFull');
  const stage = doc.getElementById('plStage');
  assert.equal(barBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(barBtn.dataset.mode, 'off');

  click(window, barBtn); // 1 → 纯享
  await wait();
  assert.equal(doc.getElementById('player-root').dataset.expanded, 'true');
  assert.equal(stage.dataset.stage, 'lyrics');
  assert.equal(stage.dataset.tools, 'false', '纯享不得显示工具栏');
  for (const b of [barBtn, fullBtn]) {
    assert.equal(b.getAttribute('aria-expanded'), 'true');
    assert.equal(b.dataset.mode, 'pure');
    assert.equal(b.getAttribute('aria-label'), '显示歌词设置');
  }
  assert.equal(doc.getElementById('zx-audio'), audio, 'toggle 不得重建 audio');
  assert.equal(app.player.state, 'playing', 'toggle 不得中断播放');

  click(window, fullBtn); // 2 → 设置
  await wait();
  assert.equal(stage.dataset.stage, 'lyrics', '设置态仍显示歌词');
  assert.equal(stage.dataset.tools, 'true');
  for (const b of [barBtn, fullBtn]) {
    assert.equal(b.dataset.mode, 'settings');
    assert.equal(b.getAttribute('aria-label'), '收起歌词');
  }

  click(window, barBtn); // 3 → 隐藏
  await wait();
  assert.equal(stage.dataset.stage, 'cover');
  assert.equal(stage.dataset.tools, 'false');
  for (const b of [barBtn, fullBtn]) {
    assert.equal(b.getAttribute('aria-expanded'), 'false');
    assert.equal(b.dataset.mode, 'off');
    assert.equal(b.getAttribute('aria-label'), '显示歌词');
  }
  assert.equal(app.player.state, 'playing');
});

test('lyrics-entry · 整机：面板内校准生效，读数更新，重置归零', async () => {
  const { window, app } = await makeApp('/songs/demo-night-ferry/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"]'));
  await wait();
  click(window, doc.getElementById('plLyricsBtn'));
  await wait();
  click(window, doc.getElementById('plLyricsBtn')); // 纯享 → 设置，工具栏才可见
  await wait();
  const plus = doc.querySelector('[data-act="lyric-offset"][data-delta="0.5"]');
  assert.equal(plus.disabled, false, '带时间轴歌词加载后校准应可用');
  const base = app.player.lyrics.lines[1].time;
  click(window, plus);
  await wait();
  assert.equal(app.player.lyricOffset, 0.5);
  assert.equal(app.player.lyrics.lines[1].time, Math.max(0, base - 0.5));
  assert.equal(doc.getElementById('plCalibVal').textContent, '+0.5s');
  click(window, doc.querySelector('[data-act="lyric-offset-reset"]'));
  await wait();
  assert.equal(app.player.lyricOffset, 0);
  assert.equal(doc.getElementById('plCalibVal').textContent, '0.0s');
});

test('lyrics-entry · 整机：当前没有可显示的歌词时「词」仍可点，提示「暂无歌词」', async () => {
  // 播放条现在会预置最新一首（不出声），「完全没选歌」只在空曲库出现；
  // 这里等预置歌的歌词落地后，再模拟「这首没有歌词」，覆盖同一条无歌词分支。
  const { window, app } = await makeApp('/');
  const doc = window.document;
  await wait(150);
  app.player.lyrics = { format: 'none', meta: {}, lines: [] };
  app.player.emit('lyrics', { song: app.player.currentSong, lyrics: app.player.lyrics, pending: false });
  const btn = doc.getElementById('plLyricsBtn');
  assert.equal(btn.disabled, false, '无歌词时按钮必须可发现、可点击');
  click(window, btn);
  await wait();
  assert.equal(doc.getElementById('plStage').dataset.stage, 'lyrics');
  assert.equal(btn.dataset.mode, 'pure', '无歌词时首击也进纯享');
  assert.match(doc.getElementById('plLyrics').textContent, /暂无歌词/);
  assert.match(doc.getElementById('toasts').textContent, /暂无歌词/);
  for (const b of doc.querySelectorAll('.pl__calib__btn')) assert.equal(b.disabled, true);
});

