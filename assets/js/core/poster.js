/**
 * core/poster.js — 歌词海报的纯逻辑：清洗 / 选句 / 换行 / 版面 / 配色。
 * 无 DOM、无 canvas：测量函数由调用方注入（浏览器用 ctx.measureText，测试用假测量），
 * 于是「长歌名 / 长歌词不溢出」可以在 node:test 里确定性地断言。
 *
 * 版面契约（默认 1080×1440 竖版）：
 *   封面（约四成高，保持比例）→ 歌名与署名 → 精选歌词 → 站点标识 + 单曲二维码。
 *   内容放不下时**加高画布**而不是裁切文字；返回的 blocks 全部落在画布内。
 */

export const POSTER_W = 1080;
export const POSTER_H = 1440;
export const POSTER_MARGIN = 72;

/** 整行结构提示标签（[Chorus] / [间奏] / （副歌）…），不含正常标点与衬词 */
const STRUCT_BRACKET = /^\[(?:verse|chorus|bridge|intro|outro|interlude|pre-?chorus|hook|refrain|instrumental|break|solo|ad-?lib|spoken|rap|主歌|副歌|前奏|间奏|尾奏|桥段|念白|吟唱)\s*\d*\]$/i;
const STRUCT_PAREN = /^[（(](?:verse|chorus|bridge|intro|outro|interlude|instrumental|break|solo|spoken|主歌|副歌|前奏|间奏|尾奏|桥段|念白|吟唱)\s*\d*[）)]$/i;

/**
 * 歌词行清洗：时间戳与元数据已由 parseLrc 处理；这里再去掉整行结构提示。
 * 保留正常标点与实际唱出的衬词（啊 / oh / woo …），不做任何「美化」删字。
 * @param {{lines?:Array<{text?:string}>}|Array<{text?:string}|string>} parsed
 * @returns {string[]}
 */
export function sanitizeLyricLines(parsed) {
  const raw = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.lines) ? parsed.lines : []);
  const out = [];
  for (const item of raw) {
    const t = String(typeof item === 'string' ? item : (item && item.text) || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (STRUCT_BRACKET.test(t) || STRUCT_PAREN.test(t)) continue;
    out.push(t);
  }
  return out;
}

/**
 * 默认选句：4–6 行（不足则全选）。滑窗打分：窗内**不同行数**优先（避免整段重复钩子句），
 * 其次是否含重复最多的那句（副歌倾向），再取靠前者；无重复句时自然落在中段。
 * @param {string[]} lines
 * @returns {number[]} 选中下标（升序连续）
 */
export function defaultSelection(lines, { min = 4, max = 6 } = {}) {
  const n = lines.length;
  if (n === 0) return [];
  const target = Math.min(n, Math.max(min, Math.min(max, 5)));
  if (n <= target) return lines.map((_, i) => i);
  const counts = new Map();
  for (const t of lines) counts.set(t, (counts.get(t) || 0) + 1);
  let hook = '';
  let bestCount = 1;
  for (const [t, c] of counts) if (c > bestCount) { bestCount = c; hook = t; }
  let bestStart = Math.floor((n - target) / 2);
  let bestScore = -1;
  for (let s = 0; s + target <= n; s++) {
    const win = lines.slice(s, s + target);
    const distinct = new Set(win).size;
    const score = distinct * 4 + (bestCount > 1 && win.includes(hook) ? 2 : 0);
    if (score > bestScore) { bestScore = score; bestStart = s; }
  }
  return Array.from({ length: target }, (_, i) => bestStart + i);
}

/**
 * 中文自然换行：CJK 逐字可断；拉丁词整体不断；超长拉丁词硬断。
 * @param {string} text
 * @param {number} maxWidth
 * @param {(text:string,size:number,kind:string)=>number} measure
 * @param {number} size
 * @param {string} kind
 * @returns {string[]}
 */
export function wrapText(text, maxWidth, measure, size, kind) {
  const tokens = String(text).match(/[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]|[^\s\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]+|\s+/g) || [];
  const lines = [];
  let cur = '';
  const flush = () => { if (cur.trim()) lines.push(cur.trim()); cur = ''; };
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) { if (cur) cur += ' '; continue; }
    const candidate = cur + tok;
    if (measure(candidate, size, kind) <= maxWidth || !cur.trim()) {
      // 单个 token 本身就超宽（超长拉丁词）→ 逐字硬断
      if (!cur.trim() && measure(tok, size, kind) > maxWidth) {
        let piece = '';
        for (const ch of tok) {
          if (piece && measure(piece + ch, size, kind) > maxWidth) { lines.push(piece); piece = ch; }
          else piece += ch;
        }
        cur = piece;
        continue;
      }
      cur = candidate;
    } else {
      flush();
      cur = tok;
    }
  }
  flush();
  return lines.length ? lines : [''];
}

/** hex → [r,g,b] */
function hexRgb(h) {
  const s = String(h).replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function rgbHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** 线性插值混色：t=0 → a，t=1 → b */
export function mixColor(a, b, t) {
  const A = Array.isArray(a) ? a : hexRgb(a);
  const B = Array.isArray(b) ? b : hexRgb(b);
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
/** WCAG 相对亮度 */
export function luminance(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * 封面主色 → 柔和浅色渐变 + 高对比文字色。
 * 主色再深也只取少量混入白底；对比不够就继续加白，保证正文对比度 ≥ 7。
 * @param {[number,number,number]|null} dominant
 */
export function posterPalette(dominant) {
  const dom = dominant && dominant.length === 3 ? dominant : [127, 142, 163];
  const ink = '#1d232b';
  let tTop = 0.88;
  let tBottom = 0.74;
  let bgBottom = mixColor(dom, '#ffffff', tBottom);
  while (contrastRatio(ink, bgBottom) < 7 && tBottom < 0.97) {
    tBottom += 0.03;
    tTop = Math.min(0.97, tBottom + 0.14);
    bgBottom = mixColor(dom, '#ffffff', tBottom);
  }
  const bgTop = mixColor(dom, '#ffffff', tTop);
  return {
    bgTop,
    bgBottom,
    ink,
    mute: contrastRatio('#4a5563', bgBottom) >= 4.5 ? '#4a5563' : ink,
    rule: mixColor(dom, ink, 0.55),
    card: '#ffffff'
  };
}

/**
 * @typedef {{kind:'cover',x:number,y:number,w:number,h:number,present:boolean}
 *   |{kind:'rule',x:number,y:number,w:number,h:number}
 *   |{kind:'qr',x:number,y:number,w:number,h:number,inner:number}
 *   |{kind:'title'|'artist'|'lyric'|'site'|'url',x:number,y:number,lines:string[],size:number,lh:number,align:string}} PosterBlock
 */

/**
 * 版面计算：返回画布尺寸与全部绘制块（坐标均为左上角原点，textBaseline=top）。
 * 任何情况下不裁切：字号下探到下限后仍放不下 → 加高画布（40px 步进）。
 * @param {{title:string,artist:string,lyricLines:string[],siteLabel:string,urlLabel:string,hasCover:boolean,hasQr:boolean}} input
 * @param {(text:string,size:number,kind:string)=>number} measure
 */
export function layoutPoster(input, measure) {
  const W = POSTER_W;
  const M = POSTER_MARGIN;
  const CW = W - M * 2;
  const coverH = 560;
  const footerH = 176;
  const gapCover = 44;
  const gapLyric = 40;
  const gapFooter = 36;

  // 歌名：60px 起，最多 2 行；放不下下探到 48px，仍超则允许 3 行（绝不截断）
  let titleSize = 60;
  let titleLines = wrapText(input.title, CW, measure, titleSize, 'title');
  while (titleLines.length > 2 && titleSize > 48) {
    titleSize -= 4;
    titleLines = wrapText(input.title, CW, measure, titleSize, 'title');
  }
  const titleLh = Math.round(titleSize * 1.2);

  let artistSize = 32;
  let artistLines = wrapText(input.artist, CW, measure, artistSize, 'artist');
  while (artistLines.length > 2 && artistSize > 26) {
    artistSize -= 2;
    artistLines = wrapText(input.artist, CW, measure, artistSize, 'artist');
  }
  const artistLh = Math.round(artistSize * 1.35);

  const titleTop0 = M + coverH + gapCover;
  const artistTop0 = titleTop0 + titleLines.length * titleLh + 10;
  // 无歌词时把歌名/署名在文本区内垂直居中，避免中段一大片空白
  let titleTop = titleTop0;
  let artistTop = artistTop0;
  if (!input.lyricLines.length) {
    const zoneTop = titleTop0;
    const zoneBottom = POSTER_H - M - footerH - gapFooter;
    const blockH = titleLines.length * titleLh + 10 + artistLines.length * artistLh;
    const off = Math.max(0, Math.floor((zoneBottom - zoneTop - blockH) / 2));
    titleTop += off;
    artistTop += off;
  }
  const lyricTop = artistTop + artistLines.length * artistLh + gapLyric;

  // 歌词：40px 起下探到 28px；行高 1.7 倍，中文自然换行
  let lyricSize = 40;
  const wrapLyrics = (size) => input.lyricLines.flatMap((t) => wrapText(t, CW, measure, size, 'lyric'));
  let lyricVisual = wrapLyrics(lyricSize);
  let lyricLh = Math.round(lyricSize * 1.7);
  const footerTopFor = (H) => H - M - footerH;
  let H = POSTER_H;
  const availFor = (h) => footerTopFor(h) - gapFooter - lyricTop;
  while (lyricVisual.length * lyricLh > availFor(H) && lyricSize > 28) {
    lyricSize -= 2;
    lyricLh = Math.round(lyricSize * 1.7);
    lyricVisual = wrapLyrics(lyricSize);
  }
  if (lyricVisual.length * lyricLh > availFor(H)) {
    const need = lyricVisual.length * lyricLh - availFor(H);
    H += Math.ceil(need / 40) * 40;
  }

  const blocks = /** @type {PosterBlock[]} */ ([
    { kind: 'cover', x: M, y: M, w: CW, h: coverH, present: input.hasCover },
    { kind: 'title', x: W / 2, y: titleTop, lines: titleLines, size: titleSize, lh: titleLh, align: 'center' },
    { kind: 'artist', x: W / 2, y: artistTop, lines: artistLines, size: artistSize, lh: artistLh, align: 'center' }
  ]);
  if (lyricVisual.length) {
    blocks.push({ kind: 'lyric', x: W / 2, y: lyricTop, lines: lyricVisual, size: lyricSize, lh: lyricLh, align: 'center' });
  }
  const footerTop = footerTopFor(H);
  blocks.push({ kind: 'rule', x: M, y: footerTop - 20, w: CW, h: 2 });
  blocks.push({ kind: 'site', x: M, y: footerTop + 40, lines: [input.siteLabel], size: 30, lh: 40, align: 'left' });
  blocks.push({ kind: 'url', x: M, y: footerTop + 88, lines: [input.urlLabel], size: 24, lh: 32, align: 'left' });
  if (input.hasQr) blocks.push({ kind: 'qr', x: W - M - footerH, y: footerTop, w: footerH, h: footerH, inner: 144 });
  return { W, H, blocks, meta: { titleSize, artistSize, lyricSize, lyricVisualLines: lyricVisual.length, grown: H !== POSTER_H } };

}
