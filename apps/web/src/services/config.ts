/**
 * Public instance config — GET /api/config.
 *
 * Unauthenticated: the login/signup pages read this before any session
 * exists (e.g. whether this deployment allows open self-signup — see
 * docs/deployment-shapes.md). Keep the shape minimal; everything here is
 * visible to the whole internet.
 */

import api from './api';

export interface PublicConfig {
  signups_enabled: boolean;
}

export const configApi = {
  get: () => api.get<PublicConfig, PublicConfig>('/api/config'),
};

/**
 * Fetch the instance config, falling back to permissive defaults when the
 * API is unreachable — the backend enforces the real policy either way,
 * this only drives cosmetic hiding/showing.
 */
export async function fetchPublicConfig(): Promise<PublicConfig> {
  try {
    return await configApi.get();
  } catch {
    return { signups_enabled: true };
  }
}
