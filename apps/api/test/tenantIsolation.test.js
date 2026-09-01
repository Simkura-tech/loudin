'use strict';

/**
 * Tenant-isolation tests — the access-control contract of the platform.
 *
 * Verifies that:
 *   - end-user admins can only see/mutate rows in their own company
 *     (scoped queries → 404 for foreign ids, lists never leak rows),
 *   - end-user admins are walled off from reseller + platform surfaces (403),
 *   - reseller admins see only THEIR customers (unrelated end-users → 404),
 *   - non-admin users (user_type_id=2) are rejected by requireAdmin (403),
 *   - unauthenticated requests are rejected (401).
 *
 * Requires a running local PostgreSQL with the DB seeded:
 *   npm run db:reset   (from apps/api)
 *
 * Run with:
 *   npm test
 *
 * DB hygiene: every row this file creates (a fixture person + credential in
 * an unrelated end-user company, and one non-admin user) is deleted in the
 * after hook. Seeded rows are only ever read, never mutated — the mutation
 * attempts below are expected to match 0 rows, and we assert that.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');
const { pool } = require('../database/db');

const SEEDED = {
  platform:      { email: 'platform-admin@loudin.com', password: 'Password123!' },
  reseller:      { email: 'admin@acme-dist.example',    password: 'Password123!' },
  otherReseller: { email: 'admin@second-reseller.example', password: 'Password123!' },
  endUser:       { email: 'admin@democorp.example',     password: 'Password123!' },
};

// Same bcrypt hash the seed uses for Password123! — reused for the
// non-admin fixture user so login works through the normal flow.
const SEED_PASSWORD_HASH = '$2b$10$/sl9aeZKp7Kwh0vII3Mxx.WVvBnBbzxJ0jBZPbSQM2bmmQCfoB79y';

const NON_ADMIN = {
  email:    'nonadmin.tenant-isolation@test.loudin.example',
  password: 'Password123!',
};
const FOREIGN_PERSON_EMAIL   = 'foreign.fixture@tenant-isolation.test';
const FOREIGN_CREDENTIAL_TAG = 'TENANT_ISOLATION_FIXTURE';
const FOREIGN_DEVICE_HW_ID   = 'TEST-TENANT-ISOLATION-FOREIGN';

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

/** Remove any rows a previous (crashed) run may have left behind. */
async function cleanFixtures() {
  await pool.query('DELETE FROM devices WHERE device_id = $1', [FOREIGN_DEVICE_HW_ID]);
  await pool.query('DELETE FROM credentials WHERE credential_name = $1', [FOREIGN_CREDENTIAL_TAG]);
  await pool.query('DELETE FROM people WHERE email = $1', [FOREIGN_PERSON_EMAIL]);
  await pool.query('DELETE FROM users WHERE email = $1', [NON_ADMIN.email]);
}

describe('Loudin API — tenant isolation', () => {
  let platformCookie, resellerCookie, otherResellerCookie, endUserCookie, nonAdminCookie;

  // Seeded company ids (resolved by name, not hard-coded)
  let demoId, acmeId, brooklineId;

  // Seeded rows in the end-user company (read-only)
  let demoPeopleIds, demoCredentialIds, demoDeviceIds;
  let demoPersonId, demoDeviceId;

  // Fixture rows in the UNRELATED end-user company (created here, deleted in
  // after). The seed deliberately gives that company no devices — only the
  // three Simkura sandbox locks are seeded, on Demo Customer Co — so the
  // foreign device is a fixture too.
  let foreignPersonId, foreignCredentialId, foreignDeviceId;

  before(async () => {
    // ── Resolve seeded companies ─────────────────────────────────────────
    const { rows: companies } = await pool.query(
      `SELECT id, name FROM companies
        WHERE name IN ('Demo Customer Co', 'Acme Distribution', 'Brookline Coworking')`
    );
    const byName = Object.fromEntries(companies.map((c) => [c.name, c.id]));
    demoId      = byName['Demo Customer Co'];
    acmeId      = byName['Acme Distribution'];
    brooklineId = byName['Brookline Coworking'];
    assert.ok(demoId && acmeId && brooklineId, 'Seeded companies missing — run npm run db:reset');

    await cleanFixtures();

    // ── Fixture rows in the unrelated company (Brookline ← the 2nd reseller) ─
    ({ rows: [{ id: foreignPersonId }] } = await pool.query(
      `INSERT INTO people (company_id, first_name, last_name, email, status)
       VALUES ($1, 'Foreign', 'Fixture', $2, 'active') RETURNING id`,
      [brooklineId, FOREIGN_PERSON_EMAIL]
    ));
    ({ rows: [{ id: foreignCredentialId }] } = await pool.query(
      `INSERT INTO credentials (company_id, person_id, credential_name, credential_type, credential_value)
       VALUES ($1, $2, $3, 'pin', '73159') RETURNING id`,
      [brooklineId, foreignPersonId, FOREIGN_CREDENTIAL_TAG]
    ));
    ({ rows: [{ id: foreignDeviceId }] } = await pool.query(
      `INSERT INTO devices (company_id, device_id, device_type, device_name, status, assigned_at)
       VALUES ($1, $2, 'sb6', 'Foreign Fixture Door', 'offline', NOW()) RETURNING id`,
      [brooklineId, FOREIGN_DEVICE_HW_ID]
    ));

    // ── Non-admin (user_type_id=2) fixture user in the end-user company ──
    await pool.query(
      `INSERT INTO users (company_id, user_type_id, email, first_name, last_name,
                          password_hash, email_verified, email_verified_at, status)
       VALUES ($1, 2, $2, 'NonAdmin', 'Fixture', $3, true, NOW(), 'active')`,
      [demoId, NON_ADMIN.email, SEED_PASSWORD_HASH]
    );

    // ── Snapshot the end-user company's rows for subset assertions ───────
    const [people, creds, devices] = await Promise.all([
      pool.query('SELECT id FROM people WHERE company_id = $1', [demoId]),
      pool.query('SELECT id FROM credentials WHERE company_id = $1', [demoId]),
      pool.query('SELECT id FROM devices WHERE company_id = $1', [demoId]),
    ]);
    demoPeopleIds     = new Set(people.rows.map((r) => r.id));
    demoCredentialIds = new Set(creds.rows.map((r) => r.id));
    demoDeviceIds     = new Set(devices.rows.map((r) => r.id));
    assert.ok(demoPeopleIds.size > 0, 'Seeded people missing — run npm run db:reset');
    demoPersonId = Math.min(...demoPeopleIds);
    demoDeviceId = Math.min(...demoDeviceIds);

    [platformCookie, resellerCookie, otherResellerCookie, endUserCookie, nonAdminCookie] =
      await Promise.all([
        loginAs(SEEDED.platform),
        loginAs(SEEDED.reseller),
        loginAs(SEEDED.otherReseller),
        loginAs(SEEDED.endUser),
        loginAs(NON_ADMIN),
      ]);
  });

  after(async () => {
    try {
      await cleanFixtures();
    } finally {
      await pool.end();
    }
  });

  // ── List scoping — no cross-company rows, ever ──────────────────────────

  describe('End-user admin: lists are tenant-scoped', () => {
    test('GET /api/people returns only own-company rows', async () => {
      const res = await request(app).get('/api/people?limit=200').set('Cookie', endUserCookie);
      assert.equal(res.status, 200);
      assert.ok(res.body.people.length > 0, 'Expected seeded people');
      for (const p of res.body.people) {
        assert.ok(demoPeopleIds.has(p.id), `Person ${p.id} leaked from another company`);
      }
      assert.ok(!res.body.people.some((p) => p.id === foreignPersonId),
        'Foreign person leaked into people list');
    });

    test('GET /api/credentials returns only own-company rows', async () => {
      const res = await request(app).get('/api/credentials').set('Cookie', endUserCookie);
      assert.equal(res.status, 200);
      assert.ok(res.body.credentials.length > 0, 'Expected seeded credentials');
      for (const c of res.body.credentials) {
        assert.ok(demoCredentialIds.has(c.id), `Credential ${c.id} leaked from another company`);
      }
      assert.ok(!res.body.credentials.some((c) => c.id === foreignCredentialId),
        'Foreign credential leaked into credentials list');
    });

    test('GET /api/devices returns only own-company rows', async () => {
      const res = await request(app).get('/api/devices?limit=200').set('Cookie', endUserCookie);
      assert.equal(res.status, 200);
      assert.ok(res.body.devices.length > 0, 'Expected seeded devices');
      for (const d of res.body.devices) {
        assert.ok(demoDeviceIds.has(d.id), `Device ${d.id} leaked from another company`);
      }
      assert.ok(!res.body.devices.some((d) => d.id === foreignDeviceId),
        'Foreign device leaked into devices list');
    });
  });

  // ── Cross-tenant object access — scoped queries must 404 ────────────────

  describe('End-user admin: foreign records are invisible (404)', () => {
    test('GET /api/people/:id of another company → 404', async () => {
      const res = await request(app)
        .get(`/api/people/${foreignPersonId}`).set('Cookie', endUserCookie);
      assert.equal(res.status, 404, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(!res.body.person, 'Foreign person data must not be returned');
    });

    test('GET /api/credentials/:id of another company → 404', async () => {
      const res = await request(app)
        .get(`/api/credentials/${foreignCredentialId}`).set('Cookie', endUserCookie);
      assert.equal(res.status, 404, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(!res.body.credential, 'Foreign credential data must not be returned');
    });

    test('GET /api/devices/:id of another company → 404', async () => {
      const res = await request(app)
        .get(`/api/devices/${foreignDeviceId}`).set('Cookie', endUserCookie);
      assert.equal(res.status, 404, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(!res.body.device, 'Foreign device data must not be returned');
    });

    test('GET /api/devices/:id/credentials of another company → 404', async () => {
      const res = await request(app)
        .get(`/api/devices/${foreignDeviceId}/credentials`).set('Cookie', endUserCookie);
      assert.equal(res.status, 404);
    });

    test('PATCH /api/people/:id of another company → 404, row untouched', async () => {
      const res = await request(app)
        .patch(`/api/people/${foreignPersonId}`)
        .set('Cookie', endUserCookie)
        .send({ first_name: 'Hacked' });
      assert.equal(res.status, 404, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      const { rows } = await pool.query('SELECT first_name FROM people WHERE id = $1', [foreignPersonId]);
      assert.equal(rows[0].first_name, 'Foreign', 'Cross-tenant PATCH mutated a foreign row');
    });

    test('DELETE /api/people/:id of another company → 404, row untouched', async () => {
      const res = await request(app)
        .delete(`/api/people/${foreignPersonId}`).set('Cookie', endUserCookie);
      assert.equal(res.status, 404);
      const { rows } = await pool.query(
        'SELECT deleted_at FROM people WHERE id = $1', [foreignPersonId]);
      assert.equal(rows[0].deleted_at, null, 'Cross-tenant DELETE soft-deleted a foreign row');
    });

    test('PATCH /api/credentials/:id of another company → 404, row untouched', async () => {
      const res = await request(app)
        .patch(`/api/credentials/${foreignCredentialId}`)
        .set('Cookie', endUserCookie)
        .send({ credential_name: 'Hacked' });
      assert.equal(res.status, 404);
      const { rows } = await pool.query(
        'SELECT credential_name FROM credentials WHERE id = $1', [foreignCredentialId]);
      assert.equal(rows[0].credential_name, FOREIGN_CREDENTIAL_TAG,
        'Cross-tenant PATCH mutated a foreign credential');
    });

    test('PATCH /api/devices/:id of another company → 404, row untouched', async () => {
      const before = await pool.query('SELECT device_name FROM devices WHERE id = $1', [foreignDeviceId]);
      const res = await request(app)
        .patch(`/api/devices/${foreignDeviceId}`)
        .set('Cookie', endUserCookie)
        .send({ device_name: 'Hacked' });
      assert.equal(res.status, 404);
      const afterRow = await pool.query('SELECT device_name FROM devices WHERE id = $1', [foreignDeviceId]);
      assert.equal(afterRow.rows[0].device_name, before.rows[0].device_name,
        'Cross-tenant PATCH mutated a foreign device');
    });
  });

  // ── Role walls — end-user admins have no reseller/platform surface ──────

  describe('End-user admin: reseller + platform endpoints → 403', () => {
    const walled = [
      ['GET', '/api/reseller/customers'],
      ['GET', '/api/reseller/devices'],
      ['GET', '/api/reseller/invite'],
      ['GET', '/api/companies'],
      ['GET', '/api/platform/devices'],
      ['GET', '/api/platform/api-keys'],
      ['GET', '/api/audit'],
    ];

    for (const [method, path] of walled) {
      test(`${method} ${path} → 403`, async () => {
        const res = await request(app)[method.toLowerCase()](path).set('Cookie', endUserCookie);
        assert.equal(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
      });
    }

    test('GET /api/companies/:ownId → 403 (even own company via platform surface)', async () => {
      const res = await request(app).get(`/api/companies/${demoId}`).set('Cookie', endUserCookie);
      assert.equal(res.status, 403);
    });
  });

  // ── Reseller scoping ────────────────────────────────────────────────────

  describe('Reseller admin: customers are scoped to parent_company_id', () => {
    test('GET /api/reseller/customers lists own customers only', async () => {
      const res = await request(app)
        .get('/api/reseller/customers').set('Cookie', resellerCookie);
      assert.equal(res.status, 200);
      const ids = res.body.customers.map((c) => c.id);
      assert.ok(ids.includes(demoId), 'Expected own customer (Demo Customer Co) in list');
      assert.ok(!ids.includes(brooklineId), "Another reseller's customer leaked into the list");
    });

    test('GET /api/reseller/customers/:ownCustomerId → 200', async () => {
      const res = await request(app)
        .get(`/api/reseller/customers/${demoId}`).set('Cookie', resellerCookie);
      assert.equal(res.status, 200);
      assert.equal(res.body.customer?.id, demoId);
    });

    test("GET /api/reseller/customers/:id of another reseller's customer → 404", async () => {
      const res = await request(app)
        .get(`/api/reseller/customers/${brooklineId}`).set('Cookie', resellerCookie);
      assert.equal(res.status, 404, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(!res.body.customer, 'Unrelated customer data must not be returned');
    });

    test('GET /api/reseller/customers/:unrelatedId/devices → 404', async () => {
      const res = await request(app)
        .get(`/api/reseller/customers/${brooklineId}/devices`).set('Cookie', resellerCookie);
      assert.equal(res.status, 404);
    });

    test('GET /api/reseller/customers/:unrelatedId/users → 404', async () => {
      const res = await request(app)
        .get(`/api/reseller/customers/${brooklineId}/users`).set('Cookie', resellerCookie);
      assert.equal(res.status, 404);
    });

    test("cross-reseller: the other reseller's admin cannot read Acme's customer → 404", async () => {
      const res = await request(app)
        .get(`/api/reseller/customers/${demoId}`).set('Cookie', otherResellerCookie);
      assert.equal(res.status, 404);
    });

    test("GET /api/people/:id of a customer's person → 404 (reseller has no people surface)", async () => {
      const res = await request(app)
        .get(`/api/people/${demoPersonId}`).set('Cookie', resellerCookie);
      assert.equal(res.status, 404);
    });

    test('reseller admin cannot reach platform endpoints → 403', async () => {
      for (const path of ['/api/companies', '/api/platform/devices', '/api/audit']) {
        const res = await request(app).get(path).set('Cookie', resellerCookie);
        assert.equal(res.status, 403, `${path}: expected 403, got ${res.status}`);
      }
    });
  });

  // ── Non-admin user (user_type_id = 2) ───────────────────────────────────

  describe('Non-admin user: requireAdmin rejects mutations (403)', () => {
    test('GET /api/auth/me → 200 with user_type_id 2', async () => {
      const res = await request(app).get('/api/auth/me').set('Cookie', nonAdminCookie);
      assert.equal(res.status, 200);
      assert.equal(res.body.user?.user_type_id, 2);
    });

    test('reads remain available (GET /api/people → 200)', async () => {
      const res = await request(app).get('/api/people').set('Cookie', nonAdminCookie);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.people));
    });

    test('POST /api/people → 403', async () => {
      const res = await request(app)
        .post('/api/people')
        .set('Cookie', nonAdminCookie)
        .send({ first_name: 'Should', last_name: 'NotExist' });
      assert.equal(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
      const { rows } = await pool.query(
        `SELECT 1 FROM people WHERE company_id = $1 AND first_name = 'Should' AND last_name = 'NotExist'`,
        [demoId]);
      assert.equal(rows.length, 0, 'Non-admin POST created a person');
    });

    test('PATCH /api/people/:id → 403', async () => {
      const res = await request(app)
        .patch(`/api/people/${demoPersonId}`)
        .set('Cookie', nonAdminCookie)
        .send({ first_name: 'Hacked' });
      assert.equal(res.status, 403);
    });

    test('DELETE /api/people/:id → 403', async () => {
      const res = await request(app)
        .delete(`/api/people/${demoPersonId}`).set('Cookie', nonAdminCookie);
      assert.equal(res.status, 403);
    });

    test('POST /api/credentials → 403', async () => {
      const res = await request(app)
        .post('/api/credentials')
        .set('Cookie', nonAdminCookie)
        .send({ credential_name: 'x', credential_type: 'pin', credential_value: '11223' });
      assert.equal(res.status, 403);
    });

    test('PATCH /api/devices/:id → 403', async () => {
      const res = await request(app)
        .patch(`/api/devices/${demoDeviceId}`)
        .set('Cookie', nonAdminCookie)
        .send({ device_name: 'Hacked' });
      assert.equal(res.status, 403);
    });

    test('platform + reseller surfaces → 403', async () => {
      for (const path of ['/api/companies', '/api/platform/devices', '/api/audit', '/api/reseller/customers']) {
        const res = await request(app).get(path).set('Cookie', nonAdminCookie);
        assert.equal(res.status, 403, `${path}: expected 403, got ${res.status}`);
      }
    });
  });

  // ── Unauthenticated ─────────────────────────────────────────────────────

  describe('Unauthenticated requests → 401', () => {
    test('object reads and mutations require a session', async () => {
      const attempts = [
        ['get',    `/api/people/${demoPersonId}`],
        ['get',    `/api/devices/${demoDeviceId}`],
        ['get',    '/api/credentials'],
        ['post',   '/api/people'],
        ['patch',  `/api/people/${demoPersonId}`],
        ['delete', `/api/people/${demoPersonId}`],
        ['get',    '/api/reseller/customers'],
        ['get',    '/api/companies'],
        ['get',    '/api/audit'],
      ];
      for (const [method, path] of attempts) {
        const res = await request(app)[method](path);
        assert.equal(res.status, 401, `${method.toUpperCase()} ${path}: expected 401, got ${res.status}`);
      }
    });
  });
});
