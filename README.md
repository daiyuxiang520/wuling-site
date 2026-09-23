# 五菱车控 · 官网

静态官网（单页落地页），部署于 GitHub Pages，自定义域名 `wulingchekong.ccwu.cc`。

## 文件
- `index.html` — 落地页（功能 / 下载 / 更新日志，版本数据自动读取 `geren-update` 仓库的 `update.json`）
- `CNAME` — GitHub Pages 自定义域名
- `icon.png` — App 图标
- `.nojekyll` — 关闭 Jekyll 处理，原样发布静态文件

## 更新网站内容
直接改 `index.html` 后推送到 `main` 分支即可，Pages 会自动重新构建。
