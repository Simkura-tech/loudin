'use strict';

/**
 * Google OAuth (sign in with Google) integration descriptor.
 *
 * Registered in services/platform/integrationRegistry.js; the descriptor
 * contract is documented in docs/integrations/adding-an-integration.md.
 *
 * The OAuth flow (./index.js) resolves these fields through
 * integrationSettings on every use — a client id/secret saved from the
 * admin UI takes effect on the next sign-in attempt, no restart or
 * reconfigure hook needed.
 */

const axios = require('axios');
const settings = require('../../services/platform/integrationSettings');

// The .env.example placeholders count as "not configured" (mirrors ./index.js).
const PLACEHOLDERS = new Set(['your_google_client_id', 'your_google_client_secret']);

function value(field) {
  const v = settings.get('google', field);
  return v && !PLACEHOLDERS.has(v) ? v : null;
}

module.exports = {
  name: 'google',
  label: 'Google (sign-in)',
  description:
    '"Sign in with Google" for user accounts. When not configured, the ' +
    'Google button is hidden and email/password sign-in works as usual.',
  docsUrl: 'https://console.cloud.google.com/apis/credentials',

  fields: [
    {
      field: 'client_id', secret: false, env: ['GOOGLE_CLIENT_ID'],
      label: 'OAuth client ID', placeholder: '….apps.googleusercontent.com',
    },
    {
      field: 'client_secret', secret: true, env: ['GOOGLE_CLIENT_SECRET'],
      label: 'OAuth client secret', placeholder: 'GOCSPX-…',
    },
    {
      field: 'redirect_uri', secret: false, env: ['GOOGLE_REDIRECT_URI'],
      label: 'Redirect URI', placeholder: 'https://api.example.com/api/auth/google/callback',
      help: 'Must exactly match an Authorized redirect URI on the OAuth client in Google Cloud Console. Defaults to http://localhost:3000/api/auth/google/callback for dev.',
    },
  ],

  status() {
    return { configured: !!(value('client_id') && value('client_secret')) };
  },

  /**
   * Live probe without a user flow: exchange a deliberately bogus code at
   * Google's token endpoint. `invalid_client` = the credentials themselves
   * were rejected; `invalid_grant` = the client authenticated and only the
   * bogus code was refused — i.e. the credentials work. Never throws.
   */
  async test() {
    const clientId = value('client_id');
    const clientSecret = value('client_secret');
    if (!clientId || !clientSecret) return { ok: false, reason: 'not_configured' };

    const started = Date.now();
    try {
      const r = await axios.post(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          grant_type:    'authorization_code',
          code:          'loudin-connection-probe',
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  value('redirect_uri') || 'http://localhost:3000/api/auth/google/callback',
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 8000,
          validateStatus: () => true,
        }
      );
      const code = r.data?.error;
      if (code === 'invalid_grant') {
        return { ok: true, latency_ms: Date.now() - started };
      }
      return {
        ok: false,
        latency_ms: Date.now() - started,
        status: r.status,
        ...(code === 'invalid_client' || code === 'unauthorized_client'
          ? { reason: 'bad_credentials' } : {}),
        error: r.data?.error_description || code || `HTTP ${r.status}`,
      };
    } catch (err) {
      return { ok: false, latency_ms: Date.now() - started, error: err.message };
    }
  },
};
