const fetch = globalThis.fetch || require("node-fetch");

const { BoundedCache } = require("./cache");

const BASE_URL = "https://api.themoviedb.org/3";

// In-memory bounded cache cho kết quả tìm diễn viên và phim (tối đa 500 mục, TTL 24 tiếng)
const personCache = new BoundedCache(500, 24 * 60 * 60 * 1000);
const creditsCache = new BoundedCache(500, 24 * 60 * 60 * 1000);

function getAuth() {
  const rawKey = (process.env.TMDB_API_KEY || "").trim();
  if (!rawKey) return null;

  // Nếu bắt đầu bằng "ey" -> Read Access Token (v4)
  if (rawKey.startsWith("ey")) {
    return {
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      param: "",
    };
  }

  // Ngược lại -> API Key (v3)
  return {
    headers: {
      "Content-Type": "application/json",
    },
    param: `&api_key=${encodeURIComponent(rawKey)}`,
  };
}

/**
 * Tìm kiếm diễn viên theo tên trên TMDB
 */
async function searchPerson(name) {
  const auth = getAuth();
  if (!auth || !name) return null;

  const cleanName = String(name).trim().toLowerCase();
  const cached = personCache.get(cleanName);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const url = `${BASE_URL}/search/person?query=${encodeURIComponent(name)}&include_adult=false&language=vi-VN${auth.param}`;
    const res = await fetch(url, { headers: auth.headers, timeout: 8000 });
    if (!res.ok) return null;

    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) return null;

    // Ưu tiên người có nghề nghiệp là diễn viên (Acting) hoặc có độ nổi tiếng (popularity) cao nhất
    const actors = results.filter((p) => p.known_for_department === "Acting");
    const bestPerson = (actors.length > 0 ? actors : results).sort(
      (a, b) => (b.popularity || 0) - (a.popularity || 0)
    )[0];

    const result = {
      id: bestPerson.id,
      name: bestPerson.name,
      profilePath: bestPerson.profile_path,
      popularity: bestPerson.popularity,
    };

    personCache.set(cleanName, result);
    return result;
  } catch (e) {
    console.error("TMDB searchPerson error:", e.message);
    return null;
  }
}

/**
 * Lấy danh sách các bộ phim tiêu biểu của diễn viên
 */
async function getPersonCredits(personId) {
  const auth = getAuth();
  if (!auth || !personId) return [];

  const cached = creditsCache.get(personId);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const url = `${BASE_URL}/person/${personId}/combined_credits?language=vi-VN${auth.param}`;
    const res = await fetch(url, { headers: auth.headers, timeout: 8000 });
    if (!res.ok) return [];

    const data = await res.json();
    const cast = data.cast || [];

    // Sắp xếp theo độ phổ biến (popularity) và lượt vote để lấy các phim nổi bật nhất
    const sorted = cast
      .filter((m) => m.title || m.name)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    // Lấy top 20 phim tiêu biểu nhất của diễn viên
    const credits = sorted.slice(0, 20).map((c) => ({
      id: c.id,
      title: c.title || c.name,
      originalTitle: c.original_title || c.original_name,
      mediaType: c.media_type === "tv" ? "series" : "movie",
      year: (c.release_date || c.first_air_date || "").slice(0, 4),
      popularity: c.popularity || 0,
      character: c.character || "",
    }));

    creditsCache.set(personId, credits);
    return credits;
  } catch (e) {
    console.error("TMDB getPersonCredits error:", e.message);
    return [];
  }
}

/**
 * Lấy danh sách diễn viên của một bộ phim theo TMDB ID (nếu KKPhim thiếu dữ liệu diễn viên)
 */
async function getMovieCast(tmdbId, mediaType = "movie") {
  const auth = getAuth();
  if (!auth || !tmdbId) return [];

  const cacheKey = `cast:${mediaType}:${tmdbId}`;
  const cached = creditsCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const endpoint = mediaType === "series" || mediaType === "tv" ? "tv" : "movie";
    const url = `${BASE_URL}/${endpoint}/${tmdbId}/credits?language=vi-VN${auth.param}`;
    const res = await fetch(url, { headers: auth.headers, timeout: 8000 });
    if (!res.ok) return [];

    const data = await res.json();
    const cast = (data.cast || []).slice(0, 15).map((c) => c.name).filter(Boolean);
    creditsCache.set(cacheKey, cast);
    return cast;
  } catch (e) {
    return [];
  }
}

module.exports = {
  searchPerson,
  getPersonCredits,
  getMovieCast,
};
