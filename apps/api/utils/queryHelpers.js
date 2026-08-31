/**
 * Query Helpers
 * Shared utilities for sanitizing user input in database queries.
 */

/**
 * Escape LIKE/ILIKE special characters in a search string.
 * Prevents users from using % and _ as wildcards in search queries.
 * @param {string} str - Raw search input
 * @returns {string} Escaped string safe for LIKE patterns
 */
function escapeLike(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Build a safe LIKE/ILIKE pattern from user input.
 * @param {string} search - Raw search input
 * @returns {string} Pattern like '%escaped_search%'
 */
function likePattern(search) {
  return `%${escapeLike(search)}%`;
}

/**
 * Parse and clamp pagination parameters from a query object.
 * @param {Object} query - req.query or similar object
 * @param {Object} [defaults] - Default values
 * @param {number} [defaults.limit=25] - Default limit
 * @param {number} [defaults.maxLimit=100] - Maximum allowed limit
 * @returns {{ limit: number, offset: number, page: number }}
 */
function parsePagination(query, defaults = {}) {
  const maxLimit = defaults.maxLimit || 100;
  const defaultLimit = defaults.limit || 25;

  const page = Math.max(parseInt(query?.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query?.limit, 10) || defaultLimit, 1), maxLimit);
  const offset = query?.offset !== undefined
    ? Math.max(parseInt(query.offset, 10) || 0, 0)
    : (page - 1) * limit;

  return { limit, offset, page };
}

module.exports = { escapeLike, likePattern, parsePagination };
