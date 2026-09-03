/**
 * Platform feature flags.
 *
 *   GET /api/features            any signed-in user → { key: boolean }
 *   GET /api/platform/features   platform admin → registry with state
 *   PUT /api/platform/features   platform admin → { features: { key: bool } }
 *
 * Off means the API refuses the feature's routes with 403 `feature_disabled`
 * and the web app hides its UI (FeaturesContext). The key list mirrors the
 * API registry in services/platform/featureFlags.js.
 */

import api from '../api';

export type FeatureKey =
  | 'schedules'
  | 'holidays'
  | 'door_mode'
  | 'momentary_unlock'
  | 'provisioning'
  | 'maintenance';

export type FeatureFlags = Record<FeatureKey, boolean>;

export interface FeatureInfo {
  key: FeatureKey;
  label: string;
  description: string;
  enabled: boolean;
}

export const featuresApi = {
  /** Effective flags for the current platform. */
  snapshot: () =>
    api.get<{ features: FeatureFlags }, { features: FeatureFlags }>('/api/features')
      .then((r) => r.features),
};

export const platformFeaturesApi = {
  list: () =>
    api.get<{ features: FeatureInfo[] }, { features: FeatureInfo[] }>('/api/platform/features')
      .then((r) => r.features),

  update: (features: Partial<FeatureFlags>) =>
    api.put<{ features: FeatureInfo[] }, { features: FeatureInfo[] }>('/api/platform/features', { features })
      .then((r) => r.features),
};
