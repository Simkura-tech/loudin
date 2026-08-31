/**
 * Platform API keys — service-to-service tokens for 3rd-party integrations.
 *
 * All endpoints under /api/platform/api-keys are gated by the cookie auth
 * + requirePlatformAdmin. The plaintext token is returned exactly once,
 * on create — every subsequent list call returns only the prefix.
 */

import api from '../api';

export type ApiKeyStatus = 'active' | 'revoked';

export interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  created_by: number | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  status: ApiKeyStatus;
}

export interface ApiKeyListResponse {
  keys: ApiKey[];
  available_scopes: string[];
}

export interface CreateApiKeyResponse {
  key:   ApiKey;
  /** Plaintext. Returned once at create — never again. */
  token: string;
}

export const apiKeysApi = {
  list: () =>
    api.get<ApiKeyListResponse, ApiKeyListResponse>('/api/platform/api-keys'),

  create: (payload: { name: string; scopes: string[] }) =>
    api.post<CreateApiKeyResponse, CreateApiKeyResponse>(
      '/api/platform/api-keys',
      payload,
    ),

  revoke: (id: number) =>
    api.delete<void, void>(`/api/platform/api-keys/${id}`),
};
