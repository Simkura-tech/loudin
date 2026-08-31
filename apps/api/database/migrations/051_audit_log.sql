-- Audit log — cross-tenant action history.
--
-- Captures who did what, on whose behalf, and to what target. Every
-- write that crosses a security boundary (tenant lifecycle changes,
-- impersonation start/end, anything done during impersonation) writes a
-- row here. Reads are platform-admin only for now; a customer-visible
-- "who accessed my workspace?" view can be filtered off this table
-- later.
--
-- Field semantics:
--   actor_user_id        — the human (user row) doing the thing
--   actor_company_id     — that user's company at the time
--   on_behalf_of_company_id
--                        — the tenant the action LANDS on. Equal to
--                          actor_company_id when not impersonating;
--                          the impersonated customer's id when a
--                          reseller is acting through impersonation.
--   action               — dot-notation key, e.g. 'company.suspend',
--                          'impersonation.start', 'person.create'.
--                          We keep this as free text (no CHECK
--                          constraint) so new actions don't need a
--                          migration.
--   target_type/target_id
--                        — what the action affected (e.g. 'company'/'7',
--                          'device'/'OMO-AABB000001'). Nullable for
--                          actions that don't have a single target.
--   metadata             — JSONB for action-specific context (reason
--                          codes, before/after values, scopes, etc.)
--   ip_address           — VARCHAR for IPv4/IPv6/null compatibility
--   user_agent           — TEXT, raw header
--   created_at           — server clock
--
-- *_id columns use ON DELETE SET NULL so audit history survives
-- subsequent user/company deletions.

CREATE TABLE IF NOT EXISTS audit_log (
    id                      BIGSERIAL PRIMARY KEY,
    actor_user_id           INTEGER REFERENCES users(id)     ON DELETE SET NULL,
    actor_company_id        INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    on_behalf_of_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    action                  VARCHAR(100) NOT NULL,
    target_type             VARCHAR(50),
    target_id               VARCHAR(100),
    metadata                JSONB,
    ip_address              VARCHAR(45),
    user_agent              TEXT,
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Most common reads: "what did this user do recently" and "what
-- happened on this tenant recently."
CREATE INDEX idx_audit_log_actor       ON audit_log(actor_user_id, created_at DESC) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_log_on_behalf   ON audit_log(on_behalf_of_company_id, created_at DESC) WHERE on_behalf_of_company_id IS NOT NULL;
CREATE INDEX idx_audit_log_action      ON audit_log(action, created_at DESC);
CREATE INDEX idx_audit_log_target      ON audit_log(target_type, target_id) WHERE target_type IS NOT NULL;
CREATE INDEX idx_audit_log_created_at  ON audit_log(created_at DESC);

COMMENT ON TABLE  audit_log                         IS 'Cross-tenant action history. Reads are platform-admin only.';
COMMENT ON COLUMN audit_log.on_behalf_of_company_id IS 'Tenant the action lands on. Differs from actor_company_id during impersonation.';
COMMENT ON COLUMN audit_log.action                  IS 'Dot-notation action key, e.g. company.suspend, impersonation.start, person.create. No CHECK constraint — kept extensible.';
