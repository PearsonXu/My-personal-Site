import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store, sanitizeState } from '../assets/js/store.js';
import { MemoryStorage } from './helpers/fake-audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const read = (p) => fs.readFileSync(path.join(DIST, p), 'utf8');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function build(demo = false) {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), ...(demo ? ['--demo'] : [])], { cwd: ROOT, stdio: 'pipe' });
}

/* ── 根因 1：持久外壳的链接必须绝对化 ─────────────── */

test('回归 · 外壳链接绝对化函数存在且在 boot 里被调用', () => {
  const app = src('assets/js/app.js');
  assert.match(app, /function absolutizeChromeLinks\(\)/);
  assert.match(app, /absolutizeHeadAssets\(\);\s*\n\s*absolutizeChromeLinks\(\);/);
  assert.match(app, /if \(a\.closest\('#page-root'\)\) continue;/);
});

test('回归 · header 导航确实在 #page-root 之外（所以必须绝对化）', () => {
  build();
  const html = read('index.html');
  const end = html.indexOf('<!-- ▲ 路由只替换这一块 ▲ -->');
  const navAt = html.indexOf('<nav class="nav"');
  assert.ok(navAt > 0 && navAt < end, '导航应在 page-root 之外');
});

test('回归 · 路由失败也会摘掉 navigating 标记（try/finally）', () => {
  assert.match(src('assets/js/router.js'), /} finally \{[\s\S]*?delete document\.documentElement\.dataset\.navigating/);
});

test('回归 · 路由换进空内容会抛错回退，不留白屏', () => {
  assert.match(src('assets/js/router.js'), /目标页面内容为空/);
});

/* ── 根因 2：404 页零外部依赖 ─────────────────────── */

test('回归 · 404 页不引用任何外部 CSS / JS / 图片', () => {
  build();
  const html = read('404.html');
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(html), '仍引用外部样式表');
  assert.ok(!/<script[^>]+src=/.test(html), '仍引用外部脚本');
  assert.ok(!/<img\b/.test(html), '仍引用外部图片');
  assert.ok(!/assets\//.test(html), '仍引用 assets/');
  assert.match(html, /<style>[\s\S]+<\/style>/, '必须内联样式');
});

test('回归 · 404 页有可见提示与恢复入口，且能定位站点根', () => {
  build();
  const html = read('404.html');
  assert.match(html, /这一页不在小屋里/);
  assert.match(html, /id="goHome"/);
  assert.match(html, /id="goBack"/);
  assert.match(html, /id="badPath"/);
  assert.match(html, /localStorage\.getItem\('zx\.music\.base'\)/);
  assert.match(html, /history\.back\(\)/);
});

test('回归 · app 启动时写入运行时 base，供 404 页定位', () => {
  assert.match(src('assets/js/app.js'), /localStorage\.setItem\('zx\.music\.base', base\)/);
});
/* ── 持久化状态：逐字段校验，只修坏字段 ───────────── */

test('回归 · 坏字段逐个回退，有效收藏与最近播放全部保留', () => {
  const repaired = [];
  const out = sanitizeState({
    view: '不存在', stage: 42, mode: '乱写', volume: 'loud', position: -5, muted: 'yes',
    queue: { items: 'oops' },
    favorites: ['night-ferry', 123, null, 'paper-boat', 'night-ferry'],
    recent: [null, { slug: 'night-ferry', at: 7 }, 'bad', { slug: 42 }]
  }, repaired);
  assert.deepEqual(out.favorites, ['night-ferry', 'paper-boat'], '有效收藏必须保留且去重');
  assert.deepEqual(out.recent, [{ slug: 'night-ferry', at: 7 }]);
  assert.equal(out.view, 'list');
  assert.equal(out.stage, 'cover');
  assert.equal(out.mode, 'order');
  assert.equal(out.volume, 1);
  assert.equal(out.position, 0);
  assert.equal(out.muted, false);
  assert.equal(out.queue, null);
  for (const f of ['view', 'stage', 'mode', 'volume', 'position', 'muted', 'queue', 'favorites', 'recent']) {
    assert.ok(repaired.includes(f), `${f} 应被记录为已修复`);
  }
});

test('回归 · 完全合法的数据一个字段都不动', () => {
  const repaired = [];
  const out = sanitizeState({
    version: 1, position: 12.5, volume: 0.4, muted: true, mode: 'shuffle',
    view: 'vinyl', stage: 'lyrics', theme: 'forest', layout: 'mobile',
    viewLocked: true, stageLocked: true, audioSession: true,
    favorites: ['a', 'b'], recent: [{ slug: 'a', at: 1 }],
    queue: { items: [{ id: 'x', slug: 'a' }], cursor: 0, mode: 'shuffle', history: ['x'], bag: [] }
  }, repaired);
  assert.deepEqual(repaired, [], '合法数据不应被改动');
  assert.equal(out.position, 12.5);
  assert.equal(out.volume, 0.4);
  assert.equal(out.mode, 'shuffle');
  assert.equal(out.view, 'vinyl');
  assert.equal(out.stage, 'lyrics');
  assert.deepEqual(out.favorites, ['a', 'b']);
  assert.equal(out.queue.items.length, 1);
});

test('回归 · 队列里坏条目被剔除，好条目保留', () => {
  const repaired = [];
  const out = sanitizeState({ queue: { items: [{ slug: 'a' }, null, { slug: '../evil' }, { slug: 'b' }], cursor: 1 } }, repaired);
  assert.deepEqual(out.queue.items.map((i) => i.slug), ['a', 'b']);
  assert.ok(repaired.includes('queue.items'));
});

test('回归 · 整块 JSON 损坏时备份原文，不清空存储、仍可用', () => {
  const storage = new MemoryStorage();
  storage.setItem('zx.music.v1', '{坏掉的 JSON');
  const s = new Store(storage);
  assert.deepEqual(s.repaired, ['json']);
  assert.equal(storage.getItem('zx.music.v1.broken'), '{坏掉的 JSON', '原文必须留底');
  assert.equal(s.available, true, '不能因为一次坏数据就永久停掉持久化');
  s.toggleFavorite('a');
  assert.deepEqual(JSON.parse(storage.getItem('zx.music.v1')).favorites, ['a']);
});

test('回归 · 读取抛异常才降级为内存态', () => {
  const s = new Store({ getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('x'); } });
  assert.equal(s.available, false);
  assert.equal(s.getTheme(), 'cloud');
});

test('回归 · pushRecent 遇到历史坏条目不再抛异常', () => {
  const storage = new MemoryStorage();
  storage.setItem('zx.music.v1', JSON.stringify({ recent: [null, 'bad', { slug: 'a', at: 1 }] }));
  const s = new Store(storage);
  assert.doesNotThrow(() => s.pushRecent('b'));
  assert.deepEqual(s.data.recent.map((r) => r.slug), ['b', 'a']);
});

/* ── 错误边界 ─────────────────────────────────────── */

test('回归 · 有可见错误横幅与恢复入口，且用内联样式', () => {
  const common = src('assets/js/ui/common.js');
  assert.match(common, /export function showErrorBanner/);
  assert.match(common, /role', 'alert'/);
  assert.match(common, /data-err="reload"/);
  assert.match(common, /data-err="home"/);
  assert.match(common, /style\.cssText/, '必须内联样式：CSS 挂掉时也要看得见');
});

test('回归 · 点击 / 渲染 / 启动都有错误边界', () => {
  const app = src('assets/js/app.js');
  assert.match(app, /\.then\(\(\) => handleClick\(e, app\)\)[\s\S]*?\.catch/);
  assert.match(app, /function onPage\(route\) \{\s*\n\s*try \{/);
  assert.match(app, /window\.addEventListener\('error'/);
  assert.match(app, /window\.addEventListener\('unhandledrejection'/);
  assert.match(app, /boot\(\)\.catch[\s\S]*?showErrorBanner/);
});

test('回归 · 坏字段被修好时给用户温和提示，不清空数据', () => {
  const app = src('assets/js/app.js');
  assert.match(app, /store\.repaired\?\.length/);
  assert.match(app, /收藏和歌单都还在/);
});