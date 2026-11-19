import { escapeHtml as esc, escapeAttr as attr } from '../../../../assets/js/core/util.js';
import { canonicalUrl } from '../../../../assets/js/core/paths.js';
import { sectionHead, collectionGrid, songList } from '../components.mjs';
import { icon } from '../../../../assets/js/core/icons.js';

export function renderNotes(model, { base }) {
  const { site, notes } = model;
  const body = `<section class="sec"><div class="wrap">
  ${sectionHead({ no: '§ 手记', kicker: 'Notes', title: '手记', lede: notes.length ? `${notes.length} 篇。旋律带来的故事与心情，还有听歌时想到的事。` : '旋律带来的故事与心情，写下来放在这里。' })}
  ${collectionGrid(notes, base, 'notes', '想到什么就记下来，慢慢会有。')}
</div></section>`;
  return {
    kind: 'notes',
    slug: null,
    meta: {
      title: `创作手记 — ${site.title}`,
      description: `${site.title}的创作手记，共 ${notes.length} 篇。`,
      image: notes[0]?.ogPath || 'assets/img/og/default.png'
    },
    body
  };
}

export function renderNote(model, { base, note, qrSvg }) {
  const { site, songs, albums, playlists } = model;
  const relSongs = note.songs.map((s) => songs.find((x) => x.slug === s)).filter(Boolean);
  const relAlbums = note.albums.map((s) => albums.find((x) => x.slug === s)).filter(Boolean);
  const relPlaylists = note.playlists.map((s) => playlists.find((x) => x.slug === s)).filter(Boolean);
  const url = canonicalUrl(site.url, 'note', note.slug);

  const body = `<article class="sec"><div class="wrap wrap--prose">
  <nav class="crumbs" aria-label="面包屑">
    <a href="${attr(base)}">首页</a> <span aria-hidden="true">/</span>
    <a href="${attr(base)}notes/">手记</a> <span aria-hidden="true">/</span>
    <span aria-current="page">${esc(note.title)}</span>
  </nav>
  <header class="article__head">
    <p class="eyebrow">${esc(note.date)} · 约 ${note.readingMinutes} 分钟</p>
    <h1 class="article__title">${esc(note.title)}</h1>
    ${note.excerpt ? `<p class="article__lede">${esc(note.excerpt)}</p>` : ''}
  </header>
  <div class="prose">${note.html}</div>

  ${relSongs.length ? `<section class="sec--inner"><h2 class="sub">这篇提到的歌</h2>${songList(relSongs, base)}
    <p class="hero__cta"><button class="btn" type="button" data-act="play-slugs" data-slugs="${attr(relSongs.map((s) => s.slug).join(','))}">${icon('play', { size: 20 })} 播放这些歌</button></p></section>` : ''}
  ${relAlbums.length ? `<section class="sec--inner"><h2 class="sub">相关专辑</h2>${collectionGrid(relAlbums, base, 'albums', '')}</section>` : ''}
  ${relPlaylists.length ? `<section class="sec--inner"><h2 class="sub">相关歌单</h2>${collectionGrid(relPlaylists, base, 'playlists', '')}</section>` : ''}

  <div class="share">
    <h3 class="sub">分享这篇手记</h3>
    <div class="share__row">
      <input class="share__url" type="text" readonly value="${attr(url)}" aria-label="手记分享链接">
      <button class="btn" type="button" data-act="copy-link" data-url="${attr(url)}">${icon('copy', { size: 18 })} 复制链接</button>
    </div>
    <div class="share__qr"><div class="qr" aria-label="链接二维码">${qrSvg || ''}</div>
      <p class="note">读手记的时候，歌不会断。</p></div>
  </div>
</div></article>`;

  return {
    kind: 'note',
    slug: note.slug,
    meta: {
      title: `${note.title} — ${site.title}`,
      description: note.excerpt,
      ogTitle: note.title,
      ogDescription: note.excerpt,
      image: note.ogPath,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: note.title,
        datePublished: note.date,
        url,
        author: { '@type': 'Person', name: site.author?.nameEn || site.author?.name },
        image: `${site.url.replace(/\/+$/, '')}/${note.ogPath}`
      }
    },
    body,
    pageClass: 'page--note'
  };
}