# 微信分享与朋友圈

## 已经实现、且不依赖任何外部账号的部分

1. **每首歌一个真实独立路径**：`https://www.xuzhaoqing.com/songs/<slug>/`。
   分享出去点开就是那首歌，不是首页，也不需要登录。
2. **每页独立的初始 HTML 元数据**：`<title>`、`meta description`、`link rel=canonical`、
   `og:title / og:description / og:url / og:image`（生成图为 1200×630 PNG；站长自供封面指向原图，不谎报宽高）、`music:duration` 等，
   全部在**构建期**写进 HTML，不依赖 JS 执行。
3. **明显的播放按钮**：单曲页主按钮就是「▶ 播放这首歌」。
4. **复制链接 + 二维码**：二维码在构建期生成 SVG，内联进页面，
   无 CDN、无 CORS、离线可用；分享弹层与歌词海报按需加载 `assets/qr/song-<slug>.svg`。
5. **歌词海报**：Canvas 生成 1080×1440 竖版 PNG（内容放不下自动加高），顺序为封面→歌名与署名→精选歌词（默认 4–6 行、可勾选调整）→站点标识与单曲二维码；
   歌词独立取目标歌曲的词文件，封面主色做柔和浅色渐变；微信内可长按预览图保存。
6. **微信引导文案**：页面上明确写着「想长时间收听请点右上角在浏览器打开」。

## 必须说清楚的边界

- **首次播放需要用户点击。** 打开网页不会自动出声，这是浏览器自动播放策略，不是故障。
  被拒绝时播放器进入 `blocked` 状态并提示，不会假装在播。
- **Open Graph 只是通用回退。** 它**不保证**决定微信卡片的标题与缩略图。
  微信有自己的抓取与缓存策略。
- **网页不会替用户发朋友圈。** 即使 `updateTimelineShareData` 返回成功，
  也只是「设置好了分享信息」，用户仍需自己点右上角分享。
- **设置成功 ≠ 分享成功。** 真正的验收必须是：真实发布一条朋友圈，
  再让另一个访客点开验证。

## 接入微信 JS-SDK（需要外部条件，当前未配置）

### 前置条件（缺一不可）

1. **已认证的服务号**（订阅号 / 未认证号拿不到 `updateTimelineShareData` 权限）。
2. 公众号后台配置 **JS 接口安全域名**，且域名与页面实际域名一致。
3. 一个**独立后端服务**用来签发签名（不能用 GitHub Pages，Pages 没有运行时）。
4. 页面必须 HTTPS。

> 接入前请**核对当前官方文档**与你的**实际账号权限**：
> 微信的分享接口名称与权限要求改过多次（`onMenuShareTimeline` 已废弃，
> 现在是 `updateAppMessageShareData` / `updateTimelineShareData`）。
> 本仓库按后者实现，但**你的账号是否有权限必须自己确认**。

### 签名服务的契约

前端 `POST` 到 `content/site.json` 里 `backends.wechat.signEndpoint`：

```json
请求: { "url": "https://www.xuzhaoqing.com/songs/night-ferry/" }
响应: { "appId": "wx…", "timestamp": 1763…, "nonceStr": "…", "signature": "…" }
```

- `url` 是**当前页面实际地址去掉 hash**（保留查询串），由 `signUrl()` 生成。
- 服务端用 `jsapi_ticket` 按微信算法计算 `signature`。
- **AppSecret / access_token / jsapi_ticket 绝不进入前端、仓库或构建产物。**
  构建产物有自动化测试扫描疑似凭据赋值。
- 对外分享链接单独使用**规范地址**（`canonicalUrl()`），与签名用的 URL 是两回事。

### 朋友圈与聊天分别配置

`adapters.setupWechatShare()` 里：

```js
wx.updateAppMessageShareData({ title, desc, link, imgUrl });  // 聊天
wx.updateTimelineShareData({ title, link, imgUrl });          // 朋友圈
```

朋友圈**不接受 desc**，所以朋友圈效果不能依赖描述字段——标题与图片必须自己给对。

### 未配置 / 不可用时的行为

- `backends.wechat.signEndpoint` 为空 → 页面显示「未配置」，
  分享弹层里不出现「配置微信分享信息」按钮。
- 签名服务报错、`wx` 未注入、`wx.config` 失败 → 给出一条 toast 说明原因，
  **复制链接与二维码照常可用，听歌完全不受影响**。

## 验收要求

朋友圈分享必须**真实发布后由访客打开验证**，记录：
微信版本、系统、网络、卡片标题与缩略图是否正确、点开是否直达歌曲页、
是否能点击播放。未做这一步就标 `NOT_RUN` / `BLOCKED`，不要写「已通过」。