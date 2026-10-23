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

const { verifyToken, generateToken } = require('../../utils/jwt');
const { getAuthToken, setAuthCookie, clearAuthCookie } = require('../../utils/authCookie');
const { runAuthGates } = require('../../extensions');
const { query } = require('../../database/db');
const installers = require('../../services/tenancy/installers');
const { liveUser } = require('../../services/auth/members');

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
 * Installer service sessions (controllers/tenancy/installers.js) are only
 * valid while the customer's grant stands. Revoking a grant must end live
 * sessions immediately, so every request inside one re-checks the grant
 * (one indexed query). When it is gone, the caller is dropped back into
 * their own workspace: the cookie is swapped for a normal home-company
 * token and the request fails with SERVICE_SESSION_ENDED so the client can
 * reload into /app.
 *
 * Returns true when the request may proceed; false when a response was sent.
 */
async function enforceServiceSession(req, res) {
  const imp = req.impersonation;
  if (!imp || imp.impersonator_company_type !== 'installer') return true;
  if (await installers.hasActiveGrant(imp.impersonator_company_id, req.user.company_id)) return true;

  const { rows: [u] } = await query(
    `SELECT u.id, u.email, u.user_type_id, u.company_id, c.company_type
       FROM users u JOIN companies c ON c.id = u.company_id
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [imp.impersonator_user_id]
  );
  if (u) {
    setAuthCookie(res, generateToken({
      user_id: u.id, company_id: u.company_id, user_type_id: u.user_type_id,
      email: u.email, company_type: u.company_type,
    }));
  } else {
    clearAuthCookie(res);
  }
  res.status(403).json({
    error: 'Forbidden',
    code:  'SERVICE_SESSION_ENDED',
    message: 'Access to this workspace was revoked. You have been returned to your own workspace.',
  });
  return false;
}

/**
 * The token carries user_type_id and says nothing about status, so without
 * this an admin's "deactivate" or "remove" would only bite when the token
 * expired (JWT_EXPIRE, 24h) and a role change would wait just as long.
 * One primary-key lookup per request keeps both immediate: a gone or
 * non-active account is logged out with ACCOUNT_DISABLED, and req.user's
 * role is whatever the row says now.
 *
 * Under impersonation req.user.user_id is the actor (the platform admin or
 * installer user), so this checks the human, not the workspace.
 *
 * Returns true when the request may proceed; false when a response was sent.
 */
async function enforceLiveAccount(req, res) {
  const live = await liveUser(req.user.user_id);
  if (!live) {
    clearAuthCookie(res);
    res.status(401).json({
      error:   'Authentication failed',
      code:    'ACCOUNT_DISABLED',
      message: 'This account is no longer active.',
    });
    return false;
  }
  req.user.user_type_id = live.user_type_id;
  return true;
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
  } catch (err) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: err.message,
    });
  }
  try {
    if (!(await enforceLiveAccount(req, res))) return undefined;
    if (!(await enforceServiceSession(req, res))) return undefined;
  } catch (err) {
    return next(err);
  }
  // Extension authGates (e.g. a billing extension blocking a lapsed tenant)
  // run after the session is established. No extensions → straight to next().
  return runAuthGates(req, res, next);
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
