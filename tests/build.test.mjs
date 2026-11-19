import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveMedia } from '../assets/js/core/paths.js';
import { loadContent } from '../tools/lib/content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const read = (p) => fs.readFileSync(path.join(DIST, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(DIST, p));

function build(demo) {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), ...(demo ? ['--demo'] : [])], { cwd: ROOT, stdio: 'pipe' });
  return JSON.parse(read('assets/data/build-manifest.json'));
}

test('build · DEMO 构建产出每首歌的真实独立目录', () => {
  const manifest = build(true);
  assert.equal(manifest.mode, 'demo');
  assert.ok(manifest.counts.songs >= 2);
  for (const song of manifest.pages.filter((p) => p.kind === 'song')) {
    assert.ok(exists(`songs/${song.slug}/index.html`), `缺少 songs/${song.slug}/index.html`);
  }
  for (const p of ['index.html', 'songs/index.html', 'albums/index.html', 'playlists/index.html', 'notes/index.html', 'about/index.html', 'me/index.html', 'status/index.html', '404.html']) {
    assert.ok(exists(p), `缺少 ${p}`);
  }
});

test('build · 每首歌有独立标题 / 简介 / 规范链接 / 封面元数据', () => {
  const manifest = build(true);
  const songs = manifest.pages.filter((p) => p.kind === 'song');
  const titles = new Set();
  const canonicals = new Set();
  for (const s of songs) {
    const html = read(`songs/${s.slug}/index.html`);
    const title = /<title>([^<]*)<\/title>/.exec(html)[1];
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)[1];
    const ogImage = /<meta property="og:image" content="([^"]*)"/.exec(html)[1];
    const desc = /<meta name="description" content="([^"]*)"/.exec(html)[1];
    titles.add(title);
    canonicals.add(canonical);
    assert.equal(canonical, `https://www.xuzhaoqing.com/songs/${s.slug}/`);
    assert.ok(ogImage.startsWith('https://www.xuzhaoqing.com/assets/img/'), `og:image 必须是站内绝对地址：${ogImage}`);
    assert.ok(exists(ogImage.replace('https://www.xuzhaoqing.com/', '')), `og:image 指向的文件必须真实存在：${ogImage}`);
    assert.match(ogImage, /\.(png|jpe?g|webp)$/i, 'og:image 必须是位图（微信/OG 不吃 SVG）');
    assert.ok(desc.length > 10);
    assert.match(html, /property="og:type" content="music\.song"/);
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /播放这首歌/, '分享落地页必须有明显的播放按钮');
  }
  assert.equal(titles.size, songs.length, '不同歌曲的标题必须不同');
  assert.equal(canonicals.size, songs.length, '不同歌曲的规范链接必须不同');
});

test('build · 播放器与 audio 在 #page-root 之外，且全站只有一个 audio', () => {
  const manifest = build(true);
  for (const page of manifest.pages) {
    const html = read(page.file);
    assert.equal((html.match(/<audio\b/g) || []).length, 1, `${page.file} 的 audio 数量不是 1`);
    const pageRootEnd = html.indexOf('<!-- ▲ 路由只替换这一块 ▲ -->');
    const audioAt = html.indexOf('<audio id="zx-audio"');
    const playerAt = html.indexOf('<div id="player-root"');
    assert.ok(pageRootEnd > 0);
    assert.ok(audioAt > pageRootEnd, `${page.file}: audio 必须在 #page-root 之外`);
    assert.ok(playerAt > pageRootEnd, `${page.file}: 播放器必须在 #page-root 之外`);
  }
});

test('build · 站内链接与资源一律用 base 绝对路径，任意深度都一致', () => {
  build(true);
  const home = read('index.html');
  const deep = read('songs/demo-night-ferry/index.html');
  // 关键：深层页与首页的资源路径必须**完全相同**，不再随深度变化
  assert.match(home, /href="\/assets\/css\/site\.css"/);
  assert.match(deep, /href="\/assets\/css\/site\.css"/);
  assert.match(deep, /src="\/assets\/js\/app\.js"/);
  for (const html of [home, deep]) {
    // 不允许再出现按深度拼接的相对前缀
    assert.ok(!/(href|src)="\.\.\//.test(html), '出现了 ../ 相对前缀');
    assert.ok(!/(href|src)="\.\//.test(html), '出现了 ./ 相对前缀');
  }
  // 站内路由链接必须是根绝对路径
  assert.match(deep, /href="\/songs\/"/);
  assert.match(deep, /href="\/about\/"/);
  assert.match(home, /href="\/songs\/demo-night-ferry\/"/);
  // 构建 base 写进 html，供运行时兜底比对
  assert.match(home, /data-base="\/"/);
});

test('build · --base 支持子目录部署，链接与资源统一带前缀', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-site.mjs'), '--demo', '--base', '/My-personal-Site/'], { cwd: ROOT, stdio: 'pipe' });
  const home = read('index.html');
  const deep = read('songs/demo-night-ferry/index.html');
  assert.match(home, /data-base="\/My-personal-Site\/"/);
  assert.match(home, /href="\/My-personal-Site\/songs\/"/);
  assert.match(deep, /href="\/My-personal-Site\/assets\/css\/site\.css"/);
  assert.match(deep, /href="\/My-personal-Site\/songs\/"/);
  assert.ok(!/(href|src)="\.\.\//.test(deep));
  const nf = read('404.html');
  assert.match(nf, /id="goHome" href="\/My-personal-Site\/"/);
  build(true); // 复原默认 base，避免影响后续测试
});
test('build · 旧站与专业背景信息已彻底移除', () => {
  build(true);
  assert.ok(!exists('legacy/index.html'), '产物里不应再有旧站');
  assert.ok(!fs.existsSync(path.join(ROOT, 'legacy')), '仓库里不应再有 legacy/ 目录');
  const banned = ['许钊箐', 'Zhaoqing Xu', 'zhaoqingxu.com', 'sc.edu', 'South Carolina', 'UofSC', 'Xiaofeng', 'Instructor of Record', '相场', '计算数学', 'CFL', '学术主页', '旧版主页'];
  const manifest = JSON.parse(read('assets/data/build-manifest.json'));
  for (const page of manifest.pages) {
    const html = read(page.file);
    for (const word of banned) {
      assert.ok(!html.includes(word), `${page.file} 仍含有「${word}」`);
    }
    assert.ok(!/legacy\//.test(html), `${page.file} 仍链接到旧站`);
  }
  const catalog = read('assets/data/catalog.json');
  for (const word of banned) assert.ok(!catalog.includes(word), `catalog.json 仍含有「${word}」`);
  assert.ok(!/location\.replace\("legacy/.test(read('index.html')), '首页不应再有旧锚点跳转');
});

test('build · 站长署名为金石竹青', () => {
  build(true);
  const home = read('index.html');
  assert.match(home, /<title>金石竹青的音乐小屋/);
  assert.match(home, /金石竹青/);
  assert.match(read('about/index.html'), /关于我/);
  const catalog = JSON.parse(read('assets/data/catalog.json'));
  assert.equal(catalog.site.author.name, '金石竹青');
  assert.equal(catalog.site.author.nameEn, undefined);
  assert.equal(catalog.site.author.academicSite, undefined);
  assert.equal(catalog.site.author.email, undefined);
  assert.equal(catalog.site.legacy, undefined);
});

test('build · Pages 必需文件齐全', () => {
  build(true);
  assert.ok(exists('.nojekyll'));
  assert.ok(exists('CNAME'));
  assert.equal(read('CNAME').trim(), 'www.xuzhaoqing.com');
  assert.ok(exists('robots.txt'));
  assert.match(read('sitemap.xml'), /<loc>https:\/\/www\.xuzhaoqing\.com\/songs\//);
});

test('build · 生产构建排除 DEMO，只含真实内容（无歌时给空状态）', () => {
  const manifest = build(false);
  assert.equal(manifest.mode, 'production');
  const realSongs = loadContent(ROOT, { includeDemo: false }).songs;
  assert.equal(manifest.counts.songs, realSongs.length);
  assert.ok(!exists('songs/demo-night-ferry/index.html'));
  const home = read('index.html');
  if (realSongs.length === 0) {
    assert.match(home, /第一首歌，正在路上/);
  } else {
    for (const s of realSongs) assert.ok(exists(`songs/${s.slug}/index.html`), `缺少真实歌曲页 songs/${s.slug}/`);
  }
  assert.ok(!home.includes('DEMO'), '生产页面不应出现 DEMO 标记');
});

test('build · 构建产物不含任何凭据（说明性文字不算）', () => {
  build(true);
  // 只拦「疑似真实赋值」，不拦文档里解释这些名词的散文
  const patterns = [
    /app[_-]?secret\s*[:=]\s*['"][A-Za-z0-9_-]{8,}/i,
    /jsapi[_-]?ticket\s*[:=]\s*['"][A-Za-z0-9_-]{8,}/i,
    /access[_-]?token\s*[:=]\s*['"][A-Za-z0-9_.-]{16,}/i,
    /BEGIN (RSA |EC )?PRIVATE KEY/,
    /"signature"\s*:\s*"[a-f0-9]{40}"/i
  ];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!/\.(html|js|json|css|svg|xml|txt)$/.test(entry.name)) continue;
      const text = fs.readFileSync(p, 'utf8');
      for (const re of patterns) {
        assert.ok(!re.test(text), `${path.relative(DIST, p)} 疑似含有凭据：${re}`);
      }
    }
  };
  walk(DIST);
});

test('build · 幂等：两次构建产物一致', () => {
  build(true);
  const first = read('songs/demo-night-ferry/index.html');
  const firstCatalog = read('assets/data/catalog.json');
  build(true);
  assert.equal(read('songs/demo-night-ferry/index.html'), first);
  assert.equal(read('assets/data/catalog.json'), firstCatalog);
});

test('build · 运行时资源解析结果必须真实存在（防止 404 音源）', () => {
  build(true);
  const catalog = JSON.parse(read('assets/data/catalog.json'));
  // 与 assets/js/app.js 完全一致的两套解析规则
  for (const base of ['/', '/My-personal-Site/']) {
    const resolve = (src) => resolveMedia(src, { mediaBase: '', rel: base });
    const resolveAudio = (src) => resolveMedia(src, { mediaBase: catalog.site.mediaBase || '', rel: `${base}assets/` });
    for (const song of catalog.songs) {
      const audioUrl = resolveAudio(song.audio);
      assert.ok(audioUrl.startsWith(`${base}assets/audio/`), `音频 URL 前缀错误：${audioUrl}`);
      const audioFile = path.join(DIST, audioUrl.slice(base.length));
      assert.ok(fs.existsSync(audioFile), `音频解析到不存在的文件：${audioUrl}`);
      const coverFile = path.join(DIST, resolve(song.cover).slice(base.length));
      assert.ok(fs.existsSync(coverFile), `封面解析到不存在的文件：${song.cover}`);
      if (song.lyrics) {
        const lyricFile = path.join(DIST, resolve(song.lyrics).slice(base.length));
        assert.ok(fs.existsSync(lyricFile), `歌词解析到不存在的文件：${song.lyrics}`);
      }
      const qrFile = path.join(DIST, resolve(`assets/qr/song-${song.slug}.svg`).slice(base.length));
      assert.ok(fs.existsSync(qrFile), '二维码解析到不存在的文件');
    }
  }
});

test('build · mediaBase 配置后音频整体切到对象存储，封面仍走仓库', () => {
  const withCdn = resolveMedia('audio/x.mp3', { mediaBase: 'https://cdn.example.com/m/', rel: '/assets/' });
  assert.equal(withCdn, 'https://cdn.example.com/m/audio/x.mp3');
  const cover = resolveMedia('assets/img/covers/x.png', { mediaBase: '', rel: '/' });
  assert.equal(cover, '/assets/img/covers/x.png');
});

test('contract · 模板里每个 data-act 都有对应处理分支', () => {
  build(true);
  const app = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const handled = new Set([...app.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));
  // 这些由专门的 UI 组件处理，不在 app.js 的 switch 里
  const delegated = new Set(['toggle-audio-session']);
  const manifest = JSON.parse(read('assets/data/build-manifest.json'));
  const used = new Set();
  for (const page of manifest.pages) {
    for (const m of read(page.file).matchAll(/data-act="([a-z-]+)"/g)) used.add(m[1]);
  }
  const missing = [...used].filter((a) => !handled.has(a) && !delegated.has(a));
  assert.deepEqual(missing, [], `这些 data-act 没有处理逻辑：${missing.join(', ')}`);
});

test('contract · 播放器 JS 引用的每个 id 都存在于外壳', () => {
  build(true);
  const html = read('index.html');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const files = ['assets/js/ui/player-ui.js', 'assets/js/ui/lyrics-ui.js', 'assets/js/app.js'];
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/byId\('([^']+)'\)/g)) {
      if (!ids.has(m[1]) && !['libSearch', 'libList', 'libGrid', 'libVinyl', 'libEmpty', 'libCount', 'favList', 'recentList', 'queueList', 'favCount', 'recentCount', 'queueCount', 'diagOut', 'probeOut', 'audioSessionToggle', 'audioSessionState', 'posterHost', 'queueBody'].includes(m[1])) {
        missing.push(`${f} → #${m[1]}`);
      }
    }
  }
  assert.deepEqual(missing, [], `外壳缺少这些 id：${missing.join(', ')}`);
});