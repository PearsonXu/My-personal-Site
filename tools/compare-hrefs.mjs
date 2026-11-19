#!/usr/bin/env node
/**
 * tools/compare-hrefs.mjs — 同一按钮在不同页面的 href 对比。
 *
 * 目的：证明桌面导航 / 移动导航 / 卡片 / 页脚 / 面包屑用的是**同一套**链接生成方式，
 * 且在首页、歌曲详情页、关于页、手记页上生成**完全相同**的绝对地址。
 * 只要有一处按页面深度变化，这里就会立刻显示差异。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REMOTE = flag('base', '');
const PORT = Number(flag('port', '8440'));
const B = (REMOTE || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const server = REMOTE ? null : startServer(path.join(ROOT, 'dist'), PORT);
await new Promise((r) => setTimeout(r, 300));

const catalog = await (await fetch(`${B}/assets/data/catalog.json`)).json();
const song = catalog.songs[0]?.slug;
const note = catalog.notes[0]?.slug;
const pages = [
  ['首页', '/'],
  ['歌曲详情', song ? `/songs/${song}/` : null],
  ['关于', '/about/'],
  ['手记详情', note ? `/notes/${note}/` : null],
  ['曲库', '/songs/']
].filter(([, p]) => p);

/** 从 HTML 里按选择器语义取 href（用正则，避免引入 DOM 依赖） */
function pick(html) {
  const out = {};
  // 桌面与移动导航是同一个 .nav__ul（移动只是 CSS 变体），逐项取
  const navBlock = /<nav class="nav"[\s\S]*?<\/nav>/.exec(html)?.[0] || '';
  for (const m of navBlock.matchAll(/<a class="nav__a[^"]*" href="([^"]+)"[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]+)</g)) {
    out[`导航·${m[2].trim()}`] = m[1];
  }
  out['品牌 logo'] = /<a class="brand" href="([^"]+)"/.exec(html)?.[1];
  const footBlock = /<footer class="foot"[\s\S]*?<\/footer>/.exec(html)?.[0] || '';
  for (const m of footBlock.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)</g)) {
    out[`页脚·${m[2].trim()}`] = m[1];
  }
  const crumb = /<nav class="crumbs"[\s\S]*?<\/nav>/.exec(html)?.[0];
  if (crumb) {
    for (const m of crumb.matchAll(/<a href="([^"]+)">([^<]+)</g)) out[`面包屑·${m[2].trim()}`] = m[1];
  }
  // 卡片/行链接：不同页面展示的内容本来就不同，所以比较**形状**而不是第一个具体条目。
  // 形状必须是「根绝对 + 单段 slug + 尾斜杠」，任何累积都会破坏它。
  const shapes = (re) => [...html.matchAll(re)].map((m) => m[1]);
  const rowHrefs = shapes(/<a class="row__main" href="([^"]+)"/g);
  const cardHrefs = shapes(/<a class="card__link" href="([^"]+)"/g);
  const shapeOf = (list) => {
    if (!list.length) return '—';
    const okAll = list.every((h) => /^\/(songs|albums|playlists|notes)\/[a-z0-9][a-z0-9-]*\/$/.test(h));
    return okAll ? '/〈kind〉/〈slug〉/ ✓根绝对单段' : `异常：${list.join(', ')}`;
  };
  if (rowHrefs.length) out['歌曲行链接·形状'] = shapeOf(rowHrefs);
  if (cardHrefs.length) out['卡片链接·形状'] = shapeOf(cardHrefs);
  const pickCover = /<a class="hero__pick__cover" href="([^"]+)"/.exec(html)?.[1];
  if (pickCover) out['推荐卡片封面'] = pickCover;
  // 资源
  out['CSS site'] = /<link rel="stylesheet" href="([^"]*site\.css)"/.exec(html)?.[1];
  out['JS app'] = /<script type="module" src="([^"]+)"/.exec(html)?.[1];
  out['占位封面'] = /<img id="plCover"[^>]*src="([^"]+)"/.exec(html)?.[1];
  return out;
}

const table = new Map();
for (const [label, p] of pages) {
  const html = await (await fetch(`${B}${p}`)).text();
  table.set(label, pick(html));
}

const keys = [...new Set([...table.values()].flatMap((o) => Object.keys(o)))];
let divergent = 0;
console.log(`\n对比 ${B}\n`);
const head = ['按钮 / 资源', ...pages.map(([l]) => l)];
console.log(head.join(' | '));
console.log(head.map(() => '---').join(' | '));
for (const k of keys) {
  const vals = pages.map(([l]) => table.get(l)[k] ?? '—');
  const present = vals.filter((v) => v !== '—');
  const same = new Set(present).size <= 1;
  if (!same) divergent++;
  console.log(`${same ? '✓' : '✗'} ${k} | ${vals.join(' | ')}`);
}

// 移动导航是否与桌面共用同一份标记
const homeHtml = await (await fetch(`${B}/`)).text();
const navCount = (homeHtml.match(/<nav class="nav"/g) || []).length;
console.log(`\n导航标记数量：${navCount}（1 = 桌面与移动共用同一份 DOM，仅 CSS 不同）`);
if (navCount !== 1) divergent++;

console.log(`\n══ 对比结束：${divergent} 处不一致 ══`);
if (server) server.close();
process.exit(divergent ? 1 : 0);