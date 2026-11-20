#!/usr/bin/env node
/**
 * tools/make-icons.mjs — 从站长原图生成全站图标（零运行时依赖，只用 macOS 自带 sips）。
 *
 * 源图：assets/img/icons/source-jinshizhuqing.png（红底白字「金石竹青」，正方形原样保留）。
 * 产出（assets/img/icons/）：
 *   apple-touch-icon.png 180×180 · icon-192.png · icon-512.png · favicon.ico(16/32/48)
 *   以及同名 -v2 缓存版本副本 —— head / manifest 引用的是 -v2 文件名：
 *   旧 favicon.svg 在同 URL 上有浏览器缓存，换图必须换文件名（见 docs/CONTENT.md「站点图标」）。
 * 另产出：assets/manifest.webmanifest（主屏幕名称「音乐小屋」）与
 *   assets/img/favicon.svg（内嵌新图的 SVG 外壳，旧 URL 继续可用且内容型不变）。
 *
 * 约束：等比缩放不拉伸不裁切；背景本就铺满，不预加圆角（圆角交给 iOS/Android 自己掩膜）。
 * 用法：node tools/make-icons.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'assets/img/icons');
const SRC = path.join(ICONS, 'source-jinshizhuqing.png');
const VERSION = 'v2';
const RED = '#cd0201'; // 源图左上角实测主色

/** 读 PNG IHDR 拿真实像素尺寸（不依赖任何图像库） */
function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function resample(n, out) {
  execFileSync('sips', ['--resampleWidth', String(n), SRC, '--out', out], { stdio: 'pipe' });
  const got = pngSize(fs.readFileSync(out));
  if (got.w !== n || got.h !== n) throw new Error(`${out} 尺寸 ${got.w}×${got.h}，期望 ${n}×${n}`);
  return got;
}
/** ICO 容器：PNG 嵌入条目（现代浏览器 / Windows Vista+ 均支持） */
function buildIco(entries) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o);
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(e.buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += e.buf.length;
  });
  return Buffer.concat([head, dir, ...entries.map((e) => e.buf)]);
}

const srcSize = pngSize(fs.readFileSync(SRC));
if (srcSize.w !== srcSize.h) throw new Error(`源图不是正方形：${srcSize.w}×${srcSize.h}，拒绝拉伸`);
console.log(`源图 ${srcSize.w}×${srcSize.h} PNG · 主色 ${RED}`);

/** @type {[string, number][]} */
const pngs = [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]];
for (const [name, n] of pngs) {
  resample(n, path.join(ICONS, name));
  console.log(`  ✓ ${name} ${n}×${n}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zx-icons-'));
const icoEntries = [16, 32, 48].map((n) => {
  const f = path.join(tmp, `i${n}.png`);
  resample(n, f);
  return { size: n, buf: fs.readFileSync(f) };
});
fs.writeFileSync(path.join(ICONS, 'favicon.ico'), buildIco(icoEntries));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('  ✓ favicon.ico 16/32/48');

// 缓存版本副本：head / manifest 只引用 -v2；规范名保留作素材与直接取用
for (const f of ['apple-touch-icon.png', 'favicon.ico', 'icon-192.png', 'icon-512.png']) {
  const ext = path.extname(f);
  const versioned = `${path.basename(f, ext)}-${VERSION}${ext}`;
  fs.copyFileSync(path.join(ICONS, f), path.join(ICONS, versioned));
  console.log(`  ✓ ${versioned}（引用名，与规范名逐字节一致）`);
}

// 旧 favicon.svg URL 继续可用：换成内嵌新图的 SVG 外壳（content-type 不变）。
// 内嵌 192 档足够任何 favicon 尺寸使用，避免 512 档 base64 让旧 URL 背负数百 KB。
const b64 = fs.readFileSync(path.join(ICONS, 'icon-192.png')).toString('base64');
fs.writeFileSync(path.join(ROOT, 'assets/img/favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 192 192" width="192" height="192"><image width="192" height="192" href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/></svg>\n`);
console.log('  ✓ assets/img/favicon.svg（内嵌新图的外壳，旧 URL 不失效）');

// Web App Manifest：图标 src 相对 manifest 自身 URL（/assets/…），子路径部署天然正确
const manifest = {
  name: '音乐小屋',
  short_name: '音乐小屋',
  lang: 'zh-CN',
  start_url: '../',
  scope: '../',
  display: 'browser', // 不改变现有窗口打开方式；iOS 主屏幕名称另由 apple-mobile-web-app-title 提供
  theme_color: RED,
  background_color: RED,
  icons: [
    { src: `img/icons/icon-192-${VERSION}.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `img/icons/icon-512-${VERSION}.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }
  ]
};
fs.writeFileSync(path.join(ROOT, 'assets/manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('  ✓ assets/manifest.webmanifest（name/short_name=音乐小屋）');

// 自检：manifest 图标相对路径真实存在
for (const ic of manifest.icons) {
  const p = path.join(ROOT, 'assets', ic.src);
  const got = pngSize(fs.readFileSync(p));
  if (`${got.w}x${got.h}` !== ic.sizes) throw new Error(`manifest 图标尺寸不符：${ic.src}`);
}
console.log('\n✓ 图标生成完毕。head / manifest 引用 -v2 文件名；改图后请 bump VERSION 重跑。');
