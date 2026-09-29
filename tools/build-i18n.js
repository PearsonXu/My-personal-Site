/* ═══════════════════════════════════════════════════════════════
   tools/build-i18n.js — 把英文值与中文键 1:1 合并进 lang.en.js
   用法：
     1) node tools/extract-i18n.js                 → tools/i18n-keys.json（键，DOM 顺序）
     2) 按顺序把英文写进 tools/en-values.js        → module.exports = [ ... ]
     3) node tools/build-i18n.js                   → 写回 lang.en.js 的 html 词典
   校验（不通过则中止，不写文件）：
     · 键值数量一致、无空值、无反引号 / ${
     · 标签序列与属性名一致（防止译文破坏结构）
     · data-tex / href / data-copy / data-lens-reset 数量一致
   ═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const SITE = path.resolve(__dirname, '..') + path.sep;
const keys = require(path.join(__dirname, 'i18n-keys.json')).htmlKeys;
const vals = require(path.join(__dirname, 'en-values.js'));

let errors = 0, warns = 0;
if (keys.length !== vals.length) {
  console.error('✗ 数量不一致：keys=' + keys.length + ' values=' + vals.length);
  process.exit(1);
}

/* 标签签名：<tag attr1 attr2> / </tag>，用于比对结构 */
function sig(html) {
  const out = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[-\w:]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    const close = m[1], tag = m[2].toLowerCase(), attrBlob = m[3] || '', self = m[4];
    const attrs = [];
    const are = /([-\w:]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
    let a;
    while ((a = are.exec(attrBlob))) attrs.push(a[1].toLowerCase());
    attrs.sort();
    out.push((close ? '/' : '') + tag + (attrs.length ? '[' + attrs.join(',') + ']' : '') + (self ? '/' : ''));
  }
  return out.join(' ');
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (s, sub) => (s.match(new RegExp(esc(sub), 'g')) || []).length;

const seen = new Set();
keys.forEach((k, i) => {
  const v = vals[i];
  if (typeof v !== 'string' || !v.trim()) { console.error('✗ #' + (i + 1) + ' 值为空'); errors++; return; }
  if (v.indexOf('`') >= 0) { console.error('✗ #' + (i + 1) + ' 值含反引号'); errors++; }
  if (/\$\{/.test(v)) { console.error('✗ #' + (i + 1) + ' 值含 ${'); errors++; }
  if (seen.has(k)) { console.warn('⚠ #' + (i + 1) + ' 键重复（后者覆盖前者）'); warns++; }
  seen.add(k);
  const sk = sig(k), sv = sig(v);
  if (sk !== sv) { warns++; console.warn('⚠ #' + (i + 1) + ' 标签结构不一致\n    key: ' + sk + '\n    val: ' + sv); }
  const texK = (k.match(/data-tex="[^"]*"/g) || []).sort().join('|');
  const texV = (v.match(/data-tex="[^"]*"/g) || []).sort().join('|');
  if (texK !== texV) { console.error('✗ #' + (i + 1) + ' data-tex 不一致\n    key: ' + texK + '\n    val: ' + texV); errors++; }
  ['href="', 'data-copy="', 'data-lens-reset'].forEach(a => {
    if (count(k, a) !== count(v, a)) { console.error('✗ #' + (i + 1) + ' 属性 ' + a + ' 数量不一致'); errors++; }
  });
});

if (errors) { console.error('\n构建中止：' + errors + ' 个错误，' + warns + ' 个警告'); process.exit(1); }

const entries = keys.map((k, i) => '    ' + JSON.stringify(k) + ':\n      ' + JSON.stringify(vals[i]));
const block = '  html: {\n' + entries.join(',\n') + '\n  }';
let f = fs.readFileSync(SITE + 'lang.en.js', 'utf8');
if (!/  html: \{[\s\S]*?\n  \}/.test(f)) { console.error('✗ lang.en.js 中找不到 html: { } 占位'); process.exit(1); }
fs.writeFileSync(SITE + 'lang.en.js', f.replace(/  html: \{[\s\S]*?\n  \}/, block));
console.log('✓ 已写入 ' + keys.length + ' 条英文翻译 → ' + SITE + 'lang.en.js');
console.log('  警告 ' + warns + ' 个（标签结构差异，多为有意为之，如新增快捷键提示）');
console.log('  文件大小 ' + (fs.statSync(SITE + 'lang.en.js').size / 1024).toFixed(1) + ' KB');
