/**
 * FleetPage — Reseller view of every lock at any of their customers.
 *
 * Backed by GET /api/reseller/devices, which joins devices→companies and
 * filters by parent_company_id = caller. Pool / unassigned devices
 * (reseller_company_id set but company_id null) are intentionally
 * excluded for this slice.
 *
 * Each row shows the device, its customer (linked to the customer
 * drill-in), live status, battery, and last-seen time.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconBattery,
  IconBattery1,
  IconBattery2,
  IconBattery3,
  IconBattery4,
  IconBatteryOff,
  IconLock,
  IconSearch,
} from '@tabler/icons-react';
import {
  resellerApi,
  type FleetDevice,
  type ManagedCustomer,
} from '../../../services/tenancy/reseller';

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

const FilterSelect = styled.select`
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;
  max-width: 220px;
`;

const Summary = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin-left: auto;
  font-variant-numeric: tabular-nums;
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
  .serial {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  .customer-link {
    color: inherit;
    text-decoration: none;
    font-weight: 600;
  }
  .customer-link:hover { text-decoration: underline; }
`;

const StatusPill = styled.span<{ $status: FleetDevice['status'] }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  background: ${({ $status }) =>
    $status === 'online'      ? '#dcfce7'
  : $status === 'offline'     ? '#f1f5f9'
  : $status === 'error'       ? '#fee2e2'
  : $status === 'maintenance' ? '#fef3c7'
  :                              '#f1f5f9'};
  color: ${({ $status }) =>
    $status === 'online'      ? '#166534'
  : $status === 'offline'     ? '#475569'
  : $status === 'error'       ? '#991b1b'
  : $status === 'maintenance' ? '#92400e'
  :                              '#475569'};

  &::before {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.85;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function batteryIcon(pct: number | null) {
  if (pct == null) return <IconBatteryOff size={16} />;
  if (pct >= 80) return <IconBattery4 size={16} />;
  if (pct >= 55) return <IconBattery3 size={16} />;
  if (pct >= 30) return <IconBattery2 size={16} />;
  if (pct >= 10) return <IconBattery1 size={16} />;
  return <IconBattery size={16} />;
}

// ── Component ────────────────────────────────────────────────────────────────

export function FleetPage() {
  const [search,    setSearch]    = useState('');
  const [status,    setStatus]    = useState<'' | FleetDevice['status']>('');
  const [customer,  setCustomer]  = useState<'' | number>('');
  const [devices,   setDevices]   = useState<FleetDevice[] | null>(null);
  const [total,     setTotal]     = useState(0);
  const [customers, setCustomers] = useState<ManagedCustomer[]>([]);
  const [error,     setError]     = useState<string | null>(null);

  // Debounced search.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  // Customers populate the filter dropdown.
  useEffect(() => {
    resellerApi.customers({ limit: 200 })
      .then((r) => setCustomers(r.customers))
      .catch(() => setCustomers([]));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await resellerApi.devices({
        search:      debouncedSearch || undefined,
        status:      status || undefined,
        customer_id: typeof customer === 'number' ? customer : undefined,
        limit:       100,
      });
      setDevices(r.devices);
      setTotal(r.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
      setDevices([]);
    }
  }, [debouncedSearch, status, customer]);

  useEffect(() => { load(); }, [load]);

  const filtersActive = useMemo(
    () => !!debouncedSearch || !!status || customer !== '',
    [debouncedSearch, status, customer],
  );

  return (
    <>
      <PageHeader>
        <h1>Fleet</h1>
        <p>Every lock installed at one of your customers.</p>
      </PageHeader>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <Toolbar>
        <SearchWrap>
          <IconSearch className="icon" size={14} />
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by device name or serial…"
          />
        </SearchWrap>
        <FilterSelect
          value={status}
          onChange={(e) => setStatus(e.target.value as FleetDevice['status'] | '')}
          title="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="error">Error</option>
          <option value="maintenance">Maintenance</option>
        </FilterSelect>
        <FilterSelect
          value={customer === '' ? '' : String(customer)}
          onChange={(e) => {
            const v = e.target.value;
            setCustomer(v ? Number(v) : '');
          }}
          title="Filter by customer"
        >
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </FilterSelect>
        {devices && devices.length > 0 && (
          <Summary>{total} device{total === 1 ? '' : 's'}</Summary>
        )}
      </Toolbar>

      <Panel>
        {devices === null ? (
          <Empty><div className="title">Loading…</div></Empty>
        ) : devices.length === 0 ? (
          <Empty>
            <div className="crest"><IconLock size={22} /></div>
            <div className="title">
              {filtersActive ? 'No devices match the filter' : 'No devices yet'}
            </div>
            <div className="body">
              {filtersActive
                ? 'Try clearing the filters or a different search.'
                : 'When a customer provisions a lock through your dealer account, it will appear here.'}
            </div>
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Battery</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="name">{d.device_name}</div>
                    <div className="meta">
                      {d.location || <span style={{ opacity: 0.5 }}>—</span>}
                      {' · '}
                      <span className="serial">{d.device_id}</span>
                    </div>
                  </td>
                  <td>
                    <Link to={`/app/customers/${d.customer_id}`} className="customer-link">
                      {d.customer_name}
                    </Link>
                  </td>
                  <td><StatusPill $status={d.status}>{d.status}</StatusPill></td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {batteryIcon(d.battery_percent)}
                      {d.battery_percent != null ? `${d.battery_percent}%` : '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>
                      {relativeTime(d.last_seen)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}

export default FleetPage;
