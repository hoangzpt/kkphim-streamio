const { send, getCatalog, aliases } = require("../../_lib/kk");
module.exports = async (req,res) => {
  if (req.method === "OPTIONS") { return send(res, {}, 204); }
  try {
    const id = String(req.query.id || "");
    const catalogId = aliases[id] || id;
    return send(res, await getCatalog(catalogId, req.query || {}));
  } catch (e) {
    console.error(e);
    return send(res, {error:"KKPhim catalog error", detail:String(e.message || e)}, 502);
  }
};
