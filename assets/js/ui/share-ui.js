/**
 * ui/share-ui.js — 分享：复制链接 / 二维码 / 歌词海报 / 微信适配。
 *
 * 原则：
 *  - 分享链接一律用**规范地址**（canonical），不是当前带 hash 的 URL；
 *  - 微信签名走 adapters（运行时由独立服务签发），未配置就如实说未配置；
 *  - 微信不可用时，复制链接与二维码照常可用，听歌完全不受影响；
 *  - 网页不替用户发布朋友圈；设置分享信息成功 ≠ 已经分享成功。
 */

import { canonicalUrl } from '../core/paths.js';
import { parseLrc } from '../core/lrc.js';
import { sanitizeLyricLines, defaultSelection, layoutPoster, posterPalette, mixColor } from '../core/poster.js';
import { escapeHtml as esc, escapeAttr as attr } from '../core/util.js';
import { openSheet, copyText, toast, download } from './common.js';
import { icon } from '../core/icons.js';
import { tgt } from './dom.js';

export class ShareUI {
  constructor(player, { site, adapters, resolve, link }) {
    this.player = player;
    this.site = site;
    this.adapters = adapters;
    this.resolve = resolve;
    this.link = link;
    this._posterSeq = 0;
  }

  /**
   * 分享目标解析。
   *
   * ★ 关键：**绝不用 window.location.href 当分享地址**。
   *   用户可能在首页或曲库播放歌曲，当前页面地址并不是正在播放那首歌的地址。
   *   分享地址一律由「目标歌曲 slug + 站点正式域名 + 现有路由」算出。
   */
  songTarget(slug) {
    const target = slug || this.player.currentSong?.slug || null;
    if (!target) return null;
    return this.player.catalog.songs.find((s) => s.slug === target) || null;
  }

  /** 该歌曲的正式详情页完整 URL（沿用现有路由 /songs/<slug>/） */
  songUrl(slug) {
    return canonicalUrl(this.site.url, 'song', slug);
  }

  songSharePayload(song) {
    const desc = (song.about || '').replace(/[*`#>]/g, '').replace(/\s+/g, ' ').trim();
    return {
      title: `${song.title}｜${this.site.title}`,
      text: desc ? `${song.title} · ${song.artist} — ${desc.slice(0, 120)}` : `${song.title} · ${song.artist}`,
      url: this.songUrl(song.slug)
    };
  }

  /**
   * 分享一首歌：优先系统分享（传入该歌的 title / text / url），
   * 不支持时复制该歌的完整链接，并打开二维码 / 海报面板。
   * 注意：navigator.share 必须在用户手势的有效期内调用，所以前面不加任何 await。
   */
  async shareSong(slug) {
    const song = this.songTarget(slug);
    if (!song) {
      toast('先选一首歌，再分享它', 'bad');
      return { ok: false, reason: 'no-song' };
    }
    const payload = this.songSharePayload(song);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
        return { ok: true, via: 'system', url: payload.url };
      } catch (err) {
        // 用户主动取消：不当成失败，也不退回复制
        if (err?.name === 'AbortError') return { ok: false, via: 'system', reason: 'cancelled' };
        // 其它失败（权限 / 不支持该 payload）继续走复制回退
      }
    }
    const copied = await copyText(payload.url);
    toast(copied ? `已复制《${song.title}》的链接` : '复制失败，请在面板里手动复制', copied ? 'ok' : 'bad');
    await this.open('song', song.slug);
    return { ok: copied, via: 'copy', url: payload.url };
  }

  target(kind, slug) {
    if (kind && slug) return { kind, slug };
    const song = this.player.currentSong;
    if (song) return { kind: 'song', slug: song.slug };
    const body = document.body;
    return { kind: body.dataset.kind || 'home', slug: body.dataset.slug || null };
  }

  info(kind, slug) {
    const c = this.player.catalog;
    if (kind === 'song') {
      const s = c.songs.find((x) => x.slug === slug);
      return { title: s?.title || this.site.title, desc: s ? `${s.artist} · 在线试听` : this.site.tagline, image: s?.ogPath || 'assets/img/og/default.png', song: s };
    }
    if (kind === 'album') {
      const a = c.albums.find((x) => x.slug === slug);
      return { title: a?.title || this.site.title, desc: `专辑 · ${a?.tracks.length || 0} 首`, image: a?.cover || 'assets/img/og/default.png' };
    }
    if (kind === 'playlist') {
      const p = c.playlists.find((x) => x.slug === slug);
      return { title: p?.title || this.site.title, desc: `歌单 · ${p?.tracks.length || 0} 首`, image: p?.cover || 'assets/img/og/default.png' };
    }
    if (kind === 'note') {
      const n = c.notes.find((x) => x.slug === slug);
      return { title: n?.title || this.site.title, desc: n?.excerpt || this.site.tagline, image: n?.cover || 'assets/img/og/default.png' };
    }
    return { title: this.site.title, desc: this.site.tagline, image: 'assets/img/og/default.png' };
  }

  async open(kind, slug) {
    const t = this.target(kind, slug);
    const info = this.info(t.kind, t.slug);
    const url = canonicalUrl(this.site.url, t.kind, t.slug);
    const qrSrc = this.resolve(`assets/qr/${t.kind}${t.slug ? `-${t.slug}` : ''}.svg`);
    const wechat = this.adapters.status('wechat');

    const sheet = openSheet({
      title: '分享',
      bodyHtml: `
        <p class="c-dim">${esc(info.title)}</p>
        <div class="share__row">
          <input class="share__url" type="text" readonly value="${attr(url)}" aria-label="分享链接">
          <button class="btn" type="button" data-share="copy"><span aria-hidden="true">⧉</span> 复制链接</button>
        </div>
        <div class="share__qr">
          <div class="qr"><img src="${attr(qrSrc)}" alt="分享链接二维码" width="168" height="168"></div>
          <div class="share__tips">
            <p class="note">这是规范地址，任何人点开都直达这一页，无需登录。首次播放需要对方点一下播放按钮。</p>
            <p class="note">微信里想长时间收听，请让对方点右上角「在浏览器打开」。</p>
            <p class="note">微信自定义分享：${wechat.configured ? '<span class="status status--on">已配置</span>' : '<span class="status status--off">未配置</span>'}</p>
          </div>
        </div>
        <div id="posterHost"></div>`,
      footHtml: `${info.song ? `<button class="btn btn--pri" type="button" data-share="system">${icon('share', { size: 18 })} 分享这首歌</button>` : ''}
        ${info.song ? `<button class="btn" type="button" data-share="poster">${icon('cover', { size: 18 })} 歌词海报</button>` : ''}
        ${wechat.configured ? '<button class="btn btn--quiet" type="button" data-share="wechat">配置微信分享信息</button>' : ''}
        <a class="btn btn--quiet" href="${attr(this.link(t.slug ? `${t.kind === 'song' ? 'songs' : t.kind === 'note' ? 'notes' : t.kind === 'album' ? 'albums' : 'playlists'}/${t.slug}/` : ''))}">打开页面</a>`
    });

    sheet.root.addEventListener('click', async (e) => {
      const btn = tgt(e).closest('[data-share]');
      if (!btn) return;
      const act = btn.dataset.share;
      if (act === 'copy') {
        const ok = await copyText(url);
        toast(ok ? '链接已复制' : '复制失败，请长按输入框手动复制', ok ? 'ok' : 'bad');
      } else if (act === 'system') {
        // 面板里的「分享这首歌」同样按目标歌曲生成地址，不用当前页面地址
        await this.shareSong(t.kind === 'song' ? t.slug : undefined);
      } else if (act === 'poster') {
        await this.poster(info.song, sheet.root.querySelector('#posterHost'));
      } else if (act === 'wechat') {
        const res = await this.adapters.setupWechatShare({ kind: t.kind, slug: t.slug, title: info.title, desc: info.desc, imgUrl: `${this.site.url.replace(/\/+$/, '')}/${info.image}` });
        toast(res.ok ? '分享信息已设置（仍需你自己点右上角分享）' : `微信分享不可用：${res.reason}`, res.ok ? 'ok' : 'bad', 4200);
      }
    });
  }
  /**
   * 歌词海报：Canvas 生成 1080×1440 竖版 PNG（内容放不下时自动加高，绝不裁切）。
   * ★ 歌词永远独立 fetch **目标歌曲**的词文件，绝不读 player.lyrics（那是正在播的歌）；
   * ★ 所有异步回调过 token 守卫：生成期间切歌 / 重开面板不会混入另一首歌的资料；
   * ★ 封面以 crossOrigin=anonymous 加载：无 CORS 的外站图直接走回退，不会污染画布；
   * ★ 封面 / 歌词 / 二维码缺失时如实说明并回退，不报告虚假的生成成功。
   */
  async poster(song, host) {
    if (!song || !host) return;
    const seq = ++this._posterSeq;
    host.innerHTML = '<p class="note">海报准备中…</p>';
    let parsed = { format: 'none', meta: {}, lines: [] };
    let lyricErr = '';
    if (song.instrumental) lyricErr = '这首歌是纯音乐，没有歌词';
    else if (!song.lyrics) lyricErr = '这首歌还没有歌词文件';
    else {
      try {
        const res = await fetch(this.resolve(song.lyrics));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        parsed = parseLrc(await res.text());
      } catch { lyricErr = '歌词文件加载失败'; }
    }
    if (seq !== this._posterSeq) return;
    const lines = sanitizeLyricLines(parsed);
    if (!lines.length && !lyricErr) lyricErr = '歌词清洗后没有可用行';
    const sel = new Set(defaultSelection(lines));
    host.innerHTML = `${lines.length ? `<div class="poster-pick">
      <div class="poster-pick__bar"><span class="note" data-pick-count></span>
        <button class="btn btn--quiet" type="button" data-pick-reset>重置选句</button></div>
      <div class="poster-pick__list" role="group" aria-label="选择歌词句">${lines.map((t, i) => `<label class="poster-pick__item"><input type="checkbox" data-line="${i}"${sel.has(i) ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>
    </div>` : `<p class="warn">${esc(lyricErr)}：已生成无歌词版海报（封面、歌名与二维码照常）。</p>`}
    <div class="poster-out" data-poster-out><p class="note">海报生成中…</p></div>`;
    const out = host.querySelector('[data-poster-out]');
    const countEl = host.querySelector('[data-pick-count]');
    const syncCount = () => { if (countEl) countEl.textContent = `已选 ${sel.size} 行（建议 4–6 行），勾选可调整选句`; };
    syncCount();
    const state = { dataUrl: '' };
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    const regen = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { this._drawPoster(song, lines, sel, out, state, seq); }, 120);
    };
    host.querySelector('[data-pick-reset]')?.addEventListener('click', () => {
      sel.clear();
      defaultSelection(lines).forEach((i) => sel.add(i));
      host.querySelectorAll('.poster-pick__item input').forEach((cb) => { cb.checked = sel.has(Number(cb.dataset.line)); });
      syncCount();
      regen();
    });
    host.querySelector('.poster-pick__list')?.addEventListener('change', (e) => {
      const i = Number(e.target?.dataset?.line);
      if (!Number.isFinite(i)) return;
      if (e.target.checked) sel.add(i); else sel.delete(i);
      syncCount();
      regen();
    });
    regen();
  }

  /** 海报绘制：测量 → 版面（core/poster.js）→ 逐块绘制 → 导出。与选句 UI 解耦，可反复重生成。 */
  async _drawPoster(song, lines, sel, out, state, seq) {
    const chosen = lines.filter((_, i) => sel.has(i));
    const load = (src) => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    const [cover, qr] = await Promise.all([
      load(this.resolve(song.cover)),
      load(this.resolve(`assets/qr/song-${song.slug}.svg`)),
      (document.fonts && document.fonts.ready) || Promise.resolve()
    ]);
    if (seq !== this._posterSeq) return;
    const scratch = document.createElement('canvas');
    const mctx = scratch.getContext('2d');
    const famD = getComputedStyle(document.documentElement).getPropertyValue('--font-d').trim() || 'sans-serif';
    const famM = getComputedStyle(document.documentElement).getPropertyValue('--font-m').trim() || 'monospace';
    const fontFor = (kind, size) => (kind === 'url' ? `${size}px ${famM}` : `${kind === 'title' ? 600 : 400} ${size}px ${famD}`);
    const measure = (t, size, kind) => { mctx.font = fontFor(kind, size); return mctx.measureText(t).width; };
    const layout = layoutPoster({
      title: song.title,
      artist: song.artist,
      lyricLines: chosen,
      siteLabel: this.site.title,
      urlLabel: this.site.url.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
      hasCover: !!cover,
      hasQr: !!qr
    }, measure);

    let dom = null;
    if (cover) {
      try {
        const s = document.createElement('canvas');
        s.width = 24; s.height = 24;
        const sc = s.getContext('2d');
        sc.drawImage(cover, 0, 0, 24, 24);
        const d = sc.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        if (n) dom = [r / n, g / n, b / n];
      } catch { dom = null; }
    }
    const pal = posterPalette(dom);
    const canvas = document.createElement('canvas');
    canvas.width = layout.W;
    canvas.height = layout.H;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, layout.H);
    bg.addColorStop(0, pal.bgTop);
    bg.addColorStop(1, pal.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, layout.W, layout.H);
    ctx.textBaseline = 'top';
    for (const b of layout.blocks) {
      if (b.kind === 'cover') {
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, 28); else ctx.rect(b.x, b.y, b.w, b.h);
        ctx.clip();
        if (cover) {
          const sc = Math.min(b.w / cover.width, b.h / cover.height);
          const w = cover.width * sc;
          const h = cover.height * sc;
          ctx.drawImage(cover, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
        } else {
          ctx.fillStyle = mixColor(dom || [127, 142, 163], '#ffffff', 0.6);
          ctx.fillRect(b.x, b.y, b.w, b.h);
          ctx.fillStyle = pal.mute;
          ctx.font = fontFor('artist', 30);
          ctx.textAlign = 'center';
          ctx.fillText('封面未能加载', b.x + b.w / 2, b.y + b.h / 2 - 15);
          ctx.textAlign = 'left';
        }
        ctx.restore();
      } else if (b.kind === 'rule') {
        ctx.fillStyle = pal.rule;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      } else if (b.kind === 'qr') {
        ctx.fillStyle = pal.card;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, 12); else ctx.rect(b.x, b.y, b.w, b.h);
        ctx.fill();
        const pad = (b.w - b.inner) / 2;
        ctx.drawImage(qr, b.x + pad, b.y + pad, b.inner, b.inner);
      } else {
        ctx.fillStyle = b.kind === 'artist' || b.kind === 'url' ? pal.mute : pal.ink;
        ctx.font = fontFor(b.kind, b.size);
        ctx.textAlign = b.align === 'center' ? 'center' : 'left';
        b.lines.forEach((t, i) => ctx.fillText(t, b.x, b.y + i * b.lh));
        ctx.textAlign = 'left';
      }
    }
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      out.innerHTML = '<p class="warn">画布被跨域图片污染，无法导出。请把封面放到仓库内（同源）后重试。</p>';
      return;
    }
    if (seq !== this._posterSeq) return;
    state.dataUrl = dataUrl;
    const notes = [cover ? '海报已生成' : '封面未能加载（可能跨域或缺文件），已用占位封面生成'];
    if (!chosen.length) notes.push('无歌词版');
    if (!qr) notes.push('二维码资源缺失，仅显示链接文字');
    if (layout.meta.grown) notes.push(`内容较多，尺寸 ${layout.W}×${layout.H}`);
    out.innerHTML = `<p class="note">${esc(notes.join('；'))}。长按图片或点下方按钮保存。</p>
      <img class="poster" data-song-slug="${attr(song.slug)}" src="${attr(dataUrl)}" alt="${attr(song.title)} 歌词海报">
      <p class="hero__cta"><button class="btn" type="button" data-poster-save>${icon('download', { size: 18 })} 保存 PNG</button></p>`;
    out.querySelector('[data-poster-save]')?.addEventListener('click', () => {
      if (state.dataUrl) download(`${song.slug}-poster.png`, dataURItoBlob(state.dataUrl), 'image/png');
    });
  }
}

function dataURItoBlob(dataUri) {
  const [head, body] = dataUri.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/png';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}