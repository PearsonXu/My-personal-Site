# 移动端与后台播放：实现与真实边界

## 实现了什么

| 能力 | 实现位置 | 说明 |
| --- | --- | --- |
| 桌面完整播放器 | `player.css` `.pl__bar` | 封面 / 标题 / 进度 / 上下首 / 模式 / 收藏 / 歌词 / 队列 / 分享 / 音量 |
| 手机迷你条 | `@media (max-width:760px)` | 封面 + 标题 + 播放/下一首，底部细进度条 |
| 展开播放页 | `#plFull` | 点封面或 ⤢ 展开；封面 / 唱片 / 全屏歌词三种舞台 |
| 原生音频主链路 | `<audio id="zx-audio">` | 全站唯一，无隐藏 video、无静音循环 |
| Media Session | `Player.bindMediaSession()` | 歌名 / 歌手 / 专辑 / 封面；play/pause/prev/next/seekto/seek±/stop |
| 位置同步 | `_updatePositionState()` | 支持时上报 duration/position/playbackRate，锁屏进度条才准 |
| Audio Session | `Player.setAudioSession()` | **默认关闭**，`/status/` 页可开关，仅 iOS 有此接口 |
| 后台不主动暂停 | `app.js` `visibilitychange` | 隐藏时只 `store.flush()`，**从不调用 pause()** |
| 回前台校准 | `Player.resync()` | 按真实 `currentTime` 重算进度与歌词行，不做推算 |
| 音量不可用的处理 | `_probeVolume()` | iOS 上 `volume` 只读 → 禁用滑块并提示用系统音量键 |
| 安全区 / 大按钮 / 减少动画 | `env(safe-area-inset-*)`、`min-height:44px`、`prefers-reduced-motion` | 见 CSS |

## 两个必须分开说的能力

### A. 当前这首歌切后台 / 锁屏继续播

在 iOS Safari、Android Chrome 上**通常成立**：系统把正在出声的媒体当作媒体会话保活。
微信内置浏览器**不稳定**，随版本变化。

### B. 后台播完自动接下一首

**不保证。** 页面被系统挂起后 JavaScript 可能被冻结，`ended` 事件里的换歌逻辑就跑不了。
本站的实现是：`ended` → `queue.advance({auto:true})` → 加载下一首。
只要 JS 还在跑就成立；JS 被冻结就不成立。**没有任何网页能承诺绕过这一点。**

> 因此：**「当前歌能后台播」不等于「后台连续切歌已通过」。**
> 验收表里这两项是**独立**的两行。

## 明确不做的事

- ❌ 隐藏 `<video>` 播放来「保活」
- ❌ 静音循环音频骗过系统
- ❌ `setInterval` 心跳假装维持后台执行
- ❌ 把 PWA / Service Worker 当作无限后台执行权限
- ❌ 在 `visibilitychange` 里主动暂停

## 微信里的建议路径

歌曲页与分享弹层都写着：

> 想长时间收听、锁屏继续，请点右上角「在浏览器打开」。

分享链接是规范地址，在系统浏览器里打开就是同一首歌；
本地进度存在浏览器里，换浏览器不会自动带过去（那是跨设备同步的范畴，当前未配置）。

## 怎么自己测

```bash
npm run dev            # 含 DEMO 合成音，够长（36s / 28s）便于观察切歌
```

手机与电脑同一局域网，用电脑 IP 访问，例如 `http://192.168.1.5:8000/songs/demo-night-ferry/`。

四项分开测、分开记：

1. **站内切页不断歌**：播着歌 → 点「手记」→ 歌应继续。
2. **当前曲切后台**：播放中按 Home / 切到别的 App → 应继续。
3. **当前曲锁屏**：播放中锁屏 → 应继续，锁屏控件应显示歌名封面。
4. **后台自动下一首**：把进度拖到距结尾 5 秒 → 切后台 → 观察是否自动接上。
   这一项**失败也是正常结果**，如实记录即可。

每项都记：设备型号、系统版本、浏览器 / 微信版本、网络（Wi-Fi / 蜂窝）、结果。