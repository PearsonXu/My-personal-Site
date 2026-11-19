import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { icon, toggleIcons, ICON_NAMES, MODE_ICON, STAGE_ICON } from '../assets/js/core/icons.js';
import { MODES } from '../assets/js/core/queue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const read = (p) => fs.readFileSync(path.join(DIST, p), 'utf8');
const readSrc = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function buildDemo() {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), '--demo'], { cwd: ROOT, stdio: 'pipe' });
  return JSON.parse(read('assets/data/build-manifest.json'));
}

/** 从 path 的 d 与 rect 属性粗算包围盒（本套图标只有直线与矩形） */
function bbox(svg) {
  const xs = [];
  const ys = [];
  for (const m of svg.matchAll(/<rect[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/g)) {
    const [, x, y, w, h] = m.map(Number);
    xs.push(x, x + w);
    ys.push(y, y + h);
  }
  for (const m of svg.matchAll(/<path d="M([^"]+)"/g)) {
    const nums = m[1].match(/-?\d+(?:\.\d+)?/g).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
const cx = (b) => (b.x0 + b.x1) / 2;
const cy = (b) => (b.y0 + b.y1) / 2;

test('icons · 每个图标都是合法 24×24 内联 SVG，对辅助技术隐藏', () => {
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.match(svg, /^<svg /, `${name} 不是 svg`);
    assert.match(svg, /viewBox="0 0 24 24"/, `${name} 视图框不统一`);
    assert.match(svg, /aria-hidden="true"/, `${name} 缺 aria-hidden`);
    assert.match(svg, /focusable="false"/, `${name} 缺 focusable`);
    assert.match(svg, /width="24" height="24"/, `${name} 默认尺寸不是 24`);
    assert.ok(!/<image|<use|xlink:href/.test(svg), `${name} 引用了外部资源`);
  }
  assert.throws(() => icon('不存在的图标'), /未知图标/);
});

test('icons · 全部 currentColor，不硬编码颜色', () => {
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.match(svg, /currentColor/, `${name} 没用 currentColor`);
    assert.ok(!/#[0-9a-fA-F]{3,8}/.test(svg), `${name} 硬编码颜色`);
  }
});

test('icons · 走带四件同一高度、同一垂直重心', () => {
  for (const n of ['play', 'pause', 'prev', 'next']) {
    const b = bbox(icon(n));
    assert.ok(Math.abs((b.y1 - b.y0) - 11.2) < 0.01, `${n} 高度不统一：${b.y1 - b.y0}`);
    assert.ok(Math.abs(cy(b) - 12) < 0.01, `${n} 垂直重心不在 12：${cy(b)}`);
  }
});

test('icons · 播放三角光学居中，暂停/上下首几何居中', () => {
  assert.ok(cx(bbox(icon('play'))) > 12.5 && cx(bbox(icon('play'))) < 14, `播放光学偏移不合理：${cx(bbox(icon('play')))}`);
  for (const n of ['pause', 'prev', 'next']) {
    assert.ok(Math.abs(cx(bbox(icon(n))) - 12) < 0.05, `${n} 未几何居中：${cx(bbox(icon(n)))}`);
  }
});

test('icons · 暂停双竖条比例协调且对称', () => {
  const rects = [...icon('pause').matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
  assert.equal(rects.length, 2, '暂停不是两条竖条');
  assert.equal(rects[0][1], rects[1][1], '两条宽度不一致');
  assert.equal(rects[0][2], rects[1][2], '两条高度不一致');
  const ratio = rects[0][2] / rects[0][1];
  assert.ok(ratio > 2.5 && ratio < 4.5, `竖条比例失衡：${ratio}`);
});

test('icons · 上一首 / 下一首都是「三角 + 竖线」', () => {
  for (const n of ['prev', 'next']) {
    assert.match(icon(n), /<rect/, `${n} 缺竖线`);
    assert.match(icon(n), /<path d="M/, `${n} 缺三角`);
  }
});

test('icons · 播放/暂停双图标一起渲染', () => {
  const html = toggleIcons();
  assert.match(html, /pbtn__glyph--play/);
  assert.match(html, /pbtn__glyph--pause/);
  assert.equal((html.match(/<svg /g) || []).length, 2);
});

test('icons · 模式与舞台映射完整', () => {
  for (const m of MODES) assert.ok(ICON_NAMES.includes(MODE_ICON[m]), `模式 ${m} 无图标`);
  for (const s of ['cover', 'vinyl', 'lyrics']) assert.ok(ICON_NAMES.includes(STAGE_ICON[s]), `舞台 ${s} 无图标`);
});
test('icons · 尺寸令牌：桌面主按钮 48、手机 56、次控件点击区 44', () => {
  const site = readSrc('assets/css/site.css');
  const mobile = readSrc('assets/css/layout-mobile.css');
  const player = readSrc('assets/css/player.css');
  assert.match(site, /--play-size:48px/);
  assert.match(site, /--pbtn-size:44px/);
  assert.match(mobile, /--play-size:56px/);
  assert.match(player, /\.pbtn \{[\s\S]*?width:var\(--pbtn-size\); height:var\(--pbtn-size\)/);
  assert.match(player, /\.pbtn--play \{[\s\S]*?width:var\(--play-size\); height:var\(--play-size\)/);
});

test('icons · 主按钮颜色走主题变量，三套主题都有定义', () => {
  const rule = /\.pbtn--play \{([^}]*)\}/.exec(readSrc('assets/css/player.css'))[1];
  assert.match(rule, /background:var\(--acc\)/);
  assert.match(rule, /color:var\(--on-acc\)/);
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(rule), '主按钮硬编码颜色');
  const themes = readSrc('assets/css/themes.css');
  for (const t of ['cloud', 'forest', 'midnight']) {
    const start = themes.indexOf(`html[data-theme="${t}"]`);
    const block = themes.slice(start, themes.indexOf('}', start));
    assert.match(block, /--acc:/, `${t} 缺 --acc`);
    assert.match(block, /--on-acc:/, `${t} 缺 --on-acc`);
  }
});

test('icons · 交互态齐全：hover / active / focus-visible / disabled', () => {
  const player = readSrc('assets/css/player.css');
  for (const sel of ['.pbtn:hover:not(:disabled)', '.pbtn:active:not(:disabled)', '.pbtn:focus-visible', '.pbtn:disabled',
    '.pbtn--play:hover:not(:disabled)', '.pbtn--play:active:not(:disabled)', '.pbtn--play:disabled']) {
    assert.ok(player.includes(sel), `缺少交互态 ${sel}`);
  }
});

test('icons · 产物不再出现 Emoji / Unicode 控件字符', () => {
  const manifest = buildDemo();
  const banned = ['▶', '⏸', '⏮', '⏭', '🔊', '🔉', '🔇', '♡', '♥', '⤢', '⌄', '◐', '⌕', '↻', 'ↂ', '⤨', '⤒', '＋', '✕', '⧉', '⤓', '⇄', '◉', '◍', '詞', '☰', '⌂', '♫', '✎', '☺', '≡'];
  for (const page of manifest.pages) {
    const html = read(page.file);
    for (const g of banned) assert.ok(!html.includes(g), `${page.file} 仍含字符「${g}」`);
  }
});

test('icons · 每个控件按钮内联 SVG 且保留 aria-label', () => {
  buildDemo();
  const html = read('index.html');
  const buttons = [...html.matchAll(/<button[^>]*class="[^"]*(?:pbtn|iact|icon-btn|row__play|card__play)[^"]*"[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
  assert.ok(buttons.length > 8, `控件按钮太少：${buttons.length}`);
  for (const b of buttons) {
    assert.match(b, /<svg class="icon/, `控件无内联 SVG：${b.slice(0, 90)}`);
    assert.match(b, /aria-label="[^"]+"/, `控件缺 aria-label：${b.slice(0, 90)}`);
  }
});

test('icons · 主按钮同时含播放与暂停图形', () => {
  buildDemo();
  for (const page of ['index.html', 'songs/index.html', 'songs/demo-night-ferry/index.html']) {
    const html = read(page);
    for (const id of ['plToggle', 'plToggleFull']) {
      const btn = new RegExp(`<button[^>]*id="${id}"[^>]*>([\\s\\S]*?)</button>`).exec(html);
      assert.ok(btn, `${page} 缺 #${id}`);
      assert.match(btn[1], /pbtn__glyph--play/);
      assert.match(btn[1], /pbtn__glyph--pause/);
    }
  }
});

test('icons · 首页 / 曲库 / 单曲页 / 迷你条 / 展开页播放图形同源', () => {
  buildDemo();
  const playPath = /<path d="M8\.8 6\.4 17\.8 12 8\.8 17\.6Z"\/>/;
  for (const [name, file] of [['首页', 'index.html'], ['曲库', 'songs/index.html'], ['单曲页', 'songs/demo-night-ferry/index.html']]) {
    assert.match(read(file), playPath, `${name} 播放图形不是统一路径`);
  }
  assert.equal((read('index.html').match(/pbtn__glyph--play/g) || []).length, 2, '迷你条与展开页应各有一个主按钮');
});