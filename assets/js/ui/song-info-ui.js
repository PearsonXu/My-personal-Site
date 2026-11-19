/**
 * ui/song-info-ui.js — 「简介」面板：当前播放歌曲的署名与本站版本信息。
 *
 * 原则（与 AGENTS.md 诚实性要求一致）：
 *  - 只渲染真实存在的字段：缺失即隐藏，不编造署名、不展示空标签；
 *  - 原作署名（原唱 / 作词 / 作曲）与本站版本制作信息（版本说明 / 制作 / 生成工具）分开；
 *  - SUNO 等生成工具单独一行标注，绝不混进原唱 / 词曲作者；
 *  - 全部资料缺失时显示「歌曲资料待补充」。
 * 切歌由 player 的 track 事件驱动重渲染，不会残留上一首的信息。
 */

import { escapeHtml } from '../core/util.js';
import { byId } from './dom.js';

const EMPTY = '歌曲资料待补充';

export class SongInfoUI {
  constructor(player) {
    this.player = player;
    this.container = byId('plAbout');
    player.on('track', ({ song }) => this.render(song));
    this.render(player.currentSong || null);
  }

  render(song) {
    const c = this.container;
    if (!c) return;
    const title = song ? `<h3 class="pl__about__title">${escapeHtml(song.title)}</h3>` : '';
    if (!song) { c.innerHTML = `${title}<p class="pl__about__empty">${EMPTY}</p>`; return; }

    const rows = [];
    const row = (label, value, hint = '') => {
      if (!value) return;
      const t = hint ? ` title="${escapeHtml(hint)}"` : '';
      rows.push(`<div class="pl__about__row"${t}><span class="pl__about__k">${escapeHtml(label)}</span><span class="pl__about__v">${escapeHtml(value)}</span></div>`);
    };
    row('原唱', song.originalArtist);
    row('作词', song.lyricist);
    row('作曲', song.composer);
    row('本站版本', song.versionNote || (song.demo ? 'DEMO 测试音（合成音源，非站长作品）' : ''));
    row('版本制作', song.versionBy);
    if (Array.isArray(song.tools) && song.tools.length) {
      row('生成工具', song.tools.join('、'), '生成工具单独标注，不计入原唱 / 作词 / 作曲署名');
    }
    const credits = Array.isArray(song.credits) ? song.credits.filter((x) => typeof x === 'string' && x.trim()) : [];
    const intro = song.about ? `<p class="pl__about__intro">${escapeHtml(song.about)}</p>` : '';
    const extra = credits.map((line) => `<p class="pl__about__credit">${escapeHtml(line)}</p>`).join('');

    if (!rows.length && !credits.length && !intro) {
      c.innerHTML = `${title}<p class="pl__about__empty">${EMPTY}</p>`;
      return;
    }
    c.innerHTML = `${title}${rows.join('')}${extra}${intro}`;
  }
}