'use strict';

/**
 * Smoke tests — validates the full API surface responds correctly.
 *
 * Requires a running local PostgreSQL with the DB seeded:
 *   npm run db:reset   (from apps/api)
 *
 * Run with:
 *   npm test
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');
const { pool } = require('../database/db');

const SEEDED = {
  platform: { email: 'platform-admin@loudin.com', password: 'Password123!' },
  endUser:  { email: 'admin@democorp.example',      password: 'Password123!' },
};

async function loginAs({ email, password }) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  assert.equal(
    res.status, 200,
    `Login failed for ${email} — HTTP ${res.status}: ${JSON.stringify(res.body)}`,
  );
  const cookie = res.headers['set-cookie'];
  assert.ok(cookie?.length, `No set-cookie returned for ${email}`);
  return cookie;
}

describe('Loudin API — smoke tests', () => {
  let platformCookie, endUserCookie;

  before(async () => {
    [platformCookie, endUserCookie] = await Promise.all([
      loginAs(SEEDED.platform),
      loginAs(SEEDED.endUser),
    ]);
  });

  after(async () => {
    await pool.end();
  });

  // ── Public endpoints ────────────────────────────────────────────────────

  describe('Public', () => {
    test('GET /health → 200', async () => {
      const res = await request(app).get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
    });

    test('GET /api → 200', async () => {
      const res = await request(app).get('/api');
      assert.equal(res.status, 200);
    });

    test('GET /api/health/simkura → 200 with connected field', async () => {
      const res = await request(app).get('/api/health/simkura');
      assert.equal(res.status, 200);
      assert.ok('connected' in res.body, 'Response missing "connected" field');
    });

    test('GET /nonexistent-path → 404', async () => {
      const res = await request(app).get('/this-path-does-not-exist');
      assert.equal(res.status, 404);
    });
  });

  // ── Google OAuth endpoints ──────────────────────────────────────────────
  //
  // Full round-trip requires real Google credentials and a browser — not
  // feasible in a smoke test. What we can cover:
  //   - /google redirects (302) whether configured or not
  //   - /google/callback rejects bad/missing state without 5xx-ing

  describe('Google OAuth', () => {
    test('GET /api/auth/google → 302 redirect', async () => {
      // Redirects to Google when configured, or to /login?error= when not.
      // Either way it must be a redirect, never a 5xx.
      const res = await request(app).get('/api/auth/google').redirects(0);
      assert.equal(res.status, 302, `Expected 302, got ${res.status}`);
      assert.ok(res.headers.location, 'Expected a Location header');
    });

    test('GET /api/auth/google/callback with no state → redirect with error', async () => {
      const res = await request(app)
        .get('/api/auth/google/callback?code=fakecode&state=fakestate')
        .redirects(0);
      assert.equal(res.status, 302, `Expected 302, got ${res.status}`);
      assert.ok(
        res.headers.location?.includes('error='),
        'Expected location to contain error= param',
      );
    });

    test('GET /api/auth/google/callback with oauth error param → redirect with error', async () => {
      const res = await request(app)
        .get('/api/auth/google/callback?error=access_denied')
        .redirects(0);
      assert.equal(res.status, 302, `Expected 302, got ${res.status}`);
      assert.ok(
        res.headers.location?.includes('error='),
        'Expected location to contain error= param',
      );
    });
  });

  // ── Auth flow ───────────────────────────────────────────────────────────

  describe('Auth', () => {
    test('POST /api/auth/login with bad creds → 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrongpassword' });
      assert.equal(res.status, 401);
    });

    test('POST /api/auth/login missing body → 400', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      assert.ok(res.status >= 400 && res.status < 500, `Expected 4xx, got ${res.status}`);
    });

    test('GET /api/auth/me without session → 401', async () => {
      const res = await request(app).get('/api/auth/me');
      assert.equal(res.status, 401);
    });

    test('GET /api/auth/me with end-user session → 200', async () => {
      const res = await request(app).get('/api/auth/me').set('Cookie', endUserCookie);
      assert.equal(res.status, 200);
      assert.ok(res.body.user?.email, 'Response missing user.email field');
    });

    test('GET /api/auth/me with platform session → 200', async () => {
      const res = await request(app).get('/api/auth/me').set('Cookie', platformCookie);
      assert.equal(res.status, 200);
    });
  });

  // ── Auth gate — unauthenticated requests must be rejected ───────────────

  describe('Auth gate (no session → 401)', () => {
    const gated = [
      ['GET',   '/api/workspace'],
      ['GET',   '/api/people'],
      ['GET',   '/api/people-groups'],
      ['GET',   '/api/credentials'],
      ['GET',   '/api/devices'],
      ['GET',   '/api/companies'],
      ['GET',   '/api/platform/devices'],
      ['GET',   '/api/platform/api-keys'],
      ['GET',   '/api/audit'],
    ];

    for (const [method, path] of gated) {
      test(`${method} ${path} → 401`, async () => {
        const res = await request(app)[method.toLowerCase()](path);
        assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
      });
    }
  });

  // ── End-user admin ──────────────────────────────────────────────────────

  describe('End-user admin', () => {
    test('GET /api/workspace → 200', async () => {
      const res = await request(app).get('/api/workspace').set('Cookie', endUserCookie);
      assert.equal(res.status, 200);
    });

    test('GET /api/people → 200', async () => {
      const res = await request(app).get('/api/people').set('Cookie', endUserCookie);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.people), 'Expected res.body.people to be an array');
    });

    test('GET /api/people-groups → 200', async () => {
      const res = await request(app).get('/api/people-groups').set('Cookie', endUserCookie);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.groups), 'Expected res.body.groups to be an array');
    });

    test('GET /api/credentials → 200', async () => {
      const res = await request(app).get('/api/credentials').set('Cookie', endUserCookie);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.credentials), 'Expected res.body.credentials to be an array');
    });

    test('GET /api/devices → 200', async () => {
      const res = await request(app).get('/api/devices').set('Cookie', endUserCookie);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.devices), 'Expected res.body.devices to be an array');
    });

    test('POST /api/devices/:hwId/commands lock.configure → 400 for a reader technology the board lacks', async () => {
      // The board catalog is the authority: the seeded SB6 catalog row lists
      // prox, smartcard, nfc — ble must be refused before any Simkura call,
      // even though the seeded device rows' own tier may say otherwise.
      const list = await request(app).get('/api/devices').set('Cookie', endUserCookie);
      const hwId = list.body.devices[0].device_id;
      const res = await request(app)
        .post(`/api/devices/${encodeURIComponent(hwId)}/commands`)
        .set('Cookie', endUserCookie)
        .send({ command: 'lock.configure', payload: { readerTechnology: 'ble' } });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /not supported by Simkura SB6/);
      assert.match(res.body.message, /prox, smartcard, nfc/);
    });

    test('device holidays: create → listed with sync trail → counted as pending → delete', async () => {
      const list = await request(app).get('/api/devices').set('Cookie', endUserCookie);
      const deviceId = list.body.devices[0].id;
      const base = `/api/devices/${deviceId}/holidays`;

      // Custom-hours mode has no firmware equivalent and is refused.
      const bad = await request(app).post(base).set('Cookie', endUserCookie)
        .send({ holiday_name: 'Nope', start_datetime: '2026-12-24T00:00:00Z', end_datetime: '2026-12-26T00:00:00Z', access_mode: 'restricted' });
      assert.equal(bad.status, 400);

      const created = await request(app).post(base).set('Cookie', endUserCookie)
        .send({ holiday_name: 'Christmas', start_datetime: '2026-12-24T18:00:00Z', end_datetime: '2026-12-26T08:00:00Z', access_mode: 'lockdown' });
      assert.equal(created.status, 201);
      const h = created.body.holiday;
      assert.equal(h.access_mode, 'lockdown');
      assert.equal(h.start_datetime, '2026-12-24T18:00:00.000Z');
      assert.equal(h.submitted_at, null);

      const listed = await request(app).get(base).set('Cookie', endUserCookie);
      assert.equal(listed.status, 200);
      assert.ok(listed.body.holidays.some((x) => x.id === h.id), 'created holiday is listed');

      const detail = await request(app).get(`/api/devices/${deviceId}`).set('Cookie', endUserCookie);
      assert.equal(detail.body.sync.holidays.add, 1);
      assert.equal(detail.body.sync.has_pending, true);

      const edited = await request(app).patch(`${base}/${h.id}`).set('Cookie', endUserCookie)
        .send({ access_mode: 'open' });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.holiday.access_mode, 'open');

      const removed = await request(app).delete(`${base}/${h.id}`).set('Cookie', endUserCookie);
      assert.equal(removed.status, 204);
      const after = await request(app).get(base).set('Cookie', endUserCookie);
      assert.ok(!after.body.holidays.some((x) => x.id === h.id), 'deleted holiday is gone');
    });

    test('GET /api/devices → each device carries its hardware profile and catalog board', async () => {
      const res = await request(app).get('/api/devices').set('Cookie', endUserCookie);
      assert.equal(res.status, 200);
      assert.ok(res.body.devices.length > 0, 'seed should claim the sandbox devices');
      for (const d of res.body.devices) {
        // Migration 085 columns are always present on the projection.
        for (const k of ['battery_health', 'manufacturer', 'hardware_version', 'num_doors', 'power_type',
                         'connectivity_transport', 'deployed', 'capabilities', 'features',
                         'supported', 'card_formats', 'board']) {
          assert.ok(k in d, `device.${k} missing from projection`);
        }
        // Seeded SB6 rows resolve to the catalog fallback row from migration 086.
        assert.equal(d.device_type, 'sb6');
        assert.equal(d.board?.display_name, 'Simkura SB6');
        assert.ok(d.board.capabilities.includes('lock-control'));
        assert.equal(d.board.features['door-position-sensing'], false);
      }
    });

  });

  // ── Platform admin ──────────────────────────────────────────────────────

  describe('Platform admin', () => {
    test('GET /api/workspace → 200', async () => {
      const res = await request(app).get('/api/workspace').set('Cookie', platformCookie);
      assert.equal(res.status, 200);
    });

    test('GET /api/companies → 200', async () => {
      const res = await request(app).get('/api/companies').set('Cookie', platformCookie);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.companies), 'Expected res.body.companies to be an array');
    });

    test('feature flags: platform admin turns holidays off → hidden from /api/features and refused on device routes', async () => {
      const before = await request(app).get('/api/features').set('Cookie', endUserCookie);
      assert.equal(before.status, 200);
      assert.equal(before.body.features.holidays, true);

      // Only platform admins may write.
      const denied = await request(app).put('/api/platform/features').set('Cookie', endUserCookie)
        .send({ features: { holidays: false } });
      assert.equal(denied.status, 403);

      const off = await request(app).put('/api/platform/features').set('Cookie', platformCookie)
        .send({ features: { holidays: false } });
      assert.equal(off.status, 200);
      assert.equal(off.body.features.find((f) => f.key === 'holidays').enabled, false);

      const list = await request(app).get('/api/devices').set('Cookie', endUserCookie);
      const deviceId = list.body.devices[0].id;
      const refused = await request(app).get(`/api/devices/${deviceId}/holidays`).set('Cookie', endUserCookie);
      assert.equal(refused.status, 403);
      assert.equal(refused.body.code, 'feature_disabled');

      // Schedules untouched, and unknown keys are rejected.
      const shifts = await request(app).get(`/api/devices/${deviceId}/shifts`).set('Cookie', endUserCookie);
      assert.equal(shifts.status, 200);
      const bad = await request(app).put('/api/platform/features').set('Cookie', platformCookie)
        .send({ features: { teleport: false } });
      assert.equal(bad.status, 400);

      // Restore.
      const on = await request(app).put('/api/platform/features').set('Cookie', platformCookie)
        .send({ features: { holidays: true } });
      assert.equal(on.status, 200);
      const after = await request(app).get(`/api/devices/${deviceId}/holidays`).set('Cookie', endUserCookie);
      assert.equal(after.status, 200);
    });

    test('GET /api/platform/devices → 200', async () => {
      const res = await request(app).get('/api/platform/devices').set('Cookie', platformCookie);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.devices), 'Expected res.body.devices to be an array');
    });

    test('GET /api/platform/api-keys → 200', async () => {
      const res = await request(app).get('/api/platform/api-keys').set('Cookie', platformCookie);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.keys), 'Expected res.body.keys to be an array');
    });

    test('GET /api/audit → 200', async () => {
      const res = await request(app).get('/api/audit').set('Cookie', platformCookie);
      assert.equal(res.status, 200);
    });

  });

});
