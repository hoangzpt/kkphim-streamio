module.exports = (req,res) => {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.status(200).send(`<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KKPhim Stremio</title><style>body{font-family:Arial;background:#111;color:#eee;text-align:center;padding:60px}a{display:inline-block;background:#e50914;color:#fff;padding:14px 20px;border-radius:10px;text-decoration:none;margin:8px}.code{color:#aaa;word-break:break-all}</style><h1>KKPhim → Stremio</h1><p>Addon V3 đang hoạt động.</p><a href="/api/manifest.json">Kiểm tra Manifest</a><p class="code">${req.headers.host}/api/manifest.json</p></html>`);
};
