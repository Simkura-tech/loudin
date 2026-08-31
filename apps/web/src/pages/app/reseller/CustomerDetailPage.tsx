/**
 * CustomerDetailPage — Reseller view of one managed end-user company.
 *
 * Routed as /app/customers/:id. Read-only — resellers can SEE the
 * customer's devices/users/state but can't suspend/cancel them. Those
 * actions belong to the platform admin (and to the customer themselves
 * via the self-cancel flow).
 *
 * Server-side guard: every endpoint here (controllers/reseller.js)
 * returns 404 if the customer doesn't belong to the calling reseller,
 * so this page can't be used to enumerate customers across the platform
 * by guessing IDs.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconArrowLeft,
  IconArrowsLeftRight,
  IconBuilding,
  IconChevronDown,
  IconLock,
  IconUsers,
} from '@tabler/icons-react';
import {
  resellerApi,
  type ManagedCustomerDetail,
} from '../../../services/tenancy/reseller';
import type { CompanyDeviceRow, CompanyStatus, CompanyUser } from '../../../services/platform/companies';
import { useAuth } from '../../../contexts/AuthContext';

// ── Layout ────────────────────────────────────────────────────────────────────

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-decoration: none;
  margin-bottom: 12px;

  &:hover { color: ${({ theme }) => theme.colors.text.primary}; }
`;

const ImpersonateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  border: none;
  background: #312e81;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  margin-left: auto;
  align-self: center;

  &:hover { background: #1e1b4b; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const ImpersonateError = styled.div`
  padding: 8px 10px;
  border-radius: 7px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 12px;
  margin-bottom: 10px;
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 20px;
  flex-wrap: wrap;

  .crest {
    width: 44px;
    height: 44px;
    border-radius: 11px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .name {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0 0 2px;
  }
  .sub {
    color: ${({ theme }) => theme.colors.text.secondary};
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
`;

const StatusPill = styled.span<{ $status: CompanyStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
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
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.85;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 14px;
  margin-bottom: 20px;

  @media (max-width: 880px) { grid-template-columns: 1fr; }
`;

const Panel = styled.section`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};

  h2 {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin: 0;
  }
`;

const PanelBody = styled.div`
  padding: 12px 16px;
`;

const DetailRow = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 10px;
  padding: 7px 0;
  font-size: 13px;

  dt { color: ${({ theme }) => theme.colors.text.tertiary}; font-weight: 500; }
  dd { margin: 0; color: ${({ theme }) => theme.colors.text.primary}; word-break: break-word; }
  .empty { color: ${({ theme }) => theme.colors.text.tertiary}; opacity: 0.5; }
`;

const StatTiles = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
`;

const StatTile = styled.div`
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 8px;

  .label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .value {
    font-size: 22px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.02em;
    margin-top: 6px;
    font-variant-numeric: tabular-nums;
  }
`;

const Drawer = styled.details`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  margin-bottom: 12px;
  overflow: hidden;

  &[open] > summary {
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  }
  &[open] > summary .chevron {
    transform: rotate(180deg);
  }
`;

const DrawerSummary = styled.summary`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  list-style: none;
  user-select: none;

  &::-webkit-details-marker { display: none; }
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }

  .label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  .right {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    font-variant-numeric: tabular-nums;
  }
  .chevron {
    transition: transform 150ms ease;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const InlineTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  thead th {
    text-align: left;
    padding: 8px 12px;
    background: ${({ theme }) => theme.colors.background.secondary};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  tbody td {
    padding: 9px 12px;
    border-top: 1px solid ${({ theme }) => theme.colors.border.light};
  }
  .name { font-weight: 600; color: ${({ theme }) => theme.colors.text.primary}; }
  .meta { font-size: 12px; color: ${({ theme }) => theme.colors.text.tertiary}; margin-top: 1px; }
  .serial { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: ${({ theme }) => theme.colors.text.tertiary}; }
  .empty {
    text-align: center;
    padding: 24px 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    font-size: 13px;
  }
`;

const NotFound = styled.div`
  padding: 64px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};

  h2 { color: ${({ theme }) => theme.colors.text.primary}; margin: 0 0 6px; }
`;

const ErrorBanner = styled.div`
  padding: 8px 10px;
  border-radius: 7px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 12px;
  margin-bottom: 10px;
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function fmtAddress(c: ManagedCustomerDetail): string {
  const lineOne = c.street || '';
  const lineTwo = [c.city, c.state, c.zip].filter(Boolean).join(', ');
  const all = [lineOne, lineTwo, c.country].filter(Boolean).join(' · ');
  return all || '';
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [customer, setCustomer] = useState<ManagedCustomerDetail | null | undefined>(undefined);
  const [devices,  setDevices]  = useState<CompanyDeviceRow[] | null>(null);
  const [users,    setUsers]    = useState<CompanyUser[] | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  const handleImpersonate = async () => {
    setImpersonateError(null);
    setImpersonating(true);
    try {
      await resellerApi.impersonateCustomer(customerId);
      await refresh();
      // Land in the impersonated workspace's overview. The banner across
      // the top will let them exit when they're done.
      navigate('/app');
    } catch (err) {
      setImpersonateError(err instanceof Error ? err.message : 'Could not start impersonation');
      setImpersonating(false);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await resellerApi.customer(customerId);
      setCustomer(c);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load customer';
      if (/not found/i.test(msg)) setCustomer(null);
      else { setError(msg); setCustomer(null); }
      return;
    }
    Promise.all([
      resellerApi.customerDevices(customerId).catch(() => [] as CompanyDeviceRow[]),
      resellerApi.customerUsers(customerId).catch(() => [] as CompanyUser[]),
    ]).then(([d, u]) => { setDevices(d); setUsers(u); });
  }, [customerId]);

  useEffect(() => {
    if (!Number.isFinite(customerId)) { setCustomer(null); return; }
    load();
  }, [customerId, load]);

  if (customer === undefined) {
    return (
      <>
        <BackLink to="/app/customers"><IconArrowLeft size={16} /> Customers</BackLink>
        <div style={{ color: '#94a3b8', padding: 32 }}>Loading…</div>
      </>
    );
  }
  if (customer === null) {
    return (
      <>
        <BackLink to="/app/customers"><IconArrowLeft size={16} /> Customers</BackLink>
        <NotFound>
          <h2>Customer not found</h2>
          <p>This customer either doesn't exist or isn't in your portfolio.</p>
        </NotFound>
      </>
    );
  }

  const onlineDevices  = devices?.filter((d) => d.status === 'online').length  ?? 0;
  const offlineDevices = devices?.filter((d) => d.status === 'offline').length ?? 0;
  const errorDevices   = devices?.filter((d) => d.status === 'error').length   ?? 0;

  return (
    <>
      <BackLink to="/app/customers"><IconArrowLeft size={16} /> Customers</BackLink>
      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}
      {impersonateError && <ImpersonateError role="alert">{impersonateError}</ImpersonateError>}

      <Header>
        <span className="crest"><IconBuilding size={22} strokeWidth={1.5} /></span>
        <div>
          <h1 className="name">{customer.name}</h1>
          <div className="sub">
            <StatusPill $status={customer.status}>{customer.status}</StatusPill>
            <span>·</span>
            <span>Managing since {fmtDate(customer.parent_locked_at ?? customer.created_at)}</span>
          </div>
        </div>
        {customer.status === 'active' && (
          <ImpersonateButton
            type="button"
            onClick={handleImpersonate}
            disabled={impersonating}
            title="Open this customer's workspace as if you were one of their admins. People + devices only."
          >
            <IconArrowsLeftRight size={14} />
            {impersonating ? 'Starting…' : 'Manage as customer'}
          </ImpersonateButton>
        )}
      </Header>

      <Grid>
        <Panel>
          <PanelHeader><h2>Identity</h2></PanelHeader>
          <PanelBody>
            <dl style={{ margin: 0 }}>
              <DetailRow>
                <dt>Email</dt>
                <dd>{customer.company_email || <span className="empty">—</span>}</dd>
              </DetailRow>
              <DetailRow>
                <dt>Phone</dt>
                <dd>{customer.company_phone || <span className="empty">—</span>}</dd>
              </DetailRow>
              <DetailRow>
                <dt>Website</dt>
                <dd>
                  {customer.company_url
                    ? <a href={customer.company_url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{customer.company_url}</a>
                    : <span className="empty">—</span>}
                </dd>
              </DetailRow>
              <DetailRow>
                <dt>Address</dt>
                <dd>{fmtAddress(customer) || <span className="empty">—</span>}</dd>
              </DetailRow>
              <DetailRow>
                <dt>Last updated</dt>
                <dd>{fmtDateTime(customer.updated_at)}</dd>
              </DetailRow>
            </dl>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader><h2>Health</h2></PanelHeader>
          <PanelBody>
            <StatTiles>
              <StatTile>
                <span className="label"><IconUsers size={13} /> Users</span>
                <div className="value">{customer.user_count}</div>
              </StatTile>
              <StatTile>
                <span className="label"><IconLock size={13} /> Devices</span>
                <div className="value">{customer.device_count}</div>
                {devices && devices.length > 0 && (
                  <div style={{ marginTop: 3, fontSize: 11, color: '#94a3b8' }}>
                    {onlineDevices > 0  && `${onlineDevices} online`}
                    {offlineDevices > 0 && (onlineDevices > 0 ? ` · ${offlineDevices} offline` : `${offlineDevices} offline`)}
                    {errorDevices > 0   && ` · ${errorDevices} error`}
                  </div>
                )}
              </StatTile>
            </StatTiles>
          </PanelBody>
        </Panel>
      </Grid>

      <Drawer open>
        <DrawerSummary>
          <span className="label"><IconLock size={14} /> Devices</span>
          <span className="right">
            <span>{devices?.length ?? '—'}</span>
            <IconChevronDown size={16} className="chevron" />
          </span>
        </DrawerSummary>
        <InlineTable>
          <thead>
            <tr><th>Name</th><th>Status</th><th>Battery</th><th>Last seen</th></tr>
          </thead>
          <tbody>
            {devices === null ? (
              <tr><td colSpan={4} className="empty">Loading…</td></tr>
            ) : devices.length === 0 ? (
              <tr><td colSpan={4} className="empty">No devices yet.</td></tr>
            ) : devices.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="name">{d.device_name}</div>
                  <div className="meta">
                    {d.location || <span style={{ opacity: 0.5 }}>—</span>}
                    {' · '}
                    <span className="serial">{d.device_id}</span>
                  </div>
                </td>
                <td><span style={{ textTransform: 'capitalize' }}>{d.status}</span></td>
                <td>{d.battery_percent != null ? `${d.battery_percent}%` : '—'}</td>
                <td><span style={{ color: '#94a3b8', fontSize: 12 }}>{relativeTime(d.last_seen)}</span></td>
              </tr>
            ))}
          </tbody>
        </InlineTable>
      </Drawer>

      <Drawer>
        <DrawerSummary>
          <span className="label"><IconUsers size={14} /> Users</span>
          <span className="right">
            <span>{users?.length ?? '—'}</span>
            <IconChevronDown size={16} className="chevron" />
          </span>
        </DrawerSummary>
        <InlineTable>
          <thead>
            <tr><th>Name</th><th>Role</th><th>Status</th><th>Last login</th></tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={4} className="empty">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} className="empty">No users in this workspace.</td></tr>
            ) : users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="name">{u.first_name} {u.last_name}</div>
                  <div className="meta">{u.email}</div>
                </td>
                <td>{u.user_type_id === 1 ? 'Admin' : 'User'}</td>
                <td><span style={{ textTransform: 'capitalize' }}>{u.status}</span></td>
                <td><span style={{ color: '#94a3b8', fontSize: 12 }}>{relativeTime(u.last_login_at)}</span></td>
              </tr>
            ))}
          </tbody>
        </InlineTable>
      </Drawer>
    </>
  );
}

export default CustomerDetailPage;
