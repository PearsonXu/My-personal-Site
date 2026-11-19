/**
 * tests/player-panels.test.mjs — 歌词工具栏（字号 + 校准）与「简介」面板的回归。
 *
 * 覆盖：
 *  1. 构建产物：工具栏在歌词面板顶部、字号三档默认中、校准在工具栏内、「简介」按钮常驻两处；
 *  2. CSS：字号只缩放歌词文字、简介面板只随 about 舞台显示、选中态清晰；
 *  3. store：逐曲偏移逐字段校验、字号偏好持久化；
 *  4. Player：偏移按歌曲保存 / 切歌互不影响 / 刷新恢复；
 *  5. SongInfoUI：缺失隐藏、全缺待补充、生成工具单独标注、不编造署名；
 *  6. jsdom 整机：字号立即生效 + 刷新恢复、校准逐曲、词/简介互斥、切歌更新简介、audio 不动。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { Player } from '../assets/js/player.js';
import { Store, sanitizeState, normalizeLrcFont } from '../assets/js/store.js';
import { SongInfoUI } from '../assets/js/ui/song-info-ui.js';
import { FakeAudio, MemoryStorage, makeCatalog } from './helpers/fake-audio.mjs';
import { buildDemo, makeApp, click, wait } from './helpers/dom-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readDist = (p) => fs.readFileSync(path.join(ROOT, 'dist', p), 'utf8');

/* ── 1. 构建产物 ─────────────────────────────────────── */

test('panels · 工具栏在歌词面板顶部：字号三档默认中 + 校准组在内', () => {
  buildDemo();
  const html = readDist('index.html');
  const wrap = /<div class="pl__lyricswrap">([\s\S]*?)<div class="pl__about"/.exec(html);
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

test('panels · 「简介」文字按钮常驻迷你条与展开页，aria 完整', () => {
  buildDemo();
  const html = readDist('index.html');
  const extra = /<div class="pl__extra">([\s\S]*?)<\/div>\s*<p class="pl__state"/.exec(html);
  assert.ok(extra && /id="plAboutBtn"/.test(extra[1]), '「简介」不在迷你条操作区');
  const fullbtns = /<div class="pl__fullbtns"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  assert.ok(fullbtns && /id="plAboutBtnFull"/.test(fullbtns[1]), '「简介」不在展开页主控区');
  for (const id of ['plAboutBtn', 'plAboutBtnFull']) {
    const btn = new RegExp(`<button[^>]*id="${id}"[^>]*>([\\s\\S]*?)</button>`).exec(html);
    assert.ok(btn, `缺 #${id}`);
    assert.equal(btn[1].trim(), '简介');
    assert.match(btn[0], /data-act="toggle-about"/);
    assert.match(btn[0], /aria-label="显示简介"/);
    assert.match(btn[0], /aria-expanded="false"/);
    assert.match(btn[0], /aria-controls="plAbout"/);
    assert.match(btn[0], /pbtn--text pbtn--about/);
  }
  assert.match(html, /id="plAbout"[^>]*><p class="pl__about__empty">歌曲资料待补充<\/p>/, '简介面板自带静态空状态');
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

test('panels · 字号只缩放歌词文字，选中态清晰；简介面板只随 about 舞台显示', () => {
  const css = read('assets/css/player.css');
  assert.match(css, /\.pl__lyrics\[data-font="s"\] \{ --lrc-scale:\.86; \}/);
  assert.match(css, /\.pl__lyrics\[data-font="l"\] \{ --lrc-scale:1\.2; \}/);
  assert.match(css, /\.pl__lyrics \.lrc__line \{[^}]*font-size:calc\(1\.02rem \* var\(--lrc-scale,1\)\)/);
  assert.match(css, /\.pl__lyrics \.lrc__line\.is-active \{[^}]*font-size:calc\(1\.14rem \* var\(--lrc-scale,1\)\)/);
  assert.match(css, /\.pl__font__btn\[aria-pressed="true"\] \{ background:var\(--acc\);/);
  assert.match(css, /\.pl__about \{ display:none;/);
  assert.match(css, /\.pl__stage\[data-stage="about"\] \.pl__about \{ display:block; \}/);
  assert.match(css, /\.pbtn--about\[aria-expanded="true"\],/);
  // 工具栏允许换行，不产生横向溢出
  assert.match(css, /\.pl__toolbar \{ display:flex; flex-wrap:wrap;/);
  assert.match(css, /\.pl__calib \{ display:flex;[^}]*flex-wrap:wrap;/);
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

/* ── 5. SongInfoUI ──────────────────────────────────── */

function infoUI() {
  const dom = new JSDOM('<div id="plAbout"></div>');
  const prev = globalThis.document;
  globalThis.document = dom.window.document;
  const ui = new SongInfoUI({ on() {}, currentSong: null });
  return { ui, el: dom.window.document.getElementById('plAbout'), restore: () => { globalThis.document = prev; } };
}

test('panels · 简介：原作署名与版本信息分行，缺失隐藏，全缺待补充', () => {
  const { ui, el, restore } = infoUI();
  ui.render({
    slug: 'x', title: '某歌', originalArtist: '原唱者', lyricist: '词作者', composer: '曲作者',
    versionNote: '翻唱版本', versionBy: '演唱：站长', tools: ['SUNO'], about: '一段介绍', credits: []
  });
  const text = el.textContent;
  for (const want of ['某歌', '原唱', '原唱者', '作词', '词作者', '作曲', '曲作者', '本站版本', '翻唱版本', '版本制作', '演唱：站长', '生成工具', 'SUNO', '一段介绍']) {
    assert.ok(text.includes(want), `缺 ${want}`);
  }
  const toolRow = [...el.querySelectorAll('.pl__about__row')].find((r) => r.textContent.includes('生成工具'));
  assert.ok(toolRow && toolRow.textContent.includes('SUNO'));
  assert.ok(!toolRow.textContent.includes('原唱'), '生成工具不得混进原唱行');
  ui.render({ slug: 'y', title: '空歌', credits: [] });
  assert.match(el.textContent, /歌曲资料待补充/);
  assert.ok(!el.querySelector('.pl__about__row'), '全缺时不应有空标签行');
  ui.render({ slug: 'z', title: '部分', lyricist: '只有词', credits: [] });
  assert.ok(el.textContent.includes('只有词'));
  assert.ok(!el.textContent.includes('原唱'), '缺失字段必须隐藏');
  assert.ok(!el.textContent.includes('歌曲资料待补充'));
  ui.render(null);
  assert.match(el.textContent, /歌曲资料待补充/);
  restore();
});

test('panels · 简介：DEMO 如实标注，署名不编造，HTML 转义', () => {
  const { ui, el, restore } = infoUI();
  ui.render({ slug: 'd', title: '<img src=x onerror=alert(1)>', demo: true, credits: [] });
  assert.match(el.textContent, /DEMO 测试音/);
  assert.ok(!el.querySelector('img'), '标题必须转义');
  assert.ok(!el.textContent.includes('原唱'), 'demo 不编造原唱');
  restore();
});
/* ── 6. jsdom 整机 ──────────────────────────────────── */

test('panels · 整机：字号立即生效、只改歌词、刷新后恢复', async () => {
  const { window, app, audio } = await makeApp('/songs/demo-night-ferry/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"]'));
  await wait();
  click(window, doc.getElementById('plLyricsBtn'));
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

test('panels · 整机：词 / 简介互斥展开，aria 同步，audio 不动', async () => {
  const { window, app, audio } = await makeApp('/songs/demo-night-ferry/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"]'));
  await wait();
  const stage = doc.getElementById('plStage');
  const lyricsBtn = doc.getElementById('plLyricsBtn');
  const aboutBtn = doc.getElementById('plAboutBtn');
  click(window, lyricsBtn);
  await wait();
  assert.equal(stage.dataset.stage, 'lyrics');
  click(window, aboutBtn);
  await wait();
  assert.equal(stage.dataset.stage, 'about', '简介应取代歌词（互斥）');
  assert.equal(lyricsBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(aboutBtn.getAttribute('aria-expanded'), 'true');
  assert.equal(aboutBtn.getAttribute('aria-label'), '收起简介');
  assert.equal(doc.getElementById('plAboutBtnFull').getAttribute('aria-expanded'), 'true');
  click(window, aboutBtn);
  await wait();
  assert.equal(stage.dataset.stage, 'cover');
  assert.equal(aboutBtn.getAttribute('aria-expanded'), 'false');
  click(window, doc.getElementById('plLyricsBtnFull'));
  await wait();
  assert.equal(stage.dataset.stage, 'lyrics');
  assert.equal(aboutBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(app.player.state, 'playing');
  assert.equal(doc.getElementById('zx-audio'), audio);
});

test('panels · 整机：简介随切歌更新，不残留上一首；跨页后仍在', async () => {
  const { window, app } = await makeApp('/songs/');
  const doc = window.document;
  click(window, doc.querySelector('[data-act="play-song"][data-slug="demo-night-ferry"]'));
  await wait();
  click(window, doc.getElementById('plAboutBtn'));
  await wait();
  const about = doc.getElementById('plAbout');
  assert.match(about.textContent, /确认播放与歌词正常/);
  click(window, doc.querySelector('[data-act="play-song"][data-slug="demo-paper-boat"]'));
  await wait();
  assert.match(about.textContent, /确认纯音乐的显示/);
  assert.ok(!about.textContent.includes('确认播放与歌词正常'), '不得残留上一首信息');
  assert.equal(doc.getElementById('plStage').dataset.stage, 'about', '切歌不应关掉简介面板');
  click(window, doc.querySelector('.nav__ul .nav__a')); // 首页（href 启动时已绝对化）
  await wait(120);
  assert.equal(doc.getElementById('plStage').dataset.stage, 'about');
  assert.match(doc.getElementById('plAbout').textContent, /确认纯音乐的显示/);
  assert.equal(app.player.state, 'playing');
});

test('panels · 整机：刷新恢复逐曲偏移与简介舞台', async () => {
  // stageLocked:true 与真实点击「简介」后的存储一致（未锁定的舞台会被外观预设接管）
  const state = JSON.stringify({ version: 1, stage: 'about', stageLocked: true, lyricOffsets: { 'demo-night-ferry': 1.5 }, queue: { items: [{ slug: 'demo-night-ferry' }], cursor: 0 } });
  const { window, app } = await makeApp('/songs/demo-night-ferry/', { storage: { 'zx.music.v1': state } });
  const doc = window.document;
  await wait(80);
  assert.equal(app.player.lyricOffset, 1.5, '刷新后应恢复该曲偏移');
  assert.equal(doc.getElementById('plCalibVal').textContent, '+1.5s');
  assert.equal(doc.getElementById('plStage').dataset.stage, 'about');
  assert.match(doc.getElementById('plAbout').textContent, /合成测试音/);
});