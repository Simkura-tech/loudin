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
};
