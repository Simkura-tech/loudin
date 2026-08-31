/**
 * ForgotPasswordPage — two-phase: request a code, then enter code + new password.
 *
 * Phase 1: user types their email (or phone). We hit /forgot-password, which
 * always returns 200 (no enumeration). If the user actually exists we get a
 * destination_hint back; otherwise the backend stays silent and the UI shows
 * the same "if an account exists…" copy either way.
 *
 * Phase 2: user enters the 6-digit code + their new password.
 * On success → redirect to /login with a small "password reset" notice.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { IconArrowRight, IconMail, IconShieldLock } from '@tabler/icons-react';
import { auth } from '../../services/auth/auth';
import { branding } from '../../branding';

// ── Layout (mirrors LoginPage chrome) ────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.background.secondary};
  color: ${({ theme }) => theme.colors.text.primary};
  display: flex;
  flex-direction: column;
`;

const TopBar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px clamp(24px, 6vw, 96px);
`;

const Wordmark = styled(Link)`
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.text.primary};
  text-decoration: none;
`;

const TopLink = styled(Link)`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-decoration: none;
  &:hover { color: ${({ theme }) => theme.colors.text.primary}; }
`;

const Main = styled.main`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const Card = styled.div`
  width: 100%;
  max-width: 420px;
  padding: 40px;
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.04);
`;

const Crest = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.brand.primary}14;
  color: ${({ theme }) => theme.colors.brand.primary};
  margin-bottom: 20px;
`;

const Heading = styled.h1`
  font-size: 26px;
  line-height: 1.2;
  letter-spacing: -0.02em;
  font-weight: 600;
  margin: 0 0 8px;
`;

const Sub = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 28px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldLabel = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const Input = styled.input`
  height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 16px; /* >=16px so iOS Safari doesn't zoom on field focus */
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
  &::placeholder { color: ${({ theme }) => theme.colors.text.tertiary}; }
`;

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
`;

const InfoBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 13px;
`;

const Submit = styled.button`
  margin-top: 8px;
  height: 48px;
  border: none;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const CardFooter = styled.div`
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-align: center;

  a { color: ${({ theme }) => theme.colors.brand.primary}; text-decoration: none; font-weight: 500; }
  a:hover { text-decoration: underline; }
`;

const PageFooter = styled.footer`
  padding: 24px clamp(24px, 6vw, 96px);
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  text-align: center;
`;

// ── Component ────────────────────────────────────────────────────────────────

interface Phase1Sent {
  destination_hint: string | null;
  delivery_method:  'email' | 'sms' | 'console' | null;
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [code, setCode]             = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sent, setSent]             = useState<Phase1Sent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await auth.forgotPassword(identifier.trim());
      // Always advance the step — even on a miss the UI looks the same
      // (no user enumeration). The hint just won't be present.
      setSent({
        destination_hint: r.destination_hint ?? null,
        delivery_method:  r.delivery_method  ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request reset code');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.resetPassword(identifier.trim(), code.trim(), newPassword);
      navigate('/login?reset=success', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
      setSubmitting(false);
    }
  };

  return (
    <Page>
      <TopBar>
        <Wordmark to="/">{branding.productName}</Wordmark>
        <TopLink to="/login">← Back to sign in</TopLink>
      </TopBar>

      <Main>
        <Card>
          {!sent ? (
            <>
              <Crest><IconMail size={22} strokeWidth={1.75} /></Crest>
              <Heading>Reset your password</Heading>
              <Sub>Enter the email or phone number on your account. We&apos;ll send you a 6-digit code.</Sub>

              <Form onSubmit={requestCode}>
                <Field>
                  <FieldLabel>Email or phone</FieldLabel>
                  <Input
                    type="text"
                    autoComplete="username"
                    autoFocus
                    placeholder="you@company.com"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </Field>

                {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

                <Submit type="submit" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send reset code'}
                  {!submitting && <IconArrowRight size={18} />}
                </Submit>
              </Form>

              <CardFooter>
                Remember it after all? <Link to="/login">Sign in</Link>
              </CardFooter>
            </>
          ) : (
            <>
              <Crest><IconShieldLock size={22} strokeWidth={1.75} /></Crest>
              <Heading>Enter your code</Heading>
              <Sub>
                {sent.destination_hint
                  ? <>We sent a code to <strong>{sent.destination_hint}</strong>.</>
                  : <>If an account exists for <strong>{identifier}</strong>, a code is on its way.</>}
                {sent.delivery_method === 'console' && (
                  <> <em>Provider not configured — the code is in the API server log.</em></>
                )}
              </Sub>

              <Form onSubmit={submitReset}>
                <Field>
                  <FieldLabel>Verification code</FieldLabel>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>New password</FieldLabel>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </Field>

                {error && <ErrorBanner role="alert">{error}</ErrorBanner>}
                <InfoBanner>
                  Codes expire 10 minutes after they&apos;re sent. After 5 wrong guesses
                  you&apos;ll need to request a fresh one.
                </InfoBanner>

                <Submit type="submit" disabled={submitting || code.length < 6 || newPassword.length < 8}>
                  {submitting ? 'Resetting…' : 'Reset password'}
                  {!submitting && <IconArrowRight size={18} />}
                </Submit>
              </Form>

              <CardFooter>
                Wrong address?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setSent(null); setCode(''); setNewPassword(''); setError(null); }}>
                  Start over
                </a>
              </CardFooter>
            </>
          )}
        </Card>
      </Main>

      <PageFooter>© {new Date().getFullYear()} {branding.companyLegalName}</PageFooter>
    </Page>
  );
}

export default ForgotPasswordPage;
