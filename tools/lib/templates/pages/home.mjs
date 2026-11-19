import { escapeHtml as esc, escapeAttr as attr, truncate } from '../../../../assets/js/core/util.js';
import { sectionHead, songList, songGrid, collectionGrid, emptyState, demoBadge } from '../components.mjs';

export function renderHome(model, { rel }) {
  const { site, songs, albums, playlists, notes } = model;
  const latest = songs.slice(0, 6);
  const featured = playlists.slice(0, 3);
  const latestNotes = notes.slice(0, 3);
  const hero = songs[0];

  const body = `<section class="hero">
  <div class="wrap hero__in">
    <div class="hero__copy">
      <p class="eyebrow"><span class="dot" aria-hidden="true"></span>${esc(site.author?.name || '')}</p>
      <h1 class="hero__title">${esc(site.title)}</h1>
      <p class="hero__lede">${esc(site.tagline || '')}<br>${esc(site.description || '')}</p>
      <div class="hero__cta">
        ${hero
    ? `<button class="btn btn--pri" type="button" data-act="play-song" data-slug="${attr(hero.slug)}"><span aria-hidden="true">▶</span> 播放最新一首</button>`
    : `<a class="btn btn--pri" href="${attr(rel)}songs/"><span aria-hidden="true">♫</span> 去曲库看看</a>`}
        <a class="btn" href="${attr(rel)}songs/"><span aria-hidden="true">⌕</span> 浏览曲库</a>
        <a class="btn btn--quiet" href="${attr(rel)}about/"><span aria-hidden="true">☺</span> 关于站长</a>
      </div>
      <p class="hero__hint">免登录试听 · 首次播放需要你点一下 · 长时间收听建议用系统浏览器</p>
    </div>
    <div class="hero__art">
      ${hero
    ? `<img src="${attr(rel + hero.coverPath)}" alt="${attr(hero.title)} 封面" width="420" height="420" decoding="async" fetchpriority="high">`
    : `<div class="hero__placeholder" aria-hidden="true">♪</div>`}
      ${hero ? `<p class="hero__cap">最新 · ${esc(hero.title)}${demoBadge(hero)}</p>` : ''}
    </div>
  </div>
</section>

<section class="sec" id="latest">
  <div class="wrap">
    ${sectionHead({ no: '§ 01', kicker: 'Latest', title: '最新音乐', lede: '按发布日期倒序。点 ▶ 直接播放，点标题进入单曲页。' })}
    <div class="viewswitch" role="group" aria-label="展示模式">
      <button class="chip is-on" type="button" data-act="set-view" data-view="list" aria-pressed="true">列表</button>
      <button class="chip" type="button" data-act="set-view" data-view="grid" aria-pressed="false">封面墙</button>
      <button class="chip" type="button" data-act="set-view" data-view="vinyl" aria-pressed="false">唱片</button>
    </div>
    <div class="viewbox" data-viewbox="home" data-view="list">
      <div data-viewpane="list">${songList(latest, rel, { emptyText: '曲库还是空的。用 <code>npm run new:song -- "歌名"</code> 添加第一首，或用 <code>npm run build:demo</code> 先看合成测试音的效果。' })}</div>
      <div data-viewpane="grid" hidden>${songGrid(latest, rel)}</div>
      <div data-viewpane="vinyl" hidden>${songGrid(latest, rel)}</div>
    </div>
    ${songs.length > 6 ? `<p class="sec__more"><a class="link" href="${attr(rel)}songs/">查看全部 ${songs.length} 首 →</a></p>` : ''}
  </div>
</section>

<section class="sec sec--tint" id="featured">
  <div class="wrap">
    ${sectionHead({ no: '§ 02', kicker: 'Playlists', title: '精选歌单', lede: '歌单可以一键播放整张，也可以整张加入队列。' })}
    ${collectionGrid(featured, rel, 'playlists', '还没有歌单。在 <code>content/playlists/</code> 新建一个 JSON 即可。')}
    ${albums.length ? `<h3 class="sub">专辑</h3>${collectionGrid(albums.slice(0, 3), rel, 'albums', '')}` : ''}
  </div>
</section>

<section class="sec" id="notes">
  <div class="wrap">
    ${sectionHead({ no: '§ 03', kicker: 'Notes', title: '最新手记', lede: '写歌、录音、以及这个站点本身的记录。' })}
    ${latestNotes.length
    ? `<div class="notes">${latestNotes.map((n) => `<article class="note">
        <a class="note__link" href="${attr(rel)}notes/${attr(n.slug)}/">
          <img class="note__art" src="${attr(rel + n.coverPath)}" alt="" width="120" height="120" loading="lazy" decoding="async">
          <span class="note__body">
            <span class="note__date">${esc(n.date)}</span>
            <span class="note__title">${esc(n.title)}</span>
            <span class="note__excerpt">${esc(truncate(n.excerpt, 90))}</span>
          </span>
        </a>
      </article>`).join('\n')}</div>`
    : emptyState({ icon: '✎', title: '还没有手记', text: '在 <code>content/notes/</code> 新建一个 Markdown 文件即可发布。' })}
    ${notes.length > 3 ? `<p class="sec__more"><a class="link" href="${attr(rel)}notes/">全部手记 →</a></p>` : ''}
  </div>
</section>

<section class="sec sec--tint" id="about">
  <div class="wrap">
    ${sectionHead({ no: '§ 04', kicker: 'About', title: '关于站长', lede: esc(site.author?.bio || '') })}
    <div class="aboutgrid">
      <div class="panel">
        <p class="panel__head">署名</p>
        <dl class="kv">
          <div><dt>站长</dt><dd>${esc(site.author?.name || '')}</dd></div>
          ${site.author?.github ? `<div><dt>GitHub</dt><dd><a class="link" href="${attr(site.author.github)}" target="_blank" rel="noopener">${esc(site.author.github)} ↗</a></dd></div>` : ''}
        </dl>
      </div>
      <div class="panel">
        <p class="panel__head">怎么听</p>
        <p class="c-dim">免登录，打开就能听。站内翻页面、读手记、换外观都<strong>不会断歌</strong>。收藏与进度只存在当前浏览器里。</p>
        <p class="hero__cta">
          <a class="btn" href="${attr(rel)}about/">关于这里</a>
          <button class="btn btn--quiet" type="button" data-act="open-appearance"><span aria-hidden="true">◐</span> 换个外观</button>
        </p>
      </div>
    </div>
  </div>
</section>`;

  return {
    kind: 'home',
    slug: null,
    meta: {
      title: `${site.title} — ${site.tagline || ''}`,
      description: site.description,
      image: songs[0]?.ogPath || 'assets/img/og/default.png',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: site.title,
        url: site.url,
        description: site.description,
        author: { '@type': 'Person', name: site.author?.nameEn || site.author?.name }
      }
    },
    body,
    pageClass: 'page--home'
  };
}