'use strict';

/**
 * Twilio (SMS) integration descriptor.
 *
 * Registered in services/platform/integrationRegistry.js; the descriptor
 * contract is documented in docs/integrations/adding-an-integration.md.
 *
 * The actual sender (services/notifications/notifier.js) resolves these
 * fields through integrationSettings at send time, so credentials saved
 * from the admin UI take effect immediately — no reconfigure hook needed.
 */

const axios = require('axios');
const settings = require('../../services/platform/integrationSettings');

// The .env.example placeholders count as "not configured" (mirrors notifier.js).
const PLACEHOLDERS = new Set([
  'TWILIO_ACCOUNT_SID_placeholder',
  'TWILIO_AUTH_TOKEN_placeholder',
]);

function value(field) {
  const v = settings.get('twilio', field);
  return v && !PLACEHOLDERS.has(v) ? v : null;
}

module.exports = {
  name: 'twilio',
  label: 'Twilio (SMS)',
  description:
    'SMS delivery — phone verification and sign-in codes are sent through ' +
    'Twilio. When not configured, codes are printed to the API server log ' +
    'instead (dev fallback).',
  docsUrl: 'https://www.twilio.com/docs/usage/api',

  fields: [
    {
      field: 'account_sid', secret: false, env: ['TWILIO_ACCOUNT_SID'],
      label: 'Account SID', placeholder: 'AC…',
    },
    {
      field: 'auth_token', secret: true, env: ['TWILIO_AUTH_TOKEN'],
      label: 'Auth token',
    },
    {
      field: 'from_number', secret: false, env: ['TWILIO_FROM_NUMBER'],
      label: 'From number', placeholder: '+15551234567',
      help: 'A Twilio phone number in E.164 format.',
    },
  ],

  status() {
    return {
      configured: !!(value('account_sid') && value('auth_token') && value('from_number')),
    };
  },

  /** Live probe: fetch the account resource with basic auth. Never throws. */
  async test() {
    const sid   = value('account_sid');
    const token = value('auth_token');
    if (!sid || !token) return { ok: false, reason: 'not_configured' };

    const started = Date.now();
    try {
      await axios.get(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`,
        { auth: { username: sid, password: token }, timeout: 8000 }
      );
      return { ok: true, latency_ms: Date.now() - started };
    } catch (err) {
      const status = err.response?.status ?? null;
      return {
        ok: false,
        latency_ms: Date.now() - started,
        status,
        ...(status === 401 || status === 403 ? { reason: 'bad_credentials' } : {}),
        error: err.response?.data?.message || err.message,
      };
    }
  },
};
