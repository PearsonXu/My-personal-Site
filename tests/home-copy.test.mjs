import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../tools/lib/content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const read = (p) => fs.readFileSync(path.join(DIST, p), 'utf8');
const CSS = () => fs.readFileSync(path.join(ROOT, 'assets/css/site.css'), 'utf8');

function build(demo) {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), ...(demo ? ['--demo'] : [])], { cwd: ROOT, stdio: 'pipe' });
  return JSON.parse(read('assets/data/build-manifest.json'));
}
const heroOf = (html) => {
  const i = html.indexOf('<section class="hero');
  return html.slice(i, html.indexOf('</section>', i));
};

test('首页 · 小标签是「音乐爱好者」，且没有在线绿点', () => {
  build(false);
  const html = read('index.html');
  assert.match(heroOf(html), /<p class="eyebrow eyebrow--plain">音乐爱好者<\/p>/);
  assert.ok(!html.includes('class="dot"'), '页面仍有绿点');
});

test('首页 · 站名、展示语、介绍逐字正确且分层', () => {
  build(false);
  const hero = heroOf(read('index.html'));
  assert.match(hero, /<h1 class="hero__title">金石竹青的音乐小屋<\/h1>/);
  assert.match(hero, /<p class="hero__tagline">把喜欢的声音，留在这里。<\/p>/);
  for (const line of ['我是金石竹青，一个音乐爱好者。', '在这里，分享喜欢的音乐，尝试感兴趣的创作，写下旋律带来的故事与心情。', '欢迎来坐坐，听听最近的声音。']) {
    assert.ok(hero.includes(`<p>${line}</p>`), `介绍缺少：${line}`);
  }
  assert.match(CSS(), /\.hero__tagline \{[\s\S]*?font-size:clamp/);
  assert.match(CSS(), /\.hero__intro p \{ color:var\(--dim\); font-size:\.97rem/);
});

test('首页 · 只有「听听音乐」「关于我」两个按钮，链接真实可用', () => {
  build(false);
  const hero = heroOf(read('index.html'));
  const links = [...hero.matchAll(/<a class="btn[^"]*" href="([^"]+)">[\s\S]*?<\/a>/g)].map((m) => m[1]);
  assert.deepEqual(links, ['./songs/', './about/'], `首屏按钮链接：${links.join(', ')}`);
  assert.match(hero, /听听音乐/);
  assert.match(hero, /关于我/);
  for (const gone of ['去曲库看看', '浏览曲库', '播放最新一首']) {
    assert.ok(!hero.includes(gone), `仍有多余按钮：${gone}`);
  }
  assert.ok(fs.existsSync(path.join(DIST, 'songs/index.html')));
  assert.ok(fs.existsSync(path.join(DIST, 'about/index.html')));
});

test('首页 · 按钮下只留一句提示，首屏不谈歌词/队列/后台/浏览器', () => {
  build(false);
  const hero = heroOf(read('index.html'));
  assert.match(hero, /<p class="hero__hint">无需登录，点开就能听。<\/p>/);
  for (const w of ['歌词', '队列', '后台', '浏览器', '锁屏', '首次播放']) {
    assert.ok(!hero.includes(w), `首屏仍出现「${w}」`);
  }
});

test('首页 · 「最近分享」标题与说明，留白已收紧', () => {
  build(false);
  const html = read('index.html');
  assert.match(html, /最近分享/);
  assert.match(html, /最近喜欢的，也放在这里与你分享。/);
  assert.ok(!html.includes('最新音乐'));
  assert.ok(!html.includes('按发布日期倒序'));
  assert.match(html, /<section class="sec sec--near" id="latest">/);
  assert.match(CSS(), /\.sec--near \{ padding-top:var\(--sp5\)/);
});

test('首页 · 占位方框已去除，单栏/推荐卡片随真实曲库切换', () => {
  build(false);
  const html = read('index.html');
  const realSongs = loadContent(ROOT, { includeDemo: false }).songs;
  assert.ok(!html.includes('hero__placeholder'), '仍有虚线占位方框');
  assert.ok(!html.includes('hero__art'), '仍有空白视觉区');
  if (realSongs.length === 0) {
    assert.match(html, /hero__in--single/, '没有回退单栏');
    assert.ok(!html.includes('hero__pick'), '空曲库不应有推荐卡片');
  } else {
    assert.ok(!html.includes('hero__in--single'), '有歌时不应单栏');
    assert.ok(html.includes('hero__pick'), '有歌却没有推荐卡片');
    assert.ok(html.includes(`data-act="play-song" data-slug="${realSongs[0].slug}"`), '推荐卡片没有播放入口');
  }
});

test('首页 · 有歌时用真实封面做推荐卡片，含歌名与播放入口', () => {
  build(true);
  const html = read('index.html');
  const first = JSON.parse(read('assets/data/catalog.json')).songs[0];
  assert.ok(html.includes('hero__pick'), '有歌却没有推荐卡片');
  assert.ok(!html.includes('hero__in--single'), '有歌时不应单栏');
  assert.ok(html.includes(`src="./${first.cover}"`), '没用真实封面');
  assert.ok(html.includes(`data-act="play-song" data-slug="${first.slug}"`), '没有播放入口');
  assert.ok(html.includes(`href="./songs/${first.slug}/"`), '没有单曲页链接');
  assert.ok(fs.existsSync(path.join(DIST, first.cover)), '封面文件不存在');
});
test('空状态 · 文案温和；有歌时不显示空状态且搜索照常', () => {
  build(false);
  const realSongs = loadContent(ROOT, { includeDemo: false }).songs;
  for (const file of ['index.html', 'songs/index.html']) {
    const html = read(file);
    if (realSongs.length === 0) {
      assert.match(html, /第一首歌，正在路上。/, `${file} 缺空状态标题`);
      assert.match(html, /小屋慢慢布置，音乐也会陆续到来。/, `${file} 缺空状态说明`);
      assert.ok(!html.includes('data-act="set-view"'), `${file} 空状态仍有视图切换`);
      assert.ok(!html.includes('data-act="play-all"'), `${file} 空状态仍有播放入口`);
      assert.ok(!html.includes('data-act="queue-all"'), `${file} 空状态仍有加入队列`);
    } else {
      assert.ok(!html.includes('第一首歌，正在路上'), `${file} 有歌却显示空状态`);
    }
  }
  const lib = read('songs/index.html');
  if (realSongs.length === 0) {
    assert.ok(!lib.includes('id="libSearch"'), '空曲库仍显示搜索框');
  } else {
    assert.match(lib, /id="libSearch"/, '有歌却没有搜索框');
    assert.match(lib, /data-act="play-all"/, '有歌却没有播放入口');
  }
});

test('有歌时 · 视图切换与搜索照常在（不是被误删）', () => {
  build(true);
  const lib = read('songs/index.html');
  assert.match(read('index.html'), /data-act="set-view"/);
  assert.match(lib, /id="libSearch"/);
  assert.match(lib, /data-act="play-all"/);
  assert.ok(!lib.includes('第一首歌，正在路上'), '有歌却显示空状态');
  assert.match(lib, /data-song="/, '有歌却没有列出歌曲');
});

test('公开页面 · 可见文案不含 npm 命令与面向开发者的说明', () => {
  // 只检查给人看的文字：首帧脚本里的 localStorage 是功能代码，不算文案
  const visible = (html) => html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  for (const demo of [false, true]) {
    const manifest = build(demo);
    const banned = ['npm run', 'npm ci', 'content/songs', 'content/notes', 'content/lyrics',
      'content/playlists', 'content/albums', 'assets/js/adapters.js', 'docs/ACCEPTANCE',
      'frontmatter', 'localStorage', 'JSON 文件', 'Markdown 文件', 'JS-SDK', 'Open Graph', '后端适配层'];
    for (const page of manifest.pages) {
      const text = visible(read(page.file));
      for (const w of banned) assert.ok(!text.includes(w), `${page.file} 仍含开发者文案「${w}」`);
    }
  }
});

test('关于页 · 入口统一「关于我」，个人介绍已更新', () => {
  build(false);
  const about = read('about/index.html');
  assert.match(about, /<h2 class="sec__title">关于我<\/h2>/);
  assert.ok(about.includes('我是金石竹青，喜欢听歌，也喜欢尝试自己感兴趣的音乐创作。'), '介绍未更新');
  assert.ok(about.includes('欢迎你偶尔来坐坐。'), '介绍不完整');
  for (const file of ['index.html', 'about/index.html']) {
    const html = read(file);
    assert.ok(!html.includes('关于站长'), `${file} 仍用「关于站长」`);
    assert.ok(!html.includes('关于金石竹青'), `${file} 仍用旧标题`);
  }
  assert.match(read('index.html'), /关于我/);
});

test('全站 · 不再把音乐统一称作「原创」', () => {
  const manifest = build(false);
  for (const page of manifest.pages) {
    assert.ok(!read(page.file).includes('原创歌曲'), `${page.file} 仍称「原创歌曲」`);
  }
  assert.ok(!read('assets/data/catalog.json').includes('原创歌曲'));
});