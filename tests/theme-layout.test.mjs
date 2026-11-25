import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, THEMES, LAYOUTS, normalizeTheme, normalizeLayout } from '../assets/js/store.js';
import { scopeCss, composeLayout } from '../tools/lib/css.mjs';
import { MemoryStorage } from './helpers/fake-audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readCss = (f) => fs.readFileSync(path.join(ROOT, 'assets/css', f), 'utf8');

test('theme · 三套外观与三档布局的取值集合', () => {
  assert.deepEqual(THEMES, ['cloud', 'forest', 'midnight', 'film']);
  assert.deepEqual(LAYOUTS, ['auto', 'desktop', 'mobile']);
});

test('theme · 归一化：旧值迁移、非法值回退 cloud', () => {
  assert.equal(normalizeTheme('light'), 'cloud');
  assert.equal(normalizeTheme('dark'), 'midnight');
  assert.equal(normalizeTheme('forest'), 'forest');
  assert.equal(normalizeTheme('紫'), 'cloud');
  assert.equal(normalizeTheme(null), 'cloud');
  assert.equal(normalizeTheme(undefined), 'cloud');
  assert.equal(normalizeLayout('mobile'), 'mobile');
  assert.equal(normalizeLayout('tablet'), 'auto');
  assert.equal(normalizeLayout(null), 'auto');
});

test('theme · 无记录 / 存储不可用一律回退 cloud + auto', () => {
  const fresh = new Store(new MemoryStorage());
  assert.equal(fresh.getTheme(), 'cloud');
  assert.equal(fresh.getLayout(), 'auto');
  const broken = new Store({ getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceeded'); } });
  assert.equal(broken.available, false);
  assert.equal(broken.getTheme(), 'cloud');
  assert.equal(broken.getLayout(), 'auto');
  assert.equal(broken.setTheme('forest'), 'forest', '内存态仍可用，只是不持久化');
});

test('theme · 主动选择被记住，布局与主题互相独立', () => {
  const storage = new MemoryStorage();
  const a = new Store(storage);
  a.setTheme('midnight');
  a.setLayout('desktop');
  const b = new Store(storage);
  assert.equal(b.getTheme(), 'midnight');
  assert.equal(b.getLayout(), 'desktop');
  b.setLayout('mobile');
  assert.equal(b.getTheme(), 'midnight', '改布局不应影响主题');
  b.setTheme('forest');
  assert.equal(b.getLayout(), 'mobile', '改主题不应影响布局');
});

test('theme · 损坏的存储值不会让站点崩，回退默认', () => {
  const storage = new MemoryStorage();
  storage.setItem('zx.music.theme', '{"bad":1}');
  storage.setItem('zx.music.layout', 'whatever');
  const s = new Store(storage);
  assert.equal(s.getTheme(), 'cloud');
  assert.equal(s.getLayout(), 'auto');
});

test('css · scopeCss 给每条规则加作用域，:root 正确合并', () => {
  const out = scopeCss(':root { --a:1; }\n.row, .card { color:red; }\nhtml[data-theme="x"] .y { color:blue; }', 'html[data-layout="mobile"]');
  assert.match(out, /html\[data-layout="mobile"\] \{ --a:1; \}/);
  assert.match(out, /html\[data-layout="mobile"\] \.row, html\[data-layout="mobile"\] \.card \{ color:red; \}/);
  assert.match(out, /html\[data-layout="mobile"\]\[data-theme="x"\] \.y/);
});

test('css · scopeCss 保留 @keyframes，嵌套 @media 递归加作用域', () => {
  const out = scopeCss('@keyframes spin { to { transform:rotate(360deg); } }\n@media (min-width:10px){ .a{color:red} }', 'html[data-layout="mobile"]');
  assert.match(out, /@keyframes spin\{ to \{ transform:rotate\(360deg\); \} \}/);
  assert.match(out, /@media \(min-width:10px\)\{html\[data-layout="mobile"\] \.a ?\{color:red\}\}/);
});
test('css · 合成的 layout.css 同时具备 auto 与手动手机两套作用域', () => {
  const composed = composeLayout({
    tablet: readCss('layout-tablet.css'),
    mobile: readCss('layout-mobile.css'),
    narrow: readCss('layout-narrow.css'),
    desktop: readCss('layout-desktop.css')
  });
  assert.match(composed, /@media \(max-width:760px\) \{\nhtml\[data-layout="auto"\]/);
  assert.match(composed, /html\[data-layout="mobile"\] \.pl__bar/);
  assert.match(composed, /html\[data-layout="mobile"\] \.nav__burger/);
  assert.match(composed, /@media \(max-width:900px\) \{\nhtml\[data-layout="desktop"\]/);
  const afterMedia = composed.split('@media (max-width:760px)')[1];
  const unconditional = afterMedia.slice(afterMedia.indexOf('\n}\n') + 3);
  assert.ok(unconditional.startsWith('html[data-layout="mobile"]'), '手动手机规则必须在 @media 之外');
});

test('css · 四套主题都定义了完整的核心令牌', () => {
  const themes = readCss('themes.css');
  const required = ['--bg', '--panel', '--text', '--dim', '--acc', '--acc-2', '--on-acc', '--line', '--head-bg', '--pl-bg', '--scrim', '--toast-bg', '--chip-bg', '--blur', '--art-radius', '--lyric-active', '--bad', '--warn', '--ok'];
  for (const name of ['cloud', 'forest', 'midnight', 'film']) {
    const start = themes.indexOf(`html[data-theme="${name}"]`);
    assert.ok(start >= 0, `themes.css 缺少 ${name}`);
    const block = themes.slice(start, themes.indexOf('}', start));
    for (const token of required) {
      assert.ok(block.includes(`${token}:`), `${name} 缺少令牌 ${token}`);
    }
  }
});

test('css · 四套主题在配色 / 字体 / 留白 / 封面形状上确有区别', () => {
  const themes = readCss('themes.css');
  const grab = (name, token) => {
    const start = themes.indexOf(`html[data-theme="${name}"]`);
    const block = themes.slice(start, themes.indexOf('}', start));
    const m = new RegExp(`${token}:([^;]+);`).exec(block);
    return m ? m[1].trim() : null;
  };
  assert.equal(new Set(['cloud', 'forest', 'midnight', 'film'].map((n) => grab(n, '--acc'))).size, 4, '强调色必须不同');
  assert.equal(new Set(['cloud', 'forest', 'midnight', 'film'].map((n) => grab(n, '--art-radius'))).size, 4, '封面形状必须不同');
  assert.equal(new Set(['cloud', 'forest', 'midnight', 'film'].map((n) => grab(n, '--sp7'))).size, 4, '留白节奏必须不同');
  assert.notEqual(grab('forest', '--font-d'), grab('cloud', '--font-d'), 'forest 应使用不同标题字体');
  assert.notEqual(grab('film', '--font-d'), grab('cloud', '--font-d'), 'film 应使用宋体标题');
});

test('css · 基础层不再残留硬编码深色表面', () => {
  for (const file of ['site.css', 'player.css']) {
    const css = readCss(file);
    assert.ok(!/background:rgba\(10,13,20/.test(css), `${file} 仍有硬编码深色 header`);
    assert.ok(!/background:rgba\(9,12,19/.test(css), `${file} 仍有硬编码深色播放器`);
    assert.ok(!/background:rgba\(4,6,11/.test(css), `${file} 仍有硬编码深色遮罩`);
    assert.ok(!/data-theme="light"\]/.test(css), `${file} 不应再有旧 light 专用覆盖`);
  }
});

test('css · midnight 在手机上关闭模糊与持续动画', () => {
  const themes = readCss('themes.css');
  assert.match(themes, /@media \(max-width:760px\) \{[\s\S]*?midnight[\s\S]*?--blur:0px/);
  assert.match(themes, /html\[data-layout="mobile"\]\[data-theme="midnight"\][\s\S]*?--blur:0px/);
});

test('css · 播放器容器不得成为 fixed 子元素的包含块', () => {
  const player = readCss('player.css');
  const plRule = /^\.pl \{([^}]*)\}/m.exec(player);
  assert.ok(plRule, '找不到 .pl 规则');
  assert.ok(!/backdrop-filter|filter:|transform:/.test(plRule[1]), '.pl 上的 filter/transform 会把全屏播放页压进横条里');
  const barRule = /^\.pl__bar \{([^}]*)\}/m.exec(player);
  assert.ok(barRule && /backdrop-filter/.test(barRule[1]), '毛玻璃应该在 .pl__bar 上');
});

test('css · 手机导航用 absolute，避开 header 的 backdrop-filter 包含块', () => {
  const mobile = readCss('layout-mobile.css');
  const navRule = /^\.nav \{([^}]*)\}/m.exec(mobile);
  assert.ok(navRule, '找不到手机 .nav 规则');
  assert.match(navRule[1], /position:absolute/);
  assert.ok(!/position:fixed/.test(navRule[1]));
});

test('shell · 首帧脚本默认 cloud，且完全不参考系统深色偏好', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'tools/lib/templates/shell.mjs'), 'utf8');
  const boot = /lines\.push\('(<script>\(function\(\)\{var T=[\s\S]*?)'\);/.exec(shell);
  assert.ok(boot, '找不到首帧外观脚本');
  const code = boot[1];
  assert.ok(!code.includes('prefers-color-scheme'), '首帧不得读取系统深色偏好');
  assert.ok(!code.includes('matchMedia'), '首帧不得读取系统深色偏好');
  assert.match(code, /t="cloud"/);
  assert.match(code, /l="auto"/);
  assert.match(code, /catch\(e\)\{\}/, '存储异常必须静默回退');
  assert.match(code, /setAttribute\("data-layout",l\)/);
});