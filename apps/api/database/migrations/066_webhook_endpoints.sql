-- Outbound webhook management (platform-admin scoped).
--
-- These tables let a platform admin register webhook destinations, subscribe
-- each to a set of event types, and get durable, retried delivery with an
-- audit trail.
--
-- Scope: platform-level only for now (mirrors api_keys). Per-company/reseller
-- endpoints can layer on later by adding a nullable company_id column.

-- ── Registered destinations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id SERIAL PRIMARY KEY,

    name        VARCHAR(120) NOT NULL,          -- human label, e.g. "Ops Slack bridge"
    url         TEXT         NOT NULL,           -- https POST target
    -- Signing secret (plaintext). Unlike api_keys (which hashes because it
    -- VERIFIES inbound tokens), we must keep the secret to SIGN each outbound
    -- delivery. It's a shared secret shown in the UI so the receiver can
    -- verify X-Loudin-Signature.
    secret      VARCHAR(80)  NOT NULL,           -- e.g. "whsec_…"
    event_types TEXT[]       NOT NULL DEFAULT '{}',
    active      BOOLEAN      NOT NULL DEFAULT TRUE,

    created_by  INTEGER,                         -- user_id of the creating admin (plain int, no FK)
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disabled_at TIMESTAMP WITH TIME ZONE          -- soft-delete (mirrors api_keys.revoked_at)
);

-- Active endpoints subscribed to a given event type — the dispatcher's hot path.
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active
    ON webhook_endpoints USING GIN (event_types)
    WHERE disabled_at IS NULL AND active;

COMMENT ON TABLE  webhook_endpoints             IS 'Outbound webhook destinations registered by platform admins.';
COMMENT ON COLUMN webhook_endpoints.secret      IS 'HMAC signing secret (plaintext, needed to sign outbound). Shown in UI; rotatable.';
COMMENT ON COLUMN webhook_endpoints.event_types IS 'Subscribed event types, e.g. {"device.added","order.placed"}.';
COMMENT ON COLUMN webhook_endpoints.disabled_at IS 'Soft-delete. Rows are never hard-deleted so the delivery history survives.';

-- ── Per-attempt delivery log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id SERIAL PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,

    event_id    UUID         NOT NULL,           -- envelope idempotency key (shared across endpoints for one event)
    event_type  VARCHAR(80)  NOT NULL,
    payload     JSONB        NOT NULL,           -- the full signed envelope

    status         VARCHAR(12) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'delivered', 'failed', 'exhausted')),
    attempt_count  INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts   INTEGER NOT NULL DEFAULT 6   CHECK (max_attempts >= 1),
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    last_status_code INTEGER,                    -- HTTP status of the most recent attempt
    last_error       TEXT,                       -- error message / non-2xx summary
    response_snippet TEXT,                       -- first bytes of the receiver's response body

    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- Worker scan: due retries. Partial index keeps it tiny (settled rows drop out).
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
    ON webhook_deliveries(next_attempt_at)
    WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint
    ON webhook_deliveries(endpoint_id, created_at DESC);

COMMENT ON TABLE  webhook_deliveries            IS 'One row per (event, endpoint) delivery attempt-set. Retried until delivered or exhausted.';
COMMENT ON COLUMN webhook_deliveries.event_id   IS 'Envelope UUID — same across all endpoints for one emitted event (receiver idempotency key).';
COMMENT ON COLUMN webhook_deliveries.status     IS 'pending → delivered | failed (retryable) → exhausted (gave up at max_attempts).';
