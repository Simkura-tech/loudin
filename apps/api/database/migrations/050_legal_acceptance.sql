-- Legal acceptance audit trail.
--
-- Captures who agreed to which version of which legal document, and when.
-- We write these at register time so every signup from day one has the
-- record — the actual ToS / Privacy / Dealer Agreement copy can be drafted
-- and versioned later without losing the audit trail.
--
-- Conventions:
--   * The "current version" is owned by the API (see config/legal.js).
--     Clients send acceptance as a boolean; the server stamps the date AND
--     the version it considers current. Never trust a client-supplied version.
--   * Version strings are date-based: 'YYYY-MM-DD'. A re-acceptance prompt
--     fires when the current version differs from what the user accepted.
--   * Terms + privacy are accepted by every signup. Dealer agreement is
--     accepted only by resellers (and only the first user of the reseller
--     company — they're agreeing on behalf of the company).
--   * All columns NULLABLE so existing rows don't need backfill. New signups
--     will populate them.

ALTER TABLE users
    ADD COLUMN terms_accepted_at             TIMESTAMP WITH TIME ZONE,
    ADD COLUMN terms_version                 VARCHAR(20),
    ADD COLUMN privacy_accepted_at           TIMESTAMP WITH TIME ZONE,
    ADD COLUMN privacy_version               VARCHAR(20),
    ADD COLUMN dealer_agreement_accepted_at  TIMESTAMP WITH TIME ZONE,
    ADD COLUMN dealer_agreement_version      VARCHAR(20);

COMMENT ON COLUMN users.terms_accepted_at IS
    'When the user accepted the Terms of Service. NULL means no recorded acceptance.';
COMMENT ON COLUMN users.terms_version IS
    'Version of the ToS in effect at acceptance time (YYYY-MM-DD). Compared to the current version to decide whether to re-prompt.';
COMMENT ON COLUMN users.dealer_agreement_accepted_at IS
    'When a reseller-company admin accepted the Dealer Agreement. NULL for end-user signups.';
