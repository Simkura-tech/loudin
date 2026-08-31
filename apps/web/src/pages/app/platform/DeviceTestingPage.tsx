/**
 * DeviceTestingPage — Platform Admin device test bench.
 *
 * A focused harness for sending commands directly to a single device and
 * watching what comes back. Step one is finding the device: search the
 * platform fleet (Simkura Core + our DB merge) by serial, name, or company,
 * then select it to open the command panel.
 *
 * Platform-admin only — the backend command endpoint lets platform admins
 * target any device, claimed or unclaimed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconCloudOff,
  IconSearch,
  IconBuilding,
  IconCircleCheck,
  IconAlertTriangle,
} from '@tabler/icons-react';
import {
  platformDevicesApi,
  type PlatformDevice,
  type PlatformFleetResponse,
} from '../../../services/access/devices';
import { DeviceCommandPanel } from '../../../components/devices/DeviceCommandPanel';

const PageHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 20px;

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

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: 20px;
  align-items: start;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.div`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  overflow: hidden;
`;

const PanelHead = styled.div`
  padding: 12px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const SearchWrap = styled.div`
  position: relative;
  padding: 12px 14px;

  .icon {
    position: absolute;
    left: 24px;
    top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  input {
    width: 100%;
    height: 34px;
    padding: 0 10px 0 34px;
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

const ResultList = styled.div`
  max-height: 460px;
  overflow-y: auto;
`;

const ResultRow = styled.button<{ $active: boolean }>`
  width: 100%;
  display: block;
  text-align: left;
  padding: 10px 14px;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  border-left: 3px solid
    ${({ $active, theme }) => ($active ? theme.colors.brand.primary : 'transparent')};
  background: ${({ $active, theme }) =>
    $active ? `${theme.colors.brand.primary}0d` : theme.colors.background.primary};
  cursor: pointer;
  font-family: inherit;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
  }
  &:last-child { border-bottom: none; }

  .name {
    font-size: 13px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  .serial {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin-top: 1px;
  }
  .company {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.secondary};
    margin-top: 3px;
  }
`;

const Tag = styled.span<{ $tone: 'ok' | 'warn' }>`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  background: ${({ $tone }) => ($tone === 'ok' ? '#dcfce7' : '#fff7ed')};
  color: ${({ $tone }) => ($tone === 'ok' ? '#166534' : '#9a3412')};
`;

const Empty = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 13px;
`;

const Placeholder = styled.div`
  padding: 56px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};

  h3 { color: ${({ theme }) => theme.colors.text.primary}; margin: 0 0 4px; font-size: 16px; }
  p  { margin: 0; font-size: 14px; }
  .serial {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin-top: 6px;
  }
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
  margin-bottom: 16px;
`;

const ErrorBanner = styled.div`
  padding: 8px 10px;
  border-radius: 7px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 12px;
  margin-bottom: 12px;
`;

export function DeviceTestingPage() {
  const [fleet, setFleet] = useState<PlatformFleetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PlatformDevice | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setFleet(await platformDevicesApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet');
      setFleet({
        devices: [], total: 0, claimed_count: 0, unclaimed_count: 0,
        simkura: { available: false, error: null, count: 0 },
      });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const results = useMemo(() => {
    if (!fleet) return [];
    const term = search.trim().toLowerCase();
    if (!term) return fleet.devices;
    return fleet.devices.filter((d) => {
      const hay = [d.hardware_device_id, d.device_name, d.company_name]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [fleet, search]);

  return (
    <>
      <PageHeader>
        <h1>Device Testing</h1>
        <div className="sub">
          Search for a device and send commands directly to it, then watch what it
          reports back. Platform-admin diagnostics — works on claimed and unclaimed devices.
        </div>
      </PageHeader>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      {fleet?.simkura && !fleet.simkura.available && (
        <SimkuraBanner>
          <IconCloudOff size={18} />
          Simkura isn&apos;t configured — showing DB-only devices. Commands will fail upstream until creds are set.
        </SimkuraBanner>
      )}
      {fleet?.simkura.available && fleet.simkura.error && (
        <SimkuraBanner>
          <IconCloudOff size={18} />
          Couldn&apos;t reach Simkura ({fleet.simkura.error}). Showing DB-only view.
        </SimkuraBanner>
      )}

      <Layout>
        <Panel>
          <PanelHead>Find a device</PanelHead>
          <SearchWrap>
            <IconSearch className="icon" size={16} />
            <input
              type="text"
              placeholder="Search serial, name, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </SearchWrap>
          <ResultList>
            {fleet === null ? (
              <Empty>Loading fleet…</Empty>
            ) : results.length === 0 ? (
              <Empty>No devices match “{search}”.</Empty>
            ) : (
              results.map((d) => (
                <ResultRow
                  key={d.hardware_device_id}
                  $active={selected?.hardware_device_id === d.hardware_device_id}
                  onClick={() => setSelected(d)}
                  type="button"
                >
                  <div className="name">{d.device_name || 'Unassigned device'}</div>
                  <div className="serial">{d.hardware_device_id}</div>
                  <div className="company">
                    {d.company_name
                      ? <><IconBuilding size={12} /> {d.company_name}</>
                      : <Tag $tone="warn">Unclaimed</Tag>}
                    {d.in_simkura
                      ? <Tag $tone="ok"><IconCircleCheck size={11} /> In Simkura</Tag>
                      : <Tag $tone="warn"><IconAlertTriangle size={11} /> Not in Simkura</Tag>}
                  </div>
                </ResultRow>
              ))
            )}
          </ResultList>
        </Panel>

        <Panel>
          <PanelHead>Command panel</PanelHead>
          {selected ? (
            <DeviceCommandPanel
              key={selected.hardware_device_id}
              device={selected}
            />
          ) : (
            <Placeholder>
              <h3>No device selected</h3>
              <p>Pick a device from the list to start testing.</p>
            </Placeholder>
          )}
        </Panel>
      </Layout>
    </>
  );
}

export default DeviceTestingPage;
