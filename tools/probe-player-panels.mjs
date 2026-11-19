#!/usr/bin/env node
/**
 * tools/probe-player-panels.mjs — 真实 Chrome 的歌词工具栏 / 简介面板验收。
 *
 * 用法：
 *   node tools/probe-player-panels.mjs                 # DEMO 构建 + 本地服务器
 *   node tools/probe-player-panels.mjs --base=http://localhost:8000   # 指定已起好的服务器
 *
 * 取证项：工具栏在歌词顶部且不遮挡歌词、字号三档立即生效且只改歌词文字、字号偏好刷新恢复、
 * 校准逐曲保存（切歌不串 / 回原曲恢复 / 刷新恢复）、词与简介互斥、简介随切歌更新、
 * 跨页播放后面板仍在、44×44 点击区、移动端换行不溢出。
 * 结果写 docs/player-panels-results.json；截图 docs/screenshots/panels-*.png。
 * 真机 iOS Safari / 微信内浏览器无法在此自动化 → 报告里标 NOT_RUN，不冒充已测。
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

const snap = (page) => page.evaluate(() => {
  const p = window.__music.player;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, w: b.width, h: b.height }; };
  const box = document.getElementById('plLyrics');
  const line = box?.querySelector('.lrc__line');
  const toolbar = document.querySelector('.pl__toolbar');
  return {
    state: p.state, t: p.audio.currentTime, slug: p.currentSong?.slug, offset: p.lyricOffset,
    times: p.lyrics.lines.map((l) => l.time),
    stage: document.getElementById('plStage')?.dataset.stage,
    expanded: document.getElementById('player-root')?.dataset.expanded,
    font: box?.dataset.font,
    lineSize: line ? parseFloat(getComputedStyle(line).fontSize) : 0,
    readout: document.getElementById('plCalibVal')?.textContent,
    toolbar: r(toolbar), lyrics: r(box), about: r(document.getElementById('plAbout')),
    toolbarOverflow: toolbar ? toolbar.scrollWidth - toolbar.clientWidth : 0,
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    aboutText: document.getElementById('plAbout')?.textContent || '',
    lyricsAria: document.getElementById('plLyricsBtn')?.getAttribute('aria-expanded'),
    aboutAria: document.getElementById('plAboutBtn')?.getAttribute('aria-expanded'),
    pressed: [...document.querySelectorAll('[data-act="lyric-font"]')].map((b) => `${b.getAttribute('data-size')}:${b.getAttribute('aria-pressed')}`),
    sizes: ['#plLyricsBtn', '#plAboutBtn', '.pl__font__btn', '.pl__calib__btn'].map((s) => { const q = r(document.querySelector(s)); return q ? Math.min(q.w, q.h) : 0; }),
    bar: r(document.querySelector('.pl__bar')),
    winH: window.innerHeight, winW: window.innerWidth
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
const playRow = async (page, slug) => {
  // 全屏播放页会盖住列表：先收起（真实收起按钮），再点列表里的歌
  if (await page.evaluate(() => document.getElementById('player-root')?.dataset.expanded === 'true')) {
    await page.click('[data-act="collapse"]');
    await sleep(300);
  }
  await page.evaluate((s) => document.querySelector(`[data-act="play-song"][data-slug="${s}"]`)?.scrollIntoView({ block: 'center' }), slug);
  await sleep(400);
  await page.click(`[data-act="play-song"][data-slug="${slug}"]`);
  return waitUntil(page, (s) => s.state === 'playing' && s.slug === slug, 12000);
};
async function runDesktop(browser, base, label) {
  console.log(`\n▶ ${label} desktop ${base}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/songs/`, { waitUntil: 'domcontentloaded' });
  await sleep(700);
  let s = await playRow(page, 'qingchun-dagai');
  check(label, '桌面起播', s.state === 'playing', s.slug);
  await page.click('#plLyricsBtn');
  s = await waitUntil(page, (x) => x.stage === 'lyrics' && x.lineSize > 0);
  check(label, '工具栏在歌词面板顶部且不遮挡', !!s.toolbar && !!s.lyrics && s.toolbar.h > 0 && s.toolbar.b <= s.lyrics.t + 1, `toolbar.bottom=${s.toolbar?.b.toFixed(0)} lyrics.top=${s.lyrics?.t.toFixed(0)}`);
  check(label, '校准组在工具栏内', await page.evaluate(() => !!document.querySelector('.pl__toolbar .pl__calib')));
  check(label, '字号默认中且选中态清晰', s.font === 'm' && s.pressed.join(',') === 's:false,m:true,l:false', s.pressed.join(','));
  const mSize = s.lineSize;
  const timesBefore = s.times.join(',');
  await page.click('[data-act="lyric-font"][data-size="l"]');
  s = await waitUntil(page, (x) => x.font === 'l');
  check(label, '字号「大」立即生效且只放大歌词', s.lineSize > mSize * 1.1, `${mSize.toFixed(1)}→${s.lineSize.toFixed(1)}px`);
  await page.click('[data-act="lyric-font"][data-size="s"]');
  s = await waitUntil(page, (x) => x.font === 's');
  check(label, '字号「小」立即生效', s.lineSize < mSize * 0.95, `${s.lineSize.toFixed(1)}px`);
  check(label, '字号偏好写入当前浏览器', await page.evaluate(() => localStorage.getItem('zx.music.lrcFont')) === 's');
  check(label, '字号切换不影响播放与时间轴', s.state === 'playing' && s.times.join(',') === timesBefore, `state=${s.state}`);
  await sleep(450); // 等背景色过渡结束，截图才是稳定选中态
  await page.screenshot({ path: shots(`panels-${label}-desktop-toolbar.png`) });
  // 校准逐曲
  await page.click('[data-act="lyric-offset"][data-delta="0.5"]');
  await page.click('[data-act="lyric-offset"][data-delta="0.5"]');
  s = await waitUntil(page, (x) => x.offset === 1);
  check(label, '校准读数 +1.0s', s.readout === '+1.0s', s.readout);
  s = await playRow(page, 'demo-night-ferry');
  check(label, '切歌不继承上一首偏移', s.offset === 0 && s.readout === '0.0s', `offset=${s.offset} readout=${s.readout}`);
  await page.click('#plLyricsBtn');
  await waitUntil(page, (x) => x.expanded === 'true');
  await page.click('[data-act="lyric-offset"][data-delta="-0.5"]');
  await waitUntil(page, (x) => x.offset === -0.5);
  s = await playRow(page, 'qingchun-dagai');
  check(label, '回到原曲恢复其偏移', s.offset === 1 && s.readout === '+1.0s', `offset=${s.offset}`);
  check(label, '逐曲偏移已持久化', await page.evaluate(() => JSON.parse(localStorage.getItem('zx.music.v1')).lyricOffsets['qingchun-dagai']) === 1);
  // 简介
  await page.click('#plAboutBtn');
  s = await waitUntil(page, (x) => x.stage === 'about');
  check(label, '简介与词互斥', s.lyricsAria === 'false' && s.aboutAria === 'true');
  for (const want of ['青春大概', '原唱', '徐鸣', '作词', '彭錞', '作曲', '本站版本', '翻唱版本', '演唱：金石竹青']) {
    check(label, `简介含「${want}」`, s.aboutText.includes(want));
  }
  check(label, '无生成工具资料时不显示空标签', !s.aboutText.includes('生成工具'));
  await page.screenshot({ path: shots(`panels-${label}-desktop-about.png`) });
  s = await playRow(page, 'demo-night-ferry');
  check(label, '切歌后简介同步更新', s.aboutText.includes('合成测试音') && !s.aboutText.includes('徐鸣'), s.aboutText.slice(0, 40));
  check(label, '切歌不关掉简介面板', s.stage === 'about');
  // 跨页
  await page.evaluate(() => document.querySelector('.nav__ul .nav__a')?.scrollIntoView({ block: 'center' }));
  await sleep(300);
  await page.click('.nav__ul .nav__a');
  await sleep(900);
  s = await snap(page);
  check(label, '跨页后面板与播放仍在', s.stage === 'about' && s.state === 'playing' && s.aboutText.includes('合成测试音'), `stage=${s.stage} state=${s.state}`);
  // 刷新恢复
  await page.goto(`${base}/songs/`, { waitUntil: 'domcontentloaded' });
  await sleep(700);
  await playRow(page, 'qingchun-dagai');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1200);
  s = await waitUntil(page, (x) => x.slug === 'qingchun-dagai');
  check(label, '刷新恢复字号偏好', s.font === 's' && s.pressed.includes('s:true'), s.pressed.join(','));
  check(label, '刷新恢复该曲校准', s.offset === 1 && s.readout === '+1.0s', `offset=${s.offset} readout=${s.readout}`);
  await page.click('#plLyricsBtn');
  s = await waitUntil(page, (x) => x.expanded === 'true' && x.toolbar && x.toolbar.h > 0);
  check(label, '桌面点击区 ≥44px', s.sizes.every((v) => v >= 44), s.sizes.map((v) => v.toFixed(0)).join('/'));
  check(label, '桌面无横向溢出', s.docOverflow <= 0 && s.toolbarOverflow <= 0, `doc=${s.docOverflow} toolbar=${s.toolbarOverflow}`);
  check(label, '无页面 JS 错误', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}
async function runMobile(browser, base, label) {
  console.log(`\n▶ ${label} mobile ${base}`);
  // 独立 context：桌面段的 localStorage 不串进来（pagehide 的 store.flush 会把清掉的存储写回，
  // 所以「同页 clear + reload」不可靠），手机默认态必须在干净存储里验
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/songs/`, { waitUntil: 'domcontentloaded' });
  await sleep(700);
  let s = await snap(page);
  check(label, '手机字号默认中', s.font === 'm' && s.pressed.join(',') === 's:false,m:true,l:false', s.pressed.join(','));
  check(label, '手机校准默认 0', s.offset === 0 && s.readout === '0.0s', `offset=${s.offset} readout=${s.readout}`);
  check(label, '手机迷你条「词」「简介」常驻可见', await page.evaluate(() => {
    const ok = (id) => { const b = document.getElementById(id); if (!b) return false; const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.right <= window.innerWidth && r.bottom <= window.innerHeight; };
    return ok('plLyricsBtn') && ok('plAboutBtn');
  }));
  check(label, '手机迷你条不横向溢出', s.docOverflow <= 0 && s.bar.r <= s.winW + 1, `doc=${s.docOverflow} bar.right=${s.bar?.r.toFixed(0)}`);
  await page.screenshot({ path: shots(`panels-${label}-mobile-bar.png`) });
  let ps = await playRow(page, 'qingchun-dagai');
  check(label, '手机起播', ps.state === 'playing');
  await page.tap('#plLyricsBtn');
  s = await waitUntil(page, (x) => x.stage === 'lyrics' && x.lineSize > 0);
  check(label, '手机工具栏换行不溢出', s.toolbarOverflow <= 0 && s.docOverflow <= 0 && s.toolbar.r <= s.winW + 1, `toolbarOverflow=${s.toolbarOverflow} doc=${s.docOverflow}`);
  check(label, '手机工具栏不遮挡歌词', s.toolbar.b <= s.lyrics.t + 1 && s.lyrics.h > 120, `toolbar.bottom=${s.toolbar?.b.toFixed(0)} lyrics.top=${s.lyrics?.t.toFixed(0)} lyrics.h=${s.lyrics?.h.toFixed(0)}`);
  check(label, '手机工具栏按钮全部在视口内', await page.evaluate(() => [...document.querySelectorAll('.pl__toolbar button')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.width >= 44 && r.height >= 44; })));
  const mSize = s.lineSize;
  await page.tap('[data-act="lyric-font"][data-size="l"]');
  s = await waitUntil(page, (x) => x.font === 'l');
  check(label, '手机字号切换立即生效', s.lineSize > mSize * 1.1 && s.state === 'playing', `${mSize.toFixed(1)}→${s.lineSize.toFixed(1)}px`);
  await page.tap('[data-act="lyric-offset"][data-delta="0.5"]');
  s = await waitUntil(page, (x) => x.offset === 0.5);
  check(label, '手机校准可用且读数更新', s.readout === '+0.5s', s.readout);
  await sleep(450);
  await page.screenshot({ path: shots(`panels-${label}-mobile-toolbar.png`) });
  await page.tap('#plAboutBtn');
  s = await waitUntil(page, (x) => x.stage === 'about');
  check(label, '手机简介与词互斥', s.lyricsAria === 'false' && s.aboutAria === 'true');
  check(label, '手机简介不溢出不越界', s.docOverflow <= 0 && s.about.r <= s.winW + 1 && s.about.b <= s.winH + 1, `doc=${s.docOverflow} about.right=${s.about?.r.toFixed(0)}`);
  check(label, '手机简介含原作署名与版本说明', s.aboutText.includes('徐鸣') && s.aboutText.includes('翻唱版本'));
  await page.screenshot({ path: shots(`panels-${label}-mobile-about.png`) });
  ps = await playRow(page, 'demo-paper-boat');
  check(label, '手机切歌后简介更新为当前曲', ps.aboutText.includes('纯音乐') && !ps.aboutText.includes('徐鸣'), ps.aboutText.slice(0, 40));
  check(label, '手机切歌不断播放', ps.state === 'playing');
  check(label, '手机无页面 JS 错误', errors.length === 0, errors.slice(0, 2).join(' | '));
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
  const localBase = baseArg || 'http://localhost:8393';
  const server = baseArg ? null : startServer(path.join(ROOT, 'dist'), 8393);
  await sleep(300);
  await runDesktop(browser, localBase, 'local');
  await runMobile(browser, localBase, 'local');
  server?.close();
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
const report = {
  at: new Date().toISOString(),
  chrome: 'headless Google Chrome (puppeteer-core)',
  bases: [baseArg || 'http://localhost:8393 (dist --demo)'],
  pass: results.length - failed.length,
  fail: failed.length,
  checks: results,
  notRun: [
    'iOS Safari 真机（无设备）',
    '微信内浏览器真机（无设备 / 账号）',
    '「全部资料缺失 → 歌曲资料待补充」的真机目视：现有内容均含部分资料，该分支由 tests/player-panels.test.mjs 单元覆盖',
    '线上部署复测需在 push 部署后重跑：node tools/probe-player-panels.mjs --base=https://www.xuzhaoqing.com'
  ]
};
fs.writeFileSync(path.join(ROOT, 'docs/player-panels-results.json'), JSON.stringify(report, null, 2));
console.log(`\n${report.pass}/${results.length} 通过${failed.length ? `，${failed.length} 失败` : ''} → docs/player-panels-results.json`);
process.exit(failed.length ? 1 : 0);