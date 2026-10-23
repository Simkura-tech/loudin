/**
 * AcceptInvitePage — public landing page for a workspace invite link.
 *
 * Route: /invite/:token. Previews the invite (who sent it, which workspace),
 * then collects name + password + terms. The server sets the session cookie
 * on accept, so we refresh the AuthContext and go straight to /app.
 *
 * Expired, revoked or already-used links render a friendly dead end with
 * the specific reason the server gave.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styled from '@emotion/styled';
import { IconArrowRight, IconMailOff, IconUserCheck } from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { invitesApi, type InvitePreview } from '../../services/auth/invites';
import type { ApiError } from '../../services/api';
import { branding } from '../../branding';

// ── Page chrome (mirrors SignupPage) ──────────────────────────────────────────

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
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 28px;

  strong {
    color: ${({ theme }) => theme.colors.text.primary};
    font-weight: 600;
  }
`;

const Form = styled.form`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

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
  font-size: 16px;
  font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
  &:read-only {
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.secondary};
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
    &:hover { text-decoration: underline; }
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

  &:hover {
    background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary};
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
    &:hover { text-decoration: underline; }
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

// ── Component ─────────────────────────────────────────────────────────────────

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; invite: InvitePreview }
  | { kind: 'dead'; title: string; message: string };

function deadEndFor(err: unknown): { title: string; message: string } {
  const e = err as ApiError;
  switch (e?.code) {
    case 'INVITE_EXPIRED':
      return { title: 'This invite has expired', message: 'Invite links are valid for 7 days. Ask the person who invited you to send a new one.' };
    case 'INVITE_REVOKED':
      return { title: 'This invite was withdrawn', message: 'The workspace administrator cancelled this invite. Ask them for a new one if you still need access.' };
    case 'INVITE_ACCEPTED':
      return { title: 'This invite has already been used', message: 'An account was already created from this link. Sign in instead.' };
    case 'COMPANY_INACTIVE':
      return { title: 'This workspace is not active', message: e.message || 'Contact the workspace administrator.' };
    default:
      return { title: 'This invite link is not valid', message: 'Check that you copied the whole link from the email, or ask your administrator to resend it.' };
  }
}

export function AcceptInvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    invitesApi.preview(token)
      .then((invite) => { if (!cancelled) setState({ kind: 'ready', invite }); })
      .catch((err) => { if (!cancelled) setState({ kind: 'dead', ...deadEndFor(err) }); });
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const data = new FormData(e.currentTarget);
    try {
      await invitesApi.accept(token, {
        first_name: String(data.get('firstName') || ''),
        last_name:  String(data.get('lastName')  || ''),
        password:   String(data.get('password')  || ''),
        terms_accepted: true,
      });
      await refresh();
      navigate('/app');
    } catch (err) {
      const e = err as ApiError;
      if (e?.status === 410 || e?.status === 404 || e?.code === 'COMPANY_INACTIVE') {
        setState({ kind: 'dead', ...deadEndFor(err) });
      } else {
        setError(e?.message || 'Could not create your account');
      }
      setSubmitting(false);
    }
  };

  return (
    <Page>
      <TopBar>
        <Wordmark to="/">{branding.productName}</Wordmark>
        <TopLink to="/login">Already have an account? Sign in →</TopLink>
      </TopBar>

      <Main>
        <Card>
          {state.kind === 'loading' && (
            <>
              <Heading>Checking your invite…</Heading>
              <Sub>One moment.</Sub>
            </>
          )}

          {state.kind === 'dead' && (
            <>
              <Crest><IconMailOff size={22} strokeWidth={1.75} /></Crest>
              <Heading>{state.title}</Heading>
              <Sub>{state.message}</Sub>
              <CardFooter>
                Already have an account? <Link to="/login">Sign in</Link>
              </CardFooter>
            </>
          )}

          {state.kind === 'ready' && (
            <>
              <Crest><IconUserCheck size={22} strokeWidth={1.75} /></Crest>
              <Heading>Join {state.invite.company_name}</Heading>
              <Sub>
                {state.invite.invited_by ? <><strong>{state.invite.invited_by}</strong> has invited you</> : 'You have been invited'}{' '}
                to manage <strong>{state.invite.company_name}</strong> on {branding.productName}
                {state.invite.role === 'admin' ? ' as an admin' : ''}. Set a password to finish.
              </Sub>

              <Form onSubmit={handleSubmit}>
                <FullRow>
                  <Field>
                    <FieldLabel>Email</FieldLabel>
                    <Input type="email" value={state.invite.email} readOnly tabIndex={-1} />
                    <Hint>This invite is for this address only.</Hint>
                  </Field>
                </FullRow>
                <Field>
                  <FieldLabel>First name</FieldLabel>
                  <Input
                    type="text"
                    name="firstName"
                    autoComplete="given-name"
                    defaultValue={state.invite.first_name ?? ''}
                    required
                    autoFocus={!state.invite.first_name}
                  />
                </Field>
                <Field>
                  <FieldLabel>Last name</FieldLabel>
                  <Input
                    type="text"
                    name="lastName"
                    autoComplete="family-name"
                    defaultValue={state.invite.last_name ?? ''}
                    required
                  />
                </Field>
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
                      autoFocus={Boolean(state.invite.first_name)}
                    />
                    <Hint>Use 8+ characters with a mix of letters and numbers.</Hint>
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
                  {submitting ? 'Creating your account…' : 'Accept invite'}
                  {!submitting && <IconArrowRight size={18} />}
                </Submit>
              </Form>
            </>
          )}
        </Card>
      </Main>
    </Page>
  );
}

export default AcceptInvitePage;
