-- No duplicate credentials within a company.
--
-- Two credentials carrying the same value in one company are ambiguous at
-- the door (the firmware just compares values) and break the event→person
-- resolution added in 070 (the webhook receiver matches the presented value
-- against the company's credentials — a duplicate makes the match a coin
-- flip).
--
-- Identity per type:
--   pin         — credential_value
--   HID/mifare  — card_number alone. Facility code is deliberately NOT part
--                 of the key: event payloads may omit it, so the resolver
--                 treats a missing facility code as a wildcard — two rows
--                 sharing a number under different facility codes would
--                 still be ambiguous.
--
-- Card uniqueness is also NOT scoped by credential_type: an HID and a
-- mifare row with the same number would collide at resolution time too.
--
-- Scoped to live rows (deleted_at IS NULL) — soft-deleting a credential
-- frees its value for reuse.
--
-- The API pre-checks these on create and returns a friendly 409
-- (controllers/access/credentials.js); the indexes are the race-proof
-- backstop.

CREATE UNIQUE INDEX IF NOT EXISTS uq_credentials_company_pin
    ON credentials (company_id, credential_value)
    WHERE credential_type = 'pin' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_credentials_company_card
    ON credentials (company_id, card_number)
    WHERE card_number IS NOT NULL AND deleted_at IS NULL;
