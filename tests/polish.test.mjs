/**
 * tests/polish.test.mjs — 2026-11 审查后的修正与设计调整：
 * 误报错误、空栏目、原唱信息、列表文字、缩略图、歌词折叠、页脚 / 小标题去工程味、
 * sitemap、封面强调色与「黑白胶片」主题。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isBenignErrorMessage } from '../assets/js/core/util.js';
import { songKind, songStyle, songSubline } from '../assets/js/core/song-meta.js';
import { accentFromPixels, parseBmp, contrast } from '../tools/make-cover-assets.mjs';
import { loadContent } from '../tools/lib/content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const read = (p) => fs.readFileSync(path.join(DIST, p), 'utf8');
function build(demo) {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), ...(demo ? ['--demo'] : [])], { cwd: ROOT, stdio: 'pipe' });
  return JSON.parse(read('assets/data/build-manifest.json'));
}
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');

/* ── 纯逻辑 ─────────────────────────────────────────── */

test('错误兜底 · ResizeObserver 循环提示不算脚本错误，其余照常上报', () => {
  assert.equal(isBenignErrorMessage('ResizeObserver loop completed with undelivered notifications.'), true);
  assert.equal(isBenignErrorMessage('ResizeObserver loop limit exceeded'), true);
  assert.equal(isBenignErrorMessage('TypeError: x is undefined'), false);
  assert.equal(isBenignErrorMessage(''), false);
  assert.equal(isBenignErrorMessage(undefined), false);
});

test('歌曲文字 · 翻唱写原唱 + 风格；非翻唱写演唱者；类型/工程标签不当风格', () => {
  const cover = { artist: '金石竹青', originalArtist: '黄诗扶', tags: ['翻唱', '国风'] };
  assert.equal(songKind(cover), '翻唱');
  assert.equal(songStyle(cover), '国风');
  assert.equal(songSubline(cover), '原唱 黄诗扶 · 国风');
  assert.equal(songSubline({ artist: '金石竹青', originalArtist: '陶喆', tags: ['翻唱'] }), '原唱 陶喆');
  const own = { artist: '金石竹青', tags: ['demo', 'ambient'] };
  assert.equal(songKind(own), '单曲', '没有原唱时不擅自声称原创');
  assert.equal(songSubline(own), '金石竹青');
});

test('封面取色 · 黑白封面返回 null；彩色封面在纸色上对比度 ≥ 4.5', () => {
  const gray = Array.from({ length: 64 }, (_, i) => [i * 4, i * 4, i * 4]);
  assert.equal(accentFromPixels(gray), null);
  const blue = Array.from({ length: 64 }, (_, i) => (i % 2 ? [40, 90, 200] : [20, 20, 20]));
  const acc = accentFromPixels(blue);
  assert.match(acc, /^#[0-9a-f]{6}$/);
  const rgb = [1, 3, 5].map((i) => parseInt(acc.slice(i, i + 2), 16));
  assert.ok(contrast(rgb, [242, 240, 235]) >= 4.5, `${acc} 对比度不足`);
  assert.ok(rgb[2] > rgb[0], '色相应保持偏蓝');
  // 亮黄最难达标：必须被压暗到可读
  const yellow = accentFromPixels(Array.from({ length: 16 }, () => [250, 220, 40]));
  const y = [1, 3, 5].map((i) => parseInt(yellow.slice(i, i + 2), 16));
  assert.ok(contrast(y, [242, 240, 235]) >= 4.5, `${yellow} 对比度不足`);
});

test('封面取色 · BMP 解析支持自顶向下（sips 输出）与自底向上', () => {
  const mk = (h) => {
    const buf = Buffer.alloc(54 + 2 * 2 * 3 + 2 * 2); // 2x2，24 位，每行补齐到 8 字节
    buf.write('BM', 0, 'ascii');
    buf.writeUInt32LE(54, 10);
    buf.writeInt32LE(2, 18);
    buf.writeInt32LE(h, 22);
    buf.writeUInt16LE(24, 28);
    // 第一存储行：红、绿（BGR 顺序）
    buf.set([0, 0, 255, 0, 255, 0], 54);
    buf.set([255, 0, 0, 255, 255, 255], 62);
    return buf;
  };
  assert.deepEqual(parseBmp(mk(-2))[0], [255, 0, 0], '自顶向下：首个像素是第一存储行');
  assert.deepEqual(parseBmp(mk(2))[0], [0, 0, 255], '自底向上：首个像素是最后一个存储行');
});

/* ── 构建产物 ───────────────────────────────────────── */

test('生产构建 · 空栏目不进导航 / 页脚 / sitemap，页面本身仍可访问', () => {
  build(false);
  const model = loadContent(ROOT, { includeDemo: false });
  const html = read('index.html');
  const nav = html.slice(html.indexOf('<nav class="nav"'), html.indexOf('</nav>', html.indexOf('<nav class="nav"')));
  const foot = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
  const sitemap = read('sitemap.xml');
  for (const { kind, list } of [{ kind: 'albums', list: model.albums }, { kind: 'playlists', list: model.playlists }]) {
    assert.ok(fs.existsSync(path.join(DIST, kind, 'index.html')), `${kind} 页面仍应生成`);
    const shown = list.length > 0;
    assert.equal(nav.includes(`href="/${kind}/"`), shown, `导航里 ${kind} 的显隐应跟内容走`);
    assert.equal(foot.includes(`href="/${kind}/"`), shown, `页脚里 ${kind} 的显隐应跟内容走`);
    assert.equal(sitemap.includes(`/${kind}/</loc>`), shown, `sitemap 里 ${kind} 的显隐应跟内容走`);
  }
  assert.ok(!sitemap.includes('/status/'), 'sitemap 不收播放自检');
  assert.ok(!sitemap.includes('/me/'), 'sitemap 不收「我的」');
  assert.match(sitemap, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/, 'sitemap 应带 lastmod');
});

test('生产构建 · 页脚与小标题去工程味', () => {
  const manifest = build(false);
  for (const page of manifest.pages) {
    const text = visible(read(page.file));
    for (const w of ['§ 0', '播放自检</a>', 'GitHub Pages', '原生 audio', '无 Cookie', '♪ ∮', 'Recent', 'RECENT']) {
      assert.ok(!text.includes(w), `${page.file} 仍含「${w}」`);
    }
  }
  assert.ok(fs.existsSync(path.join(DIST, 'status/index.html')), '自检页仍保留，只是不放在页脚');
});

test('生产构建 · 歌曲页写明翻唱、原唱、作词作曲与制作工具', () => {
  build(false);
  const model = loadContent(ROOT, { includeDemo: false });
  const song = model.songs.find((s) => s.originalArtist);
  assert.ok(song, '曲库里应有翻唱');
  const html = read(`songs/${song.slug}/index.html`);
  assert.match(html, /<p class="eyebrow">翻唱 <\/p>/);
  assert.ok(html.includes(`<dt>原唱</dt><dd>${song.originalArtist}</dd>`), '缺原唱');
  if (song.lyricist) assert.ok(html.includes('<dt>作词</dt>'));
  if (song.tools.length) assert.ok(html.includes(`<dt>制作工具</dt><dd>${song.tools.join('、')}</dd>`), '缺制作工具');
  assert.ok(!html.includes('真实独立链接'));
});

test('生产构建 · 列表第二行是「原唱 · 风格」，不再每行写「单曲」；列表用缩略图', () => {
  build(false);
  const model = loadContent(ROOT, { includeDemo: false });
  const lib = read('songs/index.html');
  assert.ok(!/class="row__al[^"]*">单曲</.test(lib), '仍有「单曲」列');
  const song = model.songs.find((s) => s.originalArtist);
  assert.ok(lib.includes(`<span class="row__a">${songSubline(song)}</span>`));
  const catalog = JSON.parse(read('assets/data/catalog.json'));
  for (const s of catalog.songs) {
    assert.ok(s.thumb, `${s.slug} 缺 thumb 字段`);
    assert.ok(fs.existsSync(path.join(DIST, s.thumb)), `${s.thumb} 不存在`);
    assert.ok(s.accent === null || /^#[0-9a-f]{6}$/.test(s.accent), `${s.slug} accent 非法`);
  }
  const withThumb = catalog.songs.find((s) => s.thumb !== s.cover);
  if (withThumb) {
    assert.ok(lib.includes(`class="row__art" src="/${withThumb.thumb}"`), '列表行应使用缩略图');
    assert.ok(fs.statSync(path.join(DIST, withThumb.thumb)).size < fs.statSync(path.join(DIST, withThumb.cover)).size, '缩略图应比原图小');
  }
});

test('生产构建 · 长歌词折叠并带「展开全部歌词」，短歌词不折叠', () => {
  build(false);
  const model = loadContent(ROOT, { includeDemo: false });
  const long = model.songs.find((s) => s.lyricsLines.length > 12);
  assert.ok(long);
  const html = read(`songs/${long.slug}/index.html`);
  assert.match(html, /<div class="lrcwrap" data-folded="true">/);
  assert.match(html, /data-act="unfold-lyrics"/);
  assert.ok(html.includes(`data-lrc="${long.slug}"`), '歌词仍须可点击跳转');
});

test('生产构建 · 手记关联真实歌曲，封面用那首歌的封面；生产环境有真实歌单', () => {
  build(false);
  const model = loadContent(ROOT, { includeDemo: false });
  for (const n of model.notes) {
    assert.ok(n.songs.length, `${n.slug} 没有关联任何（生产环境存在的）歌曲`);
    const s = model.songs.find((x) => x.slug === n.songs[0]);
    if (!s.coverAuto) assert.equal(n.coverPath, s.coverPath, `${n.slug} 应使用关联歌曲的封面`);
  }
  assert.ok(model.playlists.length >= 1, '生产环境应有真实歌单');
  for (const p of model.playlists) assert.ok(p.tracks.length, `${p.slug} 歌单是空的`);
});

test('主题 · film 的强调色走封面变量并有墨色回退；首帧脚本认识 film', () => {
  const themes = fs.readFileSync(path.join(ROOT, 'assets/css/themes.css'), 'utf8');
  const start = themes.indexOf('html[data-theme="film"] {');
  const block = themes.slice(start, themes.indexOf('}', start));
  assert.match(block, /--acc:var\(--cover-acc,#[0-9a-f]{6}\);/);
  assert.match(block, /--acc-rgb:var\(--cover-rgb,\d+,\d+,\d+\);/);
  build(false);
  assert.match(read('index.html'), /var T=\["cloud","forest","midnight","film"\]/);
  assert.match(read('index.html'), /t="cloud"/, '首次访问仍默认 cloud');
});
