-- Structured churn reason on companies.
--
-- The existing `cancellation_reason` TEXT column captures free-text details
-- (often empty, sometimes paragraphs of context from a phone call). For
-- churn analytics we need a discrete code so we can count "cost vs.
-- competitor vs. unused" without parsing free text.
--
-- The code is validated in application code against a fixed list:
--   cost                 — Cost / pricing
--   switched_competitor  — Switched to a competitor
--   missing_features     — Missing features
--   unused               — No longer needed
--   business_closed      — Business closed or merged
--   poor_quality         — Service quality issues
--   other                — Other (free text in cancellation_reason advised)
--
-- We don't enforce the list in a CHECK constraint so the platform team can
-- grow it without a migration; that's the same pattern used elsewhere
-- (e.g. credential_type).

ALTER TABLE companies
    ADD COLUMN cancellation_reason_code VARCHAR(50);

CREATE INDEX idx_companies_cancellation_reason_code
    ON companies(cancellation_reason_code)
    WHERE cancellation_reason_code IS NOT NULL;

COMMENT ON COLUMN companies.cancellation_reason_code IS
    'Structured churn reason code (cost | switched_competitor | missing_features | unused | business_closed | poor_quality | other). cancellation_reason holds optional free-text details.';
