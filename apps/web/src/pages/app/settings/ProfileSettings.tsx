/**
 * ProfileSettings — the signed-in user's own info + password change.
 *
 * Two separate forms in one page:
 *   - "Your info"     → PATCH /api/me
 *   - "Change password" → POST /api/me/password
 *
 * Both refresh the AuthContext on success so the sidebar/account chip stays
 * in sync.
 */

import { useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import { IconCheck } from '@tabler/icons-react';
import { useAuth } from '../../../contexts/AuthContext';
import { meApi } from '../../../services/auth/me';
import { auth } from '../../../services/auth/auth';

// ── Shared shell (mirrors WorkspaceSettings) ─────────────────────────────────

const Card = styled.section`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  margin-bottom: 12px;
`;

const CardHeader = styled.div`
  padding: 12px 16px 10px;

  h2 {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 2px;
  }
  .sub {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const CardBody = styled.div`
  padding: 4px 16px 12px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
  padding: 6px 0;
  align-items: center;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 4px 0 8px;
  }
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Input = styled.input`
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
  &:disabled {
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const Hint = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin-top: 3px;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px 14px;
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  border: none;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Banner = styled.div<{ $tone: 'error' | 'success' }>`
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 12px;
  margin: 4px 16px 0;
  background: ${({ $tone }) => ($tone === 'error' ? '#fef2f2' : '#dcfce7')};
  border: 1px solid ${({ $tone }) => ($tone === 'error' ? '#fecaca' : '#bbf7d0')};
  color: ${({ $tone }) => ($tone === 'error' ? '#991b1b' : '#166534')};
`;

const EmailCurrent = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
  .addr { font-weight: 500; }
`;

const StatusPill = styled.span<{ $ok: boolean }>`
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $ok }) => ($ok ? '#dcfce7' : '#fef9c3')};
  color: ${({ $ok }) => ($ok ? '#166534' : '#854d0e')};
`;

const EmailBlock = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
`;

const CodeRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const InlineActions = styled.div`
  display: flex;
  gap: 8px;
`;

// ── Component ─────────────────────────────────────────────────────────────────

interface ProfileForm {
  first_name: string;
  last_name: string;
  phone_number: string;
}

interface PwForm {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

const EMPTY_PROFILE: ProfileForm = { first_name: '', last_name: '', phone_number: '' };
const EMPTY_PW: PwForm = { current_password: '', new_password: '', confirm_password: '' };

export function ProfileSettings() {
  const { user, refresh } = useAuth();

  // Profile form state
  const [profile,       setProfile]      = useState<ProfileForm>(EMPTY_PROFILE);
  const [profileInit,   setProfileInit]  = useState<ProfileForm>(EMPTY_PROFILE);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError,  setProfileError]  = useState<string | null>(null);
  const [profileOk,     setProfileOk]     = useState(false);

  // Password form state
  const [pw,            setPw]            = useState<PwForm>(EMPTY_PW);
  const [pwSaving,      setPwSaving]      = useState(false);
  const [pwError,       setPwError]       = useState<string | null>(null);
  const [pwOk,          setPwOk]          = useState(false);

  // Email verification (shown when the current address is unverified).
  const [verifyStage, setVerifyStage] = useState<'idle' | 'sent'>('idle');
  const [verifyCode,  setVerifyCode]  = useState('');
  const [verifyHint,  setVerifyHint]  = useState<string | null>(null);
  const [verifyConsole, setVerifyConsole] = useState(false);
  const [emailBusy,   setEmailBusy]   = useState(false);
  const [emailError,  setEmailError]  = useState<string | null>(null);
  const [emailOk,     setEmailOk]     = useState<string | null>(null);

  // Email change flow.
  const [changeStage, setChangeStage] = useState<'idle' | 'request' | 'confirm'>('idle');
  const [newEmail,    setNewEmail]    = useState('');
  const [changePw,    setChangePw]    = useState('');
  const [changeCode,  setChangeCode]  = useState('');
  const [changeHint,  setChangeHint]  = useState<string | null>(null);
  const [changeConsole, setChangeConsole] = useState(false);

  const resetEmailFlows = () => {
    setVerifyStage('idle'); setVerifyCode(''); setVerifyHint(null); setVerifyConsole(false);
    setChangeStage('idle'); setNewEmail(''); setChangePw(''); setChangeCode('');
    setChangeHint(null); setChangeConsole(false);
    setEmailError(null); setEmailOk(null);
  };

  const sendVerify = async () => {
    setEmailError(null); setEmailOk(null); setEmailBusy(true);
    try {
      const r = await auth.verifyEmail.send();
      if (r.already_verified) { await refresh(); return; }
      setVerifyHint(r.destination_hint ?? null);
      setVerifyConsole(r.delivery_method === 'console');
      setVerifyStage('sent');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not send code');
    } finally { setEmailBusy(false); }
  };

  const confirmVerify = async () => {
    setEmailError(null); setEmailBusy(true);
    try {
      await auth.verifyEmail.confirm(verifyCode.trim());
      await refresh();
      resetEmailFlows();
      setEmailOk('Email verified.');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not verify code');
    } finally { setEmailBusy(false); }
  };

  const requestChange = async () => {
    setEmailError(null); setEmailOk(null); setEmailBusy(true);
    try {
      const r = await meApi.requestEmailChange(newEmail.trim(), changePw || undefined);
      setChangeHint(r.destination_hint);
      setChangeConsole(r.delivery_method === 'console');
      setChangeStage('confirm');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not start email change');
    } finally { setEmailBusy(false); }
  };

  const confirmChange = async () => {
    setEmailError(null); setEmailBusy(true);
    try {
      await meApi.confirmEmailChange(changeCode.trim());
      await refresh();
      resetEmailFlows();
      setEmailOk('Email address updated.');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not confirm email change');
    } finally { setEmailBusy(false); }
  };

  useEffect(() => {
    if (!user) return;
    const f: ProfileForm = {
      first_name:   user.first_name,
      last_name:    user.last_name,
      phone_number: user.phone_number ?? '',
    };
    setProfile(f);
    setProfileInit(f);
  }, [user]);

  const profileDirty = useMemo(() => (
    profile.first_name   !== profileInit.first_name   ||
    profile.last_name    !== profileInit.last_name    ||
    profile.phone_number !== profileInit.phone_number
  ), [profile, profileInit]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileOk(false);
    if (!profile.first_name.trim() || !profile.last_name.trim()) {
      setProfileError('First and last name are required');
      return;
    }
    setProfileSaving(true);
    try {
      const patch: Parameters<typeof meApi.updateProfile>[0] = {};
      if (profile.first_name   !== profileInit.first_name)   patch.first_name   = profile.first_name.trim();
      if (profile.last_name    !== profileInit.last_name)    patch.last_name    = profile.last_name.trim();
      if (profile.phone_number !== profileInit.phone_number) {
        patch.phone_number = profile.phone_number.trim() || null;
      }
      await meApi.updateProfile(patch);
      await refresh();
      setProfileOk(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setProfileSaving(false);
    }
  };

  const resetProfile = () => {
    setProfile(profileInit);
    setProfileError(null);
    setProfileOk(false);
  };

  const handlePwSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwOk(false);
    if (!pw.current_password || !pw.new_password) {
      setPwError('Both current and new password are required');
      return;
    }
    if (pw.new_password !== pw.confirm_password) {
      setPwError("New password and confirmation don't match");
      return;
    }
    setPwSaving(true);
    try {
      await meApi.changePassword({
        current_password: pw.current_password,
        new_password:     pw.new_password,
      });
      setPw(EMPTY_PW);
      setPwOk(true);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setPwSaving(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <form onSubmit={handleProfileSave}>
        <Card>
          <CardHeader>
            <h2>Your info</h2>
            <div className="sub">This is what teammates see.</div>
          </CardHeader>
          <CardBody>
            <Row>
              <Label htmlFor="me-first">First name</Label>
              <Input
                id="me-first"
                value={profile.first_name}
                onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                required maxLength={100} autoComplete="given-name"
              />
            </Row>
            <Row>
              <Label htmlFor="me-last">Last name</Label>
              <Input
                id="me-last"
                value={profile.last_name}
                onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                required maxLength={100} autoComplete="family-name"
              />
            </Row>
            <Row>
              <Label htmlFor="me-phone">Phone</Label>
              <Input
                id="me-phone"
                value={profile.phone_number}
                onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })}
                placeholder="Optional"
                maxLength={50} autoComplete="tel"
              />
            </Row>
          </CardBody>
          {profileError && <Banner $tone="error" role="alert">{profileError}</Banner>}
          {profileOk && !profileDirty && <Banner $tone="success">Profile updated.</Banner>}
          <Actions>
            <SecondaryButton type="button" onClick={resetProfile} disabled={!profileDirty || profileSaving}>
              Reset
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={!profileDirty || profileSaving}>
              {profileSaving ? 'Saving…' : <><IconCheck size={16} /> Save changes</>}
            </PrimaryButton>
          </Actions>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <h2>Email address</h2>
          <div className="sub">Used to sign in and receive account emails.</div>
        </CardHeader>
        <CardBody>
          <EmailCurrent>
            <span className="addr">{user.email}</span>
            <StatusPill $ok={user.email_verified}>
              {user.email_verified ? 'Verified' : 'Unverified'}
            </StatusPill>
          </EmailCurrent>

          {/* Verify the current address (soft nudge) */}
          {!user.email_verified && changeStage === 'idle' && (
            <EmailBlock>
              {verifyStage === 'idle' ? (
                <SecondaryButton type="button" onClick={sendVerify} disabled={emailBusy}>
                  {emailBusy ? 'Sending…' : 'Send verification code'}
                </SecondaryButton>
              ) : (
                <>
                  <Hint>
                    Enter the 6-digit code sent to {verifyHint ?? 'your email'}.
                    {verifyConsole && ' (No mail provider configured — check the API server log.)'}
                  </Hint>
                  <CodeRow>
                    <Input
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      placeholder="123456" inputMode="numeric" maxLength={6}
                      style={{ maxWidth: 140 }}
                    />
                    <PrimaryButton type="button" onClick={confirmVerify} disabled={emailBusy || !verifyCode.trim()}>
                      {emailBusy ? 'Verifying…' : 'Confirm'}
                    </PrimaryButton>
                    <SecondaryButton type="button" onClick={resetEmailFlows} disabled={emailBusy}>
                      Cancel
                    </SecondaryButton>
                  </CodeRow>
                </>
              )}
            </EmailBlock>
          )}

          {/* Change to a different address */}
          {verifyStage === 'idle' && (
            changeStage === 'idle' ? (
              <EmailBlock>
                <div>
                  <SecondaryButton type="button" onClick={() => { resetEmailFlows(); setChangeStage('request'); }}>
                    Change email
                  </SecondaryButton>
                </div>
              </EmailBlock>
            ) : changeStage === 'request' ? (
              <EmailBlock>
                <Row>
                  <Label htmlFor="new-email">New email</Label>
                  <Input
                    id="new-email" type="email" value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="you@company.com" autoComplete="off"
                  />
                </Row>
                <Row>
                  <Label htmlFor="change-pw">Current password</Label>
                  <div>
                    <Input
                      id="change-pw" type="password" value={changePw}
                      onChange={(e) => setChangePw(e.target.value)}
                      autoComplete="current-password"
                    />
                    <Hint>Confirms it&apos;s you. Leave blank only if you sign in with Google.</Hint>
                  </div>
                </Row>
                <InlineActions>
                  <PrimaryButton type="button" onClick={requestChange} disabled={emailBusy || !newEmail.trim()}>
                    {emailBusy ? 'Sending…' : 'Send confirmation code'}
                  </PrimaryButton>
                  <SecondaryButton type="button" onClick={resetEmailFlows} disabled={emailBusy}>
                    Cancel
                  </SecondaryButton>
                </InlineActions>
              </EmailBlock>
            ) : (
              <EmailBlock>
                <Hint>
                  Enter the 6-digit code sent to {changeHint ?? 'the new address'}.
                  {changeConsole && ' (No mail provider configured — check the API server log.)'}
                </Hint>
                <CodeRow>
                  <Input
                    value={changeCode}
                    onChange={(e) => setChangeCode(e.target.value)}
                    placeholder="123456" inputMode="numeric" maxLength={6}
                    style={{ maxWidth: 140 }}
                  />
                  <PrimaryButton type="button" onClick={confirmChange} disabled={emailBusy || !changeCode.trim()}>
                    {emailBusy ? 'Confirming…' : 'Confirm change'}
                  </PrimaryButton>
                  <SecondaryButton type="button" onClick={resetEmailFlows} disabled={emailBusy}>
                    Cancel
                  </SecondaryButton>
                </CodeRow>
              </EmailBlock>
            )
          )}
        </CardBody>
        {emailError && <Banner $tone="error" role="alert">{emailError}</Banner>}
        {emailOk && <Banner $tone="success">{emailOk}</Banner>}
      </Card>

      <form onSubmit={handlePwSave}>
        <Card>
          <CardHeader>
            <h2>Change password</h2>
            <div className="sub">Use at least 8 characters with a mix of letters and numbers.</div>
          </CardHeader>
          <CardBody>
            <Row>
              <Label htmlFor="pw-current">Current password</Label>
              <Input
                id="pw-current" type="password"
                value={pw.current_password}
                onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
                autoComplete="current-password"
              />
            </Row>
            <Row>
              <Label htmlFor="pw-new">New password</Label>
              <Input
                id="pw-new" type="password"
                value={pw.new_password}
                onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
                autoComplete="new-password"
                minLength={8}
              />
            </Row>
            <Row>
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input
                id="pw-confirm" type="password"
                value={pw.confirm_password}
                onChange={(e) => setPw({ ...pw, confirm_password: e.target.value })}
                autoComplete="new-password"
                minLength={8}
              />
            </Row>
          </CardBody>
          {pwError && <Banner $tone="error" role="alert">{pwError}</Banner>}
          {pwOk && <Banner $tone="success">Password updated.</Banner>}
          <Actions>
            <PrimaryButton type="submit" disabled={pwSaving}>
              {pwSaving ? 'Updating…' : <><IconCheck size={16} /> Update password</>}
            </PrimaryButton>
          </Actions>
        </Card>
      </form>
    </>
  );
}

export default ProfileSettings;
