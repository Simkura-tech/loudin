/**
 * PlatformDevicesPage — Platform Admin fleet view.
 *
 * Data comes from /api/platform/devices which merges Simkura Core's device
 * list with our local DB. Each row shows whether it's claimed (assigned to
 * a tenant) and the owning company. Unclaimed devices float to the top
 * since those are usually the action items.
 *
 * Read-only for now. Assignment / claim flow + per-device commands land
 * in a follow-up.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconBattery,
  IconBattery1,
  IconBattery2,
  IconBattery3,
  IconBattery4,
  IconBatteryOff,
  IconBuilding,
  IconCloudDownload,
  IconCloudOff,
  IconLock,
  IconSearch,
  IconTerminal2,
} from '@tabler/icons-react';
import {
  platformDevicesApi,
  type DeviceStatus,
  type PlatformDevice,
  type PlatformFleetResponse,
} from '../../services/access/devices';
import { PlatformDeviceCommandModal } from '../../components/devices/PlatformDeviceCommandModal';

type Claim = '' | 'claimed' | 'unclaimed';

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
  .serial {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  .unclaimed {
    font-style: italic;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const StatusPill = styled.span<{ $status: PlatformDevice['status'] }>`
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
  : $status === 'error'       ? '#fee2e2'
  : $status === 'maintenance' ? '#fef3c7'
  : /* offline | unknown */     '#f1f5f9'};
  color: ${({ $status }) =>
    $status === 'online'      ? '#166534'
  : $status === 'error'       ? '#991b1b'
  : $status === 'maintenance' ? '#92400e'
  :                             '#475569'};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.85;
  }
`;

const ClaimBadge = styled.span<{ $claimed: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $claimed }) => ($claimed ? '#dcfce7' : '#fff7ed')};
  color: ${({ $claimed }) => ($claimed ? '#166534' : '#9a3412')};
`;

const BatteryCell = styled.div<{ $tone: 'good' | 'low' | 'critical' | 'unknown' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${({ $tone, theme }) =>
    $tone === 'critical' ? '#b91c1c'
  : $tone === 'low'      ? '#b45309'
  : $tone === 'unknown'  ? theme.colors.text.tertiary
  :                        theme.colors.text.secondary};
  font-variant-numeric: tabular-nums;
  font-size: 13px;
`;

const SimkuraBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 13px;
  margin-bottom: 12px;
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
  h3 { color: ${({ theme }) => theme.colors.text.primary}; margin: 0 0 4px; font-size: 16px; }
  p  { margin: 0; font-size: 14px; }
`;

const SkeletonRow = styled.div`
  height: 48px;
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
  padding: 8px 10px;
  border-radius: 7px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 12px;
  margin-bottom: 10px;
`;

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const REL_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year',    365 * 24 * 60 * 60_000],
  ['month',    30 * 24 * 60 * 60_000],
  ['day',           24 * 60 * 60_000],
  ['hour',               60 * 60_000],
  ['minute',                  60_000],
  ['second',                   1_000],
];
function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  for (const [unit, ms] of REL_UNITS) {
    if (abs >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
  }
`;

export function PlatformDevicesPage() {
  const [fleet, setFleet] = useState<PlatformFleetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | ''>('');
  const [claimFilter, setClaimFilter]   = useState<Claim>('');
  const [cmdTarget, setCmdTarget] = useState<PlatformDevice | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setFleet(await platformDevicesApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet');
      setFleet({ devices: [], total: 0, claimed_count: 0, unclaimed_count: 0, simkura: { available: false, error: null, count: 0 } });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    try {
      const r = await platformDevicesApi.syncNow();
      if (r.skipped_reason === 'not_configured') {
        setSyncMsg('Simkura is not configured — nothing to sync.');
      } else {
        setSyncMsg(
          r.inserted > 0
            ? `Pulled ${r.fetched} from Simkura · ${r.inserted} new device${r.inserted === 1 ? '' : 's'} added.`
            : `Pulled ${r.fetched} from Simkura · no new devices.`
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    if (!fleet) return [];
    const term = search.trim().toLowerCase();
    return fleet.devices.filter((d) => {
      if (statusFilter && d.status !== statusFilter) return false;
      if (claimFilter === 'claimed'   && !d.claimed) return false;
      if (claimFilter === 'unclaimed' &&  d.claimed) return false;
      if (!term) return true;
      const hay = [
        d.hardware_device_id, d.device_name, d.company_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [fleet, search, statusFilter, claimFilter]);

  return (
    <>
      <PageHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1>Device fleet</h1>
          <div className="sub">
            {fleet === null
              ? 'Loading…'
              : `${fleet.total} ${fleet.total === 1 ? 'device' : 'devices'} on the platform — ${fleet.claimed_count} claimed, ${fleet.unclaimed_count} in Simkura but unclaimed.`}
          </div>
        </div>
        <ActionButton type="button" onClick={syncNow} disabled={syncing} title="Pull the latest device list from Simkura">
          <IconCloudDownload size={14} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </ActionButton>
      </PageHeader>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}
      {syncMsg && (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: '#dcfce7', border: '1px solid #bbf7d0',
          color: '#166534', fontSize: 13, marginBottom: 12,
        }} role="status">{syncMsg}</div>
      )}

      {fleet?.simkura && !fleet.simkura.available && (
        <SimkuraBanner>
          <IconCloudOff size={18} />
          Simkura is not configured — showing DB-only view.
        </SimkuraBanner>
      )}
      {fleet?.simkura.available && fleet.simkura.error && (
        <SimkuraBanner>
          <IconCloudOff size={18} />
          Couldn&apos;t reach Simkura ({fleet.simkura.error}). Showing DB-only view.
        </SimkuraBanner>
      )}

      <Toolbar>
        <SearchWrap>
          <IconSearch className="icon" size={16} />
          <input
            type="text"
            placeholder="Search serial, name, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </SearchWrap>
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DeviceStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="error">Error</option>
          <option value="maintenance">Maintenance</option>
        </FilterSelect>
        <FilterSelect
          value={claimFilter}
          onChange={(e) => setClaimFilter(e.target.value as Claim)}
        >
          <option value="">All devices</option>
          <option value="claimed">Claimed only</option>
          <option value="unclaimed">Unclaimed only</option>
        </FilterSelect>
      </Toolbar>

      <TableCard>
        {fleet === null ? (
          <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        ) : filtered.length === 0 ? (
          <Empty>
            <span className="crest"><IconLock size={22} strokeWidth={1.5} /></span>
            <h3>No devices match</h3>
            <p>Try adjusting the filters or search.</p>
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Company</th>
                <th>Claim</th>
                <th>Status</th>
                <th>Battery</th>
                <th>Last seen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const tone = batteryTone(d.battery_percent);
                return (
                  <tr key={d.hardware_device_id}>
                    <td>
                      <div className="name">{d.device_name || <span className="unclaimed">Unassigned device</span>}</div>
                      <div className="meta">
                        <span className="serial">{d.hardware_device_id}</span>
                      </div>
                    </td>
                    <td>
                      {d.company_name
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <IconBuilding size={13} /> {d.company_name}
                          </span>
                        : <span className="unclaimed">Unclaimed</span>}
                    </td>
                    <td>
                      <ClaimBadge $claimed={d.claimed}>
                        {d.claimed ? 'Claimed' : 'Unclaimed'}
                      </ClaimBadge>
                    </td>
                    <td><StatusPill $status={d.status}>{d.status}</StatusPill></td>
                    <td>
                      <BatteryCell $tone={tone}>
                        {batteryIcon(d.battery_percent)}
                        {d.battery_percent != null ? `${d.battery_percent}%` : '—'}
                      </BatteryCell>
                    </td>
                    <td>
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>
                        {relativeTime(d.last_seen)}
                      </span>
                    </td>
                    <td>
                      <ActionButton
                        type="button"
                        onClick={() => setCmdTarget(d)}
                        title="Send a command to this device"
                      >
                        <IconTerminal2 size={13} />
                        Command
                      </ActionButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableCard>

      {cmdTarget && (
        <PlatformDeviceCommandModal
          device={cmdTarget}
          onClose={() => setCmdTarget(null)}
          onCommandSent={load}
        />
      )}
    </>
  );
}

export default PlatformDevicesPage;
