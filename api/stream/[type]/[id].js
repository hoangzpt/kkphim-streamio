const { send, resolve, streamsOf } = require("../../_lib/kk");
module.exports = async (req,res) => {
  if (req.method === "OPTIONS") { return send(res, {}, 204); }
  try {
    const id = decodeURIComponent(String(req.query.id || ""));
    const r = await resolve(id);
    if (!r) return send(res, {streams:[]});
    return send(res, {streams: streamsOf(r.item, r.parsed)});
  } catch (e) {
    console.error(e);
    return send(res, {error:"KKPhim stream error", detail:String(e.message || e)}, 502);
  }
};
