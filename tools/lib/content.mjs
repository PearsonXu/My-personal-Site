/**
 * tools/lib/content.mjs — 读取并校验 content/ 下的版本化内容，产出可渲染的模型。
 * 任何引用断裂都在这里报错，而不是等到线上 404。
 */

import fs from 'node:fs';
import path from 'node:path';
import { isSafeSlug, byDateDesc, truncate, stripTags } from '../../assets/js/core/util.js';
import { parseLrc, lyricsToPlainText } from '../../assets/js/core/lrc.js';
import { renderMarkdown, parseFrontmatter } from './markdown.mjs';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${path.relative(process.cwd(), file)} 解析失败：${err.message}`);
  }
}

function readDirJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: path.join(dir, f), data: readJson(path.join(dir, f)) }));
}

/**
 * 封面二选一：
 *  - "auto" / 缺省 → 构建期按 slug 生成确定性抽象封面（PNG，含 OG 尺寸）
 *  - 具体路径      → 用站长自己的图片（相对 assets/img/），OG 也指向它
 */
function coverFields(data, key, assetsDir, where, errors) {
  const auto = !data.cover || data.cover === 'auto';
  if (auto) {
    return {
      coverAuto: true,
      coverSeed: `${key}`,
      coverPath: `assets/img/covers/${key}.png`,
      ogPath: `assets/img/og/${key}.png`
    };
  }
  const rel = String(data.cover).replace(/^\/+/, '');
  const isRemote = /^(https?:)?\/\//i.test(rel);
  if (!isRemote && !fs.existsSync(path.join(assetsDir, 'img', rel))) {
    errors.push(`${where}: 封面文件不存在 assets/img/${rel}`);
  }
  const full = isRemote ? rel : `assets/img/${rel}`;
  return { coverAuto: false, coverSeed: key, coverPath: full, ogPath: full };
}

export function loadContent(root, { includeDemo = false } = {}) {
  const errors = [];
  const warnings = [];
  const contentDir = path.join(root, 'content');
  const assetsDir = path.join(root, 'assets');

  const site = readJson(path.join(contentDir, 'site.json'));
  if (!site.url || !/^https?:\/\//.test(site.url)) errors.push('site.json: url 必须是完整的 https 地址（规范链接与分享要用）');

  const rawSongs = readDirJson(path.join(contentDir, 'songs'));
  const rawAlbums = readDirJson(path.join(contentDir, 'albums'));
  const rawPlaylists = readDirJson(path.join(contentDir, 'playlists'));

  const noteFiles = fs.existsSync(path.join(contentDir, 'notes'))
    ? fs.readdirSync(path.join(contentDir, 'notes')).filter((f) => f.endsWith('.md')).sort()
    : [];

  const seen = { song: new Set(), album: new Set(), playlist: new Set(), note: new Set() };
  const checkSlug = (kind, slug, where) => {
    if (!isSafeSlug(slug)) { errors.push(`${where}: slug "${slug}" 不合法（只允许小写字母 / 数字 / 连字符）`); return; }
    if (seen[kind].has(slug)) errors.push(`${where}: slug "${slug}" 重复`);
    seen[kind].add(slug);
  };

  /* ── 歌曲 ─────────────────────────────────────────── */
  const songs = [];
  for (const { file, data } of rawSongs) {
    const where = path.relative(root, file);
    checkSlug('song', data.slug, where);
    if (!data.title) errors.push(`${where}: 缺少 title`);
    if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) errors.push(`${where}: date 必须是 YYYY-MM-DD`);
    if (data.demo && !includeDemo) continue;

    const audioSrc = data.audio?.src;
    if (!audioSrc) errors.push(`${where}: 缺少 audio.src`);
    const isRemote = /^(https?:)?\/\//i.test(audioSrc || '');
    if (audioSrc && !isRemote && !site.mediaBase) {
      const abs = path.join(assetsDir, audioSrc);
      if (!fs.existsSync(abs)) errors.push(`${where}: 音频文件不存在 assets/${audioSrc}`);
    } else if (audioSrc && (isRemote || site.mediaBase)) {
      warnings.push(`${where}: 音频走外部地址，构建期不校验存在性，请用 npm run check:assets 实测`);
    }

    let parsedLyrics = { format: 'none', meta: {}, lines: [] };
    let lyricsPath = null;
    if (data.lyrics) {
      const abs = path.join(contentDir, 'lyrics', data.lyrics);
      if (!fs.existsSync(abs)) errors.push(`${where}: 歌词文件不存在 content/lyrics/${data.lyrics}`);
      else {
        parsedLyrics = parseLrc(fs.readFileSync(abs, 'utf8'));
        lyricsPath = `assets/lyrics/${data.slug}${path.extname(data.lyrics) || '.lrc'}`;
        if (data.instrumental && parsedLyrics.format !== 'none') {
          warnings.push(`${where}: 标了 instrumental 但又有歌词文件，页面按纯音乐处理`);
        }
      }
    }
    if (data.instrumental) parsedLyrics = { format: 'none', meta: {}, lines: [] };

    const duration = Number(data.duration);
    if (!Number.isFinite(duration) || duration <= 0) errors.push(`${where}: duration 必须是正数（秒）`);

    songs.push({
      slug: data.slug,
      title: data.title,
      artist: data.artist || site.author?.name || '',
      composer: data.composer || '',
      lyricist: data.lyricist || '',
      album: data.album || null,
      albumTitle: '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      date: data.date,
      duration,
      cover: data.cover || 'auto',
      ...coverFields(data, data.slug, assetsDir, where, errors),
      audio: audioSrc,
      audioMime: data.audio?.mime || 'audio/mpeg',
      lyricsPath,
      lyricsText: lyricsToPlainText(parsedLyrics),
      lyricsLines: parsedLyrics.lines,
      lyricsMeta: parsedLyrics.meta,
      lyricsFormat: parsedLyrics.format,
      instrumental: !!data.instrumental,
      demo: !!data.demo,
      about: data.about || '',
      aboutHtml: data.about ? renderMarkdown(data.about) : '',
      credits: Array.isArray(data.credits) ? data.credits : []
    });
  }
  songs.sort(byDateDesc);
  const songBySlug = new Map(songs.map((s) => [s.slug, s]));
  /* ── 专辑 ─────────────────────────────────────────── */
  const albums = [];
  for (const { file, data } of rawAlbums) {
    const where = path.relative(root, file);
    checkSlug('album', data.slug, where);
    if (data.demo && !includeDemo) continue;
    const tracks = (data.tracks || []).filter((slug) => {
      if (songBySlug.has(slug)) return true;
      warnings.push(`${where}: 专辑曲目 "${slug}" 不在当前曲库（可能未启用 demo），已跳过`);
      return false;
    });
    albums.push({
      slug: data.slug,
      title: data.title || data.slug,
      artist: data.artist || site.author?.name || '',
      date: data.date || '',
      cover: data.cover || 'auto',
      ...coverFields(data, `album-${data.slug}`, assetsDir, where, errors),
      tags: Array.isArray(data.tags) ? data.tags : [],
      demo: !!data.demo,
      about: data.about || '',
      aboutHtml: data.about ? renderMarkdown(data.about) : '',
      tracks
    });
  }
  albums.sort(byDateDesc);
  for (const song of songs) {
    const album = albums.find((a) => a.slug === song.album);
    if (song.album && !album) warnings.push(`songs/${song.slug}: album "${song.album}" 不存在，按单曲处理`);
    song.albumTitle = album ? album.title : '';
  }

  /* ── 歌单 ─────────────────────────────────────────── */
  const playlists = [];
  for (const { file, data } of rawPlaylists) {
    const where = path.relative(root, file);
    checkSlug('playlist', data.slug, where);
    if (data.demo && !includeDemo) continue;
    const tracks = (data.songs || []).filter((slug) => {
      if (songBySlug.has(slug)) return true;
      warnings.push(`${where}: 歌单曲目 "${slug}" 不在当前曲库，已跳过`);
      return false;
    });
    playlists.push({
      slug: data.slug,
      title: data.title || data.slug,
      date: data.date || '',
      cover: data.cover || 'auto',
      ...coverFields(data, `playlist-${data.slug}`, assetsDir, where, errors),
      tags: Array.isArray(data.tags) ? data.tags : [],
      demo: !!data.demo,
      about: data.about || '',
      aboutHtml: data.about ? renderMarkdown(data.about) : '',
      tracks
    });
  }
  playlists.sort(byDateDesc);
  /* ── 手记 ─────────────────────────────────────────── */
  const notes = [];
  for (const file of noteFiles) {
    const abs = path.join(contentDir, 'notes', file);
    const where = path.relative(root, abs);
    let parsed;
    try {
      parsed = parseFrontmatter(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      errors.push(`${where}: ${err.message}`);
      continue;
    }
    const data = parsed.data;
    checkSlug('note', data.slug, where);
    if (!data.title) errors.push(`${where}: 缺少 title`);
    if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) errors.push(`${where}: date 必须是 YYYY-MM-DD`);
    if (data.draft) { warnings.push(`${where}: draft=true，不发布`); continue; }
    const pick = (list, set, kind) => (Array.isArray(list) ? list : []).filter((slug) => {
      if (set.has(slug)) return true;
      warnings.push(`${where}: 关联的${kind} "${slug}" 不存在，已跳过`);
      return false;
    });
    const html = renderMarkdown(parsed.body);
    notes.push({
      slug: data.slug,
      title: data.title,
      date: data.date,
      excerpt: data.excerpt || truncate(stripTags(html), 140),
      tags: Array.isArray(data.tags) ? data.tags : [],
      cover: data.cover || 'auto',
      ...coverFields(data, `note-${data.slug}`, assetsDir, where, errors),
      songs: pick(data.songs, songBySlug, '歌曲'),
      albums: pick(data.albums, new Set(albums.map((a) => a.slug)), '专辑'),
      playlists: pick(data.playlists, new Set(playlists.map((p) => p.slug)), '歌单'),
      html,
      readingMinutes: Math.max(1, Math.round(stripTags(html).length / 400))
    });
  }
  notes.sort(byDateDesc);

  if (errors.length) {
    const err = new Error(`内容校验失败：\n  - ${errors.join('\n  - ')}`);
    /** @type {any} */ (err).validationErrors = errors;
    throw err;
  }

  return { site, songs, albums, playlists, notes, warnings, includeDemo };
}

/** 精简公开目录：播放器 / 队列 / 搜索需要的最小字段集 */
export function publicCatalog(model) {
  const { site, songs, albums, playlists, notes } = model;
  return {
    version: 1,
    site: {
      title: site.title,
      shortTitle: site.shortTitle,
      tagline: site.tagline,
      url: site.url,
      mediaBase: site.mediaBase || '',
      author: site.author,
      backends: site.backends,
      share: site.share,
      experimental: site.experimental || {}
    },
    songs: songs.map((s) => ({
      slug: s.slug,
      title: s.title,
      artist: s.artist,
      album: s.album,
      albumTitle: s.albumTitle,
      tags: s.tags,
      date: s.date,
      duration: s.duration,
      cover: s.coverPath,
      audio: s.audio,
      audioMime: s.audioMime,
      lyrics: s.lyricsPath,
      lyricsFormat: s.lyricsFormat,
      instrumental: s.instrumental,
      demo: s.demo
    })),
    albums: albums.map((a) => ({
      slug: a.slug, title: a.title, artist: a.artist, date: a.date,
      cover: a.coverPath, tracks: a.tracks, demo: a.demo
    })),
    playlists: playlists.map((p) => ({
      slug: p.slug, title: p.title, date: p.date,
      cover: p.coverPath, tracks: p.tracks, demo: p.demo
    })),
    notes: notes.map((n) => ({
      slug: n.slug, title: n.title, date: n.date, excerpt: n.excerpt,
      cover: n.coverPath, songs: n.songs, albums: n.albums, playlists: n.playlists
    }))
  };
}