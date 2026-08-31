/**
 * /api/external — service-to-service surface, authenticated by API key
 * (`Authorization: Bearer ldn_live_…`), never by user session. A leaked
 * key can never act as a logged-in user (see middleware/core/apiKeyAuth.js).
 *
 * The endpoint catalog shown in the platform UI lives at
 * apps/web/src/pages/app/apiCatalog.ts — when adding a route here, add or
 * flip its catalog entry to 'live' in the same change.
 */

const express = require('express');

const { authenticateApiKey, requireScope } = require('../../middleware/core/apiKeyAuth');

const router = express.Router();

router.use(authenticateApiKey);

// GET /api/external/ping — confirm the key is valid; echoes key metadata
// so integrating services can use it as a credentials health probe.
router.get('/ping', requireScope('ping'), (req, res) => {
  const { name, prefix, scopes } = req.api_client;
  res.json({
    ok: true,
    name,
    prefix,
    scopes,
    time: new Date().toISOString(),
  });
});

module.exports = router;
