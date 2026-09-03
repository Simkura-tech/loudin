/**
 * Authentication middleware.
 *
 * Verifies the JWT from the httpOnly auth cookie (or Authorization header
 * fallback) and attaches a normalized req.user to the request.
 *
 * Stripped 2026-05-12:
 *   - The old user_type_id=4 block (credential-holder role; no longer exists)
 *   - Impersonation / multi-company-switching handling (removed in rewrite)
 */

const { verifyToken } = require('../../utils/jwt');
const { getAuthToken } = require('../../utils/authCookie');

function attachUser(decoded, req) {
  req.user = {
    user_id:      decoded.user_id,
    company_id:   decoded.company_id,
    user_type_id: decoded.user_type_id,
    email:        decoded.email,
    company_type: decoded.company_type || null,
  };

  // When the token was issued via the impersonation flow, surface that
  // context separately. The actor (req.user) is the human across both
  // states; req.impersonation tells endpoints "I'm being acted upon by
  // someone outside my own tenant."
  //   - req.user.company_id / company_type → the IMPERSONATED workspace
  //     (so existing tenant-scoped queries work unchanged)
  //   - req.impersonation.impersonator_* → the actor's home tenant
  if (decoded.impersonation) {
    req.impersonation = {
      impersonator_user_id:      decoded.impersonation.impersonator_user_id,
      impersonator_company_id:   decoded.impersonation.impersonator_company_id,
      impersonator_company_type: decoded.impersonation.impersonator_company_type,
      scope:                     decoded.impersonation.scope || [],
      started_at:                decoded.impersonation.started_at,
    };
  }

}

/**
 * Require a valid token. Rejects with 401 if missing or invalid.
 */
async function authenticate(req, res, next) {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'No authentication token provided',
    });
  }
  try {
    const decoded = verifyToken(token);
    attachUser(decoded, req);
    return next();
  } catch (err) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: err.message,
    });
  }
}

/**
 * Attach req.user if a valid token is present, but don't require one.
 * Use this on public endpoints that customize their response when signed in.
 */
async function optionalAuthenticate(req, res, next) {
  const token = getAuthToken(req);
  if (!token) return next();
  try {
    const decoded = verifyToken(token);
    attachUser(decoded, req);
  } catch {
    // Invalid/expired token on an optional path — treat as anonymous.
  }
  return next();
}

/**
 * Refuse the request when the caller's session is an impersonation
 * session. Apply this to routes that should never be reachable while a
 * platform admin is acting "as" a customer — settings, billing, support, etc.
 *
 * Returns 403 with a clear error so the frontend can route appropriately.
 */
function denyImpersonation(req, res, next) {
  if (req.impersonation) {
    return res.status(403).json({
      error: 'Forbidden',
      message:
        "This action isn't available while viewing a customer's workspace. " +
        "Exit the customer view to continue.",
      error_code: 'IMPERSONATION_NOT_ALLOWED',
    });
  }
  return next();
}

module.exports = { authenticate, optionalAuthenticate, denyImpersonation };
