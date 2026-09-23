// 五菱车控官网 · Cloudflare Worker 分流脚本
// 作用：国内(CN)访客回源「雨云 S3」(国内节点、快且稳)，并修正其 Content-Type；
//       海外访客回源「GitHub Pages」(海外节点、CF 缓存)。
// 部署：CF 控制台 → Workers & Pages → 新建 Worker → 粘贴本文件 → 保存；
//       再到该域名的「Workers Routes」添加路由 wulingchekong.ccwu.cc/* (或 *wulingchekong.ccwu.cc/*)。

const S3_BASE = "https://cn-nb2.rains3.com/dump/wuling-site";   // 国内源：雨云 S3 镜像
const GH_BASE = "https://daiyuxiang520.github.io/wuling-site"; // 海外源：GitHub Pages

// 根据文件后缀推断正确的 Content-Type（雨云 S3 默认会回 octet-stream，浏览器会误判成下载）
function fixContentType(headers, pathname) {
  const h = new Headers(headers);
  const ct = (h.get("content-type") || "").toLowerCase();
  const p = pathname.toLowerCase();
  if (!ct.includes("text/") && !ct.includes("image/") && !ct.includes("application/javascript") && !ct.includes("application/json")) {
    if (p.endsWith(".html") || p.endsWith(".htm")) h.set("content-type", "text/html; charset=utf-8");
    else if (p.endsWith(".png")) h.set("content-type", "image/png");
    else if (p.endsWith(".jpg") || p.endsWith(".jpeg")) h.set("content-type", "image/jpeg");
    else if (p.endsWith(".svg")) h.set("content-type", "image/svg+xml");
    else if (p.endsWith(".css")) h.set("content-type", "text/css");
    else if (p.endsWith(".js")) h.set("content-type", "application/javascript");
    else if (p.endsWith(".json")) h.set("content-type", "application/json");
    else if (p.endsWith(".ico")) h.set("content-type", "image/x-icon");
    else if (p.endsWith(".webmanifest")) h.set("content-type", "application/manifest+json");
  }
  // 关闭 S3 的对象存储下载头，避免浏览器弹下载
  h.delete("content-disposition");
  return h;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const country = request.cf ? request.cf.country : null;
    // 根路径按目录处理（两边都会回 index.html）
    const path = url.pathname === "/" ? "/" : url.pathname;
    const qs = url.search || "";

    // —— 国内访客：走雨云 S3，并修正 Content-Type ——
    if (country === "CN") {
      const upstream = S3_BASE + path + qs;
      try {
        const r = await fetch(upstream, { method: request.method, headers: request.headers });
        return new Response(r.body, { status: r.status, headers: fixContentType(r.headers, path) });
      } catch (e) {
        // 雨云不可达时回退到 GitHub，保证可用
        return fetch(GH_BASE + path + qs, { method: request.method, headers: request.headers });
      }
    }

    // —— 海外访客：走 GitHub Pages ——
    return fetch(GH_BASE + path + qs, { method: request.method, headers: request.headers });
  }
};
