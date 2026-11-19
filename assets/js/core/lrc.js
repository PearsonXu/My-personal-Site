/**
 * core/lrc.js — LRC / 纯文本 / 无歌词 三种形态的统一解析。
 * 纯函数，无 DOM。构建端用它做校验与搜索索引，浏览器用它做高亮，测试用它做断言。
 */

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[([a-zA-Z#]+):(.*)\]$/;

/**
 * @param {string} text 原始歌词文本
 * @returns {{format:'lrc'|'text'|'none', meta:object, lines:Array<{time:number|null,text:string}>}}
 *
 * offset 约定（LRC 规范）：单位为毫秒，正值表示歌词整体「提前」，
 * 因此实际时间 = 标签时间 − offset/1000，结果下钳到 0。
 */
export function parseLrc(text) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) return { format: 'none', meta: {}, lines: [] };

  const meta = {};
  const timed = [];
  const plain = [];

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // 纯元数据行（[ti:...] [ar:...] [offset:...]），不含时间标签
    const metaMatch = line.match(META_TAG);
    if (metaMatch && !/\[\d{1,3}:\d{1,2}/.test(line)) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
      continue;
    }

    TIME_TAG.lastIndex = 0;
    const stamps = [];
    let match;
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fracRaw = match[3] || '0';
      // [mm:ss.xx] 是百分秒，[mm:ss.xxx] 是毫秒
      const frac = Number(fracRaw) / (fracRaw.length === 3 ? 1000 : 100);
      if (seconds < 60) stamps.push(minutes * 60 + seconds + frac);
    }

    const body = line.replace(TIME_TAG, '').trim();
    if (stamps.length === 0) {
      plain.push(body);
      continue;
    }
    for (const stamp of stamps) timed.push({ time: stamp, text: body });
  }

  if (timed.length === 0) {
    const lines = plain.filter((t) => t.length > 0).map((t) => ({ time: null, text: t }));
    return { format: lines.length ? 'text' : 'none', meta, lines };
  }

  const offsetMs = Number(meta.offset);
  const shift = Number.isFinite(offsetMs) ? offsetMs / 1000 : 0;
  const lines = timed
    .map((l) => ({ time: Math.max(0, l.time - shift), text: l.text }))
    .sort((a, b) => a.time - b.time);

  return { format: 'lrc', meta, lines };
}

/**
 * 当前时间对应的歌词行下标；第一句之前返回 -1。
 * 纯文本 / 无歌词返回 -1（调用方据此关闭高亮与自动滚动）。
 */
export function lineIndexAt(lines, time) {
  if (!Array.isArray(lines) || lines.length === 0) return -1;
  if (typeof lines[0].time !== 'number') return -1;
  const t = Number(time);
  if (!Number.isFinite(t)) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}

/** 歌词 → 无时间戳纯文本（搜索索引用；空行保留为分隔） */
export function lyricsToPlainText(parsed) {
  if (!parsed || !Array.isArray(parsed.lines)) return '';
  return parsed.lines.map((l) => l.text).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** 歌词是否为可高亮的带时间轴形态 */
export function isTimed(parsed) {
  return !!parsed && parsed.format === 'lrc' && parsed.lines.some((l) => typeof l.time === 'number');
}

/** 空状态文案 key，交给 UI 层翻译 */
export function lyricsState(parsed, song) {
  if (song && song.instrumental) return 'instrumental';
  if (!parsed || parsed.format === 'none') return 'none';
  if (parsed.format === 'text') return 'text';
  return 'timed';
}