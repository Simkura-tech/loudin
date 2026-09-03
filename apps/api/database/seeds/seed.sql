-- ============================================================================
-- Development seed data for loudin_db.
-- Run with: npm run db:seed   (or: node database/scripts/init-db.js --seed)
--
-- Dev password for ALL seeded users: Password123!
-- (bcrypt hash below; cost 10. Regenerate with:
--    node -e "console.log(require('bcryptjs').hashSync('Password123!',10))" )
--
-- Idempotent: if any rows exist in `companies`, the seed bails out cleanly
-- so re-running doesn't create duplicates.
--
-- What you get after a --reset --seed:
--   * 3 companies — the platform (Loudin Platform) and two independent
--     end-user companies: Demo Customer Co (the main fixture tenant) and
--     Brookline Coworking (a second, unrelated tenant so cross-company
--     isolation can be exercised by hand and by test/tenantIsolation.test.js).
--     Company types are platform | end_user only — there is no reseller tier.
--   * 3 admin users (one per company)
--   * 12 people in the end-user company spread across 4 departments
--   * 4 people groups
--   * 3 devices on the end-user company — Simkura's three PUBLIC SANDBOX
--     fixture locks (…0010 online, …0020 offline/low battery, …0030 online),
--     already claimed so state sync, pushes and commands work out of the box
--     with the sandbox API key (SIMKURA_API_KEY=sk_demo_simkura_sandbox).
--     No other devices are seeded: anything else would be junk Simkura
--     doesn't know about (state sync 403/404s it on every tick).
--   * 15 credentials (PINs, HID prox, MIFARE) tied to various people
--   * 16 device_credentials junctions (the front door has many credentials,
--     the server room is restricted)
--   * 3 shifts attached to specific devices (business hours, after-hours, etc.)
--   * ~23 device_events spread across the devices and event categories so
--     the activity feed has real-looking data
-- ============================================================================

DO $seed$
DECLARE
  platform_id INTEGER;
  end_user_id INTEGER;

  alice_id   INTEGER; bob_id     INTEGER; carol_id   INTEGER;
  david_id   INTEGER; emma_id    INTEGER; frank_id   INTEGER;
  grace_id   INTEGER; henry_id   INTEGER; isabel_id  INTEGER;
  jamal_id   INTEGER; kira_id    INTEGER; leo_id     INTEGER;

  grp_eng INTEGER; grp_ops INTEGER; grp_desk INTEGER; grp_fac INTEGER;

  dev_front     INTEGER; dev_back   INTEGER; dev_server INTEGER;

  cred_alice_pin   INTEGER; cred_alice_hid INTEGER;
  cred_bob_pin     INTEGER; cred_bob_hid   INTEGER;
  cred_carol_mif   INTEGER;
  cred_david_pin   INTEGER; cred_david_hid INTEGER;
  cred_emma_hid    INTEGER;
  cred_frank_pin   INTEGER;
  cred_grace_mif   INTEGER;
  cred_henry_pin   INTEGER;
  cred_isabel_hid  INTEGER; cred_isabel_mif INTEGER;
  cred_jamal_pin   INTEGER;
  cred_leo_mif     INTEGER;

  shift_business INTEGER; shift_afterhrs INTEGER; shift_admin INTEGER;

  -- Second, unrelated end-user company for cross-tenant boundaries (tests + manual).
  eu_brookline INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM companies LIMIT 1) THEN
    RAISE NOTICE 'Seed: companies table is not empty — skipping.';
    RETURN;
  END IF;

  -- ── Companies ────────────────────────────────────────────────────────────
  INSERT INTO companies (name, company_type, status, company_email, company_url)
  VALUES ('Loudin Platform', 'platform', 'active', 'platform@loudin.com', 'https://loudin.com')
  RETURNING id INTO platform_id;

  INSERT INTO companies (name, company_type, status, company_email, company_url, created_at, updated_at)
  VALUES ('Demo Customer Co', 'end_user', 'active', 'admin@democorp.example', 'https://democorp.example',
          NOW() - INTERVAL '10 months', NOW() - INTERVAL '10 months')
  RETURNING id INTO end_user_id;

  -- ── Admin users (one per company) ────────────────────────────────────────
  INSERT INTO users (
    company_id, user_type_id, email, first_name, last_name,
    password_hash, email_verified, email_verified_at, status
  ) VALUES
    (platform_id, 1, 'platform-admin@loudin.com', 'Platform', 'Admin',
     '$2b$10$/sl9aeZKp7Kwh0vII3Mxx.WVvBnBbzxJ0jBZPbSQM2bmmQCfoB79y',
     true, CURRENT_TIMESTAMP, 'active'),
    (end_user_id, 1, 'admin@democorp.example', 'Demo', 'Admin',
     '$2b$10$/sl9aeZKp7Kwh0vII3Mxx.WVvBnBbzxJ0jBZPbSQM2bmmQCfoB79y',
     true, CURRENT_TIMESTAMP, 'active');

  -- ── People groups ────────────────────────────────────────────────────────
  INSERT INTO people_groups (company_id, name, description) VALUES
    (end_user_id, 'Engineering Team', 'Full-time engineering staff') RETURNING id INTO grp_eng;
  INSERT INTO people_groups (company_id, name, description) VALUES
    (end_user_id, 'Operations',       'Operations and logistics') RETURNING id INTO grp_ops;
  INSERT INTO people_groups (company_id, name, description) VALUES
    (end_user_id, 'Front Desk',       'Reception and visitor handling') RETURNING id INTO grp_desk;
  INSERT INTO people_groups (company_id, name, description) VALUES
    (end_user_id, 'Facilities',       'Building maintenance + cleaning crew') RETURNING id INTO grp_fac;

  -- ── People (12, across 4 departments) ────────────────────────────────────
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_eng,  'Alice',  'Smith',    'alice.smith@democorp.example',    '555-0101', 'EMP-001', 'Engineering', 'Senior Engineer',     'active')
    RETURNING id INTO alice_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_ops,  'Bob',    'Lee',      'bob.lee@democorp.example',        '555-0102', 'EMP-002', 'Operations',  'Operations Lead',     'active')
    RETURNING id INTO bob_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_fac,  'Carol',  'Nguyen',   'carol.nguyen@democorp.example',   '555-0103', 'EMP-003', 'Facilities',  'Facilities Manager',  'active')
    RETURNING id INTO carol_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_eng,  'David',  'Kim',      'david.kim@democorp.example',      '555-0104', 'EMP-004', 'Engineering', 'Staff Engineer',      'active')
    RETURNING id INTO david_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_eng,  'Emma',   'Rodriguez','emma.rodriguez@democorp.example', '555-0105', 'EMP-005', 'Engineering', 'Engineering Manager', 'active')
    RETURNING id INTO emma_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_ops,  'Frank',  'O''Brien', 'frank.obrien@democorp.example',   '555-0106', 'EMP-006', 'Operations',  'Operations Coordinator', 'active')
    RETURNING id INTO frank_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_desk, 'Grace',  'Park',     'grace.park@democorp.example',     '555-0107', 'EMP-007', 'Reception',   'Lead Receptionist',   'active')
    RETURNING id INTO grace_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_desk, 'Henry',  'Brown',    'henry.brown@democorp.example',    '555-0108', 'EMP-008', 'Reception',   'Receptionist',        'active')
    RETURNING id INTO henry_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_fac,  'Isabel', 'Garcia',   'isabel.garcia@democorp.example',  '555-0109', 'EMP-009', 'Facilities',  'Building Supervisor', 'active')
    RETURNING id INTO isabel_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_eng,  'Jamal',  'Wilson',   'jamal.wilson@democorp.example',   '555-0110', 'EMP-010', 'Engineering', 'Junior Engineer',     'active')
    RETURNING id INTO jamal_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_ops,  'Kira',   'Tanaka',   'kira.tanaka@democorp.example',    '555-0111', 'EMP-011', 'Operations',  'Logistics Specialist','inactive')
    RETURNING id INTO kira_id;
  INSERT INTO people (company_id, group_id, first_name, last_name, email, phone_number, employee_id, department, job_title, status) VALUES
    (end_user_id, grp_fac,  'Leo',    'Martinez', 'leo.martinez@democorp.example',   '555-0112', 'EMP-012', 'Facilities',  'Maintenance Tech',    'active')
    RETURNING id INTO leo_id;


  -- ── Board catalog: what the live catalog (GET /v2/boards) reports for the
  -- SB6 as of 2026-09. Migration 086 seeds the contract's wider fallback row;
  -- this narrows it to the real list so the gating UI and the readerTechnology
  -- guard behave like production before the first discovery tick. The board
  -- catalog is the authority for capability tiers.
  INSERT INTO device_boards
    (manufacturer, board, display_name, num_doors, power_type, capabilities, features, supported)
  VALUES (
    'Simkura', 'SB6', 'Simkura SB6', 1, 'battery',
    '["lock-control","credential-store","schedules","power","connectivity"]'::jsonb,
    '{"door-position-sensing":false}'::jsonb,
    '{"doors.reader.protocol":["osdp","wiegand"],"doors.reader.technology":["prox","smartcard","nfc"],"cardFormats":["26-bit","mifare-1k","hid-34","hid-37"],"power.batteryChemistry":["alkaline","lithium"]}'::jsonb
  )
  ON CONFLICT (manufacturer, board) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        num_doors    = EXCLUDED.num_doors,
        power_type   = EXCLUDED.power_type,
        capabilities = EXCLUDED.capabilities,
        features     = EXCLUDED.features,
        supported    = EXCLUDED.supported,
        updated_at   = NOW();

  -- ── Devices: the 3 Simkura sandbox fixtures ──────────────────────────────
  -- device_id is Simkura's canonical id. These three exist in the public
  -- sandbox (docs.simkura.com/authentication), so with the sandbox key the
  -- state-sync worker mirrors real state onto them within seconds and the
  -- push / command endpoints return real 202 records. The initial column
  -- values below mirror what the sandbox reports (2026-09) so the UI looks
  -- right before the first sync tick.
  INSERT INTO devices (
    company_id, device_id, device_type, firmware_version,
    device_name, location, status, door_state, battery_percent, battery_health,
    power_mode, last_seen, assigned_at,
    manufacturer, hardware_version, num_doors, power_type, connectivity_transport, deployed,
    capabilities, features, supported, card_formats,
    reader_protocol, reader_connection, reader_technology, battery_chemistry
  ) VALUES
    (end_user_id, '00000000-0000-0000-0000-000000000010', 'sb6', '2.3.3',
     'Front Door',    'Main entrance, Floor 1', 'online',  'locked', 95, 'ok',
     'sleep',      CURRENT_TIMESTAMP - INTERVAL '2 minutes', CURRENT_TIMESTAMP - INTERVAL '30 days',
     'Simkura', NULL, 1, 'battery', 'cellular', TRUE,
     '["lock-control","credential-store","schedules","power","connectivity"]',
     '{"door-position-sensing":false}',
     '{"doors.reader.protocol":["osdp","wiegand"],"doors.reader.technology":["prox","smartcard","nfc"],"cardFormats":["26-bit","mifare-1k","hid-34","hid-37"],"power.batteryChemistry":["alkaline","lithium"]}',
     '["26-bit","mifare-1k","hid-34"]',
     'osdp', 'secure', 'prox', 'alkaline')
  RETURNING id INTO dev_front;
  INSERT INTO devices (
    company_id, device_id, device_type, firmware_version,
    device_name, location, status, door_state, battery_percent, battery_health,
    power_mode, last_seen, assigned_at,
    manufacturer, hardware_version, num_doors, power_type, connectivity_transport, deployed,
    capabilities, features, supported, card_formats,
    reader_protocol, reader_connection, reader_technology, battery_chemistry
  ) VALUES
    (end_user_id, '00000000-0000-0000-0000-000000000020', 'sb6', '2.3.3',
     'Back Entrance', 'Loading dock',           'offline', 'locked', 12, 'low',
     'deep_sleep', CURRENT_TIMESTAMP - INTERVAL '6 hours',   CURRENT_TIMESTAMP - INTERVAL '30 days',
     'Simkura', NULL, 1, 'battery', 'cellular', TRUE,
     '["lock-control","credential-store","schedules","power","connectivity"]',
     '{"door-position-sensing":false}',
     '{"doors.reader.protocol":["osdp","wiegand"],"doors.reader.technology":["prox","smartcard","nfc"],"cardFormats":["26-bit","mifare-1k","hid-34","hid-37"],"power.batteryChemistry":["alkaline","lithium"]}',
     '["26-bit","mifare-1k","hid-34"]',
     'osdp', 'secure', 'prox', 'alkaline')
  RETURNING id INTO dev_back;
  INSERT INTO devices (
    company_id, device_id, device_type, firmware_version,
    device_name, location, status, door_state, battery_percent, battery_health,
    power_mode, last_seen, assigned_at,
    manufacturer, hardware_version, num_doors, power_type, connectivity_transport, deployed,
    capabilities, features, supported, card_formats,
    reader_protocol, reader_connection, reader_technology, battery_chemistry
  ) VALUES
    (end_user_id, '00000000-0000-0000-0000-000000000030', 'sb6', '2.3.3',
     'Server Room',   'Floor 2, IT corridor',   'online',  'locked', 82, 'ok',
     'sleep',      CURRENT_TIMESTAMP - INTERVAL '1 minute',  CURRENT_TIMESTAMP - INTERVAL '14 days',
     'Simkura', NULL, 1, 'battery', 'cellular', TRUE,
     '["lock-control","credential-store","schedules","power","connectivity"]',
     '{"door-position-sensing":false}',
     '{"doors.reader.protocol":["osdp","wiegand"],"doors.reader.technology":["prox","smartcard","nfc"],"cardFormats":["26-bit","mifare-1k","hid-34","hid-37"],"power.batteryChemistry":["alkaline","lithium"]}',
     '["26-bit","mifare-1k","hid-34"]',
     'osdp', 'secure', 'prox', 'alkaline')
  RETURNING id INTO dev_server;

  -- ── Credentials (15 spread across 11 people) ─────────────────────────────
  -- credential_value carries PIN values plain (firmware compares plain — see
  -- the TODO in 010_create_credentials.sql).
  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, credential_value)
    VALUES (end_user_id, alice_id, 'Main PIN', 'pin', '40293') RETURNING id INTO cred_alice_pin;
  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, card_number, facility_code)
    VALUES (end_user_id, alice_id, 'Office badge', 'HID', '12047', '100') RETURNING id INTO cred_alice_hid;

  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, credential_value)
    VALUES (end_user_id, bob_id, 'Daily PIN', 'pin', '88712') RETURNING id INTO cred_bob_pin;
  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, card_number, facility_code)
    VALUES (end_user_id, bob_id, 'Ops badge', 'HID', '12048', '100') RETURNING id INTO cred_bob_hid;

  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, card_number)
    VALUES (end_user_id, carol_id, 'Facilities MIFARE', 'mifare', '04A12B3C') RETURNING id INTO cred_carol_mif;

  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, credential_value)
    VALUES (end_user_id, david_id, 'Engineering PIN', 'pin', '50416') RETURNING id INTO cred_david_pin;
  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, card_number, facility_code)
    VALUES (end_user_id, david_id, 'Engineering badge', 'HID', '12049', '100') RETURNING id INTO cred_david_hid;

  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, card_number, facility_code)
    VALUES (end_user_id, emma_id, 'Manager badge', 'HID', '12050', '100') RETURNING id INTO cred_emma_hid;

  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, credential_value)
    VALUES (end_user_id, frank_id, 'Loading-dock PIN', 'pin', '21678') RETURNING id INTO cred_frank_pin;

  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, card_number)
    VALUES (end_user_id, grace_id, 'Reception MIFARE', 'mifare', '04A12C99') RETURNING id INTO cred_grace_mif;

  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, credential_value)
    VALUES (end_user_id, henry_id, 'Front-desk PIN', 'pin', '67891') RETURNING id INTO cred_henry_pin;

  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, card_number, facility_code)
    VALUES (end_user_id, isabel_id, 'Master badge', 'HID', '12051', '100') RETURNING id INTO cred_isabel_hid;
  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, card_number)
    VALUES (end_user_id, isabel_id, 'Backup MIFARE', 'mifare', '04A1D701') RETURNING id INTO cred_isabel_mif;

  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, credential_value)
    VALUES (end_user_id, jamal_id, 'Junior PIN', 'pin', '34567') RETURNING id INTO cred_jamal_pin;

  INSERT INTO credentials (company_id, person_id, credential_name, credential_type, card_number)
    VALUES (end_user_id, leo_id, 'Maintenance MIFARE', 'mifare', '04A1E455') RETURNING id INTO cred_leo_mif;

  -- (Kira Tanaka is inactive — left with no credentials on purpose, so the UI
  --  has a person-without-credentials case to exercise.)

  -- ── device_credentials junction (which credentials installed on which doors) ──
  -- Front Door: broad access — almost everyone
  INSERT INTO device_credentials (device_id, credential_id) VALUES
    (dev_front, cred_alice_pin),  (dev_front, cred_alice_hid),
    (dev_front, cred_bob_hid),
    (dev_front, cred_david_hid),
    (dev_front, cred_emma_hid),
    (dev_front, cred_grace_mif),
    (dev_front, cred_henry_pin),
    (dev_front, cred_isabel_hid),
    (dev_front, cred_jamal_pin);

  -- Back Entrance: operations + facilities
  INSERT INTO device_credentials (device_id, credential_id) VALUES
    (dev_back, cred_bob_hid),
    (dev_back, cred_frank_pin),
    (dev_back, cred_carol_mif),
    (dev_back, cred_isabel_hid);

  -- Server Room: engineering only — restricted
  INSERT INTO device_credentials (device_id, credential_id) VALUES
    (dev_server, cred_david_hid),
    (dev_server, cred_emma_hid),
    (dev_server, cred_isabel_hid);


  -- ── Shifts (per-device door schedules) ───────────────────────────────────
  -- Shifts in our model are company-scoped + attached to specific devices
  -- via the device_shifts junction (see controllers/deviceShifts.js).
  INSERT INTO shifts (company_id, shift_name, description, start_time, end_time, days_of_week)
    VALUES (end_user_id, 'Business hours', 'Mon–Fri 08:00–18:00 auto-unlock window',
            '08:00', '18:00', '[1,2,3,4,5]'::jsonb)
    RETURNING id INTO shift_business;

  INSERT INTO shifts (company_id, shift_name, description, start_time, end_time, days_of_week)
    VALUES (end_user_id, 'Weekend cover', 'Sat/Sun 09:00–17:00 for weekend ops',
            '09:00', '17:00', '[0,6]'::jsonb)
    RETURNING id INTO shift_afterhrs;

  INSERT INTO shifts (company_id, shift_name, description, start_time, end_time, days_of_week)
    VALUES (end_user_id, 'Cleaning crew', 'Mon–Fri 06:00–08:00 facilities window',
            '06:00', '08:00', '[1,2,3,4,5]'::jsonb)
    RETURNING id INTO shift_admin;

  INSERT INTO device_shifts (device_id, shift_id) VALUES
    (dev_front, shift_business),
    (dev_back,  shift_business),
    (dev_front, shift_afterhrs),
    (dev_back,  shift_admin);

  -- ── device_events (activity feed) ───────────────────────────────────────
  -- ~23 rows across the 3 devices, last 7 days, mixed types and severities.
  -- device_id stores the hardware id (matches devices.device_id, not FK).
  INSERT INTO device_events (company_id, device_id, event_type, event_category, severity, event_data, event_timestamp, received_at) VALUES
    -- Front Door — busy day yesterday
    (end_user_id, '00000000-0000-0000-0000-000000000010', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":12047,"facilityCode":100},"person":"Alice Smith"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '32 minutes', CURRENT_TIMESTAMP - INTERVAL '32 minutes'),
    (end_user_id, '00000000-0000-0000-0000-000000000010', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":12050,"facilityCode":100},"person":"Emma Rodriguez"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 hour 18 minutes', CURRENT_TIMESTAMP - INTERVAL '1 hour 18 minutes'),
    (end_user_id, '00000000-0000-0000-0000-000000000010', 'access.denied',      'access_control', 'warning',
       '{"reason":"unknown_card","attemptedCredential":{"cardNumber":99999,"facilityCode":42}}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '3 hours 4 minutes', CURRENT_TIMESTAMP - INTERVAL '3 hours 4 minutes'),
    (end_user_id, '00000000-0000-0000-0000-000000000010', 'lock.state_changed', 'lock_state',     'info',
       '{"from":"unlocked","to":"locked","trigger":"latch_timeout"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '4 hours', CURRENT_TIMESTAMP - INTERVAL '4 hours'),
    (end_user_id, '00000000-0000-0000-0000-000000000010', 'command.sent',       'command',        'info',
       '{"command":"bwUnlock","by":"admin@democorp.example"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '4 hours 1 minute', CURRENT_TIMESTAMP - INTERVAL '4 hours 1 minute'),
    (end_user_id, '00000000-0000-0000-0000-000000000010', 'access.granted',     'access_control', 'info',
       '{"credential":{"pin":"40293"},"person":"Alice Smith"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 2 hours', CURRENT_TIMESTAMP - INTERVAL '1 day 2 hours'),
    (end_user_id, '00000000-0000-0000-0000-000000000010', 'access.granted',     'access_control', 'info',
       '{"credential":{"pin":"67891"},"person":"Henry Brown"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 6 hours', CURRENT_TIMESTAMP - INTERVAL '1 day 6 hours'),
    -- Back Entrance — loading dock activity
    (end_user_id, '00000000-0000-0000-0000-000000000020', 'access.granted',     'access_control', 'info',
       '{"credential":{"pin":"21678"},"person":"Frank O’Brien"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '6 hours', CURRENT_TIMESTAMP - INTERVAL '6 hours'),
    (end_user_id, '00000000-0000-0000-0000-000000000020', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":12048,"facilityCode":100},"person":"Bob Lee"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour', CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour'),
    (end_user_id, '00000000-0000-0000-0000-000000000020', 'device.wake',        'lifecycle',      'info',
       '{"from":"sleep","battery":42}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days'),
    (end_user_id, '00000000-0000-0000-0000-000000000020', 'access.denied',      'access_control', 'warning',
       '{"reason":"out_of_schedule","attemptedCredential":{"pin":"88712"}}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '2 days 4 hours', CURRENT_TIMESTAMP - INTERVAL '2 days 4 hours'),
    -- Server Room — restricted, mostly engineering
    (end_user_id, '00000000-0000-0000-0000-000000000030', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":12049,"facilityCode":100},"person":"David Kim"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '45 minutes', CURRENT_TIMESTAMP - INTERVAL '45 minutes'),
    (end_user_id, '00000000-0000-0000-0000-000000000030', 'access.denied',      'access_control', 'warning',
       '{"reason":"not_authorized","attemptedCredential":{"cardNumber":12047,"facilityCode":100},"person":"Alice Smith"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '2 hours 15 minutes', CURRENT_TIMESTAMP - INTERVAL '2 hours 15 minutes'),
    (end_user_id, '00000000-0000-0000-0000-000000000030', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":12050,"facilityCode":100},"person":"Emma Rodriguez"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 3 hours', CURRENT_TIMESTAMP - INTERVAL '1 day 3 hours'),
    (end_user_id, '00000000-0000-0000-0000-000000000030', 'lock.state_changed', 'lock_state',     'info',
       '{"from":"unlocked","to":"locked","trigger":"latch_timeout"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 3 hours 1 minute', CURRENT_TIMESTAMP - INTERVAL '1 day 3 hours 1 minute'),
    -- Back Entrance — went quiet on a low battery
    (end_user_id, '00000000-0000-0000-0000-000000000020', 'device.sleep',       'lifecycle',      'info',
       '{"reason":"low_battery","battery":12}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '3 days'),
    (end_user_id, '00000000-0000-0000-0000-000000000020', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":"04A1E455"},"person":"Leo Martinez"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '3 days 8 hours', CURRENT_TIMESTAMP - INTERVAL '3 days 8 hours'),
    (end_user_id, '00000000-0000-0000-0000-000000000020', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":"04A12B3C"},"person":"Carol Nguyen"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '4 days', CURRENT_TIMESTAMP - INTERVAL '4 days'),
    -- Server Room — an earlier rough patch (watchdog restart, failed command)
    (end_user_id, '00000000-0000-0000-0000-000000000030', 'device.restart',     'lifecycle',      'warning',
       '{"reason":"watchdog","uptime_s":86400}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '12 hours', CURRENT_TIMESTAMP - INTERVAL '12 hours'),
    (end_user_id, '00000000-0000-0000-0000-000000000030', 'command.failed',     'command',        'error',
       '{"command":"bwUnlock","error":"device_unreachable"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '14 hours', CURRENT_TIMESTAMP - INTERVAL '14 hours'),
    (end_user_id, '00000000-0000-0000-0000-000000000030', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":"04A1D701"},"person":"Isabel Garcia"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 18 hours', CURRENT_TIMESTAMP - INTERVAL '1 day 18 hours'),
    (end_user_id, '00000000-0000-0000-0000-000000000030', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":"04A1E455"},"person":"Leo Martinez"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '2 days 9 hours', CURRENT_TIMESTAMP - INTERVAL '2 days 9 hours'),
    (end_user_id, '00000000-0000-0000-0000-000000000030', 'access.denied',      'access_control', 'warning',
       '{"reason":"lockdown","attemptedCredential":{"cardNumber":"04A12B3C"},"person":"Carol Nguyen"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '5 days');

  -- ── Second, unrelated end-user company ───────────────────────────────────
  -- A separate tenant (Brookline Coworking) with its own admin — the minimum
  -- for exercising cross-company isolation by hand and in the tenant-isolation
  -- tests. Deliberately nothing more: no devices or people of its own (the
  -- only seeded locks are the three sandbox fixtures above), so the platform
  -- companies/users views stay slim.
  INSERT INTO companies (name, company_type, status, company_email, company_url, created_at, updated_at)
    VALUES ('Brookline Coworking', 'end_user', 'active', 'admin@brookline.example', 'https://brookline.example',
            NOW() - INTERVAL '7 months', NOW() - INTERVAL '7 months')
    RETURNING id INTO eu_brookline;

  INSERT INTO users (
    company_id, user_type_id, email, first_name, last_name,
    password_hash, email_verified, email_verified_at, status
  ) VALUES
    (eu_brookline, 1, 'admin@brookline.example', 'Brookline', 'Admin',
     '$2b$10$/sl9aeZKp7Kwh0vII3Mxx.WVvBnBbzxJ0jBZPbSQM2bmmQCfoB79y',
     true, NOW() - INTERVAL '7 months', 'active');

  RAISE NOTICE 'Seed complete: % companies (platform + 2 end-users), % devices (the 3 Simkura sandbox fixtures), % credentials, ~23 events.',
    (SELECT COUNT(*) FROM companies),
    (SELECT COUNT(*) FROM devices),
    (SELECT COUNT(*) FROM credentials);
END $seed$;
