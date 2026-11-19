#!/usr/bin/env node
/**
 * tools/new-song.mjs — 添加一首真实歌曲。
 *
 * 用法：
 *   node tools/new-song.mjs "夜渡" --audio ~/Music/night-ferry.mp3
 *   node tools/new-song.mjs "纸船" --audio ./paper-boat.mp3 --lyrics ./paper-boat.lrc --album river --tags piano,demo
 *
 * 它会：把 MP3 复制进 assets/audio/、把 LRC 复制进 content/lyrics/、
 *       逐帧解析真实时长、写出 content/songs/<slug>.json。
 * 母带请自己留在 masters/（已 gitignore），公开试听只放转码后的 MP3。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify, isSafeSlug } from '../assets/js/core/util.js';
import { probeMp3 } from './lib/mp3.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const title = argv.find((a) => !a.startsWith('--'));
const flag = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

if (!title) {
  console.error('用法：node tools/new-song.mjs "歌名" --audio <mp3 路径> [--slug x] [--lyrics x.lrc] [--album slug] [--tags a,b] [--artist 名字] [--original-artist 原唱] [--composer 作曲] [--lyricist 作词] [--version-note 翻唱/改编/AI生成] [--version-by 本站制作] [--tools SUNO,…]');
  process.exit(1);
}

const audioSrc = flag('audio');
if (!audioSrc) { console.error('✗ 必须用 --audio 指定一个真实的 MP3 文件'); process.exit(1); }
const audioAbs = path.resolve(audioSrc);
if (!fs.existsSync(audioAbs)) { console.error(`✗ 找不到音频文件：${audioAbs}`); process.exit(1); }
if (!/\.mp3$/i.test(audioAbs)) { console.error('✗ 公开试听请使用经过验证的 MP3（母带另存 masters/）'); process.exit(1); }

const slug = flag('slug', slugify(title));
if (!isSafeSlug(slug)) { console.error(`✗ slug 不合法：${slug}`); process.exit(1); }
const songFile = path.join(ROOT, 'content/songs', `${slug}.json`);
if (fs.existsSync(songFile)) { console.error(`✗ 已存在 content/songs/${slug}.json，换个 slug 或先删除`); process.exit(1); }

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/site.json'), 'utf8'));
const info = probeMp3(audioAbs);

const audioDir = path.join(ROOT, 'assets/audio');
fs.mkdirSync(audioDir, { recursive: true });
const audioName = `${slug}.mp3`;
fs.copyFileSync(audioAbs, path.join(audioDir, audioName));

let lyricsName = null;
const lyricsSrc = flag('lyrics');
if (lyricsSrc) {
  const lyricsAbs = path.resolve(lyricsSrc);
  if (!fs.existsSync(lyricsAbs)) { console.error(`✗ 找不到歌词文件：${lyricsAbs}`); process.exit(1); }
  lyricsName = `${slug}${path.extname(lyricsAbs) || '.lrc'}`;
  fs.mkdirSync(path.join(ROOT, 'content/lyrics'), { recursive: true });
  fs.copyFileSync(lyricsAbs, path.join(ROOT, 'content/lyrics', lyricsName));
}

const coverArg = flag('cover', 'auto');
if (coverArg !== 'auto' && !/^https?:\/\//.test(coverArg) && !fs.existsSync(path.join(ROOT, 'assets/img', coverArg))) {
  console.error(`✗ 封面不存在：assets/img/${coverArg}（也可以省略，用自动生成的封面）`);
  process.exit(1);
}

const song = {
  slug,
  title,
  artist: flag('artist', site.author?.name || ''),
  composer: flag('composer', ''),
  lyricist: flag('lyricist', ''),
  // 原作署名与本站版本制作信息分开；生成工具（SUNO 等）单独标注，不当原唱/词曲作者
  originalArtist: flag('original-artist', ''),
  versionNote: flag('version-note', ''),
  versionBy: flag('version-by', ''),
  tools: flag('tools') ? flag('tools').split(',').map((s) => s.trim()).filter(Boolean) : [],
  album: flag('album') || null,
  tags: flag('tags') ? flag('tags').split(',').map((s) => s.trim()).filter(Boolean) : [],
  date: flag('date', new Date().toISOString().slice(0, 10)),
  duration: info.seconds,
  cover: coverArg,
  audio: { src: `audio/${audioName}`, mime: 'audio/mpeg', master: null },
  lyrics: lyricsName,
  instrumental: !lyricsName,
  demo: false,
  about: flag('about', ''),
  credits: []
};

fs.writeFileSync(songFile, `${JSON.stringify(song, null, 2)}\n`);

console.log(`✓ 已添加《${title}》`);
console.log(`  slug      ${slug}`);
console.log(`  音频      assets/audio/${audioName}  ${(fs.statSync(path.join(audioDir, audioName)).size / 1048576).toFixed(2)} MB`);
console.log(`  真实时长  ${info.seconds}s  ${info.sampleRate}Hz  ${info.channels}ch  ${info.bitrate}kbps  ${info.cbr ? 'CBR' : 'VBR'}`);
console.log(`  歌词      ${lyricsName ? `content/lyrics/${lyricsName}` : '（纯音乐）'}`);
console.log(`  内容文件  content/songs/${slug}.json`);
console.log('');
console.log('下一步：');
console.log('  1. 编辑 content/songs/' + slug + '.json 补 about / credits / tags / originalArtist / versionNote / versionBy / tools');
console.log('  2. npm run build && npm run serve');
console.log('  3. 打开 http://localhost:8000/status/ 点「探测音频响应头」确认 206');
console.log('  4. git add -A && git commit && git push（Actions 自动发布）');