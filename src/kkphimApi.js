const fetch = require("node-fetch");

const BASE = "https://phimapi.com";
const DEFAULT_IMG_CDN = "https://phimimg.com";

// tiny in-memory cache (survives warm serverless invocations)
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function cachedGet(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.data;

  const res = await fetch(url, { timeout: 15000 });
  if (!res.ok) throw new Error(`kkphim api ${res.status} for ${url}`);
  const data = await res.json();
  cache.set(url, { data, time: Date.now() });
  return data;
}

function fixImg(url, cdn) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const domain = cdn || DEFAULT_IMG_CDN;
  return `${domain.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

function stripHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * List movies by type_list (phim-bo, phim-le, hoat-hinh, tv-shows, ...)
 */
async function listByType(typeList, { page = 1, sortField, category, country, year, limit } = {}) {
  const params = new URLSearchParams({ page: String(page) });
  if (sortField) params.set("sort_field", sortField);
  if (category) params.set("category", category);
  if (country) params.set("country", country);
  if (year) params.set("year", String(year));
  if (limit) params.set("limit", String(limit));
  const url = `${BASE}/v1/api/danh-sach/${typeList}?${params.toString()}`;
  return normalizeList(await cachedGet(url));
}

/** Newest updated movies across all types (mixed movie/series) */
async function listNewlyUpdated(page = 1) {
  const url = `${BASE}/danh-sach/phim-moi-cap-nhat-v3?page=${page}`;
  return normalizeList(await cachedGet(url));
}

/** Full text search */
async function search(keyword, page = 1) {
  const url = `${BASE}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&page=${page}`;
  return normalizeList(await cachedGet(url));
}

/** Browse by genre slug */
async function listByGenre(slug, page = 1) {
  const url = `${BASE}/v1/api/the-loai/${slug}?page=${page}`;
  return normalizeList(await cachedGet(url));
}

/** Browse by country slug */
async function listByCountry(slug, page = 1) {
  const url = `${BASE}/v1/api/quoc-gia/${slug}?page=${page}`;
  return normalizeList(await cachedGet(url));
}

/** Genre catalog (id/name/slug) */
async function genres() {
  try {
    const data = await cachedGet(`${BASE}/the-loai`);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

/** Country catalog (id/name/slug) */
async function countries() {
  try {
    const data = await cachedGet(`${BASE}/quoc-gia`);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function normalizeList(raw) {
  // The API has returned slightly different shapes historically; handle both.
  const data = raw && raw.data ? raw.data : raw;
  const items = (data && (data.items || raw.items)) || [];
  const cdn =
    (data && data.APP_DOMAIN_CDN_IMAGE) ||
    (raw && raw.APP_DOMAIN_CDN_IMAGE) ||
    DEFAULT_IMG_CDN;
  return {
    items: items.map((it) => normalizeItem(it, cdn)),
    cdn,
  };
}

function normalizeItem(it, cdn) {
  return {
    id: it.slug,
    name: it.name,
    originName: it.origin_name,
    slug: it.slug,
    type: it.type, // "single" | "series" | "hoathinh" | "tvshows"
    year: it.year,
    poster: fixImg(it.poster_url, cdn),
    thumb: fixImg(it.thumb_url, cdn),
    quality: it.quality,
    lang: it.lang,
    episodeCurrent: it.episode_current,
    category: it.category || [],
    country: it.country || [],
  };
}

/** Full detail for one title, by slug */
async function getDetail(slug) {
  const url = `${BASE}/phim/${slug}`;
  const raw = await cachedGet(url);
  const movie = raw.movie || raw;
  const cdn = DEFAULT_IMG_CDN;

  const episodes = (raw.episodes || []).map((server) => ({
    serverName: server.server_name,
    items: (server.server_data || []).map((ep) => ({
      name: ep.name,
      slug: ep.slug,
      filename: ep.filename,
      embed: ep.link_embed,
      m3u8: ep.link_m3u8,
    })),
  }));

  return {
    id: movie.slug,
    name: movie.name,
    originName: movie.origin_name,
    slug: movie.slug,
    type: movie.type, // "single" -> movie, else series-like
    status: movie.status,
    content: stripHtml(movie.content),
    poster: fixImg(movie.poster_url, cdn),
    thumb: fixImg(movie.thumb_url, cdn),
    trailer: movie.trailer_url,
    year: movie.year,
    time: movie.time,
    quality: movie.quality,
    lang: movie.lang,
    episodeCurrent: movie.episode_current,
    episodeTotal: movie.episode_total,
    actor: movie.actor || [],
    director: movie.director || [],
    category: movie.category || [],
    country: movie.country || [],
    episodes,
  };
}

module.exports = {
  listByType,
  listNewlyUpdated,
  search,
  listByGenre,
  listByCountry,
  genres,
  countries,
  getDetail,
  fixImg,
};
