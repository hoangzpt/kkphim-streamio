const { send, manifest } = require("../_lib/kk");
module.exports = (req,res) => {
  if (req.method === "OPTIONS") { return send(res, {}, 204); }
  return send(res, manifest);
};
