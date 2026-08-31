/**
 * SettingsLayout — page chrome for the settings area.
 *
 * Renders the page header and a horizontal tab bar; the matched child route
 * (Workspace / Profile) renders into the Outlet.
 */

import { NavLink, Outlet } from 'react-router-dom';
import styled from '@emotion/styled';

const Page = styled.div`
  max-width: 680px;
`;

const PageHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 14px;

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

const Tabs = styled.nav`
  display: flex;
  gap: 2px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  margin-bottom: 20px;
`;

const Tab = styled(NavLink)`
  position: relative;
  padding: 8px 12px;
  margin-bottom: -1px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
  &.active {
    color: ${({ theme }) => theme.colors.text.primary};
    border-bottom-color: ${({ theme }) => theme.colors.brand.primary};
  }
`;

export function SettingsLayout() {
  return (
    <Page>
      <PageHeader>
        <h1>Settings</h1>
        <div className="sub">Manage your workspace and your account.</div>
      </PageHeader>

      <Tabs>
        <Tab to="/app/settings/workspace">Workspace</Tab>
        <Tab to="/app/settings/profile">Profile</Tab>
        <Tab to="/app/settings/security">Security</Tab>
      </Tabs>

      <Outlet />
    </Page>
  );
}

export default SettingsLayout;
