'use strict';

/**
 * Account auth tests — email verification, email change, and the
 * admin-initiated password reset.
 *
 *   POST /api/auth/verify-email/send      (self)   — send a code
 *   POST /api/auth/verify-email/confirm   (self)   — flip email_verified
 *   POST /api/me/email                     (self)   — start an email change
 *   POST /api/me/email/confirm             (self)   — commit the change
 *   POST /api/workspace/members/:id/reset-password (admin) — mail a reset code
 *
 * OTP codes are bcrypt-hashed in verification_codes and never leave the
 * server, so the positive confirm paths inject a row with a KNOWN code the
 * same way the OTP service stores one, then submit that code. This exercises
 * the endpoint's own logic (state checks + the users UPDATE) end to end.
 *
 * Requires a running local PostgreSQL seeded with `npm run db:reset`.
 * DB hygiene: every user here lives at *.acct-auth-test.loudin.example and
 * is removed in the after hook.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const app = require('../server');
const { pool } = require('../database/db');

const SEEDED_ADMIN = { email: 'admin@democorp.example', password: 'Password123!' };
const DOMAIN   = 'acct-auth-test.loudin.example';
const PASSWORD = 'TestPass123!';

async function loginAs({ email, password }) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.headers['set-cookie'];
}

async function cleanup() {
  await pool.query(
    `DELETE FROM verification_codes WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`%@${DOMAIN}`]
  );
  await pool.query(`DELETE FROM users WHERE email LIKE $1 OR pending_email LIKE $1`, [`%@${DOMAIN}`]);
}

/** Insert a login user straight into a company. role: 'admin'|'user'. */
async function insertUser({ companyId, email, role = 'user', verified = false }) {
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const { rows: [u] } = await pool.query(
    `INSERT INTO users (company_id, user_type_id, email, first_name, last_name,
                        password_hash, status, email_verified)
     VALUES ($1, $2, $3, 'Acct', 'Test', $4, 'active', $5)
     RETURNING id`,
    [companyId, role === 'admin' ? 1 : 2, email, hash, verified]
  );
  return u.id;
}

/** Store a known OTP the way the service does, so we can submit it. */
async function injectCode({ userId, purpose, destination, code }) {
  await pool.query(
    `DELETE FROM verification_codes WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose]
  );
  await pool.query(
    `INSERT INTO verification_codes (user_id, purpose, channel, destination, code_hash, expires_at)
     VALUES ($1, $2, 'email', $3, $4, NOW() + INTERVAL '10 minutes')`,
    [userId, purpose, destination, bcrypt.hashSync(code, 6)]
  );
}

describe('Loudin API — account auth', () => {
  let adminCookie, companyId;

  before(async () => {
    await cleanup();
    adminCookie = await loginAs(SEEDED_ADMIN);
    const me = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
    companyId = me.body.user.company_id;
  });

  after(async () => {
    await cleanup();
    await pool.end();
  });

  describe('Email verification', () => {
    test('a verified user is a no-op', async () => {
      // The seeded admin is email_verified in the seed.
      const res = await request(app).post('/api/auth/verify-email/send').set('Cookie', adminCookie);
      assert.equal(res.status, 200);
      assert.equal(res.body.already_verified, true);
    });

    test('send to an unverified user queues a code (console in dev)', async () => {
      const id = await insertUser({ companyId, email: `verify@${DOMAIN}`, verified: false });
      const cookie = await loginAs({ email: `verify@${DOMAIN}`, password: PASSWORD });

      const res = await request(app).post('/api/auth/verify-email/send').set('Cookie', cookie);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.already_verified, false);
      assert.equal(res.body.delivery_method, 'console');

      const row = await pool.query(
        `SELECT 1 FROM verification_codes WHERE user_id = $1 AND purpose = 'verify_email' AND used_at IS NULL`,
        [id]
      );
      assert.equal(row.rowCount, 1);
    });

    test('a wrong code is rejected; a correct code flips email_verified', async () => {
      const id = await insertUser({ companyId, email: `confirm@${DOMAIN}`, verified: false });
      const cookie = await loginAs({ email: `confirm@${DOMAIN}`, password: PASSWORD });

      const bad = await request(app).post('/api/auth/verify-email/confirm')
        .set('Cookie', cookie).send({ code: '000000' });
      assert.equal(bad.status, 400);

      await injectCode({ userId: id, purpose: 'verify_email', destination: `confirm@${DOMAIN}`, code: '424242' });
      const ok = await request(app).post('/api/auth/verify-email/confirm')
        .set('Cookie', cookie).send({ code: '424242' });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.email_verified, true);

      const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
      assert.equal(me.body.user.email_verified, true);
    });
  });

  describe('Email change', () => {
    let cookie, userId;
    const current = `change-me@${DOMAIN}`;
    const next    = `changed@${DOMAIN}`;

    before(async () => {
      userId = await insertUser({ companyId, email: current, verified: true });
      cookie = await loginAs({ email: current, password: PASSWORD });
    });

    test('wrong current password is rejected', async () => {
      const res = await request(app).post('/api/me/email')
        .set('Cookie', cookie).send({ new_email: next, current_password: 'wrong' });
      assert.equal(res.status, 401);
    });

    test('an address already in use is a conflict', async () => {
      const res = await request(app).post('/api/me/email')
        .set('Cookie', cookie).send({ new_email: SEEDED_ADMIN.email, current_password: PASSWORD });
      assert.equal(res.status, 409);
    });

    test('a valid request parks pending_email and sends a code', async () => {
      const res = await request(app).post('/api/me/email')
        .set('Cookie', cookie).send({ new_email: next, current_password: PASSWORD });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.pending_email, next);
      assert.equal(res.body.delivery_method, 'console');

      const row = await pool.query('SELECT pending_email FROM users WHERE id = $1', [userId]);
      assert.equal(row.rows[0].pending_email, next);
    });

    test('a wrong code is rejected; a correct code commits the change', async () => {
      const bad = await request(app).post('/api/me/email/confirm')
        .set('Cookie', cookie).send({ code: '000000' });
      assert.equal(bad.status, 400);

      await injectCode({ userId, purpose: 'verify_email_change', destination: next, code: '515151' });
      const ok = await request(app).post('/api/me/email/confirm')
        .set('Cookie', cookie).send({ code: '515151' });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.user.email, next);
      assert.equal(ok.body.user.email_verified, true);

      const row = await pool.query('SELECT email, pending_email FROM users WHERE id = $1', [userId]);
      assert.equal(row.rows[0].email, next);
      assert.equal(row.rows[0].pending_email, null);
    });

    test('confirm with nothing pending is rejected', async () => {
      const res = await request(app).post('/api/me/email/confirm')
        .set('Cookie', cookie).send({ code: '123456' });
      assert.equal(res.status, 400);
    });
  });

  describe('Admin-initiated password reset', () => {
    let memberId;

    before(async () => {
      memberId = await insertUser({ companyId, email: `reset-target@${DOMAIN}`, verified: true });
    });

    test('requires an admin session', async () => {
      const anon = await request(app).post(`/api/workspace/members/${memberId}/reset-password`);
      assert.equal(anon.status, 401);
    });

    test('an admin triggers a reset code to the member', async () => {
      const res = await request(app)
        .post(`/api/workspace/members/${memberId}/reset-password`).set('Cookie', adminCookie);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.ok, true);
      assert.equal(res.body.delivery_method, 'console');

      const row = await pool.query(
        `SELECT 1 FROM verification_codes WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL`,
        [memberId]
      );
      assert.equal(row.rowCount, 1, 'a password_reset code was issued for the target');
    });

    test('a user outside the workspace is 404', async () => {
      const res = await request(app)
        .post('/api/workspace/members/99999999/reset-password').set('Cookie', adminCookie);
      assert.equal(res.status, 404);
      assert.equal(res.body.code, 'MEMBER_NOT_FOUND');
    });
  });
});
