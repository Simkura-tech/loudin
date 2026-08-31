/**
 * SignupPage — public account creation.
 *
 * Self-serve for end-user companies (they use the locks). The first user of a
 * company becomes its Admin. Wired to POST /api/auth/register; the AuthContext
 * picks up the new session and the user is taken to /app.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconArrowRight,
  IconBuildingStore,
  IconMailOff,
  IconUserPlus,
} from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../services/auth/auth';
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

const InviteBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.brand.primary}0a;
  border: 1px solid ${({ theme }) => theme.colors.brand.primary}40;
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 24px;

  .icon {
    color: ${({ theme }) => theme.colors.brand.primary};
    flex-shrink: 0;
    margin-top: 1px;
  }
`;

const InviteWarnBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 13px;
  line-height: 1.45;
  margin-bottom: 20px;
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

  // ── Reseller invite state ───────────────────────────────────────────────────
  // A /signup?invite=<token> link means a reseller invited this customer.
  // We resolve the token up front to show who the invite is from; the
  // register call re-sends the token so the backend attaches the new
  // company to the reseller at creation. A stale token degrades to a
  // normal signup (with a notice) rather than blocking account creation.
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const [inviteResellerName, setInviteResellerName] = useState<string | null>(null);
  const [inviteInvalid, setInviteInvalid] = useState(false);

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

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    auth.verifyInvite(inviteToken)
      .then((r) => { if (!cancelled) setInviteResellerName(r.reseller.name); })
      .catch(() => { if (!cancelled) setInviteInvalid(true); });
    return () => { cancelled = true; };
  }, [inviteToken]);

  const inviteActive   = inviteToken != null && inviteResellerName != null;
  const inviteChecking = inviteToken != null && !inviteInvalid && inviteResellerName == null;

  const configChecking = signupsEnabled === null;
  // A resolved reseller invite bypasses the toggle — the reseller vouched
  // for this signup, so invited accounts can be created even on an
  // invite-only instance (mirrors the backend's rule).
  const signupsClosed =
    !configChecking && signupsEnabled === false && !inviteActive && !inviteChecking;

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
        companyType: 'end_user',
        invite_token: inviteActive ? inviteToken : undefined,
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

  // While an invite token or the instance config is being resolved, hold
  // the form so we don't flash it before swapping in the invite banner /
  // invite-only notice.
  const showForm = !inviteChecking && !configChecking;

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
                expecting access, ask your administrator to add you — or ask
                your reseller for an invite link.
              </Sub>
              {inviteInvalid && (
                <InviteWarnBanner role="alert">
                  Your invite link is no longer valid. Ask your reseller for a
                  fresh one to create your account.
                </InviteWarnBanner>
              )}
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

              {/* ── Reseller invite ─────────────────────────────────────────────
                  An invited signup is always an end-user company connected to
                  the inviting reseller, so the type toggle is replaced by the
                  invite banner. A dead link falls back to the normal flow. */}
              {inviteActive && (
                <InviteBanner>
                  <IconBuildingStore className="icon" size={16} strokeWidth={1.75} />
                  <span>
                    You&apos;ve been invited by <strong>{inviteResellerName}</strong>.
                    Your new workspace will be connected to them automatically.
                  </span>
                </InviteBanner>
              )}
              {inviteInvalid && (
                <InviteWarnBanner role="alert">
                  This invite link is no longer valid. You can still create an
                  account — ask your reseller for a fresh link to get connected,
                  or attach to them later from your workspace settings.
                </InviteWarnBanner>
              )}
              {inviteChecking && <Sub>Checking your invite…</Sub>}

              {showForm && (
                <Form onSubmit={handleSubmit}>
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
                      <FieldLabel>Company name (optional)</FieldLabel>
                      <Input
                        type="text"
                        name="companyName"
                        autoComplete="organization"
                        placeholder="Your company or team"
                      />
                      <Hint>Leave blank and we&apos;ll set up a personal workspace you can rename later.</Hint>
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
