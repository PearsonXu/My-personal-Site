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