'use strict';

/**
 * Inbound Simkura webhook receiver — signature gate over HTTP, event
 * pipeline via the module internals (the route ACKs before inserting, so
 * HTTP-level assertions on storage would race).
 *
 * Requires a running local PostgreSQL with the DB seeded (npm run db:reset).
 */

process.env.SIMKURA_WEBHOOK_SECRET = 'test-webhook-secret';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');

const app = require('../server');
const { pool, query } = require('../database/db');
const { insertEvent, applyEventToDeviceState, eventSeverity } =
  require('../routes/webhooks')._internal;

const SECRET = 'test-webhook-secret';
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('hex');

let hwId;            // a seeded device to mutate
let seq = 0;
const eid = () => `test-evt-${Date.now()}-${seq++}`;

const deviceRow = async () => (await query(
  `SELECT status, door_state, battery_health, battery_percent, last_seen
     FROM devices WHERE device_id = $1`, [hwId])).rows[0];

describe('Simkura webhooks — receiver', () => {
  before(async () => {
    const { rows } = await query(
      `SELECT device_id FROM devices WHERE deleted_at IS NULL AND company_id IS NOT NULL ORDER BY id LIMIT 1`);
    hwId = rows[0].device_id;
  });

  after(async () => {
    await query(`DELETE FROM device_events WHERE simkura_event_id LIKE 'test-evt-%'`);
    await pool.end();
  });

  test('missing / wrong signature → 401; valid → 200 ack', async () => {
    const body = JSON.stringify({ event_type: 'device.wake', event_id: eid(), device_id: hwId });
    const r1 = await request(app).post('/api/webhooks/simkura')
      .set('Content-Type', 'application/json').send(body);
    assert.equal(r1.status, 401);

    const r2 = await request(app).post('/api/webhooks/simkura')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', 'deadbeef'.repeat(8)).send(body);
    assert.equal(r2.status, 401);

    const r3 = await request(app).post('/api/webhooks/simkura')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', sign(body)).send(body);
    assert.equal(r3.status, 200);
    assert.equal(r3.body.received, true);
  });

  test('invalid JSON → 400; missing event_type → 400', async () => {
    const bad = 'not-json{';
    const r1 = await request(app).post('/api/webhooks/simkura')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', sign(bad)).send(bad);
    assert.equal(r1.status, 400);

    const noType = JSON.stringify({ event_id: eid() });
    const r2 = await request(app).post('/api/webhooks/simkura')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', sign(noType)).send(noType);
    assert.equal(r2.status, 400);
  });

  test('severity: metadata wins, legacy top-level tolerated, junk clamped', () => {
    assert.equal(eventSeverity({ metadata: { severity: 'error' } }), 'error');
    assert.equal(eventSeverity({ severity: 'warning' }), 'warning');
    assert.equal(eventSeverity({ metadata: { severity: 'catastrophic' } }), 'info');
    assert.equal(eventSeverity({}), 'info');
  });

  test('insertEvent dedupes on simkura_event_id', async () => {
    const id = eid();
    const payload = { event_type: 'access.granted', event_id: id, device_id: hwId, data: {} };
    await insertEvent(payload);
    await insertEvent(payload);
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM device_events WHERE simkura_event_id = $1`, [id]);
    assert.equal(rows[0].n, 1);
  });

  test('device.offline flips status without touching last_seen; device.online recovers', async () => {
    await applyEventToDeviceState({ event_type: 'device.wake', device_id: hwId });
    const beforeRow = await deviceRow();
    assert.equal(beforeRow.status, 'online');

    await applyEventToDeviceState({ event_type: 'device.offline', device_id: hwId, data: {} });
    const offlineRow = await deviceRow();
    assert.equal(offlineRow.status, 'offline');
    assert.equal(String(offlineRow.last_seen), String(beforeRow.last_seen), 'last_seen must not move on device.offline');

    await applyEventToDeviceState({ event_type: 'device.online', device_id: hwId, data: {} });
    assert.equal((await deviceRow()).status, 'online');
  });

  test('battery health events update battery_health and battery_percent', async () => {
    await applyEventToDeviceState(
      { event_type: 'health.battery_low', device_id: hwId, data: { batteryLevel: 'low', batteryPct: 18 } });
    let row = await deviceRow();
    assert.equal(row.battery_health, 'low');
    assert.equal(row.battery_percent, 18);

    await applyEventToDeviceState(
      { event_type: 'health.battery_dead', device_id: hwId, data: { batteryLevel: 'dead', batteryPct: 2 } });
    row = await deviceRow();
    assert.equal(row.battery_health, 'dead');
    assert.equal(row.battery_percent, 2);

    await applyEventToDeviceState(
      { event_type: 'health.battery_recovered', device_id: hwId, data: { batteryPct: 96 } });
    row = await deviceRow();
    assert.equal(row.battery_health, 'ok');
    assert.equal(row.battery_percent, 96);
  });

  test('isTest events are stored but never mutate device state', async () => {
    await applyEventToDeviceState({ event_type: 'device.online', device_id: hwId, data: {} });
    await applyEventToDeviceState({ event_type: 'health.battery_recovered', device_id: hwId, data: { batteryPct: 96 } });
    const beforeRow = await deviceRow();

    const id = eid();
    await insertEvent({
      event_type: 'health.battery_dead', event_id: id, device_id: hwId,
      data: { batteryLevel: 'dead', batteryPct: 1 }, isTest: true,
      metadata: { severity: 'error' },
    });

    const { rows } = await query(
      `SELECT severity FROM device_events WHERE simkura_event_id = $1`, [id]);
    assert.equal(rows.length, 1, 'test event is stored');
    assert.equal(rows[0].severity, 'error');

    const afterRow = await deviceRow();
    assert.equal(afterRow.battery_health, beforeRow.battery_health, 'test event must not change battery_health');
    assert.equal(afterRow.battery_percent, beforeRow.battery_percent);
  });

  test('unknown event types store without device mutation', async () => {
    const beforeRow = await deviceRow();
    const id = eid();
    await insertEvent({ event_type: 'firmware.totally_new_thing', event_id: id, device_id: hwId, data: {} });
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM device_events WHERE simkura_event_id = $1`, [id]);
    assert.equal(rows[0].n, 1);
    assert.equal((await deviceRow()).door_state, beforeRow.door_state);
  });
});
