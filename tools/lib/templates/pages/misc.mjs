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