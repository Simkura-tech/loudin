-- Devices table — door lock hardware.
-- A device is born unclaimed (company_id NULL) and gets assigned to a tenant
-- when provisioned. Live state (status, battery, door_state) is synced from
-- Simkura via webhook + polling worker; cached aggregate counts have been
-- removed in favour of computing them on demand from the access junction tables.

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    -- Reseller (parent) that pulled this device from their Simkura account.
    -- Can differ from company_id (end-user) once the device is assigned.
    reseller_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,

    -- Hardware identity
    device_id         VARCHAR(255) NOT NULL UNIQUE,  -- hardware serial / UUID
    simkura_device_id VARCHAR(255) UNIQUE,           -- external Simkura cloud ID (null until claimed)
    reseller_code     VARCHAR(100),                  -- reseller tag reported by firmware at provisioning
    device_type       VARCHAR(100) NOT NULL,         -- e.g. 'sb6'
    firmware_version  VARCHAR(50),

    -- Display / metadata
    device_name VARCHAR(255) NOT NULL,
    location    VARCHAR(255),
    notes       TEXT,

    -- Live state (synced from Simkura via webhook + polling worker)
    status VARCHAR(50) DEFAULT 'offline'
        CHECK (status IN ('online', 'offline', 'error', 'maintenance')),
    last_seen       TIMESTAMP WITH TIME ZONE,
    door_state VARCHAR(20) DEFAULT 'locked'
        CHECK (door_state IN ('locked', 'unlocked', 'lockdown', 'unknown')),
    battery_percent INTEGER CHECK (battery_percent BETWEEN 0 AND 100),
    power_mode      VARCHAR(20) DEFAULT 'active'
        CHECK (power_mode IN ('active', 'sleep', 'deep_sleep')),

    -- Assignment audit (who assigned this device to its current company)
    assigned_by INTEGER,            -- super admin user_id (plain INT, no FK; see note in 001)
    assigned_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_devices_company_id          ON devices(company_id);
CREATE INDEX idx_devices_reseller_company_id ON devices(reseller_company_id) WHERE reseller_company_id IS NOT NULL;
CREATE INDEX idx_devices_status              ON devices(status);
CREATE INDEX idx_devices_last_seen           ON devices(last_seen);
CREATE INDEX idx_devices_reseller_code       ON devices(reseller_code) WHERE reseller_code IS NOT NULL;
CREATE INDEX idx_devices_deleted_at          ON devices(deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE  devices                   IS 'Door lock devices. company_id NULL = unclaimed / in pool.';
COMMENT ON COLUMN devices.device_id          IS 'Hardware serial number — globally unique across all tenants';
COMMENT ON COLUMN devices.simkura_device_id  IS 'Identifier assigned by the Simkura cloud when the device is provisioned; null until claimed';
COMMENT ON COLUMN devices.battery_percent    IS 'Most recent battery reading, 0–100';
COMMENT ON COLUMN devices.deleted_at         IS 'Soft delete timestamp';
