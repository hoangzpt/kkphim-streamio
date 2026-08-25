const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const { buildManifest } = require("./src/manifest");
const { catalogHandler, metaHandler, streamHandler } = require("./src/handlers");

(async () => {
  const manifest = await buildManifest();
  const builder = new addonBuilder(manifest);

  builder.defineCatalogHandler(catalogHandler);
  builder.defineMetaHandler(metaHandler);
  builder.defineStreamHandler(streamHandler);

  serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
  console.log("Addon running locally. Install in Stremio with:");
  console.log(`http://127.0.0.1:${process.env.PORT || 7000}/manifest.json`);
})();
