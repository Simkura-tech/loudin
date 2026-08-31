-- Reseller customer-invite links.
--
-- A reseller can generate a shareable signup link. An end-user company that
-- registers through that link is attached to the reseller at creation time
-- (companies.parent_company_id + parent_locked_at set inside the signup
-- transaction) instead of having to self-attach later via
-- POST /api/workspace/attach-reseller.
--
-- One reusable token per reseller, rotatable from the reseller portal.
-- Rotating replaces the token, so previously shared links stop working —
-- that IS the revocation story. NULL = no link generated yet.
--
-- The token is a capability, not a secret credential: knowing it only lets
-- a new signup attach itself to the reseller (the same thing any end-user
-- can do via the attach-reseller picker). Stored in plaintext deliberately.

ALTER TABLE companies
    ADD COLUMN customer_invite_token            VARCHAR(64),
    ADD COLUMN customer_invite_token_created_at TIMESTAMP WITH TIME ZONE;

-- Global uniqueness so a token resolves to exactly one reseller.
CREATE UNIQUE INDEX idx_companies_customer_invite_token
    ON companies(customer_invite_token)
    WHERE customer_invite_token IS NOT NULL;

COMMENT ON COLUMN companies.customer_invite_token IS
    'Reseller-only: reusable signup-invite token. End-user signups carrying '
    'it get parent_company_id set to this reseller at creation. Rotating '
    'replaces it (old links die). NULL = never generated.';
COMMENT ON COLUMN companies.customer_invite_token_created_at IS
    'When customer_invite_token was last generated/rotated.';
