/**
 * tools/lib/templates/components.mjs — 可复用片段。
 * 所有交互都通过 data-act / data-slug 声明，由前端统一事件委托处理，
 * 这样路由换页后无需重新绑定，也不会影响播放器。
 */

import { escapeHtml as esc, escapeAttr as attr, formatTime } from '../../../assets/js/core/util.js';

export function demoBadge(item) {
  return item.demo ? '<span class="badge badge--demo" title="工程验证用合成音源，不是站长作品">DEMO</span>' : '';
}

export function tags(list, rel) {
  if (!list?.length) return '';
  return `<ul class="tags">${list.map((t) => `<li><a class="tag" href="${attr(rel)}songs/?tag=${encodeURIComponent(t)}">#${esc(t)}</a></li>`).join('')}</ul>`;
}

export function sectionHead({ no, kicker, title, lede = '', id = '' }) {
  return `<header class="sec__head">
  <p class="sec__no"><span>${esc(no)}</span> ${esc(kicker)}</p>
  <h2 class="sec__title"${id ? ` id="${attr(id)}"` : ''}>${esc(title)}</h2>
  ${lede ? `<p class="sec__lede">${lede}</p>` : ''}
</header>`;
}

export function emptyState({ icon = '♪', title, text, actions = '' }) {
  return `<div class="empty">
  <p class="empty__icon" aria-hidden="true">${icon}</p>
  <p class="empty__title">${esc(title)}</p>
  <p class="empty__text">${text}</p>
  ${actions ? `<div class="empty__act">${actions}</div>` : ''}
</div>`;
}

export function songActions(slug, { compact = false } = {}) {
  const cls = compact ? 'iact iact--sm' : 'iact';
  return `<div class="acts">
  <button class="${cls}" type="button" data-act="queue-next" data-slug="${attr(slug)}" aria-label="下一首播放" title="下一首播放"><span aria-hidden="true">⤒</span></button>
  <button class="${cls}" type="button" data-act="queue-last" data-slug="${attr(slug)}" aria-label="添加到队列末尾" title="添加到队列末尾"><span aria-hidden="true">＋</span></button>
  <button class="${cls}" type="button" data-act="fav" data-slug="${attr(slug)}" aria-label="收藏" title="收藏" aria-pressed="false"><span aria-hidden="true">♡</span></button>
</div>`;
}

export function songRow(song, rel, { index = null } = {}) {
  const href = `${rel}songs/${song.slug}/`;
  const album = song.album
    ? `<a class="row__al" href="${attr(rel)}albums/${attr(song.album)}/">${esc(song.albumTitle || song.album)}</a>`
    : '<span class="row__al c-mute">单曲</span>';
  return `<li class="row" data-song="${attr(song.slug)}">
  ${index === null ? '' : `<span class="row__no">${index}</span>`}
  <button class="row__play" type="button" data-act="play-song" data-slug="${attr(song.slug)}" aria-label="播放 ${attr(song.title)}"><span aria-hidden="true">▶</span></button>
  <a class="row__main" href="${attr(href)}">
    <img class="row__art" src="${attr(rel + song.coverPath)}" alt="" width="44" height="44" loading="lazy" decoding="async">
    <span class="row__txt"><span class="row__t">${esc(song.title)}${demoBadge(song)}</span><span class="row__a">${esc(song.artist)}</span></span>
  </a>
  ${album}
  <span class="row__d">${formatTime(song.duration)}</span>
  ${songActions(song.slug, { compact: true })}
</li>`;
}

export function songList(songs, rel, { ordered = false, emptyText = '' } = {}) {
  if (!songs.length) return emptyState({ title: '这里还没有歌', text: emptyText || '上传真实歌曲后，它们会自动出现在这里。' });
  return `<ol class="rows${ordered ? ' rows--ordered' : ''}">${songs.map((s, i) => songRow(s, rel, { index: ordered ? i + 1 : null })).join('\n')}</ol>`;
}

export function songCard(song, rel) {
  const href = `${rel}songs/${song.slug}/`;
  return `<article class="card" data-song="${attr(song.slug)}">
  <a class="card__link" href="${attr(href)}">
    <span class="card__art"><img src="${attr(rel + song.coverPath)}" alt="${attr(song.title)} 封面" width="300" height="300" loading="lazy" decoding="async"></span>
    <span class="card__t">${esc(song.title)}${demoBadge(song)}</span>
    <span class="card__s">${esc(song.artist)}</span>
  </a>
  <button class="card__play" type="button" data-act="play-song" data-slug="${attr(song.slug)}" aria-label="播放 ${attr(song.title)}"><span aria-hidden="true">▶</span></button>
  ${songActions(song.slug, { compact: true })}
</article>`;
}

export function songGrid(songs, rel) {
  if (!songs.length) return emptyState({ title: '曲库是空的', text: '用 <code>npm run new:song</code> 添加第一首歌。' });
  return `<div class="grid grid--cards">${songs.map((s) => songCard(s, rel)).join('\n')}</div>`;
}
export function collectionCard(item, rel, kind) {
  const href = `${rel}${kind}/${item.slug}/`;
  const sub = kind === 'albums' ? `${item.artist} · ${item.tracks.length} 首`
    : kind === 'playlists' ? `${item.tracks.length} 首`
      : `${item.date} · ${item.readingMinutes || 1} 分钟`;
  return `<article class="card card--collection">
  <a class="card__link" href="${attr(href)}">
    <span class="card__art"><img src="${attr(rel + item.coverPath)}" alt="${attr(item.title)} 封面" width="300" height="300" loading="lazy" decoding="async"></span>
    <span class="card__t">${esc(item.title)}${demoBadge(item)}</span>
    <span class="card__s">${esc(sub)}</span>
  </a>
  ${kind === 'notes' ? '' : `<button class="card__play" type="button" data-act="play-collection" data-kind="${attr(kind)}" data-slug="${attr(item.slug)}" aria-label="播放 ${attr(item.title)}"><span aria-hidden="true">▶</span></button>`}
</article>`;
}

export function collectionGrid(items, rel, kind, emptyText) {
  if (!items.length) {
    return emptyState({
      icon: kind === 'notes' ? '✎' : '◉',
      title: kind === 'notes' ? '还没有手记' : kind === 'albums' ? '还没有专辑' : '还没有歌单',
      text: emptyText
    });
  }
  return `<div class="grid grid--cards">${items.map((it) => collectionCard(it, rel, kind)).join('\n')}</div>`;
}

/** 播放整张 / 加入队列 的操作条 */
export function collectionActions(kind, slug, { disabled = false } = {}) {
  const d = disabled ? ' disabled' : '';
  return `<div class="hero__cta">
  <button class="btn btn--pri" type="button" data-act="play-collection" data-kind="${attr(kind)}" data-slug="${attr(slug)}"${d}><span aria-hidden="true">▶</span> 一键播放</button>
  <button class="btn" type="button" data-act="queue-collection" data-kind="${attr(kind)}" data-slug="${attr(slug)}" data-pos="last"${d}><span aria-hidden="true">＋</span> 加入队列</button>
  <button class="btn btn--quiet" type="button" data-act="queue-collection" data-kind="${attr(kind)}" data-slug="${attr(slug)}" data-pos="next"${d}><span aria-hidden="true">⤒</span> 下一首播放</button>
  <button class="btn btn--quiet" type="button" data-act="open-share" data-kind="${attr(kind)}" data-slug="${attr(slug)}"><span aria-hidden="true">↗</span> 分享</button>
</div>`;
}

/** 后端适配层状态徽章：未配置就说未配置，绝不含糊 */
export function backendStatus(cfg) {
  const configured = !!(cfg && (cfg.endpoint || cfg.signEndpoint));
  return `<span class="status ${configured ? 'status--on' : 'status--off'}">${configured ? '已配置' : '未配置'}</span>`;
}

export function backendTable(site, rel) {
  const rows = Object.entries(site.backends || {}).map(([key, cfg]) => `<tr>
  <th scope="row">${esc(cfg.label || key)}</th>
  <td>${backendStatus(cfg)}</td>
  <td class="c-dim">${esc(cfg.note || '')}</td>
</tr>`).join('\n');
  return `<table class="table">
  <thead><tr><th>能力</th><th>状态</th><th>说明</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="note">未配置的能力不会假装可用：页面只保留本地功能，并显示上表的状态。
配置方法见 <a href="${attr(rel)}status/">服务状态与自检</a>。</p>`;
}