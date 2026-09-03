/**
 * IntegrationsPage — the platform-admin Integrations directory.
 *
 * A tight, registry-driven grid: one compact card per integration returned
 * by GET /api/platform/integrations (label, one-line description, computed
 * status). Everything is generic — adding an integration on the API side
 * (see docs/integrations/adding-an-integration.md) makes a card appear here
 * with no frontend change. Clicking a card opens its detail page, where the
 * credentials are added / updated.
 *
 * Platform-admin only (the route is gated in App.tsx / the nav in
 * AppLayout.tsx). Editing lives in IntegrationDetailPage.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { IconChevronRight, IconRefresh, IconPlugConnected } from '@tabler/icons-react';
import { integrationsApi, type IntegrationInfo } from '../../../services/platform/integrations';

const Page = styled.div`padding: 4px 0 32px;`;
const Header = styled.div`
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  margin-bottom: 4px;
  h1 { font-size: 20px; font-weight: 650; margin: 0; color: ${({ theme }) => theme.colors.text.primary}; }
`;
const Intro = styled.p`
  font-size: 13px; color: ${({ theme }) => theme.colors.text.tertiary};
  margin: 4px 0 20px; max-width: 640px; line-height: 1.5;
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
`;
const Card = styled.button`
  display: grid; grid-template-columns: 36px 1fr auto; align-items: center; gap: 12px;
  text-align: left; width: 100%; padding: 14px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px; background: ${({ theme }) => theme.colors.background.primary};
  font-family: inherit; cursor: pointer; transition: border-color 0.12s, box-shadow 0.12s;
  &:hover {
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .icon {
    width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center;
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.secondary};
    font-weight: 700; font-size: 15px; text-transform: uppercase;
  }
  .body { min-width: 0; }
  .row { display: flex; align-items: center; gap: 8px; }
  .label {
    font-size: 14px; font-weight: 600; color: ${({ theme }) => theme.colors.text.primary};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .desc {
    font-size: 12px; color: ${({ theme }) => theme.colors.text.tertiary};
    margin-top: 2px; line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .chevron { color: ${({ theme }) => theme.colors.text.tertiary}; display: flex; }
`;
const Pill = styled.span<{ $s: 'ok' | 'off' }>`
  flex: none; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
  background: ${({ $s }) => ($s === 'ok' ? '#dcfce7' : '#f1f5f9')};
  color:      ${({ $s }) => ($s === 'ok' ? '#166534' : '#475569')};
`;
const Note = styled.div`
  font-size: 13px; color: ${({ theme }) => theme.colors.text.tertiary};
  padding: 16px; border: 1px dashed ${({ theme }) => theme.colors.border.light}; border-radius: 10px;
`;
const ErrorBanner = styled.div`
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: #991b1b; background: #fef2f2; border: 1px solid #fecaca;
  border-radius: 8px; padding: 10px 12px;
  button {
    display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px;
    border-radius: 6px; border: 1px solid #fecaca; background: #fff; color: #991b1b;
    font-size: 12px; font-family: inherit; cursor: pointer;
  }
`;

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<IntegrationInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await integrationsApi.list();
      setData(r.integrations);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Page>
      <Header><h1>Integrations</h1></Header>
      <Intro>
        External services Loudin connects to — devices, email, SMS, sign-in.
        Open one to add or update its credentials. Values saved here override
        the API server&apos;s environment variables; clearing one reverts to the
        env var.
      </Intro>

      {loading && <Note>Loading integrations…</Note>}

      {!loading && error && (
        <ErrorBanner role="alert">
          {error}
          <button type="button" onClick={() => { setLoading(true); void load(); }}>
            <IconRefresh size={13} /> Retry
          </button>
        </ErrorBanner>
      )}

      {!loading && !error && data && (
        <Grid>
          {data.map((info) => (
            <Card key={info.name} type="button" onClick={() => navigate(info.name)}>
              <span className="icon" aria-hidden>
                {(info.label || info.name).trim().charAt(0) || <IconPlugConnected size={18} />}
              </span>
              <span className="body">
                <span className="row">
                  <span className="label">{info.label}</span>
                  {info.status.configured
                    ? <Pill $s="ok">on</Pill>
                    : <Pill $s="off">off</Pill>}
                </span>
                {info.description && <span className="desc">{info.description}</span>}
              </span>
              <span className="chevron"><IconChevronRight size={18} /></span>
            </Card>
          ))}
        </Grid>
      )}
    </Page>
  );
}
