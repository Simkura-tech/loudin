/**
 * Invite acceptance — the invitee's side of /api/auth/invites/*.
 *
 * Unauthenticated: the URL token is the credential. On a successful accept
 * the server sets the session cookie, so callers should `refresh()` the
 * AuthContext and navigate into the app.
 */

import api from '../api';
import type { AuthUser } from './auth';

export interface InvitePreview {
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: 'admin' | 'user';
  company_name: string;
  invited_by: string | null;
  expires_at: string;
}

export interface AcceptInvitePayload {
  first_name: string;
  last_name: string;
  password: string;
  terms_accepted: true;
}

export const invitesApi = {
  preview: (token: string) =>
    api
      .get<{ invite: InvitePreview }, { invite: InvitePreview }>(
        `/api/auth/invites/${encodeURIComponent(token)}`,
      )
      .then((r) => r.invite),

  accept: (token: string, payload: AcceptInvitePayload) =>
    api
      .post<{ user: AuthUser }, { user: AuthUser }>(
        `/api/auth/invites/${encodeURIComponent(token)}/accept`,
        payload,
      )
      .then((r) => r.user),
};
