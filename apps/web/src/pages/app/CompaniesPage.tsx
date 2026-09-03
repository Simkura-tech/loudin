/**
 * CompaniesPage — Platform Admin only. Lists every tenant on the platform.
 *
 * Backend gates the data via requirePlatformAdmin; this page assumes the user
 * is platform staff (the sidebar only renders the nav item when they are).
 * If a non-platform admin types the URL directly, the API responds 403 and
 * the page shows the error banner.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { IconBuilding, IconSearch } from '@tabler/icons-react';
import {
  companiesApi,
  type Company,
  type CompanyStatus,
  type CompanyType,
} from '../../services/platform/companies';

const TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
  { value: 'platform', label: 'Platform' },
  { value: 'end_user', label: 'End-user' },
];

const STATUSES: CompanyStatus[] = ['active', 'inactive', 'suspended', 'canceled'];

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
  .num {
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.text.secondary};
  }
`;

const TypePill = styled.span<{ $type: CompanyType }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
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
  letter-spacing: 0.02em;
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

const Empty = styled.div`
  padding: 48px 24px;
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function CompaniesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [total, setTotal]         = useState(0);
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter]     = useState<CompanyType | ''>('');
  const [statusFilter, setStatusFilter] = useState<CompanyStatus | ''>('');
  const [error, setError]         = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const r = await companiesApi.list({
        search: search.trim() || undefined,
        type:   typeFilter   || undefined,
        status: statusFilter || undefined,
      });
      setCompanies(r.companies);
      setTotal(r.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load companies');
      setCompanies([]);
    }
  }, [search, typeFilter, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetch, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [fetch, search]);

  return (
    <>
      {!embedded && (
        <PageHeader>
          <h1>Companies</h1>
          <div className="sub">
            {companies === null
              ? 'Loading…'
              : `${total} ${total === 1 ? 'tenant' : 'tenants'} on the platform.`}
          </div>
        </PageHeader>
      )}

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <Toolbar>
        <SearchWrap>
          <IconSearch className="icon" size={16} />
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </SearchWrap>
        <FilterSelect
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CompanyType | '')}
        >
          <option value="">All types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CompanyStatus | '')}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </FilterSelect>
      </Toolbar>

      <TableCard>
        {companies === null ? (
          <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        ) : companies.length === 0 ? (
          <Empty>
            <span className="crest"><IconBuilding size={22} strokeWidth={1.5} /></span>
            <h3>No companies match</h3>
            <p>Adjust the filters or search to find tenants.</p>
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Parent</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Users</th>
                <th style={{ textAlign: 'right' }}>Devices</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr
                  key={c.id}
                  className="clickable"
                  onClick={() => navigate(`/app/companies/${c.id}`)}
                >
                  <td>
                    <div className="name">{c.name}</div>
                    {c.company_email && <div className="meta">{c.company_email}</div>}
                  </td>
                  <td>
                    <TypePill $type={c.company_type}>
                      {c.company_type === 'end_user' ? 'End-user' : c.company_type}
                    </TypePill>
                  </td>
                  <td>{c.parent_company_name || <span style={{ opacity: 0.4 }}>—</span>}</td>
                  <td><StatusPill $status={c.status}>{c.status}</StatusPill></td>
                  <td style={{ textAlign: 'right' }}><span className="num">{c.user_count}</span></td>
                  <td style={{ textAlign: 'right' }}><span className="num">{c.device_count}</span></td>
                  <td><span style={{ color: '#94a3b8', fontSize: 12 }}>{fmtDate(c.created_at)}</span></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
    </>
  );
}

export default CompaniesPage;
