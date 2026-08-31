/**
 * Company context utilities.
 * Helpers for extracting and setting the active company on a request.
 *
 * Multi-company access (one user reaching multiple companies) was deferred
 * during the schema rewrite, so per-request company switching helpers were
 * removed. They'll come back if/when multi-company access is reintroduced.
 */

/**
 * Extract a company ID from the request.
 * Priority: X-Company-Id header > body > params > query.
 * @param {Object} req - Express request
 * @returns {string|null} Raw company ID value (not parsed)
 */
const extractCompanyId = (req) => {
  return req.headers['x-company-id'] ||
         req.body?.company_id ||
         req.params?.company_id ||
         req.params?.companyId ||
         req.query?.company_id ||
         null;
};

/**
 * Set the company context on the request.
 * @param {Object} req - Express request
 * @param {number} companyId - Company ID to set
 * @param {Object} [options] - Metadata about how the context was determined
 */
const setCompanyContext = (req, companyId, options = {}) => {
  req.company_id = companyId;
  req.contextMeta = {
    source: options.source || 'default',
    setAt: new Date().toISOString(),
  };
};

/**
 * Light validation that a value looks like a usable company ID.
 * @param {string|number} companyId
 * @returns {boolean}
 */
const isValidCompanyId = (companyId) => {
  if (!companyId) return false;
  const id = parseInt(companyId);
  return !isNaN(id) && id > 0;
};

module.exports = {
  extractCompanyId,
  setCompanyContext,
  isValidCompanyId,
};
