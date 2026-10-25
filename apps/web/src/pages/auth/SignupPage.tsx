/**
 * SignupPage — public account creation.
 *
 * Self-serve for customers (they own and use the locks) and for installers
 * (they service other companies' doors — see docs/company-hierarchy.md →
 * Installers). The first user of a company becomes its Admin. Wired to
 * POST /api/auth/register; the AuthContext picks up the new session and the
 * user is taken to /app, which routes installers on to their Customers page.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconArrowRight,
  IconBuilding,
  IconMailOff,
  IconTool,
  IconUserPlus,
} from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPublicConfig } from '../../services/config';
import { googleSignInUrl } from '../../services/auth/auth';
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
  max-width: 560px;
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  /* Stack First/Last name before the card starts shrinking (its max-width is
     560px), so the two fields don't get squeezed on mid-size phones. */
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const TypeChoice = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  @media (max-width: 480px) { grid-template-columns: 1fr; }
`;

const TypeOption = styled.label<{ $active: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.brand.primary : theme.colors.border.light)};
  background: ${({ theme, $active }) => ($active ? `${theme.colors.brand.primary}0d` : theme.colors.background.primary)};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;

  input { position: absolute; opacity: 0; width: 0; height: 0; }
  svg { color: ${({ theme, $active }) => ($active ? theme.colors.brand.primary : theme.colors.text.tertiary)}; }
  .t { font-size: 13px; font-weight: 600; }
  .d { font-size: 12px; line-height: 1.4; color: ${({ theme }) => theme.colors.text.secondary}; }

  &:focus-within { box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26; }
`;

const FullRow = styled.div`
  grid-column: 1 / -1;
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

const Hint = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin-top: 2px;
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

const TermsRow = styled.label`
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  line-height: 1.5;
  cursor: pointer;

  input {
    margin-top: 3px;
    width: 16px;
    height: 16px;
    accent-color: ${({ theme }) => theme.colors.brand.primary};
    flex-shrink: 0;
  }

  a {
    color: ${({ theme }) => theme.colors.brand.primary};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const Submit = styled.button`
  grid-column: 1 / -1;
  margin-top: 4px;
  height: 48px;
  border: none;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
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
  margin-top: 20px;
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
  margin-top: 16px;
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

const ErrorBanner = styled.div`
  grid-column: 1 / -1;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  line-height: 1.45;
`;

const PageFooter = styled.footer`
  padding: 24px clamp(24px, 6vw, 96px);
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  text-align: center;
`;

// ── Component ─────────────────────────────────────────────────────────────────

export function SignupPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which kind of company this signup creates. Installers must name their
  // business — customers pick it from a list when granting door access.
  const [companyType, setCompanyType] = useState<'end_user' | 'installer'>('end_user');
  const isInstaller = companyType === 'installer';

  // ── Instance signup toggle ──────────────────────────────────────────────────
  // Private ("own doors") deployments close open self-signup. null while the
  // config is loading; a fetch failure falls back to enabled (the backend
  // enforces the real policy — this only picks which card to render).
  const [signupsEnabled, setSignupsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicConfig().then((c) => {
      if (!cancelled) setSignupsEnabled(c.signups_enabled);
    });
    return () => { cancelled = true; };
  }, []);

  const configChecking = signupsEnabled === null;
  const signupsClosed =
    !configChecking && signupsEnabled === false;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const data = new FormData(e.currentTarget);
    try {
      await register({
        firstName:   String(data.get('firstName') || ''),
        lastName:    String(data.get('lastName')  || ''),
        email:       String(data.get('email')     || ''),
        password:    String(data.get('password')  || ''),
        companyName: String(data.get('companyName') || ''),
        companyType,
        // The form's `required` attribute on the checkbox guarantees this
        // is checked before submit reaches here.
        terms_accepted: true,
      });
      // Backend set the auth cookie on register; AuthContext has the user.
      navigate('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed');
      setSubmitting(false);
    }
  };

  // While the instance config is being resolved, hold the form so we don't
  // flash it before swapping in the invite-only notice.
  const showForm = !configChecking;

  return (
    <Page>
      <TopBar>
        <Wordmark to="/">{branding.productName}</Wordmark>
        <TopLink to="/login">Already have an account? Sign in →</TopLink>
      </TopBar>

      <Main>
        <Card>
          {signupsClosed ? (
            // ── Invite-only instance ────────────────────────────────────────
            // This deployment has open self-signup switched off (the
            // "own doors" shape, or a service provider that onboards by
            // invite only). Friendly dead end instead of a form that would
            // 403 on submit.
            <>
              <Crest>
                <IconMailOff size={22} strokeWidth={1.75} />
              </Crest>
              <Heading>This instance is invite-only</Heading>
              <Sub>
                Creating new accounts is switched off here. If you were
                expecting access, ask your administrator to add you.
              </Sub>
              <CardFooter>
                Already have an account? <Link to="/login">Sign in</Link>
              </CardFooter>
            </>
          ) : (
            <>
          <Crest>
            <IconUserPlus size={22} strokeWidth={1.75} />
          </Crest>
          <Heading>Create your account</Heading>
          <Sub>Get up and running in under five minutes.</Sub>

              {showForm && (
                <Form onSubmit={handleSubmit}>
                  <FullRow>
                    <TypeChoice role="radiogroup" aria-label="What kind of company is this?">
                      <TypeOption $active={!isInstaller}>
                        <input type="radio" name="companyType" value="end_user"
                               checked={!isInstaller} onChange={() => setCompanyType('end_user')} />
                        <IconBuilding size={18} strokeWidth={1.75} />
                        <span className="t">I own doors</span>
                        <span className="d">Manage locks, people and schedules for my own company.</span>
                      </TypeOption>
                      <TypeOption $active={isInstaller}>
                        <input type="radio" name="companyType" value="installer"
                               checked={isInstaller} onChange={() => setCompanyType('installer')} />
                        <IconTool size={18} strokeWidth={1.75} />
                        <span className="t">I install doors for others</span>
                        <span className="d">Deploy and service systems in customers&apos; workspaces.</span>
                      </TypeOption>
                    </TypeChoice>
                  </FullRow>
                  <Field>
                    <FieldLabel>First name</FieldLabel>
                    <Input
                      type="text"
                      name="firstName"
                      autoComplete="given-name"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Last name</FieldLabel>
                    <Input
                      type="text"
                      name="lastName"
                      autoComplete="family-name"
                      required
                    />
                  </Field>
                  <FullRow>
                    <Field>
                      <FieldLabel>Work email</FieldLabel>
                      <Input
                        type="email"
                        name="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        required
                      />
                    </Field>
                  </FullRow>
                  <FullRow>
                    <Field>
                      <FieldLabel>Password</FieldLabel>
                      <Input
                        type="password"
                        name="password"
                        autoComplete="new-password"
                        minLength={8}
                        placeholder="At least 8 characters"
                        required
                      />
                      <Hint>Use 8+ characters with a mix of letters and numbers.</Hint>
                    </Field>
                  </FullRow>
                  <FullRow>
                    <Field>
                      <FieldLabel>{isInstaller ? 'Company name' : 'Company name (optional)'}</FieldLabel>
                      <Input
                        type="text"
                        name="companyName"
                        autoComplete="organization"
                        placeholder={isInstaller ? 'Your installation business' : 'Your company or team'}
                        required={isInstaller}
                      />
                      <Hint>
                        {isInstaller
                          ? 'Customers choose your company by this name when they grant you access to their doors.'
                          : 'Leave blank and we’ll set up a personal workspace you can rename later.'}
                      </Hint>
                    </Field>
                  </FullRow>

                  <TermsRow>
                    <input type="checkbox" name="terms" required />
                    <span>
                      I agree to the{' '}
                      <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>{' '}
                      and{' '}
                      <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
                    </span>
                  </TermsRow>

                  {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

                  <Submit type="submit" disabled={submitting}>
                    {submitting ? 'Creating account…' : 'Create account'}
                    {!submitting && <IconArrowRight size={18} />}
                  </Submit>
                </Form>
              )}

              {showForm && (
                <>
                  <Divider>or</Divider>

                  {/* Google sign-up always creates an "I own doors" (end_user)
                      company — it can't collect an installer business name, so
                      installers use the form above. */}
                  <GoogleButton href={googleSignInUrl()}>
                    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
                    </svg>
                    Continue with Google
                  </GoogleButton>

                  <ConsentNote>
                    By continuing with Google, you agree to the{' '}
                    <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>{' '}
                    and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
                  </ConsentNote>
                </>
              )}

              <CardFooter>
                Already have an account? <Link to="/login">Sign in</Link>
              </CardFooter>
            </>
          )}
        </Card>
      </Main>

      <PageFooter>© {new Date().getFullYear()} {branding.companyLegalName}</PageFooter>
    </Page>
  );
}

export default SignupPage;
