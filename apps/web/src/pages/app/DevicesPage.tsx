/**
 * DevicesPage — list of door locks for the signed-in company.
 *
 * Read-only for now. Detail page + commands (rename, unlock, reboot) come
 * in a follow-up once we wire device actions through the Simkura client.
 *
 * Live state (status, battery, last_seen) is whatever the backend has
 * cached from Simkura — there's no live update on this page yet.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { useAuth } from '../../contexts/AuthContext';
import PlatformDevicesPage from './PlatformDevicesPage';
import {
  IconBattery,
  IconBattery1,
  IconBattery2,
  IconBattery3,
  IconBattery4,
  IconBatteryOff,
  IconLock,
  IconLockOpen,
  IconLockSquare,
  IconPlus,
  IconQuestionMark,
  IconSearch,
} from '@tabler/icons-react';
import {
  devicesApi,
  type Device,
  type DeviceStatus,
  type DoorState,
} from '../../services/access/devices';
import { AddDeviceModal } from '../../components/devices/AddDeviceModal';

const STATUSES: DeviceStatus[] = ['online', 'offline', 'error', 'maintenance'];

// ── Page chrome ───────────────────────────────────────────────────────────────

const PageHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 16px;

  h1 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .sub {
    color: ${({ theme }) => theme.colors.text.secondary};
    font-size: 13px;
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

  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.brand.primary}; }
`;

const ToggleLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  user-select: none;

  input { cursor: pointer; }
`;

const DeactivatedBadge = styled.span`
  display: inline-block;
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #4b5563;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

// ── Table ─────────────────────────────────────────────────────────────────────

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
  tbody tr.clickable { cursor: pointer; }
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
  .serial {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const StatusPill = styled.span<{ $status: DeviceStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: capitalize;
  background: ${({ $status }) =>
    $status === 'online'      ? '#dcfce7'
  : $status === 'offline'     ? '#f1f5f9'
  : $status === 'error'       ? '#fee2e2'
  : /* maintenance */           '#fef3c7'};
  color: ${({ $status }) =>
    $status === 'online'      ? '#166534'
  : $status === 'offline'     ? '#475569'
  : $status === 'error'       ? '#991b1b'
  : /* maintenance */           '#92400e'};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.85;
  }
`;

const DoorChip = styled.span<{ $door: DoorState }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: ${({ theme, $door }) =>
    $door === 'unknown'  ? theme.colors.text.tertiary
  : $door === 'lockdown' ? '#991b1b'
  :                        theme.colors.text.secondary};
`;

const BatteryCell = styled.div<{ $tone: 'good' | 'low' | 'critical' | 'unknown' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${({ $tone, theme }) =>
    $tone === 'critical' ? '#b91c1c'
  : $tone === 'low'      ? '#b45309'
  : $tone === 'unknown'  ? theme.colors.text.tertiary
  : /* good */             theme.colors.text.secondary};
  font-variant-numeric: tabular-nums;
  font-size: 13px;
`;

const Empty = styled.div`
  padding: 56px 24px;
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
  p { margin: 0; font-size: 14px; }
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function doorIcon(state: DoorState) {
  if (state === 'unknown')  return <IconQuestionMark size={14} />;
  if (state === 'lockdown') return <IconLockSquare size={14} />;
  if (state === 'unlocked') return <IconLockOpen size={14} />;
  return <IconLock size={14} />;
}

function batteryTone(pct: number | null): 'good' | 'low' | 'critical' | 'unknown' {
  if (pct == null) return 'unknown';
  if (pct <= 15)   return 'critical';
  if (pct <= 35)   return 'low';
  return 'good';
}

function batteryIcon(pct: number | null) {
  if (pct == null) return <IconBatteryOff size={16} />;
  if (pct >= 80) return <IconBattery4 size={16} />;
  if (pct >= 55) return <IconBattery3 size={16} />;
  if (pct >= 30) return <IconBattery2 size={16} />;
  if (pct >= 10) return <IconBattery1 size={16} />;
  return <IconBattery size={16} />;
}

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
  if (!iso) return 'never';
  const diff = new Date(iso).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  for (const [unit, ms] of REL_UNITS) {
    if (absDiff >= ms || unit === 'second') {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return 'just now';
}

// ── Component ─────────────────────────────────────────────────────────────────

const ViewTabs = styled.div`
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  margin-bottom: 16px;
  border-radius: 9px;
  background: ${({ theme }) => theme.colors.background.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};

  button {
    border: none;
    border-radius: 7px;
    padding: 5px 14px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    background: transparent;
    color: ${({ theme }) => theme.colors.text.secondary};

    &[aria-selected='true'] {
      background: ${({ theme }) => theme.colors.background.primary};
      color: ${({ theme }) => theme.colors.text.primary};
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    }
  }
`;

// Dispatcher — picks the right view based on role so the inner components
// keep stable hook orders.
//
// Platform admins get BOTH surfaces behind a tab switch: the whole-install
// "Fleet" view, and "Our devices" — the same claim/manage view every tenant
// company gets, scoped to the platform company's own workspace. That's what
// lets a one-company ("own doors") deployment run its locks from the
// platform login without a separate tenant company
// (docs/deployment-shapes.md).
export function DevicesPage() {
  const { user } = useAuth();
  const [view, setView] = useState<'fleet' | 'ours'>('fleet');

  const isPlatformAdmin = user?.user_type_id === 1 && user.company_type === 'platform';
  if (!isPlatformAdmin) return <TenantDevicesView />;

  return (
    <>
      <ViewTabs role="tablist" aria-label="Device view">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'fleet'}
          onClick={() => setView('fleet')}
        >
          Fleet
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'ours'}
          onClick={() => setView('ours')}
        >
          Our devices
        </button>
      </ViewTabs>
      {view === 'fleet' ? <PlatformDevicesPage /> : <TenantDevicesView />}
    </>
  );
}

const AddDeviceButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border-radius: 7px;
  border: none;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  margin-left: auto;

  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
`;

function TenantDevicesView() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | ''>('');
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const fetchDevices = useCallback(async () => {
    setError(null);
    try {
      const r = await devicesApi.list({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        include_deactivated: showDeactivated || undefined,
      });
      setDevices(r.devices);
      setTotal(r.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
      setDevices([]);
    }
  }, [search, statusFilter, showDeactivated]);

  useEffect(() => {
    const t = setTimeout(fetchDevices, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [fetchDevices, search]);

  return (
    <>
      <PageHeader>
        <h1>Devices</h1>
        <div className="sub">
          {devices === null
            ? 'Loading…'
            : `${total} ${total === 1 ? 'device' : 'devices'} reporting to your workspace.`}
        </div>
      </PageHeader>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <Toolbar>
        <SearchWrap>
          <IconSearch className="icon" size={16} />
          <input
            type="text"
            placeholder="Search name, location, serial…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </SearchWrap>
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DeviceStatus | '')}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </FilterSelect>
        <ToggleLabel>
          <input
            type="checkbox"
            checked={showDeactivated}
            onChange={(e) => setShowDeactivated(e.target.checked)}
          />
          Show deactivated
        </ToggleLabel>
        <AddDeviceButton type="button" onClick={() => setAddOpen(true)}>
          <IconPlus size={16} />
          Add device
        </AddDeviceButton>
      </Toolbar>

      <TableCard>
        {devices === null ? (
          <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        ) : devices.length === 0 ? (
          <Empty>
            <span className="crest"><IconLock size={22} strokeWidth={1.5} /></span>
            <h3>No devices yet</h3>
            <p>Devices appear here once they&apos;re provisioned to your workspace.</p>
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>State</th>
                <th>Battery</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const tone = batteryTone(d.battery_percent);
                return (
                  <tr
                    key={d.id}
                    className="clickable"
                    onClick={() => navigate(`/app/devices/${d.id}`)}
                  >
                    <td>
                      <div className="name">
                        {d.device_name}
                        {d.deleted_at && <DeactivatedBadge>Deactivated</DeactivatedBadge>}
                      </div>
                      <div className="meta">
                        {d.location || <span style={{ opacity: 0.5 }}>—</span>}
                        {' · '}
                        <span className="serial">{d.device_id}</span>
                      </div>
                    </td>
                    <td><StatusPill $status={d.status}>{d.status}</StatusPill></td>
                    <td>
                      <DoorChip $door={d.door_state}>
                        {doorIcon(d.door_state)} {d.door_state}
                      </DoorChip>
                    </td>
                    <td>
                      <BatteryCell $tone={tone}>
                        {batteryIcon(d.battery_percent)}
                        {d.battery_percent != null ? `${d.battery_percent}%` : '—'}
                      </BatteryCell>
                    </td>
                    <td>
                      <span style={{ color: '#94a3b8', fontSize: 13 }}>
                        {relativeTime(d.last_seen)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableCard>

      {addOpen && (
        <AddDeviceModal
          onClose={() => setAddOpen(false)}
          onClaimed={fetchDevices}
        />
      )}
    </>
  );
}

export default DevicesPage;
