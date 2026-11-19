# 验收记录

> 规则：**没测的标 `NOT_RUN`，缺设备 / 账号 / 凭据的标 `BLOCKED`。不虚报通过。**
> 分三部分：命令实测、真实浏览器逐项、真机待验。

最后更新：2026-11-19（macOS darwin · Node v25.6.0 · Chrome 157.0.8103.79）

## 一、命令实测结果

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck`（`tsc --noEmit`，checkJs） | **PASS · 0 error** |
| 单元 + jsdom 集成 | `npm test` | **PASS · 116 / 116** |
| 真实浏览器验收 | `npm run browser:check` | **PASS · 195 / 195** |
| 生产构建 | `npm run build` | **PASS** · 排除 DEMO，空状态正确 |
| DEMO 构建 | `npm run build:demo` | **PASS** · 15 页面 |
| 产物完整性 | `node tools/check-assets.mjs --dist dist` | **PASS** |
| 在线资源 | `node tools/check-assets.mjs --base http://localhost:8000` | **PASS** |
| 构建幂等 | `tests/build.test.mjs` | **PASS** · 两次产物逐字节一致 |
| 旧站与专业背景清除 | `tests/build.test.mjs` 专项 | **PASS** · 产物与 catalog 均无旧署名 / 学术信息 / legacy 链接 |

### 真实 HTTP 实测（本地服务器，支持 Range）

```
HTTP/1.1 206 Partial Content
Content-Type: audio/mpeg
Accept-Ranges: bytes
Content-Range: bytes 100000-101023/576783
```

深链接 `/`、`/songs/`、`/songs/<slug>/`、`/albums/<slug>/`、`/playlists/<slug>/`、
`/notes/<slug>/`、`/about/`、`/me/`、`/status/` 全部 200；不存在的路径 404。
子路径模式 `BASE_PATH=/My-personal-Site` 下页面与深层相对资源同样全部 200。

## 二、真实浏览器逐项（195 项，明细见 `docs/BROWSER-RESULTS.md`）

覆盖 **cloud / forest / midnight × 桌面 1440×900 / 手机 390×844** 六种组合，
每组合跑完整功能清单 + 布局健康检查，并出 5 张截图（共 36 张，见 `docs/screenshots/`）。

### 每组合都通过的功能项

| 项 | 实测样例 |
| --- | --- |
| 播放：真实 MP3 解码并推进时间 | `14.45s → 15.74s`，`duration=36.05s`，`readyState=4` |
| 暂停 / 继续 | 暂停后时间不动，继续后恢复 |
| 拖动进度条 | `seek → 18.46s` |
| 下一首 / 上一首 | next 真实切歌并播放，prev 走播放历史 |
| 音量 / 静音（桌面） | `volume=0.4`，静音可切换 |
| 四种播放模式 | `order → repeat-all → repeat-one → shuffle`，随机一轮不重复 |
| 队列：添加 / 重复 / 删除 / 排序 / 清空 | 4 项含重复且 id 互不相同 |
| 搜索：歌名 / 歌词 / 无结果 | 歌名 1 · 歌词 1 · 无结果 0 且空状态可见 |
| 标签筛选 + 列表 / 封面墙 / 唱片 | 三种展示均生效 |
| 专辑与歌单一键播放 / 加入队列 | 专辑 2 首播放，歌单加入后队列 4 首 |
| 收藏与最近播放 | 真实点击 ♡ → 写入本地 → `/me/` 列表可见 |
| LRC 同步高亮与点击跳转 | `13s → 第 4 行`；点第 7 行 → `19.6s` |
| 纯音乐 / 无歌词空状态 | `format=none`、`lyricIndex=-1` |
| 快速切歌 A→B→A 不串歌词 | 最终歌词属于当前曲 |
| 失效资源 → error | 「无法开始播放：…」，UI 进入 error 态 |
| 网络中断 → 不假装在播 | CDP 断网后进入 error，恢复后可继续 |
| 刷新后恢复队列与进度且不自动出声 | 恢复 2 首、进度 ≈11s、保持暂停 |
| 分享：规范链接 / 复制 / 二维码 | canonical 正确、剪贴板拿到链接、二维码可见 |
| 深链接直达与刷新 | 7 条路径直达 + 刷新均正常 |
| 站内导航不断歌 | `26.01s → 26.88s`，**同一 audio 实例** |
| 主题 / 布局切换保留全部播放状态 | **3 主题 × 3 布局 × 播放/暂停两态**全部保持 |
| 设置记忆 | 刷新后 forest + mobile 恢复 |

### 布局健康检查（每组合首页 + 单曲页各一轮）

| 项 | 结果 |
| --- | --- |
| 无横向溢出 | 桌面 1440≤1440、手机 390≤390 |
| 常驻播放器在视口内且不被遮挡 | 桌面 80px / 手机 68px，底边贴视口 |
| 关键按钮命中测试 | 播放器与头部按钮全部可点 |
| 触控目标 ≥34px | 全部达标 |
| 全屏播放页所有按钮可见可点 | 六组合全部通过 |

### 自动适配与手动布局

| 项 | 实测 |
| --- | --- |
| 窄屏 360×740（auto） | 汉堡=true、完整控件=false、溢出 0 |
| 平板 768×1024（auto） | 汉堡=true、完整控件=false、溢出 0 |
| 宽屏 1920×1080（auto） | 汉堡=false、完整控件=true、溢出 0 |
| 宽屏 1440 手动选「手机」 | 汉堡=true、完整控件=false、midnight `--blur=0px` |
| 窄屏 390 手动选「桌面」 | 汉堡=false、完整控件=true、溢出 0 |
| 竖屏 → 横屏 → 竖屏 | 两种朝向均无溢出，播放不中断 |

### 默认与回退

| 项 | 实测 |
| --- | --- |
| 首次访问默认 cloud（系统偏好设为 dark） | `theme=cloud layout=auto bg=rgb(245,246,248)` |
| localStorage 抛异常 | 回退 cloud + auto，`store.available=false`，**仍能正常播放** |

## 三、真机与外部服务（未执行）

### 后台 / 锁屏播放

**四项分开记录。「当前曲能后台播」不等于「后台连续切歌已通过」。**

| 设备 | 系统 | 浏览器 / 微信版本 | 网络 | ① 站内切页不断歌 | ② 当前曲切后台 | ③ 当前曲锁屏 | ④ 后台自动下一首 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone Safari | — | — | — | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Android Chrome | — | — | — | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| iPhone 微信 | — | — | — | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Android 微信 | — | — | — | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |

**BLOCKED 原因**：开发环境是 macOS 桌面。桌面 Chrome 可以验证 ①（已通过，见上表
「站内导航不断歌」），但无法切 App、无法锁屏、无法进入微信内置浏览器。
测试步骤见 `docs/MOBILE-BACKGROUND.md`。

预期（**不是结论**）：① 应普遍成立；②③ 系统浏览器通常成立、微信不稳定；
④ 任何环境都**不保证**，失败是正常结果。

### 微信分享

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 歌曲独立链接可直达 | **PASS** | 本地 HTTP + 浏览器双验证；线上待部署后复验 |
| 每页独立元数据 | **PASS** | 构建断言 + 浏览器读 canonical |
| 复制链接 / 二维码 | **PASS** | 浏览器真实点击复制并读回剪贴板 |
| 真机扫码 | NOT_RUN | 需要手机 |
| 歌词海报导出 | NOT_RUN | Canvas 已实现；未做真机长按保存确认 |
| 微信 JS-SDK 签名 | **BLOCKED** | 缺已认证服务号、JS 安全域名、独立签名服务 |
| 朋友圈 / 聊天自定义卡片 | **BLOCKED** | 同上 |
| 真实发布朋友圈后由访客打开验证 | **BLOCKED** | 必须真人真机，不能自动化 |

### 其它

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 用**真实歌曲**完成播放与后台测试 | **BLOCKED** | 仓库无站长真实音频；当前用明确标注的合成测试音验证工程链路 |
| 人耳试听音质 | NOT_RUN | 自动化只能验证解码与时间推进，不能替代人耳 |
| 线上域名 HTTPS / DNS 复验 | NOT_RUN | 需 push 后 Actions 部署完成 |
| 中国大陆网络实测速度 | NOT_RUN | 需大陆网络环境 |
| 对象存储迁移后 MIME / Range / CORS | NOT_RUN | `mediaBase` 当前为空 |
| 在线管理 / 访客发帖 / 评论 / 跨设备同步 | **BLOCKED** | 未配置后端，页面如实显示「未配置」 |

## 四、本轮真实浏览器测试抓出并修掉的缺陷

这些是**只看测试数量和类型检查发现不了**的问题：

1. **音频 URL 少了 `assets/` 前缀 → 404**。目录里音频是相对 `assets/` 的路径，
   却按站点根解析。修法：拆成 `resolve` / `resolveAudio` 两套解析，并加产物存在性断言。
2. **`.pl` 上的 `backdrop-filter` 成为 fixed 子元素的包含块**，
   把 `inset:0` 的全屏播放页压进 68px 横条，按钮跑到 y≈1009（视口 844）点不到。
   修法：毛玻璃只加 `.pl__bar`；手机导航改 `position:absolute`。
3. **对已在播放的元素再调 `play()` 不再触发 `playing` 事件**，状态永远卡在 `buffering`。
   修法：`play()` Promise 成功后按元素真实 `paused` 对账；`toggle()` 以元素状态为准。
4. **`autoplay:false` 的加载没有真正暂停**，上一首还在响但状态写着 paused。
   修法：非自动播放的加载显式 `pause()`。
5. **失效资源后重播同一首不会复位媒体元素**，Chrome 停在失败态。
   修法：`_load` 检测到上次错误时强制 `load()`。
6. **底部常驻播放器会遮住滚进视野的按钮**。
   修法：给可交互元素加 `scroll-margin-bottom`。
7. **SPA 导航到更深路径后 `<head>` 的相对 favicon 变 404**（线上复验抓到）。
   pushState 改地址后浏览器用新 URL 重新解析 head 相对 href，
   `./assets/img/favicon.svg` → `/notes/<slug>/assets/img/favicon.svg`。
   修法：启动时 `absolutizeHeadAssets()` 把 head 资源转绝对 URL。

前 5 项都补了对应的单元测试，第 2、6、7 项另有 CSS / 浏览器 / 路由断言守着。

## 五、截图索引

`docs/screenshots/`，共 36 张：

- `{cloud,forest,midnight}-{desktop,mobile}-home.png` — 首页
- `…-song.png` — 单曲页（播放中，歌词已高亮）
- `…-lyrics.png` — 全屏歌词 / 唱片舞台
- `…-queue.png` — 队列面板
- `…-appearance.png` — 外观与布局面板
- `auto-360x740.png` / `auto-768x1024.png` / `auto-1920x1080.png` — 自动适配三档
- `manual-mobile-on-wide.png` / `manual-desktop-on-narrow.png` — 手动布局覆盖
- `orientation-portrait.png` — 横竖屏切换后