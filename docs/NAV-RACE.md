# 故障报告：子页返回 / 快速切换后页面异常（导航竞态把地址拽回旧 URL）

状态：**已定位、已修复、已回归验证**（线上复验待部署）
关联：`docs/INCIDENT-BLANK-PAGE.md`（相对路径累积，已修）——本次是**另一个独立根因**，
与链接 base 无关：当前构建全站 href 已是 base 绝对路径（`tools/compare-hrefs.mjs` 0 不一致）。

## 一、复现步骤（最短路径）

1. 打开首页 `/`
2. **快速连点**顶部导航「曲库 → 手记 → 关于」（间隔 < 一次路由 fetch 的耗时；慢网更明显）
3. 地址落在**中间那次**导航（如 `/notes/`），而不是最后点的 `/about/`；
   伴随一次**整页加载**（音乐中断、页面闪白）
4. 变体：点任一导航后**在 fetch 返回前按浏览器后退** → 地址被拽回前进方向的目标，
   后退「失效」；再点导航时 URL 与内容错位，观感即「页面异常 / 404 / 样式丢失」

桌面与移动菜单同构（共用一份 `.nav` DOM），均可触发。
慢步骤回归（每步等 550ms+）测不出：竞态窗口只在「上一次 fetch 未完成」时存在。

## 二、证据（真实 Chrome + jsdom，非推断）

修复前，1440×900 与 390×844 真 tap 均复现：

```
F12 连点 曲库→手记→关于
   url=http://localhost:8401/notes/          ← 应为 /about/
   failed=["net::ERR_ABORTED http://localhost:8401/songs/",
           "net::ERR_ABORTED http://localhost:8401/songs/"]   ← 整页跳转取消路由 fetch 的痕迹
```

jsdom（fetch stub 尊重 AbortSignal 后）旧代码必红：

```
✖ router · 连点三个导航：最后一次生效，且不做整页回退
  AssertionError: abort 不应进入整页回退分支
✖ router · fetch 途中按后退：地址留在后退目标，不被旧导航拽回
```

## 三、根因

`router.js` 的 `navigate()` 先 `pushState` 再 fetch；新导航 / popstate 会用
AbortController **abort 上一次 fetch**。旧代码的 catch 把 `AbortError` 当成导航失败，
执行兜底 `location.assign(旧目标)`：

- 连点：第 1 次的 catch 把整页拽向 `/songs/`，与第 2、3 次的 pushState 互相打架 → 落错页 + 整页刷新；
- 途中后退：popstate 的 `_load` abort 进行中的 fetch → 旧 navigate 的 catch 把地址拽回前进目标 → 后退失效；
- 整页加载打断播放（`<audio>` 随文档销毁），并可能落在已不存在的地址 → 404 观感。

**已排除**：链接 base / 相对路径累积（全站 href 绝对，矩阵 5×7×2 + 全页面直达刷新全绿）、
404 页外部依赖（独立内联模板）、缓存（全新 context 稳定复现）、部署错配（本地同构建复现）。

## 四、修复

| 文件 | 改动 |
| --- | --- |
| `assets/js/router.js` | `navigate()` 记录本次令牌；catch 中 `AbortError` 或令牌过期 → 静默返回，**不**整页回退；真失败仍回退。popstate 的 catch 同样区分 abort；真失败时 `onError` + 整页加载**当前**地址，不留「URL 变了内容没变」的半截态。`_syncNav()` 跳过无 href 的 `button.nav__a--btn`（外观按钮），不再生成 `/xxx/null` 垃圾 target |
| `tests/router.test.mjs` | fetch stub 尊重 AbortSignal（可配 delay）；新增 4 项竞态回归：连点落最后一次、途中后退不被拽回、404 仍回退、popstate 真失败整页加载当前地址。观察点用 `onError`（jsdom 对「assign 到当前地址」静默忽略，无法用导航事件计数） |
| `tools/probe-regression.mjs` | 新增「导航竞态」段：只慢化带 `X-ZX-Router` 头的 fetch 350ms；桌面真鼠标 / 移动真 tap 连点三导航、途中后退、再前进；用 `load` 事件计数证明**零整页跳转**；资源请求零失败 |
| `AGENTS.md` | 约束 18：abort ≠ 失败，禁止整页拽回；测试 stub 必须尊重 AbortSignal |

**没有**重写路由、没有全局重定向、没有清缓存 / 清数据。

## 五、验证

- `node --test tests/router.test.mjs` → **10 / 10**（含 4 项新回归；旧代码下新回归必红，非空性已证明）
- `npm test` → **198 / 198**
- `npm run typecheck` → 0 error
- `node tools/probe-regression.mjs`（本地 DEMO 构建）→ **138 通过 · 0 失败**，含：
  - 桌面 / 移动 慢网连点落在 `/about/`、`load` 事件 0 次、样式 4 张生效
  - 途中后退落在 `/about/`、前进落在 `/notes/`、均未整页拽回
  - 5×7×2 跨子页交叉跳转 + 每跳刷新、11+ 页面直达 + 刷新、坏数据 / 损坏 JSON 场景
- 用户操作清单逐条实测（68 步，桌面真鼠标 + 移动真 tap）：
  首页→歌曲→曲库；首页→歌A→后退→歌B；歌曲→关于→手记→首页；
  连续后退×3 / 前进×2 再切换再刷新；5 个子页直达 + 刷新 + 再导航；
  移动菜单开合真 tap 交叉跳转；跨页 hash / 同页锚点 / 跨 hash 后退；
  404 直达→去曲库→回首页；慢网连点 / 导航中再点。**全部通过**
- **线上旧构建复现（部署前取证）**：`node tools/probe-regression.mjs --base https://www.xuzhaoqing.com`
  → **132 通过 · 6 失败**，6 失败全部集中在「导航竞态」段：
  desktop「连点未触发整页跳转 — load 事件 2 次」「途中后退生效 — 落在 /notes/」「途中后退未整页拽回 — load 3 次」，
  mobile 同构（load 1 / 2 次）。其余段（交叉矩阵 5×7×2、11 页直达刷新、坏数据等）全绿。
  **即用户线上症状的真实复现**；部署后该 6 项应转绿（见下）
- 播放保持：播放中跨页导航 + 后退，当前歌 / 队列 / 进度连续（`t` 单调递增、state=playing）；
  整页刷新后按节流保存点恢复（不自动出声），符合既有设计
- `npm run build`（生产，0 DEMO）+ `node tools/check-assets.mjs --dist dist` → 通过

### 预期噪音（非故障，勿误报）

- 被取代导航的 `net::ERR_ABORTED <路由 URL>`：AbortController 正常取消；
- 恢复播放时音频 `ERR_ABORTED`：media 预载 / seek 的正常取消，改动前即存在；
- 404 页自身文档请求的 HTTP 404 与 console 报错：预期。
判定口径：**CSS/JS 请求零失败、地址落点正确、样式生效、无整页拽回**。

## 六、NOT_RUN / 待办

- 线上复验：部署后跑 `node tools/probe-regression.mjs --base https://www.xuzhaoqing.com`，
  「导航竞态」段那 6 项应由红转绿（138 / 138）。**当前线上仍为旧构建，6 项红是预期**。
- 真 iOS Safari / 微信浏览器：NOT_RUN（无设备 / 账号）。bfcache 跨文档恢复路径未单测。