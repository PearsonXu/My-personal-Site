/**
 * tools/lib/markdown.mjs — 手记用的 Markdown 子集渲染器（零依赖、确定性、默认转义）。
 *
 * 支持：标题、段落、粗体 / 斜体 / 行内代码、链接、图片、有序 / 无序列表、
 *       引用、分隔线、围栏代码块。
 * 不支持：原始 HTML（一律转义）、表格、脚注 —— 手记不需要，减少注入面。
 */

import { escapeHtml } from '../../assets/js/core/util.js';

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

function safeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  // 转义后 & 变成 &amp;，判断协议时先还原
  const decoded = u.replace(/&amp;/g, '&');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(decoded);
  if (scheme) return ALLOWED_SCHEMES.has(scheme[1].toLowerCase()) ? u : '';
  // 没有协议 = 相对路径或锚点，允许
  return u;
}

/** 行内元素。输入必须已经过 escapeHtml。 */
function inline(text) {
  const codes = [];
  let out = String(text).replace(/`([^`]+)`/g, (_m, code) => {
    codes.push(code);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });

  // 图片先于链接
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_m, alt, url, title) => {
    const href = safeUrl(url);
    if (!href) return alt;
    const t = title ? ` title="${title}"` : '';
    return `<img src="${href}" alt="${alt}"${t} loading="lazy" decoding="async">`;
  });

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    const href = safeUrl(url);
    if (!href) return label;
    const external = /^https?:\/\//i.test(href.replace(/&amp;/g, '&'));
    const rel = external ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${href}"${rel}>${label}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)]}</code>`);
  return out;
}

/**
 * @param {string} src Markdown 源文本
 * @returns {string} 安全 HTML
 */
export function renderMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;

  const isBlank = (s) => !s.trim();

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) { i++; continue; }

    // 围栏代码块
    const fence = line.match(/^\s*```(\S*)\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // 跳过收尾 ```
      const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
      html.push(`<pre><code${cls}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 分隔线
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { html.push('<hr>'); i++; continue; }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
      html.push(`<h${level} id="${escapeHtml(id)}">${inline(escapeHtml(text))}</h${level}>`);
      i++;
      continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    // 列表
    const ul = /^\s*[-*+]\s+/;
    const ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const pattern = ordered ? ol : ul;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) {
        const buf = [lines[i].replace(pattern, '')];
        i++;
        // 续行（缩进且非新列表项）
        while (i < lines.length && !isBlank(lines[i]) && !pattern.test(lines[i]) && /^\s{2,}/.test(lines[i])) {
          buf.push(lines[i].trim());
          i++;
        }
        items.push(`<li>${inline(escapeHtml(buf.join(' ')))}</li>`);
      }
      html.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    // 段落
    const buf = [];
    while (i < lines.length && !isBlank(lines[i])
      && !/^\s*```/.test(lines[i])
      && !/^(#{1,6})\s/.test(lines[i])
      && !/^\s*>\s?/.test(lines[i])
      && !ul.test(lines[i]) && !ol.test(lines[i])
      && !/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    if (buf.length) html.push(`<p>${inline(escapeHtml(buf.join('\n'))).replace(/\n/g, '<br>')}</p>`);
  }

  return html.join('\n');
}

/** 抽取 JSON frontmatter：--- { ... } --- 之后是正文 */
export function parseFrontmatter(source) {
  const text = String(source ?? '').replace(/^\uFEFF/, '');
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) return { data: {}, body: text };
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (err) {
    throw new Error(`frontmatter 不是合法 JSON：${err.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('frontmatter 必须是 JSON 对象');
  }
  return { data, body: text.slice(match[0].length) };
}