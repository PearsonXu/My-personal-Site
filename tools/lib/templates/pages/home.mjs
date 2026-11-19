import { escapeHtml as esc, escapeAttr as attr, truncate } from '../../../../assets/js/core/util.js';
import { sectionHead, songList, songGrid, collectionGrid, emptyState, demoBadge } from '../components.mjs';
import { icon } from '../../../../assets/js/core/icons.js';

/** 空曲库时统一的温和文案，不含任何面向开发者的说明 */
const EMPTY_SONG = { title: '第一首歌，正在路上。', text: '小屋慢慢布置，音乐也会陆续到来。' };

export function renderHome(model, { base }) {
  const { site, songs, albums, playlists, notes } = model;
  const latest = songs.slice(0, 6);
  const featured = playlists.slice(0, 3);
  const latestNotes = notes.slice(0, 3);
  const pick = songs[0];
  const intro = Array.isArray(site.intro) ? site.intro : [];
  const hasCollections = featured.length > 0 || albums.length > 0;

  /* 右侧：有歌就放一张真实的推荐卡片；没有歌就整块去掉，改单栏 */
  const pickCard = pick ? `<aside class="hero__pick" aria-label="推荐歌曲">
      <a class="hero__pick__cover" href="${attr(base)}songs/${attr(pick.slug)}/">
        <img src="${attr(base + pick.coverPath)}" alt="${attr(pick.title)} 封面" width="420" height="420" decoding="async" fetchpriority="high">
      </a>
      <div class="hero__pick__row">
        <div class="hero__pick__meta">
          <p class="hero__pick__label">最近在听</p>
          <p class="hero__pick__title"><a href="${attr(base)}songs/${attr(pick.slug)}/">${esc(pick.title)}</a>${demoBadge(pick)}</p>
          <p class="hero__pick__artist">${esc(pick.artist)}</p>
        </div>
        <button class="hero__pick__play" type="button" data-act="play-song" data-slug="${attr(pick.slug)}" aria-label="播放 ${attr(pick.title)}">${icon('play', { size: 22 })}</button>
      </div>
    </aside>` : '';

  const body = `<section class="hero hero--home">
  <div class="wrap hero__in${pick ? '' : ' hero__in--single'}">
    <div class="hero__copy">
      <p class="eyebrow eyebrow--plain">${esc(site.eyebrow || '音乐爱好者')}</p>
      <h1 class="hero__title">${esc(site.title)}</h1>
      <p class="hero__tagline">${esc(site.tagline || '')}</p>
      ${intro.length ? `<div class="hero__intro">${intro.map((line) => `<p>${esc(line)}</p>`).join('\n')}</div>` : ''}
      <div class="hero__cta">
        <a class="btn btn--pri" href="${attr(base)}songs/">${icon('play', { size: 18 })} 听听音乐</a>
        <a class="btn" href="${attr(base)}about/">${icon('user', { size: 18 })} 关于我</a>
      </div>
      <p class="hero__hint">${esc(site.listenHint || '无需登录，点开就能听。')}</p>
    </div>
    ${pickCard}
  </div>
</section>

<section class="sec sec--near" id="latest">
  <div class="wrap">
    ${sectionHead({ no: '§ 01', kicker: 'Recent', title: '最近分享', lede: '最近喜欢的，也放在这里与你分享。' })}
    ${latest.length ? `<div class="viewswitch" role="group" aria-label="展示模式">
      <button class="chip is-on" type="button" data-act="set-view" data-view="list" aria-pressed="true">列表</button>
      <button class="chip" type="button" data-act="set-view" data-view="grid" aria-pressed="false">封面墙</button>
      <button class="chip" type="button" data-act="set-view" data-view="vinyl" aria-pressed="false">唱片</button>
    </div>
    <div class="viewbox" data-viewbox="home" data-view="list">
      <div data-viewpane="list">${songList(latest, base, { emptyText: EMPTY_SONG.text })}</div>
      <div data-viewpane="grid" hidden>${songGrid(latest, base)}</div>
      <div data-viewpane="vinyl" hidden>${songGrid(latest, base)}</div>
    </div>` : emptyState({ icon: 'note', ...EMPTY_SONG })}
    ${songs.length > 6 ? `<p class="sec__more"><a class="link" href="${attr(base)}songs/">查看全部 ${songs.length} 首 →</a></p>` : ''}
  </div>
</section>

${hasCollections ? `<section class="sec sec--tint" id="featured">
  <div class="wrap">
    ${sectionHead({ no: '§ 02', kicker: 'Playlists', title: '常听的歌单', lede: '把合适的歌放在一起，想听的时候整张放。' })}
    ${collectionGrid(featured, base, 'playlists', '歌单还在慢慢整理。')}
    ${albums.length ? `<h3 class="sub">专辑</h3>${collectionGrid(albums.slice(0, 3), base, 'albums', '')}` : ''}
  </div>
</section>` : ''}

<section class="sec${hasCollections ? '' : ' sec--tint'}" id="notes">
  <div class="wrap">
    ${sectionHead({ no: hasCollections ? '§ 03' : '§ 02', kicker: 'Notes', title: '最近手记', lede: '旋律带来的故事与心情，写下来放在这里。' })}
    ${latestNotes.length
    ? `<div class="notes">${latestNotes.map((n) => `<article class="note">
        <a class="note__link" href="${attr(base)}notes/${attr(n.slug)}/">
          <img class="note__art" src="${attr(base + n.coverPath)}" alt="" width="120" height="120" loading="lazy" decoding="async">
          <span class="note__body">
            <span class="note__date">${esc(n.date)}</span>
            <span class="note__title">${esc(n.title)}</span>
            <span class="note__excerpt">${esc(truncate(n.excerpt, 90))}</span>
          </span>
        </a>
      </article>`).join('\n')}</div>`
    : emptyState({ icon: 'pen', title: '手记还在写。', text: '想到什么就记下来，慢慢会有。' })}
    ${notes.length > 3 ? `<p class="sec__more"><a class="link" href="${attr(base)}notes/">全部手记 →</a></p>` : ''}
  </div>
</section>

<section class="sec sec--tint" id="about">
  <div class="wrap wrap--prose">
    ${sectionHead({ no: hasCollections ? '§ 04' : '§ 03', kicker: 'About', title: '关于我', lede: esc(site.author?.bio || '') })}
    <p class="hero__cta">
      <a class="btn" href="${attr(base)}about/">${icon('user', { size: 18 })} 关于我</a>
      <button class="btn btn--quiet" type="button" data-act="open-appearance">${icon('palette', { size: 18 })} 换个外观</button>
    </p>
  </div>
</section>`;

  return {
    kind: 'home',
    slug: null,
    meta: {
      title: `${site.title} — ${site.tagline || ''}`,
      description: site.description,
      image: pick?.ogPath || 'assets/img/og/default.png',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: site.title,
        url: site.url,
        description: site.description,
        author: { '@type': 'Person', name: site.author?.name }
      }
    },
    body,
    pageClass: 'page--home'
  };
}