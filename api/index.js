const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const { buildManifest } = require("../src/manifest");
const { catalogHandler, metaHandler, streamHandler } = require("../src/handlers");

// Cached across warm invocations of the same serverless instance.
let routerPromise = null;

async function buildRouter() {
  const manifest = await buildManifest();
  const builder = new addonBuilder(manifest);

  builder.defineCatalogHandler(catalogHandler);
  builder.defineMetaHandler(metaHandler);
  builder.defineStreamHandler(streamHandler);

  return getRouter(builder.getInterface());
}

module.exports = async (req, res) => {
  try {
    if (!routerPromise) routerPromise = buildRouter();
    const router = await routerPromise;
    router(req, res, () => {
      res.statusCode = 404;
      res.end("Not found");
    });
  } catch (err) {
    routerPromise = null; // allow retry on next request
    console.error(err);
    res.statusCode = 500;
    res.end("Addon error: " + (err && err.message));
  }
};
