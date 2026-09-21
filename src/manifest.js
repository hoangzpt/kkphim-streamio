const kkphim = require("./kkphimApi");

const POPULAR_GENRES = [
  "Hành Động",
  "Tình Cảm",
  "Hài Hước",
  "Cổ Trang",
  "Tâm Lý",
  "Hình Sự",
  "Chiến Tranh",
  "Võ Thuật",
  "Viễn Tưởng",
  "Phiêu Lưu",
  "Khoa Học",
  "Kinh Dị",
  "Âm Nhạc",
  "Thần Thoại",
  "Tài Liệu",
  "Gia Đình",
  "Chính Kịch",
  "Bí Ẩn",
  "Học Đường",
];

const POPULAR_COUNTRIES = [
  "Hàn Quốc",
  "Trung Quốc",
  "Âu Mỹ",
  "Nhật Bản",
  "Thái Lan",
  "Việt Nam",
  "Đài Loan",
  "Hồng Kông",
  "Ấn Độ",
  "Anh",
  "Pháp",
  "Tây Ban Nha",
  "Nga",
];

const POPULAR_YEARS = [
  "2026",
  "2025",
  "2024",
  "2023",
  "2022",
  "2021",
  "2020",
  "2019",
  "2018",
  "2015",
  "2010",
];

function buildCatalogEntry(id, name, types, filterOptions) {
  return types.map((type) => ({
    id,
    type,
    name,
    extra: [
      { name: "search" },
      ...(filterOptions ? [{ name: "genre", options: filterOptions, isRequired: false }] : []),
      { name: "skip", isRequired: false },
    ],
  }));
}

async function buildManifest() {
  let genreOptions = POPULAR_GENRES;
  let countryOptions = POPULAR_COUNTRIES;

  try {
    const list = await kkphim.genres();
    if (list && list.length) {
      // Giữ tối đa 20 thể loại phổ biến để manifest không bị vượt giới hạn 8KB của Stremio
      const names = list.map((g) => g.name);
      if (names.length <= 20) genreOptions = names;
    }
  } catch (e) {
    // keep fallback
  }

  const catalogs = [
    // 1. Nhóm danh mục chính
    ...buildCatalogEntry("kkphim-phim-moi", "KKPhim: Mới Cập Nhật", ["movie", "series"], genreOptions),
    ...buildCatalogEntry("kkphim-phim-le", "KKPhim: Phim Lẻ", ["movie"], genreOptions),
    ...buildCatalogEntry("kkphim-phim-bo", "KKPhim: Phim Bộ", ["series"], genreOptions),
    ...buildCatalogEntry("kkphim-phim-chieu-rap", "KKPhim: Phim Chiếu Rạp", ["movie"], genreOptions),
    ...buildCatalogEntry("kkphim-hoat-hinh", "KKPhim: Hoạt Hình", ["series", "movie"], genreOptions),
    ...buildCatalogEntry("kkphim-tv-shows", "KKPhim: TV Shows", ["series"], genreOptions),

    // 2. Nhóm phân loại Thuyết minh & Lồng tiếng
    ...buildCatalogEntry("kkphim-thuyet-minh", "KKPhim: Thuyết Minh", ["movie", "series"], genreOptions),
    ...buildCatalogEntry("kkphim-long-tieng", "KKPhim: Lồng Tiếng", ["movie", "series"], genreOptions),

    // 3. Danh mục lọc theo Quốc Gia (dropdown genre sẽ hiển thị danh sách Quốc gia)
    ...buildCatalogEntry("kkphim-theo-quoc-gia", "KKPhim: Theo Quốc Gia", ["movie", "series"], countryOptions),

    // 4. Danh mục lọc theo Năm phát hành (dropdown genre sẽ hiển thị danh sách Năm)
    ...buildCatalogEntry("kkphim-theo-nam", "KKPhim: Theo Năm", ["movie", "series"], POPULAR_YEARS),
  ];

  return {
    id: "org.kkphim.stremio.addon",
    version: "1.2.0",
    name: "KKPhim Vietsub",
    description:
      "Xem phim Vietsub, Thuyết Minh, Lồng Tiếng từ KKPhim. Hỗ trợ xem trực tiếp từ trang chủ Stremio (IMDb), phim chiếu rạp, phim lẻ, phim bộ, lọc theo Quốc gia và Năm.",
    logo: "https://phimimg.com/favicon.ico",
    resources: [
      "catalog",
      {
        name: "meta",
        types: ["movie", "series"],
        idPrefixes: ["kkphim:"],
      },
      {
        name: "stream",
        types: ["movie", "series"],
        idPrefixes: ["kkphim:", "tt"],
      },
    ],
    types: ["movie", "series"],
    catalogs,
    behaviorHints: {
      configurable: false,
      adult: false,
    },
  };
}

module.exports = {
  buildManifest,
  POPULAR_GENRES,
  POPULAR_COUNTRIES,
  POPULAR_YEARS,
};
