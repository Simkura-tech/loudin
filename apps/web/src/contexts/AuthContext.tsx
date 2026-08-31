/**
 * AuthContext — single source of truth for the current session.
 *
 * On mount, probes /api/auth/me. After login / register / logout the relevant
 * action updates the in-memory user and returns. Children use `useAuth()`.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  auth,
  isPending2fa,
  type AuthUser,
  type LoginResult,
  type RegisterPayload,
} from '../services/auth/auth';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /**
   * Returns either the AuthUser (fully signed in) or the pending-2FA
   * handshake the caller must complete via `completeLogin2fa`.
   * On full success the context's user is updated.
   */
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Submit the OTP code that was delivered during a pending-2FA login. */
  completeLogin2fa: (pendingToken: string, code: string) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const u = await auth.me();
    setUser(u);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await auth.login(email, password);
    if (!isPending2fa(r)) setUser(r.user);
    return r;
  }, []);

  const completeLogin2fa = useCallback(async (pendingToken: string, code: string) => {
    const u = await auth.verify2fa(pendingToken, code);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const u = await auth.register(payload);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, completeLogin2fa, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
