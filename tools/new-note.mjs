#!/usr/bin/env node
/**
 * tools/new-note.mjs — 新建一篇创作手记（Markdown + JSON frontmatter）。
 *
 * 用法：
 *   node tools/new-note.mjs "写歌的那个晚上" --songs night-ferry,paper-boat --tags 创作
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify, isSafeSlug } from '../assets/js/core/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const title = argv.find((a) => !a.startsWith('--'));
const flag = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const list = (name) => flag(name) ? flag(name).split(',').map((s) => s.trim()).filter(Boolean) : [];

if (!title) {
  console.error('用法：node tools/new-note.mjs "标题" [--slug x] [--songs a,b] [--albums x] [--playlists y] [--tags 创作,录音]');
  process.exit(1);
}

const slug = flag('slug', slugify(title));
if (!isSafeSlug(slug)) {
  console.error(`✗ 标题无法转成合法 slug（中文标题请显式指定 --slug），得到：${slug}`);
  process.exit(1);
}
const dir = path.join(ROOT, 'content/notes');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${slug}.md`);
if (fs.existsSync(file)) { console.error(`✗ 已存在 content/notes/${slug}.md`); process.exit(1); }

const front = {
  slug,
  title,
  date: flag('date', new Date().toISOString().slice(0, 10)),
  excerpt: flag('excerpt', ''),
  tags: list('tags'),
  songs: list('songs'),
  albums: list('albums'),
  playlists: list('playlists'),
  cover: 'auto',
  draft: true
};

const body = `# ${title}

在这里写正文。支持标题、段落、**粗体**、*斜体*、\`行内代码\`、
[链接](https://example.com)、图片、列表、引用与代码块。

> 引用一段话。

- 列表项一
- 列表项二

写完后把 frontmatter 里的 \`draft\` 改成 \`false\` 才会发布。
`;

fs.writeFileSync(file, `---\n${JSON.stringify(front, null, 2)}\n---\n\n${body}`);
console.log(`✓ 已创建 content/notes/${slug}.md（draft: true，不会发布）`);
console.log('  写完后把 draft 改成 false，然后 npm run build && git push');