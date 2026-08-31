/**
 * DirectoryPage — platform-admin "Directory": every tenant on the platform.
 *
 * Wraps the CompaniesPage table with the Directory page header.
 * Mounted at /app/companies (also where CompanyDetail backs to).
 */

import styled from '@emotion/styled';
import CompaniesPage from '../CompaniesPage';

const PageHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 14px;

  h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
  .sub { color: ${({ theme }) => theme.colors.text.secondary}; font-size: 13px; }
`;

export function DirectoryPage() {
  return (
    <>
      <PageHeader>
        <h1>Directory</h1>
        <div className="sub">Tenants on the platform.</div>
      </PageHeader>

      <CompaniesPage embedded />
    </>
  );
}

export default DirectoryPage;
