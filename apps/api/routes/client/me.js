/**
 * /api/me — self-service profile + password change.
 *
 * No admin gate — any signed-in user can edit their own record.
 * Reading the current user lives on /api/auth/me.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const { authenticate } = require('../../middleware/core/auth');
const { updateProfile, changePassword } = require('../../controllers/auth/me');

const router = express.Router();

router.use(authenticate);

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Too many password attempts — try again later.' },
});

router.patch('/',          updateProfile);
router.post ('/password',  passwordLimiter, changePassword);

module.exports = router;

