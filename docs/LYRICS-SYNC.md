# 歌词同步「线上与本地有时间差」根因与修复

日期：2026-11-19 · 取证工具：`tools/probe-lyrics-sync.mjs`（`npm run probe:lyrics`）
结果：`docs/lyrics-sync-results.json` · 截图：`docs/screenshots/lyrics-sync-*.png`

## 一、排查结论（先排除素材与缓存）

| 检查项 | 证据 | 结论 |
| --- | --- | --- |
| 线上 vs 本地 vs dist 音频 | 三者 sha256 完全一致（`8b7c37f7…`，5,605,152 B） | 同一版本，无混用 |
| 线上 vs 本地 vs dist LRC | 三者 sha256 完全一致（`9af8e0c6…`，1,257 B），`[offset:0]` | 同一版本，无 offset 差异 |
| MP3 容器 | Xing 头存在且 frames=10115 / bytes=5,577,072 与逐帧 walk 一致；TOC 100 项最大误差 0.86s（索引粒度，ffmpeg 会再逐帧走到样本级） | 时长与 seek 映射正确 |
| Chrome 实测 duration | 线上与本地均 242.72s（含编码器 padding 修剪） | 无时长估算错误 |
| 构建遗漏 / 路径 | 线上 `catalog.json` 的 `lyrics` 路径 200；单曲页预渲染 `data-t` 与 LRC 逐句一致 | 无遗漏、无错路径 |
| 缓存新旧混用 | GitHub Pages `max-age=600` + ETag；当前线上所有资源哈希与仓库一致 | 取证时点无混用 |
| 计时器推进歌词 | 全仓库（含线上 HEAD 构建）无 `setInterval`/`rAF`/`performance.now` 推进歌词 | 时间依据始终是 `audio.currentTime` |
| LRC 解析 | 百分秒 / 毫秒区分、`[offset:]` 符号约定有单元测试守着 | 解析正确 |

**素材、路径、缓存、解析、时间来源全部排除。** 根因在同步逻辑的两个缺陷，
它们在线上线下代码里都存在，但只在「真实歌曲 + 歌词在曲中落地」时暴露 ——
本地新鲜播放（从 0 开始、DEMO 句间隔 3.2s）掩盖了它们。

## 二、根因

### 根因 A：异步歌词落地后静默赋值行号（主因）

`Player._loadLyrics` 的 fetch 分支旧代码：

```js
this.lyrics = parseLrc(text);
this.lyricIndex = lineIndexAt(this.lyrics.lines, this.audio.currentTime || 0); // 只赋值
this.emit('lyrics', …);                                                        // 只发渲染事件
```

`LyricsUI.render()` 会把 `activeIndex` 重置为 -1，而 `lyric-line` 事件只在
`_onTime()` 里「行号变化」时才发。于是歌词落地后 **高亮与自动滚动冻住，直到下一句时间戳到达**。
真实歌曲《青春大概》句间隔最大 **23.2s**（63.99 → 87.22）。

触发路径（线上常见、本地新鲜播放不常见）：
- **老访客刷新 / 二次进入**：`store` 恢复进度 → `pendingSeek` 把播放位置直接放到曲中（如 70s），
  歌词 fetch 落地时已在曲中 → 冻到 87.22s 才有高亮；
- **慢网**：歌词请求晚于播放开始落地，同理；
- 单曲页预渲染 inline 歌词是同步落地（播放尚未开始），所以分享直达路径反而不踩。

线上旧构建复现证据（probe C8，首页进入 = fetch 分支）：
`t=71.25 idx=10 active=null` —— 引擎行号已是 10，DOM 高亮为空。
修复后同一场景：`t=71.55 idx=10 active=10`，落地即高亮。

### 根因 B：自动跟随把自己的滚动当用户滚动（放大器）

旧 `LyricsUI` 对容器 `scroll` 事件一律记「用户手动滚动，暂停跟随 4s」。
但自动跟随自己的 `scrollTo({behavior:'smooth'})`（以及 CSS `scroll-behavior:smooth` 下的
`scrollTop` 赋值）同样触发 `scroll` 事件 → **每次自动滚动后自我暂停 4s** →
句间隔 < 4s 时下一句的滚动被跳过 → 可见行落后 audible 行一句以上。
真实歌曲句间隔 3.8–8s，落后一次就是好几秒的「时间差」观感。

### 缺失能力（需求补齐）

无「回到当前歌词」按钮；拖动进度 / 重开面板时若跟随被暂停不会立即定位；
`_bindMedia` 没有 `seeked` 监听（恢复进度落地后只能等 `timeupdate`）。

## 三、修改

| 文件 | 修改 |
| --- | --- |
| `assets/js/player.js` | `_applyLyrics` 落地即按真实 `currentTime` 计算行号并 emit `lyric-line`（删除 fetch 分支静默赋值）；新增 `seeked` 监听 → emit `seek` + 重新同步；`seek()` 增 emit `seek` |
| `assets/js/ui/lyrics-ui.js` | 跟随重构：用户意图事件（wheel/touchstart/pointerdown/键盘翻页）或非程序化 scroll 才暂停；程序化滚动打标记（`scrollend` + 兜底定时器）；暂停显示「回到当前歌词」，点击恢复；`seek`/切歌/重开面板立即定位并恢复跟随；首句前回容器顶；reduced-motion 瞬时滚动；只滚容器 |
| `assets/js/ui/player-ui.js` | `setStage` 暴露 `onStageChange` 钩子 |
| `assets/js/app.js` | 钩子接 `lyrics.refollow()`（重开面板立即定位） |
| `tools/lib/templates/shell.mjs` | 歌词容器外包 `.pl__lyricsbox`，加 `#plLyricsBack`「回到当前歌词」按钮 |
| `assets/css/player.css` | `.pl__lyricsbox` / `.lrc-back`（44px 触达、悬浮不占滚动内容）；reduced-motion 下 `scroll-behavior:auto` |
| `tests/lyrics-sync.test.mjs` | 8 条回归（落地即定位、seek/seeked、恢复进度全链路、滚动来源、按钮、切歌、纯文本、reduced-motion） |
| `tests/helpers/fake-audio.mjs` | `currentSrc` 绝对化（与真实浏览器 IDL 同语义，否则过期音源守卫在 Node 里误判） |
| `tools/probe-lyrics-sync.mjs` | 真实 Chrome 验收：本地 + 线上对比、慢网、恢复进度、触摸、reduced-motion；旧构建项记 `expectedOld` 复现证据 |

**没有加任何固定延迟 / 补偿偏移。** 歌词校准（±30s）仍是用户手动能力，与根因修复无关。

## 四、验证矩阵

`npm run typecheck` 0 error；`npm test` 194/194；`npm run build` 生产无 DEMO；
`node tools/check-assets.mjs --dist dist` 通过。
`npm run probe:lyrics`：**35/39 通过 + 4 项线上旧构建复现**（本地生产桌面 18/18 + 手机 5/5；
线上旧构建 12 通过 + 4 复现）→ `docs/lyrics-sync-results.json`。
`npm run probe:lyrics -- --demo`：**36/40 通过 + 4 复现**（本地多歌 24/24：切歌 / 播完 / 重播）
→ `docs/lyrics-sync-demo-results.json`。
手机断言含「点按播放进入 playing」非空断言：harness 曾因 `html{scroll-behavior:smooth}`
未等滚动停稳就 tap 而点空，导致手机项空过；已修（`playBtn` 等 400ms）并加断言防复发。

| 场景 | 本地 Chrome | 线上 Chrome（旧构建） | 真机 Safari | 微信内浏览器 |
| --- | --- | --- | --- | --- |
| 首次播放 / 逐句同步 | PASS | PASS | NOT_RUN | NOT_RUN |
| 慢网缓冲后重新同步 | PASS | PASS | NOT_RUN | NOT_RUN |
| 暂停 / 恢复 | PASS | PASS | NOT_RUN | NOT_RUN |
| 向前 / 向后拖动 | PASS | PASS | NOT_RUN | NOT_RUN |
| 刷新恢复进度 + 慢网落地 | PASS（落地即高亮） | **复现根因 A**（active=null 冻住） | NOT_RUN | NOT_RUN |
| 切歌 / 播完 / 重播 | PASS（--demo） | 单曲曲库播完=paused PASS | NOT_RUN | NOT_RUN |
| 用户滚动暂停 + 回到当前歌词 | PASS（桌面滚轮 / 手机触摸） | 旧构建无按钮（复现） | NOT_RUN | NOT_RUN |
| 重开面板立即定位 | PASS | 旧构建不定位（复现） | NOT_RUN | NOT_RUN |
| reduced-motion | PASS | 旧构建部分（smooth 不受控） | NOT_RUN | NOT_RUN |

**诚实性声明**：真机 iOS Safari 与微信内浏览器无设备 / 账号，标 `NOT_RUN`；
线上当前仍是修复前构建，上表「线上」列是修复前复现证据，**不是修复后线上验收**。
push 部署后重跑 `npm run probe:lyrics`，`expectedOld` 应归零才算线上修复确认。