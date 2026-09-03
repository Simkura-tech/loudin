/**
 * /api/platform/* — Platform Admin only endpoints.
 *
 * Cross-tenant / fleet-management surface for Loudin staff. Tenant-scoped
 * endpoints live elsewhere — this router is the place for views that
 * intentionally cut across companies.
 */

const express = require('express');

const { authenticate }         = require('../../middleware/core/auth');
const { requirePlatformAdmin } = require('../../middleware/core/rbac');

const platformDevices = require('../../controllers/platform/platformDevices');
const platformApiKeys = require('../../controllers/platform/platformApiKeys');
const platformWebhooks = require('../../controllers/platform/platformWebhooks');
const platformIntegrations = require('../../controllers/platform/platformIntegrations');
const platformFeatures = require('../../controllers/platform/platformFeatures');

const router = express.Router();

router.use(authenticate);
router.use(requirePlatformAdmin);

router.get ('/devices',      platformDevices.list);
router.post('/devices/sync', platformDevices.syncNow);

router.get   ('/api-keys',     platformApiKeys.list);
router.post  ('/api-keys',     platformApiKeys.create);
router.delete('/api-keys/:id', platformApiKeys.revoke);

// Integration settings — platform_config overrides with env fallback,
// managed from the Integrations page (list → per-integration detail).
// Feature flags — platform-wide kill switches (services/platform/featureFlags).
router.get ('/features', platformFeatures.list);
router.put ('/features', platformFeatures.update);

router.get ('/integrations',            platformIntegrations.list);
router.get ('/integrations/:name',      platformIntegrations.getOne);
router.put ('/integrations/:name',      platformIntegrations.update);
router.post('/integrations/:name/test', platformIntegrations.test);

// Outbound webhook endpoints + delivery log. Specific routes (deliveries)
// are declared before the generic /:id ones.
router.get   ('/webhooks',                          platformWebhooks.list);
router.post  ('/webhooks',                          platformWebhooks.create);
router.post  ('/webhooks/deliveries/:id/redeliver', platformWebhooks.redeliver);
router.get   ('/webhooks/:id/deliveries',           platformWebhooks.listDeliveries);
router.post  ('/webhooks/:id/rotate-secret',        platformWebhooks.rotateSecret);
router.patch ('/webhooks/:id',                      platformWebhooks.update);
router.delete('/webhooks/:id',                      platformWebhooks.remove);

module.exports = router;
