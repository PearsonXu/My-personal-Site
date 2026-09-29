# Computation × Intuition — 个人主页

Zhaoqing Xu 的个人全能主页：把**计算数学的严谨**与**算法之外的灵感**放在同一页。

原生 `HTML + CSS + JS`，无构建步骤，GitHub Pages 直接部署。唯一的运行时外部依赖是 KaTeX（公式）与 Google Fonts（字体），两者都做了**加载失败兜底**：CDN 不可达时公式退化为等宽 Unicode 文本，字体退化为系统栈。

## 文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 结构与内容（Hero / Research / Math & Method / CFL Lab / Essays / Garden / Sandbox / Contact） |
| `style.css` | 设计令牌、数学网格背景、双视角色场、Bento 便签墙、响应式与打印样式 |
| `script.js` | Mode 视角过滤、KaTeX 渲染、CFL 数值实验台、命令面板、快捷键、Toast、滚动系统 |

## 本地预览

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## 双重视角（Mode）

右上角 `Mode: All / Research & Math / Thoughts & Life` 是全站主交互：

- 卡片按 `data-lens="research|life|both"` 过滤（透明度 + 微位移过渡）
- 纯研究章节用 `data-lens-section="research"` 整体进退场
- 切换同时改变整站强调色、网格色调与指针光晕颜色（冷青 ↔ 暖琥珀）
- 状态持久化到 `localStorage('zx-lens')`，并同步到 `#lens=` hash（可分享）

## 快捷键

`⌘K` / `Ctrl+K` 命令面板 · `/` 搜索 · `M` 循环视角 · `G` `G` 回顶部 · `?` 提示 · `Esc` 关闭

## CFL 稳定性实验台

`§01.c` 是一块真能跑的数值实验：一维线性对流方程 `∂ₜu + a ∂ₓu = 0`（周期边界，高斯波包 + 方波初值），
支持 Upwind / Lax–Friedrichs / Lax–Wendroff / FTCS 四种显式格式，拖动 `Δt` 即可看到 CFL 条件 `|ν| ≤ 1` 被打破时数值解发散。
差分内核 `schemeUpdate()` 与渲染解耦，并挂到 `window.__scheme` 便于复核（收敛阶、守恒性均已自动化验证）。

## 部署前请替换的占位内容

搜索 `TODO` 与 `data-draft` 可定位全部占位（点击占位链接会提示"待补充"，不会跳到 404）：

1. **论文条目**（`§01`）：3 张卡片为模板，标题 / 作者 / 期刊 / PDF / Code 均需替换
2. **Google Scholar 与 ORCID**（`§05` 与页脚）：填入真实链接
3. **项目仓库**（`§04`）：`spectra.js` / `garden-cli` / `paper-lens` / `markov-poems` / `nocturne.css` 目前无对应公开仓库，请补链接或删卡片
4. **文章链接**（`§02`）：5 篇随笔均为 `data-draft`，指向真实文章后请去掉该属性
5. `canonical` / `og:url` 已按 `https://pearsonxu.github.io/My-personal-Site/` 设置，如改用自定义域名请一并更新

已确证并填好的外链：**Academic Site = `https://www.zhaoqingxu.com`**（Hero 引言、Contact 矩阵、页脚、⌘K 命令共 4 处）与 **GitHub = `https://github.com/PearsonXu`**。

## GitHub Pages

Settings → Pages → Build and deployment → Source: `Deploy from a branch` → Branch: `main` / `/ (root)` → Save。
上线地址：<https://pearsonxu.github.io/My-personal-Site/>

### ⚠ 不要把自定义域名绑到本仓库

域名拓扑（已用 `dig` / `curl -I` 核实）：

| 站点 | 地址 | 内容 |
| --- | --- | --- |
| 用户级 Pages | `pearsonxu.github.io` | Hugo 0.164.0 学术主页 |
| 自定义域名 | `www.zhaoqingxu.com` | `CNAME → pearsonxu.github.io.`，即上面那个 Hugo 站 |
| **本仓库** | `pearsonxu.github.io/My-personal-Site/` | 项目级 Pages，本页 |

`www.zhaoqingxu.com` 已被学术站占用。**不要**在本仓库添加 `CNAME` 文件、也不要在本仓库的 Pages 设置里填 Custom domain，
否则域名会被抢走、Hugo 学术站直接掉线。本页应长期停留在 `/My-personal-Site/` 子路径。

若也想挂到自有域名下，两条安全路线：

1. **子路径**：把 `index.html` / `style.css` / `script.js` 放进 Hugo 仓库的 `static/lab/`，即可由 `www.zhaoqingxu.com/lab/` 访问；
   同时把 `canonical` / `og:url` 改成该地址（相对路径引用，无需改资源链接）。
2. **子域名**：给 DNS 加一条 `life` 的 CNAME 记录指向 `pearsonxu.github.io`，再在本仓库根目录加 `CNAME` 文件写入 `life.zhaoqingxu.com`。
   每个仓库的 `CNAME` 文件互相独立，不会与 `www` 冲突。

