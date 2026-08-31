-- Workspace profile expansion — drives the new collapsible sections on
-- the settings page (Company / Lead contact / Shipping / Billing /
-- Notifications).
--
-- Conventions:
--   * The existing street/city/state/zip/country columns are reinterpreted
--     as the SHIPPING address. We don't rename them to avoid touching
--     every read/write site. UI labels them as "Shipping".
--   * Billing address lives in billing_* columns. When
--     billing_same_as_shipping = true, the billing_* columns SHOULD be
--     null (UI hides them). When false, they're the source of truth.
--   * Lead contact is a NAMED PERSON — distinct from company_email /
--     company_phone, which are general "info@" / main-line contacts.
--   * notification_preferences is JSONB so we can add toggles without
--     migrations. Known keys (all booleans) are enforced in app code.

ALTER TABLE companies
    -- Lead contact (single named person)
    ADD COLUMN lead_contact_name  VARCHAR(255),
    ADD COLUMN lead_contact_email VARCHAR(255),
    ADD COLUMN lead_contact_phone VARCHAR(50),
    ADD COLUMN lead_contact_title VARCHAR(100),

    -- Billing address — optional. NULL columns when billing matches shipping.
    ADD COLUMN billing_street               VARCHAR(255),
    ADD COLUMN billing_city                 VARCHAR(100),
    ADD COLUMN billing_state                VARCHAR(100),
    ADD COLUMN billing_zip                  VARCHAR(20),
    ADD COLUMN billing_country              VARCHAR(100),
    ADD COLUMN billing_same_as_shipping     BOOLEAN NOT NULL DEFAULT TRUE,

    -- Tax / legal identifier (free text — EIN, VAT, etc.)
    ADD COLUMN tax_id VARCHAR(50),

    -- Notification preferences. Defaults: opt-in to everything except marketing.
    ADD COLUMN notification_preferences JSONB
        NOT NULL DEFAULT '{
            "device_incidents":   true,
            "weekly_digest":      true,
            "billing_alerts":     true,
            "security_alerts":    true,
            "marketing_updates":  false
        }'::jsonb;

COMMENT ON COLUMN companies.lead_contact_name  IS 'Named primary point of contact for this workspace';
COMMENT ON COLUMN companies.billing_same_as_shipping IS 'When true, billing_* columns should be NULL; the shipping address (street/city/state/zip/country) is also the billing address';
COMMENT ON COLUMN companies.tax_id IS 'Generic tax/legal identifier — EIN (US), VAT (EU), GST, etc. Validation deferred until invoicing is wired.';
COMMENT ON COLUMN companies.notification_preferences IS 'JSON object of boolean toggles. Known keys: device_incidents, weekly_digest, billing_alerts, security_alerts, marketing_updates. Unknown keys are ignored by the app but preserved on write.';
