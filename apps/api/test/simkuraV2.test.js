'use strict';

/**
 * Simkura v2 read-path mapping tests. Pure unit tests over the two mapping
 * functions — no network, no database.
 *
 * The fixture below mirrors GET /api/v2/devices/:id per the v2 2.0.0
 * contract (simkura-core api/openapi/v2.yaml, 2026-09-01): features /
 * supported / cardFormats spine tier, reader.protocol/technology,
 * power.batteryChemistry.
 *
 * Set SIMKURA_SANDBOX_TESTS=1 to also run a live smoke test against the
 * public sandbox (skipped by default so CI stays hermetic).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSpine, upstreamErrorMessage } = require('../hardware/simkura/simkuraClient');
const { fieldsFromState } = require('../hardware/simkura/stateSyncWorker');
const { profileFromResource, bindValue } = require('../hardware/simkura/hardwareProfile');
const { rowsFromCatalog, resolveBoard, publicBoard } = require('../hardware/simkura/boardCatalog');

const V2_RESOURCE = {
  meta: {
    status: 'online', deployed: true,
    lastSeen: '2026-08-31T12:00:00.000Z',
    lastSeenLocal: '2026-08-31T05:00:00.000-07:00',
    gatewayConnection: 'TestGateway',
  },
  device: {
    id: 'nrf-352656100012345', manufacturer: 'Simkura', board: 'SB6',
    version: 'rev-b', firmware: '2.3.4', numDoors: 1,
  },
  capabilities: ['lock-control', 'credential-store', 'schedules', 'power', 'connectivity'],
  features: { 'door-position-sensing': false },
  supported: {
    'doors.reader.protocol': ['osdp', 'wiegand'],
    'doors.reader.technology': ['prox', 'smartcard', 'nfc', 'ble', 'multi'],
    cardFormats: ['26-bit', 'mifare-1k', 'hid-34', 'hid-37'],
    'power.batteryChemistry': ['alkaline', 'lithium', 'li-ion'],
  },
  cardFormats: ['26-bit', 'mifare-1k', 'hid-34'],
  doors: [{
    door: 1, name: 'Front Door',
    lock: { state: 'locked', position: null, override: 2 },
    reader: { protocol: 'osdp', connection: 'secure', technology: 'prox' },
    latchInterval: 5,
    counts: { credentials: 105, shifts: 4, holidays: 0 },
  }],
  power: { type: 'battery', state: 'sleep', batteryPct: 87, batteryHealth: 'ok', batteryChemistry: 'alkaline' },
  connectivity: { transport: 'cellular', carrier: 'AT&T', signal: -76 },
};

describe('Simkura v2 — normalizeSpine', () => {
  test('flattens the list spine', () => {
    const n = normalizeSpine(V2_RESOURCE);
    assert.equal(n.device_id, 'nrf-352656100012345');
    assert.equal(n.device_type, 'sb6');               // board, lowercased
    assert.equal(n.firmware_version, '2.3.4');
    assert.equal(n.status, 'online');
    assert.equal(n.last_seen, '2026-08-31T12:00:00.000Z');
    assert.equal(n.deployed, true);
    assert.deepEqual(n.capabilities, V2_RESOURCE.capabilities);
    // Hardware profile rides along, pre-mapped to column names.
    assert.equal(n.profile.manufacturer, 'Simkura');
    assert.equal(n.profile.hardware_version, 'rev-b');
    assert.equal(n.profile.num_doors, 1);
    assert.deepEqual(n.profile.features, { 'door-position-sensing': false });
    assert.deepEqual(n.profile.supported.cardFormats, ['26-bit', 'mifare-1k', 'hid-34', 'hid-37']);
  });

  test('missing device.id → null; missing board defaults to sb6', () => {
    assert.equal(normalizeSpine({ meta: {}, device: {} }), null);
    assert.equal(normalizeSpine(null), null);
    const n = normalizeSpine({ device: { id: 'x' }, meta: {} });
    assert.equal(n.device_type, 'sb6');
    assert.equal(n.status, null);
  });
});

describe('Simkura v2 — fieldsFromState', () => {
  test('maps the full resource onto devices columns', () => {
    const f = fieldsFromState(V2_RESOURCE);
    assert.equal(f.status, 'online');
    assert.equal(f.door_state, 'locked');
    assert.equal(f.door_position, null);              // fixture: feature off → null
    assert.equal(f.door_override, true);              // 2 (holiday) → true
    assert.equal(f.door_override_mode, 'holiday');
    assert.equal(f.reader_protocol, 'osdp');
    assert.equal(f.reader_connection, 'secure');
    assert.equal(f.reader_technology, 'prox');
    assert.equal(f.battery_chemistry, 'alkaline');
    assert.equal(f.latch_interval_s, 5);
    assert.equal(f.fw_credential_count, 105);
    assert.equal(f.fw_shift_count, 4);
    assert.equal(f.fw_holiday_count, 0);
    assert.equal(f.power_mode, 'sleep');
    assert.equal(f.battery_percent, 87);
    assert.equal(f.battery_health, 'ok');
    assert.equal(f.firmware_version, '2.3.4');
    assert.equal(f.carrier, 'AT&T');
    assert.equal(f.signal_strength, -76);
    assert.ok(f.last_seen instanceof Date);
    // Hardware profile (migration 085).
    assert.equal(f.device_type, 'sb6');
    assert.equal(f.manufacturer, 'Simkura');
    assert.equal(f.hardware_version, 'rev-b');
    assert.equal(f.num_doors, 1);
    assert.equal(f.deployed, true);
    assert.equal(f.power_type, 'battery');
    assert.equal(f.connectivity_transport, 'cellular');
    assert.deepEqual(f.capabilities, V2_RESOURCE.capabilities);
    assert.deepEqual(f.features, V2_RESOURCE.features);
    assert.deepEqual(f.supported, V2_RESOURCE.supported);
    assert.deepEqual(f.card_formats, ['26-bit', 'mifare-1k', 'hid-34']);
    // v1-era columns must no longer be produced.
    for (const gone of ['osdp_stage', 'config_card_type', 'deep_sleep_duration_s', 'fw_door_shift_count']) {
      assert.ok(!(gone in f), `${gone} should not be written from v2`);
    }
  });

  test('never-seen device (lastSeen null) mirrors status only', () => {
    const f = fieldsFromState({
      meta: { status: 'offline', lastSeen: null },
      device: { id: 'x', firmware: '2.3.3' },
      power: { batteryPct: 0, state: 'sleep' },
    });
    assert.deepEqual(f, { status: 'offline' });
  });

  test('never-seen device still mirrors its hardware profile', () => {
    const f = fieldsFromState({
      meta: { status: 'offline', lastSeen: null, deployed: false },
      device: { id: 'x', board: 'SB8-4D', numDoors: 4 },
      capabilities: ['lock-control'],
      features: { 'door-position-sensing': true },
      power: { type: 'plugin', batteryPct: 0 },
    });
    assert.deepEqual(f, {
      status: 'offline', device_type: 'sb8-4d', num_doors: 4, deployed: false,
      capabilities: ['lock-control'], features: { 'door-position-sensing': true },
      power_type: 'plugin',
    });
  });

  test("meta.status 'unknown' is not mirrored (column CHECK)", () => {
    const f = fieldsFromState({ meta: { status: 'unknown', lastSeen: '2026-08-31T12:00:00Z' } });
    assert.ok(!('status' in f));
    assert.ok(f.last_seen instanceof Date);
  });

  test('plug-in device (batteryPct null) leaves battery untouched; wifi leaves carrier null', () => {
    const f = fieldsFromState({
      meta: { status: 'online', lastSeen: '2026-08-31T12:00:00Z' },
      device: { id: 'x' },
      power: { type: 'plugin', state: 'active', batteryPct: null },
      connectivity: { transport: 'wifi', carrier: null, signal: null },
    });
    assert.ok(!('battery_percent' in f));
    assert.equal(f.carrier, null);
    assert.equal(f.signal_strength, null);
    assert.equal(f.power_mode, 'active');
  });

  test('reader block: wiegand clears connection; door position sensed; garbage dropped', () => {
    const f = fieldsFromState({
      meta: { status: 'online', lastSeen: '2026-08-31T12:00:00Z' },
      device: { id: 'x' },
      doors: [{ door: 1, lock: { state: 'locked', position: 'open' }, reader: { protocol: 'wiegand', connection: null, technology: 'bogus' } }],
      power: { batteryChemistry: 'plutonium' },
    });
    assert.equal(f.door_position, 'open');
    assert.ok(!('door_override_mode' in f));           // no override field → untouched
    assert.equal(fieldsFromState({
      meta: { status: 'online', lastSeen: '2026-08-31T12:00:00Z' }, device: { id: 'x' },
      doors: [{ door: 1, lock: { state: 'locked', override: 1 } }],
    }).door_override_mode, 'command');
    assert.equal(fieldsFromState({
      meta: { status: 'online', lastSeen: '2026-08-31T12:00:00Z' }, device: { id: 'x' },
      doors: [{ door: 1, lock: { state: 'locked', override: 0 } }],
    }).door_override_mode, 'none');
    assert.equal(f.reader_protocol, 'wiegand');
    assert.equal(f.reader_connection, null);
    assert.equal(f.reader_technology, null);
    assert.ok(!('battery_chemistry' in f));
    // No reader block at all → reader columns untouched.
    const g = fieldsFromState({
      meta: { status: 'online', lastSeen: '2026-08-31T12:00:00Z' },
      device: { id: 'x' },
      doors: [{ door: 1, lock: { state: 'locked' } }],
    });
    assert.ok(!('reader_protocol' in g));
    assert.ok(!('door_position' in g));
  });

  test('missing capability blocks are simply omitted', () => {
    const f = fieldsFromState({
      meta: { status: 'online', lastSeen: '2026-08-31T12:00:00Z' },
      device: { id: 'x' },
      capabilities: [],
    });
    assert.equal(f.status, 'online');
    assert.ok(!('door_state' in f));
    assert.ok(!('power_mode' in f));
  });
});

describe('Simkura v2 — hardwareProfile', () => {
  test('drops malformed tiers and out-of-CHECK enums instead of failing', () => {
    const p = profileFromResource({
      device: { id: 'x', board: '  ', manufacturer: 42, version: 'rev-c', numDoors: 0 },
      meta: { deployed: 'yes' },
      capabilities: ['lock-control', 7, ''],
      features: { 'door-position-sensing': 'true', other: false },
      supported: { cardFormats: ['hid-34', 3], bogus: 'not-a-list' },
      cardFormats: 'hid-34',
      power: { type: 'solar' },
      connectivity: { transport: 'lora' },
    });
    assert.deepEqual(p, {
      hardware_version: 'rev-c',
      capabilities: ['lock-control'],
      features: { other: false },
      supported: { cardFormats: ['hid-34'] },
    });
  });

  test('empty / non-object input yields no columns', () => {
    assert.deepEqual(profileFromResource(null), {});
    assert.deepEqual(profileFromResource('x'), {});
    assert.deepEqual(profileFromResource({}), {});
  });

  test('bindValue stringifies JSON tiers only', () => {
    assert.equal(bindValue('capabilities', ['power']), '["power"]');
    assert.equal(bindValue('features', { a: true }), '{"a":true}');
    assert.equal(bindValue('capabilities', null), null);
    assert.equal(bindValue('num_doors', 2), 2);
    assert.equal(bindValue('manufacturer', 'Simkura'), 'Simkura');
  });
});

describe('Simkura v2 — boardCatalog', () => {
  const CATALOG = {
    boards: [
      {
        manufacturer: 'Simkura', board: 'SB6', displayName: 'Simkura SB6',
        numDoors: 1, powerType: 'battery',
        capabilities: ['lock-control', 'credential-store', 'schedules', 'power', 'connectivity'],
        features: { 'door-position-sensing': false },
        supported: { cardFormats: ['26-bit', 'mifare-1k', 'hid-34', 'hid-37'] },
      },
      { manufacturer: 'Simkura', board: 'SB8-4D', numDoors: 4, powerType: 'plugin', capabilities: ['lock-control'] },
      { manufacturer: 'Acme', board: 'SB6', displayName: 'Acme SB6 clone', capabilities: [] },
      { board: 'no-manufacturer' },
      { manufacturer: 'Simkura', board: '   ' },
    ],
  };

  test('rowsFromCatalog maps boards and drops rows without an identity pair', () => {
    const rows = rowsFromCatalog(CATALOG);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], {
      manufacturer: 'Simkura', board: 'SB6', display_name: 'Simkura SB6',
      num_doors: 1, power_type: 'battery',
      capabilities: ['lock-control', 'credential-store', 'schedules', 'power', 'connectivity'],
      features: { 'door-position-sensing': false },
      supported: { cardFormats: ['26-bit', 'mifare-1k', 'hid-34', 'hid-37'] },
    });
    // Missing tiers default to empty, not null, so consumers can index them.
    assert.deepEqual(rows[1].features, {});
    assert.deepEqual(rows[1].supported, {});
    assert.equal(rows[1].display_name, null);
    assert.deepEqual(rowsFromCatalog(null), []);
    assert.deepEqual(rowsFromCatalog({ boards: 'nope' }), []);
  });

  test('resolveBoard matches device_type case-insensitively, manufacturer when known', () => {
    const boards = rowsFromCatalog(CATALOG);
    assert.equal(resolveBoard(boards, { device_type: 'sb6', manufacturer: 'Simkura' }).display_name, 'Simkura SB6');
    assert.equal(resolveBoard(boards, { device_type: 'sb6', manufacturer: 'acme' }).display_name, 'Acme SB6 clone');
    // Unknown manufacturer → first board with that designation (catalog order).
    assert.equal(resolveBoard(boards, { device_type: 'sb6', manufacturer: null }).manufacturer, 'Simkura');
    assert.equal(resolveBoard(boards, { device_type: 'SB8-4D' }).num_doors, 4);
    // Manufacturer known but no match → null rather than a wrong board.
    assert.equal(resolveBoard(boards, { device_type: 'sb6', manufacturer: 'Other' }), null);
    assert.equal(resolveBoard(boards, { device_type: 'sb99' }), null);
    assert.equal(resolveBoard(boards, {}), null);
  });

  test('publicBoard shapes a catalog row and passes null through', () => {
    assert.equal(publicBoard(null), null);
    const p = publicBoard({ manufacturer: 'Simkura', board: 'SB6', capabilities: ['power'] });
    assert.deepEqual(p, {
      manufacturer: 'Simkura', board: 'SB6', display_name: null, num_doors: null, power_type: null,
      capabilities: ['power'], features: {}, supported: {}, synced_at: null,
    });
  });
});

describe('Simkura v2 — upstreamErrorMessage', () => {
  const httpErr = (data) => ({ message: 'Request failed with status code 422', response: { status: 422, data } });

  test('v2 envelope: message preferred over the machine code; details appended', () => {
    assert.equal(
      upstreamErrorMessage(httpErr({ error: 'unsupported_feature', message: 'card format hid-37 is not available on this device' })),
      'card format hid-37 is not available on this device');
    assert.equal(
      upstreamErrorMessage(httpErr({ error: 'invalid_params', message: 'Request invalid', details: ['latchInterval must be an integer 1-255', 'readerTechnology must be one of: prox, smartcard, nfc, ble, multi'] })),
      'Request invalid — latchInterval must be an integer 1-255; readerTechnology must be one of: prox, smartcard, nfc, ble, multi');
  });

  test('older deployments: bare error string still surfaces', () => {
    assert.equal(upstreamErrorMessage(httpErr({ error: 'Device not found' })), 'Device not found');
  });

  test('transport errors and fallback', () => {
    assert.equal(upstreamErrorMessage({ message: 'connect ECONNREFUSED' }), 'connect ECONNREFUSED');
    assert.equal(upstreamErrorMessage({}, 'unknown'), 'unknown');
    assert.equal(upstreamErrorMessage(httpErr({}), 'unknown'), 'Request failed with status code 422');
  });
});

describe('Simkura v2 — push mapping (devicePush._internal)', () => {
  const { credentialAddBody, credentialRemoveArgs, shiftAddBody, hhmmss } =
    require('../services/access/devicePush')._internal;

  test('credentialAddBody: pin / HID / mifare, master-only, no shiftIds', () => {
    assert.deepEqual(
      credentialAddBody({ credential_type: 'pin', credential_value: '12345' }),
      { type: 'pin', class: 'master', pinCode: 12345 });
    // 'HID' rows are the format old firmware mislabeled "32-bit" → hid-34.
    assert.deepEqual(
      credentialAddBody({ credential_type: 'HID', card_number: '4433221', facility_code: '12' }),
      { type: 'hid-34', class: 'master', cardNumber: 4433221, facilityCode: 12 });
    assert.deepEqual(
      credentialAddBody({ credential_type: 'mifare', card_number: '998877', facility_code: null }),
      { type: 'mifare-1k', class: 'master', cardNumber: 998877, facilityCode: 0 });
    assert.equal(credentialAddBody({ credential_type: 'retina-scan' }), null);
    assert.equal(credentialAddBody({ credential_type: 'pin', credential_value: 'not-a-pin' }), null);
  });

  test('credentialRemoveArgs: card by number+facility, PIN via ?type=pin', () => {
    assert.deepEqual(
      credentialRemoveArgs({ credential_type: 'HID', card_number: '4433221', facility_code: '12' }),
      { credentialId: 4433221, opts: { facilityCode: 12 } });
    assert.deepEqual(
      credentialRemoveArgs({ credential_type: 'pin', credential_value: '12345' }),
      { credentialId: 12345, opts: { type: 'pin' } });
    assert.equal(credentialRemoveArgs({ credential_type: 'HID', card_number: null }), null);
  });

  test('holidayAddBody: firmware slot id, ISO window, access_mode → behavior', () => {
    const { holidayAddBody } = require('../services/access/devicePush')._internal;
    const base = { id: 9, start_datetime: new Date('2026-12-25T00:00:00Z'), end_datetime: '2026-12-26T00:00:00.000Z' };
    assert.deepEqual(holidayAddBody({ ...base, access_mode: 'open' }, 3), {
      holidayId: 3, start: '2026-12-25T00:00:00.000Z', end: '2026-12-26T00:00:00.000Z', behavior: 'unlocked',
    });
    assert.equal(holidayAddBody({ ...base, access_mode: 'locked' }, 1).behavior, 'locked');
    assert.equal(holidayAddBody({ ...base, access_mode: 'lockdown' }, 1).behavior, 'lockdown');
    // No firmware equivalent → unmappable, skipped by the push.
    assert.equal(holidayAddBody({ ...base, access_mode: 'restricted' }, 1), null);
    assert.equal(holidayAddBody({ ...base, access_mode: 'open', start_datetime: 'not a date' }, 1), null);
  });

  test('shiftAddBody: firmware slot id, HH:MM:SS, day names', () => {
    const body = shiftAddBody({
      id: 4321, // DB id must NOT reach the firmware
      start_time: '8:0:0', end_time: '17:30:00',
      days_of_week: [1, 2, 3, 4, 5],
    }, 3);
    assert.deepEqual(body, {
      shiftId: 3,
      start: '08:00:00',
      end:   '17:30:00',
      days:  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      type:  'normal',
    });
    assert.equal(hhmmss('9:5'), '09:05:00');
  });
});

// Live sandbox smoke test — opt-in only (SIMKURA_SANDBOX_TESTS=1).
describe('Simkura v2 — live sandbox', { skip: process.env.SIMKURA_SANDBOX_TESTS !== '1' }, () => {
  const { SimkuraClient } = require('../hardware/simkura/simkuraClient');
  const client = new SimkuraClient({
    apiUrl: 'https://api.simkura.com',
    apiKey: 'sk_demo_simkura_sandbox', // public, documented sandbox key
  });

  test('lists and normalizes the fixture devices', async () => {
    const { devices } = await client.getDevices();
    assert.ok(devices.length >= 1, 'sandbox returned no devices');
    for (const d of devices) {
      assert.ok(d.device_id, 'normalized device has an id');
      assert.ok(['online', 'offline', 'unknown', null].includes(d.status));
    }
    const one = await client.getDevice(devices[0].device_id);
    assert.ok(one.device?.id, 'full resource has device.id');
    const fields = fieldsFromState(one);
    assert.ok(Object.keys(fields).length > 0, 'resource mapped to at least one column');
  });

  test('commands: 202 queued records, incl. set-state normal and data records', async () => {
    const { devices } = await client.getDevices();
    const hwId = devices[0].device_id;

    const unlock = await client.unlockDoor(hwId, 1);
    assert.equal(unlock.operation, 'lock.unlock');
    assert.equal(unlock.status, 'queued');
    assert.ok(String(unlock.id).startsWith('cmd_'));

    const normal = await client.setLockState(hwId, 1, 'normal');
    assert.equal(normal.operation, 'lock.set-state');

    const cred = await client.addCredential(hwId, 1, { type: 'pin', pinCode: 12345, class: 'master' });
    assert.equal(cred.operation, 'credentials.add');

    const wipe = await client.clearCredentials(hwId, 1);
    assert.equal(wipe.operation, 'credentials.clear');

    const active = await client.listCommands(hwId, { limit: 100 });
    assert.ok(Array.isArray(active));
    assert.ok(active.some((c) => c.id === unlock.id), 'queued unlock appears in the active queue');
  });
});
