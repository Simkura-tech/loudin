/**
 * /api/credentials — PINs, HID cards, MIFARE cards.
 *
 * Tenant scoping happens in the controller (every query filters by
 * req.user.company_id). Reads open to any authenticated user; mutating
 * routes require Admin.
 */

const express = require('express');

const { authenticate } = require('../../middleware/core/auth');
const { requireAdmin } = require('../../middleware/core/rbac');
const { list, get, create, update, destroy } = require('../../controllers/access/credentials');

const router = express.Router();

router.use(authenticate);

router.get   ('/',     list);
router.get   ('/:id',  get);
router.post  ('/',     requireAdmin, create);
router.patch ('/:id',  requireAdmin, update);
router.delete('/:id',  requireAdmin, destroy);

module.exports = router;

