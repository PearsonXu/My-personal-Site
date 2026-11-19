/**
 * app.js — 应用入口。
 *
 * 启动顺序：解析 base → 拉精简目录 → 建播放器（复用页面里已有的 <audio>）
 *          → 绑定持久 UI → 启动路由 → 恢复本地状态（不自动出声）。
 *
 * ★ 这个模块只执行一次。路由换页不会重新执行它，播放器因此永不重挂载。
 */

import { baseFromModuleUrl, joinUrl, resolveMedia, parseRoute } from './core/paths.js';
import { Store } from './store.js';
import { Player } from './player.js';
import { Router } from './router.js';
import { Adapters } from './adapters.js';
import { PlayerUI } from './ui/player-ui.js';
import { LyricsUI, bindPageLyrics } from './ui/lyrics-ui.js';
import { QueueUI } from './ui/queue-ui.js';
import { LibraryUI } from './ui/library-ui.js';
import { ShareUI } from './ui/share-ui.js';
import { StatusUI } from './ui/status-ui.js';
import { MeUI } from './ui/me-ui.js';
import { Appearance } from './ui/appearance-ui.js';
import { toast, closeSheet, isSheetOpen, copyText } from './ui/common.js';
import { byId, qs, tgt } from './ui/dom.js';

const BASE = baseFromModuleUrl(import.meta.url, 'assets/js/app.js');

async function boot({ base = BASE } = {}) {
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
  const queueUI = new QueueUI(player);
  const library = new LibraryUI(player, { catalog, searchIndex, resolve, link });
  const share = new ShareUI(player, { site, adapters, resolve, link });
  const status = new StatusUI(player, { adapters, base, resolve, resolveAudio });
  const me = new MeUI(player, { resolve, link });
  // 外观 / 布局：只改 <html> 的 data 属性，绝不触碰 audio
  const appearance = new Appearance({ store, player, library, ui });

  player.bindMediaSession();
  if (store.data.audioSession) player.setAudioSession(true);

  const app = { base, site, catalog, store, player, adapters, ui, lyrics, queueUI, library, share, status, me, appearance, resolve, resolveAudio, link };
  window.__music = app; // 便于真机调试与自动化验收

  /* ── 路由 ─────────────────────────────────────────── */
  const router = new Router({
    base,
    origin: location.origin,
    onNavigate: (route) => onPage(route),
    onError: (err) => console.warn('[router] 回退为整页跳转：', err.message)
  });

  function onPage(route) {
    closeSheet();
    queueUI.sheet = null;
    ui.markCurrent(player.currentSong?.slug || null);
    ui.refreshFavorites();
    bindPageLyrics(player);
    if (route.kind === 'library') library.mount();
    if (route.kind === 'me') me.render();
    if (route.kind === 'status') status.mount();
    library.setView(library.view, { lock: false });
    qs('.nav')?.classList.remove('is-open');
  }

  router.start();
  app.router = router;

  /* ── 全局事件委托：换页后无需重新绑定 ─────────────── */
  document.addEventListener('click', (e) => handleClick(e, app));
  document.addEventListener('change', (e) => {
    const t = tgt(e);
    if (t.matches?.('[data-act="toggle-audio-session"]')) status.toggleAudioSession(t.checked);
  });
  document.addEventListener('keydown', (e) => handleKey(e, app));

  /* ── 前后台：绝不主动暂停 ─────────────────────────── */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') player.resync();
    else store.flush();
  });
  window.addEventListener('pagehide', () => store.flush());
  window.addEventListener('beforeunload', () => store.flush());

  /* ── 恢复本地状态：等待用户点击 ───────────────────── */
  player.restore();
  ui.renderVolume({ volume: audio.volume, muted: audio.muted });
  ui.renderQueue(player.queueInfo());
  onPage(parseRoute(location.pathname, base) || { kind: 'home', slug: null });

  if (store.data.queue?.items?.length) {
    toast('已恢复上次的队列与进度，点播放继续', '', 3600);
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
  const { player, ui, library, queueUI, share, status, me, store } = app;

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
    case 'open-lyrics': ui.expand('lyrics'); break;
    case 'open-queue': queueUI.open(); break;
    case 'open-share': await share.open(btn.dataset.kind, slug); break;
    case 'cycle-view': ui.cycleStage(); break;
    case 'set-view': library.setView(btn.dataset.view); break;
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
  else if (e.key.toLowerCase() === 'l') { app.ui.expand('lyrics'); }
  else if (e.key.toLowerCase() === 'q') { app.queueUI.open(); }
}

// 只有在真实浏览器文档里才自动启动；测试环境显式调用 boot({ base })
if (typeof document !== 'undefined' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
  boot().catch((err) => {
    console.error('[app] 启动失败', err);
    toast(`播放器启动失败：${err.message}`, 'bad', 8000);
  });
}