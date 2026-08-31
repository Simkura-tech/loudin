/**
 * /api/reseller — endpoints scoped to the caller's reseller company.
 *
 * Every route here requires authentication + company_type='reseller'.
 * Tenant filtering is enforced in the controller (parent_company_id =
 * req.user.company_id).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const { authenticate }      = require('../../middleware/core/auth');
const { requireCompanyType } = require('../../middleware/core/rbac');
const {
  listCustomers,
  getCustomer,
  getCustomerDevices,
  getCustomerUsers,
  listDevices,
  impersonateCustomer,
  getInvite,
  rotateInvite,
  sendInvite,
} = require('../../controllers/tenancy/reseller');

const router = express.Router();

router.use(authenticate);
router.use(requireCompanyType('reseller'));

router.get('/customers',             listCustomers);
router.get('/customers/:id',         getCustomer);
router.get('/customers/:id/devices', getCustomerDevices);
router.get('/customers/:id/users',   getCustomerUsers);
router.get('/devices',               listDevices);
router.post('/customers/:id/impersonate', impersonateCustomer);

// Emailing invites is keyed per reseller company (not per IP) so a
// reseller can't spray arbitrary inboxes from Loudin's domain.
const inviteSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req) => String(req.user.company_id),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Invite email limit reached — try again in an hour.' },
});

// Customer-invite link: signups through it auto-attach to this reseller.
router.get ('/invite',        getInvite);
router.post('/invite/rotate', rotateInvite);
router.post('/invite/send',   inviteSendLimiter, sendInvite);

module.exports = router;

