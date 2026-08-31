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
--   * 3 companies (platform, reseller, end-user)
--   * 3 admin users (one per company)
--   * 12 people in the end-user company spread across 4 departments
--   * 4 people groups
--   * 5 devices (door locks) on the end-user company, mixed online/offline/error
--   * 15 credentials (PINs, HID prox, MIFARE) tied to various people
--   * 12 device_credentials junctions (some doors have many credentials,
--     others are restricted)
--   * 3 shifts attached to specific devices (business hours, after-hours, etc.)
--   * ~25 device_events spread across devices and event categories so the
--     activity feed has real-looking data
-- ============================================================================

DO $seed$
DECLARE
  platform_id INTEGER;
  reseller_id INTEGER;
  end_user_id INTEGER;

  alice_id   INTEGER; bob_id     INTEGER; carol_id   INTEGER;
  david_id   INTEGER; emma_id    INTEGER; frank_id   INTEGER;
  grace_id   INTEGER; henry_id   INTEGER; isabel_id  INTEGER;
  jamal_id   INTEGER; kira_id    INTEGER; leo_id     INTEGER;

  grp_eng INTEGER; grp_ops INTEGER; grp_desk INTEGER; grp_fac INTEGER;

  dev_front     INTEGER; dev_back   INTEGER; dev_server INTEGER;
  dev_closet    INTEGER; dev_gate   INTEGER;

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

  -- Extra companies + devices to give the Insights page some growth shape.
  reseller_bluewave INTEGER; reseller_lockwise INTEGER;
  eu_pinecrest INTEGER; eu_brookline INTEGER; eu_meridian INTEGER;
  eu_aurora    INTEGER; eu_yoga      INTEGER; eu_bank     INTEGER;
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
  VALUES ('Acme Distribution', 'reseller', 'active', 'contact@acme-dist.example', 'https://acme-dist.example',
          NOW() - INTERVAL '12 months', NOW() - INTERVAL '12 months')
  RETURNING id INTO reseller_id;

  INSERT INTO companies (name, company_type, status, company_email, company_url,
                         parent_company_id, parent_locked_at, created_at, updated_at)
  VALUES ('Demo Customer Co', 'end_user', 'active', 'admin@democorp.example', 'https://democorp.example',
          reseller_id, NOW() - INTERVAL '10 months',
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
    (reseller_id, 1, 'admin@acme-dist.example', 'Acme', 'Admin',
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

  -- ── Devices (5 door locks) ───────────────────────────────────────────────
  INSERT INTO devices (
    company_id, reseller_company_id, device_id, device_type, firmware_version,
    device_name, location, status, door_state, battery_percent, power_mode,
    last_seen, assigned_at
  ) VALUES
    (end_user_id, reseller_id, 'OMO-AABB000001', 'sb6', '1.4.2',
     'Front Door',     'Main entrance, Floor 1',   'online',  'locked',   87, 'active',
     CURRENT_TIMESTAMP - INTERVAL '2 minutes',  CURRENT_TIMESTAMP - INTERVAL '30 days')
  RETURNING id INTO dev_front;
  INSERT INTO devices (
    company_id, reseller_company_id, device_id, device_type, firmware_version,
    device_name, location, status, door_state, battery_percent, power_mode,
    last_seen, assigned_at
  ) VALUES
    (end_user_id, reseller_id, 'OMO-AABB000002', 'sb6', '1.4.2',
     'Back Entrance',  'Loading dock',             'online',  'locked',   42, 'active',
     CURRENT_TIMESTAMP - INTERVAL '5 minutes',  CURRENT_TIMESTAMP - INTERVAL '30 days')
  RETURNING id INTO dev_back;
  INSERT INTO devices (
    company_id, reseller_company_id, device_id, device_type, firmware_version,
    device_name, location, status, door_state, battery_percent, power_mode,
    last_seen, assigned_at
  ) VALUES
    (end_user_id, reseller_id, 'OMO-AABB000003', 'sb6', '1.4.2',
     'Server Room',    'Floor 2, IT corridor',     'online',  'locked',   91, 'active',
     CURRENT_TIMESTAMP - INTERVAL '1 minute',   CURRENT_TIMESTAMP - INTERVAL '30 days')
  RETURNING id INTO dev_server;
  INSERT INTO devices (
    company_id, reseller_company_id, device_id, device_type, firmware_version,
    device_name, location, status, door_state, battery_percent, power_mode,
    last_seen, assigned_at
  ) VALUES
    (end_user_id, reseller_id, 'OMO-AABB000004', 'sb6', '1.3.8',
     'Storage Closet', 'Floor 1, behind reception','offline', 'locked',   12, 'deep_sleep',
     CURRENT_TIMESTAMP - INTERVAL '3 days',     CURRENT_TIMESTAMP - INTERVAL '60 days')
  RETURNING id INTO dev_closet;
  INSERT INTO devices (
    company_id, reseller_company_id, device_id, device_type, firmware_version,
    device_name, location, status, door_state, battery_percent, power_mode,
    last_seen, assigned_at
  ) VALUES
    (end_user_id, reseller_id, 'OMO-AABB000005', 'sb6', '1.4.2',
     'Side Gate',      'Parking lot',              'error',   'unknown',  64, 'active',
     CURRENT_TIMESTAMP - INTERVAL '12 hours',   CURRENT_TIMESTAMP - INTERVAL '14 days')
  RETURNING id INTO dev_gate;

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

  -- Storage Closet: operations + facilities crew
  INSERT INTO device_credentials (device_id, credential_id) VALUES
    (dev_closet, cred_bob_hid),
    (dev_closet, cred_carol_mif),
    (dev_closet, cred_leo_mif),
    (dev_closet, cred_isabel_hid);

  -- Side Gate: facilities only
  INSERT INTO device_credentials (device_id, credential_id) VALUES
    (dev_gate, cred_carol_mif),
    (dev_gate, cred_isabel_hid),
    (dev_gate, cred_leo_mif);

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
    (dev_closet, shift_admin),
    (dev_back,   shift_admin);

  -- ── device_events (activity feed) ───────────────────────────────────────
  -- ~25 rows across the 5 devices, last 7 days, mixed types and severities.
  -- device_id stores the hardware id (matches devices.device_id, not FK).
  INSERT INTO device_events (company_id, device_id, event_type, event_category, severity, event_data, event_timestamp, received_at) VALUES
    -- Front Door — busy day yesterday
    (end_user_id, 'OMO-AABB000001', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":12047,"facilityCode":100},"person":"Alice Smith"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '32 minutes', CURRENT_TIMESTAMP - INTERVAL '32 minutes'),
    (end_user_id, 'OMO-AABB000001', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":12050,"facilityCode":100},"person":"Emma Rodriguez"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 hour 18 minutes', CURRENT_TIMESTAMP - INTERVAL '1 hour 18 minutes'),
    (end_user_id, 'OMO-AABB000001', 'access.denied',      'access_control', 'warning',
       '{"reason":"unknown_card","attemptedCredential":{"cardNumber":99999,"facilityCode":42}}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '3 hours 4 minutes', CURRENT_TIMESTAMP - INTERVAL '3 hours 4 minutes'),
    (end_user_id, 'OMO-AABB000001', 'lock.state_changed', 'lock_state',     'info',
       '{"from":"unlocked","to":"locked","trigger":"latch_timeout"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '4 hours', CURRENT_TIMESTAMP - INTERVAL '4 hours'),
    (end_user_id, 'OMO-AABB000001', 'command.sent',       'command',        'info',
       '{"command":"bwUnlock","by":"admin@democorp.example"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '4 hours 1 minute', CURRENT_TIMESTAMP - INTERVAL '4 hours 1 minute'),
    (end_user_id, 'OMO-AABB000001', 'access.granted',     'access_control', 'info',
       '{"credential":{"pin":"40293"},"person":"Alice Smith"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 2 hours', CURRENT_TIMESTAMP - INTERVAL '1 day 2 hours'),
    (end_user_id, 'OMO-AABB000001', 'access.granted',     'access_control', 'info',
       '{"credential":{"pin":"67891"},"person":"Henry Brown"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 6 hours', CURRENT_TIMESTAMP - INTERVAL '1 day 6 hours'),
    -- Back Entrance — loading dock activity
    (end_user_id, 'OMO-AABB000002', 'access.granted',     'access_control', 'info',
       '{"credential":{"pin":"21678"},"person":"Frank O’Brien"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '6 hours', CURRENT_TIMESTAMP - INTERVAL '6 hours'),
    (end_user_id, 'OMO-AABB000002', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":12048,"facilityCode":100},"person":"Bob Lee"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour', CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour'),
    (end_user_id, 'OMO-AABB000002', 'device.wake',        'lifecycle',      'info',
       '{"from":"sleep","battery":42}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days'),
    (end_user_id, 'OMO-AABB000002', 'access.denied',      'access_control', 'warning',
       '{"reason":"out_of_schedule","attemptedCredential":{"pin":"88712"}}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '2 days 4 hours', CURRENT_TIMESTAMP - INTERVAL '2 days 4 hours'),
    -- Server Room — restricted, mostly engineering
    (end_user_id, 'OMO-AABB000003', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":12049,"facilityCode":100},"person":"David Kim"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '45 minutes', CURRENT_TIMESTAMP - INTERVAL '45 minutes'),
    (end_user_id, 'OMO-AABB000003', 'access.denied',      'access_control', 'warning',
       '{"reason":"not_authorized","attemptedCredential":{"cardNumber":12047,"facilityCode":100},"person":"Alice Smith"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '2 hours 15 minutes', CURRENT_TIMESTAMP - INTERVAL '2 hours 15 minutes'),
    (end_user_id, 'OMO-AABB000003', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":12050,"facilityCode":100},"person":"Emma Rodriguez"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 3 hours', CURRENT_TIMESTAMP - INTERVAL '1 day 3 hours'),
    (end_user_id, 'OMO-AABB000003', 'lock.state_changed', 'lock_state',     'info',
       '{"from":"unlocked","to":"locked","trigger":"latch_timeout"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 3 hours 1 minute', CURRENT_TIMESTAMP - INTERVAL '1 day 3 hours 1 minute'),
    -- Storage Closet — offline / sparse events
    (end_user_id, 'OMO-AABB000004', 'device.sleep',       'lifecycle',      'info',
       '{"reason":"low_battery","battery":12}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '3 days'),
    (end_user_id, 'OMO-AABB000004', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":"04A1E455"},"person":"Leo Martinez"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '3 days 8 hours', CURRENT_TIMESTAMP - INTERVAL '3 days 8 hours'),
    (end_user_id, 'OMO-AABB000004', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":"04A12B3C"},"person":"Carol Nguyen"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '4 days', CURRENT_TIMESTAMP - INTERVAL '4 days'),
    -- Side Gate — error state, recent issues
    (end_user_id, 'OMO-AABB000005', 'device.restart',     'lifecycle',      'warning',
       '{"reason":"watchdog","uptime_s":86400}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '12 hours', CURRENT_TIMESTAMP - INTERVAL '12 hours'),
    (end_user_id, 'OMO-AABB000005', 'command.failed',     'command',        'error',
       '{"command":"bwUnlock","error":"device_unreachable"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '14 hours', CURRENT_TIMESTAMP - INTERVAL '14 hours'),
    (end_user_id, 'OMO-AABB000005', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":"04A1D701"},"person":"Isabel Garcia"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 day 18 hours', CURRENT_TIMESTAMP - INTERVAL '1 day 18 hours'),
    (end_user_id, 'OMO-AABB000005', 'access.granted',     'access_control', 'info',
       '{"credential":{"cardNumber":"04A1E455"},"person":"Leo Martinez"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '2 days 9 hours', CURRENT_TIMESTAMP - INTERVAL '2 days 9 hours'),
    (end_user_id, 'OMO-AABB000005', 'access.denied',      'access_control', 'warning',
       '{"reason":"lockdown","attemptedCredential":{"cardNumber":"04A12B3C"},"person":"Carol Nguyen"}'::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '5 days');

  -- ── Insights demo data ──────────────────────────────────────────────────
  -- Extra resellers + end-users + devices with `created_at` spread across
  -- the last ~12 months so /app/insights renders a real growth curve.
  --
  -- Shape we're aiming for:
  --   Acme Distribution  — established, big jump in the most recent month
  --                        (Demo Customer Co's 5 devices were just created)
  --   BlueWave Security  — breakout, started ~7 months ago, rapid growth
  --   Lockwise Partners  — emerging, only the last 3 months
  --   Direct (no parent) — small flat baseline

  INSERT INTO companies (name, company_type, status, company_email, company_url, created_at, updated_at)
    VALUES ('BlueWave Security', 'reseller', 'active', 'sales@bluewave.example', 'https://bluewave.example',
            NOW() - INTERVAL '7 months', NOW() - INTERVAL '7 months')
    RETURNING id INTO reseller_bluewave;
  INSERT INTO companies (name, company_type, status, company_email, company_url, created_at, updated_at)
    VALUES ('Lockwise Partners', 'reseller', 'active', 'hello@lockwise.example', 'https://lockwise.example',
            NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months')
    RETURNING id INTO reseller_lockwise;

  -- Admin users for the new resellers — same dev password (Password123!),
  -- so you can sign in and test cross-reseller boundaries (e.g. confirm a
  -- BlueWave admin can't see Acme's customer drill-in by URL guessing).
  INSERT INTO users (
    company_id, user_type_id, email, first_name, last_name,
    password_hash, email_verified, email_verified_at, status
  ) VALUES
    (reseller_bluewave, 1, 'admin@bluewave.example', 'BlueWave', 'Admin',
     '$2b$10$/sl9aeZKp7Kwh0vII3Mxx.WVvBnBbzxJ0jBZPbSQM2bmmQCfoB79y',
     true, NOW() - INTERVAL '7 months', 'active'),
    (reseller_lockwise, 1, 'admin@lockwise.example', 'Lockwise', 'Admin',
     '$2b$10$/sl9aeZKp7Kwh0vII3Mxx.WVvBnBbzxJ0jBZPbSQM2bmmQCfoB79y',
     true, NOW() - INTERVAL '3 months', 'active');

  -- End-users locked to specific resellers
  INSERT INTO companies (name, company_type, status, company_email,
                         parent_company_id, parent_locked_at, created_at, updated_at)
    VALUES ('Pinecrest Apartments', 'end_user', 'active', 'ops@pinecrest.example',
            reseller_id,        NOW() - INTERVAL '9 months',
            NOW() - INTERVAL '9 months', NOW() - INTERVAL '9 months')
    RETURNING id INTO eu_pinecrest;
  INSERT INTO companies (name, company_type, status, company_email,
                         parent_company_id, parent_locked_at, created_at, updated_at)
    VALUES ('Brookline Coworking', 'end_user', 'active', 'admin@brookline.example',
            reseller_bluewave,  NOW() - INTERVAL '7 months',
            NOW() - INTERVAL '7 months', NOW() - INTERVAL '7 months')
    RETURNING id INTO eu_brookline;
  INSERT INTO companies (name, company_type, status, company_email,
                         parent_company_id, parent_locked_at, created_at, updated_at)
    VALUES ('Meridian Hotels',    'end_user', 'active', 'it@meridianhotels.example',
            reseller_bluewave,  NOW() - INTERVAL '5 months',
            NOW() - INTERVAL '5 months', NOW() - INTERVAL '5 months')
    RETURNING id INTO eu_meridian;
  INSERT INTO companies (name, company_type, status, company_email,
                         parent_company_id, parent_locked_at, created_at, updated_at)
    VALUES ('Aurora Labs',        'end_user', 'active', 'it@auroralabs.example',
            reseller_lockwise,  NOW() - INTERVAL '3 months',
            NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months')
    RETURNING id INTO eu_aurora;

  -- "Direct" end-users — no reseller parent
  INSERT INTO companies (name, company_type, status, company_email, created_at, updated_at)
    VALUES ('Hollow Pine Yoga', 'end_user', 'active', 'studio@hollowpine.example',
            NOW() - INTERVAL '11 months', NOW() - INTERVAL '11 months')
    RETURNING id INTO eu_yoga;
  INSERT INTO companies (name, company_type, status, company_email, created_at, updated_at)
    VALUES ('GraniteBank',      'end_user', 'active', 'facilities@granitebank.example',
            NOW() - INTERVAL '4 months', NOW() - INTERVAL '4 months')
    RETURNING id INTO eu_bank;

  -- Devices: a small helper-pattern using unnest(...) WITH ORDINALITY so we
  -- can put each device at a specific historical created_at (months ago).
  -- The chart attributes month-end MRR using created_at, so the offsets
  -- below drive the shape directly.

  -- Pinecrest (Acme): 3 devices, 9/6/3 months ago
  INSERT INTO devices (company_id, reseller_company_id, device_id, device_type, firmware_version,
                       device_name, location, status, door_state, battery_percent, power_mode,
                       created_at, updated_at, assigned_at, last_seen)
  SELECT eu_pinecrest, reseller_id,
         'OMO-PINE' || lpad(idx::text, 6, '0'),
         'sb6', '1.4.2',
         'Pinecrest Door ' || idx, 'Building ' || idx,
         'online', 'locked', 80, 'active',
         NOW() - make_interval(months => off_mo),
         NOW() - INTERVAL '1 hour',
         NOW() - make_interval(months => off_mo),
         NOW() - INTERVAL '1 hour'
    FROM unnest(ARRAY[9, 6, 3]) WITH ORDINALITY AS t(off_mo, idx);

  -- Brookline (BlueWave): 4 devices, 7/5/3/1 months ago
  INSERT INTO devices (company_id, reseller_company_id, device_id, device_type, firmware_version,
                       device_name, location, status, door_state, battery_percent, power_mode,
                       created_at, updated_at, assigned_at, last_seen)
  SELECT eu_brookline, reseller_bluewave,
         'OMO-BROK' || lpad(idx::text, 6, '0'),
         'sb6', '1.4.2',
         'Brookline Door ' || idx, 'Floor ' || idx,
         'online', 'locked', 75, 'active',
         NOW() - make_interval(months => off_mo),
         NOW() - INTERVAL '1 hour',
         NOW() - make_interval(months => off_mo),
         NOW() - INTERVAL '2 hours'
    FROM unnest(ARRAY[7, 5, 3, 1]) WITH ORDINALITY AS t(off_mo, idx);

  -- Meridian (BlueWave): 5 devices, 5/3/2/1/0 months ago (the breakout)
  INSERT INTO devices (company_id, reseller_company_id, device_id, device_type, firmware_version,
                       device_name, location, status, door_state, battery_percent, power_mode,
                       created_at, updated_at, assigned_at, last_seen)
  SELECT eu_meridian, reseller_bluewave,
         'OMO-MERI' || lpad(idx::text, 6, '0'),
         'sb6', '1.4.2',
         'Meridian Room ' || idx, 'Hotel ' || idx,
         'online', 'locked', 88, 'active',
         NOW() - make_interval(months => off_mo),
         NOW() - INTERVAL '1 hour',
         NOW() - make_interval(months => off_mo),
         NOW() - INTERVAL '30 minutes'
    FROM unnest(ARRAY[5, 3, 2, 1, 0]) WITH ORDINALITY AS t(off_mo, idx);

  -- Aurora (Lockwise): 2 devices, 3/1 months ago
  INSERT INTO devices (company_id, reseller_company_id, device_id, device_type, firmware_version,
                       device_name, location, status, door_state, battery_percent, power_mode,
                       created_at, updated_at, assigned_at, last_seen)
  SELECT eu_aurora, reseller_lockwise,
         'OMO-AURO' || lpad(idx::text, 6, '0'),
         'sb6', '1.4.2',
         'Aurora Lab ' || idx, 'Wing ' || idx,
         'online', 'locked', 70, 'active',
         NOW() - make_interval(months => off_mo),
         NOW() - INTERVAL '1 hour',
         NOW() - make_interval(months => off_mo),
         NOW() - INTERVAL '5 minutes'
    FROM unnest(ARRAY[3, 1]) WITH ORDINALITY AS t(off_mo, idx);

  -- Direct end-users (no reseller): small flat baseline
  -- Hollow Pine Yoga: 2 devices, 11/8 months ago
  INSERT INTO devices (company_id, device_id, device_type, firmware_version,
                       device_name, location, status, door_state, battery_percent, power_mode,
                       created_at, updated_at, assigned_at, last_seen)
  SELECT eu_yoga,
         'OMO-YOGA' || lpad(idx::text, 6, '0'),
         'sb6', '1.4.2',
         'Yoga Door ' || idx, 'Studio ' || idx,
         'online', 'locked', 65, 'active',
         NOW() - make_interval(months => off_mo),
         NOW() - INTERVAL '1 hour',
         NOW() - make_interval(months => off_mo),
         NOW() - INTERVAL '4 hours'
    FROM unnest(ARRAY[11, 8]) WITH ORDINALITY AS t(off_mo, idx);

  -- GraniteBank: 1 device, 4 months ago
  INSERT INTO devices (company_id, device_id, device_type, firmware_version,
                       device_name, location, status, door_state, battery_percent, power_mode,
                       created_at, updated_at, assigned_at, last_seen)
  VALUES (eu_bank, 'OMO-BANK000001', 'sb6', '1.4.2',
          'Vault Anteroom', 'Main branch', 'online', 'locked', 92, 'active',
          NOW() - INTERVAL '4 months',
          NOW() - INTERVAL '1 hour',
          NOW() - INTERVAL '4 months',
          NOW() - INTERVAL '6 hours');

  RAISE NOTICE 'Seed complete: % companies (incl. 3 resellers, 7 end-users), % devices total, % credentials, ~23 events.',
    (SELECT COUNT(*) FROM companies),
    (SELECT COUNT(*) FROM devices),
    (SELECT COUNT(*) FROM credentials);
END $seed$;
