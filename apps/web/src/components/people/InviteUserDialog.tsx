/**
 * InviteUserDialog — add a login user to the current workspace.
 *
 * Opened from the People page next to "Add person". People hold door
 * credentials; users can sign in and manage the workspace — the dialog
 * spells that out so admins pick the right button.
 *
 * Two halves:
 *   1. The invite form (email + optional name). On success the dialog shows
 *      the delivery outcome and a copyable accept link — the link matters
 *      when the instance has no email provider configured.
 *   2. "Who can sign in": current users plus pending invites, with resend /
 *      revoke per invite, so the admin can see the result of what they did
 *      without leaving the page.
 */

import { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconX,
  IconSend,
  IconCopy,
  IconCheck,
  IconRefresh,
  IconTrash,
  IconMailForward,
} from '@tabler/icons-react';
import {
  membersApi,
  type Invite,
  type Member,
  type InviteResult,
} from '../../services/tenancy/members';

// ── Styles (mirror the People page dialog) ────────────────────────────────────

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
  max-width: 560px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
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

const Section = styled.div`
  padding: 14px 18px;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.border.light};
  }
`;

const Intro = styled.p`
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const FullSpan = styled.div`
  grid-column: 1 / -1;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
`;

const Input = styled.input`
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
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
  &:disabled { opacity: 0.6; cursor: not-allowed; }
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
  &:disabled { opacity: 0.6; cursor: not-allowed; }
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

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  line-height: 1.45;
`;

const SuccessCard = styled.div`
  padding: 12px;
  border-radius: 8px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  font-size: 13px;
  line-height: 1.5;

  strong { font-weight: 600; }
`;

const LinkRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;

  input {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid #bbf7d0;
    background: #fff;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #14532d;
  }
`;

const SectionTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Row = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 8px;
  font-size: 13px;

  .who {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.secondary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
`;

const Badge = styled.span<{ tone?: 'neutral' | 'warn' | 'muted' }>`
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  margin-left: 6px;
  vertical-align: middle;
  background: ${({ tone }) =>
    tone === 'warn' ? '#fef3c7' : tone === 'muted' ? '#f1f5f9' : '#e0e7ff'};
  color: ${({ tone }) =>
    tone === 'warn' ? '#92400e' : tone === 'muted' ? '#475569' : '#3730a3'};
`;

const Empty = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  padding: 6px 0;
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function expiryLabel(invite: Invite): string {
  if (invite.state === 'expired') return 'Expired';
  const d = daysUntil(invite.expires_at);
  if (d <= 0) return 'Expires today';
  return `Expires in ${d} day${d === 1 ? '' : 's'}`;
}

function roleLabel(role: 'admin' | 'user'): string {
  return role === 'admin' ? 'Admin' : 'User';
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  /** The signed-in admin's user id — used to label "You" in the list. */
  currentUserId?: number;
}

export default function InviteUserDialog({ onClose, currentUserId }: Props) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await membersApi.list();
      setMembers(r.users);
      setInvites(r.invites);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load users');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setFormError(null);
    setCopied(false);
    try {
      const r = await membersApi.invite({
        email: email.trim(),
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      });
      setResult(r);
      setEmail('');
      setFirstName('');
      setLastName('');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not send invite');
    } finally {
      setSending(false);
    }
  };

  const handleResend = async (invite: Invite) => {
    setBusyInvite(invite.id);
    setFormError(null);
    setCopied(false);
    try {
      const r = await membersApi.resend(invite.id);
      setResult(r);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not resend invite');
    } finally {
      setBusyInvite(null);
    }
  };

  const handleRevoke = async (invite: Invite) => {
    setBusyInvite(invite.id);
    setFormError(null);
    try {
      await membersApi.revoke(invite.id);
      if (result?.invite.id === invite.id) setResult(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not revoke invite');
    } finally {
      setBusyInvite(null);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    setCopied(await copyToClipboard(result.accept_url));
  };

  return (
    <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog role="dialog" aria-labelledby="invite-user-title">
        <DialogHeader>
          <h2 id="invite-user-title">Invite user</h2>
          <IconButton type="button" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </IconButton>
        </DialogHeader>

        <Section>
          <Intro>
            Users can sign in to manage this workspace — doors, people, credentials and
            schedules. For someone who only needs to open a door, use <strong>Add person</strong>{' '}
            instead. Invited users join as admins.
          </Intro>

          <form onSubmit={handleSend}>
            <Grid>
              <FullSpan>
                <Field>
                  <FieldLabel>Email *</FieldLabel>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    required
                    autoFocus
                  />
                </Field>
              </FullSpan>
              <Field>
                <FieldLabel>First name</FieldLabel>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field>
                <FieldLabel>Last name</FieldLabel>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              {formError && (
                <FullSpan>
                  <ErrorBanner role="alert">{formError}</ErrorBanner>
                </FullSpan>
              )}
            </Grid>
            <Actions>
              <PrimaryButton type="submit" disabled={sending}>
                {sending ? 'Sending…' : (<><IconSend size={15} /> Send invite</>)}
              </PrimaryButton>
            </Actions>
          </form>

          {result && (
            <SuccessCard role="status" style={{ marginTop: 12 }}>
              <div>
                <IconMailForward size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Invite for <strong>{result.invite.email}</strong>{' '}
                {result.delivery === 'email'
                  ? 'sent by email.'
                  : 'created. No email provider is configured on this instance, so share the link below.'}
                {result.delivery_error && ` (${result.delivery_error})`}
              </div>
              <LinkRow>
                <input readOnly value={result.accept_url} onFocus={(e) => e.currentTarget.select()} />
                <SecondaryButton type="button" onClick={handleCopy}>
                  {copied ? (<><IconCheck size={14} /> Copied</>) : (<><IconCopy size={14} /> Copy link</>)}
                </SecondaryButton>
              </LinkRow>
            </SuccessCard>
          )}
        </Section>

        <Section>
          <SectionTitle>Who can sign in</SectionTitle>
          {listError && <ErrorBanner role="alert">{listError}</ErrorBanner>}
          {members === null && !listError ? (
            <Empty>Loading…</Empty>
          ) : (
            <List>
              {members?.map((m) => (
                <Row key={`u-${m.id}`}>
                  <div className="who">
                    <span className="name">
                      {m.first_name} {m.last_name}
                      {m.id === currentUserId && <Badge tone="muted">You</Badge>}
                      <Badge>{roleLabel(m.role)}</Badge>
                      {m.status !== 'active' && <Badge tone="warn">{m.status}</Badge>}
                    </span>
                    <span className="meta">{m.email}</span>
                  </div>
                </Row>
              ))}
              {invites.map((inv) => (
                <Row key={`i-${inv.id}`}>
                  <div className="who">
                    <span className="name">
                      {inv.first_name || inv.last_name
                        ? `${inv.first_name ?? ''} ${inv.last_name ?? ''}`.trim()
                        : inv.email}
                      <Badge tone="warn">{inv.state === 'expired' ? 'Expired' : 'Invited'}</Badge>
                      <Badge>{roleLabel(inv.role)}</Badge>
                    </span>
                    <span className="meta">
                      {(inv.first_name || inv.last_name) ? `${inv.email} · ` : ''}
                      {expiryLabel(inv)}
                      {inv.invited_by ? ` · invited by ${inv.invited_by}` : ''}
                    </span>
                  </div>
                  <div className="actions">
                    <IconButton
                      type="button"
                      title="Resend invite"
                      disabled={busyInvite === inv.id}
                      onClick={() => handleResend(inv)}
                    >
                      <IconRefresh size={14} />
                    </IconButton>
                    <IconButton
                      type="button"
                      className="danger"
                      title="Revoke invite"
                      disabled={busyInvite === inv.id}
                      onClick={() => handleRevoke(inv)}
                    >
                      <IconTrash size={14} />
                    </IconButton>
                  </div>
                </Row>
              ))}
              {members?.length === 0 && invites.length === 0 && (
                <Empty>No users yet.</Empty>
              )}
            </List>
          )}
        </Section>
      </Dialog>
    </Backdrop>
  );
}
