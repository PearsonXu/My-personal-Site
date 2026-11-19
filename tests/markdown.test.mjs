import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, parseFrontmatter } from '../tools/lib/markdown.mjs';

test('markdown · 基本块级元素', () => {
  const html = renderMarkdown('# 标题\n\n段落一\n\n- 甲\n- 乙\n\n1. 一\n2. 二\n\n> 引用\n\n---\n');
  assert.match(html, /<h1 id="标题">标题<\/h1>/);
  assert.match(html, /<p>段落一<\/p>/);
  assert.match(html, /<ul><li>甲<\/li><li>乙<\/li><\/ul>/);
  assert.match(html, /<ol><li>一<\/li><li>二<\/li><\/ol>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<hr>/);
});

test('markdown · 行内元素', () => {
  const html = renderMarkdown('**粗** 与 *斜* 与 `code` 与 [链接](https://x.com) 与 ~~删~~');
  assert.match(html, /<strong>粗<\/strong>/);
  assert.match(html, /<em>斜<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<a href="https:\/\/x\.com" target="_blank" rel="noopener">链接<\/a>/);
  assert.match(html, /<del>删<\/del>/);
});

test('markdown · 站内相对链接不加 target=_blank', () => {
  const html = renderMarkdown('[手记](../notes/)');
  assert.match(html, /<a href="\.\.\/notes\/">手记<\/a>/);
  assert.ok(!html.includes('target="_blank"'));
});

test('markdown · 原始 HTML 一律转义（防注入）', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('onerror="alert'));
  assert.match(html, /&lt;script&gt;/);
});

test('markdown · 危险协议链接被剥离', () => {
  const html = renderMarkdown('[点我](javascript:alert(1)) 和 [data](data:text/html;base64,AAA)');
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('href="data:'));
  assert.match(html, /点我/);
});

test('markdown · 围栏代码块内容不被解析', () => {
  const html = renderMarkdown('```js\nconst a = "<b>x</b>";\n```');
  assert.match(html, /<pre><code class="lang-js">/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.ok(!html.includes('<b>x</b>'));
});

test('markdown · 图片带懒加载', () => {
  const html = renderMarkdown('![封面](assets/img/a.png)');
  assert.match(html, /<img src="assets\/img\/a\.png" alt="封面" loading="lazy"/);
});

test('frontmatter · JSON 头与正文分离', () => {
  const { data, body } = parseFrontmatter('---\n{"slug":"x","title":"标题"}\n---\n# 正文');
  assert.equal(data.slug, 'x');
  assert.equal(body.trim(), '# 正文');
});

test('frontmatter · 非法 JSON 明确报错', () => {
  assert.throws(() => parseFrontmatter('---\n{坏的}\n---\n正文'), /不是合法 JSON/);
  assert.throws(() => parseFrontmatter('---\n[1,2]\n---\n正文'), /必须是 JSON 对象/);
});

test('frontmatter · 没有头时整篇都是正文', () => {
  const { data, body } = parseFrontmatter('# 只有正文');
  assert.deepEqual(data, {});
  assert.equal(body, '# 只有正文');
});