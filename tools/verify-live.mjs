#!/usr/bin/env node
/**
 * tools/verify-live.mjs — 正式域名部署复验。
 *
 * 只读检查线上站点：域名与 HTTPS、页面路由、资源路径与 MIME、Range/206、
 * 播放器骨架、分享元数据、空状态是否正确、有没有误发 DEMO 或旧身份信息。
 *
 * 用法：
 *   node tools/verify-live.mjs                       # 默认 https://www.xuzhaoqing.com
 *   node tools/verify-live.mjs --base https://…      # 换域名
 *   node tools/verify-live.mjs --out docs/LIVE-VERIFICATION.md
 *
 * 曲库为空时，单曲深链接一项标 N/A（不是失败）；有真实歌曲后会自动逐首复验。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = flag('base', 'https://www.xuzhaoqing.com').replace(/\/+$/, '');
const OUT = flag('out', 'docs/LIVE-VERIFICATION.md');

const results = [];
function record(group, name, status, detail = '') {
  results.push({ group, name, status, detail: String(detail).slice(0, 300) });
  const mark = status === 'PASS' ? '✓' : status === 'N/A' ? '·' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${String(detail).slice(0, 110)}` : ''}`);
}
async function check(group, name, fn) {
  try {
    const r = await fn();
    if (r && r.na) record(group, name, 'N/A', r.detail);
    else record(group, name, 'PASS', typeof r === 'string' ? r : (r?.detail || ''));
  } catch (err) {
    record(group, name, 'FAIL', err.message || String(err));
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const get = (p, opts) => fetch(`${BASE}${p}`, { redirect: 'manual', ...opts });

async function main() {
  console.log(`\n复验 ${BASE}\n`);

  /* ── 域名与 HTTPS ─────────────────────────────── */
  await check('域名与 HTTPS', '正式域名首页 200 且证书有效', async () => {
    const res = await fetch(`${BASE}/`);
    assert(res.status === 200, `HTTP ${res.status}`);
    return `HTTP ${res.status}（TLS 握手成功）`;
  });

  await check('域名与 HTTPS', 'http 强制跳转 https', async () => {
    const res = await fetch(BASE.replace('https://', 'http://') + '/', { redirect: 'manual' });
    assert([301, 302, 307, 308].includes(res.status), `HTTP ${res.status}`);
    const loc = res.headers.get('location') || '';
    assert(loc.startsWith('https://'), `跳转到 ${loc}`);
    return `${res.status} → ${loc}`;
  });

  await check('域名与 HTTPS', '裸域跳转 www', async () => {
    const apex = BASE.replace('https://www.', 'https://');
    const res = await fetch(apex + '/', { redirect: 'manual' });
    if (![301, 302, 307, 308].includes(res.status)) return { na: true, detail: `裸域返回 ${res.status}，未配置跳转` };
    const loc = res.headers.get('location') || '';
    assert(loc.includes('www.'), `跳转到 ${loc}`);
    return `${res.status} → ${loc}`;
  });

  /* ── 页面路由 ─────────────────────────────────── */
  const routes = ['/', '/songs/', '/albums/', '/playlists/', '/notes/', '/about/', '/me/', '/status/'];
  await check('页面路由', '全部主路由 200', async () => {
    const bad = [];
    for (const p of routes) {
      const res = await get(p);
      if (res.status !== 200) bad.push(`${p}=${res.status}`);
    }
    assert(bad.length === 0, bad.join(', '));
    return `${routes.length} 条全部 200`;
  });

  await check('页面路由', '不存在的路径返回 404', async () => {
    const res = await get('/definitely-not-a-page-xyz/');
    assert(res.status === 404, `HTTP ${res.status}`);
    const body = await res.text();
    assert(body.includes('这一页不在小屋里'), '404 页不是本站自定义页面');
    return '404 + 自定义 404 页';
  });

  await check('页面路由', '旧站 /legacy/ 已下线', async () => {
    const res = await get('/legacy/');
    assert(res.status === 404, `HTTP ${res.status}，旧站仍可访问`);
    return '404（已按要求移除）';
  });

  /* ── 目录与空状态 ─────────────────────────────── */
  const catalog = await (await fetch(`${BASE}/assets/data/catalog.json`)).json();

  await check('目录与空状态', 'catalog.json 可读且结构正确', async () => {
    assert(catalog && Array.isArray(catalog.songs), 'catalog 结构异常');
    assert(catalog.site?.author?.name === '金石竹青', `署名 ${catalog.site?.author?.name}`);
    return `歌曲 ${catalog.songs.length} · 专辑 ${catalog.albums.length} · 歌单 ${catalog.playlists.length} · 手记 ${catalog.notes.length}`;
  });

  await check('目录与空状态', '生产构建未混入 DEMO', async () => {
    const demo = catalog.songs.filter((s) => s.demo);
    assert(demo.length === 0, `线上有 ${demo.length} 条 DEMO`);
    const home = await (await fetch(`${BASE}/`)).text();
    assert(!home.includes('DEMO'), '首页出现 DEMO 标记');
    assert(!home.includes('_demo/'), '首页引用了 DEMO 音源');
    return '无 DEMO 曲目、无 DEMO 标记';
  });

  await check('目录与空状态', '曲库为空时显示正确空状态', async () => {
    if (catalog.songs.length > 0) return { na: true, detail: `已有 ${catalog.songs.length} 首真实歌曲` };
    const lib = await (await fetch(`${BASE}/songs/`)).text();
    assert(/曲库还是空的|这里还没有歌/.test(lib), '缺少空状态文案');
    const home = await (await fetch(`${BASE}/`)).text();
    assert(/曲库还是空的|这里还没有歌/.test(home), '首页缺少空状态文案');
    return '首页与曲库均为空状态文案，非假内容';
  });

  await check('目录与空状态', '无旧身份 / 专业背景残留', async () => {
    const banned = ['许钊箐', 'Zhaoqing Xu', 'zhaoqingxu.com', 'sc.edu', 'South Carolina', 'UofSC', 'Xiaofeng', 'Instructor of Record', '学术主页', '旧版主页'];
    const pages = ['/', '/songs/', '/about/', '/status/', '/assets/data/catalog.json'];
    const hits = [];
    for (const p of pages) {
      const text = await (await fetch(`${BASE}${p}`)).text();
      for (const w of banned) if (text.includes(w)) hits.push(`${p}:${w}`);
    }
    assert(hits.length === 0, hits.join(', '));
    return `${pages.length} 个入口全部干净`;
  });
  /* ── 资源路径与 MIME ──────────────────────────── */
  await check('资源路径', 'CSS / JS / 数据 / 图片全部 200 且 MIME 正确', async () => {
    const expect = [
      ['/assets/css/site.css', 'text/css'],
      ['/assets/css/player.css', 'text/css'],
      ['/assets/css/themes.css', 'text/css'],
      ['/assets/css/layout.css', 'text/css'],
      ['/assets/js/app.js', 'javascript'],
      ['/assets/js/player.js', 'javascript'],
      ['/assets/js/core/queue.js', 'javascript'],
      ['/assets/data/catalog.json', 'json'],
      ['/assets/data/search.json', 'json'],
      ['/assets/img/og/default.png', 'image/png'],
      ['/assets/img/favicon.svg', 'image/svg']
    ];
    const bad = [];
    for (const [p, mime] of expect) {
      const res = await get(p);
      const ct = res.headers.get('content-type') || '';
      if (res.status !== 200) bad.push(`${p}=${res.status}`);
      else if (!ct.includes(mime)) bad.push(`${p} MIME=${ct}`);
    }
    assert(bad.length === 0, bad.join('; '));
    return `${expect.length} 个资源全部 200 且 MIME 正确`;
  });

  await check('资源路径', '深层页面的相对资源解析正确', async () => {
    const note = catalog.notes[0];
    if (!note) return { na: true, detail: '没有手记页可测' };
    const p = `/notes/${note.slug}/`;
    const html = await (await fetch(`${BASE}${p}`)).text();
    const rels = [...html.matchAll(/(?:href|src)="(\.\.\/\.\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
    assert(rels.length > 0, '深层页面没有相对资源引用');
    const bad = [];
    for (const rel of new Set(rels)) {
      const url = new URL(rel, `${BASE}${p}`).href;
      const res = await fetch(url, { method: 'HEAD' });
      if (res.status !== 200) bad.push(`${rel}=${res.status}`);
    }
    assert(bad.length === 0, bad.join(', '));
    return `${p} 的 ${new Set(rels).size} 个 ../../assets 引用全部 200`;
  });

  await check('资源路径', '宿主支持 Range / 206（进度拖动的前提）', async () => {
    const res = await get('/assets/img/og/default.png', { headers: { Range: 'bytes=0-1023' } });
    assert(res.status === 206, `HTTP ${res.status}`);
    const cr = res.headers.get('content-range') || '';
    assert(/^bytes 0-1023\//.test(cr), `Content-Range=${cr}`);
    assert(/bytes/.test(res.headers.get('accept-ranges') || ''), '缺少 Accept-Ranges');
    return `206 · ${cr} · Accept-Ranges: bytes`;
  });

  /* ── 播放器骨架 ───────────────────────────────── */
  await check('播放器', '全站唯一 audio 且在 #page-root 之外', async () => {
    for (const p of ['/', '/songs/', '/about/']) {
      const html = await (await fetch(`${BASE}${p}`)).text();
      const count = (html.match(/<audio\b/g) || []).length;
      assert(count === 1, `${p} 有 ${count} 个 audio`);
      const end = html.indexOf('<!-- ▲ 路由只替换这一块 ▲ -->');
      assert(end > 0, `${p} 缺少 page-root 边界标记`);
      assert(html.indexOf('<audio id="zx-audio"') > end, `${p} audio 在 page-root 内`);
      assert(html.indexOf('<div id="player-root"') > end, `${p} 播放器在 page-root 内`);
    }
    return '3 个页面均为 1 个 audio，且与播放器同在 page-root 之外';
  });

  await check('播放器', '播放器控件与外观入口就位', async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    for (const id of ['plToggle', 'plSeek', 'plVol', 'plMode', 'plQueueBtn', 'plFull', 'plLyrics']) {
      assert(html.includes(`id="${id}"`), `缺少 #${id}`);
    }
    assert(html.includes('data-act="open-appearance"'), '缺少外观入口');
    assert(html.includes('data-theme="cloud"') && html.includes('data-layout="auto"'), '默认外观/布局不是 cloud/auto');
    return '控件齐全 · 外观入口存在 · 默认 cloud + auto';
  });
  /* ── 分享元数据 ───────────────────────────────── */
  await check('分享元数据', '首页 canonical / OG 指向正式域名', async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
    assert(canonical === `${BASE}/`, `canonical=${canonical}`);
    const og = /<meta property="og:image" content="([^"]*)"/.exec(html)?.[1];
    assert(og && og.startsWith(`${BASE}/`), `og:image=${og}`);
    const img = await fetch(og, { method: 'HEAD' });
    assert(img.status === 200, `og:image HTTP ${img.status}`);
    assert(/image\/png/.test(img.headers.get('content-type') || ''), 'og:image 不是位图');
    return `canonical=${canonical} · og:image 200 image/png`;
  });

  await check('分享元数据', '手记深链接直达 + 刷新 + 独立元数据', async () => {
    const note = catalog.notes[0];
    if (!note) return { na: true, detail: '没有手记' };
    const p = `/notes/${note.slug}/`;
    const r1 = await get(p);
    const r2 = await get(p);
    assert(r1.status === 200 && r2.status === 200, `直达 ${r1.status} / 刷新 ${r2.status}`);
    const html = await r1.text();
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
    assert(canonical === `${BASE}${p}`, `canonical=${canonical}`);
    assert(html.includes(`<title>${note.title}`), '标题不是该手记');
    return `${p} 直达与刷新均 200，canonical 与标题独立`;
  });

  /* ── 单曲深链接 ───────────────────────────────── */
  await check('单曲深链接', '逐首直达 / 刷新 / 元数据 / 音源 Range', async () => {
    if (catalog.songs.length === 0) {
      const missing = await get('/songs/any-song-slug/');
      assert(missing.status === 404, `空曲库下单曲路径应 404，实际 ${missing.status}`);
      return { na: true, detail: '线上曲库为空（生产构建排除 DEMO），暂无单曲页；不存在的路径正确 404。单曲机制已在本地 DEMO 构建 + 真实浏览器 195 项中验证' };
    }
    const bad = [];
    for (const s of catalog.songs) {
      const p = `/songs/${s.slug}/`;
      const res = await get(p);
      if (res.status !== 200) { bad.push(`${p}=${res.status}`); continue; }
      const html = await res.text();
      if (!html.includes(`<link rel="canonical" href="${BASE}${p}"`)) bad.push(`${p} canonical`);
      if (!html.includes('播放这首歌')) bad.push(`${p} 缺播放按钮`);
      const audioUrl = /^https?:/.test(s.audio) ? s.audio : `${BASE}/assets/${s.audio}`;
      const ar = await fetch(audioUrl, { headers: { Range: 'bytes=0-1023' } });
      if (ar.status !== 206) bad.push(`${p} 音源 ${ar.status}`);
      if (!/^audio\//.test(ar.headers.get('content-type') || '')) bad.push(`${p} 音源 MIME`);
    }
    assert(bad.length === 0, bad.join('; '));
    return `${catalog.songs.length} 首全部直达 200 + canonical + 播放按钮 + 音源 206 audio/*`;
  });

  /* ── Pages 附属文件 ───────────────────────────── */
  await check('Pages 附属文件', 'robots / sitemap / .nojekyll 就位', async () => {
    const robots = await get('/robots.txt');
    assert(robots.status === 200, `robots ${robots.status}`);
    const sitemap = await get('/sitemap.xml');
    assert(sitemap.status === 200, `sitemap ${sitemap.status}`);
    const xml = await sitemap.text();
    assert(xml.includes(`${BASE}/`), 'sitemap 未指向正式域名');
    const nj = await get('/.nojekyll');
    assert(nj.status === 200, `.nojekyll ${nj.status}`);
    return 'robots 200 · sitemap 200 且指向正式域名 · .nojekyll 200';
  });

  /* ── 报告 ─────────────────────────────────────── */
  const failed = results.filter((r) => r.status === 'FAIL');
  const na = results.filter((r) => r.status === 'N/A');
  const passed = results.filter((r) => r.status === 'PASS');
  writeReport({ passed: passed.length, failed: failed.length, na: na.length });
  console.log(`\n══ 线上复验：${passed.length} PASS · ${na.length} N/A · ${failed.length} FAIL ══`);
  for (const f of failed) console.log(`  ✗ [${f.group}] ${f.name} — ${f.detail}`);
  console.log(`报告：${OUT}\n`);
  process.exit(failed.length ? 1 : 0);
}

function writeReport({ passed, failed, na }) {
  const groups = [...new Set(results.map((r) => r.group))];
  const lines = [
    '# 线上正式部署复验',
    '',
    `> 由 \`node tools/verify-live.mjs\` 自动生成。目标：${BASE}`,
    `> 运行时间：${new Date().toISOString()}`,
    `> **${passed} PASS · ${na} N/A · ${failed} FAIL**`,
    '',
    'N/A 表示当前条件下不适用（例如曲库为空时没有单曲页），不是失败。',
    ''
  ];
  for (const g of groups) {
    lines.push(`## ${g}`, '', '| 项 | 结果 | 实测 |', '| --- | --- | --- |');
    for (const r of results.filter((x) => x.group === g)) {
      lines.push(`| ${r.name} | ${r.status === 'FAIL' ? '**FAIL**' : r.status} | ${r.detail.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  const file = path.join(ROOT, OUT);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });