/**
 * CompanyInstallerAccess — the installer relationship on the platform
 * admin's company detail page.
 *
 * For an end-user company: which installers may work here, with grant
 * (pick any active installer company) and revoke.
 * For an installer company: which customers it currently services.
 *
 * Self-contained drawer so CompanyDetailPage only has to mount it.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from '@emotion/styled';
import { IconBuilding, IconChevronDown, IconTool, IconTrash } from '@tabler/icons-react';
import { companiesApi, type Company } from '../../services/platform/companies';
import type { InstallerGrant } from '../../services/tenancy/installers';

const Drawer = styled.details`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 12px;
  margin-top: 12px;

  &[open] > summary { border-bottom: 1px solid ${({ theme }) => theme.colors.border.light}; }
  &[open] > summary .chevron { transform: rotate(180deg); }
`;

const DrawerSummary = styled.summary`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  font-size: 13px;
  font-weight: 600;

  &::-webkit-details-marker { display: none; }
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; border-radius: 12px; }
  .label { display: inline-flex; align-items: center; gap: 6px; }
  .right { display: inline-flex; align-items: center; gap: 10px; color: ${({ theme }) => theme.colors.text.secondary}; font-weight: 500; }
  .chevron { transition: transform 150ms ease; }
`;

const Body = styled.div`
  padding: 12px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
`;

const Help = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.text.secondary};
  line-height: 1.5;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 8px;

  .who { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .name { font-weight: 500; a { color: inherit; } }
  .meta { font-size: 12px; color: ${({ theme }) => theme.colors.text.secondary}; }
`;

const GrantRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;

  select {
    flex: 1;
    min-width: 200px;
    height: 32px;
    padding: 0 10px;
    border-radius: 7px;
    border: 1px solid ${({ theme }) => theme.colors.border.light};
    background: ${({ theme }) => theme.colors.background.primary};
    font-size: 13px;
    font-family: inherit;
  }
`;

const Button = styled.button<{ $danger?: boolean; $primary?: boolean }>`
  display: inline-flex; align-items: center; gap: 5px;
  height: 32px; padding: 0 12px; border-radius: 8px;
  border: 1px solid ${({ theme, $primary }) => ($primary ? 'transparent' : theme.colors.border.light)};
  background: ${({ theme, $primary }) => ($primary ? theme.colors.brand.primary : theme.colors.background.primary)};
  color: ${({ theme, $danger, $primary }) => ($primary ? '#fff' : $danger ? '#b91c1c' : theme.colors.text.primary)};
  font-size: 13px; font-weight: ${({ $primary }) => ($primary ? 600 : 500)}; font-family: inherit; cursor: pointer;
  &:hover { background: ${({ theme, $danger, $primary }) =>
    $primary ? (theme.colors.brand.primaryHover ?? theme.colors.brand.primary) : $danger ? '#fef2f2' : theme.colors.background.secondary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const ErrorBanner = styled.div`
  padding: 10px 12px; border-radius: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
`;

const Empty = styled.div` color: ${({ theme }) => theme.colors.text.tertiary}; `;

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

export default function CompanyInstallerAccess({ company }: { company: Company }) {
  const isInstaller = company.company_type === 'installer';
  const [grants, setGrants] = useState<InstallerGrant[] | null>(null);
  const [installers, setInstallers] = useState<Company[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (isInstaller) {
        setGrants(await companiesApi.customers(company.id));
      } else {
        const [g, list] = await Promise.all([
          companiesApi.installers(company.id),
          companiesApi.list({ type: 'installer', status: 'active', limit: 200 }),
        ]);
        setGrants(g);
        setInstallers(list.companies);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load installer access');
      setGrants([]);
    }
  }, [company.id, isInstaller]);

  useEffect(() => { void load(); }, [load]);

  if (company.company_type === 'platform') return null;

  const grantedIds = new Set((grants ?? []).map((g) => g.installer.id));
  const choices = installers.filter((i) => !grantedIds.has(i.id));

  const grant = async () => {
    const id = Number(selected);
    if (!id) return;
    setBusy(true); setError(null);
    try {
      await companiesApi.grantInstaller(company.id, id);
      setSelected('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grant access');
    } finally { setBusy(false); }
  };

  const revoke = async (g: InstallerGrant) => {
    if (!window.confirm(`Revoke ${g.installer.name}'s access to ${company.name}? Open sessions end immediately.`)) return;
    setBusy(true); setError(null);
    try {
      await companiesApi.revokeInstaller(company.id, g.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke access');
    } finally { setBusy(false); }
  };

  const count = grants?.length ?? null;

  return (
    <Drawer>
      <DrawerSummary>
        <span className="label">
          {isInstaller ? <IconBuilding size={14} /> : <IconTool size={14} />}
          {isInstaller ? 'Customers' : 'Installer access'}
        </span>
        <span className="right">
          <span>{count ?? '—'}</span>
          <IconChevronDown size={16} className="chevron" />
        </span>
      </DrawerSummary>
      <Body>
        <Help>
          {isInstaller
            ? 'Customer workspaces this installer may open. Grants are managed from each customer’s page or by the customer’s own admins.'
            : 'Installer companies that may open this workspace with admin access. The customer’s admins can also manage this from Settings. Every installer action is logged under the installer’s name.'}
        </Help>

        {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

        {grants && grants.length === 0 && (
          <Empty>{isInstaller ? 'No customers have granted access yet.' : 'No installer has access to this workspace.'}</Empty>
        )}

        {grants && grants.map((g) => (
          <Row key={g.id}>
            <div className="who">
              <span className="name">
                <Link to={`/app/companies/${isInstaller ? g.customer.id : g.installer.id}`}>
                  {isInstaller ? g.customer.name : g.installer.name}
                </Link>
              </span>
              <span className="meta">
                Granted {fmtDate(g.granted_at)}{g.granted_by ? ` by ${g.granted_by}` : ''}
                {isInstaller && g.customer.device_count != null ? ` · ${g.customer.device_count} devices` : ''}
              </span>
            </div>
            {!isInstaller && (
              <Button type="button" $danger disabled={busy} onClick={() => revoke(g)}>
                <IconTrash size={14} /> Revoke
              </Button>
            )}
          </Row>
        ))}

        {!isInstaller && company.status !== 'canceled' && (
          <GrantRow>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={busy || choices.length === 0} aria-label="Installer company">
              <option value="">{choices.length === 0 ? 'No other active installer companies' : 'Choose an installer company…'}</option>
              {choices.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <Button type="button" $primary disabled={busy || !selected} onClick={grant}>Grant access</Button>
          </GrantRow>
        )}
      </Body>
    </Drawer>
  );
}
