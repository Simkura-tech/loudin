/**
 * InstallerAccessDrawer — "who may service our doors", for end-user admins.
 *
 * Rendered inside WorkspaceSettings as one more collapsible drawer, but it
 * saves itself: granting and revoking hit the API immediately rather than
 * riding the page's single Save button, because a grant is an access
 * decision, not a profile field.
 *
 * Read-only while an installer is inside this workspace on a service
 * session — the server refuses grant changes from inside one anyway.
 */

import { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { IconChevronDown, IconTool, IconTrash } from '@tabler/icons-react';
import {
  installerAccessApi,
  type InstallerCompany,
  type InstallerGrant,
} from '../../services/tenancy/installers';

const Drawer = styled.details`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  margin-bottom: 12px;

  & > summary { border-radius: 10px 10px 0 0; }
  &:not([open]) > summary { border-radius: 10px; }
  &[open] > summary { border-bottom: 1px solid ${({ theme }) => theme.colors.border.light}; }
  &[open] > summary .chevron { transform: rotate(180deg); }
`;

const DrawerSummary = styled.summary`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  list-style: none;
  user-select: none;

  &::-webkit-details-marker { display: none; }
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }

  .label { display: inline-flex; align-items: baseline; gap: 10px; min-width: 0; }
  .title { font-size: 13px; font-weight: 600; color: ${({ theme }) => theme.colors.text.primary}; }
  .summary {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .right { display: inline-flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .chevron { transition: transform 150ms ease; color: ${({ theme }) => theme.colors.text.tertiary}; }
`;

const DrawerBody = styled.div`
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Help = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
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

  .who { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .name { font-weight: 500; }
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

const Button = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme, $danger }) => ($danger ? '#b91c1c' : theme.colors.text.primary)};
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: ${({ theme, $danger }) => ($danger ? '#fef2f2' : theme.colors.background.secondary)}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Primary = styled(Button)`
  border: none;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-weight: 600;
  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
`;

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
`;

const Empty = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

interface Props {
  /** True while an installer is inside this workspace on a service session. */
  readOnly?: boolean;
}

export default function InstallerAccessDrawer({ readOnly = false }: Props) {
  const [grants, setGrants] = useState<InstallerGrant[] | null>(null);
  const [available, setAvailable] = useState<InstallerCompany[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const g = await installerAccessApi.list();
      setGrants(g);
      if (!readOnly) setAvailable(await installerAccessApi.available());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load installer access');
      setGrants([]);
    }
  }, [readOnly]);

  useEffect(() => { void load(); }, [load]);

  const grantedIds = new Set((grants ?? []).map((g) => g.installer.id));
  const choices = available.filter((i) => !grantedIds.has(i.id));

  const grant = async () => {
    const id = Number(selected);
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await installerAccessApi.grant(id);
      setSelected('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grant access');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (g: InstallerGrant) => {
    if (!window.confirm(`Revoke ${g.installer.name}'s access to this workspace? Any session they have open ends immediately.`)) return;
    setBusy(true);
    setError(null);
    try {
      await installerAccessApi.revoke(g.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke access');
    } finally {
      setBusy(false);
    }
  };

  const summary = grants === null
    ? 'Loading…'
    : grants.length === 0
      ? 'No installer has access'
      : grants.map((g) => g.installer.name).join(', ');

  return (
    <Drawer>
      <DrawerSummary>
        <span className="label">
          <span className="title">Installer access</span>
          <span className="summary">{summary}</span>
        </span>
        <span className="right">
          <IconChevronDown size={16} className="chevron" />
        </span>
      </DrawerSummary>
      <DrawerBody>
        <Help>
          An installer is a technician company that can open your workspace to
          deploy and service your doors. While granted, their staff have admin
          access here and every action is logged under their company name.
          You can revoke access at any time.
        </Help>

        {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

        {grants && grants.length === 0 && <Empty>No installer currently has access.</Empty>}

        {grants && grants.length > 0 && (
          <List>
            {grants.map((g) => (
              <Row key={g.id}>
                <div className="who">
                  <span className="name"><IconTool size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />{g.installer.name}</span>
                  <span className="meta">
                    Granted {fmtDate(g.granted_at)}{g.granted_by ? ` by ${g.granted_by}` : ''}
                    {g.installer.company_email ? ` · ${g.installer.company_email}` : ''}
                  </span>
                </div>
                {!readOnly && (
                  <Button type="button" $danger disabled={busy} onClick={() => revoke(g)}>
                    <IconTrash size={14} /> Revoke
                  </Button>
                )}
              </Row>
            ))}
          </List>
        )}

        {readOnly ? (
          <Empty>Installer access can only be changed by the customer&apos;s own admins.</Empty>
        ) : (
          <GrantRow>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy || choices.length === 0}
              aria-label="Installer company"
            >
              <option value="">
                {choices.length === 0 ? 'No other installers available' : 'Choose an installer company…'}
              </option>
              {choices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}{[i.city, i.state].filter(Boolean).length ? ` — ${[i.city, i.state].filter(Boolean).join(', ')}` : ''}
                </option>
              ))}
            </select>
            <Primary type="button" disabled={busy || !selected} onClick={grant}>
              Grant access
            </Primary>
          </GrantRow>
        )}
      </DrawerBody>
    </Drawer>
  );
}
