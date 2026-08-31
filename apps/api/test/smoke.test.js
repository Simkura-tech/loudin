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
  reseller: { email: 'admin@acme-dist.example',    password: 'Password123!' },
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
  let platformCookie, resellerCookie, endUserCookie;

  before(async () => {
    [platformCookie, resellerCookie, endUserCookie] = await Promise.all([
      loginAs(SEEDED.platform),
      loginAs(SEEDED.reseller),
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

    test('GET /api/auth/me with reseller session → 200', async () => {
      const res = await request(app).get('/api/auth/me').set('Cookie', resellerCookie);
      assert.equal(res.status, 200);
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
      ['GET',   '/api/reseller/customers'],
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

  });

  // ── Reseller admin ──────────────────────────────────────────────────────

  describe('Reseller admin', () => {
    test('GET /api/workspace → 200', async () => {
      const res = await request(app).get('/api/workspace').set('Cookie', resellerCookie);
      assert.equal(res.status, 200);
    });

    test('GET /api/reseller/customers → 200', async () => {
      const res = await request(app).get('/api/reseller/customers').set('Cookie', resellerCookie);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.customers), 'Expected res.body.customers to be an array');
    });

    test('GET /api/reseller/devices → 200', async () => {
      const res = await request(app).get('/api/reseller/devices').set('Cookie', resellerCookie);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.devices), 'Expected res.body.devices to be an array');
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
