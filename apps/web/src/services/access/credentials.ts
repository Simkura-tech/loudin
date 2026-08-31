/**
 * Credentials API client.
 *
 * Credentials = PINs / HID cards / MIFARE cards owned by a person.
 * Tenant-scoped server-side; no need to pass a company filter.
 */

import api from '../api';

export type CredentialType   = 'pin' | 'HID' | 'mifare';
export type CredentialStatus = 'active' | 'inactive';

export interface Credential {
  id: number;
  person_id: number | null;
  /**
   * Owner snapshot from a LEFT JOIN on the credentials list endpoint.
   * Present on GET /api/credentials; absent (null) on responses from
   * endpoints that don't join — treat as optional.
   */
  person_first_name?: string | null;
  person_last_name?: string | null;
  person_employee_id?: string | null;
  credential_name: string;
  credential_type: CredentialType;
  credential_value: string | null;   // PIN, plaintext (firmware compares plain)
  facility_code: string | null;      // HID/mifare
  card_number: string | null;        // HID/mifare
  status: CredentialStatus;
  valid_from: string | null;
  valid_until: string | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CredentialPayload {
  person_id?: number | null;
  credential_name: string;
  credential_type: CredentialType;
  credential_value?: string | null;
  facility_code?: string | null;
  card_number?: string | null;
  status?: CredentialStatus;
  valid_from?: string | null;
  valid_until?: string | null;
  description?: string | null;
  notes?: string | null;
}

export interface ListParams {
  person_id?: number;
  status?: CredentialStatus;
  type?: CredentialType;
}

export const credentialsApi = {
  list: (params: ListParams = {}) =>
    api.get<{ credentials: Credential[] }, { credentials: Credential[] }>('/api/credentials', { params })
       .then((r) => r.credentials),

  create: (payload: CredentialPayload) =>
    api.post<{ credential: Credential }, { credential: Credential }>('/api/credentials', payload)
       .then((r) => r.credential),

  // credential_type is immutable; the server rejects updates that include it.
  update: (id: number, payload: Partial<Omit<CredentialPayload, 'credential_type'>>) =>
    api.patch<{ credential: Credential }, { credential: Credential }>(`/api/credentials/${id}`, payload)
       .then((r) => r.credential),

  remove: (id: number) =>
    api.delete<void, void>(`/api/credentials/${id}`),
};
