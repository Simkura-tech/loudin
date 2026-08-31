/**
 * Rate Limiter Middleware
 * Protects auth endpoints from brute force and abuse
 *
 * Uses both IP-based and account-based (email) limiting for defense in depth.
 * The DB-level account lockout (5 failed attempts → 30 min lock) provides
 * the last line of defense in userModel.recordFailedLogin().
 */

const rateLimit = require('express-rate-limit')

/**
 * Login rate limiter (IP-based) - 10 requests per 15 minutes per IP
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
})

/**
 * Login rate limiter (account-based) - 5 requests per 15 minutes per email
 * Keyed on the email in the request body, so distributed attacks across
 * many IPs targeting a single account are still throttled.
 */
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Key on the lowercase email to prevent case-based bypass
    return (req.body?.email || 'unknown').toString().toLowerCase()
  },
  // This limiter keys on email, not IP — disable the IPv6 validation
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    message: 'Too many login attempts for this account. Please try again after 15 minutes.',
  },
})

/**
 * Password reset rate limiter - 3 requests per 1 hour per IP
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again after 1 hour.',
  },
})

/**
 * Registration rate limiter - 5 requests per 1 hour per IP
 */
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many registration attempts. Please try again after 1 hour.',
  },
})

/**
 * Email verification rate limiter - 10 requests per 15 minutes per IP
 * Prevents token brute-forcing on the verification endpoint.
 */
const emailVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many verification attempts. Please try again later.',
  },
})

/**
 * General auth rate limiter - 30 requests per 15 minutes per IP
 */
const generalAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
})

module.exports = {
  loginLimiter,
  loginAccountLimiter,
  passwordResetLimiter,
  registrationLimiter,
  emailVerificationLimiter,
  generalAuthLimiter,
}
