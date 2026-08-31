-- Link access events to the credential (and its person) that was presented.
--
-- Simkura's access.granted / access.denied payloads carry the raw credential
-- value (PIN digits or card number) but no identifier we can key on, so the
-- webhook receiver resolves the value against the owning company's
-- `credentials` rows at ingest time and stamps the match here. That lets the
-- activity feed say "Pete Jones got access" instead of "PIN •••• matched".
--
-- Both columns are nullable: unmatched values (deleted credential, unknown
-- card, device not yet claimed) still store the event, just without a link.
-- ON DELETE SET NULL keeps event history when a credential/person is removed;
-- the UI falls back to the masked-value rendering in that case.

ALTER TABLE device_events
    ADD COLUMN IF NOT EXISTS credential_id INTEGER REFERENCES credentials(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS person_id     INTEGER REFERENCES people(id)      ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_device_events_person_id
    ON device_events(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_events_credential_id
    ON device_events(credential_id) WHERE credential_id IS NOT NULL;

COMMENT ON COLUMN device_events.credential_id IS 'Credential matched from the event payload''s PIN/card value at ingest (NULL if unmatched)';
COMMENT ON COLUMN device_events.person_id     IS 'Owner of the matched credential at ingest time (NULL if unmatched or credential had no person)';

-- Backfill existing access events. Extract the presented value from the known
-- payload shapes (see deviceEventRendering.tsx / INTEGRATION_REST.md) — the
-- carrier is `credential` (granted) or `attemptedCredential` (denied), and is
-- either an object or a flat PIN string:
--   { pin: [1,2,3,4] }           — PIN as digit array
--   { pin: "1234" }              — PIN as string
--   { cardNumber, facilityCode } — card
--   "1234"                       — legacy flat PIN string
-- and match it against the event company's live credentials.
WITH src AS (
    SELECT e.id AS event_id,
           e.company_id,
           COALESCE(e.event_data->'credential',
                    e.event_data->'attemptedCredential') AS cred
      FROM device_events e
     WHERE e.company_id IS NOT NULL
       AND e.credential_id IS NULL
       AND e.event_type IN ('access.granted', 'access.denied',
                            'access_granted', 'access_denied')
),
presented AS (
    SELECT event_id,
           company_id,
           CASE
             WHEN jsonb_typeof(cred->'pin') = 'array'
               THEN (SELECT string_agg(x.v, '' ORDER BY x.ord)
                       FROM jsonb_array_elements_text(cred->'pin')
                            WITH ORDINALITY AS x(v, ord))
             WHEN jsonb_typeof(cred->'pin') IN ('string', 'number')
               THEN cred->>'pin'
             WHEN jsonb_typeof(cred) = 'string'
               THEN cred #>> '{}'
           END AS pin,
           cred->>'cardNumber'   AS card_number,
           cred->>'facilityCode' AS facility_code
      FROM src
     WHERE cred IS NOT NULL
),
matched AS (
    SELECT DISTINCT ON (p.event_id)
           p.event_id, c.id AS credential_id, c.person_id
      FROM presented p
      JOIN credentials c
        ON c.company_id = p.company_id
       AND c.deleted_at IS NULL
       AND (
             (p.pin IS NOT NULL
              AND c.credential_type = 'pin'
              AND c.credential_value = p.pin)
          OR (p.card_number IS NOT NULL
              AND c.card_number = p.card_number
              AND (p.facility_code IS NULL
                   OR c.facility_code IS NULL
                   OR c.facility_code = p.facility_code))
           )
     ORDER BY p.event_id, c.id
)
UPDATE device_events e
   SET credential_id = m.credential_id,
       person_id     = m.person_id
  FROM matched m
 WHERE e.id = m.event_id;
