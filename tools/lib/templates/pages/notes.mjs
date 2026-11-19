import { escapeHtml as esc, escapeAttr as attr } from '../../../../assets/js/core/util.js';
import { canonicalUrl } from '../../../../assets/js/core/paths.js';
import { sectionHead, collectionGrid, songList, backendStatus } from '../components.mjs';

export function renderNotes(model, { rel }) {
  const { site, notes } = model;
  const body = `<section class="sec"><div class="wrap">
  ${sectionHead({ no: '§ 手记', kicker: 'Notes', title: '创作手记', lede: `共 ${notes.length} 篇。图文帖子，可以关联歌曲、专辑与歌单。默认只有站长发布，访客免登录阅读与听歌。` })}
  ${collectionGrid(notes, rel, 'notes', '在 <code>content/notes/</code> 新建一个 Markdown 文件（JSON frontmatter + 正文）即可发布。')}
  <div class="panel panel--muted">
    <p class="panel__head">访客发帖 / 评论</p>
    <p class="c-dim">当前：${backendStatus(site.backends?.guestPosts)} 发帖 · ${backendStatus(site.backends?.comments)} 评论</p>
    <p class="note">未配置后端时，这里不显示输入框，也不会假装能提交。扩展点已经预留在 <code>assets/js/adapters.js</code>。</p>
  </div>
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

export function renderNote(model, { rel, note, qrSvg }) {
  const { site, songs, albums, playlists } = model;
  const relSongs = note.songs.map((s) => songs.find((x) => x.slug === s)).filter(Boolean);
  const relAlbums = note.albums.map((s) => albums.find((x) => x.slug === s)).filter(Boolean);
  const relPlaylists = note.playlists.map((s) => playlists.find((x) => x.slug === s)).filter(Boolean);
  const url = canonicalUrl(site.url, 'note', note.slug);

  const body = `<article class="sec"><div class="wrap wrap--prose">
  <nav class="crumbs" aria-label="面包屑">
    <a href="${attr(rel)}">首页</a> <span aria-hidden="true">/</span>
    <a href="${attr(rel)}notes/">手记</a> <span aria-hidden="true">/</span>
    <span aria-current="page">${esc(note.title)}</span>
  </nav>
  <header class="article__head">
    <p class="eyebrow"><span class="dot" aria-hidden="true"></span>${esc(note.date)} · 约 ${note.readingMinutes} 分钟</p>
    <h1 class="article__title">${esc(note.title)}</h1>
    ${note.excerpt ? `<p class="article__lede">${esc(note.excerpt)}</p>` : ''}
  </header>
  <div class="prose">${note.html}</div>

  ${relSongs.length ? `<section class="sec--inner"><h2 class="sub">这篇提到的歌</h2>${songList(relSongs, rel)}
    <p class="hero__cta"><button class="btn" type="button" data-act="play-slugs" data-slugs="${attr(relSongs.map((s) => s.slug).join(','))}"><span aria-hidden="true">▶</span> 播放这些歌</button></p></section>` : ''}
  ${relAlbums.length ? `<section class="sec--inner"><h2 class="sub">相关专辑</h2>${collectionGrid(relAlbums, rel, 'albums', '')}</section>` : ''}
  ${relPlaylists.length ? `<section class="sec--inner"><h2 class="sub">相关歌单</h2>${collectionGrid(relPlaylists, rel, 'playlists', '')}</section>` : ''}

  <div class="share">
    <h3 class="sub">分享这篇手记</h3>
    <div class="share__row">
      <input class="share__url" type="text" readonly value="${attr(url)}" aria-label="手记分享链接">
      <button class="btn" type="button" data-act="copy-link" data-url="${attr(url)}"><span aria-hidden="true">⧉</span> 复制链接</button>
    </div>
    <div class="share__qr"><div class="qr" aria-label="链接二维码">${qrSvg || ''}</div>
      <p class="note">阅读时音乐不会中断——站内切换页面复用同一个音频元素。</p></div>
  </div>

  <section class="sec--inner">
    <h2 class="sub">评论</h2>
    <div class="panel panel--muted">
      <p class="c-dim">评论功能：${backendStatus(site.backends?.comments)}</p>
      <p class="note">${esc(site.backends?.comments?.note || '')}</p>
    </div>
  </section>
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