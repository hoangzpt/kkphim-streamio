const fetch = require("node-fetch");
const { URL } = require("url");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

module.exports = async (req, res) => {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1:7000";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const origin = `${proto}://${host}`;
    const reqUrl = new URL(req.url, origin);
    const target = reqUrl.searchParams.get("url");
    const ref = reqUrl.searchParams.get("ref") || "";

    if (!target) {
      res.statusCode = 400;
      return res.end("missing url param");
    }

    const headers = { "User-Agent": UA };
    if (ref) {
      headers["Referer"] = ref;
      headers["Origin"] = ref.replace(/\/$/, "");
    }

    const upstream = await fetch(target, { headers, redirect: "follow" });
    const contentType = upstream.headers.get("content-type") || "";

    res.setHeader("Access-Control-Allow-Origin", "*");

    const looksLikePlaylist =
      upstream.ok &&
      !contentType.includes("html") &&
      (contentType.includes("mpegurl") ||
        contentType.includes("vnd.apple.mpegurl") ||
        target.split("?")[0].toLowerCase().endsWith(".m3u8"));

    if (looksLikePlaylist) {
      const text = await upstream.text();
      // Nếu CDN trả về trang HTML lỗi (chặn bot/Cloudflare) thì không được parse làm playlist
      if (text.trim().startsWith("<") || text.includes("<html") || text.includes("<!DOCTYPE")) {
        res.statusCode = upstream.status === 200 ? 502 : upstream.status;
        res.setHeader("Content-Type", "text/plain");
        return res.end("Upstream CDN blocked proxy request with HTML");
      }

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.statusCode = 200;
      return res.end(rewritePlaylist(text, target, ref, origin));
    }

    res.statusCode = upstream.status;
    res.setHeader("Content-Type", contentType || "application/octet-stream");
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.end(buf);
  } catch (err) {
    res.statusCode = 502;
    return res.end("proxy error: " + (err && err.message));
  }
};

function proxify(absoluteUrl, ref, origin) {
  const qs = new URLSearchParams({ url: absoluteUrl });
  if (ref) qs.set("ref", ref);
  return `${origin}/hls-proxy?${qs.toString()}`;
}

function resolveUrl(maybeRelative, base) {
  try {
    return new URL(maybeRelative, base).toString();
  } catch (e) {
    return maybeRelative;
  }
}

function rewritePlaylist(text, originalUrl, ref, origin) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        // rewrite URI="..." attributes, e.g. #EXT-X-KEY, #EXT-X-MAP
        return line.replace(/URI="([^"]+)"/g, (m, uri) => {
          const abs = resolveUrl(uri, originalUrl);
          return `URI="${proxify(abs, ref, origin)}"`;
        });
      }
      // a media segment or nested playlist URI
      const abs = resolveUrl(trimmed, originalUrl);
      return proxify(abs, ref, origin);
    })
    .join("\n");
}
