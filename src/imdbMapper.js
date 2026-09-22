const fetch = globalThis.fetch || require("node-fetch");
const kkphim = require("./kkphimApi");

const { BoundedCache } = require("./cache");

// In-memory bounded cache cho kết quả map IMDb -> KKPhim (tối đa 500 mục, TTL 12 tiếng)
const imdbCache = new BoundedCache(500, 12 * 60 * 60 * 1000);

function cleanString(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseImdbId(id) {
  const parts = id.split(":");
  return {
    imdbId: parts[0],
    season: parts[1] ? parseInt(parts[1], 10) : null,
    episode: parts[2] ? parseInt(parts[2], 10) : null,
  };
}

function scoreCandidate(item, queryTitle, queryYear, isSeries, targetSeason) {
  let score = 0;
  const cleanQuery = cleanString(queryTitle);
  const cleanOrigin = cleanString(item.originName || item.origin_name);
  const cleanName = cleanString(item.name);

  // 1. So khớp tên gốc (originName)
  if (cleanOrigin === cleanQuery) {
    score += 100;
  } else if (cleanOrigin && cleanQuery && (cleanOrigin.includes(cleanQuery) || cleanQuery.includes(cleanOrigin))) {
    score += 60;
  }

  // 2. So khớp tên hiển thị tiếng Việt (name)
  if (cleanName === cleanQuery) {
    score += 90;
  } else if (cleanName && cleanQuery && cleanName.includes(cleanQuery)) {
    score += 40;
  }

  // 3. So khớp năm sản xuất
  if (queryYear && item.year) {
    const yDiff = Math.abs(parseInt(item.year, 10) - parseInt(queryYear, 10));
    if (yDiff === 0) {
      score += 40;
    } else if (yDiff === 1) {
      score += 20;
    } else {
      score -= yDiff * 10;
    }
  }

  // 4. So khớp loại phim (movie vs series)
  const isItemSeries = item.type === "series" || item.type === "hoathinh" || item.type === "tvshows";
  if (isSeries && isItemSeries) score += 30;
  if (!isSeries && item.type === "single") score += 30;

  // 5. So khớp Season cho series
  if (isSeries && targetSeason) {
    const fullItemTitle = `${item.name} ${item.originName || ""}`;
    const sRegex = new RegExp(`(season|phan|p)\\s*${targetSeason}\\b`, "i");
    const hasAnySeason = /(season|phan|p)\s*\d+/i.test(fullItemTitle);

    if (sRegex.test(fullItemTitle)) {
      score += 80; // Khớp chính xác season cần tìm
    } else if (targetSeason === 1 && !hasAnySeason) {
      score += 35; // Season 1 và phim không chia season riêng (toàn bộ các tập gộp chung)
    } else if (hasAnySeason) {
      score -= 60; // Trừ điểm nếu là season khác (ví dụ cần Season 1 mà phim là Season 3)
    }
  }

  return score;
}

async function fetchCinemetaMeta(type, imdbId) {
  try {
    const url = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
    const res = await fetch(url, { timeout: 8000 });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.meta ? data.meta : null;
  } catch (e) {
    return null;
  }
}

async function resolveImdb(type, id) {
  const { imdbId, season, episode } = parseImdbId(id);
  const isSeries = type === "series" || Boolean(season);
  const cacheKey = season ? `${imdbId}:${season}` : imdbId;

  // Kiểm tra cache
  const cached = imdbCache.get(cacheKey);
  if (cached) {
    return {
      slug: cached.slug,
      season,
      episode,
      title: cached.title,
      originTitle: cached.originTitle,
    };
  }

  // 1. Lấy thông tin từ Cinemeta API
  let meta = await fetchCinemetaMeta(isSeries ? "series" : "movie", imdbId);
  if (!meta && isSeries) {
    // Fallback: một số phim ngắn hoặc miniseries có thể được lưu là movie
    meta = await fetchCinemetaMeta("movie", imdbId);
  } else if (!meta && !isSeries) {
    meta = await fetchCinemetaMeta("series", imdbId);
  }

  if (!meta || !meta.name) return null;

  const queryTitle = meta.name;
  const queryYear = meta.year ? String(meta.year).slice(0, 4) : null;

  // 2. Tìm kiếm trên KKPhim
  let searchRes = await kkphim.search(queryTitle);
  let items = (searchRes && searchRes.items) || [];

  // Nếu không thấy và tên có dấu phân cách (: hoặc -), thử tìm với phần tên chính
  if (items.length === 0 && /[:\-]/.test(queryTitle)) {
    const primaryName = queryTitle.split(/[:\-]/)[0].trim();
    if (primaryName.length > 2) {
      const fallbackRes = await kkphim.search(primaryName);
      items = (fallbackRes && fallbackRes.items) || [];
    }
  }

  if (items.length === 0) return null;

  // 3. Chấm điểm các ứng viên
  const scored = items
    .map((item) => ({
      item,
      score: scoreCandidate(item, queryTitle, queryYear, isSeries, season),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  // Ngưỡng điểm tối thiểu để tránh map nhầm phim
  if (!best || best.score < 50) return null;

  const result = {
    slug: best.item.slug,
    season,
    episode,
    title: best.item.name,
    originTitle: best.item.originName,
  };

  // Lưu cache
  imdbCache.set(cacheKey, result);

  return result;
}

module.exports = {
  parseImdbId,
  scoreCandidate,
  resolveImdb,
  cleanString,
};
