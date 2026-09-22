const kkphim = require("./kkphimApi");
const imdbMapper = require("./imdbMapper");
const tmdbApi = require("./tmdbApi");

const TYPE_LIST_MAP = {
  "kkphim-phim-le": "phim-le",
  "kkphim-phim-bo": "phim-bo",
  "kkphim-phim-chieu-rap": "phim-chieu-rap",
  "kkphim-hoat-hinh": "hoat-hinh",
  "kkphim-tv-shows": "tv-shows",
  "kkphim-thuyet-minh": "phim-thuyet-minh",
  "kkphim-long-tieng": "phim-long-tieng",
};

const QUICK_COUNTRY_MAP = {
  "kkphim-quoc-gia-han-quoc": "han-quoc",
  "kkphim-quoc-gia-trung-quoc": "trung-quoc",
  "kkphim-quoc-gia-au-my": "au-my",
};

function toStremioType(item) {
  // "single" = phim lẻ (1 tập) -> movie
  if (item.type === "single" || item.episodeCurrent === "Full") return "movie";
  return "series";
}

function itemToMeta(item) {
  return {
    id: `kkphim:${item.slug}`,
    type: toStremioType(item),
    name: item.name,
    poster: item.poster || item.thumb,
    background: item.thumb || item.poster,
    genres: (item.category || []).map((c) => c.name),
    releaseInfo: item.year ? String(item.year) : undefined,
    description: item.originName ? `Tên gốc: ${item.originName}` : undefined,
  };
}

function normalizeCast(actors) {
  if (!actors) return [];
  const list = Array.isArray(actors) ? actors : [actors];
  const result = [];
  for (const item of list) {
    if (!item) continue;
    // Tách các chuỗi có nhiều diễn viên ngăn cách bằng dấu phẩy, chấm phẩy hoặc gạch chéo
    const parts = String(item).split(/[,;/]/);
    for (const part of parts) {
      const clean = part.trim();
      if (
        clean &&
        clean !== "Đang cập nhật" &&
        clean !== "N/A" &&
        clean !== "Updating..." &&
        clean.length > 1
      ) {
        result.push(clean);
      }
    }
  }
  return [...new Set(result)];
}

async function catalogHandler({ type, id, extra }) {
  extra = extra || {};
  const page = extra.skip ? Math.floor(Number(extra.skip) / 24) + 1 : 1;

  let result;
  if (extra.search) {
    // 1. Kiểm tra xem từ khóa có phải tên Diễn Viên trên TMDB không
    if (process.env.TMDB_API_KEY) {
      try {
        const person = await tmdbApi.searchPerson(extra.search);
        if (
          person &&
          (person.popularity > 1 ||
            person.name.toLowerCase() === extra.search.trim().toLowerCase())
        ) {
          const credits = await tmdbApi.getPersonCredits(person.id);
          if (credits.length > 0) {
            const matchedItems = [];
            const seenSlugs = new Set();

            for (const credit of credits.slice(0, 20)) {
              const searchQueries = [credit.originalTitle, credit.title].filter(Boolean);
              let found = false;

              for (const q of searchQueries) {
                try {
                  const sRes = await kkphim.search(q);
                  if (sRes.items && sRes.items.length > 0) {
                    for (const item of sRes.items.slice(0, 2)) {
                      if (!seenSlugs.has(item.slug)) {
                        seenSlugs.add(item.slug);
                        matchedItems.push(item);
                        found = true;
                        break;
                      }
                    }
                  }
                } catch (err) {}
                if (found) break;
              }

              if (matchedItems.length >= 24) break;
            }

            if (matchedItems.length > 0) {
              result = { items: matchedItems };
            }
          }
        }
      } catch (err) {
        console.error("Lỗi tìm phim theo diễn viên qua TMDB:", err);
      }
    }

    // 2. Nếu không phải diễn viên hoặc TMDB không ra phim, tìm trực tiếp trên KKPhim
    if (!result || !result.items || result.items.length === 0) {
      result = await kkphim.search(extra.search, page);
    }
  } else if (id === "kkphim-theo-nam") {
    // Dropdown genre ở catalog này chứa năm phát hành
    const year = extra.genre || String(new Date().getFullYear());
    result = await kkphim.listByYear(year, page);
  } else if (id === "kkphim-theo-quoc-gia") {
    // Dropdown genre ở catalog này chứa tên quốc gia
    const targetCountry = extra.genre || "Hàn Quốc";
    const countryList = await kkphim.countries();
    const match = countryList.find(
      (c) => c.name.toLowerCase() === String(targetCountry).toLowerCase()
    );
    const slug = match ? match.slug : slugify(targetCountry);
    result = await kkphim.listByCountry(slug, page);
  } else if (QUICK_COUNTRY_MAP[id]) {
    const countrySlug = QUICK_COUNTRY_MAP[id];
    if (extra.genre) {
      const genreList = await kkphim.genres();
      const match = genreList.find(
        (g) => g.name.toLowerCase() === String(extra.genre).toLowerCase()
      );
      const categorySlug = match ? match.slug : slugify(extra.genre);
      const typeList = type === "movie" ? "phim-le" : "phim-bo";
      result = await kkphim.listByType(typeList, {
        page,
        country: countrySlug,
        category: categorySlug,
        sortField: "modified.time",
      });
    } else {
      result = await kkphim.listByCountry(countrySlug, page);
    }
  } else if (id === "kkphim-phim-moi") {
    if (extra.genre) {
      const genreList = await kkphim.genres();
      const match = genreList.find(
        (g) => g.name.toLowerCase() === String(extra.genre).toLowerCase()
      );
      const slug = match ? match.slug : slugify(extra.genre);
      result = await kkphim.listByGenre(slug, page);
    } else {
      result = await kkphim.listNewlyUpdated(page);
    }
  } else {
    const typeList = TYPE_LIST_MAP[id] || "phim-le";
    if (extra.genre) {
      const genreList = await kkphim.genres();
      const match = genreList.find(
        (g) => g.name.toLowerCase() === String(extra.genre).toLowerCase()
      );
      const categorySlug = match ? match.slug : slugify(extra.genre);
      result = await kkphim.listByType(typeList, {
        page,
        category: categorySlug,
        sortField: "modified.time",
      });
    } else {
      result = await kkphim.listByType(typeList, { page, sortField: "modified.time" });
    }
  }

  let metas = (result && result.items ? result.items : [])
    .filter((it) => toStremioType(it) === type)
    .map(itemToMeta);

  // Khi tìm kiếm diễn viên, nếu lọc theo type (ví dụ type: movie) mà diễn viên đó chỉ đóng series (hoặc ngược lại),
  // hiển thị tất cả các phim của diễn viên đó để người dùng không bị thấy danh sách trống!
  if (extra.search && metas.length === 0 && result && result.items && result.items.length > 0) {
    metas = result.items.map(itemToMeta);
  }

  return { metas };
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseId(id) {
  // "kkphim:{slug}" or "kkphim:{slug}:{episodeSlug}"
  const parts = id.split(":");
  return { slug: parts[1], episodeSlug: parts[2] };
}

async function metaHandler({ id }) {
  const { slug } = parseId(id);
  const detail = await kkphim.getDetail(slug);
  const type = toStremioType(detail);

  let cast = normalizeCast(detail.actor);
  // Nếu KKPhim thiếu dữ liệu diễn viên và có TMDB ID, bổ sung diễn viên từ TMDB
  if (cast.length === 0 && detail.tmdbId && process.env.TMDB_API_KEY) {
    try {
      const tmdbCast = await tmdbApi.getMovieCast(detail.tmdbId, type);
      if (tmdbCast && tmdbCast.length > 0) {
        cast = tmdbCast;
      }
    } catch (e) {}
  }

  const directors = normalizeCast(detail.director);
  const genres = (detail.category || []).map((c) => c.name);

  // Tạo các liên kết (links) chuẩn Stremio để hiển thị các nút bấm có thể click cho CAST, DIRECTORS, GENRES
  const links = [];

  for (const genre of genres) {
    links.push({
      name: genre,
      category: "Genres",
      url: `stremio:///search?search=${encodeURIComponent(genre)}`,
    });
  }

  for (const actor of cast) {
    links.push({
      name: actor,
      category: "Cast",
      url: `stremio:///search?search=${encodeURIComponent(actor)}`,
    });
  }

  for (const dir of directors) {
    links.push({
      name: dir,
      category: "Directors",
      url: `stremio:///search?search=${encodeURIComponent(dir)}`,
    });
  }

  // Chuẩn hóa runtime: chỉ hiển thị nếu có số
  const runtime = detail.time && /\d/.test(detail.time) ? detail.time : undefined;

  const meta = {
    id: `kkphim:${detail.slug}`,
    type,
    name: detail.name,
    poster: detail.poster || detail.thumb,
    background: detail.thumb || detail.poster,
    description: detail.content,
    releaseInfo: detail.year ? String(detail.year) : undefined,
    genres,
    country: (detail.country || []).map((c) => c.name).join(", "),
    runtime,
    cast,
    director: directors,
    links,
  };

  if (type === "series") {
    // Use the first server's episode list as the canonical episode/season index.
    const primary = detail.episodes && detail.episodes[0];
    if (primary) {
      meta.videos = (primary.items || []).map((ep, idx) => {
        let epTitle = ep.name ? String(ep.name).trim() : `Tập ${idx + 1}`;
        if (
          !epTitle.toLowerCase().startsWith("tập") &&
          !epTitle.toLowerCase().startsWith("full")
        ) {
          epTitle = "Tập " + epTitle;
        }
        return {
          id: `kkphim:${detail.slug}:${ep.slug}`,
          title: epTitle,
          season: 1,
          episode: idx + 1,
          released: undefined,
        };
      });
    }
  }

  return { meta };
}

// Many Vietnamese movie CDNs reject requests that don't carry a Referer/Origin
// from the "expected" site (hotlink protection).
const REFERER_CANDIDATES = ["https://phimapi.com/", "https://kkphim.com/"];

const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://127.0.0.1:7000");

function proxyUrl(target, ref) {
  const qs = new URLSearchParams({ url: target });
  if (ref) qs.set("ref", ref);
  return `${PUBLIC_BASE}/hls-proxy?${qs.toString()}`;
}

function findEpisode(serverItems, targetEpisode) {
  if (!serverItems || serverItems.length === 0) return null;
  if (!targetEpisode) return serverItems[0];

  // 1. Tìm theo số tập trong ep.name (ví dụ: "Tập 1", "01", "1")
  const matchNum = serverItems.find((ep) => {
    const num = String(ep.name).replace(/\D/g, "");
    return num && parseInt(num, 10) === targetEpisode;
  });
  if (matchNum) return matchNum;

  // 2. Tìm theo số trong ep.slug (ví dụ: "tap-1", "tap-01")
  const matchSlug = serverItems.find((ep) => {
    const slugNum = ep.slug.replace(/\D/g, "");
    return slugNum && parseInt(slugNum, 10) === targetEpisode;
  });
  if (matchSlug) return matchSlug;

  // 3. Fallback theo chỉ mục (0-indexed)
  if (serverItems[targetEpisode - 1]) {
    return serverItems[targetEpisode - 1];
  }

  return serverItems[0];
}

function buildStreamsForEpisode(server, ep, slug) {
  const url = ep.m3u8 || ep.embed;
  if (!url) return [];
  const streams = [];
  const serverName = server.serverName || "Server VIP";
  let epName = ep.name ? String(ep.name).trim() : "";
  if (
    epName &&
    !epName.toLowerCase().startsWith("tập") &&
    !epName.toLowerCase().startsWith("full")
  ) {
    epName = "Tập " + epName;
  }
  const label = `[KKPhim Vietsub] ${serverName}${epName ? " - " + epName : ""}`;

  if (ep.m3u8) {
    // 1. LINK TRỰC TIẾP ĐƯỢC ƯU TIÊN SỐ 1 (Phát mượt, không lỗi video not supported, không lag)
    streams.push({
      title: `${label} (link trực tiếp)`,
      url,
      behaviorHints: {
        bingeGroup: `kkphim-${slug}`,
      },
    });

    // 2. Link qua Proxy làm phương án dự phòng
    for (const referer of REFERER_CANDIDATES) {
      streams.push({
        title: `${label} (qua proxy, referer: ${new URL(referer).hostname})`,
        url: proxyUrl(url, referer),
        behaviorHints: {
          bingeGroup: `kkphim-${slug}`,
        },
      });
    }
  } else {
    streams.push({
      title: `${label} (mở ngoài trình duyệt)`,
      url,
      behaviorHints: { notWebReady: true, bingeGroup: `kkphim-${slug}` },
    });
  }

  return streams;
}

async function streamHandler({ type, id }) {
  // 1. Xử lý khi nhận request từ phim có ID IMDb (tt...)
  if (id.startsWith("tt")) {
    const mapped = await imdbMapper.resolveImdb(type, id);
    if (!mapped || !mapped.slug) {
      return { streams: [] };
    }

    const detail = await kkphim.getDetail(mapped.slug);
    const streams = [];

    for (const server of detail.episodes || []) {
      const ep = mapped.episode
        ? findEpisode(server.items, mapped.episode)
        : server.items[0];
      if (!ep) continue;

      streams.push(...buildStreamsForEpisode(server, ep, mapped.slug));
    }

    return { streams };
  }

  // 2. Xử lý khi nhận request từ catalog KKPhim (kkphim:{slug})
  const { slug, episodeSlug } = parseId(id);
  const detail = await kkphim.getDetail(slug);

  const streams = [];
  for (const server of detail.episodes || []) {
    const ep = episodeSlug
      ? server.items.find((e) => e.slug === episodeSlug)
      : server.items[0];
    if (!ep) continue;

    streams.push(...buildStreamsForEpisode(server, ep, slug));
  }

  return { streams };
}

module.exports = { catalogHandler, metaHandler, streamHandler };
