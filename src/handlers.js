const kkphim = require("./kkphimApi");
const imdbMapper = require("./imdbMapper");

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

async function catalogHandler({ type, id, extra }) {
  extra = extra || {};
  const page = extra.skip ? Math.floor(Number(extra.skip) / 24) + 1 : 1;

  let result;
  if (extra.search) {
    result = await kkphim.search(extra.search, page);
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

  const metas = (result && result.items ? result.items : [])
    .filter((it) => toStremioType(it) === type)
    .map(itemToMeta);

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

  const meta = {
    id: `kkphim:${detail.slug}`,
    type,
    name: detail.name,
    poster: detail.poster || detail.thumb,
    background: detail.thumb || detail.poster,
    description: detail.content,
    releaseInfo: detail.year ? String(detail.year) : undefined,
    genres: (detail.category || []).map((c) => c.name),
    country: (detail.country || []).map((c) => c.name).join(", "),
    runtime: detail.time,
    cast: (detail.actor || []).filter(Boolean),
    director: (detail.director || []).filter(Boolean),
  };

  if (type === "series") {
    // Use the first server's episode list as the canonical episode/season index.
    const primary = detail.episodes[0];
    if (primary) {
      meta.videos = primary.items.map((ep, idx) => ({
        id: `kkphim:${detail.slug}:${ep.slug}`,
        title: ep.name ? `Tập ${ep.name}` : `Tập ${idx + 1}`,
        season: 1,
        episode: idx + 1,
        released: undefined,
      }));
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
