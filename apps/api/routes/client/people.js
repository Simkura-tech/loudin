/**
 * /api/people — door-access credential holders.
 *
 * All routes require an authenticated session. Mutating routes require Admin
 * role; reads are open to any signed-in user (will matter once non-admin
 * Users become a real surface).
 *
 * Tenant scoping happens in the controller, not here — every query filters
 * by req.user.company_id, so a leak through this router is structurally
 * impossible.
 */

const express = require('express');

const { authenticate } = require('../../middleware/core/auth');
const { requireAdmin } = require('../../middleware/core/rbac');
const { list, get, create, update, destroy } = require('../../controllers/access/people');

const router = express.Router();

router.use(authenticate);

router.get   ('/',     list);
router.get   ('/:id',  get);
router.post  ('/',     requireAdmin, create);
router.patch ('/:id',  requireAdmin, update);
router.delete('/:id',  requireAdmin, destroy);

module.exports = router;

