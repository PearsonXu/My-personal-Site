/* ═══════════════════════════════════════════════════════════════
   lang.en.js — 英文词典
   ----------------------------------------------------------------
   中文是「源文」，直接写在 index.html 里（无 JS 也能完整阅读）；
   英文集中在这里，由 script.js 的 i18n 引擎按内容查表替换。

   三张表：
     html : { 规范化后的中文 innerHTML : 对应英文 HTML }
            —— 键由 DOM 自动生成：innerHTML 折叠空白后 trim。
            —— 值里可以带标签（<strong>、<em>、<a>、甚至 data-tex 公式），
               替换后引擎会自动重跑 KaTeX 渲染。
     attr : { 'aria-label|中文值' : 'English value' }（也支持 placeholder / title）
     js   : { '中文字符串' : 'English string' }（toast、命令面板、document.title）

   维护方式：改完中文后运行提取脚本，它会列出所有缺失的键：
     node /tmp/zxtest/extract-i18n.mjs
   或在浏览器控制台执行： __i18n.missing()
   ═══════════════════════════════════════════════════════════════ */
window.ZX_I18N_EN = {

  /* ── JS 运行时文案 ─────────────────────────────────────────── */
  js: {
    'Zhaoqing Xu 许钊箐 — Computation & Intuition': 'Zhaoqing Xu — Computation & Intuition',

    '链接待补充': 'Link not published yet',
    '已复制：': 'Copied: ',
    '复制失败，请手动选择': 'Copy failed — please select the text manually',
    '视角 → ': 'Lens → ',
    '格式 → ': 'Scheme → ',
    '目标不存在（可能已被当前视角隐藏）': 'Target not found (it may be hidden by the current lens)',
    '实验台不可用（浏览器不支持 canvas）': 'Lab unavailable (this browser has no canvas support)',
    '命令执行失败': 'Command failed',
    '⌘K 面板 · M 切换视角 · L 切换语言 · / 搜索 · G G 回顶部': '⌘K palette · M lens · L language · / search · G G back to top',
    '按 M 切换「研究 / 生活」视角 · 按 L 切换中 / EN': 'Press M to switch lens (Research / Life) · press L for 中 / EN',
    '没有匹配的命令：': 'No matching command: ',
    '没有可用命令': 'No commands available',
    '该视角下已隐藏 · 切回 All 可见': 'Hidden in this lens · switch back to All to see it',

    /* CFL 实验台：格式说明（由 JS 动态写入 #labHint） */
    'Upwind：一阶、单调、ν ≤ 1 时稳定——但耗散，波包会变矮、方波棱角会变圆。':
      'Upwind: first order, monotone, stable for ν ≤ 1 — but dissipative: the wave packet flattens and square-wave corners round off.',
    'Lax–Friedrichs：稳定但耗散更强；有趣的是 ν = 1 时它反而精确。':
      'Lax–Friedrichs: stable but even more dissipative; amusingly, it becomes exact at ν = 1.',
    'Lax–Wendroff：二阶、几乎不耗散；一旦 ν > 1 就以指数速度炸开。':
      'Lax–Wendroff: second order and nearly non-dissipative; once ν > 1 it blows up exponentially.',
    'FTCS：中心差分 + 显式时间，对纯对流无条件不稳定——把 Δt 调到最小也一样。':
      'FTCS: centred differences with explicit time stepping — unconditionally unstable for pure advection, even at the smallest Δt.',
    '数值解已发散：显式格式的稳定性边界不可谈判。点 Reset 重来。':
      'The numerical solution has diverged: the stability boundary of an explicit scheme is non-negotiable. Press Reset to start over.',
    'CFL 被破坏（|ν| > 1）：扰动每步被放大，发散只是时间问题。':
      'CFL violated (|ν| > 1): perturbations are amplified at every step — divergence is only a matter of time.',
    '接近 CFL 极限：留意色散与耗散误差的形状变化。':
      'Close to the CFL limit: watch how dispersion and dissipation reshape the profile.',

    /* 命令面板：分组名 */
    '视角 Mode': 'Lens',
    '语言 Language': 'Language',
    '跳转 Go to': 'Go to',
    '动作 Action': 'Action',

    /* 命令面板：命令名 */
    'All — 全部内容': 'All — everything',
    'Research & Math — 只看研究与数学': 'Research & Math — research only',
    'Thoughts & Life — 只看思考与生活': 'Thoughts & Life — life only',
    '切换到中文': 'Switch to Chinese (中文)',
    'Research — 学术空间': 'Research — academic space',
    'Math & Method — 离散化思想': 'Math & Method — discretization ideas',
    'CFL Lab — 稳定性实验台': 'CFL Lab — stability playground',
    'Essays — 长文与见解': 'Essays — long-form & perspectives',
    'Digital Garden — 灵感切片': 'Digital Garden — fragments',
    'Sandbox — 项目与实验': 'Sandbox — projects & experiments',
    'Contact — 联系方式': 'Contact — get in touch',
    '复制邮箱 zhaoqing@email.sc.edu': 'Copy email zhaoqing@email.sc.edu',
    '写一封邮件给我': 'Write me an email',
    '打开学术主页 www.zhaoqingxu.com': 'Open academic site www.zhaoqingxu.com',
    '打开论文与报告列表 Research': 'Open publications & talks (Research)',
    '下载 CV (PDF)': 'Download CV (PDF)',
    '打开随笔 Musings · 漫谈': 'Open Musings · essays & notes',
    '打开 GitHub @PearsonXu': 'Open GitHub @PearsonXu',
    '运行 / 暂停 CFL 实验台': 'Run / pause the CFL lab',
    '回到顶部': 'Back to top'
  },

  /* ── 属性（无障碍标签 / 占位符 / 提示） ─────────────────────── */
  attr: {
    'aria-label|Zhaoqing Xu — 回到顶部': 'Zhaoqing Xu — back to top',
    'aria-label|主导航': 'Main navigation',
    'aria-label|视角模式': 'Lens mode',
    'aria-label|语言 / Language': 'Language: Chinese or English',
    'title|中文': 'Chinese',
    'aria-label|打开命令面板': 'Open command palette',
    'title|命令面板 (⌘K)': 'Command palette (⌘K)',
    'aria-label|展开导航菜单': 'Expand navigation menu',
    'aria-label|终端状态组件': 'Terminal status widget',
    'aria-label|向下滚动到研究区': 'Scroll down to the research section',
    'aria-label|一维对流方程数值解实时图像：实线为数值解，虚线为解析解': 'Live plot of the 1-D advection solution: solid line = numerical, dashed line = exact',
    'aria-label|页脚导航': 'Footer navigation',
    'aria-label|回到顶部': 'Back to top',
    'title|回到顶部': 'Back to top',
    'placeholder|跳转章节、切换视角或执行命令…': 'Jump to a section, switch lens, or run a command…',
    'aria-label|命令面板输入框': 'Command palette input',
    'aria-label|命令与章节列表': 'Commands and sections'
  },

  /* ── 正文（键 = 规范化 innerHTML，由提取脚本生成后填入） ─────── */
  html: {
    "跳到主要内容 <span aria-hidden=\"true\">↵</span>":
      "Skip to main content <span aria-hidden=\"true\">↵</span>",
    "我是 <strong>许钊箐 · Zhaoqing Xu</strong>——University of South Carolina 数学系计算数学博士候选人， 师从 <strong>Xiaofeng Yang</strong> 教授，同时担任本科课程 Instructor of Record。 白天为<strong>相场模型与界面动力学</strong>设计能量稳定、保结构的数值格式；夜里写点算法之外的东西： 随笔、七言、以及羽毛球飞行轨迹里的空气动力学。这个页面同时容纳这两半——用右上角的 <span class=\"kbd-inline\">Mode</span> 切换视角、<span class=\"kbd-inline\">中 / EN</span> 切换语言。 正式学术信息见 <a class=\"text-link\" href=\"https://www.zhaoqingxu.com\" target=\"_blank\" rel=\"noopener\">www.zhaoqingxu.com&nbsp;↗</a>。":
      "I am <strong>Zhaoqing Xu · 许钊箐</strong> — a Ph.D. candidate in Computational Mathematics in the Department of Mathematics at the University of South Carolina, advised by Prof. <strong>Xiaofeng Yang</strong>, and an Instructor of Record for undergraduate courses. By day I design energy-stable, structure-preserving schemes for <strong>phase-field models and interfacial dynamics</strong>; by night I write what lives outside the algorithm: essays, seven-character verse, and the aerodynamics hidden in a shuttlecock's flight. This page holds both halves — use <span class=\"kbd-inline\">Mode</span> up top to switch lens and <span class=\"kbd-inline\">中 / EN</span> to switch language. For the formal academic record see <a class=\"text-link\" href=\"https://www.zhaoqingxu.com\" target=\"_blank\" rel=\"noopener\">www.zhaoqingxu.com&nbsp;↗</a>.",
    "<a class=\"btn btn--pri\" href=\"#research\">进入研究区 <span aria-hidden=\"true\">→</span></a> <a class=\"btn btn--ghost\" href=\"#garden\"><span aria-hidden=\"true\">✦</span> 逛逛灵感切片</a> <a class=\"btn btn--quiet\" href=\"#lab\"><span aria-hidden=\"true\">▶</span> 跑一个数值实验</a>":
      "<a class=\"btn btn--pri\" href=\"#research\">Enter the research section <span aria-hidden=\"true\">→</span></a> <a class=\"btn btn--ghost\" href=\"#garden\"><span aria-hidden=\"true\">✦</span> Wander the idea garden</a> <a class=\"btn btn--quiet\" href=\"#lab\"><span aria-hidden=\"true\">▶</span> Run a numerical experiment</a>",
    "合作 · 报告 · 咖啡":
      "Collaboration · Talks · Coffee",
    "<span>§ 01</span> / Research &amp; Math <em>— 严谨的那一半</em>":
      "<span>§ 01</span> / Research &amp; Math <em>— the rigorous half</em>",
    "学术空间":
      "Academic Space",
    "我的研究在<strong>计算与应用数学</strong>——为相场模型与界面动力学设计高效且<em class=\"ser-i\">能量稳定</em>的数值格式： 既做理论（无条件稳定性、收敛性分析），也做算法（解耦求解器、高阶 IMEX 方法与谱配置）。":
      "My work sits in <strong>computational and applied mathematics</strong> — designing efficient, <em class=\"ser-i\">energy-stable</em> schemes for phase-field models and interfacial dynamics: the theory (unconditional stability, convergence analysis) as well as the algorithms (decoupled solvers, high-order IMEX methods, spectral collocation).",
    "<span aria-hidden=\"true\">✓</span> 下列条目与 <a class=\"text-link\" href=\"https://www.zhaoqingxu.com/research/\" target=\"_blank\" rel=\"noopener\">zhaoqingxu.com/research&nbsp;↗</a> 保持一致；完整 CV 见 <a class=\"text-link\" href=\"https://www.zhaoqingxu.com/cv.pdf\" target=\"_blank\" rel=\"noopener\">cv.pdf&nbsp;↗</a>。代码与预印本会在发布后补上链接。":
      "<span aria-hidden=\"true\">✓</span> The entries below mirror <a class=\"text-link\" href=\"https://www.zhaoqingxu.com/research/\" target=\"_blank\" rel=\"noopener\">zhaoqingxu.com/research&nbsp;↗</a>; the full CV is at <a class=\"text-link\" href=\"https://www.zhaoqingxu.com/cv.pdf\" target=\"_blank\" rel=\"noopener\">cv.pdf&nbsp;↗</a>. Code and preprints will be linked as they are released.",
    "<span class=\"philosophy__zh\" lang=\"zh-Hans\">教数学，是把严谨的论证变成可以看见、可以动手验证的东西。</span> 三条原则：<strong>先直觉、后严格</strong>（每个定理先有一张图，再有一个证明）； <strong>把计算当作透镜</strong>（学生亲手跑小实验，看着收敛发生）； <strong>低门槛、高上限</strong>（入门可解，但留有伸展空间）。":
      "<span class=\"philosophy__zh\" lang=\"zh-Hans\">教数学，是把严谨的论证变成可以看见、可以动手验证的东西。</span> Teaching mathematics is turning a rigorous argument into something you can see and verify with your own hands. Three principles: <strong>intuition first, rigor second</strong> (every theorem gets a picture before it gets a proof); <strong>computation as a lens</strong> (students run small numerical experiments and watch convergence happen); <strong>low floor, high ceiling</strong> (problems you can walk into, with room to stretch).",
    "<span class=\"honor__what\"><b>Outstanding Student Award</b>, Summer School on Scientific Computing · Xiangtan University（组长，团队第二名）</span><span class=\"honor__when\">2024</span>":
      "<span class=\"honor__what\"><b>Outstanding Student Award</b>, Summer School on Scientific Computing · Xiangtan University (group leader, second-place team)</span><span class=\"honor__when\">2024</span>",
    "<a class=\"text-link\" href=\"https://www.zhaoqingxu.com/research/\" target=\"_blank\" rel=\"noopener\"> 在学术主页查看全部论文、报告与课程 <span aria-hidden=\"true\">↗</span> </a> <a class=\"text-link\" href=\"https://www.zhaoqingxu.com/cv.pdf\" target=\"_blank\" rel=\"noopener\"> 下载 CV (PDF) <span aria-hidden=\"true\">↗</span> </a>":
      "<a class=\"text-link\" href=\"https://www.zhaoqingxu.com/research/\" target=\"_blank\" rel=\"noopener\"> All papers, talks and courses on my academic site <span aria-hidden=\"true\">↗</span> </a> <a class=\"text-link\" href=\"https://www.zhaoqingxu.com/cv.pdf\" target=\"_blank\" rel=\"noopener\"> Download CV (PDF) <span aria-hidden=\"true\">↗</span> </a>",
    "<span>§ 01.b</span> / Math &amp; Method <em>— 硬核审美</em>":
      "<span>§ 01.b</span> / Math &amp; Method <em>— the beauty of discretization</em>",
    "三个我最喜欢的离散化思想":
      "Three discretization ideas I love most",
    "好的数值格式不是\"把导数换成差商\"这么简单——它是<strong>把连续世界的对称性搬到网格上</strong>。 下面三块是我日常打交道的核心工具。 <span class=\"c-mute\">公式由 KaTeX 渲染；若 CDN 不可达，则回退为等宽 Unicode 文本。</span>":
      "A good scheme is not simply \"replace the derivative with a difference quotient\" — it is about <strong>carrying the symmetries of the continuous world onto the grid</strong>. These three are the tools I work with every day. <span class=\"c-mute\">Formulas are typeset by KaTeX; if the CDN is unreachable they fall back to monospace Unicode text.</span>",
    "Discrete Gradient <span class=\"method__cn\">离散梯度法</span>":
      "Discrete Gradient <span class=\"method__cn\">conservation by construction</span>",
    "<span class=\"method__key\">算法思想</span> 用<em class=\"ser-i\">平均向量场</em>替代梯度，链式法则就退化成一个代数恒等式。于是 <span class=\"math\" data-tex=\"H(u_{n+1})=H(u_n)\">H(uₙ₊₁) = H(uₙ)</span> 不是\"近似成立\"，而是<strong>每一步严格成立</strong>——跑十万步也不会能量漂移。":
      "<span class=\"method__key\">the idea</span> Replace the gradient with the <em class=\"ser-i\">average vector field</em> and the chain rule collapses into an algebraic identity. Then <span class=\"math\" data-tex=\"H(u_{n+1})=H(u_n)\">H(uₙ₊₁) = H(uₙ)</span> is not \"approximately true\" but <strong>exactly true at every step</strong> — no energy drift, even after a hundred thousand steps.",
    "Crank–Nicolson <span class=\"method__cn\">时间中心隐格式</span>":
      "Crank–Nicolson <span class=\"method__cn\">mid-point implicit in time</span>",
    "<span class=\"method__key\">算法思想</span> 把时间导数放在半步中点上，对称性换来<strong>二阶精度 + A-稳定</strong>： 步长不再被 <span class=\"math\" data-tex=\"\\Delta t\\lesssim\\Delta x^{2}\">Δt ≲ Δx²</span> 掐住脖子。 代价是每步解一个线性系统——这通常是划算的交易。":
      "<span class=\"method__key\">the idea</span> Place the time derivative at the half-step mid-point, and symmetry buys you <strong>second-order accuracy plus A-stability</strong>: the step size is no longer strangled by <span class=\"math\" data-tex=\"\\Delta t\\lesssim\\Delta x^{2}\">Δt ≲ Δx²</span>. The price is one linear solve per step — usually a good trade.",
    "Scalar Auxiliary Variable <span class=\"method__cn\">标量辅助变量 (SAV)</span>":
      "Scalar Auxiliary Variable <span class=\"method__cn\">one scalar ODE tames the nonlinearity</span>",
    "<span class=\"method__key\">算法思想</span> 梯度流的非线性项是稳定性分析的噩梦。SAV 把非线性能量藏进<strong>一个标量 ODE</strong>， 格式立刻变成线性、二阶，且<em class=\"ser-i\">修正能量</em>严格耗散。相场、液晶、两相流都靠它。":
      "<span class=\"method__key\">the idea</span> The nonlinear term of a gradient flow is the nightmare of stability analysis. SAV hides the nonlinear energy inside <strong>a single scalar ODE</strong>, so the scheme at once becomes linear, second order, and dissipates a <em class=\"ser-i\">modified energy</em> exactly. Phase-field models, liquid crystals and two-phase flow all lean on it.",
    "<span>§ 01.c</span> / Live experiment <em>— 在浏览器里积分一个 PDE</em>":
      "<span>§ 01.c</span> / Live experiment <em>— integrating a PDE in your browser</em>",
    "CFL 稳定性实验台":
      "The CFL Stability Lab",
    "一维线性对流方程 <span class=\"math\" data-tex=\"\\partial_t u + a\\,\\partial_x u = 0\">∂ₜu + a·∂ₓu = 0</span>， 周期边界，高斯波包初值。拖动 <span class=\"math\" data-tex=\"\\Delta t\">Δt</span> 改变 <span class=\"math\" data-tex=\"\\nu=a\\,\\Delta t/\\Delta x\">ν = aΔt/Δx</span>， 看 CFL 条件 <span class=\"math\" data-tex=\"|\\nu|\\le 1\">|ν| ≤ 1</span> 被打破的瞬间。 <span class=\"c-mute\">纯 Canvas 手写，无第三方库。</span>":
      "The one-dimensional linear advection equation <span class=\"math\" data-tex=\"\\partial_t u + a\\,\\partial_x u = 0\">∂ₜu + a·∂ₓu = 0</span> on a periodic domain, with a Gaussian wave-packet initial condition. Drag <span class=\"math\" data-tex=\"\\Delta t\">Δt</span> to change <span class=\"math\" data-tex=\"\\nu=a\\,\\Delta t/\\Delta x\">ν = aΔt/Δx</span> and watch the exact moment the CFL condition <span class=\"math\" data-tex=\"|\\nu|\\le 1\">|ν| ≤ 1</span> breaks. <span class=\"c-mute\">Hand-written Canvas; no third-party library.</span>",
    "你的浏览器不支持 canvas，无法显示数值解图像。":
      "Your browser does not support canvas, so the numerical solution cannot be drawn here.",
    "格式":
      "Scheme",
    "Upwind（迎风 · 一阶）":
      "Upwind (first order)",
    "Lax–Wendroff（二阶）":
      "Lax–Wendroff (second order)",
    "FTCS（中心显式 · 必炸）":
      "FTCS (centred, explicit — always blows up)",
    "<span class=\"method__key\">为什么值得玩</span> Upwind 在 <span class=\"math\" data-tex=\"0\\le\\nu\\le 1\">0 ≤ ν ≤ 1</span> 时单调稳定，但耗散——波包会越跑越矮； Lax–Wendroff 二阶、几乎不耗散，却在 <span class=\"math\" data-tex=\"\\nu>1\">ν &gt; 1</span> 时指数爆炸； FTCS 无论如何都不稳定。这就是<strong>数值格式的性格</strong>：精度、稳定性、单调性不可兼得。":
      "<span class=\"method__key\">why it is worth playing with</span> Upwind is monotone and stable for <span class=\"math\" data-tex=\"0\\le\\nu\\le 1\">0 ≤ ν ≤ 1</span>, but dissipative — the wave packet keeps flattening as it travels; Lax–Wendroff is second order and nearly non-dissipative, yet blows up exponentially once <span class=\"math\" data-tex=\"\\nu>1\">ν &gt; 1</span>; FTCS is unstable no matter what. That is the <strong>temperament of a scheme</strong>: accuracy, stability and monotonicity never all at once.",
    "<span>§ 02</span> / Essays &amp; Perspectives <em>— 生动的那一半</em>":
      "<span>§ 02</span> / Essays &amp; Perspectives <em>— the living half</em>",
    "长文与个人见解":
      "Essays &amp; Personal Views",
    "算法之外，我也写跨界思考、技术杂谈与一些不成体系的哲学。 已发布的两篇在学术主页的 <a class=\"text-link\" href=\"https://www.zhaoqingxu.com/notes/\" target=\"_blank\" rel=\"noopener\">Musings · 漫谈&nbsp;↗</a>； 标着 <span class=\"essay__read\">draft</span> 的还在打磨——<em class=\"ser-i\">如果它值得被读，就值得被重写</em>。":
      "Beyond algorithms I also write cross-disciplinary notes, technical musings and some deliberately unsystematic philosophy. The two published pieces live under <a class=\"text-link\" href=\"https://www.zhaoqingxu.com/notes/\" target=\"_blank\" rel=\"noopener\">Musings · 漫谈&nbsp;↗</a> on my academic site; anything tagged <span class=\"essay__read\">draft</span> is still being worked over — <em class=\"ser-i\">if it deserves to be read, it deserves to be rewritten</em>.",
    "<a href=\"https://www.zhaoqingxu.com/notes/build-your-website-from-scratch/\" target=\"_blank\" rel=\"noopener\">Build Your Personal Website from Scratch<span class=\"sr-only\">（阅读全文）</span></a>":
      "<a href=\"https://www.zhaoqingxu.com/notes/build-your-website-from-scratch/\" target=\"_blank\" rel=\"noopener\">Build Your Personal Website from Scratch<span class=\"sr-only\">(read the full post)</span></a>",
    "从零搭一个属于自己的学术 / 个人网站：Hugo + AI 的完整步骤，<strong>不需要编程经验</strong>。 域名、部署、排版到踩过的坑，全都写在这一篇里。":
      "How to build your own academic / personal website from zero: the complete Hugo + AI workflow, <strong>no programming experience required</strong>. Domain, deployment, typography and every pitfall I hit — all in one post.",
    "#建站":
      "#site-building",
    "<a href=\"https://www.zhaoqingxu.com/notes/hello-world/\" target=\"_blank\" rel=\"noopener\">Hello, World — 写在网站上线时<span class=\"sr-only\">（阅读全文）</span></a>":
      "<a href=\"https://www.zhaoqingxu.com/notes/hello-world/\" target=\"_blank\" rel=\"noopener\">Hello, World — on launching this site<span class=\"sr-only\">(read the full post)</span></a>",
    "为什么要做这个站、这里打算长出什么、以及关于设计的一点碎碎念—— <strong>第一篇是写给未来的自己</strong>。":
      "Why I built this site, what I want to grow here, and a few notes on the design — <strong>the first post is addressed to my future self</strong>.",
    "#中文":
      "#Chinese",
    "<time datetime=\"2026-06-14\">2026.06.14</time> <span class=\"essay__read\">draft · 未发布</span> <span class=\"essay__lens\" data-lens-chip=\"\">life</span>":
      "<time datetime=\"2026-06-14\">2026.06.14</time> <span class=\"essay__read\">draft · unpublished</span> <span class=\"essay__lens\" data-lens-chip=\"\">life</span>",
    "<a href=\"#\" data-draft=\"\">界面即世界观<span class=\"sr-only\">（阅读全文）</span></a>":
      "<a href=\"#\" data-draft=\"\">The interface is a worldview<span class=\"sr-only\">(read the full post)</span></a>",
    "一个软件把什么放在首屏，就是它认为你该在乎什么。 推而广之：<strong>你的仪表盘、你的笔记结构、你的日程表，都是你悄悄写给自己的哲学宣言。</strong>":
      "Whatever a piece of software puts above the fold is what it believes you should care about. Generalise it: <strong>your dashboard, your note structure, your calendar — each is a philosophical manifesto you quietly wrote for yourself.</strong>",
    "<time datetime=\"2026-04-27\">2026.04.27</time> <span class=\"essay__read\">draft · 未发布</span> <span class=\"essay__lens\" data-lens-chip=\"\">research</span>":
      "<time datetime=\"2026-04-27\">2026.04.27</time> <span class=\"essay__read\">draft · unpublished</span> <span class=\"essay__lens\" data-lens-chip=\"\">research</span>",
    "<a href=\"#\" data-draft=\"\">为什么\"守恒\"比\"精确\"更重要<span class=\"sr-only\">（阅读全文）</span></a>":
      "<a href=\"#\" data-draft=\"\">Why conservation matters more than accuracy<span class=\"sr-only\">(read the full post)</span></a>",
    "一个局部截断误差更小、却慢慢漏能量的格式，跑一万个周期后会给你一条物理上根本不存在的轨道。 这是数值分析教给我的第一堂人生课：<strong>长期的结构正确，胜过短期的数值漂亮。</strong>":
      "A scheme with a smaller local truncation error that slowly leaks energy will hand you, after ten thousand periods, an orbit that simply does not exist in physics. That was the first life lesson numerical analysis taught me: <strong>long-term structural correctness beats short-term numerical prettiness.</strong>",
    "<time datetime=\"2025-12-09\">2025.12.09</time> <span class=\"essay__read\">draft · 未发布</span> <span class=\"essay__lens\" data-lens-chip=\"\">life</span>":
      "<time datetime=\"2025-12-09\">2025.12.09</time> <span class=\"essay__read\">draft · unpublished</span> <span class=\"essay__lens\" data-lens-chip=\"\">life</span>",
    "<a href=\"#\" data-draft=\"\">数字花园宣言：为什么我不再追求\"完成\"<span class=\"sr-only\">（阅读全文）</span></a>":
      "<a href=\"#\" data-draft=\"\">A digital-garden manifesto: why I stopped chasing \"finished\"<span class=\"sr-only\">(read the full post)</span></a>",
    "博客是出版物，花园是苗圃。允许自己种下永远长不大的种子， 反而让写作重新变成一件<strong>不需要辩护</strong>的事。":
      "A blog is a publication; a garden is a nursery. Allowing yourself to plant seeds that will never mature is what makes writing <strong>need no defence</strong> again.",
    "<span aria-hidden=\"true\">◌</span> 当前视角下没有文章。 <button class=\"btn btn--quiet btn--sm\" type=\"button\" data-lens-reset=\"\">切回 All</button>":
      "<span aria-hidden=\"true\">◌</span> No essays in this lens. <button class=\"btn btn--quiet btn--sm\" type=\"button\" data-lens-reset=\"\">Back to All</button>",
    "<span>§ 03</span> / Digital Garden &amp; Fragments <em>— 灵感切片</em>":
      "<span>§ 03</span> / Digital Garden &amp; Fragments <em>— slices of inspiration</em>",
    "碎片、便签与未完成的念头":
      "Fragments, sticky notes and unfinished thoughts",
    "不设限的日常记录：一两句摘录、书影音、羽毛球里的空气动力学、 半夜写的七言、以及只对我自己有用的想法。<em class=\"ser-i\">它们会继续生长。</em>":
      "Unfiltered day-to-day records: one- or two-line excerpts, books and films and music, the aerodynamics of badminton, seven-character verse written at midnight, and ideas useful to nobody but me. <em class=\"ser-i\">They will keep growing.</em>",
    "数值格式的优雅，不在于误差有多小，<br>而在于它<em class=\"ser-i\">记住了连续世界忘记的事</em>。":
      "The elegance of a scheme is not in how small its error is,<br>but in how it <em class=\"ser-i\">remembers what the continuous world forgot</em>.",
    "<span aria-hidden=\"true\">🏸</span> 运动动力学随想":
      "<span aria-hidden=\"true\">🏸</span> notes on sports dynamics",
    "羽毛球大概是唯一一项<strong>空气阻力主导一切</strong>的球类：杀球初速可超 300 km/h，落地时不到 30。它的方程我百看不厌——":
      "Badminton may be the only racket sport in which <strong>air drag runs everything</strong>: a smash can leave the strings above 300 km/h and arrive at under 30. I never tire of its equation —",
    "阻力与速度平方成正比、方向恒反向，于是球头总会自动翻向前方——一个不需要控制论的姿态稳定器。下次打球时我想用高速摄影量一下翻转时间常数。":
      "Drag grows with the square of speed and always points the other way, so the cork head flips itself forward — an attitude stabiliser that needs no control theory. Next time I play I want to measure that flipping time constant with a high-speed camera.",
    "<span aria-hidden=\"true\">📜</span> 七言 · 未完成":
      "<span aria-hidden=\"true\">📜</span> seven-character verse · unfinished",
    "格点千行藏日月":
      "A thousand rows of grid points hold the sun and the moon",
    "差分一步渡关山":
      "One differencing step crosses the passes",
    "能量不随长夜散":
      "Energy does not scatter through the long night",
    "灵感偏生乱码间":
      "Inspiration springs up among the garbled bytes",
    "<span class=\"stamp\">《夜算》</span><time datetime=\"2026-09-02\">09.02</time><span class=\"stage stage--seed\">seed</span>":
      "<span class=\"stamp\">\"Computing at Night\"</span><time datetime=\"2026-09-02\">09.02</time><span class=\"stage stage--seed\">seed</span>",
    "重读《Gödel, Escher, Bach》第三章：\"递归不是技巧，是宇宙讲笑话的方式。\"我在页边写了整整一页，然后合上书出去走了很久。":
      "Rereading chapter 3 of Gödel, Escher, Bach: \"Recursion is not a trick; it is how the universe tells jokes.\" I filled an entire margin page, then closed the book and went for a long walk.",
    "<span aria-hidden=\"true\">⌘</span> snippet · 八行辛积分器":
      "<span aria-hidden=\"true\">⌘</span> snippet · an eight-line symplectic integrator",
    "<code><span class=\"c-mute\"># leapfrog (kick–drift–kick)：辛的，能量不漂</span> <span class=\"c-key\">def</span> <span class=\"c-fn\">leapfrog</span>(q, p, dt, n, grad_V): <span class=\"c-key\">for</span> _ <span class=\"c-key\">in</span> range(n): p -= <span class=\"c-num\">0.5</span> * dt * grad_V(q) <span class=\"c-mute\"># 半步踢</span> q += dt * p <span class=\"c-mute\"># 整步漂</span> p -= <span class=\"c-num\">0.5</span> * dt * grad_V(q) <span class=\"c-mute\"># 半步踢</span> <span class=\"c-key\">return</span> q, p</code>":
      "<code><span class=\"c-mute\"># leapfrog (kick–drift–kick): symplectic, energy does not drift</span> <span class=\"c-key\">def</span> <span class=\"c-fn\">leapfrog</span>(q, p, dt, n, grad_V): <span class=\"c-key\">for</span> _ <span class=\"c-key\">in</span> range(n): p -= <span class=\"c-num\">0.5</span> * dt * grad_V(q) <span class=\"c-mute\"># half kick</span> q += dt * p <span class=\"c-mute\"># full drift</span> p -= <span class=\"c-num\">0.5</span> * dt * grad_V(q) <span class=\"c-mute\"># half kick</span> <span class=\"c-key\">return</span> q, p</code>",
    "重看《Blade Runner 2049》。结论：<strong>雾是一种叙事装置</strong>——它替导演决定观众此刻能知道多少。":
      "Rewatching Blade Runner 2049. Conclusion: <strong>fog is a narrative device</strong> — it decides, on the director's behalf, how much the audience is allowed to know at this moment.",
    "复杂系统最迷人的地方：<strong>局部最优的叠加，往往产生全局的荒谬。</strong>每次读组织架构都像在读一篇寓言——也和读一个坏格式的稳定性分析很像。":
      "The most fascinating thing about complex systems: <strong>stacking local optima tends to produce global absurdity.</strong> Reading an org chart always feels like reading a fable — and not unlike reading the stability analysis of a bad scheme.",
    "本周批了 43 份作业，第 7 题的错误高度集中在同一个符号上。学生不是不会——是被教材的记号误导了。下周我打算先把 <span class=\"math\" data-tex=\"\\partial u/\\partial t\">∂u/∂t</span> 和 <span class=\"math\" data-tex=\"\\mathrm{d}u/\\mathrm{d}t\">du/dt</span> 的区别画成两张图，再讲格式。":
      "I marked 43 assignments this week, and the errors on problem 7 clustered tightly around a single symbol. The students are not lost — the textbook notation misled them. Next week I will first draw two pictures showing the difference between <span class=\"math\" data-tex=\"\\partial u/\\partial t\">∂u/∂t</span> and <span class=\"math\" data-tex=\"\\mathrm{d}u/\\mathrm{d}t\">du/dt</span>, and only then talk about schemes.",
    "Instructor of Record · 教学相长":
      "Instructor of Record · teaching and learning feed each other",
    "深夜推公式的固定配乐：Glenn Gould 的《Goldberg Variations》1981 版。慢得离谱，却刚好跟得上思路——<strong>速度是理解的敌人，节奏才是朋友。</strong>":
      "The fixed soundtrack for late-night derivations: Glenn Gould's 1981 Goldberg Variations. Absurdly slow, yet exactly fast enough to keep up with my thinking — <strong>speed is the enemy of understanding; rhythm is its friend.</strong>",
    "能不能把 SAV 的思路搬到神经 ODE 的时间离散化上？让训练过程也严格耗散某个\"修正能量\"……先记下来，等这轮 deadline 过去再碰。":
      "Could the SAV idea be carried over to the time discretisation of neural ODEs, so that training itself strictly dissipates some \"modified energy\"? Noting it down here — I will touch it once this round of deadlines has passed.",
    "<span aria-hidden=\"true\">🎼</span> lyrics · 草稿":
      "<span aria-hidden=\"true\">🎼</span> lyrics · draft",
    "我们把连续的世界切成格子，<br>却忘了格子之间，也有风。<br>误差不是失败，是<em class=\"ser-i\">世界拒绝被完全描述</em>的方式。":
      "We slice the continuous world into cells,<br>and forget that between the cells there is wind too.<br>Error is not failure; it is the way the world <em class=\"ser-i\">refuses to be fully described</em>.",
    "《离散的风》· 副歌未定稿":
      "\"The Discrete Wind\" · chorus not final",
    "<span class=\"c-mute\">花园共 12 条可见切片，另有 40+ 条私有草稿在慢慢发酵。</span>":
      "<span class=\"c-mute\">The garden shows 12 fragments; another 40+ private drafts are slowly fermenting.</span>",
    "<span aria-hidden=\"true\">◌</span> 当前视角下没有切片。 <button class=\"btn btn--quiet btn--sm\" type=\"button\" data-lens-reset=\"\">切回 All</button>":
      "<span aria-hidden=\"true\">◌</span> No fragments in this lens. <button class=\"btn btn--quiet btn--sm\" type=\"button\" data-lens-reset=\"\">Back to All</button>",
    "<span>§ 04</span> / Side Projects &amp; Sandbox <em>— 数字实验室</em>":
      "<span>§ 04</span> / Side Projects &amp; Sandbox <em>— the digital workshop</em>",
    "实验性代码与开源小玩具":
      "Experimental code and small open toys",
    "不为 KPI 做的东西：数值玩具、AI 尝试、可视化工具与开源碎片。 它们大多不完美，但每一个都教会了我一件事。":
      "Things I do not build for a KPI: numerical toys, AI experiments, visual tools and open-source fragments. Most of them are imperfect, and every one of them taught me something.",
    "<span aria-hidden=\"true\">✓</span> 前四张卡片都是<strong>真实上线</strong>的东西，链接可直接点开； 标 <span class=\"pill pill--exp\"><i></i>Concept</span> 的还只是想法，尚未发布。":
      "<span aria-hidden=\"true\">✓</span> The first four cards are <strong>genuinely live</strong> — the links open. Anything tagged <span class=\"pill pill--exp\"><i></i>Concept</span> is still only an idea, not yet released.",
    "本页 §01.c 的实验台：约 200 行原生 JS + Canvas，实时积分一维对流方程，四种格式、可调 Δt，直接把 CFL 条件画给你看。":
      "The lab in §01.c of this page: roughly 200 lines of vanilla JS + Canvas integrating the 1-D advection equation in real time — four schemes, adjustable Δt, drawing the CFL condition right in front of you.",
    "我的学术主页：Hugo + 定制 PaperMod Ocean 主题，中英双语，含 Research / Teaching / Musings / CV。从选主题、配域名到部署，全过程写成了教程。":
      "My academic site: Hugo with a customised PaperMod Ocean theme, bilingual (English / 中文), covering Research / Teaching / Musings / CV. The whole process — theme, domain, deployment — is written up as a tutorial.",
    "<a class=\"btn btn--sm\" href=\"https://www.zhaoqingxu.com\" target=\"_blank\" rel=\"noopener\">Visit <span aria-hidden=\"true\">↗</span></a> <a class=\"btn btn--sm btn--outline\" href=\"https://www.zhaoqingxu.com/notes/build-your-website-from-scratch/\" target=\"_blank\" rel=\"noopener\">建站教程 <span aria-hidden=\"true\">↗</span></a>":
      "<a class=\"btn btn--sm\" href=\"https://www.zhaoqingxu.com\" target=\"_blank\" rel=\"noopener\">Visit <span aria-hidden=\"true\">↗</span></a> <a class=\"btn btn--sm btn--outline\" href=\"https://www.zhaoqingxu.com/notes/build-your-website-from-scratch/\" target=\"_blank\" rel=\"noopener\">Build tutorial <span aria-hidden=\"true\">↗</span></a>",
    "你正在看的这个页面：<strong>零依赖</strong>三件套（HTML/CSS/JS），手写 Canvas 数值实验台、KaTeX 公式（带 Unicode 兜底）、双视角过滤、命令面板与中英切换。0 构建步骤、0 追踪、0 cookie。":
      "The page you are reading: a <strong>zero-dependency</strong> trio (HTML/CSS/JS) with a hand-written Canvas numerical lab, KaTeX formulas (Unicode fallback included), dual-lens filtering, a command palette and a 中 / EN switch. No build step, no trackers, no cookies.",
    "设想中的小工具：把一堆 Markdown 碎片编译成数字花园——双链、成熟度、RSS 一条龙。上面那面便签墙目前还是手写的。":
      "A small tool I keep imagining: compile a pile of Markdown fragments into a digital garden — backlinks, maturity stages and RSS in one pass. The note wall above is still hand-written for now.",
    "想做的实验：用马尔可夫链喂唐诗宋词生成\"现代诗\"。这大概是我第一次认真对待随机性——也是数学与直觉的第一次和解。代码还没整理出来。":
      "An experiment I want to run: feed Tang and Song poetry into a Markov chain and generate \"modern verse\". Probably my first serious encounter with randomness — and the first truce between mathematics and intuition. The code is not tidied up yet.",
    "本站正在用的深色设计令牌：颜色、间距、字号、动效曲线全部写成 CSS 变量，并按 Research / Life 两种视角切换强调色场。":
      "The dark design tokens this site actually uses: colours, spacing, type scale and motion curves all expressed as CSS variables, with the accent colour field switching between the Research and Life lenses.",
    "<a class=\"text-link\" href=\"https://github.com/PearsonXu?tab=repositories\" target=\"_blank\" rel=\"noopener\"> 在 GitHub 查看全部仓库 <span aria-hidden=\"true\">↗</span> </a>":
      "<a class=\"text-link\" href=\"https://github.com/PearsonXu?tab=repositories\" target=\"_blank\" rel=\"noopener\"> See every repository on GitHub <span aria-hidden=\"true\">↗</span> </a>",
    "<span aria-hidden=\"true\">◌</span> 当前视角下没有项目。 <button class=\"btn btn--quiet btn--sm\" type=\"button\" data-lens-reset=\"\">切回 All</button>":
      "<span aria-hidden=\"true\">◌</span> No projects in this lens. <button class=\"btn btn--quiet btn--sm\" type=\"button\" data-lens-reset=\"\">Back to All</button>",
    "<span>§ 05</span> / Contact <em>— 一起聊点什么</em>":
      "<span>§ 05</span> / Contact <em>— let us talk about something</em>",
    "写信给我":
      "Write to me",
    "学术合作、报告邀请、对某个格式的异议，或者只是想聊聊羽毛球与空气动力学——都欢迎。 我最喜欢那种<em class=\"ser-i\">\"我读完了，但我不太同意\"</em>的邮件。":
      "Collaboration, an invitation to give a talk, a disagreement about some scheme, or just a chat about badminton and aerodynamics — all welcome. My favourite kind of email is <em class=\"ser-i\">\"I read it, and I am not so sure I agree.\"</em>",
    "<a class=\"contact__mail\" href=\"mailto:zhaoqing@email.sc.edu\"> <span class=\"contact__label\">email · UofSC</span> <span class=\"contact__addr\">zhaoqing@email.sc.edu</span> </a> <button class=\"btn btn--ghost\" type=\"button\" data-copy=\"zhaoqing@email.sc.edu\"> <span aria-hidden=\"true\">⧉</span> 复制地址 </button>":
      "<a class=\"contact__mail\" href=\"mailto:zhaoqing@email.sc.edu\"> <span class=\"contact__label\">email · UofSC</span> <span class=\"contact__addr\">zhaoqing@email.sc.edu</span> </a> <button class=\"btn btn--ghost\" type=\"button\" data-copy=\"zhaoqing@email.sc.edu\"> <span aria-hidden=\"true\">⧉</span> Copy address </button>",
    "<span>Department of Mathematics · University of South Carolina</span> <span>2002 Greene St, Columbia, SC 29205</span> <span><a class=\"text-link\" href=\"tel:+18034098998\">+1 (803) 409-8998</a></span> <span>备用邮箱 <a class=\"text-link\" href=\"mailto:806864070@qq.com\">806864070@qq.com</a></span>":
      "<span>Department of Mathematics · University of South Carolina</span> <span>2002 Greene St, Columbia, SC 29205</span> <span><a class=\"text-link\" href=\"tel:+18034098998\">+1 (803) 409-8998</a></span> <span>Secondary email <a class=\"text-link\" href=\"mailto:806864070@qq.com\">806864070@qq.com</a></span>",
    "<a class=\"matrix__link\" href=\"https://www.zhaoqingxu.com/research/\" target=\"_blank\" rel=\"noopener\"> <span class=\"matrix__key\">Research</span> <span class=\"matrix__val\">论文 · 手稿 · 报告</span> <span class=\"matrix__arrow\" aria-hidden=\"true\">↗</span> </a>":
      "<a class=\"matrix__link\" href=\"https://www.zhaoqingxu.com/research/\" target=\"_blank\" rel=\"noopener\"> <span class=\"matrix__key\">Research</span> <span class=\"matrix__val\">papers · manuscripts · talks</span> <span class=\"matrix__arrow\" aria-hidden=\"true\">↗</span> </a>",
    "<a class=\"matrix__link\" href=\"https://www.zhaoqingxu.com/notes/\" target=\"_blank\" rel=\"noopener\"> <span class=\"matrix__key\">Musings · 漫谈</span> <span class=\"matrix__val\">英文与中文随笔</span> <span class=\"matrix__arrow\" aria-hidden=\"true\">↗</span> </a>":
      "<a class=\"matrix__link\" href=\"https://www.zhaoqingxu.com/notes/\" target=\"_blank\" rel=\"noopener\"> <span class=\"matrix__key\">Musings · 漫谈</span> <span class=\"matrix__val\">essays in English and Chinese</span> <span class=\"matrix__arrow\" aria-hidden=\"true\">↗</span> </a>",
    "<span class=\"math\" data-tex=\"\\oint_{\\partial\\Omega}\\mathbf{F}\\cdot\\mathrm{d}\\mathbf{s}=\\iint_{\\Omega}\\left(\\nabla\\times\\mathbf{F}\\right)\\mathrm{d}A\">∮∂Ω F·ds = ∬Ω (∇×F) dA</span> <span class=\"foot__sig-cap\">— 签名：Stokes</span>":
      "<span class=\"math\" data-tex=\"\\oint_{\\partial\\Omega}\\mathbf{F}\\cdot\\mathrm{d}\\mathbf{s}=\\iint_{\\Omega}\\left(\\nabla\\times\\mathbf{F}\\right)\\mathrm{d}A\">∮∂Ω F·ds = ∬Ω (∇×F) dA</span> <span class=\"foot__sig-cap\">— signed, Stokes</span>",
    "<a href=\"https://www.zhaoqingxu.com/notes/\" target=\"_blank\" rel=\"noopener\">Musings · 漫谈 ↗</a>":
      "<a href=\"https://www.zhaoqingxu.com/notes/\" target=\"_blank\" rel=\"noopener\">Musings ↗</a>",
    "<kbd>⌘</kbd><kbd>K</kbd> 命令面板 · <kbd>M</kbd> 切换视角 · <kbd>↑</kbd> 顶部":
      "<kbd>⌘</kbd><kbd>K</kbd> palette · <kbd>M</kbd> lens · <kbd>L</kbd> language · <kbd>↑</kbd> top",
    "命令面板":
      "Command palette",
    "<span><kbd>↑</kbd><kbd>↓</kbd> 选择</span> <span><kbd>↵</kbd> 执行</span> <span class=\"palette__hint\">试试 <code>research</code> / <code>life</code> / <code>lab</code> / <code>mail</code></span>":
      "<span><kbd>↑</kbd><kbd>↓</kbd> select</span> <span><kbd>↵</kbd> run</span> <span class=\"palette__hint\">try <code>research</code> / <code>life</code> / <code>lab</code> / <code>mail</code> / <code>cv</code></span>"
  }
};
