const config = require('./src/config');
const { createApp } = require('./src/app');

const app = createApp();

// Locally (`node server.js`) we listen on a port. On Vercel this file is imported as a
// serverless function instead, so we only export the app and Vercel calls it per request.
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Runway API listening on :${config.port} (sim: ${config.simUrl})`);
  });
}

module.exports = app;