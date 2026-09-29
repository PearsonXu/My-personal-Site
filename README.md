# Computation × Intuition — 个人主页

Zhaoqing Xu 的个人全能主页：把**计算数学的严谨**与**算法之外的灵感**放在同一页。

原生 `HTML + CSS + JS`，无构建步骤，GitHub Pages 直接部署。唯一的运行时外部依赖是 KaTeX（公式）与 Google Fonts（字体），两者都做了**加载失败兜底**：CDN 不可达时公式退化为等宽 Unicode 文本，字体退化为系统栈。

线上地址：<https://www.xuzhaoqing.com/>　学术主页（Hugo，另一仓库）：<https://www.zhaoqingxu.com/>

## 文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 结构与内容（Hero / Research / Math & Method / CFL Lab / Essays / Garden / Sandbox / Contact） |
| `style.css` | 设计令牌、数学网格背景、双视角色场、Bento 便签墙、响应式与打印样式 |
| `script.js` | Mode 视角过滤、KaTeX 渲染、CFL 数值实验台、命令面板、快捷键、Toast、滚动系统 |
| `CNAME` | GitHub Pages 自定义域名 `www.xuzhaoqing.com`（删除此文件即回退到 `pearsonxu.github.io/My-personal-Site/`） |

## 本地预览

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

注意：本地 `localhost` 与线上自定义域名不同源，`localStorage`（视角记忆）各自独立，互不影响。
资源均用相对路径引用，因此子路径部署与根域名部署都无需改动。

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

已确证并填好的外链：**Academic Site = `https://www.zhaoqingxu.com`**（Hero 引言、§01 两处、Contact 矩阵、页脚、⌘K 命令共 6 处）与 **GitHub = `https://github.com/PearsonXu`**。
`canonical` / `og:url` 已同步为 `https://www.xuzhaoqing.com/`。

## 域名与 GitHub Pages 拓扑（已用 `dig` / `curl -I` 核实）

| 站点 | 地址 | 承载 | 内容 |
| --- | --- | --- | --- |
| 学术主页 | `www.zhaoqingxu.com` | 用户级 Pages `pearsonxu.github.io` | Hugo 0.164.0，标题 *Zhaoqing Xu \| Computational Mathematics* |
| **本页** | `www.xuzhaoqing.com` | 项目级 Pages（本仓库 `CNAME`） | 原生三文件站点 |

两个域名互不干扰：`www.zhaoqingxu.com` 的 CNAME 指向用户级站点，本仓库的 `CNAME` 只作用于 `www.xuzhaoqing.com`。
**但不要把本仓库的 `CNAME` 改成 `www.zhaoqingxu.com`**——那会把域名从 Hugo 学术站抢过来，学术站随即掉线。

启用自定义域名后，GitHub 会停掉 `pearsonxu.github.io/My-personal-Site/` 这个路径（返回 404），这是预期行为，
访问入口统一为 `www.xuzhaoqing.com`。若需临时回退到子路径，删除仓库根目录的 `CNAME` 文件并推送即可。

### DNS 待办

- `www.xuzhaoqing.com` → A `185.199.108.153` ✅
- `xuzhaoqing.com`（裸域）→ A `185.199.109/110/111.153`，**缺 `185.199.108.153`**，建议补齐四条以保持 GitHub Pages 的完整容错
- 裸域要生效还需把 `CNAME` 文件内容改为 `xuzhaoqing.com`（一个仓库只能声明一个自定义域名）；
  更省事的做法是在 DNS 侧把 `xuzhaoqing.com` 做 301 跳转到 `www.xuzhaoqing.com`

### HTTPS 待办

首次绑定域名时 GitHub 需要签发 Let's Encrypt 证书，签发完成前 `https://www.xuzhaoqing.com` 会因证书仍是 `CN=*.github.io` 而握手失败（浏览器报"您的连接不是私密连接"），此时只有 `http://` 可用。
处理办法：Settings → Pages → Custom domain 处等证书签发完成后勾选 **Enforce HTTPS**；若长时间未签发，推送一次空提交触发重建，或取消再重填 Custom domain。
证书生效前请不要在别处（论文、简历、社交账号）贴 https 链接。
