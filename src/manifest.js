const kkphim = require("./kkphimApi");

const FALLBACK_GENRES = [
  { name: "Hành Động", slug: "hanh-dong" },
  { name: "Tình Cảm", slug: "tinh-cam" },
  { name: "Hài Hước", slug: "hai-huoc" },
  { name: "Cổ Trang", slug: "co-trang" },
  { name: "Tâm Lý", slug: "tam-ly" },
  { name: "Hình Sự", slug: "hinh-su" },
  { name: "Chiến Tranh", slug: "chien-tranh" },
  { name: "Thể Thao", slug: "the-thao" },
  { name: "Võ Thuật", slug: "vo-thuat" },
  { name: "Viễn Tưởng", slug: "vien-tuong" },
  { name: "Phiêu Lưu", slug: "phieu-luu" },
  { name: "Khoa Học", slug: "khoa-hoc" },
  { name: "Kinh Dị", slug: "kinh-di" },
  { name: "Âm Nhạc", slug: "am-nhac" },
  { name: "Thần Thoại", slug: "than-thoai" },
  { name: "Tài Liệu", slug: "tai-lieu" },
  { name: "Gia Đình", slug: "gia-dinh" },
  { name: "Chính Kịch", slug: "chinh-kich" },
  { name: "Bí Ẩn", slug: "bi-an" },
  { name: "Học Đường", slug: "hoc-duong" },
];

function buildCatalogEntry(id, name, types, genreOptions) {
  return types.map((type) => ({
    id,
    type,
    name,
    extra: [
      { name: "search" },
      { name: "genre", options: genreOptions, isRequired: false },
      { name: "skip", isRequired: false },
    ],
  }));
}

async function buildManifest() {
  let genreOptions = FALLBACK_GENRES.map((g) => g.name);
  try {
    const list = await kkphim.genres();
    if (list && list.length) genreOptions = list.map((g) => g.name);
  } catch (e) {
    // keep fallback
  }

  const catalogs = [
    ...buildCatalogEntry("kkphim-phim-moi", "KKPhim: Mới Cập Nhật", ["movie", "series"], genreOptions),
    ...buildCatalogEntry("kkphim-phim-le", "KKPhim: Phim Lẻ", ["movie"], genreOptions),
    ...buildCatalogEntry("kkphim-phim-bo", "KKPhim: Phim Bộ", ["series"], genreOptions),
    ...buildCatalogEntry("kkphim-hoat-hinh", "KKPhim: Hoạt Hình", ["series"], genreOptions),
    ...buildCatalogEntry("kkphim-tv-shows", "KKPhim: TV Shows", ["series"], genreOptions),
  ];

  return {
    id: "org.kkphim.stremio.addon",
    version: "1.0.0",
    name: "KKPhim Vietsub",
    description:
      "Xem phim Vietsub, Thuyết Minh, Lồng Tiếng cập nhật từ KKPhim (phimapi.com). Gồm phim lẻ, phim bộ, hoạt hình, TV shows, tìm kiếm và lọc theo thể loại.",
    logo: "https://phimimg.com/favicon.ico",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    idPrefixes: ["kkphim:"],
    catalogs,
    behaviorHints: {
      configurable: false,
      adult: false,
    },
  };
}

module.exports = { buildManifest, FALLBACK_GENRES };
