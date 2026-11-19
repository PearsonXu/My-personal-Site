import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayQueue, MODES } from '../assets/js/core/queue.js';

/** 确定性 rng，让洗牌可复现 */
function seeded(seed = 1) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

test('queue · 同一首歌重复入队得到不同 id', () => {
  const q = new PlayQueue();
  const a1 = q.addLast('same');
  const a2 = q.addLast('same');
  const a3 = q.addNext('same');
  assert.notEqual(a1.id, a2.id);
  assert.notEqual(a2.id, a3.id);
  assert.equal(q.length, 3);
  assert.ok(q.items.every((i) => i.slug === 'same'));
});

test('queue · addNext 插在当前之后，addLast 追加到末尾', () => {
  const q = new PlayQueue();
  q.replace(['a', 'b', 'c'], 0);
  q.addNext('x');
  assert.deepEqual(q.items.map((i) => i.slug), ['a', 'x', 'b', 'c']);
  q.addLast('y');
  assert.deepEqual(q.items.map((i) => i.slug), ['a', 'x', 'b', 'c', 'y']);
  assert.equal(q.current().slug, 'a');
});

test('queue · 顺序播放到头就停，不偷偷循环', () => {
  const q = new PlayQueue({ mode: 'order' });
  q.replace(['a', 'b'], 0);
  assert.equal(q.advance({ auto: true }).slug, 'b');
  assert.equal(q.advance({ auto: true }), null);
  assert.equal(q.advance({ auto: false }), null);
});

test('queue · 列表循环会绕回第一首', () => {
  const q = new PlayQueue({ mode: 'repeat-all' });
  q.replace(['a', 'b'], 1);
  assert.equal(q.advance({ auto: true }).slug, 'a');
  assert.equal(q.advance({ auto: true }).slug, 'b');
});

test('queue · 单曲循环：自动重播本曲，手动下一首仍前进', () => {
  const q = new PlayQueue({ mode: 'repeat-one' });
  q.replace(['a', 'b'], 0);
  const same = q.advance({ auto: true });
  assert.equal(same.slug, 'a');
  assert.equal(q.current().slug, 'a');
  assert.equal(q.advance({ auto: false }).slug, 'b');
});

test('queue · 随机播放一轮内不重复', () => {
  const slugs = ['a', 'b', 'c', 'd', 'e', 'f'];
  const q = new PlayQueue({ mode: 'shuffle', rng: seeded(7) });
  q.replace(slugs, 0);
  const played = [q.current().slug];
  for (let i = 0; i < slugs.length - 1; i++) played.push(q.advance({ auto: true }).slug);
  assert.equal(new Set(played).size, slugs.length, `一轮内出现重复：${played.join(',')}`);
  assert.deepEqual([...played].sort(), [...slugs].sort());
});

test('queue · 随机播放跨轮不立刻重复同一首', () => {
  const q = new PlayQueue({ mode: 'shuffle', rng: seeded(3) });
  q.replace(['a', 'b', 'c', 'd'], 0);
  let prev = q.current().slug;
  for (let i = 0; i < 40; i++) {
    const next = q.advance({ auto: true }).slug;
    assert.notEqual(next, prev, '新一轮第一首不应与上一轮最后一首相同');
    prev = next;
  }
});

test('queue · 上一首走真实播放历史，而不是下标减一', () => {
  const q = new PlayQueue({ mode: 'shuffle', rng: seeded(11) });
  q.replace(['a', 'b', 'c', 'd'], 0);
  const order = [q.current().slug];
  order.push(q.advance().slug);
  order.push(q.advance().slug);
  const back1 = q.back();
  assert.equal(back1.item.slug, order[1]);
  const back2 = q.back();
  assert.equal(back2.item.slug, order[0]);
  const back3 = q.back();
  assert.equal(back3.restart, true, '没有更早历史时应重播当前曲');
});

test('queue · 删除当前项后光标落在合理位置', () => {
  const q = new PlayQueue();
  q.replace(['a', 'b', 'c'], 1);
  const res = q.remove(q.current().id);
  assert.equal(res.removedCurrent, true);
  assert.equal(q.current().slug, 'c');
  q.remove(q.current().id);
  assert.equal(q.current().slug, 'a');
});

test('queue · 排序保持当前曲不变', () => {
  const q = new PlayQueue();
  q.replace(['a', 'b', 'c'], 2);
  const currentId = q.current().id;
  q.move(2, 0);
  assert.deepEqual(q.items.map((i) => i.slug), ['c', 'a', 'b']);
  assert.equal(q.current().id, currentId);
  assert.equal(q.cursor, 0);
});

test('queue · 清空', () => {
  const q = new PlayQueue();
  q.replace(['a', 'b'], 0);
  q.clear();
  assert.equal(q.length, 0);
  assert.equal(q.current(), null);
  assert.equal(q.advance(), null);
});

test('queue · 模式循环覆盖四种', () => {
  const q = new PlayQueue();
  const seen = [q.mode];
  for (let i = 0; i < 3; i++) seen.push(q.cycleMode());
  assert.deepEqual(seen, MODES);
});

test('queue · 快照 / 恢复保留 id、光标、模式与历史', () => {
  const q = new PlayQueue({ mode: 'shuffle', rng: seeded(5) });
  q.replace(['a', 'b', 'c'], 0);
  q.advance();
  const snap = JSON.parse(JSON.stringify(q.snapshot()));
  const restored = PlayQueue.restore(snap, { rng: seeded(5) });
  assert.deepEqual(restored.items, q.items);
  assert.equal(restored.cursor, q.cursor);
  assert.equal(restored.mode, 'shuffle');
  assert.deepEqual(restored.history, q.history);
});

test('queue · 恢复损坏快照不崩溃', () => {
  assert.equal(PlayQueue.restore(null).length, 0);
  assert.equal(PlayQueue.restore({ items: 'x' }).length, 0);
  const q = PlayQueue.restore({ items: [{ slug: 'a' }], cursor: 99, mode: '乱写' });
  assert.equal(q.cursor, -1);
  assert.equal(q.mode, 'order');
});

test('queue · peekNext 不改变状态', () => {
  const q = new PlayQueue({ mode: 'shuffle', rng: seeded(2) });
  q.replace(['a', 'b', 'c'], 0);
  const before = JSON.stringify(q.snapshot());
  q.peekNext();
  assert.equal(JSON.stringify(q.snapshot()), before);
});