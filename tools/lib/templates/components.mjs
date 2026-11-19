/**
 * tools/lib/templates/components.mjs — 可复用片段。
 * 所有交互都通过 data-act / data-slug 声明，由前端统一事件委托处理，
 * 这样路由换页后无需重新绑定，也不会影响播放器。
 */

import { escapeHtml as esc, escapeAttr as attr, formatTime } from '../../../assets/js/core/util.js';
import { icon } from '../../../assets/js/core/icons.js';

export function demoBadge(item) {
  return item.demo ? '<span class="badge badge--demo" title="工程验证用合成音，非本人作品">DEMO</span>' : '';
}

export function tags(list, base) {
  if (!list?.length) return '';
  return `<ul class="tags">${list.map((t) => `<li><a class="tag" href="${attr(base)}songs/?tag=${encodeURIComponent(t)}">#${esc(t)}</a></li>`).join('')}</ul>`;
}

export function sectionHead({ no, kicker, title, lede = '', id = '' }) {
  return `<header class="sec__head">
  <p class="sec__no"><span>${esc(no)}</span> ${esc(kicker)}</p>
  <h2 class="sec__title"${id ? ` id="${attr(id)}"` : ''}>${esc(title)}</h2>
  ${lede ? `<p class="sec__lede">${lede}</p>` : ''}
</header>`;
}

export function emptyState({ icon: iconName = 'note', title, text, actions = '' }) {
  return `<div class="empty">
  <p class="empty__icon">${icon(iconName, { size: 32 })}</p>
  <p class="empty__title">${esc(title)}</p>
  <p class="empty__text">${text}</p>
  ${actions ? `<div class="empty__act">${actions}</div>` : ''}
</div>`;
}

export function songActions(slug, { compact = false } = {}) {
  const cls = compact ? 'iact iact--sm' : 'iact';
  const size = compact ? 18 : 20;
  return `<div class="acts">
  <button class="${cls}" type="button" data-act="queue-next" data-slug="${attr(slug)}" aria-label="下一首播放" title="下一首播放">${icon('queue-next', { size })}</button>
  <button class="${cls}" type="button" data-act="queue-last" data-slug="${attr(slug)}" aria-label="添加到队列末尾" title="添加到队列末尾">${icon('plus', { size })}</button>
  <button class="${cls}" type="button" data-act="fav" data-slug="${attr(slug)}" aria-label="收藏" title="收藏" aria-pressed="false">${icon('heart', { size })}</button>
</div>`;
}

export function songRow(song, base, { index = null } = {}) {
  const href = `${base}songs/${song.slug}/`;
  const album = song.album
    ? `<a class="row__al" href="${attr(base)}albums/${attr(song.album)}/">${esc(song.albumTitle || song.album)}</a>`
    : '<span class="row__al c-mute">单曲</span>';
  return `<li class="row" data-song="${attr(song.slug)}">
  ${index === null ? '' : `<span class="row__no">${index}</span>`}
  <button class="row__play" type="button" data-act="play-song" data-slug="${attr(song.slug)}" aria-label="播放 ${attr(song.title)}">${icon('play', { size: 20 })}</button>
  <a class="row__main" href="${attr(href)}">
    <img class="row__art" src="${attr(base + song.coverPath)}" alt="" width="44" height="44" loading="lazy" decoding="async">
    <span class="row__txt"><span class="row__t">${esc(song.title)}${demoBadge(song)}</span><span class="row__a">${esc(song.artist)}</span></span>
  </a>
  ${album}
  <span class="row__d">${formatTime(song.duration)}</span>
  ${songActions(song.slug, { compact: true })}
</li>`;
}

export function songList(songs, base, { ordered = false, emptyText = '' } = {}) {
  if (!songs.length) {
    return emptyState({ icon: 'note', title: '第一首歌，正在路上。', text: emptyText || '小屋慢慢布置，音乐也会陆续到来。' });
  }
  return `<ol class="rows${ordered ? ' rows--ordered' : ''}">${songs.map((s, i) => songRow(s, base, { index: ordered ? i + 1 : null })).join('\n')}</ol>`;
}

export function songCard(song, base) {
  const href = `${base}songs/${song.slug}/`;
  return `<article class="card" data-song="${attr(song.slug)}">
  <a class="card__link" href="${attr(href)}">
    <span class="card__art"><img src="${attr(base + song.coverPath)}" alt="${attr(song.title)} 封面" width="300" height="300" loading="lazy" decoding="async"></span>
    <span class="card__t">${esc(song.title)}${demoBadge(song)}</span>
    <span class="card__s">${esc(song.artist)}</span>
  </a>
  <button class="card__play" type="button" data-act="play-song" data-slug="${attr(song.slug)}" aria-label="播放 ${attr(song.title)}">${icon('play', { size: 20 })}</button>
  ${songActions(song.slug, { compact: true })}
</article>`;
}

export function songGrid(songs, base) {
  if (!songs.length) return emptyState({ icon: 'note', title: '第一首歌，正在路上。', text: '小屋慢慢布置，音乐也会陆续到来。' });
  return `<div class="grid grid--cards">${songs.map((s) => songCard(s, base)).join('\n')}</div>`;
}
export function collectionCard(item, base, kind) {
  const href = `${base}${kind}/${item.slug}/`;
  const sub = kind === 'albums' ? `${item.artist} · ${item.tracks.length} 首`
    : kind === 'playlists' ? `${item.tracks.length} 首`
      : `${item.date} · ${item.readingMinutes || 1} 分钟`;
  return `<article class="card card--collection">
  <a class="card__link" href="${attr(href)}">
    <span class="card__art"><img src="${attr(base + item.coverPath)}" alt="${attr(item.title)} 封面" width="300" height="300" loading="lazy" decoding="async"></span>
    <span class="card__t">${esc(item.title)}${demoBadge(item)}</span>
    <span class="card__s">${esc(sub)}</span>
  </a>
  ${kind === 'notes' ? '' : `<button class="card__play" type="button" data-act="play-collection" data-kind="${attr(kind)}" data-slug="${attr(item.slug)}" aria-label="播放 ${attr(item.title)}">${icon('play', { size: 20 })}</button>`}
</article>`;
}

export function collectionGrid(items, base, kind, emptyText) {
  if (!items.length) {
    return emptyState({
      icon: kind === 'notes' ? 'pen' : 'disc',
      title: kind === 'notes' ? '手记还在写。' : kind === 'albums' ? '专辑还在整理。' : '歌单还在整理。',
      text: emptyText || '慢慢会有。'
    });
  }
  return `<div class="grid grid--cards">${items.map((it) => collectionCard(it, base, kind)).join('\n')}</div>`;
}

/** 播放整张 / 加入队列 的操作条 */
export function collectionActions(kind, slug, { disabled = false } = {}) {
  const d = disabled ? ' disabled' : '';
  return `<div class="hero__cta">
  <button class="btn btn--pri" type="button" data-act="play-collection" data-kind="${attr(kind)}" data-slug="${attr(slug)}"${d}>${icon('play', { size: 20 })} 一键播放</button>
  <button class="btn" type="button" data-act="queue-collection" data-kind="${attr(kind)}" data-slug="${attr(slug)}" data-pos="last"${d}>${icon('plus', { size: 18 })} 加入队列</button>
  <button class="btn btn--quiet" type="button" data-act="queue-collection" data-kind="${attr(kind)}" data-slug="${attr(slug)}" data-pos="next"${d}>${icon('queue-next', { size: 18 })} 下一首播放</button>
  <button class="btn btn--quiet" type="button" data-act="open-share" data-kind="${attr(kind)}" data-slug="${attr(slug)}">${icon('share', { size: 18 })} 分享</button>
</div>`;
}
