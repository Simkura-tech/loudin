/**
 * LegalDocPage — shared renderer for the legal documents.
 *
 * Each route picks one of the LegalDoc objects from legalContent.ts and
 * passes it in. The page is intentionally plain — these are documents,
 * not feature pages.
 */

import styled from '@emotion/styled';
import MarketingLayout from '../../components/marketing/MarketingLayout';
import type { LegalDoc } from './legalContent';
import { branding } from '../../branding';

const Wrap = styled.article`
  max-width: 760px;
  margin: 0 auto;
  padding: 64px clamp(20px, 6vw, 96px) 96px;
  color: ${({ theme }) => theme.colors.text.primary};
  line-height: 1.65;
`;

const Title = styled.h1`
  font-size: 34px;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
`;

const VersionLine = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin: 0 0 24px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
`;

const PlaceholderBanner = styled.div`
  padding: 12px 14px;
  border-radius: 10px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #78350f;
  font-size: 13px;
  margin-bottom: 28px;
`;

const Intro = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 32px;
`;

const SectionHeading = styled.h2`
  font-size: 19px;
  letter-spacing: -0.01em;
  margin: 28px 0 8px;
`;

const SectionBody = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 12px;
`;

interface LegalDocPageProps {
  doc: LegalDoc;
}

export function LegalDocPage({ doc }: LegalDocPageProps) {
  return (
    <MarketingLayout title={`${doc.title} | ${branding.productName}`}>
      <Wrap>
        <Title>{doc.title}</Title>
        <VersionLine>Version {doc.version}</VersionLine>
        <PlaceholderBanner>
          <strong>Placeholder.</strong> This document is scaffolding —
          final copy will be drafted by counsel before public launch.
        </PlaceholderBanner>
        <Intro>{doc.intro}</Intro>
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <SectionHeading>{s.heading}</SectionHeading>
            <SectionBody>{s.body}</SectionBody>
          </section>
        ))}
      </Wrap>
    </MarketingLayout>
  );
}

export default LegalDocPage;
