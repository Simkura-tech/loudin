/**
 * /api/workspace — read + edit the signed-in user's company.
 *
 * Read is open to any authenticated session; edit is Admin-only.
 * Tenant scoping happens in the controller (company_id from JWT).
 */

const express = require('express');

const { authenticate, denyImpersonation } = require('../../middleware/core/auth');
const { requireAdmin } = require('../../middleware/core/rbac');
const {
  get, update,
  scheduleCancel, undoScheduledCancel,
  attachReseller, listResellers,
} = require('../../controllers/tenancy/workspace');

const router = express.Router();

router.use(authenticate);

// GET is allowed during impersonation — UI legitimately wants to know
// which workspace it's in. Mutations are not.
router.get  ('/',                          get);
router.patch('/',                          requireAdmin, denyImpersonation, update);
router.post ('/cancel-subscription',       requireAdmin, denyImpersonation, scheduleCancel);
router.post ('/cancel-subscription/undo',  requireAdmin, denyImpersonation, undoScheduledCancel);
router.get  ('/resellers',                 denyImpersonation, listResellers);
router.post ('/attach-reseller',           requireAdmin, denyImpersonation, attachReseller);

module.exports = router;

