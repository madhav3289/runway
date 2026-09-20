const config = require('./src/config');
const { createApp } = require('./src/app');

createApp().listen(config.port, () => {
  console.log(`Runway API listening on :${config.port} (sim: ${config.simUrl})`);
});
