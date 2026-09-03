/**
 * FeaturesContext — the platform's feature flags for the current session.
 *
 * Loaded once the user is known (GET /api/features) and exposed as
 * `useFeatures().enabled(key)`. While loading — and if the request fails —
 * every feature reads as enabled, so nothing pops out of the page after
 * first paint and a flag-service hiccup never hides working features; the
 * API enforces the flags regardless.
 *
 * A platform-wide "off" hides the feature's UI outright. That is distinct
 * from a hardware capability gate (useDeviceCapabilities), which keeps the
 * control in place and greys it: one says "not offered", the other "this
 * board can't".
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { featuresApi, type FeatureFlags, type FeatureKey } from '../services/platform/features';
import { useAuth } from './AuthContext';

interface FeaturesValue {
  features: FeatureFlags | null;
  loading: boolean;
  enabled: (key: FeatureKey) => boolean;
  reload: () => Promise<void>;
}

const FeaturesContext = createContext<FeaturesValue | null>(null);

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [features, setFeatures] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setFeatures(await featuresApi.snapshot());
    } catch {
      setFeatures(null); // fail open — see header
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void reload();
    else setFeatures(null);
  }, [user, reload]);

  const value = useMemo<FeaturesValue>(() => ({
    features,
    loading,
    enabled: (key) => features?.[key] !== false,
    reload,
  }), [features, loading, reload]);

  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

export function useFeatures(): FeaturesValue {
  const ctx = useContext(FeaturesContext);
  if (!ctx) throw new Error('useFeatures must be used within FeaturesProvider');
  return ctx;
}
