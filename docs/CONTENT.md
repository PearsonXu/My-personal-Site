# 内容操作手册

所有内容的唯一来源是 `content/`。改完 → `npm run build` → `git push` → Actions 自动发布。
**第一版就是这条流程：本地编辑 + git，不需要任何后台。**

## 加一首歌

```bash
npm run new:song -- "夜渡" --audio ~/Music/night-ferry.mp3
# 可选：--slug night-ferry --lyrics ./night-ferry.lrc --album river --tags 民谣,夜 --artist "金石竹青"
```

工具会：
1. 把 MP3 复制到 `assets/audio/<slug>.mp3`；
2. 把 LRC 复制到 `content/lyrics/<slug>.lrc`；
3. **逐帧解析真实时长**（不需要 ffmpeg，已与系统解码器对齐验证）；
4. 写出 `content/songs/<slug>.json`。

然后手工补 `about`（支持 Markdown）、`credits`、`tags`。

### 歌曲 JSON 字段

```json
{
  "slug": "night-ferry",
  "title": "夜渡",
  "artist": "金石竹青",
  "composer": "金石竹青",
  "lyricist": "金石竹青",
  "album": "river",
  "tags": ["民谣", "夜"],
  "date": "2026-11-18",
  "duration": 214.5,
  "cover": "auto",
  "audio": { "src": "audio/night-ferry.mp3", "mime": "audio/mpeg", "master": null },
  "lyrics": "night-ferry.lrc",
  "instrumental": false,
  "demo": false,
  "about": "支持 **Markdown** 的介绍。",
  "credits": ["录音：…", "混音：…"]
}
```

- `cover: "auto"` → 构建期按 slug 生成确定性抽象封面（PNG，含 1200×630 的 OG 图）。
  想用自己的图：把文件放进 `assets/img/`，然后写 `"cover": "my-cover.jpg"`。
- `instrumental: true` → 页面显示「纯音乐」空状态，不做歌词高亮。
- `lyrics: null` → 显示「暂无歌词」。
- `demo: true` → **只在 `--demo` 构建里出现**，页面带 DEMO 标记。

### 音频规范

- 公开试听放**转码后的 MP3**（建议 128–192 kbps CBR，44.1 kHz）。
- **母带（WAV / FLAC / AIFF）放 `masters/`，已 gitignore，绝不进公开仓库。**
- 上线前用 `node tools/check-assets.mjs --base <地址>` 确认 MIME / Range / 206。

## 歌词

放 `content/lyrics/<slug>.lrc`，标准 LRC：

```
[ti:夜渡]
[ar:金石竹青]
[offset:0]
[00:12.30]第一句
[00:16.80]第二句
[01:02.00][02:10.00]重复的副歌可以写两个时间标签
```

- 支持 `[mm:ss.xx]`（百分秒）与 `[mm:ss.xxx]`（毫秒）。
- `[offset:500]` 表示歌词整体**提前** 500ms（实际时间 = 标签时间 − offset/1000）。
- 没有时间标签的纯文本也能用：会显示全文，但不做逐句高亮。

## 专辑 / 歌单

`content/albums/<slug>.json`：

```json
{ "slug": "river", "title": "河与灯", "artist": "金石竹青", "date": "2026-11-18",
  "cover": "auto", "about": "…", "tracks": ["night-ferry", "paper-boat"] }
```

`content/playlists/<slug>.json` 同理，曲目字段叫 **`songs`**。
数组顺序就是播放顺序。引用不存在的 slug 会在构建时给出警告并跳过。

## 手记

```bash
npm run new:note -- "写歌的那个晚上" --slug that-night --songs night-ferry --tags 创作
```

格式是 **JSON frontmatter + Markdown 正文**：

```markdown
---
{ "slug": "that-night", "title": "写歌的那个晚上", "date": "2026-11-18",
  "excerpt": "…", "tags": ["创作"], "songs": ["night-ferry"],
  "albums": [], "playlists": [], "cover": "auto", "draft": true }
---

# 正文

支持标题、段落、**粗体**、*斜体*、`code`、链接、图片、列表、引用、代码块。
```

- `draft: true` **不发布**。写完改成 `false`。
- 原始 HTML 一律转义，`javascript:` 之类的链接会被剥掉。
- `songs / albums / playlists` 会在页面底部渲染成可播放的关联卡片。

## 站点信息

`content/site.json`：标题、简介、作者署名、`mediaBase`、外观 / 布局默认值、后端适配层开关、分享选项。
站点只放音乐相关内容，不要在 `author` 里加学术 / 职业背景字段。

## 发布前检查清单

```bash
npm run typecheck && npm test && npm run build
node tools/check-assets.mjs --dist dist
```

确认输出里 `构建模式：production`，且歌曲数是你预期的真实歌曲数。