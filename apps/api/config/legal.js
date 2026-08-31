/**
 * Legal document versions in effect right now.
 *
 * The signup flow writes (version, accepted_at) to users.{terms,privacy}_*
 * using these constants. When you change a document, bump the corresponding
 * version string here — the app then knows the existing acceptance is
 * stale, and we can prompt users to re-accept.
 *
 * Version format: 'YYYY-MM-DD'. Pick the date the new copy goes live.
 *
 * Routes that surface the actual document copy live in the web app:
 *   /terms     — Terms of Service
 *   /privacy   — Privacy Policy
 */

module.exports = {
  TERMS_VERSION:   '2026-05-18',
  PRIVACY_VERSION: '2026-05-18',
};
