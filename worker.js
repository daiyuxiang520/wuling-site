// 五菱车控官网 · Cloudflare Worker 分流脚本
// 国内(CN)访客  → 回源「雨云 S3」(国内宁波节点，快且稳)，并修正其 Content-Type
// 其他地区访客  → 回源「jsDelivr」(基于 GitHub 仓库的全球 CDN)，失败自动回退 GitHub raw
//
// 部署：CF 控制台 → Workers & Pages → 新建 Worker → 粘贴本文件 → Deploy
//       再到该域名的 Workers Routes 添加路由：wulingchekong.ccwu.cc/*

const CN = "https://cn-nb2.rains3.com/dump/wuling-site";
const OS1 = "https://cdn.jsdelivr.net/gh/daiyuxiang520/wuling-site@main";
const OS2 = "https://raw.githubusercontent.com/daiyuxiang520/wuling-site/main";

// 按后缀补正确的 Content-Type。
// 雨云 S3 一律回 application/octet-stream（浏览器会当成下载）；
// jsDelivr / raw 的 .html 会回 text/plain（浏览器会显示成源码），都要纠正。
const MIME = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8", txt: "text/plain; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon",
  woff2: "font/woff2", webmanifest: "application/manifest+json",
};

function withMime(resp, path) {
  const h = new Headers(resp.headers);
  h.delete("content-disposition");     // 去掉 S3 的强制下载头
  const ext = path.split("?")[0].split("/").pop().split(".").pop().toLowerCase();
  if (MIME[ext]) h.set("content-type", MIME[ext]);
  return new Response(resp.body, { status: resp.status, headers: h });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path === "/" || path === "") path = "/index.html";   // S3 不会自动索引目录
    const qs = url.search || "";
    const isCN = !!(request.cf && request.cf.country === "CN");
    const opt = { headers: request.headers, redirect: "follow" };

    try {
      if (isCN) {
        const r = await fetch(CN + path + qs, opt);
        if (r.ok) return withMime(r, path);
        return withMime(await fetch(OS1 + path + qs, opt), path);   // 雨云异常时回退
      }
      const r = await fetch(OS1 + path + qs, opt);
      if (r.ok) return withMime(r, path);
      return withMime(await fetch(OS2 + path + qs, opt), path);
    } catch (e) {
      return withMime(await fetch(OS2 + path + qs, opt), path);
    }
  },
};
