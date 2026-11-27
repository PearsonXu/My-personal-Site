/**
 * tests/home-latest.test.mjs — 首页「最近分享」：容量规则 / 换批逻辑 / 整机行为。
 * 纯逻辑直接测 core/latest.js；整机用 jsdom + demo 构建（15 首）。
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { capacityFor, listCapacity, gridCapacity, fitBatch, nextBatch } from '../assets/js/core/latest.js';
import { makeApp, click, wait } from './helpers/dom-app.mjs';

/* ── 纯逻辑：容量 ───────────────────────────────────── */
test('容量 · 列表按宽度 4–8 首', () => {
  assert.equal(listCapacity(288), 4);
  assert.equal(listCapacity(358), 4);
  assert.equal(listCapacity(700), 5);
  assert.equal(listCapacity(900), 6);
  assert.equal(listCapacity(1200), 8);
  assert.equal(listCapacity(0), 6, '量不到宽度回退 6（与预渲染一致）');
});

test('容量 · 封面墙/唱片按实测列数取完整 1–2 行', () => {
  assert.equal(gridCapacity(358, 'grid', 2), 4);
  assert.equal(gridCapacity(700, 'grid', 3), 6);
  assert.equal(gridCapacity(1100, 'grid', 5), 5);
  assert.equal(gridCapacity(1100, 'vinyl', 6), 6);
  assert.equal(gridCapacity(288, 'vinyl', 1), 2);
  // 量不到列数时按 CSS 最小卡宽估算
  assert.equal(capacityFor(358, 'grid', 0), 4);
  assert.equal(capacityFor(1100, 'grid', 0), 5);
  assert.equal(capacityFor(0, 'vinyl', 0), 6);
});

/* ── 纯逻辑：补缩与换批 ─────────────────────────────── */
const ALL = Array.from({ length: 15 }, (_, i) => `s${i}`);

test('补缩 · 保留现有顺序，只截断或按未见过优先补充', () => {
  const cur = ALL.slice(0, 6);
  const seen = new Set(cur);
  assert.deepEqual(fitBatch(cur, ALL, 4, seen), cur.slice(0, 4));
  const grown = fitBatch(cur, ALL, 8, seen);
  assert.deepEqual(grown.slice(0, 6), cur, '前缀必须保序');
  assert.deepEqual(grown.slice(6), ['s6', 's7'], '补充优先未见过的（按曲库序）');
  // 全部见过后补充不再重复批内已有的
  const allSeen = new Set(ALL);
  const fit = fitBatch(cur, ALL, 8, allSeen);
  assert.equal(new Set(fit).size, 8);
});

test('换批 · 批内不重复；曲目充足时与上一批完全不重叠', () => {
  let cur = ALL.slice(0, 6);
  let seen = new Set(cur);
  for (let i = 0; i < 10; i++) {
    const r = nextBatch(ALL, cur, 6, seen);
    assert.equal(r.batch.length, 6);
    assert.equal(new Set(r.batch).size, 6, '批内出现重复');
    assert.ok(!r.batch.some((s) => cur.includes(s)), '充足时与上一批重叠');
    cur = r.batch; seen = r.seen;
  }
});

test('换批 · 曲目不足时尽量减少重复且绝不整批相同', () => {
  const small = ALL.slice(0, 7); // 7 首装 6 个位置：必然重叠 5，但至少换 1 首
  let cur = small.slice(0, 6);
  let seen = new Set(small);
  for (let i = 0; i < 20; i++) {
    const r = nextBatch(small, cur, 6, seen);
    assert.equal(new Set(r.batch).size, 6);
    assert.notDeepEqual(r.batch, cur, '整批与上一批完全相同');
    assert.ok(r.batch.some((s) => !cur.includes(s)));
    cur = r.batch; seen = r.seen;
  }
});

test('换批 · 未见过优先，轮完一圈后开新一轮', () => {
  let cur = ALL.slice(0, 6);
  let seen = new Set(cur);
  const shown = new Set(cur);
  for (let i = 0; i < 2; i++) {
    const r = nextBatch(ALL, cur, 6, seen);
    for (const s of r.batch) shown.add(s);
    cur = r.batch; seen = r.seen;
  }
  assert.equal(shown.size, 15, '两轮换批应看完全部 15 首');
  const r = nextBatch(ALL, cur, 6, seen); // 全见过 → 重置，仍换出不同的批
  assert.ok(r.batch.some((s) => !cur.includes(s)));
});


/* ── 整机：jsdom + demo 构建（总数动态取，随曲库增长不失效）── */
let ctx;
const domBatch = () => [...ctx.window.document.querySelectorAll('[data-viewbox="home"] [data-viewpane="list"] [data-song]')].map((n) => n.dataset.song);
const shuffleBtn = () => ctx.window.document.getElementById('latestShuffle');

before(async () => { ctx = await makeApp('/'); });

test('整机 · 首批是最新 6 首，换一换可见，查看全部显示真实总数', () => {
  const { app, window } = ctx;
  assert.deepEqual(domBatch(), app.catalog.songs.slice(0, 6).map((s) => s.slug));
  const total = app.catalog.songs.length;
  assert.equal(shuffleBtn().hidden, false, `${total} 首 > 容量 6，换一换应可见`);
  const more = window.document.querySelector('.sec__more--latest .link');
  assert.ok(more.textContent.includes(`查看全部 ${total} 首`), `总数文案：${more.textContent}`);
  assert.equal(ctx.errors.length, 0, ctx.errors.join('; '));
});

test('整机 · 点击换一换：数量不变、批内不重复、不与上一批重叠', async () => {
  const { app, window } = ctx;
  const audioBefore = window.document.getElementById('zx-audio');
  const prev = domBatch();
  click(window, shuffleBtn());
  await wait();
  const cur = domBatch();
  assert.equal(cur.length, 6);
  assert.equal(new Set(cur).size, 6);
  assert.ok(!cur.some((s) => prev.includes(s)), '充足时不应与上一批重叠');
  assert.equal(app.homeLatest.batch.join(','), cur.join(','), 'DOM 与状态一致');
  assert.equal(window.document.querySelector('[data-viewbox="home"]').dataset.view, 'list', '展示模式不变');
  assert.equal(window.document.getElementById('zx-audio'), audioBefore, 'audio 实例被重建');
  assert.equal(app.player.audio, audioBefore);
});

test('整机 · 连续换批能看完全部曲库，且每批都不同', async () => {
  const { window, app } = ctx;
  const total = app.catalog.songs.length;
  const shown = new Set(domBatch());
  let prev = domBatch();
  // 未见过优先保证有限轮内覆盖全库，但所需轮数随曲库规模与随机批次变化，
  // 写死轮数会在某些总数下概率性漏歌——循环到覆盖为止（上限远大于最坏轮数）。
  for (let i = 0; i < 24 && shown.size < total; i++) {
    click(window, shuffleBtn());
    await wait();
    const cur = domBatch();
    assert.equal(cur.length, 6);
    assert.equal(new Set(cur).size, 6);
    assert.notDeepEqual(cur, prev, '整批与上一批相同');
    for (const s of cur) shown.add(s);
    prev = cur;
  }
  assert.equal(shown.size, total, '多轮换批应覆盖全部歌曲');
});

test('整机 · 换批后播放 / 收藏 / 当前高亮都正确，audio 不动', async () => {
  const { window, app, audio } = ctx;
  click(window, shuffleBtn());
  await wait();
  const batch = domBatch();
  const doc = window.document;
  click(window, doc.querySelector(`[data-viewpane="list"] [data-act="play-song"][data-slug="${batch[0]}"]`));
  await wait(120);
  assert.equal(app.player.currentSong?.slug, batch[0]);
  assert.ok(doc.querySelector(`[data-viewpane="list"] [data-song="${batch[0]}"]`).classList.contains('is-current'));
  // 收藏第二首
  click(window, doc.querySelector(`[data-viewpane="list"] [data-act="fav"][data-slug="${batch[1]}"]`));
  await wait();
  assert.equal(app.player.isFavorite(batch[1]), true);
  assert.equal(doc.querySelector(`[data-viewpane="list"] [data-act="fav"][data-slug="${batch[1]}"]`).getAttribute('aria-pressed'), 'true');
  // 再换一批：audio 仍是同一个，收藏状态在对应行上保持
  const time = audio.currentTime;
  click(window, shuffleBtn());
  await wait();
  assert.equal(app.player.audio, audio);
  assert.equal(app.player.currentSong?.slug, batch[0], '换批不打断当前播放');
  assert.ok(audio.currentTime >= time);
  const favRow = doc.querySelector(`[data-viewpane="list"] [data-act="fav"][data-slug="${batch[1]}"]`);
  if (favRow) assert.equal(favRow.getAttribute('aria-pressed'), 'true');
});

test('整机 · 切换展示模式保留批次与顺序，不重新随机', async () => {
  const { window } = ctx;
  const beforeBatch = domBatch();
  click(window, window.document.querySelector('#latest [data-act="set-view"][data-view="grid"]'));
  await wait();
  assert.equal(window.document.querySelector('[data-viewbox="home"]').dataset.view, 'grid');
  assert.deepEqual(domBatch(), beforeBatch, 'jsdom 回退容量同为 6，批次应原样保留');
  const gridSlugs = [...window.document.querySelectorAll('[data-viewpane="grid"] [data-song]')].map((n) => n.dataset.song);
  assert.deepEqual(gridSlugs, beforeBatch, '封面墙面板与列表同一批同一顺序');
});

test('整机 · 宽屏容量：grid 按列数、list 按宽度，保序补缩；全展示时隐藏换一换', async () => {
  const { window, app } = ctx;
  const box = window.document.querySelector('[data-viewbox="home"]');
  Object.defineProperty(box, 'clientWidth', { value: 1200, configurable: true });
  app.homeLatest.measureCols = () => 5; // 模拟宽屏实测 5 列
  app.homeLatest.update();
  const six = domBatch();
  assert.equal(six.length, 5, '5 列 → 1 整行 5 首');
  // 切回列表：宽屏 8 首，前 5 首保序
  click(window, window.document.querySelector('#latest [data-act="set-view"][data-view="list"]'));
  await wait();
  const eight = domBatch();
  assert.equal(eight.length, 8);
  assert.deepEqual(eight.slice(0, 5), six, '扩容必须保留现有顺序');
  // 列数足够大 → 容量 ≥ 总数 → 换一换隐藏且点击无效
  app.homeLatest.measureCols = () => app.catalog.songs.length;
  click(window, window.document.querySelector('#latest [data-act="set-view"][data-view="grid"]'));
  await wait();
  assert.equal(domBatch().length, app.catalog.songs.length, '全部歌曲同时展示');
  assert.equal(shuffleBtn().hidden, true);
  const all = domBatch();
  click(window, shuffleBtn());
  await wait();
  assert.deepEqual(domBatch(), all, '全展示时换一换不生效');
  assert.equal(ctx.errors.length, 0, ctx.errors.join('; '));
});
