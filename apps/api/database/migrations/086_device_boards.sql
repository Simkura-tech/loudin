-- Hardware catalog: a local copy of Simkura's public board list
-- (GET /api/v2/boards). One row per hardware generation, keyed by the same
-- (manufacturer, board) pair every device publishes as device.manufacturer /
-- device.board — so a device row joins to its board through
-- devices.manufacturer + devices.device_type (board, lowercased).
--
-- Why keep a copy: the catalog is what lets the UI name a board properly
-- ("Simkura SB6", not "sb6") and gate features for a device that has never
-- been polled (devices.capabilities IS NULL) — the board's tiers are the
-- fallback. It is refreshed by the discovery worker and by the manual
-- platform sync; rows are never deleted (a device may still reference a
-- board Simkura has retired from the list).
--
-- The SB6 row below is the contract's documented fallback (simkura-core
-- boardCatalog.js FALLBACK_BOARD): the whole fleet predates the catalog, so
-- the table is never empty even where Simkura is unconfigured. The first
-- sync overwrites it with live values.

CREATE TABLE IF NOT EXISTS device_boards (
    id            SERIAL PRIMARY KEY,
    manufacturer  VARCHAR(64)  NOT NULL,
    board         VARCHAR(64)  NOT NULL,
    display_name  VARCHAR(128),
    num_doors     SMALLINT
        CHECK (num_doors IS NULL OR num_doors >= 1),
    power_type    VARCHAR(8)
        CHECK (power_type IN ('battery', 'plugin')),
    capabilities  JSONB NOT NULL DEFAULT '[]'::jsonb,
    features      JSONB NOT NULL DEFAULT '{}'::jsonb,
    supported     JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (manufacturer, board)
);

COMMENT ON TABLE device_boards IS
    'Local copy of Simkura''s public hardware catalog (GET /v2/boards). Joined from devices via (manufacturer, device_type = lower(board)). synced_at NULL = seeded fallback, never refreshed from Simkura.';
COMMENT ON COLUMN device_boards.capabilities IS
    'JSON array of capability slugs the board declares (lock-control, credential-store, schedules, power, connectivity).';
COMMENT ON COLUMN device_boards.features IS
    'JSON object of boolean feature flags (door-position-sensing).';
COMMENT ON COLUMN device_boards.supported IS
    'JSON object of allowed-value arrays keyed by contract path (doors.reader.protocol, doors.reader.technology, cardFormats, power.batteryChemistry).';

INSERT INTO device_boards
    (manufacturer, board, display_name, num_doors, power_type, capabilities, features, supported)
VALUES (
    'Simkura', 'SB6', 'Simkura SB6', 1, 'battery',
    '["lock-control","credential-store","schedules","power","connectivity"]'::jsonb,
    '{"door-position-sensing":false}'::jsonb,
    '{"doors.reader.protocol":["osdp","wiegand"],"doors.reader.technology":["prox","smartcard","nfc","ble","multi"],"cardFormats":["26-bit","mifare-1k","hid-34","hid-37"],"power.batteryChemistry":["alkaline","lithium","li-ion"]}'::jsonb
)
ON CONFLICT (manufacturer, board) DO NOTHING;
