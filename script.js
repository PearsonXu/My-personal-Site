/* ═══════════════════════════════════════════════════════════════
   Zhaoqing Xu · Computation × Intuition — script.js
   原生 JS，无依赖。模块：
     工具 / Toast / 终端状态 / 指针光晕 / 滚动揭示 / 视角过滤(Mode)
     / KaTeX 渲染 / CFL 数值实验台 / 命令面板 / 快捷键
   所有功能均为渐进增强：JS 缺席时页面内容完整可读。
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 工具 ───────────────────────────────────────────────── */
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };
  var clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };

  /* matchMedia 在部分环境（旧 jsdom / 受限 webview）可能缺失或抛错 */
  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function isCoarsePointer() {
    try {
      return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (e) { return false; }
  }
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } }
  };
  /* rAF 节流 */
  function rafThrottle(fn) {
    var queued = false, lastArgs = null;
    return function () {
      lastArgs = arguments;
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () {
        queued = false;
        fn.apply(null, lastArgs);
      });
    };
  }

  /* ── Toast ──────────────────────────────────────────────── */
  var toastBox = $('#toasts');
  function toast(msg, kind, ttl) {
    if (!toastBox) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    var dot = document.createElement('i');
    dot.setAttribute('aria-hidden', 'true');
    var span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(dot); el.appendChild(span);
    toastBox.appendChild(el);
    var life = ttl || 2600;
    window.setTimeout(function () {
      el.classList.add('is-leaving');
      window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, life);
    /* 最多同时 3 条 */
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
  }

  /* ── 占位链接拦截：href="#" + data-draft ────────────────── */
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[data-draft], a[href="#"]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (href && href !== '#') return;      /* 真实锚点放行 */
    ev.preventDefault();
    var label = (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    toast((label ? '「' + label + '」' : '该条目') + ' 的链接待补充', 'warn');
  });

  /* ── 复制到剪贴板 ───────────────────────────────────────── */
  function copyText(text) {
    var done = function () { toast('已复制：' + text, 'ok'); };
    var fail = function () { toast('复制失败，请手动选择', 'bad'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { legacyCopy(text) ? done() : fail(); });
    } else {
      legacyCopy(text) ? done() : fail();
    }
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-copy]') : null;
    if (!btn) return;
    ev.preventDefault();
    copyText(btn.getAttribute('data-copy'));
  });

  /* ── 年份 ───────────────────────────────────────────────── */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ── 终端：本地时钟 ─────────────────────────────────────── */
  var clockEl = $('#clock');
  function tickClock() {
    if (!clockEl) return;
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : String(n); };
    clockEl.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  if (clockEl) { tickClock(); window.setInterval(tickClock, 1000); }
  /* ── 终端：Focus 打字机轮播 ─────────────────────────────── */
  var FOCUS = [
    'Structure-Preserving Algorithms',
    'Numerical Analysis of PDEs',
    'Scientific Computing & CFD',
    'Energy-Stable Schemes (SAV / IEQ)',
    'Teaching Calculus @ UofSC',
    'Writing & Uncharted Ideas'
  ];
  var STATUSES = ['status: solving', 'status: deriving', 'status: teaching', 'status: writing', 'status: coffee → code'];
  var focusEl = $('#focusText'), statusEl = $('#statusText'), statusDot = $('#statusDot');
  var focusIdx = 0;

  function typeFocus(text, cb) {
    if (!focusEl) return;
    if (prefersReducedMotion()) { focusEl.textContent = text; if (cb) cb(); return; }
    focusEl.textContent = '';
    var i = 0;
    var step = function () {
      if (i <= text.length) {
        focusEl.textContent = text.slice(0, i);
        i++;
        window.setTimeout(step, 26 + Math.random() * 34);
      } else if (cb) { cb(); }
    };
    step();
  }
  function eraseFocus(cb) {
    if (!focusEl) return;
    if (prefersReducedMotion()) { if (cb) cb(); return; }
    var cur = focusEl.textContent || '';
    var step = function () {
      if (cur.length > 0) {
        cur = cur.slice(0, -1);
        focusEl.textContent = cur;
        window.setTimeout(step, 12);
      } else if (cb) { cb(); }
    };
    step();
  }
  function focusLoop() {
    typeFocus(FOCUS[focusIdx % FOCUS.length], function () {
      window.setTimeout(function () {
        eraseFocus(function () { focusIdx++; focusLoop(); });
      }, 2800);
    });
  }
  if (focusEl) focusLoop();

  var statusIdx = 0;
  if (statusEl) {
    window.setInterval(function () {
      statusIdx = (statusIdx + 1) % STATUSES.length;
      statusEl.textContent = STATUSES[statusIdx];
      if (statusDot) {
        statusDot.parentNode.parentNode.classList.toggle('is-warn', statusIdx === 4);
      }
    }, 6200);
  }

  /* ── 标题解码动画（数学字形扰动） ───────────────────────── */
  var GLYPHS = '∂∇∫∮ΣΠλπΔΩζθφψξ≈≠≤≥⊗⊕√∞';
  function scramble(el) {
    var target = el.getAttribute('data-scramble') || el.textContent || '';
    if (!target) return;
    if (prefersReducedMotion()) { el.textContent = target; return; }
    var frame = 0, total = 26;
    var timer = window.setInterval(function () {
      frame++;
      var progress = frame / total;
      var out = '';
      for (var i = 0; i < target.length; i++) {
        var ch = target.charAt(i);
        if (ch === ' ') { out += ' '; continue; }
        if (i / target.length < progress) { out += ch; }
        else { out += GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)); }
      }
      el.textContent = out;
      if (frame >= total) { window.clearInterval(timer); el.textContent = target; }
    }, 34);
  }
  var scramblers = $$('[data-scramble]');
  if (scramblers.length) {
    window.setTimeout(function () {
      scramblers.forEach(function (el, i) { window.setTimeout(function () { scramble(el); }, i * 220); });
    }, 320);
  }

  /* ── 指针光晕（数学场追踪） ─────────────────────────────── */
  var spot = $('#spotlight');
  if (spot && !isCoarsePointer() && !prefersReducedMotion()) {
    var updateSpot = rafThrottle(function (x, y) {
      spot.style.setProperty('--mx', x + 'px');
      spot.style.setProperty('--my', y + 'px');
    });
    window.addEventListener('pointermove', function (ev) {
      if (!spot.classList.contains('is-on')) spot.classList.add('is-on');
      updateSpot(ev.clientX, ev.clientY);
    }, { passive: true });
    window.addEventListener('pointerleave', function () { spot.classList.remove('is-on'); });
  }

  /* ── 滚动揭示 ───────────────────────────────────────────── */
  var revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !prefersReducedMotion()) {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var sibs = el.parentNode ? $$('[data-reveal]', el.parentNode) : [el];
        var idx = Math.max(0, sibs.indexOf(el));
        el.style.transitionDelay = Math.min(idx * 55, 330) + 'ms';
        el.classList.add('is-in');
        revealIO.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    revealEls.forEach(function (el) { revealIO.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ── 指标滚动计数 ───────────────────────────────────────── */
  var counters = $$('[data-count-to]');
  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count-to')) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    if (prefersReducedMotion()) { el.textContent = target + suffix; return; }
    var t0 = null, dur = 1100;
    function frame(ts) {
      if (!t0) t0 = ts;
      var p = clamp((ts - t0) / dur, 0, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) window.requestAnimationFrame(frame);
    }
    el.textContent = '0' + suffix;
    window.requestAnimationFrame(frame);
  }
  if (counters.length) {
    if ('IntersectionObserver' in window) {
      var cIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { runCount(en.target); cIO.unobserve(en.target); }
        });
      }, { threshold: 0.4 });
      counters.forEach(function (el) { cIO.observe(el); });
    } else { counters.forEach(runCount); }
  }
  /* ── 滚动：进度条 / 吸顶 / 回顶 / 导航高亮 ───────────────── */
  var bar = $('#progressBar'), header = $('#siteHeader'), toTop = $('#toTop');
  var navLinks = $$('.nav__link');
  var spySections = $$('main section[id]');
  var NAV_OF = { research:'research', methods:'research', lab:'research', thoughts:'thoughts', garden:'garden', sandbox:'sandbox', contact:'contact' };

  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var docH = (document.documentElement.scrollHeight || 0) - window.innerHeight;
    if (bar) bar.style.width = (docH > 0 ? clamp(y / docH, 0, 1) * 100 : 0) + '%';
    if (header) header.classList.toggle('is-stuck', y > 12);
    if (toTop) toTop.classList.toggle('is-on', y > 520);

    /* scrollspy：阅读线（视口 32% 处）之上最近的章节 */
    var line = y + window.innerHeight * 0.32, activeId = null;
    for (var i = 0; i < spySections.length; i++) {
      var sec = spySections[i];
      if (sec.classList.contains('is-gone')) continue;
      if (sec.offsetTop <= line) activeId = sec.id;
    }
    var activeNav = activeId ? NAV_OF[activeId] : null;
    navLinks.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      a.classList.toggle('is-active', !!activeNav && href === '#' + activeNav);
    });
  }
  var scrollHandler = rafThrottle(onScroll);
  window.addEventListener('scroll', scrollHandler, { passive: true });
  window.addEventListener('resize', scrollHandler);
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
  }

  /* ── 移动端导航抽屉 ─────────────────────────────────────── */
  var navEl = $('#primaryNav'), navToggle = $('#navToggle');
  function closeNav() {
    if (!navEl || !navToggle) return;
    navEl.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
  if (navEl && navToggle) {
    navToggle.addEventListener('click', function () {
      var open = navEl.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    navEl.addEventListener('click', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('a')) closeNav();
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 900) closeNav(); });
  }
  /* ── Mode：双重视角过滤引擎 ─────────────────────────────── */
  var LENSES = ['all', 'research', 'life'];
  var LENS_LABEL = { all:'All', research:'Research & Math', life:'Thoughts & Life' };
  var modeBox = $('#modeSwitch'), thumb = $('#modeThumb');
  var modeBtns = modeBox ? $$('.mode__btn', modeBox) : [];
  var lensSections = $$('main [data-lens-section]');
  var HIDE_MS = prefersReducedMotion() ? 0 : 300;
  var currentLens = 'all';

  function moveThumb() {
    if (!thumb || !modeBox) return;
    var btn = $('.mode__btn.is-on', modeBox);
    if (!btn) return;
    thumb.style.width = btn.offsetWidth + 'px';
    thumb.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
  }

  function showEl(el) {
    if (!el.classList.contains('is-gone') && !el.classList.contains('is-out')) return;
    el.classList.remove('is-gone');
    void el.offsetWidth;                 /* 强制回流，让过渡从收起状态起算 */
    el.classList.remove('is-out');
    if (el.hasAttribute('data-reveal')) el.classList.add('is-in');
  }
  function hideEl(el) {
    if (el.classList.contains('is-gone')) return;
    el.classList.add('is-out');
    window.setTimeout(function () {
      if (el.classList.contains('is-out')) el.classList.add('is-gone');
    }, HIDE_MS);
  }
  function cardMatches(card, lens) {
    var own = card.getAttribute('data-lens');
    return lens === 'all' || own === lens || own === 'both';
  }
  /* 每次切换时重新查询：动态插入的卡片同样受视角控制 */
  function filterCards() { return $$('main [data-lens]'); }
  function refreshEmptyStates() {
    $$('main section').forEach(function (sec) {
      var empty = $('[data-empty]', sec);
      if (!empty) return;
      var visible = $$('[data-lens]', sec).filter(function (c) {
        return !c.classList.contains('is-gone');
      });
      empty.hidden = visible.length > 0;
    });
  }
  /* 导航淡出：依据视角推导（而非等待 .is-gone 落地），避免时序错位 */
  function updateNavDimming(lens) {
    navLinks.forEach(function (a) {
      var id = (a.getAttribute('href') || '').slice(1);
      var hidden = lens !== 'all' && lensSections.some(function (s) {
        return s.id === id && s.getAttribute('data-lens-section') !== lens;
      });
      a.classList.toggle('is-empty', hidden);
      if (hidden) a.setAttribute('title', '该视角下已隐藏 · 切回 All 可见');
      else a.removeAttribute('title');
    });
  }

  function setLens(lens, opts) {
    if (LENSES.indexOf(lens) < 0) lens = 'all';
    opts = opts || {};
    var changed = lens !== currentLens;
    currentLens = lens;

    document.documentElement.setAttribute('data-lens', lens);
    modeBtns.forEach(function (b) {
      var on = b.getAttribute('data-lens') === lens;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    moveThumb();

    filterCards().forEach(function (card) {
      if (cardMatches(card, lens)) showEl(card); else hideEl(card);
    });
    lensSections.forEach(function (sec) {
      var want = sec.getAttribute('data-lens-section');
      if (lens === 'all' || lens === want) showEl(sec); else hideEl(sec);
    });
    updateNavDimming(lens);

    refreshEmptyStates();
    window.setTimeout(function () { refreshEmptyStates(); updateNavDimming(currentLens); }, HIDE_MS + 30);
    onScroll();

    store.set('zx-lens', lens);
    try {
      var h = window.location.hash;
      if (!h || /^#lens=/.test(h)) window.history.replaceState(null, '', '#lens=' + lens);
    } catch (e) { /* file:// 等受限环境忽略 */ }

    if (window.__lab && window.__lab.repaint) window.__lab.repaint();
    if (changed && !opts.silent) {
      toast('视角 → ' + LENS_LABEL[lens], lens === 'life' ? 'warn' : 'ok', 1800);
    }
    return lens;
  }
  function getLens() { return currentLens; }

  modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setLens(btn.getAttribute('data-lens'));
      btn.focus();
    });
  });
  if (modeBox) {
    modeBox.addEventListener('keydown', function (ev) {
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].indexOf(ev.key) < 0) return;
      ev.preventDefault();
      var idx = modeBtns.indexOf(document.activeElement);
      if (idx < 0) {
        idx = 0;
        for (var i = 0; i < modeBtns.length; i++) { if (modeBtns[i].classList.contains('is-on')) idx = i; }
      }
      var next = idx;
      if (ev.key === 'Home') next = 0;
      else if (ev.key === 'End') next = modeBtns.length - 1;
      else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (idx + 1) % modeBtns.length;
      else next = (idx - 1 + modeBtns.length) % modeBtns.length;
      var btn = modeBtns[next];
      if (!btn) return;
      setLens(btn.getAttribute('data-lens'));
      btn.focus();
    });
  }
  $$('[data-lens-reset]').forEach(function (b) {
    b.addEventListener('click', function () { setLens('all'); });
  });

  /* 初始视角：hash > localStorage > all */
  (function initLens() {
    var lens = 'all';
    try {
      var m = window.location.hash.match(/lens=(all|research|life)/);
      if (m) lens = m[1];
      else {
        var saved = store.get('zx-lens');
        if (saved && LENSES.indexOf(saved) >= 0) lens = saved;
      }
    } catch (e) { /* 忽略 */ }
    setLens(lens, { silent: true });
  })();
  /* 字体加载完成后按钮宽度会变 → 重算滑块 */
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(function () { moveThumb(); }).catch(function () {});
  }
  window.addEventListener('resize', rafThrottle(moveThumb));
  window.setTimeout(moveThumb, 320);
  /* ── KaTeX 公式渲染（失败则保留 Unicode 兜底） ──────────── */
  function renderMath() {
    var nodes = $$('[data-tex]');
    if (!nodes.length) return 0;
    if (!window.katex) return -1;
    var n = 0;
    nodes.forEach(function (el) {
      if (el.getAttribute('data-tex-done')) return;
      var tex = el.getAttribute('data-tex') || '';
      var fallback = el.textContent;
      try {
        window.katex.render(tex, el, {
          displayMode: el.classList.contains('math--block'),
          throwOnError: false, strict: false, output: 'html'
        });
        el.setAttribute('data-tex-done', '1');
        el.setAttribute('aria-label', tex);
        n++;
      } catch (err) {
        el.textContent = fallback;   /* 恢复可读兜底 */
      }
    });
    if (n) document.documentElement.classList.add('katex-on');
    return n;
  }
  var mathTries = 0;
  (function tryRenderMath() {
    var r = renderMath();
    if (r >= 0) return;
    if (++mathTries > 12) {
      if (window.console && console.info) console.info('[zx] KaTeX 未加载，公式显示为 Unicode 兜底文本');
      return;
    }
    window.setTimeout(tryRenderMath, 500);
  })();

  /* ── CFL 稳定性实验台：一维对流方程的实时求解 ───────────── */
  /*    ∂u/∂t + a ∂u/∂x = 0，周期边界，四种显式格式            */

  /* 差分格式内核（与渲染解耦：单点更新 u_new[j] = f(u, j, ν)） */
  function schemeUpdate(scheme, u, N, j, nu) {
    var jm = (j - 1 + N) % N, jp = (j + 1) % N;
    if (scheme === 'upwind') return u[j] - nu * (u[j] - u[jm]);                  /* 一阶迎风 */
    if (scheme === 'lf')     return 0.5 * (u[jp] + u[jm]) - 0.5 * nu * (u[jp] - u[jm]);   /* Lax–Friedrichs */
    if (scheme === 'lw')     return u[j] - 0.5 * nu * (u[jp] - u[jm])
                             + 0.5 * nu * nu * (u[jp] - 2 * u[j] + u[jm]);        /* Lax–Wendroff */
    return u[j] - 0.5 * nu * (u[jp] - u[jm]);                                     /* FTCS（不稳定） */
  }
  window.__scheme = schemeUpdate;   /* 便于控制台复核与自动化测试 */

  function initLab() {
    var canvas = $('#labCanvas');
    if (!canvas || !canvas.getContext) return null;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var N = 240;                 /* 网格数 */
    var L = 1;                   /* 域长 */
    var dx = L / N;
    var ADV = 1;                 /* 波速 a */
    var u = new Float64Array(N), w = new Float64Array(N);
    var dt = 0.0025, scheme = 'upwind', steps = 0, t = 0;
    var running = false, blown = false, visible = false, autoStarted = false, rafId = null;

    var el = {
      dt: $('#labDt'), dtVal: $('#labDtVal'), sel: $('#labScheme'), name: $('#labSchemeName'),
      cfl: $('#labCfl'), norm: $('#labNorm'), steps: $('#labSteps'),
      badge: $('#labBadge'), hint: $('#labHint'),
      play: $('#labPlay'), step: $('#labStep'), reset: $('#labReset')
    };

    var HINT = {
      upwind: 'Upwind：一阶、单调、ν ≤ 1 时稳定——但耗散，波包会变矮、方波棱角会变圆。',
      lf: 'Lax–Friedrichs：稳定但耗散更强；有趣的是 ν = 1 时它反而精确。',
      lw: 'Lax–Wendroff：二阶、几乎不耗散；一旦 ν > 1 就以指数速度炸开。',
      ftcs: 'FTCS：中心差分 + 显式时间，对纯对流无条件不稳定——把 Δt 调到最小也一样。'
    };

    /* 初值：高斯波包 + 方波（同时暴露耗散与色散） */
    function ic(x) {
      var s = (x - Math.floor(x / L) * L + L) % L;
      var g = Math.exp(-Math.pow((s - 0.22) / 0.045, 2));
      var box = (s > 0.56 && s < 0.72) ? 0.62 : 0;
      return g + box;
    }
    function nu() { return ADV * dt / dx; }
    function maxAbs() {
      var m = 0;
      for (var j = 0; j < N; j++) {
        var av = Math.abs(u[j]);
        if (!isFinite(av)) return Infinity;
        if (av > m) m = av;
      }
      return m;
    }

    function updateReadout() {
      var v = nu(), mx = maxAbs();
      if (el.cfl) el.cfl.textContent = v.toFixed(2);
      if (el.dtVal) el.dtVal.textContent = dt.toFixed(4);
      if (el.steps) el.steps.textContent = String(steps);
      if (el.name) el.name.textContent = scheme;
      if (el.norm) {
        el.norm.textContent = !isFinite(mx) ? '∞' : (mx > 99 ? mx.toExponential(1) : mx.toFixed(3));
      }
      var state = 'stable', label = 'stable', hint = HINT[scheme] || '';
      if (blown) { state = 'blow'; label = 'blow-up'; hint = '数值解已发散：显式格式的稳定性边界不可谈判。点 Reset 重来。'; }
      else if (v > 1) { state = 'warn'; label = 'unstable'; hint = 'CFL 被破坏（|ν| > 1）：扰动每步被放大，发散只是时间问题。'; }
      else if (v > 0.86) { state = 'warn'; label = 'critical'; hint = '接近 CFL 极限：留意色散与耗散误差的形状变化。'; }
      if (el.badge) {
        el.badge.classList.toggle('is-warn', state === 'warn');
        el.badge.classList.toggle('is-blow', state === 'blow');
        var sp = el.badge.querySelector('span:last-child');
        if (sp) sp.textContent = label;
      }
      if (el.hint) el.hint.textContent = hint;
    }
    /* 单步推进 */
    function stepOnce() {
      var v = nu(), j;
      for (j = 0; j < N; j++) w[j] = schemeUpdate(scheme, u, N, j, v);
      var tmp = u; u = w; w = tmp;
      steps++; t += dt;
      var mx = maxAbs();
      if (!isFinite(mx) || mx > 4) { blown = true; setRunning(false); }
      updateReadout();
    }

    /* ── 绘制 ── */
    var wCache = 0, dprCache = 0;
    function cssVar(name) {
      try { return (window.getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim(); }
      catch (e) { return ''; }
    }
    function withAlpha(hex, a) {
      var h = (hex || '').replace('#', '').trim();
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      if (!/^[0-9a-fA-F]{6}$/.test(h)) return 'rgba(89,211,255,' + a + ')';
      var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    function sizeCanvas() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cssW = canvas.clientWidth || 900;
      var cssH = Math.max(170, Math.round(cssW * 260 / 900));
      if (cssW !== wCache || dpr !== dprCache) {
        wCache = cssW; dprCache = dpr;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { w: cssW, h: cssH };
    }
    function draw() {
      var d = sizeCanvas(), W = d.w, H = d.h;
      var padL = 38, padR = 12, padT = 14, padB = 20;
      var acc = cssVar('--acc') || '#59d3ff';
      var acc2 = cssVar('--acc-2') || '#ffb27a';
      var mute = cssVar('--mute') || '#6e7b8b';
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var mx = maxAbs();
      var M = isFinite(mx) ? Math.min(Math.max(1.15, mx * 1.12), 12) : 12;
      var X = function (x) { return padL + (x / L) * plotW; };
      var Y = function (val) { return padT + plotH / 2 - clamp(val, -M, M) / M * (plotH / 2); };

      ctx.clearRect(0, 0, W, H);
      /* 竖网格 */
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
      for (var gx = 0; gx <= 10; gx++) {
        ctx.beginPath(); ctx.moveTo(X(gx / 10), padT); ctx.lineTo(X(gx / 10), padT + plotH); ctx.stroke();
      }
      /* 零轴 */
      ctx.strokeStyle = 'rgba(255,255,255,.16)';
      ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke();
      /* 刻度 */
      ctx.fillStyle = mute; ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('+' + M.toFixed(1), padL - 6, Y(M));
      ctx.fillText('0', padL - 6, Y(0));
      ctx.fillText('−' + M.toFixed(1), padL - 6, Y(-M));
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('x=0', padL, padT + plotH + 4);
      ctx.textAlign = 'right';
      ctx.fillText('x=1', W - padR, padT + plotH + 4);

      /* 解析解 u(x,t)=u0(x−at)（虚线） */
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = withAlpha(acc2, .6);
      ctx.beginPath();
      for (var k = 0; k <= N; k++) {
        var x = k * dx, ex = ic(x - ADV * t);
        if (k === 0) ctx.moveTo(X(x), Y(ex)); else ctx.lineTo(X(x), Y(ex));
      }
      ctx.stroke();
      ctx.setLineDash([]);

      /* 数值解 */
      ctx.lineWidth = 2; ctx.strokeStyle = blown ? '#ff7a85' : acc;
      ctx.shadowColor = withAlpha(blown ? '#ff7a85' : acc, blown ? .8 : .5);
      ctx.shadowBlur = blown ? 18 : 9;
      ctx.beginPath();
      for (var j = 0; j < N; j++) {
        var px = X(j * dx), py = Y(u[j]);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      /* 图例 */
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = blown ? '#ff7a85' : acc;
      ctx.fillText('— numerical (' + scheme + ')', padL + 6, padT + 10);
      ctx.fillStyle = withAlpha(acc2, .8);
      ctx.fillText('-- exact', padL + 6, padT + 24);
    }

    /* ── 动画循环：仅在可见且运行时消耗 CPU ── */
    function loop() {
      if (!running || !visible || blown) { rafId = null; return; }
      var n = clamp(Math.round(0.012 / dt), 1, 40);
      for (var i = 0; i < n && !blown; i++) stepOnce();
      draw();
      rafId = window.requestAnimationFrame(loop);
    }
    function setRunning(on) {
      running = !!on && !blown;
      if (el.play) {
        el.play.innerHTML = running ? '<span aria-hidden="true">❚❚</span> Pause' : '<span aria-hidden="true">▶</span> Run';
        el.play.setAttribute('aria-pressed', running ? 'true' : 'false');
      }
      if (running && !rafId) rafId = window.requestAnimationFrame(loop);
      if (!running && rafId) { window.cancelAnimationFrame(rafId); rafId = null; }
    }
    function reset() {
      for (var j = 0; j < N; j++) u[j] = ic(j * dx);
      steps = 0; t = 0; blown = false;
      setRunning(false);
      updateReadout();
      draw();
    }
    /* ── 控件绑定 ── */
    if (el.dt) {
      el.dt.addEventListener('input', function () {
        dt = clamp(parseFloat(el.dt.value) || 0.0025, 0.0005, 0.02);
        updateReadout();
        if (!running) draw();
      });
    }
    if (el.sel) {
      el.sel.addEventListener('change', function () {
        scheme = el.sel.value || 'upwind';
        reset();
        toast('格式 → ' + scheme.toUpperCase(), 'ok', 1600);
      });
    }
    if (el.play) {
      el.play.addEventListener('click', function () {
        if (blown) reset();
        setRunning(!running);
      });
    }
    if (el.step) {
      el.step.addEventListener('click', function () {
        if (blown) reset();
        setRunning(false);
        stepOnce(); draw();
      });
    }
    if (el.reset) el.reset.addEventListener('click', function () { reset(); });

    /* 离开视口自动暂停，回到视口恢复；首次可见时自动演示 */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        visible = !!(entries[0] && entries[0].isIntersecting);
        if (visible) {
          if (!autoStarted) {
            autoStarted = true;
            if (!prefersReducedMotion()) setRunning(true);
          } else if (running && !rafId) {
            rafId = window.requestAnimationFrame(loop);
          }
        } else if (rafId) { window.cancelAnimationFrame(rafId); rafId = null; }
      }, { threshold: 0.08 });
      io.observe(canvas);
    } else { visible = true; }

    window.addEventListener('resize', rafThrottle(function () { wCache = 0; draw(); }));

    /* 初始状态与 HTML 控件保持一致 */
    if (el.dt) dt = clamp(parseFloat(el.dt.value) || 0.0025, 0.0005, 0.02);
    if (el.sel) scheme = el.sel.value || 'upwind';
    reset();

    return {
      repaint: draw,
      reset: reset,
      start: function () { setRunning(true); },
      stop: function () { setRunning(false); },
      toggle: function () { if (blown) reset(); setRunning(!running); },
      state: function () { return { steps: steps, cfl: nu(), blown: blown, scheme: scheme, running: running, maxAbs: maxAbs() }; }
    };
  }
  window.__lab = initLab();

  /* ── 命令面板 ⌘K ────────────────────────────────────────── */
  var palette = $('#palette'), pInput = $('#paletteInput'), pList = $('#paletteList');
  var pItems = [], pSel = 0, lastFocus = null;

  function goTo(sel) {
    var t = $(sel);
    if (!t) { toast('目标不存在（可能已被当前视角隐藏）', 'warn'); return; }
    if (t.classList.contains('is-gone')) setLens('all');
    window.setTimeout(function () {
      t.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }, 60);
  }
  var CMDS = [
    { g:'视角 Mode', ico:'◉', label:'All — 全部内容', kw:'all mode 全部 所有', run:function () { setLens('all'); } },
    { g:'视角 Mode', ico:'∂', label:'Research & Math — 只看研究与数学', kw:'research math 研究 数学 学术', run:function () { setLens('research'); } },
    { g:'视角 Mode', ico:'✦', label:'Thoughts & Life — 只看思考与生活', kw:'life thoughts 生活 随笔 灵感', run:function () { setLens('life'); } },
    { g:'跳转 Go to', ico:'01', label:'Research — 学术空间', kw:'research papers 论文 学术', run:function () { goTo('#research'); } },
    { g:'跳转 Go to', ico:'∑', label:'Math & Method — 离散化思想', kw:'math method katex 公式 方法', run:function () { goTo('#methods'); } },
    { g:'跳转 Go to', ico:'▶', label:'CFL Lab — 稳定性实验台', kw:'lab cfl 实验 数值 demo', run:function () { goTo('#lab'); } },
    { g:'跳转 Go to', ico:'02', label:'Essays — 长文与见解', kw:'essay thoughts writing 文章 随笔', run:function () { goTo('#thoughts'); } },
    { g:'跳转 Go to', ico:'03', label:'Digital Garden — 灵感切片', kw:'garden notes fragments 花园 便签 诗', run:function () { goTo('#garden'); } },
    { g:'跳转 Go to', ico:'04', label:'Sandbox — 项目与实验', kw:'project sandbox code 项目 代码', run:function () { goTo('#sandbox'); } },
    { g:'跳转 Go to', ico:'05', label:'Contact — 联系方式', kw:'contact email mail 联系 邮箱', run:function () { goTo('#contact'); } },
    { g:'动作 Action', ico:'⧉', label:'复制邮箱 806864070@qq.com', kw:'copy mail email 邮箱 复制', run:function () { copyText('806864070@qq.com'); } },
    { g:'动作 Action', ico:'↗', label:'打开学术主页 www.zhaoqingxu.com', kw:'academic homepage scholar 主页', run:function () { window.open('https://www.zhaoqingxu.com', '_blank', 'noopener'); } },
    { g:'动作 Action', ico:'↗', label:'打开 GitHub @PearsonXu', kw:'github repo 仓库', run:function () { window.open('https://github.com/PearsonXu', '_blank', 'noopener'); } },
    { g:'动作 Action', ico:'✉', label:'写一封邮件给我', kw:'mail email write 邮件 写信', run:function () { window.location.href = 'mailto:806864070@qq.com'; } },
    { g:'动作 Action', ico:'⇄', label:'运行 / 暂停 CFL 实验台', kw:'lab run pause 实验 运行', run:function () {
        if (!window.__lab) { toast('实验台不可用（浏览器不支持 canvas）', 'bad'); return; }
        goTo('#lab'); window.__lab.toggle();
      } },
    { g:'动作 Action', ico:'↑', label:'回到顶部', kw:'top up 顶部', run:function () {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      } }
  ];

  function norm(s) { return (s || '').toLowerCase().replace(/\s+/g, ''); }
  function matchCmd(c, q) {
    if (!q) return true;
    var hay = norm(c.label + ' ' + c.kw + ' ' + c.g);
    return q.split(/\s+/).filter(Boolean).every(function (tok) { return hay.indexOf(norm(tok)) >= 0; });
  }
  function renderList() {
    if (!pList) return;
    var q = (pInput && pInput.value || '').trim();
    var hits = CMDS.filter(function (c) { return matchCmd(c, q); });
    pList.textContent = '';
    pItems = [];
    if (!hits.length) {
      var empty = document.createElement('li');
      empty.className = 'palette__empty';
      empty.textContent = q ? '没有匹配的命令：' + q : '没有可用命令';
      pList.appendChild(empty);
      return;
    }
    var lastGroup = null;
    hits.forEach(function (c) {
      if (c.g !== lastGroup) {
        lastGroup = c.g;
        var gh = document.createElement('li');
        gh.className = 'palette__group';
        gh.setAttribute('aria-hidden', 'true');
        gh.textContent = c.g;
        pList.appendChild(gh);
      }
      var li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette__item';
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', 'false');
      btn.innerHTML = '<span class="pi-ico" aria-hidden="true"></span><span class="pi-label"></span><span class="pi-hint" aria-hidden="true">↵</span>';
      btn.querySelector('.pi-ico').textContent = c.ico;
      btn.querySelector('.pi-label').textContent = c.label;
      btn.addEventListener('click', function () { runCmd(c); });
      li.appendChild(btn);
      pList.appendChild(li);
      pItems.push({ cmd: c, btn: btn });
    });
    pSel = 0;
    markSel();
  }
  function markSel() {
    pItems.forEach(function (it, i) {
      it.btn.classList.toggle('is-sel', i === pSel);
      it.btn.setAttribute('aria-selected', i === pSel ? 'true' : 'false');
    });
    var cur = pItems[pSel];
    if (cur && cur.btn.scrollIntoView) cur.btn.scrollIntoView({ block: 'nearest' });
  }
  function runCmd(c) {
    closePalette();
    try { c.run(); } catch (e) { toast('命令执行失败', 'bad'); }
  }
  function openPalette() {
    if (!palette || !pInput) return;
    lastFocus = document.activeElement;
    palette.hidden = false;
    document.body.classList.add('is-locked');
    pInput.value = '';
    renderList();
    window.setTimeout(function () { pInput.focus(); }, 20);
  }
  function closePalette() {
    if (!palette || palette.hidden) return;
    palette.hidden = true;
    document.body.classList.remove('is-locked');
    if (pInput) pInput.blur();          /* 关键：隐藏后不要让输入框继续吃掉全局快捷键 */
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* 忽略 */ } }
    lastFocus = null;
  }
  if (palette) {
    palette.addEventListener('keydown', function (ev) {
      var k = ev.key;
      if (k === 'Escape') { ev.preventDefault(); closePalette(); return; }
      if (!pItems.length) return;
      if (k === 'ArrowDown') { ev.preventDefault(); pSel = (pSel + 1) % pItems.length; markSel(); }
      else if (k === 'ArrowUp') { ev.preventDefault(); pSel = (pSel - 1 + pItems.length) % pItems.length; markSel(); }
      else if (k === 'Enter') { ev.preventDefault(); if (pItems[pSel]) runCmd(pItems[pSel].cmd); }
      else if (k === 'Home') { ev.preventDefault(); pSel = 0; markSel(); }
      else if (k === 'End') { ev.preventDefault(); pSel = pItems.length - 1; markSel(); }
      else if (k === 'Tab') {                       /* 焦点陷阱 */
        ev.preventDefault();
        if (pInput) pInput.focus();
      }
    });
    $$('[data-palette-close]', palette).forEach(function (n) {
      n.addEventListener('click', closePalette);
    });
  }
  if (pInput) pInput.addEventListener('input', renderList);
  $$('[data-palette-open]').forEach(function (b) { b.addEventListener('click', openPalette); });

  /* ── 全局快捷键 ─────────────────────────────────────────── */
  var lastG = 0;
  document.addEventListener('keydown', function (ev) {
    var t = ev.target || {};
    var tag = (t.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || !!t.isContentEditable;

    if ((ev.key === 'k' || ev.key === 'K') && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      if (palette && !palette.hidden) closePalette(); else openPalette();
      return;
    }
    if (palette && !palette.hidden) return;   /* 面板打开时其余快捷键交给面板 */
    if (typing) return;

    if (ev.key === 'Escape') { closeNav(); return; }
    if (ev.key === '/') { ev.preventDefault(); openPalette(); return; }
    if (ev.key === '?') { toast('⌘K 面板 · M 切换视角 · / 搜索 · G G 回顶部', 'ok', 4200); return; }
    if (ev.key === 'm' || ev.key === 'M') {
      ev.preventDefault();
      var i = LENSES.indexOf(getLens());
      setLens(LENSES[(i + 1) % LENSES.length]);
      return;
    }
    if (ev.key === 'g' || ev.key === 'G') {
      var now = Date.now();
      if (now - lastG < 650) {
        lastG = 0;
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      } else { lastG = now; }
    }
  });

  /* ── 首次访问提示 ───────────────────────────────────────── */
  if (!store.get('zx-hinted')) {
    store.set('zx-hinted', '1');
    window.setTimeout(function () {
      toast('按 M 或右上角 Mode 切换「研究 / 生活」视角', 'ok', 4200);
    }, 2400);
  }

  /* ── 控制台签名 ─────────────────────────────────────────── */
  if (window.console && console.log) {
    console.log(
      '%c Zhaoqing Xu %c Computation × Intuition ',
      'background:#59d3ff;color:#04121a;font-weight:700;padding:3px 6px;border-radius:4px 0 0 4px',
      'background:#ffb27a;color:#1a1206;font-weight:600;padding:3px 6px;border-radius:0 4px 4px 0'
    );
    console.log('%c原生 HTML/CSS/JS + KaTeX · 0 构建工具 · 0 追踪器\n试试：__lab.state() 查看 CFL 实验台状态', 'color:#6e7b8b');
  }
})();
