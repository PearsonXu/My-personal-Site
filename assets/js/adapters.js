/**
 * adapters.js — 后端适配层。
 *
 * 静态站点本身不依赖任何服务器。下面这些能力**需要独立后端**，
 * 未配置时一律返回 { configured:false }，UI 据此显示「未配置」，
 * 绝不假装成功，也绝不影响听歌。
 *
 * ★ 微信签名必须由服务端在运行时签发：
 *   AppSecret / access_token / jsapi_ticket 不得出现在前端、仓库或构建产物中。
 *   前端只把「当前页面 URL（去掉 hash）」发给签名服务。
 */

import { signUrl, canonicalUrl } from './core/paths.js';

export class Adapters {
  constructor(site) {
    this.site = site;
    this.backends = site.backends || {};
  }

  status(key) {
    const cfg = this.backends[key] || {};
    const endpoint = cfg.endpoint || cfg.signEndpoint || '';
    return {
      key,
      label: cfg.label || key,
      configured: !!endpoint,
      endpoint,
      note: cfg.note || ''
    };
  }

  allStatus() {
    return Object.keys(this.backends).map((k) => this.status(k));
  }

  async _post(key, payload) {
    const s = this.status(key);
    if (!s.configured) return { ok: false, configured: false, reason: 'not-configured', status: s };
    try {
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) return { ok: false, configured: true, reason: `HTTP ${res.status}` };
      return { ok: true, configured: true, data: await res.json() };
    } catch (err) {
      return { ok: false, configured: true, reason: String(err.message || err) };
    }
  }

  /** 在线管理：未配置时内容只能本地编辑 + git push */
  publishContent(payload) { return this._post('admin', payload); }

  /** 访客发帖：默认关闭 */
  submitGuestPost(payload) { return this._post('guestPosts', payload); }

  /** 评论 */
  submitComment(payload) { return this._post('comments', payload); }

  /** 跨设备同步：未配置时收藏/队列只在本机 */
  syncLocalData(payload) { return this._post('accountSync', payload); }

  /**
   * 微信 JS-SDK 签名。
   * @param {string} href 当前页面完整 URL（内部会去掉 hash，保留查询串）
   * 返回的 signature 由服务端用 jsapi_ticket 计算，前端永远拿不到 ticket。
   */
  async wechatSignature(href = location.href) {
    const s = this.status('wechat');
    if (!s.configured) return { ok: false, configured: false, reason: 'not-configured', status: s };
    const url = signUrl(href);
    try {
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (!res.ok) return { ok: false, configured: true, reason: `HTTP ${res.status}` };
      const data = await res.json();
      const required = ['appId', 'timestamp', 'nonceStr', 'signature'];
      const missing = required.filter((k) => !data[k]);
      if (missing.length) return { ok: false, configured: true, reason: `签名服务缺少字段：${missing.join(', ')}` };
      return { ok: true, configured: true, data, signedUrl: url };
    } catch (err) {
      return { ok: false, configured: true, reason: String(err.message || err) };
    }
  }

  /**
   * 配置微信分享。朋友圈与聊天**分别**配置，不把朋友圈效果依赖在描述字段上。
   * 注意：设置成功 ≠ 已经分享成功，网页不会替用户自动发布朋友圈。
   */
  async setupWechatShare({ kind, slug, title, desc, imgUrl }) {
    const sig = await this.wechatSignature();
    if (!sig.ok) return { ...sig, stage: 'signature' };
    if (typeof wx === 'undefined') return { ok: false, configured: true, reason: '微信 JS-SDK 未加载（仅在微信内可用）' };
    const link = canonicalUrl(this.site.url, kind, slug);
    const image = imgUrl || `${this.site.url.replace(/\/+$/, '')}/assets/img/og/default.png`;
    return new Promise((resolve) => {
      try {
        wx.config({
          debug: false,
          appId: sig.data.appId,
          timestamp: sig.data.timestamp,
          nonceStr: sig.data.nonceStr,
          signature: sig.data.signature,
          jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData']
        });
        wx.ready(() => {
          // 聊天分享
          wx.updateAppMessageShareData({ title, desc, link, imgUrl: image, success: () => {} });
          // 朋友圈分享：独立配置，标题与图片单独给
          wx.updateTimelineShareData({ title, link, imgUrl: image, success: () => {} });
          resolve({ ok: true, configured: true, note: '分享信息已设置。用户仍需自己点右上角分享，网页不会代发。' });
        });
        wx.error((err) => resolve({ ok: false, configured: true, reason: `wx.config 失败：${JSON.stringify(err)}` }));
      } catch (err) {
        resolve({ ok: false, configured: true, reason: String(err.message || err) });
      }
    });
  }
}