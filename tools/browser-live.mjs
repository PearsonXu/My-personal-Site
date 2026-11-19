#!/usr/bin/env node
/**
 * tools/browser-live.mjs — 用真实 Chrome 复验「正式域名」上的播放器与外观。
 *
 * 与 browser-check.mjs 的区别：这里跑线上站点，曲库可能为空，
 * 所以不测真实音频播放，而是测「应用是否真的起来了、外壳是否稳、
 * 空曲库时是否诚实、三套外观与布局是否可用、导航是否复用同一个 audio」。
 *
 * 用法：node tools/browser-live.mjs [--base https://www.xuzhaoqing.com]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'docs/screenshots-live');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = flag('base', 'https://www.xuzhaoqing.com').replace(/\/+$/, '');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser'
].find((p) => fs.existsSync(p));

const VP = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(c, m) { if (!c) throw new Error(m); }
async function check(group, name, fn) {
  try {
    const d = await fn();
    results.push({ group, name, ok: true, detail: String(d || '') });
    console.log(`  ✓ ${name}${d ? ` — ${String(d).slice(0, 110)}` : ''}`);
  } catch (err) {
    results.push({ group, name, ok: false, detail: err.message });
    console.log(`  ✗ ${name} — ${err.message}`);
  }
}

async function open(browser, { viewport, theme, layout }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(VP[viewport]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  // 资源类错误必须带上 URL，否则「404」三个字无法定位
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed ${r.url()} ${r.failure()?.errorText || ''}`));
  await page.evaluateOnNewDocument((t, l) => {
    try { if (t) localStorage.setItem('zx.music.theme', t); if (l) localStorage.setItem('zx.music.layout', l); } catch { /* ignore */ }
  }, theme ?? null, layout ?? null);
  return { page, errors };
}

async function goto(page, p) {
  await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__music, { timeout: 20000 });
  await sleep(250);
}

async function main() {
  assert(CHROME, '找不到本机 Chrome');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--mute-audio', '--disable-dev-shm-usage', '--force-color-profile=srgb']
  });
  console.log(`\n正式域名浏览器复验：${BASE}`);
  console.log(`浏览器：${await browser.version()}\n`);

  /* 默认外观 + 应用启动 */
  {
    const { page, errors } = await open(browser, { viewport: 'desktop' });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await check('线上启动', '首次访问默认 cloud（系统深色不覆盖）', async () => {
      await goto(page, '/');
      const d = await page.evaluate(() => ({
        t: document.documentElement.dataset.theme,
        l: document.documentElement.dataset.layout,
        bg: getComputedStyle(document.body).backgroundColor
      }));
      assert(d.t === 'cloud' && d.l === 'auto', JSON.stringify(d));
      assert(d.bg === 'rgb(245, 246, 248)', `背景 ${d.bg}`);
      return `theme=${d.t} layout=${d.l} bg=${d.bg}`;
    });
    await check('线上启动', '应用无 JS 报错，目录加载成功', async () => {
      const n = await page.evaluate(() => window.__music.catalog.songs.length);
      assert(errors.length === 0, errors.join(' | '));
      return `catalog.songs=${n}，0 条控制台错误`;
    });
    await check('线上启动', '空曲库时点播放给出诚实提示，不假装在播', async () => {
      const songs = await page.evaluate(() => window.__music.catalog.songs.length);
      if (songs > 0) {
        await page.click('[data-act="play-song"]');
        await page.waitForFunction(() => window.__music.player.state === 'playing', { timeout: 20000 });
        return `已有 ${songs} 首，真实播放成功`;
      }
      await page.click('#plToggle');
      await sleep(600);
      const s = await page.evaluate(() => ({ state: window.__music.player.state, detail: window.__music.player.stateDetail, paused: document.getElementById('zx-audio').paused }));
      assert(s.paused === true, '空曲库却在播放');
      assert(s.state === 'idle', `状态 ${s.state}`);
      assert(/空/.test(s.detail), `提示不诚实：${s.detail}`);
      return `state=${s.state}，提示「${s.detail}」`;
    });
    await page.close();
  }
  /* 三套外观 × 桌面 / 手机 */
  for (const theme of ['cloud', 'forest', 'midnight']) {
    for (const viewport of ['desktop', 'mobile']) {
      const group = `线上 ${theme} × ${viewport}`;
      console.log(`\n── ${group} ──`);
      const { page, errors } = await open(browser, { viewport, theme, layout: viewport });
      await goto(page, '/');
      await page.screenshot({ path: path.join(SHOTS, `${theme}-${viewport}-home.png`) });

      await check(group, '外观生效且无横向溢出', async () => {
        const m = await page.evaluate(() => ({
          t: document.documentElement.dataset.theme,
          l: document.documentElement.dataset.layout,
          acc: getComputedStyle(document.documentElement).getPropertyValue('--acc').trim(),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        }));
        assert(m.t === theme && m.l === viewport, JSON.stringify(m));
        assert(m.overflow <= 1, `溢出 ${m.overflow}px`);
        return `--acc=${m.acc}，溢出 ${m.overflow}px`;
      });

      await check(group, '常驻播放器在视口内且按钮可点', async () => {
        const bad = await page.evaluate(() => {
          const bar = document.querySelector('.pl__bar').getBoundingClientRect();
          if (bar.bottom > innerHeight + 1 || bar.top < 0) return ['播放器超出视口'];
          const out = [];
          for (const el of document.querySelectorAll('.pl__bar button, .head__act button')) {
            const b = el.getBoundingClientRect();
            if (!b.width || !b.height) continue;
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            if (!hit || !el.contains(hit)) out.push(el.getAttribute('aria-label') || el.dataset.act);
          }
          return out;
        });
        assert(bad.length === 0, bad.join(', '));
        return '播放器与头部按钮全部可命中';
      });

      await check(group, '外观面板列出三套主题 + 三档布局', async () => {
        await page.click('.head__act [data-act="open-appearance"]');
        await page.waitForSelector('[data-ap="theme"]', { timeout: 8000 });
        const n = await page.evaluate(() => ({
          themes: document.querySelectorAll('[data-ap="theme"]').length,
          layouts: document.querySelectorAll('[data-ap="layout"]').length
        }));
        assert(n.themes === 3 && n.layouts === 3, JSON.stringify(n));
        await page.screenshot({ path: path.join(SHOTS, `${theme}-${viewport}-appearance.png`) });
        await page.keyboard.press('Escape');
        await sleep(200);
        return `主题 ${n.themes} · 布局 ${n.layouts}`;
      });

      await check(group, '切外观 / 切布局复用同一个 audio 实例', async () => {
        await page.evaluate(() => { window.__probe = document.getElementById('zx-audio'); });
        const before = await page.evaluate(() => ({ src: document.getElementById('zx-audio').getAttribute('src'), paused: document.getElementById('zx-audio').paused }));
        for (const t of ['cloud', 'forest', 'midnight']) {
          for (const l of ['auto', 'desktop', 'mobile']) {
            await page.evaluate((tt, ll) => {
              window.__music.appearance.setTheme(tt, { announce: false });
              window.__music.appearance.setLayout(ll, { announce: false });
            }, t, l);
            await sleep(80);
            const same = await page.evaluate(() => window.__probe === document.getElementById('zx-audio'));
            assert(same, `${t}/${l} audio 实例被替换`);
          }
        }
        const after = await page.evaluate(() => ({ src: document.getElementById('zx-audio').getAttribute('src'), paused: document.getElementById('zx-audio').paused }));
        assert(after.src === before.src && after.paused === before.paused, '音源或播放态被改动');
        return '3 主题 × 3 布局，audio 实例与状态不变';
      });
      await check(group, '站内导航不断外壳：同一 audio、页面已换', async () => {
        await page.evaluate(() => { window.__probe = document.getElementById('zx-audio'); });
        await page.evaluate(() => window.__music.router.navigate(`${location.origin}/notes/hello-music-house/`));
        await page.waitForFunction(() => document.body.dataset.kind === 'note', { timeout: 15000 });
        await sleep(400);
        const r = await page.evaluate(() => ({
          same: window.__probe === document.getElementById('zx-audio'),
          kind: document.body.dataset.kind,
          audioCount: document.querySelectorAll('audio').length
        }));
        assert(r.same, '导航后 audio 被重建');
        assert(r.kind === 'note' && r.audioCount === 1, JSON.stringify(r));
        return `已到 ${r.kind}，audio 实例不变，全站仍 1 个 audio`;
      });

      await check(group, '空曲库下搜索与空状态正确', async () => {
        await goto(page, '/songs/');
        const songs = await page.evaluate(() => window.__music.catalog.songs.length);
        if (songs === 0) {
          // 空曲库：只应有温和空状态，搜索/视图切换/播放入口都隐藏
          const m = await page.evaluate(() => ({
            empty: /第一首歌，正在路上/.test(document.querySelector('.page').textContent),
            search: !!document.getElementById('libSearch'),
            views: document.querySelectorAll('[data-act="set-view"]').length,
            playAll: document.querySelectorAll('[data-act="play-all"]').length
          }));
          assert(m.empty, '空曲库没有空状态文案');
          assert(!m.search && m.views === 0 && m.playAll === 0, `空曲库仍显示无意义入口：${JSON.stringify(m)}`);
          return '空状态正确，搜索 / 视图切换 / 播放入口均已隐藏';
        }
        assert(await page.$('#libSearch'), '缺少搜索框');
        await page.evaluate(() => {
          const el = document.getElementById('libSearch');
          el.value = '测试';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await sleep(350);
        const count = await page.evaluate(() => document.getElementById('libCount').textContent);
        assert(/搜索/.test(count), `搜索未生效：${count}`);
        return songs === 0 ? `空状态正确，搜索可用（${count}）` : `${songs} 首，搜索可用`;
      });

      await check(group, '无 JS 报错', async () => {
        assert(errors.length === 0, errors.slice(0, 3).join(' | '));
        return '0 条';
      });

      await page.close();
    }
  }
  const failed = results.filter((r) => !r.ok);
  const summary = { ranAt: new Date().toISOString(), base: BASE, browser: await browser.version(), total: results.length, passed: results.length - failed.length, failed: failed.length, results };
  fs.writeFileSync(path.join(ROOT, 'docs/browser-live-results.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const groups = [...new Set(results.map((r) => r.group))];
  const lines = ['# 正式域名 · 真实浏览器复验', '', `> 由 \`node tools/browser-live.mjs\` 生成。目标：${BASE}`, `> 浏览器：${summary.browser} · ${summary.ranAt}`, `> **${summary.passed} / ${summary.total} 通过，${summary.failed} 失败**`, '', '截图：`docs/screenshots-live/`', ''];
  for (const g of groups) {
    lines.push(`## ${g}`, '', '| 项 | 结果 | 实测 |', '| --- | --- | --- |');
    for (const r of results.filter((x) => x.group === g)) lines.push(`| ${r.name} | ${r.ok ? 'PASS' : '**FAIL**'} | ${r.detail.replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  fs.writeFileSync(path.join(ROOT, 'docs/BROWSER-LIVE-RESULTS.md'), `${lines.join('\n')}\n`);
  await browser.close();
  console.log(`\n══ 正式域名浏览器复验：${summary.passed}/${summary.total} 通过，${summary.failed} 失败 ══`);
  for (const f of failed) console.log(`  ✗ [${f.group}] ${f.name} — ${f.detail}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });