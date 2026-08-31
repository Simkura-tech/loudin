/**
 * Role-based access control middleware.
 *
 * The role model is two user_type rows + a company_type discriminator:
 *
 *   user_type_id = 1  Admin   — company-scoped admin; what kind of admin
 *                              (platform / reseller / end_user) is determined
 *                              by req.user.company_type.
 *   user_type_id = 2  User    — regular logged-in user, non-admin.
 *
 * Earlier "Installer" (user_type_id=3) was deleted in tasks #12–#14.
 * Earlier impersonation / multi-company switching was removed in the rewrite.
 */

const USER_TYPES = {
  ADMIN: 1,
  USER:  2,
};

const COMPANY_TYPES = {
  PLATFORM: 'platform',
  RESELLER: 'reseller',
  END_USER: 'end_user',
};

function unauthorized(res, message = 'Authentication required') {
  return res.status(401).json({ error: 'Authentication required', message });
}

function forbidden(res, message = 'Insufficient permissions to access this resource') {
  return res.status(403).json({ error: 'Forbidden', message });
}

/**
 * Require the caller to be an Admin (user_type_id=1) regardless of company_type.
 */
function requireAdmin(req, res, next) {
  if (!req.user) return unauthorized(res);
  if (req.user.user_type_id !== USER_TYPES.ADMIN) return forbidden(res);
  return next();
}

/**
 * Require the caller to be a Platform Admin — Admin user in the platform company.
 * This is the "super admin" equivalent.
 */
function requirePlatformAdmin(req, res, next) {
  if (!req.user) return unauthorized(res);
  const ok = req.user.user_type_id === USER_TYPES.ADMIN
          && req.user.company_type === COMPANY_TYPES.PLATFORM;
  if (!ok) return forbidden(res, 'Platform admin access required');
  return next();
}

/**
 * Require the caller's company to be one of the allowed company_types.
 * Useful when an endpoint is scoped to (e.g.) resellers only.
 */
function requireCompanyType(...allowed) {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res);
    if (!allowed.includes(req.user.company_type)) {
      return forbidden(res, `This resource is restricted to: ${allowed.join(', ')}`);
    }
    return next();
  };
}

module.exports = {
  USER_TYPES,
  COMPANY_TYPES,
  requireAdmin,
  requirePlatformAdmin,
  requireCompanyType,
};
