const { send, resolve, metaOf } = require("../../_lib/kk");
module.exports = async (req,res) => {
  if (req.method === "OPTIONS") { return send(res, {}, 204); }
  try {
    const id = decodeURIComponent(String(req.query.id || ""));
    const r = await resolve(id);
    if (!r) return send(res, {meta:{}});
    return send(res, {meta: metaOf(r.item, r.requestedId)});
  } catch (e) {
    console.error(e);
    return send(res, {error:"KKPhim meta error", detail:String(e.message || e)}, 502);
  }
};
