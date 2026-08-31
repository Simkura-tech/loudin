'use strict';

/**
 * Google OAuth integration.
 *
 * Thin wrapper around google-auth-library's OAuth2Client.
 * Handles auth URL generation and code-to-token exchange.
 *
 * Env vars:
 *   GOOGLE_CLIENT_ID      — OAuth client id from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET  — OAuth client secret
 *   GOOGLE_REDIRECT_URI   — Must exactly match a URI registered in Google Cloud Console
 *                           e.g. https://api.example.com/api/auth/google/callback
 *                           Defaults to http://localhost:3000/api/auth/google/callback for dev.
 */

const { OAuth2Client } = require('google-auth-library');

const SCOPES = ['openid', 'email', 'profile'];

function redirectUri() {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:3000/api/auth/google/callback'
  );
}

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getClient() {
  if (!isConfigured()) {
    throw new Error('Google OAuth is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  }
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri(),
  );
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
    audience: process.env.GOOGLE_CLIENT_ID,
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
