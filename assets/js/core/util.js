/**
 * core/util.js — 纯函数工具。浏览器 / Node 构建 / 测试三处共用，禁止触碰 DOM。
 */

/** 秒 → m:ss（负数与 NaN 一律归零，避免 UI 出现 NaN:NaN） */
export function formatTime(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return '0:00';
  const total = Math.floor(n);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? `${h}:` : '') + `${mm}:${String(s).padStart(2, '0')}`;
}

/** "m:ss" / "h:mm:ss" / 纯秒数 → 秒；无法解析返回 null */
export function parseTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const str = value.trim();
  if (!str) return null;
  if (/^\d+(\.\d+)?$/.test(str)) return Number(str);
  const parts = str.split(':');
  if (parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return total;
}

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** HTML 文本转义。所有来自内容文件的字符串进入模板前必须过这里。 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 属性值转义（同 escapeHtml，语义别名，便于审计） */
export const escapeAttr = escapeHtml;

/** URL 片段安全化：只允许 a-z0-9-，用于 slug 校验 */
export function isSafeSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug);
}

export function slugify(input) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'untitled';
}

/** 单调递增 ID 生成器：同一首歌重复入队也必须拿到不同 ID。 */
export function createIdFactory(prefix = 'q') {
  let n = 0;
  return () => `${prefix}${Date.now().toString(36)}-${(n++).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** 去掉 HTML 标签，压平空白。用于搜索索引与 og:description。 */
export function stripTags(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text, max = 160) {
  const str = String(text ?? '');
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1).trimEnd()}…`;
}

/** 稳定排序：日期倒序，同日按 slug，保证构建可复现。 */
export function byDateDesc(a, b) {
  const d = String(b.date || '').localeCompare(String(a.date || ''));
  return d !== 0 ? d : String(a.slug).localeCompare(String(b.slug));
}

/** 简易防抖（浏览器用；Node 测试里可直接调用 .flush()） */
export function debounce(fn, wait = 200) {
  let timer = null;
  let lastArgs = null;
  const wrapped = (...args) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...lastArgs); }, wait);
  };
  wrapped.flush = () => { if (timer) { clearTimeout(timer); timer = null; fn(...(lastArgs || [])); } };
  wrapped.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return wrapped;
}