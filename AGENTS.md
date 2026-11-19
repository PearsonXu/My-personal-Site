# AGENTS.md — 在这个仓库里干活的约定

给后续接手的人 / agent 看的。**先读这一页，再动代码。**

## 这是什么

金石竹青的个人音乐小屋。原生 `HTML + CSS + JS` + 一个**零运行时依赖**的 Node 静态生成器，
产物是纯静态文件，部署在 GitHub Pages。**没有** Next.js、没有运行时服务器、没有数据库。

站点只放音乐相关内容：歌、专辑、歌单、创作手记。**不要**加入学术 / 职业背景信息，
也不要把已删除的旧个人主页再引回来。

## 目录地图

| 路径 | 作用 |
| --- | --- |
| `content/` | **唯一内容源**：`site.json`、`songs/*.json`、`albums/*.json`、`playlists/*.json`、`notes/*.md`、`lyrics/*.lrc` |
| `assets/js/core/` | 纯逻辑（队列 / LRC / 搜索 / 路径 / **图标**）。**禁止碰 DOM**，构建端与测试共用 |
| `assets/js/player.js` | 播放引擎：状态机、竞态令牌、Media Session |
| `assets/js/router.js` | 单文档外壳路由，只换 `#page-root` 内容 |
| `assets/js/ui/` | 各 UI 组件；DOM 访问统一走 `ui/dom.js` |
| `assets/js/adapters.js` | 后端适配层（管理 / 访客 / 评论 / 同步 / 微信签名） |
| `tools/` | 构建、内容脚手架、资源探测、本地服务器 |
| `tools/lib/templates/` | HTML 模板（外壳 + 各页面） |
| `tests/` | `node:test`；jsdom 用于路由与整机启动 |
| `dist/` | 构建产物，**已 gitignore**，由 Actions 上传 |

## 不可违反的架构约束

1. **全站只有一个 `<audio id="zx-audio">`**，它和 `#player-root` 必须在 `#page-root` **之外**。
   任何时候都不要在页面模板里再放 audio，也不要在路由里重建播放器。
2. **每首歌必须有真实目录 + `index.html`**。不要改成 hash 路由或纯客户端渲染，
   否则微信分享直达与刷新都会坏。
3. **资源一律相对路径**（按页面深度算 `relPrefix`）。不要写 `/assets/...`，
   那会让子路径部署 404。JS 里的 base 从 `import.meta.url` 反推。
4. **播放状态只能由媒体事件驱动**。`play()` 的 Promise 必须处理，
   `NotAllowedError` → `blocked`，不要假装在播。
5. **任何异步回调都要过 token 守卫**（见 `Player._load` / `_loadLyrics`）。
6. **不要为了「后台播放」加隐藏 video、静音循环、定时器保活**。
   也不要把 Service Worker 当作无限后台执行权限。
7. **凭据绝不进仓库 / 前端 / 构建产物**。微信签名只能由独立服务运行时签发。
8. **`.pl` 上绝不能加 `backdrop-filter` / `filter` / `transform`**：那会让它成为
   `position:fixed` 子元素（全屏播放页）的包含块，把全屏页压进横条里。毛玻璃只加 `.pl__bar`。
   同理手机导航用 `position:absolute` 而非 `fixed`（`.head` 有 blur）。
9. **首次访问默认 `cloud`**，首帧脚本不得读取 `prefers-color-scheme`。
10. **外观 / 布局切换只改 `<html>` 的 data 属性**，不许重建 DOM 或触碰 audio。
11. **音频与封面走两套解析**：`resolveAudio`（相对 `assets/`，可被 `mediaBase` 整体接管）
    与 `resolve`（相对站点根）。混用会导致音源 404 —— 有测试守着。
12. **`<head>` 里的相对资源必须在启动时绝对化**（`absolutizeHeadAssets`）。
    pushState 到更深路径后，浏览器会用新 URL 重新解析 head 的相对 href，
    favicon / CSS 会 404。页面正文里的相对路径不用改（它们随 `#page-root` 一起换，深度是对的）。
13. **控件图标一律用 `core/icons.js` 的内联 SVG**，禁止 Emoji / Unicode 字符 / 图标字体。
    主按钮同时渲染播放与暂停两个 SVG，靠 `data-state` 切 display，**不要用 JS 换 innerHTML**。
    hover 不做缩放（会让几何尺寸漂移）。详见 `docs/PLAYER-CONTROLS.md`。
14. **站内链接与资源一律由构建期 base 拼成绝对路径**（`--base`，默认 `/`）。
    **禁止**再按页面深度生成 `./` / `../` / `../../` 前缀：404 页会被挂在任意深度，
    相对路径会逐跳累积成 `/songs/x/songs/songs/about/me/…`。
    `absolutizeChromeLinks` / `rebaseForDeployment` 只是兜底，不是正确性的来源。
    详见 `docs/INCIDENT-BLANK-PAGE.md`。
15. **404.html 必须零外部依赖、内联样式**。它会被挂在任意深度的 URL 上，
    任何相对路径的 CSS/JS 都会 404，退化成没样式没脚本的白屏。
16. **持久化状态必须逐字段校验**（`sanitizeState`）。坏字段单独回退，
    有效收藏 / 最近播放 / 队列一律保留；禁止用「清空全部数据」当作修复手段。

## 常用命令

```bash
npm ci                 # 安装 dev 依赖（有锁文件）
npm run dev            # 含 DEMO 构建 + 本地服务器（支持 Range/206）
npm run build          # 生产构建（自动排除 demo:true 的内容）
npm run typecheck      # tsc --noEmit（checkJs）
npm test               # 串行执行，因为测试会重建 dist
npm run browser:check  # 真实 Chrome：六组合截图 + 功能清单 + 布局检查（需要本机 Chrome）
npm run check:assets -- --base http://localhost:8000   # 真实 HTTP 探测
```

## 改完之后必须做

1. `npm run typecheck` → 0 error
2. `npm test` → 全绿（**不要**用并行，`build.test.mjs` 会重建 `dist`）
3. `npm run build` → 确认生产构建里没有 DEMO
4. 动了内容就顺手 `node tools/check-assets.mjs --dist dist`

## 内容改动的正确姿势

- 加歌：`npm run new:song -- "歌名" --audio /path/to.mp3`（会逐帧解析真实时长）
- 加手记：`npm run new:note -- "标题" --slug my-note`（默认 `draft:true`）
- **不要**手改 `dist/`，它每次构建都会被清空
- **不要**把陌生音源冒充站长作品；测试音必须 `demo:true` 并在页面上标 DEMO

## 诚实性要求

写文档 / 验收记录时：没测的标 `NOT_RUN`，缺设备或账号的标 `BLOCKED`。
不要把「当前这首能后台播」写成「后台连续切歌已通过」。