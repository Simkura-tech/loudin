/**
 * PlatformIntegrationsPanel — platform integration settings.
 *
 * Fully registry-driven: renders one card per integration returned by
 * GET /api/platform/integrations (label, description, fields, status all
 * come from the server — no integration-specific code here). To add an
 * integration, register a descriptor on the API side; see
 * docs/integrations/adding-an-integration.md.
 *
 * Rendered inside the "API access" page (platform-admin only). Values saved
 * here are platform_config overrides; the server's env vars remain the
 * fallback, and clearing a field reverts to them. Secrets are write-only —
 * the API returns a masked hint, never the stored value.
 */

import { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconAlertTriangle, IconCheck, IconEraser, IconExternalLink, IconPlugConnected, IconRefresh,
} from '@tabler/icons-react';
import {
  integrationsApi,
  type IntegrationField,
  type IntegrationInfo,
  type ProbeResult,
  type TestResponse,
} from '../../services/platform/integrations';

// ── styles (match PlatformWebhooksPanel) ─────────────────────────────────────
const Section = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.background.primary};
  margin-bottom: 16px;
  overflow: hidden;
`;
const SectionHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  h2 {
    font-size: 13px; font-weight: 600; letter-spacing: 0.03em;
    text-transform: uppercase; color: ${({ theme }) => theme.colors.text.tertiary}; margin: 0;
  }
  .title-wrap { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .actions { display: flex; gap: 8px; }
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
const Pill = styled.span<{ $s: 'ok' | 'warn' | 'off' }>`
  display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
  background: ${({ $s }) => ($s === 'ok' ? '#dcfce7' : $s === 'warn' ? '#fef9c3' : '#f1f5f9')};
  color:      ${({ $s }) => ($s === 'ok' ? '#166534' : $s === 'warn' ? '#854d0e' : '#475569')};
`;
const SourceTag = styled.span<{ $source: 'db' | 'env' | null }>`
  display: inline-block; padding: 1px 6px; border-radius: 5px; font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em;
  background: ${({ theme, $source }) =>
    $source === 'db' ? `${theme.colors.brand.primary}14` : theme.colors.background.secondary};
  color: ${({ theme, $source }) =>
    $source === 'db' ? theme.colors.brand.primary : theme.colors.text.tertiary};
`;
const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: 220px 1fr auto;
  gap: 8px 12px;
  align-items: center;

  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;
const FieldMeta = styled.div`
  display: flex; flex-direction: column; gap: 3px;
  .label { font-size: 13px; font-weight: 500; color: ${({ theme }) => theme.colors.text.primary}; }
  .help { font-size: 11px; color: ${({ theme }) => theme.colors.text.tertiary}; line-height: 1.4; }
  .current {
    font-size: 11px; color: ${({ theme }) => theme.colors.text.tertiary};
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-all;
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  }
`;
const Input = styled.input`
  height: 34px; padding: 0 10px; border-radius: 8px; font-size: 13px; font-family: inherit;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  width: 100%;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.brand.primary}; }
  &::placeholder { color: ${({ theme }) => theme.colors.text.tertiary}; }
`;
const Note = styled.p`
  font-size: 12px; color: ${({ theme }) => theme.colors.text.tertiary};
  margin: 0 0 14px; line-height: 1.5;
`;
const DocsLink = styled.a`
  display: inline-flex; align-items: center; gap: 2px;
  color: ${({ theme }) => theme.colors.brand.primary};
  text-decoration: none; font-weight: 500;
  &:hover { text-decoration: underline; }
`;
const ErrorBanner = styled.div`
  padding: 10px 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca;
  color: #991b1b; font-size: 13px; margin-bottom: 12px;
`;
const ResultBanner = styled.div<{ $ok: boolean }>`
  display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; margin-bottom: 12px;
  border-radius: 8px; font-size: 13px;
  background: ${({ $ok }) => ($ok ? '#ecfdf5' : '#fef2f2')};
  border: 1px solid ${({ $ok }) => ($ok ? '#a7f3d0' : '#fecaca')};
  color: ${({ $ok }) => ($ok ? '#065f46' : '#991b1b')};
  .line { display: flex; align-items: center; gap: 6px; }
`;
const SavedFlash = styled.span`
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; color: #166534; font-weight: 500;
`;
const FooterRow = styled.div`
  display: flex; align-items: center; gap: 10px; margin-top: 14px;
`;

// ── helpers ──────────────────────────────────────────────────────────────────

function describeProbe(label: string, r: ProbeResult): string {
  if (r.ok) {
    const bits = [`${label}: connected`];
    if (r.latency_ms != null) bits.push(`in ${r.latency_ms}ms`);
    return bits.join(' ');
  }
  const why =
    r.reason === 'not_configured' || r.error === 'not_configured' ? 'not configured' :
    r.reason === 'bad_credentials' ? `credentials rejected${r.status != null ? ` (HTTP ${r.status})` : ''}` :
    r.error || r.reason || 'failed';
  return `${label}: ${why}`;
}

/** Display-ready extras a descriptor put in its status (e.g. auth mode). */
function statusExtras(status: IntegrationInfo['status']): string[] {
  return Object.entries(status)
    .filter(([key, v]) => key !== 'configured' && key !== 'error' && typeof v === 'string' && v !== '')
    .map(([, v]) => v as string);
}

function currentDisplay(f: IntegrationField): string {
  if (!f.set) return 'not set';
  if (f.secret) return f.hint ?? 'set';
  return f.value ?? '';
}

// ── card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  info: IntegrationInfo;
  onSaved: () => void;
}

function IntegrationCard({ info, onSaved }: CardProps) {
  const name = info.name;
  const [draft, setDraft]         = useState<Record<string, string>>({});
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [savedAt, setSavedAt]     = useState<number | null>(null);

  const dirty = Object.keys(draft).length > 0;

  const setField = (field: string, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const clearOverride = async (field: string) => {
    setError(null);
    setSaving(true);
    try {
      await integrationsApi.update(name, { [field]: '' });
      setDraft((d) => {
        const next = { ...d };
        delete next[field];
        return next;
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear the override');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await integrationsApi.update(name, draft);
      setDraft({});
      setSavedAt(Date.now());
      setTestResult(null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setError(null);
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await integrationsApi.test(name));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const status = info.status;

  return (
    <Section>
      <SectionHeader>
        <div className="title-wrap">
          <h2>{info.label}</h2>
          {status.configured
            ? <Pill $s="ok">configured</Pill>
            : <Pill $s="off">not configured</Pill>}
          {statusExtras(status).map((extra) => (
            <Pill key={extra} $s="ok">{extra}</Pill>
          ))}
        </div>
        <div className="actions">
          <SecondaryButton type="button" onClick={runTest} disabled={testing || saving}>
            <IconPlugConnected size={14} />
            {testing ? 'Testing…' : 'Test connection'}
          </SecondaryButton>
        </div>
      </SectionHeader>
      <Body>
        {(info.description || info.docs_url) && (
          <Note>
            {info.description}
            {info.docs_url && (
              <>
                {' '}
                <DocsLink href={info.docs_url} target="_blank" rel="noreferrer">
                  Docs <IconExternalLink size={11} />
                </DocsLink>
              </>
            )}
          </Note>
        )}

        {error && <ErrorBanner role="alert"><IconAlertTriangle size={14} style={{ verticalAlign: '-2px' }} /> {error}</ErrorBanner>}

        {testResult && (
          <ResultBanner $ok={testResult.api.ok}>
            <span className="line">
              {testResult.api.ok ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
              {describeProbe('API', testResult.api)}
            </span>
          </ResultBanner>
        )}

        <FieldGrid>
          {Object.entries(info.fields).map(([field, f]) => (
            <FieldRow
              key={field}
              field={field}
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
      </Body>
    </Section>
  );
}

interface FieldRowProps {
  field: string;
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
      <div>
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

// ── panel ────────────────────────────────────────────────────────────────────

export function PlatformIntegrationsPanel() {
  const [data, setData]       = useState<IntegrationInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await integrationsApi.list();
      setData(r.integrations);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load integration settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Note>Loading integration settings…</Note>;
  if (error || !data) {
    return (
      <ErrorBanner role="alert">
        {error ?? 'Could not load integration settings'}
        {' '}
        <SecondaryButton type="button" onClick={() => { setLoading(true); void load(); }}>
          <IconRefresh size={13} /> Retry
        </SecondaryButton>
      </ErrorBanner>
    );
  }

  return (
    <>
      <Note>
        Values saved here are stored in the platform database and take
        precedence over the API server&apos;s environment variables. Clearing an
        override falls back to the env var. Secrets are write-only — once
        saved, only the last four characters are shown.
      </Note>
      {data.map((info) => (
        <IntegrationCard key={info.name} info={info} onSaved={load} />
      ))}
    </>
  );
}

export default PlatformIntegrationsPanel;
