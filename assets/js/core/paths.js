/**
 * core/paths.js — base path 与路由。
 *
 * 同一份构建产物必须同时能跑在：
 *   https://www.xuzhaoqing.com/            （自定义域名，base = "/"）
 *   https://pearsonxu.github.io/My-personal-Site/  （项目子路径，base = "/My-personal-Site/"）
 * 做法：HTML 里的资源用「按页面深度算好的相对路径」，
 *       JS 里的 fetch / 路由用「从自身模块 URL 反推出来的 base」。
 * 于是不需要为子路径重新构建，也不会出现刷新 404。
 */

/** 规范化 base：始终以 / 开头与结尾 */
export function normalizeBase(base) {
  let b = String(base ?? '/').trim();
  if (!b) b = '/';
  if (!b.startsWith('/')) b = `/${b}`;
  if (!b.endsWith('/')) b = `${b}/`;
  return b.replace(/\/{2,}/g, '/');
}

/**
 * 从模块自身 URL 反推站点 base。
 * @param {string} moduleUrl 例如 https://host/My-personal-Site/assets/js/app.js
 * @param {string} suffix    该模块相对站点根的路径，例如 "assets/js/app.js"
 */
export function baseFromModuleUrl(moduleUrl, suffix) {
  const url = String(moduleUrl || '');
  const clean = suffix.replace(/^\/+/, '');
  const idx = url.lastIndexOf(clean);
  if (idx < 0) return '/';
  const prefix = url.slice(0, idx);
  try {
    return normalizeBase(new URL(prefix).pathname);
  } catch {
    return normalizeBase(prefix.replace(/^[a-z]+:\/\/[^/]+/i, ''));
  }
}

/** 拼接 base 与站内路径，避免双斜杠 */
export function joinUrl(base, path) {
  const b = normalizeBase(base);
  const p = String(path ?? '').replace(/^\/+/, '');
  return `${b}${p}`;
}

/** 页面深度 → 回到站点根的相对前缀。depth=0 → "./"，depth=2 → "../../" */
export function relPrefix(depth) {
  const d = Math.max(0, Number(depth) || 0);
  return d === 0 ? './' : '../'.repeat(d);
}

/**
 * 媒体地址解析：绝对 URL / data URI 原样返回；相对路径挂到 mediaBase 或站点 base。
 * mediaBase 为空 → 用仓库内资源；填 CDN 前缀 → 整库迁移到对象存储。
 */
export function resolveMedia(src, { mediaBase = '', rel = './' } = {}) {
  const s = String(src ?? '');
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s) || /^data:/i.test(s) || /^blob:/i.test(s)) return s;
  const clean = s.replace(/^\/+/, '');
  if (mediaBase) return `${String(mediaBase).replace(/\/+$/, '')}/${clean}`;
  return `${rel}${clean}`;
}

/** 生成站内路由路径（不含 base，始终以 / 结尾，对应真实目录） */
export function routeFor(kind, slug) {
  switch (kind) {
    case 'home': return '';
    case 'library': return 'songs/';
    case 'song': return `songs/${slug}/`;
    case 'albums': return 'albums/';
    case 'album': return `albums/${slug}/`;
    case 'playlists': return 'playlists/';
    case 'playlist': return `playlists/${slug}/`;
    case 'notes': return 'notes/';
    case 'note': return `notes/${slug}/`;
    case 'about': return 'about/';
    case 'me': return 'me/';
    case 'status': return 'status/';
    default: return '';
  }
}

/** 解析站内路径 → { kind, slug }；无法识别返回 null */
export function parseRoute(pathname, base = '/') {
  const b = normalizeBase(base);
  let p = String(pathname || '/');
  if (p.startsWith(b)) p = p.slice(b.length);
  else if (b !== '/' && p.startsWith(b.slice(0, -1))) p = p.slice(b.length - 1);
  p = p.replace(/^\/+/, '').replace(/index\.html$/i, '');
  if (p && !p.endsWith('/')) p += '/';
  const seg = p.split('/').filter(Boolean);
  if (seg.length === 0) return { kind: 'home', slug: null };
  const [head, second] = seg;
  const single = { about: 'about', me: 'me', status: 'status' };
  if (seg.length === 1 && single[head]) return { kind: single[head], slug: null };
  const plural = { songs: ['library', 'song'], albums: ['albums', 'album'], playlists: ['playlists', 'playlist'], notes: ['notes', 'note'] };
  if (plural[head]) {
    if (seg.length === 1) return { kind: plural[head][0], slug: null };
    if (seg.length === 2) return { kind: plural[head][1], slug: second };
  }
  return null;
}

/** 是否是应该被 SPA 路由接管的站内导航 */
export function isInternalNavigable(href, { base = '/', origin = '' } = {}) {
  const raw = String(href || '');
  if (!raw) return false;
  if (/^(mailto:|tel:|javascript:|data:|blob:)/i.test(raw)) return false;
  if (raw.startsWith('#')) return false;
  let url;
  try {
    url = new URL(raw, origin || 'https://example.invalid');
  } catch {
    return false;
  }
  if (origin && url.origin !== origin) return false;
  if (/\.(mp3|m4a|aac|ogg|opus|wav|flac|png|jpe?g|gif|webp|svg|pdf|zip|lrc|json|txt|xml)$/i.test(url.pathname)) return false;
  if (!url.pathname.startsWith(normalizeBase(base))) return false;
  return parseRoute(url.pathname, base) !== null;
}

/** 规范链接：对外分享一律用它，而不是当前带 hash / 查询串的 URL */
export function canonicalUrl(siteUrl, kind, slug) {
  const root = String(siteUrl || '').replace(/\/+$/, '');
  return `${root}/${routeFor(kind, slug)}`;
}

/** 微信签名用的 URL：实际页面地址去掉 hash（保留查询串） */
export function signUrl(href) {
  return String(href || '').split('#')[0];
}