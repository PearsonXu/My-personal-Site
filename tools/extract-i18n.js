/* ═══════════════════════════════════════════════════════════════
   tools/extract-i18n.js — 抽取所有需要英文翻译的键
   用法：node tools/extract-i18n.js   （需要 dev 依赖 jsdom）
   原理：用 jsdom 跑真实的 index.html + script.js + lang.en.js，
        读取引擎自己上报的缺失键（window.__zxMissingI18n），
        因此键与浏览器中完全一致（含 KaTeX 渲染顺序的影响）。
   输出：i18n-keys.json（机器读）与 i18n-keys.txt（人读）
   ═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

/* jsdom 解析：优先本地 node_modules，其次全局，最后回退到临时目录 */
function loadJsdom() {
  const cands = ['jsdom', '/tmp/zxtest/node_modules/jsdom'];
  for (const c of cands) { try { return require(c); } catch (e) { /* 下一个 */ } }
  console.error('✗ 找不到 jsdom。请先安装：npm i -D jsdom');
  process.exit(1);
}
const { JSDOM, VirtualConsole } = loadJsdom();

const SITE = path.resolve(__dirname, '..') + path.sep;
const OUT = __dirname + path.sep;
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Not implemented/i.test(e.message)) console.error('jsdomError:', e.message); });
vc.on('error', (...a) => console.error('console.error:', a.map(String).join(' ')));

let html = fs.readFileSync(SITE + 'index.html', 'utf8');
html = html.replace(/<link rel="stylesheet" href="https:\/\/cdn[^>]*>/g, '');
html = html.replace(/<script defer src="https:\/\/cdn[^>]*><\/script>/g, '');
html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>/g, '');
html = html.replace(/<script defer src="lang\.en\.js"><\/script>/, '');
html = html.replace(/<script src="script\.js" defer><\/script>/, '');

const dict = fs.readFileSync(SITE + 'lang.en.js', 'utf8');
const js = fs.readFileSync(SITE + 'script.js', 'utf8');
html = html.replace('</body>', () => '<script>' + dict + '\n' + js + '</' + 'script></body>');

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'http://localhost/index.html', virtualConsole: vc
});

setTimeout(() => {
  const w = dom.window;
  const api = w.__i18n;
  if (!api) { console.error('✗ 引擎未暴露 window.__i18n'); process.exit(2); }
  const missing = w.__zxMissingI18n || [];
  const isAttr = k => /^(aria-label|title|placeholder)\|/.test(k);
  /* 全量键（DOM 顺序）——词典完整时 missing 为空，但重建仍需要全量键 */
  const htmlKeys = api.keys();
  const attrKeys = api.attrKeys();
  const missingHtml = missing.filter(k => !isAttr(k));
  const missingAttr = missing.filter(k => isAttr(k));

  fs.writeFileSync(OUT + 'i18n-keys.json',
    JSON.stringify({ totalUnits: api.units(), htmlKeys, attrKeys, missingHtml, missingAttr }, null, 2));
  fs.writeFileSync(OUT + 'i18n-keys.txt',
    htmlKeys.map((k, i) => '#' + (i + 1) + (missingHtml.indexOf(k) >= 0 ? ' [缺]' : '') + '  ' + k).join('\n\n') +
    '\n\n=== ATTR (' + attrKeys.length + ') ===\n' + attrKeys.join('\n') + '\n');

  console.log('i18n 单元总数 = ' + api.units() + '（html 键 ' + htmlKeys.length + ' + attr 键 ' + attrKeys.length + '）');
  console.log('缺失英文条目 = ' + missing.length + (missing.length ? '（清单见 i18n-keys.txt 中带 [缺] 的行）' : ' ✓ 词典完整'));
  console.log('已写入', OUT + 'i18n-keys.txt');
  process.exit(missing.length ? 1 : 0);
}, 900);
