/**
 * GET /api/features — the platform's feature flags, for any signed-in user.
 *
 * The web app loads this once per session (FeaturesContext) to decide which
 * optional features to render. Read-only here; platform admins change them
 * via PUT /api/platform/features. Enforcement does not depend on the UI —
 * every gated route also checks the flag server-side.
 */

const express = require('express');
const { authenticate } = require('../../middleware/core/auth');
const featureFlags = require('../../services/platform/featureFlags');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    return res.json({ features: await featureFlags.snapshot() });
  } catch (err) { return next(err); }
});

module.exports = router;
