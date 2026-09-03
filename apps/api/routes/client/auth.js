/**
 * /api/auth — register, login, logout, me.
 *
 * Rate-limits the unauthenticated entry points (register + login) so they
 * can't be brute-forced. /me + /logout are session-gated; no extra limiter
 * needed.
 *
 * TODO (dual-auth): when phone-based auth lands, this file mounts the
 * additional verify-by-SMS endpoints alongside register/login.
 *
 * TODO (google-oauth): GET /api/auth/google and the OAuth callback mount here
 * too — keep all auth surface under one router.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  register, login, logout, me,
  verify2fa,
  twoFactorEnable, twoFactorConfirm, twoFactorDisable,
  forgotPassword, resetPassword,
  endImpersonation,
} = require('../../controllers/auth/auth');
const { redirectToGoogle, handleCallback } = require('../../controllers/auth/googleAuth');
const { authenticate } = require('../../middleware/core/auth');

const router = express.Router();

const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Too many auth attempts — try again later.' },
});

// Google OAuth — no rate limiter needed (Google handles brute-force on their end)
router.get('/google',          redirectToGoogle);
router.get('/google/callback', handleCallback);

router.post('/register',         authAttemptLimiter, register);
router.post('/login',            authAttemptLimiter, login);
router.post('/verify-2fa',       authAttemptLimiter, verify2fa);
router.post('/forgot-password',  authAttemptLimiter, forgotPassword);
router.post('/reset-password',   authAttemptLimiter, resetPassword);
router.post('/logout',           logout);
router.get ('/me',               authenticate, me);
router.post('/end-impersonation', authenticate, endImpersonation);

// 2FA enrollment is gated on an active session.
router.post('/2fa/enable',  authenticate, twoFactorEnable);
router.post('/2fa/confirm', authenticate, twoFactorConfirm);
router.post('/2fa/disable', authenticate, twoFactorDisable);

module.exports = router;

