'use strict';

/**
 * Shared post-signup side effects — the single completion path for every
 * way a company + first-admin pair comes into existence (email/password
 * register, Google OAuth; phone auth will join when it lands).
 *
 * Runs AFTER the creating transaction commits: emits the company.signed_up
 * lifecycle event to registered webhook endpoints.
 *
 * Legal-acceptance stamping is NOT here — it belongs in each flow's user
 * INSERT (the columns are non-nullable-in-spirit at creation), but every
 * flow must stamp it; see register() and googleAuth's create branch.
 */

const events = require('../../integrations/events');

/**
 * @param {Object} p
 * @param {number} p.companyId
 * @param {string} p.companyType   'end_user' | 'reseller'
 * @param {string} p.companyName
 * @param {number} p.userId        the first Admin's user id
 * @param {string} p.email
 * @param {string} p.firstName
 * @param {string} p.lastName
 */
async function finalizeSignup({
  companyId, companyType,
  userId,
}) {
  void events.emit('company.signed_up', {
    company: { id: companyId, type: companyType },
    actor:   { user_id: userId },
  });
}

module.exports = { finalizeSignup };
