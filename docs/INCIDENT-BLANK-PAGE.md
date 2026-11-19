# 故障报告：点击后白屏 / 排版混乱，刷新不恢复

状态：**已定位、已修复、已回归验证**
影响：所有访客都可能触发；一旦触发，刷新与重开子页面都无法恢复。

## 一、复现步骤（最短路径）

1. 打开首页 `/`
2. 点顶部导航「手记」→ 地址变成 `/notes/`
3. **再点顶部导航「曲库」**
4. 页面变成空白 / 排版全乱；此时按刷新，依然是坏的

从任何页面出发，只要导航把地址带到**与首次进入时不同的目录深度**，再点一次导航就会触发。
这解释了「间歇性」和「只有某些按钮」：深度恰好相同时不会出问题。

## 二、证据（真实 Chrome，非推断）

第 2 步之后，导航链接的 `href` 原始值仍是 `./songs/`，但浏览器解析结果已经变成：

```
曲库  raw=./songs/  resolved=http://…/notes/songs/     ← 不存在的路径
专辑  raw=./albums/ resolved=http://…/notes/songs/albums/
我的  raw=./me/     resolved=http://…/notes/songs/me/
```

第 3 步点击后，Network 里出现成片失败：

```
404 /notes/songs/
404 /notes/songs/assets/css/site.css      net::ERR_ABORTED
404 /notes/songs/assets/css/player.css    net::ERR_ABORTED
404 /notes/songs/assets/css/themes.css    net::ERR_ABORTED
404 /notes/songs/assets/css/layout.css    net::ERR_ABORTED
404 /notes/songs/assets/js/app.js         net::ERR_ABORTED
404 /notes/songs/assets/data/catalog.json
```

第 4 步刷新后：`url=/notes/songs/`、`body[data-kind]=notfound`、`app.js` 仍然 404。

**分类结论**：不是「整页未渲染」，而是**内容存在但样式与脚本全部丢失**——
因为落到的是 404 页，而 404 页自己的资源也按错误深度解析了。

## 三、根因（两个缺陷叠加）

### 根因 1：持久外壳的相对链接 + SPA 改地址

`header` 导航位于 `#page-root` **之外**（这是「导航不断歌」架构的必要设计），
它的 `href` 由构建期按**首次进入页面的深度**生成（首页 `./songs/`，深层页 `../../songs/`）。

SPA 用 `pushState` 改了文档 URL，但**没有重写这些 href**。
浏览器于是用**新深度**重新解析它们 → 指向不存在的路径。
再点一次就是一次真正的整页跳转到 404。

> 同类问题此前已在 `<head>` 资源上修过（`absolutizeHeadAssets`），
> 但**遗漏了 `<head>` 之外的持久外壳链接**。

### 根因 2：404 页依赖相对路径的外部资源

GitHub Pages 会把 `404.html` 挂在**任意深度**的未匹配 URL 上。
原来的 404 页用 `./assets/...`，于是被按那个深度解析 → CSS/JS 全部 404。

结果：404 页退化成「有文字、没样式、没脚本」的白屏，
而且 URL 已经是坏的，**刷新只会重复同一个坏请求**，永远回不来。

### 已排除的方向

- **不是缓存问题**：本地全新 context、无 Service Worker（本站从未注册 SW），稳定复现。
- **不是主题/全局 CSS 让内容不可见**：三套主题的 `data-theme` 都只换变量；
  未知值也会回退到 `:root` 的 cloud 令牌，内容始终可见。
- **不是部署版本错配**：同一次构建内即可复现，失败请求全部指向**同一个坏目录前缀**。

## 补充证据核对（用户提供的截图）

截图特征：**「404 Not Found / 这一页不在小屋里」＋导航是默认蓝色链接和列表圆点**。
「圆点 + 蓝链接」意味着 `ul[class]{list-style:none}` 这类重置完全没生效 → **CSS 一张都没加载**。
这与「内容存在但样式丢失」的判定完全一致，而不是整页未渲染。

### 用实际请求确认（正式域名）

同一个样式表，正确深度 vs 错误深度：

```
GET https://www.xuzhaoqing.com/assets/css/site.css
  HTTP 200 · Content-Type: text/css; charset=utf-8            ← 正常

GET https://www.xuzhaoqing.com/notes/songs/assets/css/site.css
  HTTP 404 · Content-Type: text/html; charset=utf-8
  返回体前 3 行：<!DOCTYPE html> / <html lang="zh-CN"> / <head>   ← 把 404 的 HTML 返回给了 CSS 请求
```

浏览器拒绝把 `text/html` 当样式表应用，于是**全站样式丢失**；
`app.js` 同样拿到 HTML → 脚本不执行 → 播放器与路由都不工作。
这就是截图里「有 404 文案、但导航退化成默认样式」的确切原因。

### 托管与部署核实

```
server: GitHub.com
x-github-request-id: 382A:3E880C:190AFDB:1AC307F:6AFEC983
```

- 托管：**GitHub Pages**（不是自建服务器）
- 发布：`.github/workflows/deploy.yml` → `upload-pages-artifact(path: dist)` → `deploy-pages`
- 域名：`CNAME = www.xuzhaoqing.com` → **base path `/`**，不存在子路径拼接问题
- 线上产物确已生成并部署：`build-manifest.json` 显示 `mode=production · pages=11 · songs=1`
- 客户端路由**有**对应机制：每个子路径都是构建期预渲染的真实 `目录/index.html`，
  直接访问与刷新都由 Pages 命中真实文件；SPA 只是「顺便」不整页刷新。
  唯一没有真实文件的就是**不存在的路径**，那由 `404.html` 兜底。

### 全站链接与资源审计

`node tools/audit-links.mjs --base https://www.xuzhaoqing.com`：
逐页取出**每一个** `href` / `src`，按该页面 URL 解析后逐个实测 →
**11 个页面、全部引用 200，CSS/JS 的 Content-Type 全部正确，0 问题**。
不存在大小写、尾斜杠或 base 拼接错误（所有站内路由都以 `/` 结尾，且由 `routeFor()` 统一生成）。

### 审计中发现并已补掉的残留隐患

审计列出「`#page-root` 之外的相对引用」时暴露出：
播放器占位封面 `#plCover` / `#plBigCover` 的 `src` 仍是 `../assets/img/placeholder.svg` 这类相对路径。
上一轮只绝对化了 `a[href]` 与 `<head>` 资源，**漏了外壳里的 `<img>`**。

已修：`absolutizeChromeLinks()` 增加第二个循环，处理外壳里的
`img[src]` / `source[src]` / `use[href]`，同样跳过 `#page-root` 内部。
新增断言：**boot 后与导航后，外壳里不允许残留任何相对引用**（jsdom + 真实浏览器各一条）。

## 追加根因：按页面深度的相对前缀（路径累积）

用户提供的故障地址：

```
http://localhost:8000/songs/demo-paper-boat/songs/songs/about/me/notes/songs/demo-night-ferry/songs/demo-paper-boat/
```

这是**逐跳累积**：每一跳都把一个相对路径追加到当前目录后面。
拆开看正好是「歌曲页 → 曲库 → 曲库 → 关于 → 我的 → 手记 → 某首歌 → 另一首歌」。

根因比前面两条更根本：**整站链接与资源都用「按页面深度算出的相对前缀」**
（首页 `./`、一级页 `../`、二级页 `../../`）。
它的正确性依赖「页面被服务在与生成深度完全一致的 URL 上」。
而 404 页会被 Pages 挂在**任意深度**，它自己也带着一套相对前缀，
于是在 404 页上每点一次链接就再累积一层——上面那串地址就是这样长出来的。

### 结构性修复（不再依赖运行时补救）

- 构建期引入统一 `BASE_PATH`（`--base`，默认 `/`），
  **所有** `href` / `src` 一律 `${BASE_PATH}…` 绝对路径：
  `/songs/`、`/songs/<slug>/`、`/about/`、`/assets/css/site.css` …
- 模板里的 `rel` 前缀参数统一改名为 `base`（100 处），`relPrefix(depth)` 不再参与生成
- `<html data-base="…">` 记录构建 base；`app.js` 的 `rebaseForDeployment()` 仅在实际部署
  base 与构建 base 不一致时兜底改写，且不动 canonical / og
- 404 页链接同样用构建 base 生成（子目录部署时自动带前缀）
- `absolutizeChromeLinks()` 保留为兜底，但**正确性不再依赖它**

## 四、修复

| 文件 | 改动 |
| --- | --- |
| `assets/js/app.js` | 新增 `absolutizeChromeLinks()`：启动时把 `#page-root` **之外**的链接转绝对 URL；`#page-root` 内部不动（随页面替换，深度本就正确）。启动时写入 `zx.music.base` 供 404 页定位 |
| `tools/lib/templates/pages/misc.mjs` | 新增 `renderStandaloneNotFound()`：**内联全部样式、零外部请求**的 404 页，显示坏地址，提供「回首页 / 返回上一页 / 去曲库」，并用运行时 base 修正链接 |
| `tools/build-site.mjs` | 404.html 改用独立模板 |
| `assets/js/router.js` | `_load` 包 `try/finally`，失败也摘掉 `data-navigating`；换进空内容视为失败并回退整页跳转，绝不留下空白 |
| `assets/js/store.js` | 新增 `sanitizeState()`：**逐字段**校验与回退；收藏/最近播放/队列**逐条**过滤，保留有效数据；整块 JSON 损坏时把原文备份到 `zx.music.v1.broken` 并继续运行（不再永久停掉持久化） |
| `assets/js/ui/common.js` | 新增 `showErrorBanner()`：**内联样式**的可见错误提示 + 重新加载 / 回首页 / 关闭 |
| `assets/js/app.js` | 点击分发、change、keydown、`onPage`、`boot` 全部加错误边界；`window.error` 与 `unhandledrejection` 兜底；坏字段修好时给温和提示 |
| `tests/helpers/dom-app.mjs`、`assets/js/app.js` | 修掉测试环境**重复 boot**（自动启动 + 显式调用）导致监听器重复绑定的问题 |

**没有**用强制刷新、清缓存或重置用户数据来「解决」问题。

## 五、验证

- `npm run typecheck` → 0 error
- `npm test` → **164 / 164**（新增 `tests/regression.test.mjs` 16 项 + `app-boot` 4 项白屏回归）
- `node tools/probe-regression.mjs` → **73 / 73**，覆盖：
  - 桌面从首页出发、桌面从深层单曲页出发、手机从首页出发的 5 连跨深度导航
  - 旧数据用户（`theme:'dark'` + `view:'grid'` + `stage:'lyrics'`）
  - 坏字段用户：收藏与最近播放的有效条目**全部保留**，坏字段回退，播放正常
  - 整块 JSON 损坏：原文已备份、应用仍启动
  - 主题 ×3 / 视图 ×3 / 播放 交叉操作后再导航
  - 直接打开 `/notes/songs/`：404 页样式生效、零外部请求、点「回首页」能恢复
- `npm run browser:check` → **213 / 213**，六组合全量 + 新增「白屏回归」段
- **正式域名实测**（部署后，含真实歌曲《青春大概》）：
  - `node tools/verify-live.mjs` → **18 PASS · 1 N/A · 0 FAIL**
    （单曲深链接 `/songs/qingchun-dagai/` 直达 200 + canonical + 播放按钮 + 音源 **206 audio/mpeg**）
  - `node tools/browser-live.mjs` → **45 / 45**
  - `node tools/probe-regression.mjs --base https://www.xuzhaoqing.com` → **76 / 76**
    其中「首页 → 手记 → 曲库 → 专辑 → 我的 → 首页」在桌面与手机上
    **每一步路径正确、样式生效（4 张样式表 + head sticky）、零失败请求、零 Console 错误**，
    刷新后仍正常；`/notes/songs/` 的 404 页正常显示并能一键回首页。
    另含「**11 个页面逐个直接打开 + 原地刷新**」全量 sweep，全部正常。
    恢复页截图：`docs/screenshots-live/recovery-404.png`
  - `node tools/audit-links.mjs --base https://www.xuzhaoqing.com` → **0 问题**
    （11 个页面共 300+ 个 href/src 逐个实测 200，CSS/JS 的 Content-Type 全部正确）

## 六、受影响用户怎么恢复

**不需要清缓存，也不需要清数据。**

1. 部署上线后，**直接访问 <https://www.xuzhaoqing.com/>**（或点浏览器地址栏输入域名）。
   坏的是地址，不是本地数据——回到正确地址即恢复。
2. 如果仍停在坏地址：新版 404 页会正常显示，点页面上的**「回首页」**或**「返回上一页」**即可。
3. 收藏、歌单、播放进度、主题与布局设置**都不会丢**。
   若个别字段确实读不出来，只会把那一个字段恢复默认，并给一句提示；
   整块数据损坏时原文会留在 `localStorage['zx.music.v1.broken']`，没有被销毁。
4. 之前若把坏地址加入了书签，请删掉那条书签，改用正常页面地址。