-- Hardware profile: the provisioning-time facts and the three-tier
-- capability model the Simkura v2 device resource publishes on every read
-- (spine: device.manufacturer / version / numDoors, capabilities[],
-- features{}, supported{}; full resource: cardFormats[], power.type,
-- connectivity.transport). Until now the client parsed `capabilities` and
-- the workers threw it away — nothing here reached the row.
--
-- These are what the device-detail UI keys off to render a feature live or
-- greyed out for the board in front of it:
--
--   capabilities  → which blocks exist at all (lock-control, credential-store,
--                   schedules, power, connectivity). A device without
--                   `schedules` has no shifts/holidays tab.
--   features      → boolean flags for fields with no vocabulary
--                   (door-position-sensing: SB6 = false).
--   supported     → allowed values per enum field, keyed by contract path
--                   (doors.reader.protocol, doors.reader.technology,
--                   cardFormats, power.batteryChemistry).
--   card_formats  → the device's *effective* card formats (board ∩ firmware);
--                   what credentials.add validates against.
--
-- NULL on all of them = never reported (row predates this migration and has
-- not been polled since). Consumers should treat NULL as "unknown, assume
-- the SB6 fallback" rather than "nothing supported". Vocabularies are
-- additive upstream, so the JSONB columns carry no CHECK on their contents.

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS manufacturer           VARCHAR(64),
    ADD COLUMN IF NOT EXISTS hardware_version       VARCHAR(64),
    ADD COLUMN IF NOT EXISTS num_doors              SMALLINT
        CHECK (num_doors IS NULL OR num_doors >= 1),
    ADD COLUMN IF NOT EXISTS power_type             VARCHAR(8)
        CHECK (power_type IN ('battery', 'plugin')),
    ADD COLUMN IF NOT EXISTS connectivity_transport VARCHAR(16)
        CHECK (connectivity_transport IN ('cellular', 'wifi', 'ethernet')),
    ADD COLUMN IF NOT EXISTS deployed               BOOLEAN,
    ADD COLUMN IF NOT EXISTS capabilities           JSONB,
    ADD COLUMN IF NOT EXISTS features               JSONB,
    ADD COLUMN IF NOT EXISTS supported              JSONB,
    ADD COLUMN IF NOT EXISTS card_formats           JSONB;

COMMENT ON COLUMN devices.manufacturer IS
    'Simkura v2 device.manufacturer. Joins with device_type (= board) to the /v2/boards catalog.';
COMMENT ON COLUMN devices.hardware_version IS
    'Simkura v2 device.version — hardware revision, not firmware.';
COMMENT ON COLUMN devices.num_doors IS
    'Simkura v2 device.numDoors. Loudin mirrors door 1 only; >1 means extra doors are not yet visible here.';
COMMENT ON COLUMN devices.power_type IS
    'Simkura v2 power.type (battery | plugin). Plug-in devices report no battery percent.';
COMMENT ON COLUMN devices.connectivity_transport IS
    'Simkura v2 connectivity.transport (cellular | wifi | ethernet). carrier/signal are cellular-only.';
COMMENT ON COLUMN devices.deployed IS
    'Simkura v2 meta.deployed — platform deployment state.';
COMMENT ON COLUMN devices.capabilities IS
    'Simkura v2 capabilities[] — JSON array of capability slugs (lock-control, credential-store, schedules, power, connectivity). NULL = never reported.';
COMMENT ON COLUMN devices.features IS
    'Simkura v2 features{} — JSON object of boolean flags (door-position-sensing). NULL = never reported.';
COMMENT ON COLUMN devices.supported IS
    'Simkura v2 supported{} — JSON object of allowed-value arrays keyed by contract path. NULL = never reported.';
COMMENT ON COLUMN devices.card_formats IS
    'Simkura v2 cardFormats[] — effective card formats for this device (board ∩ firmware). NULL = never reported.';
