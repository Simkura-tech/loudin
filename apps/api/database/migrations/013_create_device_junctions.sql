-- Junction Tables for Device Relationships
-- Many-to-many relationships between devices and credentials/shifts/holidays

-- Device-Credential Junction Table
CREATE TABLE IF NOT EXISTS device_credentials (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    credential_id INTEGER NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,

    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at  TIMESTAMP WITH TIME ZONE,

    CONSTRAINT unique_device_credential UNIQUE(device_id, credential_id)
);

-- Device-Shift Junction Table
CREATE TABLE IF NOT EXISTS device_shifts (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,

    -- applied_at = when we recorded the assignment
    -- synced_at  = when the device firmware confirmed it received the shift
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at  TIMESTAMP WITH TIME ZONE,

    -- Priority order (if multiple shifts overlap)
    priority INTEGER DEFAULT 0,

    CONSTRAINT unique_device_shift UNIQUE(device_id, shift_id)
);

-- Device-Holiday Junction Table
CREATE TABLE IF NOT EXISTS device_holidays (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    holiday_id INTEGER NOT NULL REFERENCES holidays(id) ON DELETE CASCADE,

    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at  TIMESTAMP WITH TIME ZONE,

    CONSTRAINT unique_device_holiday UNIQUE(device_id, holiday_id)
);

-- Indexes for device_credentials
CREATE INDEX idx_device_credentials_device_id ON device_credentials(device_id);
CREATE INDEX idx_device_credentials_credential_id ON device_credentials(credential_id);

-- Indexes for device_shifts
CREATE INDEX idx_device_shifts_device_id ON device_shifts(device_id);
CREATE INDEX idx_device_shifts_shift_id ON device_shifts(shift_id);
CREATE INDEX idx_device_shifts_priority ON device_shifts(priority);

-- Indexes for device_holidays
CREATE INDEX idx_device_holidays_device_id ON device_holidays(device_id);
CREATE INDEX idx_device_holidays_holiday_id ON device_holidays(holiday_id);

-- Comments
COMMENT ON TABLE device_credentials IS 'Many-to-many: Credentials applied to devices';
COMMENT ON TABLE device_shifts IS 'Many-to-many: Shifts applied to devices';
COMMENT ON TABLE device_holidays IS 'Many-to-many: Holidays applied to devices';
COMMENT ON COLUMN device_shifts.priority IS 'Priority order when multiple shifts overlap (higher = higher priority)';
