#!/usr/bin/env node
/**
 * tools/probe-home-latest.mjs — 首页「最近分享」真实浏览器验收。
 *
 * 检查：320 / 390 / 768 / 1440px × 列表 / 封面墙 / 唱片 的数量与间距、
 *       连续换批（不重复 / 覆盖全库 / 模式与播放保持）、播放与收藏、
 *       三主题下的间距协调。产物：docs/screenshots/home-latest-*.png。
 *
 * 用法：node tools/probe-home-latest.mjs [--port=8322]（需本机 Chrome，先 npm run build:demo）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'docs/screenshots');
const argv = process.argv.slice(2);
const PORT = Number((argv.find((a) => a.startsWith('--port=')) || '--port=8322').split('=')[1]);
const BASE = `http://127.0.0.1:${PORT}`;

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail: String(detail) });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function check(name, fn) {
  try { record(name, true, (await fn()) || ''); } catch (err) { record(name, false, err.message); }
}

async function goto(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__music && !!window.__music.homeLatest?.box, { timeout: 15000 });
  await sleep(300);
}

/** 区域内实况：模式 / 数量 / 批次 / 实测列数 / 间距 */
const snap = (page) => page.evaluate(() => {
  const box = /** @type {HTMLElement} */ (document.querySelector('[data-viewbox="home"]'));
  const view = box.dataset.view;
  const pane = /** @type {HTMLElement} */ (box.querySelector(`[data-viewpane="${view}"]`));
  const items = [...pane.querySelectorAll('[data-song]')].map((n) => /** @type {HTMLElement} */ (n).dataset.song);
  const sw = document.querySelector('#latest .viewswitch').getBoundingClientRect();
  const vb = box.getBoundingClientRect();
  const grid = pane.querySelector('.grid--cards');
  const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length : 0;
  const btn = document.getElementById('latestShuffle');
  const more = document.querySelector('.sec__more--latest .link');
  const gap = btn && !btn.hidden ? more.getBoundingClientRect().left - btn.getBoundingClientRect().right : null;
  return {
    view, count: items.length, items, cols,
    width: box.clientWidth,
    switchGap: Math.round(vb.top - sw.bottom),
    moreGap: gap === null ? null : Math.round(gap),
    shuffleHidden: btn.hidden,
    total: window.__music.catalog.songs.length,
    moreText: more.textContent.trim(),
    audioSame: window.__music.player.audio === document.getElementById('zx-audio')
  };
});

async function setView(page, v) {
  await page.evaluate((x) => /** @type {HTMLElement} */ (document.querySelector(`#latest [data-act="set-view"][data-view="${x}"]`)).click(), v);
  await sleep(250);
}

async function shotSection(page, name) {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.getElementById('latest').scrollIntoView({ block: 'start', behavior: 'instant' });
    window.scrollBy(0, -70);
  });
  await sleep(250);
  const el = await page.$('#latest');
  await el.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}


async function main() {
  const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!chrome) { console.error('BLOCKED: 找不到本机 Chrome'); process.exit(2); }
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = startServer(path.join(ROOT, 'dist'), PORT);
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => record('页面 JS 异常', false, /** @type {any} */ (e).message));

  /* ── 1. 四种宽度 × 三种模式：数量 / 间距 / 截图 ── */
  const matrix = [];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewport({ width, height: width <= 390 ? 844 : 900, deviceScaleFactor: width <= 390 ? 2 : 1, isMobile: width <= 390, hasTouch: width <= 390 });
    await goto(page);
    for (const view of ['list', 'grid', 'vinyl']) {
      await setView(page, view);
      const s = await snap(page);
      matrix.push({ width, ...s });
      await check(`${width}px · ${view}`, () => {
        assert(s.count > 0 && s.count <= s.total, `数量 ${s.count} 越界`);
        assert(new Set(s.items).size === s.count, '批内重复');
        assert(s.audioSame, 'audio 实例被更换');
        const minGap = width <= 390 ? 12 : 16;
        assert(s.switchGap >= minGap && s.switchGap <= minGap + 6, `切换组与歌曲间距 ${s.switchGap}px，期望约 ${minGap}px`);
        if (s.moreGap !== null) assert(Math.abs(s.moreGap - 16) <= 2, `换一换与查看全部间距 ${s.moreGap}px`);
        assert(s.moreText.includes(`查看全部 ${s.total} 首`), `总数文案：${s.moreText}`);
        if (view !== 'list') assert(s.count === Math.min(s.total, s.cols * (s.cols <= 3 ? 2 : 1)), `列数 ${s.cols} 与数量 ${s.count} 不齐整`);
        return `${s.count} 首${view !== 'list' ? `（${s.cols} 列）` : ''} · 间距 ${s.switchGap}px · 换一换${s.shuffleHidden ? '隐藏' : '可见'}`;
      });
      await shotSection(page, `home-latest-${width}-${view}`);
    }
  }

  /* ── 2. 连续换批：不重复 / 覆盖全库 / 模式与数量保持 ── */
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: width <= 390 ? 844 : 900, deviceScaleFactor: width <= 390 ? 2 : 1, isMobile: width <= 390, hasTouch: width <= 390 });
    await goto(page);
    await check(`${width}px · 连续换批 8 次`, async () => {
      const first = await snap(page);
      const shown = new Set(first.items);
      let prev = first.items;
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => document.getElementById('latestShuffle').click());
        await sleep(150);
        const s = await snap(page);
        assert(s.view === first.view && s.count === first.count, '换批改变了模式或数量');
        assert(new Set(s.items).size === s.count, '批内重复');
        assert(s.items.join(',') !== prev.join(','), '整批与上一批相同');
        if (first.total >= first.count * 2) assert(!s.items.some((x) => prev.includes(x)), '充足时与上一批重叠');
        assert(s.audioSame, 'audio 被更换');
        for (const x of s.items) shown.add(x);
        prev = s.items;
      }
      assert(shown.size === first.total, `8 轮只覆盖 ${shown.size}/${first.total}`);
      return `每批 ${first.count} 首 · 覆盖 ${shown.size}/${first.total}`;
    });
    await check(`${width}px · 换批后播放 + 收藏`, async () => {
      await page.evaluate(() => document.getElementById('latestShuffle').click());
      await sleep(150);
      const s = await snap(page);
      const target = s.items[0];
      await page.evaluate((slug) => /** @type {HTMLElement} */ (document.querySelector(`[data-viewpane]:not([hidden]) [data-act="play-song"][data-slug="${slug}"]`)).click(), target);
      await page.waitForFunction(() => window.__music.player.state === 'playing', { timeout: 15000 });
      const fav = s.items[1];
      // localStorage 跨轮共享：已收藏的歌再点一次会取消，先读状态
      const wasFav = await page.evaluate((slug) => window.__music.player.isFavorite(slug), fav);
      if (!wasFav) {
        await page.evaluate((slug) => /** @type {HTMLElement|null} */ (document.querySelector(`[data-viewpane]:not([hidden]) [data-act="fav"][data-slug="${slug}"]`))?.click(), fav);
        await sleep(150);
      }
      assert(await page.evaluate((slug) => window.__music.player.isFavorite(slug), fav), '点击收藏未生效');
      await page.evaluate(() => document.getElementById('latestShuffle').click());
      await sleep(200);
      const after = await page.evaluate((args) => ({
        song: window.__music.player.currentSong?.slug,
        state: window.__music.player.state,
        fav: window.__music.player.isFavorite(args.fav),
        audioSame: window.__music.player.audio === document.getElementById('zx-audio'),
        highlighted: !!document.querySelector(`[data-viewpane]:not([hidden]) [data-song="${args.target}"].is-current`)
      }), { target, fav });
      assert(after.song === target && after.state === 'playing', `换批打断了播放：${after.song}/${after.state}`);
      assert(after.fav, '收藏丢失');
      assert(after.audioSame, 'audio 被更换');
      return `播放 ${target} 保持 · 收藏 ${fav} 保持`;
    });
    await shotSection(page, `home-latest-${width}-shuffled`);
  }

  /* ── 3. 三主题：间距与按钮协调（1440 封面墙）── */
  for (const theme of ['cloud', 'forest', 'midnight']) {
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('zx.music.theme', t); } catch { /* ignore */ } }, theme);
    await goto(page);
    await setView(page, 'grid');
    await check(`主题 ${theme} · 1440 封面墙`, async () => {
      const s = await snap(page);
      assert(s.switchGap >= 16 && s.switchGap <= 22, `间距 ${s.switchGap}px`);
      assert(s.audioSame, 'audio 被更换');
      return `${s.count} 首（${s.cols} 列）· 间距 ${s.switchGap}px`;
    });
    await shotSection(page, `home-latest-theme-${theme}`);
  }

  await browser.close();
  server.close();
  const fail = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(ROOT, 'docs/home-latest-results.json'), JSON.stringify({ matrix, results }, null, 2));
  console.log(`\n${results.length - fail.length}/${results.length} 通过；截图与明细见 docs/screenshots/home-latest-*.png / docs/home-latest-results.json`);
  process.exit(fail.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
