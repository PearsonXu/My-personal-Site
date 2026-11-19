import { escapeHtml as esc, escapeAttr as attr } from '../../../../assets/js/core/util.js';
import { sectionHead, songList, songGrid, emptyState } from '../components.mjs';
import { icon } from '../../../../assets/js/core/icons.js';

export function renderLibrary(model, { rel }) {
  const { site, songs } = model;
  const allTags = [...new Set(songs.flatMap((s) => s.tags))].sort();
  const hasSongs = songs.length > 0;

  const body = `<section class="sec">
  <div class="wrap">
    ${sectionHead({
    no: '§ 曲库',
    kicker: 'Library',
    title: '曲库',
    lede: hasSongs
      ? `这里放着 ${songs.length} 首歌。可以按歌名、专辑、标签或歌词找。`
      : '这里以后放我分享的音乐。'
  })}

    ${hasSongs ? `<div class="libbar" data-library>
      <div class="search">
        <span class="search__icon">${icon('search', { size: 18 })}</span>
        <input id="libSearch" class="search__input" type="search" placeholder="搜索歌名 / 专辑 / 标签 / 歌词…" aria-label="搜索曲库" autocomplete="off" spellcheck="false">
        <button class="search__clear" type="button" data-act="clear-search" aria-label="清空搜索" hidden>${icon('close', { size: 18 })}</button>
      </div>
      <div class="viewswitch" role="group" aria-label="展示模式">
        <button class="chip is-on" type="button" data-act="set-view" data-view="list" aria-pressed="true">列表</button>
        <button class="chip" type="button" data-act="set-view" data-view="grid" aria-pressed="false">封面墙</button>
        <button class="chip" type="button" data-act="set-view" data-view="vinyl" aria-pressed="false">唱片</button>
      </div>
    </div>

    ${allTags.length ? `<ul class="chips" data-tagfilter aria-label="按标签筛选">
      <li><button class="chip is-on" type="button" data-act="filter-tag" data-tag="" aria-pressed="true">全部</button></li>
      ${allTags.map((t) => `<li><button class="chip" type="button" data-act="filter-tag" data-tag="${attr(t)}" aria-pressed="false">#${esc(t)}</button></li>`).join('\n')}
    </ul>` : ''}

    <p class="libcount" id="libCount" role="status" aria-live="polite">${songs.length} 首</p>

    <div class="viewbox" data-viewbox="library" data-view="list">
      <div data-viewpane="list" id="libList">${songList(songs, rel)}</div>
      <div data-viewpane="grid" id="libGrid" hidden>${songGrid(songs, rel)}</div>
      <div data-viewpane="vinyl" id="libVinyl" hidden>${songGrid(songs, rel)}</div>
    </div>

    <div id="libEmpty" hidden>${emptyState({ icon: 'search', title: '没有匹配的歌', text: '换个关键词试试，或者清空标签筛选。' })}</div>

    <div class="libbulk">
      <button class="btn" type="button" data-act="play-all">${icon('play', { size: 20 })} 播放当前列表</button>
      <button class="btn btn--quiet" type="button" data-act="queue-all">${icon('plus', { size: 18 })} 当前列表加入队列</button>
    </div>` : emptyState({ icon: 'note', title: '第一首歌，正在路上。', text: '小屋慢慢布置，音乐也会陆续到来。' })}
  </div>
</section>`;

  return {
    kind: 'library',
    slug: null,
    meta: {
      title: `曲库 — ${site.title}`,
      description: hasSongs
        ? `${site.title}里分享的音乐，共 ${songs.length} 首。可以按歌名、专辑、标签或歌词找，无需登录。`
        : `${site.title}的曲库。音乐还在陆续到来，无需登录，点开就能听。`,
      image: songs[0]?.ogPath || 'assets/img/og/default.png'
    },
    body,
    pageClass: 'page--library'
  };
}