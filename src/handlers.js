const kkphim = require("./kkphimApi");

const TYPE_LIST_MAP = {
  "kkphim-phim-le": "phim-le",
  "kkphim-phim-bo": "phim-bo",
  "kkphim-hoat-hinh": "hoat-hinh",
  "kkphim-tv-shows": "tv-shows",
};

function toStremioType(item) {
  // "single" = phim lẻ (1 tập) -> movie, everything else has multiple episodes -> series
  return item.type === "single" ? "movie" : "series";
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
  } else if (extra.genre) {
    const genreList = await kkphim.genres();
    const match = genreList.find(
      (g) => g.name.toLowerCase() === String(extra.genre).toLowerCase()
    );
    const slug = match ? match.slug : slugify(extra.genre);
    result = await kkphim.listByGenre(slug, page);
  } else if (id === "kkphim-phim-moi") {
    result = await kkphim.listNewlyUpdated(page);
  } else {
    const typeList = TYPE_LIST_MAP[id];
    result = await kkphim.listByType(typeList, { page, sortField: "modified.time" });
  }

  const metas = result.items
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
// from the "expected" site (hotlink protection) — without it, playback just
// buffers forever instead of erroring out clearly. We attach candidate
// headers via behaviorHints.proxyHeaders (the standard Stremio mechanism for
// this) and also offer a plain, header-less variant so the user can pick
// whichever actually works for a given server.
const REFERER_CANDIDATES = ["https://phimapi.com/", "https://kkphim.com/"];

async function streamHandler({ id }) {
  const { slug, episodeSlug } = parseId(id);
  const detail = await kkphim.getDetail(slug);

  const streams = [];
  for (const server of detail.episodes) {
    const ep = episodeSlug
      ? server.items.find((e) => e.slug === episodeSlug)
      : server.items[0];
    if (!ep) continue;
    const url = ep.m3u8 || ep.embed;
    if (!url) continue;
    const label = `${server.serverName || "Server"}${ep.name ? " - Tập " + ep.name : ""}`;

    if (ep.m3u8) {
      // One variant per referer candidate, so if the first fails to load,
      // the user can try the next from the streams list.
      for (const referer of REFERER_CANDIDATES) {
        streams.push({
          title: `${label} (referer: ${new URL(referer).hostname})`,
          url,
          behaviorHints: {
            bingeGroup: `kkphim-${slug}`,
            proxyHeaders: {
              request: {
                Referer: referer,
                Origin: referer.replace(/\/$/, ""),
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              },
            },
          },
        });
      }
      // Plain, no extra headers — some servers don't need any.
      streams.push({
        title: `${label} (không header)`,
        url,
        behaviorHints: { bingeGroup: `kkphim-${slug}` },
      });
    } else {
      // Only an embed/iframe URL is available — Stremio can't play this
      // in its built-in player, flag it so it's opened externally instead.
      streams.push({
        title: `${label} (mở ngoài trình duyệt)`,
        url,
        behaviorHints: { notWebReady: true, bingeGroup: `kkphim-${slug}` },
      });
    }
  }

  return { streams };
}

module.exports = { catalogHandler, metaHandler, streamHandler };
