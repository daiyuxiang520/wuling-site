// 五菱车控 · 官网 Cloudflare Worker
//
// 职责：把 wulingchekong.ccwu.cc 的请求分发给静态源，并修正上游的响应头。
//
// ⚠️ 2026-11-06：雨云对象存储下线（HTTP NoSuchBucket + SFTP 认证失败），
//    原本的「国内 → 雨云 S3」这一路已不可用。CN 改为 GitHub raw：
//    Worker 运行在 Cloudflare 边缘，出站访问 raw.githubusercontent 不经过
//    国内网络，因此它仍然可用 —— 而**国内用户直连 raw 是不行的**，
//    所以这个源只对 Worker 内部有意义。
//
//    长期方案是迁到 Cloudflare Pages（直接连 wuling-site 仓库，
//    不再需要这个 Worker）。本文件保留为「暂时不迁 Pages」的兜底。
//
// 源选择：
//   国内(CN) → GitHub raw；海外 → jsDelivr；两者失败 → GitHub raw。
//
// 缓存分层（v236 从 wuling-site-v2/worker.js 合并进来，旧版完全没有缓存）：
//   · 版本清单  → no-store，且**只走 raw**，绝不走 jsDelivr
//   · 静态资源  → CF 边缘缓存 30 天
//   · HTML 等   → 不缓存（50KB 而已，不值得为它牺牲发版时效）
//
// ⚠️ 为什么清单类不能走 jsDelivr：jsDelivr 对 GitHub 内容有自己的 CDN 缓存，
//    会把旧清单喂给用户 —— 表现为「官网显示旧版本」，更糟的是用户点下载
//    拿到的是已经被清理的旧包。必须走权威源 + no-store。

const CN  = "https://raw.githubusercontent.com/daiyuxiang520/wuling-site/main";
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

/**
 * HTML 的边缘缓存时长（秒）。
 *
 * 原来 HTML 是**完全不缓存**（max-age=0 且子请求没开 cacheEverything），
 * 理由是「保证发版即时生效」。代价是每个访客的首屏都要回源 GitHub raw
 * （源站在海外），实测 TTFB 1~3 秒、整页 1.7s。
 *
 * 60 秒是取舍点：发版本来就是分钟级人工操作，晚 1 分钟生效没有实际影响；
 * 换来的是 60 秒内所有访客直接命中 Cloudflare 边缘缓存（TTFB 降到几十毫秒）。
 *
 * 注意这是**子请求**的缓存（cf.cacheTtl），不是给浏览器看的 ——
 * 浏览器端仍用 max-age=0 + must-revalidate，按 F5 必定拿到最新的。
 */
const HTML_TTL = 60;

const extOf = (p) => p.split("?")[0].split("/").pop().split(".").pop().toLowerCase();
const isNoCache = (p) => NO_CACHE.some((re) => re.test(p));
const isStatic = (p) => ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "woff2"].includes(extOf(p));

/**
 * 修正上游响应。
 *
 * ## 2026-11-06 重大修复：上游 CSP 必须剥掉
 *
 * 换到 GitHub raw 之后，raw 对文件响应会带：
 *     content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox
 *     x-frame-options: deny
 * 这是 GitHub 防止 raw 文件被当成网页执行的保护。但**我们就是拿它当网页**，
 * 原样透传的后果是灾难性的：
 *   · `default-src 'none'` → 所有图片被拦（img-src 回落到 default-src）
 *   · `sandbox` → 页面进入沙箱，**全部脚本被阻止执行**
 * 表现为：页面只剩内联 CSS 的排版，图片全是裂图，`<noscript>` 那段
 * 「下载地址需启用 JavaScript」直接露在最顶部。
 *
 * 页面自己有一份正确的 `<meta http-equiv="Content-Security-Policy">`，
 * 剥掉响应头后由它接管即可。
 *
 * ## 同时清掉 Fastly 的缓存/路由头
 *
 * `x-cache` / `via` / `source-age` / `age` / `expires` 是 GitHub 前置 CDN 的，
 * 透传会让 Cloudflare 的缓存判断和调试信息混淆（比如浏览器看到 `expires`
 * 早于 `cache-control` 时会按更保守的那个来）。
 */
const STRIP_HEADERS = [
  // GitHub raw 的安全头 —— 会直接打死页面
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "cross-origin-resource-policy",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  // 上游 CDN 的缓存/来源信息
  "x-cache", "x-cache-hits", "x-served-by", "x-timer", "via", "source-age",
  "age", "expires",
  // 传输层：body 由 Worker 重新包装，这些头会和实际内容不符
  "content-length", "content-encoding", "transfer-encoding",
  "content-disposition",
];

function fix(r, p) {
  const h = new Headers(r.headers);
  for (const k of STRIP_HEADERS) h.delete(k);
  const e = extOf(p);
  if (MIME[e]) h.set("content-type", MIME[e]);
  // 上游允许任意来源读（GitHub 的 CORS 策略），我们只服务自己的域名，
  // 没必要把这条也带出去
  h.delete("access-control-allow-origin");
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

    // ---- ③ HTML / 其他：边缘缓存 60 秒 ----
    // 详见 [HTML_TTL]。子请求开 cacheEverything 才会让上游响应进 CF 缓存，
    // 否则 Worker 每次都要重新打 GitHub raw。
    let r;
    try {
      r = await fetch((isCN ? CN : OV) + p, { ...o, cf: { cacheTtl: HTML_TTL, cacheEverything: true } });
      // 兜底源同样带上缓存参数：否则 fallback 那一路仍是每次都穿透
      if (!r.ok) {
        r = await fetch(OS2 + p, { ...o, cf: { cacheTtl: HTML_TTL, cacheEverything: true } });
      }
    } catch (e) {
      r = await fetch(OS2 + p, o);
    }
    const out = fix(r, p);
    // s-maxage 给下游 CDN；max-age=0 保证浏览器按 F5 必定重新验证
    out.headers.set("cache-control", "public, max-age=0, s-maxage=" + HTML_TTL + ", must-revalidate");
    return out;
  },
};
