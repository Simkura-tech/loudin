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
} = require('../../controllers/tenancy/workspace');
const members = require('../../controllers/tenancy/members');
const { workspace: installerAccess } = require('../../controllers/tenancy/installers');

const router = express.Router();

router.use(authenticate);

// Installer service sessions (controllers/tenancy/installers.js) are full
// admin inside the customer workspace, so PATCH is allowed. What stays
// customer-only (denyImpersonation): cancelling the subscription, managing
// login users, and deciding who may service the doors.
router.get  ('/',                          get);
router.patch('/',                          requireAdmin, update);
router.post ('/cancel-subscription',       requireAdmin, denyImpersonation, scheduleCancel);
router.post ('/cancel-subscription/undo',  requireAdmin, denyImpersonation, undoScheduledCancel);

// Login users of this workspace + the invites that add more of them
// (controllers/tenancy/members.js). People with door access are /api/people.
router.get   ('/members',             requireAdmin, members.list);
router.post  ('/invites',             requireAdmin, denyImpersonation, members.create);
router.post  ('/invites/:id/resend',  requireAdmin, denyImpersonation, members.resend);
router.delete('/invites/:id',         requireAdmin, denyImpersonation, members.revoke);
router.patch ('/members/:id',         requireAdmin, denyImpersonation, members.update);
router.delete('/members/:id',         requireAdmin, denyImpersonation, members.remove);
router.post  ('/members/:id/reset-password', requireAdmin, denyImpersonation, members.resetPassword);

// Installer access — which installer companies may work in this workspace
// (controllers/tenancy/installers.js → workspace.*).
router.get   ('/installers',           requireAdmin, installerAccess.list);
router.get   ('/installers/available', requireAdmin, denyImpersonation, installerAccess.available);
router.post  ('/installers',           requireAdmin, denyImpersonation, installerAccess.grant);
router.delete('/installers/:grantId',  requireAdmin, denyImpersonation, installerAccess.revoke);

module.exports = router;

