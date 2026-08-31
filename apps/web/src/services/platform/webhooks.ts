/**
 * Platform outbound webhooks — register destinations, browse deliveries.
 *
 * All endpoints under /api/platform/webhooks are gated by cookie auth +
 * requirePlatformAdmin. The signing secret is returned in full on create and
 * rotate-secret; list/get return only a masked `secret_hint`.
 */

import api from '../api';

export type WebhookStatus = 'active' | 'paused' | 'disabled';

export interface WebhookEndpoint {
  id: number;
  name: string;
  url: string;
  event_types: string[];
  active: boolean;
  status: WebhookStatus;
  secret_hint: string | null;
  /** Full plaintext — present only on create / rotate responses. */
  secret?: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
}

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

export interface WebhookDelivery {
  id: number;
  endpoint_id: number;
  event_id: string;
  event_type: string;
  status: DeliveryStatus;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_status_code: number | null;
  last_error: string | null;
  response_snippet: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
}

export interface WebhookListResponse {
  endpoints: WebhookEndpoint[];
  available_events: string[];
}

export const webhooksApi = {
  list: () =>
    api.get<WebhookListResponse, WebhookListResponse>('/api/platform/webhooks'),

  create: (payload: { name: string; url: string; event_types: string[] }) =>
    api.post<{ endpoint: WebhookEndpoint }, { endpoint: WebhookEndpoint }>(
      '/api/platform/webhooks', payload,
    ).then((r) => r.endpoint),

  update: (id: number, patch: Partial<{ name: string; url: string; event_types: string[]; active: boolean }>) =>
    api.patch<{ endpoint: WebhookEndpoint }, { endpoint: WebhookEndpoint }>(
      `/api/platform/webhooks/${id}`, patch,
    ).then((r) => r.endpoint),

  remove: (id: number) =>
    api.delete<void, void>(`/api/platform/webhooks/${id}`),

  rotateSecret: (id: number) =>
    api.post<{ endpoint: WebhookEndpoint }, { endpoint: WebhookEndpoint }>(
      `/api/platform/webhooks/${id}/rotate-secret`, {},
    ).then((r) => r.endpoint),

  deliveries: (id: number) =>
    api.get<{ deliveries: WebhookDelivery[] }, { deliveries: WebhookDelivery[] }>(
      `/api/platform/webhooks/${id}/deliveries`,
    ).then((r) => r.deliveries),

  redeliver: (deliveryId: number) =>
    api.post<{ delivery: { id: number; status: string } }, { delivery: { id: number; status: string } }>(
      `/api/platform/webhooks/deliveries/${deliveryId}/redeliver`, {},
    ),
};
