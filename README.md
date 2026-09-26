# 五菱车控 · 官网

静态官网（单页落地页），部署于 GitHub Pages，自定义域名 `wulingchekong.ccwu.cc`。

## 文件
- `index.html` — 落地页（Hero / 功能 / 界面预览 / 下载 / 安装指引 / FAQ / 更新日志）
- `update.json` — 版本与更新说明，供页面**同源**动态填充版本号、下载链接、更新日志、MD5
- `og-image.png` — 社交分享预览图（1200×630）
- `gen_og.py` — 生成 `og-image.png` 的脚本；发版后如需刷新图上的版本号，改 `btxt` 后重跑 `python3 gen_og.py`
- `worker.js` — Cloudflare Worker 分流脚本（国内回源雨云 S3，海外走 jsDelivr / GitHub raw）
- `preview-*.html` — 三套主题的静态预览
- `CNAME` — GitHub Pages 自定义域名
- `icon.png` — App 图标
- `.nojekyll` — 关闭 Jekyll 处理，原样发布静态文件

## 更新网站内容
1. 修改 `index.html` / `update.json`（版本号、更新日志、`apkUrl`）；
2. 推送到 `main` 分支（GitHub Pages 与 jsDelivr 自动生效）；
3. 国内访客经 Cloudflare Worker 回源雨云 S3，需**同步上传 `wuling-site/` 目录到 S3**（`cn-nb2.rains3.com/dump/wuling-site`）。
