/**
 * InviteUserDialog — add a login user to the current workspace.
 *
 * Opened from the Users page (/app/people/users). People hold door
 * credentials; users can sign in and manage the workspace — the dialog
 * spells that out so admins pick the right surface.
 *
 * The form takes an email, optional name, and the role the new login gets:
 *   - Admin: full control of the workspace (what every invite used to be).
 *   - User:  can sign in and look around, but every write route is
 *            requireAdmin on the server, so they can't change anything.
 *
 * On success the dialog shows the delivery outcome and a copyable accept
 * link — the link matters when the instance has no email provider
 * configured. The list of who can sign in, and resend / revoke per invite,
 * lives on the Users page table, which `onInvited` tells to refresh.
 */

import { useState } from 'react';
import styled from '@emotion/styled';
import {
  IconX,
  IconSend,
  IconCopy,
  IconCheck,
  IconMailForward,
} from '@tabler/icons-react';
import {
  membersApi,
  type InviteResult,
  type MemberRole,
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

/* Role picker: two radio cards so the difference is read before it's chosen. */
const RoleOptions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const RoleOption = styled.label<{ $checked: boolean }>`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme, $checked }) =>
    $checked ? theme.colors.brand.primary : theme.colors.border.light};
  background: ${({ theme, $checked }) =>
    $checked ? `${theme.colors.brand.primary}0d` : theme.colors.background.primary};
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  input {
    margin: 2px 0 0;
    accent-color: ${({ theme }) => theme.colors.brand.primary};
  }
  .title {
    font-size: 13px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  .desc {
    font-size: 12px;
    line-height: 1.4;
    color: ${({ theme }) => theme.colors.text.secondary};
    margin-top: 2px;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const ROLE_OPTIONS: { value: MemberRole; title: string; desc: string }[] = [
  {
    value: 'admin',
    title: 'Admin',
    desc: 'Full control: doors, people, credentials, schedules, users and workspace settings.',
  },
  {
    value: 'user',
    title: 'User',
    desc: 'Can sign in and view doors, people and activity, but cannot change anything.',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  /** Called after an invite is created, so the caller can refresh its list. */
  onInvited?: (result: InviteResult) => void;
}

export default function InviteUserDialog({ onClose, onInvited }: Props) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<MemberRole>('admin');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

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
        role,
      });
      setResult(r);
      setEmail('');
      setFirstName('');
      setLastName('');
      onInvited?.(r);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not send invite');
    } finally {
      setSending(false);
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
            Users can sign in to this workspace. For someone who only needs to open a
            door, use <strong>Add person</strong> on the People view instead.
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
              <FullSpan>
                <FieldLabel as="div" style={{ marginBottom: 5 }}>Role</FieldLabel>
                <RoleOptions role="radiogroup" aria-label="Role">
                  {ROLE_OPTIONS.map((opt) => (
                    <RoleOption key={opt.value} $checked={role === opt.value}>
                      <input
                        type="radio"
                        name="invite-role"
                        value={opt.value}
                        checked={role === opt.value}
                        onChange={() => setRole(opt.value)}
                      />
                      <span>
                        <span className="title">{opt.title}</span>
                        <div className="desc">{opt.desc}</div>
                      </span>
                    </RoleOption>
                  ))}
                </RoleOptions>
              </FullSpan>
              {formError && (
                <FullSpan>
                  <ErrorBanner role="alert">{formError}</ErrorBanner>
                </FullSpan>
              )}
            </Grid>
            <Actions>
              <SecondaryButton type="button" onClick={onClose}>
                {result ? 'Done' : 'Cancel'}
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={sending}>
                {sending ? 'Sending…' : (<><IconSend size={15} /> Send invite</>)}
              </PrimaryButton>
            </Actions>
          </form>

          {result && (
            <SuccessCard role="status" style={{ marginTop: 12 }}>
              <div>
                <IconMailForward size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Invite for <strong>{result.invite.email}</strong> as{' '}
                {result.invite.role === 'admin' ? 'an admin' : 'a user'}{' '}
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
      </Dialog>
    </Backdrop>
  );
}
