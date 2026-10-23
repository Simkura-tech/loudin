'use strict';

/**
 * User-invite flow tests — add a login user to an existing company.
 *
 *   Admin side:   GET  /api/workspace/members
 *                 POST /api/workspace/invites
 *                 POST /api/workspace/invites/:id/resend
 *                 DELETE /api/workspace/invites/:id
 *   Invitee side: GET  /api/auth/invites/:token
 *                 POST /api/auth/invites/:token/accept
 *
 * Requires a running local PostgreSQL with the DB seeded:
 *   npm run db:reset   (from apps/api)
 *
 * DB hygiene: every row this file creates carries a *.invite-test.loudin.example
 * address; the after hook deletes those users and invites.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');
const { pool } = require('../database/db');

const SEEDED = {
  endUser:      { email: 'admin@democorp.example',   password: 'Password123!' },
  otherEndUser: { email: 'admin@brookline.example',  password: 'Password123!' },
};
const DOMAIN = 'invite-test.loudin.example';
const INVITEE       = `new-admin@${DOMAIN}`;
const INVITEE_2     = `viewer@${DOMAIN}`;
const REVOKED_EMAIL = `revoked@${DOMAIN}`;
const ACCEPT_PASSWORD = 'InvitePass123!';

async function loginAs({ email, password }) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.headers['set-cookie'];
}

async function cleanup() {
  await pool.query(`DELETE FROM user_invites WHERE email LIKE $1`, [`%@${DOMAIN}`]);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%@${DOMAIN}`]);
}

/** Pull the raw token out of an accept_url the API returned. */
function tokenFrom(acceptUrl) {
  return acceptUrl.split('/invite/')[1];
}

describe('Loudin API — user invites', () => {
  let adminCookie, otherAdminCookie;

  before(async () => {
    await cleanup();
    [adminCookie, otherAdminCookie] = await Promise.all([
      loginAs(SEEDED.endUser),
      loginAs(SEEDED.otherEndUser),
    ]);
  });

  after(async () => {
    await cleanup();
    await pool.end();
  });

  // ── Admin side ──────────────────────────────────────────────────────────

  describe('Creating invites', () => {
    test('requires a session', async () => {
      const res = await request(app).post('/api/workspace/invites').send({ email: INVITEE });
      assert.equal(res.status, 401);
    });

    test('rejects a bad email', async () => {
      const res = await request(app)
        .post('/api/workspace/invites').set('Cookie', adminCookie)
        .send({ email: 'not-an-email' });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'INVALID_EMAIL');
    });

    test('rejects an unknown role', async () => {
      const res = await request(app)
        .post('/api/workspace/invites').set('Cookie', adminCookie)
        .send({ email: INVITEE, role: 'owner' });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'INVALID_ROLE');
    });

    test('409 when the email already has an account', async () => {
      const res = await request(app)
        .post('/api/workspace/invites').set('Cookie', adminCookie)
        .send({ email: SEEDED.otherEndUser.email });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'EMAIL_IN_USE');
    });

    test('creates an admin invite by default and returns the accept link once', async () => {
      const res = await request(app)
        .post('/api/workspace/invites').set('Cookie', adminCookie)
        .send({ email: INVITEE.toUpperCase(), first_name: 'New', last_name: 'Admin' });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.invite.email, INVITEE, 'email is normalised to lower case');
      assert.equal(res.body.invite.role, 'admin');
      assert.equal(res.body.invite.state, 'pending');
      assert.match(res.body.accept_url, /\/invite\/[A-Za-z0-9_-]{40,}$/);
      assert.ok(['email', 'console'].includes(res.body.delivery));

      const { rows } = await pool.query('SELECT token_hash FROM user_invites WHERE email = $1', [INVITEE]);
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].token_hash, tokenFrom(res.body.accept_url), 'raw token is never stored');
    });

    test('a second invite for the same email supersedes the first', async () => {
      const res = await request(app)
        .post('/api/workspace/invites').set('Cookie', adminCookie)
        .send({ email: INVITEE });
      assert.equal(res.status, 201);
      const { rows } = await pool.query(
        `SELECT revoked_at IS NOT NULL AS revoked FROM user_invites WHERE email = $1 ORDER BY id`, [INVITEE]
      );
      assert.deepEqual(rows.map((r) => r.revoked), [true, false]);
    });

    test('members list shows users plus open invites, scoped to the company', async () => {
      const res = await request(app).get('/api/workspace/members').set('Cookie', adminCookie);
      assert.equal(res.status, 200);
      assert.ok(res.body.users.some((u) => u.email === SEEDED.endUser.email));
      assert.ok(!res.body.users.some((u) => u.email === SEEDED.otherEndUser.email), 'no cross-tenant users');
      const open = res.body.invites.filter((i) => i.email === INVITEE);
      assert.equal(open.length, 1, 'only the live invite is listed');
      assert.equal(open[0].state, 'pending');
      assert.ok(!('token_hash' in open[0]));

      const other = await request(app).get('/api/workspace/members').set('Cookie', otherAdminCookie);
      assert.equal(other.status, 200);
      assert.ok(!other.body.invites.some((i) => i.email === INVITEE), 'invite not visible to another tenant');
    });
  });

  // ── Invitee side ────────────────────────────────────────────────────────

  describe('Accepting invites', () => {
    let acceptUrl, inviteId;

    before(async () => {
      const res = await request(app)
        .post('/api/workspace/invites').set('Cookie', adminCookie)
        .send({ email: INVITEE_2, role: 'user', first_name: 'Vee', last_name: 'Ewer' });
      assert.equal(res.status, 201);
      acceptUrl = res.body.accept_url;
      inviteId  = res.body.invite.id;
    });

    test('preview of a bogus token is 404', async () => {
      const res = await request(app).get('/api/auth/invites/definitely-not-a-token');
      assert.equal(res.status, 404);
      assert.equal(res.body.code, 'INVITE_NOT_FOUND');
    });

    test('preview shows who invited you and to what', async () => {
      const res = await request(app).get(`/api/auth/invites/${tokenFrom(acceptUrl)}`);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.invite.email, INVITEE_2);
      assert.equal(res.body.invite.role, 'user');
      assert.equal(res.body.invite.company_name, 'Demo Customer Co');
      assert.equal(res.body.invite.first_name, 'Vee');
    });

    test('accept rejects a weak password and missing terms', async () => {
      const weak = await request(app)
        .post(`/api/auth/invites/${tokenFrom(acceptUrl)}/accept`)
        .send({ password: 'short', terms_accepted: true });
      assert.equal(weak.status, 400);

      const noTerms = await request(app)
        .post(`/api/auth/invites/${tokenFrom(acceptUrl)}/accept`)
        .send({ password: ACCEPT_PASSWORD });
      assert.equal(noTerms.status, 400);
      assert.equal(noTerms.body.code, 'TERMS_REQUIRED');
    });

    test('resend rotates the token so the old link stops working', async () => {
      const oldToken = tokenFrom(acceptUrl);
      const res = await request(app)
        .post(`/api/workspace/invites/${inviteId}/resend`).set('Cookie', adminCookie);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.notEqual(tokenFrom(res.body.accept_url), oldToken);
      acceptUrl = res.body.accept_url;

      const stale = await request(app).get(`/api/auth/invites/${oldToken}`);
      assert.equal(stale.status, 404);
    });

    test('another tenant cannot resend or revoke it', async () => {
      const resend = await request(app)
        .post(`/api/workspace/invites/${inviteId}/resend`).set('Cookie', otherAdminCookie);
      assert.equal(resend.status, 404);
      const revoke = await request(app)
        .delete(`/api/workspace/invites/${inviteId}`).set('Cookie', otherAdminCookie);
      assert.equal(revoke.status, 404);
    });

    test('accept creates the user in the inviting company and signs them in', async () => {
      const res = await request(app)
        .post(`/api/auth/invites/${tokenFrom(acceptUrl)}/accept`)
        .send({ password: ACCEPT_PASSWORD, terms_accepted: true }); // name comes from the invite
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.user.email, INVITEE_2);
      assert.equal(res.body.user.user_type_id, 2);
      assert.equal(res.body.user.company_name, 'Demo Customer Co');
      assert.equal(res.body.user.first_name, 'Vee');
      assert.ok(res.headers['set-cookie']?.length, 'session cookie issued');

      const { rows: [u] } = await pool.query(
        `SELECT u.company_id, u.terms_version, i.accepted_user_id
           FROM users u JOIN user_invites i ON i.accepted_user_id = u.id
          WHERE u.email = $1`, [INVITEE_2]
      );
      assert.ok(u, 'invite marked accepted and linked to the user');
      assert.ok(u.terms_version, 'legal acceptance stamped');

      const { rows: [admin] } = await pool.query('SELECT company_id FROM users WHERE email = $1', [SEEDED.endUser.email]);
      assert.equal(u.company_id, admin.company_id, 'joined the inviter\'s company, no new company created');
    });

    test('the new user can log in and sees the shared workspace', async () => {
      const cookie = await loginAs({ email: INVITEE_2, password: ACCEPT_PASSWORD });
      const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
      assert.equal(me.status, 200);
      assert.equal(me.body.user.company_name, 'Demo Customer Co');

      const devices = await request(app).get('/api/devices').set('Cookie', cookie);
      assert.equal(devices.status, 200, 'a User-role member can read devices');
    });

    test('a used link cannot be used again', async () => {
      const res = await request(app).get(`/api/auth/invites/${tokenFrom(acceptUrl)}`);
      assert.equal(res.status, 410);
      assert.equal(res.body.code, 'INVITE_ACCEPTED');
    });

    test('the new (non-admin) user cannot invite others', async () => {
      const cookie = await loginAs({ email: INVITEE_2, password: ACCEPT_PASSWORD });
      const res = await request(app)
        .post('/api/workspace/invites').set('Cookie', cookie)
        .send({ email: `someone-else@${DOMAIN}` });
      assert.equal(res.status, 403);
    });

    test('revoked invites are closed to the invitee', async () => {
      const created = await request(app)
        .post('/api/workspace/invites').set('Cookie', adminCookie)
        .send({ email: REVOKED_EMAIL });
      assert.equal(created.status, 201);

      const revoked = await request(app)
        .delete(`/api/workspace/invites/${created.body.invite.id}`).set('Cookie', adminCookie);
      assert.equal(revoked.status, 200);
      assert.equal(revoked.body.invite.state, 'revoked');

      const preview = await request(app).get(`/api/auth/invites/${tokenFrom(created.body.accept_url)}`);
      assert.equal(preview.status, 410);
      assert.equal(preview.body.code, 'INVITE_REVOKED');

      const members = await request(app).get('/api/workspace/members').set('Cookie', adminCookie);
      assert.ok(!members.body.invites.some((i) => i.email === REVOKED_EMAIL), 'revoked invite leaves the list');
    });
  });
});
