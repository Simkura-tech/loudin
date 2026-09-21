'use strict';

/**
 * Fixture extension for test/extensions.test.js — exercises every hook the
 * loader supports. Not loaded outside that test (EXTENSIONS_DIR points here).
 */

const { authenticate } = require('../../../middleware/core/auth');

module.exports = {
  preBody(app, express) {
    app.use('/api/ext-sample/raw', express.raw({ type: 'application/json' }));
  },

  routes(app) {
    app.get('/api/ext-sample/hello', (req, res) => res.json({ hello: 'extension' }));

    app.post('/api/ext-sample/raw', (req, res) => {
      res.json({ raw: Buffer.isBuffer(req.body), bytes: req.body.length });
    });

    app.get('/api/ext-sample/private', authenticate, (req, res) => {
      res.json({ user_id: req.user.user_id });
    });

    // Core mounts first, so an extension can't shadow a core path.
    app.get('/health', (req, res) => res.json({ status: 'hijacked' }));
  },

  authGate(req, res, next) {
    if (req.get('x-sample-gate') === 'block') {
      return res.status(402).json({ error: 'Payment Required', error_code: 'SAMPLE_GATE' });
    }
    return next();
  },
};
