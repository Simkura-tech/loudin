/**
 * Platform integration settings — registry-driven. The GET response carries
 * everything the UI needs to render one card per integration (label,
 * description, ordered fields with display metadata); the panel has no
 * integration-specific code.
 *
 * All endpoints under /api/platform/integrations are gated by cookie auth +
 * requirePlatformAdmin. Secret fields are write-only: reads return a masked
 * `hint`, never the stored value. Saving an empty string clears the DB
 * override and falls back to the server's env var.
 */

import api from '../api';

export type FieldSource = 'db' | 'env' | null;

export interface IntegrationField {
  label: string;
  secret: boolean;
  /** Where the effective value comes from: DB override, env var, or unset. */
  source: FieldSource;
  set: boolean;
  /** Present for non-secret fields. */
  value?: string | null;
  /** Present for secret fields — masked, e.g. "…abcd". */
  hint?: string | null;
  /** Optional input placeholder from the integration descriptor. */
  placeholder?: string;
  /** Optional help text shown under the field label. */
  help?: string;
}

export interface IntegrationStatus {
  configured: boolean;
  /**
   * Descriptors may add display-ready extras (e.g. Simkura's auth_mode:
   * "OAuth" | "API key"). String values are rendered as header pills.
   */
  [key: string]: unknown;
}

export interface IntegrationInfo {
  name: string;
  label: string;
  description: string | null;
  docs_url: string | null;
  /** Keyed by field slug; insertion order is the descriptor's field order. */
  fields: Record<string, IntegrationField>;
  status: IntegrationStatus;
}

export interface IntegrationsResponse {
  /** Registry order — render cards in this order. */
  integrations: IntegrationInfo[];
}

export interface ProbeResult {
  ok: boolean;
  latency_ms?: number;
  status?: number | null;
  reason?: string;
  error?: string;
}

export interface TestResponse {
  integration: string;
  api: ProbeResult;
}

export interface UpdateResponse extends IntegrationInfo {
  integration: string;
}

export interface IntegrationResponse {
  integration: IntegrationInfo;
}

export const integrationsApi = {
  list: () =>
    api.get<IntegrationsResponse, IntegrationsResponse>('/api/platform/integrations'),

  get: (name: string) =>
    api.get<IntegrationResponse, IntegrationResponse>(`/api/platform/integrations/${name}`),

  update: (name: string, values: Record<string, string>) =>
    api.put<UpdateResponse, UpdateResponse>(`/api/platform/integrations/${name}`, { values }),

  test: (name: string) =>
    api.post<TestResponse, TestResponse>(`/api/platform/integrations/${name}/test`, {}),
};
