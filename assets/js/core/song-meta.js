/**
 * core/song-meta.js — 歌曲的展示性文字（纯逻辑，不碰 DOM）。
 *
 * 构建期模板（components.mjs / song.mjs）与前端重绘（library-ui / home-latest-ui）共用，
 * 保证预渲染的首帧与「换一换」/ 搜索后重绘的列表一字不差。
 */

/** 不作为「风格」展示的标签：类型标签与工程标签 */
const NON_STYLE_TAGS = new Set(['翻唱', '原创', 'demo', 'test', 'instrumental', 'ambient']);

/**
 * 歌曲类型：有原唱即翻唱；否则统称「单曲」（不擅自声称原创）。
 * @param {{ artist?: string, originalArtist?: string, tags?: string[] }} song
 */
export function songKind(song) {
  return song?.originalArtist ? '翻唱' : '单曲';
}

/**
 * 第一个风格标签（如「国风」），没有就返回空串。
 * @param {{ artist?: string, originalArtist?: string, tags?: string[] }} song
 */
export function songStyle(song) {
  const list = Array.isArray(song?.tags) ? song.tags : [];
  return list.find((t) => typeof t === 'string' && t && !NON_STYLE_TAGS.has(t)) || '';
}

/**
 * 列表第二行：翻唱写「原唱 X」，否则写演唱者；有风格标签再接「 · 风格」。
 * 小屋里每首都是同一位演唱者，重复写名字没有信息量，原唱才是听众想知道的。
 * @param {{ artist?: string, originalArtist?: string, tags?: string[] }} song
 */
export function songSubline(song) {
  const who = song?.originalArtist ? `原唱 ${song.originalArtist}` : (song?.artist || '');
  const style = songStyle(song);
  return [who, style].filter(Boolean).join(' · ');
}
