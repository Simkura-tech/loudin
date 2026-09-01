/**
 * /api/external — service-to-service surface, authenticated by API key
 * (`Authorization: Bearer ldn_live_…`), never by user session. A leaked
 * key can never act as a logged-in user (see middleware/core/apiKeyAuth.js).
 *
 * Deliberately minimal: `ping` is the only endpoint the platform ships.
 * The auth/scope machinery here is the extension point — add the routes
 * your integration actually needs. When you do: (1) add the scope to
 * services/platform/apiKey.js ALLOWED_SCOPES, and (2) add or flip the
 * catalog entry in apps/web/src/pages/app/apiCatalog.ts to 'live' in the
 * same change, so the API access page never advertises something the API
 * doesn't serve.
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
