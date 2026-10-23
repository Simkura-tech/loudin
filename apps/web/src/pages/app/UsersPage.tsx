/**
 * UsersPage — the login users of the signed-in workspace, plus the pending
 * invites that will add more of them.
 *
 * Not the same as People (/app/people): people hold door credentials and have
 * no software login; users sign in to run the workspace. The two share a
 * nav item and a People | Users switch (components/people/PeopleViewTabs).
 *
 * Backend: GET /api/workspace/members returns { users, invites } (admin-only).
 * Invites are created from InviteUserDialog and resent / revoked from the
 * table here. The server refuses invite writes on an impersonation session
 * (denyImpersonation), so those controls are hidden while impersonating.
 *
 * Per-user actions (PATCH / DELETE /api/workspace/members/:id): change role
 * inline, deactivate / reactivate, remove. The server refuses to touch the
 * caller's own row and the last active admin; the UI greys the self row and
 * surfaces the server's message for the rest.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconSearch,
  IconUserPlus,
  IconRefresh,
  IconTrash,
  IconUserOff,
  IconUserCheck,
  IconX,
} from '@tabler/icons-react';
import {
  membersApi,
  type Member,
  type Invite,
  type MemberRole,
  type MemberStatus,
} from '../../services/tenancy/members';
import InviteUserDialog from '../../components/people/InviteUserDialog';
import PeopleViewTabs from '../../components/people/PeopleViewTabs';
import { useAuth } from '../../contexts/AuthContext';

// ── Page chrome (mirrors PeoplePage) ──────────────────────────────────────────

const PageHeader = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;

  h1 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0 0 2px;
  }
  .sub {
    color: ${({ theme }) => theme.colors.text.secondary};
    font-size: 13px;
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  border: none;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary};
  }
`;

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`;

const SearchWrap = styled.div`
  position: relative;
  flex: 1;
  min-width: 220px;
  max-width: 360px;

  .icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  input {
    width: 100%;
    height: 32px;
    padding: 0 10px 0 32px;
    border-radius: 7px;
    border: 1px solid ${({ theme }) => theme.colors.border.light};
    background: ${({ theme }) => theme.colors.background.primary};
    color: ${({ theme }) => theme.colors.text.primary};
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;

    &:focus {
      outline: none;
      border-color: ${({ theme }) => theme.colors.brand.primary};
      box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
    }
  }
`;

const FilterSelect = styled.select`
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
  }
`;

const TableCard = styled.div`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  thead th {
    text-align: left;
    padding: 9px 14px;
    background: ${({ theme }) => theme.colors.background.secondary};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  }

  tbody td {
    padding: 10px 14px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
    vertical-align: middle;
  }

  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: ${({ theme }) => theme.colors.background.secondary}55; }

  .name {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  .meta {
    color: ${({ theme }) => theme.colors.text.tertiary};
    font-size: 12px;
    margin-top: 1px;
  }
  .muted {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  .actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }
`;

type Tone = 'active' | 'invited' | 'expired' | 'muted';

const Pill = styled.span<{ $tone: Tone }>`
  display: inline-block;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: capitalize;
  background: ${({ $tone }) =>
    $tone === 'active'  ? '#dcfce7'
  : $tone === 'invited' ? '#e0e7ff'
  : $tone === 'expired' ? '#fef3c7'
  :                       '#f1f5f9'};
  color: ${({ $tone }) =>
    $tone === 'active'  ? '#166534'
  : $tone === 'invited' ? '#3730a3'
  : $tone === 'expired' ? '#92400e'
  :                       '#475569'};
`;

const YouBadge = styled.span`
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: #f1f5f9;
  color: #475569;
  vertical-align: 1px;
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.primary};
  }
  &.danger:hover {
    background: #fef2f2;
    color: #b91c1c;
    border-color: #fecaca;
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Empty = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};

  .crest {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.tertiary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }
  h3 {
    color: ${({ theme }) => theme.colors.text.primary};
    margin: 0 0 4px;
    font-size: 16px;
  }
  p { margin: 0 0 16px; font-size: 14px; }
`;

const SkeletonRow = styled.div`
  height: 56px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  background: linear-gradient(90deg,
    ${({ theme }) => theme.colors.background.primary} 0%,
    ${({ theme }) => theme.colors.background.secondary} 50%,
    ${({ theme }) => theme.colors.background.primary} 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  margin-bottom: 16px;
`;

/* Inline role control in the Role cell; reads as text until hovered. */
const RoleSelect = styled.select`
  height: 28px;
  padding: 0 24px 0 8px;
  margin: -4px 0;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;

  &:hover, &:focus {
    border-color: ${({ theme }) => theme.colors.border.light};
    background: ${({ theme }) => theme.colors.background.primary};
  }
  &:focus { outline: none; }
  &:disabled { cursor: not-allowed; opacity: 0.7; }
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
`;

const Dialog = styled.div`
  width: 100%;
  max-width: 440px;
  background: ${({ theme }) => theme.colors.background.primary};
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
`;

const DialogHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};

  h2 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
  }
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const SecondaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
  }
`;

const DangerButton = styled(PrimaryButton)`
  background: #dc2626;
  &:hover { background: #b91c1c; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const REL_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year',    365 * 24 * 60 * 60_000],
  ['month',    30 * 24 * 60 * 60_000],
  ['day',           24 * 60 * 60_000],
  ['hour',               60 * 60_000],
  ['minute',                  60_000],
  ['second',                   1_000],
];

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = new Date(iso).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  for (const [unit, ms] of REL_UNITS) {
    if (absDiff >= ms || unit === 'second') {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return 'just now';
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function expiryLabel(invite: Invite): string {
  if (invite.state === 'expired') return 'Invite expired';
  const d = daysUntil(invite.expires_at);
  if (d <= 0) return 'Invite expires today';
  return `Invite expires in ${d} day${d === 1 ? '' : 's'}`;
}

function roleLabel(role: MemberRole): string {
  return role === 'admin' ? 'Admin' : 'User';
}

function inviteName(inv: Invite): string {
  return `${inv.first_name ?? ''} ${inv.last_name ?? ''}`.trim();
}

/** One row of the table: a signed-up user or a pending invite. */
type Row =
  | { kind: 'user'; key: string; member: Member }
  | { kind: 'invite'; key: string; invite: Invite };

function rowMatches(row: Row, needle: string): boolean {
  if (!needle) return true;
  const hay = row.kind === 'user'
    ? `${row.member.first_name} ${row.member.last_name} ${row.member.email}`
    : `${inviteName(row.invite)} ${row.invite.email}`;
  return hay.toLowerCase().includes(needle);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UsersPage() {
  const { user } = useAuth();
  const isAdmin = user?.user_type_id === 1;
  // Every write here (invites, role, status, remove) is refused on
  // impersonation sessions (routes/client/workspace.js → denyImpersonation),
  // so don't offer any of them.
  const canManage = isAdmin && !user?.impersonation;

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<MemberRole | ''>('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyInvite, setBusyInvite] = useState<number | null>(null);
  const [busyUser, setBusyUser] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await membersApi.list();
      setMembers(r.users);
      setInvites(r.invites);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
      setMembers((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const rows = useMemo<Row[]>(() => {
    const needle = search.trim().toLowerCase();
    const all: Row[] = [
      ...(members ?? []).map((m): Row => ({ kind: 'user', key: `u-${m.id}`, member: m })),
      ...invites.map((i): Row => ({ kind: 'invite', key: `i-${i.id}`, invite: i })),
    ];
    return all.filter((r) => {
      const role = r.kind === 'user' ? r.member.role : r.invite.role;
      if (roleFilter && role !== roleFilter) return false;
      return rowMatches(r, needle);
    });
  }, [members, invites, search, roleFilter]);

  const hasFilter = Boolean(search.trim() || roleFilter);

  const handleResend = async (invite: Invite) => {
    setBusyInvite(invite.id);
    try {
      await membersApi.resend(invite.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend invite');
    } finally {
      setBusyInvite(null);
    }
  };

  const handleRevoke = async (invite: Invite) => {
    setBusyInvite(invite.id);
    try {
      await membersApi.revoke(invite.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke invite');
    } finally {
      setBusyInvite(null);
    }
  };

  const handleRoleChange = async (member: Member, role: MemberRole) => {
    if (role === member.role) return;
    setBusyUser(member.id);
    setError(null);
    try {
      await membersApi.update(member.id, { role });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change role');
    } finally {
      setBusyUser(null);
    }
  };

  const handleStatusChange = async (member: Member, status: MemberStatus) => {
    setBusyUser(member.id);
    setError(null);
    try {
      await membersApi.update(member.id, { status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update user');
    } finally {
      setBusyUser(null);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    setError(null);
    try {
      await membersApi.remove(removeTarget.id);
      setRemoveTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove user');
    } finally {
      setRemoving(false);
    }
  };

  // Non-admins can't list members; send them to the People view they can use.
  if (!isAdmin) return <Navigate to="/app/people" replace />;

  const userCount = members?.length ?? 0;
  const pendingCount = invites.filter((i) => i.state === 'pending').length;

  return (
    <>
      <PageHeader>
        <div>
          <h1>Users</h1>
          <div className="sub">
            {members === null
              ? 'Loading…'
              : `${userCount} ${userCount === 1 ? 'user' : 'users'} can sign in to this workspace` +
                (pendingCount ? `, ${pendingCount} invited.` : '.')}
          </div>
        </div>
        {canManage && (
          <PrimaryButton type="button" onClick={() => setInviteOpen(true)}>
            <IconUserPlus size={16} /> Invite user
          </PrimaryButton>
        )}
      </PageHeader>

      <PeopleViewTabs />

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <Toolbar>
        <SearchWrap>
          <IconSearch className="icon" size={16} />
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </SearchWrap>
        <FilterSelect
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as MemberRole | '')}
        >
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </FilterSelect>
      </Toolbar>

      <TableCard>
        {members === null ? (
          <>
            <SkeletonRow /><SkeletonRow /><SkeletonRow />
          </>
        ) : rows.length === 0 ? (
          <Empty>
            <span className="crest"><IconUserPlus size={22} strokeWidth={1.5} /></span>
            <h3>{hasFilter ? 'No matches' : 'No users yet'}</h3>
            <p>
              {hasFilter
                ? 'Try a different search or clear the role filter.'
                : 'Invite a colleague who needs to sign in and run this workspace.'}
            </p>
            {!hasFilter && canManage && (
              <PrimaryButton type="button" onClick={() => setInviteOpen(true)}>
                <IconUserPlus size={16} /> Invite user
              </PrimaryButton>
            )}
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => row.kind === 'user' ? (
                <tr key={row.key}>
                  <td>
                    <div className="name">
                      {row.member.first_name} {row.member.last_name}
                      {row.member.id === user?.id && <YouBadge>You</YouBadge>}
                    </div>
                    <div className="meta">{row.member.email}</div>
                  </td>
                  <td>
                    {canManage && row.member.id !== user?.id ? (
                      <RoleSelect
                        value={row.member.role}
                        disabled={busyUser === row.member.id}
                        aria-label={`Role for ${row.member.email}`}
                        onChange={(e) => handleRoleChange(row.member, e.target.value as MemberRole)}
                      >
                        <option value="admin">Admin</option>
                        <option value="user">User</option>
                      </RoleSelect>
                    ) : (
                      roleLabel(row.member.role)
                    )}
                  </td>
                  <td>
                    <Pill $tone={row.member.status === 'active' ? 'active' : 'muted'}>
                      {row.member.status}
                    </Pill>
                  </td>
                  <td className="muted" title={row.member.last_login_at ?? undefined}>
                    {relativeTime(row.member.last_login_at)}
                  </td>
                  <td>
                    {canManage && row.member.id !== user?.id && (
                      <div className="actions">
                        {row.member.status === 'active' ? (
                          <IconButton
                            type="button"
                            title="Deactivate: keeps the account but blocks sign-in"
                            disabled={busyUser === row.member.id}
                            onClick={() => handleStatusChange(row.member, 'inactive')}
                          >
                            <IconUserOff size={14} />
                          </IconButton>
                        ) : row.member.status === 'inactive' ? (
                          <IconButton
                            type="button"
                            title="Reactivate: allow sign-in again"
                            disabled={busyUser === row.member.id}
                            onClick={() => handleStatusChange(row.member, 'active')}
                          >
                            <IconUserCheck size={14} />
                          </IconButton>
                        ) : null}
                        <IconButton
                          type="button"
                          className="danger"
                          title="Remove from workspace"
                          disabled={busyUser === row.member.id}
                          onClick={() => setRemoveTarget(row.member)}
                        >
                          <IconTrash size={14} />
                        </IconButton>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                <tr key={row.key}>
                  <td>
                    <div className="name">{inviteName(row.invite) || row.invite.email}</div>
                    <div className="meta">
                      {inviteName(row.invite) ? `${row.invite.email} · ` : ''}
                      {expiryLabel(row.invite)}
                      {row.invite.invited_by ? ` · invited by ${row.invite.invited_by}` : ''}
                    </div>
                  </td>
                  <td>{roleLabel(row.invite.role)}</td>
                  <td>
                    <Pill $tone={row.invite.state === 'expired' ? 'expired' : 'invited'}>
                      {row.invite.state === 'expired' ? 'Expired' : 'Invited'}
                    </Pill>
                  </td>
                  <td className="muted">—</td>
                  <td>
                    {canManage && (
                      <div className="actions">
                        <IconButton
                          type="button"
                          title="Resend invite"
                          disabled={busyInvite === row.invite.id}
                          onClick={() => handleResend(row.invite)}
                        >
                          <IconRefresh size={14} />
                        </IconButton>
                        <IconButton
                          type="button"
                          className="danger"
                          title="Revoke invite"
                          disabled={busyInvite === row.invite.id}
                          onClick={() => handleRevoke(row.invite)}
                        >
                          <IconTrash size={14} />
                        </IconButton>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>

      {inviteOpen && (
        <InviteUserDialog
          onClose={() => setInviteOpen(false)}
          onInvited={() => { void load(); }}
        />
      )}

      {removeTarget && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setRemoveTarget(null); }}>
          <Dialog role="dialog" aria-labelledby="remove-user-title">
            <DialogHeader>
              <h2 id="remove-user-title">Remove user</h2>
              <IconButton type="button" onClick={() => setRemoveTarget(null)} aria-label="Close">
                <IconX size={16} />
              </IconButton>
            </DialogHeader>
            <div style={{ padding: '20px 24px', fontSize: 14, lineHeight: 1.55 }}>
              Remove <strong>{removeTarget.first_name} {removeTarget.last_name}</strong>{' '}
              ({removeTarget.email}) from this workspace? They will be signed out and can no
              longer sign in. You can invite the same address again later.
            </div>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setRemoveTarget(null)}>
                Cancel
              </SecondaryButton>
              <DangerButton type="button" disabled={removing} onClick={handleRemove}>
                {removing ? 'Removing…' : 'Remove'}
              </DangerButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}
    </>
  );
}

export default UsersPage;
