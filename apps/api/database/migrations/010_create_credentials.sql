-- Credentials table — access tokens (PIN codes, RFID cards, biometric IDs, mobile)
-- that people present to a door to gain entry.
-- A credential is owned by a person and gets installed on one or more devices
-- via the device_credentials junction (later migration).

CREATE TABLE IF NOT EXISTS credentials (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    person_id  INTEGER REFERENCES people(id) ON DELETE SET NULL,

    credential_name VARCHAR(255) NOT NULL,
    credential_type VARCHAR(50)  NOT NULL
        CHECK (credential_type IN ('pin', 'HID', 'mifare')),
        -- Extend as new lock-card protocols are supported (e.g. 26bit/34bit
        -- Wiegand variants, Desfire, mobile, biometric)

    -- Type-specific value carriers
    credential_value VARCHAR(255),     -- PIN code, mobile token, biometric hash, etc.
    facility_code    VARCHAR(50),      -- card credentials only (HID, mifare)
    card_number      VARCHAR(100),     -- card credentials only (HID, mifare)

    -- Only active / inactive for now — there's no expiration concept in the
    -- product yet. valid_from / valid_until columns are kept for the future
    -- when scheduled access lands, but neither is surfaced in the API today.
    status VARCHAR(50) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    valid_from  TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,

    description TEXT,
    notes       TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_credentials_company_id ON credentials(company_id);
CREATE INDEX idx_credentials_status     ON credentials(status);
CREATE INDEX idx_credentials_deleted_at ON credentials(deleted_at) WHERE deleted_at IS NOT NULL;

-- TODO (security): credential_value for type='code' stores PINs in plain text
-- because the door firmware compares against plain values. When auth / security
-- is redesigned, consider symmetric-encrypt-at-rest with a server-held key.

COMMENT ON TABLE  credentials                  IS 'Access tokens presented to doors';
COMMENT ON COLUMN credentials.person_id        IS 'Owner — a person, not a software user';
COMMENT ON COLUMN credentials.credential_value IS 'PIN value (for type=pin) — plain text for now, see TODO';
COMMENT ON COLUMN credentials.facility_code    IS 'Card credentials only — site identifier (HID, mifare)';
COMMENT ON COLUMN credentials.card_number      IS 'Card credentials only — unique card number (HID, mifare)';
