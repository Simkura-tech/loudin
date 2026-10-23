/**
 * Installer access — the grants that let an installer company work inside a
 * customer workspace (apps/api/services/tenancy/installers.js).
 *
 * This module is the CUSTOMER side (/api/workspace/installers…): an end-user
 * admin deciding who may service their doors. The installer's own side is
 * services/installer/customers.ts; the platform's is in platform/companies.ts.
 * The InstallerGrant shape is shared by all three.
 */

import api from '../api';

export interface InstallerGrant {
  id: number;
  installer: {
    id: number;
    name: string;
    company_email: string | null;
    status: string;
  };
  customer: {
    id: number;
    name: string;
    status: string;
    city: string | null;
    state: string | null;
    device_count?: number;
    user_count?: number;
  };
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
}

/** An installer company as shown in the "grant access" picker. */
export interface InstallerCompany {
  id: number;
  name: string;
  company_email: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export const installerAccessApi = {
  list: () =>
    api.get<{ grants: InstallerGrant[] }, { grants: InstallerGrant[] }>('/api/workspace/installers')
      .then((r) => r.grants),

  available: (search?: string) =>
    api.get<{ installers: InstallerCompany[] }, { installers: InstallerCompany[] }>(
      '/api/workspace/installers/available', { params: search ? { search } : {} },
    ).then((r) => r.installers),

  grant: (installerCompanyId: number) =>
    api.post<{ grant: InstallerGrant; created: boolean }, { grant: InstallerGrant; created: boolean }>(
      '/api/workspace/installers', { installer_company_id: installerCompanyId },
    ),

  revoke: (grantId: number) =>
    api.delete<{ grant: InstallerGrant }, { grant: InstallerGrant }>(`/api/workspace/installers/${grantId}`)
      .then((r) => r.grant),
};
