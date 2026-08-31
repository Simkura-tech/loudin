/**
 * API-key authentication middleware.
 *
 * Resolves `Authorization: Bearer ldn_live_…` to an `req.api_client` shape:
 *   { id, name, prefix, scopes: string[] }
 *
 * Used on /api/external/* routes for service-to-service auth. Not
 * compatible with the cookie/JWT user auth — these endpoints are
 * intentionally distinct from the human-facing surface so a leaked API
 * key can never act as a user.
 *
 * `requireScope(scope)` is a small helper for routes that need a
 * specific scope on top of any-valid-key auth.
 */

const apiKey = require('../../services/platform/apiKey');

function readBearer(req) {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const m = header.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

async function authenticateApiKey(req, res, next) {
  const token = readBearer(req);
  if (!token) {
    return res.status(401).json({
      error:   'Authentication required',
      message: 'Provide an API key as `Authorization: Bearer ldn_live_…`',
    });
  }
  try {
    const client = await apiKey.verifyToken(token);
    if (!client) {
      return res.status(401).json({
        error:   'Authentication failed',
        message: 'API key is invalid or has been revoked',
      });
    }
    req.api_client = client;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.api_client) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.api_client.scopes.includes(scope)) {
      return res.status(403).json({
        error:   'Forbidden',
        message: `This endpoint requires the "${scope}" scope`,
      });
    }
    return next();
  };
}

module.exports = { authenticateApiKey, requireScope };
