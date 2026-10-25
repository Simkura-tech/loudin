/**
 * Self-service profile + password endpoints.
 *
 * Read-side (the current user) is on /api/auth/me — handled by AuthContext.
 */

import api from '../api';
import type { AuthUser } from './auth';

export interface ProfilePatch {
  first_name?: string;
  last_name?: string;
  phone_number?: string | null;
}

export interface PasswordChangePayload {
  current_password: string;
  new_password: string;
}

export interface EmailChangeResult {
  ok: boolean;
  pending_email: string;
  destination_hint: string;
  delivery_method: 'email' | 'console';
}

export const meApi = {
  updateProfile: (payload: ProfilePatch) =>
    api.patch<{ user: AuthUser }, { user: AuthUser }>('/api/me', payload).then((r) => r.user),

  changePassword: (payload: PasswordChangePayload) =>
    api.post<{ success: boolean }, { success: boolean }>('/api/me/password', payload),

  /**
   * Start an email change. Sends a confirmation code TO the new address;
   * nothing changes until confirmEmailChange(). current_password is required
   * for password accounts (OAuth-only accounts omit it).
   */
  requestEmailChange: (new_email: string, current_password?: string) =>
    api.post<EmailChangeResult, EmailChangeResult>('/api/me/email',
      { new_email, current_password }),

  /** Finish an email change by submitting the code sent to the new address. */
  confirmEmailChange: (code: string) =>
    api.post<{ user: AuthUser }, { user: AuthUser }>('/api/me/email/confirm', { code })
      .then((r) => r.user),
};
