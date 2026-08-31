/**
 * Companies API client — Platform Admin only.
 *
 * For end-user / reseller admins, the equivalent "your own company" surface
 * is services/workspace.ts. This client targets /api/companies which is
 * gated server-side by requirePlatformAdmin.
 */

import api from '../api';

export type CompanyType   = 'platform' | 'end_user' | 'reseller';
export type CompanyStatus = 'active' | 'inactive' | 'suspended' | 'canceled';

export type CancellationReasonCode =
  | 'cost'
  | 'switched_competitor'
  | 'missing_features'
  | 'unused'
  | 'business_closed'
  | 'poor_quality'
  | 'exploring'
  | 'other';

/** Keep in sync with ALLOWED_CANCELLATION_REASON_CODES in
 *  apps/api/controllers/companies.js. */
export const CANCELLATION_REASONS: { code: CancellationReasonCode; label: string }[] = [
  { code: 'cost',                label: 'Cost / pricing' },
  { code: 'switched_competitor', label: 'Switched to a competitor' },
  { code: 'missing_features',    label: 'Missing features' },
  { code: 'unused',              label: 'No longer needed' },
  { code: 'business_closed',     label: 'Business closed or merged' },
  { code: 'poor_quality',        label: 'Service quality issues' },
  { code: 'other',               label: 'Other' },
];

export interface Company {
  id: number;
  name: string;
  company_type: CompanyType;
  status: CompanyStatus;
  parent_company_id: number | null;
  parent_company_name: string | null;
  parent_locked_at: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_url: string | null;
  street:  string | null;
  city:    string | null;
  state:   string | null;
  zip:     string | null;
  country: string | null;
  user_count: number;
  device_count: number;
  // Lifecycle audit
  suspended_at:             string | null;
  suspended_by:             number | null;
  suspension_reason:        string | null;
  reactivated_at:           string | null;
  reactivated_by:           number | null;
  canceled_at:              string | null;
  canceled_by:              number | null;
  cancellation_reason:      string | null;
  cancellation_reason_code: CancellationReasonCode | null;
  created_at: string;
  updated_at: string;
}

export interface ListResponse {
  companies: Company[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListParams {
  search?: string;
  type?: CompanyType;
  status?: CompanyStatus;
  limit?: number;
  offset?: number;
}

// Subset of users.* fields that the /companies/:id/users endpoint returns.
export interface CompanyUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  user_type_id: number;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

// Same shape as devices in the tenant view — duplicated here so consumers
// don't need to import from services/devices just to read the type.
export interface CompanyDeviceRow {
  id: number;
  device_id: string;
  device_type: string;
  firmware_version: string | null;
  device_name: string;
  location: string | null;
  notes: string | null;
  status: string;
  door_state: string;
  battery_percent: number | null;
  power_mode: string;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export const companiesApi = {
  list: (params: ListParams = {}) =>
    api.get<ListResponse, ListResponse>('/api/companies', { params }),

  get: (id: number) =>
    api.get<{ company: Company }, { company: Company }>(`/api/companies/${id}`).then((r) => r.company),

  users: (id: number) =>
    api.get<{ users: CompanyUser[]; total: number }, { users: CompanyUser[]; total: number }>(
      `/api/companies/${id}/users`,
    ).then((r) => r.users),

  devices: (id: number) =>
    api.get<{ devices: CompanyDeviceRow[]; total: number }, { devices: CompanyDeviceRow[]; total: number }>(
      `/api/companies/${id}/devices`,
    ).then((r) => r.devices),

  suspend: (id: number, reason: string) =>
    api.post<{ ok: true }, { ok: true }>(`/api/companies/${id}/suspend`, { reason }),

  reactivate: (id: number) =>
    api.post<{ ok: true }, { ok: true }>(`/api/companies/${id}/reactivate`),

  cancel: (id: number, reason_code: CancellationReasonCode, details?: string) =>
    api.post<{ ok: true }, { ok: true }>(`/api/companies/${id}/cancel`, {
      reason_code,
      details: details ?? null,
    }),

  /** Platform-admin override of an end-user's reseller link. Pass
   *  reseller_id=null to detach (move back to Direct). */
  setReseller: (id: number, reseller_id: number | null) =>
    api.post<{ ok: true }, { ok: true }>(`/api/companies/${id}/reseller`, { reseller_id }),

  /**
   * Terminate a reseller (irreversible). Unlocks every end-user under
   * the reseller and stamps canceled_*.
   *
   * Returns the count of end-users that were unlocked.
   */
  terminateReseller: (id: number, reason_code: CancellationReasonCode, details?: string) =>
    api.post<
      { ok: true; end_users_unlocked: number },
      { ok: true; end_users_unlocked: number }
    >(`/api/companies/${id}/terminate`, {
      reason_code,
      details: details ?? null,
    }),
};
