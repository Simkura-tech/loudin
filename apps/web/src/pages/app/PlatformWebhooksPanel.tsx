/**
 * PlatformWebhooksPanel — outbound webhook endpoint management.
 *
 * Rendered inside the "API access & webhooks" page (platform-admin only).
 * Register destination URLs, subscribe them to event types, view the signing
 * secret (shown in full on create/rotate), and inspect + redeliver recent
 * delivery attempts.
 *
 * Delivery itself is durable + retried server-side (webhook_deliveries +
 * scripts/deliver-webhooks.js); this is just the management surface.
 *
 * NOTE: the X-Loudin-* header names shown in the docs prose below are part
 * of the API wire protocol (sent by apps/api) — they are NOT display branding
 * and must not be rebranded via src/branding.ts.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconAlertTriangle, IconCheck, IconCopy, IconPlus, IconRefresh,
  IconTrash, IconWebhook, IconX, IconChevronDown, IconChevronRight,
} from '@tabler/icons-react';
import {
  webhooksApi,
  type WebhookEndpoint,
  type WebhookDelivery,
} from '../../services/platform/webhooks';

// ── styles ───────────────────────────────────────────────────────────────────
const Section = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.background.primary};
  margin-bottom: 16px;
  overflow: hidden;
`;
const SectionHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  h2 {
    font-size: 13px; font-weight: 600; letter-spacing: 0.03em;
    text-transform: uppercase; color: ${({ theme }) => theme.colors.text.tertiary}; margin: 0;
  }
`;
const Body = styled.div`padding: 14px 16px;`;
const PrimaryButton = styled.button`
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px;
  border-radius: 8px; border: none; background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;
const SecondaryButton = styled.button`
  display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px;
  border-radius: 7px; border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;
const DangerButton = styled(SecondaryButton)`
  color: #b91c1c; border-color: #fecaca;
  &:hover { background: #fef2f2; }
`;
const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 13px;
  th { text-align: left; font-weight: 600; color: ${({ theme }) => theme.colors.text.tertiary};
       font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; }
  td { padding: 10px; border-top: 1px solid ${({ theme }) => theme.colors.border.light}; vertical-align: top; }
  tr.disabled td { opacity: 0.55; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
`;
const Chip = styled.span`
  display: inline-block; padding: 2px 7px; margin: 2px 4px 2px 0; border-radius: 999px;
  background: ${({ theme }) => theme.colors.background.secondary};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 11px; font-family: ui-monospace, monospace;
`;
const Pill = styled.span<{ $s: string }>`
  display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
  background: ${({ $s }) => ($s === 'active' || $s === 'delivered') ? '#dcfce7'
    : ($s === 'failed' || $s === 'exhausted' || $s === 'disabled') ? '#fee2e2'
    : '#fef9c3'};
  color: ${({ $s }) => ($s === 'active' || $s === 'delivered') ? '#166534'
    : ($s === 'failed' || $s === 'exhausted' || $s === 'disabled') ? '#991b1b'
    : '#854d0e'};
`;
const Empty = styled.div`
  padding: 24px; text-align: center; color: ${({ theme }) => theme.colors.text.tertiary};
  .title { font-weight: 600; color: ${({ theme }) => theme.colors.text.secondary}; margin-bottom: 4px; }
`;
const ErrorBanner = styled.div`
  padding: 10px 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca;
  color: #991b1b; font-size: 13px; margin-bottom: 12px;
`;
const SecretBanner = styled.div`
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 12px;
  border-radius: 8px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 13px;
  code { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
`;
const Backdrop = styled.div`
  position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex;
  align-items: center; justify-content: center; z-index: 60; padding: 20px;
`;
const Modal = styled.div`
  width: 100%; max-width: 480px; background: ${({ theme }) => theme.colors.background.primary};
  border-radius: 12px; padding: 18px; box-shadow: 0 20px 50px rgba(0,0,0,0.25);
  h3 { margin: 0 0 12px; font-size: 16px; }
`;
const Field = styled.label`
  display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 13px;
  input {
    height: 36px; padding: 0 10px; border-radius: 8px; font-size: 14px; font-family: inherit;
    border: 1px solid ${({ theme }) => theme.colors.border.light};
    background: ${({ theme }) => theme.colors.background.primary};
    &:focus { outline: none; border-color: ${({ theme }) => theme.colors.brand.primary}; }
  }
`;
const EventGrid = styled.div`
  display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px;
  max-height: 300px; overflow-y: auto;
  label { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; cursor: pointer; }
  input { margin-top: 2px; }
  .type { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
  .desc { font-size: 11.5px; color: ${({ theme }) => theme.colors.text.tertiary}; margin-top: 1px; }
`;
const CatalogTable = styled.table`
  width: 100%; border-collapse: collapse; font-size: 13px;
  td { padding: 8px 10px; border-top: 1px solid ${({ theme }) => theme.colors.border.light}; vertical-align: top; }
  tr:first-of-type td { border-top: none; }
  .type {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; font-weight: 600; white-space: nowrap;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  .desc { color: ${({ theme }) => theme.colors.text.secondary}; }
`;
const CatalogNote = styled.div`
  font-size: 12px; color: ${({ theme }) => theme.colors.text.tertiary};
  padding: 10px 10px 2px;
`;
const ModalActions = styled.div`display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;`;
const DeliveryTable = styled(Table)`
  margin-top: 8px;
  background: ${({ theme }) => theme.colors.background.secondary};
  border-radius: 8px;
`;

// ── event catalog ────────────────────────────────────────────────────────────
// When each event fires, keyed by type. The list itself comes from the API
// (available_events) so new backend types still render — just without a
// description until this map catches up. Keep in sync with
// docs/integrations/webhooks.md.
const EVENT_DESCRIPTIONS: Record<string, string> = {
  'company.signed_up':
    'A company self-registers (email/password or Google OAuth).',
  'company.first_person_added':
    'The company creates its first door-access credential holder.',
  'device.added':
    'A device is claimed by a company.',
  'device.removed':
    'A device is released (deactivated).',
  'device.offline_extended':
    'A claimed device hasn’t been seen for 48 hours (once per offline episode).',
};

// ── helpers ────────────────────────────────────────────────────────────────
function rel(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts).getTime();
  const diff = Date.now() - d;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000), h = Math.round(abs / 3600000), day = Math.round(abs / 86400000);
  const suffix = diff >= 0 ? ' ago' : ' from now';
  if (abs < 60000) return 'just now';
  if (m < 60) return `${m}m${suffix}`;
  if (h < 24) return `${h}h${suffix}`;
  return `${day}d${suffix}`;
}

interface FormState { name: string; url: string; events: Set<string>; active: boolean; }
const EMPTY_FORM: FormState = { name: '', url: '', events: new Set(), active: true };

// ── component ────────────────────────────────────────────────────────────────
export default function PlatformWebhooksPanel() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[] | null>(null);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [revealSecret, setRevealSecret] = useState<{ id: number; secret: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpoint | null>(null);

  const [openDeliveries, setOpenDeliveries] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await webhooksApi.list();
      setEndpoints(r.endpoints);
      setAvailableEvents(r.available_events);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load webhooks');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setError(null); setModalOpen(true); };
  const openEdit = (ep: WebhookEndpoint) => {
    setEditing(ep);
    setForm({ name: ep.name, url: ep.url, events: new Set(ep.event_types), active: ep.active });
    setError(null); setModalOpen(true);
  };

  const toggleEvent = (evt: string) => setForm((f) => {
    const events = new Set(f.events);
    events.has(evt) ? events.delete(evt) : events.add(evt);
    return { ...f, events };
  });

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const event_types = [...form.events];
      if (editing) {
        await webhooksApi.update(editing.id, {
          name: form.name, url: form.url, event_types, active: form.active,
        });
      } else {
        const ep = await webhooksApi.create({ name: form.name, url: form.url, event_types });
        if (ep.secret) setRevealSecret({ id: ep.id, secret: ep.secret });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const rotate = async (ep: WebhookEndpoint) => {
    try {
      const updated = await webhooksApi.rotateSecret(ep.id);
      if (updated.secret) setRevealSecret({ id: ep.id, secret: updated.secret });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rotate failed');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await webhooksApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const toggleDeliveries = async (ep: WebhookEndpoint) => {
    if (openDeliveries === ep.id) { setOpenDeliveries(null); setDeliveries(null); return; }
    setOpenDeliveries(ep.id); setDeliveries(null);
    try {
      setDeliveries(await webhooksApi.deliveries(ep.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deliveries');
    }
  };

  const redeliver = async (d: WebhookDelivery) => {
    try {
      await webhooksApi.redeliver(d.id);
      if (openDeliveries) setDeliveries(await webhooksApi.deliveries(openDeliveries));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Redeliver failed');
    }
  };

  const copy = (text: string) => { void navigator.clipboard?.writeText(text); };

  return (
    <>
    <Section>
      <SectionHeader>
        <h2><IconWebhook size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />Webhook endpoints</h2>
        <PrimaryButton type="button" onClick={openCreate}><IconPlus size={14} /> Add endpoint</PrimaryButton>
      </SectionHeader>
      <Body>
        {error && <ErrorBanner role="alert">{error}</ErrorBanner>}
        {revealSecret && (
          <SecretBanner>
            <IconCheck size={16} />
            <div style={{ flex: 1 }}>
              Signing secret (store it now — use it to verify <span className="mono">X-Loudin-Signature</span>):{' '}
              <code>{revealSecret.secret}</code>
            </div>
            <SecondaryButton type="button" onClick={() => copy(revealSecret.secret)}><IconCopy size={13} /> Copy</SecondaryButton>
            <SecondaryButton type="button" onClick={() => setRevealSecret(null)}><IconX size={13} /></SecondaryButton>
          </SecretBanner>
        )}

        {endpoints === null ? (
          <div style={{ color: '#94a3b8', padding: 8 }}>Loading…</div>
        ) : endpoints.length === 0 ? (
          <Empty>
            <div className="title">No webhook endpoints yet</div>
            <div>Add one to receive signed event notifications at a URL you control.</div>
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr><th></th><th>Name</th><th>URL</th><th>Events</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {endpoints.map((ep) => (
                <Fragment key={ep.id}>
                  <tr className={ep.status === 'disabled' ? 'disabled' : ''}>
                    <td>
                      {ep.status !== 'disabled' && (
                        <button
                          type="button"
                          onClick={() => toggleDeliveries(ep)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                          title="Recent deliveries"
                        >
                          {openDeliveries === ep.id ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
                        </button>
                      )}
                    </td>
                    <td><strong>{ep.name}</strong></td>
                    <td className="mono" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.url}</td>
                    <td>{ep.event_types.map((e) => <Chip key={e}>{e}</Chip>)}</td>
                    <td><Pill $s={ep.status}>{ep.status}</Pill></td>
                    <td>
                      <div className="actions">
                        {ep.status !== 'disabled' && (
                          <>
                            <SecondaryButton type="button" onClick={() => openEdit(ep)}>Edit</SecondaryButton>
                            <SecondaryButton type="button" onClick={() => rotate(ep)}><IconRefresh size={13} /> Rotate</SecondaryButton>
                            <DangerButton type="button" onClick={() => setDeleteTarget(ep)}><IconTrash size={13} /></DangerButton>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {openDeliveries === ep.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: '0 10px 12px' }}>
                        {deliveries === null ? (
                          <div style={{ color: '#94a3b8', padding: 8 }}>Loading deliveries…</div>
                        ) : deliveries.length === 0 ? (
                          <div style={{ color: '#94a3b8', padding: 8 }}>No deliveries yet.</div>
                        ) : (
                          <DeliveryTable>
                            <thead>
                              <tr><th>Event</th><th>Status</th><th>Attempts</th><th>HTTP</th><th>When</th><th></th></tr>
                            </thead>
                            <tbody>
                              {deliveries.map((d) => (
                                <tr key={d.id}>
                                  <td className="mono">{d.event_type}</td>
                                  <td><Pill $s={d.status}>{d.status}</Pill></td>
                                  <td>{d.attempt_count}/{d.max_attempts}</td>
                                  <td>{d.last_status_code ?? '—'}{d.last_error ? <div style={{ color: '#991b1b', fontSize: 11 }}>{d.last_error}</div> : null}</td>
                                  <td>{rel(d.delivered_at ?? d.updated_at)}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    {(d.status === 'failed' || d.status === 'exhausted') && (
                                      <SecondaryButton type="button" onClick={() => redeliver(d)}>Redeliver</SecondaryButton>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </DeliveryTable>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Body>

      {/* create / edit modal */}
      {modalOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <Modal>
            <h3>{editing ? 'Edit endpoint' : 'Add webhook endpoint'}</h3>
            {error && <ErrorBanner>{error}</ErrorBanner>}
            <Field>
              <span>Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ops Slack bridge" />
            </Field>
            <Field>
              <span>Destination URL</span>
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/webhooks/events" />
            </Field>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Events</div>
            <EventGrid>
              {availableEvents.map((evt) => (
                <label key={evt}>
                  <input type="checkbox" checked={form.events.has(evt)} onChange={() => toggleEvent(evt)} />
                  <span>
                    <div className="type">{evt}</div>
                    {EVENT_DESCRIPTIONS[evt] && <div className="desc">{EVENT_DESCRIPTIONS[evt]}</div>}
                  </span>
                </label>
              ))}
            </EventGrid>
            {editing && (
              <EventGrid>
                <label>
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  active (deliver events)
                </label>
              </EventGrid>
            )}
            <ModalActions>
              <SecondaryButton type="button" onClick={() => setModalOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton type="button" onClick={save} disabled={saving || !form.name.trim() || !form.url.trim() || form.events.size === 0}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create endpoint'}
              </PrimaryButton>
            </ModalActions>
          </Modal>
        </Backdrop>
      )}

      </Section>

      {/* event catalog — everything an endpoint can subscribe to */}
      <Section as="div">
        <SectionHeader>
          <h2>Event catalog</h2>
        </SectionHeader>
        <CatalogNote>
          Every event an endpoint can subscribe to. Deliveries are signed
          (<span style={{ fontFamily: 'ui-monospace, monospace' }}>X-Loudin-Signature</span>, HMAC-SHA256 of the raw
          body with the endpoint&apos;s secret) and retried with backoff for up to 6 attempts.
        </CatalogNote>
        <Body>
          {availableEvents.length === 0 ? (
            <div style={{ color: '#94a3b8', padding: 8 }}>Loading…</div>
          ) : (
            <CatalogTable>
              <tbody>
                {availableEvents.map((evt) => (
                  <tr key={evt}>
                    <td className="type">{evt}</td>
                    <td className="desc">{EVENT_DESCRIPTIONS[evt] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </CatalogTable>
          )}
        </Body>
      </Section>

      {/* delete confirm */}
      {deleteTarget && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <Modal>
            <h3><IconAlertTriangle size={16} style={{ verticalAlign: '-2px', marginRight: 6, color: '#b91c1c' }} />Delete endpoint</h3>
            <p style={{ fontSize: 13, color: '#475569' }}>
              Stop delivering events to <strong>{deleteTarget.name}</strong>? Its delivery history is kept for audit.
            </p>
            <ModalActions>
              <SecondaryButton type="button" onClick={() => setDeleteTarget(null)}>Cancel</SecondaryButton>
              <DangerButton type="button" onClick={confirmDelete}><IconTrash size={13} /> Delete</DangerButton>
            </ModalActions>
          </Modal>
        </Backdrop>
      )}
    </>
  );
}
