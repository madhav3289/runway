const config = require('./src/config');
const app = require('./src/app');

// Locally (`node server.js`) we listen on a port. On Vercel this is imported as a serverless
// function instead, so we only export the app and Vercel calls it for each request.
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Runway API listening on :${config.port} (sim: ${config.simUrl})`);
  });
}

module.exports = app;