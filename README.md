# KKPhim → Stremio Addon

> Dùng addon này chỉ với nội dung bạn có quyền truy cập/xem. KKPhim và các nguồn video bên thứ ba có thể có giới hạn bản quyền hoặc điều khoản riêng.

Addon này đọc dữ liệu từ API được công bố tại `https://kkphim.com/api-document` và chuyển sang giao thức Stremio.

## Tính năng

- Trang chủ
- Phim mới
- Phim lẻ
- Phim bộ
- Hoạt hình
- Phim chiếu rạp
- Một số catalog thể loại/quốc gia/năm mẫu
- Tìm kiếm trong các catalog có hỗ trợ Search
- Metadata: poster, background, mô tả, năm, thể loại, quốc gia, diễn viên, đạo diễn, rating
- Nhiều server/tập khi API trả về `link_m3u8`
- Hỗ trợ ID KKPhim (`kkphim:<slug>`)
- Hỗ trợ IMDb ID (`tt...`) qua endpoint IMDb của KKPhim
- Hỗ trợ TMDB dạng `tmdb:movie:<id>` / `tmdb:tv:<id>`
- CORS cho Stremio
- Chỉ 1 Vercel Function catch-all, phù hợp Hobby hơn so với tách nhiều function

## Cấu trúc

```text
kkphim-stremio-addon/
├─ api/
│  └─ [...path].js
├─ package.json
├─ vercel.json
└─ README.md
```

## Chạy local

Cài Vercel CLI:

```bash
npm i -g vercel
```

Trong thư mục dự án:

```bash
vercel dev
```

Sau đó mở:

```text
http://localhost:3000/api/manifest.json
```

Nếu JSON manifest hiện ra là addon đã chạy.

## Deploy Vercel Hobby miễn phí

### Cách 1 — GitHub

1. Tạo repository GitHub mới.
2. Upload toàn bộ 4 file/thư mục ở trên.
3. Đăng nhập Vercel.
4. Import repository.
5. Framework: Other.
6. Build command: để trống.
7. Output directory: để trống.
8. Deploy.
9. Sau khi deploy, lấy domain dạng:

```text
https://TEN-PROJECT.vercel.app
```

Manifest của addon:

```text
https://TEN-PROJECT.vercel.app/api/manifest.json
```

### Cách 2 — Vercel CLI

```bash
npm i -g vercel
vercel login
vercel
```

Chọn tài khoản/team Hobby và deploy.

## Cài vào Stremio

Trên điện thoại hoặc máy tính:

1. Mở Stremio.
2. Vào Addons.
3. Dán URL manifest:

```text
https://TEN-PROJECT.vercel.app/api/manifest.json
```

4. Install.
5. Đăng nhập cùng tài khoản Stremio trên Android TV.

Có thể thử trực tiếp deep link:

```text
stremio://TEN-PROJECT.vercel.app/api/manifest.json
```

Nếu app/browser không tự mở, dùng URL HTTPS trong màn hình Addons.

## Lưu ý Android TV

Addon không phải APK riêng. Stremio Android TV sẽ gọi HTTP API của addon, nên chỉ cần addon có HTTPS công khai.

Đường đi dữ liệu:

```text
Android TV / Phone
       ↓
     Stremio
       ↓
Vercel Function
       ↓
https://phimapi.com
       ↓
metadata + link stream
       ↓
Stremio player
```

## Giới hạn hiện tại

API KKPhim documentation hiện thể hiện metadata, episodes và `link_m3u8`, nhưng không cung cấp một endpoint phụ đề chuẩn cho addon. Vì vậy bản này chưa tự sinh `subtitles` resource.

Nếu muốn phụ đề riêng, có thể bổ sung OpenSubtitles hoặc nguồn phụ đề hợp pháp khác ở phiên bản tiếp theo.

Ngoài ra, Vercel Hobby có giới hạn sử dụng; đây là host cho addon/API, không phải nơi lưu hoặc proxy toàn bộ video. Stream vẫn đi từ URL mà API KKPhim trả về.

## Các endpoint Stremio chính

```text
GET /api/manifest.json
GET /api/catalog/movie/home.json
GET /api/catalog/movie/new.json
GET /api/catalog/movie/movies.json
GET /api/catalog/series/series.json
GET /api/meta/movie/kkphim:<slug>.json
GET /api/stream/movie/kkphim:<slug>.json
```

## Nâng cấp nên làm tiếp

- Dynamic catalog toàn bộ thể loại
- Dynamic catalog toàn bộ quốc gia
- Bộ lọc năm/thể loại/quốc gia
- Lưu lịch sử xem
- Continue Watching
- Favorites
- Phụ đề OpenSubtitles
- Fallback server khi một M3U8 lỗi
- Cache metadata
- Rate limit
- Trang cấu hình addon
- Logo/background riêng
