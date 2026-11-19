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
import { escapeHtml as esc, escapeAttr as attr } from '../core/util.js';
import { openSheet, copyText, toast, download } from './common.js';
import { tgt } from './dom.js';

export class ShareUI {
  constructor(player, { site, adapters, resolve, link }) {
    this.player = player;
    this.site = site;
    this.adapters = adapters;
    this.resolve = resolve;
    this.link = link;
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
      footHtml: `${info.song ? '<button class="btn" type="button" data-share="poster"><span aria-hidden="true">▣</span> 生成歌词海报</button>' : ''}
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
      } else if (act === 'poster') {
        await this.poster(info.song, sheet.root.querySelector('#posterHost'));
      } else if (act === 'wechat') {
        const res = await this.adapters.setupWechatShare({ kind: t.kind, slug: t.slug, title: info.title, desc: info.desc, imgUrl: `${this.site.url.replace(/\/+$/, '')}/${info.image}` });
        toast(res.ok ? '分享信息已设置（仍需你自己点右上角分享）' : `微信分享不可用：${res.reason}`, res.ok ? 'ok' : 'bad', 4200);
      }
    });
  }
  /**
   * 歌词海报：Canvas 生成 PNG。
   * 封面与二维码都是同源资源，不会污染画布；
   * 若站长把封面换成了没有 CORS 头的外站图片，这里会降级为无封面海报并说明原因。
   */
  async poster(song, host) {
    if (!song || !host) return;
    host.innerHTML = '<p class="note">海报生成中…</p>';
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0c1018');
    bg.addColorStop(1, '#0a0d14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const load = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

    let coverOk = true;
    const cover = await load(this.resolve(song.cover));
    if (cover) {
      try {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(90, 90, 900, 900, 36) : ctx.rect(90, 90, 900, 900);
        ctx.clip();
        ctx.drawImage(cover, 90, 90, 900, 900);
        ctx.restore();
      } catch { coverOk = false; }
    } else {
      coverOk = false;
    }

    ctx.fillStyle = '#e8eef6';
    ctx.font = '600 54px "Space Grotesk", "PingFang SC", sans-serif';
    ctx.fillText(song.title.slice(0, 22), 90, 1070);
    ctx.fillStyle = '#a4b1c0';
    ctx.font = '32px "Inter", "PingFang SC", sans-serif';
    ctx.fillText(song.artist.slice(0, 30), 90, 1120);

    const lines = (this.player.lyrics?.lines || []).filter((l) => l.text).slice(0, 2);
    ctx.fillStyle = '#59d3ff';
    ctx.font = 'italic 30px Georgia, "Songti SC", serif';
    lines.forEach((line, i) => ctx.fillText(`「${line.text.slice(0, 26)}」`, 90, 1180 + i * 44));

    const qr = await load(this.resolve(`assets/qr/song-${song.slug}.svg`));
    if (qr) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(W - 250, H - 250, 170, 170);
      ctx.drawImage(qr, W - 242, H - 242, 154, 154);
    }
    ctx.fillStyle = '#6e7b8b';
    ctx.font = '24px "JetBrains Mono", monospace';
    ctx.fillText(this.site.url.replace(/^https?:\/\//, ''), 90, H - 90);

    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      host.innerHTML = '<p class="warn">封面图片来自外站且没有开放 CORS，画布被污染，无法导出海报。把封面放到仓库内即可解决。</p>';
      return;
    }

    host.innerHTML = `<p class="note">${coverOk ? '海报已生成' : '封面未能加载（可能是跨域限制），已生成无封面版本'}，长按或点下方按钮保存。</p>
      <img class="poster" src="${attr(dataUrl)}" alt="歌词海报">
      <p class="hero__cta"><button class="btn" type="button" data-poster-save><span aria-hidden="true">⤓</span> 保存 PNG</button></p>`;
    host.querySelector('[data-poster-save]')?.addEventListener('click', () => {
      download(`${song.slug}-poster.png`, dataURItoBlob(dataUrl), 'image/png');
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