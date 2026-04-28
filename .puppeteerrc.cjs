const { join } = require("path");

module.exports = {
  // Le dice a Render dónde descargar y guardar el Google Chrome invisible
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
};
