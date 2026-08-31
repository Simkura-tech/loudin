/**
 * MarketingLayout — shared chrome (nav + footer) for the public pages that
 * remain outside the signed-in app: legal documents and the 404 page.
 */

import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styled from '@emotion/styled';
import { IconArrowRight } from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { branding } from '../../branding';

const Page = styled.div`
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Nav = styled.nav`
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px clamp(24px, 6vw, 96px);
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const Wordmark = styled(Link)`
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const NavActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const NavCta = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease, transform 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary};
    transform: translateY(-1px);
  }
  &:active {
    transform: translateY(0);
  }
`;

const Main = styled.main`
  flex: 1;
`;

const Footer = styled.footer`
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
  padding: 24px clamp(24px, 6vw, 96px);
  background: ${({ theme }) => theme.colors.background.primary};
`;

const FooterBottom = styled.div`
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.tertiary};

  .links {
    display: flex;
    gap: 16px;
  }
  a {
    color: ${({ theme }) => theme.colors.text.secondary};
    text-decoration: none;
  }
  a:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

interface MarketingLayoutProps {
  children: ReactNode;
  /** Per-page document title; site-wide default when omitted. */
  title?: string;
}

export function MarketingLayout({ children, title }: MarketingLayoutProps) {
  const { user } = useAuth();

  useEffect(() => {
    document.title = title ?? `${branding.productName} — ${branding.tagline}`;
  }, [title]);

  return (
    <Page>
      <Nav>
        <Wordmark to="/" aria-label={`${branding.productName} — home`}>
          {branding.productName}
        </Wordmark>
        <NavActions>
          {user ? (
            <NavCta to="/app">
              Open app
              <IconArrowRight size={16} />
            </NavCta>
          ) : (
            <NavCta to="/login">Log in</NavCta>
          )}
        </NavActions>
      </Nav>

      <Main>{children}</Main>

      <Footer>
        <FooterBottom>
          <span>© {new Date().getFullYear()} {branding.companyLegalName}</span>
          <span className="links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </span>
        </FooterBottom>
      </Footer>
    </Page>
  );
}

export default MarketingLayout;
