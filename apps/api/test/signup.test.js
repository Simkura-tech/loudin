'use strict';

/**
 * Signup / register-flow tests — POST /api/auth/register.
 *
 * The register flow is end-user-only (companyType is limited to 'end_user';
 * resellers are created by platform admins) and gated by the
 * platform_config 'signups.enabled' toggle (services/platform/
 * instanceSettings.js) with a SIGNUPS_DISABLED 403 when closed.
 *
 * Requires a running local PostgreSQL with the DB seeded:
 *   npm run db:reset   (from apps/api)
 *
 * Run with:
 *   npm test
 *
 * DB hygiene: the happy path creates one company + one user; both are
 * deleted in the after hook (user first — FK on company_id). The
 * platform_config 'signups.enabled' row is snapshotted in before and
 * restored EXACTLY (row re-created with its old value, or deleted if it
 * did not exist) so the shared dev DB is left untouched.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');
const { pool } = require('../database/db');

const SIGNUPS_KEY = 'signups.enabled';

const HAPPY = {
  firstName:      'Signup',
  lastName:       'Tester',
  email:          'signup-e2e@test.loudin.example',
  password:       'SignupPass123!',
  companyName:    'Signup E2E Test Co',
  companyType:    'end_user',
  terms_accepted: true,
};
// Used for attempts that must NOT create rows (gate/validation tests).
const NEVER_CREATED_EMAIL = 'signup-e2e-blocked@test.loudin.example';

/** Delete the happy-path user + company (idempotent; safe pre/post). */
async function deleteSignupRows() {
  for (const email of [HAPPY.email, NEVER_CREATED_EMAIL]) {
    const { rows } = await pool.query('SELECT id, company_id FROM users WHERE email = $1', [email]);
    for (const row of rows) {
      await pool.query('DELETE FROM users WHERE id = $1', [row.id]);
      await pool.query('DELETE FROM companies WHERE id = $1', [row.company_id]);
    }
  }
  // Companies orphaned by a crashed previous run (user insert failed after
  // company insert can't happen — same transaction — but belt & braces).
  await pool.query(
    `DELETE FROM companies c
      WHERE c.name = $1
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.company_id = c.id)`,
    [HAPPY.companyName]
  );
}

describe('Loudin API — signup flow', () => {
  // Snapshot of the platform_config row so it can be restored exactly.
  let signupsRowExisted = false;
  let signupsRowValue = null;

  before(async () => {
    await deleteSignupRows();
    const { rows } = await pool.query(
      'SELECT value FROM platform_config WHERE key = $1', [SIGNUPS_KEY]);
    signupsRowExisted = rows.length > 0;
    signupsRowValue = rows[0]?.value ?? null;
  });

  after(async () => {
    try {
      await deleteSignupRows();
      // Restore platform_config exactly as found.
      if (signupsRowExisted) {
        await pool.query(
          `INSERT INTO platform_config (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [SIGNUPS_KEY, signupsRowValue]
        );
      } else {
        await pool.query('DELETE FROM platform_config WHERE key = $1', [SIGNUPS_KEY]);
      }
    } finally {
      await pool.end();
    }
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  describe('Happy path', () => {
    test('POST /api/auth/register creates an end-user company + admin, issues a session', async () => {
      const res = await request(app).post('/api/auth/register').send(HAPPY);
      assert.equal(res.status, 201,
        `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);

      const user = res.body.user;
      assert.ok(user, 'Response missing user');
      assert.equal(user.email, HAPPY.email.toLowerCase());
      assert.equal(user.first_name, HAPPY.firstName);
      assert.equal(user.last_name, HAPPY.lastName);
      assert.equal(user.company_type, 'end_user', 'New company must be end_user');
      assert.equal(user.user_type_id, 1, 'First user must be the company Admin');
      assert.equal(user.company_name, HAPPY.companyName);
      assert.equal(user.name_auto_generated, false);
      assert.ok(Number.isInteger(user.company_id), 'Response missing company_id');
      assert.ok(res.headers['set-cookie']?.length, 'Register must issue a session cookie');

      // The created company row really is end_user + active.
      const { rows } = await pool.query(
        'SELECT company_type, status, parent_company_id FROM companies WHERE id = $1',
        [user.company_id]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].company_type, 'end_user');
      assert.equal(rows[0].status, 'active');
      assert.equal(rows[0].parent_company_id, null, 'Open signup must not attach a reseller');
    });

    test('login works with the newly registered credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: HAPPY.email, password: HAPPY.password });
      assert.equal(res.status, 200,
        `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.user?.email, HAPPY.email.toLowerCase());
      const cookie = res.headers['set-cookie'];
      assert.ok(cookie?.length, 'Login must set a session cookie');

      const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
      assert.equal(me.status, 200);
      assert.equal(me.body.user?.email, HAPPY.email.toLowerCase());
    });

    test('duplicate email → 409', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...HAPPY, companyName: 'Another Co' });
      assert.equal(res.status, 409,
        `Expected 409, got ${res.status}: ${JSON.stringify(res.body)}`);
      // No second company appeared.
      const { rows } = await pool.query(
        'SELECT COUNT(*)::int AS n FROM users WHERE email = $1', [HAPPY.email]);
      assert.equal(rows[0].n, 1, 'Duplicate register created a second user');
    });
  });

  // ── companyType is limited to end_user ──────────────────────────────────
  //
  // Actual contract (controllers/auth/auth.js): companyType is REQUIRED and
  // validated against ALLOWED_SIGNUP_COMPANY_TYPES = ['end_user']. Anything
  // else is rejected with 400 (not silently coerced).

  describe('companyType restriction', () => {
    for (const attempted of ['reseller', 'platform']) {
      test(`companyType '${attempted}' → 400, no rows created`, async () => {
        const res = await request(app)
          .post('/api/auth/register')
          .send({ ...HAPPY, email: NEVER_CREATED_EMAIL, companyType: attempted });
        assert.equal(res.status, 400,
          `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert.match(res.body.message || '', /companyType must be one of: end_user/);

        const { rows } = await pool.query(
          'SELECT 1 FROM users WHERE email = $1', [NEVER_CREATED_EMAIL]);
        assert.equal(rows.length, 0, `A ${attempted} signup created a user`);
        const { rows: comps } = await pool.query(
          `SELECT 1 FROM companies WHERE company_type = $1 AND name = $2`,
          [attempted, HAPPY.companyName]);
        assert.equal(comps.length, 0, `A ${attempted} company was created via public signup`);
      });
    }

    test('missing companyType → 400', async () => {
      const { companyType, ...rest } = HAPPY;
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...rest, email: NEVER_CREATED_EMAIL });
      assert.equal(res.status, 400);
    });
  });

  // ── SIGNUPS_DISABLED gate ───────────────────────────────────────────────

  describe('signups.enabled toggle', () => {
    test("platform_config signups.enabled='false' → 403 SIGNUPS_DISABLED", async () => {
      await pool.query(
        `INSERT INTO platform_config (key, value) VALUES ($1, 'false')
         ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW()`,
        [SIGNUPS_KEY]
      );
      try {
        // Public config endpoint reflects the toggle.
        const cfg = await request(app).get('/api/config');
        assert.equal(cfg.status, 200);
        assert.equal(cfg.body.signups_enabled, false);

        const res = await request(app)
          .post('/api/auth/register')
          .send({ ...HAPPY, email: NEVER_CREATED_EMAIL });
        assert.equal(res.status, 403,
          `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.code, 'SIGNUPS_DISABLED');

        const { rows } = await pool.query(
          'SELECT 1 FROM users WHERE email = $1', [NEVER_CREATED_EMAIL]);
        assert.equal(rows.length, 0, 'Register created a user while signups were disabled');
      } finally {
        // Restore exactly what before() found (the after hook re-restores
        // as a safety net, but do it here so later tests see open signup).
        if (signupsRowExisted) {
          await pool.query(
            `UPDATE platform_config SET value = $2, updated_at = NOW() WHERE key = $1`,
            [SIGNUPS_KEY, signupsRowValue]);
        } else {
          await pool.query('DELETE FROM platform_config WHERE key = $1', [SIGNUPS_KEY]);
        }
      }
    });

    test('after restoring the toggle, register is reachable again (409 for existing email)', async () => {
      // Uses the already-registered happy-path email: passing the gate but
      // hitting the duplicate check proves the gate is open again without
      // creating rows.
      const res = await request(app).post('/api/auth/register').send(HAPPY);
      assert.equal(res.status, 409,
        `Expected 409 (gate open, duplicate email), got ${res.status}: ${JSON.stringify(res.body)}`);
    });
  });

  // ── Validation ──────────────────────────────────────────────────────────

  describe('Invalid input → 400', () => {
    test('missing required fields → 400', async () => {
      const res = await request(app).post('/api/auth/register').send({});
      assert.equal(res.status, 400);
    });

    test('terms not accepted → 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...HAPPY, email: NEVER_CREATED_EMAIL, terms_accepted: false });
      assert.equal(res.status, 400);
      assert.match(res.body.message || '', /Terms/i);
    });

    test('short password → 400 with details', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...HAPPY, email: NEVER_CREATED_EMAIL, password: 'Ab1' });
      assert.equal(res.status, 400);
      assert.ok(Array.isArray(res.body.details) && res.body.details.length > 0,
        'Expected password-strength details');
    });

    test('password without a number → 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...HAPPY, email: NEVER_CREATED_EMAIL, password: 'OnlyLettersHere!' });
      assert.equal(res.status, 400);
    });

    test('no validation attempt created rows', async () => {
      const { rows } = await pool.query(
        'SELECT 1 FROM users WHERE email = $1', [NEVER_CREATED_EMAIL]);
      assert.equal(rows.length, 0);
    });
  });
});
