#!/usr/bin/env node
/**
 * tools/probe-regression.mjs — 白屏故障的取证 / 回归验证。
 * 真实浏览器跑触发路径，抓 Console / 失败请求 / URL，并区分
 * 「整页未渲染」与「内容在但样式丢失」。
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { startServer } from './serve.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REMOTE = flag('base', '');
const PORT = Number(flag('port', '8410'));
const B = (REMOTE || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
// 给了 --base 就直接跑线上站点，不再起本地服务器
const server = REMOTE ? null : startServer(path.join(ROOT, 'dist'), PORT);
await new Promise((r) => setTimeout(r, 300));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--mute-audio', '--disable-dev-shm-usage']
});

let pass = 0; let fail = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ` — ${d}` : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n} — ${d}`); };
const check = (n, cond, d = '') => (cond ? ok(n, d) : bad(n, d));

const snap = (page) => page.evaluate(() => {
  const main = document.getElementById('main');
  const head = document.querySelector('.head');
  return {
    url: location.href,
    kind: document.body.dataset.kind,
    mainTextLen: main ? main.textContent.trim().length : 0,
    sheets: [...document.styleSheets].length,
    headPosition: head ? getComputedStyle(head).position : null,
    theme: document.documentElement.dataset.theme,
    layout: document.documentElement.dataset.layout,
    banner: !!document.querySelector('[role="alert"]')
  };
});

async function newPage({ seed, viewport = 'desktop' } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport === 'mobile'
    ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { width: 1440, height: 900 });
  const errors = []; const failed = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => failed.push(`FAILED ${r.url()}`));
  if (seed) {
    await page.evaluateOnNewDocument((s) => {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }, seed);
  }
  return { page, errors, failed };
}

const navTo = async (page, label) => {
  await page.evaluate((l) => [...document.querySelectorAll('.nav__a')].find((a) => a.textContent.includes(l))?.click(), label);
  await new Promise((r) => setTimeout(r, 650));
};

/** 样式生效判据：head 必须 sticky（只有 site.css 给），且样式表 ≥4 */
const styled = (s) => s.headPosition === 'sticky' && s.sheets >= 4;

async function chain(label, { start, seed, viewport }) {
  console.log(`\n── ${label} ──`);
  const { page, errors, failed } = await newPage({ seed, viewport });
  await page.goto(`${B}${start}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__music, { timeout: 15000 });
  for (const [lbl, expect] of [['手记', '/notes/'], ['曲库', '/songs/'], ['专辑', '/albums/'], ['我的', '/me/'], ['首页', '/']]) {
    await navTo(page, lbl);
    const s = await snap(page);
    check(`点「${lbl}」落在 ${expect}`, new URL(s.url).pathname === expect, s.url);
    check(`${expect} 样式生效`, styled(s), `sheets=${s.sheets} head=${s.headPosition} len=${s.mainTextLen}`);
  }
  check('全程无失败请求', failed.length === 0, failed.slice(0, 3).join(' | '));
  check('全程无 Console 错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 600));
  const after = await snap(page);
  check('刷新后仍正常', after.mainTextLen > 50 && styled(after), `kind=${after.kind}`);
  await page.close();
}
// 线上与本地的曲库不同：深层起点用目录里真实存在的第一首歌，不写死 demo slug
const liveCatalog = await (await fetch(`${B}/assets/data/catalog.json`)).json();
const deepSlug = liveCatalog.songs?.[0]?.slug || null;
const favSlug = deepSlug || 'demo-night-ferry';

await chain('桌面·从首页出发', { start: '/' });
if (deepSlug) await chain('桌面·从深层单曲页出发', { start: `/songs/${deepSlug}/` });
await chain('手机·从首页出发', { start: '/', viewport: 'mobile' });
await chain('旧数据用户（dark + grid + lyrics）', {
  start: '/',
  seed: { 'zx.music.theme': 'dark', 'zx.music.v1': { view: 'grid', stage: 'lyrics', viewLocked: true, stageLocked: true, favorites: [favSlug] } }
});

/* ── 坏字段用户：只修坏字段，收藏必须保住 ─────────── */
{
  console.log('\n── 坏字段本地数据 ──');
  const seed = {
    'zx.music.v1': {
      view: '不存在的视图', stage: 42, mode: '乱写', volume: 'loud', position: -5,
      muted: 'yes', queue: { items: 'oops' },
      favorites: [favSlug, 123, null, 'paper-boat'],
      recent: [null, { slug: favSlug, at: 1 }, 'bad']
    }
  };
  const { page, errors } = await newPage({ seed });
  await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
  const booted = await page.waitForFunction(() => !!window.__music, { timeout: 15000 }).then(() => true).catch(() => false);
  check('坏字段下应用仍能启动', booted);
  if (booted) {
    const d = await page.evaluate(() => ({
      favs: window.__music.store.data.favorites,
      recent: window.__music.store.data.recent,
      view: window.__music.store.data.view,
      mode: window.__music.store.data.mode,
      volume: window.__music.store.data.volume,
      repaired: window.__music.store.repaired
    }));
    check('有效收藏被保留', d.favs.includes(favSlug) && d.favs.includes('paper-boat'), JSON.stringify(d.favs));
    check('坏收藏条目被剔除', d.favs.length === 2);
    check('有效最近播放被保留', d.recent.length === 1 && d.recent[0].slug === favSlug);
    check('坏字段回退默认', d.view === 'list' && d.mode === 'order' && d.volume === 1, JSON.stringify(d));
    check('记录了被修字段', Array.isArray(d.repaired) && d.repaired.length > 0, d.repaired.join(','));
    // 播一首歌：pushRecent 会遍历 recent，坏条目曾在这里抛异常
    await page.click('[data-act="play-song"]').catch(() => {});
    await new Promise((r) => setTimeout(r, 900));
    const st = await page.evaluate(() => window.__music.player.state);
    check('坏数据修复后能正常播放', st === 'playing', st);
  }
  check('坏字段场景无未捕获异常', errors.filter((e) => e.startsWith('pageerror')).length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

/* ── 整块 JSON 损坏：备份 + 默认值继续跑 ──────────── */
{
  console.log('\n── 本地数据整块损坏 ──');
  const { page } = await newPage({ seed: { 'zx.music.v1': '{坏掉的 JSON' } });
  await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
  const booted = await page.waitForFunction(() => !!window.__music, { timeout: 15000 }).then(() => true).catch(() => false);
  check('损坏 JSON 下仍能启动', booted);
  if (booted) {
    const backup = await page.evaluate(() => localStorage.getItem('zx.music.v1.broken'));
    check('原文已备份，未静默销毁', backup === '{坏掉的 JSON', String(backup));
  }
  await page.close();
}

/* ── 主题 / 视图 / 播放 交叉操作后再导航 ─────────── */
{
  console.log('\n── 主题 / 视图 / 播放 交叉操作 ──');
  const { page, errors, failed } = await newPage();
  await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__music);
  for (const t of ['forest', 'midnight', 'cloud']) {
    await page.evaluate((x) => window.__music.appearance.setTheme(x, { announce: false }), t);
    await new Promise((r) => setTimeout(r, 120));
  }
  for (const v of ['grid', 'vinyl', 'list']) {
    await page.evaluate((x) => window.__music.library.setView(x), v);
    await new Promise((r) => setTimeout(r, 120));
  }
  await page.click('[data-act="play-song"]');
  await page.waitForFunction(() => window.__music.player.state === 'playing', { timeout: 15000 });
  await navTo(page, '手记');
  await navTo(page, '曲库');
  const s = await snap(page);
  check('交叉操作后导航仍落在 /songs/', new URL(s.url).pathname === '/songs/', s.url);
  check('交叉操作后样式生效', styled(s));
  check('交叉操作后仍在播放', await page.evaluate(() => window.__music.player.state === 'playing'));
  check('交叉操作无失败请求', failed.length === 0, failed.slice(0, 3).join(' | '));
  check('交叉操作无 Console 错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

/* ── 直接打开不存在的深层 URL：404 页必须自洽 ─────── */
{
  console.log('\n── 深层不存在 URL 的 404 页 ──');
  const { page, failed } = await newPage();
  await page.goto(`${B}/notes/songs/`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 500));
  const info = await page.evaluate(() => {
    const box = document.querySelector('.box');
    const home = document.getElementById('goHome');
    return {
      hasBox: !!box,
      bg: getComputedStyle(document.body).backgroundColor,
      boxBg: box ? getComputedStyle(box).backgroundColor : null,
      textLen: document.body.textContent.trim().length,
      homeHref: home ? home.getAttribute('href') : null,
      path: document.getElementById('badPath')?.textContent
    };
  });
  check('404 页有内容', info.textLen > 40, `len=${info.textLen}`);
  check('404 页样式生效（内联，不依赖外部 CSS）', info.boxBg === 'rgb(255, 255, 255)', `boxBg=${info.boxBg}`);
  check('404 页显示坏地址', info.path === '/notes/songs/', String(info.path));
  check('404 页回首页链接指向站点根', info.homeHref === '/', String(info.homeHref));
  const assetFails = failed.filter((u) => /\/assets\//.test(u));
  check('404 页不再请求任何 assets（零外部依赖）', assetFails.length === 0, assetFails.slice(0, 3).join(' | '));
  fs.mkdirSync(path.join(ROOT, 'docs/screenshots-live'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'docs/screenshots-live/recovery-404.png') });
  await page.click('#goHome');
  await new Promise((r) => setTimeout(r, 900));
  const back = await snap(page);
  check('从 404 页点「回首页」能恢复', new URL(back.url).pathname === '/' && back.mainTextLen > 50, back.url);
  await page.close();
}

/* ── 用户指定链路：首页 → 歌曲详情 → 曲库 → 关于我 → 手记 → 另一首歌 ── */
{
  console.log('\n── 指定链路（含内容区链接，非仅导航）──');
  const songs = liveCatalog.songs || [];
  const notes = liveCatalog.notes || [];
  for (const viewport of ['desktop', 'mobile']) {
    const { page, errors, failed } = await newPage({ viewport });
    await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__music, { timeout: 15000 });
    const trail = [];
    const step = async (label, clickFn, expect) => {
      await clickFn();
      await sleep(700);
      const s = await snap(page);
      const path = new URL(s.url).pathname;
      trail.push(path);
      const noAccum = !/\/(songs|notes|albums|playlists|about|me|status)\/.*\/(songs|notes|albums|playlists|about|me|status)\//.test(path);
      check(`${viewport} ${label} → ${expect}`, path === expect && noAccum, path);
      check(`${viewport} ${label} 样式生效`, styled(s), `sheets=${s.sheets}`);
    };

    if (songs[0]) {
      await step('点歌曲卡片', () => page.evaluate(() => document.querySelector('.row__main, .card__link, .hero__pick__cover')?.click()), `/songs/${songs[0].slug}/`);
    }
    await step('点导航曲库', () => page.evaluate(() => [...document.querySelectorAll('.nav__a')].find((a) => a.textContent.includes('曲库'))?.click()), '/songs/');
    await step('点导航关于我', () => page.evaluate(() => [...document.querySelectorAll('.nav__a')].find((a) => a.textContent.includes('关于'))?.click()), '/about/');
    await step('点导航手记', () => page.evaluate(() => [...document.querySelectorAll('.nav__a')].find((a) => a.textContent.includes('手记'))?.click()), '/notes/');
    if (notes[0]) {
      await step('点手记卡片', () => page.evaluate(() => document.querySelector('.card__link')?.click()), `/notes/${notes[0].slug}/`);
    }
    const other = songs[1] || songs[0];
    if (other) {
      await step('回曲库', () => page.evaluate(() => [...document.querySelectorAll('.nav__a')].find((a) => a.textContent.includes('曲库'))?.click()), '/songs/');
      await step('点另一首歌', (slug) => page.evaluate((s) => document.querySelector(`[data-song="${s}"] .row__main, [data-song="${s}"] .card__link`)?.click(), other.slug), `/songs/${other.slug}/`);
    }
    check(`${viewport} 全链路无路径累积`, trail.every((p) => !/\/(songs|notes)\/[^/]+\/(songs|notes|about|me)\//.test(p)), trail.join(' → '));
    check(`${viewport} 全链路无失败请求`, failed.length === 0, failed.slice(0, 3).join(' | '));
    check(`${viewport} 全链路无 Console 错误`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(500);
    const after = await snap(page);
    check(`${viewport} 末页刷新后地址不变且正常`, styled(after) && after.mainTextLen > 20, new URL(after.url).pathname);
    await page.close();
  }
}

/* ── 跨子页面交叉跳转矩阵：每个起点 × 每个目标，跳转后再刷新目标 ── */
{
  console.log('\n── 跨子页面交叉跳转矩阵 ──');
  const noteList = liveCatalog.notes || [];
  const starts = [['首页', '/'], ['歌曲详情', deepSlug ? `/songs/${deepSlug}/` : null], ['关于', '/about/'], ['手记详情', noteList[0] ? `/notes/${noteList[0].slug}/` : null], ['曲库', '/songs/']].filter(([, p]) => p);
  const targets = [['首页', '/'], ['曲库', '/songs/'], ['专辑', '/albums/'], ['歌单', '/playlists/'], ['手记', '/notes/'], ['关于', '/about/'], ['我的', '/me/']];
  for (const viewport of ['desktop', 'mobile']) {
    const { page, errors, failed } = await newPage({ viewport });
    const bad = [];
    let hops = 0;
    for (const [startLabel, startPath] of starts) {
      for (const [targetLabel, targetPath] of targets) {
        // 每一跳都从「真实子页面」重新出发，而不是从首页
        await page.goto(`${B}${startPath}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.__music, { timeout: 15000 });
        await page.evaluate((l) => [...document.querySelectorAll('.nav__a')].find((a) => a.textContent.includes(l))?.click(), targetLabel);
        await sleep(550);
        let s = await snap(page);
        hops++;
        if (new URL(s.url).pathname !== targetPath) bad.push(`${startLabel}→${targetLabel} 落在 ${new URL(s.url).pathname}`);
        if (!styled(s)) bad.push(`${startLabel}→${targetLabel} 样式丢失`);
        // 刷新目标页，确认地址不漂移、样式仍在
        await page.reload({ waitUntil: 'domcontentloaded' });
        await sleep(350);
        s = await snap(page);
        if (new URL(s.url).pathname !== targetPath) bad.push(`${startLabel}→${targetLabel} 刷新后漂移`);
        if (!styled(s) || s.mainTextLen < 20) bad.push(`${startLabel}→${targetLabel} 刷新后异常`);
      }
    }
    check(`${viewport} ${starts.length}×${targets.length}=${hops} 次交叉跳转 + 刷新全部正确`, bad.length === 0, bad.slice(0, 4).join('; '));
    check(`${viewport} 矩阵全程无失败请求`, failed.length === 0, failed.slice(0, 3).join(' | '));
    check(`${viewport} 矩阵全程无 Console 错误`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.close();
  }
}

/* ── 直接打开每个子页面 + 原地刷新 ─────────────────── */
{
  console.log('\n── 直接访问 + 刷新（全部页面）──');
  const mf = await (await fetch(`${B}/assets/data/build-manifest.json`)).json();
  const { page, errors, failed } = await newPage();
  const bad = [];
  for (const p of mf.pages) {
    const route = `/${p.route}`;
    await page.goto(`${B}${route}`, { waitUntil: 'domcontentloaded' });
    await sleep(250);
    let s = await snap(page);
    if (!styled(s) || s.mainTextLen < 20) bad.push(`${route} 直接打开异常`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(350);
    s = await snap(page);
    if (!styled(s) || s.mainTextLen < 20) bad.push(`${route} 刷新后异常`);
    if (new URL(s.url).pathname !== route) bad.push(`${route} 刷新后跳到了 ${s.url}`);
  }
  check(`${mf.pages.length} 个页面直接打开与刷新都正常`, bad.length === 0, bad.slice(0, 4).join('; '));
  check('全程无失败请求', failed.length === 0, failed.slice(0, 3).join(' | '));
  check('全程无 Console 错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

/* ── 导航竞态：连点 / fetch 途中后退前进（abort ≠ 失败，不得整页拽回）── */
{
  console.log('\n── 导航竞态（慢网连点 / 途中后退前进）──');
  // 旧构建的整页拽回会销毁执行上下文：重试而不是让探针崩溃（失败由检查项记录）
  const withRetry = async (fn) => {
    for (let i = 0; i < 4; i++) {
      try { return await fn(); } catch (e) {
        if (i < 3 && /Execution context|detached|Session closed|Target closed/.test(String(e?.message || e))) { await sleep(900); continue; }
        throw e;
      }
    }
  };
  for (const viewport of ['desktop', 'mobile']) {
    const { page, errors, failed } = await newPage({ viewport });
    let loads = 0;
    page.on('load', () => loads++);
    // 只慢化 SPA 路由 fetch（带 X-ZX-Router 头），放大竞态窗口；其余请求照常
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (r.headers()['x-zx-router']) setTimeout(() => r.continue().catch(() => {}), 350);
      else r.continue().catch(() => {});
    });
    await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__music, { timeout: 15000 });
    loads = 0;
    const tapNav = async (label) => {
      if (viewport === 'mobile') {
        const open = await withRetry(() => page.evaluate(() => document.querySelector('.nav')?.classList.contains('is-open')));
        if (!open) {
          await withRetry(() => page.tap('[data-act="toggle-nav"]'));
          await page.waitForFunction(() => document.querySelector('.nav')?.classList.contains('is-open'), { timeout: 3000 }).catch(() => {});
          await sleep(280); // 等开合过渡停稳，否则 tap 落在不可点击的中间态
        }
      }
      await withRetry(() => page.evaluate((l) => {
        document.querySelectorAll('[data-probe]').forEach((x) => x.removeAttribute('data-probe'));
        [...document.querySelectorAll('.nav__a')].find((a) => a.textContent.includes(l))?.setAttribute('data-probe', '1');
      }, label));
      // 旧构建的整页拽回会销毁标记元素：容错吞掉，让检查项记录失败而不是探针崩溃
      if (viewport === 'mobile') await page.tap('[data-probe="1"]').catch(() => {});
      else await page.click('[data-probe="1"]').catch(() => {});
    };
    // 连点三个导航：最后一次必须生效
    await tapNav('曲库'); await tapNav('手记'); await tapNav('关于');
    await sleep(1800);
    let s = await withRetry(() => snap(page));
    check(`${viewport} 慢网连点落在最后一次（/about/）`, new URL(s.url).pathname === '/about/', s.url);
    check(`${viewport} 连点后样式生效`, styled(s), `sheets=${s.sheets}`);
    check(`${viewport} 连点未触发整页跳转`, loads === 0, `load 事件 ${loads} 次`);
    // fetch 途中按后退：地址留在后退目标（用 history API，避免旧构建整页拽回后无前进条目导致超时）
    await tapNav('手记');
    await sleep(60);
    await withRetry(() => page.evaluate(() => history.back()));
    await sleep(1800);
    s = await withRetry(() => snap(page));
    check(`${viewport} 途中后退生效（/about/）`, new URL(s.url).pathname === '/about/', s.url);
    check(`${viewport} 途中后退未整页拽回`, loads === 0, `load 事件 ${loads} 次`);
    check(`${viewport} 后退后样式生效`, styled(s), `sheets=${s.sheets}`);
    // 再前进：回到 /notes/
    await withRetry(() => page.evaluate(() => history.forward()));
    await sleep(1800);
    s = await withRetry(() => snap(page));
    check(`${viewport} 前进生效（/notes/）`, new URL(s.url).pathname === '/notes/', s.url);
    check(`${viewport} 前进后样式生效`, styled(s), `sheets=${s.sheets}`);
    // 竞态只允许「被取代的路由 fetch」 abort，资源请求一个都不能失败
    const assetFails = failed.filter((f) => /\/assets\//.test(f));
    check(`${viewport} 竞态中资源零失败`, assetFails.length === 0, assetFails.slice(0, 3).join(' | '));
    check(`${viewport} 竞态无 Console 错误`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.close();
  }
}

console.log(`\n══ 回归取证：${pass} 通过 · ${fail} 失败 ══`);
await browser.close();
if (server) server.close();
process.exit(fail ? 1 : 0);