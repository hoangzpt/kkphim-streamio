const API = "https://phimapi.com";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
}

function json(res, body, status = 200) {
  cors(res);
  res.status(status).json(body);
}

function imageUrl(value) {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://phimimg.com/${String(value).replace(/^\/+/, "")}`;
}

function cleanHtml(s = "") {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isSeries(movie) {
  return movie?.tmdb?.type === "tv" ||
    ["phim-bo", "tv-shows"].includes(movie?.type) ||
    Number(movie?.episode_total || 0) > 1;
}

function stremioType(movie) {
  return isSeries(movie) ? "series" : "movie";
}

function kkId(slug) {
  return `kkphim:${slug}`;
}

function parseKkId(id) {
  if (!id || !id.startsWith("kkphim:")) return null;
  const parts = id.split(":");
  return {
    slug: parts[1],
    server: parts[2] ? decodeURIComponent(parts[2]) : null,
    episode: parts[3] ? decodeURIComponent(parts.slice(3).join(":")) : null
  };
}

async function api(path, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}${path}`, {
      headers: { accept: "application/json", "user-agent": "KKPhim-Stremio-Addon/1.0" },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`KKPhim HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractItems(data) {
  return data?.data?.items || data?.items || [];
}

function extractMovie(data) {
  return data?.data?.item || data?.movie || data?.data || null;
}

function extractEpisodes(data, movie) {
  return data?.data?.item?.episodes || data?.episodes || movie?.episodes || [];
}

function preview(item) {
  const type = item?.tmdb?.type === "tv" || item?.type === "phim-bo" || item?.type === "tv-shows"
    ? "series" : "movie";
  const poster = imageUrl(item.poster_url || item.thumb_url);
  const meta = {
    id: kkId(item.slug),
    type,
    name: item.name || item.origin_name,
    poster,
    releaseInfo: item.year ? String(item.year) : undefined,
    description: cleanHtml(item.content || ""),
    imdbRating: item.tmdb?.vote_average ? String(item.tmdb.vote_average) : undefined
  };
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined));
}

function buildMeta(movie, requestedId) {
  const type = stremioType(movie);
  const poster = imageUrl(movie.poster_url || movie.thumb_url);
  const background = imageUrl(movie.thumb_url || movie.poster_url);
  const videos = [];

  const episodes = movie.__episodes || [];
  for (let si = 0; si < episodes.length; si++) {
    const server = episodes[si];
    for (let ei = 0; ei < (server.server_data || []).length; ei++) {
      const ep = server.server_data[ei];
      const videoId = `kkphim:${movie.slug}:${encodeURIComponent(server.server_name || `Server ${si + 1}`)}:${encodeURIComponent(ep.slug || ep.name || String(ei + 1))}`;
      videos.push({
        id: videoId,
        title: ep.name || `Tập ${ei + 1}`,
        released: new Date(movie.modified?.time || Date.now()).toISOString(),
        thumbnail: poster
      });
    }
  }

  const meta = {
    id: requestedId,
    type,
    name: movie.name || movie.origin_name,
    poster,
    background,
    description: cleanHtml(movie.content || ""),
    releaseInfo: movie.year ? String(movie.year) : undefined,
    runtime: movie.time || undefined,
    language: movie.lang || undefined,
    country: Array.isArray(movie.country) ? movie.country.map(x => x.name).filter(Boolean).join(", ") : undefined,
    genres: Array.isArray(movie.category) ? movie.category.map(x => x.name).filter(Boolean) : [],
    cast: Array.isArray(movie.actor) ? movie.actor : [],
    director: Array.isArray(movie.director) ? movie.director : [],
    imdbRating: movie.tmdb?.vote_average ? String(movie.tmdb.vote_average) : undefined
  };

  if (type === "series") {
    meta.videos = videos;
    if (videos[0]) meta.behaviorHints = { defaultVideoId: videos[0].id };
  }

  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined));
}

function streamsFromEpisodes(episodes, preferredServer = null, preferredEpisode = null) {
  const streams = [];
  for (const server of episodes || []) {
    if (preferredServer && server.server_name !== preferredServer) continue;
    for (const ep of server.server_data || []) {
      if (preferredEpisode && ep.slug !== preferredEpisode && ep.name !== preferredEpisode) continue;
      if (ep.link_m3u8) {
        streams.push({
          name: `${server.server_name || "KKPhim"} • ${ep.name || "Video"}`,
          title: `${ep.name || "Tập"} • ${server.server_name || "Server"}`,
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

async function resolveMovieById(id) {
  if (id.startsWith("kkphim:")) {
    const p = parseKkId(id);
    if (!p?.slug) return null;
    const data = await api(`/v1/api/phim/${encodeURIComponent(p.slug)}`);
    const movie = extractMovie(data);
    if (!movie) return null;
    movie.__episodes = extractEpisodes(data, movie);
    return { movie, requestedId: id, parsed: p };
  }

  if (/^tt\d+$/i.test(id)) {
    const data = await api(`/imdb/title/${encodeURIComponent(id)}`);
    const movie = extractMovie(data);
    if (!movie) return null;
    movie.__episodes = extractEpisodes(data, movie);
    return { movie, requestedId: id, parsed: { server: null, episode: null } };
  }

  if (/^tmdb:(movie|tv):\d+$/i.test(id)) {
    const [, type, tmdbId] = id.match(/^tmdb:(movie|tv):(\d+)$/i);
    const data = await api(`/tmdb/${type}/${tmdbId}`);
    const movie = extractMovie(data);
    if (!movie) return null;
    movie.__episodes = extractEpisodes(data, movie);
    return { movie, requestedId: id, parsed: { server: null, episode: null } };
  }

  return null;
}

async function catalog(id, extra) {
  const page = Math.max(1, Number(extra?.skip ? Math.floor(Number(extra.skip) / 24) + 1 : extra?.page || 1));
  const limit = Math.min(64, Math.max(1, Number(extra?.limit || 24)));
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  if (limit) qs.set("limit", String(limit));
  for (const key of ["category", "country", "year", "sort_field", "sort_type", "sort_lang"]) {
    if (extra?.[key]) qs.set(key, extra[key]);
  }

  let endpoint;
  switch (id) {
    case "home":
      endpoint = `/v1/api/home?${qs}`;
      break;
    case "new":
      endpoint = `/v1/api/danh-sach?page=${page}&limit=${limit}`;
      break;
    case "movies":
      endpoint = `/v1/api/danh-sach/phim-le?page=${page}`;
      break;
    case "series":
      endpoint = `/v1/api/danh-sach/phim-bo?page=${page}`;
      break;
    case "animation":
      endpoint = `/v1/api/danh-sach/hoat-hinh?page=${page}`;
      break;
    case "theatrical":
      endpoint = `/v1/api/danh-sach/phim-chieu-rap?page=${page}`;
      break;
    default:
      if (id.startsWith("genre:")) endpoint = `/v1/api/the-loai/${encodeURIComponent(id.slice(6))}?${qs}`;
      else if (id.startsWith("country:")) endpoint = `/v1/api/quoc-gia/${encodeURIComponent(id.slice(8))}?${qs}`;
      else if (id.startsWith("year:")) endpoint = `/v1/api/nam/${encodeURIComponent(id.slice(5))}?${qs}`;
      else return { metas: [] };
  }

  if (extra?.search) {
    endpoint = `/v1/api/tim-kiem?keyword=${encodeURIComponent(extra.search)}&page=${page}&limit=${limit}`;
  }

  const data = await api(endpoint);
  return { metas: extractItems(data).map(preview) };
}

const manifest = {
  id: "community.kkphim.stremio",
  version: "1.0.0",
  name: "KKPhim",
  description: "KKPhim catalog and stream addon for Stremio.",
  logo: "https://kkphim.com/favicon.ico",
  resources: [
    { name: "catalog", types: ["movie", "series"] },
    { name: "meta", types: ["movie", "series"] },
    { name: "stream", types: ["movie", "series"] }
  ],
  types: ["movie", "series"],
  catalogs: [
    { type: "movie", id: "home", name: "KKPhim • Trang chủ", extra: [{ name: "search", isRequired: false }] },
    { type: "movie", id: "new", name: "KKPhim • Phim mới", extra: [{ name: "search", isRequired: false }] },
    { type: "movie", id: "movies", name: "KKPhim • Phim lẻ", extra: [{ name: "search", isRequired: false }] },
    { type: "series", id: "series", name: "KKPhim • Phim bộ", extra: [{ name: "search", isRequired: false }] },
    { type: "movie", id: "animation", name: "KKPhim • Hoạt hình", extra: [{ name: "search", isRequired: false }] },
    { type: "movie", id: "theatrical", name: "KKPhim • Chiếu rạp", extra: [{ name: "search", isRequired: false }] },
    { type: "movie", id: "action", name: "KKPhim • Hành động" },
    { type: "movie", id: "romance", name: "KKPhim • Tình cảm" },
    { type: "movie", id: "comedy", name: "KKPhim • Hài hước" },
    { type: "movie", id: "horror", name: "KKPhim • Kinh dị" },
    { type: "movie", id: "fantasy", name: "KKPhim • Thần thoại" },
    { type: "movie", id: "korea", name: "KKPhim • Hàn Quốc" },
    { type: "movie", id: "china", name: "KKPhim • Trung Quốc" },
    { type: "movie", id: "usa", name: "KKPhim • Âu Mỹ" },
    { type: "movie", id: "2026", name: "KKPhim • Phim 2026" },
    { type: "movie", id: "2025", name: "KKPhim • Phim 2025" }
  ],
  behaviorHints: { configurable: false }
};

// Map friendly catalog IDs to API slugs.
const catalogAliases = {
  action: "genre:hanh-dong",
  romance: "genre:tinh-cam",
  comedy: "genre:hai-huoc",
  horror: "genre:kinh-di",
  fantasy: "genre:than-thoai",
  korea: "country:han-quoc",
  china: "country:trung-quoc",
  usa: "country:au-my",
  "2026": "year:2026",
  "2025": "year:2025"
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  try {
    const path = Array.isArray(req.query.path) ? req.query.path : [];
    const route = path.join("/");

    if (route === "manifest.json" || route === "") {
      return json(res, manifest);
    }

    // /catalog/{type}/{id}.json
    if (path[0] === "catalog") {
      const catalogId = String(path[2] || "").replace(/\.json$/, "");
      const extra = { ...req.query };
      delete extra.path;
      return json(res, await catalog(catalogAliases[catalogId] || catalogId, extra));
    }

    // /meta/{type}/{id}.json
    if (path[0] === "meta") {
      const id = decodeURIComponent(String(path[2] || "").replace(/\.json$/, ""));
      const resolved = await resolveMovieById(id);
      if (!resolved) return json(res, { meta: {} });
      return json(res, { meta: buildMeta(resolved.movie, resolved.requestedId) });
    }

    // /stream/{type}/{videoId}.json
    if (path[0] === "stream") {
      const id = decodeURIComponent(String(path[2] || "").replace(/\.json$/, ""));
      const resolved = await resolveMovieById(id);
      if (!resolved) return json(res, { streams: [] });

      const streams = streamsFromEpisodes(
        resolved.movie.__episodes,
        resolved.parsed?.server,
        resolved.parsed?.episode
      );

      // For a plain movie ID, return all available servers.
      return json(res, { streams });
    }

    return json(res, { error: "Not found" }, 404);
  } catch (err) {
    console.error(err);
    return json(res, { error: "KKPhim API error", detail: String(err.message || err) }, 502);
  }
}
