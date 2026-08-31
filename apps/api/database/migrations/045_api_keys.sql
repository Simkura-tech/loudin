-- API keys for service-to-service integration (CRM, etc.)
--
-- Platform-scoped for now: every key is minted by a platform admin and
-- grants access to the corresponding /api/external/* endpoints. Tenant
-- keys (a reseller integrating with their own systems) can layer on
-- later by adding a nullable company_id column.
--
-- Storage: we never store the plaintext. On mint we return the full
-- `ldn_live_{prefix}{secret}` to the caller once; only `prefix` (for
-- display / quick lookup) and a bcrypt hash of the full token live in
-- the database. Lookups use the prefix as an index, then bcrypt-compare
-- the full token to confirm.

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,

    name        VARCHAR(120)   NOT NULL,         -- human label, e.g. "Loudin CRM (prod)"
    prefix      VARCHAR(20)    NOT NULL UNIQUE,  -- first segment shown in the UI
    key_hash    VARCHAR(255)   NOT NULL,         -- bcrypt of the full secret
    scopes      TEXT[]         NOT NULL DEFAULT '{}',

    created_by  INTEGER,                         -- user_id of the minting admin (plain int, no FK)
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE,
    revoked_at  TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_api_keys_active        ON api_keys(prefix)      WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_revoked_at    ON api_keys(revoked_at)  WHERE revoked_at IS NOT NULL;

COMMENT ON TABLE  api_keys             IS 'Service-to-service API keys for 3rd-party integrations.';
COMMENT ON COLUMN api_keys.prefix      IS 'First segment of the token, e.g. "ldn_live_8x9k2nQ". Safe to display.';
COMMENT ON COLUMN api_keys.key_hash    IS 'bcrypt hash of the full token. Never store the plaintext.';
COMMENT ON COLUMN api_keys.scopes      IS 'Granted scopes, e.g. {"ping","read:devices"}.';
COMMENT ON COLUMN api_keys.last_used_at IS 'Stamped on each successful verify; lets admins spot stale keys.';
COMMENT ON COLUMN api_keys.revoked_at  IS 'Soft revocation. Rows are never hard-deleted so an audit trail survives.';
