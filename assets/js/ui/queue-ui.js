/** ui/queue-ui.js — 播放队列面板：跳转 / 删除 / 排序 / 清空 / 模式切换。 */

import { escapeHtml as esc, escapeAttr as attr, formatTime } from '../core/util.js';
import { MODES, MODE_LABELS } from '../core/queue.js';
import { MODE_ICON, icon } from '../core/icons.js';
import { openSheet, closeSheet, toast } from './common.js';
import { tgt } from './dom.js';

export class QueueUI {
  constructor(player) {
    this.player = player;
    this.sheet = null;
    player.on('queue', () => { if (this.sheet) this.render(); });
    player.on('track', () => { if (this.sheet) this.render(); });
  }

  open() {
    this.sheet = openSheet({ title: '播放队列', bodyHtml: '<div id="queueBody"></div>', footHtml: this.footHtml() });
    this.sheet.root.addEventListener('click', (e) => this.onClick(e));
    this.render();
  }

  close() { this.sheet = null; closeSheet(); }

  footHtml() {
    const q = this.player.queueInfo();
    const modes = MODES.map((m) => `<button class="chip chip--icon${q.mode === m ? ' is-on' : ''}" type="button" data-qact="mode" data-mode="${m}" aria-pressed="${q.mode === m}">${icon(MODE_ICON[m], { size: 18 })}${esc(MODE_LABELS[m])}</button>`).join('');
    return `${modes}<button class="btn btn--danger" type="button" data-qact="clear">清空队列</button>`;
  }

  render() {
    const host = this.sheet?.root.querySelector('#queueBody');
    if (!host) return;
    const q = this.player.queueInfo();
    if (!q.items.length) {
      host.innerHTML = '<p class="c-mute">队列是空的。去曲库点「下一首播放」或「加入末尾」。</p>';
    } else {
      host.innerHTML = `<ol class="qlist">${q.items.map((it, i) => {
        const song = it.song;
        const title = song ? song.title : `${it.slug}（不在曲库中）`;
        const sub = song ? `${song.artist} · ${formatTime(song.duration)}` : '—';
        const current = it.id === q.currentId;
        return `<li class="qitem${current ? ' is-current' : ''}" data-qid="${attr(it.id)}" data-index="${i}">
          <span class="qitem__no">${current ? icon('play', { size: 14 }) : i + 1}</span>
          <span class="qitem__main" data-qact="jump" role="button" tabindex="0">
            <span class="qitem__t">${esc(title)}</span>
            <span class="qitem__s">${esc(sub)}</span>
          </span>
          <span class="qitem__act">
            <button class="iact iact--sm" type="button" data-qact="up" aria-label="上移" ${i === 0 ? 'disabled' : ''}>${icon('chevron-up', { size: 18 })}</button>
            <button class="iact iact--sm" type="button" data-qact="down" aria-label="下移" ${i === q.items.length - 1 ? 'disabled' : ''}>${icon('chevron-down', { size: 18 })}</button>
            <button class="iact iact--sm" type="button" data-qact="remove" aria-label="从队列移除">${icon('close', { size: 18 })}</button>
          </span>
        </li>`;
      }).join('')}</ol>
      <p class="note">共 ${q.items.length} 首 · 当前模式：${esc(q.modeLabel)}。同一首歌可以重复入队，它们是不同的队列项。</p>`;
    }
    const foot = this.sheet.root.querySelector('.sheet__foot');
    if (foot) foot.innerHTML = this.footHtml();
  }

  onClick(e) {
    const btn = tgt(e).closest('[data-qact]');
    if (!btn) return;
    const act = btn.dataset.qact;
    const li = btn.closest('[data-qid]');
    const id = li?.dataset.qid;
    const index = li ? Number(li.dataset.index) : -1;

    if (act === 'jump' && id) { this.player.jumpTo(id); return; }
    if (act === 'remove' && id) { this.player.removeItem(id); return; }
    if (act === 'up' && index > 0) { this.player.moveItem(index, index - 1); return; }
    if (act === 'down' && index >= 0) { this.player.moveItem(index, index + 1); return; }
    if (act === 'mode') { this.player.setMode(btn.dataset.mode); toast(`播放模式：${MODE_LABELS[btn.dataset.mode]}`); return; }
    if (act === 'clear') { this.player.clearQueue(); toast('队列已清空'); }
  }
}