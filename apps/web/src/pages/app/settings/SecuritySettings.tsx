/**
 * SecuritySettings — Settings → Security tab.
 *
 * Two-factor authentication: enroll a channel (email or SMS), confirm
 * the destination by entering a one-shot code, and toggle the feature
 * off later. SMS is disabled when the user has no phone_number on file —
 * we hint at why and link them to Profile.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconAlertTriangle,
  IconCheck,
  IconDeviceMobile,
  IconMail,
  IconShieldCheck,
  IconShieldOff,
} from '@tabler/icons-react';
import { useAuth } from '../../../contexts/AuthContext';
import { auth } from '../../../services/auth/auth';

// ── Layout ────────────────────────────────────────────────────────────────────

const Section = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.background.primary};
  margin-bottom: 16px;
  overflow: hidden;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  h2 {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin: 0;
  }
`;

const SectionBody = styled.div`
  padding: 14px 16px;
`;

const StatusLine = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  margin-bottom: 12px;

  .crest {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .body  { display: flex; flex-direction: column; }
  .strong { font-weight: 600; }
  .muted  { font-size: 12px; color: ${({ theme }) => theme.colors.text.tertiary}; }
`;

const ChannelGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
  @media (max-width: 460px) { grid-template-columns: 1fr; }
`;

const ChannelOption = styled.button<{ $active: boolean; $disabled?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid
    ${({ theme, $active, $disabled }) =>
      $disabled ? theme.colors.border.light
      : $active ? theme.colors.brand.primary
      :           theme.colors.border.light};
  background: ${({ theme, $active }) =>
    $active ? `${theme.colors.brand.primary}0a` : theme.colors.background.primary};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.55 : 1)};
  font-family: inherit;
  text-align: left;

  .ico {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }
  .label { font-size: 13px; font-weight: 600; }
  .hint  { font-size: 12px; color: ${({ theme }) => theme.colors.text.secondary}; }
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
`;

const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Input = styled.input`
  height: 38px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 14px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
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

const DangerButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid #fecaca;
  background: ${({ theme }) => theme.colors.background.primary};
  color: #b91c1c;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: #fef2f2; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Banner = styled.div<{ $tone: 'info' | 'success' | 'error' | 'warn' }>`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 8px;
  margin-top: 12px;
  font-size: 13px;
  border: 1px solid
    ${({ $tone }) =>
      $tone === 'warn'    ? '#fde68a'
    : $tone === 'success' ? '#bbf7d0'
    : $tone === 'error'   ? '#fecaca'
    :                       '#e2e8f0'};
  background:
    ${({ $tone }) =>
      $tone === 'warn'    ? '#fef3c7'
    : $tone === 'success' ? '#dcfce7'
    : $tone === 'error'   ? '#fef2f2'
    :                       '#f1f5f9'};
  color:
    ${({ $tone }) =>
      $tone === 'warn'    ? '#92400e'
    : $tone === 'success' ? '#166534'
    : $tone === 'error'   ? '#991b1b'
    :                       '#475569'};
`;

// ── Component ────────────────────────────────────────────────────────────────

export function SecuritySettings() {
  const { user, refresh } = useAuth();
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'awaiting_code'>('idle');
  const [delivery, setDelivery] = useState<'email'|'sms'|'console' | null>(null);
  const [destinationHint, setDestinationHint] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [busy, setBusy]     = useState(false);

  const reset = useCallback(() => {
    setStep('idle');
    setCode('');
    setDelivery(null);
    setDestinationHint(null);
    setError(null);
  }, []);

  // Snap back to idle whenever the user's 2FA status changes.
  useEffect(() => { reset(); }, [user?.two_factor_enabled, reset]);

  const startEnroll = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await auth.twoFactor.enable(channel);
      setDelivery(r.delivery_method);
      setDestinationHint(r.destination_hint);
      setStep('awaiting_code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async () => {
    setError(null);
    setBusy(true);
    try {
      await auth.twoFactor.confirm(channel, code.trim());
      await refresh();
      // useEffect on user.two_factor_enabled will reset() us back to idle.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm code');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!window.confirm('Turn off two-factor authentication?')) return;
    setError(null);
    setBusy(true);
    try {
      await auth.twoFactor.disable();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable 2FA');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  const isOn = user.two_factor_enabled;
  const hasPhone = !!user.phone_number;

  return (
    <Section>
      <SectionHeader><h2>Two-factor authentication</h2></SectionHeader>
      <SectionBody>
        <StatusLine>
          <span className="crest">
            {isOn ? <IconShieldCheck size={18} /> : <IconShieldOff size={18} />}
          </span>
          <span className="body">
            <span className="strong">
              {isOn
                ? `Enabled — codes go to your ${user.two_factor_channel}`
                : 'Not enabled'}
            </span>
            <span className="muted">
              {isOn
                ? 'After your password we send a 6-digit code to confirm sign-in.'
                : 'Add a second factor so a stolen password isn’t enough to sign in.'}
            </span>
          </span>
        </StatusLine>

        {isOn ? (
          <>
            <DangerButton type="button" onClick={disable} disabled={busy}>
              <IconShieldOff size={16} /> {busy ? 'Disabling…' : 'Turn off two-factor'}
            </DangerButton>
            {error && <Banner $tone="error" role="alert"><IconAlertTriangle size={16} />{error}</Banner>}
          </>
        ) : step === 'idle' ? (
          <>
            <ChannelGrid>
              <ChannelOption
                type="button"
                $active={channel === 'email'}
                onClick={() => setChannel('email')}
              >
                <span className="ico"><IconMail size={16} /></span>
                <span className="label">Email</span>
                <span className="hint">Send the code to {user.email}</span>
              </ChannelOption>
              <ChannelOption
                type="button"
                $active={channel === 'sms'}
                $disabled={!hasPhone}
                onClick={() => hasPhone && setChannel('sms')}
              >
                <span className="ico"><IconDeviceMobile size={16} /></span>
                <span className="label">Text message</span>
                <span className="hint">
                  {hasPhone
                    ? `Send the code to ${user.phone_number}`
                    : <>Add a phone number on your <Link to="/app/settings/profile">profile</Link> first.</>}
                </span>
              </ChannelOption>
            </ChannelGrid>
            <PrimaryButton type="button" onClick={startEnroll} disabled={busy || (channel === 'sms' && !hasPhone)}>
              <IconShieldCheck size={16} /> {busy ? 'Sending…' : 'Send verification code'}
            </PrimaryButton>
            {error && <Banner $tone="error" role="alert"><IconAlertTriangle size={16} />{error}</Banner>}
          </>
        ) : (
          <>
            <Banner $tone="info">
              We sent a 6-digit code to <strong>{destinationHint}</strong>.
              {delivery === 'console' && (
                <> <em>Provider not configured — the code is in the API server log.</em></>
              )}
            </Banner>
            <Field style={{ marginTop: 12 }}>
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
              />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <PrimaryButton type="button" onClick={confirmEnroll} disabled={busy || code.length < 6}>
                <IconCheck size={16} /> {busy ? 'Confirming…' : 'Confirm and turn on'}
              </PrimaryButton>
              <DangerButton type="button" onClick={reset} disabled={busy}>
                Cancel
              </DangerButton>
            </div>
            {error && <Banner $tone="error" role="alert"><IconAlertTriangle size={16} />{error}</Banner>}
          </>
        )}
      </SectionBody>
    </Section>
  );
}

export default SecuritySettings;
