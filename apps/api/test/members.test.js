'use strict';

/**
 * Member management tests — what an Admin can do to an existing login user.
 *
 *   PATCH  /api/workspace/members/:id   { role?, status? }
 *   DELETE /api/workspace/members/:id
 *
 * Plus the per-request liveness check in middleware/core/auth.js: a
 * deactivated or removed user's existing session must fail on its next call.
 *
 * Requires a running local PostgreSQL with the DB seeded (npm run db:reset).
 *
 * DB hygiene: every user this file creates has a *.members-test.loudin.example
 * address; the after hook deletes those users and invites.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');
const { pool } = require('../database/db');

const SEEDED = {
  endUser:      { email: 'admin@democorp.example',  password: 'Password123!' },
  otherEndUser: { email: 'admin@brookline.example', password: 'Password123!' },
};
const DOMAIN = 'members-test.loudin.example';
const COLLEAGUE = `colleague@${DOMAIN}`;
const PASSWORD  = 'MemberPass123!';

async function loginAs({ email, password }) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.headers['set-cookie'];
}

async function cleanup() {
  await pool.query(`DELETE FROM user_invites WHERE email LIKE $1`, [`%@${DOMAIN}`]);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%@${DOMAIN}`]);
}

/** Invite + accept an address into the admin's workspace; returns the new user's id. */
async function addColleague(adminCookie, { email, role }) {
  const inv = await request(app)
    .post('/api/workspace/invites').set('Cookie', adminCookie)
    .send({ email, role, first_name: 'Col', last_name: 'League' });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  const token = inv.body.accept_url.split('/invite/')[1];
  const acc = await request(app)
    .post(`/api/auth/invites/${token}/accept`)
    .send({ password: PASSWORD, terms_accepted: true });
  assert.equal(acc.status, 201, JSON.stringify(acc.body));
  return acc.body.user.id;
}

describe('Loudin API — member management', () => {
  let adminCookie, otherAdminCookie, adminId, colleagueId;

  before(async () => {
    await cleanup();
    [adminCookie, otherAdminCookie] = await Promise.all([
      loginAs(SEEDED.endUser),
      loginAs(SEEDED.otherEndUser),
    ]);
    const me = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
    adminId = me.body.user.id;
    colleagueId = await addColleague(adminCookie, { email: COLLEAGUE, role: 'user' });
  });

  after(async () => {
    await cleanup();
    await pool.end();
  });

  describe('Changing role', () => {
    test('requires an admin session', async () => {
      const anon = await request(app).patch(`/api/workspace/members/${colleagueId}`).send({ role: 'admin' });
      assert.equal(anon.status, 401);

      const colleagueCookie = await loginAs({ email: COLLEAGUE, password: PASSWORD });
      const asUser = await request(app)
        .patch(`/api/workspace/members/${adminId}`).set('Cookie', colleagueCookie)
        .send({ role: 'user' });
      assert.equal(asUser.status, 403);
    });

    test('rejects an unknown role, status, or an empty body', async () => {
      const badRole = await request(app)
        .patch(`/api/workspace/members/${colleagueId}`).set('Cookie', adminCookie)
        .send({ role: 'owner' });
      assert.equal(badRole.status, 400);
      assert.equal(badRole.body.code, 'INVALID_ROLE');

      const badStatus = await request(app)
        .patch(`/api/workspace/members/${colleagueId}`).set('Cookie', adminCookie)
        .send({ status: 'suspended' });
      assert.equal(badStatus.status, 400);
      assert.equal(badStatus.body.code, 'INVALID_STATUS');

      const empty = await request(app)
        .patch(`/api/workspace/members/${colleagueId}`).set('Cookie', adminCookie)
        .send({});
      assert.equal(empty.status, 400);
      assert.equal(empty.body.code, 'NOTHING_TO_UPDATE');
    });

    test('promotes to admin and the new role applies on the next request', async () => {
      const colleagueCookie = await loginAs({ email: COLLEAGUE, password: PASSWORD });
      const beforeRes = await request(app).get('/api/workspace/members').set('Cookie', colleagueCookie);
      assert.equal(beforeRes.status, 403, 'a User cannot list members');

      const res = await request(app)
        .patch(`/api/workspace/members/${colleagueId}`).set('Cookie', adminCookie)
        .send({ role: 'admin' });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.member.role, 'admin');
      assert.equal(res.body.member.user_type_id, 1);

      // Same cookie (token still says user_type_id=2) — the live row wins.
      const afterRes = await request(app).get('/api/workspace/members').set('Cookie', colleagueCookie);
      assert.equal(afterRes.status, 200, 'promotion takes effect without a new login');
    });

    test('an admin cannot change their own role', async () => {
      const res = await request(app)
        .patch(`/api/workspace/members/${adminId}`).set('Cookie', adminCookie)
        .send({ role: 'user' });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'SELF_TARGET');
    });

    test('another tenant gets 404', async () => {
      const res = await request(app)
        .patch(`/api/workspace/members/${colleagueId}`).set('Cookie', otherAdminCookie)
        .send({ role: 'user' });
      assert.equal(res.status, 404);
      assert.equal(res.body.code, 'MEMBER_NOT_FOUND');
    });

    test('demotes back to user', async () => {
      const res = await request(app)
        .patch(`/api/workspace/members/${colleagueId}`).set('Cookie', adminCookie)
        .send({ role: 'user' });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.member.role, 'user');
    });
  });

  describe('Deactivating', () => {
    let colleagueCookie;

    test('deactivation blocks login and ends the live session', async () => {
      colleagueCookie = await loginAs({ email: COLLEAGUE, password: PASSWORD });

      const res = await request(app)
        .patch(`/api/workspace/members/${colleagueId}`).set('Cookie', adminCookie)
        .send({ status: 'inactive' });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.member.status, 'inactive');

      const live = await request(app).get('/api/auth/me').set('Cookie', colleagueCookie);
      assert.equal(live.status, 401);
      assert.equal(live.body.code, 'ACCOUNT_DISABLED');

      const login = await request(app).post('/api/auth/login').send({ email: COLLEAGUE, password: PASSWORD });
      assert.notEqual(login.status, 200, 'inactive users cannot sign in');
    });

    test('the listing shows the status', async () => {
      const res = await request(app).get('/api/workspace/members').set('Cookie', adminCookie);
      assert.equal(res.status, 200);
      const row = res.body.users.find((u) => u.id === colleagueId);
      assert.equal(row.status, 'inactive');
    });

    test('reactivation lets them back in', async () => {
      const res = await request(app)
        .patch(`/api/workspace/members/${colleagueId}`).set('Cookie', adminCookie)
        .send({ status: 'active' });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.member.status, 'active');

      const cookie = await loginAs({ email: COLLEAGUE, password: PASSWORD });
      const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
      assert.equal(me.status, 200);
    });

    test('an admin cannot deactivate themselves', async () => {
      const res = await request(app)
        .patch(`/api/workspace/members/${adminId}`).set('Cookie', adminCookie)
        .send({ status: 'inactive' });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'SELF_TARGET');
    });
  });

  describe('Removing', () => {
    test('an admin cannot remove themselves', async () => {
      const res = await request(app)
        .delete(`/api/workspace/members/${adminId}`).set('Cookie', adminCookie);
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'SELF_TARGET');
    });

    test('another tenant gets 404', async () => {
      const res = await request(app)
        .delete(`/api/workspace/members/${colleagueId}`).set('Cookie', otherAdminCookie);
      assert.equal(res.status, 404);
    });

    test('removal ends the session, hides the user, and frees the email', async () => {
      const colleagueCookie = await loginAs({ email: COLLEAGUE, password: PASSWORD });

      const res = await request(app)
        .delete(`/api/workspace/members/${colleagueId}`).set('Cookie', adminCookie);
      assert.equal(res.status, 204);

      const live = await request(app).get('/api/auth/me').set('Cookie', colleagueCookie);
      assert.equal(live.status, 401);

      const list = await request(app).get('/api/workspace/members').set('Cookie', adminCookie);
      assert.ok(!list.body.users.some((u) => u.id === colleagueId), 'removed user is not listed');

      const again = await request(app)
        .delete(`/api/workspace/members/${colleagueId}`).set('Cookie', adminCookie);
      assert.equal(again.status, 404, 'already removed');

      // The same address can be invited and accepted again (migration 093).
      const newId = await addColleague(adminCookie, { email: COLLEAGUE, role: 'admin' });
      assert.notEqual(newId, colleagueId);
      colleagueId = newId;
    });

    test('a bad id is 400', async () => {
      const res = await request(app)
        .delete(`/api/workspace/members/not-a-number`).set('Cookie', adminCookie);
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'INVALID_ID');
    });
  });
});
