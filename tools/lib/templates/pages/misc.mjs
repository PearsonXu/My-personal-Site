import { escapeHtml as esc, escapeAttr as attr } from '../../../../assets/js/core/util.js';
import { sectionHead, emptyState } from '../components.mjs';
import { icon } from '../../../../assets/js/core/icons.js';

export function renderAbout(model, { rel }) {
  const { site } = model;
  const body = `<section class="sec"><div class="wrap wrap--prose">
  ${sectionHead({ no: '§ 关于', kicker: 'About', title: '关于我', lede: esc(site.author?.bio || '') })}
  <dl class="kv">
    <div><dt>署名</dt><dd>${esc(site.author?.name || '')}</dd></div>
    ${site.author?.github ? `<div><dt>GitHub</dt><dd><a class="link" href="${attr(site.author.github)}" target="_blank" rel="noopener">${esc(site.author.github)} ↗</a></dd></div>` : ''}
  </dl>

  <h2 class="sub">这里放什么</h2>
  <ul class="bullets">
    <li><strong>音乐</strong>：喜欢的歌、自己的尝试，收在单曲、专辑和歌单里。每首都有自己的页面，可以直接分享。</li>
    <li><strong>手记</strong>：旋律带来的故事与心情，还有听歌时想到的事。</li>
    <li><strong>歌词</strong>：能跟着唱的那种，当前句会亮起来，点一句就跳过去。</li>
  </ul>

  <h2 class="sub">怎么听</h2>
  <ul class="bullets">
    <li>无需登录，点开就能听。</li>
    <li>在站内翻页面、读手记、换外观，歌都不会断。</li>
    <li>收藏、最近播放和进度只留在这台设备的这个浏览器里，不是账号，也不会同步到别处。</li>
  </ul>

  <h2 class="sub">三套外观</h2>
  <p>右上角「外观」里可以换：<strong>清爽云音乐</strong>（白 / 浅灰 / 红）、
  <strong>森林音乐小屋</strong>（森林绿 / 暖纸 / 琥珀）、<strong>午夜黑胶</strong>（深蓝紫 / 夜景 / 黑胶）。
  布局另有「自动 / 桌面 / 手机」三档，和外观互相独立。换这些都不会打断正在放的歌。</p>
  <p class="hero__cta"><button class="btn btn--pri" type="button" data-act="open-appearance">${icon('palette', { size: 18 })} 打开外观与布局</button></p>
</div></section>`;

  return {
    kind: 'about', slug: null,
    meta: { title: `关于 — ${site.title}`, description: site.author?.bio || site.description, image: 'assets/img/og/default.png' },
    body
  };
}

export function renderMe(model, { rel }) {
  const { site } = model;
  const body = `<section class="sec"><div class="wrap">
  ${sectionHead({ no: '§ 我的', kicker: 'Local', title: '我的', lede: '收藏、最近播放和进度都留在这台设备的这个浏览器里。换设备、换浏览器或清理站点数据就会没有了——不是账号，也不会同步到别处。' })}

  <h2 class="sub">收藏 <span class="count" id="favCount">0</span></h2>
  <div id="favList">${emptyState({ icon: 'heart', title: '还没有收藏', text: '在任意歌曲上点心形图标即可收藏。收藏只存在这台设备的这个浏览器里。' })}</div>

  <h2 class="sub">最近播放 <span class="count" id="recentCount">0</span></h2>
  <div id="recentList">${emptyState({ icon: 'refresh', title: '还没有播放记录', text: '播放过的歌会出现在这里，最多保留 50 条。' })}</div>

  <h2 class="sub">当前队列 <span class="count" id="queueCount">0</span></h2>
  <div id="queueList">${emptyState({ icon: 'queue', title: '队列是空的', text: '去曲库挑几首，或者播放一张专辑 / 歌单。' })}</div>

  <h2 class="sub">整理一下</h2>
  <div class="hero__cta">
    <button class="btn" type="button" data-act="export-local">${icon('download', { size: 18 })} 导出备份</button>
    <button class="btn btn--quiet" type="button" data-act="clear-favorites">清空收藏</button>
    <button class="btn btn--quiet" type="button" data-act="clear-recent">清空最近播放</button>
    <button class="btn btn--danger" type="button" data-act="clear-all">清空全部</button>
  </div>
  <p class="note">导出的是你自己的收藏、最近播放和队列，留个备份就好。</p>
</div></section>`;
  return {
    kind: 'me', slug: null,
    meta: { title: `我的 — ${site.title}`, description: '本地收藏、最近播放与队列。数据只存在当前浏览器。', image: 'assets/img/og/default.png' },
    body
  };
}
export function renderStatus(model, { rel }) {
  const { site } = model;
  const body = `<section class="sec"><div class="wrap">
  ${sectionHead({ no: '§ 自检', kicker: 'Check', title: '播放自检', lede: '如果听不了或者拖不动进度，来这里点两下，看看是这台设备的浏览器的问题，还是音源的问题。' })}

  <h2 class="sub">这台设备能不能好好播</h2>
  <p class="c-dim">点一下，结果直接来自你当前的浏览器。</p>
  <div class="hero__cta">
    <button class="btn btn--pri" type="button" data-act="run-diagnostics">${icon('play', { size: 20 })} 开始自检</button>
  </div>
  <div id="diagOut" class="diag"><p class="c-mute">还没开始。</p></div>

  <h2 class="sub">能不能边下边播、能不能拖进度</h2>
  <p class="c-dim">拿曲库里的第一首歌试一下。拖动进度条好不好用，取决于这一步。</p>
  <div class="hero__cta">
    <button class="btn" type="button" data-act="probe-audio">${icon('probe', { size: 18 })} 试一试</button>
  </div>
  <div id="probeOut" class="diag"><p class="c-mute">还没开始。</p></div>

  <h2 class="sub">一个实验性开关</h2>
  <div class="panel">
    <p class="panel__head">锁屏继续播放（iOS）</p>
    <p class="c-dim">iPhone 上的一个实验性设置，有些系统版本里能帮上忙。默认<strong>关闭</strong>，随时可以关掉——它不是保证。</p>
    <label class="switch"><input type="checkbox" id="audioSessionToggle" data-act="toggle-audio-session"><span>试试这个开关</span></label>
    <p class="note" id="audioSessionState">先跑一次自检就能看到状态。</p>
  </div>

  <h2 class="sub">关于后台播放，说点实话</h2>
  <ul class="bullets">
    <li><strong>当前这首歌</strong>切到后台或锁屏继续播：手机自带浏览器一般可以。</li>
    <li><strong>播完自动接下一首</strong>：不保证。页面被系统睡过去之后，就没法帮你换歌了。</li>
    <li>这里不用任何小手段去假装绕过限制。</li>
    <li>想长时间听，建议用手机自带的浏览器；微信里可以点右上角「在浏览器打开」。</li>
  </ul>
  <p class="note">上面只说明「这台设备的浏览器支持什么」。后台能不能连续切歌，需要在真机上实际听过才知道。</p>
</div></section>`;
  return {
    kind: 'status', slug: null,
    meta: { title: `播放自检 — ${site.title}`, description: '检查这台设备的浏览器能不能好好播放：能力自检、边下边播与拖进度、后台播放的真实边界。', image: 'assets/img/og/default.png' },
    body
  };
}

/**
 * 独立 404 页。
 *
 * ★ 这是白屏故障的第二个根因：GitHub Pages 会把 404.html 挂在**任意深度**的
 *   未匹配 URL 上（例如 /notes/songs/）。原来它用 `./assets/...` 相对路径，
 *   于是被按那个深度解析 → CSS / JS 全部 404 → 内容在但样式全丢，看着就是白屏，
 *   而且刷新仍然停在同一个坏 URL 上，永远恢复不了。
 *
 * 因此这一页：
 *  - 内联全部样式，**零外部请求**，无论部署在什么路径都能正常显示；
 *  - 链接用运行时 base 修正（app.js 启动时写入 zx.music.base），默认站点根；
 *  - 提供明确的恢复入口：回首页 / 返回上一页 / 去曲库。
 */
export function renderStandaloneNotFound(site) {
  const name = esc(site.author?.name || '金石竹青');
  const title = esc(site.title || '音乐小屋');
  return `<!DOCTYPE html>
<html lang="${attr(site.lang || 'zh-CN')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>这一页不在小屋里 — ${title}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body {
    min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: #f5f6f8; color: #1f2329;
    font: 16px/1.75 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Helvetica, Arial, sans-serif;
  }
  .box { width: 100%; max-width: 560px; background: #fff; border: 1px solid rgba(17,24,39,.09);
         border-radius: 16px; padding: 32px 28px; box-shadow: 0 10px 30px -18px rgba(20,30,50,.45); }
  .code { font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          letter-spacing: .14em; color: #e02f2f; text-transform: uppercase; }
  h1 { font-size: 1.5rem; line-height: 1.35; margin: 12px 0 10px; letter-spacing: -.01em; }
  p { color: #4e5969; font-size: .95rem; }
  .path { margin-top: 14px; padding: 10px 12px; border-radius: 8px; background: #f7f8fa;
          border: 1px solid rgba(17,24,39,.09); color: #86909c; word-break: break-all;
          font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .acts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
  a, button { font: inherit; cursor: pointer; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
         min-height: 44px; padding: 10px 20px; border-radius: 999px; text-decoration: none;
         border: 1px solid rgba(17,24,39,.16); background: transparent; color: #1f2329; }
  .btn--pri { background: #e02f2f; color: #fff; border-color: transparent; font-weight: 600; }
  .btn:hover { border-color: rgba(17,24,39,.28); }
  .btn--pri:hover { border-color: transparent; }
  .btn:focus-visible { outline: 2px solid #e02f2f; outline-offset: 3px; }
  .foot { margin-top: 20px; font-size: .82rem; color: #86909c; }
  @media (max-width: 480px) { .box { padding: 24px 20px; } .acts .btn { flex: 1 1 100%; } }
</style>
</head>
<body>
<div class="box">
  <p class="code">404 · Not Found</p>
  <h1>这一页不在小屋里</h1>
  <p>链接可能拼错了，或者这首歌还没放进来。${name}的小屋还在慢慢布置。</p>
  <p class="path" id="badPath">—</p>
  <div class="acts">
    <a class="btn btn--pri" id="goHome" href="/">回首页</a>
    <button class="btn" type="button" id="goBack">返回上一页</button>
    <a class="btn" id="goLib" href="/songs/">去曲库</a>
  </div>
  <p class="foot">如果反复出现，麻烦把上面这个地址告诉我。</p>
</div>
<script>
(function () {
  var bad = document.getElementById('badPath');
  if (bad) bad.textContent = location.pathname + location.search;
  // 站点可能部署在子路径下：用 app.js 记录的 base 修正链接，默认站点根
  var base = '/';
  try {
    var b = localStorage.getItem('zx.music.base');
    if (typeof b === 'string' && b.charAt(0) === '/' && b.charAt(b.length - 1) === '/' && b.length < 120) base = b;
  } catch (e) { /* 存储不可用就用根路径 */ }
  var home = document.getElementById('goHome');
  var lib = document.getElementById('goLib');
  if (home) home.setAttribute('href', base);
  if (lib) lib.setAttribute('href', base + 'songs/');
  var back = document.getElementById('goBack');
  if (back) back.addEventListener('click', function () {
    if (history.length > 1) history.back();
    else location.assign(base);
  });
})();
</script>
</body>
</html>
`;
}

export function renderNotFound(model, { rel }) {
  const { site, songs } = model;
  const body = `<section class="sec"><div class="wrap">
  ${sectionHead({ no: '404', kicker: 'Not Found', title: '这一页不在小屋里', lede: '链接可能拼错了，或者那首歌还没发布。' })}
  <div class="hero__cta">
    <a class="btn btn--pri" href="${attr(rel)}">回首页</a>
    <a class="btn" href="${attr(rel)}songs/">去曲库</a>
    <a class="btn btn--quiet" href="${attr(rel)}notes/">看手记</a>
  </div>
  ${songs.length ? `<h2 class="sub">也许你在找这些</h2><ul class="linklist">${songs.slice(0, 8).map((s) => `<li><a class="link" href="${attr(rel)}songs/${attr(s.slug)}/">${esc(s.title)}</a> <span class="c-mute">${esc(s.artist)}</span></li>`).join('')}</ul>` : ''}
</div></section>`;
  return {
    kind: 'notfound', slug: null,
    meta: { title: `页面不存在 — ${site.title}`, description: '页面不存在。', image: 'assets/img/og/default.png' },
    body
  };
}