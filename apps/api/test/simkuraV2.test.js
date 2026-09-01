'use strict';

/**
 * Simkura v2 read-path mapping tests. Pure unit tests over the two mapping
 * functions — no network, no database.
 *
 * The fixture below is the live shape of GET /api/v2/devices/:id as served
 * by Simkura's public sandbox (docs.simkura.com), 2026-08-31.
 *
 * Set SIMKURA_SANDBOX_TESTS=1 to also run a live smoke test against the
 * public sandbox (skipped by default so CI stays hermetic).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSpine } = require('../hardware/simkura/simkuraClient');
const { fieldsFromState } = require('../hardware/simkura/stateSyncWorker');

const V2_RESOURCE = {
  meta: {
    status: 'online', deployed: true,
    lastSeen: '2026-08-31T12:00:00.000Z',
    lastSeenLocal: '2026-08-31T05:00:00.000-07:00',
    gatewayConnection: 'Bluewave',
  },
  device: {
    id: 'nrf-352656100012345', manufacturer: 'Simkura', board: 'SB6',
    version: 'rev-b', firmware: '2.3.4', numDoors: 1,
  },
  capabilities: ['lock-control', 'credential-store', 'schedules', 'power', 'connectivity'],
  doors: [{
    door: 1, name: 'Front Door',
    lock: { state: 'locked', position: null, override: 2 },
    reader: { type: 'osdp', connection: 'secure', frequency: 'prox' },
    latchInterval: 5,
    counts: { credentials: 105, shifts: 4, holidays: 0 },
  }],
  power: { type: 'battery', state: 'sleep', batteryPct: 87, batteryHealth: 'ok', batteryType: 'alkaline' },
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
    assert.equal(f.door_override, true);              // 2 (holiday) → true
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

// Live sandbox smoke test — opt-in only (SIMKURA_SANDBOX_TESTS=1).
describe('Simkura v2 — live sandbox', { skip: process.env.SIMKURA_SANDBOX_TESTS !== '1' }, () => {
  test('lists and normalizes the fixture devices', async () => {
    const { SimkuraClient } = require('../hardware/simkura/simkuraClient');
    const client = new SimkuraClient({
      apiUrl: 'https://api.simkura.com',
      apiKey: 'sk_demo_simkura_sandbox', // public, documented sandbox key
    });
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
});
