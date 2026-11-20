#!/usr/bin/env node
/**
 * tools/probe-mobile-layout.mjs — 真实 Chrome 的手机全屏播放页布局矩阵验收。
 *
 * 用法：
 *   node tools/probe-mobile-layout.mjs                            # DEMO 构建 + 本地服务器
 *   node tools/probe-mobile-layout.mjs --base=http://localhost:8000
 *
 * 矩阵：390×844 / 360×640 / 412×915 / 320×568 / 844×390 横屏（auto 与手动手机布局）
 *   × 纯享 / 设置 × 字号 s/m/l，另加动态视口收缩/恢复（模拟 Safari 地址栏）与横屏封面态。
 * 取证：块间距规格、纵向顺序无重叠、歌词区吃满剩余高度、当前行居中于歌词容器（非整屏）、
 *   首尾留白在滚动容器内部、控件与状态行完整可见、无横向溢出。
 * 截图 docs/screenshots/layout-*.png；结果 docs/player-mobile-layout-results.json。
 * 真机 iOS Safari / 微信内浏览器无法在此自动化 → 报告标 NOT_RUN，不冒充已测。
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const baseArg = (args.find((a) => a.startsWith('--base=')) || '').split('=')[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = (n) => path.join(ROOT, 'docs/screenshots', n);
fs.mkdirSync(path.join(ROOT, 'docs/screenshots'), { recursive: true });

const results = [];
const check = (group, name, ok, detail = '') => {
  results.push({ group, name, ok: !!ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} [${group}] ${name}${detail ? ` — ${detail}` : ''}`);
};

/** 间距规格随视口高度压缩：>700 标准 / ≤700 矮屏 / ≤520 横屏 */
const gapsFor = (h) => (h <= 520 ? [10, 2, 10, 8] : h <= 700 ? [16, 4, 16, 12] : [20, 6, 20, 16]);

const VPS = [
  { name: 'phone-390x844', w: 390, h: 844 },
  { name: 'small-360x640', w: 360, h: 640 },
  { name: 'large-412x915', w: 412, h: 915 },
  { name: 'tiny-320x568', w: 320, h: 568 },
  { name: 'land-844x390', w: 844, h: 390 },
  { name: 'land-mobile-844x390', w: 844, h: 390, layout: 'mobile' }
];

const snap = (page) => page.evaluate(() => {
  const p = window.__music.player;
  const q = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, h: b.height }; };
  const box = document.getElementById('plLyrics');
  const act = box?.querySelector('.lrc__line.is-active');
  const ab = act?.getBoundingClientRect();
  const toolbar = document.querySelector('.pl__toolbar');
  return {
    state: p.state, slug: p.currentSong?.slug, idx: p.lyricIndex,
    stage: document.getElementById('plStage')?.dataset.stage,
    mode: document.getElementById('plLyricsBtn')?.dataset.mode,
    font: box?.dataset.font,
    toolbarVisible: toolbar ? getComputedStyle(toolbar).display !== 'none' : false,
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    winH: window.innerHeight, winW: window.innerWidth,
    geo: {
      head: q('.pl__fullhead'), toolbar: q('.pl__toolbar'), lyrics: q('#plLyrics'),
      title: q('#plFullTitle'), artist: q('#plFullArtist'), seek: q('#plSeekFull'),
      times: q('.pl__fullseek .pl__times'), btns: q('.pl__fullbtns'), state: q('#plStateFull'),
      full: q('#plFull'), bigart: q('#plBigArt'),
      active: ab ? { t: ab.top, b: ab.bottom } : null,
      padTop: box ? parseFloat(getComputedStyle(box).paddingTop) : 0,
      padBottom: box ? parseFloat(getComputedStyle(box).paddingBottom) : 0,
      scrollH: box ? box.scrollHeight : 0, clientH: box ? box.clientHeight : 0
    }
  };
});
async function waitUntil(page, pred, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    const s = await snap(page);
    if (pred(s)) return s;
    if (Date.now() - t0 > timeout) return s;
    await sleep(250);
  }
}
const tapLyrics = async (page) => {
  const sel = await page.evaluate(() => (document.getElementById('player-root')?.dataset.expanded === 'true' ? '#plLyricsBtnFull' : '#plLyricsBtn'));
  await page.tap(sel);
};

/** 骨架取证：间距规格 + 纵向无重叠 + 控件可见 + 容器内居中 + 内部留白 */
function geoChecks(label, tag, s) {
  const g = s.geo;
  const exp = gapsFor(s.winH);
  const gap = (a, b) => (a && b ? b.t - a.b : NaN);
  const f = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}px` : 'missing');
  const near = (v, e) => Number.isFinite(v) && Math.abs(v - e) <= 1.5;
  check(label, `${tag} 歌词→歌名 ${exp[0]}px`, near(gap(g.lyrics, g.title), exp[0]), f(gap(g.lyrics, g.title)));
  check(label, `${tag} 歌名→作者 ${exp[1]}px`, near(gap(g.title, g.artist), exp[1]), f(gap(g.title, g.artist)));
  check(label, `${tag} 作者→进度 ${exp[2]}px`, near(gap(g.artist, g.seek), exp[2]), f(gap(g.artist, g.seek)));
  check(label, `${tag} 时间→按钮 ${exp[3]}px`, near(gap(g.times, g.btns), exp[3]), f(gap(g.times, g.btns)));
  const order = g.head && g.lyrics && g.title && g.artist && g.seek && g.times && g.btns && g.state &&
    g.head.b <= (s.toolbarVisible ? g.toolbar.t : g.lyrics.t) + 1 &&
    (!s.toolbarVisible || g.toolbar.b <= g.lyrics.t + 1) &&
    g.lyrics.b <= g.title.t + 1 && g.title.b <= g.artist.t + 1 && g.artist.b <= g.seek.t + 1 &&
    g.seek.b <= g.times.t + 1 && g.times.b <= g.btns.t + 1 && g.btns.b <= g.state.t + 1;
  check(label, `${tag} 纵向顺序无重叠`, !!order, `head.b=${g.head?.b.toFixed(0)} lyrics=[${g.lyrics?.t.toFixed(0)},${g.lyrics?.b.toFixed(0)}] title.t=${g.title?.t.toFixed(0)} btns.b=${g.btns?.b.toFixed(0)}`);
  check(label, `${tag} 控件与状态行完整在视口内`, !!g.btns && !!g.state && !!g.full && g.btns.t >= 0 && g.btns.b <= s.winH + 1 && g.state.b <= s.winH + 1 && g.full.b <= s.winH + 1, `btns.b=${g.btns?.b.toFixed(0)} state.b=${g.state?.b.toFixed(0)} winH=${s.winH}`);
  const minLyrics = s.winH <= 520 ? 24 : (s.toolbarVisible ? 48 : s.winH * 0.35);
  check(label, `${tag} 歌词区吃满剩余高度`, !!g.lyrics && g.lyrics.h >= minLyrics && gap(g.lyrics, g.title) <= exp[0] + 1.5, `lyrics.h=${g.lyrics?.h.toFixed(0)} 下限=${minLyrics.toFixed(0)} toolbar=${s.toolbarVisible}`);
  if (g.active && g.lyrics) {
    const dc = Math.abs((g.active.t + g.active.b) / 2 - (g.lyrics.t + g.lyrics.b) / 2);
    check(label, `${tag} 当前行居中于歌词容器`, dc <= 30, `Δ=${dc.toFixed(1)}px`);
  }
  check(label, `${tag} 首尾留白在滚动容器内部`, g.padTop >= 8 && g.padBottom >= 8 && g.scrollH > g.clientH, `pad=${g.padTop}/${g.padBottom} scrollH=${g.scrollH} clientH=${g.clientH}`);
  check(label, `${tag} 无横向溢出`, s.docOverflow <= 0, `doc=${s.docOverflow}`);
}

async function runViewport(browser, base, label, vp) {
  const tag0 = `${label}/${vp.name}`;
  console.log(`\n▶ ${tag0}`);
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  if (vp.layout) {
    await page.evaluateOnNewDocument((layout) => {
      localStorage.setItem('zx.music.v1', JSON.stringify({ version: 1, layout, layoutLocked: true }));
    }, vp.layout);
  }
  await page.setViewport({ width: vp.w, height: vp.h, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/songs/`, { waitUntil: 'domcontentloaded' });
  await sleep(700);
  await page.evaluate(() => document.querySelector('[data-act="play-song"][data-slug="qingchun-dagai"]')?.scrollIntoView({ block: 'center' }));
  await sleep(300);
  await page.tap('[data-act="play-song"][data-slug="qingchun-dagai"]');
  let s = await waitUntil(page, (x) => x.state === 'playing' && x.slug === 'qingchun-dagai', 12000);
  check(tag0, '起播', s.state === 'playing', s.slug);
  // 纯享
  await tapLyrics(page);
  s = await waitUntil(page, (x) => x.stage === 'lyrics' && x.mode === 'pure');
  s = await waitUntil(page, (x) => x.idx >= 0, 26000);
  await sleep(600);
  s = await snap(page);
  geoChecks(tag0, '纯享', s);
  await page.screenshot({ path: shots(`layout-${label}-${vp.name}-pure.png`) });
  // 设置 × 三字号
  await tapLyrics(page);
  s = await waitUntil(page, (x) => x.mode === 'settings' && x.toolbarVisible);
  for (const font of ['s', 'm', 'l']) {
    await page.tap(`[data-act="lyric-font"][data-size="${font}"]`);
    s = await waitUntil(page, (x) => x.font === font);
    await sleep(1200);
    s = await snap(page);
    geoChecks(tag0, `设置-${font}`, s);
    const tbOk = await page.evaluate(() => [...document.querySelectorAll('.pl__toolbar button')].every((b) => { const r = b.getBoundingClientRect(); const min = window.innerHeight <= 520 ? 36 : 44; return r.width >= min && r.height >= min && r.left >= 0 && r.right <= window.innerWidth; }));
    check(tag0, `设置-${font} 工具栏不遮歌词且按钮够大`, s.toolbarVisible && s.geo.toolbar.b <= s.geo.lyrics.t + 1 && tbOk, `toolbar.b=${s.geo.toolbar?.b.toFixed(0)} lyrics.t=${s.geo.lyrics?.t.toFixed(0)}`);
    await page.screenshot({ path: shots(`layout-${label}-${vp.name}-settings-${font}.png`) });
  }
  // 动态视口：模拟 Safari 地址栏展开（变矮）与收起（恢复）
  await page.setViewport({ width: vp.w, height: vp.h - 70, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await sleep(1100);
  geoChecks(tag0, '视口收缩', await snap(page));
  await page.setViewport({ width: vp.w, height: vp.h, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await sleep(1100);
  geoChecks(tag0, '视口恢复', await snap(page));
  // 第三击 → 隐藏（封面态）：封面不得把歌名/控件推出视口
  await tapLyrics(page);
  s = await waitUntil(page, (x) => x.mode === 'off' && x.stage === 'cover');
  await sleep(400);
  s = await snap(page);
  const g = s.geo;
  check(tag0, '封面态封面不越界不推远控件', !!g.bigart && g.bigart.b <= g.title.t + 1 && g.bigart.t >= g.head.b - 1 && g.btns.b <= s.winH + 1 && g.state.b <= s.winH + 1, `bigart=[${g.bigart?.t.toFixed(0)},${g.bigart?.b.toFixed(0)}] title.t=${g.title?.t.toFixed(0)} winH=${s.winH}`);
  if (vp.h <= 520) await page.screenshot({ path: shots(`layout-${label}-${vp.name}-cover.png`) });
  check(tag0, '无页面 JS 错误', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
  await ctx.close();
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
});
try {
  if (!baseArg) {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), '--demo'], { cwd: ROOT, stdio: 'inherit' });
  }
  const localBase = baseArg || 'http://localhost:8394';
  const server = baseArg ? null : startServer(path.join(ROOT, 'dist'), 8394);
  await sleep(300);
  const label = baseArg ? 'live' : 'local';
  for (const vp of VPS) await runViewport(browser, localBase, label, vp);
  server?.close();
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
const report = {
  at: new Date().toISOString(),
  chrome: 'headless Google Chrome (puppeteer-core)',
  bases: [baseArg || 'http://localhost:8394 (dist --demo)'],
  viewports: VPS.map((v) => `${v.w}x${v.h}${v.layout ? ` layout=${v.layout}` : ''}`),
  pass: results.length - failed.length,
  fail: failed.length,
  checks: results,
  notRun: [
    'iOS Safari 真机（无设备）：地址栏展开/收起以视口高度变化模拟，非真机 Safari',
    '微信内浏览器真机（无设备 / 账号）',
    ...(baseArg ? [] : ['线上部署复测需在 push 部署后重跑：node tools/probe-mobile-layout.mjs --base=https://www.xuzhaoqing.com'])
  ]
};
const reportPath = path.join(ROOT, 'docs/player-mobile-layout-results.json');
try {
  const prev = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (prev.bases?.join('|') !== report.bases.join('|')) {
    report.alsoRun = [{ at: prev.at, bases: prev.bases, pass: prev.pass, fail: prev.fail }, ...(prev.alsoRun || [])].slice(0, 3);
  }
} catch { /* 首次运行没有旧报告 */ }
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\n${report.pass}/${results.length} 通过${failed.length ? `，${failed.length} 失败` : ''} → docs/player-mobile-layout-results.json`);
process.exit(failed.length ? 1 : 0);
