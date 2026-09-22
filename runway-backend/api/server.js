const config = require('./src/config');
const app = require('./src/app');

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Runway API listening on :${config.port} (sim: ${config.simUrl})`);
  });
}

module.exports = app;