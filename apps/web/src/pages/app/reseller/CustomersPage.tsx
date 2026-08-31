/**
 * CustomersPage — Reseller view of their managed end-user companies.
 *
 * Backed by GET /api/reseller/customers. Server filters by
 * parent_company_id = caller's company_id, so this page only ever shows
 * the signed-in reseller's portfolio.
 *
 * MVP: searchable table with name / status / device count / joined.
 * Customer names link to /app/customers/:id once that drill-in lands.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconCheck,
  IconCopy,
  IconLink,
  IconMailForward,
  IconRefresh,
  IconSearch,
  IconUsersGroup,
} from '@tabler/icons-react';
import {
  resellerApi,
  type CustomerInvite,
  type ManagedCustomer,
} from '../../../services/tenancy/reseller';
import type { CompanyStatus } from '../../../services/platform/companies';

// ── Layout ───────────────────────────────────────────────────────────────────

const PageHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 18px;

  h1 {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0;
  }
  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.text.secondary};
    font-size: 13px;
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`;

const SearchWrap = styled.div`
  position: relative;
  flex: 1;
  max-width: 360px;

  .icon {
    position: absolute;
    left: 10px; top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.text.tertiary};
    pointer-events: none;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  height: 34px;
  padding: 0 10px 0 32px;
  border-radius: 8px;
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

const StatusSelect = styled.select`
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;
`;

const Panel = styled.section`
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
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    background: ${({ theme }) => theme.colors.background.secondary};
  }
  thead th.num { text-align: right; }

  tbody td {
    padding: 11px 14px;
    border-top: 1px solid ${({ theme }) => theme.colors.border.light};
    vertical-align: middle;
  }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:hover { background: ${({ theme }) => theme.colors.background.secondary}; }

  .name {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  .meta {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin-top: 1px;
  }
`;

const StatusPill = styled.span<{ $status: CompanyStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  background: ${({ $status }) =>
    $status === 'active'    ? '#dcfce7'
  : $status === 'suspended' ? '#fef3c7'
  : $status === 'canceled'  ? '#fee2e2'
  :                           '#f1f5f9'};
  color: ${({ $status }) =>
    $status === 'active'    ? '#166534'
  : $status === 'suspended' ? '#92400e'
  : $status === 'canceled'  ? '#991b1b'
  :                           '#475569'};

  &::before {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.85;
  }
`;

const InvitePanel = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .note {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  .note.error { color: #991b1b; }

  .crest {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    flex-shrink: 0;
  }

  .text {
    min-width: 200px;

    .label {
      font-size: 13px;
      font-weight: 600;
      color: ${({ theme }) => theme.colors.text.primary};
    }
    .hint {
      font-size: 12px;
      color: ${({ theme }) => theme.colors.text.tertiary};
      margin-top: 1px;
    }
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
`;

const InviteLinkInput = styled.input`
  height: 32px;
  padding: 0 10px;
  min-width: 260px;
  flex: 1;
  max-width: 420px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.secondary};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 12px;
  font-family: inherit;
`;

const InviteEmailInput = styled.input`
  height: 32px;
  padding: 0 10px;
  min-width: 220px;
  max-width: 300px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 12px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
`;

const InviteButton = styled.button<{ $primary?: boolean }>`
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid
    ${({ theme, $primary }) => ($primary ? theme.colors.brand.primary : theme.colors.border.light)};
  background: ${({ theme, $primary }) =>
    $primary ? theme.colors.brand.primary : theme.colors.background.primary};
  color: ${({ theme, $primary }) => ($primary ? '#fff' : theme.colors.text.primary)};
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Empty = styled.div`
  padding: 60px 20px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};

  .crest {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin-bottom: 12px;
  }
  .title { color: ${({ theme }) => theme.colors.text.primary}; font-weight: 600; margin-bottom: 4px; }
  .body  { font-size: 13px; max-width: 380px; margin: 0 auto; line-height: 1.5; }
`;

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  margin-bottom: 14px;
`;

const Summary = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin-left: auto;
  font-variant-numeric: tabular-nums;
`;

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

// ── Component ────────────────────────────────────────────────────────────────

export function CustomersPage() {
  const [search,    setSearch]    = useState('');
  const [status,    setStatus]    = useState<'' | CompanyStatus>('');
  const [customers, setCustomers] = useState<ManagedCustomer[] | null>(null);
  const [total,     setTotal]     = useState(0);
  const [error,     setError]     = useState<string | null>(null);

  // ── Invite link ─────────────────────────────────────────────────────────────
  // One reusable signup link per reseller. End-user companies that register
  // through it are attached to this reseller automatically. Resetting
  // generates a new token — previously shared links stop working.
  const [invite,       setInvite]       = useState<CustomerInvite | null>(null);
  const [inviteLoaded, setInviteLoaded] = useState(false);
  const [inviteBusy,   setInviteBusy]   = useState(false);
  const [copied,       setCopied]       = useState(false);

  useEffect(() => {
    resellerApi.invite()
      .then(setInvite)
      .catch(() => { /* panel just offers "create" if the load failed */ })
      .finally(() => setInviteLoaded(true));
  }, []);

  const inviteUrl = invite
    ? `${window.location.origin}/signup?invite=${encodeURIComponent(invite.token)}`
    : null;

  const handleRotateInvite = async (isReset: boolean) => {
    if (isReset && !window.confirm(
      'Reset the invite link? The current link will stop working immediately.',
    )) return;
    setInviteBusy(true);
    try {
      setInvite(await resellerApi.rotateInvite());
      setCopied(false);
    } catch {
      // Leave the old link in place; the button re-enables for a retry.
    } finally {
      setInviteBusy(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — the input is selectable as fallback */ }
  };

  // ── Send invite by email ────────────────────────────────────────────────────
  const [sendTo,    setSendTo]    = useState('');
  const [sending,   setSending]   = useState(false);
  const [sendNote,  setSendNote]  = useState<{ text: string; isError: boolean } | null>(null);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTo.trim()) return;
    setSending(true);
    setSendNote(null);
    try {
      const r = await resellerApi.sendInvite(sendTo.trim());
      setInvite(r.invite); // send lazily creates the token if none existed
      setSendNote({
        text: r.delivered === 'email'
          ? `Invite sent to ${sendTo.trim()}`
          : 'No email provider configured — invite logged to the API console (dev)',
        isError: false,
      });
      setSendTo('');
    } catch (err) {
      setSendNote({
        text:    err instanceof Error ? err.message : 'Failed to send invite',
        isError: true,
      });
    } finally {
      setSending(false);
    }
  };

  // Debounced query — typing in the search box shouldn't fire on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await resellerApi.customers({
        search: debouncedSearch || undefined,
        status: status || undefined,
        limit:  100,
      });
      setCustomers(r.customers);
      setTotal(r.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
      setCustomers([]);
    }
  }, [debouncedSearch, status]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader>
        <h1>Customers</h1>
        <p>End-user companies you manage on the platform.</p>
      </PageHeader>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      {inviteLoaded && (
        <InvitePanel>
          <div className="row">
            <span className="crest"><IconLink size={16} /></span>
            <div className="text">
              <div className="label">Invite a customer</div>
              <div className="hint">
                Companies that sign up through this link are connected to you automatically.
              </div>
            </div>
            <div className="actions">
              {invite && inviteUrl ? (
                <>
                  <InviteLinkInput
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <InviteButton $primary type="button" onClick={handleCopyInvite}>
                    {copied ? <><IconCheck size={14} /> Copied</> : <><IconCopy size={14} /> Copy link</>}
                  </InviteButton>
                  <InviteButton
                    type="button"
                    disabled={inviteBusy}
                    onClick={() => handleRotateInvite(true)}
                    title="Generate a new link — the current one stops working"
                  >
                    <IconRefresh size={14} /> Reset
                  </InviteButton>
                </>
              ) : (
                <InviteButton
                  $primary
                  type="button"
                  disabled={inviteBusy}
                  onClick={() => handleRotateInvite(false)}
                >
                  <IconLink size={14} /> {inviteBusy ? 'Creating…' : 'Create invite link'}
                </InviteButton>
              )}
            </div>
          </div>
          <form className="row" onSubmit={handleSendInvite}>
            <InviteEmailInput
              type="email"
              placeholder="customer@company.com"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
            />
            <InviteButton type="submit" disabled={sending || !sendTo.trim()}>
              <IconMailForward size={14} /> {sending ? 'Sending…' : 'Email invite'}
            </InviteButton>
            {sendNote && (
              <span className={sendNote.isError ? 'note error' : 'note'}>{sendNote.text}</span>
            )}
          </form>
        </InvitePanel>
      )}

      <Toolbar>
        <SearchWrap>
          <IconSearch className="icon" size={14} />
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
          />
        </SearchWrap>
        <StatusSelect
          value={status}
          onChange={(e) => setStatus(e.target.value as CompanyStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="canceled">Canceled</option>
        </StatusSelect>
        {customers && customers.length > 0 && (
          <Summary>
            {total} customer{total === 1 ? '' : 's'}
          </Summary>
        )}
      </Toolbar>

      <Panel>
        {customers === null ? (
          <Empty>
            <div className="title">Loading…</div>
          </Empty>
        ) : customers.length === 0 ? (
          <Empty>
            <div className="crest"><IconUsersGroup size={22} /></div>
            <div className="title">
              {debouncedSearch || status ? 'No customers match the filter' : 'No customers yet'}
            </div>
            <div className="body">
              {debouncedSearch || status
                ? 'Try a different search or clear the status filter.'
                : 'When an end-user company is provisioned through your dealer account, they\'ll appear here.'}
            </div>
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th className="num">Devices</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link
                      to={`/app/customers/${c.id}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <div className="name">{c.name}</div>
                      <div className="meta">{c.company_email ?? '—'}</div>
                    </Link>
                  </td>
                  <td>
                    <StatusPill $status={c.status}>{c.status}</StatusPill>
                  </td>
                  <td className="num">{c.device_count}</td>
                  <td>{fmtDate(c.parent_locked_at ?? c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}

export default CustomersPage;
