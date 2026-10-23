/**
 * PeopleViewTabs — the People | Users switch shared by PeoplePage and
 * UsersPage.
 *
 * People hold door credentials; Users can sign in. They are different tables
 * and different pages, but admins think of both as "who's in this workspace",
 * so they live under one nav item with a segmented switch. Each view has its
 * own URL (/app/people, /app/people/users) so the browser back button and
 * deep links work.
 *
 * Only admins can list users (GET /api/workspace/members is admin-only), so
 * callers render this only for admins; non-admins see People with no switch.
 */

import { NavLink } from 'react-router-dom';
import styled from '@emotion/styled';

const Tabs = styled.nav`
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  margin-bottom: 16px;
  border-radius: 9px;
  background: ${({ theme }) => theme.colors.background.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};

  a {
    border-radius: 7px;
    padding: 5px 14px;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    color: ${({ theme }) => theme.colors.text.secondary};

    &.active {
      background: ${({ theme }) => theme.colors.background.primary};
      color: ${({ theme }) => theme.colors.text.primary};
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    }
  }
`;

export default function PeopleViewTabs() {
  return (
    <Tabs aria-label="People view">
      <NavLink to="/app/people" end title="Credential holders who open doors">People</NavLink>
      <NavLink to="/app/people/users" title="Logins that can sign in to this workspace">Users</NavLink>
    </Tabs>
  );
}
