/**
 * Members API client — the login users of the signed-in workspace and the
 * invites that add more of them.
 *
 * Not to be confused with People (/api/people), who hold door credentials
 * but have no software login. Admin-only on the backend; the server scopes
 * everything by the company on the session.
 */

import api from '../api';

export type MemberRole = 'admin' | 'user';
/** The statuses an admin can set. The server also has system-owned ones. */
export type MemberStatus = 'active' | 'inactive';
export type InviteState = 'pending' | 'expired' | 'revoked' | 'accepted';

export interface Member {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  user_type_id: number;
  role: MemberRole;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

export interface Invite {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: MemberRole;
  user_type_id: number;
  state: InviteState;
  invited_by: string | null;
  expires_at: string;
  created_at: string;
}

export interface MembersResponse {
  users: Member[];
  invites: Invite[];
}

export interface InvitePayload {
  email: string;
  first_name?: string;
  last_name?: string;
  /** Defaults to 'admin' on the server. */
  role?: MemberRole;
}

export interface MemberUpdatePayload {
  role?: MemberRole;
  status?: MemberStatus;
}

/** Returned by create + resend. accept_url is shown to the inviter only. */
export interface InviteResult {
  invite: Invite;
  accept_url: string;
  /** 'email' when the provider sent it; 'console' when no provider is configured. */
  delivery: 'email' | 'console';
  delivery_error?: string;
}

export const membersApi = {
  list: () =>
    api.get<MembersResponse, MembersResponse>('/api/workspace/members'),

  invite: (payload: InvitePayload) =>
    api.post<InviteResult, InviteResult>('/api/workspace/invites', payload),

  resend: (inviteId: number) =>
    api.post<InviteResult, InviteResult>(`/api/workspace/invites/${inviteId}/resend`),

  revoke: (inviteId: number) =>
    api.delete<{ invite: Invite }, { invite: Invite }>(`/api/workspace/invites/${inviteId}`),

  /**
   * Change a user's role and/or status. The server refuses to touch the
   * caller's own account (SELF_TARGET) or the last active admin (LAST_ADMIN).
   */
  update: (userId: number, payload: MemberUpdatePayload) =>
    api.patch<{ member: Member }, { member: Member }>(`/api/workspace/members/${userId}`, payload),

  /** Soft-delete a user. Same guards as update. */
  remove: (userId: number) =>
    api.delete<void, void>(`/api/workspace/members/${userId}`),

  /**
   * Admin-initiated password reset: email the user the ordinary reset code.
   * The admin never sees or sets the password — the user finishes on the
   * public /forgot-password flow. delivery_method is 'console' in dev with
   * no mail provider wired.
   */
  resetPassword: (userId: number) =>
    api.post<
      { ok: boolean; delivery_method: 'email' | 'console' },
      { ok: boolean; delivery_method: 'email' | 'console' }
    >(`/api/workspace/members/${userId}/reset-password`),
};
