/**
 * Auth Cookie Utility
 * Sets and clears JWT tokens as httpOnly cookies for secure browser auth.
 * API key consumers (sk_) continue to use the Authorization header.
 */

const COOKIE_NAME = 'auth_token';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Set the JWT token as an httpOnly cookie on the response.
 * @param {import('express').Response} res - Express response
 * @param {string} token - JWT token string
 */
function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,           // HTTPS only in production
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,   // 24 hours (matches JWT_EXPIRE default)
  });
}

/**
 * Clear the auth cookie (logout).
 * @param {import('express').Response} res - Express response
 */
function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  });
}

/**
 * Read the auth token from the request — cookie first, then Authorization header.
 * @param {import('express').Request} req - Express request
 * @returns {string|null} JWT token or null
 */
function getAuthToken(req) {
  // 1. Check httpOnly cookie
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }

  // 2. Fallback to Authorization header (for API key consumers, mobile, etc.)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7) || null;
  }

  return null;
}

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie, getAuthToken };
