/**
 * /api/installer — the installer company's own surface.
 *
 * Lists the customer workspaces that have granted this installer access and
 * opens a service session inside one (controllers/tenancy/installers.js).
 * Installer Admins can also provision a brand-new customer workspace, which
 * arrives pre-granted to them.
 * Restricted to users whose HOME company is an installer; during a service
 * session company_type is the customer's, so these routes are unreachable
 * until the installer exits (POST /api/auth/end-impersonation).
 */

const express = require('express');

const { authenticate } = require('../../middleware/core/auth');
const { requireAdmin, requireCompanyType } = require('../../middleware/core/rbac');
const { installer } = require('../../controllers/tenancy/installers');

const router = express.Router();

router.use(authenticate);
router.use(requireCompanyType('installer'));

router.get ('/customers',                    installer.customers);
router.post('/customers',                   requireAdmin, installer.createCustomer);
router.post('/customers/:companyId/session', installer.startSession);

module.exports = router;
