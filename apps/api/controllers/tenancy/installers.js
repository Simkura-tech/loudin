/**
 * Installer access — three faces of the same grants table
 * (services/tenancy/installers.js, migration 092).
 *
 *   workspace.*  — a CUSTOMER admin managing who may service their doors
 *                  (/api/workspace/installers…)
 *   installer.*  — an INSTALLER user listing their customers, opening a
 *                  service session inside one, or (Admins) provisioning a
 *                  new customer that arrives pre-granted (/api/installer/…)
 *   platform.*   — the PLATFORM admin granting/revoking on anyone's behalf
 *                  (/api/companies/:id/installers…, /api/companies/:id/customers)
 *
 * A service session is the old impersonation token with the installer as
 * actor: req.user.company_id becomes the customer, so every tenant-scoped
 * controller works unchanged, and req.impersonation names the installer for
 * the audit log and the UI banner. Ending one is POST /api/auth/end-impersonation.
 */

const { query } = require('../../database/db');
const installers = require('../../services/tenancy/installers');
const { recordAudit } = require('../../services/platform/audit');
const events = require('../../integrations/events');
const { generateServiceSessionToken } = require('../../utils/jwt');
const { setAuthCookie } = require('../../utils/authCookie');
const { provisionCompany, isProvisionError } = require('../../services/tenancy/provisioning');
const { provisionResponse } = require('./companies');

function sendInstallerError(res, err) {
  if (err instanceof installers.InstallerError) {
    return res.status(err.status).json({ error: err.code, code: err.code, message: err.message });
  }
  return null;
}

function emitGranted(grant, actorUserId, source) {
  void events.emit('installer.granted', {
    company:   { id: grant.customer.id, type: 'end_user' },
    installer: { company_id: grant.installer.id, name: grant.installer.name },
    actor:     { user_id: actorUserId },
    source,
  });
}
function emitRevoked(grant, actorUserId, source) {
  void events.emit('installer.revoked', {
    company:   { id: grant.customer.id, type: 'end_user' },
    installer: { company_id: grant.installer.id, name: grant.installer.name },
    actor:     { user_id: actorUserId },
    source,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Customer side — /api/workspace/installers
// ═════════════════════════════════════════════════════════════════════════════

const workspace = {
  // GET /api/workspace/installers — active grants on my workspace
  async list(req, res, next) {
    try {
      const grants = await installers.listGrantsForCustomer(req.user.company_id);
      return res.json({ grants });
    } catch (err) { return next(err); }
  },

  // GET /api/workspace/installers/available?search= — installer companies to pick from
  async available(req, res, next) {
    try {
      const companies = await installers.listInstallerCompanies({ search: req.query.search });
      return res.json({ installers: companies });
    } catch (err) { return next(err); }
  },

  // POST /api/workspace/installers { installer_company_id }
  async grant(req, res, next) {
    try {
      const { installer_company_id } = req.body || {};
      const { grant, created } = await installers.grant({
        installerCompanyId: installer_company_id,
        customerCompanyId:  req.user.company_id,
        grantedBy:          req.user.user_id,
      });
      if (created) {
        recordAudit(req, 'installer.grant', {
          target_type: 'company', target_id: grant.installer.id,
          metadata: { grant_id: grant.id, installer: grant.installer.name, source: 'customer' },
        });
        emitGranted(grant, req.user.user_id, 'customer');
      }
      return res.status(created ? 201 : 200).json({ grant, created });
    } catch (err) {
      if (sendInstallerError(res, err)) return undefined;
      return next(err);
    }
  },

  // DELETE /api/workspace/installers/:grantId
  async revoke(req, res, next) {
    try {
      const { grant, changed } = await installers.revoke({
        grantId:           req.params.grantId,
        revokedBy:         req.user.user_id,
        customerCompanyId: req.user.company_id,
      });
      if (changed) {
        recordAudit(req, 'installer.revoke', {
          target_type: 'company', target_id: grant.installer.id,
          metadata: { grant_id: grant.id, installer: grant.installer.name, source: 'customer' },
        });
        emitRevoked(grant, req.user.user_id, 'customer');
      }
      return res.json({ grant });
    } catch (err) {
      if (sendInstallerError(res, err)) return undefined;
      return next(err);
    }
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Installer side — /api/installer
// ═════════════════════════════════════════════════════════════════════════════

const installer = {
  // GET /api/installer/customers — workspaces I may work in
  async customers(req, res, next) {
    try {
      const grants = await installers.listCustomersForInstaller(req.user.company_id);
      return res.json({ customers: grants });
    } catch (err) { return next(err); }
  },

  // POST /api/installer/customers — provision a brand-new customer workspace
  //   { name, admin_email, admin_first_name?, admin_last_name?, company_email? }
  //
  // Creates the end-user company, invites its first admin, and grants this
  // installer access in the same request, so the technician can open the
  // workspace and start deploying doors before the customer has signed in.
  // Installer Admins only (route). The customer keeps the usual controls:
  // they can revoke the grant the moment they accept their invite.
  async createCustomer(req, res, next) {
    try {
      // The grant step requires an active installer; check first so a
      // suspended installer never leaves an orphan customer behind.
      const { rows: [home] } = await query(
        `SELECT id, name, status FROM companies WHERE id = $1 AND deleted_at IS NULL`,
        [req.user.company_id]
      );
      if (!home || home.status !== 'active') {
        return res.status(409).json({
          error: 'Conflict', code: 'INSTALLER_INACTIVE',
          message: 'Your company must be active to create customers.',
        });
      }

      const { name, company_email, admin_email, admin_first_name, admin_last_name } = req.body || {};
      const result = await provisionCompany({
        name,
        companyType:    'end_user',
        companyEmail:   company_email,
        adminEmail:     admin_email,
        adminFirstName: admin_first_name,
        adminLastName:  admin_last_name,
        createdBy:      req.user.user_id,
      });
      const { company } = result;

      const { grant } = await installers.grant({
        installerCompanyId: req.user.company_id,
        customerCompanyId:  company.id,
        grantedBy:          req.user.user_id,
      });

      recordAudit(req, 'company.create', {
        target_type: 'company', target_id: company.id,
        metadata: { name: company.name, company_type: 'end_user', admin_email: result.adminEmail,
                    delivery: result.delivery, source: 'installer' },
      });
      recordAudit(req, 'installer.grant', {
        target_type: 'company', target_id: company.id,
        metadata: { grant_id: grant.id, installer: grant.installer.name, source: 'installer' },
      });
      void events.emit('company.created', {
        company:   { id: company.id, type: 'end_user' },
        actor:     { user_id: req.user.user_id },
        source:    'installer',
        installer: { company_id: home.id, name: home.name },
      });
      emitGranted(grant, req.user.user_id, 'installer');

      return res.status(201).json({ ...provisionResponse(result), grant });
    } catch (err) {
      if (isProvisionError(err)) {
        return res.status(err.status).json({ error: err.code, code: err.code, message: err.message });
      }
      if (sendInstallerError(res, err)) return undefined;
      return next(err);
    }
  },

  // POST /api/installer/customers/:companyId/session — open a service session
  //
  // Swaps the cookie for a token scoped to the customer company, with an
  // impersonation block naming this installer as the actor. The user's own
  // role (Admin / User) carries over.
  async startSession(req, res, next) {
    try {
      if (req.impersonation) {
        return res.status(409).json({
          error: 'Conflict', code: 'SESSION_ACTIVE',
          message: 'Exit the current customer workspace before opening another.',
        });
      }
      const customerId = Number(req.params.companyId);
      if (!Number.isInteger(customerId)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid company id' });
      }
      const ok = await installers.hasActiveGrant(req.user.company_id, customerId);
      if (!ok) {
        return res.status(403).json({
          error: 'Forbidden', code: 'NO_GRANT',
          message: 'This workspace has not granted your company access.',
        });
      }
      const { rows: [customer] } = await query(
        `SELECT id, name, company_type FROM companies WHERE id = $1 AND deleted_at IS NULL`, [customerId]
      );
      const { rows: [home] } = await query(
        `SELECT name FROM companies WHERE id = $1`, [req.user.company_id]
      );

      const token = generateServiceSessionToken({
        user_id:      req.user.user_id,
        company_id:   customer.id,
        user_type_id: req.user.user_type_id,
        email:        req.user.email,
        company_type: customer.company_type,
        impersonation: {
          impersonator_user_id:      req.user.user_id,
          impersonator_company_id:   req.user.company_id,
          impersonator_company_type: 'installer',
          scope:                     [],
          started_at:                new Date().toISOString(),
        },
      });
      setAuthCookie(res, token);

      recordAudit(
        { ...req, user: { ...req.user, company_id: customer.id },
          impersonation: { impersonator_company_id: req.user.company_id } },
        'installer.session_start',
        { target_type: 'company', target_id: customer.id,
          metadata: { installer: home?.name ?? null, customer: customer.name } }
      );

      return res.json({ ok: true, company: { id: customer.id, name: customer.name } });
    } catch (err) { return next(err); }
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Platform side — /api/companies/:id/installers, /api/companies/:id/customers
// ═════════════════════════════════════════════════════════════════════════════

const platform = {
  // GET /api/companies/:id/installers — grants on a customer company
  async listForCustomer(req, res, next) {
    try {
      const grants = await installers.listGrantsForCustomer(Number(req.params.id));
      return res.json({ grants });
    } catch (err) { return next(err); }
  },

  // GET /api/companies/:id/customers — grants held by an installer company
  async listForInstaller(req, res, next) {
    try {
      const customers = await installers.listCustomersForInstaller(Number(req.params.id));
      return res.json({ customers });
    } catch (err) { return next(err); }
  },

  // POST /api/companies/:id/installers { installer_company_id } — grant on the customer's behalf
  async grant(req, res, next) {
    try {
      const { installer_company_id } = req.body || {};
      const { grant, created } = await installers.grant({
        installerCompanyId: installer_company_id,
        customerCompanyId:  Number(req.params.id),
        grantedBy:          req.user.user_id,
      });
      if (created) {
        recordAudit(req, 'installer.grant', {
          target_type: 'company', target_id: grant.customer.id,
          metadata: { grant_id: grant.id, installer: grant.installer.name, source: 'platform' },
        });
        emitGranted(grant, req.user.user_id, 'platform');
      }
      return res.status(created ? 201 : 200).json({ grant, created });
    } catch (err) {
      if (sendInstallerError(res, err)) return undefined;
      return next(err);
    }
  },

  // DELETE /api/companies/:id/installers/:grantId
  async revoke(req, res, next) {
    try {
      const { grant, changed } = await installers.revoke({
        grantId:           req.params.grantId,
        revokedBy:         req.user.user_id,
        customerCompanyId: Number(req.params.id),
      });
      if (changed) {
        recordAudit(req, 'installer.revoke', {
          target_type: 'company', target_id: grant.customer.id,
          metadata: { grant_id: grant.id, installer: grant.installer.name, source: 'platform' },
        });
        emitRevoked(grant, req.user.user_id, 'platform');
      }
      return res.json({ grant });
    } catch (err) {
      if (sendInstallerError(res, err)) return undefined;
      return next(err);
    }
  },
};

module.exports = { workspace, installer, platform };
