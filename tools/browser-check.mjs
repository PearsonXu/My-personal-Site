#!/usr/bin/env node
/**
 * tools/browser-check.mjs — 真实浏览器验收（系统 Chrome + 真实 MP3）。
 *
 * 做三件事：
 *  1. 三套主题 × 桌面/手机 六种组合，逐一截图；
 *  2. 在真实浏览器里跑完整功能清单（播放、模式、队列、搜索、歌词、错误、恢复、分享…）；
 *  3. 检查横向溢出、遮挡、按钮可点、安全区与常驻播放器。
 *
 * 用法：node tools/browser-check.mjs [--port=8321] [--keep]
 * 产物：docs/screenshots/*.png、docs/browser-results.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'docs/screenshots');
const argv = process.argv.slice(2);
const PORT = Number((argv.find((a) => a.startsWith('--port=')) || '--port=8321').split('=')[1]);
const BASE = `http://127.0.0.1:${PORT}`;

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser'
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};

const results = [];
function record(group, name, ok, detail = '') {
  results.push({ group, name, ok, detail: String(detail).slice(0, 400) });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${String(detail).slice(0, 120)}` : ''}`);
}
async function check(group, name, fn) {
  try {
    const detail = await fn();
    record(group, name, true, detail || '');
  } catch (err) {
    record(group, name, false, err.message || String(err));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function newPage(browser, { viewport, theme, layout, storage }) {
  // 每个组合用独立的 browser context：否则同源页面共享 localStorage，
  // 前一个组合的收藏会被后一个组合的「再点一次」取消掉。
  const context = await browser.createBrowserContext();
  await context.overridePermissions(BASE, ['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  await page.setViewport(VIEWPORTS[viewport]);
  await page.evaluateOnNewDocument((t, l, extra) => {
    try {
      if (t) localStorage.setItem('zx.music.theme', t);
      if (l) localStorage.setItem('zx.music.layout', l);
      for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v);
    } catch { /* ignore */ }
  }, theme ?? null, layout ?? null, storage || {});
  page.on('pageerror', (e) => record('runtime', '页面 JS 异常', false, e.message));
  return page;
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

/**
 * 元素特写。必须先「瞬时」滚到位再拍：
 * 站点开了 scroll-behavior:smooth，直接 elementHandle.screenshot() 会在滚动动画中途取框，
 * 拍到的是滚动前的区域（例如把歌词拍成控制区）。
 */
async function shotElement(page, selector, name) {
  // 这些控件都在 position:fixed 容器里。若先 scrollIntoView，文档也会被滚动，
  // 而 boundingBox 会把 documentScrollY 计进裁剪坐标 → 拍到别的区域。
  // 正确做法：文档滚回顶部，只滚控件所在的固定面板，再直接对元素截图。
  await page.evaluate((s) => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const el = document.querySelector(s);
    const panel = el?.closest('.pl__full');
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, selector);
  await sleep(320);
  const el = await page.$(selector);
  await el.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/** 真实点击：先把元素滚到视口中部，避开顶部 header 与底部常驻播放器 */
async function clickSel(page, selector) {
  await page.waitForSelector(selector, { visible: true });
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center', inline: 'center' }), selector);
  await sleep(180);
  await page.click(selector);
}

async function waitPlaying(page, timeout = 15000) {
  try {
    await page.waitForFunction(() => window.__music.player.state === 'playing', { timeout });
  } catch {
    const s = await page.evaluate(() => {
      const a = /** @type {any} */ (document.getElementById('zx-audio'));
      return { state: window.__music.player.state, detail: window.__music.player.stateDetail, err: a.error?.code ?? null, ready: a.readyState, src: a.getAttribute('src'), paused: a.paused };
    });
    throw new Error(`未进入播放态：${JSON.stringify(s)}`);
  }
}

async function playFirst(page) {
  await clickSel(page, '[data-act="play-song"]');
  await waitPlaying(page);
}

async function state(page) {
  return page.evaluate(() => {
    const a = window.__music.player;
    const el = /** @type {any} */ (document.getElementById('zx-audio'));
    return {
      state: a.state, song: a.currentSong?.slug || null, time: el.currentTime,
      paused: el.paused, duration: el.duration, src: el.getAttribute('src'),
      mode: a.queue.mode, queue: a.queue.items.map((i) => i.slug), ids: a.queue.items.map((i) => i.id),
      volume: el.volume, favorites: [...a.store.data.favorites], lyricIndex: a.lyricIndex,
      theme: document.documentElement.dataset.theme, layout: document.documentElement.dataset.layout,
      readyState: el.readyState, buffered: el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0
    };
  });
}
async function openQueue(page, viewport) {
  // 先让控制条布局稳定下来（状态行占位固定），再取坐标点击
  await page.mouse.move(2, 2);
  await sleep(220);
  const sel = viewport === 'mobile' ? '.pl__fullbtns [data-act="open-queue"]' : '.pl__extra [data-act="open-queue"]';
  if (viewport === 'mobile') {
    await page.evaluate(() => window.__music.ui.expand());
    await sleep(250);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.click(sel);
    try {
      await page.waitForSelector('.sheet__title', { timeout: 4000 });
      await sleep(150);
      return;
    } catch (err) {
      if (attempt === 1) throw err;
      await sleep(300);
    }
  }
}

/** 媒体页面上 networkidle0 可能永远不触发（音频连接常驻），统一用 DOMContentLoaded + 应用就绪 */
async function goto(page, url) {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__music, { timeout: 15000 });
  await sleep(150);
  return res;
}

async function reload(page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__music, { timeout: 15000 });
  await sleep(400);
}

async function closeAll(page, viewport) {
  await page.keyboard.press('Escape');
  await sleep(120);
  if (viewport === 'mobile') await page.evaluate(() => window.__music.ui.collapse());
  await sleep(120);
}

/** 完整功能清单：在真实浏览器里逐项操作真实音频 */
async function functionalSuite(page, group, { viewport }) {
  await goto(page, `${BASE}/songs/demo-night-ferry/`);

  await check(group, '播放：真实 MP3 解码并推进时间', async () => {
    await playFirst(page);
    const a = await state(page);
    await sleep(1300);
    const b = await state(page);
    assert(b.time > a.time + 0.5, `时间没有前进：${a.time} → ${b.time}`);
    assert(b.readyState >= 3, `readyState=${b.readyState}`);
    assert(Math.abs(b.duration - 36.05) < 0.6, `解码时长异常：${b.duration}`);
    return `${a.time.toFixed(2)}s → ${b.time.toFixed(2)}s，duration=${b.duration.toFixed(2)}s，buffered=${b.buffered.toFixed(1)}s`;
  });

  await check(group, '暂停 / 继续', async () => {
    await page.click('#plToggle');
    await page.waitForFunction(() => window.__music.player.state === 'paused');
    const p = await state(page);
    await sleep(400);
    const p2 = await state(page);
    assert(p2.paused && Math.abs(p2.time - p.time) < 0.05, '暂停后时间仍在走');
    await page.click('#plToggle');
    await page.waitForFunction(() => window.__music.player.state === 'playing');
    return `暂停于 ${p.time.toFixed(2)}s 后恢复`;
  });

  await check(group, '主控尺寸与点击区域达标', async () => {
    const m = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
      const glyph = (el) => { const s = el.querySelector('svg.icon'); const b = s.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
      const play = document.getElementById('plToggle');
      const prev = document.querySelector('.pl__bar [data-act="prev"]');
      const next = document.querySelector('.pl__bar [data-act="next"]');
      return { play: r(play), prev: r(prev), next: r(next), prevGlyph: glyph(prev), nextGlyph: glyph(next) };
    });
    const want = viewport === 'mobile' ? 56 : 48;
    assert(m.play.w === want && m.play.h === want, `主按钮 ${m.play.w}×${m.play.h}，期望 ${want}`);
    for (const k of ['prev', 'next']) {
      assert(m[k].w >= 44 && m[k].h >= 44, `${k} 点击区 ${m[k].w}×${m[k].h} < 44`);
      assert(m[`${k}Glyph`].w >= 22 && m[`${k}Glyph`].w <= 24, `${k} 图形 ${m[`${k}Glyph`].w}px 不在 22–24`);
    }
    return `主按钮 ${m.play.w}px · 上下首点击区 ${m.prev.w}px · 图形 ${m.prevGlyph.w}px`;
  });

  await check(group, '播放/暂停图标原位切换：不跳位、不断音', async () => {
    const boxOf = () => page.evaluate(() => {
      const b = document.getElementById('plToggle').getBoundingClientRect();
      const vis = [...document.querySelectorAll('#plToggle .pbtn__glyph')].find((g) => getComputedStyle(g).display !== 'none');
      const vb = vis.getBoundingClientRect();
      return { btn: [b.x, b.y, b.width, b.height], glyph: [vb.x, vb.y, vb.width, vb.height], kind: vis.className.includes('pause') ? 'pause' : 'play' };
    });
    const playing = await boxOf();
    assert(playing.kind === 'pause', `播放中应显示暂停图标，实际 ${playing.kind}`);
    const t0 = await state(page);
    await page.click('#plToggle');
    await page.waitForFunction(() => window.__music.player.state === 'paused', { timeout: 10000 });
    const paused = await boxOf();
    assert(paused.kind === 'play', `暂停后应显示播放图标，实际 ${paused.kind}`);
    for (let i = 0; i < 4; i++) {
      assert(Math.abs(paused.btn[i] - playing.btn[i]) < 0.6, `主按钮跳位：${playing.btn} → ${paused.btn}`);
      assert(Math.abs(paused.glyph[i] - playing.glyph[i]) < 0.6, `图形跳位：${playing.glyph} → ${paused.glyph}`);
    }
    await page.click('#plToggle');
    await waitPlaying(page);
    const again = await boxOf();
    assert(again.kind === 'pause', '恢复播放后图标没切回暂停');
    for (let i = 0; i < 4; i++) assert(Math.abs(again.btn[i] - playing.btn[i]) < 0.6, '二次切换后跳位');
    const t1 = await state(page);
    assert(t1.src === t0.src, '切换图标换了音源');
    assert(t1.time >= t0.time, '切换图标导致进度倒退');
    return `按钮与图形位置零位移，音源不变，${t0.time.toFixed(2)}s → ${t1.time.toFixed(2)}s`;
  });

  await check(group, '拖动进度条', async () => {
    const sel = viewport === 'mobile' ? '#plSeekFull' : '#plSeek';
    if (viewport === 'mobile') await page.click('[data-act="expand"]');
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      el.value = '500';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, sel);
    await sleep(500);
    const s = await state(page);
    assert(s.time > 15 && s.time < 21, `拖动后时间不对：${s.time}`);
    if (viewport === 'mobile') await page.click('[data-act="collapse"]');
    return `seek → ${s.time.toFixed(2)}s`;
  });

  await check(group, '下一首 / 上一首', async () => {
    await page.evaluate(() => window.__music.player.playSlugs(['demo-night-ferry', 'demo-paper-boat'], { autoplay: false }));
    await sleep(250);
    await page.click('#plToggle');
    await waitPlaying(page);
    await clickSel(page, '.pl__bar [data-act="next"]');
    await page.waitForFunction(() => window.__music.player.currentSong?.slug === 'demo-paper-boat', { timeout: 15000 });
    await waitPlaying(page);
    const n = await state(page);
    // 确定性暂停：避免「元素状态与 UI 状态不一致」时 toggle 的方向不确定
    await page.evaluate(() => {
      /** @type {any} */ (document.getElementById('zx-audio')).currentTime = 0;
      window.__music.player.pause();
    });
    await page.waitForFunction(() => window.__music.player.state === 'paused', { timeout: 15000 });
    await page.evaluate(() => window.__music.player.prev());
    await page.waitForFunction(() => window.__music.player.currentSong?.slug === 'demo-night-ferry', { timeout: 15000 });
    return `next → ${n.song}（真实播放），prev → demo-night-ferry`;
  });

  if (viewport === 'desktop') {
    await check(group, '音量控制', async () => {
      await page.evaluate(() => {
        const el = document.getElementById('plVol');
        el.value = '40';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const s = await state(page);
      assert(Math.abs(s.volume - 0.4) < 0.02, `音量未生效：${s.volume}`);
      await page.click('[data-act="toggle-mute"]');
      const m = await page.evaluate(() => /** @type {any} */ (document.getElementById('zx-audio')).muted);
      assert(m === true, '静音未生效');
      await page.click('[data-act="toggle-mute"]');
      return `volume=${s.volume}，静音可切换`;
    });
  }

  await check(group, '四种播放模式', async () => {
    const seen = [];
    for (let i = 0; i < 4; i++) {
      seen.push(await page.evaluate(() => window.__music.player.queue.mode));
      await page.evaluate(() => window.__music.player.cycleMode());
    }
    assert(new Set(seen).size === 4, `模式不足四种：${seen.join(',')}`);
    const shuffleOk = await page.evaluate(async () => {
      const p = window.__music.player;
      p.setMode('shuffle');
      p.playSlugs(['demo-night-ferry', 'demo-paper-boat', 'demo-night-ferry', 'demo-paper-boat'], { autoplay: false });
      const played = [p.queue.current().slug + '#' + p.queue.current().id];
      for (let i = 0; i < 3; i++) { const it = p.queue.advance({ auto: true }); played.push(it.slug + '#' + it.id); }
      return new Set(played).size === 4;
    });
    assert(shuffleOk, '随机一轮内出现重复');
    await page.evaluate(() => window.__music.player.setMode('order'));
    return seen.join(' → ');
  });

  await check(group, '队列：添加 / 重复 / 删除 / 排序 / 清空', async () => {
    await page.evaluate(() => {
      const p = window.__music.player;
      p.clearQueue();
      p.addLast('demo-night-ferry');
      p.addLast('demo-paper-boat');
      p.addLast('demo-night-ferry');
      p.addNext('demo-paper-boat');
    });
    let s = await state(page);
    assert(s.queue.length === 4, `队列长度 ${s.queue.length}`);
    assert(new Set(s.ids).size === 4, '重复歌曲共用同一个队列项 id');
    const orderBefore = await page.evaluate(() => window.__music.player.queue.items.map((i) => i.slug));
    await page.evaluate(() => window.__music.player.moveItem(3, 0));
    const moved = await page.evaluate(() => window.__music.player.queue.items.map((i) => i.slug));
    const expected = [orderBefore[3], ...orderBefore.slice(0, 3)];
    assert(moved.join() === expected.join(), `排序结果 ${moved.join()}，期望 ${expected.join()}`);
    await page.evaluate(() => window.__music.player.removeItem(window.__music.player.queue.items[0].id));
    s = await state(page);
    assert(s.queue.length === 3, '删除失败');
    await openQueue(page, viewport);
    const items = await page.$$eval('.qitem', (n) => n.length);
    assert(items === 3, `队列面板显示 ${items} 项`);
    await page.click('[data-qact="clear"]');
    await sleep(200);
    s = await state(page);
    assert(s.queue.length === 0, '清空失败');
    await closeAll(page, viewport);
    return '4 项（含重复）→ 排序 → 删除 → 面板 → 清空';
  });
  await check(group, '搜索：歌名 / 歌词 / 无结果', async () => {
    await goto(page, `${BASE}/songs/`);
    const type = async (q) => {
      await page.evaluate((v) => {
        const el = document.getElementById('libSearch');
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, q);
      await sleep(320);
      return page.evaluate(() => window.__music.library.visible.slice());
    };
    const byTitle = await type('夜渡');
    assert(byTitle.includes('demo-night-ferry'), '歌名搜索失败');
    const byLyric = await type('LRC');
    assert(byLyric.includes('demo-night-ferry'), '歌词全文搜索失败');
    const none = await type('绝不存在的词');
    assert(none.length === 0, '无结果时仍返回内容');
    const emptyVisible = await page.evaluate(() => !document.getElementById('libEmpty').hidden);
    assert(emptyVisible, '空状态没有显示');
    await type('');
    return `歌名 ${byTitle.length} · 歌词 ${byLyric.length} · 无结果 0`;
  });

  await check(group, '标签筛选与展示模式', async () => {
    await page.click('[data-act="filter-tag"][data-tag="instrumental"]');
    await sleep(250);
    const filtered = await page.evaluate(() => window.__music.library.visible.slice());
    assert(filtered.length === 1 && filtered[0] === 'demo-paper-boat', `筛选结果 ${filtered}`);
    await page.click('[data-act="filter-tag"][data-tag=""]');
    await sleep(200);
    for (const v of ['grid', 'vinyl', 'list']) {
      await page.click(`[data-act="set-view"][data-view="${v}"]`);
      const cur = await page.evaluate(() => document.querySelector('[data-viewbox]').dataset.view);
      assert(cur === v, `展示模式 ${v} 未生效`);
    }
    return '标签筛选 + 列表/封面墙/唱片';
  });

  await check(group, '专辑与歌单一键播放', async () => {
    await goto(page, `${BASE}/albums/demo-fixtures/`);
    // 手机迷你条是固定底栏：先滚到视口中部再点，避免按钮落在底栏覆盖区（真实用户也会先滚动）
    await page.evaluate(() => document.querySelector('[data-act="play-collection"]')?.scrollIntoView({ block: 'center' }));
    await sleep(300);
    await page.click('[data-act="play-collection"]');
    await page.waitForFunction(() => window.__music.player.state === 'playing');
    const s = await state(page);
    assert(s.queue.length === 2, `专辑队列 ${s.queue.length}`);
    await goto(page, `${BASE}/playlists/late-night/`);
    await page.evaluate(() => document.querySelector('[data-act="queue-collection"][data-pos="last"]')?.scrollIntoView({ block: 'center' }));
    await sleep(300);
    await page.click('[data-act="queue-collection"][data-pos="last"]');
    await sleep(250);
    const s2 = await state(page);
    assert(s2.queue.length === 4, `歌单加入队列后 ${s2.queue.length}`);
    return '专辑 2 首播放 · 歌单加入队列';
  });

  await check(group, '收藏与最近播放', async () => {
    await goto(page, `${BASE}/songs/demo-night-ferry/`);
    await clickSel(page, '.song__info [data-act="fav"]');
    await sleep(250);
    const stored = await page.evaluate(() => ({ favs: window.__music.store.data.favorites.slice(), raw: localStorage.getItem('zx.music.v1')?.length || 0 }));
    assert(stored.favs.includes('demo-night-ferry'), `收藏未写入本地：${JSON.stringify(stored)}`);
    await goto(page, `${BASE}/me/`);
    await sleep(350);
    const favs = await page.$$eval('#favList .row', (n) => n.length);
    const recent = await page.$$eval('#recentList .row', (n) => n.length);
    assert(favs >= 1, `收藏列表为空（本地已有 ${stored.favs.length} 条）`);
    assert(recent >= 1, '最近播放为空');
    return `收藏 ${favs} · 最近 ${recent}`;
  });

  await check(group, 'LRC 同步高亮与点击跳转', async () => {
    await goto(page, `${BASE}/songs/demo-night-ferry/`);
    await playFirst(page);
    await page.evaluate(() => window.__music.player.seek(13));
    await sleep(600);
    const idx = await page.evaluate(() => window.__music.player.lyricIndex);
    assert(idx >= 3, `13s 时高亮行 ${idx}`);
    const active = await page.$$eval('[data-lrc] .lrc__line.is-active', (n) => n.length);
    assert(active === 1, `页面高亮行 ${active}`);
    await page.evaluate(() => {
      const lines = document.querySelectorAll('[data-lrc] .lrc__line');
      lines[6].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(400);
    const t = await state(page);
    assert(t.time >= 18, `点击歌词跳转失败：${t.time}`);
    return `13s → 第 ${idx} 行；点击第 7 行 → ${t.time.toFixed(1)}s`;
  });

  await check(group, '纯音乐 / 无歌词空状态', async () => {
    await goto(page, `${BASE}/songs/demo-paper-boat/`);
    const text = await page.evaluate(() => document.querySelector('#lyrics').textContent);
    assert(text.includes('纯音乐'), '纯音乐页没有空状态说明');
    await playFirst(page);
    await sleep(400);
    const l = await page.evaluate(() => ({ fmt: window.__music.player.lyrics.format, idx: window.__music.player.lyricIndex }));
    assert(l.fmt === 'none' && l.idx === -1, `纯音乐仍在做歌词高亮：${JSON.stringify(l)}`);
    return '纯音乐：无歌词、不高亮';
  });

  await check(group, '快速切歌 A→B→A，歌词不串台', async () => {
    await goto(page, `${BASE}/songs/`);
    await page.evaluate(async () => {
      const p = window.__music.player;
      p.playSong('demo-night-ferry');
      p.playSong('demo-paper-boat');
      p.playSong('demo-night-ferry');
    });
    await sleep(1200);
    const r = await page.evaluate(() => ({
      slug: window.__music.player.currentSong.slug,
      first: window.__music.player.lyrics.lines[0]?.text || '',
      fmt: window.__music.player.lyrics.format
    }));
    assert(r.slug === 'demo-night-ferry', `当前曲 ${r.slug}`);
    assert(r.fmt === 'lrc' && r.first.includes('夜渡'), `歌词串台：${r.first}`);
    return `最终 ${r.slug}，歌词「${r.first}」`;
  });
  await check(group, '失效资源 → error 状态与可读提示', async () => {
    await page.evaluate(() => {
      const p = window.__music.player;
      p.songs.get('demo-paper-boat').audio = 'audio/definitely-missing.mp3';
      p.playSong('demo-paper-boat');
    });
    await page.waitForFunction(() => window.__music.player.state === 'error', { timeout: 10000 });
    const detail = await page.evaluate(() => window.__music.player.stateDetail);
    const uiState = await page.evaluate(() => document.getElementById('player-root').dataset.state);
    assert(uiState === 'error', `播放器 UI 状态 ${uiState}`);
    assert(detail.length > 4, '错误提示为空');
    await page.evaluate(() => {
      const p = window.__music.player;
      p.songs.get('demo-paper-boat').audio = 'audio/_demo/demo-paper-boat.mp3';
      p.playSong('demo-night-ferry');
    });
    await page.waitForFunction(() => window.__music.player.state === 'playing');
    return detail;
  });

  await check(group, '网络中断 → 不假装在播', async () => {
    const client = await page.createCDPSession();
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await page.evaluate(() => {
      const p = window.__music.player;
      p.clearQueue();
      p.playSong('demo-paper-boat');
    });
    await sleep(2500);
    const st = await page.evaluate(() => window.__music.player.state);
    assert(['error', 'buffering', 'loading'].includes(st), `断网后状态仍是 ${st}`);
    await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await client.detach();
    await page.evaluate(() => window.__music.player.playSong('demo-night-ferry'));
    await page.waitForFunction(() => window.__music.player.state === 'playing', { timeout: 10000 });
    return `断网状态 ${st}，恢复后可继续播放`;
  });

  await check(group, '刷新后恢复队列与进度，且不自动出声', async () => {
    await page.evaluate(() => window.__music.player.playSlugs(['demo-night-ferry', 'demo-paper-boat'], { autoplay: false }));
    await sleep(300);
    await page.click('#plToggle');
    await waitPlaying(page);
    await page.evaluate(() => window.__music.player.seek(11));
    await sleep(300);
    await page.evaluate(() => window.__music.player.pause());
    await sleep(300);
    await reload(page);
    await sleep(700);
    const s = await state(page);
    assert(s.paused === true, '刷新后自动播放了');
    assert(s.queue.length === 2, `队列未恢复：${s.queue.length}`);
    assert(Math.abs(s.time - 11) < 1.5, `进度未恢复：${s.time}`);
    return `恢复 ${s.queue.length} 首，进度 ${s.time.toFixed(2)}s，保持暂停`;
  });

  await check(group, '分享：规范链接 / 复制 / 二维码', async () => {
    await goto(page, `${BASE}/songs/demo-night-ferry/`);
    const canonical = await page.evaluate(() => document.querySelector('link[rel="canonical"]').href);
    assert(canonical === 'https://www.xuzhaoqing.com/songs/demo-night-ferry/', `规范链接 ${canonical}`);
    const qrOk = await page.evaluate(() => {
      const el = document.querySelector('.qr svg') || document.querySelector('.qr img');
      if (!el) return false;
      return el.getBoundingClientRect().width > 50;
    });
    assert(qrOk, '页面二维码不可见');
    await page.click('[data-act="copy-link"]');
    await sleep(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    assert(clip.includes('/songs/demo-night-ferry/'), `剪贴板内容 ${clip}`);
    return `canonical 正确 · 二维码可见 · 已复制`;
  });

  await check(group, '深链接直达与刷新', async () => {
    for (const p of ['/songs/demo-paper-boat/', '/albums/demo-fixtures/', '/playlists/walk-home/', '/notes/hello-music-house/', '/about/', '/me/', '/status/']) {
      const res = await goto(page, `${BASE}${p}`);
      assert(res.status() === 200, `${p} 返回 ${res.status()}`);
      await reload(page);
      const ok = await page.evaluate(() => !!window.__music && document.querySelectorAll('audio').length === 1);
      assert(ok, `${p} 刷新后应用未就绪`);
    }
    return '7 条深层路径直达 + 刷新均正常';
  });
  await check(group, '站内导航不断歌（真实浏览器）', async () => {
    await goto(page, `${BASE}/`);
    await playFirst(page);
    await page.evaluate(() => { window.__zxProbe = /** @type {any} */ (document.getElementById('zx-audio')); });
    const before = await state(page);
    await page.evaluate(() => window.__music.router.navigate(`${location.origin}/notes/hello-music-house/`));
    await page.waitForFunction(() => document.body.dataset.kind === 'note');
    await sleep(900);
    const after = await state(page);
    const same = await page.evaluate(() => window.__zxProbe === /** @type {any} */ (document.getElementById('zx-audio')));
    assert(same, 'audio 实例被替换');
    assert(after.state === 'playing', `导航后状态 ${after.state}`);
    assert(after.time > before.time, '导航后时间没有继续前进');
    assert(after.song === before.song, '导航后换了歌');
    return `${before.time.toFixed(2)}s → ${after.time.toFixed(2)}s，同一 audio 实例`;
  });

  await check(group, '主题 / 布局切换保留全部播放状态', async () => {
    await page.evaluate(() => window.__music.player.setMode('shuffle'));
    await page.evaluate(() => window.__music.player.seek(9));
    await sleep(300);
    const before = await state(page);
    for (const t of ['cloud', 'forest', 'midnight']) {
      for (const l of ['auto', 'desktop', 'mobile']) {
        await page.evaluate((tt, ll) => {
          window.__music.appearance.setTheme(tt, { announce: false });
          window.__music.appearance.setLayout(ll, { announce: false });
        }, t, l);
        await sleep(120);
        const now = await state(page);
        assert(now.song === before.song, `${t}/${l} 换了歌`);
        assert(now.src === before.src, `${t}/${l} 重新加载了音源`);
        assert(now.mode === before.mode, `${t}/${l} 丢了播放模式`);
        assert(now.paused === false, `${t}/${l} 把播放变成了暂停`);
        assert(now.time >= before.time, `${t}/${l} 进度倒退`);
        assert(now.queue.join() === before.queue.join(), `${t}/${l} 队列变了`);
        const same = await page.evaluate(() => window.__zxProbe === /** @type {any} */ (document.getElementById('zx-audio')));
        assert(same, `${t}/${l} audio 实例被替换`);
      }
    }
    await page.evaluate(() => window.__music.player.pause());
    await sleep(200);
    const paused = await state(page);
    for (const t of ['cloud', 'forest', 'midnight']) {
      await page.evaluate((tt) => window.__music.appearance.setTheme(tt, { announce: false }), t);
      await sleep(120);
      const now = await state(page);
      assert(now.paused === true, `${t} 暂停态被打破`);
      assert(Math.abs(now.time - paused.time) < 0.05, `${t} 暂停进度被改动`);
    }
    return '3 主题 × 3 布局 × 播放/暂停两态全部保持';
  });

  await check(group, '设置记忆：刷新后恢复外观与布局', async () => {
    // 用一张不注入 storage 的干净页面，否则 evaluateOnNewDocument 会在每次刷新时覆盖
    const fresh = await newPage(page.browser(), { viewport });
    await goto(fresh, `${BASE}/`);
    await fresh.evaluate(() => {
      window.__music.appearance.setTheme('forest', { announce: false });
      window.__music.appearance.setLayout('mobile', { announce: false });
    });
    await reload(fresh);
    const d = await fresh.evaluate(() => ({ t: document.documentElement.dataset.theme, l: document.documentElement.dataset.layout }));
    await fresh.close();
    assert(d.t === 'forest' && d.l === 'mobile', `刷新后 ${JSON.stringify(d)}`);
    return 'forest + mobile 已恢复';
  });
}

/** 布局健康检查：横向溢出、播放器可见、关键按钮真的点得到 */
async function layoutSuite(page, group) {
  await check(group, '无横向溢出', async () => {
    const m = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      bodyScrollW: document.body.scrollWidth
    }));
    assert(m.scrollW <= m.clientW + 1, `横向溢出：scrollWidth=${m.scrollW} clientWidth=${m.clientW}`);
    return `${m.scrollW} ≤ ${m.clientW}`;
  });

  await check(group, '常驻播放器在视口内且不被遮挡', async () => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('.pl__bar');
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return { top: b.top, bottom: b.bottom, h: b.height, vh: innerHeight, hit: hit?.closest('.pl') ? 'player' : (hit?.className || hit?.tagName) };
    });
    assert(r.bottom <= r.vh + 1 && r.top >= 0, `播放器超出视口：${JSON.stringify(r)}`);
    assert(r.h > 30, `播放器高度异常 ${r.h}`);
    assert(r.hit === 'player', `播放器中心被遮挡：${r.hit}`);
    return `高度 ${r.h}px，底边 ${r.bottom.toFixed(0)} / 视口 ${r.vh}`;
  });

  await check(group, '关键按钮可点击（命中测试）', async () => {
    const bad = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('.pl__bar button, .head__act button')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (!hit || !el.contains(hit)) out.push(el.getAttribute('aria-label') || el.dataset.act || el.className);
      }
      return out;
    });
    assert(bad.length === 0, `被遮挡的按钮：${bad.join(', ')}`);
    return '播放器与头部按钮全部可命中';
  });

  await check(group, '触控目标尺寸 ≥ 34px', async () => {
    const small = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('.pl__bar button, .head__act button, .btn')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.height < 34 || b.width < 30) out.push(`${el.getAttribute('aria-label') || el.className}:${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      return out;
    });
    assert(small.length === 0, `过小的按钮：${small.join(', ')}`);
    return '全部达标';
  });
}
const SHOTS_ONLY = argv.includes('--shots-only');

/** --shots-only：只出六组合截图（含控制区特写），跳过耗时的功能清单 */
async function functionalSuiteUnlessShotsOnly(page, group, opts) {
  if (SHOTS_ONLY) {
    console.log('  · --shots-only：跳过功能清单');
    return;
  }
  return functionalSuite(page, group, opts);
}

async function main() {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), '--demo'], { cwd: ROOT, stdio: 'inherit' });
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = startServer(path.join(ROOT, 'dist'), PORT);
  await sleep(400);

  const executablePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  assert(executablePath, '找不到本机 Chrome / Chromium / Edge');
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--mute-audio', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--font-render-hinting=none']
  });
  await browser.defaultBrowserContext().overridePermissions(BASE, ['clipboard-read', 'clipboard-write']);
  console.log(`\n浏览器：${await browser.version()}\n`);

  /* ── 默认外观与存储异常 ─────────────────────────── */
  {
    const page = await newPage(browser, { viewport: 'desktop' });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await check('默认与回退', '首次访问默认 cloud（系统深色偏好不覆盖）', async () => {
      await goto(page, `${BASE}/`);
      const d = await page.evaluate(() => ({ t: document.documentElement.dataset.theme, l: document.documentElement.dataset.layout, bg: getComputedStyle(document.body).backgroundColor }));
      assert(d.t === 'cloud', `默认主题 ${d.t}`);
      assert(d.l === 'auto', `默认布局 ${d.l}`);
      assert(d.bg === 'rgb(245, 246, 248)', `背景不是 cloud 的浅色：${d.bg}`);
      return `theme=${d.t} layout=${d.l} bg=${d.bg}（系统偏好 dark）`;
    });
    await page.close();
  }
  {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORTS.desktop);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true });
    });
    await check('默认与回退', 'localStorage 不可用时回退 cloud + auto 且页面可用', async () => {
      await goto(page, `${BASE}/`);
      const d = await page.evaluate(() => ({ t: document.documentElement.dataset.theme, l: document.documentElement.dataset.layout, avail: window.__music.store.available }));
      assert(d.t === 'cloud' && d.l === 'auto', `回退失败 ${JSON.stringify(d)}`);
      assert(d.avail === false, 'store 应标记为不可用');
      await page.click('[data-act="play-song"]');
      await page.waitForFunction(() => window.__music.player.state === 'playing', { timeout: 10000 });
      return '存储不可用仍能播放，外观回退 cloud';
    });
    await page.close();
  }

  /* ── 三套主题 × 桌面 / 手机 ─────────────────────── */
  for (const theme of ['cloud', 'forest', 'midnight']) {
    for (const viewport of ['desktop', 'mobile']) {
      const group = `${theme} × ${viewport}`;
      console.log(`\n── ${group} ──`);
      const page = await newPage(browser, { viewport, theme, layout: viewport });
      await goto(page, `${BASE}/`);
      await sleep(400);
      await shot(page, `${theme}-${viewport}-home`);
      await layoutSuite(page, `${group} · 首页布局`);

      await goto(page, `${BASE}/songs/demo-night-ferry/`);
      await playFirst(page);
      await page.evaluate(() => window.__music.player.seek(13));
      await sleep(700);
      await shot(page, `${theme}-${viewport}-song`);
      await layoutSuite(page, `${group} · 单曲页布局`);
      // 控制区特写：底部常驻条
      await shotElement(page, '.pl__bar', `controls-${theme}-${viewport}-bar`);

      await page.evaluate(() => window.__music.ui.expand('lyrics'));
      await sleep(600);
      await shot(page, `${theme}-${viewport}-lyrics`);
      // 控制区特写：展开页 / 全屏歌词底部主控
      await shotElement(page, '.pl__fullbtns', `controls-${theme}-${viewport}-full`);
      await check(group, '全屏播放页：控件在视口内且可点击', async () => {
        const bad = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('.pl__full button')) {
            const b = el.getBoundingClientRect();
            if (b.width === 0 || b.height === 0) continue;
            if (b.top < 0 || b.bottom > innerHeight + 1) { out.push(`${el.getAttribute('aria-label') || el.dataset.act}:越界`); continue; }
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            if (!hit || !el.contains(hit)) out.push(`${el.getAttribute('aria-label') || el.dataset.act}:被遮挡`);
          }
          return out;
        });
        assert(bad.length === 0, bad.join(', '));
        return '全屏播放页所有按钮可见可点';
      });
      await page.evaluate(() => window.__music.ui.collapse());

      await page.evaluate(() => {
        const p = window.__music.player;
        p.addLast('demo-paper-boat');
        p.addLast('demo-night-ferry');
      });
      await openQueue(page, viewport);
      await sleep(300);
      await shot(page, `${theme}-${viewport}-queue`);
      await closeAll(page, viewport);

      await page.evaluate(() => window.__music.appearance.open());
      await sleep(300);
      await shot(page, `${theme}-${viewport}-appearance`);
      await closeAll(page, viewport);

      await functionalSuiteUnlessShotsOnly(page, group, { viewport });
      await page.close();
    }
  }
  /* ── 白屏故障回归：跨深度导航链路 + 404 页自洽 ───── */
  for (const viewport of ['desktop', 'mobile']) {
    const group = `白屏回归 · ${viewport}`;
    const page = await newPage(browser, { viewport, theme: 'cloud', layout: viewport });
    await goto(page, `${BASE}/`);
    await check(group, '连续跨深度导航都落在正确路径且样式生效', async () => {
      const bad = [];
      for (const [label, expect] of [['手记', '/notes/'], ['曲库', '/songs/'], ['专辑', '/albums/'], ['我的', '/me/'], ['首页', '/']]) {
        await page.evaluate((l) => [...document.querySelectorAll('.nav__a')].find((a) => a.textContent.includes(l))?.click(), label);
        await sleep(600);
        const m = await page.evaluate(() => ({
          path: location.pathname,
          sheets: [...document.styleSheets].length,
          head: getComputedStyle(document.querySelector('.head')).position,
          len: document.getElementById('main').textContent.trim().length
        }));
        if (m.path !== expect) bad.push(`${label}→${m.path}（期望 ${expect}）`);
        if (m.head !== 'sticky' || m.sheets < 4) bad.push(`${label} 样式丢失`);
        if (m.len < 20) bad.push(`${label} 内容为空`);
      }
      assert(bad.length === 0, bad.join('; '));
      return '5 次跨深度导航路径与样式全部正确';
    });
    await check(group, '导航后外壳无相对引用（链接 + 图片）', async () => {
      const left = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('a[href], img[src], source[src], use[href]')) {
          if (el.closest('#page-root')) continue;
          const raw = el.getAttribute(el.hasAttribute('href') ? 'href' : 'src');
          if (!raw || raw.startsWith('#') || /^(mailto:|tel:|data:)/.test(raw)) continue;
          if (!/^(https?:)?\/\//i.test(raw)) out.push(`${el.tagName}:${raw}`);
        }
        return out;
      });
      assert(left.length === 0, left.join(', '));
      return '外壳链接与图片全部绝对地址';
    });
    await check(group, '导航后刷新仍正常', async () => {
      await reload(page);
      const m = await page.evaluate(() => ({
        len: document.getElementById('main').textContent.trim().length,
        head: getComputedStyle(document.querySelector('.head')).position
      }));
      assert(m.len > 50 && m.head === 'sticky', JSON.stringify(m));
      return `len=${m.len}`;
    });
    await page.close();
  }

  {
    const page = await newPage(browser, { viewport: 'desktop' });
    await page.goto(`${BASE}/notes/songs/`, { waitUntil: 'domcontentloaded' });
    await sleep(500);
    await check('白屏回归 · 404 页', '任意深度的 404 页零外部依赖且样式生效', async () => {
      const m = await page.evaluate(() => ({
        boxBg: getComputedStyle(document.querySelector('.box')).backgroundColor,
        len: document.body.textContent.trim().length,
        home: document.getElementById('goHome').getAttribute('href'),
        path: document.getElementById('badPath').textContent,
        external: [...document.querySelectorAll('link[rel="stylesheet"],script[src],img')].length
      }));
      assert(m.external === 0, `404 页仍引用 ${m.external} 个外部资源`);
      assert(m.boxBg === 'rgb(255, 255, 255)', `样式未生效：${m.boxBg}`);
      assert(m.len > 40 && m.home === '/' && m.path === '/notes/songs/', JSON.stringify(m));
      return '内联样式生效、显示坏地址、回首页链接正确';
    });
    await check('白屏回归 · 404 页', '点「回首页」能恢复', async () => {
      await page.click('#goHome');
      await page.waitForFunction(() => !!window.__music, { timeout: 15000 });
      await sleep(300);
      const m = await page.evaluate(() => ({ path: location.pathname, len: document.getElementById('main').textContent.trim().length }));
      assert(m.path === '/' && m.len > 50, JSON.stringify(m));
      return m.path;
    });
    await page.close();
  }

  /* ── 自动适配：窄屏 / 平板 / 宽屏 ───────────────── */
  for (const [label, vp] of [['窄屏 360×740', { width: 360, height: 740 }], ['平板 768×1024', { width: 768, height: 1024 }], ['宽屏 1920×1080', { width: 1920, height: 1080 }]]) {
    const page = await newPage(browser, { viewport: 'desktop', theme: 'cloud', layout: 'auto' });
    await page.setViewport({ ...vp, deviceScaleFactor: 1, isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    await goto(page, `${BASE}/songs/`);
    await sleep(300);
    await check('自动适配', `${label}：形态正确且无溢出`, async () => {
      const m = await page.evaluate(() => ({
        burger: getComputedStyle(document.querySelector('.nav__burger')).display !== 'none',
        // 手机迷你条操作区常驻但只留「词」「简介」两键；桌面才是完整控件
        extraKids: [...document.querySelectorAll('.pl__extra > *')].filter((el) => getComputedStyle(el).display !== 'none').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      }));
      const expectMobile = vp.width <= 760;
      // 中间带（761–900，auto 布局）音量组收起 → 7 键；完整桌面 8 键；手机只留「词」「简介」2 键
      const expectKids = expectMobile ? 2 : (vp.width <= 900 ? 7 : 8);
      assert(m.burger === expectMobile, `${label} 汉堡菜单=${m.burger}，期望 ${expectMobile}`);
      assert(m.extraKids === expectKids, `${label} 迷你条操作键=${m.extraKids}，期望 ${expectKids}`);
      assert(m.overflow <= 1, `${label} 横向溢出 ${m.overflow}px`);
      return `汉堡=${m.burger} 操作键=${m.extraKids} 溢出=${m.overflow}px`;
    });
    await shot(page, `auto-${vp.width}x${vp.height}`);
    await page.close();
  }

  /* ── 手动布局覆盖：宽屏选手机 / 窄屏选桌面 ──────── */
  {
    const page = await newPage(browser, { viewport: 'desktop', theme: 'midnight', layout: 'mobile' });
    await goto(page, `${BASE}/songs/`);
    await sleep(300);
    await check('手动布局', '宽屏 1440 选「手机」：确实变成手机形态', async () => {
      const m = await page.evaluate(() => ({
        burger: getComputedStyle(document.querySelector('.nav__burger')).display !== 'none',
        extraKids: [...document.querySelectorAll('.pl__extra > *')].filter((el) => getComputedStyle(el).display !== 'none').length,
        blur: getComputedStyle(document.documentElement).getPropertyValue('--blur').trim(),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      }));
      assert(m.burger === true, '宽屏手动手机布局没有汉堡菜单');
      assert(m.extraKids === 2, `宽屏手动手机布局迷你条应只留「词」「简介」，实际 ${m.extraKids} 键`);
      assert(m.blur === '0px', `midnight 手机布局应关闭模糊，实际 ${m.blur}`);
      assert(m.overflow <= 1, `溢出 ${m.overflow}`);
      return `汉堡=true 操作键=2 blur=${m.blur}`;
    });
    await shot(page, 'manual-mobile-on-wide');
    await page.close();
  }
  {
    const page = await newPage(browser, { viewport: 'mobile', theme: 'cloud', layout: 'desktop' });
    await goto(page, `${BASE}/songs/`);
    await sleep(300);
    await check('手动布局', '窄屏 390 选「桌面」：保持桌面结构且不溢出', async () => {
      const m = await page.evaluate(() => ({
        burger: getComputedStyle(document.querySelector('.nav__burger')).display !== 'none',
        extraKids: [...document.querySelectorAll('.pl__extra > *')].filter((el) => getComputedStyle(el).display !== 'none').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      }));
      assert(m.burger === false, '窄屏手动桌面布局仍显示汉堡菜单');
      assert(m.extraKids === 8, `窄屏手动桌面布局丢了完整控件，实际 ${m.extraKids} 键`);
      assert(m.overflow <= 1, `溢出 ${m.overflow}px`);
      return `汉堡=false 操作键=8 溢出=${m.overflow}px`;
    });
    await layoutSuite(page, '手动布局 · 窄屏桌面');
    await shot(page, 'manual-desktop-on-narrow');
    await page.close();
  }
  /* ── 横竖屏切换 ─────────────────────────────────── */
  {
    const page = await newPage(browser, { viewport: 'mobile', theme: 'forest', layout: 'auto' });
    await goto(page, `${BASE}/songs/demo-night-ferry/`);
    await playFirst(page);
    await check('横竖屏', '竖屏 → 横屏 → 竖屏：不溢出、不断歌', async () => {
      const before = await state(page);
      for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
        await page.setViewport({ ...vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        await sleep(500);
        const m = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          bar: document.querySelector('.pl__bar').getBoundingClientRect().bottom,
          vh: innerHeight
        }));
        assert(m.overflow <= 1, `${vp.width}×${vp.height} 溢出 ${m.overflow}`);
        assert(m.bar <= m.vh + 1, `${vp.width}×${vp.height} 播放器超出视口`);
      }
      const after = await state(page);
      assert(after.state === 'playing' && after.time > before.time, '旋转屏幕后播放中断');
      return `${before.time.toFixed(2)}s → ${after.time.toFixed(2)}s，两种朝向均无溢出`;
    });
    await shot(page, 'orientation-portrait');
    await page.close();
  }

  /* ── 汇总 ───────────────────────────────────────── */
  const failed = results.filter((r) => !r.ok);
  const summary = { ranAt: new Date().toISOString(), browser: await browser.version(), total: results.length, passed: results.length - failed.length, failed: failed.length, results };
  fs.writeFileSync(path.join(ROOT, 'docs/browser-results.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeMarkdown(summary);

  await browser.close();
  if (!argv.includes('--keep')) server.close();
  console.log(`\n══ 真实浏览器验收：${summary.passed}/${summary.total} 通过，${summary.failed} 失败 ══`);
  for (const f of failed) console.log(`  ✗ [${f.group}] ${f.name} — ${f.detail}`);
  console.log('截图：docs/screenshots/  明细：docs/browser-results.json');
  process.exit(failed.length ? 1 : 0);
}

function writeMarkdown(summary) {
  const groups = [...new Set(summary.results.map((r) => r.group))];
  const lines = [
    '# 真实浏览器验收结果',
    '',
    `> 由 \`node tools/browser-check.mjs\` 自动生成。浏览器：${summary.browser}`,
    `> 运行时间：${summary.ranAt}`,
    '> 音频：真实 MP3（合成测试音，非本人作品），Chrome 真实解码并推进 currentTime。',
    `> **${summary.passed} / ${summary.total} 通过，${summary.failed} 失败。**`,
    ''
  ];
  for (const g of groups) {
    lines.push(`## ${g}`, '', '| 项 | 结果 | 实测 |', '| --- | --- | --- |');
    for (const r of summary.results.filter((x) => x.group === g)) {
      lines.push(`| ${r.name} | ${r.ok ? 'PASS' : '**FAIL**'} | ${r.detail.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(ROOT, 'docs/BROWSER-RESULTS.md'), `${lines.join('\n')}\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });