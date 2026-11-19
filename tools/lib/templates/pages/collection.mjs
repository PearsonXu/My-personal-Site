import { escapeHtml as esc, escapeAttr as attr, formatTime } from '../../../../assets/js/core/util.js';
import { canonicalUrl } from '../../../../assets/js/core/paths.js';
import { sectionHead, songList, collectionGrid, collectionActions, tags, demoBadge } from '../components.mjs';
import { icon } from '../../../../assets/js/core/icons.js';

function indexPage(model, ctx, kind) {
  const { site } = model;
  const items = kind === 'albums' ? model.albums : model.playlists;
  const label = kind === 'albums' ? '专辑' : '歌单';
  const body = `<section class="sec"><div class="wrap">
  ${sectionHead({ no: `§ ${label}`, kicker: kind === 'albums' ? 'Albums' : 'Playlists', title: label, lede: `共 ${items.length} 个。每个都有独立链接，可以一键播放或整张加入队列。` })}
  ${collectionGrid(items, ctx.base, kind, `慢慢整理，会有的。`)}
</div></section>`;
  return {
    kind,
    slug: null,
    meta: {
      title: `${label} — ${site.title}`,
      description: `${site.title}的${label}，共 ${items.length} 个。`,
      image: items[0]?.ogPath || 'assets/img/og/default.png'
    },
    body
  };
}

export const renderAlbums = (model, ctx) => indexPage(model, ctx, 'albums');
export const renderPlaylists = (model, ctx) => indexPage(model, ctx, 'playlists');

export function renderCollection(model, { base, item, kind, qrSvg }) {
  const { site, songs, notes } = model;
  const isAlbum = kind === 'albums';
  const single = isAlbum ? 'album' : 'playlist';
  const label = isAlbum ? '专辑' : '歌单';
  const tracks = item.tracks.map((slug) => songs.find((s) => s.slug === slug)).filter(Boolean);
  const total = tracks.reduce((sum, s) => sum + s.duration, 0);
  const related = notes.filter((n) => (isAlbum ? n.albums : n.playlists).includes(item.slug));
  const url = canonicalUrl(site.url, single, item.slug);
  const desc = item.about ? item.about.replace(/[*`#]/g, '').slice(0, 150) : `${label}《${item.title}》，共 ${tracks.length} 首。`;

  const body = `<section class="sec"><div class="wrap">
  <nav class="crumbs" aria-label="面包屑">
    <a href="${attr(base)}">首页</a> <span aria-hidden="true">/</span>
    <a href="${attr(base)}${attr(kind)}/">${esc(label)}</a> <span aria-hidden="true">/</span>
    <span aria-current="page">${esc(item.title)}</span>
  </nav>

  <div class="song__head">
    <div class="song__art"><img src="${attr(base + item.coverPath)}" alt="${attr(item.title)} 封面" width="420" height="420" decoding="async" fetchpriority="high"></div>
    <div class="song__info">
      <p class="eyebrow">${esc(label)} ${demoBadge(item)}</p>
      <h1 class="song__title">${esc(item.title)}</h1>
      ${isAlbum ? `<p class="song__artist">${esc(item.artist)}</p>` : ''}
      <dl class="kv kv--inline">
        <div><dt>曲目</dt><dd>${tracks.length} 首</dd></div>
        <div><dt>总时长</dt><dd>${formatTime(total)}</dd></div>
        ${item.date ? `<div><dt>发布</dt><dd>${esc(item.date)}</dd></div>` : ''}
      </dl>
      ${tags(item.tags, base)}
      ${collectionActions(kind, item.slug, { disabled: tracks.length === 0 })}
    </div>
  </div>

  ${item.demo ? '<p class="warn"><strong>这是工程验证用的示例，收录的是合成测试音，非本人作品。</strong>正式上线时会自动移除。</p>' : ''}
  ${item.aboutHtml ? `<div class="prose">${item.aboutHtml}</div>` : ''}

  <h2 class="sub">曲目${isAlbum ? '（按专辑顺序）' : '（按歌单顺序）'}</h2>
  ${songList(tracks, base, { ordered: true, emptyText: '曲目还在整理，慢慢会放进来。' })}

  <div class="share">
    <h3 class="sub">分享这个${label}</h3>
    <div class="share__row">
      <input class="share__url" type="text" readonly value="${attr(url)}" aria-label="${attr(label)}分享链接">
      <button class="btn" type="button" data-act="copy-link" data-url="${attr(url)}">${icon('copy', { size: 18 })} 复制链接</button>
    </div>
    <div class="share__qr"><div class="qr" aria-label="链接二维码">${qrSvg || ''}</div>
      <p class="note">扫码或复制链接都能直达本页。微信里打开后需要点一下播放按钮才会出声。</p></div>
  </div>

  ${related.length ? `<section class="sec--inner"><h2 class="sub">相关手记</h2><ul class="linklist">${related.map((n) => `<li><a class="link" href="${attr(base)}notes/${attr(n.slug)}/">${esc(n.title)}</a> <span class="c-mute">${esc(n.date)}</span></li>`).join('')}</ul></section>` : ''}
</div></section>`;

  return {
    kind: single,
    slug: item.slug,
    meta: {
      title: `${item.title} — ${label} | ${site.title}`,
      description: desc,
      ogTitle: `${item.title} · ${label}`,
      ogDescription: desc,
      image: item.ogPath,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': isAlbum ? 'MusicAlbum' : 'MusicPlaylist',
        name: item.title,
        url,
        numTracks: tracks.length,
        ...(isAlbum ? { byArtist: { '@type': 'MusicGroup', name: item.artist } } : {})
      }
    },
    body
  };
}