// シンプルなWebプロキシ (Node.js 18+ / 外部依存なし)
// 起動: node server.js   →  http://localhost:8080
// 環境変数: PORT, PROXY_USER, PROXY_PASS (設定するとBasic認証が有効になります)

const http = require("http");
const dns = require("dns").promises;
const net = require("net");

const PORT = process.env.PORT || 8080;
const USER = process.env.PROXY_USER;
const PASS = process.env.PROXY_PASS;
const MAX_BYTES = 10 * 1024 * 1024; // 10MBまで
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;

const HOME = `<!doctype html><html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Web Proxy</title>
<style>
body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f5f4;color:#1c1917}
form{background:#fff;padding:2rem;border-radius:12px;box-shadow:0 2px 12px #0001;width:min(92vw,520px)}
h1{margin:0 0 1rem;font-size:1.3rem}
input{width:100%;box-sizing:border-box;padding:.7rem;font-size:1rem;border:1px solid #d6d3d1;border-radius:8px}
button{margin-top:.8rem;width:100%;padding:.7rem;font-size:1rem;border:0;border-radius:8px;background:#1c1917;color:#fff;cursor:pointer}
</style>
<form action="/proxy" method="get">
<h1>Web Proxy</h1>
<input name="url" placeholder="https://example.com" required>
<button>開く</button>
</form></html>`;

// ---- SSRF対策: 内部ネットワーク宛てを拒否 ----
function isPrivateIP(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("::ffff:")) return isPrivateIP(l.slice(7));
    return l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") ||
      l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb");
  }
  return true;
}

async function assertSafe(u) {
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("http/httpsのみ対応しています");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("ポートは80/443のみ許可されています");
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIP(a.address))) {
    throw new Error("内部ネットワークへのアクセスは許可されていません");
  }
}

// ---- HTML書き換え: リンクやリソースをプロキシ経由にする ----
const prox = (abs) => "/proxy?url=" + encodeURIComponent(abs);
function toAbs(v, base) {
  try { return new URL(v, base).href; } catch { return null; }
}
function rewriteHTML(html, base) {
  html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
  html = html.replace(
    /(\s(?:href|src|action|poster)\s*=\s*)(["'])(.*?)\2/gi,
    (m, pre, q, val) => {
      if (/^(#|javascript:|data:|mailto:|tel:|blob:)/i.test(val.trim())) return m;
      const abs = toAbs(val.trim(), base);
      return abs ? `${pre}${q}${prox(abs)}${q}` : m;
    }
  );
  html = html.replace(/(\ssrcset\s*=\s*)(["'])(.*?)\2/gi, (m, pre, q, val) => {
    const out = val.split(",").map((part) => {
      const [u, ...rest] = part.trim().split(/\s+/);
      const abs = toAbs(u, base);
      return abs ? [prox(abs), ...rest].join(" ") : part;
    });
    return `${pre}${q}${out.join(", ")}${q}`;
  });
  return rewriteCSS(html, base);
}
function rewriteCSS(css, base) {
  return css.replace(/url\(\s*(["']?)(?!data:|#)(.*?)\1\s*\)/gi, (m, q, val) => {
    const abs = toAbs(val, base);
    return abs ? `url(${q}${prox(abs)}${q})` : m;
  });
}

// ---- 取得処理 (リダイレクトも1ホップずつ検証) ----
async function fetchSafe(target) {
  let current = target;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertSafe(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (compatible; SimpleWebProxy/1.0)", accept: "*/*" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), current);
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error("リダイレクトが多すぎます");
}

function authorized(req) {
  if (!USER || !PASS) return true;
  const h = req.headers.authorization || "";
  const [u, p] = Buffer.from(h.replace(/^Basic /, ""), "base64").toString().split(":");
  return u === USER && p === PASS;
}

http.createServer(async (req, res) => {
  if (!authorized(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="proxy"' });
    return res.end("認証が必要です");
  }
  const reqUrl = new URL(req.url, "http://localhost");

  if (reqUrl.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(HOME);
  }
  if (reqUrl.pathname !== "/proxy") {
    res.writeHead(404);
    return res.end("Not found");
  }

  try {
    let raw = reqUrl.searchParams.get("url") || "";
    if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
    const { res: up, finalUrl } = await fetchSafe(new URL(raw));

    const type = up.headers.get("content-type") || "application/octet-stream";
    const len = Number(up.headers.get("content-length") || 0);
    if (len > MAX_BYTES) throw new Error("ファイルが大きすぎます");
    let buf = Buffer.from(await up.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error("ファイルが大きすぎます");

    const headers = { "content-type": type, "x-content-type-options": "nosniff" };
    if (/text\/html/i.test(type)) {
      buf = Buffer.from(rewriteHTML(buf.toString("utf8"), finalUrl.href));
    } else if (/text\/css/i.test(type)) {
      buf = Buffer.from(rewriteCSS(buf.toString("utf8"), finalUrl.href));
    }
    res.writeHead(up.status, headers);
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("取得に失敗しました: " + e.message);
  }
}).listen(PORT, () => console.log(`Proxy running: http://localhost:${PORT}`));