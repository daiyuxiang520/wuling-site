// 五菱车控 · 官网 Cloudflare Worker
//
// 职责：把 wulingchekong.ccwu.cc 的请求分发给静态源，并修正雨云 S3 的响应头。
//
// 源选择（v236 保留自旧版，不能删 —— 这是海外可用性的关键）：
//   国内(CN) → 雨云 S3；海外 → jsDelivr；两者失败 → GitHub raw。
//
// 缓存分层（v236 从 wuling-site-v2/worker.js 合并进来，旧版完全没有缓存）：
//   · 版本清单  → no-store，且**只走雨云/GitHub raw**，绝不走 jsDelivr
//   · 静态资源  → CF 边缘缓存 30 天
//   · HTML 等   → 不缓存（37KB 而已，不值得为它牺牲发版时效）
//
// ⚠️ 为什么清单类不能走 jsDelivr：jsDelivr 对 GitHub 内容有自己的 CDN 缓存，
//    会把旧清单喂给用户 —— 表现为「App 里检查更新一直提示已是最新」，
//    而这个失败方向恰好是最坑的（用户永远收不到新版）。必须走权威源 + no-store。

const CN  = "https://cn-nb2.rains3.com/dump/wuling-site";
const OV  = "https://cdn.jsdelivr.net/gh/daiyuxiang520/wuling-site@main";
const OS2 = "https://raw.githubusercontent.com/daiyuxiang520/wuling-site/main";

// 按后缀补正确的 Content-Type。
// 雨云 S3 一律回 application/octet-stream（浏览器会当成下载），必须纠正。
//
// v236 补齐：txt / xml / htm / gif / webp / woff2。
//   旧表缺 txt 与 xml —— 后果是 robots.txt、sitemap.xml 以 octet-stream 下发。
//   多数搜索引擎能容忍，但 Content-Type 不对属于无谓风险，也影响部分爬虫的解析优先级。
const MIME = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8", txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon",
  woff2: "font/woff2", webmanifest: "application/manifest+json",
};

// 绝不缓存的路径（且强制走权威源，见上方注释）。
const NO_CACHE = [/^\/update.*\.json$/i, /^\/manifest.*\.json$/i];

// 可缓存的静态资源后缀。注意 html 不在其中 —— 首页要保证发版即时生效。
const STATIC_TTL = 2592000; // 30 天

const extOf = (p) => p.split("?")[0].split("/").pop().split(".").pop().toLowerCase();
const isNoCache = (p) => NO_CACHE.some((re) => re.test(p));
const isStatic = (p) => ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "woff2"].includes(extOf(p));

function fix(r, p) {
  const h = new Headers(r.headers);
  h.delete("content-disposition"); // 去掉 S3 的强制下载头
  const e = extOf(p);
  if (MIME[e]) h.set("content-type", MIME[e]);
  return new Response(r.body, { status: r.status, headers: h });
}

export default {
  async fetch(req) {
    const u = new URL(req.url);
    // S3 不会自动索引目录，根路径显式映射到 index.html
    const p = (u.pathname === "/" ? "/index.html" : u.pathname) + (u.search || "");
    const isCN = !!(req.cf && req.cf.country === "CN");
    const o = { headers: req.headers };

    // ---- ① 版本清单：权威源 + 绝不缓存 ----
    if (isNoCache(p)) {
      let out;
      try {
        out = fix(await fetch(CN + p, { ...o, cf: { cacheTtl: 0, cacheEverything: false } }), p);
      } catch (e) {
        out = fix(await fetch(OS2 + p, o), p);
      }
      out.headers.set("cache-control", "no-store");
      return out;
    }

    // ---- ② 静态资源：CF 边缘缓存 30 天 ----
    // cacheEverything 是关键：雨云没设 Cache-Control，CF 默认不缓存 fetch 到的响应，
    // 必须显式声明，否则每个访客的图片/图标全量穿透回源。
    if (isStatic(p)) {
      let r;
      try {
        r = await fetch((isCN ? CN : OV) + p, { ...o, cf: { cacheTtl: STATIC_TTL, cacheEverything: true } });
        if (!r.ok) r = await fetch(OS2 + p, o);
      } catch (e) {
        r = await fetch(OS2 + p, o);
      }
      const out = fix(r, p);
      out.headers.set("cache-control", "public, max-age=" + STATIC_TTL);
      return out;
    }

    // ---- ③ HTML / 其他：不缓存，保证发版即时生效 ----
    let r;
    try {
      r = await fetch((isCN ? CN : OV) + p, o);
      if (!r.ok) r = await fetch(OS2 + p, o);
    } catch (e) {
      r = await fetch(OS2 + p, o);
    }
    const out = fix(r, p);
    out.headers.set("cache-control", "public, max-age=0, must-revalidate");
    return out;
  },
};
