# Computation × Intuition — 个人主页

许钊箐 Zhaoqing Xu 的个人主页：把**计算数学的严谨**与**算法之外的灵感**放在同一页，支持**中 / EN 双语**。

原生 `HTML + CSS + JS`，无构建步骤，GitHub Pages 直接部署。运行时外部依赖只有 KaTeX（公式）与 Google Fonts（字体），两者都做了**加载失败兜底**：CDN 不可达时公式退化为等宽 Unicode 文本，字体退化为系统栈。英文词典 `lang.en.js` 若加载失败，站点保持中文，功能不受影响。

线上地址：<https://www.xuzhaoqing.com/>　学术主页（Hugo，另一仓库）：<https://www.zhaoqingxu.com/>

> **学术信息以 <https://www.zhaoqingxu.com/> 为唯一事实来源。** 本页的姓名、导师、学历、论文、课程、荣誉与联系方式都与它逐项同步（最近同步：2026-09-28）。以后改动学术内容，请先改学术主页，再同步这里。

## 文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 结构与内容（Hero / Research / Math & Method / CFL Lab / Essays / Garden / Sandbox / Contact） |
| `style.css` | 设计令牌、数学网格背景、双视角色场、Bento 便签墙、响应式与打印样式 |
| `script.js` | Mode 视角过滤、双语引擎、KaTeX 渲染、CFL 数值实验台、命令面板、快捷键、Toast、滚动系统 |
| `lang.en.js` | 英文词典，三张表：`html`（正文，键为规范化 innerHTML）/ `attr`（aria-label、placeholder、title）/ `js`（toast、命令面板、document.title） |
| `tools/` | 开发期工具，不参与站点运行：`extract-i18n.js` 抽取待译键，`build-i18n.js` 合并英文值并校验结构，`en-values.js` 英文值源文件 |
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

## 双语（中 / EN）

右上角 `中 / EN` 切换，或按 `L`。

- **中文是源文**，直接写在 `index.html` 里：关掉 JavaScript 也能完整阅读，爬虫抓到的也是中文
- **英文集中在 `lang.en.js`**，由 `script.js` 里的 i18n 引擎查表替换
- 引擎遍历 DOM，取「最外层的含中文文本单元」整块替换，键 = 该元素规范化后的 `innerHTML`；不含中文的节点（公式、代码、英文标签）自动跳过，因此 KaTeX 渲染不受影响
- 由 JS 动态写入的文案（实验台提示、toast、命令面板、导航 title）走 `tr()` 查 `js` 表，切换语言时一并刷新
- 切回中文时逐字节还原原始 `innerHTML`（25 组探针已自动化验证）
- 偏好持久化到 `localStorage('zx-lang')`，并同步到 `#lang=`；`#lens=` 与 `#lang=` 互不覆盖，可组合分享
- 有意保留中文的地方：姓名「许钊箐」、教学理念原句、`Musings · 漫谈`

### 改完中文之后

键就是中文内容本身，所以**改动中文会让对应英文失效**（该处回退成中文，不报错，控制台给提示）。补键三步：

```bash
node tools/extract-i18n.js   # 生成 tools/i18n-keys.json / .txt，缺译的键带 [缺] 标记
# 按 #序号 把英文写进 tools/en-values.js（顺序必须与键 1:1 对齐）
node tools/build-i18n.js     # 合并回 lang.en.js，并强制校验标签结构 / data-tex / href / data-copy
```

校验不通过就中止、不写文件；构建是幂等的（重跑 md5 不变）。`build-i18n.js` 只重写 `html` 表，`attr` 与 `js` 两张表手写维护。
浏览器控制台里也可以 `__i18n.missing()` 看缺失键、`__i18n.set('en')` 手动切换。
`tools/` 需要 dev 依赖 [jsdom](https://github.com/jsdom/jsdom)（`npm i -D jsdom`），站点本身仍是零依赖。

## 快捷键

`⌘K` / `Ctrl+K` 命令面板 · `/` 搜索 · `M` 循环视角 · `L` 切换中 / EN · `G` `G` 回顶部 · `?` 提示 · `Esc` 关闭

## CFL 稳定性实验台

`§01.c` 是一块真能跑的数值实验：一维线性对流方程 `∂ₜu + a ∂ₓu = 0`（周期边界，高斯波包 + 方波初值），
支持 Upwind / Lax–Friedrichs / Lax–Wendroff / FTCS 四种显式格式，拖动 `Δt` 即可看到 CFL 条件 `|ν| ≤ 1` 被打破时数值解发散。
差分内核 `schemeUpdate()` 与渲染解耦，并挂到 `window.__scheme` 便于复核（收敛阶、守恒性均已自动化验证）。

## 学术信息（已与 zhaoqingxu.com 同步）

以下条目全部取自学术主页，不是占位：

| 项目 | 内容 |
| --- | --- |
| 姓名 | 许钊箐 · Zhaoqing Xu（河北石家庄人） |
| 身份 | Ph.D. candidate（2021 — 2027 expected）兼 Instructor of Record · Department of Mathematics, University of South Carolina |
| 导师 | Prof. Xiaofeng Yang（硕士 / 本科导师：Prof. Jiang Yang · SUSTech） |
| 研究方向 | 相场模型与枝晶生长、能量稳定与 MBP、高阶 IMEX-RK、谱配置、界面动力学、集体行为（Euler-alignment） |
| 论文 | SISC 48(2), B233–B261 (2026，共同一作) · CMAME 在审 (2026，共同一作) · SINUM 已投 (2026) · 2 篇在撰手稿 · NAHOMCon 2026 报告（Santa Fe） |
| 教学 | Instructor of Record 5 门（MATH 115 / 121 / 170）+ TA 5 门（UofSC 与 SUSTech） |
| 荣誉与服务 | SIAM 学生分会主席 2022–2026 · zbMATH Open 审稿人 · George Johnson Graduate Fellowship · 湘潭大学科学计算夏令营优秀学生奖 等 7 项 |
| 联系 | zhaoqing@email.sc.edu（主）· 2002 Greene St, Columbia, SC 29205 · +1 (803) 409-8998 · 806864070@qq.com（备用） |

外链只保留**点得开的**：学术主页 / Research / `cv.pdf` / Musings 与两篇文章 / GitHub（含本仓库及 `script.js`、`style.css` 直链）。
原先的 Google Scholar、ORCID、X / Twitter 占位已删除——学术主页上没有这些账号，等有真实链接再加回。

仍是草稿的部分（点击提示「链接待补充」，不会跳 404）：3 篇在写随笔 + 2 个概念项目（`garden-cli`、`markov-poems`），界面上已分别标注 `draft · 未发布` 与 `Concept`。

## 域名与 GitHub Pages 拓扑（已用 `dig` / `curl -I` 核实）

| 站点 | 地址 | 承载 | 内容 |
| --- | --- | --- | --- |
| 学术主页 | `www.zhaoqingxu.com` | 用户级 Pages `pearsonxu.github.io` | Hugo 0.164.0，标题 *Zhaoqing Xu \| Computational Mathematics* |
| **本页** | `www.xuzhaoqing.com` | 项目级 Pages（本仓库 `CNAME`） | 原生四文件站点（HTML / CSS / JS + 英文词典） |

两个域名互不干扰：`www.zhaoqingxu.com` 的 CNAME 指向用户级站点，本仓库的 `CNAME` 只作用于 `www.xuzhaoqing.com`。
**但不要把本仓库的 `CNAME` 改成 `www.zhaoqingxu.com`**——那会把域名从 Hugo 学术站抢过来，学术站随即掉线。

启用自定义域名后，GitHub 会停掉 `pearsonxu.github.io/My-personal-Site/` 这个路径（返回 404），这是预期行为，
访问入口统一为 `www.xuzhaoqing.com`。若需临时回退到子路径，删除仓库根目录的 `CNAME` 文件并推送即可。

### DNS 现状（2026-09-28 用 `dig` / `curl -I` 实测）

- `www.xuzhaoqing.com` → `CNAME pearsonxu.github.io` → A `185.199.108/109/110/111.153` ✅ 四条齐全
- `xuzhaoqing.com`（裸域）→ A `185.199.109/110/111.153`，**仍缺 `185.199.108.153`**；不影响访问，建议补齐四条以保持 GitHub Pages 的完整容错
- 裸域已可用：`http://xuzhaoqing.com` 与 `https://xuzhaoqing.com` 均 `301 → https://www.xuzhaoqing.com/` ✅
  （因此无需把 `CNAME` 文件改成裸域——一个仓库只能声明一个自定义域名，改了反而会抢掉 www）

### HTTPS 现状

- `https://www.xuzhaoqing.com` → **HTTP/2 200**，`SSL certificate verify ok` ✅
- 证书：`CN=xuzhaoqing.com`，签发者 Let's Encrypt（CN=YR2），有效期至 **2026-12-27**
- `http://www.xuzhaoqing.com` → `301` 跳 https，即 Enforce HTTPS 已生效
- 可以放心在论文、简历、社交账号上使用 https 链接了

（历史备注：首次绑定域名时 GitHub 需要签发证书，签发完成前 https 会因证书仍是 `CN=*.github.io` 而握手失败，只有 http 可用；若长时间未签发，推送一次空提交触发重建，或在 Settings → Pages 里取消再重填 Custom domain。）

## 自动化测试

站点本身零依赖，测试用 dev 依赖 [jsdom](https://github.com/jsdom/jsdom)（当前放在仓库外的 `/tmp/zxtest`，`npm i jsdom` 即可复现）：

| 套件 | 覆盖 | 最近结果 |
| --- | --- | --- |
| `test-i18n.js` | 学术信息真实性（导师 / 论文卷期页 / 5 门课 / 7 项荣誉 / 真实邮箱与地址）、外链可点性、占位清理、双语全链路（切换 / 还原 / 深链接 / 词典缺失降级 / 命令面板 / 快捷键） | 90 / 90 |
| `test-v2.js` | Mode 过滤、揭示动画、导航淡出、命令面板、键盘、hash 深链接、无 JS 回退 | 75 / 75 |
| `test-numerics.js` | CFL 差分内核：收敛阶、守恒性、CFL 边界、发散检测 | 21 / 21 |
| `check-katex.js` | 用真实 KaTeX 渲染全部 `data-tex`，严格模式无警告 | 18 / 18 |
| `consistency.py` | 选择器闭环、id 唯一性、`rel=noopener`、`href="#"` 必带 `data-draft`、占位残留 | 全部 none |

改内容后请重跑：`node tools/extract-i18n.js` 确认词典零缺失，再跑上面几套。
