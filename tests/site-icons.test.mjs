/**
 * tests/site-icons.test.mjs — 站点图标取证：尺寸 / 格式 / 缓存版本引用 / manifest 名称 / 不波及 OG。
 * （控件内联 SVG 的测试在 icons.test.mjs，两者不相干。）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ICONS = path.join(ROOT, 'assets/img/icons');

function ensureBuild() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), '--demo'], { cwd: ROOT, stdio: 'pipe' });
  }
}
const pngSize = (buf) => {
  assert.equal(buf.readUInt32BE(0), 0x89504e47, '必须是 PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
};

test('site-icons · 源图正方形，导出 PNG 尺寸如实（不拉伸不裁切）', () => {
  const src = pngSize(fs.readFileSync(path.join(ICONS, 'source-jinshizhuqing.png')));
  assert.equal(src[0], src[1], '源图必须正方形');
  /** @type {[string, number][]} */
  const targets = [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]];
  for (const [f, n] of targets) {
    assert.deepEqual(pngSize(fs.readFileSync(path.join(ICONS, f))), [n, n], f);
  }
});

test('site-icons · favicon.ico 含 16/32/48 三档', () => {
  const b = fs.readFileSync(path.join(ICONS, 'favicon.ico'));
  assert.equal(b.readUInt16LE(2), 1, 'ICO type');
  const sizes = [];
  for (let i = 0; i < b.readUInt16LE(4); i++) sizes.push(b.readUInt8(6 + i * 16) || 256);
  for (const n of [16, 32, 48]) assert.ok(sizes.includes(n), `缺 ${n}：${sizes}`);
});

test('site-icons · -v2 引用名与规范名逐字节一致', () => {
  for (const f of ['apple-touch-icon.png', 'favicon.ico', 'icon-192.png', 'icon-512.png']) {
    const ext = path.extname(f);
    const v = `${path.basename(f, ext)}-v2${ext}`;
    assert.deepEqual(fs.readFileSync(path.join(ICONS, v)), fs.readFileSync(path.join(ICONS, f)), v);
  }
});

test('site-icons · manifest 名称「音乐小屋」且图标路径真实存在', () => {
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.webmanifest'), 'utf8'));
  assert.equal(mf.name, '音乐小屋');
  assert.equal(mf.short_name, '音乐小屋');
  assert.ok(mf.icons.length >= 2);
  for (const ic of mf.icons) {
    assert.deepEqual(pngSize(fs.readFileSync(path.join(ROOT, 'assets', ic.src))), ic.sizes.split('x').map(Number), ic.src);
  }
});

test('site-icons · 旧 favicon.svg URL 仍是新图的 SVG 外壳', () => {
  const svg = fs.readFileSync(path.join(ROOT, 'assets/img/favicon.svg'), 'utf8');
  assert.match(svg, /^<svg /);
  assert.match(svg, /data:image\/png;base64,/);
});

test('site-icons · 首页与深页 head 引用版本化文件名且文件存在', () => {
  ensureBuild();
  for (const page of ['', 'songs/demo-night-ferry/']) {
    const html = fs.readFileSync(path.join(DIST, page, 'index.html'), 'utf8');
    assert.match(html, /rel="icon" href="[^"]*favicon-v2\.ico"/);
    assert.match(html, /rel="apple-touch-icon"[^>]*href="[^"]*apple-touch-icon-v2\.png"/);
    assert.match(html, /rel="manifest" href="[^"]*manifest\.webmanifest"/);
    assert.match(html, /name="apple-mobile-web-app-title" content="音乐小屋"/);
    assert.ok(!/rel="icon"[^>]*favicon\.svg/.test(html), 'head 不应再引用旧 favicon.svg');
    for (const m of html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)) {
      const rel = m[1].replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
      assert.ok(fs.existsSync(path.join(DIST, rel)), `引用不存在：${m[1]}`);
    }
  }
});

test('site-icons · og:image 与歌曲封面不被站点图标替换', () => {
  ensureBuild();
  const html = fs.readFileSync(path.join(DIST, 'songs/demo-night-ferry/index.html'), 'utf8');
  const og = /property="og:image" content="([^"]+)"/.exec(html)[1];
  assert.ok(!og.includes('img/icons/'), `og:image 被换成了站点图标：${og}`);
  assert.match(og, /\.(png|jpe?g|webp)$/);
});
