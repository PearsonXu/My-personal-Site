# 播放器控制区与图标系统

## 一套内联 SVG，零运行时依赖

所有控件图标来自 **`assets/js/core/icons.js`**：纯字符串模块，构建期模板与浏览器
共用同一份，不引 CDN、不引图标字体、不依赖系统字体渲染。

统一规范：

| 项 | 规范 |
| --- | --- |
| 视图框 | 一律 `0 0 24 24` |
| 走带控件 | **实心**图形（播放 / 暂停 / 上一首 / 下一首 / 实心收藏） |
| 功能图标 | **1.8px 描边**，圆头圆角 |
| 颜色 | 一律 `currentColor`，由主题变量决定，图标本身不含任何色值 |
| 无障碍 | `aria-hidden="true"` + `focusable="false"`，语义由按钮的 `aria-label` 承担 |

## 走带四件的几何

四个图形共用 **高度 11.2、垂直重心 y=12**，所以并排时视觉重心完全对齐：

| 图标 | 形状 | 水平包围盒 | 重心 |
| --- | --- | --- | --- |
| 播放 | 实心三角 | 8.8 → 17.8 | **13.3**（右移 1.3px 做光学居中） |
| 暂停 | 双竖条 3.4×11.2，间隔 3.2 | 7 → 17 | 12（几何居中） |
| 上一首 | 竖线 2.2 + 左向三角 | 6 → 18 | 12 |
| 下一首 | 右向三角 + 竖线 2.2 | 6 → 18 | 12 |

三角形若按几何居中会显得偏左，所以**把光学偏移烘焙进路径坐标**，
而不是用 CSS transform 去推——这样 SVG 盒子本身不动。

## 播放 ↔ 暂停不跳位

主按钮里**同时渲染两个 SVG**：

```html
<button id="plToggle" class="pbtn pbtn--play" data-act="toggle" aria-label="播放">
  <span class="pbtn__glyph pbtn__glyph--play">…play svg…</span>
  <span class="pbtn__glyph pbtn__glyph--pause">…pause svg…</span>
</button>
```

两者叠在同一个 grid 区域，靠 `.pl[data-state=…]` 切换 `display`。
因此切换时**不改 DOM、不改尺寸、不改位置**，实测位移为 0。
`playing / buffering / loading` 显示暂停图标，其余显示播放图标。

## 尺寸与间距

| 元素 | 桌面 | 手机 |
| --- | --- | --- |
| 主按钮（圆形） | **48px** | **56px** |
| 上一首 / 下一首 点击区 | **44×44** | **44×44** |
| 上一首 / 下一首 图形 | **24px** | **24px** |
| 功能键点击区 | 44×44 | 44×44（迷你条上隐藏，展开页保留） |
| 功能键图形 | 22px | 22px |
| 三主控间距 | 8px | 4px |
| 展开页主控间距 | 12px | 8px |

尺寸走令牌 `--play-size` / `--pbtn-size`，手机值在 `layout-mobile.css` 覆盖，
所以「手动选手机布局」在宽屏上也会得到 56px 主按钮。

三个主控 `justify-content:center`，间距均衡；手机迷你条现在**保留上一首**，
不再只有播放和下一首。

## 三套主题

主按钮 `background:var(--acc)`、图形 `color:var(--on-acc)`；次控件 `color:var(--dim)`，
hover 转 `var(--acc)`。**没有任何单独硬编码的颜色**：

| 主题 | 主按钮 | 图形 | 其余主控 |
| --- | --- | --- | --- |
| cloud | 红 `--acc:#e02f2f` | 白 `--on-acc:#fff` | 深灰 `--dim:#4e5969` |
| forest | 森林绿 `#2f6b46` | 暖纸 `#fdfaf2` | 绿灰 `#55604c` |
| midnight | 紫 `#9d8cff` | 深夜 `#0a0918` | 淡紫 `#b6b0dc` |

## 交互态（克制）

- **hover**：只改颜色与阴影，**不缩放**——几何尺寸恒定，避免视觉跳动
- **按下**：`scale(.96)`（主按钮）/ `scale(.94)`（次控件），仅按压瞬间
- **键盘焦点**：`:focus-visible` 2px `var(--acc)` 描边 + 2px offset
- **禁用**：`opacity:.35`、`cursor:not-allowed`，主按钮转为中性灰

## 歌词与简介入口：常驻文字按钮「词」「简介」

歌词与简介入口都不是图标，而是**文字按钮**（`pbtn--text pbtn--lyrics` / `pbtn--text pbtn--about`）：

- **位置**：迷你条 `.pl__extra` + 展开页 `.pl__fullbtns`，两个按钮并排。
  手机迷你条拆成两行：第一行 封面 / 标题 / 三主控，第二行右对齐「词」「简介」
  （`layout-mobile.css`，`--pl-h:124px`）——两个 44×44 文字键加三主控在 320px 宽也放不下一行。
  操作区只保留这两个键，**不进「更多」菜单**。
- **外观**：圆角 12px、`var(--line-2)` 边框 + `var(--panel-2)` 浅底、正文色文字，三套主题都有对比度。
  展开态由 `aria-expanded="true"` 驱动：`var(--acc)` 主题红底 + `var(--on-acc)` 文字。
- **点击区**：沿用 `--pbtn-size`，桌面 / 手机都是 **44×44**。
- **行为（「词」三态循环）**：`data-act="toggle-lyrics"`，唯一委托入口，一次点击只推进一态：
  **隐藏 → 纯享 → 设置 → 隐藏**，之后循环。
  - 隐藏（默认）：不显示歌词，按钮普通样式（`data-mode="off"`）。
  - 纯享（第一击）：显示歌词，同步 / 高亮 / 自动跟随 / 点击跳转全保留；字号与校准工具栏隐藏，
    界面简洁；按钮主题色高亮（`data-mode="pure"`，`aria-expanded="true"`）。
  - 设置（第二击）：歌词继续显示；工具栏独立占一行出现，**不覆盖歌词 / 歌名 / 其他按钮**；
    字号与校准调整立即生效；按钮高亮 + 小齿轮标记（`data-mode="settings"`，CSS 露出 `.pbtn__gear`）。
  - 隐藏（第三击）：收起歌词与全部设置，回封面普通播放页（`data-mode="off"`）。
  三态是运行时状态（`PlayerUI.lyricsTools` + 派生 `lyricsMode`），**不持久化**：
  刷新 / 收起后第一击永远回纯享。字号偏好（按浏览器）与校准偏移（按歌曲）各自持久化，
  关面板不重置；切歌不沿用上一首校准。`aria-label` 描述下一次点击：
  显示歌词 / 显示歌词设置 / 收起歌词；`aria-controls` 指向 `plLyrics`。
- **「简介」互斥**：`data-act="toggle-about"` —— 同一时刻只有一个舞台
  （`cover / vinyl / lyrics / about`），看歌词（纯享或设置）时点「简介」直接切换，不会叠两层；
  从简介点「词」回纯享。`aria-controls` 指向 `plAbout`。
- **无歌词**：按钮永远可点；面板显示空状态，同时 toast「暂无歌词」。
- **文字按钮例外**：AGENTS 规则 13 要求控件用内联 SVG；「词」「简介」是**文字标签**而非图标字符，
  是仅有的 `pbtn--text` 例外，`tests/icons.test.mjs` 对它们仍要求 aria-label + 可见文字，
  Emoji / Unicode 图形字符禁令不变。

### 歌词面板顶部工具栏（字号 + 校准，仅设置态显示）

工具栏 `.pl__toolbar` 位于歌词滚动区**之前**（不随歌词滚动），**只在设置态显示**
（`.pl__stage[data-stage="lyrics"][data-tools="true"] .pl__toolbar { display:flex; }`）；
纯享态 `display:none` 完全让出高度，歌词区拿满。集中两组控件，允许换行、不横向溢出：

- **字号**：`小 / 中 / 大` 三档（`data-act="lyric-font" data-size="s|m|l"`），默认「中」，
  选中态 `aria-pressed="true"` + 主题红底。只缩放歌词文字：`#plLyrics[data-font]` 设
  `--lrc-scale`（.86 / 1 / 1.2），行与高亮行用 `calc(… * var(--lrc-scale))`。
  偏好存当前浏览器（`zx.music.lrcFont`，`Store.getLrcFont/setLrcFont`），启动即恢复；
  **不触碰音频与时间轴**。
- **歌词校准**：`延后 0.5s / 读数 / 提前 0.5s / 重置` + 方向说明
  「提前 = 歌词更早出现 · 延后 = 歌词更晚出现 · 读数「+」为提前」。
  - `Player.setLyricOffset / adjustLyricOffset`：运行时平移时间轴，**正值 = 歌词提前**（与 LRC `[offset:]` 同一约定），
    钳位 ±30s、步进 0.1s；基于原始时间轴反复平移，不累积误差。
  - 校准后重算 `lyricIndex` 并重发 `lyrics` / `lyric-line` / `lyric-offset` 事件 → 高亮、自动滚动、点击跳转照常。
  - **按歌曲持久化**（`store.data.lyricOffsets[slug]`，`sanitizeState` 逐条校验）：切歌加载该曲自己的偏移，
    互不影响；归零删除条目；刷新后恢复。无时间轴歌词 / 未加载 / 读取失败时控件禁用（仍可见）。
  - LRC 文件里的 `[offset:]` 解析（`core/lrc.js`）不变，两者叠加生效。

### 简介面板（`#plAbout`，舞台 `about`）

`ui/song-info-ui.js` 按当前歌曲渲染，`track` 事件驱动重渲染 → 切歌不残留上一首信息：

- 行：歌曲名称（标题）、原唱 `originalArtist`、作词 `lyricist`、作曲 `composer`、
  本站版本 `versionNote`（demo 无说明时如实标「DEMO 测试音」）、版本制作 `versionBy`、
  生成工具 `tools[]`（**单独一行**，SUNO 等绝不混进原唱 / 词曲署名）、其他署名 `credits[]`、歌曲介绍 `about`。
- **缺失字段隐藏**，不编造署名、不展示空标签；全部资料缺失时显示「歌曲资料待补充」。
- 元数据在 `content/songs/*.json` 填写，`tools/new-song.mjs` 提供
  `--original-artist / --version-note / --version-by / --tools` 旗标；catalog 携带这些字段供播放器使用。
- 验收：`tests/player-panels.test.mjs` + `node tools/probe-player-panels.mjs`
  （结果 `docs/player-panels-results.json`，截图 `docs/screenshots/panels-*.png`）。

## 歌词自动跟随与「回到当前歌词」

同步与跟随的工程约定（根因取证见 `docs/LYRICS-SYNC.md`）：

- **时间依据只有 `audio.currentTime`**。`timeupdate` / `seeked` / `playing` / `loadedmetadata`
  都重新定位；歌词异步落地（`_applyLyrics`）**立即**按当前时间计算行号并 emit `lyric-line`，
  不允许静默赋值（否则恢复进度 / 慢网时高亮冻到下一句，真实歌曲句间隔可达 20s+）。
- **当前行** = 时间戳 ≤ currentTime 的最后一行（`core/lrc.js#lineIndexAt`）；
  高亮 `is-active`，其余行弱化；首句前 idx=-1 回容器顶；纯文本 / 无歌词不模拟同步。
- **自动滚动只滚 `#plLyrics` 容器**，当前行保持在容器中部附近；仅在当前行变化时滚动。
- **滚动来源判定**：wheel / touchstart / pointerdown / 键盘翻页 = 用户意图 → 暂停跟随；
  程序化滚动打标记（`scrollend` + 兜底定时器）期间产生的 scroll 事件**不算**用户滚动
  （旧代码把自己的 smooth scroll 当用户滚动，导致跟随自我暂停、可见行落后一句以上）。
- 暂停跟随时显示悬浮按钮 **「回到当前歌词」**（`#plLyricsBack`，44px 触达，不占滚动内容）；
  点击恢复跟随并立即居中。**拖动进度 / 切歌 / 重开歌词面板**（`onStageChange` → `refollow()`）
  也会立即定位并恢复跟随。
- `prefers-reduced-motion`：滚动瞬时（`behavior:'auto'` + CSS `scroll-behavior:auto`）。
- 回归：`tests/lyrics-sync.test.mjs`（8 项）；真实浏览器 `npm run probe:lyrics`
  （本地 + 线上对比、慢网、恢复进度、触摸；线上旧构建项记 `expectedOld` 复现证据）。

## 一致性

首页 hero、曲库行、封面墙卡片、单曲页主按钮、专辑/歌单操作条、手记关联歌曲、
`/me/` 列表、底部迷你条、手机展开页、全屏歌词页——**播放图形是同一份路径**，
有单元测试逐页比对。

## 验证

- `tests/icons.test.mjs`（15 项）：视图框统一、currentColor、四件同高同重心、
  光学居中、双竖条比例、三角+竖线、尺寸令牌、主题变量、四种交互态、
  产物无 Emoji/Unicode 控件字符、每个控件内联 SVG 且有 aria-label、逐页图形同源
- `npm run browser:check` 每组合新增两项真实浏览器断言：
  - **主控尺寸与点击区域达标**（实测桌面 48 / 手机 56，上下首 44，图形 24）
  - **播放/暂停图标原位切换：不跳位、不断音**（按钮与图形四值位移 < 0.6px，
    音源不变、进度不倒退）
- 控制区特写截图：`docs/screenshots/controls-{theme}-{viewport}-{bar,full}.png`
- 面板轮（字号工具栏 + 逐曲校准 + 简介）：`tests/player-panels.test.mjs`（15 项）+
  `tools/probe-player-panels.mjs` 真实 Chrome 桌面 1440×900 / 移动 390×844，
  本地 DEMO 与线上生产各 47/47；截图 `docs/screenshots/panels-{local,live}-*.png`，
  报告 `docs/player-panels-results.json`（`alsoRun` 保留另一目标的上一次摘要）
- 面板轮复测：`probe-regression` 138/0、`probe-lyrics-sync` local+live 41/41、
  `verify-live` 18 PASS · 1 N/A · 0 FAIL（2026-11-19，部署 commit 281e168 后；
  线上 3 首真实歌曲，「另一首歌」为无 LRC 的《天和山雨雪》，覆盖无歌词时校准与简介仍可用）
- **NOT_RUN**：iOS Safari 真机、微信内浏览器真机（无设备 / 账号）；
  「全部资料缺失 → 歌曲资料待补充」分支仅单元覆盖，未真机目视

> 图标轮只改图标、尺寸、间距与交互样式；面板轮新增字号偏好（按浏览器持久化）、
> 校准偏移（按歌曲持久化）与简介舞台，Media Session 封面 MIME 改为按扩展名如实声明。
> 走带 / 快捷键 / 竞态令牌 / 媒体事件驱动状态机均未改动。