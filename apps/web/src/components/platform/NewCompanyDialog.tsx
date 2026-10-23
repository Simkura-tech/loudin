/**
 * NewCompanyDialog — provision a company and invite its first Admin.
 *
 * Two callers, picked by `variant`:
 *   - 'platform'  (default) the platform admin, POST /api/companies — a
 *                 customer who will not self-sign-up, or an installer company
 *                 (installers never self-sign-up).
 *   - 'installer' an installer Admin, POST /api/installer/customers — always
 *                 a customer, and the installer is granted access to it in the
 *                 same call so it appears on their Customers page at once.
 *
 * On success the dialog shows the invite outcome and a copyable accept link,
 * exactly like the workspace Invite user dialog, since the platform may be
 * running without an email provider.
 */

import { useState } from 'react';
import styled from '@emotion/styled';
import { IconCheck, IconCopy, IconMailForward, IconX } from '@tabler/icons-react';
import {
  companiesApi,
  type Company,
  type CreateCompanyResult,
  type CreatableCompanyType,
} from '../../services/platform/companies';
import { installerApi } from '../../services/installer/customers';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
`;

const Dialog = styled.div`
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.background.primary};
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
`;

const DialogHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  h2 { font-size: 15px; font-weight: 600; margin: 0; }
`;

const DialogBody = styled.div`
  padding: 14px 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  @media (max-width: 480px) { grid-template-columns: 1fr; }
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const FullSpan = styled.div` grid-column: 1 / -1; `;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const FieldLabel = styled.span` font-size: 12px; font-weight: 500; `;

const Hint = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const Input = styled.input`
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
`;

const TypeChoice = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const TypeOption = styled.label<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.brand.primary : theme.colors.border.light)};
  background: ${({ theme, $active }) => ($active ? `${theme.colors.brand.primary}0d` : theme.colors.background.primary)};
  cursor: pointer;

  input { display: none; }
  .t { font-size: 13px; font-weight: 600; }
  .d { font-size: 12px; color: ${({ theme }) => theme.colors.text.secondary}; line-height: 1.4; }
`;

const PrimaryButton = styled.button`
  display: inline-flex; align-items: center; gap: 5px;
  height: 34px; padding: 0 14px; border-radius: 8px; border: none;
  background: ${({ theme }) => theme.colors.brand.primary}; color: #fff;
  font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  display: inline-flex; align-items: center; gap: 5px;
  height: 34px; padding: 0 12px; border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px; font-weight: 500; font-family: inherit; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
`;

const IconButton = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.secondary}; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
`;

const ErrorBanner = styled.div`
  padding: 10px 12px; border-radius: 8px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 13px;
`;

const SuccessCard = styled.div`
  padding: 12px; border-radius: 8px;
  background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
  font-size: 13px; line-height: 1.5;
  strong { font-weight: 600; }
`;

const LinkRow = styled.div`
  display: flex; gap: 8px; align-items: center; margin-top: 8px;
  input {
    flex: 1; min-width: 0; height: 30px; padding: 0 8px; border-radius: 6px;
    border: 1px solid #bbf7d0; background: #fff; font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #14532d;
  }
`;

interface Props {
  onClose: () => void;
  /** Called with the new company after a successful create. */
  onCreated?: (company: Company) => void;
  /** Pre-select a type (e.g. 'installer' from the installer-access panel). */
  initialType?: CreatableCompanyType;
  /** Who is provisioning. 'installer' fixes the type to customer and routes
   *  through /api/installer/customers. */
  variant?: 'platform' | 'installer';
}

export default function NewCompanyDialog({ onClose, onCreated, initialType = 'end_user', variant = 'platform' }: Props) {
  const forInstaller = variant === 'installer';
  const [type, setType] = useState<CreatableCompanyType>(forInstaller ? 'end_user' : initialType);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateCompanyResult | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        admin_email: email.trim(),
        admin_first_name: firstName.trim() || undefined,
        admin_last_name: lastName.trim() || undefined,
      };
      const r = forInstaller
        ? await installerApi.createCustomer(payload)
        : await companiesApi.create({ ...payload, company_type: type });
      setResult(r);
      onCreated?.(r.company);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the company');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.accept_url); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog role="dialog" aria-labelledby="new-company-title">
        <form onSubmit={submit}>
          <DialogHeader>
            <h2 id="new-company-title">{forInstaller ? 'New customer' : 'New company'}</h2>
            <IconButton type="button" onClick={onClose} aria-label="Close"><IconX size={16} /></IconButton>
          </DialogHeader>

          {result ? (
            <div style={{ padding: '14px 18px' }}>
              <SuccessCard role="status">
                <div>
                  <IconMailForward size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  <strong>{result.company.name}</strong> created
                  {forInstaller ? ' and added to your customers' : ''}. Invite for{' '}
                  <strong>{result.invite.email}</strong>{' '}
                  {result.delivery === 'email'
                    ? 'sent by email.'
                    : 'created. No email provider is configured, so share the link below.'}
                </div>
                <LinkRow>
                  <input readOnly value={result.accept_url} onFocus={(e) => e.currentTarget.select()} />
                  <SecondaryButton type="button" onClick={copy}>
                    {copied ? (<><IconCheck size={14} /> Copied</>) : (<><IconCopy size={14} /> Copy link</>)}
                  </SecondaryButton>
                </LinkRow>
              </SuccessCard>
            </div>
          ) : (
            <DialogBody>
              {forInstaller ? (
                <FullSpan>
                  <Hint>
                    Sets up a customer workspace and invites its first admin. Your company
                    is granted access immediately, so you can open it and start deploying
                    doors before they sign in. The customer can revoke that access at any time.
                  </Hint>
                </FullSpan>
              ) : (
                <FullSpan>
                  <TypeChoice>
                    <TypeOption $active={type === 'end_user'}>
                      <input type="radio" name="type" checked={type === 'end_user'} onChange={() => setType('end_user')} />
                      <span className="t">Customer</span>
                      <span className="d">Owns and uses door locks. Gets People, Devices and Settings.</span>
                    </TypeOption>
                    <TypeOption $active={type === 'installer'}>
                      <input type="radio" name="type" checked={type === 'installer'} onChange={() => setType('installer')} />
                      <span className="t">Installer</span>
                      <span className="d">Services other companies&apos; doors. Works inside customers that grant access.</span>
                    </TypeOption>
                  </TypeChoice>
                </FullSpan>
              )}
              <FullSpan>
                <Field>
                  <FieldLabel>Company name *</FieldLabel>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={255} />
                </Field>
              </FullSpan>
              <FullSpan>
                <Field>
                  <FieldLabel>{forInstaller ? 'Customer admin’s email *' : 'First admin’s email *'}</FieldLabel>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="owner@company.com" />
                  <Hint>They receive a single-use invite link to set their password.</Hint>
                </Field>
              </FullSpan>
              <Field>
                <FieldLabel>First name</FieldLabel>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Optional" />
              </Field>
              <Field>
                <FieldLabel>Last name</FieldLabel>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Optional" />
              </Field>
              {error && <FullSpan><ErrorBanner role="alert">{error}</ErrorBanner></FullSpan>}
            </DialogBody>
          )}

          <DialogFooter>
            <SecondaryButton type="button" onClick={onClose}>{result ? 'Done' : 'Cancel'}</SecondaryButton>
            {!result && (
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? 'Creating…' : (<><IconCheck size={16} /> Create &amp; invite</>)}
              </PrimaryButton>
            )}
          </DialogFooter>
        </form>
      </Dialog>
    </Backdrop>
  );
}
