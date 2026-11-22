/**
 * core/latest.js — 首页「最近分享」的容量与换批纯逻辑。
 *
 * 禁止触碰 DOM：容器宽度 / 实测列数由 ui/home-latest-ui.js 量好后传进来，
 * 构建端与测试共用同一份规则。
 *
 * 容量规则（与 CSS 对齐，见 site.css / layout-mobile.css / layout-narrow.css）：
 *  - 列表：按容器宽度 4 / 5 / 6 / 8 首（<480 / <768 / <1100 / ≥1100）。
 *  - 封面墙 / 唱片：实测列数 cols ≤ 3 时展示 2 整行，cols ≥ 4 时展示 1 整行，
 *    保证宽屏不留半行空位；曲目不足时由调用方按总数截断，不复制凑数。
 *  - 量不到列数（隐藏面板 / jsdom 等无布局环境）时按 CSS 最小卡宽估算，
 *    宽度也拿不到就回退 6（与构建期预渲染一致）。
 */

/** 列表模式的容量：只看容器宽度 */
export function listCapacity(width) {
  if (!(width > 0)) return 6;
  if (width < 480) return 4;
  if (width < 768) return 5;
  if (width < 1100) return 6;
  return 8;
}

/** 封面墙 / 唱片：完整 1–2 行 */
export function gridCapacity(width, view, cols) {
  if (cols > 0) return cols * (cols <= 3 ? 2 : 1);
  if (!(width > 0)) return 6;
  // 回退估算：grid 手机 minmax(140px)、极窄屏固定 2 列、桌面 minmax(180px)；
  // vinyl 始终 minmax(160px)（选择器优先级高于布局覆盖），gap 取 --sp5 的常见值
  const gap = view === 'vinyl' ? 20 : (width <= 760 ? 12 : 16);
  const min = view === 'vinyl' ? 160 : (width <= 760 ? 140 : 180);
  let c = Math.max(1, Math.floor((width + gap) / (min + gap)));
  if (width <= 400 && view !== 'vinyl') c = 2;
  return c * (c <= 3 ? 2 : 1);
}

/** 统一入口：view ∈ list / grid / vinyl */
export function capacityFor(width, view, cols = 0) {
  return view === 'list' ? listCapacity(width) : gridCapacity(width, view, cols);
}

/**
 * 按新容量补缩当前批次：**保留现有顺序**，不重新随机。
 * 收缩直接截断；补充优先未见过的歌（按曲库日期序），再用见过但不在批内的。
 * 返回新数组；seen 由调用方合并（补进来的歌要记为已见）。
 */
export function fitBatch(current, all, count, seen) {
  const n = Math.max(0, Math.min(count, all.length));
  const inAll = new Set(all);
  const batch = current.filter((s) => inAll.has(s)).slice(0, n);
  if (batch.length < n) {
    const inBatch = new Set(batch);
    const unseen = all.filter((s) => !seen.has(s) && !inBatch.has(s));
    const rest = all.filter((s) => seen.has(s) && !inBatch.has(s));
    for (const s of [...unseen, ...rest]) {
      if (batch.length >= n) break;
      batch.push(s);
    }
  }
  return batch;
}

/** Fisher–Yates，rng 可注入便于测试 */
function shuffled(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 「换一换」：优先尚未出现的歌，其次见过但不在当前批的，最后才用当前批补位。
 *  - 同一批内绝不重复（三组互斥，曲库本身无重复）。
 *  - count < 总数时，前两组恰好是「全部 − 当前批」（当前批必然已见），
 *    至少含 1 首新歌 → 整批不可能与上一批完全相同。
 *  - 所有歌都见过后开新一轮：只把当前批记为已见，其余重新视为未见过。
 * 返回 { batch, seen }，不修改入参。
 */
export function nextBatch(all, current, count, seen, rng = Math.random) {
  const n = Math.max(0, Math.min(count, all.length));
  const cur = new Set(current);
  let seenSet = new Set(seen);
  if (all.every((s) => seenSet.has(s))) seenSet = new Set(current);
  const unseen = shuffled(all.filter((s) => !seenSet.has(s) && !cur.has(s)), rng);
  const fresh = shuffled(all.filter((s) => seenSet.has(s) && !cur.has(s)), rng);
  const old = shuffled(all.filter((s) => cur.has(s)), rng);
  const batch = [...unseen, ...fresh, ...old].slice(0, n);
  for (const s of batch) seenSet.add(s);
  return { batch, seen: seenSet };
}
