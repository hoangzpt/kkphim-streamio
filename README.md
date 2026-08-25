# KKPhim Stremio Addon

Addon Stremio xem phim Vietsub / Thuyết minh / Lồng tiếng, dữ liệu lấy từ API công khai
của KKPhim (`phimapi.com`). Có phim lẻ, phim bộ, hoạt hình, TV shows, mục "mới cập nhật",
tìm kiếm và lọc theo thể loại.

## Cấu trúc dự án

```
api/addon.js        -> entrypoint serverless cho Vercel (bắt mọi request)
src/manifest.js     -> khai báo manifest.json + danh sách catalog/thể loại
src/handlers.js     -> xử lý catalog / meta / stream cho Stremio
src/kkphimApi.js     -> gọi API phimapi.com, chuẩn hoá dữ liệu, cache 5 phút
local.js             -> chạy thử ở máy local (không dùng khi deploy)
vercel.json           -> rewrite mọi route về api/index.js
```

## 1. Chạy thử ở máy local

```bash
npm install
npm start
```

Server chạy ở `http://127.0.0.1:7000`. Mở app Stremio desktop → biểu tượng
mảnh ghép (Addons) → góc trên bên phải gõ:

```
http://127.0.0.1:7000/manifest.json
```

rồi bấm Install để kiểm tra trước khi deploy.

## 2. Deploy MIỄN PHÍ lên Vercel

### Cách A — dùng Vercel CLI (nhanh nhất, không cần GitHub)

1. Cài Node.js (>=18) nếu máy chưa có.
2. Cài Vercel CLI:
   ```bash
   npm i -g vercel
   ```
3. Trong thư mục dự án, chạy:
   ```bash
   vercel login
   vercel
   ```
   - Lần đầu nó sẽ hỏi vài câu: chọn tài khoản, đặt tên project, thư mục gốc
     (nhấn Enter để mặc định), và **không** cần cấu hình build command gì thêm
     vì `vercel.json` đã có sẵn.
4. Sau khi build xong sẽ ra 1 link dạng `https://ten-project.vercel.app`.
5. Deploy bản chính thức (production):
   ```bash
   vercel --prod
   ```

### Cách B — qua GitHub + trang web Vercel (không cần cài CLI)

1. Đưa code lên GitHub:
   ```bash
   git init
   git add .
   git commit -m "kkphim stremio addon"
   git branch -M main
   git remote add origin https://github.com/<ten-ban>/kkphim-stremio-addon.git
   git push -u origin main
   ```
2. Vào https://vercel.com → đăng nhập bằng GitHub (miễn phí, gói Hobby).
3. Bấm **Add New → Project**, chọn repo vừa tạo.
4. Vercel tự nhận diện đây là project Node.js (nhờ `vercel.json` +
   `api/index.js`) — không cần sửa gì, bấm **Deploy**.
5. Chờ khoảng 30–60 giây, Vercel trả về domain dạng
   `https://kkphim-stremio-addon.vercel.app`.

### Cài addon vào Stremio bằng domain Vercel

Sau khi có domain, addon manifest nằm ở:

```
https://ten-project.vercel.app/manifest.json
```

- **Trên máy tính / điện thoại đã cài app Stremio:** mở Stremio → Addons →
  ô "Search or paste addon URL" ở góc trên → dán link manifest ở trên → Install.
- **Không cần cài gì:** mở trình duyệt, vào
  `https://ten-project.vercel.app/manifest.json` rồi dán link đó vào trang
  `https://web.stremio.com` (cách này để cài addon khi dùng bản web).

Từ giờ addon "KKPhim Vietsub" sẽ hiện trong mục Board/Discover của Stremio,
xem được ở bất kỳ đâu, trên bất kỳ thiết bị nào có đăng nhập cùng tài khoản
Stremio (điện thoại, TV, web) — vì addon chạy trên server Vercel chứ không
phải trên máy bạn.

## 3. Giới hạn của gói Vercel Hobby (free) cần biết

- Serverless function timeout mặc định 10 giây/request — đủ dùng cho addon
  loại này vì mỗi request chỉ gọi 1–2 lần tới `phimapi.com`.
- Băng thông & số lượt gọi function miễn phí khá rộng rãi cho nhu cầu cá
  nhân; nếu chia sẻ addon cho nhiều người dùng cùng lúc, để ý mục Usage
  trong Vercel dashboard.
- Vercel không lưu state lâu dài giữa các lần gọi (mỗi function có thể bị
  "cold start"), nên addon có cache 5 phút trong RAM để giảm số lần gọi API
  gốc — cache này sẽ mất khi function "nguội", đó là bình thường.

## 3a. Nếu bấm Play nhưng phim cứ load/buffer mãi không chạy

Nguyên nhân thường gặp nhất: CDN chứa file `.m3u8`/video có chặn hotlink,
chỉ cho phép phát khi request có header `Referer`/`Origin` đúng domain của
trang gốc. Nếu thiếu header này, CDN không trả lỗi rõ ràng mà chỉ "treo",
khiến Stremio hiện loading vô hạn.

Bản cập nhật này đã tự động tạo **nhiều lựa chọn stream cho cùng 1 server**
(khác nhau ở header `Referer` được gửi kèm, cộng thêm 1 bản không header) —
khi bấm vào 1 tập phim, bạn sẽ thấy danh sách vài dòng cho mỗi server, ví dụ:

```
Server #1 - Tập 1 (referer: phimapi.com)
Server #1 - Tập 1 (referer: kkphim.com)
Server #1 - Tập 1 (không header)
```

Cứ thử lần lượt từng dòng — dòng nào phát được thì từ đó dùng đúng dòng đó
cho các tập tiếp theo. Nếu muốn xác nhận trước bằng tay: copy link `.m3u8`
(bấm vào nút "..." > thông tin stream trong Stremio, hoặc mở DevTools) rồi
thử mở bằng VLC → Media → Open Network Stream để kiểm tra link có phát được
không.

Nếu vẫn không dòng nào chạy được, khả năng CDN yêu cầu domain Referer khác
với 2 domain mình đoán sẵn (`phimapi.com`, `kkphim.com`) — mở file
`src/handlers.js`, tìm biến `REFERER_CANDIDATES` và thêm domain đúng vào
(ví dụ domain hiển thị trong link embed `ep.embed`, thường lộ ra domain
player gốc).

## 3c. Lỗi "Streaming server is not available" khi xem trên web.stremio.com / iOS

Bản Web (và iOS, vì trên đó chỉ dùng được bản Web) không chạy "Streaming
Server" nền như bản desktop, nên nó **không thể** tự thêm header
`Referer`/`Origin` mà addon yêu cầu — nếu addon khai báo
`behaviorHints.proxyHeaders`, Stremio Web sẽ chặn hẳn và báo lỗi này thay vì
phát.

Bản cập nhật này bỏ hẳn cách "nhờ Stremio thêm header" và thay bằng
**proxy riêng trong addon** (`/hls-proxy`, file `api/proxy.js`): addon tự
tải file `.m3u8`/đoạn video từ CDN với đúng header, rồi trả lại link "sạch"
để phát trực tiếp — không cần Streaming Server nữa, chạy được cả trên web,
iOS lẫn desktop.

Với mỗi tập phim giờ bạn sẽ thấy các lựa chọn:
```
Server #1 - Tập 1 (qua proxy, referer: phimapi.com)
Server #1 - Tập 1 (qua proxy, referer: kkphim.com)
Server #1 - Tập 1 (link trực tiếp)
```
Thử lần lượt cho tới khi có dòng phát được — dòng đó chính là referer đúng.

Lưu ý: vì giờ video đi qua server addon (Vercel) rồi mới tới máy bạn, tốc độ
phát phụ thuộc thêm vào băng thông Vercel — với gói Hobby free vẫn đủ dùng
cho xem cá nhân, nhưng nếu addon có nhiều người dùng cùng lúc sẽ tốn quota
nhanh hơn cách phát thẳng.

## 3d. Nếu gặp lỗi "404: NOT_FOUND" trên domain Vercel

Vercel có thể tự rút gọn route của `api/index.js` thành `/api` thay vì
`/api/index`, gây lệch với rule rewrite. Vì vậy function trong bản này đã
được đặt tên là `api/addon.js` và `vercel.json` trỏ rewrite tới `/api/addon`
— tránh hẳn sự mơ hồ đó. Nếu bạn đổi tên file, nhớ sửa `destination` trong
`vercel.json` cho khớp.

Nếu vẫn gặp 404 sau khi deploy lại:
- Vào Vercel dashboard → project → tab **Deployments**, mở deployment mới
  nhất, kiểm tra trạng thái là **Ready** (không phải Error).
- Xem tab **Functions** của deployment đó — phải thấy `api/addon.js` được
  liệt kê. Nếu không thấy, build đã không nhận diện ra function (thường do
  thiếu `package.json` ở đúng thư mục gốc project trên Vercel).
- Nếu bạn deploy qua GitHub, đảm bảo **Root Directory** trong Project
  Settings trỏ đúng vào thư mục chứa `package.json` và `vercel.json` (nếu
  bạn để repo chỉ chứa đúng nội dung thư mục `kkphim-stremio-addon/`, Root
  Directory nên để trống/mặc định).

## 4. Một vài điểm cần lưu ý về dữ liệu

Trang tài liệu `kkphim.com/api-document` chặn truy cập tự động (robots.txt)
nên phần code này được viết dựa trên cấu trúc API công khai đã biết của
`phimapi.com` (endpoint danh sách, tìm kiếm, chi tiết phim, thể loại, quốc
gia). Nếu bạn thấy phim hiện thiếu poster, sai thể loại, hoặc catalog trống,
rất có thể một vài tên trường JSON đã đổi — mở
`src/kkphimApi.js` (hàm `normalizeList` và `getDetail`) và đối chiếu với
response thật (mở thẳng URL API bằng trình duyệt, ví dụ
`https://phimapi.com/v1/api/danh-sach/phim-le?page=1`) để chỉnh lại tên
field cho khớp.

## 5. Có thể mở rộng thêm

- Thêm catalog lọc theo quốc gia (`kkphim.listByCountry`) — hàm đã có sẵn
  trong `kkphimApi.js`, chỉ cần thêm vào `manifest.js` và `handlers.js`.
- Thêm phụ đề riêng nếu bạn có nguồn `.srt/.vtt`.
- Thêm xác thực đơn giản (query `?key=...`) nếu muốn addon chỉ dùng riêng
  cho bạn, tránh người khác cài tràn lan gây tốn quota Vercel.
