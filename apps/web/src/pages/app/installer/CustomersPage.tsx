/**
 * CustomersPage — an installer company's home screen.
 *
 * Lists the customer workspaces that have granted this installer access and
 * opens a service session in one ("Open workspace"). Inside the session the
 * app renders the customer's workspace with the full admin nav and a banner
 * naming the installer; AppLayout's Exit button brings the user back here.
 *
 * Installer Admins can also provision a new customer ("New customer"): the
 * company is created, its first admin invited, and the grant issued in one
 * call, so the workspace is ready to open immediately.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { IconArrowRight, IconBuilding, IconLock, IconMapPin, IconPlus, IconUsers } from '@tabler/icons-react';
import { useAuth } from '../../../contexts/AuthContext';
import { installerApi } from '../../../services/installer/customers';
import type { InstallerGrant } from '../../../services/tenancy/installers';
import NewCompanyDialog from '../../../components/platform/NewCompanyDialog';

const PageHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  .titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
  .sub { color: ${({ theme }) => theme.colors.text.secondary}; font-size: 13px; }
`;

const NewButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  flex-shrink: 0;

  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
`;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 12px;

  .top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .crest {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    flex-shrink: 0;
  }
  .name {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.secondary};

    span { display: inline-flex; align-items: center; gap: 4px; }
  }
  .status {
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const OpenButton = styled.button`
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  border-radius: 8px;
  border: none;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Empty = styled.div`
  padding: 40px 24px;
  text-align: center;
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px dashed ${({ theme }) => theme.colors.border.light};
  border-radius: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
  line-height: 1.55;

  strong { color: ${({ theme }) => theme.colors.text.primary}; }
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

export function CustomersPage() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [customers, setCustomers] = useState<InstallerGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const isAdmin = user?.user_type_id === 1;

  const load = useCallback(async () => {
    try {
      setCustomers(await installerApi.customers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load customers');
      setCustomers([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = async (grant: InstallerGrant) => {
    setOpening(grant.customer.id);
    setError(null);
    try {
      await installerApi.startSession(grant.customer.id);
      await refresh();      // AuthContext now reflects the customer workspace
      navigate('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this workspace');
      setOpening(null);
    }
  };

  const count = customers?.length ?? 0;

  return (
    <>
      <PageHeader>
        <div className="titles">
          <h1>Customers</h1>
          <div className="sub">
            {customers === null
              ? 'Loading…'
              : `${count} workspace${count === 1 ? '' : 's'} ${user?.company_name ?? 'your company'} can service.`}
          </div>
        </div>
        {isAdmin && (
          <NewButton type="button" onClick={() => setNewOpen(true)}>
            <IconPlus size={16} /> New customer
          </NewButton>
        )}
      </PageHeader>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      {customers && customers.length === 0 && (
        <Empty>
          <strong>No customers yet.</strong><br />
          A customer grants access from their workspace settings, or the platform
          can set it up for them. Once granted, their workspace appears here.
          {isAdmin && <> Setting up a new customer? Use <strong>New customer</strong> above.</>}
        </Empty>
      )}

      {newOpen && (
        <NewCompanyDialog
          variant="installer"
          onClose={() => setNewOpen(false)}
          onCreated={() => { void load(); }}
        />
      )}

      {customers && customers.length > 0 && (
        <Grid>
          {customers.map((g) => {
            const place = [g.customer.city, g.customer.state].filter(Boolean).join(', ');
            const inactive = g.customer.status !== 'active';
            return (
              <Card key={g.id}>
                <div className="top">
                  <span className="crest"><IconBuilding size={18} strokeWidth={1.75} /></span>
                  <div>
                    <div className="name">{g.customer.name}</div>
                    {inactive && <div className="status">{g.customer.status}</div>}
                  </div>
                </div>
                <div className="meta">
                  <span><IconLock size={13} /> {g.customer.device_count ?? 0} devices</span>
                  <span><IconUsers size={13} /> {g.customer.user_count ?? 0} users</span>
                  {place && <span><IconMapPin size={13} /> {place}</span>}
                </div>
                <OpenButton
                  type="button"
                  disabled={opening !== null || inactive}
                  onClick={() => open(g)}
                  title={inactive ? `This workspace is ${g.customer.status}` : undefined}
                >
                  {opening === g.customer.id ? 'Opening…' : (<>Open workspace <IconArrowRight size={15} /></>)}
                </OpenButton>
              </Card>
            );
          })}
        </Grid>
      )}
    </>
  );
}

export default CustomersPage;
