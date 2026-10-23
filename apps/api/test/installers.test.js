'use strict';

/**
 * Installer access tests — a cross-company technician business working
 * inside customer workspaces by grant (migration 092).
 *
 *   Platform:  POST /api/companies (provision installer + invite its admin)
 *              GET/POST/DELETE /api/companies/:id/installers, GET /api/companies/:id/customers
 *   Customer:  GET/POST/DELETE /api/workspace/installers, GET /api/workspace/installers/available
 *   Installer: GET /api/installer/customers, POST /api/installer/customers/:id/session
 *              POST /api/installer/customers (provision a customer, pre-granted)
 *              POST /api/auth/end-impersonation
 *   Middleware: a revoked grant ends a live service session on the next request.
 *
 * Requires a running local PostgreSQL with the DB seeded:
 *   npm run db:reset   (from apps/api)
 *
 * DB hygiene: everything created here is named *Installer Test* or uses a
 * *.installer-test.loudin.example address and is deleted in the after hook.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');
const { pool } = require('../database/db');

const SEEDED = {
  platform:     { email: 'platform-admin@loudin.com', password: 'Password123!' },
  demo:         { email: 'admin@democorp.example',    password: 'Password123!' },
  brookline:    { email: 'admin@brookline.example',   password: 'Password123!' },
};
const INSTALLER_NAME  = 'Installer Test Co';
const CUSTOMER_NAME   = 'Installer Test Customer';
const DOMAIN          = 'installer-test.loudin.example';
const TECH_EMAIL      = `tech@${DOMAIN}`;
const TECH_PASSWORD   = 'TechPass123!';
const PERSON_LAST     = 'InstallerTestFixture';

async function loginAs({ email, password }) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.headers['set-cookie'];
}
async function companyIdOf(email) {
  const { rows: [r] } = await pool.query('SELECT company_id FROM users WHERE email = $1', [email]);
  return r.company_id;
}
async function cleanup() {
  await pool.query(`DELETE FROM people WHERE last_name = $1`, [PERSON_LAST]);
  await pool.query(`DELETE FROM user_invites WHERE email LIKE $1`, [`%@${DOMAIN}`]);
  await pool.query(`DELETE FROM installer_grants WHERE installer_company_id IN (SELECT id FROM companies WHERE name = ANY($1)) OR customer_company_id IN (SELECT id FROM companies WHERE name = ANY($1))`, [[INSTALLER_NAME, CUSTOMER_NAME]]);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%@${DOMAIN}`]);
  await pool.query(`DELETE FROM companies WHERE name = ANY($1)`, [[INSTALLER_NAME, CUSTOMER_NAME]]);
}
function tokenFrom(acceptUrl) { return acceptUrl.split('/invite/')[1]; }

describe('Loudin API — installer access', () => {
  let platformCookie, demoCookie, brooklineCookie, techCookie;
  let demoId, installerId, grantId;

  before(async () => {
    await cleanup();
    [platformCookie, demoCookie, brooklineCookie] = await Promise.all([
      loginAs(SEEDED.platform), loginAs(SEEDED.demo), loginAs(SEEDED.brookline),
    ]);
    demoId = await companyIdOf(SEEDED.demo.email);
  });

  after(async () => {
    await cleanup();
    await pool.end();
  });

  describe('Provisioning an installer company', () => {
    test('only the platform admin can create companies', async () => {
      const res = await request(app).post('/api/companies').set('Cookie', demoCookie)
        .send({ name: INSTALLER_NAME, company_type: 'installer', admin_email: TECH_EMAIL });
      assert.equal(res.status, 403);
    });

    test('rejects the platform type and a taken admin email', async () => {
      const bad = await request(app).post('/api/companies').set('Cookie', platformCookie)
        .send({ name: 'X', company_type: 'platform', admin_email: TECH_EMAIL });
      assert.equal(bad.status, 400);
      const taken = await request(app).post('/api/companies').set('Cookie', platformCookie)
        .send({ name: 'X', company_type: 'installer', admin_email: SEEDED.demo.email });
      assert.equal(taken.status, 409);
      assert.equal(taken.body.code, 'EMAIL_IN_USE');
      const { rows } = await pool.query(`SELECT 1 FROM companies WHERE name = 'X'`);
      assert.equal(rows.length, 0, 'no orphan company created');
    });

    test('creates the installer company and invites its first admin', async () => {
      const res = await request(app).post('/api/companies').set('Cookie', platformCookie)
        .send({ name: INSTALLER_NAME, company_type: 'installer', admin_email: TECH_EMAIL,
                admin_first_name: 'Terry', admin_last_name: 'Tech' });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.company.company_type, 'installer');
      assert.equal(res.body.invite.email, TECH_EMAIL);
      installerId = res.body.company.id;

      // The invitee finishes setup and is signed in to the installer company.
      const accept = await request(app)
        .post(`/api/auth/invites/${tokenFrom(res.body.accept_url)}/accept`)
        .send({ password: TECH_PASSWORD, terms_accepted: true });
      assert.equal(accept.status, 201, JSON.stringify(accept.body));
      assert.equal(accept.body.user.company_type, 'installer');
      assert.equal(accept.body.user.company_id, installerId);
      techCookie = await loginAs({ email: TECH_EMAIL, password: TECH_PASSWORD });
    });

    test('installer companies show up in the directory filter', async () => {
      const res = await request(app).get('/api/companies?type=installer').set('Cookie', platformCookie);
      assert.equal(res.status, 200);
      assert.ok(res.body.companies.some((c) => c.id === installerId));
      assert.ok(res.body.companies.every((c) => c.company_type === 'installer'));
    });
  });

  describe('Before any grant', () => {
    test('installer has no customers and cannot open a session', async () => {
      const list = await request(app).get('/api/installer/customers').set('Cookie', techCookie);
      assert.equal(list.status, 200);
      assert.deepEqual(list.body.customers, []);

      const start = await request(app).post(`/api/installer/customers/${demoId}/session`).set('Cookie', techCookie);
      assert.equal(start.status, 403);
      assert.equal(start.body.code, 'NO_GRANT');
    });

    test('/api/installer is closed to non-installer companies', async () => {
      const res = await request(app).get('/api/installer/customers').set('Cookie', demoCookie);
      assert.equal(res.status, 403);
    });
  });

  describe('Customer grants access', () => {
    test('customer admin sees the installer in the picker and grants it', async () => {
      const avail = await request(app).get('/api/workspace/installers/available').set('Cookie', demoCookie);
      assert.equal(avail.status, 200);
      assert.ok(avail.body.installers.some((i) => i.id === installerId));

      const res = await request(app).post('/api/workspace/installers').set('Cookie', demoCookie)
        .send({ installer_company_id: installerId });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.created, true);
      assert.equal(res.body.grant.installer.id, installerId);
      assert.equal(res.body.grant.customer.id, demoId);
      grantId = res.body.grant.id;

      const again = await request(app).post('/api/workspace/installers').set('Cookie', demoCookie)
        .send({ installer_company_id: installerId });
      assert.equal(again.status, 200, 'idempotent');
      assert.equal(again.body.created, false);
      assert.equal(again.body.grant.id, grantId);
    });

    test('a customer cannot grant itself or a non-installer company', async () => {
      const self = await request(app).post('/api/workspace/installers').set('Cookie', demoCookie)
        .send({ installer_company_id: demoId });
      assert.equal(self.status, 400);
      const brooklineId = await companyIdOf(SEEDED.brookline.email);
      const notInstaller = await request(app).post('/api/workspace/installers').set('Cookie', demoCookie)
        .send({ installer_company_id: brooklineId });
      assert.equal(notInstaller.status, 404);
      assert.equal(notInstaller.body.code, 'INSTALLER_NOT_FOUND');
    });

    test('another customer cannot see or revoke the grant', async () => {
      const list = await request(app).get('/api/workspace/installers').set('Cookie', brooklineCookie);
      assert.equal(list.status, 200);
      assert.ok(!list.body.grants.some((g) => g.id === grantId));
      const del = await request(app).delete(`/api/workspace/installers/${grantId}`).set('Cookie', brooklineCookie);
      assert.equal(del.status, 404);
    });

    test('platform sees the grant from both sides', async () => {
      const fromCustomer = await request(app).get(`/api/companies/${demoId}/installers`).set('Cookie', platformCookie);
      assert.equal(fromCustomer.status, 200);
      assert.ok(fromCustomer.body.grants.some((g) => g.id === grantId));
      const fromInstaller = await request(app).get(`/api/companies/${installerId}/customers`).set('Cookie', platformCookie);
      assert.equal(fromInstaller.status, 200);
      assert.ok(fromInstaller.body.customers.some((g) => g.customer.id === demoId));
    });
  });

  describe('Service session', () => {
    let serviceCookie, personId;

    test('installer lists the customer and opens a session', async () => {
      const list = await request(app).get('/api/installer/customers').set('Cookie', techCookie);
      assert.equal(list.body.customers.length, 1);
      assert.equal(list.body.customers[0].customer.name, 'Demo Customer Co');

      const res = await request(app).post(`/api/installer/customers/${demoId}/session`).set('Cookie', techCookie);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.ok(res.headers['set-cookie']?.length, 'cookie swapped');
      serviceCookie = res.headers['set-cookie'];
    });

    test('/me shows the customer workspace with the installer as actor', async () => {
      const me = await request(app).get('/api/auth/me').set('Cookie', serviceCookie);
      assert.equal(me.status, 200, JSON.stringify(me.body));
      assert.equal(me.body.user.company_id, demoId);
      assert.equal(me.body.user.company_type, 'end_user');
      assert.equal(me.body.user.impersonation?.impersonator_company_type, 'installer');
      assert.equal(me.body.user.impersonation?.impersonator_company_name, INSTALLER_NAME);
    });

    test('full admin inside the customer: read devices, create a person', async () => {
      const devices = await request(app).get('/api/devices').set('Cookie', serviceCookie);
      assert.equal(devices.status, 200);
      assert.ok(devices.body.devices.length > 0, 'sees the customer\'s seeded devices');
      assert.ok(devices.body.devices.every((d) => d.company_id === undefined || d.company_id === demoId));

      const person = await request(app).post('/api/people').set('Cookie', serviceCookie)
        .send({ first_name: 'Pat', last_name: PERSON_LAST });
      assert.equal(person.status, 201, JSON.stringify(person.body));
      personId = person.body.person?.id ?? person.body.id;
      const { rows: [row] } = await pool.query(`SELECT company_id FROM people WHERE last_name = $1`, [PERSON_LAST]);
      assert.equal(row.company_id, demoId, 'person lands in the customer company');
    });

    test('customer-only actions stay closed during a service session', async () => {
      const invite = await request(app).post('/api/workspace/invites').set('Cookie', serviceCookie)
        .send({ email: `someone@${DOMAIN}` });
      assert.equal(invite.status, 403);
      assert.equal(invite.body.error_code, 'IMPERSONATION_NOT_ALLOWED');
      const cancel = await request(app).post('/api/workspace/cancel-subscription').set('Cookie', serviceCookie)
        .send({ reason_code: 'other' });
      assert.equal(cancel.status, 403);
      const grant = await request(app).post('/api/workspace/installers').set('Cookie', serviceCookie)
        .send({ installer_company_id: installerId });
      assert.equal(grant.status, 403);
    });

    test('installer-home routes are unreachable from inside the session; no nesting', async () => {
      const home = await request(app).get('/api/installer/customers').set('Cookie', serviceCookie);
      assert.equal(home.status, 403);
    });

    test('audit log records the session start on behalf of the customer', async () => {
      const { rows } = await pool.query(
        `SELECT actor_company_id, on_behalf_of_company_id FROM audit_log
          WHERE action = 'installer.session_start' ORDER BY id DESC LIMIT 1`
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].actor_company_id, installerId);
      assert.equal(rows[0].on_behalf_of_company_id, demoId);
    });

    test('revoking the grant ends the live session on the next request', async () => {
      const del = await request(app).delete(`/api/companies/${demoId}/installers/${grantId}`).set('Cookie', platformCookie);
      assert.equal(del.status, 200, JSON.stringify(del.body));
      assert.ok(del.body.grant.revoked_at);

      const blocked = await request(app).get('/api/devices').set('Cookie', serviceCookie);
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.code, 'SERVICE_SESSION_ENDED');
      const homeCookie = blocked.headers['set-cookie'];
      assert.ok(homeCookie?.length, 'cookie swapped back to the home workspace');

      const me = await request(app).get('/api/auth/me').set('Cookie', homeCookie);
      assert.equal(me.status, 200);
      assert.equal(me.body.user.company_id, installerId);
      assert.equal(me.body.user.impersonation, undefined);
    });

    test('platform re-grants; installer re-enters and exits cleanly', async () => {
      const re = await request(app).post(`/api/companies/${demoId}/installers`).set('Cookie', platformCookie)
        .send({ installer_company_id: installerId });
      assert.equal(re.status, 201);
      assert.notEqual(re.body.grant.id, grantId, 'a fresh row keeps history');
      grantId = re.body.grant.id;

      const start = await request(app).post(`/api/installer/customers/${demoId}/session`).set('Cookie', techCookie);
      assert.equal(start.status, 200);
      const cookie = start.headers['set-cookie'];

      const nested = await request(app).post(`/api/installer/customers/${demoId}/session`).set('Cookie', cookie);
      assert.equal(nested.status, 403, 'company_type is end_user inside the session');

      const end = await request(app).post('/api/auth/end-impersonation').set('Cookie', cookie);
      assert.equal(end.status, 200);
      const me = await request(app).get('/api/auth/me').set('Cookie', end.headers['set-cookie']);
      assert.equal(me.body.user.company_id, installerId);

      // Tidy the fixture person created inside the session.
      if (personId) await pool.query('DELETE FROM people WHERE id = $1', [personId]);
    });

    test('customer admin can revoke from workspace settings', async () => {
      const del = await request(app).delete(`/api/workspace/installers/${grantId}`).set('Cookie', demoCookie);
      assert.equal(del.status, 200);
      const list = await request(app).get('/api/workspace/installers').set('Cookie', demoCookie);
      assert.ok(!list.body.grants.some((g) => g.id === grantId));
    });
  });

  describe('Installer provisions a new customer', () => {
    const OWNER_EMAIL = `owner@${DOMAIN}`;
    let customerId, customerGrantId, helperCookie;

    test('a non-admin installer user may not create customers', async () => {
      // Invite a plain User into the installer company and sign them in.
      const invite = await request(app).post('/api/workspace/invites').set('Cookie', techCookie)
        .send({ email: `helper@${DOMAIN}`, first_name: 'Hal', last_name: 'Helper', role: 'user' });
      assert.equal(invite.status, 201, JSON.stringify(invite.body));
      const accept = await request(app)
        .post(`/api/auth/invites/${tokenFrom(invite.body.accept_url)}/accept`)
        .send({ password: TECH_PASSWORD, terms_accepted: true });
      assert.equal(accept.status, 201, JSON.stringify(accept.body));
      helperCookie = await loginAs({ email: `helper@${DOMAIN}`, password: TECH_PASSWORD });

      const res = await request(app).post('/api/installer/customers').set('Cookie', helperCookie)
        .send({ name: CUSTOMER_NAME, admin_email: OWNER_EMAIL });
      assert.equal(res.status, 403);
      const { rows } = await pool.query(`SELECT 1 FROM companies WHERE name = $1`, [CUSTOMER_NAME]);
      assert.equal(rows.length, 0);
    });

    test('rejects a taken email and a missing name without leaving an orphan', async () => {
      const taken = await request(app).post('/api/installer/customers').set('Cookie', techCookie)
        .send({ name: CUSTOMER_NAME, admin_email: SEEDED.demo.email });
      assert.equal(taken.status, 409);
      assert.equal(taken.body.code, 'EMAIL_IN_USE');
      const noName = await request(app).post('/api/installer/customers').set('Cookie', techCookie)
        .send({ admin_email: OWNER_EMAIL });
      assert.equal(noName.status, 400);
      const { rows } = await pool.query(`SELECT 1 FROM companies WHERE name = $1`, [CUSTOMER_NAME]);
      assert.equal(rows.length, 0, 'no orphan company created');
    });

    test('installer admin creates the customer, invites its admin, and is granted access', async () => {
      const res = await request(app).post('/api/installer/customers').set('Cookie', techCookie)
        .send({ name: CUSTOMER_NAME, admin_email: OWNER_EMAIL, admin_first_name: 'Olive', admin_last_name: 'Owner' });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.company.company_type, 'end_user');
      assert.equal(res.body.company.name, CUSTOMER_NAME);
      assert.equal(res.body.invite.email, OWNER_EMAIL);
      assert.ok(res.body.accept_url.includes('/invite/'));
      assert.equal(res.body.grant.installer.id, installerId);
      assert.equal(res.body.grant.customer.id, res.body.company.id);
      customerId = res.body.company.id;
      customerGrantId = res.body.grant.id;

      const list = await request(app).get('/api/installer/customers').set('Cookie', techCookie);
      assert.ok(list.body.customers.some((g) => g.customer.id === customerId), 'appears on the Customers page');

      const { rows } = await pool.query(
        `SELECT action, actor_company_id, metadata->>'source' AS source FROM audit_log
          WHERE target_type = 'company' AND target_id = $1 ORDER BY id ASC`,
        [String(customerId)]
      );
      assert.deepEqual(rows.map((r) => r.action), ['company.create', 'installer.grant']);
      assert.ok(rows.every((r) => r.actor_company_id === installerId && r.source === 'installer'));

      // The customer's admin finishes setup and lands in the new company.
      const accept = await request(app)
        .post(`/api/auth/invites/${tokenFrom(res.body.accept_url)}/accept`)
        .send({ password: TECH_PASSWORD, terms_accepted: true });
      assert.equal(accept.status, 201, JSON.stringify(accept.body));
      assert.equal(accept.body.user.company_id, customerId);
      assert.equal(accept.body.user.company_type, 'end_user');
      assert.equal(accept.body.user.user_type_id, 1);
    });

    test('installer opens the new workspace right away; creating from inside is closed', async () => {
      const start = await request(app).post(`/api/installer/customers/${customerId}/session`).set('Cookie', techCookie);
      assert.equal(start.status, 200, JSON.stringify(start.body));
      const serviceCookie = start.headers['set-cookie'];

      const me = await request(app).get('/api/auth/me').set('Cookie', serviceCookie);
      assert.equal(me.body.user.company_id, customerId);
      assert.equal(me.body.user.impersonation?.impersonator_company_type, 'installer');

      const nested = await request(app).post('/api/installer/customers').set('Cookie', serviceCookie)
        .send({ name: 'Nested Installer Test', admin_email: `nested@${DOMAIN}` });
      assert.equal(nested.status, 403);

      const end = await request(app).post('/api/auth/end-impersonation').set('Cookie', serviceCookie);
      assert.equal(end.status, 200);
    });

    test('the new customer\'s admin sees the grant and can revoke it', async () => {
      const ownerCookie = await loginAs({ email: OWNER_EMAIL, password: TECH_PASSWORD });
      const list = await request(app).get('/api/workspace/installers').set('Cookie', ownerCookie);
      assert.equal(list.status, 200);
      assert.ok(list.body.grants.some((g) => g.id === customerGrantId && g.installer.id === installerId));

      const del = await request(app).delete(`/api/workspace/installers/${customerGrantId}`).set('Cookie', ownerCookie);
      assert.equal(del.status, 200);
      const after = await request(app).get('/api/installer/customers').set('Cookie', techCookie);
      assert.ok(!after.body.customers.some((g) => g.customer.id === customerId));
    });
  });
});
