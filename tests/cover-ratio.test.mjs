import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const read = (p) => fs.readFileSync(path.join(DIST, p), 'utf8');

/** 取出某条选择器的声明块（源文件里都是单行规则） */
function rule(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^${esc} \\{([^}]*)\\}`, 'm').exec(css);
  assert.ok(m, `找不到规则 ${selector}`);
  return m[1];
}

/* ── 根因：.song__art img 没有宽高约束，HTML height="420" 在窄屏把封面拉成竖长方形 ── */

test('封面 · .song__art 容器有 1:1 基线（padding-top 兜底，不只依赖 aspect-ratio）', () => {
  const css = src('assets/css/site.css');
  const box = rule(css, '.song__art');
  assert.match(box, /position:relative/, '容器要作为图片绝对定位的包含块');
  assert.match(box, /width:100%/, '宽度随屏幕缩放');
  assert.match(box, /max-width:420px/, '有合理最大宽度');
  const before = rule(css, '.song__art::before');
  assert.match(before, /padding-top:100%/, '旧微信内核（不支持 aspect-ratio）靠 padding-top 撑出正方形');
  assert.match(css, /@supports \(aspect-ratio: 1 \/ 1\) \{[\s\S]*?\.song__art \{ aspect-ratio:1; \}[\s\S]*?\.song__art::before \{ content:none; \}/,
    '现代内核用 aspect-ratio 时必须移除 padding 伪元素，避免高度叠加');
});

test('封面 · 图片填满容器且 object-fit:cover，显式宽高压过 HTML 属性', () => {
  const css = src('assets/css/site.css');
  const img = rule(css, '.song__art img');
  assert.match(img, /position:absolute/);
  assert.match(img, /width:100%/);
  assert.match(img, /height:100%/, '不写 height:100% 时 HTML height="420" 会锁死高度');
  assert.match(img, /object-fit:cover/, '允许裁切但不允许变形');
});

test('封面 · 修复只作用于 .song__art，不碰横版分享图 / 其他图片', () => {
  const css = src('assets/css/site.css');
  // 全局 reset 与其他图片规则保持原样
  assert.match(css, /^img,svg,canvas \{ display:block; max-width:100%; \}$/m);
  assert.match(css, /^\.poster \{ width:100%; border-radius:var\(--r-sm\); border:1px solid var\(--line-2\); \}$/m);
  // aspect-ratio / object-fit 的新增只出现在 .song__art 作用域内
  const supports = /@supports \(aspect-ratio: 1 \/ 1\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(supports, '找不到 @supports 增强块');
  assert.ok(!/\.poster|\.note__art|og\//.test(supports[1]), '@supports 块不应波及分享图');
});

test('封面 · 手机 / 桌面布局的 max-width 覆盖仍然生效（作用域特异性更高）', () => {
  assert.match(src('assets/css/layout-tablet.css'), /\.song__art \{ max-width:320px; margin-inline:auto; \}/);
  assert.match(src('assets/css/layout-desktop.css'), /\.song__art \{ max-width:260px; \}/);
});

test('封面 · 构建产物：单曲与专辑页共用 .song__art，img 保留尺寸提示属性', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), '--demo'], { cwd: ROOT, stdio: 'pipe' });
  const catalog = JSON.parse(read('assets/data/catalog.json'));
  const song = catalog.songs[0];
  assert.ok(song, 'demo 构建应有歌曲');
  const html = read(`songs/${song.slug}/index.html`);
  const m = /<div class="song__art">\s*<img[^>]*>/.exec(html);
  assert.ok(m, '单曲页应有 .song__art 封面');
  assert.match(m[0], /width="420" height="420"/, '保留固有尺寸提示（加载前布局稳定的第二道保险）');
  const album = catalog.albums[0];
  if (album) {
    const aHtml = read(`albums/${album.slug}/index.html`);
    assert.match(aHtml, /<div class="song__art">/, '专辑页复用同一公共封面样式');
  }
  // dist 的 site.css 与源一致（构建只是拷贝）
  assert.equal(read('assets/css/site.css'), src('assets/css/site.css'));
});
