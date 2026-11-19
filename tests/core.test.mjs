import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, parseTime, clamp, escapeHtml, isSafeSlug, slugify, stripTags, truncate, createIdFactory } from '../assets/js/core/util.js';
import { parseLrc, lineIndexAt, lyricsToPlainText, isTimed, lyricsState } from '../assets/js/core/lrc.js';
import { normalizeBase, baseFromModuleUrl, joinUrl, relPrefix, resolveMedia, routeFor, parseRoute, isInternalNavigable, canonicalUrl, signUrl } from '../assets/js/core/paths.js';
import { buildSearchIndex, searchSongs, tokenize, lyricSnippet } from '../assets/js/core/search.js';

test('util · 时间格式化与解析', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3600), '1:00:00');
  assert.equal(formatTime(NaN), '0:00');
  assert.equal(formatTime(-5), '0:00');
  assert.equal(parseTime('1:05'), 65);
  assert.equal(parseTime('1:00:00'), 3600);
  assert.equal(parseTime('12.5'), 12.5);
  assert.equal(parseTime('abc'), null);
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp('x', 2, 9), 2);
});

test('util · 转义与 slug', () => {
  assert.equal(escapeHtml('<img src=x onerror="1">'), '&lt;img src=x onerror=&quot;1&quot;&gt;');
  assert.equal(escapeHtml("a'b&c"), 'a&#39;b&amp;c');
  assert.ok(isSafeSlug('night-ferry-2'));
  assert.ok(!isSafeSlug('../etc'));
  assert.ok(!isSafeSlug('Upper'));
  assert.ok(!isSafeSlug('中文'));
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(stripTags('<p>a&nbsp;b</p>'), 'a b');
  assert.equal(truncate('abcdef', 4), 'abc…');
});

test('util · 队列 ID 永不重复（同一首歌重复入队的前提）', () => {
  const next = createIdFactory('t');
  const ids = new Set(Array.from({ length: 5000 }, next));
  assert.equal(ids.size, 5000);
});

test('lrc · 标准 LRC、百分秒与毫秒', () => {
  const parsed = parseLrc('[ti:标题]\n[ar:歌手]\n[00:01.50]第一句\n[00:03.250]第二句\n');
  assert.equal(parsed.format, 'lrc');
  assert.equal(/** @type {any} */ (parsed.meta).ti, '标题');
  assert.deepEqual(parsed.lines.map((l) => l.time), [1.5, 3.25]);
  assert.equal(parsed.lines[1].text, '第二句');
});

test('lrc · 一行多个时间标签（副歌重复）', () => {
  const parsed = parseLrc('[00:10.00][00:30.00]同一句副歌');
  assert.equal(parsed.lines.length, 2);
  assert.deepEqual(parsed.lines.map((l) => l.time), [10, 30]);
  assert.ok(parsed.lines.every((l) => l.text === '同一句副歌'));
});

test('lrc · offset 正值表示歌词提前', () => {
  assert.equal(parseLrc('[offset:500]\n[00:10.00]句子').lines[0].time, 9.5);
  assert.equal(parseLrc('[offset:-500]\n[00:10.00]句子').lines[0].time, 10.5);
  assert.equal(parseLrc('[offset:20000]\n[00:10.00]句子').lines[0].time, 0);
});

test('lrc · 纯文本 / 空 / 纯音乐三态', () => {
  const text = parseLrc('第一行\n第二行\n');
  assert.equal(text.format, 'text');
  assert.equal(text.lines[0].time, null);
  assert.equal(isTimed(text), false);
  assert.equal(lineIndexAt(text.lines, 5), -1);
  const none = parseLrc('   \n');
  assert.equal(none.format, 'none');
  assert.equal(lyricsState(none, { instrumental: true }), 'instrumental');
  assert.equal(lyricsState(none, {}), 'none');
  assert.equal(lyricsState(text, {}), 'text');
});

test('lrc · 当前句定位（含边界）', () => {
  const { lines } = parseLrc('[00:00.00]a\n[00:05.00]b\n[00:10.00]c');
  assert.equal(lineIndexAt(lines, -1), -1);
  assert.equal(lineIndexAt(lines, 0), 0);
  assert.equal(lineIndexAt(lines, 4.999), 0);
  assert.equal(lineIndexAt(lines, 5), 1);
  assert.equal(lineIndexAt(lines, 999), 2);
  assert.equal(lineIndexAt([], 3), -1);
});

test('lrc · 搜索用纯文本不含时间戳', () => {
  assert.equal(lyricsToPlainText(parseLrc('[00:01.00]夜渡\n[00:02.00]纸船')), '夜渡 纸船');
});

test('search · 歌名 / 专辑 / 标签 / 歌词都能命中', () => {
  const index = buildSearchIndex([
    { slug: 'a', title: '夜渡', artist: '金石竹青', albumTitle: '河与灯', tags: ['ambient'], lyricsText: '船票还在口袋里' },
    { slug: 'b', title: '纸船', artist: '金石竹青', albumTitle: '河与灯', tags: ['piano'], lyricsText: '折一只纸船' }
  ]);
  assert.equal(searchSongs(index, '夜渡')[0].slug, 'a');
  assert.equal(searchSongs(index, '河与灯').length, 2);
  assert.equal(searchSongs(index, 'piano')[0].slug, 'b');
  assert.equal(searchSongs(index, '口袋')[0].slug, 'a');
  assert.deepEqual(searchSongs(index, '不存在的词'), []);
  assert.deepEqual(tokenize('  夜渡   纸船 '), ['夜渡', '纸船']);
  assert.equal(searchSongs(index, '夜渡 纸船').length, 0, '多词是 AND，不是 OR');
  assert.ok(lyricSnippet('船票还在口袋里', '口袋').includes('口袋'));
});

test('search · 歌名权重高于歌词', () => {
  const index = buildSearchIndex([
    { slug: 'lyric-hit', title: '别的东西', lyricsText: '夜渡' },
    { slug: 'title-hit', title: '夜渡', lyricsText: '' }
  ]);
  assert.equal(searchSongs(index, '夜渡')[0].slug, 'title-hit');
});
test('paths · base 规范化与从模块 URL 反推', () => {
  assert.equal(normalizeBase('My-personal-Site'), '/My-personal-Site/');
  assert.equal(normalizeBase(''), '/');
  assert.equal(baseFromModuleUrl('https://x.com/assets/js/app.js', 'assets/js/app.js'), '/');
  assert.equal(baseFromModuleUrl('https://x.com/My-personal-Site/assets/js/app.js', 'assets/js/app.js'), '/My-personal-Site/');
  assert.equal(joinUrl('/My-personal-Site/', '/songs/a/'), '/My-personal-Site/songs/a/');
  assert.equal(relPrefix(0), './');
  assert.equal(relPrefix(2), '../../');
});

test('paths · 媒体地址可整体迁移到对象存储', () => {
  assert.equal(resolveMedia('audio/a.mp3', { rel: '../../' }), '../../audio/a.mp3');
  assert.equal(resolveMedia('audio/a.mp3', { mediaBase: 'https://cdn.example.com/music/' }), 'https://cdn.example.com/music/audio/a.mp3');
  assert.equal(resolveMedia('https://cdn.example.com/x.mp3', { mediaBase: 'https://other/' }), 'https://cdn.example.com/x.mp3');
  assert.equal(resolveMedia('data:audio/wav;base64,AAA', {}), 'data:audio/wav;base64,AAA');
});

test('paths · 路由解析（根域名与子路径都要对）', () => {
  for (const base of ['/', '/My-personal-Site/']) {
    assert.deepEqual(parseRoute(joinUrl(base, ''), base), { kind: 'home', slug: null });
    assert.deepEqual(parseRoute(joinUrl(base, 'songs/'), base), { kind: 'library', slug: null });
    assert.deepEqual(parseRoute(joinUrl(base, 'songs/night-ferry/'), base), { kind: 'song', slug: 'night-ferry' });
    assert.deepEqual(parseRoute(joinUrl(base, 'albums/x/index.html'), base), { kind: 'album', slug: 'x' });
    assert.deepEqual(parseRoute(joinUrl(base, 'notes/y/'), base), { kind: 'note', slug: 'y' });
    assert.equal(parseRoute(joinUrl(base, 'nope/deep/'), base), null);
  }
  assert.equal(routeFor('song', 'a'), 'songs/a/');
});

test('paths · 哪些链接该被 SPA 接管', () => {
  const opts = { base: '/', origin: 'https://x.com' };
  assert.ok(isInternalNavigable('/songs/a/', opts));
  assert.ok(isInternalNavigable('https://x.com/notes/b/', opts));
  assert.ok(!isInternalNavigable('https://other.com/songs/a/', opts));
  assert.ok(!isInternalNavigable('mailto:a@b.c', opts));
  assert.ok(!isInternalNavigable('#lyrics', opts));
  assert.ok(!isInternalNavigable('/assets/audio/a.mp3', opts));
  assert.ok(!isInternalNavigable('/unknown-section/', opts), '未知路径不接管，交给浏览器');
});

test('paths · 规范链接与微信签名 URL', () => {
  assert.equal(canonicalUrl('https://x.com/', 'song', 'a'), 'https://x.com/songs/a/');
  assert.equal(signUrl('https://x.com/songs/a/?t=3#lyrics'), 'https://x.com/songs/a/?t=3');
  assert.equal(signUrl('https://x.com/#a'), 'https://x.com/');
});