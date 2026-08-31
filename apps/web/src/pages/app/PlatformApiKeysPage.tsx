/**
 * PlatformApiKeysPage — platform admin's API key mgmt + integration docs.
 *
 * Two sections:
 *   1. Keys table — create / list / revoke. The plaintext is shown ONCE
 *      after creation (copy-to-clipboard, never persisted).
 *   2. Integration guide — auth header, base URL, scope catalog, a curl
 *      example. Inline so integrators have one page to bookmark.
 *
 * Platform-admin only (route is in the platform-admin sidebar branch).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconKey,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import {
  apiKeysApi,
  type ApiKey,
  type CreateApiKeyResponse,
} from '../../services/platform/apiKeys';
import {
  groupCatalogByScope,
  curlFor,
  SCOPE_DESCRIPTIONS,
  type ApiEndpoint,
  type HttpMethod,
  type EndpointStatus,
} from './apiCatalog';
import PlatformWebhooksPanel from './PlatformWebhooksPanel';
import PlatformIntegrationsPanel from './PlatformIntegrationsPanel';
import { branding } from '../../branding';

// ── Layout ───────────────────────────────────────────────────────────────────

const PageHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 16px;

  h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
  .sub { color: ${({ theme }) => theme.colors.text.secondary}; font-size: 13px; }
`;

const TabBar = styled.div`
  display: flex;
  gap: 4px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  margin-bottom: 16px;
`;

const TabButton = styled.button<{ $active: boolean }>`
  appearance: none;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
  color: ${({ theme, $active }) => ($active ? theme.colors.text.primary : theme.colors.text.tertiary)};
  border-bottom: 2px solid ${({ theme, $active }) => ($active ? theme.colors.brand.primary : 'transparent')};
  margin-bottom: -1px;
  &:hover { color: ${({ theme }) => theme.colors.text.primary}; }
`;

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

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const DangerButton = styled(SecondaryButton)`
  color: #b91c1c;
  border-color: #fecaca;
  &:hover { background: #fef2f2; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  thead th {
    text-align: left;
    padding: 9px 14px;
    background: ${({ theme }) => theme.colors.background.secondary};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  }
  tbody td {
    padding: 10px 14px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
    vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr.revoked td { opacity: 0.55; }

  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .scope-chips { display: flex; flex-wrap: wrap; gap: 4px; }
`;

const ScopeChip = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.brand.primary}14;
  color: ${({ theme }) => theme.colors.brand.primary};
  font-size: 11px;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
`;

const StatusPill = styled.span<{ $status: 'active' | 'revoked' }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $status }) => ($status === 'active' ? '#dcfce7' : '#f1f5f9')};
  color:      ${({ $status }) => ($status === 'active' ? '#166534' : '#475569')};
`;

const Empty = styled.div`
  padding: 32px 16px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 13px;
  .title { font-weight: 600; color: ${({ theme }) => theme.colors.text.primary}; margin-bottom: 4px; }
`;

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  margin: 0 16px 12px;
`;

// ── Modal pieces ─────────────────────────────────────────────────────────────

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
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const IconBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Input = styled.input`
  height: 36px;
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

const ScopePicker = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.border.light};
    cursor: pointer;
    font-size: 13px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;

    &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
    input { accent-color: ${({ theme }) => theme.colors.brand.primary}; }
  }
`;

const TokenBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  word-break: break-all;
`;

const InfoBanner = styled.div<{ $tone: 'warn' | 'info' }>`
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  background: ${({ $tone }) => ($tone === 'warn' ? '#fef3c7' : '#f1f5f9')};
  border: 1px solid ${({ $tone }) => ($tone === 'warn' ? '#fde68a' : '#e2e8f0')};
  color: ${({ $tone }) => ($tone === 'warn' ? '#92400e' : '#475569')};
`;

// ── Docs ─────────────────────────────────────────────────────────────────────

const DocsBlock = styled.div`
  font-size: 13px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.text.primary};

  h3 {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin: 18px 0 8px;
  }
  h3:first-of-type { margin-top: 0; }

  code, pre {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    background: ${({ theme }) => theme.colors.background.secondary};
    border-radius: 4px;
    padding: 0 4px;
  }
  pre {
    padding: 10px 12px;
    margin: 6px 0 0;
    overflow-x: auto;
    border: 1px solid ${({ theme }) => theme.colors.border.light};
  }

  .scope-grid {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 6px 16px;
    margin-top: 6px;

    .scope { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .desc  { font-size: 13px; color: ${({ theme }) => theme.colors.text.secondary}; }
  }
`;

// ── Catalog visuals ──────────────────────────────────────────────────────────

const ScopeBlock = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
  background: ${({ theme }) => theme.colors.background.primary};
`;

const ScopeHead = styled.div`
  padding: 10px 12px;
  background: ${({ theme }) => theme.colors.background.secondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};

  .row { display: flex; align-items: center; gap: 10px; }
  .name {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-weight: 600;
    font-size: 13px;
    color: ${({ theme }) => theme.colors.brand.primary};
  }
  .count {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.background.primary};
    color: ${({ theme }) => theme.colors.text.secondary};
    border: 1px solid ${({ theme }) => theme.colors.border.light};
  }
  .desc {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.secondary};
    margin-top: 4px;
  }
`;

const EndpointRow = styled.button<{ $open: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme, $open }) => ($open ? theme.colors.background.secondary : theme.colors.background.primary)};
  text-align: left;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
  &:last-of-type { border-bottom: none; }

  .chev { color: ${({ theme }) => theme.colors.text.tertiary}; flex-shrink: 0; }
  .path {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  .summary {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    flex-shrink: 0;
    display: none;
  }
  @media (min-width: 720px) { .summary { display: block; } }
`;

const MethodBadge = styled.span<{ $m: HttpMethod }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 2px 8px;
  border-radius: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: ${({ $m }) =>
      $m === 'GET'    ? '#dbeafe'
    : $m === 'POST'   ? '#dcfce7'
    : $m === 'PATCH'  ? '#fef3c7'
    : /* DELETE */      '#fee2e2'};
  color: ${({ $m }) =>
      $m === 'GET'    ? '#1e40af'
    : $m === 'POST'   ? '#166534'
    : $m === 'PATCH'  ? '#92400e'
    : /* DELETE */      '#991b1b'};
`;

const StatusBadge = styled.span<{ $s: EndpointStatus }>`
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: ${({ $s }) => ($s === 'live' ? '#dcfce7' : '#f1f5f9')};
  color:      ${({ $s }) => ($s === 'live' ? '#166534' : '#475569')};
`;

const EndpointDetail = styled.div`
  padding: 12px 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};

  &:last-child { border-bottom: none; }

  h4 {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin: 14px 0 6px;
  }
  h4:first-of-type { margin-top: 6px; }

  p { margin: 0 0 8px; font-size: 13px; line-height: 1.55; color: ${({ theme }) => theme.colors.text.primary}; }

  pre {
    margin: 0;
    padding: 10px 12px;
    border-radius: 7px;
    background: ${({ theme }) => theme.colors.background.secondary};
    border: 1px solid ${({ theme }) => theme.colors.border.light};
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    line-height: 1.45;
    overflow-x: auto;
  }
`;

const FieldTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th {
    text-align: left;
    padding: 6px 10px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.tertiary};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
    font-size: 11px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  td {
    padding: 6px 10px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
    vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }
  .name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .type { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: ${({ theme }) => theme.colors.text.secondary}; }
  .req  { font-size: 11px; color: #b45309; font-weight: 600; }
`;

const CopyButtonInline = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  border-radius: 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year',    365 * 24 * 3600 * 1000],
    ['month',    30 * 24 * 3600 * 1000],
    ['day',           24 * 3600 * 1000],
    ['hour',               3600 * 1000],
    ['minute',               60 * 1000],
    ['second',                    1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

// ── Endpoint catalog renderer ────────────────────────────────────────────────

function endpointKey(e: ApiEndpoint): string { return `${e.method} ${e.path}`; }

function FieldList({ rows, label }: { rows: ApiEndpoint['body']; label: string }) {
  if (!rows || rows.length === 0) return null;
  return (
    <>
      <h4>{label}</h4>
      <FieldTable>
        <thead>
          <tr><th>Name</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.name}>
              <td>
                <span className="name">{f.name}</span>
                {f.required && <> <span className="req">required</span></>}
              </td>
              <td><span className="type">{f.type}</span></td>
              <td>{f.description}</td>
            </tr>
          ))}
        </tbody>
      </FieldTable>
    </>
  );
}

function CatalogSection({ baseUrl }: { baseUrl: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const grouped = useMemo(() => groupCatalogByScope(), []);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <>
      {grouped.map(({ scope, endpoints }) => (
        <ScopeBlock key={scope}>
          <ScopeHead>
            <div className="row">
              <span className="name">{scope}</span>
              <span className="count">{endpoints.length} {endpoints.length === 1 ? 'endpoint' : 'endpoints'}</span>
            </div>
            <div className="desc">{SCOPE_DESCRIPTIONS[scope] ?? '—'}</div>
          </ScopeHead>
          {endpoints.map((ep) => {
            const k = endpointKey(ep);
            const isOpen = open.has(k);
            const curl = curlFor(ep, baseUrl);
            return (
              <div key={k}>
                <EndpointRow type="button" $open={isOpen} onClick={() => toggle(k)}>
                  {isOpen
                    ? <IconChevronDown  className="chev" size={14} />
                    : <IconChevronRight className="chev" size={14} />}
                  <MethodBadge $m={ep.method}>{ep.method}</MethodBadge>
                  <span className="path">{ep.path}</span>
                  <span className="summary">{ep.summary}</span>
                  <StatusBadge $s={ep.status}>{ep.status}</StatusBadge>
                </EndpointRow>
                {isOpen && (
                  <EndpointDetail>
                    <p>{ep.description}</p>
                    <FieldList rows={ep.pathParams}  label="Path params" />
                    <FieldList rows={ep.queryParams} label="Query params" />
                    <FieldList rows={ep.body}        label="Request body" />
                    {ep.responseExample != null && (
                      <>
                        <h4>Response (example)</h4>
                        <pre>{JSON.stringify(ep.responseExample, null, 2)}</pre>
                      </>
                    )}
                    <h4 style={{ display: 'flex', alignItems: 'center' }}>
                      curl
                      <CopyButtonInline type="button" onClick={() => copy(`curl-${k}`, curl)}>
                        {copied === `curl-${k}` ? <><IconCheck size={11} /> Copied</> : <><IconCopy size={11} /> Copy</>}
                      </CopyButtonInline>
                    </h4>
                    <pre>{curl}</pre>
                    {ep.notes && (
                      <>
                        <h4>Notes</h4>
                        <p>{ep.notes}</p>
                      </>
                    )}
                  </EndpointDetail>
                )}
              </div>
            );
          })}
        </ScopeBlock>
      ))}
    </>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function PlatformApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await apiKeysApi.list();
      setKeys(r.keys);
      setAvailableScopes(r.available_scopes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
      setKeys([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setNewName('');
    setNewScopes(availableScopes.includes('ping') ? ['ping'] : []);
    setCreated(null);
    setTokenCopied(false);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreated(null);
    setTokenCopied(false);
  };

  const toggleScope = (s: string) =>
    setNewScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const r = await apiKeysApi.create({ name: newName.trim(), scopes: newScopes });
      setCreated(r);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create key');
    } finally {
      setCreating(false);
    }
  };

  const copyToken = async () => {
    if (!created?.token) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setTokenCopied(true);
      window.setTimeout(() => setTokenCopied(false), 2500);
    } catch {
      /* clipboard unavailable; ignore */
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await apiKeysApi.revoke(revokeTarget.id);
      setRevokeTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke key');
    } finally {
      setRevoking(false);
    }
  };

  const apiBaseHint = useMemo(() => {
    // Best-effort: use window.location.origin for the docs since the API
    // runs behind the same host in dev. Production deployers will swap
    // this for their real public origin in the docs prose below if needed.
    if (typeof window !== 'undefined') return window.location.origin;
    return 'https://api.example.com';
  }, []);

  const [tab, setTab] = useState<'rest' | 'webhooks' | 'integrations'>('rest');

  return (
    <>
      <PageHeader>
        <h1>API access &amp; webhooks</h1>
        <div className="sub">
          Mint and manage API keys for 3rd-party integrations, register
          outbound webhook endpoints, and configure the Simkura connections.
          All of it is platform-scoped — anyone holding a key or receiving
          events acts on behalf of the {branding.productName} platform.
        </div>
      </PageHeader>

      <TabBar>
        <TabButton type="button" $active={tab === 'rest'} onClick={() => setTab('rest')}>REST API</TabButton>
        <TabButton type="button" $active={tab === 'webhooks'} onClick={() => setTab('webhooks')}>Webhooks</TabButton>
        <TabButton type="button" $active={tab === 'integrations'} onClick={() => setTab('integrations')}>Integrations</TabButton>
      </TabBar>

      {tab === 'rest' && (
      <>
      <Section>
        <SectionHeader>
          <h2>Keys</h2>
          <PrimaryButton type="button" onClick={openCreate}>
            <IconPlus size={14} /> Create key
          </PrimaryButton>
        </SectionHeader>
        {error && <ErrorBanner role="alert">{error}</ErrorBanner>}
        {keys === null ? (
          <SectionBody style={{ color: '#94a3b8' }}>Loading…</SectionBody>
        ) : keys.length === 0 ? (
          <Empty>
            <div className="title">No API keys yet</div>
            <div>Create one to let a 3rd-party service call the {branding.productName} platform API.</div>
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Scopes</th>
                <th>Status</th>
                <th>Last used</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className={k.status === 'revoked' ? 'revoked' : ''}>
                  <td><strong>{k.name}</strong></td>
                  <td className="mono">{k.prefix}…</td>
                  <td>
                    <div className="scope-chips">
                      {k.scopes.map((s) => <ScopeChip key={s}>{s}</ScopeChip>)}
                    </div>
                  </td>
                  <td><StatusPill $status={k.status}>{k.status}</StatusPill></td>
                  <td><span style={{ color: '#94a3b8' }}>{relativeTime(k.last_used_at)}</span></td>
                  <td><span style={{ color: '#94a3b8' }}>{relativeTime(k.created_at)}</span></td>
                  <td>
                    {k.status === 'active' && (
                      <DangerButton type="button" onClick={() => setRevokeTarget(k)} title="Revoke">
                        <IconTrash size={13} /> Revoke
                      </DangerButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* ── Integration guide ───────────────────────────────────────────────── */}
      <Section>
        <SectionHeader><h2>Integration guide</h2></SectionHeader>
        <SectionBody>
          <DocsBlock>
            <h3>Base URL</h3>
            <code>{apiBaseHint}/api/external</code>
            <p style={{ marginTop: 6, color: '#64748b', fontSize: 12 }}>
              In production, swap this for the public origin of your {branding.productName} deployment.
            </p>

            <h3>Authentication</h3>
            Every request must include the API key as a bearer token:
            <pre>{`Authorization: Bearer ldn_live_…`}</pre>
            The full plaintext is shown <strong>only at creation time</strong>. Store it in
            your integrating service&apos;s secret manager — once the create dialog closes,
            we can&apos;t show it again.

            <h3>Errors</h3>
            <ul style={{ paddingLeft: 20, margin: 0, color: '#475569' }}>
              <li><code>401</code> — missing, malformed, or revoked key</li>
              <li><code>403</code> — key is valid but lacks the required scope for that endpoint</li>
              <li><code>404</code> — resource not found (still authenticated)</li>
              <li><code>5xx</code> — retry with exponential backoff</li>
            </ul>
          </DocsBlock>
        </SectionBody>
      </Section>

      {/* ── Endpoint catalog ────────────────────────────────────────────────── */}
      <Section>
        <SectionHeader>
          <h2>Endpoints</h2>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            Click a row to expand. <StatusBadge $s="live">live</StatusBadge> means wired and callable;{' '}
            <StatusBadge $s="planned">planned</StatusBadge> means the contract is committed, route lands soon.
          </span>
        </SectionHeader>
        <SectionBody>
          <CatalogSection baseUrl={apiBaseHint} />
          <p style={{ marginTop: 16, fontSize: 12, color: '#64748b' }}>
            Need a new endpoint? Open an issue on the project repository with what
            you&apos;d like to read or write.
          </p>
        </SectionBody>
      </Section>
      </>
      )}

      {tab === 'webhooks' && (
      <>
      {/* ── Webhook endpoints ───────────────────────────────────────────────── */}
      <PlatformWebhooksPanel />

      {/* ── Webhook integration guide ──────────────────────────────────────── */}
      <Section>
        <SectionHeader><h2>Integration guide</h2></SectionHeader>
        <SectionBody>
          <DocsBlock>
            <h3>How it works</h3>
            <p style={{ marginTop: 0, color: '#475569' }}>
              When a subscribed event fires, {branding.productName} POSTs a signed JSON envelope to your
              endpoint URL. Delivery is retried automatically (30s → 2m → 10m → 1h → 6h, up
              to 6 attempts) and every attempt is recorded in the endpoint&apos;s delivery log above.
            </p>

            <h3>Headers</h3>
            {/* X-Loudin-* header names are part of the API wire protocol
                (sent by apps/api), not display branding — do not rebrand. */}
            <ul style={{ paddingLeft: 20, margin: 0, color: '#475569' }}>
              <li><code>X-Loudin-Event</code> — the event type</li>
              <li><code>X-Loudin-Event-Id</code> — stable UUID; use it as your idempotency key</li>
              <li><code>X-Loudin-Delivery</code> — per-endpoint delivery id</li>
              <li><code>X-Loudin-Signature</code> — <code>sha256=&lt;hex&gt;</code>, HMAC-SHA256 of the raw body</li>
            </ul>

            <h3>Verifying the signature</h3>
            Compute the HMAC over the <strong>raw</strong> request body with the endpoint&apos;s secret,
            and compare against the header:
            <pre>{`const expected = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(rawBody)      // raw bytes, before JSON parsing
  .digest('hex');
// crypto.timingSafeEqual(expected, header)`}</pre>
            Respond <code>2xx</code> to acknowledge. Any non-2xx, or a timeout (5s), is treated
            as a failure and retried.

            <h3>Events</h3>
            <ul style={{ paddingLeft: 20, margin: 0, color: '#475569' }}>
              <li><code>device.added</code> / <code>device.removed</code> — a device is claimed / released</li>
              <li><code>company.signed_up</code> — a company self-registers</li>
            </ul>
          </DocsBlock>
        </SectionBody>
      </Section>
      </>
      )}

      {tab === 'integrations' && (
      <>
      {/* ── Simkura-core connection settings ───────────────────────────────── */}
      <PlatformIntegrationsPanel />
      </>
      )}

      {/* ── Create modal ─────────────────────────────────────────────────── */}
      {createOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) closeCreate(); }}>
          <Dialog>
            <DialogHeader>
              <h2>{created ? 'Key created' : 'New API key'}</h2>
              <IconBtn type="button" onClick={closeCreate}><IconX size={16} /></IconBtn>
            </DialogHeader>
            {!created ? (
              <form onSubmit={submitCreate}>
                <DialogBody>
                  <Field>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      type="text"
                      autoFocus
                      placeholder={`e.g. ${branding.productName} CRM (prod)`}
                      maxLength={120}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Scopes</FieldLabel>
                    <ScopePicker>
                      {availableScopes.map((s) => (
                        <label key={s}>
                          <input
                            type="checkbox"
                            checked={newScopes.includes(s)}
                            onChange={() => toggleScope(s)}
                          />
                          {s}
                        </label>
                      ))}
                    </ScopePicker>
                  </Field>
                  <InfoBanner $tone="info">
                    <IconKey size={14} />
                    The full token is shown <strong>once</strong>. Copy it into the receiving
                    service&apos;s secret store right away — we don&apos;t keep a recoverable copy.
                  </InfoBanner>
                </DialogBody>
                <DialogFooter>
                  <SecondaryButton type="button" onClick={closeCreate}>Cancel</SecondaryButton>
                  <PrimaryButton
                    type="submit"
                    disabled={creating || !newName.trim() || newScopes.length === 0}
                  >
                    {creating ? 'Creating…' : 'Create key'}
                  </PrimaryButton>
                </DialogFooter>
              </form>
            ) : (
              <>
                <DialogBody>
                  <InfoBanner $tone="warn">
                    <IconAlertTriangle size={14} />
                    Copy this token now. After you close this dialog we cannot show it again.
                  </InfoBanner>
                  <TokenBox>
                    <span style={{ flex: 1 }}>{created.token}</span>
                    <SecondaryButton type="button" onClick={copyToken}>
                      {tokenCopied ? <><IconCheck size={13} /> Copied</> : <><IconCopy size={13} /> Copy</>}
                    </SecondaryButton>
                  </TokenBox>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    <strong>{created.key.name}</strong> · scopes:{' '}
                    {created.key.scopes.map((s, i) => (
                      <span key={s}>
                        <code style={{ fontSize: 11 }}>{s}</code>
                        {i < created.key.scopes.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                </DialogBody>
                <DialogFooter>
                  <PrimaryButton type="button" onClick={closeCreate}>I&apos;ve saved it</PrimaryButton>
                </DialogFooter>
              </>
            )}
          </Dialog>
        </Backdrop>
      )}

      {/* ── Revoke confirm ───────────────────────────────────────────────── */}
      {revokeTarget && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setRevokeTarget(null); }}>
          <Dialog style={{ maxWidth: 420 }}>
            <DialogHeader>
              <h2>Revoke API key</h2>
              <IconBtn type="button" onClick={() => setRevokeTarget(null)}><IconX size={16} /></IconBtn>
            </DialogHeader>
            <DialogBody>
              Revoke <strong>{revokeTarget.name}</strong>? Any integration using this token
              will start getting <code>401</code>s immediately. This can&apos;t be undone —
              create a new key if you need to restore access.
            </DialogBody>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setRevokeTarget(null)}>Cancel</SecondaryButton>
              <DangerButton type="button" onClick={confirmRevoke} disabled={revoking}>
                {revoking ? 'Revoking…' : <><IconTrash size={13} /> Revoke</>}
              </DangerButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}
    </>
  );
}

export default PlatformApiKeysPage;
