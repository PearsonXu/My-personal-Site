/**
 * tools/lib/art.mjs — 确定性程序化封面。
 * 没有真实封面图时（cover: "auto"），按 slug 生成一张可复现的抽象封面，
 * 而不是留白或引用陌生图片。真实歌曲请放自己的封面文件。
 */

import { encodePng } from './png.mjs';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0; let g = 0; let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * 生成方形封面。
 * @param {string} seed 通常用 slug
 * @param {number} size 边长像素
 */
export function coverPixels(seed, size = 600) {
  const h0 = hash(String(seed));
  const rand = mulberry32(h0);
  const hueA = 185 + Math.floor(rand() * 40);   // 冷青
  const hueB = 20 + Math.floor(rand() * 30);    // 暖琥珀
  const waves = Array.from({ length: 3 }, () => ({
    amp: 0.10 + rand() * 0.16,
    freq: 1.4 + rand() * 3.2,
    phase: rand() * Math.PI * 2,
    hue: rand() > 0.5 ? hueA : hueB,
    width: 0.006 + rand() * 0.008
  }));
  const cx = 0.5 + (rand() - 0.5) * 0.18;
  const cy = 0.46 + (rand() - 0.5) * 0.14;
  const px = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // 底色：深蓝黑渐变
      let r = 8 + 14 * (1 - v);
      let g = 12 + 18 * (1 - v);
      let b = 20 + 26 * (1 - v);

      // 两团柔光
      const d1 = Math.hypot(u - 0.78, v - 0.16);
      const g1 = Math.max(0, 1 - d1 / 0.85) ** 2;
      const [ar, ag, ab] = hsl2rgb(hueA, 0.85, 0.6);
      r += ar * g1 * 0.30; g += ag * g1 * 0.30; b += ab * g1 * 0.30;

      const d2 = Math.hypot(u - 0.16, v - 0.92);
      const g2 = Math.max(0, 1 - d2 / 0.8) ** 2;
      const [br, bg, bb] = hsl2rgb(hueB, 0.85, 0.62);
      r += br * g2 * 0.22; g += bg * g2 * 0.22; b += bb * g2 * 0.22;

      // 细网格
      const grid = (x % Math.round(size / 12) === 0 || y % Math.round(size / 12) === 0) ? 10 : 0;
      r += grid; g += grid + 3; b += grid + 6;

      // 唱片同心圆
      const dc = Math.hypot(u - cx, (v - cy) * 1.0);
      const ring = Math.abs(Math.sin(dc * 46));
      if (dc < 0.42) {
        const ringGlow = (1 - ring) ** 8 * (1 - dc / 0.42);
        r += ar * ringGlow * 0.22; g += ag * ringGlow * 0.22; b += ab * ringGlow * 0.22;
      }
      if (dc < 0.055) { r += br * 0.5; g += bg * 0.5; b += bb * 0.5; }

      // 三条波形
      for (const w of waves) {
        const target = 0.5 + w.amp * Math.sin(u * Math.PI * 2 * w.freq + w.phase)
          + w.amp * 0.35 * Math.sin(u * Math.PI * 2 * w.freq * 2.3 + w.phase * 1.7);
        const dist = Math.abs(v - target);
        const intensity = Math.max(0, 1 - dist / w.width) ** 1.6;
        if (intensity > 0) {
          const [wr, wg, wb] = hsl2rgb(w.hue, 0.9, 0.66);
          r += wr * intensity * 0.85; g += wg * intensity * 0.85; b += wb * intensity * 0.85;
        }
      }

      // 边缘压暗
      const vig = 1 - 0.35 * Math.hypot(u - 0.5, v - 0.5) / 0.72;
      const i = (y * size + x) * 4;
      px[i] = Math.max(0, Math.min(255, r * vig));
      px[i + 1] = Math.max(0, Math.min(255, g * vig));
      px[i + 2] = Math.max(0, Math.min(255, b * vig));
      px[i + 3] = 255;
    }
  }
  return px;
}

export function coverPng(seed, size = 600) {
  return encodePng(size, size, coverPixels(seed, size));
}

/** OG / 微信卡片图：1200×630，左侧放方形封面，右侧延续色场 */
export function ogPng(seed, width = 1200, height = 630) {
  const square = coverPixels(seed, height);
  const px = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (x < height) {
        const j = (y * height + x) * 4;
        px[i] = square[j]; px[i + 1] = square[j + 1]; px[i + 2] = square[j + 2]; px[i + 3] = 255;
      } else {
        const t = (x - height) / (width - height);
        const j = (y * height + (height - 1)) * 4;
        const fade = 1 - t * 0.85;
        px[i] = Math.round(square[j] * fade + 10 * (1 - fade));
        px[i + 1] = Math.round(square[j + 1] * fade + 13 * (1 - fade));
        px[i + 2] = Math.round(square[j + 2] * fade + 20 * (1 - fade));
        px[i + 3] = 255;
      }
    }
  }
  return encodePng(width, height, px);
}