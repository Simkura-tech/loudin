/**
 * /api/audit — platform-admin only.
 *
 * Read-only surface for the audit_log table. Writes go through
 * services/platform/audit.js (recordAudit) from individual controllers.
 */

const express = require('express');

const { authenticate }        = require('../../middleware/core/auth');
const { requirePlatformAdmin } = require('../../middleware/core/rbac');
const { list } = require('../../controllers/platform/audit');

const router = express.Router();

router.use(authenticate);
router.use(requirePlatformAdmin);

router.get('/', list);

module.exports = router;

