const API = "https://phimapi.com";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
}

function send(res, body, status = 200) {
  cors(res);
  res.status(status).json(body);
}

async function kk(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const r = await fetch(`${API}${path}`, {
      headers: { accept: "application/json", "user-agent": "KKPhim-Stremio-Addon/3.0" },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`KKPhim HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function imageUrl(v) {
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://phimimg.com/${String(v).replace(/^\/+/, "")}`;
}

function clean(v = "") {
  return String(v).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function itemOf(d) { return d?.data?.item || d?.item || null; }
function itemsOf(d) { return d?.data?.items || d?.items || []; }
function episodesOf(d) { return d?.data?.item?.episodes || d?.episodes || []; }

function typeOf(item) {
  return item?.tmdb?.type === "tv" ||
    item?.type === "phim-bo" ||
    item?.type === "tv-shows" ||
    Number(item?.episode_total || 0) > 1 ? "series" : "movie";
}

function idOf(slug) { return `kkphim:${slug}`; }

function preview(item) {
  const meta = {
    id: idOf(item.slug),
    type: typeOf(item),
    name: item.name || item.origin_name,
    poster: imageUrl(item.poster_url || item.thumb_url),
    posterShape: "poster",
    description: clean(item.content || ""),
    releaseInfo: item.year ? String(item.year) : undefined,
    imdbRating: item.tmdb?.vote_average ? Number(item.tmdb.vote_average) : undefined
  };
  return Object.fromEntries(Object.entries(meta).filter(([,v]) => v !== undefined));
}

function parseId(id) {
  const p = String(id).split(":");
  if (p[0] !== "kkphim" || !p[1]) return null;
  return {
    slug: p[1],
    server: p[2] ? decodeURIComponent(p[2]) : null,
    episode: p[3] ? decodeURIComponent(p.slice(3).join(":")) : null
  };
}

async function resolve(id) {
  if (id.startsWith("kkphim:")) {
    const p = parseId(id);
    const d = await kk(`/v1/api/phim/${encodeURIComponent(p.slug)}`);
    const item = itemOf(d);
    if (!item) return null;
    item.__episodes = episodesOf(d);
    return { item, parsed: p, requestedId: id };
  }

  if (/^tt\d+$/i.test(id)) {
    const d = await kk(`/imdb/title/${encodeURIComponent(id)}`);
    const item = itemOf(d);
    if (!item) return null;
    item.__episodes = episodesOf(d);
    return { item, parsed: {}, requestedId: id };
  }

  const tm = id.match(/^tmdb:(movie|tv):(\d+)$/i);
  if (tm) {
    const d = await kk(`/tmdb/${tm[1]}/${tm[2]}`);
    const item = itemOf(d);
    if (!item) return null;
    item.__episodes = episodesOf(d);
    return { item, parsed: {}, requestedId: id };
  }
  return null;
}

async function getCatalog(catalogId, q = {}) {
  const page = Math.max(1, Number(q.page || (q.skip ? Math.floor(Number(q.skip)/24)+1 : 1)));
  const limit = Math.min(64, Math.max(1, Number(q.limit || 24)));
  const p = new URLSearchParams({ page: String(page), limit: String(limit) });

  for (const k of ["category","country","year","sort_field","sort_type","sort_lang"]) {
    if (q[k]) p.set(k, q[k]);
  }

  let endpoint;
  if (q.search) {
    endpoint = `/v1/api/tim-kiem?keyword=${encodeURIComponent(q.search)}&${p.toString()}`;
  } else if (catalogId === "home") {
    endpoint = "/v1/api/home";
  } else if (catalogId === "new") {
    endpoint = `/v1/api/danh-sach?${p.toString()}`;
  } else {
    const listMap = { movies:"phim-le", series:"phim-bo", animation:"hoat-hinh", theatrical:"phim-chieu-rap" };
    if (listMap[catalogId]) endpoint = `/v1/api/danh-sach/${listMap[catalogId]}?${p.toString()}`;
    else if (catalogId.startsWith("genre:")) endpoint = `/v1/api/the-loai/${encodeURIComponent(catalogId.slice(6))}?${p.toString()}`;
    else if (catalogId.startsWith("country:")) endpoint = `/v1/api/quoc-gia/${encodeURIComponent(catalogId.slice(8))}?${p.toString()}`;
    else if (catalogId.startsWith("year:")) endpoint = `/v1/api/nam/${encodeURIComponent(catalogId.slice(5))}?${p.toString()}`;
    else return { metas: [] };
  }

  const d = await kk(endpoint);
  return { metas: itemsOf(d).map(preview) };
}

function metaOf(item, requestedId) {
  const meta = {
    id: requestedId,
    type: typeOf(item),
    name: item.name || item.origin_name,
    poster: imageUrl(item.poster_url || item.thumb_url),
    background: imageUrl(item.thumb_url || item.poster_url),
    posterShape: "poster",
    description: clean(item.content || ""),
    releaseInfo: item.year ? String(item.year) : undefined,
    runtime: item.time || undefined,
    language: item.lang || undefined,
    genres: Array.isArray(item.category) ? item.category.map(x=>x.name).filter(Boolean) : [],
    country: Array.isArray(item.country) ? item.country.map(x=>x.name).filter(Boolean) : [],
    cast: Array.isArray(item.actor) ? item.actor.filter(Boolean) : [],
    director: Array.isArray(item.director) ? item.director.filter(Boolean) : [],
    imdbRating: item.tmdb?.vote_average ? Number(item.tmdb.vote_average) : undefined
  };

  if (meta.type === "series") {
    const videos = [];
    for (const server of item.__episodes || []) {
      for (const ep of server.server_data || []) {
        videos.push({
          id: `kkphim:${item.slug}:${encodeURIComponent(server.server_name || "Server")}:${encodeURIComponent(ep.slug || ep.name || "1")}`,
          title: ep.name || "Tập",
          thumbnail: imageUrl(item.poster_url || item.thumb_url)
        });
      }
    }
    meta.videos = videos;
    if (videos[0]) meta.behaviorHints = { defaultVideoId: videos[0].id };
  }
  return Object.fromEntries(Object.entries(meta).filter(([,v]) => v !== undefined));
}

function streamsOf(item, parsed = {}) {
  const streams = [];
  for (const server of item.__episodes || []) {
    if (parsed.server && server.server_name !== parsed.server) continue;
    for (const ep of server.server_data || []) {
      if (parsed.episode && ep.slug !== parsed.episode && ep.name !== parsed.episode) continue;
      if (ep.link_m3u8) {
        streams.push({
          name: server.server_name || "KKPhim",
          title: `${ep.name || "Video"} • ${server.server_name || "Server"}`,
          url: ep.link_m3u8,
          behaviorHints: { bingeGroup: `kkphim-${server.server_name || "server"}` }
        });
      }
    }
  }
  return streams;
}

const aliases = {
  action:"genre:hanh-dong", romance:"genre:tinh-cam", comedy:"genre:hai-huoc",
  horror:"genre:kinh-di", fantasy:"genre:than-thoai",
  korea:"country:han-quoc", china:"country:trung-quoc", japan:"country:nhat-ban",
  usa:"country:au-my", vietnam:"country:viet-nam",
  "2026":"year:2026", "2025":"year:2025", "2024":"year:2024"
};

const manifest = {
  id:"community.kkphim.stremio", version:"3.0.0", name:"KKPhim",
  description:"KKPhim catalog, metadata and streams for Stremio.",
  logo:"https://kkphim.com/favicon.ico",
  resources:["catalog","meta","stream"], types:["movie","series"],
  catalogs:[
    {type:"movie",id:"home",name:"KKPhim • Trang chủ",extra:[{name:"search",isRequired:false},{name:"skip",isRequired:false}]},
    {type:"movie",id:"new",name:"KKPhim • Phim mới",extra:[{name:"search",isRequired:false},{name:"skip",isRequired:false}]},
    {type:"movie",id:"movies",name:"KKPhim • Phim lẻ",extra:[{name:"search",isRequired:false},{name:"skip",isRequired:false}]},
    {type:"series",id:"series",name:"KKPhim • Phim bộ",extra:[{name:"search",isRequired:false},{name:"skip",isRequired:false}]},
    {type:"movie",id:"animation",name:"KKPhim • Hoạt hình",extra:[{name:"search",isRequired:false}]},
    {type:"movie",id:"theatrical",name:"KKPhim • Chiếu rạp",extra:[{name:"search",isRequired:false}]},
    {type:"movie",id:"action",name:"KKPhim • Hành động"},
    {type:"movie",id:"romance",name:"KKPhim • Tình cảm"},
    {type:"movie",id:"comedy",name:"KKPhim • Hài hước"},
    {type:"movie",id:"horror",name:"KKPhim • Kinh dị"},
    {type:"movie",id:"fantasy",name:"KKPhim • Thần thoại"},
    {type:"movie",id:"korea",name:"KKPhim • Hàn Quốc"},
    {type:"movie",id:"china",name:"KKPhim • Trung Quốc"},
    {type:"movie",id:"japan",name:"KKPhim • Nhật Bản"},
    {type:"movie",id:"usa",name:"KKPhim • Âu Mỹ"},
    {type:"movie",id:"2026",name:"KKPhim • 2026"},
    {type:"movie",id:"2025",name:"KKPhim • 2025"},
    {type:"movie",id:"2024",name:"KKPhim • 2024"}
  ]
};

module.exports = { cors, send, getCatalog, resolve, metaOf, streamsOf, aliases, manifest };
