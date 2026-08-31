-- platform_config — small key/value store for platform-wide runtime config
-- that we don't want hard-coded in env vars (because they change after the
-- service is already up, e.g. the Simkura webhook id we get back when we
-- register, or a feature-flag toggle).
--
-- Per-tenant config lives on `companies`. This table is intentionally
-- platform-scoped — one row per setting, no company_id.

CREATE TABLE IF NOT EXISTS platform_config (
    key        VARCHAR(100) PRIMARY KEY,
    value      TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  platform_config IS 'Platform-wide runtime config — one row per setting key.';
COMMENT ON COLUMN platform_config.key   IS 'e.g. simkura_webhook_id';
COMMENT ON COLUMN platform_config.value IS 'String value — interpret per key (parse JSON / cast as needed).';
