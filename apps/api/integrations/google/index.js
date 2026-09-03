'use strict';

/**
 * Google OAuth integration.
 *
 * Thin wrapper around google-auth-library's OAuth2Client.
 * Handles auth URL generation and code-to-token exchange.
 *
 * Configuration resolves through the platform integration settings
 * (services/platform/integrationSettings.js) on EVERY use — a value saved
 * on the admin "Integrations" tab (google card) wins, env
 * vars are the fallback:
 *   client_id     / GOOGLE_CLIENT_ID
 *   client_secret / GOOGLE_CLIENT_SECRET
 *   redirect_uri  / GOOGLE_REDIRECT_URI — must exactly match a URI
 *                   registered in Google Cloud Console; defaults to
 *                   http://localhost:3000/api/auth/google/callback for dev.
 */

const { OAuth2Client } = require('google-auth-library');
const settings = require('../../services/platform/integrationSettings');

const SCOPES = ['openid', 'email', 'profile'];

// The .env.example placeholders count as "not configured" (mirrors integration.js).
const PLACEHOLDERS = new Set(['your_google_client_id', 'your_google_client_secret']);

function value(field) {
  const v = settings.get('google', field);
  return v && !PLACEHOLDERS.has(v) ? v : null;
}

function clientId() { return value('client_id'); }
function clientSecret() { return value('client_secret'); }

function redirectUri() {
  return value('redirect_uri') || 'http://localhost:3000/api/auth/google/callback';
}

function isConfigured() {
  return !!(clientId() && clientSecret());
}

function getClient() {
  if (!isConfigured()) {
    throw new Error('Google OAuth is not configured — set the client id/secret on the Integrations tab or via GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET');
  }
  return new OAuth2Client(clientId(), clientSecret(), redirectUri());
}

/**
 * Generate the Google authorization URL.
 * @param {string} state - CSRF token; must be verified in the callback.
 * @returns {string} URL to redirect the user to.
 */
function getAuthUrl(state) {
  return getClient().generateAuthUrl({
    scope:       SCOPES,
    state,
    access_type: 'online',
    prompt:      'select_account',
  });
}

/**
 * Exchange an authorization code for user profile data.
 * Verifies the ID token signature against Google's public keys.
 *
 * @param {string} code - Authorization code from the callback query string.
 * @returns {Promise<{
 *   googleId: string,
 *   email: string,
 *   emailVerified: boolean,
 *   firstName: string,
 *   lastName: string,
 * }>}
 */
async function exchangeCode(code) {
  const client = getClient();
  const { tokens } = await client.getToken(code);

  const ticket = await client.verifyIdToken({
    idToken:  tokens.id_token,
    audience: clientId(),
  });

  const p = ticket.getPayload();
  return {
    googleId:      p.sub,
    email:         p.email,
    emailVerified: p.email_verified ?? false,
    firstName:     p.given_name  || '',
    lastName:      p.family_name || '',
  };
}

module.exports = { isConfigured, getAuthUrl, exchangeCode };
