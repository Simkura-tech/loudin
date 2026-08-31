/**
 * Auth API client — thin wrapper over /api/auth/*.
 *
 * The api.ts axios instance returns response.data directly via interceptor,
 * so each call here returns the parsed body. Errors throw `Error(message)`
 * where message comes from the backend's `message` field.
 */

import api from '../api';

export type CompanyType = 'platform' | 'end_user' | 'reseller';

/** When the active session is a reseller acting "as" a customer, the
 *  /me response includes this block. Fields describe the actor's home
 *  tenant (the reseller), the impersonated workspace is the regular
 *  company_* fields on AuthUser. */
export interface ImpersonationState {
  impersonator_company_id:   number;
  impersonator_company_name: string;
  impersonator_company_type: CompanyType;
  scope:                     string[];   // e.g. ['people','devices']
  started_at:                string;     // ISO timestamp
}

export interface AuthUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  user_type_id: number;
  company_id: number;
  company_type: CompanyType;
  company_name: string;
  /** true when company_name is a signup-time placeholder (company field left
   *  blank at signup) — drives the "name your workspace" prompt. */
  name_auto_generated: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  two_factor_enabled: boolean;
  two_factor_channel: 'email' | 'sms' | null;
  /** Present only during impersonation sessions. */
  impersonation?: ImpersonationState;
}

interface AuthResponse {
  user: AuthUser;
}

/**
 * Response shape from /login. Either a fully authenticated user, or a
 * "pending 2FA" handshake the caller has to complete via /verify-2fa.
 */
export interface Pending2FA {
  pending_2fa:      true;
  pending_token:    string;
  channel:          'email' | 'sms';
  destination_hint: string;
  /** 'email' | 'sms' if the provider is wired, 'console' in dev. */
  delivery_method:  'email' | 'sms' | 'console';
}

export type LoginResult = { user: AuthUser; pending_2fa?: false } | Pending2FA;

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  /** Public self-signup creates end-user companies only. */
  companyType: 'end_user';
  /** End-user signups arriving through a reseller invite link. Re-resolved
   *  server-side; the new company is attached to the reseller at creation. */
  invite_token?: string;
  /** Required for every signup — confirms the ToS + Privacy Policy were accepted. */
  terms_accepted: true;
}

export interface ForgotPasswordResult {
  ok: boolean;
  /** Present only when the identifier matched a real user (so the UI can
   *  show "we sent a code to a••••@example.com"). */
  channel?:          'email' | 'sms';
  destination_hint?: string;
  delivery_method?:  'email' | 'sms' | 'console';
}

export const auth = {
  register: (payload: RegisterPayload) =>
    api.post<AuthResponse, AuthResponse>('/api/auth/register', payload).then((r) => r.user),

  login: (email: string, password: string) =>
    api.post<LoginResult, LoginResult>('/api/auth/login', { email, password }),

  /** Finish a pending-2FA login by submitting the code that was delivered. */
  verify2fa: (pendingToken: string, code: string) =>
    api.post<AuthResponse, AuthResponse>('/api/auth/verify-2fa',
      { pending_token: pendingToken, code }).then((r) => r.user),

  forgotPassword: (identifier: string, channel?: 'email' | 'sms') =>
    api.post<ForgotPasswordResult, ForgotPasswordResult>('/api/auth/forgot-password',
      { identifier, channel }),

  /** Resolve a reseller invite token (from a /signup?invite=… link) so the
   *  form can show who the invite is from. Throws (404) when the link has
   *  been rotated or the reseller is no longer active. */
  verifyInvite: (token: string) =>
    api.get<
      { ok: true; reseller: { name: string } },
      { ok: true; reseller: { name: string } }
    >(`/api/auth/invite/${encodeURIComponent(token)}`),

  resetPassword: (identifier: string, code: string, new_password: string) =>
    api.post<{ ok: boolean }, { ok: boolean }>('/api/auth/reset-password',
      { identifier, code, new_password }),

  logout: () => api.post<{ success: boolean }, { success: boolean }>('/api/auth/logout'),

  twoFactor: {
    enable: (channel: 'email' | 'sms') =>
      api.post<
        { channel: 'email'|'sms'; destination_hint: string; delivery_method: 'email'|'sms'|'console' },
        { channel: 'email'|'sms'; destination_hint: string; delivery_method: 'email'|'sms'|'console' }
      >('/api/auth/2fa/enable', { channel }),
    confirm: (channel: 'email' | 'sms', code: string) =>
      api.post<
        { two_factor_enabled: boolean; two_factor_channel: 'email'|'sms' },
        { two_factor_enabled: boolean; two_factor_channel: 'email'|'sms' }
      >('/api/auth/2fa/confirm', { channel, code }),
    disable: () =>
      api.post<{ two_factor_enabled: false }, { two_factor_enabled: false }>('/api/auth/2fa/disable'),
  },

  /**
   * Probe the current session. Returns the user when authenticated, null
   * otherwise. Uses the api.ts skip-401-redirect hatch so anonymous app loads
   * don't bounce to /login.
   */
  me: async (): Promise<AuthUser | null> => {
    try {
      const r = await api.get<AuthResponse, AuthResponse>('/api/auth/me');
      return r.user;
    } catch {
      return null;
    }
  },

  /** Exit an active impersonation session — server swaps the cookie back
   *  to the actor's normal JWT. Call AuthContext.refresh() after. */
  endImpersonation: () =>
    api.post<{ ok: true }, { ok: true }>('/api/auth/end-impersonation'),
};

export function isPending2fa(result: LoginResult): result is Pending2FA {
  return 'pending_2fa' in result && result.pending_2fa === true;
}

// TODO (dual-auth): add auth.loginWithPhone({ phone, password }) and
// auth.registerWithPhone(...) once the phone-based flow lands.

/**
 * URL for the "Continue with Google" button.
 *
 * This is a FULL-PAGE navigation (an <a href>), not an XHR — so it must point
 * at the API ORIGIN. In production the API is a separate host (VITE_API_BASE_URL,
 * the same base api.ts uses for XHR); a bare "/api/…" link would resolve
 * against the static frontend host, which has no /api route and serves the SPA
 * 404 instead. In dev VITE_API_BASE_URL is empty, so this stays relative and
 * the Vite proxy forwards /api → the API.
 *
 * The server runs the whole OAuth dance and redirects back to /app (or
 * /login?error=…) itself, so there's no client-side callback route to build.
 */
export function googleSignInUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  return `${base}/api/auth/google`;
}
