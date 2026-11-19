import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../assets/js/player.js';
import { Store } from '../assets/js/store.js';
import { FakeAudio, MemoryStorage, makeCatalog, flush } from './helpers/fake-audio.mjs';

function setup({ autoplayAllowed = true, catalog = makeCatalog(), lyricsText = '[00:00.00]第一句\n[00:05.00]第二句' } = {}) {
  const audio = new FakeAudio({ autoplayAllowed });
  const store = new Store(new MemoryStorage());
  const player = new Player({
    audio, catalog, store,
    resolve: (s) => `https://example.com/${s}`,
    fetchText: async () => lyricsText
  });
  return { audio, store, player, catalog };
}

test('player · 状态由媒体事件驱动，而不是由调用 play() 驱动', async () => {
  const { player, audio } = setup();
  const seen = [];
  player.on('state', ({ state }) => seen.push(state));
  await player.playSong('a');
  assert.ok(seen.includes('loading'));
  assert.equal(player.state, 'playing');
  assert.equal(seen.at(-1), 'playing');
  audio.waiting();
  assert.equal(player.state, 'buffering');
  audio.dispatchEvent(new Event('playing'));
  assert.equal(player.state, 'playing');
  audio.pause();
  assert.equal(player.state, 'paused');
});

test('player · play() 被自动播放策略拒绝 → blocked，不是假装在播', async () => {
  const { player } = setup({ autoplayAllowed: false });
  await player.playSong('a');
  assert.equal(player.state, 'blocked');
  assert.match(player.stateDetail, /点击|点一下/);
});

test('player · 音源错误 → error 并给出可读原因', async () => {
  const { player, audio } = setup();
  await player.playSong('a');
  audio.fail(4);
  assert.equal(player.state, 'error');
  assert.match(player.stateDetail, /音源不可用/);
});

test('player · 快速切歌 A→B→C，旧歌词请求不能覆盖 C', async () => {
  const audio = new FakeAudio();
  const store = new Store(new MemoryStorage());
  const catalog = makeCatalog(['a', 'b', 'c']);
  catalog.songs.forEach((s) => { s.instrumental = false; s.lyrics = `assets/lyrics/${s.slug}.lrc`; });
  const delays = { a: 40, b: 20, c: 0 };
  const player = new Player({
    audio, catalog, store,
    resolve: (s) => `https://example.com/${s}`,
    fetchText: async (url) => {
      const slug = /lyrics\/(\w+)\.lrc/.exec(url)[1];
      await new Promise((r) => setTimeout(r, delays[slug]));
      return `[00:00.00]歌词-${slug}`;
    }
  });
  await player.playSong('a');
  await player.playSong('b');
  await player.playSong('c');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(player.currentSong.slug, 'c');
  assert.equal(player.lyrics.lines[0].text, '歌词-c', '过期歌词覆盖了当前歌曲');
});

test('player · 切歌时封面与标题立即跟随，不留上一首', async () => {
  const { player } = setup();
  const tracks = [];
  player.on('track', ({ song }) => tracks.push(song?.slug));
  await player.playSong('a');
  await player.playSong('b');
  assert.deepEqual(tracks, ['a', 'b']);
  assert.equal(player.currentSong.title, '歌曲 B');
});

test('player · 纯音乐不会去请求歌词', async () => {
  const { player } = setup();
  await player.playSong('b');
  await flush();
  assert.equal(player.lyrics.format, 'none');
  assert.equal(player.lyricIndex, -1);
});

test('player · 歌词高亮随时间推进', async () => {
  const { player, audio } = setup();
  await player.playSong('a');
  await flush();
  audio.emitLoadedMetadata();
  audio.tick(6);
  assert.equal(player.lyricIndex, 1);
  player.seek(0);
  assert.equal(player.lyricIndex, 0);
});

test('player · 自然播完自动下一首；顺序模式到头则停止', async () => {
  const { player, audio } = setup();
  await player.playSlugs(['a', 'b']);
  audio.emitLoadedMetadata();
  audio.finish();
  await flush();
  assert.equal(player.currentSong.slug, 'b');
  audio.finish();
  await flush();
  assert.equal(player.state, 'paused');
  assert.match(player.stateDetail, /播完/);
});

test('player · 单曲循环自然播完重播同一首', async () => {
  const { player, audio } = setup();
  await player.playSlugs(['a', 'b']);
  player.setMode('repeat-one');
  audio.emitLoadedMetadata();
  audio.tick(20);
  audio.finish();
  await flush();
  assert.equal(player.currentSong.slug, 'a');
  assert.equal(audio.currentTime, 0);
});
test('player · 队列操作与持久化', async () => {
  const { player, store } = setup();
  await player.playSong('a');
  player.addNext('b');
  player.addLast('c');
  player.addLast('a'); // 同一首重复入队
  const info = player.queueInfo();
  assert.equal(info.items.length, 4);
  assert.equal(new Set(info.items.map((i) => i.id)).size, 4);
  assert.deepEqual(info.items.map((i) => i.slug), ['a', 'b', 'c', 'a']);
  assert.equal(store.data.queue.items.length, 4);
});

test('player · 刷新后恢复队列与进度，但绝不自动出声', async () => {
  const first = setup();
  await first.player.playSlugs(['a', 'b', 'c']);
  first.audio.emitLoadedMetadata();
  first.audio.tick(12);
  first.player.pause();
  const saved = first.store.storage.getItem('zx.music.v1');

  const audio2 = new FakeAudio();
  const storage2 = new MemoryStorage();
  storage2.setItem('zx.music.v1', saved);
  const store2 = new Store(storage2);
  const player2 = new Player({ audio: audio2, catalog: makeCatalog(), store: store2, resolve: (s) => s });
  player2.restore();
  await flush();

  assert.equal(player2.currentSong.slug, 'a');
  assert.equal(player2.queue.length, 3);
  assert.equal(audio2.playCalls, 0, '恢复时不允许自动播放');
  assert.equal(player2.state, 'paused');
  assert.match(player2.stateDetail, /恢复/);
});

test('player · 回到前台按真实 currentTime 校准，不主动暂停后台播放', async () => {
  const { player, audio } = setup();
  await player.playSong('a');
  audio.emitLoadedMetadata();
  audio.currentTime = 17; // 模拟后台期间真实推进
  player.resync();
  assert.equal(audio.paused, false, 'resync 不应暂停播放');
  assert.equal(player.state, 'playing');
  assert.equal(player.timeInfo().currentTime, 17);
});

test('player · 收藏只写入本地 store', () => {
  const { player, store } = setup();
  assert.equal(player.isFavorite('a'), false);
  assert.equal(player.toggleFavorite('a'), true);
  assert.equal(player.isFavorite('a'), true);
  assert.deepEqual(store.data.favorites, ['a']);
  player.toggleFavorite('a');
  assert.deepEqual(store.data.favorites, []);
});

test('player · 拖动进度被钳制在有效范围', async () => {
  const { player, audio } = setup();
  await player.playSong('a');
  audio.emitLoadedMetadata();
  player.seek(-10);
  assert.equal(audio.currentTime, 0);
  player.seek(9999);
  assert.ok(audio.currentTime <= 30);
  player.seekRatio(0.5);
  assert.equal(audio.currentTime, 15);
});

test('player · 未配置 Media Session 时不报错', () => {
  const { player } = setup();
  assert.equal(player.bindMediaSession(), false);
  assert.equal(player.capabilities().mediaSession, false);
});

test('player · 对已在播放的元素再次 play() 不会卡在 buffering', async () => {
  const { player, audio } = setup();
  await player.playSong('a');
  assert.equal(player.state, 'playing');
  // 真实浏览器：元素已在播放时再调 play() 不会再发 play/playing 事件
  audio.play = async () => { audio.playCalls++; };
  player._setState('buffering');
  await player.play();
  assert.equal(player.state, 'playing', '没有按元素真实 paused 对账');
});

test('player · 不自动播放的加载会真的暂停，不会让上一首继续响', async () => {
  const { player, audio } = setup();
  await player.playSong('a');
  assert.equal(audio.paused, false);
  await player.playSong('b', { autoplay: false });
  assert.equal(audio.paused, true, 'autoplay:false 时旧音频仍在播放');
  assert.equal(player.state, 'paused');
});

test('player · 失效资源后重新播放同一首会复位媒体元素', async () => {
  const { player, audio } = setup();
  await player.playSong('a');
  audio.fail(4);
  assert.equal(player.state, 'error');
  const loadsBefore = audio.loadCalls;
  // 真实媒体元素在 load() 之前会一直保留 error；重播同一首必须 load() 复位
  await player.playSong('a');
  assert.ok(audio.loadCalls > loadsBefore, '同一 src 重播时没有调用 load() 复位');
  assert.equal(player.state, 'playing');
});

test('player · 删除当前曲后接上下一首，清空队列回到 idle', async () => {
  const { player, audio } = setup();
  await player.playSlugs(['a', 'b']);
  const currentId = player.currentItem.id;
  await player.removeItem(currentId);
  assert.equal(player.currentSong.slug, 'b');
  player.clearQueue();
  assert.equal(player.state, 'idle');
  assert.equal(player.currentSong, null);
  assert.equal(audio.paused, true);
});