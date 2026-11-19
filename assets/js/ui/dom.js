/**
 * ui/dom.js — DOM 访问边界。
 *
 * 这些查询显式标注为宽松类型：DOM 结构由构建期模板保证（tools/typecheck.mjs 会校验
 * 每个 id / data-act 契约确实存在），逻辑层因此仍受完整的 TypeScript 检查。
 */

/** @type {(id: string) => any} */
export const byId = (id) => document.getElementById(id);

/** @type {(selector: string, root?: any) => any} */
export const qs = (selector, root) => (root || document).querySelector(selector);

/** @type {(selector: string, root?: any) => any[]} */
export const qsa = (selector, root) => Array.from((root || document).querySelectorAll(selector));

/** @type {(event: any) => any} */
export const tgt = (event) => event.target;