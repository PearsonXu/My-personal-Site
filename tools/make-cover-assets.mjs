#!/usr/bin/env node
/**
 * tools/make-cover-assets.mjs — 为站长自供封面生成「缩略图 + 封面强调色」。
 *
 *   node tools/make-cover-assets.mjs            # 补齐缺失的缩略图与 accent
 *   node tools/make-cover-assets.mjs --force    # 全部重算（会覆盖 song JSON 里手填的 accent）
 *
 * 产出（都进仓库，构建与 CI 不依赖本脚本）：
 *  - assets/img/thumbs/<封面名>.jpg：320px 长边 JPEG。列表 44px / 卡片 ~160px 在 2x 屏上都够用，
 *    首页不再为每一行下载 100KB+ 的原图。缺缩略图时构建自动回退原图，不会坏。
 *  - content/songs/*.json 的 "accent"：从封面取的强调色（"#rrggbb"），供「黑白胶片」主题让
 *    强调色跟随正在播放的封面。封面基本是黑白时写 null → 主题用默认墨色。可以手改，
 *    不带 --force 时不会覆盖已有值。
 *
 * 依赖 macOS 自带的 sips（零 npm 依赖）。非 macOS 环境直接跳过并提示。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(ROOT, 'assets/img');
const THUMBS = path.join(IMG, 'thumbs');
const THUMB_EDGE = 320;
/** 「黑白胶片」主题的纸色背景：强调色必须在它上面达到正文对比度 */
const PAPER = [242, 240, 235];

/* ── 纯函数：颜色 ─────────────────────────────────────── */

/** @param {number} r @param {number} g @param {number} b → [h(0-360), s, l] */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** @param {number} h @param {number} s @param {number} l → [r, g, b] 0-255 */
export function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

/** WCAG 相对亮度 */
export function luminance([r, g, b]) {
  const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/**
 * 从像素里取强调色。按「彩度」加权求色相的圆周平均：大片灰黑白不参与，只听有颜色的部分。
 * 整张图几乎没有颜色 → null（交给主题默认墨色），而不是硬造一个灰色强调色。
 * 结果压到适中饱和度，并逐步压暗直到在纸色背景上对比度 ≥ 4.5。
 * @param {number[][]} pixels  每项 [r, g, b]
 * @returns {string | null}
 */
export function accentFromPixels(pixels) {
  let sx = 0; let sy = 0; let wsum = 0; let ssum = 0;
  for (const [r, g, b] of pixels) {
    const [h, s, l] = rgbToHsl(r, g, b);
    const chroma = s * (1 - Math.abs(2 * l - 1));
    if (chroma < 0.06) continue;
    const rad = (h * Math.PI) / 180;
    sx += Math.cos(rad) * chroma;
    sy += Math.sin(rad) * chroma;
    wsum += chroma;
    ssum += s * chroma;
  }
  // 平均彩度太低：这张封面本质是黑白的
  if (!pixels.length || wsum / pixels.length < 0.035) return null;
  const hue = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
  const sat = Math.min(0.6, Math.max(0.32, ssum / wsum));
  let l = 0.42;
  let rgb = hslToRgb(hue, sat, l);
  while (contrast(rgb, PAPER) < 4.5 && l > 0.12) {
    l -= 0.02;
    rgb = hslToRgb(hue, sat, l);
  }
  return hex(rgb);
}

/** 解析 sips 输出的 24/32 位 BMP（自底向上或自顶向下都支持） */
export function parseBmp(buf) {
  if (buf.toString('ascii', 0, 2) !== 'BM') throw new Error('不是 BMP');
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawH = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  if (bpp !== 24 && bpp !== 32) throw new Error(`不支持 ${bpp} 位 BMP`);
  const height = Math.abs(rawH);
  const bytes = bpp / 8;
  const stride = Math.ceil((width * bytes) / 4) * 4;
  /** @type {Array<[number, number, number]>} */
  const pixels = [];
  for (let y = 0; y < height; y++) {
    const row = rawH < 0 ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const i = offset + row * stride + x * bytes;
      pixels.push([buf[i + 2], buf[i + 1], buf[i]]);
    }
  }
  return pixels;
}

/* ── 主流程 ───────────────────────────────────────────── */

function sips(args) {
  execFileSync('sips', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

export function thumbNameFor(coverRel) {
  return `${coverRel.replace(/\.[^.]+$/, '')}.jpg`;
}

function main() {
  const force = process.argv.includes('--force');
  if (process.platform !== 'darwin') {
    console.log('make-cover-assets: 需要 macOS 自带的 sips，当前平台跳过（缺缩略图时构建会回退原图）。');
    return;
  }
  fs.mkdirSync(THUMBS, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-assets-'));
  const covers = new Set();
  let thumbs = 0; let accents = 0;

  const songDir = path.join(ROOT, 'content/songs');
  for (const f of fs.readdirSync(songDir).filter((n) => n.endsWith('.json')).sort()) {
    const file = path.join(songDir, f);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rel = typeof data.cover === 'string' && data.cover !== 'auto' && !/^(https?:)?\/\//.test(data.cover) ? data.cover.replace(/^\/+/, '') : null;
    if (!rel) continue;
    const src = path.join(IMG, rel);
    if (!fs.existsSync(src)) { console.warn(`  ! ${f}: 封面不存在 assets/img/${rel}`); continue; }
    covers.add(rel);
    if (force || !('accent' in data)) {
      const bmp = path.join(tmp, 'sample.bmp');
      sips(['-z', '24', '24', '-s', 'format', 'bmp', src, '--out', bmp]);
      data.accent = accentFromPixels(parseBmp(fs.readFileSync(bmp)));
      fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
      accents++;
      console.log(`  accent ${data.slug}: ${data.accent ?? 'null（黑白封面，用主题默认墨色）'}`);
    }
  }
  // 歌单 / 专辑若用站长自供封面，也一并生成缩略图
  for (const dir of ['albums', 'playlists']) {
    const d = path.join(ROOT, 'content', dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((n) => n.endsWith('.json'))) {
      const c = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')).cover;
      if (typeof c === 'string' && c !== 'auto' && !/^(https?:)?\/\//.test(c) && fs.existsSync(path.join(IMG, c))) covers.add(c.replace(/^\/+/, ''));
    }
  }
  for (const rel of covers) {
    const out = path.join(THUMBS, thumbNameFor(rel));
    const src = path.join(IMG, rel);
    if (!force && fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    sips(['-Z', String(THUMB_EDGE), '-s', 'format', 'jpeg', '-s', 'formatOptions', '78', src, '--out', out]);
    thumbs++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ 缩略图 ${thumbs} 张 · 强调色 ${accents} 首`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
