/**
 * Reseller API client — endpoints scoped to the signed-in reseller's
 * portfolio (their end-user companies). Server enforces both the
 * company_type='reseller' gate AND tenant filtering.
 */

import api from '../api';
import type { CompanyStatus, CompanyDeviceRow, CompanyUser } from '../platform/companies';

export interface ManagedCustomer {
  id:                  number;
  name:                string;
  status:              CompanyStatus;
  company_email:       string | null;
  parent_locked_at:    string | null;
  created_at:          string;
  user_count:          number;
  device_count:        number;
}

export interface ListCustomersParams {
  search?: string;
  status?: CompanyStatus;
  limit?:  number;
  offset?: number;
}

export interface ListCustomersResponse {
  customers: ManagedCustomer[];
  total:     number;
  limit:     number;
  offset:    number;
}

export interface ManagedCustomerDetail {
  id:                  number;
  name:                string;
  status:              CompanyStatus;
  company_email:       string | null;
  company_phone:       string | null;
  company_url:         string | null;
  street:  string | null;
  city:    string | null;
  state:   string | null;
  zip:     string | null;
  country: string | null;
  parent_locked_at:    string | null;
  created_at:          string;
  updated_at:          string;
  user_count:          number;
  device_count:        number;
}

export interface CustomerInvite {
  token:      string;
  created_at: string;
}

export const resellerApi = {
  customers: (params: ListCustomersParams = {}) =>
    api.get<ListCustomersResponse, ListCustomersResponse>(
      '/api/reseller/customers',
      { params },
    ),

  customer: (id: number) =>
    api.get<{ customer: ManagedCustomerDetail }, { customer: ManagedCustomerDetail }>(
      `/api/reseller/customers/${id}`,
    ).then((r) => r.customer),

  customerDevices: (id: number) =>
    api.get<{ devices: CompanyDeviceRow[]; total: number }, { devices: CompanyDeviceRow[]; total: number }>(
      `/api/reseller/customers/${id}/devices`,
    ).then((r) => r.devices),

  customerUsers: (id: number) =>
    api.get<{ users: CompanyUser[]; total: number }, { users: CompanyUser[]; total: number }>(
      `/api/reseller/customers/${id}/users`,
    ).then((r) => r.users),

  devices: (params: ListFleetParams = {}) =>
    api.get<ListFleetResponse, ListFleetResponse>('/api/reseller/devices', { params }),

  /** Start an impersonation session — server swaps the auth cookie to a
   *  short-lived token scoped to this customer's workspace. Call
   *  AuthContext.refresh() after. */
  impersonateCustomer: (id: number) =>
    api.post<
      { ok: true; impersonating: { company_id: number; company_name: string; scope: string[]; started_at: string } },
      { ok: true; impersonating: { company_id: number; company_name: string; scope: string[]; started_at: string } }
    >(`/api/reseller/customers/${id}/impersonate`),

  /** Current customer-invite token, or null if none has been generated. */
  invite: () =>
    api.get<{ invite: CustomerInvite | null }, { invite: CustomerInvite | null }>(
      '/api/reseller/invite',
    ).then((r) => r.invite),

  /** Generate the invite token, or replace the existing one (old links
   *  stop working immediately). */
  rotateInvite: () =>
    api.post<{ invite: CustomerInvite }, { invite: CustomerInvite }>(
      '/api/reseller/invite/rotate',
    ).then((r) => r.invite),

  /** Email the invite link to a prospective customer from the platform.
   *  Creates the token if none exists yet. `delivered: 'console'` means
   *  the dev environment has no email provider and the payload went to
   *  the API server log. */
  sendInvite: (email: string) =>
    api.post<
      { ok: true; delivered: 'email' | 'console'; invite: CustomerInvite },
      { ok: true; delivered: 'email' | 'console'; invite: CustomerInvite }
    >('/api/reseller/invite/send', { email }),
};

export interface FleetDevice {
  id:                number;
  device_id:         string;
  device_type:       string;
  firmware_version:  string | null;
  device_name:       string;
  location:          string | null;
  notes:             string | null;
  status:            'online' | 'offline' | 'error' | 'maintenance';
  door_state:        'locked' | 'unlocked' | 'lockdown' | 'unknown';
  battery_percent:   number | null;
  power_mode:        'active' | 'sleep' | 'deep_sleep';
  last_seen:         string | null;
  created_at:        string;
  updated_at:        string;
  customer_id:       number;
  customer_name:     string;
  customer_status:   CompanyStatus;
}

export interface ListFleetParams {
  search?:      string;
  status?:      FleetDevice['status'];
  customer_id?: number;
  limit?:       number;
  offset?:      number;
}

export interface ListFleetResponse {
  devices: FleetDevice[];
  total:   number;
  limit:   number;
  offset:  number;
}
