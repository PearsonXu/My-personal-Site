# 功能清单与验证位置

「在哪验证」列指向具体测试；`B:` 开头表示 `docs/BROWSER-RESULTS.md` 里的真实 Chrome 条目。

## 外观与布局

| 功能 | 实现 | 在哪验证 |
| --- | --- | --- |
| cloud / forest / midnight 三套完整主题 | `assets/css/themes.css` | `theme-layout.test.mjs`（令牌完整性 / 差异）+ B: 六组合全部条目 |
| 首次默认 cloud，系统深色不覆盖 | shell 首帧脚本 | `theme-layout` 首帧脚本断言 + B:「首次访问默认 cloud」 |
| 记住主动选择 | `Store.setTheme/setLayout` | `theme-layout` + B:「设置记忆」 |
| 无记录 / 非法值 / 存储不可用回退 | `normalizeTheme/Layout`、`Store` try/catch | `theme-layout` + B:「localStorage 不可用」 |
| 旧值 light/dark 迁移 | `THEME_ALIAS` | `state-preserve.test.mjs` |
| 外观入口（桌面 / 手机 / 播放页） | shell header + nav + `.pl__fullhead` | `app-boot` + 六组合 appearance 截图 |
| 自动 / 桌面 / 手机三档布局 | 构建期合成 `layout.css` | `theme-layout` CSS 合成断言 + B:「自动适配」「手动布局」 |
| 布局与外观独立 | `Appearance._apply` | `theme-layout`「互相独立」 |
| 窄屏 / 平板 / 宽屏 / 横竖屏 | `layout-*.css` | B:「自动适配」3 档 + 「横竖屏」 |
| 无横向溢出 / 无遮挡 / 按钮可点 / 触控尺寸 | — | B: 每组合 4 项布局检查 + 全屏播放页检查 |
| midnight 手机关模糊与动画 | `themes.css` 媒体查询 + 布局作用域 | `theme-layout` + B:「宽屏选手机」blur=0px |

## 播放器

| 功能 | 实现 | 在哪验证 |
| --- | --- | --- |
| 全站唯一原生 audio | shell `#zx-audio` | `build.test.mjs` 每页断言 + B: 全部 |
| 播放 / 暂停 | `Player.play/pause/toggle` | `player.test.mjs` + B:「播放」「暂停 / 继续」 |
| 上一首 / 下一首 | `Player.prev/next` | `player` + `queue` + B:「下一首 / 上一首」 |
| 拖动进度 | `Player.seek/seekRatio` | `player` 钳制断言 + B:「拖动进度条」 |
| 音量 / 静音（iOS 如实禁用） | `Player.setVolume`、`_probeVolume` | B:「音量控制」（桌面） |
| 顺序 / 列表循环 / 单曲循环 / 随机 | `PlayQueue` | `queue.test.mjs` 全模式 + B:「四种播放模式」 |
| 随机一轮不重复、跨轮不立刻重复 | 洗牌袋 | `queue` 两项 + B: 随机断言 |
| 上一首走真实历史 | `PlayQueue.back` | `queue`「上一首走真实播放历史」 |
| 状态由媒体事件驱动 | `_bindMedia` | `player`「状态由媒体事件驱动」 |
| play() 被拒绝 → blocked | `_attemptPlay` | `player`「被自动播放策略拒绝」 |
| 已在播放时再 play() 不卡 buffering | `_attemptPlay` 对账 | `player` 专项 + B: 全链路 |
| 失效资源 → error | media error 事件 | `player` + B:「失效资源」 |
| 网络异常 → 不假装在播 | 同上 | B:「网络中断」（CDP 断网） |
| 错误后重播同一首会复位 | `_load` 强制 `load()` | `player`「复位媒体元素」 |
| 快速切歌不串歌词 | `_token` 守卫 | `player` A→B→C + B:「快速切歌」 |
| 进度 / 队列恢复且不自动出声 | `Player.restore` | `player` + B:「刷新后恢复」 |

## 首页文案与空状态

| 功能 | 实现 | 在哪验证 |
| --- | --- | --- |
| 小标签「音乐爱好者」、无在线绿点 | `site.eyebrow` + `eyebrow--plain` | `home-copy.test.mjs` |
| 展示语与介绍分层（字号/颜色/间距） | `.hero__tagline` / `.hero__intro` | `home-copy` 逐字 + CSS 断言 |
| 只保留「听听音乐」「关于我」两个真实链接 | `home.mjs` | `home-copy` 链接集合断言 |
| 首屏只留一句听歌提示 | `site.listenHint` | `home-copy` 禁词断言 |
| 「最近分享」标题与说明 | `home.mjs` | `home-copy` |
| 首屏留白收紧，桌面更早看到歌 | `.hero--home` / `.sec--near` | `home-copy` + 桌面截图 |
| 有歌：真实封面推荐卡片 + 播放入口 | `.hero__pick` | `home-copy` + B: 六组合首页截图 |
| 没歌：去掉占位、回退单栏 | `hero__in--single` | `home-copy` + 空状态截图 |
| 空状态文案温和、隐藏无意义入口 | `songList/songGrid/library` | `home-copy` + 线上浏览器复验 |
| 公开页面无 npm / 开发者说明 | 全部模板 | `home-copy` 可见文案扫描 |
| 「关于我」统一入口与新介绍 | `misc.mjs` / `site.author.bio` | `home-copy` |

## 播放器控件与图标

| 功能 | 实现 | 在哪验证 |
| --- | --- | --- |
| 统一内联 SVG 图标集（零依赖） | `core/icons.js` | `icons.test.mjs` 视图框 / currentColor / 无外部引用 |
| 播放实心三角（光学居中） | 路径坐标右移 1.3px | `icons` 光学居中断言 + 逐页同源断言 |
| 暂停双竖条比例协调 | 3.4×11.2，间隔 3.2 | `icons` 比例与对称断言 |
| 上一首/下一首 三角+竖线 | `prev` / `next` | `icons` 形状断言 + B:「主控尺寸与点击区域达标」 |
| 主按钮圆形 48 / 56 | `--play-size` | `icons` 令牌断言 + B: 实测 48 / 56 |
| 上下首点击区 ≥44、图形 22–24 | `--pbtn-size` | B: 实测 44 / 24 |
| 播放↔暂停原位切换不跳位 | 双 SVG + `data-state` CSS | B:「原位切换：不跳位、不断音」位移 <0.6px |
| 三套主题配色 | `--acc` / `--on-acc` / `--dim` | `icons` 主题变量断言 + 六组合控制区截图 |
| hover / 按下 / 焦点 / 禁用 | `player.css` | `icons` 四种交互态断言 |
| 全站播放图形一致 | 同一份路径 | `icons` 首页/曲库/单曲页/迷你条/展开页比对 |

## 队列与曲库

| 功能 | 实现 | 在哪验证 |
| --- | --- | --- |
| 下一首 / 末尾 / 批量加入 | `PlayQueue.addNext/addLast/addMany` | `queue` + B:「队列」 |
| 删除 / 排序 / 清空 | `remove/move/clear` | `queue` + B:「队列」 |
| 同一首重复入队 id 不同 | `createIdFactory` | `util` 5000 次 + `queue` + B:「队列」 |
| 队列面板 | `ui/queue-ui.js` | `app-boot` + 六组合 queue 截图 |
| 搜索（歌名 / 专辑 / 标签 / 歌词） | `core/search.js` | `core` + B:「搜索」 |
| 标签筛选 | `LibraryUI.setTag` | B:「标签筛选与展示模式」 |
| 列表 / 封面墙 / 唱片 | `viewbox` + CSS | B: 同上 |
| 专辑 / 歌单一键播放与加入队列 | `Player.playCollection` | B:「专辑与歌单」 |
| 收藏 / 最近播放 | `Store` + `MeUI` | `player` + B:「收藏与最近播放」 |
| 本地数据导出 / 清空 | `/me/` | `app-boot` 路径覆盖 |

## 歌词

| 功能 | 实现 | 在哪验证 |
| --- | --- | --- |
| LRC 解析（多标签 / 毫秒 / offset） | `core/lrc.js` | `core` 6 项 |
| 当前句高亮 + 自动滚动 | `LyricsUI` | B:「LRC 同步高亮」 |
| 点击跳转 | `LyricsUI` / `bindPageLyrics` | `app-boot` + B: 同上 |
| 纯文本 / 无歌词 / 纯音乐 | `lyricsState` | `core` + B:「纯音乐 / 无歌词空状态」 |
| 全屏歌词舞台（「词」三态：隐藏/纯享/设置） | `.pl__stage[data-stage=lyrics]` + `data-tools` | 六组合 lyrics 截图 + 按钮可点断言 + panels 探针三态循环 |
| 全屏纵向骨架（舞台吃满剩余高度 / 间距显式 / 矮屏横屏压缩 / dvh + 安全区） | `.pl__full` flex 骨架 + `@media (max-height:…)` | `probe-mobile-layout` 6 视口 × 三态 × 三字号 + 视口收缩恢复 |
| 首尾居中留白在滚动容器内部 | `LyricsUI._updatePad` + ResizeObserver | panels / mobile-layout 探针「留白在容器内部」「当前行容器内居中」 |
| 「简介」入口与面板已移除（舞台仅 cover/vinyl/lyrics） | shell / `PlayerUI` / `sanitizeState` 回退 | `player-panels` 整机 + 两探针「简介已移除」 |

## 切换与导航保状态

| 功能 | 在哪验证 |
| --- | --- |
| 主题切换保留全部业务状态 | `state-preserve` 六组合 + B:「主题 / 布局切换保留全部播放状态」（3×3×播放/暂停） |
| 布局切换同上 | 同上 |
| 暂停时切换仍暂停、进度不变 | `state-preserve` + B: 暂停态循环 |
| 站内导航不断歌、同一 audio 实例 | `router.test.mjs` + `app-boot` + B:「站内导航不断歌」 |
| 打开手记不断歌 | `router` + `app-boot` |
| 切展示模式不断歌 | `app-boot` + B:「标签筛选与展示模式」 |

## 内容与分享

| 功能 | 在哪验证 |
| --- | --- |
| 手记 Markdown 渲染与关联 | `markdown.test.mjs` 10 项 + B: 深链接覆盖 |
| 加歌 / 加手记工具 | `tools/new-song.mjs`、`new-note.mjs`；MP3 时长解析 `mp3.test.mjs` |
| 资源探测工具 | `tools/check-assets.mjs`（离线 + 在线 MIME/Range/206/CORS） |
| 单曲独立路径与元数据 | `build.test.mjs` 逐页断言 + B:「分享」「深链接」 |
| 复制链接 / 二维码 | B:「分享：规范链接 / 复制 / 二维码」 |
| 歌词海报 | Canvas 1080×1440（超长内容自动加高）；选句 4–6 行可调；`poster.test.mjs` 9 项 + 真实 Chrome 导出 61 项；**真机长按保存 NOT_RUN** |
| 微信 JS-SDK 签名适配层 | `adapters.js`；未配置时 `app-boot` 断言返回 not-configured |

## 部署

| 功能 | 在哪验证 |
| --- | --- |
| GitHub Pages 静态产物 | `build.test.mjs` + `.github/workflows/deploy.yml` |
| 相对路径 / 子路径部署 | `build` + `paths` 单测 + 本地 `BASE_PATH` 实测 |
| 深链接直达与刷新 | B:「深链接直达与刷新」7 条路径 |
| 旧站与专业背景已彻底移除 | `build`「旧站与专业背景信息已彻底移除」「站长署名为金石竹青」 |