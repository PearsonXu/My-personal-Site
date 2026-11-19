# 音乐小屋 · 金石竹青

把喜欢的声音，留在这里。一个音乐爱好者的个人音乐分享空间：
分享喜欢的音乐，尝试感兴趣的创作，也写下旋律带来的故事与心情。
**无需登录，点开就能听**，支持歌词、队列、四种播放模式与锁屏控制。

线上：<https://www.xuzhaoqing.com/>

## 技术选择

原生 `HTML + CSS + JS` + 一个**零运行时依赖**的 Node 静态生成器。
**没有 Next.js，没有运行时服务器、数据库、Server Actions 或动态签名。**
产物是纯静态文件，直接部署 GitHub Pages。

为什么不用框架：最硬的需求是「站内导航不断歌」。
这里用**单文档外壳**——`<audio>` 与播放器放在 `#page-root` 之外，路由只替换 `#page-root` 的内容，
播放器永不重新挂载。同时每首歌仍是**构建期预渲染的真实目录 + `index.html`**，
所以微信分享直达、深链接、刷新都不会 404。

## 三套可切换外观

| 外观 | 气质 | 关键差异 |
| --- | --- | --- |
| **cloud「清爽云音乐」**（默认） | 白 / 浅灰 / 红，结构清楚 | 方形封面、列表优先、红色圆形播放键 |
| **forest「森林音乐小屋」** | 森林绿 / 暖纸 / 琥珀，温暖安静 | 衬线标题、纸纹背景、插画封面、复古唱片、琥珀歌词 |
| **midnight「午夜黑胶」** | 深蓝紫 / 夜景 / 黑胶 | 全站圆形黑胶、星点夜景、沉浸发光歌词；手机自动关模糊与动画 |

- **首次访问一律 cloud**，系统深色偏好**不会**覆盖它；存储不可用也回退 cloud。
- 入口：桌面头部「◐ 外观」、手机头部图标 + 汉堡菜单、全屏播放页右上角。
- 布局另有 **自动 / 桌面 / 手机** 三档，与外观独立；手动选「手机」在宽屏上也生效。
- **切换外观 / 布局 / 站内导航都不中断播放**：同一个 audio 实例，进度、队列、模式、
  随机历史、音量、收藏、歌词全部保留；暂停时切换仍是暂停。

详见 [`docs/THEMES.md`](docs/THEMES.md)。

## 快速开始

```bash
npm ci
npm run dev          # 含 DEMO 合成音的构建 + 本地服务器（真的支持 Range/206）
# → http://localhost:8000
```

> ⚠️ 仓库里目前**没有站长的真实歌曲**。`--demo` 构建包含两条
> **合成测试音（明确标注 DEMO，非站长作品）**，只用于验证工程链路。
> 生产构建 `npm run build` 会自动排除它们，页面显示诚实的空状态。

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 生产构建 → `dist/`（排除 `demo:true`） |
| `npm run build:demo` | 含测试音的构建 |
| `npm run serve` | 本地服务器，支持 Range / 206 |
| `npm run typecheck` | `tsc --noEmit`（checkJs） |
| `npm test` | 单元 + jsdom 集成测试（含三主题 × 桌面/手机状态保留） |
| `npm run browser:check` | **真实 Chrome** 验收：六组合截图 + 完整功能清单 + 布局健康检查 + 白屏回归 |
| `npm run probe:regression` | 白屏故障专项取证：跨深度导航、旧数据 / 坏数据用户、404 页自洽、全页面直接打开+刷新 |
| `npm run audit:links` | 逐页实测每个 href/src 的最终 URL、状态码与 Content-Type |
| `npm run verify:live` | 对**正式域名**做 HTTP 复验（域名 / 路由 / 资源 / 播放器 / 空状态） |
| `npm run browser:live` | 用**真实 Chrome** 复验正式域名上的播放器与三套外观 |
| `npm run check:assets -- --dist dist` | 产物完整性 |
| `npm run check:assets -- --base http://localhost:8000` | 真实 MIME / Range / 206 / CORS |
| `npm run new:song -- "歌名" --audio x.mp3` | 加歌（自动解析真实时长） |
| `npm run new:note -- "标题" --slug x` | 加手记 |
| `npm run demo:audio` | 重新生成合成测试音 |

## 已实现

- **首页**：最近分享、常听的歌单、最近手记、关于我；有歌时右侧是一张真实封面的推荐卡片，没歌时回退单栏
- **曲库**：列表 / 封面墙 / 唱片三种展示；按歌名、专辑、标签、**歌词全文**搜索
- **单曲页**：独立链接、封面、作者、介绍、播放器、歌词、分享区
- **专辑 / 歌单**：介绍、排序、一键播放、整张加入队列
- **播放器**：播放 / 暂停 / 上下首 / 进度拖动 / 音量（iOS 上如实禁用并提示）
- **四种模式**：顺序、列表循环、单曲循环、随机（一轮不重复）
- **队列**：下一首 / 末尾 / 删除 / 排序 / 清空；同一首重复入队是不同队列项
- **歌词**：LRC 当前句高亮、自动滚动、点击跳转；兼容纯文本 / 无歌词 / 纯音乐
- **展示**：列表 / 封面墙 / 唱片 / 全屏歌词 / 深浅主题
- **手记**：Markdown 图文，可关联歌曲、专辑、歌单
- **本地数据**：收藏、最近播放、队列、进度（**只在当前浏览器**，不是跨设备同步）
- **分享**：规范链接、复制、构建期二维码、Canvas 歌词海报
- **移动端**：迷你条 + 展开播放页、安全区、44px 触控目标、减少动画
- **Media Session**：锁屏 / 耳机控制；Audio Session 作为可关闭的实验项

## 需要外部服务（当前未配置，页面如实显示状态）

在线管理后台 · 访客发帖 · 评论 · 跨设备同步 · 微信 JS-SDK 签名。
扩展点都在 [`assets/js/adapters.js`](assets/js/adapters.js)，状态页在 `/status/`。

## 后台播放的真实范围

- **当前这首**切后台 / 锁屏继续：系统浏览器通常成立，微信不稳定。
- **后台自动接下一首**：**不保证**。页面被挂起后 JS 可能冻结。
- 不用隐藏 video、静音循环、定时器保活，也不把 Service Worker 当无限后台权限。

详见 [`docs/MOBILE-BACKGROUND.md`](docs/MOBILE-BACKGROUND.md)。

## 文档

| 文件 | 内容 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | 仓库约定与不可违反的架构约束（**先读这个**） |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | GitHub Pages、base path、域名、音频迁移对象存储 |
| [`docs/CONTENT.md`](docs/CONTENT.md) | 加歌 / 加歌词 / 加专辑歌单 / 发手记 |
| [`docs/WECHAT.md`](docs/WECHAT.md) | 微信分享边界与签名服务契约 |
| [`docs/MOBILE-BACKGROUND.md`](docs/MOBILE-BACKGROUND.md) | 移动端与后台播放实现与边界 |
| [`docs/THEMES.md`](docs/THEMES.md) | 三套外观、布局三档、默认与记忆、切换保状态 |
| [`docs/PLAYER-CONTROLS.md`](docs/PLAYER-CONTROLS.md) | 播放器控制区：SVG 图标系统、尺寸、间距、交互态 |
| [`docs/INCIDENT-BLANK-PAGE.md`](docs/INCIDENT-BLANK-PAGE.md) | 白屏故障报告：根因、证据、修复与用户恢复办法 |
| [`docs/FEATURES.md`](docs/FEATURES.md) | 功能清单 → 对应验证位置 |
| [`docs/BROWSER-RESULTS.md`](docs/BROWSER-RESULTS.md) | 真实 Chrome 逐项验收结果（自动生成，195 项） |
| [`docs/LIVE-VERIFICATION.md`](docs/LIVE-VERIFICATION.md) | 正式域名 HTTP 复验（自动生成） |
| [`docs/BROWSER-LIVE-RESULTS.md`](docs/BROWSER-LIVE-RESULTS.md) | 正式域名真实浏览器复验（自动生成） |
| `docs/screenshots/` | 三主题 × 桌面/手机 共 36 张截图 |
| [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) | 验收记录（NOT_RUN / BLOCKED 如实标注） |

## 本地预览

```bash
npm ci
npm run build:demo     # 含两条合成测试音，便于试听与验证
npm run serve          # → http://localhost:8000
```

手机同局域网访问 `http://<电脑IP>:8000/`。服务器**真的实现了 Range / 206**，
拖动进度条可以如实测试（`python3 -m http.server` 不支持 Range，测出来是假的）。

想模拟项目子路径部署：

```bash
BASE_PATH=/My-personal-Site npm run serve
# → http://localhost:8000/My-personal-Site/
```

## 发布

push 到 `main` → GitHub Actions 自动 `typecheck → test → build → check → deploy`。
**首次需要在 Settings → Pages → Source 选「GitHub Actions」**，见 `docs/DEPLOY.md`。