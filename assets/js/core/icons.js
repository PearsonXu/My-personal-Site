/**
 * core/icons.js — 播放器专用内联 SVG 图标集。
 *
 * 设计约束（整套统一）：
 *  - 统一 24×24 视图框、统一视觉重心（几何中心 12,12）
 *  - 走带控件（播放/暂停/上一首/下一首）用**实心**图形，视觉重量一致
 *  - 功能图标用**1.8px 描边**、圆头圆角，与实心走带同一网格
 *  - 播放三角做**光学居中**：路径本身右移约 1.2px，
 *    因此播放↔暂停切换时 SVG 盒子不动，图标不会跳位
 *  - 纯字符串，无 DOM、无外部依赖：构建期模板与浏览器共用同一份
 */

/** 实心图形（走带控件 + 实心心形） */
const SOLID = new Set(['play', 'pause', 'prev', 'next', 'heart-filled']);

const PATHS = {
  /* ── 走带：同一高度 11.2、同一 vertical center 12 ── */
  // bbox x 8.8–17.8 → 中心 13.3，相对 12 右移 1.3px 做光学居中
  play: '<path d="M8.8 6.4 17.8 12 8.8 17.6Z"/>',
  // 双竖条：宽 3.4、间隔 3.2、总跨度 7–17 → 中心 12
  pause: '<rect x="7" y="6.4" width="3.4" height="11.2" rx="1.1"/><rect x="13.6" y="6.4" width="3.4" height="11.2" rx="1.1"/>',
  // 竖线 + 三角，跨度 6–18 → 中心 12
  prev: '<rect x="6" y="6.4" width="2.2" height="11.2" rx="1"/><path d="M18 6.4 18 17.6 9.4 12Z"/>',
  next: '<path d="M6 6.4 6 17.6 14.6 12Z"/><rect x="15.8" y="6.4" width="2.2" height="11.2" rx="1"/>',

  /* ── 播放模式 ── */
  'mode-order': '<path d="M4 12h12.6"/><path d="M13.2 8.4 16.8 12l-3.6 3.6"/>',
  'mode-repeat': '<path d="M17 3.6 20 6.6l-3 3"/><path d="M4 12v-1.9A3.5 3.5 0 0 1 7.5 6.6H20"/><path d="M7 20.4 4 17.4l3-3"/><path d="M20 12v1.9a3.5 3.5 0 0 1-3.5 3.5H4"/>',
  'mode-repeat-one': '<path d="M17 3.6 20 6.6l-3 3"/><path d="M4 12v-1.9A3.5 3.5 0 0 1 7.5 6.6H20"/><path d="M7 20.4 4 17.4l3-3"/><path d="M20 12v1.9a3.5 3.5 0 0 1-3.5 3.5H4"/><path d="M11.1 10.7 12.8 9.7v4.6"/>',
  'mode-shuffle': '<path d="M4 7h3.4l9.2 10H20"/><path d="M4 17h3.4l3-3.3"/><path d="M13.6 10.3 16.6 7H20"/><path d="M17.4 4.4 20 7l-2.6 2.6"/><path d="M17.4 14.4 20 17l-2.6 2.6"/>',

  /* ── 收藏 ── */
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8Z"/>',
  'heart-filled': '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8Z"/>',

  /* ── 队列 / 分享 / 音量 ── */
  queue: '<path d="M4 7h11M4 12h11M4 17h7"/><path d="M17 12.4 21 15l-4 2.6Z" fill="currentColor" stroke="none"/>',
  'queue-next': '<path d="M5 4.5h14"/><path d="M12 20V8.6"/><path d="M8.2 12.4 12 8.6l3.8 3.8"/>',
  plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
  share: '<path d="M12 15.4V4"/><path d="M8.4 7.6 12 4l3.6 3.6"/><path d="M5 13.6v4.9A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-4.9"/>',
  volume: '<path d="M4 9.4h3L11.6 5.8v12.4L7 14.6H4Z"/><path d="M15 9.2a4 4 0 0 1 0 5.6"/><path d="M17.7 6.5a7.7 7.7 0 0 1 0 11"/>',
  'volume-low': '<path d="M4 9.4h3L11.6 5.8v12.4L7 14.6H4Z"/><path d="M15 9.2a4 4 0 0 1 0 5.6"/>',
  'volume-mute': '<path d="M4 9.4h3L11.6 5.8v12.4L7 14.6H4Z"/><path d="M15.4 9.6 20.4 14.4M20.4 9.6 15.4 14.4"/>',

  /* ── 视图 / 展开 ── */
  expand: '<path d="M9.2 4H4v5.2M14.8 4H20v5.2M14.8 20H20v-5.2M9.2 20H4v-5.2"/>',
  'chevron-down': '<path d="M6.5 9.8 12 15.2l5.5-5.4"/>',
  'chevron-up': '<path d="M6.5 14.2 12 8.8l5.5 5.4"/>',
  close: '<path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"/>',
  disc: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2.2"/>',
  cover: '<rect x="4" y="5" width="16" height="14" rx="2.4"/><path d="M4 15.6 8.4 11.6l3.8 3.4 3-2.4L20 16"/><circle cx="9" cy="9.4" r="1.3"/>',
  lyrics: '<path d="M5 6.4h14M5 10.8h10M5 15.2h14M5 19.6h8"/>',

  /* ── 头部 / 导航 ── */
  search: '<circle cx="11" cy="11" r="6.4"/><path d="M15.8 15.8 20.5 20.5"/>',
  palette: '<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8Z" fill="currentColor" stroke="none"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  home: '<path d="M4 11 12 4.6 20 11v7.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5Z"/>',
  note: '<path d="M10 17.4V6.2l8-1.6v11.2"/><circle cx="7.8" cy="17.4" r="2.2"/><circle cx="15.8" cy="15.8" r="2.2"/>',
  pen: '<path d="M4 20h4L20 8l-4-4L4 16Z"/><path d="M14.6 5.4 18.6 9.4"/>',
  user: '<circle cx="12" cy="8.4" r="3.8"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.2v4h-4"/>',
  download: '<path d="M12 4v11"/><path d="M8 11.4 12 15.4l4-4"/><path d="M5 20h14"/>',
  check: '<path d="M5.2 12.6 9.6 17 18.8 7.4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M15 6.6V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.6"/>',
  probe: '<path d="M4 9h13"/><path d="M14 6 17 9l-3 3"/><path d="M20 15H7"/><path d="M10 12 7 15l3 3"/>'
};

/** 播放模式 → 图标名（UI 关注点，不放进纯逻辑的 queue.js） */
export const MODE_ICON = {
  order: 'mode-order',
  'repeat-all': 'mode-repeat',
  'repeat-one': 'mode-repeat-one',
  shuffle: 'mode-shuffle'
};

/** 播放页舞台 → 图标名 */
export const STAGE_ICON = { cover: 'cover', vinyl: 'disc', lyrics: 'lyrics' };

export const ICON_NAMES = Object.keys(PATHS);

/**
 * 生成内联 SVG 字符串。
 * @param {string} name 图标名
 * @param {{size?:number, className?:string}} [options]
 * @returns {string}
 */
export function icon(name, { size = 24, className = '' } = {}) {
  const body = PATHS[name];
  if (!body) throw new Error(`未知图标：${name}`);
  const paint = SOLID.has(name)
    ? 'fill="currentColor"'
    : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const cls = `icon icon--${name}${className ? ` ${className}` : ''}`;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" ${paint} aria-hidden="true" focusable="false">${body}</svg>`;
}

/** 播放/暂停双图标：两个都渲染，靠 CSS 按播放状态切换，彻底避免跳位与重排 */
export function toggleIcons({ size = 24 } = {}) {
  return `<span class="pbtn__glyph pbtn__glyph--play">${icon('play', { size })}</span>`
    + `<span class="pbtn__glyph pbtn__glyph--pause">${icon('pause', { size })}</span>`;
}