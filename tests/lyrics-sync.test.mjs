/**
 * tests/lyrics-sync.test.mjs — 歌词同步与自动跟随的回归测试。
 *
 * 守两个真实故障（线上「歌词与音乐有时间差」的根因）：
 *  1. 异步歌词落地时播放已在曲中（刷新恢复进度 / 慢网）→ 必须立即按 currentTime 定位并
 *     emit lyric-line；只赋值不 emit 会让高亮冻到下一句时间戳（真实歌曲句间隔 20s+）。
 *  2. 自动跟随自己的 scrollTo 也触发 scroll 事件 → 不能被当成用户手动滚动而自我暂停。
 * 以及需求：用户滚动暂停 + 「回到当前歌词」按钮、seek/切歌/重开面板立即定位、
 * 纯文本不模拟同步、reduced-motion 瞬时滚动、只滚容器不带动整页。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../assets/js/player.js';
import { FakeAudio, makeCatalog } from './helpers/fake-audio.mjs';
import { makeApp, wait } from './helpers/dom-app.mjs';

const LRC = '[00:00.00]one\n[00:10.00]two\n[01:00.00]three\n[01:30.00]four';

function makePlayer({ delay = 25, duration = 120 } = {}) {
  const audio = new FakeAudio({ duration });
  const player = new Player({
    audio,
    catalog: makeCatalog(['a']),
    resolve: (s) => s,
    resolveAudio: (s) => s,
    fetchText: async () => { await new Promise((r) => setTimeout(r, delay)); return LRC; }
  });
  return { audio, player };
}

test('sync · 异步歌词在曲中落地：立即 emit lyric-line 定位，不等下一句', async () => {
  const { audio, player } = makePlayer();
  const lines = [];
  player.on('lyric-line', (d) => lines.push(d.index));
  await player.playSong('a', { autoplay: false });
  audio.emitLoadedMetadata();
  audio.currentTime = 70; // 恢复进度 / 慢网：歌词回来时已经播到 70s
  await new Promise((r) => setTimeout(r, 60)); // 期间没有任何 timeupdate
  assert.equal(player.lyricIndex, 2);
  assert.deepEqual(lines, [2], '落地即定位；旧代码在这里静默赋值，高亮冻到 90s 才动');
});

test('sync · seek 与 seeked 都发 seek 事件，且按真实 currentTime 重定位', async () => {
  const { audio, player } = makePlayer({ delay: 0 });
  await player.playSong('a', { autoplay: false });
  audio.emitLoadedMetadata();
  await new Promise((r) => setTimeout(r, 10));
  const seeks = [];
  const lines = [];
  player.on('seek', (d) => seeks.push(d.time));
  player.on('lyric-line', (d) => lines.push(d.index));
  player.seek(95);
  assert.deepEqual(seeks, [95]);
  assert.equal(player.lyricIndex, 3);
  audio.dispatchEvent(new Event('seeked')); // 浏览器落地（含恢复进度 / 循环重播）
  assert.deepEqual(seeks, [95, 95]);
  audio.tick(0.2); // 同一行内不应重复 emit
  assert.deepEqual(lines, [3]);
});

test('sync · 刷新恢复进度：歌词落地后高亮立即在正确行（jsdom 全链路）', async () => {
  const state = {
    version: 1,
    position: 70,
    queue: { items: [{ slug: 'qingchun-dagai' }], cursor: 0, mode: 'order' },
    stage: 'lyrics'
  };
  const { window, app, audio } = await makeApp('/', { storage: { 'zx.music.v1': JSON.stringify(state) } });
  Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 0 });
  audio.dispatchEvent(new window.Event('loadedmetadata')); // pendingSeek=70 落地
  audio.dispatchEvent(new window.Event('seeked')); // jsdom 不模拟媒体：真实浏览器设置 currentTime 后会发 seeked
  await wait(150); // 歌词 fetch 异步落地；期间不 dispatch 任何 timeupdate
  const c = window.document.getElementById('plLyrics');
  const active = c.querySelector('.lrc__line.is-active');
  assert.equal(app.player.lyricIndex, 10, '70s 落在 [01:03.99] 一句');
  assert.ok(active, '高亮不能冻在旧行/空状态');
  assert.equal(active.dataset.i, '10');
  assert.equal(window.document.getElementById('plLyricsBack').hidden, true);
  window.close();
});

/** 给 jsdom 容器装一个「会真的触发 scroll 事件」的 scrollTo，模拟真实浏览器 */
function instrumentScroll(window, c) {
  const calls = [];
  c.scrollTo = (opt) => {
    calls.push(opt);
    c.scrollTop = opt.top;
    c.dispatchEvent(new window.Event('scroll'));
  };
  return calls;
}

test('follow · 程序化滚动不算用户滚动；wheel 暂停 + 按钮恢复 + seek 立即定位', async () => {
  const { window, app, audio } = await makeApp('/songs/qingchun-dagai/');
  const c = window.document.getElementById('plLyrics');
  const back = window.document.getElementById('plLyricsBack');
  const calls = instrumentScroll(window, c);
  await app.player.playSong('qingchun-dagai');
  Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 30 });
  audio.dispatchEvent(new window.Event('timeupdate'));
  assert.equal(app.player.lyricIndex, 2);
  assert.ok(calls.length >= 1, '当前行变化应触发容器滚动');
  assert.equal(back.hidden, true, '自己的 smooth scroll 触发的 scroll 事件不能暂停跟随');

  c.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 120, bubbles: true }));
  assert.equal(back.hidden, false, '用户滚轮 → 暂停跟随并显示「回到当前歌词」');
  const n = calls.length;
  audio.currentTime = 35;
  audio.dispatchEvent(new window.Event('timeupdate'));
  assert.equal(app.player.lyricIndex, 4); // [00:34.84] 一句
  assert.equal(calls.length, n, '用户手动滚动期间不自动拽回');
  assert.ok(c.querySelector('.lrc__line.is-active'), '暂停跟随不影响高亮');

  back.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(back.hidden, true);
  assert.ok(calls.length > n, '点击按钮恢复跟随并定位当前行');

  c.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 120, bubbles: true }));
  assert.equal(back.hidden, false);
  app.player.seek(90);
  assert.equal(back.hidden, true, '拖动进度立即恢复跟随');
  assert.equal(app.player.lyricIndex, 11);
  assert.equal(c.querySelector('.lrc__line.is-active').dataset.i, '11');
  window.close();
});

test('follow · 触摸 / 键盘翻页同样暂停跟随；重开面板立即定位', async () => {
  const { window, app, audio } = await makeApp('/songs/qingchun-dagai/');
  const c = window.document.getElementById('plLyrics');
  const back = window.document.getElementById('plLyricsBack');
  const calls = instrumentScroll(window, c);
  await app.player.playSong('qingchun-dagai');
  Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 30 });
  audio.dispatchEvent(new window.Event('timeupdate'));
  c.dispatchEvent(new window.Event('touchstart', { bubbles: true }));
  assert.equal(back.hidden, false);
  back.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  c.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
  assert.equal(back.hidden, false);
  const n = calls.length;
  app.ui.setStage('cover');
  app.ui.expand('lyrics'); // 重开面板 → onStageChange → refollow
  assert.equal(back.hidden, true);
  assert.ok(calls.length > n, '重开面板立即滚到当前行');
  window.close();
});

test('follow · 切歌重置暂停状态与按钮', async () => {
  const { window, app, audio } = await makeApp('/songs/qingchun-dagai/');
  const c = window.document.getElementById('plLyrics');
  const back = window.document.getElementById('plLyricsBack');
  await app.player.playSong('qingchun-dagai');
  Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 30 });
  audio.dispatchEvent(new window.Event('timeupdate'));
  c.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 120, bubbles: true }));
  assert.equal(back.hidden, false);
  await app.player.playSong('demo-night-ferry');
  assert.equal(back.hidden, true, '切歌后不应残留「回到当前歌词」');
  await wait(120);
  assert.equal(app.player.currentSong.slug, 'demo-night-ferry');
  window.close();
});

test('follow · 纯文本歌词不模拟同步：不暂停、不显示按钮、不滚动', async () => {
  const { window, app } = await makeApp('/songs/qingchun-dagai/');
  const c = window.document.getElementById('plLyrics');
  const back = window.document.getElementById('plLyricsBack');
  const calls = instrumentScroll(window, c);
  app.player.emit('lyrics', {
    song: { slug: 'plain', instrumental: false },
    lyrics: { format: 'text', meta: {}, lines: [{ time: null, text: '一句没有时间的词' }] },
    pending: false
  });
  c.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 120, bubbles: true }));
  assert.equal(back.hidden, true);
  assert.equal(calls.length, 0);
  assert.equal(c.querySelector('.lrc__line.is-active'), null);
  window.close();
});

test('follow · prefers-reduced-motion 时瞬时滚动（behavior:auto）', async () => {
  const { window, app, audio } = await makeApp('/songs/qingchun-dagai/');
  const c = window.document.getElementById('plLyrics');
  const calls = instrumentScroll(window, c);
  const original = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
  try {
    await app.player.playSong('qingchun-dagai');
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 30 });
    audio.dispatchEvent(new window.Event('timeupdate'));
    assert.ok(calls.length >= 1);
    assert.equal(calls[calls.length - 1].behavior, 'auto');
  } finally {
    if (original) globalThis.matchMedia = original; else delete globalThis.matchMedia;
  }
  window.close();
});