const { initDB } = require('../db');
const { createApp } = require('../app');

let app;

module.exports = async (req, res) => {
  if (!app) {
    await initDB();
    app = createApp();
  }
  return app(req, res);
};
