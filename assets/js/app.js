/**
 * app.js — 应用入口。
 *
 * 启动顺序：解析 base → 拉精简目录 → 建播放器（复用页面里已有的 <audio>）
 *          → 绑定持久 UI → 启动路由 → 恢复本地状态（不自动出声）。
 *
 * ★ 这个模块只执行一次。路由换页不会重新执行它，播放器因此永不重挂载。
 */

import { baseFromModuleUrl, joinUrl, resolveMedia, parseRoute } from './core/paths.js';
import { isBenignErrorMessage } from './core/util.js';
import { Store } from './store.js';
import { Player } from './player.js';
import { Router } from './router.js';
import { Adapters } from './adapters.js';
import { PlayerUI } from './ui/player-ui.js';
import { LyricsUI, bindPageLyrics, unfoldPageLyrics } from './ui/lyrics-ui.js';
import { QueueUI } from './ui/queue-ui.js';
import { LibraryUI } from './ui/library-ui.js';
import { HomeLatestUI } from './ui/home-latest-ui.js';
import { ShareUI } from './ui/share-ui.js';
import { StatusUI } from './ui/status-ui.js';
import { MeUI } from './ui/me-ui.js';
import { Appearance, applyCoverAccent } from './ui/appearance-ui.js';
import { toast, closeSheet, isSheetOpen, copyText, showErrorBanner } from './ui/common.js';
import { byId, qs, qsa, tgt } from './ui/dom.js';

const BASE = baseFromModuleUrl(import.meta.url, 'assets/js/app.js');

/** @param {ErrorEvent} e */
const isBenignError = (e) => isBenignErrorMessage(e?.message);

/**
 * 把 <head> 里的相对资源链接绝对化。
 *
 * 为什么必须做：HTML 用按页面深度算好的相对路径（这样同一份产物能跑在根域名与子路径），
 * 但 SPA 用 pushState 改地址后，浏览器会拿**新 URL**去重新解析 head 里的相对 href。
 * 从首页 pushState 到 /notes/<slug>/ 后，`./assets/img/favicon.svg` 就被解析成
 * /notes/<slug>/assets/img/favicon.svg → 404。
 * 启动时（此刻 document URL 还是真实页面地址）把它们转成绝对 URL，之后就不受路由影响。
 */
function absolutizeHeadAssets() {
  const selector = 'head link[rel~="icon"], head link[rel="apple-touch-icon"], head link[rel="manifest"], head link[rel="stylesheet"], head link[rel="preload"], head link[rel="modulepreload"], script[src]';
  for (const el of qsa(selector)) {
    const attr = el.hasAttribute('href') ? 'href' : 'src';
    const raw = el.getAttribute(attr);
    if (!raw || /^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) continue;
    try { el.setAttribute(attr, new URL(raw, location.href).href); } catch { /* ignore */ }
  }
}

/**
 * 把「持久外壳」里的链接绝对化。
 *
 * ★ 这是白屏故障的根因之一：header 导航与播放器占位图都在 #page-root **之外**，
 *   它们的 href / src 是按「首次进入页面的深度」生成的相对路径（./songs/ 或 ../../songs/）。
 *   SPA 用 pushState 改了文档 URL 之后，这些相对 href 会被按**新深度**重新解析：
 *   从首页进入 /notes/ 后，./songs/ 变成 /notes/songs/ —— 一个不存在的路径。
 *   再点一次导航就会真的跳到 404，且刷新也回不来。
 *
 *   启动时（document URL 还是真实页面地址）把外壳链接转成绝对 URL，之后与路由无关。
 *   #page-root 内部的链接不动：它们随页面一起替换，深度本来就是对的。
 */
function absolutizeChromeLinks() {
  // 1) 外壳里的链接
  for (const a of qsa('a[href]')) {
    if (a.closest('#page-root')) continue;
    const raw = a.getAttribute('href');
    if (!raw || raw.startsWith('#')) continue;
    if (/^(https?:)?\/\//i.test(raw) || /^(mailto:|tel:|data:|javascript:)/i.test(raw)) continue;
    try { a.setAttribute('href', new URL(raw, location.href).href); } catch { /* ignore */ }
  }
  // 2) 外壳里的资源（播放器占位封面等）。
  //    它们同样不随路由替换：src 保持相对时，pushState 到更深目录后
  //    一旦重新取图就会按新深度解析 → 404。
  for (const el of qsa('img[src], source[src], use[href]')) {
    if (el.closest('#page-root')) continue;
    const attr = el.hasAttribute('src') ? 'src' : 'href';
    const raw = el.getAttribute(attr);
    if (!raw || /^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) continue;
    try { el.setAttribute(attr, new URL(raw, location.href).href); } catch { /* ignore */ }
  }
}

/**
 * 部署位置与构建 base 不一致时的兜底改写。
 *
 * 正常情况（build base == 运行时 base）什么都不做：链接本来就是正确的绝对路径。
 * 只有把同一份产物临时放到子目录预览时才会触发，把开头的 build base 换成运行时 base。
 * 只改「本站路径」，不动 canonical / og 这类对外规范地址。
 */
function rebaseForDeployment(buildBase, runtimeBase) {
  if (!buildBase || buildBase === runtimeBase) return;
  const sel = 'a[href], img[src], source[src], script[src], link[rel="stylesheet"], link[rel~="icon"], link[rel="preload"], link[rel="modulepreload"]';
  for (const el of qsa(sel)) {
    const attr = el.hasAttribute('href') ? 'href' : 'src';
    const raw = el.getAttribute(attr);
    if (!raw) continue;
    if (raw.startsWith(buildBase)) {
      el.setAttribute(attr, runtimeBase + raw.slice(buildBase.length));
      continue;
    }
    if (/^https?:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        if (u.origin === location.origin && u.pathname.startsWith(buildBase)) {
          u.pathname = runtimeBase + u.pathname.slice(buildBase.length);
          el.setAttribute(attr, u.href);
        }
      } catch { /* ignore */ }
    }
  }
}

async function boot({ base = BASE } = {}) {
  const buildBase = document.documentElement.dataset.base || '/';
  rebaseForDeployment(buildBase, base);
  absolutizeHeadAssets();
  absolutizeChromeLinks();
  // 记下运行时 base：404 页等无法用相对路径的场景靠它定位站点根
  try { localStorage.setItem('zx.music.base', base); } catch { /* 存储不可用则忽略 */ }
  const link = (p) => joinUrl(base, p);
  const loadJson = async (p) => {
    const res = await fetch(link(p), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${p} HTTP ${res.status}`);
    return res.json();
  };
  const audio = byId('zx-audio');
  if (!audio) { console.error('[app] 找不到 #zx-audio，播放器无法启动'); return; }

  let catalog;
  try {
    catalog = await loadJson('assets/data/catalog.json');
  } catch (err) {
    toast(`曲库加载失败：${err.message}`, 'bad', 6000);
    catalog = { site: {}, songs: [], albums: [], playlists: [], notes: [] };
  }
  let searchIndex = { entries: [] };
  try { searchIndex = await loadJson('assets/data/search.json'); } catch { /* 搜索降级为空索引 */ }

  const site = catalog.site || {};
  const mediaBase = site.mediaBase || '';
  const resolve = (src) => resolveMedia(src, { mediaBase: '', rel: base });
  // 音频在目录里是「相对 assets/」的路径；mediaBase 一旦配置就整体切到对象存储
  const resolveAudio = (src) => resolveMedia(src, { mediaBase, rel: `${base}assets/` });

  const store = new Store();
  const player = new Player({ audio, catalog, store, resolve, resolveAudio });
  const adapters = new Adapters(site);

  const ui = new PlayerUI(player, { resolve });
  player.ui = ui;
  const lyrics = new LyricsUI(player);
  // 重新打开歌词面板（「词」按钮 / 展示模式切换 / 键盘 L）时立即回到当前行并恢复自动跟随
  ui.onStageChange = (stage) => {
    if (stage === 'lyrics') lyrics.refollow();
  };
  const queueUI = new QueueUI(player);
  const library = new LibraryUI(player, { catalog, searchIndex, resolve, link });
  const homeLatest = new HomeLatestUI(player, { catalog, resolve, link });
  const share = new ShareUI(player, { site, adapters, resolve, link });
  const status = new StatusUI(player, { adapters, base, resolve, resolveAudio });
  const me = new MeUI(player, { resolve, link });
  // 外观 / 布局：只改 <html> 的 data 属性，绝不触碰 audio
  const appearance = new Appearance({ store, player, library, ui });
  // 「黑白胶片」主题的强调色跟着当前封面走（其他主题不读这两个变量）
  player.on('track', ({ song }) => applyCoverAccent(song));

  player.bindMediaSession();
  if (store.data.audioSession) player.setAudioSession(true);

  const app = { cue: { auto: false, touched: false, ready: false }, base, site, catalog, store, player, adapters, ui, lyrics, queueUI, library, homeLatest, share, status, me, appearance, resolve, resolveAudio, link };
  window.__music = app; // 便于真机调试与自动化验收

  /* ── 路由 ─────────────────────────────────────────── */
  const router = new Router({
    base,
    origin: location.origin,
    onNavigate: (route) => onPage(route),
    onError: (err) => console.warn('[router] 回退为整页跳转：', err.message)
  });

  /* ── 播放条预置：访客还没听过任何歌时，不让播放条空着写「还没有在播放」 ──
     歌曲页预置这首歌，其他页预置最新一首；只显示、不出声（播放仍须用户点击）。
     有恢复的队列、或访客已经开始听过，一律不动。 */
  const { cue } = app;
  player.on('state', ({ state }) => { if (state === 'playing') cue.touched = true; });
  function autoCue(route) {
    // 必须等本地状态恢复完：router.start() 会先触发一次 onPage，那时还没 restore
    if (!cue.ready || cue.touched) return;
    if (player.currentItem && !cue.auto) return; // 恢复了上次的队列：尊重它
    const target = route.kind === 'song' && route.slug ? route.slug : catalog.songs?.[0]?.slug;
    if (!target || player.currentSong?.slug === target || !player.songOf(target)) return;
    cue.auto = true;
    player.cueSong(target, { contextSlugs: (catalog.songs || []).map((s) => s.slug) })
      .finally(() => { cue.auto = !!player.currentItem && !cue.touched; });
  }

  function onPage(route) {
    try {
      // 换页后新内容里的路径仍是构建 base，部署位置不同则再兜底一次
      rebaseForDeployment(document.documentElement.dataset.base || '/', base);
      closeSheet();
      queueUI.sheet = null;
      ui.markCurrent(player.currentSong?.slug || null);
      ui.refreshFavorites();
      autoCue(route);
      bindPageLyrics(player);
      if (route.kind === 'library') library.mount();
      if (route.kind === 'me') me.render();
      if (route.kind === 'status') status.mount();
      library.setView(library.view, { lock: false });
      homeLatest.mount();
      qs('.nav')?.classList.remove('is-open');
    } catch (err) {
      // 渲染增强失败不能把页面留成半截：内容已经在 DOM 里，给出提示与恢复入口
      console.error('[app] 页面初始化失败', err);
      showErrorBanner('这一页的部分交互没能初始化，内容仍可阅读。', { base, detail: String(err?.message || err) });
    }
  }

  router.start();
  app.router = router;

  /* ── 全局事件委托：换页后无需重新绑定 ─────────────── */
  // 每个动作都包在边界里：一次失败只影响这次操作，不会变成未捕获 rejection
  document.addEventListener('click', (e) => {
    Promise.resolve()
      .then(() => handleClick(e, app))
      .catch((err) => {
        console.error('[app] 操作失败', err);
        showErrorBanner('这个操作没能完成，页面其它部分仍然可用。', { base, detail: String(err?.message || err) });
      });
  });
  document.addEventListener('change', (e) => {
    const t = tgt(e);
    try {
      if (t.matches?.('[data-act="toggle-audio-session"]')) status.toggleAudioSession(t.checked);
    } catch (err) {
      console.error('[app] 切换失败', err);
      showErrorBanner('这个开关没能切换。', { base, detail: String(err?.message || err) });
    }
  });
  document.addEventListener('keydown', (e) => {
    try { handleKey(e, app); } catch (err) { console.error('[app] 快捷键失败', err); }
  });

  /* ── 兜底边界：任何漏网异常都要给出可见提示与恢复入口 ── */
  window.addEventListener('error', (e) => {
    // 浏览器的布局提示，不是脚本错误：ResizeObserver 回调里的布局变化顺延到下一帧时会报这条，
    // 对页面无任何影响（规范行为）。当成崩溃弹「页面出了点问题」反而吓到访客。
    if (isBenignError(e)) return;
    showErrorBanner('页面脚本遇到一个错误，可以重新加载试试。', { base, detail: String(e.message || '') });
  });
  window.addEventListener('unhandledrejection', (e) => {
    showErrorBanner('有一个操作没有正常完成，可以重新加载试试。', { base, detail: String(e.reason?.message || e.reason || '') });
  });

  /* ── 前后台：绝不主动暂停 ─────────────────────────── */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') player.resync();
    else store.flush();
  });
  window.addEventListener('pagehide', () => store.flush());
  window.addEventListener('beforeunload', () => store.flush());

  /* ── 恢复本地状态：等待用户点击 ───────────────────── */
  player.restore();
  cue.ready = true;
  ui.renderVolume({ volume: audio.volume, muted: audio.muted });
  ui.renderQueue(player.queueInfo());
  onPage(parseRoute(location.pathname, base) || { kind: 'home', slug: null });

  if (store.data.queue?.items?.length) {
    toast('已恢复上次的队列与进度，点播放继续', '', 3600);
  }
  // 坏字段被就地修好时给一句温和提示，绝不清空用户的收藏 / 歌单 / 设置
  if (store.repaired?.length) {
    console.warn('[store] 已修复的本地字段：', store.repaired.join(', '));
    toast('有一小部分本地设置读不出来，已恢复默认；收藏和歌单都还在。', '', 5200);
  }
  return app;
}

export { boot };
/** 从按钮所在的列表推断播放上下文，让「播放这首」之后能自然接下一首 */
function contextFor(btn, slug, app) {
  if (btn.dataset.context === 'song-page') {
    const song = app.catalog.songs.find((s) => s.slug === slug);
    const album = song?.album && app.catalog.albums.find((a) => a.slug === song.album);
    return album?.tracks?.length ? album.tracks : [slug];
  }
  const host = btn.closest('[data-viewpane], .rows, .grid--cards, .notes');
  if (host) {
    const slugs = [...host.querySelectorAll('[data-song]')].map((n) => n.dataset.song);
    if (slugs.includes(slug)) return slugs;
  }
  if (app.router?.current?.kind === 'library') return app.library.visibleSlugs();
  return [slug];
}

async function handleClick(e, app) {
  const btn = tgt(e).closest?.('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const slug = btn.dataset.slug;
  const { player, ui, lyrics, library, queueUI, share, status, me, store } = app;

  // 访客亲手碰过播放 / 队列，就不再自动预置（即便这次被浏览器拦下没出声）
  if (/^(play-|queue-)|^(toggle|next|prev|cycle-mode)$/.test(act || '')) {
    app.cue.touched = true;
    app.player.cued = false;
  }

  switch (act) {
    case 'play-song':
      e.preventDefault();
      await player.playSong(slug, { contextSlugs: contextFor(btn, slug, app) });
      break;
    case 'play-collection':
      e.preventDefault();
      await player.playCollection(btn.dataset.kind, slug);
      break;
    case 'queue-collection': {
      const kind = btn.dataset.kind;
      const list = kind === 'albums'
        ? app.catalog.albums.find((a) => a.slug === slug)
        : app.catalog.playlists.find((p) => p.slug === slug);
      const added = player.addMany(list?.tracks || [], btn.dataset.pos || 'last');
      toast(added.length ? `已加入 ${added.length} 首` : '这个合集还没有曲目', added.length ? 'ok' : 'bad');
      break;
    }
    case 'play-slugs':
      await player.playSlugs((btn.dataset.slugs || '').split(',').filter(Boolean));
      break;
    case 'play-all': await player.playSlugs(library.visibleSlugs()); break;
    case 'queue-all': {
      const added = player.addMany(library.visibleSlugs(), 'last');
      toast(`已加入 ${added.length} 首`, 'ok');
      break;
    }
    case 'queue-next': player.addNext(slug); toast('已设为下一首播放', 'ok'); break;
    case 'queue-last': player.addLast(slug); toast('已加入队列末尾', 'ok'); break;
    case 'fav':
    case 'toggle-fav': {
      const target = slug || player.currentSong?.slug;
      if (!target) { toast('还没有选中歌曲'); break; }
      const on = player.toggleFavorite(target);
      ui.refreshFavorites();
      toast(on ? '已收藏（只保存在这台设备）' : '已取消收藏', on ? 'ok' : '');
      break;
    }
    case 'toggle': await player.toggle(); break;
    case 'prev': await player.prev(); break;
    case 'next': await player.next(); break;
    case 'cycle-mode':
      player.cycleMode();
      toast(`播放模式：${player.queueInfo().modeLabel}`);
      break;
    case 'toggle-mute': player.toggleMute(); break;
    case 'expand': ui.expand(); break;
    case 'collapse': ui.collapse(); break;
    case 'open-lyrics': ui.setLyricsTools(false); ui.expand('lyrics'); break;
    case 'toggle-lyrics': {
      const mode = ui.toggleLyrics(); // 三态循环：off → pure → settings → off
      // 无歌词时入口仍可发现：面板里有空状态，这里再给一句明确提示（只在刚打开纯享时提示一次）。
      // 加载中 / 纯音乐 / 读取失败各有面板自己的文案，不叠加 toast。
      if (mode === 'pure' && !lyrics.pending && !player.currentSong?.instrumental && !player.lyrics?.error && !player.lyrics?.lines?.length) {
        toast('暂无歌词');
      }
      break;
    }
    case 'lyric-offset': player.adjustLyricOffset(Number(btn.dataset.delta) || 0); break;
    case 'lyric-offset-reset': player.setLyricOffset(0); break;
    case 'lyric-font': lyrics.setFont(btn.dataset.size); break;
    case 'open-queue': queueUI.open(); break;
    case 'open-share': await share.open(btn.dataset.kind, slug); break;
    case 'cycle-view': ui.cycleStage(); break;
    case 'set-view': library.setView(btn.dataset.view); break;
    case 'shuffle-latest': app.homeLatest.shuffle(); break;
    case 'filter-tag': library.setTag(btn.dataset.tag); break;
    case 'clear-search': library.clearSearch(); break;
    case 'open-search': {
      const input = byId('libSearch');
      if (input) { input.focus(); input.select(); }
      else await app.router.navigate(app.link('songs/'));
      break;
    }
    case 'open-appearance': app.appearance.open(); break;
    case 'set-theme': app.appearance.setTheme(btn.dataset.theme); break;
    case 'set-layout': app.appearance.setLayout(btn.dataset.layout); break;
    case 'toggle-theme': app.appearance.cycleTheme(); break;
    case 'toggle-nav': {
      const nav = qs('.nav');
      const open = nav?.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(!!open));
      break;
    }
    case 'unfold-lyrics':
      unfoldPageLyrics(btn.closest('.lrcwrap'));
      break;
    case 'copy-link': {
      const ok = await copyText(btn.dataset.url || location.href);
      toast(ok ? '链接已复制' : '复制失败，请手动复制', ok ? 'ok' : 'bad');
      break;
    }
    case 'make-poster': {
      const song = app.catalog.songs.find((s) => s.slug === slug);
      await share.open('song', slug);
      const host = byId('posterHost');
      if (host && song) await share.poster(song, host);
      break;
    }
    case 'run-diagnostics': status.runDiagnostics(); break;
    case 'probe-audio': await status.probeAudio(); break;
    case 'export-local': me.exportLocal(); break;
    case 'clear-favorites':
      store.clearFavorites();
      player.emit('favorites', {});
      me.render();
      ui.refreshFavorites();
      toast('收藏已清空');
      break;
    case 'clear-recent': store.clearRecent(); me.render(); toast('最近播放已清空'); break;
    case 'clear-all':
      store.clearAll();
      player.clearQueue();
      me.render();
      ui.refreshFavorites();
      toast('本机数据已全部清空');
      break;
    default: break;
  }
}
function handleKey(e, app) {
  const tag = tgt(e).tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tgt(e).isContentEditable;
  if (e.key === 'Escape') {
    if (isSheetOpen()) { closeSheet(); app.queueUI.sheet = null; return; }
    if (app.ui.root?.dataset.expanded === 'true') { app.ui.collapse(); return; }
  }
  if (typing) return;
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); app.player.toggle(); }
  else if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); app.player.next(); }
  else if (e.key === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); app.player.prev(); }
  else if (e.key === 'ArrowRight') { app.player.seek((app.player.audio.currentTime || 0) + 5); }
  else if (e.key === 'ArrowLeft') { app.player.seek((app.player.audio.currentTime || 0) - 5); }
  else if (e.key === '/') { e.preventDefault(); byId('libSearch')?.focus(); }
  else if (e.key.toLowerCase() === 'm') { app.player.cycleMode(); toast(`播放模式：${app.player.queueInfo().modeLabel}`); }
  else if (e.key.toLowerCase() === 'l') { app.ui.setLyricsTools(false); app.ui.expand('lyrics'); }
  else if (e.key.toLowerCase() === 'q') { app.queueUI.open(); }
}

// 只有在真实浏览器文档里才自动启动。
// 测试环境显式调用 boot({ base })，并设置 __ZX_TEST__ 抑制自动启动，
// 否则会 boot 两次 → 事件监听器重复绑定 → 一次点击被处理两遍（收藏被 toggled 两次等）。
if (typeof document !== 'undefined' && typeof location !== 'undefined'
  && /^https?:$/.test(location.protocol) && !globalThis.__ZX_TEST__) {
  boot().catch((err) => {
    console.error('[app] 启动失败', err);
    // 预渲染的内容还在，所以不做整页替换；只补一条可见提示与恢复入口
    showErrorBanner('播放器没能启动，页面内容仍然可以阅读。', { base: BASE, detail: String(err?.message || err) });
  });
}