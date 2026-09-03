'use strict';

/**
 * Resend (transactional email) integration descriptor.
 *
 * Registered in services/platform/integrationRegistry.js; the descriptor
 * contract is documented in docs/integrations/adding-an-integration.md.
 *
 * The actual sender (services/notifications/notifier.js) resolves these
 * fields through integrationSettings at send time, so a key saved from
 * the admin UI takes effect immediately — no reconfigure hook needed.
 */

const axios = require('axios');
const settings = require('../../services/platform/integrationSettings');

// The .env.example placeholder counts as "not configured" (mirrors notifier.js).
const PLACEHOLDERS = new Set(['re_your_resend_api_key']);

function apiKey() {
  const v = settings.get('resend', 'api_key');
  return v && !PLACEHOLDERS.has(v) ? v : null;
}

module.exports = {
  name: 'resend',
  label: 'Resend (email)',
  description:
    'Transactional email — sign-in codes, invites, and ops alerts are ' +
    'delivered through Resend. When no key is configured, codes are printed ' +
    'to the API server log instead (dev fallback).',
  docsUrl: 'https://resend.com/docs/api-reference/introduction',

  fields: [
    {
      field: 'api_key', secret: true, env: ['RESEND_API_KEY'],
      label: 'API key', placeholder: 're_…',
    },
    {
      field: 'from_address', secret: false, env: ['RESEND_FROM'],
      label: 'From address',
      help: 'Sender address — must be on a domain verified in Resend.',
    },
    {
      field: 'ops_alert_email', secret: false, env: ['OPS_ALERT_EMAIL'],
      label: 'Ops alert email',
      help: 'Destination for operational alerts (webhook failures, background job errors). Alerts are dropped with a log line when unset.',
    },
  ],

  status() {
    return { configured: !!apiKey() };
  },

  /** Live probe: list domains with the effective key. Never throws. */
  async test() {
    const key = apiKey();
    if (!key) return { ok: false, reason: 'not_configured' };

    const started = Date.now();
    try {
      await axios.get('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 8000,
      });
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
