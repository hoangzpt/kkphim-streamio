const API = "https://phimapi.com";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
}

function sendJson(res, body, status = 200) {
  cors(res);
  res.status(status).json(body);
}

function imageUrl(value) {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://phimimg.com/${String(value).replace(/^\/+/, "")}`;
}

function cleanHtml(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function kk(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const r = await fetch(`${API}${path}`, {
      headers: {
        accept: "application/json",
        "user-agent": "KKPhim-Stremio-Addon/2.0"
      },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`KKPhim HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function itemsOf(data) {
  return data?.data?.items || data?.items || [];
}

function itemOf(data) {
  return data?.data?.item || data?.item || null;
}

function episodesOf(data) {
  return data?.data?.item?.episodes || data?.episodes || [];
}

function stremioType(item) {
  return item?.tmdb?.type === "tv" ||
    item?.type === "phim-bo" ||
    item?.type === "tv-shows" ||
    Number(item?.episode_total || 0) > 1 ? "series" : "movie";
}

function makeId(slug) {
  return `kkphim:${slug}`;
}

function parseId(id) {
  if (!id.startsWith("kkphim:")) return null;
  const p = id.split(":");
  return {
    slug: p[1],
    server: p[2] ? decodeURIComponent(p[2]) : null,
    episode: p[3] ? decodeURIComponent(p.slice(3).join(":")) : null
  };
}

function preview(item) {
  const poster = imageUrl(item.poster_url || item.thumb_url);
  const meta = {
    id: makeId(item.slug),
    type: stremioType(item),
    name: item.name || item.origin_name,
    poster,
    posterShape: "poster",
    description: cleanHtml(item.content || ""),
    releaseInfo: item.year ? String(item.year) : undefined,
    imdbRating: item.tmdb?.vote_average ? Number(item.tmdb.vote_average) : undefined
  };
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined));
}

async function getMovie(id) {
  if (id.startsWith("kkphim:")) {
    const parsed = parseId(id);
    if (!parsed?.slug) return null;
    const data = await kk(`/v1/api/phim/${encodeURIComponent(parsed.slug)}`);
    const item = itemOf(data);
    if (!item) return null;
    item.__episodes = episodesOf(data);
    return { item, parsed, requestedId: id };
  }

  if (/^tt\d+$/i.test(id)) {
    const data = await kk(`/imdb/title/${encodeURIComponent(id)}`);
    const item = itemOf(data);
    if (!item) return null;
    item.__episodes = episodesOf(data);
    return { item, parsed: {}, requestedId: id };
  }

  const tm = id.match(/^tmdb:(movie|tv):(\d+)$/i);
  if (tm) {
    const data = await kk(`/tmdb/${tm[1]}/${tm[2]}`);
    const item = itemOf(data);
    if (!item) return null;
    item.__episodes = episodesOf(data);
    return { item, parsed: {}, requestedId: id };
  }

  return null;
}

async function catalog(catalogId, q) {
  const page = Math.max(1, Number(q.page || 1));
  const limit = Math.min(64, Math.max(1, Number(q.limit || 24)));
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));

  for (const key of ["category", "country", "year", "sort_field", "sort_type", "sort_lang"]) {
    if (q[key]) params.set(key, q[key]);
  }

  let endpoint;

  if (q.search) {
    endpoint = `/v1/api/tim-kiem?keyword=${encodeURIComponent(q.search)}&${params.toString()}`;
  } else if (catalogId === "home") {
    endpoint = "/v1/api/home";
  } else if (catalogId === "new") {
    endpoint = `/v1/api/danh-sach?${params.toString()}`;
  } else if (["movies", "series", "animation", "theatrical"].includes(catalogId)) {
    const map = {
      movies: "phim-le",
      series: "phim-bo",
      animation: "hoat-hinh",
      theatrical: "phim-chieu-rap"
    };
    endpoint = `/v1/api/danh-sach/${map[catalogId]}?${params.toString()}`;
  } else if (catalogId.startsWith("genre:")) {
    endpoint = `/v1/api/the-loai/${encodeURIComponent(catalogId.slice(6))}?${params.toString()}`;
  } else if (catalogId.startsWith("country:")) {
    endpoint = `/v1/api/quoc-gia/${encodeURIComponent(catalogId.slice(8))}?${params.toString()}`;
  } else if (catalogId.startsWith("year:")) {
    endpoint = `/v1/api/nam/${encodeURIComponent(catalogId.slice(5))}?${params.toString()}`;
  } else {
    return { metas: [] };
  }

  const data = await kk(endpoint);
  return { metas: itemsOf(data).map(preview) };
}

function buildMeta(item, requestedId) {
  const type = stremioType(item);
  const poster = imageUrl(item.poster_url || item.thumb_url);
  const background = imageUrl(item.thumb_url || item.poster_url);

  const meta = {
    id: requestedId,
    type,
    name: item.name || item.origin_name,
    poster,
    background,
    posterShape: "poster",
    description: cleanHtml(item.content || ""),
    releaseInfo: item.year ? String(item.year) : undefined,
    runtime: item.time || undefined,
    language: item.lang || undefined,
    genres: Array.isArray(item.category) ? item.category.map(x => x.name).filter(Boolean) : [],
    country: Array.isArray(item.country) ? item.country.map(x => x.name).filter(Boolean) : [],
    cast: Array.isArray(item.actor) ? item.actor.filter(Boolean) : [],
    director: Array.isArray(item.director) ? item.director.filter(Boolean) : [],
    imdbRating: item.tmdb?.vote_average ? Number(item.tmdb.vote_average) : undefined
  };

  if (type === "series") {
    const videos = [];
    for (const server of item.__episodes || []) {
      for (const ep of server.server_data || []) {
        videos.push({
          id: `kkphim:${item.slug}:${encodeURIComponent(server.server_name || "Server")}:${encodeURIComponent(ep.slug || ep.name || "1")}`,
          title: ep.name || "Tập",
          thumbnail: poster
        });
      }
    }
    meta.videos = videos;
    if (videos[0]) meta.behaviorHints = { defaultVideoId: videos[0].id };
  }

  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined));
}

function streamsFrom(item, parsed) {
  const streams = [];
  for (const server of item.__episodes || []) {
    if (parsed?.server && server.server_name !== parsed.server) continue;

    for (const ep of server.server_data || []) {
      if (parsed?.episode && ep.slug !== parsed.episode && ep.name !== parsed.episode) continue;

      if (ep.link_m3u8) {
        streams.push({
          name: server.server_name || "KKPhim",
          title: `${ep.name || "Video"} • ${server.server_name || "Server"}`,
          url: ep.link_m3u8,
          behaviorHints: {
            bingeGroup: `kkphim-${server.server_name || "server"}`
          }
        });
      }
    }
  }
  return streams;
}

const aliases = {
  action: "genre:hanh-dong",
  romance: "genre:tinh-cam",
  comedy: "genre:hai-huoc",
  horror: "genre:kinh-di",
  fantasy: "genre:than-thoai",
  korea: "country:han-quoc",
  china: "country:trung-quoc",
  usa: "country:au-my",
  japan: "country:nhat-ban",
  vietnam: "country:viet-nam",
  "2026": "year:2026",
  "2025": "year:2025",
  "2024": "year:2024"
};

const manifest = {
  id: "community.kkphim.stremio",
  version: "2.0.0",
  name: "KKPhim",
  description: "KKPhim catalog, metadata and streams for Stremio.",
  logo: "https://kkphim.com/favicon.ico",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  catalogs: [
    { type: "movie", id: "home", name: "KKPhim • Trang chủ", extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }] },
    { type: "movie", id: "new", name: "KKPhim • Phim mới", extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }] },
    { type: "movie", id: "movies", name: "KKPhim • Phim lẻ", extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }] },
    { type: "series", id: "series", name: "KKPhim • Phim bộ", extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }] },
    { type: "movie", id: "animation", name: "KKPhim • Hoạt hình", extra: [{ name: "search", isRequired: false }] },
    { type: "movie", id: "theatrical", name: "KKPhim • Chiếu rạp", extra: [{ name: "search", isRequired: false }] },
    { type: "movie", id: "action", name: "KKPhim • Hành động" },
    { type: "movie", id: "romance", name: "KKPhim • Tình cảm" },
    { type: "movie", id: "comedy", name: "KKPhim • Hài hước" },
    { type: "movie", id: "horror", name: "KKPhim • Kinh dị" },
    { type: "movie", id: "fantasy", name: "KKPhim • Thần thoại" },
    { type: "movie", id: "korea", name: "KKPhim • Hàn Quốc" },
    { type: "movie", id: "china", name: "KKPhim • Trung Quốc" },
    { type: "movie", id: "japan", name: "KKPhim • Nhật Bản" },
    { type: "movie", id: "usa", name: "KKPhim • Âu Mỹ" },
    { type: "movie", id: "2026", name: "KKPhim • 2026" },
    { type: "movie", id: "2025", name: "KKPhim • 2025" },
    { type: "movie", id: "2024", name: "KKPhim • 2024" }
  ]
};

function getOriginalPath(req) {
  // Vercel rewrite keeps the original request path available to the handler.
  return (req.url || "/").split("?")[0];
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  const originalPath = getOriginalPath(req);

  try {
    if (originalPath === "/" || originalPath === "") {
      cors(res);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KKPhim Stremio Addon</title>
<style>body{font-family:Arial,sans-serif;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0}.box{max-width:650px;padding:36px;text-align:center}a{display:inline-block;background:#e50914;color:white;padding:14px 22px;border-radius:10px;text-decoration:none;margin:8px}.code{word-break:break-all;color:#aaa}</style></head>
<body><div class="box"><h1>KKPhim → Stremio</h1><p>Addon đã được triển khai trên Vercel.</p><a href="/api/manifest.json">Kiểm tra Manifest</a><a href="stremio:///api/manifest.json">Mở Stremio</a><p class="code">Manifest: ${req.headers.host}/api/manifest.json</p></div></body></html>`);
    }

    if (originalPath === "/api/manifest.json" || originalPath === "/api/manifest") {
      return sendJson(res, manifest);
    }

    const m = originalPath.match(/^\/api\/(catalog|meta|stream)\/([^/]+)\/(.+?)(?:\.json)?$/);
    if (!m) return sendJson(res, { error: "Not found", path: originalPath }, 404);

    const resource = m[1];
    const type = m[2];
    const id = decodeURIComponent(m[3]);

    if (resource === "catalog") {
      const q = { ...req.query };
      const catalogId = aliases[id] || id;
      return sendJson(res, await catalog(catalogId, q));
    }

    if (resource === "meta") {
      const resolved = await getMovie(id);
      if (!resolved) return sendJson(res, { meta: {} });
      return sendJson(res, { meta: buildMeta(resolved.item, resolved.requestedId) });
    }

    if (resource === "stream") {
      const resolved = await getMovie(id);
      if (!resolved) return sendJson(res, { streams: [] });
      return sendJson(res, { streams: streamsFrom(resolved.item, resolved.parsed) });
    }
  } catch (err) {
    console.error(err);
    return sendJson(res, {
      error: "KKPhim API error",
      detail: String(err.message || err)
    }, 502);
  }
};
