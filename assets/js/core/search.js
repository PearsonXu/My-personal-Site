/**
 * core/search.js — 精简公开搜索索引 + 查询。
 *
 * 索引只含：歌名、歌手、专辑、标签、日期、歌词纯文本。
 * 不含音频地址、不含手记正文、不含任何私有字段 —— 首屏只拉这一个小 JSON。
 */

import { stripTags } from './util.js';

/** 构建端：把歌曲对象数组压成精简索引 */
export function buildSearchIndex(songs) {
  return (songs || []).map((s) => ({
    s: s.slug,
    t: s.title || '',
    a: s.artist || '',
    al: s.albumTitle || s.album || '',
    tg: Array.isArray(s.tags) ? s.tags : [],
    d: s.date || '',
    ly: stripTags(s.lyricsText || '')
  }));
}

const FIELD_WEIGHTS = { title: 8, album: 5, artist: 4, tag: 3, lyrics: 1 };

function norm(value) {
  return String(value ?? '').toLowerCase().normalize('NFKC').trim();
}

/** 把查询拆成词（空格分隔，支持中英文混排） */
export function tokenize(query) {
  return norm(query).split(/\s+/).filter(Boolean).slice(0, 8);
}

/**
 * 查询：所有词都必须命中（AND），命中字段越重要分越高。
 * @returns {Array<{slug:string, score:number, fields:string[]}>}
 */
export function searchSongs(index, query, { limit = 100 } = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const out = [];
  for (const entry of index || []) {
    const title = norm(entry.t);
    const album = norm(entry.al);
    const artist = norm(entry.a);
    const tags = (entry.tg || []).map(norm);
    const lyrics = norm(entry.ly);
    let score = 0;
    const fields = new Set();
    let allMatched = true;

    for (const term of terms) {
      let hit = 0;
      if (title.includes(term)) {
        hit += FIELD_WEIGHTS.title + (title === term ? 6 : title.startsWith(term) ? 3 : 0);
        fields.add('title');
      }
      if (album.includes(term)) { hit += FIELD_WEIGHTS.album; fields.add('album'); }
      if (artist.includes(term)) { hit += FIELD_WEIGHTS.artist; fields.add('artist'); }
      if (tags.some((tag) => tag.includes(term))) { hit += FIELD_WEIGHTS.tag; fields.add('tag'); }
      if (lyrics.includes(term)) { hit += FIELD_WEIGHTS.lyrics; fields.add('lyrics'); }
      if (hit === 0) { allMatched = false; break; }
      score += hit;
    }
    if (allMatched) out.push({ slug: entry.s, score, fields: [...fields] });
  }
  out.sort((a, b) => b.score - a.score || String(a.slug).localeCompare(String(b.slug)));
  return out.slice(0, limit);
}

/** 从歌词里截一段包含命中词的上下文，用于搜索结果展示 */
export function lyricSnippet(lyricsText, query, radius = 24) {
  const text = String(lyricsText || '');
  const terms = tokenize(query);
  const lower = text.toLowerCase();
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0) {
      const start = Math.max(0, i - radius);
      const end = Math.min(text.length, i + term.length + radius);
      return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
    }
  }
  return '';
}