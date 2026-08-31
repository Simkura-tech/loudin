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
const documents = require('../../controllers/support/documents');

const router = express.Router();

router.use(authenticate);
router.use(requirePlatformAdmin);

router.get ('/devices',      platformDevices.list);
router.post('/devices/sync', platformDevices.syncNow);

router.get   ('/api-keys',     platformApiKeys.list);
router.post  ('/api-keys',     platformApiKeys.create);
router.delete('/api-keys/:id', platformApiKeys.revoke);

// Integration settings (Simkura core) — platform_config overrides with env
// fallback, managed from the API access page.
router.get ('/integrations',            platformIntegrations.list);
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

// Support documents (spec sheets, guides, manuals). Create is multipart.
router.get   ('/documents',     documents.adminList);
router.post  ('/documents',     documents.uploadMiddleware, documents.create);
router.patch ('/documents/:id', documents.update);
router.delete('/documents/:id', documents.remove);

module.exports = router;
