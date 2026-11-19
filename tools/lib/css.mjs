/**
 * tools/lib/css.mjs — 布局 CSS 合成器。
 *
 * 需求：布局有「自动 / 桌面 / 手机」三档，且与主题独立。
 * 同一份手机规则必须同时满足两种生效方式：
 *   1. auto  → 只在屏幕 ≤ 断点时生效
 *   2. mobile→ 无条件生效（宽屏上也要长成手机样，便于验证）
 * 手写两遍必然走样，所以这里在构建期把同一份源规则加上不同作用域产出两份。
 */

/** 去掉注释（保留字符串内容不影响，因为我们只处理选择器与声明块） */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 按顶层逗号切分选择器（不切 :is(a,b) 之类括号内的逗号） */
function splitSelectors(prelude) {
  const parts = [];
  let depth = 0;
  let buf = '';
  for (const ch of prelude) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((s) => s.trim()).filter(Boolean);
}

function prefixSelector(selector, scope) {
  if (selector.startsWith(':root')) return `${scope}${selector.slice(5)}`;
  if (selector.startsWith('html')) return `${scope}${selector.slice(4)}`;
  return `${scope} ${selector}`;
}

/** 找到与 open 位置匹配的右花括号 */
function matchBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) return i; }
  }
  throw new Error('CSS 花括号不匹配');
}

const NESTABLE_AT = /^@(media|supports|layer|container)\b/;

/**
 * 给一份 CSS 的每条规则加上作用域前缀。
 * @param {string} source 只含普通规则（可含 @media 等可嵌套 at-rule）
 * @param {string} scope  例如 html[data-layout="mobile"]
 */
export function scopeCss(source, scope) {
  const css = stripComments(String(source || ''));
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    const close = matchBrace(css, open);
    const body = css.slice(open + 1, close);
    if (!prelude) { i = close + 1; continue; }
    if (prelude.startsWith('@')) {
      if (NESTABLE_AT.test(prelude)) out.push(`${prelude}{${scopeCss(body, scope)}}`);
      else out.push(`${prelude}{${body}}`); // @keyframes / @font-face 原样保留
    } else {
      const selectors = splitSelectors(prelude).map((s) => prefixSelector(s, scope));
      out.push(`${selectors.join(', ')} {${body}}`);
    }
    i = close + 1;
  }
  return out.join('\n');
}

/**
 * 合成最终 layout.css。
 * @param {{tablet:string, mobile:string, narrow:string, desktop:string}} sources
 */
export function composeLayout({ tablet, mobile, narrow, desktop }) {
  const AUTO = 'html[data-layout="auto"]';
  const MOBILE = 'html[data-layout="mobile"]';
  const DESKTOP = 'html[data-layout="desktop"]';
  const chunks = [
    '/* 本文件由 tools/lib/css.mjs 在构建期生成，请勿手改。',
    '   源文件：assets/css/layout-{tablet,mobile,narrow,desktop}.css */',
    '',
    '/* 平板：auto 按宽度；手动手机布局无条件 */',
    `@media (max-width:1000px) {\n${scopeCss(tablet, AUTO)}\n}`,
    scopeCss(tablet, MOBILE),
    '',
    '/* 手机：auto 按宽度；手动手机布局无条件 */',
    `@media (max-width:760px) {\n${scopeCss(mobile, AUTO)}\n}`,
    scopeCss(mobile, MOBILE),
    '',
    '/* 极窄屏 */',
    `@media (max-width:400px) {\n${scopeCss(narrow, AUTO)}\n}`,
    scopeCss(narrow, MOBILE),
    '',
    '/* 手动桌面布局 + 窄屏：保持桌面结构但不溢出 */',
    `@media (max-width:900px) {\n${scopeCss(desktop, DESKTOP)}\n}`
  ];
  return `${chunks.join('\n')}\n`;
}