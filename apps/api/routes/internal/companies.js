/**
 * /api/companies — Platform Admin only. Tenant management surface.
 *
 * End-user admins use /api/workspace for their own company; this endpoint
 * is for Loudin staff to see every tenant on the platform.
 */

const express = require('express');

const { authenticate }        = require('../../middleware/core/auth');
const { requirePlatformAdmin } = require('../../middleware/core/rbac');
const {
  list, get, listUsers, listDevices,
  suspend, reactivate, cancel,
} = require('../../controllers/tenancy/companies');

const router = express.Router();

router.use(authenticate);
router.use(requirePlatformAdmin);

router.get ('/',                    list);
router.get ('/:id',                 get);
router.get ('/:id/users',           listUsers);
router.get ('/:id/devices',         listDevices);
router.post('/:id/suspend',         suspend);
router.post('/:id/reactivate',      reactivate);
router.post('/:id/cancel',          cancel);

module.exports = router;

