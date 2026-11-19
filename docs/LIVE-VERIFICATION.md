# 线上正式部署复验

> 由 `node tools/verify-live.mjs` 自动生成。目标：https://www.xuzhaoqing.com
> 运行时间：2026-11-19T09:49:11.037Z
> **18 PASS · 1 N/A · 0 FAIL**

N/A 表示当前条件下不适用（例如曲库为空时没有单曲页），不是失败。

## 域名与 HTTPS

| 项 | 结果 | 实测 |
| --- | --- | --- |
| 正式域名首页 200 且证书有效 | PASS | HTTP 200（TLS 握手成功） |
| http 强制跳转 https | PASS | 301 → https://www.xuzhaoqing.com/ |
| 裸域跳转 www | PASS | 301 → https://www.xuzhaoqing.com/ |

## 页面路由

| 项 | 结果 | 实测 |
| --- | --- | --- |
| 全部主路由 200 | PASS | 8 条全部 200 |
| 不存在的路径返回 404 | PASS | 404 + 自定义 404 页 |
| 旧站 /legacy/ 已下线 | PASS | 404（已按要求移除） |

## 目录与空状态

| 项 | 结果 | 实测 |
| --- | --- | --- |
| catalog.json 可读且结构正确 | PASS | 歌曲 1 · 专辑 0 · 歌单 0 · 手记 2 |
| 生产构建未混入 DEMO | PASS | 无 DEMO 曲目、无 DEMO 标记 |
| 曲库为空时显示正确空状态 | N/A | 已有 1 首真实歌曲 |
| 无旧身份 / 专业背景残留 | PASS | 5 个入口全部干净 |

## 资源路径

| 项 | 结果 | 实测 |
| --- | --- | --- |
| CSS / JS / 数据 / 图片全部 200 且 MIME 正确 | PASS | 11 个资源全部 200 且 MIME 正确 |
| 深层页面的相对资源解析正确 | PASS | /notes/hello-music-house/ 的 8 个 ../../assets 引用全部 200 |
| 宿主支持 Range / 206（进度拖动的前提） | PASS | 206 · bytes 0-1023/231936 · Accept-Ranges: bytes |

## 播放器

| 项 | 结果 | 实测 |
| --- | --- | --- |
| 全站唯一 audio 且在 #page-root 之外 | PASS | 3 个页面均为 1 个 audio，且与播放器同在 page-root 之外 |
| 播放器控件与外观入口就位 | PASS | 控件齐全 · 外观入口存在 · 默认 cloud + auto |

## 分享元数据

| 项 | 结果 | 实测 |
| --- | --- | --- |
| 首页 canonical / OG 指向正式域名 | PASS | canonical=https://www.xuzhaoqing.com/ · og:image 200 image/png |
| 手记深链接直达 + 刷新 + 独立元数据 | PASS | /notes/hello-music-house/ 直达与刷新均 200，canonical 与标题独立 |

## 单曲深链接

| 项 | 结果 | 实测 |
| --- | --- | --- |
| 逐首直达 / 刷新 / 元数据 / 音源 Range | PASS | 1 首全部直达 200 + canonical + 播放按钮 + 音源 206 audio/* |

## Pages 附属文件

| 项 | 结果 | 实测 |
| --- | --- | --- |
| robots / sitemap / .nojekyll 就位 | PASS | robots 200 · sitemap 200 且指向正式域名 · .nojekyll 200 |

