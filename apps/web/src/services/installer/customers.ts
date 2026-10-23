/**
 * Installer home — the customer workspaces this installer company may work
 * in, opening a service session inside one, and provisioning a brand-new
 * customer (/api/installer/…).
 *
 * startSession swaps the auth cookie for one scoped to the customer; the
 * caller must `refresh()` the AuthContext afterwards. The session ends via
 * auth.endImpersonation() (same endpoint the old platform view-as used).
 */

import api from '../api';
import type { InstallerGrant } from '../tenancy/installers';
import type { CreateCompanyPayload, CreateCompanyResult } from '../platform/companies';

/** POST /api/installer/customers — always creates an end-user company. */
export type CreateCustomerPayload = Omit<CreateCompanyPayload, 'company_type'>;

/** The platform create result plus the grant that was issued to us. */
export interface CreateCustomerResult extends CreateCompanyResult {
  grant: InstallerGrant;
}

export const installerApi = {
  customers: () =>
    api.get<{ customers: InstallerGrant[] }, { customers: InstallerGrant[] }>('/api/installer/customers')
      .then((r) => r.customers),

  /** Installer Admins only. Creates the customer, invites its first admin
   *  and grants this installer access, in one call. */
  createCustomer: (payload: CreateCustomerPayload) =>
    api.post<CreateCustomerResult, CreateCustomerResult>('/api/installer/customers', payload),

  startSession: (customerCompanyId: number) =>
    api.post<{ ok: true; company: { id: number; name: string } }, { ok: true; company: { id: number; name: string } }>(
      `/api/installer/customers/${customerCompanyId}/session`,
    ),
};
