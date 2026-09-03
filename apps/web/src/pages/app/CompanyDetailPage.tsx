/**
 * CompanyDetailPage — Platform Admin view of a single tenant.
 *
 * Routed as /app/companies/:id. Lays out the company's identity, header-line
 * health (user / device counts), two drill-downs (users / devices), and
 * lifecycle actions (suspend / reactivate / cancel).
 *
 * The platform company itself is read-only — it can't suspend or cancel
 * itself, so the action menu is hidden for company_type='platform'.
 *
 * Edit-company is still a follow-up.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconArrowLeft,
  IconBan,
  IconBuilding,
  IconChevronDown,
  IconLock,
  IconPlayerPause,
  IconPlayerPlay,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import {
  CANCELLATION_REASONS,
  companiesApi,
  type CancellationReasonCode,
  type Company,
  type CompanyDeviceRow,
  type CompanyStatus,
  type CompanyType,
  type CompanyUser,
} from '../../services/platform/companies';

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
  .pills {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
`;

const TypePill = styled.span<{ $type: CompanyType }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  background: ${({ $type }) =>
    $type === 'platform' ? '#dbeafe'
  :                        '#f1f5f9'};
  color: ${({ $type }) =>
    $type === 'platform' ? '#1e40af'
  :                        '#475569'};
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
  .count {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    font-variant-numeric: tabular-nums;
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
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
`;

const StatTile = styled.div`
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background.primary};

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
  .breakdown {
    margin-top: 3px;
    font-size: 11px;
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

const ErrorBanner = styled.div`
  padding: 8px 10px;
  border-radius: 7px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 12px;
  margin-bottom: 10px;
`;

// ── Lifecycle actions ────────────────────────────────────────────────────────

const ActionGroup = styled.div`
  margin-left: auto;
  display: inline-flex;
  gap: 8px;
  align-self: center;
  flex-wrap: wrap;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'warning' | 'danger' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme, $variant }) =>
    $variant === 'warning' ? '#fde68a'
  : $variant === 'danger'  ? '#fecaca'
  :                          theme.colors.border.light};
  background: ${({ theme, $variant }) =>
    $variant === 'warning' ? '#fffbeb'
  : $variant === 'danger'  ? '#fef2f2'
  :                          theme.colors.background.primary};
  color: ${({ theme, $variant }) =>
    $variant === 'warning' ? '#92400e'
  : $variant === 'danger'  ? '#b91c1c'
  : $variant === 'primary' ? theme.colors.brand.primary
  :                          theme.colors.text.primary};
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    background: ${({ theme, $variant }) =>
      $variant === 'warning' ? '#fef3c7'
    : $variant === 'danger'  ? '#fee2e2'
    :                          theme.colors.background.secondary};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const AuditBanner = styled.div<{ $kind: 'suspended' | 'canceled' }>`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 10px;
  margin-bottom: 16px;
  font-size: 13px;
  border: 1px solid ${({ $kind }) => ($kind === 'canceled' ? '#fecaca' : '#fde68a')};
  background:           ${({ $kind }) => ($kind === 'canceled' ? '#fef2f2' : '#fffbeb')};
  color:                ${({ $kind }) => ($kind === 'canceled' ? '#7f1d1d' : '#78350f')};

  .icon { flex-shrink: 0; margin-top: 1px; }
  .title { font-weight: 600; margin-bottom: 2px; }
  .meta  { font-size: 12px; opacity: 0.85; }
  .reason {
    margin-top: 4px;
    color: inherit;
    font-style: italic;
  }
`;

// ── Modal ────────────────────────────────────────────────────────────────────

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
  max-width: 480px;
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
  h2 { font-size: 15px; font-weight: 600; margin: 0; }
`;

const DialogBody = styled.div`
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  .lead { font-size: 13px; color: ${({ theme }) => theme.colors.text.secondary}; margin: 0; }
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
`;

const TextInput = styled.textarea`
  min-height: 72px;
  padding: 8px 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
`;

const Select = styled.select`
  height: 34px;
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

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const NotFound = styled.div`
  padding: 64px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};

  h2 { color: ${({ theme }) => theme.colors.text.primary}; margin: 0 0 6px; }
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
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

function fmtAddress(c: Company): string {
  const lineOne = c.street || '';
  const lineTwo = [c.city, c.state, c.zip].filter(Boolean).join(', ');
  const all = [lineOne, lineTwo, c.country].filter(Boolean).join(' · ');
  return all || '';
}

function typeLabel(t: CompanyType): string {
  return t === 'end_user' ? 'End-user' : t[0].toUpperCase() + t.slice(1);
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

/** Human label for a cancellation reason code; falls back to the raw code. */
function cancellationLabel(code: string | null): string {
  if (!code) return '—';
  return CANCELLATION_REASONS.find((r) => r.code === code)?.label ?? code;
}

type ActionModal =
  | { kind: 'suspend' }
  | { kind: 'reactivate' }
  | { kind: 'cancel' }
  | null;

// ── Component ─────────────────────────────────────────────────────────────────

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const companyId = Number(id);

  const [company,  setCompany]  = useState<Company | null | undefined>(undefined);
  const [users,    setUsers]    = useState<CompanyUser[] | null>(null);
  const [devices,  setDevices]  = useState<CompanyDeviceRow[] | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  // Lifecycle action modal + form state.
  const [modal,         setModal]         = useState<ActionModal>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [cancelCode,    setCancelCode]    = useState<CancellationReasonCode>('cost');
  const [cancelDetails, setCancelDetails] = useState('');
  // Termination uses its own state (typed confirmation to prevent misclicks
  // on an irreversible action; result shown post-success so admin sees the
  // end-user-unlocked count).
  const [actionBusy,    setActionBusy]    = useState(false);
  const [actionError,   setActionError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await companiesApi.get(companyId);
      setCompany(c);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load company';
      if (/not found/i.test(msg)) setCompany(null);
      else { setError(msg); setCompany(null); }
      return;
    }
    // Fire the two drill-down queries in parallel.
    Promise.all([
      companiesApi.users(companyId).catch(() => [] as CompanyUser[]),
      companiesApi.devices(companyId).catch(() => [] as CompanyDeviceRow[]),
    ]).then(([u, d]) => {
      setUsers(u);
      setDevices(d);
    });

  }, [companyId]);

  useEffect(() => {
    if (!Number.isFinite(companyId)) { setCompany(null); return; }
    load();
  }, [companyId, load]);

  const openModal = (kind: NonNullable<ActionModal>['kind']) => {
    setActionError(null);
    setSuspendReason('');
    setCancelCode('cost');
    setCancelDetails('');
    setModal({ kind });
  };

  const closeModal = () => {
    if (actionBusy) return;
    setModal(null);
    setActionError(null);
  };

  const performAction = async () => {
    if (!company || !modal) return;
    setActionError(null);

    if (modal.kind === 'suspend' && !suspendReason.trim()) {
      setActionError('A reason is required.');
      return;
    }

    setActionBusy(true);
    try {
      if (modal.kind === 'suspend') {
        await companiesApi.suspend(company.id, suspendReason.trim());
      } else if (modal.kind === 'reactivate') {
        await companiesApi.reactivate(company.id);
      } else if (modal.kind === 'cancel') {
        await companiesApi.cancel(
          company.id,
          cancelCode,
          cancelDetails.trim() || undefined,
        );
      }
      setModal(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  if (company === undefined) {
    return (
      <>
        <BackLink to="/app/companies"><IconArrowLeft size={16} /> Companies</BackLink>
        <div style={{ color: '#94a3b8', padding: 32 }}>Loading…</div>
      </>
    );
  }
  if (company === null) {
    return (
      <>
        <BackLink to="/app/companies"><IconArrowLeft size={16} /> Companies</BackLink>
        <NotFound>
          <h2>Company not found</h2>
          <p>It may have been removed, or the URL is wrong.</p>
        </NotFound>
      </>
    );
  }

  const onlineDevices  = devices?.filter((d) => d.status === 'online').length  ?? 0;
  const offlineDevices = devices?.filter((d) => d.status === 'offline').length ?? 0;
  const errorDevices   = devices?.filter((d) => d.status === 'error').length   ?? 0;

  return (
    <>
      <BackLink to="/app/companies"><IconArrowLeft size={16} /> Companies</BackLink>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <Header>
        <span className="crest"><IconBuilding size={22} strokeWidth={1.5} /></span>
        <div>
          <h1 className="name">{company.name}</h1>
          <div className="sub">
            <span className="pills">
              <TypePill $type={company.company_type}>{typeLabel(company.company_type)}</TypePill>
              <StatusPill $status={company.status}>{company.status}</StatusPill>
            </span>
            {company.parent_company_id && company.parent_company_name && (
              <>
                <span>·</span>
                <span>
                  Parent:{' '}
                  <Link
                    to={`/app/companies/${company.parent_company_id}`}
                    style={{ color: 'inherit', textDecoration: 'underline' }}
                  >
                    {company.parent_company_name}
                  </Link>
                </span>
              </>
            )}
            <span>·</span>
            <span>Joined {fmtDate(company.created_at)}</span>
          </div>
        </div>
        {company.company_type !== 'platform' && (
          <ActionGroup>
            {company.status === 'active' && (
              <ActionButton type="button" $variant="warning" onClick={() => openModal('suspend')}>
                <IconPlayerPause size={14} /> Suspend
              </ActionButton>
            )}
            {company.status !== 'active' && (
              <ActionButton type="button" $variant="primary" onClick={() => openModal('reactivate')}>
                <IconPlayerPlay size={14} /> Reactivate
              </ActionButton>
            )}
            {company.status !== 'canceled' && (
              <ActionButton type="button" $variant="danger" onClick={() => openModal('cancel')}>
                <IconBan size={14} /> Cancel
              </ActionButton>
            )}
          </ActionGroup>
        )}
      </Header>

      {company.status === 'suspended' && company.suspended_at && (
        <AuditBanner $kind="suspended" role="status">
          <IconPlayerPause className="icon" size={16} />
          <div>
            <div className="title">Suspended {fmtDateTime(company.suspended_at)}</div>
            <div className="meta">
              By admin&nbsp;#{company.suspended_by ?? '—'}
              {company.reactivated_at &&
                ` · Last reactivated ${fmtDateTime(company.reactivated_at)}`}
            </div>
            {company.suspension_reason && (
              <div className="reason">“{company.suspension_reason}”</div>
            )}
          </div>
        </AuditBanner>
      )}

      {company.status === 'canceled' && company.canceled_at && (
        <AuditBanner $kind="canceled" role="status">
          <IconBan className="icon" size={16} />
          <div>
            <div className="title">Canceled {fmtDateTime(company.canceled_at)}</div>
            <div className="meta">
              By admin&nbsp;#{company.canceled_by ?? '—'} ·{' '}
              {cancellationLabel(company.cancellation_reason_code)}
            </div>
            {company.cancellation_reason && (
              <div className="reason">“{company.cancellation_reason}”</div>
            )}
          </div>
        </AuditBanner>
      )}

      <Grid>
        <Panel>
          <PanelHeader><h2>Identity</h2></PanelHeader>
          <PanelBody>
            <dl style={{ margin: 0 }}>
              <DetailRow>
                <dt>Email</dt>
                <dd>{company.company_email || <span className="empty">—</span>}</dd>
              </DetailRow>
              <DetailRow>
                <dt>Phone</dt>
                <dd>{company.company_phone || <span className="empty">—</span>}</dd>
              </DetailRow>
              <DetailRow>
                <dt>Website</dt>
                <dd>
                  {company.company_url
                    ? <a href={company.company_url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{company.company_url}</a>
                    : <span className="empty">—</span>}
                </dd>
              </DetailRow>
              <DetailRow>
                <dt>Address</dt>
                <dd>{fmtAddress(company) || <span className="empty">—</span>}</dd>
              </DetailRow>
              <DetailRow>
                <dt>Last updated</dt>
                <dd>{fmtDate(company.updated_at)}</dd>
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
                <div className="value">{company.user_count}</div>
              </StatTile>
              <StatTile>
                <span className="label"><IconLock size={13} /> Devices</span>
                <div className="value">{company.device_count}</div>
                {devices && devices.length > 0 && (
                  <div className="breakdown">
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

      <Drawer>
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
              <tr><td colSpan={4} className="empty">No devices assigned.</td></tr>
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

      {modal && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <Dialog>
            <DialogHeader>
              <h2>
                {modal.kind === 'suspend'    && `Suspend ${company.name}`}
                {modal.kind === 'reactivate' && `Reactivate ${company.name}`}
                {modal.kind === 'cancel'     && `Cancel ${company.name}`}
              </h2>
              <IconButton type="button" onClick={closeModal} aria-label="Close">
                <IconX size={16} />
              </IconButton>
            </DialogHeader>
            <DialogBody>
              {modal.kind === 'suspend' && (
                <>
                  <p className="lead">
                    Suspending blocks the tenant's admins from making changes
                    until you reactivate. Devices and credentials stay in place.
                  </p>
                  <Field>
                    <span>Reason *</span>
                    <TextInput
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      placeholder="e.g. Repeated billing failures, payment dispute…"
                      autoFocus
                      required
                    />
                  </Field>
                </>
              )}

              {modal.kind === 'reactivate' && (
                <p className="lead">
                  This will set {company.name} back to <strong>active</strong> and
                  record who reactivated it.
                  {company.status === 'canceled' && (
                    <>
                      {' '}This company is currently <strong>canceled</strong> —
                      reactivating will let them use the platform again, but the
                      original cancellation record stays as history.
                    </>
                  )}
                </p>
              )}

              {modal.kind === 'cancel' && (
                <>
                  <p className="lead">
                    Canceling permanently ends this tenant's relationship with
                    the platform. The record stays for audit / analytics.
                  </p>
                  <Field>
                    <span>Cancellation reason *</span>
                    <Select
                      value={cancelCode}
                      onChange={(e) => setCancelCode(e.target.value as CancellationReasonCode)}
                    >
                      {CANCELLATION_REASONS.map((r) => (
                        <option key={r.code} value={r.code}>{r.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <span>Details (optional)</span>
                    <TextInput
                      value={cancelDetails}
                      onChange={(e) => setCancelDetails(e.target.value)}
                      placeholder={
                        cancelCode === 'other'
                          ? 'Required context for "Other" — what happened?'
                          : 'Any extra context to record alongside the reason.'
                      }
                    />
                  </Field>
                </>
              )}

              {actionError && (
                <ErrorBanner style={{ marginBottom: 0 }}>{actionError}</ErrorBanner>
              )}
            </DialogBody>
            <DialogFooter>
              <ActionButton type="button" onClick={closeModal} disabled={actionBusy}>
                Cancel
              </ActionButton>
              <ActionButton
                type="button"
                $variant={
                  modal.kind === 'cancel'
                    ? 'danger'
                    : modal.kind === 'suspend' ? 'warning'
                    : 'primary'
                }
                onClick={performAction}
                disabled={actionBusy}
              >
                {actionBusy ? 'Working…'
                  : modal.kind === 'suspend'    ? 'Suspend tenant'
                  : modal.kind === 'reactivate' ? 'Reactivate tenant'
                  : 'Cancel tenant'}
              </ActionButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}
    </>
  );
}

export default CompanyDetailPage;
