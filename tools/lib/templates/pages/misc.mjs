import { escapeHtml as esc, escapeAttr as attr } from '../../../../assets/js/core/util.js';
import { sectionHead, backendTable, emptyState } from '../components.mjs';

export function renderAbout(model, { rel }) {
  const { site } = model;
  const body = `<section class="sec"><div class="wrap wrap--prose">
  ${sectionHead({ no: '§ 关于', kicker: 'About', title: '关于金石竹青', lede: esc(site.author?.bio || '') })}
  <dl class="kv">
    <div><dt>署名</dt><dd>${esc(site.author?.name || '')}</dd></div>
    ${site.author?.github ? `<div><dt>GitHub</dt><dd><a class="link" href="${attr(site.author.github)}" target="_blank" rel="noopener">${esc(site.author.github)} ↗</a></dd></div>` : ''}
  </dl>

  <h2 class="sub">这里放什么</h2>
  <ul class="bullets">
    <li><strong>歌</strong>：单曲、专辑、歌单。每首都有自己的页面和链接，可以直接分享。</li>
    <li><strong>手记</strong>：写歌、录音、以及做这个站点时留下的字。</li>
    <li><strong>歌词</strong>：能跟着唱的那种，当前句会高亮，点一句就跳过去。</li>
  </ul>

  <h2 class="sub">怎么听</h2>
  <ul class="bullets">
    <li>免登录。打开就能听，第一次需要你自己点一下播放——这是浏览器的规矩，不是页面坏了。</li>
    <li>站内翻页面、读手记、换外观都<strong>不会断歌</strong>：全站复用同一个音频实例。</li>
    <li>收藏、最近播放、队列和进度只存在<strong>当前这台设备的这个浏览器</strong>里，不是账号，也不是云同步。</li>
    <li>想长时间收听、锁屏继续，建议用系统浏览器；微信里请点右上角「在浏览器打开」。</li>
  </ul>

  <h2 class="sub">三套外观</h2>
  <p>右上角「外观」里可以换：<strong>清爽云音乐</strong>（白 / 浅灰 / 红）、
  <strong>森林音乐小屋</strong>（森林绿 / 暖纸 / 琥珀）、<strong>午夜黑胶</strong>（深蓝紫 / 夜景 / 黑胶）。
  布局另有「自动 / 桌面 / 手机」三档，和外观互相独立。换这些都不会打断正在放的歌。</p>
  <p class="hero__cta"><button class="btn btn--pri" type="button" data-act="open-appearance"><span aria-hidden="true">◐</span> 打开外观与布局</button></p>

  <h2 class="sub">需要外部服务的能力</h2>
  ${backendTable(site, rel)}
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
  ${sectionHead({ no: '§ 我的', kicker: 'Local', title: '我的（本地数据）', lede: '下面这些数据保存在<strong>当前浏览器的 localStorage</strong> 里。换设备、换浏览器、清理站点数据都会丢失——这不是账号，也不是云同步。' })}

  <div class="panel panel--muted">
    <p class="panel__head">跨设备同步</p>
    <p class="c-dim">${esc(site.backends?.accountSync?.note || '')}</p>
    <p class="note">当前状态：<span data-backend-status="accountSync">未配置</span></p>
  </div>

  <h2 class="sub">收藏 <span class="count" id="favCount">0</span></h2>
  <div id="favList">${emptyState({ icon: '♡', title: '还没有收藏', text: '在任意歌曲上点 ♡ 即可收藏。收藏只存在这台设备的这个浏览器里。' })}</div>

  <h2 class="sub">最近播放 <span class="count" id="recentCount">0</span></h2>
  <div id="recentList">${emptyState({ icon: '↺', title: '还没有播放记录', text: '播放过的歌会出现在这里，最多保留 50 条。' })}</div>

  <h2 class="sub">当前队列 <span class="count" id="queueCount">0</span></h2>
  <div id="queueList">${emptyState({ icon: '☰', title: '队列是空的', text: '去曲库挑几首，或者播放一张专辑 / 歌单。' })}</div>

  <h2 class="sub">本地数据管理</h2>
  <div class="hero__cta">
    <button class="btn" type="button" data-act="export-local"><span aria-hidden="true">⤓</span> 导出为 JSON</button>
    <button class="btn btn--quiet" type="button" data-act="clear-favorites">清空收藏</button>
    <button class="btn btn--quiet" type="button" data-act="clear-recent">清空最近播放</button>
    <button class="btn btn--danger" type="button" data-act="clear-all">清空全部本地数据</button>
  </div>
  <p class="note">导出的 JSON 只包含你自己的收藏 / 历史 / 队列，可以手动搬到另一台设备（导入功能属于账号同步扩展点，当前未配置）。</p>
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
  ${sectionHead({ no: '§ 状态', kicker: 'Status', title: '服务状态与自检', lede: '这一页把「已经能用的」和「需要外部服务的」分开列清楚，并提供可在浏览器里直接跑的自检工具。' })}

  <h2 class="sub">后端适配层</h2>
  ${backendTable(site, rel)}

  <h2 class="sub">浏览器能力自检</h2>
  <p class="c-dim">点下面的按钮，结果直接来自当前浏览器，不是猜测。</p>
  <div class="hero__cta">
    <button class="btn btn--pri" type="button" data-act="run-diagnostics"><span aria-hidden="true">▶</span> 运行自检</button>
  </div>
  <div id="diagOut" class="diag"><p class="c-mute">尚未运行。</p></div>

  <h2 class="sub">音频服务自检（MIME / Range / 206）</h2>
  <p class="c-dim">对当前曲库的第一首歌发起 <code>Range: bytes=0-1023</code> 请求，检查返回码、<code>Content-Type</code>、<code>Accept-Ranges</code> 与 <code>Content-Range</code>。拖动进度条能不能用，取决于这一步。</p>
  <div class="hero__cta">
    <button class="btn" type="button" data-act="probe-audio"><span aria-hidden="true">⇄</span> 探测音频响应头</button>
  </div>
  <div id="probeOut" class="diag"><p class="c-mute">尚未运行。</p></div>

  <h2 class="sub">实验性增强</h2>
  <div class="panel">
    <p class="panel__head">Audio Session（iOS）</p>
    <p class="c-dim">把 <code>navigator.audioSession.type</code> 设为 <code>playback</code>，在部分 iOS 版本上有助于后台播放。默认<strong>关闭</strong>，可随时关掉。它不是后台播放的保证。</p>
    <label class="switch"><input type="checkbox" id="audioSessionToggle" data-act="toggle-audio-session"><span>启用实验性 Audio Session</span></label>
    <p class="note" id="audioSessionState">状态未知，运行自检后可见。</p>
  </div>

  <h2 class="sub">后台播放的真实边界</h2>
  <ul class="bullets">
    <li><strong>当前这首歌</strong>切后台 / 锁屏继续播：在 iOS Safari、Android Chrome 上通常成立。</li>
    <li><strong>后台自动接下一首</strong>：不保证。页面被系统挂起后 JavaScript 可能冻结，<code>ended</code> 里的换歌逻辑就跑不了。</li>
    <li>本站不使用隐藏 video、静音循环或定时器来假装绕过后台限制，也不把 Service Worker 当作无限后台执行权限。</li>
    <li>微信内置浏览器策略更严格且随版本变化，长时间收听请用系统浏览器。</li>
  </ul>
  <p class="note">逐项设备验收记录见仓库 <code>docs/ACCEPTANCE.md</code>：没测的标 NOT_RUN，缺条件的标 BLOCKED。</p>

  <h2 class="sub">部署信息</h2>
  <dl class="kv">
    <div><dt>站点地址</dt><dd><code>${esc(site.url)}</code></dd></div>
    <div><dt>音频来源</dt><dd><code>${esc(site.mediaBase || '仓库内相对路径（assets/audio/…）')}</code></dd></div>
    <div><dt>运行时 base</dt><dd><code data-diag-base>—</code></dd></div>
    <div><dt>构建模式</dt><dd>${model.includeDemo ? '<span class="badge badge--demo">含 DEMO 测试音</span>' : '生产（不含 DEMO）'}</dd></div>
  </dl>
</div></section>`;
  return {
    kind: 'status', slug: null,
    meta: { title: `服务状态与自检 — ${site.title}`, description: '后端适配层状态、浏览器能力自检、音频 MIME/Range 探测与后台播放边界说明。', image: 'assets/img/og/default.png' },
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