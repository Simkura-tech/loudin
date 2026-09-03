/**
 * WorkspaceSettings — Admin-editable company profile.
 *
 * Five collapsible sections:
 *   1. Company        — name, type (read-only pill), website, tax ID.
 *   2. Lead contact   — named person (name, title, email, phone).
 *   3. Shipping addr  — the legacy single address.
 *   4. Billing addr   — same-as-shipping toggle; revealed only when off.
 *   5. Notifications  — 5 boolean toggles for emails we send.
 *
 * Each drawer's header shows a one-line summary of the current state so
 * an admin can scan the page without opening every section.
 *
 * A single Save button at the bottom diffs all sections and sends a PATCH
 * with only the fields that changed.
 */

import { useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  NOTIFICATION_TOGGLES,
  workspaceApi,
  type NotificationPreferences,
  type Workspace,
  type WorkspacePatch,
} from '../../../services/tenancy/workspace';
import CountryInput from '../../../components/forms/CountryInput';

// ── Drawer styling (collapsible <details>) ──────────────────────────────────

const Drawer = styled.details`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  margin-bottom: 12px;

  & > summary {
    border-radius: 10px 10px 0 0;
  }
  &:not([open]) > summary {
    border-radius: 10px;
  }

  &[open] > summary {
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  }
  &[open] > summary .chevron {
    transform: rotate(180deg);
  }
`;

const DrawerSummary = styled.summary`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  list-style: none;
  user-select: none;

  &::-webkit-details-marker { display: none; }
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }

  .label {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }
  .title {
    font-size: 13px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  .summary {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .summary.empty {
    font-style: italic;
    color: ${({ theme }) => theme.colors.text.tertiary};
    opacity: 0.7;
  }
  .right {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .chevron {
    transition: transform 150ms ease;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const DrawerBody = styled.div`
  padding: 14px 16px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 160px 1fr;
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
    cursor: not-allowed;
  }
`;

const ReadOnly = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};

  .pill {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: capitalize;
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.secondary};
  }
`;

const TriRow = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 8px;

  @media (max-width: 480px) { grid-template-columns: 1fr; }
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  cursor: pointer;
  user-select: none;

  & + & { border-top: 1px solid ${({ theme }) => theme.colors.border.light}; }

  input[type="checkbox"] {
    margin-top: 2px;
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: ${({ theme }) => theme.colors.brand.primary};
  }
  .body { flex: 1; min-width: 0; }
  .name {
    font-size: 13px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
    margin-bottom: 2px;
  }
  .desc {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    line-height: 1.4;
  }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 0;
  position: sticky;
  bottom: 0;
  background: ${({ theme }) => theme.colors.background.secondary};
  margin-top: 8px;
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
  margin-bottom: 10px;
  background: ${({ $tone }) => ($tone === 'error' ? '#fef2f2' : '#dcfce7')};
  border: 1px solid ${({ $tone }) => ($tone === 'error' ? '#fecaca' : '#bbf7d0')};
  color: ${({ $tone }) => ($tone === 'error' ? '#991b1b' : '#166534')};
`;

// Shown in the Company drawer when the workspace name is still the signup-time
// placeholder — nudges the admin to set a real one, right by the name field.
const PlaceholderNotice = styled.div`
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 12px;
  line-height: 1.45;
  margin-bottom: 10px;
  background: ${({ theme }) => theme.colors.brand.primary}0f;
  border: 1px solid ${({ theme }) => theme.colors.brand.primary}33;
  color: ${({ theme }) => theme.colors.text.secondary};

  strong { color: ${({ theme }) => theme.colors.text.primary}; font-weight: 600; }
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  font-size: 13px;
  cursor: pointer;

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: ${({ theme }) => theme.colors.brand.primary};
  }
`;

// ── Form shape + helpers ────────────────────────────────────────────────────

type FormState = {
  name: string;
  company_email: string;
  company_phone: string;
  company_url:   string;
  street:  string; city:  string; state:  string; zip:  string; country:  string;
  lead_contact_name:  string;
  lead_contact_email: string;
  lead_contact_phone: string;
  lead_contact_title: string;
  billing_same_as_shipping: boolean;
  billing_street: string; billing_city: string; billing_state: string;
  billing_zip:    string; billing_country: string;
  tax_id: string;
  notification_preferences: NotificationPreferences;
};

const EMPTY_FORM: FormState = {
  name: '', company_email: '', company_phone: '', company_url: '',
  street: '', city: '', state: '', zip: '', country: '',
  lead_contact_name: '', lead_contact_email: '', lead_contact_phone: '', lead_contact_title: '',
  billing_same_as_shipping: true,
  billing_street: '', billing_city: '', billing_state: '', billing_zip: '', billing_country: '',
  tax_id: '',
  notification_preferences: {},
};

function fromWorkspace(w: Workspace): FormState {
  return {
    name:          w.name,
    company_email: w.company_email ?? '',
    company_phone: w.company_phone ?? '',
    company_url:   w.company_url   ?? '',
    street:        w.street        ?? '',
    city:          w.city          ?? '',
    state:         w.state         ?? '',
    zip:           w.zip           ?? '',
    country:       w.country       ?? '',
    lead_contact_name:  w.lead_contact_name  ?? '',
    lead_contact_email: w.lead_contact_email ?? '',
    lead_contact_phone: w.lead_contact_phone ?? '',
    lead_contact_title: w.lead_contact_title ?? '',
    billing_same_as_shipping: w.billing_same_as_shipping,
    billing_street:  w.billing_street  ?? '',
    billing_city:    w.billing_city    ?? '',
    billing_state:   w.billing_state   ?? '',
    billing_zip:     w.billing_zip     ?? '',
    billing_country: w.billing_country ?? '',
    tax_id:          w.tax_id          ?? '',
    notification_preferences: { ...(w.notification_preferences ?? {}) },
  };
}

const NULLABLE_STRING_FIELDS: (keyof FormState)[] = [
  'company_email', 'company_phone', 'company_url',
  'street', 'city', 'state', 'zip', 'country',
  'lead_contact_name', 'lead_contact_email', 'lead_contact_phone', 'lead_contact_title',
  'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
  'tax_id',
];

/** Returns only the fields that changed between initial and current. */
function diffPatch(initial: FormState, current: FormState): WorkspacePatch {
  const patch: WorkspacePatch = {};
  if (current.name !== initial.name) patch.name = current.name.trim();

  for (const k of NULLABLE_STRING_FIELDS) {
    const a = (initial[k] as string) ?? '';
    const b = (current[k] as string) ?? '';
    if (a !== b) {
      (patch as Record<string, string | null>)[k] = b.trim() ? b.trim() : null;
    }
  }

  if (initial.billing_same_as_shipping !== current.billing_same_as_shipping) {
    patch.billing_same_as_shipping = current.billing_same_as_shipping;
  }

  // Notification preferences — send the full known set whenever any toggle differs.
  const prefsChanged = NOTIFICATION_TOGGLES.some(
    (t) => !!initial.notification_preferences[t.key] !== !!current.notification_preferences[t.key],
  );
  if (prefsChanged) {
    patch.notification_preferences = Object.fromEntries(
      NOTIFICATION_TOGGLES.map((t) => [t.key, !!current.notification_preferences[t.key]]),
    ) as NotificationPreferences;
  }

  return patch;
}

// ── Summary helpers for drawer headers ──────────────────────────────────────

function summarizeAddress(s: string, c: string, st: string, z: string, co: string): string {
  const parts = [s, [c, st, z].filter(Boolean).join(' '), co].filter(Boolean).map((x) => x.trim()).filter(Boolean);
  return parts.join(', ');
}

function summarizeCompany(f: FormState): string {
  const bits = [
    f.name,
    f.company_url,
    f.tax_id ? `Tax ID ${f.tax_id}` : null,
  ].filter(Boolean) as string[];
  return bits.join(' · ');
}

function summarizeLeadContact(f: FormState): string {
  if (!f.lead_contact_name && !f.lead_contact_email) return '';
  const nameLine = f.lead_contact_title
    ? `${f.lead_contact_name}, ${f.lead_contact_title}`
    : f.lead_contact_name;
  return [nameLine, f.lead_contact_email].filter(Boolean).join(' · ');
}

function activeNotificationCount(prefs: NotificationPreferences): number {
  return NOTIFICATION_TOGGLES.filter((t) => prefs[t.key]).length;
}

// ── Component ───────────────────────────────────────────────────────────────

export function WorkspaceSettings() {
  const { user, refresh } = useAuth();
  const isAdmin = user?.user_type_id === 1;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [initial, setInitial]     = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const w = await workspaceApi.get();
        setWorkspace(w);
        const f = fromWorkspace(w);
        setForm(f);
        setInitial(f);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workspace');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dirty = useMemo(() => Object.keys(diffPatch(initial, form)).length > 0, [initial, form]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Workspace name is required'); return; }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const patch = diffPatch(initial, form);
      const updated = await workspaceApi.update(patch);
      setWorkspace(updated);
      const f = fromWorkspace(updated);
      setForm(f);
      setInitial(f);
      setSuccess(true);
      await refresh(); // sidebar workspace badge picks up the new name
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setForm(initial); setError(null); setSuccess(false); };

  if (loading) return <div style={{ color: '#94a3b8' }}>Loading…</div>;
  if (!workspace) return <Banner $tone="error">Could not load your workspace.</Banner>;

  // Drawer summaries
  const companySummary  = summarizeCompany(form);
  const leadSummary     = summarizeLeadContact(form);
  const shippingSummary = summarizeAddress(form.street, form.city, form.state, form.zip, form.country);
  const billingSummary  = form.billing_same_as_shipping
    ? 'Same as shipping'
    : summarizeAddress(form.billing_street, form.billing_city, form.billing_state, form.billing_zip, form.billing_country);
  const notifSummary    = `${activeNotificationCount(form.notification_preferences)} of ${NOTIFICATION_TOGGLES.length} enabled`;

  const renderSummary = (text: string, emptyFallback = 'Not set') => (
    text
      ? <span className="summary">{text}</span>
      : <span className="summary empty">{emptyFallback}</span>
  );

  return (
    <form onSubmit={handleSave}>
      {error && <Banner $tone="error" role="alert">{error}</Banner>}
      {success && !dirty && <Banner $tone="success">Workspace updated.</Banner>}

      {/* ── 1. Company ───────────────────────────────────────────── */}
      <Drawer open>
        <DrawerSummary>
          <span className="label">
            <span className="title">Company</span>
            {renderSummary(companySummary, 'No company info yet')}
          </span>
          <span className="right">
            <IconChevronDown size={16} className="chevron" />
          </span>
        </DrawerSummary>
        <DrawerBody>
          {isAdmin && user?.name_auto_generated && (
            <PlaceholderNotice>
              Your workspace still uses the name we set up for you
              (<strong>{workspace.name}</strong>). Give it a name your team will
              recognize, then save.
            </PlaceholderNotice>
          )}
          <Row>
            <Label htmlFor="ws-name">Workspace name</Label>
            <Input
              id="ws-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!isAdmin}
              required maxLength={255}
            />
          </Row>
          <Row>
            <Label>Type</Label>
            <ReadOnly>
              <span className="pill">{workspace.company_type.replace('_', ' ')}</span>
            </ReadOnly>
          </Row>
          <Row>
            <Label htmlFor="ws-email">Contact email</Label>
            <Input
              id="ws-email"
              type="email"
              value={form.company_email}
              onChange={(e) => setForm({ ...form, company_email: e.target.value })}
              disabled={!isAdmin}
              maxLength={255}
              placeholder="info@example.com"
            />
          </Row>
          <Row>
            <Label htmlFor="ws-phone">Main phone</Label>
            <Input
              id="ws-phone"
              value={form.company_phone}
              onChange={(e) => setForm({ ...form, company_phone: e.target.value })}
              disabled={!isAdmin}
              maxLength={50}
            />
          </Row>
          <Row>
            <Label htmlFor="ws-url">Website</Label>
            <Input
              id="ws-url"
              value={form.company_url}
              onChange={(e) => setForm({ ...form, company_url: e.target.value })}
              disabled={!isAdmin}
              placeholder="https://example.com"
              maxLength={500}
            />
          </Row>
          <Row>
            <Label htmlFor="ws-tax">Tax ID</Label>
            <Input
              id="ws-tax"
              value={form.tax_id}
              onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              disabled={!isAdmin}
              placeholder="EIN, VAT, GST, etc."
              maxLength={50}
            />
          </Row>
        </DrawerBody>
      </Drawer>

      {/* ── 2. Lead contact ─────────────────────────────────────── */}
      <Drawer>
        <DrawerSummary>
          <span className="label">
            <span className="title">Lead contact</span>
            {renderSummary(leadSummary, 'No lead contact yet')}
          </span>
          <span className="right">
            <IconChevronDown size={16} className="chevron" />
          </span>
        </DrawerSummary>
        <DrawerBody>
          <Row>
            <Label htmlFor="ws-lc-name">Name</Label>
            <Input
              id="ws-lc-name"
              value={form.lead_contact_name}
              onChange={(e) => setForm({ ...form, lead_contact_name: e.target.value })}
              disabled={!isAdmin}
              maxLength={255}
              placeholder="Jane Doe"
            />
          </Row>
          <Row>
            <Label htmlFor="ws-lc-title">Title</Label>
            <Input
              id="ws-lc-title"
              value={form.lead_contact_title}
              onChange={(e) => setForm({ ...form, lead_contact_title: e.target.value })}
              disabled={!isAdmin}
              maxLength={100}
              placeholder="Facilities Manager"
            />
          </Row>
          <Row>
            <Label htmlFor="ws-lc-email">Email</Label>
            <Input
              id="ws-lc-email"
              type="email"
              value={form.lead_contact_email}
              onChange={(e) => setForm({ ...form, lead_contact_email: e.target.value })}
              disabled={!isAdmin}
              maxLength={255}
              placeholder="jane@example.com"
            />
          </Row>
          <Row>
            <Label htmlFor="ws-lc-phone">Phone</Label>
            <Input
              id="ws-lc-phone"
              value={form.lead_contact_phone}
              onChange={(e) => setForm({ ...form, lead_contact_phone: e.target.value })}
              disabled={!isAdmin}
              maxLength={50}
            />
          </Row>
        </DrawerBody>
      </Drawer>

      {/* ── 3. Shipping address ─────────────────────────────────── */}
      <Drawer>
        <DrawerSummary>
          <span className="label">
            <span className="title">Shipping address</span>
            {renderSummary(shippingSummary, 'No shipping address yet')}
          </span>
          <span className="right">
            <IconChevronDown size={16} className="chevron" />
          </span>
        </DrawerSummary>
        <DrawerBody>
          <Row>
            <Label htmlFor="ws-street">Street</Label>
            <Input
              id="ws-street"
              value={form.street}
              onChange={(e) => setForm({ ...form, street: e.target.value })}
              disabled={!isAdmin}
              maxLength={255}
            />
          </Row>
          <Row>
            <Label>City / State / ZIP</Label>
            <TriRow>
              <Input value={form.city}  onChange={(e) => setForm({ ...form, city:  e.target.value })} placeholder="City"  disabled={!isAdmin} maxLength={100} />
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="State" disabled={!isAdmin} maxLength={100} />
              <Input value={form.zip}   onChange={(e) => setForm({ ...form, zip:   e.target.value })} placeholder="ZIP"   disabled={!isAdmin} maxLength={20} />
            </TriRow>
          </Row>
          <Row>
            <Label htmlFor="ws-country">Country</Label>
            <CountryInput
              id="ws-country"
              value={form.country}
              onChange={(v) => setForm({ ...form, country: v })}
              disabled={!isAdmin}
            />
          </Row>
        </DrawerBody>
      </Drawer>

      {/* ── 4. Billing address ──────────────────────────────────── */}
      <Drawer>
        <DrawerSummary>
          <span className="label">
            <span className="title">Billing address</span>
            {renderSummary(billingSummary, 'Not set')}
          </span>
          <span className="right">
            <IconChevronDown size={16} className="chevron" />
          </span>
        </DrawerSummary>
        <DrawerBody>
          <ToggleRow>
            <input
              type="checkbox"
              checked={form.billing_same_as_shipping}
              onChange={(e) => {
                const same = e.target.checked;
                setForm({
                  ...form,
                  billing_same_as_shipping: same,
                  // Visually clear the billing fields when toggling on; the
                  // backend will null them out on save regardless.
                  ...(same
                    ? { billing_street: '', billing_city: '', billing_state: '', billing_zip: '', billing_country: '' }
                    : {}),
                });
              }}
              disabled={!isAdmin}
            />
            Use the shipping address for billing
          </ToggleRow>

          {!form.billing_same_as_shipping && (
            <>
              <Row>
                <Label htmlFor="ws-bstreet">Street</Label>
                <Input
                  id="ws-bstreet"
                  value={form.billing_street}
                  onChange={(e) => setForm({ ...form, billing_street: e.target.value })}
                  disabled={!isAdmin}
                  maxLength={255}
                />
              </Row>
              <Row>
                <Label>City / State / ZIP</Label>
                <TriRow>
                  <Input value={form.billing_city}  onChange={(e) => setForm({ ...form, billing_city:  e.target.value })} placeholder="City"  disabled={!isAdmin} maxLength={100} />
                  <Input value={form.billing_state} onChange={(e) => setForm({ ...form, billing_state: e.target.value })} placeholder="State" disabled={!isAdmin} maxLength={100} />
                  <Input value={form.billing_zip}   onChange={(e) => setForm({ ...form, billing_zip:   e.target.value })} placeholder="ZIP"   disabled={!isAdmin} maxLength={20} />
                </TriRow>
              </Row>
              <Row>
                <Label htmlFor="ws-bcountry">Country</Label>
                <CountryInput
                  id="ws-bcountry"
                  value={form.billing_country}
                  onChange={(v) => setForm({ ...form, billing_country: v })}
                  disabled={!isAdmin}
                />
              </Row>
            </>
          )}
        </DrawerBody>
      </Drawer>

      {/* ── 5. Notifications ────────────────────────────────────── */}
      <Drawer>
        <DrawerSummary>
          <span className="label">
            <span className="title">Notifications</span>
            <span className="summary">{notifSummary}</span>
          </span>
          <span className="right">
            <IconChevronDown size={16} className="chevron" />
          </span>
        </DrawerSummary>
        <DrawerBody>
          {NOTIFICATION_TOGGLES.map((t) => (
            <CheckboxRow key={t.key}>
              <input
                type="checkbox"
                checked={!!form.notification_preferences[t.key]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notification_preferences: {
                      ...form.notification_preferences,
                      [t.key]: e.target.checked,
                    },
                  })
                }
                disabled={!isAdmin}
              />
              <div className="body">
                <div className="name">{t.label}</div>
                <div className="desc">{t.description}</div>
              </div>
            </CheckboxRow>
          ))}
        </DrawerBody>
      </Drawer>

      {isAdmin && (
        <Actions>
          <SecondaryButton type="button" onClick={reset} disabled={!dirty || saving}>
            Reset
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={!dirty || saving}>
            {saving ? 'Saving…' : <><IconCheck size={16} /> Save changes</>}
          </PrimaryButton>
        </Actions>
      )}
      {!isAdmin && (
        <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'right', paddingTop: 8 }}>
          Only Admins can edit workspace settings.
        </div>
      )}
    </form>
  );
}


export default WorkspaceSettings;
