# 歌词海报：故障修复与重设计验收

日期：2026-11-19 · 环境：macOS + 真实 Chrome（puppeteer-core，headless）· 本地 `dist`（含 demo 构建）

## 一、原实现的故障原因（修复前）

旧 `ShareUI.poster`（`assets/js/ui/share-ui.js`）存在六类问题：

1. **歌曲资料混用**：歌词读 `this.player.lyrics`——那是**正在播放**的歌。为 B 歌生成海报时若 A 歌在播，
   海报会印 A 的歌词；没播过歌时则一句歌词都没有却仍报「海报已生成」。
2. **硬截断**：`title.slice(0,22)`、`artist.slice(0,30)`、`line.text.slice(0,26)` 直接砍字，无省略号无换行；
   22 字 × 54px = 1188px > 900px 内容宽，长歌名实际画出画布被裁。
3. **固定坐标叠压**：歌词 y=1180/1224 与二维码区（x≥830, y≥1100）重叠；只画 2 行，谈不上「精选」。
4. **字体未对齐站点**：canvas 用 "Space Grotesk"/"Inter"/"JetBrains Mono"——站点根本没加载这些 webfont
   （全站系统字体栈），静默回退；也未等 `document.fonts.ready`。
5. **封面拉伸**：`drawImage(cover, 90,90,900,900)` 不保持比例；非方图自定义封面会变形。
6. **跨域污染路径**：封面不带 `crossOrigin` 加载，外站无 CORS 图能加载成功但污染画布，`toDataURL` 抛错才兜底；
   二维码白底留白仅 ~1.5 模块，扫码余量不足。

## 二、修改位置

| 文件 | 内容 |
| --- | --- |
| `assets/js/core/poster.js`（新增） | 纯逻辑：`sanitizeLyricLines`（去时间戳/元数据/整行结构标签，保留标点与衬词）、`defaultSelection`（滑窗 4–6 行、不同行优先）、`wrapText`（CJK 逐字断、拉丁词不断）、`layoutPoster`（1080×1440，放不下加高不裁切）、`posterPalette`（封面主色→浅渐变，正文对比度 ≥7） |
| `assets/js/ui/share-ui.js` | 重写 `poster()` + 新增 `_drawPoster()`：独立 fetch 目标歌词、`_posterSeq` token 守卫、选句勾选 UI（重置/计数）、`crossOrigin=anonymous` 封面、主色取样、`document.fonts.ready`、诚实回退文案、预览=导出同一 dataUrl |
| `assets/css/site.css` | 新增 `.poster-pick*` / `.poster-out`（不动被测试锁定的 `.poster` 规则） |
| `tests/poster.test.mjs`（新增） | 9 项纯逻辑契约：清洗/选句/换行/长歌名/6 长行加高/回退版面/对比度 |
| `docs/FEATURES.md` `docs/WECHAT.md` `docs/ACCEPTANCE.md` | 状态与尺寸描述更新 |

入口不变：单曲页「歌词海报」按钮与分享弹层「歌词海报」按钮（`data-act="make-poster"` / `data-share="poster"`）。
播放器与 `#zx-audio` 零触碰。

## 三、实际导出验收（61/61 PASS）

探针：`/tmp/poster-probe.mjs`（结果存档 `docs/poster-probe-results.json`）。
导出 PNG 存档 `docs/screenshots/poster-sample-*.png`，逐张目视确认。

| 案例 | 歌曲 | 结果 |
| --- | --- | --- |
| 自动封面（构建期程序化封面） | demo-night-ferry | PASS：1080×1440，5 行选句，封面方差 0.0806 |
| 自定义封面（站长 jpg） | nishi | PASS：比例保持，主色冷灰渐变 |
| 长歌名 + 6 长行（合成输入，真实字体度量） | — | PASS：一字不丢、零越界、H 加高到 1520 |
| 多行选句（勾选到 6 行重生成） | qunian-xiatian | PASS：预览重生成、1080×1440 不越界 |
| 缺少歌词（纯音乐） | demo-paper-boat | PASS：明确「纯音乐」提示 + 「无歌词版」标注，歌名/署名居中，无假成功 |
| 手机端预览 | 390×844 | PASS：预览宽 356px 适配、保存按钮在视口内 |
| 播放不中断 | 播 nishi 时为 qunian 生成 | PASS：state=playing、同一 audio 节点、进度前进 |
| 生成期间切歌 | 重开海报后立刻 playSong(wuji) | PASS：海报仍属 qunian，选句仍为目标歌 |
| 保存路径 | CDP 真实下载 | PASS：落盘字节 sha256 = 预览字节 |
| 二维码 | 全部案例 | PASS：与构建期规范 SVG 像素差 0；白底留白环干净（≥4 模块静区） |
| 留白 | 全部案例 | PASS：四周 72px 框内零墨点 |

默认选句回归：qunian-xiatian 副歌为重复钩子句，旧启发式会选出一窗 4 行雷同；
现滑窗按「不同行数」优先，默认 5 行各不相同（distinct=5），并有 `poster.test.mjs` 回归守着。

## 四、未测 / 受限（如实标注）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| iPhone 真机长按保存 / 添加到主屏幕后分享 | NOT_RUN | 无 iOS 设备 |
| 微信内置浏览器长按保存与扫码 | NOT_RUN | 无微信真机环境 |
| 真机扫码解码 | NOT_RUN | 无手机；已用「与规范 SVG 像素一致 + 静区测量」替代验证 |
| 外站无 CORS 封面回退 | 代码路径存在（crossOrigin 失败→占位封面+提示） | 本地无此外站素材，未实跑；标记 NOT_RUN |
