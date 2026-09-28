/*!
 * Zhaoqing Xu · personal space
 * 零依赖原生 JavaScript。功能：主题、打字机引言、状态栏轮播、本地时钟、
 * 数字滚动、滚动揭示、阅读进度、导航联动、移动端菜单、标签筛选、
 * 命令面板（⌘K）、复制邮箱、Toast、回到顶部、键盘快捷键。
 *
 * 渐进增强原则：本文件缺失或报错时，页面内容依然完整可读。
 */
(function () {
  'use strict';

  /* ── 0 · 工具函数 ────────────────────────────────────────── */
  var root = document.documentElement;
  if (root.className.indexOf('js') === -1) root.className += ' js';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /** 媒体查询安全包装：老环境/受限环境下返回 null 而不是抛错 */
  function mq(query) {
    if (typeof window.matchMedia !== 'function') return null;
    try { return window.matchMedia(query); } catch (e) { return null; }
  }

  var mqReduce = mq('(prefers-reduced-motion: reduce)');
  function reduced() { return !!(mqReduce && mqReduce.matches); }

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, String(v)); } catch (e) { /* 忽略隐私模式 */ } }
  };

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isInteractive(el) {
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' || el.isContentEditable === true);
  }

  /* ── 1 · Toast 通知 ──────────────────────────────────────── */
  var toastHost = $('#toasts');

  /**
   * @param {string} msg  提示文案
   * @param {'info'|'ok'|'warn'} [kind] 视觉语气
   */
  function toast(msg, kind) {
    if (!toastHost) return;
    var el = document.createElement('p');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    toastHost.appendChild(el);
    // 动画结束后移除（动画约 3.25s），并限制同屏最多 3 条
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3400);
    while (toastHost.children.length > 3) toastHost.removeChild(toastHost.firstChild);
  }

  /* ── 2 · 主题（深色 Nocturne / 浅色 Paper）────────────────── */
  var THEME_KEY = 'zx-theme';
  var THEME_COLOR = { dark: '#0d1117', light: '#f7f8fa' };
  var THEME_NAME = { dark: '深色 Nocturne', light: '浅色 Paper' };
  var themeBtn = $('[data-theme-toggle]');
  var themeMeta = $('meta[name="theme-color"]');

  function currentTheme() {
    return root.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function syncThemeUI() {
    var theme = currentTheme();
    if (themeMeta) themeMeta.setAttribute('content', THEME_COLOR[theme]);
    if (themeBtn) {
      var target = theme === 'dark' ? 'light' : 'dark';
      themeBtn.setAttribute('aria-label', '切换到' + THEME_NAME[target] + '主题');
      themeBtn.setAttribute('title', '切换到' + THEME_NAME[target] + '主题 (T)');
      themeBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    }
  }

  function setTheme(theme, persist) {
    root.dataset.theme = theme;
    if (persist) store.set(THEME_KEY, theme);
    syncThemeUI();
  }

  function toggleTheme(quiet) {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next, true);
    if (!quiet) toast('主题 → ' + THEME_NAME[next], 'ok');
    return next;
  }

  setTheme(store.get(THEME_KEY) === 'light' ? 'light' : currentTheme(), false);
  if (themeBtn) themeBtn.addEventListener('click', function () { toggleTheme(false); });

  /* ── 3 · 页脚年份 ────────────────────────────────────────── */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ── 4 · 本地时钟 ────────────────────────────────────────── */
  var clockEl = $('#clock');
  if (clockEl) {
    (function tick() {
      var d = new Date();
      clockEl.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
      window.setTimeout(tick, 1000 - (d.getMilliseconds()));
    })();
  }
  /* ── 5 · 指针光晕（桌面端，rAF 节流）─────────────────────── */
  var spotlight = $('.fx-spotlight');
  var finePointer = mq('(hover: hover) and (pointer: fine)');
  if (spotlight && finePointer && finePointer.matches) {
    var mx = window.innerWidth / 2, my = window.innerHeight * 0.3, queued = false;
    function paint() {
      spotlight.style.setProperty('--mx', mx + 'px');
      spotlight.style.setProperty('--my', my + 'px');
      queued = false;
    }
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!queued && !reduced()) { queued = true; window.requestAnimationFrame(paint); }
    }, { passive: true });
    paint();
  }

  /* ── 6 · 终端：打字机引言 ────────────────────────────────── */
  var QUOTES = [
    'Simplicity is the ultimate sophistication.',
    '我们塑造工具，此后工具塑造我们。',
    'The garden is the metaphor for how we should think about writing on the web.',
    '系统不是部件的集合，而是关系的集合。',
    'Make it work, make it right, make it fast — in that order.',
    '慢即是快：真正的速度来自不必返工。',
    'An interface is like a joke — if you have to explain it, it is not that good.',
    '在不确定里做可逆的决定，在确定里做不可逆的决定。'
  ];

  var typedEl = $('#typedText');
  var caretEl = $('#caret');

  if (typedEl) {
    var qIndex = Math.floor(Math.random() * QUOTES.length);
    var typeTimer = null;

    function wait(ms, fn) { typeTimer = window.setTimeout(fn, reduced() ? Math.min(ms, 1200) : ms); }

    function typeIn(text, done) {
      if (reduced()) { typedEl.textContent = text; wait(6000, done); return; }
      var i = 0;
      typedEl.textContent = '';
      (function step() {
        i += 1;
        typedEl.textContent = text.slice(0, i);
        // 轻微不规则，模拟真人敲字
        var delay = 26 + Math.random() * 46 + (/[，。、：]/.test(text.charAt(i - 1)) ? 260 : 0);
        if (i < text.length) { typeTimer = window.setTimeout(step, delay); }
        else { wait(4200, function () { typeOut(text, done); }); }
      })();
    }

    function typeOut(text, done) {
      if (reduced()) { done(); return; }
      var i = text.length;
      (function step() {
        i -= 1;
        typedEl.textContent = text.slice(0, Math.max(i, 0));
        if (i > 0) { typeTimer = window.setTimeout(step, 12); }
        else { wait(280, done); }
      })();
    }

    function cycle() {
      qIndex = (qIndex + 1) % QUOTES.length;
      if (caretEl) caretEl.setAttribute('aria-hidden', 'true');
      typeIn(QUOTES[qIndex], cycle);
    }

    // 首屏停留 2.6s 后再开始轮播，避免与页面动画抢注意力
    if (document.hidden) { wait(2600, cycle); }
    else { typeTimer = window.setTimeout(cycle, 2600); }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && typeTimer) { window.clearTimeout(typeTimer); typeTimer = null; }
      else if (!typeTimer && document.hidden === false) { typeTimer = window.setTimeout(cycle, 1200); }
    });
  }

  /* ── 7 · 终端：状态栏轮播 ────────────────────────────────── */
  var STATUSES = [
    { text: 'status: deep in thought', color: '#00f2fe' },
    { text: 'status: shipping small things', color: '#3ddc97' },
    { text: 'status: reading & walking', color: '#f0b429' },
    { text: 'status: refactoring my beliefs', color: '#a78bfa' },
    { text: 'status: open to good conversations', color: '#3ddc97' }
  ];

  var statusText = $('#statusText');
  var statusDot = $('#statusDot');

  if (statusText) {
    var sIndex = 0;
    function paintStatus() {
      var s = STATUSES[sIndex % STATUSES.length];
      statusText.textContent = s.text;
      if (statusDot) {
        statusDot.style.background = s.color;
        statusDot.style.boxShadow = '0 0 8px ' + s.color;
      }
    }
    paintStatus();
    window.setInterval(function () {
      sIndex += 1;
      if (document.hidden) return;
      statusText.style.opacity = '0';
      window.setTimeout(function () { paintStatus(); statusText.style.opacity = ''; }, reduced() ? 0 : 220);
    }, 6500);
    statusText.style.transition = 'opacity .22s ease';
  }
  /* ── 8 · 滚动揭示（IntersectionObserver + 逐项错峰）───────── */
  var revealItems = $$('[data-reveal]');

  function showAll() {
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  }

  if ('IntersectionObserver' in window && !reduced()) {
    // 同一父容器内的元素按顺序错峰，最多 5 档
    revealItems.forEach(function (el) {
      var siblings = $$('[data-reveal]', el.parentNode);
      var i = siblings.indexOf(el);
      if (i > 0) el.style.setProperty('--d', Math.min(i, 5) * 90 + 'ms');
    });

    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    revealItems.forEach(function (el) { revealObserver.observe(el); });

    // 兜底：2.5s 后仍未进入视口的（极端长页面/懒滚动）保持隐藏，但保证首屏可见
    window.setTimeout(function () {
      revealItems.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('is-visible');
      });
    }, 2500);
  } else {
    showAll();
  }

  /* ── 9 · 指标数字滚动 ────────────────────────────────────── */
  function formatNumber(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function countUp(el) {
    var target = parseFloat(el.dataset.countTo || '0');
    var suffix = el.dataset.suffix || '';
    if (!isFinite(target)) return;
    if (reduced()) { el.textContent = formatNumber(target) + suffix; return; }

    var duration = 1100 + Math.min(target, 2000) * 0.25;
    var start = 0;
    (function frame(now) {
      if (!start) start = now;
      var p = clamp((now - start) / duration, 0, 1);
      var eased = 1 - Math.pow(1 - p, 3);          // easeOutCubic
      el.textContent = formatNumber(Math.round(target * eased)) + suffix;
      if (p < 1) window.requestAnimationFrame(frame);
    })(performance.now());
  }

  var counters = $$('[data-count-to]');
  if ('IntersectionObserver' in window && counters.length) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { countObserver.observe(el); });
  } else {
    counters.forEach(countUp);
  }

  /* ── 10 · 滚动：进度条 / 头部吸附 / 导航联动 / 回到顶部 ────── */
  var progressBar = $('#progressBar');
  var header = $('#siteHeader');
  var toTop = $('#toTop');
  var navLinks = $$('.nav__link');
  var navSections = navLinks
    .map(function (a) { return $(a.getAttribute('href')); })
    .filter(Boolean);
  var ticking = false;

  function headerOffset() { return header ? header.offsetHeight : 64; }

  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

    if (progressBar) progressBar.style.setProperty('--progress', (clamp(y / max, 0, 1) * 100).toFixed(2) + '%');
    if (header) header.classList.toggle('is-stuck', y > 8);
    if (toTop) toTop.classList.toggle('is-visible', y > window.innerHeight * 0.6);

    // 当前章节 = 最后一个顶部已越过「头部 + 1/3 视口」的章节
    var line = y + headerOffset() + window.innerHeight * 0.33;
    var activeId = '';
    navSections.forEach(function (sec) { if (sec.offsetTop <= line) activeId = sec.id; });
    if (y + window.innerHeight >= document.documentElement.scrollHeight - 4 && navSections.length) {
      activeId = navSections[navSections.length - 1].id;   // 触底时高亮最后一节
    }
    navLinks.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === '#' + activeId);
    });

    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(onScroll);
  }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
    });
  }

  /* ── 11 · 移动端导航 ─────────────────────────────────────── */
  var navToggle = $('#navToggle');
  var nav = $('#primaryNav');

  function setNav(open) {
    if (!navToggle || !nav) return;
    nav.classList.toggle('is-open', open);
    navToggle.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? '收起导航菜单' : '展开导航菜单');
  }

  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      setNav(!nav.classList.contains('is-open'));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 939) setNav(false);
    });
  }
  /* ── 12 · 标签筛选（文章 / 花园笔记）─────────────────────── */
  var FILTER_GROUPS = {
    essays: { list: '#essayList', counter: '#essayCount', unit: '篇' },
    notes: { list: '#gardenList', counter: '#noteCount', unit: '条' }
  };

  $$('[data-filter-group]').forEach(function (group) {
    var conf = FILTER_GROUPS[group.dataset.filterGroup];
    if (!conf) return;
    var listEl = $(conf.list);
    var counterEl = $(conf.counter);
    if (!listEl) return;

    var chips = $$('.chip', group);
    var items = $$('[data-tags]', listEl);

    function matches(item, filter) {
      if (!filter || filter === 'all') return true;
      var tags = (item.dataset.tags || '').split(/\s+/);
      return filter.split(/\s+/).some(function (f) { return f && tags.indexOf(f) !== -1; });
    }

    // 依据真实 DOM 重算每个分类的数量，内容与徽标永远同步
    chips.forEach(function (chip) {
      var badge = $('[data-count]', chip);
      if (!badge) return;
      badge.textContent = String(items.filter(function (it) { return matches(it, chip.dataset.filter); }).length);
    });

    function apply(filter) {
      var shown = 0;
      items.forEach(function (item) {
        var ok = matches(item, filter);
        item.classList.toggle('is-hidden', !ok);
        if (ok) shown += 1;
      });
      chips.forEach(function (chip) {
        var on = chip.dataset.filter === filter;
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (counterEl) counterEl.textContent = '显示 ' + shown + ' / ' + items.length + ' ' + conf.unit;
      if (shown === 0) toast('这个分类下暂时还没有内容', 'warn');
    }

    group.addEventListener('click', function (e) {
      var chip = e.target.closest ? e.target.closest('.chip') : null;
      if (chip) apply(chip.dataset.filter);
    });

    // 方向键在筛选组内漫游（无障碍）
    group.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var i = chips.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      var next = chips[(i + (e.key === 'ArrowRight' ? 1 : chips.length - 1)) % chips.length];
      next.focus();
    });
  });

  /* ── 13 · 复制邮箱 ───────────────────────────────────────── */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('execCommand failed'));
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-copy]') : null;
    if (!btn) return;
    var value = btn.getAttribute('data-copy');
    if (!value) return;
    copyText(value).then(function () {
      toast('已复制到剪贴板：' + value, 'ok');
    }).catch(function () {
      toast('浏览器拒绝了复制，请手动选取邮箱地址', 'warn');
    });
  });

  /* ── 14 · 草稿链接：href="#" 时给出友好提示而非跳转 ───────── */
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[data-draft]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (href === '#' || href === '') {
      e.preventDefault();
      toast('这篇还在打磨中——发布后会第一时间出现在这里 ✍', 'warn');
    }
  });

  /* ── 15 · 键盘快捷键 ─────────────────────────────────────── */
  var lastG = 0;

  document.addEventListener('keydown', function (e) {
    var paletteOpen = isPaletteOpen();

    // ⌘K / Ctrl+K：命令面板；Esc：关闭
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      paletteOpen ? closePalette() : openPalette();
      return;
    }
    if (e.key === 'Escape') {
      if (paletteOpen) { closePalette(); return; }
      if (nav && nav.classList.contains('is-open')) { setNav(false); navToggle.focus(); return; }
    }
    if (e.metaKey || e.ctrlKey || e.altKey || isInteractive(document.activeElement)) return;

    // T：主题
    if (String(e.key).toLowerCase() === 't') { e.preventDefault(); toggleTheme(false); return; }
    // /：打开命令面板
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    // gg：回到顶部（vim 手感，600ms 内连按两次）
    if (String(e.key).toLowerCase() === 'g' && !e.shiftKey) {
      var now = Date.now();
      if (now - lastG < 600) {
        window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
        toast('回到顶部 ↑', 'info');
      }
      lastG = now;
    }
  });
  /* ── 16 · 命令面板（⌘K）──────────────────────────────────── */
  var palette = $('#palette');
  var paletteInput = $('#paletteInput');
  var paletteList = $('#paletteList');
  var paletteItems = [];
  var paletteCommands = [];
  var activeIndex = 0;
  var lastFocused = null;

  function gotoTarget(sel) {
    var el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) return;
    window.setTimeout(function () {
      var top = el.getBoundingClientRect().top + (window.pageYOffset || 0) - headerOffset() - 14;
      window.scrollTo({ top: Math.max(top, 0), behavior: reduced() ? 'auto' : 'smooth' });
      if (el.hasAttribute && el.hasAttribute('tabindex') && el.focus) {
        el.focus({ preventScroll: true });
      }
    }, 30);
  }

  function clickChip(groupName, filter) {
    var group = $('[data-filter-group="' + groupName + '"]');
    if (!group) return;
    var chip = $('.chip[data-filter="' + filter + '"]', group);
    if (chip) chip.click();
  }

  function openExternal(url) {
    window.open(url, '_blank', 'noopener');
  }

  function randomNote() {
    var notes = $$('#gardenList .note').filter(function (n) { return !n.classList.contains('is-hidden'); });
    if (!notes.length) { toast('花园里暂时没有笔记', 'warn'); return; }
    var pick = notes[Math.floor(Math.random() * notes.length)];
    window.setTimeout(function () {
      pick.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
      var id = $('.note__id', pick);
      var text = $('.note__text', pick);
      toast('抽到 ' + (id ? id.textContent.trim() : '一条笔记') + ' · ' +
        (text ? text.textContent.trim().slice(0, 40) : '') + '…', 'ok');
    }, 30);
  }

  var COMMANDS = [
    { group: '跳转', ico: '⌂', label: '首页 · Home', hint: '#home', keywords: 'top home index 首页', run: function () { gotoTarget('#home'); } },
    { group: '跳转', ico: '01', label: '深度长文 · Writing', hint: '#writing', keywords: 'essay article 文章 长文 writing', run: function () { gotoTarget('#writing'); } },
    { group: '跳转', ico: '02', label: '数字花园 · Garden', hint: '#garden', keywords: 'note 笔记 碎片 garden', run: function () { gotoTarget('#garden'); } },
    { group: '跳转', ico: '03', label: '玩票与跨界实验 · Playground', hint: '#playground', keywords: 'project 项目 开源 playground', run: function () { gotoTarget('#playground'); } },
    { group: '跳转', ico: '04', label: '此刻 · Now', hint: '#now', keywords: 'now 日志 在读 在听 在学', run: function () { gotoTarget('#now'); } },
    { group: '跳转', ico: '05', label: '联系 · Contact', hint: '#contact', keywords: 'contact email 邮箱 联系 合作', run: function () { gotoTarget('#contact'); } },

    { group: '筛选文章', ico: '#', label: '只看 Philosophy', hint: 'essays', keywords: '哲学 philosophy filter', run: function () { clickChip('essays', 'philosophy'); gotoTarget('#writing'); } },
    { group: '筛选文章', ico: '#', label: '只看 Tech', hint: 'essays', keywords: '技术 tech ai filter', run: function () { clickChip('essays', 'tech'); gotoTarget('#writing'); } },
    { group: '筛选文章', ico: '#', label: '只看 Systems', hint: 'essays', keywords: '系统 systems filter', run: function () { clickChip('essays', 'systems'); gotoTarget('#writing'); } },
    { group: '筛选文章', ico: '#', label: '只看 Creative', hint: 'essays', keywords: '创意 creative filter', run: function () { clickChip('essays', 'creative'); gotoTarget('#writing'); } },
    { group: '筛选文章', ico: '↺', label: '显示全部文章', hint: 'essays', keywords: 'all reset 全部 重置', run: function () { clickChip('essays', 'all'); gotoTarget('#writing'); } },

    { group: '花园', ico: '❝', label: '只看 Quote', hint: 'notes', keywords: 'quote 引言 filter', run: function () { clickChip('notes', 'quote'); gotoTarget('#garden'); } },
    { group: '花园', ico: '💭', label: '只看 Thought', hint: 'notes', keywords: 'thought 思考 filter', run: function () { clickChip('notes', 'thought'); gotoTarget('#garden'); } },
    { group: '花园', ico: '⌘', label: '只看 Code', hint: 'notes', keywords: 'code 代码 snippet', run: function () { clickChip('notes', 'code'); gotoTarget('#garden'); } },
    { group: '花园', ico: '✦', label: '只看 Spark', hint: 'notes', keywords: 'spark 灵感 idea', run: function () { clickChip('notes', 'spark'); gotoTarget('#garden'); } },
    { group: '花园', ico: '🎲', label: '随机抽一条笔记', hint: 'surprise me', keywords: 'random 随机 surprise', run: randomNote },

    { group: '动作', ico: '◐', label: '切换主题', hint: 'T', keywords: 'theme dark light 主题 深色 浅色', run: function () { toggleTheme(false); } },
    { group: '动作', ico: '⧉', label: '复制邮箱地址', hint: '806864070@qq.com', keywords: 'copy email mail 复制 邮箱', run: function () { var b = $('[data-copy]'); if (b) b.click(); } },
    { group: '动作', ico: '✉', label: '写一封邮件给我', hint: 'mailto', keywords: 'mail email 邮件 联系', run: function () { window.location.href = 'mailto:806864070@qq.com'; } },
    { group: '动作', ico: '↑', label: '回到页面顶部', hint: 'gg', keywords: 'top scroll 顶部', run: function () { window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); } },

    { group: '站外', ico: '⌥', label: 'GitHub @PearsonXu', hint: 'external', keywords: 'github repo 代码 仓库', run: function () { openExternal('https://github.com/PearsonXu'); } },
    { group: '站外', ico: '✕', label: 'X / Twitter @PearsonXu', hint: 'external', keywords: 'twitter x 推特 social', run: function () { openExternal('https://x.com/PearsonXu'); } },
    { group: '站外', ico: '◈', label: 'Academic Site（论文 · CV）', hint: 'external', keywords: 'academic paper cv 学术 论文 简历', run: function () { openExternal('https://pearsonxu.github.io/'); } }
  ];
  function buildItem(cmd, index) {
    var li = document.createElement('li');
    li.className = 'palette__item';
    li.setAttribute('role', 'option');
    li.setAttribute('id', 'pcmd-' + index);
    li.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
    if (index === activeIndex) li.classList.add('is-active');

    var ico = document.createElement('span');
    ico.className = 'pi-ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = cmd.ico;

    var label = document.createElement('span');
    label.className = 'pi-label';
    label.textContent = cmd.label;

    li.appendChild(ico);
    li.appendChild(label);

    if (cmd.hint) {
      var hint = document.createElement('span');
      hint.className = 'pi-hint';
      hint.textContent = cmd.hint;
      li.appendChild(hint);
    }

    li.addEventListener('mouseenter', function () { setActive(index); });
    li.addEventListener('click', function () { runCommand(index); });
    return li;
  }

  function setActive(i) {
    if (!paletteItems.length) return;
    activeIndex = clamp(i, 0, paletteItems.length - 1);
    paletteItems.forEach(function (li, idx) {
      var on = idx === activeIndex;
      li.classList.toggle('is-active', on);
      li.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
    });
    if (paletteInput) paletteInput.setAttribute('aria-activedescendant', 'pcmd-' + activeIndex);
  }

  function renderPalette(query) {
    if (!paletteList) return;
    var tokens = (query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    var matched = COMMANDS.filter(function (cmd) {
      var hay = (cmd.label + ' ' + cmd.group + ' ' + (cmd.keywords || '') + ' ' + (cmd.hint || '')).toLowerCase();
      return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
    });

    paletteList.textContent = '';
    paletteItems = [];
    paletteCommands = matched;
    activeIndex = 0;

    if (!matched.length) {
      var empty = document.createElement('li');
      empty.className = 'palette__empty';
      empty.textContent = '没有匹配的命令 · 试试 theme / github / quote';
      paletteList.appendChild(empty);
      if (paletteInput) paletteInput.removeAttribute('aria-activedescendant');
      return;
    }

    var currentGroup = null;
    matched.forEach(function (cmd, index) {
      if (cmd.group !== currentGroup) {
        currentGroup = cmd.group;
        var head = document.createElement('li');
        head.className = 'palette__group';
        head.setAttribute('aria-hidden', 'true');
        head.textContent = cmd.group;
        paletteList.appendChild(head);
      }
      var li = buildItem(cmd, index);
      paletteItems.push(li);
      paletteList.appendChild(li);
    });
    setActive(0);
  }

  function runCommand(i) {
    var cmd = paletteCommands[i];
    if (!cmd) return;
    closePalette();
    try { cmd.run(); } catch (err) { toast('命令执行失败：' + err.message, 'warn'); }
  }

  function isPaletteOpen() { return !!palette && palette.hidden === false; }

  function openPalette() {
    if (!palette) return;
    if (isPaletteOpen()) { if (paletteInput) paletteInput.focus(); return; }
    lastFocused = document.activeElement;
    palette.hidden = false;
    document.body.classList.add('is-locked');
    renderPalette('');
    if (paletteInput) { paletteInput.value = ''; paletteInput.focus(); }
  }

  function closePalette() {
    if (!palette || palette.hidden) return;
    var active = document.activeElement;
    palette.hidden = true;
    document.body.classList.remove('is-locked');
    // 焦点不能留在已隐藏的面板内：否则全局快捷键会被「输入态」守卫一直拦住。
    // 浏览器通常会自动把焦点弹回 body，但这是兜底行为，这里显式处理以保证确定性。
    if (active && palette.contains(active) && active.blur) active.blur();
    if (lastFocused && lastFocused !== document.body && lastFocused.focus) lastFocused.focus();
    lastFocused = null;
  }

  if (palette && paletteInput && paletteList) {
    $$('[data-palette-open]').forEach(function (btn) {
      btn.addEventListener('click', openPalette);
    });
    $$('[data-palette-close]').forEach(function (el) {
      el.addEventListener('click', closePalette);
    });

    paletteInput.addEventListener('input', function () { renderPalette(paletteInput.value); });

    paletteInput.addEventListener('keydown', function (e) {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); setActive(activeIndex + 1); break;
        case 'ArrowUp':   e.preventDefault(); setActive(activeIndex - 1); break;
        case 'Home':      e.preventDefault(); setActive(0); break;
        case 'End':       e.preventDefault(); setActive(paletteItems.length - 1); break;
        case 'Enter':     e.preventDefault(); runCommand(activeIndex); break;
        case 'Escape':    e.preventDefault(); closePalette(); break;
        case 'Tab':       // 焦点留在面板内：Tab 在结果项间循环
          e.preventDefault();
          setActive(activeIndex + (e.shiftKey ? -1 : 1));
          break;
        default: break;
      }
    });

    renderPalette('');
  }
  /* ── 17 · 动效偏好热切换 ─────────────────────────────────── */
  // 用户在系统设置里改为「减少动态效果」后，立刻把待揭示内容全部显示
  function onMotionPrefChange() {
    if (reduced()) showAll();
  }
  if (mqReduce && typeof mqReduce.addEventListener === 'function') {
    mqReduce.addEventListener('change', onMotionPrefChange);
  } else if (mqReduce && typeof mqReduce.addListener === 'function') {
    mqReduce.addListener(onMotionPrefChange);
  }

  // 增强脚本自身出错时保持静默，绝不影响内容阅读
  window.addEventListener('error', function () { showAll(); });

  /* ── 18 · 控制台彩蛋 ─────────────────────────────────────── */
  if (window.console && console.log) {
    console.log('%c zx %c personal space ',
      'background:#00f2fe;color:#04070b;font:700 12px ui-monospace,monospace;padding:3px 6px;border-radius:4px 0 0 4px;',
      'background:#161b22;color:#c9d5e1;font:12px ui-monospace,monospace;padding:3px 6px;border-radius:0 4px 4px 0;');
    console.log('0 依赖 · 0 追踪 · 手写 HTML/CSS/JS。按 ⌘K（或 /）打开命令面板，或 view-source 直接读源码。');
  }
})();
