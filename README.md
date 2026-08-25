# KKPhim Stremio Addon V2

Bản này sửa lỗi routing của V1 bằng một Vercel Function rõ ràng `api/index.js` và `vercel.json` rewrite.

## Endpoint

- `/api/manifest.json`
- `/api/catalog/movie/home.json`
- `/api/meta/movie/kkphim:<slug>.json`
- `/api/stream/movie/kkphim:<slug>.json`

## Deploy

Thay toàn bộ source cũ trên GitHub bằng các file trong ZIP này, sau đó Vercel Deploy/Redeploy lại Production.

Sau deploy kiểm tra:

`https://YOUR-DOMAIN.vercel.app/`

và:

`https://YOUR-DOMAIN.vercel.app/api/manifest.json`

Manifest phải trả JSON với `version: 2.0.0`.

## Stremio

Cài manifest:

`https://YOUR-DOMAIN.vercel.app/api/manifest.json`

Bản này có trang root `/` và các rewrite để Vercel đưa toàn bộ `/api/*` về cùng một function. Vercel rewrite là cơ chế chuyển request nội bộ mà vẫn giữ URL người dùng. 
