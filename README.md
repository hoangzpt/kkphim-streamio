# KKPhim Stremio Addon V3

V3 dùng các Vercel Functions riêng cho manifest/catalog/meta/stream để tránh lỗi rewrite/catch-all.

Endpoints:
- `/api/manifest.json`
- `/api/catalog/movie/home.json`
- `/api/catalog/movie/new.json`
- `/api/catalog/series/series.json`
- `/api/meta/movie/kkphim:<slug>.json`
- `/api/stream/movie/kkphim:<slug>.json`

Deploy: thay toàn bộ source cũ bằng source trong ZIP rồi Redeploy Production.

Kiểm tra manifest trước, sau đó catalog.
