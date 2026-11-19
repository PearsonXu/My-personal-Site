#!/usr/bin/env node
/**
 * tools/check-assets.mjs — 资源验收工具。
 *
 * 两种模式：
 *   --dist dist                 离线检查产物完整性（深链接文件、音频存在、元数据齐全）
 *   --base http://localhost:8000  在线检查真实 HTTP 行为（MIME / Range / 206 / CORS）
 *
 * 在线模式请配合 `npm run serve`（它真的实现了 206），
 * 或直接指向线上域名，验证对象存储的 CORS 与 Range 配置。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DIST = path.resolve(flag('dist', path.join(ROOT, 'dist')));
const BASE = flag('base', '');

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { failures++; console.log(`  ✗ ${msg}`); };
const warn = (msg) => console.log(`  ⚠ ${msg}`);

function checkDist() {
  console.log(`\n[离线] 检查产物 ${DIST}`);
  const manifestPath = path.join(DIST, 'assets/data/build-manifest.json');
  if (!fs.existsSync(manifestPath)) { bad('缺少 build-manifest.json，先跑 npm run build'); return; }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(path.join(DIST, 'assets/data/catalog.json'), 'utf8'));

  for (const page of manifest.pages) {
    if (!fs.existsSync(path.join(DIST, page.file))) bad(`深链接文件缺失：${page.file}`);
  }
  ok(`${manifest.pages.length} 个页面都有真实 index.html（刷新 / 分享直达不会 404）`);

  for (const song of catalog.songs) {
    const html = fs.readFileSync(path.join(DIST, `songs/${song.slug}/index.html`), 'utf8');
    if (!html.includes(`<link rel="canonical" href="${catalog.site.url}/songs/${song.slug}/"`)) bad(`${song.slug} 规范链接不正确`);
    if (!/property="og:image"/.test(html)) bad(`${song.slug} 缺少 og:image`);
    const audioPath = path.join(DIST, 'assets', song.audio);
    if (!/^https?:/.test(song.audio) && !fs.existsSync(audioPath)) bad(`${song.slug} 音频文件缺失：assets/${song.audio}`);
    if (!fs.existsSync(path.join(DIST, song.cover))) bad(`${song.slug} 封面缺失：${song.cover}`);
    if (song.lyrics && !fs.existsSync(path.join(DIST, song.lyrics))) bad(`${song.slug} 歌词缺失：${song.lyrics}`);
    if (!fs.existsSync(path.join(DIST, `assets/qr/song-${song.slug}.svg`))) bad(`${song.slug} 二维码缺失`);
  }
  ok(`${catalog.songs.length} 首歌的音频 / 封面 / 歌词 / 二维码 / 元数据齐全`);

  for (const f of ['.nojekyll', '404.html', 'robots.txt', 'sitemap.xml']) {
    if (!fs.existsSync(path.join(DIST, f))) bad(`缺少 ${f}`);
  }
  if (fs.existsSync(path.join(ROOT, 'CNAME')) && !fs.existsSync(path.join(DIST, 'CNAME'))) bad('CNAME 没有被复制进产物');
  ok('Pages 必需文件齐全');
  console.log(`  构建模式：${manifest.mode}${manifest.mode === 'demo' ? '（含合成测试音，不要上线）' : ''}`);
}

async function probe(url, label, { expectAudio }) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
    const type = res.headers.get('content-type') || '';
    const ranges = res.headers.get('accept-ranges') || '';
    const crange = res.headers.get('content-range') || '';
    const cors = res.headers.get('access-control-allow-origin');
    const bits = [`${res.status}`, type || '无 Content-Type'];
    if (expectAudio) {
      if (res.status !== 206) bad(`${label} 未返回 206（${res.status}）→ 拖动进度条可能失败`);
      else ok(`${label} 206 ${crange}`);
      if (!/^audio\//.test(type)) bad(`${label} Content-Type 不是 audio/*：${type}`);
      else ok(`${label} MIME ${type}`);
      if (!/bytes/.test(ranges)) warn(`${label} 没有 Accept-Ranges: bytes`);
    } else {
      if (res.status !== 200 && res.status !== 206) bad(`${label} HTTP ${res.status}`);
      else ok(`${label} ${bits.join(' · ')}`);
      if (!cors) warn(`${label} 没有 Access-Control-Allow-Origin（同源无所谓；跨域读取歌词 / 生成海报会失败）`);
      else ok(`${label} CORS ${cors}`);
    }
    await res.arrayBuffer().catch(() => {});
  } catch (err) {
    bad(`${label} 请求失败：${err.message}`);
  }
}

async function checkOnline() {
  const root = BASE.replace(/\/+$/, '');
  console.log(`\n[在线] 检查 ${root}`);
  const catalog = await (await fetch(`${root}/assets/data/catalog.json`)).json();
  for (const song of catalog.songs) {
    const abs = (p) => (/^https?:/.test(p) ? p : `${root}/${p}`);
    await probe(abs(`assets/${song.audio}`), `音频 ${song.slug}`, { expectAudio: true });
    if (song.lyrics) await probe(abs(song.lyrics), `歌词 ${song.slug}`, { expectAudio: false });
    await probe(abs(song.cover), `封面 ${song.slug}`, { expectAudio: false });
    const page = await fetch(`${root}/songs/${song.slug}/`);
    if (page.status !== 200) bad(`深链接 /songs/${song.slug}/ 返回 ${page.status}`);
    else ok(`深链接 /songs/${song.slug}/ 200`);
  }
  const nf = await fetch(`${root}/definitely-not-a-page/`);
  if (nf.status !== 404) warn(`不存在的路径返回 ${nf.status}（GitHub Pages 应为 404）`);
  else ok('不存在的路径正确返回 404');
}

const run = async () => {
  if (BASE) await checkOnline();
  else checkDist();
  console.log('');
  if (failures) { console.log(`✗ ${failures} 项未通过`); process.exit(1); }
  console.log('✓ 全部通过');
};
run();