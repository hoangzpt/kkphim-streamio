# KKPhim Stremio Addon V4

V4 sửa lỗi 404 của Stremio khi gọi các URL bắt buộc có `.json`.

Vercel rewrites:
- `/api/manifest.json` -> `/api/manifest`
- `/api/catalog/:type/:id.json` -> `/api/catalog/:type/:id`
- `/api/meta/:type/:id.json` -> `/api/meta/:type/:id`
- `/api/stream/:type/:id.json` -> `/api/stream/:type/:id`

Sau khi thay source cũ và Redeploy Production, kiểm tra:
1. `/api/manifest.json`
2. `/api/catalog/movie/home.json`

Manifest phải hiện version 3.0.0 và catalog phải trả `metas`.
