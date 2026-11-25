import { escapeHtml as esc, escapeAttr as attr, formatTime } from '../../../../assets/js/core/util.js';
import { canonicalUrl } from '../../../../assets/js/core/paths.js';
import { songList, tags, demoBadge, emptyState } from '../components.mjs';
import { icon } from '../../../../assets/js/core/icons.js';
import { songKind } from '../../../../assets/js/core/song-meta.js';

/** 歌曲页歌词超过这么多行就折叠（与 lyrics-ui 的自动展开阈值一致） */
export const LYRIC_FOLD_LINES = 12;

function lyricsBlock(song) {
  if (song.instrumental) {
    return emptyState({ icon: 'disc', title: '纯音乐', text: '这首没有歌词。播放器会显示进度与封面，不做歌词高亮。' });
  }
  if (!song.lyricsLines?.length) {
    return emptyState({ icon: 'lyrics', title: '这首歌还没有歌词。', text: '先把旋律留在这里，歌词以后补上。' });
  }
  const timed = song.lyricsFormat === 'lrc';
  const items = song.lyricsLines.map((line) => timed
    ? `<li class="lrc__line" data-t="${line.time.toFixed(3)}">${esc(line.text) || '&nbsp;'}</li>`
    : `<li class="lrc__line lrc__line--plain">${esc(line.text)}</li>`).join('\n');
  // 长歌词默认只露前十来行，避免整页被拉得很长；播放到折叠处会自动展开
  const fold = song.lyricsLines.length > LYRIC_FOLD_LINES;
  return `<div class="lrcwrap" data-folded="${fold}">
  <ol class="lrc${timed ? '' : ' lrc--plain'}" data-lrc="${attr(song.slug)}" data-timed="${timed}">${items}</ol>
  ${fold ? '<button class="lrcwrap__more" type="button" data-act="unfold-lyrics" aria-expanded="false">展开全部歌词</button>' : ''}
</div>
  ${timed ? '<p class="note lrc__hint">点任意一句，从那里开始听。</p>' : ''}`;
}

function shareBlock(song, site, base, qrSvg) {
  const url = canonicalUrl(site.url, 'song', song.slug);
  const wechat = site.backends?.wechat || {};
  return `<div class="share" id="share">
  <h3 class="sub">分享这首歌</h3>
  <p class="c-dim">把链接发给朋友，点开就是这首歌，不用登录。</p>
  <div class="share__row">
    <input class="share__url" id="shareUrl" type="text" readonly value="${attr(url)}" aria-label="歌曲分享链接">
    <button class="btn" type="button" data-act="copy-link" data-url="${attr(url)}">${icon('copy', { size: 18 })} 复制链接</button>
    <button class="btn btn--quiet" type="button" data-act="make-poster" data-slug="${attr(song.slug)}">${icon('cover', { size: 18 })} 歌词海报</button>
  </div>
  <div class="share__qr">
    <div class="qr" aria-label="歌曲链接二维码">${qrSvg || ''}</div>
    <div class="share__tips">
      <p><strong>在微信里听</strong></p>
      <ul class="bullets">
        <li>打开后点一下播放按钮就会出声。</li>
        <li>想长时间听、锁屏也继续，点右上角「在浏览器打开」。</li>
        <li>链接会带着这首歌，换到浏览器可以接着听。</li>
      </ul>
    </div>
  </div>
</div>`;
}
export function renderSong(model, { base, song, qrSvg }) {
  const { site, songs, albums, notes } = model;
  const album = albums.find((a) => a.slug === song.album);
  const siblings = album ? album.tracks.filter((s) => s !== song.slug).map((s) => songs.find((x) => x.slug === s)).filter(Boolean) : [];
  const related = notes.filter((n) => n.songs.includes(song.slug) || (song.album && n.albums.includes(song.album)));
  const url = canonicalUrl(site.url, 'song', song.slug);
  const desc = song.about
    ? song.about.replace(/[*`#]/g, '').slice(0, 150)
    : `${song.artist} 的《${song.title}》${song.albumTitle ? `，收录于《${song.albumTitle}》` : ''}。在线试听、歌词与创作手记。`;

  const body = `<article class="song" data-song-page="${attr(song.slug)}">
  <div class="wrap">
    <nav class="crumbs" aria-label="面包屑">
      <a href="${attr(base)}">首页</a> <span aria-hidden="true">/</span>
      <a href="${attr(base)}songs/">曲库</a> <span aria-hidden="true">/</span>
      <span aria-current="page">${esc(song.title)}</span>
    </nav>

    <div class="song__head">
      <div class="song__art">
        <img src="${attr(base + song.coverPath)}" alt="${attr(song.title)} 封面" width="420" height="420" decoding="async" fetchpriority="high">
      </div>
      <div class="song__info">
        <p class="eyebrow">${esc(songKind(song))} ${demoBadge(song)}</p>
        <h1 class="song__title">${esc(song.title)}</h1>
        <p class="song__artist">${esc(song.artist)}</p>
        <dl class="kv kv--inline">
          ${song.originalArtist ? `<div><dt>原唱</dt><dd>${esc(song.originalArtist)}</dd></div>` : ''}
          ${song.lyricist ? `<div><dt>作词</dt><dd>${esc(song.lyricist)}</dd></div>` : ''}
          ${song.composer ? `<div><dt>作曲</dt><dd>${esc(song.composer)}</dd></div>` : ''}
          ${album ? `<div><dt>专辑</dt><dd><a class="link" href="${attr(base)}albums/${attr(album.slug)}/">${esc(album.title)}</a></dd></div>` : ''}
          <div><dt>时长</dt><dd>${formatTime(song.duration)}</dd></div>
          <div><dt>发布</dt><dd>${esc(song.date)}</dd></div>
          ${song.tools?.length ? `<div><dt>制作工具</dt><dd>${esc(song.tools.join('、'))}</dd></div>` : ''}
        </dl>
        ${tags(song.tags, base)}
        <div class="hero__cta">
          <button class="btn btn--pri btn--big" type="button" data-act="play-song" data-slug="${attr(song.slug)}" data-context="song-page">
            ${icon('play', { size: 20 })} 播放这首歌
          </button>
          <button class="btn" type="button" data-act="queue-next" data-slug="${attr(song.slug)}">${icon('queue-next', { size: 18 })} 下一首播放</button>
          <button class="btn btn--quiet" type="button" data-act="fav" data-slug="${attr(song.slug)}" aria-pressed="false">${icon('heart', { size: 18 })} 收藏</button>
        </div>
        <p class="note" data-play-hint>无需登录，点一下就能听。</p>
      </div>
    </div>

    ${song.demo ? '<p class="warn"><strong>这是工程验证用的合成测试音，不是金石竹青的作品。</strong>只用来确认播放和歌词正常，正式上线时会自动移除。</p>' : ''}

    ${song.aboutHtml ? `<section class="sec--inner"><h2 class="sub">关于这首歌</h2><div class="prose">${song.aboutHtml}</div></section>` : ''}
    ${song.credits?.length ? `<p class="credits">${song.credits.map((c) => esc(c)).join(' · ')}</p>` : ''}

    <section class="sec--inner" id="lyrics">
      <h2 class="sub">歌词</h2>
      ${lyricsBlock(song)}
    </section>

    ${shareBlock(song, site, base, qrSvg)}

    ${siblings.length ? `<section class="sec--inner"><h2 class="sub">专辑《${esc(album.title)}》里的其他歌</h2>${songList(siblings, base)}</section>` : ''}

    ${related.length ? `<section class="sec--inner"><h2 class="sub">相关手记</h2><ul class="linklist">${related.map((n) => `<li><a class="link" href="${attr(base)}notes/${attr(n.slug)}/">${esc(n.title)}</a> <span class="c-mute">${esc(n.date)}</span></li>`).join('')}</ul></section>` : ''}
  </div>
</article>`;

  return {
    kind: 'song',
    slug: song.slug,
    meta: {
      title: `${song.title} — ${song.artist} | ${site.title}`,
      description: desc,
      ogTitle: `${song.title} — ${song.artist}`,
      ogDescription: desc,
      image: song.ogPath,
      song,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'MusicRecording',
        name: song.title,
        url,
        duration: `PT${Math.round(song.duration)}S`,
        byArtist: { '@type': 'MusicGroup', name: song.artist },
        ...(album ? { inAlbum: { '@type': 'MusicAlbum', name: album.title } } : {}),
        image: `${site.url.replace(/\/+$/, '')}/${song.ogPath}`
      }
    },
    body,
    pageClass: 'page--song'
  };
}