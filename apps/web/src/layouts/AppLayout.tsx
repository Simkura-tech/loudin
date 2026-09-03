/**
 * AppLayout — chrome for the signed-in product surface.
 *
 * Left sidebar with section nav + user footer; main content area renders the
 * matched nested route via <Outlet />.
 */

import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconArrowsLeftRight,
  IconLayoutDashboard,
  IconUsers,
  IconUsersGroup,
  IconBuilding,
  IconKey,
  IconPlugConnected,
  IconLock,
  IconSettings,
  IconLogout,
  IconChevronDown,
} from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import { workspaceApi } from '../services/tenancy/workspace';
import { auth } from '../services/auth/auth';
import { branding } from '../branding';

const SIDEBAR_WIDTH = 240;

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.background.secondary};
  color: ${({ theme }) => theme.colors.text.primary};
  display: grid;
  grid-template-columns: ${SIDEBAR_WIDTH}px 1fr;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`;

const Sidebar = styled.aside`
  background: ${({ theme }) => theme.colors.background.primary};
  border-right: 1px solid ${({ theme }) => theme.colors.border.light};
  display: flex;
  flex-direction: column;
  padding: 16px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;

  @media (max-width: 880px) {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  }
`;

const Brand = styled(Link)`
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px 16px;
  text-decoration: none;

  .mark {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const CompanyBadge = styled.div`
  padding: 12px 12px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.background.secondary};
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 16px;

  .label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  .name {
    font-size: 14px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const COMPANY_TYPE_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  platform: { label: 'Platform', bg: '#fef3c7', fg: '#78350f' },
  reseller: { label: 'Reseller', bg: '#e0e7ff', fg: '#3730a3' },
  end_user: { label: 'End user', bg: '#d1fae5', fg: '#065f46' },
};

const TypePill = styled.span<{ $bg: string; $fg: string }>`
  align-self: flex-start;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
`;

const NavList = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.primary};
  }
  &.active {
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
  }
  &.active svg {
    color: ${({ theme }) => theme.colors.brand.primary};
  }
`;

// Category heading that groups NavItems (platform-admin nav). First one gets
// less top padding since it can follow the Overview item directly.
const NavSection = styled.div`
  padding: 14px 12px 4px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text.tertiary};
  user-select: none;
`;

const Spacer = styled.div`
  flex: 1;
`;

const UserMenuWrap = styled.div`
  position: relative;
`;

const UserButton = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  transition: background 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.brand.primary};
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 12px;
    flex-shrink: 0;
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .name {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .email {
    color: ${({ theme }) => theme.colors.text.tertiary};
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chev {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const UserMenu = styled.div`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  padding: 6px;
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  z-index: 20;
`;

const UserMenuItem = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
  }
`;

const Main = styled.main`
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const ContentWrap = styled.div`
  padding: 32px clamp(20px, 4vw, 48px);
`;

const NameWorkspaceBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.brand.primary}0f;
  border-bottom: 1px solid ${({ theme }) => theme.colors.brand.primary}33;
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  flex-wrap: wrap;

  .icon  { flex-shrink: 0; color: ${({ theme }) => theme.colors.brand.primary}; }
  .body  { flex: 1; min-width: 180px; }
  .title { font-weight: 600; }
  .meta  { font-size: 12px; color: ${({ theme }) => theme.colors.text.secondary}; margin-top: 1px; }

  form {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  input {
    height: 34px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.border.light};
    background: ${({ theme }) => theme.colors.background.primary};
    color: ${({ theme }) => theme.colors.text.primary};
    font-size: 13px;
    font-family: inherit;
    min-width: 180px;

    &:focus {
      outline: none;
      border-color: ${({ theme }) => theme.colors.brand.primary};
      box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
    }
  }
  .save {
    height: 34px;
    padding: 0 14px;
    border: none;
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.brand.primary};
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .save:disabled { opacity: 0.6; cursor: not-allowed; }
  .later {
    background: transparent;
    border: none;
    color: ${({ theme }) => theme.colors.text.tertiary};
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    padding: 4px 6px;
  }
  .later:hover { color: ${({ theme }) => theme.colors.text.primary}; }
  .err { flex-basis: 100%; color: #991b1b; font-size: 12px; }
`;

const ImpersonationBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #312e81;
  border-bottom: 1px solid #1e1b4b;
  color: #ffffff;
  font-size: 13px;

  .icon  { flex-shrink: 0; opacity: 0.95; }
  .body  { flex: 1; }
  .title { font-weight: 600; }
  .meta  { font-size: 12px; opacity: 0.78; margin-top: 1px; }
  .exit  {
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: inherit;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .exit:hover    { background: rgba(255, 255, 255, 0.26); }
  .exit:disabled { opacity: 0.6; cursor: not-allowed; }
`;

export function AppLayout() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);

  // "Name your workspace" prompt — shown to admins whose company name is still
  // the signup-time placeholder. Dismissible for the session only; it returns
  // next login until they actually name it.
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [namePromptDismissed, setNamePromptDismissed] = useState(() => {
    try { return sessionStorage.getItem('loudin.nameWorkspaceDismissed') === '1'; } catch { return false; }
  });

  if (!user) return null; // ProtectedRoute should guard, this is belt-and-braces.

  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  const isImpersonating = !!user.impersonation;
  // Role gates use the user's *current* company_type. During impersonation
  // company_type='end_user' (the impersonated tenant), so reseller-only
  // and platform-only UI is naturally hidden.
  const isPlatformAdmin = !isImpersonating && user.user_type_id === 1 && user.company_type === 'platform';
  const isResellerAdmin = !isImpersonating && user.user_type_id === 1 && user.company_type === 'reseller';
  const isAdmin         = user.user_type_id === 1;
  // Only admins can rename the workspace (PATCH /api/workspace is admin-only),
  // so only they see the prompt. Hidden while impersonating.
  const showNamePrompt = !isImpersonating && isAdmin && user.name_auto_generated && !namePromptDismissed;

  const handleSignOut = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/');
  };

  const handleSaveName = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) return;
    setSavingName(true);
    setNameError(null);
    try {
      await workspaceApi.update({ name });
      // refresh() re-pulls /me, updating company_name and clearing
      // name_auto_generated — which unmounts this banner.
      await refresh();
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not save the name — try again.');
    } finally {
      setSavingName(false);
    }
  };

  const dismissNamePrompt = () => {
    try { sessionStorage.setItem('loudin.nameWorkspaceDismissed', '1'); } catch { /* ignore */ }
    setNamePromptDismissed(true);
  };

  const handleExitImpersonation = async () => {
    setExitBusy(true);
    try {
      await auth.endImpersonation();
      await refresh();
      // Send the reseller back to the customer they were just viewing.
      // user.company_id at this point is still the impersonated tenant
      // (refresh hasn't applied yet from this closure's perspective).
      const impersonatedId = user.company_id;
      navigate(`/app/customers/${impersonatedId}`);
    } catch {
      // If the exit fails the cookie is still impersonation-scoped — the
      // user can retry. Surface no error here; the banner stays put.
    } finally {
      setExitBusy(false);
    }
  };

  return (
    <Page>
      <Sidebar>
        <Brand to="/app"><span className="mark">{branding.productName}</span></Brand>

        <CompanyBadge>
          <span className="label">Workspace</span>
          <span className="name">{user.company_name}</span>
          {COMPANY_TYPE_BADGE[user.company_type] && (
            <TypePill
              $bg={COMPANY_TYPE_BADGE[user.company_type].bg}
              $fg={COMPANY_TYPE_BADGE[user.company_type].fg}
            >
              {COMPANY_TYPE_BADGE[user.company_type].label}
            </TypePill>
          )}
        </CompanyBadge>

        <NavList>
          {isImpersonating ? (
            // While impersonating a customer, only People + Devices are
            // reachable. Settings / Billing are server-denied;
            // hiding their nav entries matches that.
            <>
              <NavItem to="/app" end>
                <IconLayoutDashboard size={18} strokeWidth={1.75} />
                Overview
              </NavItem>
              <NavItem to="/app/people">
                <IconUsers size={18} strokeWidth={1.75} />
                People
              </NavItem>
              <NavItem to="/app/devices">
                <IconLock size={18} strokeWidth={1.75} />
                Devices
              </NavItem>
            </>
          ) : isPlatformAdmin ? (
            // Platform Admins (platform-operator staff): the Overview dashboard leads,
            // then the fleet/tenant surfaces grouped by category.
            <>
              <NavItem to="/app" end>
                <IconLayoutDashboard size={18} strokeWidth={1.75} />
                Overview
              </NavItem>

              <NavSection>Operations</NavSection>
              <NavItem to="/app/companies">
                <IconBuilding size={18} strokeWidth={1.75} />
                Directory
              </NavItem>
              <NavItem to="/app/devices">
                <IconLock size={18} strokeWidth={1.75} />
                Devices
              </NavItem>

              {/* The platform company can run its own doors (docs/
                  deployment-shapes.md): People manages its credential
                  holders; its own devices live under Devices → "Our
                  devices". Essential for own-doors deployments, harmless
                  for service providers. */}
              <NavSection>Workspace</NavSection>
              <NavItem to="/app/people">
                <IconUsers size={18} strokeWidth={1.75} />
                People
              </NavItem>

              <NavSection>System</NavSection>
              <NavItem to="/app/platform/integrations">
                <IconPlugConnected size={18} strokeWidth={1.75} />
                Integrations
              </NavItem>
              <NavItem to="/app/platform/api-keys">
                <IconKey size={18} strokeWidth={1.75} />
                API access
              </NavItem>
              <NavItem to="/app/settings">
                <IconSettings size={18} strokeWidth={1.75} />
                Settings
              </NavItem>
            </>
          ) : (
            // Reseller (dealer/installer) and end-user admins.
            <>
              <NavItem to="/app" end>
                <IconLayoutDashboard size={18} strokeWidth={1.75} />
                Overview
              </NavItem>
              {isResellerAdmin ? (
                // Reseller admins manage end-user companies they sell to.
                <NavItem to="/app/customers">
                  <IconUsersGroup size={18} strokeWidth={1.75} />
                  Customers
                </NavItem>
              ) : (
                <NavItem to="/app/people">
                  <IconUsers size={18} strokeWidth={1.75} />
                  People
                </NavItem>
              )}
              <NavItem to={isResellerAdmin ? '/app/fleet' : '/app/devices'}>
                <IconLock size={18} strokeWidth={1.75} />
                {isResellerAdmin ? 'Fleet' : 'Devices'}
              </NavItem>
              <NavItem to="/app/settings">
                <IconSettings size={18} strokeWidth={1.75} />
                Settings
              </NavItem>
            </>
          )}
        </NavList>

        <Spacer />

        <UserMenuWrap>
          {menuOpen && (
            <UserMenu role="menu">
              <UserMenuItem role="menuitem" onClick={handleSignOut}>
                <IconLogout size={16} />
                Sign out
              </UserMenuItem>
            </UserMenu>
          )}
          <UserButton onClick={() => setMenuOpen((v) => !v)}>
            <span className="avatar">{initials}</span>
            <span className="meta">
              <span className="name">{user.first_name} {user.last_name}</span>
              <span className="email">{user.email}</span>
            </span>
            <IconChevronDown size={14} className="chev" />
          </UserButton>
        </UserMenuWrap>
      </Sidebar>

      <Main>
        {isImpersonating && user.impersonation && (
          <ImpersonationBanner role="status">
            <IconArrowsLeftRight className="icon" size={18} />
            <div className="body">
              <div className="title">
                Viewing {user.company_name} as {user.impersonation.impersonator_company_name}
              </div>
              <div className="meta">
                Scoped to {user.impersonation.scope.join(' and ')} only.
                Settings aren't reachable from this view.
              </div>
            </div>
            <button
              type="button"
              className="exit"
              onClick={handleExitImpersonation}
              disabled={exitBusy}
            >
              <IconArrowsLeftRight size={12} />
              {exitBusy ? 'Exiting…' : 'Exit'}
            </button>
          </ImpersonationBanner>
        )}
        {showNamePrompt && (
          <NameWorkspaceBanner role="status">
            <IconBuilding className="icon" size={18} />
            <div className="body">
              <div className="title">Name your workspace</div>
              <div className="meta">
                You&apos;re set up as &ldquo;{user.company_name}&rdquo;. Give it a name your team will recognize.
              </div>
            </div>
            <form onSubmit={handleSaveName}>
              <input
                aria-label="Workspace name"
                placeholder="Company or team name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={255}
                autoComplete="organization"
              />
              <button type="submit" className="save" disabled={savingName || !nameInput.trim()}>
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </form>
            <button type="button" className="later" onClick={dismissNamePrompt}>
              Later
            </button>
            {nameError && <div className="err" role="alert">{nameError}</div>}
          </NameWorkspaceBanner>
        )}
        <ContentWrap>
          <Outlet />
        </ContentWrap>
      </Main>
    </Page>
  );
}

export default AppLayout;
