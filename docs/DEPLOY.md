# 部署（GitHub Pages）

## 现状

| 项 | 值 |
| --- | --- |
| 仓库 | `PearsonXu/My-personal-Site`（**项目站点**） |
| 自定义域名 | `www.xuzhaoqing.com`（仓库根 `CNAME`） |
| 当前 base path | `/`（因为绑了自定义域名） |
| 去掉 CNAME 后 | `https://pearsonxu.github.io/My-personal-Site/`，base 变成 `/My-personal-Site/` |

> ⚠️ 一个仓库只能声明一个自定义域名。改 `CNAME` 前先确认目标域名没有被别的仓库占用，
> 否则会把域名从那个站点抢过来，导致对方掉线。

## 一次性设置（必做）

改版后站点有了构建步骤，因此从「分支发布」切换到 **GitHub Actions 发布**：

1. 仓库 → **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
2. 确认 **Custom domain** 仍是 `www.xuzhaoqing.com`，**Enforce HTTPS** 勾选。
3. push 到 `main`，`.github/workflows/deploy.yml` 会自动跑：
   `npm ci` → `typecheck` → `test` → `build`（生产，排除 DEMO）→ `check-assets` → 上传 `dist/` → 部署。

## 部署后自动复验

工作流现在有三个 job：

1. **build** — `npm ci` → `typecheck` → `test` → **生产 build** → `check-assets` → 上传 `dist/`
2. **deploy** — `actions/deploy-pages`
3. **verify** — 部署完成后跑 `node tools/verify-live.mjs --base https://www.xuzhaoqing.com`，
   对**正式域名**复验：HTTPS 与跳转、8 条主路由、404、旧站已下线、
   catalog 结构与署名、未混入 DEMO、空状态、无旧身份残留、
   11 个资源的 200 与 MIME、深层页面相对资源、宿主 Range/206、
   全站唯一 audio 且在 `#page-root` 之外、播放器控件与外观入口、
   canonical/OG、手记深链接、单曲深链接（有歌才逐首验）、robots/sitemap/.nojekyll。
   报告作为 artifact `live-verification` 上传。

工作流里 **test 在 build 之前**是刻意的：测试内部会反复重建 `dist`（含 DEMO），
最后一步必须是干净的生产构建，否则会把测试音发上线。

手动复验：

```bash
npm run verify:live      # 纯 HTTP 复验，输出 docs/LIVE-VERIFICATION.md
npm run browser:live     # 真实 Chrome 复验线上播放器与三套外观，输出 docs/BROWSER-LIVE-RESULTS.md
```

## base path 怎么处理（统一 helper，绝对路径）

**所有站内链接与资源在构建期就生成绝对路径**，由一个 base 统一拼接：

```
href="/songs/"                 href="/songs/<slug>/"
href="/about/"                 src="/assets/css/site.css"
```

- 默认 `base = /`（自定义域名根目录）
- 部署到子目录：`node tools/build-site.mjs --base /My-personal-Site/`
  → 全部变成 `/My-personal-Site/songs/`、`/My-personal-Site/assets/...`
- 构建 base 写进 `<html data-base="…">`；`app.js` 若发现运行时 base 与之不同
  （例如把同一份产物临时放到子目录预览），会统一改写本站路径兜底，
  **不动 canonical / og 这类对外规范地址**。

### 为什么不再用「按页面深度的相对路径」

早期实现给每页算 `./`、`../`、`../../` 前缀。它的正确性依赖
「页面被服务在与生成深度完全一致的 URL 上」。而 **404 页会被挂在任意深度**，
于是相对路径逐跳累积成真实故障地址：

```
/songs/demo-paper-boat/songs/songs/about/me/notes/songs/demo-night-ferry/songs/demo-paper-boat/
```

改成绝对路径后，**任意深度、任意页面、404 页的链接与资源都完全一致**，
这类累积从结构上不可能再发生。详见 `docs/INCIDENT-BLANK-PAGE.md`。

本地实测（均已通过）：

```bash
npm run build:demo && npm run serve                    # base = /
node tools/build-site.mjs --demo --base /My-personal-Site/
BASE_PATH=/My-personal-Site npm run serve              # 子目录
```

两种模式下页面、深层资源、404 页链接与点击链路全部正确。

## 回退到分支发布（不推荐）

如果不想用 Actions：`node tools/build-site.mjs --outDir` 目前固定输出 `dist/`，
需要把 `dist/` 内容提交到发布分支。**不要**把 `dist/` 提交到 `main`（已 gitignore），
否则源文件和产物会互相覆盖。推荐还是用 Actions。

## 音频迁到对象存储

只改 `content/site.json` 一个字段：

```json
{ "mediaBase": "https://your-cdn.example.com/music/" }
```

之后所有 `audio/xxx.mp3` 都会解析成 `https://your-cdn.example.com/music/audio/xxx.mp3`，
歌曲 JSON 一个字都不用改。迁移后**必须**跑：

```bash
npm run build && npm run serve
node tools/check-assets.mjs --base http://localhost:8000
```

重点看三项：`Content-Type: audio/*`、`206 + Content-Range`、`Access-Control-Allow-Origin`。
缺 Range → 拖动进度条会坏；缺 CORS → 跨域歌词读取与海报导出会坏。

**不要**把带签名的临时地址写进 `content/`：那是会过期的，不能当永久分享链接。
需要私有音源时，让对象存储对公开试听目录开公共读，或改用长期有效的 CDN 路径。

## 域名 / DNS 检查

```bash
dig www.xuzhaoqing.com +short
curl -I https://www.xuzhaoqing.com/songs/<slug>/
```

裸域 `xuzhaoqing.com` 建议补齐四条 A 记录（`185.199.108/109/110/111.153`）。