#!/usr/bin/env node
/**
 * tools/audit-links.mjs — 链接与资源审计。
 *
 * 回答三个问题：
 *  1. 每个页面上每个按钮/链接**实际生成的 href**，按该页面 URL 解析后指向哪里，是否 200；
 *  2. 每个 CSS/JS 请求的最终 URL、状态码、Content-Type —— 有没有把 HTML 当 CSS/JS 返回；
 *  3. 哪些相对引用位于 **#page-root 之外**（持久外壳）：它们不随路由替换，
 *     一旦 pushState 改了目录深度就会被重新解析而失效。
 *
 * 用法：
 *   node tools/audit-links.mjs                        # 审计本地 dist（起临时服务器）
 *   node tools/audit-links.mjs --base https://www.xuzhaoqing.com
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REMOTE = flag('base', '');
const PORT = Number(flag('port', '8420'));
const BASE = (REMOTE || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const server = REMOTE ? null : startServer(path.join(ROOT, 'dist'), PORT);
await new Promise((r) => setTimeout(r, 300));

let problems = 0;
const note = (s) => { problems++; console.log(`  ✗ ${s}`); };
const okmsg = (s) => console.log(`  ✓ ${s}`);

const manifest = await (await fetch(`${BASE}/assets/data/build-manifest.json`)).json();
console.log(`\n审计 ${BASE}`);
console.log(`构建模式 ${manifest.mode} · 页面 ${manifest.pages.length}\n`);

/** 抓一页 HTML，拆出 #page-root 内/外的引用 */
async function refs(route) {
  const url = `${BASE}/${route}`;
  const res = await fetch(url);
  const html = await res.text();
  const start = html.indexOf('<div id="page-root"');
  const end = html.indexOf('<!-- ▲ 路由只替换这一块 ▲ -->');
  const outside = start >= 0 && end > start ? html.slice(0, start) + html.slice(end) : html;
  const inside = start >= 0 && end > start ? html.slice(start, end) : '';
  const grab = (s) => [...s.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])
    .filter((h) => !h.startsWith('#') && !/^(mailto:|tel:|data:|javascript:)/.test(h));
  return { url, status: res.status, outside: grab(outside), inside: grab(inside), html };
}

const seen = new Map();
async function probe(absUrl, kind) {
  const key = `${kind} ${absUrl}`;
  if (seen.has(key)) return seen.get(key);
  let out;
  try {
    const res = await fetch(absUrl, { method: 'GET' });
    const ct = res.headers.get('content-type') || '';
    const body = kind === 'asset' ? await res.text() : '';
    out = { status: res.status, ct, isHtml: /<!DOCTYPE html/i.test(body.slice(0, 200)) };
  } catch (err) {
    out = { status: 0, ct: '', isHtml: false, err: String(err.message || err) };
  }
  seen.set(key, out);
  return out;
}

/* ── 1 + 2：逐页逐引用实测 ─────────────────────────── */
const shellRelative = new Map();
for (const page of manifest.pages) {
  const { url, status, outside, inside } = await refs(page.route);
  if (status !== 200) { note(`${page.route} 本身返回 ${status}`); continue; }
  const bad = [];
  for (const raw of [...outside, ...inside]) {
    const abs = new URL(raw, url).href;
    if (!abs.startsWith(BASE)) continue; // 站外链接不测
    const isAsset = /\.(css|js|json|svg|png|jpg|webp|lrc|mp3|xml|txt)$/i.test(abs);
    const r = await probe(abs, isAsset ? 'asset' : 'page');
    if (r.status !== 200) bad.push(`${raw} → ${abs} = ${r.status}`);
    else if (isAsset && /\.css$/i.test(abs) && !/text\/css/.test(r.ct)) bad.push(`${abs} Content-Type=${r.ct}`);
    else if (isAsset && /\.js$/i.test(abs) && !/javascript/.test(r.ct)) bad.push(`${abs} Content-Type=${r.ct}`);
    else if (isAsset && r.isHtml) bad.push(`${abs} 返回了 HTML`);
  }
  // 外壳里的相对引用：SPA 改深度后会失效，单独列出
  for (const raw of outside) {
    // 绝对 URL 与根绝对路径（/assets/…）都不受页面深度影响，只有 ./ ../ 这类才是隐患
    if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('/')) continue;
    const tag = raw;
    if (!shellRelative.has(tag)) shellRelative.set(tag, []);
    shellRelative.get(tag).push(page.route || '/');
  }
  if (bad.length) { for (const b of bad) note(`${page.route || '/'}：${b}`); }
  else okmsg(`${page.route || '/'}：${outside.length + inside.length} 个引用全部 200 且 MIME 正确`);
}

/* ── 3：外壳相对引用清单 ───────────────────────────── */
console.log('\n── #page-root 之外的相对引用（SPA 改深度后会失效）──');
if (shellRelative.size === 0) okmsg('无（外壳资源已全部绝对化）');
else {
  for (const [raw, routes] of shellRelative) {
    console.log(`  · ${raw}   出现在 ${routes.length} 个页面，例：${routes.slice(0, 3).join(', ')}`);
  }
  console.log('  ↑ 这些必须由 app.js 在启动时绝对化，否则 pushState 后会 404');
}

/* ── 4：错误深度对照实验 ───────────────────────────── */
console.log('\n── 对照实验：同一个 CSS，正确深度 vs 错误深度 ──');
for (const u of [`${BASE}/assets/css/site.css`, `${BASE}/notes/songs/assets/css/site.css`]) {
  const r = await probe(u, 'asset');
  const verdict = r.status === 200 && /text\/css/.test(r.ct) ? '正常' : '失效';
  console.log(`  ${verdict}  ${u}\n         HTTP ${r.status} · Content-Type: ${r.ct}${r.isHtml ? ' · 返回体是 HTML' : ''}`);
}

console.log(`\n══ 审计结束：${problems} 个问题 ══`);
if (server) server.close();
process.exit(problems ? 1 : 0);