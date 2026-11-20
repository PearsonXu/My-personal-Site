#!/usr/bin/env node
/**
 * tools/serve.mjs — 本地静态服务器，**支持 Range / 206**。
 *
 * 为什么不用 python3 -m http.server：SimpleHTTPRequestHandler 不支持 Range，
 * 拖动进度条会失败，那样测出来的「能播」是假的。这里如实实现 206。
 *
 * 用法：
 *   node tools/serve.mjs                       服务 dist/，base = /
 *   BASE_PATH=/My-personal-Site node tools/serve.mjs   模拟项目子路径部署
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.lrc': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf'
};

/**
 * 启动前一致性校验。
 *
 * 间歇性 404 的一个真实来源：dist/ 被反复重建（生产 ↔ DEMO、或带 --base 子目录前缀），
 * 而长驻的预览服务器照旧把不匹配的产物发出去 —— 同一个按钮有时正常有时 404。
 * 这里在启动时就把不匹配拦下来并说清楚，而不是让用户去猜。
 */
function assertBuildMatches(dir, base) {
  const indexFile = path.join(dir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    console.error(`✗ ${dir} 里没有 index.html。先跑：npm run build:demo`);
    process.exit(1);
  }
  const html = fs.readFileSync(indexFile, 'utf8');
  const buildBase = /data-base="([^"]*)"/.exec(html)?.[1] || '/';
  const serverBase = base ? `${base}/` : '/';
  if (buildBase !== serverBase) {
    console.error('✗ 产物与服务路径不匹配，拒绝启动（否则每个链接都会 404）：');
    console.error(`    产物构建 base = ${buildBase}`);
    console.error(`    服务器 base   = ${serverBase}`);
    console.error(`  修法二选一：`);
    console.error(`    node tools/build-site.mjs --demo --base ${serverBase}`);
    console.error(`    或去掉 BASE_PATH 环境变量后重新 npm run serve`);
    process.exit(1);
  }
  let mode = '未知';
  let songs = '?';
  try {
    const mf = JSON.parse(fs.readFileSync(path.join(dir, 'assets/data/build-manifest.json'), 'utf8'));
    mode = mf.mode;
    songs = mf.counts.songs;
  } catch { /* 清单缺失不致命 */ }
  return { buildBase, mode, songs };
}

export function startServer(dir = path.join(ROOT, 'dist'), port = 8000) {
  const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '') || '';
  const info = assertBuildMatches(dir, base);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);

    if (base && !pathname.startsWith(`${base}/`) && pathname !== base) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404：本站点部署在 ${base}/ 下`);
      return;
    }
    if (base) pathname = pathname.slice(base.length) || '/';

    // 目录 → index.html；防目录穿越
    const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let file = path.join(dir, safe);
    if (!file.startsWith(dir)) {
      res.writeHead(403).end('403');
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');

    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      const nf = path.join(dir, '404.html');
      const body = fs.existsSync(nf) ? fs.readFileSync(nf) : Buffer.from('404');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }

    const stat = fs.statSync(file);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Last-Modified': stat.mtime.toUTCString()
    };

    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match || (match[1] === '' && match[2] === '')) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      let start;
      let end;
      if (match[1] === '') {
        const suffix = Number(match[2]);
        start = Math.max(0, stat.size - suffix);
        end = stat.size - 1;
      } else {
        start = Number(match[1]);
        end = match[2] === '' ? stat.size - 1 : Math.min(Number(match[2]), stat.size - 1);
      }
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1
      });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });

  server.listen(port, () => {
    console.log(`\n▶ 本地预览 http://localhost:${port}${base || '/'}`);
    console.log(`  服务目录 ${dir}`);
    console.log('  支持 Range / 206（拖动进度条可真实验证）');
    console.log(`  产物：base=${info.buildBase} · 模式=${info.mode} · 歌曲=${info.songs}`);
    if (info.mode === 'production') {
      console.log('  ⚠ 生产产物：DEMO 测试歌曲不存在，点它们的链接会 404。');
      console.log('    想试听请用 npm run dev（DEMO 构建 + 预览，一条命令保证匹配）。');
    }
    if (base) console.log(`  正在模拟项目子路径部署：BASE_PATH=${base}`);
    console.log('  Ctrl+C 停止\n');
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const portArg = process.argv.find((a) => a.startsWith('--port='));
  startServer(path.join(ROOT, 'dist'), portArg ? Number(portArg.split('=')[1]) : Number(process.env.PORT || 8000));
}