'use strict';

/**
 * Extension seam — apps/api/extensions/.
 *
 * Boots the app with EXTENSIONS_DIR pointed at test-fixtures/extensions and
 * verifies each hook: routes, the pre-body-parser slot, authGate, and
 * per-extension migrations. Also pins the default: a stock checkout loads
 * zero extensions.
 *
 * Requires a running local PostgreSQL with the DB seeded (npm run db:reset).
 */

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const request = require('supertest');

const FIXTURES = path.join(__dirname, '..', 'test-fixtures', 'extensions');

// Must be set before ../server is required — load() runs at require time.
// node --test gives each test file its own process, so this doesn't leak.
process.env.EXTENSIONS_DIR = FIXTURES;

const app = require('../server');
const { pool } = require('../database/db');
const extensions = require('../extensions');

describe('Extensions', () => {
  after(async () => {
    await pool.query('DROP TABLE IF EXISTS ext_sample_fixture');
    await pool.query(`DELETE FROM migrations WHERE name LIKE 'sample/%'`);
    await pool.end();
  });

  test('a stock checkout ships no extensions', () => {
    const shipped = extensions.discover(path.join(__dirname, '..', 'extensions'));
    assert.deepEqual(shipped, []);
  });

  test('discover() finds the fixture without loading its code', () => {
    const found = extensions.discover(FIXTURES);
    assert.deepEqual(found.map((e) => e.name), ['sample']);
  });

  test('routes() mounts extension routes', async () => {
    const res = await request(app).get('/api/ext-sample/hello');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { hello: 'extension' });
  });

  test('core routes win over an extension claiming the same path', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.body.status, 'ok');
  });

  test('unknown paths still reach the core 404 handler', async () => {
    const res = await request(app).get('/api/ext-sample/nope');
    assert.equal(res.status, 404);
  });

  test('preBody() runs before the JSON parser — handler sees raw bytes', async () => {
    const payload = JSON.stringify({ signed: true });
    const res = await request(app)
      .post('/api/ext-sample/raw')
      .set('Content-Type', 'application/json')
      .send(payload);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { raw: true, bytes: Buffer.byteLength(payload) });
  });

  describe('authGate', () => {
    async function login() {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'platform-admin@loudin.com', password: 'Password123!' });
      assert.equal(res.status, 200);
      return res.headers['set-cookie'];
    }

    test('passes an authenticated request through by default', async () => {
      const res = await request(app)
        .get('/api/ext-sample/private')
        .set('Cookie', await login());
      assert.equal(res.status, 200);
      assert.ok(res.body.user_id, 'extension route sees req.user');
    });

    test('can block an authenticated request on a core route', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('Cookie', await login())
        .set('x-sample-gate', 'block');
      assert.equal(res.status, 402);
      assert.equal(res.body.error_code, 'SAMPLE_GATE');
    });

    test('never runs for unauthenticated requests — 401 comes first', async () => {
      const res = await request(app).get('/api/me').set('x-sample-gate', 'block');
      assert.equal(res.status, 401);
    });
  });

  describe('onEvent', () => {
    const events = require('../integrations/events');
    const sample = require(path.join(FIXTURES, 'sample'));
    const settle = () => new Promise((resolve) => setImmediate(resolve));

    test('receives lifecycle events in-process, with the full envelope', async () => {
      await events.emit('device.added', { company: { id: 1, type: 'end_user' }, device: { device_id: 'X1' } });
      await settle();
      const seen = sample.seenEvents.find((e) => e.type === 'device.added');
      assert.ok(seen, 'extension saw the event');
      assert.ok(seen.event_id && seen.occurred_at, 'envelope fields present');
      assert.equal(seen.device.device_id, 'X1');
    });

    test('a throwing listener never breaks the emitter', async () => {
      await assert.doesNotReject(events.emit('test.throw', {}));
      await settle();
    });
  });

  test('migrate.js runs extension migrations, namespaced by extension', async () => {
    const run = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', 'database', 'scripts', 'migrate.js')],
      { env: { ...process.env, EXTENSIONS_DIR: FIXTURES }, encoding: 'utf8' },
    );
    assert.equal(run.status, 0, run.stderr);

    const { rows } = await pool.query(
      `SELECT name FROM migrations WHERE name LIKE 'sample/%'`,
    );
    assert.deepEqual(rows.map((r) => r.name), ['sample/001_ext_sample.sql']);

    const table = await pool.query(`SELECT to_regclass('ext_sample_fixture') AS t`);
    assert.ok(table.rows[0].t, 'fixture table was created');
  });
});
