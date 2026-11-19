#!/usr/bin/env node
/**
 * tools/build-site.mjs — 静态站点生成器（零运行时依赖）。
 *
 * 产出 dist/：一份可以直接扔给 GitHub Pages 的纯静态文件。
 * 每个歌曲 / 专辑 / 歌单 / 手记都是真实目录 + index.html，
 * 因此深链接、刷新、微信分享直达都不会 404。
 *
 * 用法：
 *   node tools/build-site.mjs            生产构建（排除 demo 内容）
 *   node tools/build-site.mjs --demo     含合成测试音，用于本地验证
 *   node tools/build-site.mjs --demo --serve
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import QRCode from 'qrcode';

import { loadContent, publicCatalog } from './lib/content.mjs';
import { coverPng, ogPng } from './lib/art.mjs';
import { composeLayout } from './lib/css.mjs';
import { buildSearchIndex } from '../assets/js/core/search.js';
import { normalizeBase, routeFor, canonicalUrl } from '../assets/js/core/paths.js';
import { renderDocument } from './lib/templates/shell.mjs';
import { renderHome } from './lib/templates/pages/home.mjs';
import { renderLibrary } from './lib/templates/pages/library.mjs';
import { renderSong } from './lib/templates/pages/song.mjs';
import { renderAlbums, renderPlaylists, renderCollection } from './lib/templates/pages/collection.mjs';
import { renderNotes, renderNote } from './lib/templates/pages/notes.mjs';
import { renderAbout, renderMe, renderStatus, renderNotFound, renderStandaloneNotFound } from './lib/templates/pages/misc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const INCLUDE_DEMO = args.includes('--demo');
const SERVE = args.includes('--serve');
const OUT = path.join(ROOT, 'dist');

/**
 * 部署 base path。默认 "/"（自定义域名根目录）。
 * 部署到子目录时：node tools/build-site.mjs --base /My-personal-Site/
 * 所有站内链接与资源都用它拼成绝对路径，不再依赖页面深度。
 */
const baseArgIdx = args.indexOf('--base');
const BASE_PATH = normalizeBase(
  (baseArgIdx >= 0 && args[baseArgIdx + 1]) || process.env.BASE_PATH || '/'
);

function log(...a) { console.log(...a); }
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) n += copyDir(s, d);
    else { fs.copyFileSync(s, d); n++; }
  }
  return n;
}
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

async function main() {
  const t0 = Date.now();

  // DEMO 音源是可再生的构建输入，不进仓库；缺失时现场合成
  if (INCLUDE_DEMO && !fs.existsSync(path.join(ROOT, 'assets/audio/_demo/demo-night-ferry.mp3'))) {
    log('· 未发现 DEMO 音源，正在合成（合成测试音，非站长作品）…');
    execFileSync(process.execPath, [path.join(ROOT, 'tools/make-demo-audio.mjs')], { cwd: ROOT, stdio: 'inherit' });
  }

  const model = loadContent(ROOT, { includeDemo: INCLUDE_DEMO });
  const { site, songs, albums, playlists, notes } = model;
  for (const w of model.warnings) log(`  ⚠ ${w}`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  /* 1. 静态资源 */
  let copied = 0;
  for (const dir of ['js', 'css', 'audio', 'img']) copied += copyDir(path.join(ROOT, 'assets', dir), path.join(OUT, 'assets', dir));

  /* 1b. 合成可切换布局 CSS：同一份源规则产出 auto / 手动手机 / 手动桌面三种作用域 */
  const cssDir = path.join(ROOT, 'assets/css');
  const readCss = (name) => fs.readFileSync(path.join(cssDir, name), 'utf8');
  const layoutCss = composeLayout({
    tablet: readCss('layout-tablet.css'),
    mobile: readCss('layout-mobile.css'),
    narrow: readCss('layout-narrow.css'),
    desktop: readCss('layout-desktop.css')
  });
  // 源文件不进产物，避免有人误引用未加作用域的原始规则
  for (const f of fs.readdirSync(path.join(OUT, 'assets/css'))) {
    if (/^layout-(tablet|mobile|narrow|desktop)\.css$/.test(f)) fs.rmSync(path.join(OUT, 'assets/css', f));
  }
  write(path.join(OUT, 'assets/css/layout.css'), layoutCss);

  /* 2. 歌词原文（供播放器 fetch；同源，无 CORS 问题） */
  for (const song of songs) {
    if (!song.lyricsPath) continue;
    const src = path.join(ROOT, 'content/lyrics', `${song.slug}.lrc`);
    if (fs.existsSync(src)) { write(path.join(OUT, song.lyricsPath), fs.readFileSync(src)); copied++; }
  }

  /* 3. 程序化封面 + OG 图（PNG，微信/OG 需要位图） */
  const artTargets = [
    ...songs.map((s) => ({ seed: s.slug, cover: s.coverPath, og: s.ogPath, auto: s.coverAuto })),
    ...albums.map((a) => ({ seed: `album-${a.slug}`, cover: a.coverPath, og: a.ogPath, auto: a.coverAuto })),
    ...playlists.map((p) => ({ seed: `playlist-${p.slug}`, cover: p.coverPath, og: p.ogPath, auto: p.coverAuto })),
    ...notes.map((n) => ({ seed: `note-${n.slug}`, cover: n.coverPath, og: n.ogPath, auto: n.coverAuto }))
  ];
  let artCount = 0;
  for (const t of artTargets) {
    if (!t.auto) continue;
    write(path.join(OUT, t.cover), coverPng(t.seed, 600));
    write(path.join(OUT, t.og), ogPng(t.seed, 1200, 630));
    artCount += 2;
  }
  write(path.join(OUT, 'assets/img/covers/default.png'), coverPng('jinshizhuqing-music-house', 600));
  write(path.join(OUT, 'assets/img/og/default.png'), ogPng('jinshizhuqing-music-house', 1200, 630));
  artCount += 2;

  /* 4. 数据文件 */
  const catalog = publicCatalog(model);
  write(path.join(OUT, 'assets/data/catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  const searchIndex = buildSearchIndex(songs);
  write(path.join(OUT, 'assets/data/search.json'), `${JSON.stringify({ version: 1, entries: searchIndex }, null, 2)}\n`);

  /* 5. 二维码（构建期生成 SVG，内联进页面：无 CDN、无 CORS、离线可用） */
  const qrFor = async (kind, slug) => {
    if (!site.share?.qr) return '';
    const url = canonicalUrl(site.url, kind, slug);
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 168, errorCorrectionLevel: 'M', color: { dark: '#0a0d14', light: '#ffffff' } });
    // 同时落一份独立 SVG：分享弹层与歌词海报按需加载，不必把整库二维码塞进首屏
    write(path.join(OUT, `assets/qr/${kind}${slug ? `-${slug}` : ''}.svg`), svg);
    return svg;
  };
  /* 6. 页面 */
  const pages = [];
  const addPage = (route, rendered, extra = {}) => {
    // ★ 统一 base：所有站内链接与资源都生成 **绝对路径**（BASE_PATH + 路径）。
    //   以前按页面深度生成 ./ ../ ../../，只要页面被服务在别的深度（404 页就是任意深度），
    //   相对路径就会逐跳累积成 /songs/x/songs/songs/about/me/… 这种坏地址。
    const html = renderDocument({
      site, base: BASE_PATH, kind: rendered.kind, slug: rendered.slug,
      meta: rendered.meta, body: rendered.body, pageClass: rendered.pageClass || '', ...extra
    });
    const file = route ? path.join(OUT, route, 'index.html') : path.join(OUT, 'index.html');
    write(file, html);
    pages.push({ route: route || '', kind: rendered.kind, slug: rendered.slug, file: path.relative(OUT, file), bytes: Buffer.byteLength(html) });
  };

  addPage('', renderHome(model, { base: BASE_PATH }));
  addPage(routeFor('library'), renderLibrary(model, { base: BASE_PATH }));
  addPage(routeFor('albums'), renderAlbums(model, { base: BASE_PATH }));
  addPage(routeFor('playlists'), renderPlaylists(model, { base: BASE_PATH }));
  addPage(routeFor('notes'), renderNotes(model, { base: BASE_PATH }));
  addPage(routeFor('about'), renderAbout(model, { base: BASE_PATH }));
  addPage(routeFor('me'), renderMe(model, { base: BASE_PATH }));
  addPage(routeFor('status'), renderStatus(model, { base: BASE_PATH }));

  for (const song of songs) {
    addPage(routeFor('song', song.slug), renderSong(model, { base: BASE_PATH, song, qrSvg: await qrFor('song', song.slug) }));
  }
  for (const album of albums) {
    addPage(routeFor('album', album.slug), renderCollection(model, { base: BASE_PATH, item: album, kind: 'albums', qrSvg: await qrFor('album', album.slug) }));
  }
  for (const playlist of playlists) {
    addPage(routeFor('playlist', playlist.slug), renderCollection(model, { base: BASE_PATH, item: playlist, kind: 'playlists', qrSvg: await qrFor('playlist', playlist.slug) }));
  }
  for (const note of notes) {
    addPage(routeFor('note', note.slug), renderNote(model, { base: BASE_PATH, note, qrSvg: await qrFor('note', note.slug) }));
  }

  // 404：GitHub Pages 会把 404.html 挂在任意深度的未匹配 URL 上，
  // 所以它必须零外部依赖、内联样式，否则 CSS/JS 会按错误深度解析而全部 404 → 白屏。
  write(path.join(OUT, '404.html'), renderStandaloneNotFound(site, BASE_PATH));
  /* 7. GitHub Pages 必需 / 有益文件 */
  const cname = path.join(ROOT, 'CNAME');
  if (fs.existsSync(cname)) fs.copyFileSync(cname, path.join(OUT, 'CNAME'));
  write(path.join(OUT, '.nojekyll'), '');
  write(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url.replace(/\/+$/, '')}/sitemap.xml\n`);
  const urls = pages.map((p) => `  <url><loc>${site.url.replace(/\/+$/, '')}/${p.route}</loc></url>`).join('\n');
  write(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

  /* 9. 构建清单：验收脚本据此逐条检查 */
  const manifest = {
    builtAt: new Date().toISOString(),
    mode: INCLUDE_DEMO ? 'demo' : 'production',
    siteUrl: site.url,
    counts: { songs: songs.length, albums: albums.length, playlists: playlists.length, notes: notes.length, pages: pages.length, copied, art: artCount },
    pages,
    warnings: model.warnings
  };
  write(path.join(OUT, 'assets/data/build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  log('');
  log(`✓ 构建完成（${INCLUDE_DEMO ? 'DEMO 模式：含合成测试音' : '生产模式：不含 DEMO'}）`);
  log(`  歌曲 ${songs.length} · 专辑 ${albums.length} · 歌单 ${playlists.length} · 手记 ${notes.length}`);
  log(`  页面 ${pages.length} · 复制资源 ${copied} · 生成图片 ${artCount}`);
  log(`  输出 ${path.relative(ROOT, OUT)}/  用时 ${Date.now() - t0}ms`);
  if (!INCLUDE_DEMO && songs.length === 0) {
    log('  ⚠ 曲库为空：这是预期的空状态。添加真实歌曲见 docs/CONTENT.md');
  }

  if (SERVE) {
    const { startServer } = await import('./serve.mjs');
    startServer(OUT, Number(process.env.PORT || 8000));
  }
}

main().catch((err) => {
  console.error(`\n✗ 构建失败：${err.message}`);
  process.exit(1);
});