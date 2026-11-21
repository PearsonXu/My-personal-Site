/**
 * tests/poster.test.mjs — 歌词海报纯逻辑契约（core/poster.js）。
 * 用假测量函数确定性断言：长歌名 / 长歌词不溢出、不裁切；选句 4–6；清洗保留标点与衬词。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc } from '../assets/js/core/lrc.js';
import {
  POSTER_W, POSTER_H, POSTER_MARGIN,
  sanitizeLyricLines, defaultSelection, wrapText, layoutPoster,
  posterPalette, contrastRatio, mixColor
} from '../assets/js/core/poster.js';

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;
/** 假测量：CJK 全角 = size，其余 0.55×size（与真实字体比例同量级） */
const measure = (t, size) => [...t].reduce((w, c) => w + (CJK.test(c) ? size : size * 0.55), 0);

test('sanitizeLyricLines：去时间戳/元数据/结构标签，保留标点与衬词', () => {
  const parsed = parseLrc('[ti:你是]\n[ar:金石竹青]\n[00:01.00]第一句，带标点！\n[00:05.00][Chorus]\n[00:06.00]啊 oh woo\n[00:09.00]（间奏）\n[00:12.00]第二句？');
  const lines = sanitizeLyricLines(parsed);
  assert.deepEqual(lines, ['第一句，带标点！', '啊 oh woo', '第二句？']);
  assert.deepEqual(sanitizeLyricLines(['[Verse 2]', '正常句', '[bridge]', '（副歌）', '  ']), ['正常句']);
  assert.deepEqual(sanitizeLyricLines(null), []);
});

test('defaultSelection：4–6 行；不足全选；优先重复句（副歌）', () => {
  assert.deepEqual(defaultSelection([]), []);
  assert.deepEqual(defaultSelection(['a', 'b', 'c']), [0, 1, 2]);
  const lines = ['引子', 'a', 'b', 'c', 'd', 'e', 'f', 'a', 'b', 'c', 'd', 'e', '尾'];
  const sel = defaultSelection(lines);
  assert.ok(sel.length >= 4 && sel.length <= 6, `选句数 ${sel.length}`);
  assert.ok(sel.includes(1), '应从重复句首次出现处开始');
  const sorted = [...sel].sort((x, y) => x - y);
  assert.deepEqual(sel, sorted);
  for (let i = 1; i < sel.length; i++) assert.equal(sel[i] - sel[i - 1], 1, '连续一段');
});

test('defaultSelection：重复钩子句不会让默认选句整段雷同', () => {
  const lines = ['前句一', '前句二', '钩', '钩', '钩', '钩', '后句一', '后句二', '后句三'];
  const sel = defaultSelection(lines);
  const texts = sel.map((i) => lines[i]);
  assert.ok(new Set(texts).size >= 3, `distinct=${new Set(texts).size}`);
  assert.ok(sel.length >= 4 && sel.length <= 6);
});

test('wrapText：中文逐字断行不超宽；拉丁词不断；超长词硬断', () => {
  const max = 300;
  const lines = wrapText('把喜欢的声音留在这里，啊 oh woo', max, measure, 40, 'lyric');
  for (const l of lines) assert.ok(measure(l, 40) <= max, `超宽行: ${l}`);
  assert.ok(lines.length >= 2);
  const latin = wrapText('supercalifragilisticexpialidocious word', max, measure, 40, 'lyric');
  for (const l of latin) assert.ok(measure(l, 40) <= max);
  assert.ok(latin.join(' ').includes('word'), '普通拉丁词保持完整');
  assert.deepEqual(wrapText('', max, measure, 40, 'lyric'), ['']);
});

/** 所有块必须落在画布内；文字块行宽不超内容宽 */
function assertInBounds(layout) {
  const CW = POSTER_W - POSTER_MARGIN * 2;
  for (const b of layout.blocks) {
    if (b.kind === 'cover' || b.kind === 'qr' || b.kind === 'rule') {
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= layout.W && b.y + b.h <= layout.H, `${b.kind} 越界`);
    } else {
      assert.ok(b.y >= 0 && b.y + b.lines.length * b.lh <= layout.H, `${b.kind} 纵向越界`);
      for (const t of b.lines) {
        const w = measure(t, b.size);
        assert.ok(w <= CW + 1, `${b.kind} 行超宽 ${w.toFixed(0)} > ${CW}: ${t}`);
        const left = b.align === 'center' ? b.x - w / 2 : b.x;
        assert.ok(left >= POSTER_MARGIN - 1 && left + w <= POSTER_W - POSTER_MARGIN + 1, `${b.kind} 横向越界`);
      }
    }
  }
}

const baseInput = {
  title: '去年夏天', artist: '金石竹青',
  lyricLines: ['第一句歌词', '第二句歌词', '第三句歌词', '第四句歌词', '第五句歌词'],
  siteLabel: '金石竹青的音乐小屋', urlLabel: 'www.xuzhaoqing.com',
  hasCover: true, hasQr: true
};

test('layoutPoster：默认 1080×1440，五行歌词放得下且不越界', () => {
  const layout = layoutPoster(baseInput, measure);
  assert.equal(layout.W, 1080);
  assert.equal(layout.H, 1440);
  assert.equal(layout.meta.grown, false);
  assert.ok(layout.meta.lyricSize >= 28);
  assertInBounds(layout);
  const cover = layout.blocks.find((b) => b.kind === 'cover');
  assert.ok(cover.h / layout.H >= 0.35 && cover.h / layout.H <= 0.45, '封面约四成高');
  const order = layout.blocks.map((b) => b.kind);
  assert.ok(order.indexOf('cover') < order.indexOf('title') && order.indexOf('title') < order.indexOf('lyric') && order.indexOf('lyric') < order.indexOf('qr'), '顺序：封面→歌名→歌词→二维码');
});

test('layoutPoster：超长歌名不截断不溢出（缩字号/多行）', () => {
  const long = '这是一首名字特别特别长的歌用来验证海报不会把歌名裁掉或者画出画布边界';
  const layout = layoutPoster({ ...baseInput, title: long }, measure);
  const title = /** @type {any} */ (layout.blocks.find((b) => b.kind === 'title'));
  assert.equal(title.lines.join(''), long, '歌名一字不丢');
  assert.ok(title.lines.length <= 3);
  assertInBounds(layout);
});

test('layoutPoster：六行长歌词 → 加高画布而不是裁切', () => {
  const longLines = Array.from({ length: 6 }, (_, i) => `第${i}句特别长的歌词用来验证换行与加高逻辑，逗号句号都要保留！`);
  const layout = layoutPoster({ ...baseInput, lyricLines: longLines }, measure);
  assert.ok(layout.H >= POSTER_H);
  assertInBounds(layout);
  const lyric = /** @type {any} */ (layout.blocks.find((b) => b.kind === 'lyric'));
  assert.equal(lyric.lines.join('').replace(/\s/g, '').length, longLines.join('').replace(/\s/g, '').length, '歌词一字不丢');
});

test('layoutPoster：无歌词 / 无封面 / 无二维码回退版面仍合法', () => {
  for (const patch of [{ lyricLines: [] }, { hasCover: false }, { hasQr: false }, { lyricLines: [], hasCover: false, hasQr: false }]) {
    const layout = layoutPoster({ ...baseInput, ...patch }, measure);
    assertInBounds(layout);
    if (patch.lyricLines) assert.ok(!layout.blocks.some((b) => b.kind === 'lyric'));
    if (patch.hasQr === false) assert.ok(!layout.blocks.some((b) => b.kind === 'qr'));
  }
});

test('posterPalette：任意主色下正文对比度 ≥ 7，二维码白底', () => {
  for (const dom of /** @type {Array<[number,number,number]|null>} */ ([[0, 0, 0], [12, 16, 24], [255, 255, 255], [200, 30, 30], [30, 120, 200], null])) {
    const pal = posterPalette(dom);
    assert.ok(contrastRatio(pal.ink, pal.bgBottom) >= 7, `ink/bgBottom ${contrastRatio(pal.ink, pal.bgBottom)}`);
    assert.ok(contrastRatio(pal.ink, pal.bgTop) >= 7);
    assert.ok(contrastRatio(pal.mute, pal.bgBottom) >= 4.5);
    assert.equal(pal.card, '#ffffff');
  }
  assert.equal(mixColor([0, 0, 0], '#ffffff', 1), '#ffffff');
  assert.equal(mixColor([0, 0, 0], '#ffffff', 0), '#000000');
});
