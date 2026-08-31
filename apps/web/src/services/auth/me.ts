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

export const meApi = {
  updateProfile: (payload: ProfilePatch) =>
    api.patch<{ user: AuthUser }, { user: AuthUser }>('/api/me', payload).then((r) => r.user),

  changePassword: (payload: PasswordChangePayload) =>
    api.post<{ success: boolean }, { success: boolean }>('/api/me/password', payload),
};
