/**
 * tools/lib/templates/shell.mjs — 全站共同外壳。
 *
 * ★ 架构关键：`<audio id="zx-audio">` 与 `#player-root` 位于 `#page-root` 之外。
 *   站内路由只替换 `#page-root` 的内容，播放器与音频元素永不重新挂载 → 不断歌。
 *   同时每个页面都是真实预渲染的 HTML 文件，深链接 / 刷新 / 微信分享都能直达。
 */

import { escapeHtml as esc, escapeAttr as attr } from '../../../assets/js/core/util.js';
import { canonicalUrl } from '../../../assets/js/core/paths.js';
import { icon, toggleIcons } from '../../../assets/js/core/icons.js';

const NAV = [
  { kind: 'home', href: '', label: '首页', icon: 'home' },
  { kind: 'library', href: 'songs/', label: '曲库', icon: 'note' },
  { kind: 'albums', href: 'albums/', label: '专辑', icon: 'disc' },
  { kind: 'playlists', href: 'playlists/', label: '歌单', icon: 'queue' },
  { kind: 'notes', href: 'notes/', label: '手记', icon: 'pen' },
  { kind: 'about', href: 'about/', label: '关于', icon: 'user' },
  { kind: 'me', href: 'me/', label: '我的', icon: 'heart' }
];

function head({ site, base, meta, kind, slug, extraHead = '' }) {
  const root = site.url.replace(/\/+$/, '');
  const canonical = canonicalUrl(site.url, kind, slug);
  const ogImage = meta.image ? `${root}/${meta.image}` : `${root}/assets/img/og/default.png`;
  const title = meta.title;
  const desc = meta.description;
  const ogType = kind === 'song' ? 'music.song' : kind === 'note' ? 'article' : 'website';
  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="theme-color" content="#f5f6f8">',
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${attr(desc)}">`,
    `<link rel="canonical" href="${attr(canonical)}">`,
    `<meta property="og:site_name" content="${attr(site.title)}">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:title" content="${attr(meta.ogTitle || title)}">`,
    `<meta property="og:description" content="${attr(meta.ogDescription || desc)}">`,
    `<meta property="og:url" content="${attr(canonical)}">`,
    `<meta property="og:image" content="${attr(ogImage)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:locale" content="${attr(site.locale || 'zh_CN')}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${attr(meta.ogTitle || title)}">`,
    `<meta name="twitter:description" content="${attr(meta.ogDescription || desc)}">`,
    `<meta name="twitter:image" content="${attr(ogImage)}">`
  ];
  if (kind === 'song' && meta.song) {
    lines.push(`<meta property="music:duration" content="${Math.round(meta.song.duration)}">`);
    lines.push(`<meta property="music:musician" content="${attr(meta.song.artist)}">`);
    if (meta.song.albumTitle) lines.push(`<meta property="music:album" content="${attr(meta.song.albumTitle)}">`);
  }
  lines.push(
    `<link rel="icon" href="${attr(base)}assets/img/favicon.svg" type="image/svg+xml">`,
    `<link rel="stylesheet" href="${attr(base)}assets/css/site.css">`,
    `<link rel="stylesheet" href="${attr(base)}assets/css/player.css">`,
    `<link rel="stylesheet" href="${attr(base)}assets/css/themes.css">`,
    `<link rel="stylesheet" href="${attr(base)}assets/css/layout.css">`,
    `<link rel="preload" href="${attr(base)}assets/data/catalog.json" as="fetch" crossorigin="anonymous">`
  );
  if (meta.jsonLd) lines.push(`<script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>`);
  // 首帧前定好外观与布局，避免闪烁。
  // ★ 首次访问一律 cloud，系统深色偏好不参与决策；存储不可用 / 值非法也回退 cloud。
  lines.push('<script>(function(){var T=["cloud","forest","midnight"],L=["auto","desktop","mobile"],A={light:"cloud",dark:"midnight"},t="cloud",l="auto";try{var s=localStorage.getItem("zx.music.theme");s=A[s]||s;if(T.indexOf(s)>=0)t=s;var v=localStorage.getItem("zx.music.layout");if(L.indexOf(v)>=0)l=v;}catch(e){}var r=document.documentElement;r.setAttribute("data-theme",t);r.setAttribute("data-layout",l);r.className+=" js";})();</script>');
  if (extraHead) lines.push(extraHead);
  return lines.join('\n');
}
function header({ site, base, kind }) {
  const links = NAV.map((item) => {
    const active = item.kind === kind || (item.kind === 'library' && kind === 'song')
      || (item.kind === 'albums' && kind === 'album')
      || (item.kind === 'playlists' && kind === 'playlist')
      || (item.kind === 'notes' && kind === 'note');
    return `<li><a class="nav__a${active ? ' is-active' : ''}" href="${attr(base + item.href)}"${active ? ' aria-current="page"' : ''}>${icon(item.icon, { size: 18 })}${esc(item.label)}</a></li>`;
  }).join('\n');
  return `<header class="head" id="siteHead">
  <div class="wrap head__in">
    <a class="brand" href="${attr(base)}">
      <span class="brand__mark" aria-hidden="true">${icon('note', { size: 18 })}</span>
      <span class="brand__txt"><strong>${esc(site.shortTitle || site.title)}</strong><em>${esc(site.author?.name || '')}</em></span>
    </a>
    <nav class="nav" aria-label="主导航"><ul class="nav__ul">${links}
      <li class="nav__appearance"><button class="nav__a nav__a--btn" type="button" data-act="open-appearance">${icon('palette', { size: 18 })}外观与布局</button></li>
    </ul></nav>
    <div class="head__act">
      <button class="icon-btn" type="button" data-act="open-search" aria-label="搜索曲库" title="搜索 (/)">${icon('search', { size: 20 })}</button>
      <button class="icon-btn appearance-btn" type="button" data-act="open-appearance" aria-label="外观与布局" title="外观与布局">${icon('palette', { size: 20 })}<span class="appearance-btn__label" data-appearance-label>外观</span></button>
      <button class="icon-btn nav__burger" type="button" data-act="toggle-nav" aria-label="展开导航" aria-expanded="false">${icon('menu', { size: 20 })}</button>
    </div>
  </div>
</header>`;
}

function footer({ site, base }) {
  const year = new Date().getFullYear();
  return `<footer class="foot">
  <div class="wrap foot__in">
    <div class="foot__col">
      <p class="foot__mark" aria-hidden="true">♪ ∮</p>
      <p class="foot__tag">${esc(site.tagline || '')}</p>
      <p class="foot__note">收藏、最近播放、队列与进度只保存在<strong>当前浏览器</strong>，不代表跨设备同步。</p>
    </div>
    <nav class="foot__col" aria-label="页脚导航">
      <p class="foot__head">小屋</p>
      <ul>
        <li><a href="${attr(base)}songs/">曲库</a></li>
        <li><a href="${attr(base)}albums/">专辑</a></li>
        <li><a href="${attr(base)}playlists/">歌单</a></li>
        <li><a href="${attr(base)}notes/">创作手记</a></li>
        <li><a href="${attr(base)}me/">我的（本地数据）</a></li>
      </ul>
    </nav>
    <nav class="foot__col" aria-label="关于">
      <p class="foot__head">关于</p>
      <ul>
        <li><a href="${attr(base)}about/">关于我</a></li>
        ${site.author?.github ? `<li><a href="${attr(site.author.github)}" target="_blank" rel="noopener">GitHub ↗</a></li>` : ''}
        <li><a href="${attr(base)}status/">播放自检</a></li>
      </ul>
    </nav>
    <div class="foot__col">
      <p class="foot__head">说明</p>
      <ul class="foot__plain">
        <li>静态站点 · GitHub Pages</li>
        <li>原生 audio · 无跟踪 · 无 Cookie</li>
        <li>免登录试听，首次播放需点击</li>
        <li>长时间收听建议用系统浏览器</li>
      </ul>
    </div>
  </div>
  <div class="wrap foot__bar"><p>© ${year} ${esc(site.author?.name || '')}</p></div>
</footer>`;
}
/**
 * 持久播放器骨架。每个页面完全一致，JS 只做绑定与更新，绝不重建。
 * 移动端显示为迷你条，点封面或展开按钮进入全屏播放页。
 */
function player({ base }) {
  const btn = (act, label, iconName, extra = '', size = 24) =>
    `<button class="pbtn" type="button" data-act="${act}" aria-label="${attr(label)}" title="${attr(label)}"${extra}>${icon(iconName, { size })}</button>`;
  const toggle = (id, extraClass = '') =>
    `<button class="pbtn pbtn--play${extraClass ? ` ${extraClass}` : ''}" type="button" data-act="toggle" id="${id}" aria-label="播放" title="播放 / 暂停 (空格)">${toggleIcons({ size: 24 })}</button>`;
  // 歌词入口：常驻文字按钮「词」。文字即标签（不是图标字符），迷你条与展开页各一个，
  // 展开态由 aria-expanded 驱动（主题红底），见 docs/PLAYER-CONTROLS.md。
  const lyricsBtn = (id) =>
    `<button class="pbtn pbtn--text pbtn--lyrics" type="button" data-act="toggle-lyrics" id="${id}" aria-label="显示歌词" title="显示歌词" aria-expanded="false" aria-controls="plLyrics">词</button>`;
  return `<div id="player-root" class="pl" data-state="idle" data-expanded="false">
  <div class="pl__bar" role="region" aria-label="播放器">
    <button class="pl__art" type="button" data-act="expand" aria-label="展开播放页">
      <img id="plCover" alt="" width="52" height="52" decoding="async" src="${attr(base)}assets/img/placeholder.svg">
    </button>
    <div class="pl__meta">
      <p class="pl__title" id="plTitle">还没有在播放</p>
      <p class="pl__sub" id="plSub">挑一首歌开始 · 免登录试听</p>
    </div>
    <div class="pl__seekwrap">
      <input id="plSeek" class="range range--seek" type="range" min="0" max="1000" step="1" value="0" aria-label="播放进度" disabled>
      <div class="pl__times"><span id="plCur">0:00</span><span id="plDur">0:00</span></div>
    </div>
    <div class="pl__btns" role="group" aria-label="播放控制">
      ${btn('prev', '上一首', 'prev')}
      ${toggle('plToggle')}
      ${btn('next', '下一首', 'next')}
    </div>
    <div class="pl__extra">
      ${btn('cycle-mode', '播放模式：顺序播放', 'mode-order', ' id="plMode"', 22)}
      ${btn('toggle-fav', '收藏当前歌曲', 'heart', ' id="plFav"', 22)}
      ${lyricsBtn('plLyricsBtn')}
      ${btn('open-queue', '播放队列', 'queue', ' id="plQueueBtn"', 22)}
      ${btn('open-share', '分享当前歌曲', 'share', '', 22)}
      <div class="pl__vol" id="plVolWrap">
        ${btn('toggle-mute', '静音', 'volume', ' id="plMute"', 22)}
        <input id="plVol" class="range range--vol" type="range" min="0" max="100" step="1" value="100" aria-label="音量">
      </div>
      ${btn('expand', '展开播放页', 'expand', '', 22)}
    </div>
    <p class="pl__state" id="plState" role="status" aria-live="polite"></p>
  </div>

  <section class="pl__full" id="plFull" hidden aria-label="播放页">
    <div class="pl__fullhead">
      <button class="pbtn" type="button" data-act="collapse" aria-label="收起播放页">${icon('chevron-down', { size: 24 })}</button>
      <p class="pl__fulltitle" id="plFullContext">正在播放</p>
      <button class="pbtn" type="button" data-act="open-appearance" aria-label="外观与布局" title="外观与布局">${icon('palette', { size: 22 })}</button>
      <button class="pbtn" type="button" data-act="cycle-view" aria-label="切换展示模式" title="切换展示模式" id="plViewIcon">${icon('cover', { size: 22 })}</button>
    </div>
    <div class="pl__stage" id="plStage" data-stage="cover">
      <div class="pl__bigart" id="plBigArt"><img id="plBigCover" alt="" decoding="async" src="${attr(base)}assets/img/placeholder.svg"><span class="pl__hole" aria-hidden="true"></span></div>
      <div class="pl__lyricsbox">
        <div class="pl__lyrics" id="plLyrics" tabindex="0" aria-label="歌词"><p class="lyrics-empty">暂无歌词</p></div>
        <button class="lrc-back" type="button" id="plLyricsBack" hidden>回到当前歌词</button>
      </div>
      <div class="pl__calib" role="group" aria-label="歌词校准">
        <span class="pl__calib__label">歌词校准</span>
        <button class="pl__calib__btn" type="button" data-act="lyric-offset" data-delta="-0.5" aria-label="歌词整体延后 0.5 秒" title="歌词延后 0.5 秒" disabled>-0.5s</button>
        <output class="pl__calib__val" id="plCalibVal" aria-live="polite" aria-label="当前校准量">0.0s</output>
        <button class="pl__calib__btn" type="button" data-act="lyric-offset" data-delta="0.5" aria-label="歌词整体提前 0.5 秒" title="歌词提前 0.5 秒" disabled>+0.5s</button>
        <button class="pl__calib__btn" type="button" data-act="lyric-offset-reset" aria-label="重置歌词校准" title="重置歌词校准" disabled>重置</button>
      </div>
    </div>
    <div class="pl__fullmeta">
      <p class="pl__fullsong" id="plFullTitle">还没有在播放</p>
      <p class="pl__fullartist" id="plFullArtist">—</p>
    </div>
    <div class="pl__fullseek">
      <input id="plSeekFull" class="range range--seek" type="range" min="0" max="1000" step="1" value="0" aria-label="播放进度" disabled>
      <div class="pl__times"><span id="plCurFull">0:00</span><span id="plDurFull">0:00</span></div>
    </div>
    <div class="pl__fullbtns" role="group" aria-label="播放控制">
      ${btn('cycle-mode', '播放模式', 'mode-order', ' id="plModeFull"', 22)}
      ${btn('prev', '上一首', 'prev')}
      ${toggle('plToggleFull')}
      ${btn('next', '下一首', 'next')}
      ${btn('open-queue', '播放队列', 'queue', '', 22)}
      ${lyricsBtn('plLyricsBtnFull')}
    </div>
    <p class="pl__state" id="plStateFull" role="status" aria-live="polite"></p>
  </section>
</div>

<!-- ★ 全站唯一的音频元素。它在 #page-root 之外，路由切换不会销毁它。 -->
<audio id="zx-audio" preload="metadata" playsinline></audio>`;
}
/**
 * 渲染一份完整的静态 HTML 文档。
 * @param base 该页面回到站点根的相对前缀（"./" / "../" / "../../"）
 */
export function renderDocument({ site, base, kind, slug = null, meta, body, extraHead = '', pageClass = '' }) {
  return `<!DOCTYPE html>
<html lang="${attr(site.lang || 'zh-CN')}" data-theme="${attr(site.theme?.default || 'cloud')}" data-layout="${attr(site.layout?.default || 'auto')}" data-base="${attr(base)}">
<head>
${head({ site, base, meta, kind, slug, extraHead })}
</head>
<body data-kind="${attr(kind)}"${slug ? ` data-slug="${attr(slug)}"` : ''}>
<a class="skip" href="#main">跳到主要内容</a>
${header({ site, base, kind })}

<!-- ▼ 路由只替换这一块 ▼ -->
<div id="page-root" data-page="${attr(kind)}">
<main id="main" class="page ${attr(pageClass)}">
${body}
</main>
${footer({ site, base })}
</div>
<!-- ▲ 路由只替换这一块 ▲ -->

${player({ base })}

<div id="overlay-root"></div>
<div id="toasts" class="toasts" role="status" aria-live="polite" aria-atomic="false"></div>
<noscript><p class="noscript">这个音乐小屋的播放器需要 JavaScript。页面内容本身可以正常阅读；开启 JavaScript 后即可试听。</p></noscript>
<script type="module" src="${attr(base)}assets/js/app.js"></script>
</body>
</html>
`;
}

export { NAV };