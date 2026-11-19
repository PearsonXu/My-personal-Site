/** ui/common.js — Toast、弹层、DOM 小工具。所有弹层挂在 #overlay-root，与播放器互不影响。 */

import { escapeHtml } from '../core/util.js';
import { byId, tgt } from './dom.js';
import { icon } from '../core/icons.js';

export function toast(message, kind = '', timeout = 2600) {
  const host = byId('toasts');
  if (!host) return;
  const node = document.createElement('p');
  node.className = `toast${kind ? ` toast--${kind}` : ''}`;
  node.textContent = message;
  host.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s, transform .25s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 260);
  }, timeout);
}

export function fromHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

let openSheetRef = null;

export function closeSheet() {
  if (!openSheetRef) return;
  openSheetRef.remove();
  openSheetRef = null;
  // 全屏播放页也用到 is-locked，别把它的滚动锁一起解掉
  if (byId('player-root')?.dataset.expanded !== 'true') document.body.classList.remove('is-locked');
}

/**
 * 打开一个弹层。返回 { root, body, close }。
 * 弹层不进入 #page-root，路由换页时由 app 主动关闭，避免遮挡新页面。
 */
export function openSheet({ title, bodyHtml = '', footHtml = '', labelledBy = 'sheetTitle' }) {
  closeSheet();
  const root = fromHtml(`<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}">
    <div class="overlay__scrim" data-sheet-close></div>
    <div class="sheet">
      <div class="sheet__head">
        <h2 class="sheet__title" id="${labelledBy}">${escapeHtml(title)}</h2>
        <button class="icon-btn sheet__close" type="button" data-sheet-close aria-label="关闭">${icon('close', { size: 18 })}</button>
      </div>
      <div class="sheet__body">${bodyHtml}</div>
      ${footHtml ? `<div class="sheet__foot">${footHtml}</div>` : ''}
    </div>
  </div>`);
  byId('overlay-root')?.appendChild(root);
  openSheetRef = root;
  root.addEventListener('click', (e) => { if (tgt(e).closest('[data-sheet-close]')) closeSheet(); });
  const focusable = /** @type {any} */ (root.querySelector('input,button,select,textarea,[tabindex]'));
  focusable?.focus();
  return { root, body: root.querySelector('.sheet__body'), close: closeSheet };
}

export function isSheetOpen() { return !!openSheetRef; }

/** 让 range 的已填充部分跟着值走（WebKit 不支持 ::-moz-range-progress） */
export function paintRange(input) {
  if (!input) return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || 0);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--pct', `${pct}%`);
}

export function setText(id, text) {
  const node = byId(id);
  if (node && node.textContent !== text) node.textContent = text;
}

export function setIcon(id, icon) {
  const node = byId(id);
  if (node && node.textContent !== icon) node.textContent = icon;
}

/** 把某个容器里的图标换成指定 SVG（只在名字变化时替换，避免无谓重排） */
export function setSvg(id, name, size = 22) {
  const node = byId(id);
  if (!node || node.dataset.iconName === name) return;
  node.dataset.iconName = name;
  node.innerHTML = icon(name, { size });
}

/**
 * 可见的错误横幅 + 恢复入口。
 *
 * 刻意用**内联样式**：故障场景里 CSS 本身可能 404（例如被挂到错误深度的 404 页），
 * 那时依赖 class 的提示会跟着一起看不见。内联样式保证任何情况下都能读到、点到。
 * 同一时间只保留一条，避免异常风暴刷屏。
 */
let errorBanner = null;
export function showErrorBanner(message, { base = '/', detail = '' } = {}) {
  if (typeof document === 'undefined') return;
  if (errorBanner) errorBanner.remove();
  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'alert');
  wrap.style.cssText = [
    'position:fixed', 'left:12px', 'right:12px', 'top:12px', 'z-index:9999',
    'margin:0 auto', 'max-width:640px', 'padding:14px 16px',
    'background:#fff', 'color:#1f2329', 'border:1px solid rgba(17,24,39,.16)',
    'border-left:4px solid #d92b2b', 'border-radius:12px',
    'box-shadow:0 12px 32px -16px rgba(20,30,50,.5)',
    'font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",Helvetica,Arial,sans-serif'
  ].join(';');
  const home = `${base}`.endsWith('/') ? base : `${base}/`;
  wrap.innerHTML = `
    <p style="margin:0 0 4px;font-weight:600">页面出了点问题</p>
    <p style="margin:0;color:#4e5969">${escapeHtml(message)}</p>
    ${detail ? `<p style="margin:6px 0 0;color:#86909c;font-size:12px;word-break:break-all">${escapeHtml(detail)}</p>` : ''}
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
      <button type="button" data-err="reload" style="min-height:40px;padding:8px 16px;border-radius:999px;border:1px solid transparent;background:#e02f2f;color:#fff;font:inherit;font-weight:600;cursor:pointer">重新加载</button>
      <a href="${home}" data-err="home" style="display:inline-flex;align-items:center;min-height:40px;padding:8px 16px;border-radius:999px;border:1px solid rgba(17,24,39,.16);color:#1f2329;text-decoration:none">回首页</a>
      <button type="button" data-err="dismiss" style="min-height:40px;padding:8px 16px;border-radius:999px;border:1px solid rgba(17,24,39,.16);background:transparent;color:#4e5969;font:inherit;cursor:pointer">先关掉</button>
    </div>`;
  wrap.addEventListener('click', (e) => {
    const act = tgt(e).closest?.('[data-err]')?.dataset.err;
    if (act === 'reload') location.reload();
    else if (act === 'dismiss') { wrap.remove(); errorBanner = null; }
  });
  document.body.appendChild(wrap);
  errorBanner = wrap;
  return wrap;
}

/** 复制文本：优先 Clipboard API，失败回退到 execCommand，再失败就让用户手动复制 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* 继续回退 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export function download(filename, content, mime = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}