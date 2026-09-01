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

  // ── Command correlation (migration 084 / services/access/commandAck) ──────

  /** First active credential junction on the test device, with its stamps
   *  so the test can put them back. */
  async function pushedJunction() {
    const { rows: [j] } = await query(
      `SELECT dc.id, dc.submitted_at, dc.synced_at, dc.simkura_command_id
         FROM device_credentials dc
         JOIN devices d ON d.id = dc.device_id
        WHERE d.device_id = $1 AND dc.deleted_at IS NULL
        ORDER BY dc.id LIMIT 1`, [hwId]);
    assert.ok(j, 'seed attaches at least one credential to the device');
    return j;
  }
  const stampSubmitted = (id, ref) => query(
    `UPDATE device_credentials
        SET submitted_at = NOW(), synced_at = NULL, simkura_command_id = $2
      WHERE id = $1`, [id, ref]);
  const junctionRow = async (id) => (await query(
    `SELECT submitted_at, synced_at, simkura_command_id FROM device_credentials WHERE id = $1`, [id])).rows[0];
  const restore = (j) => query(
    `UPDATE device_credentials
        SET submitted_at = $2, synced_at = $3, simkura_command_id = $4
      WHERE id = $1`, [j.id, j.submitted_at, j.synced_at, j.simkura_command_id]);

  test('command.sent with a matching commandRef stamps synced_at; command.failed rolls the row back', async () => {
    const j = await pushedJunction();
    try {
      const ref = `cmd_test_${Date.now()}`;
      await stampSubmitted(j.id, ref);

      // A dashboard test event must never confirm a real push.
      await insertEvent({ event_type: 'command.sent', event_id: eid(), device_id: hwId, isTest: true,
        data: { commandRef: ref, operation: 'credentials.add' } });
      assert.equal((await junctionRow(j.id)).synced_at, null, 'isTest must not stamp');

      // Shape B (device-side confirmation) carries no ref — liveness only.
      await insertEvent({ event_type: 'command.sent', event_id: eid(), device_id: hwId,
        data: { code: 1, timestamp: new Date().toISOString() } });
      assert.equal((await junctionRow(j.id)).synced_at, null, 'no ref, no stamp');

      // A ref for some other command leaves this row alone.
      await insertEvent({ event_type: 'command.sent', event_id: eid(), device_id: hwId,
        data: { commandRef: `${ref}_other`, operation: 'credentials.add' } });
      assert.equal((await junctionRow(j.id)).synced_at, null, 'unrelated ref, no stamp');

      // Shape A (queue dispatch) with the matching ref → delivered.
      await insertEvent({ event_type: 'command.sent', event_id: eid(), device_id: hwId,
        data: { commandId: 1234, commandType: 'bwCred', operation: 'credentials.add', commandRef: ref } });
      const sent = await junctionRow(j.id);
      assert.ok(sent.synced_at, 'matching commandRef stamps synced_at');
      assert.equal(sent.simkura_command_id, ref, 'the id is kept for the audit trail');

      // A later failure on a fresh submission → back to "pending add".
      const ref2 = `${ref}_retry`;
      await stampSubmitted(j.id, ref2);
      await insertEvent({ event_type: 'command.failed', event_id: eid(), device_id: hwId,
        data: { commandRef: ref2, operation: 'credentials.add', error: 'Device offline; retries exhausted' } });
      const failed = await junctionRow(j.id);
      assert.equal(failed.submitted_at, null);
      assert.equal(failed.synced_at, null);
      assert.equal(failed.simkura_command_id, null);
    } finally {
      await restore(j);
    }
  });

  test('reconcile resolves outstanding command ids against the v2 command records', async () => {
    const { reconcile } = require('../services/access/commandAck');
    const j = await pushedJunction();
    const notFound = () => { throw Object.assign(new Error('not found'), { response: { status: 404 } }); };
    try {
      // Nothing outstanding → no upstream call at all.
      await query(`UPDATE device_credentials SET submitted_at = NULL, synced_at = NULL, simkura_command_id = NULL WHERE id = $1`, [j.id]);
      const idle = await reconcile(hwId, { listCommands: async () => { throw new Error('must not be called'); } });
      assert.deepEqual(idle, { pending: 0, sent: 0, failed: 0 });

      // Record on the first history page as 'sent' → delivered.
      const ref = `cmd_test_${Date.now()}`;
      await stampSubmitted(j.id, ref);
      const r1 = await reconcile(hwId, {
        listCommands: async () => [{ id: 'cmd_someone_else', status: 'sent' }, { id: ref, status: 'sent' }],
        getCommand:   async () => notFound(),
      });
      assert.equal(r1.sent, 1);
      assert.ok((await junctionRow(j.id)).synced_at);

      // Still in flight → left alone.
      await stampSubmitted(j.id, ref);
      const r2 = await reconcile(hwId, { listCommands: async () => [{ id: ref, status: 'queued' }], getCommand: async () => notFound() });
      assert.deepEqual(r2, { pending: 1, sent: 0, failed: 0 });
      assert.equal((await junctionRow(j.id)).synced_at, null);

      // Not on the page, individual lookup says expired → rolled back for re-send.
      const r3 = await reconcile(hwId, {
        listCommands: async () => [],
        getCommand:   async (_hw, id) => ({ id, status: 'expired' }),
      });
      assert.equal(r3.failed, 1);
      assert.equal((await junctionRow(j.id)).submitted_at, null);

      // Unknown upstream (404) → untouched, never re-sent on a guess.
      await stampSubmitted(j.id, ref);
      const r4 = await reconcile(hwId, { listCommands: async () => [], getCommand: async () => notFound() });
      assert.deepEqual(r4, { pending: 1, sent: 0, failed: 0 });
      assert.ok((await junctionRow(j.id)).submitted_at);
    } finally {
      await restore(j);
    }
  });
});
