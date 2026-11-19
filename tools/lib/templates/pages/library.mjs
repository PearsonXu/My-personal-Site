import { escapeHtml as esc, escapeAttr as attr } from '../../../../assets/js/core/util.js';
import { sectionHead, songList, songGrid, emptyState } from '../components.mjs';

export function renderLibrary(model, { rel }) {
  const { site, songs } = model;
  const allTags = [...new Set(songs.flatMap((s) => s.tags))].sort();

  const body = `<section class="sec">
  <div class="wrap">
    ${sectionHead({
    no: '§ 曲库',
    kicker: 'Library',
    title: '曲库',
    lede: `共 ${songs.length} 首。可以按歌名、专辑、标签、歌词搜索——歌词全文也在索引里。`
  })}

    <div class="libbar" data-library>
      <div class="search">
        <span class="search__icon" aria-hidden="true">⌕</span>
        <input id="libSearch" class="search__input" type="search" placeholder="搜索歌名 / 专辑 / 标签 / 歌词…" aria-label="搜索曲库" autocomplete="off" spellcheck="false">
        <button class="search__clear" type="button" data-act="clear-search" aria-label="清空搜索" hidden><span aria-hidden="true">✕</span></button>
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
      <div data-viewpane="list" id="libList">${songList(songs, rel, { emptyText: '曲库还是空的。用 <code>npm run new:song -- "歌名"</code> 添加第一首歌；想先看效果可以跑 <code>npm run build:demo</code>（合成测试音，非站长作品）。' })}</div>
      <div data-viewpane="grid" id="libGrid" hidden>${songGrid(songs, rel)}</div>
      <div data-viewpane="vinyl" id="libVinyl" hidden>${songGrid(songs, rel)}</div>
    </div>

    <div id="libEmpty" hidden>${emptyState({ icon: '⌕', title: '没有匹配的歌', text: '换个关键词试试，或者清空标签筛选。' })}</div>

    <div class="libbulk">
      <button class="btn" type="button" data-act="play-all"><span aria-hidden="true">▶</span> 播放当前列表</button>
      <button class="btn btn--quiet" type="button" data-act="queue-all"><span aria-hidden="true">＋</span> 当前列表加入队列</button>
    </div>
  </div>
</section>`;

  return {
    kind: 'library',
    slug: null,
    meta: {
      title: `曲库 — ${site.title}`,
      description: `${site.title}的全部歌曲，共 ${songs.length} 首。支持按歌名、专辑、标签与歌词搜索，免登录试听。`,
      image: songs[0]?.ogPath || 'assets/img/og/default.png'
    },
    body,
    pageClass: 'page--library'
  };
}