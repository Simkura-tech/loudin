'use strict';

/**
 * External API — /api/external/ping.
 *
 * Verifies the API-key auth surface end to end: bearer auth, scope
 * enforcement, revocation, and that a key can never be used where a
 * session is expected (and vice versa isn't tested here — sessions on
 * /api/external are just missing bearers, covered by the 401 cases).
 *
 * Requires a running local PostgreSQL with the DB seeded (npm run db:reset).
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');
const { pool } = require('../database/db');
const apiKey = require('../services/platform/apiKey');

const TEST_PREFIX = 'test-external-ping-';

describe('External API — /api/external/ping', () => {
  let pingKey;     // scopes: ['ping']
  let scopeless;   // scopes: []
  let revokedKey;  // scopes: ['ping'], revoked before use

  before(async () => {
    pingKey   = await apiKey.createKey({ name: `${TEST_PREFIX}ok`,       scopes: ['ping'] });
    scopeless = await apiKey.createKey({ name: `${TEST_PREFIX}noscope`,  scopes: [] });
    revokedKey = await apiKey.createKey({ name: `${TEST_PREFIX}revoked`, scopes: ['ping'] });
    await apiKey.revokeKey(revokedKey.id);
  });

  after(async () => {
    await pool.query('DELETE FROM api_keys WHERE name LIKE $1', [`${TEST_PREFIX}%`]);
    await pool.end();
  });

  test('no Authorization header → 401', async () => {
    const res = await request(app).get('/api/external/ping');
    assert.equal(res.status, 401);
  });

  test('malformed / unknown token → 401', async () => {
    const res = await request(app)
      .get('/api/external/ping')
      .set('Authorization', 'Bearer ldn_live_notARealKey');
    assert.equal(res.status, 401);
  });

  test('revoked key → 401', async () => {
    const res = await request(app)
      .get('/api/external/ping')
      .set('Authorization', `Bearer ${revokedKey.token}`);
    assert.equal(res.status, 401);
  });

  test('valid key without the ping scope → 403', async () => {
    const res = await request(app)
      .get('/api/external/ping')
      .set('Authorization', `Bearer ${scopeless.token}`);
    assert.equal(res.status, 403);
    assert.match(res.body.message, /"ping" scope/);
  });

  test('valid key with ping scope → 200 with key metadata', async () => {
    const res = await request(app)
      .get('/api/external/ping')
      .set('Authorization', `Bearer ${pingKey.token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.name, `${TEST_PREFIX}ok`);
    assert.equal(res.body.prefix, pingKey.prefix);
    assert.deepEqual(res.body.scopes, ['ping']);
    assert.ok(!Number.isNaN(Date.parse(res.body.time)), 'time is ISO-8601');
    // The response must never echo the token or hash.
    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes(pingKey.token), 'plaintext token leaked');
  });

  test('a key whose prefix contains underscores still verifies', async () => {
    // Regression: the url-safe alphabet includes `_`, and verifyToken used
    // to split on the first `_`, truncating ~12% of prefixes into permanent
    // 401s. Craft the worst case deterministically.
    const bcrypt = require('bcryptjs');
    const prefix = 'a_b_c_d_';
    const token = `ldn_live_${prefix}_secretsecretsecret123456`;
    const hash = await bcrypt.hash(token, 10);
    await pool.query(
      `INSERT INTO api_keys (name, prefix, key_hash, scopes) VALUES ($1, $2, $3, $4)`,
      [`${TEST_PREFIX}underscore`, prefix, hash, ['ping']],
    );
    const res = await request(app)
      .get('/api/external/ping')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.prefix, prefix);
  });

  test('a user session cookie is not accepted as an API key', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'platform-admin@loudin.com', password: 'Password123!' });
    assert.equal(login.status, 200);
    const res = await request(app)
      .get('/api/external/ping')
      .set('Cookie', login.headers['set-cookie']);
    assert.equal(res.status, 401);
  });
});
