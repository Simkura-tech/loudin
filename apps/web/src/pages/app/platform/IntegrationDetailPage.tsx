/**
 * IntegrationDetailPage — add / update one integration's credentials.
 *
 * Loads a single integration (GET /api/platform/integrations/:name) and
 * renders its descriptor-defined fields for editing. Fully generic — the
 * label, description, fields, help text, and connection test all come from
 * the server descriptor; nothing here is integration-specific.
 *
 * Values saved here are platform_config overrides; the API server's env vars
 * remain the fallback, and clearing a field reverts to them. Secrets are
 * write-only — the API returns a masked hint, never the stored value.
 *
 * Platform-admin only. Reached from IntegrationsPage.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconAlertTriangle, IconArrowLeft, IconCheck, IconEraser, IconExternalLink,
  IconPlugConnected, IconRefresh,
} from '@tabler/icons-react';
import {
  integrationsApi,
  type IntegrationField,
  type IntegrationInfo,
  type ProbeResult,
  type TestResponse,
} from '../../../services/platform/integrations';

// ── styles ───────────────────────────────────────────────────────────────────
const Page = styled.div`padding: 4px 0 32px; max-width: 820px;`;
const BackLink = styled(Link)`
  display: inline-flex; align-items: center; gap: 5px; font-size: 13px;
  color: ${({ theme }) => theme.colors.text.tertiary}; text-decoration: none; margin-bottom: 12px;
  &:hover { color: ${({ theme }) => theme.colors.text.primary}; }
`;
const HeaderRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  margin-bottom: 8px;
  .title-wrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  h1 { font-size: 20px; font-weight: 650; margin: 0; color: ${({ theme }) => theme.colors.text.primary}; }
`;
const Pill = styled.span<{ $s: 'ok' | 'off' }>`
  padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
  background: ${({ $s }) => ($s === 'ok' ? '#dcfce7' : '#f1f5f9')};
  color:      ${({ $s }) => ($s === 'ok' ? '#166534' : '#475569')};
`;
const Note = styled.p`
  font-size: 13px; color: ${({ theme }) => theme.colors.text.tertiary};
  line-height: 1.5; margin: 4px 0 20px; max-width: 640px;
`;
const DocsLink = styled.a`
  display: inline-flex; align-items: center; gap: 3px;
  color: ${({ theme }) => theme.colors.brand.primary}; text-decoration: none; font-weight: 500;
  &:hover { text-decoration: underline; }
`;
const PrimaryButton = styled.button`
  display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px;
  border-radius: 8px; border: none; background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;
const SecondaryButton = styled.button`
  display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px;
  border-radius: 7px; border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;
const Card = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px; background: ${({ theme }) => theme.colors.background.primary};
  padding: 18px 18px 20px;
`;
const FieldGrid = styled.div`
  display: grid; grid-template-columns: 240px 1fr auto; gap: 12px 14px; align-items: start;
  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;
const FieldMeta = styled.div`
  display: flex; flex-direction: column; gap: 3px; padding-top: 7px;
  .label { font-size: 13px; font-weight: 500; color: ${({ theme }) => theme.colors.text.primary}; }
  .help { font-size: 11px; color: ${({ theme }) => theme.colors.text.tertiary}; line-height: 1.4; }
  .current {
    font-size: 11px; color: ${({ theme }) => theme.colors.text.tertiary};
    display: inline-flex; align-items: center; gap: 6px; margin-top: 1px;
  }
`;
const SourceTag = styled.span<{ $source: 'db' | 'env' | null }>`
  display: inline-block; padding: 1px 6px; border-radius: 5px; font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em;
  background: ${({ theme, $source }) =>
    $source === 'db' ? `${theme.colors.brand.primary}14` : theme.colors.background.secondary};
  color: ${({ theme, $source }) =>
    $source === 'db' ? theme.colors.brand.primary : theme.colors.text.tertiary};
`;
const Input = styled.input`
  height: 34px; padding: 0 10px; border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px; font-family: inherit; width: 100%;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.brand.primary}; }
`;
const FooterRow = styled.div`display: flex; align-items: center; gap: 10px; margin-top: 18px;`;
const SavedFlash = styled.span`
  display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #166534; font-weight: 500;
`;
const ResultBanner = styled.div<{ $ok: boolean }>`
  display: flex; align-items: center; gap: 6px; padding: 10px 12px; margin-bottom: 14px;
  border-radius: 8px; font-size: 13px;
  background: ${({ $ok }) => ($ok ? '#ecfdf5' : '#fef2f2')};
  border: 1px solid ${({ $ok }) => ($ok ? '#a7f3d0' : '#fecaca')};
  color: ${({ $ok }) => ($ok ? '#065f46' : '#991b1b')};
`;
const ErrorBanner = styled.div`
  display: flex; align-items: center; gap: 8px; font-size: 13px; color: #991b1b;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px;
`;

// ── helpers ──────────────────────────────────────────────────────────────────
function currentDisplay(f: IntegrationField): string {
  if (!f.set) return 'not set';
  if (f.secret) return f.hint ?? 'set';
  return f.value ?? '';
}
function describeProbe(r: ProbeResult): string {
  if (r.ok) {
    const bits = ['Connected'];
    if (r.latency_ms != null) bits.push(`in ${r.latency_ms}ms`);
    return bits.join(' ');
  }
  return r.reason === 'not_configured' || r.error === 'not_configured' ? 'Not configured'
    : r.reason === 'bad_credentials' ? `Credentials rejected${r.status != null ? ` (HTTP ${r.status})` : ''}`
    : r.error || r.reason || 'Connection failed';
}
function statusExtras(status: IntegrationInfo['status']): string[] {
  return Object.entries(status)
    .filter(([k, v]) => k !== 'configured' && k !== 'error' && typeof v === 'string' && v !== '')
    .map(([, v]) => v as string);
}

// ── field ────────────────────────────────────────────────────────────────────
interface FieldRowProps {
  f: IntegrationField;
  draftValue: string;
  onChange: (v: string) => void;
  onClear: () => void;
  busy: boolean;
}
function FieldRow({ f, draftValue, onChange, onClear, busy }: FieldRowProps) {
  return (
    <>
      <FieldMeta>
        <span className="label">{f.label}</span>
        {f.help && <span className="help">{f.help}</span>}
        <span className="current">
          {currentDisplay(f)}
          {f.set && <SourceTag $source={f.source}>{f.source === 'db' ? 'override' : 'env'}</SourceTag>}
        </span>
      </FieldMeta>
      <Input
        type={f.secret ? 'password' : 'text'}
        autoComplete="off"
        placeholder={f.placeholder ?? (f.secret ? 'Enter new value to replace' : 'Enter new value to override')}
        value={draftValue}
        onChange={(e) => onChange(e.target.value)}
      />
      <div style={{ paddingTop: 2 }}>
        {f.source === 'db' && (
          <SecondaryButton
            type="button"
            title="Remove the override and fall back to the server environment variable"
            onClick={onClear}
            disabled={busy}
          >
            <IconEraser size={13} /> Clear override
          </SecondaryButton>
        )}
      </div>
    </>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function IntegrationDetailPage() {
  const { name = '' } = useParams();
  const [info, setInfo] = useState<IntegrationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await integrationsApi.get(name);
      setInfo(r.integration);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load this integration');
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => { void load(); }, [load]);

  const dirty = Object.keys(draft).length > 0;
  const setField = (field: string, value: string) => setDraft((d) => ({ ...d, [field]: value }));

  const reload = async () => { await load(); };

  const clearOverride = async (field: string) => {
    setError(null); setSaving(true);
    try {
      await integrationsApi.update(name, { [field]: '' });
      setDraft((d) => { const n = { ...d }; delete n[field]; return n; });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear the override');
    } finally { setSaving(false); }
  };

  const save = async () => {
    setError(null); setSaving(true);
    try {
      await integrationsApi.update(name, draft);
      setDraft({}); setSavedAt(Date.now()); setTestResult(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const runTest = async () => {
    setError(null); setTesting(true); setTestResult(null);
    try {
      setTestResult(await integrationsApi.test(name));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally { setTesting(false); }
  };

  return (
    <Page>
      <BackLink to="/app/platform/integrations"><IconArrowLeft size={15} /> Integrations</BackLink>

      {loading && <Note>Loading…</Note>}

      {!loading && loadError && (
        <ErrorBanner role="alert">
          <IconAlertTriangle size={15} /> {loadError}
          <SecondaryButton type="button" onClick={() => { setLoading(true); void load(); }}>
            <IconRefresh size={13} /> Retry
          </SecondaryButton>
        </ErrorBanner>
      )}

      {!loading && info && (
        <>
          <HeaderRow>
            <div className="title-wrap">
              <h1>{info.label}</h1>
              {info.status.configured ? <Pill $s="ok">configured</Pill> : <Pill $s="off">not configured</Pill>}
              {statusExtras(info.status).map((x) => <Pill key={x} $s="ok">{x}</Pill>)}
            </div>
            <SecondaryButton type="button" onClick={runTest} disabled={testing || saving}>
              <IconPlugConnected size={14} /> {testing ? 'Testing…' : 'Test connection'}
            </SecondaryButton>
          </HeaderRow>

          {(info.description || info.docs_url) && (
            <Note>
              {info.description}
              {info.docs_url && (
                <> {' '}
                  <DocsLink href={info.docs_url} target="_blank" rel="noreferrer">
                    Docs <IconExternalLink size={11} />
                  </DocsLink>
                </>
              )}
            </Note>
          )}

          <Card>
            {error && <ErrorBanner role="alert"><IconAlertTriangle size={14} /> {error}</ErrorBanner>}
            {testResult && (
              <ResultBanner $ok={testResult.api.ok}>
                {testResult.api.ok ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
                {describeProbe(testResult.api)}
              </ResultBanner>
            )}

            <FieldGrid>
              {Object.entries(info.fields).map(([field, f]) => (
                <FieldRow
                  key={field}
                  f={f}
                  draftValue={draft[field] ?? ''}
                  onChange={(v) => setField(field, v)}
                  onClear={() => clearOverride(field)}
                  busy={saving}
                />
              ))}
            </FieldGrid>

            <FooterRow>
              <PrimaryButton type="button" onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </PrimaryButton>
              {savedAt != null && !dirty && (
                <SavedFlash><IconCheck size={13} /> Saved — takes effect immediately</SavedFlash>
              )}
            </FooterRow>
          </Card>
        </>
      )}
    </Page>
  );
}
