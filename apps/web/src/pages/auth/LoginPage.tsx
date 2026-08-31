/**
 * LoginPage — sign-in page.
 *
 * UI only for now. The submit handler is a stub — wire it to a real auth
 * endpoint once the auth flow is rebuilt (see CLAUDE.md: auth is being
 * redesigned).
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { IconArrowRight, IconLock, IconShieldLock } from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { auth, isPending2fa, googleSignInUrl, type Pending2FA } from '../../services/auth/auth';
import { fetchPublicConfig } from '../../services/config';
import { branding } from '../../branding';

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
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
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
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const PasswordRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
`;

const ForgotLink = styled(Link)`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.brand.primary};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  line-height: 1.45;
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
  transition: background 0.15s ease, transform 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary};
  }
  &:active {
    transform: translateY(1px);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 13px;

  &::before, &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${({ theme }) => theme.colors.border.light};
  }
`;

const GoogleButton = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 15px;
  font-weight: 500;
  font-family: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
    border-color: ${({ theme }) => theme.colors.border.medium ?? theme.colors.border.light};
  }
`;

const ConsentNote = styled.p`
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text.tertiary};
  text-align: center;

  a {
    color: inherit;
    text-decoration: underline;

    &:hover {
      color: ${({ theme }) => theme.colors.text.secondary};
    }
  }
`;

const CardFooter = styled.div`
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-align: center;

  a {
    color: ${({ theme }) => theme.colors.brand.primary};
    text-decoration: none;
    font-weight: 500;
  }
  a:hover {
    text-decoration: underline;
  }
`;

const PageFooter = styled.footer`
  padding: 24px clamp(24px, 6vw, 96px);
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  text-align: center;
`;

export function LoginPage() {
  const navigate = useNavigate();
  const { login, completeLogin2fa } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2FA step state — non-null when the password step succeeded and the
  // server is waiting for the OTP.
  const [pending, setPending] = useState<Pending2FA | null>(null);
  const [code, setCode] = useState('');

  // Invite-only instances (docs/deployment-shapes.md) hide the "create
  // account" link. Defaults to shown until the config loads — the backend
  // enforces the real policy; this is cosmetic.
  const [signupsEnabled, setSignupsEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPublicConfig().then((c) => {
      if (!cancelled) setSignupsEnabled(c.signups_enabled);
    });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (isPending2fa(result)) {
        setPending(result);
        setSubmitting(false);
      } else {
        navigate('/app');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setError(null);
    setSubmitting(true);
    try {
      await completeLogin2fa(pending.pending_token, code.trim());
      navigate('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify code');
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    setError(null);
    try {
      // Re-running login() will overwrite the previous code on the server
      // (otp service deletes prior unused row per (user, purpose)) and
      // hand back a fresh pending_token.
      const result = await login(email, password);
      if (isPending2fa(result)) setPending(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a new code');
    }
  };

  return (
    <Page>
      <TopBar>
        <Wordmark to="/">{branding.productName}</Wordmark>
        <TopLink to="/">← Back to home</TopLink>
      </TopBar>

      <Main>
        <Card>
          {pending ? (
            <>
              <Crest><IconShieldLock size={22} strokeWidth={1.75} /></Crest>
              <Heading>Enter your code</Heading>
              <Sub>
                We sent a 6-digit code to <strong>{pending.destination_hint}</strong>
                {pending.delivery_method === 'console' && (
                  <>
                    {' '}— <em>provider not configured; the code is in the API server log.</em>
                  </>
                )}
              </Sub>

              <Form onSubmit={handleVerify}>
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

                {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

                <Submit type="submit" disabled={submitting || code.length < 6}>
                  {submitting ? 'Verifying…' : 'Verify and sign in'}
                  {!submitting && <IconArrowRight size={18} />}
                </Submit>
              </Form>

              <CardFooter>
                Didn&apos;t get the code?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); resendCode(); }}>
                  Send a new one
                </a>
                {' · '}
                <a href="#" onClick={(e) => { e.preventDefault(); setPending(null); setCode(''); setError(null); }}>
                  Use a different account
                </a>
              </CardFooter>
            </>
          ) : (
            <>
              <Crest><IconLock size={22} strokeWidth={1.75} /></Crest>
              <Heading>Welcome back</Heading>
              <Sub>Sign in to manage your access control system.</Sub>

              <Form onSubmit={handleSubmit}>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>

                <Field>
                  <PasswordRow>
                    <FieldLabel>Password</FieldLabel>
                    <ForgotLink to="/forgot-password">Forgot?</ForgotLink>
                  </PasswordRow>
                  <Input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>

                {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

                <Submit type="submit" disabled={submitting}>
                  {submitting ? 'Signing in…' : 'Sign in'}
                  {!submitting && <IconArrowRight size={18} />}
                </Submit>
              </Form>

              <Divider>or</Divider>

              <GoogleButton href={googleSignInUrl()}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                Continue with Google
              </GoogleButton>

              {/* Google sign-in can create an account, so acceptance has to
                  be stated here — the server stamps the current Terms/Privacy
                  versions on OAuth-created users on the strength of it. */}
              <ConsentNote>
                By continuing with Google, you agree to the{' '}
                <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>{' '}
                and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
              </ConsentNote>

              {signupsEnabled && (
                <CardFooter>
                  Don&apos;t have an account? <Link to="/signup">Create one</Link>
                </CardFooter>
              )}
            </>
          )}
        </Card>
      </Main>

      <PageFooter>© {new Date().getFullYear()} {branding.companyLegalName}</PageFooter>
    </Page>
  );
}

// Silence "unused" complaints for the auth re-export used in tests/devtools.
void auth;

export default LoginPage;
