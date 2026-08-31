/**
 * NotFoundPage — public 404.
 *
 * Replaces the old `path="*" → HomePage` fallback so a mistyped URL gets a
 * real "not found" instead of silently rendering the homepage.
 */

import styled from '@emotion/styled';
import { Link } from 'react-router-dom';
import { IconArrowRight } from '@tabler/icons-react';
import MarketingLayout from '../../components/marketing/MarketingLayout';
import { branding } from '../../branding';

const Section = styled.section`
  padding: clamp(72px, 14vh, 160px) clamp(24px, 6vw, 96px);
  max-width: 720px;
  margin: 0 auto;
  text-align: center;
`;

const Code = styled.div`
  font-size: clamp(64px, 12vw, 120px);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
  color: ${({ theme }) => theme.colors.brand.primary};
  margin-bottom: 8px;
`;

const Heading = styled.h1`
  font-size: clamp(24px, 3vw, 32px);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 12px;
`;

const Lede = styled.p`
  font-size: 16px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 28px;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
`;

const Primary = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 20px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
`;

const Secondary = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 18px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
`;

export function NotFoundPage() {
  return (
    <MarketingLayout title={`Page not found | ${branding.productName}`}>
      <Section>
        <Code>404</Code>
        <Heading>We couldn&apos;t find that page.</Heading>
        <Lede>
          The link may be broken or the page may have moved. Let&apos;s get you back on track.
        </Lede>
        <Actions>
          <Primary to="/">Back to home <IconArrowRight size={16} /></Primary>
          <Secondary to="/login">Log in</Secondary>
        </Actions>
      </Section>
    </MarketingLayout>
  );
}

export default NotFoundPage;
