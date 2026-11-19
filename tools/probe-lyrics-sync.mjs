#!/usr/bin/env node
/**
 * tools/probe-lyrics-sync.mjs — 真实 Chrome 的歌词同步 / 自动跟随验收。
 *
 * 用法：
 *   node tools/probe-lyrics-sync.mjs             # 本地生产构建 + 线上部署对比
 *   node tools/probe-lyrics-sync.mjs --demo      # 另跑 DEMO 构建（切歌 / 播完重播）
 *   node tools/probe-lyrics-sync.mjs --base=http://localhost:8000   # 指定已起好的服务器
 *
 * 取证项：首句落地、逐句同步采样、居中跟随、只滚容器、用户滚动暂停 + 「回到当前歌词」、
 * 拖动前后跳、暂停恢复、重开面板、慢网缓冲、**刷新恢复进度 + 慢网歌词落地（根因回归）**、
 * reduced-motion、播完 / 重播 / 切歌、手机触摸暂停与按钮点按。
 * 结果写 docs/lyrics-sync-results.json；截图 docs/screenshots/lyrics-sync-*.png。
 * 真机 Safari / 微信内浏览器无法在此自动化 → 结果里标 NOT_RUN，不冒充已测。
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DEMO = args.includes('--demo');
const baseArg = (args.find((a) => a.startsWith('--base=')) || '').split('=')[1];
const LIVE = 'https://www.xuzhaoqing.com';
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
  const c = document.getElementById('plLyrics');
  const act = c?.querySelector('.lrc__line.is-active');
  const back = document.getElementById('plLyricsBack');
  const ar = act?.getBoundingClientRect();
  const cr = c?.getBoundingClientRect();
  return {
    t: p.audio.currentTime, idx: p.lyricIndex, slug: p.currentSong?.slug, state: p.state,
    lines: p.lyrics.lines.map((l) => l.time),
    scrollTop: c?.scrollTop || 0, clientHeight: c?.clientHeight || 0,
    activeI: act ? Number(act.getAttribute('data-i')) : null,
    activeCenter: ar ? ar.top + ar.height / 2 : null,
    contCenter: cr ? cr.top + cr.height / 2 : null,
    backHidden: back ? back.hidden : null,
    backH: back ? back.getBoundingClientRect().height : 0,
    winY: window.scrollY, src: p.audio.currentSrc
  };
});
const expectIdx = (lines, t) => {
  let ans = -1;
  for (let i = 0; i < lines.length; i++) {
    if (typeof lines[i] === 'number' && lines[i] <= t) ans = i; else break;
  }
  return ans;
};
async function waitUntil(page, pred, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    const s = await snap(page);
    if (pred(s)) return s;
    if (Date.now() - t0 > timeout) return s;
    await sleep(300);
  }
}
const playBtn = async (page) => {
  await page.evaluate(() => {
    document.querySelector('[data-act="play-song"]')?.scrollIntoView({ block: 'center' });
  });
  // html 是 scroll-behavior:smooth：不等滚动停稳就 tap/click 会拿到旧坐标点空
  await sleep(400);
};

async function run(browser, base, label, { multi }) {
  console.log(`\n▶ ${label} ${base}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  const net = (down, latency = 0) => cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency, downloadThroughput: down, uploadThroughput: down
  });

  // C1 首次播放：单曲页直达（微信分享 / 刷新同路径）
  await page.goto(`${base}/songs/qingchun-dagai/`, { waitUntil: 'domcontentloaded' });
  await sleep(800);
  // 线上可能仍是修复前的旧构建：依赖新 UI/新行为的项记为「修复前复现」证据，不算验收失败
  const hasFix = await page.evaluate(() => !!document.getElementById('plLyricsBack'));
  const ck = (name, ok, detail = '') => {
    if (hasFix || ok) return check(label, name, ok, detail);
    results.push({ group: label, name, ok: false, expectedOld: true, detail: `修复前复现（线上旧构建）：${detail}` });
    console.log(`  ◐ [${label}] ${name} — 修复前复现：${detail}`);
  };
  console.log(`  构建含修复：${hasFix}`);
  await playBtn(page);
  await page.click('[data-act="play-song"]');
  await waitUntil(page, (s) => s.state === 'playing', 10000);
  await page.evaluate(() => window.__music.ui.expand('lyrics'));
  await sleep(400);
  let s = await waitUntil(page, (x) => x.idx >= 0, 26000);
  check(label, '首句高亮按时落地', s.idx === 0 && s.activeI === 0, `t=${s.t.toFixed(2)} idx=${s.idx}`);
  let syncOk = true; let detail = '';
  for (let i = 0; i < 8; i++) {
    await sleep(600);
    s = await snap(page);
    const e = expectIdx(s.lines, s.t);
    // timeupdate 约 4Hz：idx 允许落后 currentTime 一个事件间隔（≤350ms），DOM 必须与 idx 一致
    const ePrev = expectIdx(s.lines, s.t - 0.35);
    if ((s.idx !== e && s.idx !== ePrev) || s.activeI !== s.idx) { syncOk = false; detail = `t=${s.t.toFixed(2)} idx=${s.idx} expect=${e}/${ePrev} active=${s.activeI}`; break; }
  }
  check(label, '逐句同步以 currentTime 为准（8 次采样）', syncOk, detail);
  ck('自动跟随不自我暂停（按钮保持隐藏）', s.backHidden === true, `backHidden=${s.backHidden}`);

  // C2 居中 + 只滚容器
  const winY0 = s.winY;
  s = await waitUntil(page, (x) => x.idx >= 2, 16000);
  await sleep(800);
  s = await snap(page);
  ck('当前行保持在容器中部附近', Math.abs(s.activeCenter - s.contCenter) < s.clientHeight * 0.3, `Δ=${Math.abs(s.activeCenter - s.contCenter).toFixed(0)}px`);
  check(label, '自动滚动不带动整页', s.winY === winY0, `winY=${s.winY}`);
  await page.screenshot({ path: shots(`lyrics-sync-${label}-follow.png`) });

  // C3 用户滚轮暂停 + 按钮恢复
  const box = await page.evaluate(() => {
    const r = document.getElementById('plLyrics').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  if (hasFix) {
    await page.mouse.wheel({ deltaY: 160 });
    await sleep(300);
    s = await snap(page);
    check(label, '用户滚轮暂停跟随并显示按钮', s.backHidden === false);
    const st0 = s.scrollTop;
    await sleep(4500);
    s = await snap(page);
    check(label, '手动滚动期间不自动拽回', Math.abs(s.scrollTop - st0) < 4 && s.backHidden === false, `scrollTop ${st0.toFixed(0)}→${s.scrollTop.toFixed(0)}`);
    await page.screenshot({ path: shots(`lyrics-sync-${label}-backbtn.png`) });
    await page.click('#plLyricsBack');
    await sleep(800);
    s = await snap(page);
    check(label, '点击回到当前歌词恢复跟随并居中', s.backHidden === true && (Math.abs(s.activeCenter - s.contCenter) < s.clientHeight * 0.3 || s.scrollTop < 4), `scrollTop=${s.scrollTop.toFixed(0)}`);
  } else {
    ck('用户滚轮暂停跟随并显示按钮', false, '旧构建没有「回到当前歌词」按钮');
    await page.mouse.wheel({ deltaY: 160 });
    await sleep(300);
  }

  // C4 暂停跟随状态下拖动进度：立即定位 + 恢复跟随
  if (hasFix) { await page.mouse.wheel({ deltaY: 160 }); await sleep(200); }
  await page.evaluate(() => window.__music.player.seek(120));
  await sleep(700);
  s = await snap(page);
  ck('向前拖动立即定位并恢复跟随', s.idx === expectIdx(s.lines, 120) && s.activeI === s.idx && (!hasFix || s.backHidden === true), `idx=${s.idx} active=${s.activeI}`);
  await page.evaluate(() => window.__music.player.seek(40));
  await sleep(700);
  s = await snap(page);
  check(label, '向后拖动立即定位', s.idx === expectIdx(s.lines, 40) && s.activeI === s.idx, `idx=${s.idx}`);

  // C5 暂停 / 恢复
  await page.evaluate(() => window.__music.player.pause());
  await sleep(400);
  await page.evaluate(() => window.__music.player.play());
  await sleep(1000);
  s = await snap(page);
  check(label, '暂停恢复后按 currentTime 定位', s.idx === expectIdx(s.lines, s.t) && s.activeI === s.idx, `t=${s.t.toFixed(2)}`);

  // C6 重开面板
  if (hasFix) { await page.mouse.wheel({ deltaY: 160 }); await sleep(200); }
  await page.evaluate(() => window.__music.ui.setStage('cover'));
  await sleep(300);
  await page.evaluate(() => window.__music.ui.expand('lyrics'));
  await sleep(800);
  s = await snap(page);
  ck('重开歌词面板立即回到当前行', (!hasFix || s.backHidden === true) && Math.abs(s.activeCenter - s.contCenter) < s.clientHeight * 0.3, `Δ=${Math.abs(s.activeCenter - s.contCenter).toFixed(0)}px`);

  // C7 慢网缓冲后重新同步
  await net(6 * 1024, 300);
  await sleep(2500);
  const sb = await snap(page);
  await net(-1);
  await sleep(1800);
  s = await snap(page);
  check(label, '慢网缓冲后按 currentTime 重新同步', s.idx === expectIdx(s.lines, s.t) && s.activeI === s.idx, `缓冲期 state=${sb.state}，恢复后 t=${s.t.toFixed(2)}`);

  // C8 ★ 根因回归：刷新恢复进度 + 慢网让歌词在曲中落地
  await page.evaluate(() => {
    const p = window.__music.player;
    window.__music.store.save({ position: 70, queue: p.queue.snapshot() }, { immediate: true });
  });
  // 从首页进入 = 歌词走 fetch 分支（单曲页是预渲染 inline，落地同步，踩不到根因）
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await sleep(800);
  await playBtn(page);
  await net(40 * 1024, 400);
  await page.click('[data-act="play-song"]');
  await page.evaluate(() => window.__music.ui.expand('lyrics'));
  await waitUntil(page, (x) => x.lines.length > 0 && x.t > 60, 20000);
  await sleep(1000);
  s = await snap(page);
  ck('恢复进度+慢网落地：高亮立即在正确行', s.activeI === expectIdx(s.lines, s.t) && s.idx === s.activeI && s.activeI >= 0, `t=${s.t.toFixed(2)} idx=${s.idx} active=${s.activeI}（旧构建在此冻住=根因复现）`);
  await net(-1);
  await page.screenshot({ path: shots(`lyrics-sync-${label}-resume.png`) });

  // C9 reduced-motion 瞬时定位
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const before = await snap(page);
  await page.evaluate(() => window.__music.player.seek(150));
  await sleep(150);
  s = await snap(page);
  ck('reduced-motion 瞬时定位（150ms 内完成滚动）', s.activeI === expectIdx(s.lines, 150) && Math.abs(s.scrollTop - before.scrollTop) > 10, `scrollTop ${before.scrollTop.toFixed(0)}→${s.scrollTop.toFixed(0)}`);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  // C10 播完 / 重播 / 切歌
  if (multi) {
    await page.evaluate(() => window.__music.player.playSong('demo-night-ferry'));
    await sleep(1500);
    s = await snap(page);
    check(label, '切歌：歌词与暂停状态随新歌重置', s.slug === 'demo-night-ferry' && s.backHidden === true, `slug=${s.slug}`);
  }
  await page.evaluate(() => { const p = window.__music.player; p.seek(p.duration - 0.8); });
  await sleep(3000);
  s = await snap(page);
  check(label, '播放结束状态诚实（队列播完=paused）', s.state === 'paused', `state=${s.state}`);
  await page.evaluate(() => { const p = window.__music.player; p.seek(0); p.play(); });
  await sleep(1000);
  s = await snap(page);
  // 重播后按 currentTime 定位：首句在 0s 的歌（DEMO）idx=0 才对，首句 19.41s 的歌 idx=-1
  check(label, '重播按 currentTime 重新定位（首句前/首句）', s.idx === expectIdx(s.lines, s.t) && s.activeI === (s.idx >= 0 ? s.idx : null) && (!hasFix || s.backHidden === true), `t=${s.t.toFixed(2)} idx=${s.idx} active=${s.activeI}`);
  check(label, '全程无 Console 错误', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

/** 手机视口：触摸滚动暂停 + 按钮点按恢复 + 触达尺寸 */
async function runMobile(browser, base, label) {
  console.log(`\n▶ ${label}-mobile ${base}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${base}/songs/qingchun-dagai/`, { waitUntil: 'domcontentloaded' });
  await sleep(800);
  await playBtn(page);
  await page.tap('[data-act="play-song"]');
  let ms = await waitUntil(page, (s) => s.state === 'playing', 10000);
  check(label, '手机点按播放进入 playing（非空断言）', ms.state === 'playing', `state=${ms.state} t=${ms.t.toFixed(2)}`);
  await page.tap('#plLyricsBtn');
  ms = await waitUntil(page, (x) => x.idx >= 0, 26000);
  check(label, '手机首句高亮按时落地', ms.idx >= 0 && ms.activeI === ms.idx, `t=${ms.t.toFixed(2)} idx=${ms.idx}`);
  await sleep(600);
  // 触摸意图 + 手动滚动（touchstart 即暂停跟随）
  await page.evaluate(() => {
    const c = document.getElementById('plLyrics');
    c.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    c.scrollTop += 240;
    c.dispatchEvent(new Event('scroll'));
  });
  await sleep(300);
  let s = await snap(page);
  check(label, '手机触摸滚动暂停跟随并显示按钮', s.backHidden === false);
  check(label, '手机按钮触达 ≥44px', s.backH >= 44, `${s.backH.toFixed(0)}px`);
  await page.screenshot({ path: shots(`lyrics-sync-${label}-mobile-backbtn.png`) });
  await page.tap('#plLyricsBack');
  await sleep(800);
  s = await snap(page);
  check(label, '手机点按回到当前歌词恢复跟随', s.backHidden === true && (Math.abs(s.activeCenter - s.contCenter) < s.clientHeight * 0.3 || s.scrollTop < 4), `scrollTop=${s.scrollTop.toFixed(0)}`);
  await page.screenshot({ path: shots(`lyrics-sync-${label}-mobile-follow.png`) });
  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
});
try {
  if (!baseArg) {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), ...(DEMO ? ['--demo'] : [])], { cwd: ROOT, stdio: 'inherit' });
  }
  const localBase = baseArg || 'http://localhost:8391';
  const server = baseArg ? null : startServer(path.join(ROOT, 'dist'), 8391);
  await sleep(300);
  await run(browser, localBase, 'local', { multi: DEMO });
  await runMobile(browser, localBase, 'local');
  await run(browser, LIVE, 'live', { multi: false });
  server?.close();
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok && !r.expectedOld);
const reproduced = results.filter((r) => r.expectedOld);
const report = {
  at: new Date().toISOString(),
  chrome: 'headless Google Chrome (puppeteer-core)',
  bases: [baseArg || 'http://localhost:8391 (dist)', LIVE],
  pass: results.length - failed.length - reproduced.length,
  fail: failed.length,
  reproducedOnOldBuild: reproduced.length,
  checks: results,
  notRun: [
    'iOS Safari 真机（无设备）',
    '微信内浏览器真机（无设备 / 账号）',
    '线上部署复测需在 push 部署后重跑：node tools/probe-lyrics-sync.mjs'
  ]
};
const reportFile = DEMO ? 'docs/lyrics-sync-demo-results.json' : 'docs/lyrics-sync-results.json';
fs.writeFileSync(path.join(ROOT, reportFile), JSON.stringify(report, null, 2));
console.log(`\n${report.pass}/${results.length} 通过${failed.length ? `，${failed.length} 失败` : ''}${reproduced.length ? `，${reproduced.length} 项旧构建复现` : ''} → ${reportFile}`);
process.exit(failed.length ? 1 : 0);