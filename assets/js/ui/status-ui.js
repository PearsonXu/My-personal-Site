/**
 * ui/status-ui.js — /status/ 页面的自检工具。
 * 结果全部来自当前浏览器的真实探测，不写死、不猜测。
 */

import { escapeHtml as esc } from '../core/util.js';
import { toast } from './common.js';
import { byId, qsa, qs } from './dom.js';

function row(label, value, level = '') {
  return `<tr><td>${esc(label)}</td><td class="${level}">${esc(String(value))}</td></tr>`;
}

export class StatusUI {
  constructor(player, { adapters, base, resolve, resolveAudio }) {
    this.player = player;
    this.adapters = adapters;
    this.base = base;
    this.resolve = resolve;
    this.resolveAudio = resolveAudio || resolve;
  }

  mount() {
    const baseEl = qs('[data-diag-base]');
    if (baseEl) baseEl.textContent = this.base;
    const toggle = byId('audioSessionToggle');
    if (toggle) {
      toggle.checked = !!this.player.store?.data?.audioSession;
      toggle.disabled = !this.player.audioSessionSupported;
      const state = byId('audioSessionState');
      if (state) {
        state.textContent = this.player.audioSessionSupported
          ? `当前浏览器支持 Audio Session，类型：${navigator.audioSession.type}`
          : '当前浏览器不支持 Audio Session（这是 iOS 的私有接口），开关已禁用。';
      }
    }
    for (const el of qsa('[data-backend-status]')) {
      const s = this.adapters.status(el.dataset.backendStatus);
      el.textContent = s.configured ? '已配置' : '未配置';
      el.className = `status ${s.configured ? 'status--on' : 'status--off'}`;
    }
  }

  runDiagnostics() {
    const out = byId('diagOut');
    if (!out) return;
    const caps = this.player.capabilities();
    const ua = navigator.userAgent;
    const isWechat = /MicroMessenger/i.test(ua);
    const rows = [
      row('运行时 base', this.base),
      row('当前 URL（签名用，去 hash）', location.href.split('#')[0]),
      row('Media Session', caps.mediaSession ? '支持' : '不支持', caps.mediaSession ? 'ok' : 'warn'),
      row('MediaMetadata', caps.mediaMetadata ? '支持' : '不支持', caps.mediaMetadata ? 'ok' : 'warn'),
      row('setPositionState', caps.setPositionState ? '支持' : '不支持', caps.setPositionState ? 'ok' : 'warn'),
      row('Audio Session（实验性）', caps.audioSession ? `支持，type=${caps.audioSessionType}` : '不支持', caps.audioSession ? 'ok' : ''),
      row('网页音量控制', caps.volumeControl ? '可用' : '不可用（请用系统音量键）', caps.volumeControl ? 'ok' : 'warn'),
      row('canPlayType(audio/mpeg)', caps.canPlayMp3, caps.canPlayMp3 === 'probably' ? 'ok' : 'warn'),
      row('localStorage', caps.localStorage ? '可用' : '不可用（隐私模式？数据不会持久化）', caps.localStorage ? 'ok' : 'bad'),
      row('页面可见性', document.visibilityState),
      row('微信内置浏览器', isWechat ? '是（后台策略更严格，建议用系统浏览器）' : '否', isWechat ? 'warn' : ''),
      row('安全上下文 HTTPS', window.isSecureContext ? '是' : '否', window.isSecureContext ? 'ok' : 'warn'),
      row('prefers-reduced-motion', typeof window.matchMedia === 'function'
        ? (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? '开启（动画已降级）' : '关闭')
        : '当前环境不支持查询'),
      row('User-Agent', ua)
    ];
    for (const s of this.adapters.allStatus()) {
      rows.push(row(`后端 · ${s.label}`, s.configured ? '已配置' : '未配置', s.configured ? 'ok' : ''));
    }
    out.innerHTML = `<table>${rows.join('')}</table>
      <p class="note">注意：以上只说明「接口是否存在」。后台能否连续切歌必须真机实测，见 docs/ACCEPTANCE.md。</p>`;
    toast('自检完成');
  }

  async probeAudio() {
    const out = byId('probeOut');
    if (!out) return;
    const song = this.player.catalog.songs[0];
    if (!song) { out.innerHTML = '<p class="warn">曲库为空，没有可探测的音源。</p>'; return; }
    const url = this.resolveAudio(song.audio);
    out.innerHTML = '<p class="c-mute">探测中…</p>';
    try {
      const res = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
      const h = (k) => res.headers.get(k) || '（无）';
      const ok206 = res.status === 206;
      const mime = h('content-type');
      const rows = [
        row('音源', url),
        row('HTTP 状态', res.status, ok206 ? 'ok' : 'warn'),
        row('Content-Type', mime, /audio\//.test(mime) ? 'ok' : 'bad'),
        row('Accept-Ranges', h('accept-ranges'), /bytes/.test(h('accept-ranges')) ? 'ok' : 'warn'),
        row('Content-Range', h('content-range'), ok206 ? 'ok' : 'warn'),
        row('Content-Length', h('content-length')),
        row('Access-Control-Allow-Origin', h('access-control-allow-origin'))
      ];
      const verdict = ok206
        ? '<p class="note ok">支持 Range：拖动进度条应当可用。</p>'
        : '<p class="note warn">没有返回 206。若服务器忽略 Range，拖动进度条可能失败或需要整段下载。GitHub Pages 正常会返回 206。</p>';
      out.innerHTML = `<table>${rows.join('')}</table>${verdict}`;
    } catch (err) {
      out.innerHTML = `<p class="warn">探测失败：${esc(String(err.message || err))}。若是跨域音源，请检查对象存储的 CORS 配置。</p>`;
    }
  }

  toggleAudioSession(enabled) {
    const res = this.player.setAudioSession(enabled);
    const state = byId('audioSessionState');
    if (state) {
      state.textContent = res.supported
        ? `已${res.enabled ? '启用' : '关闭'}，当前 type=${res.type || '未知'}${res.error ? `（${res.error}）` : ''}`
        : '当前浏览器不支持 Audio Session。';
    }
    toast(res.supported ? `实验性 Audio Session 已${res.enabled ? '开启' : '关闭'}` : '当前浏览器不支持 Audio Session');
  }
}