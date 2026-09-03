/**
 * FeaturesPage — platform-admin switches for optional product features.
 *
 * One row per feature from GET /api/platform/features; flipping a switch
 * saves immediately (PUT) and refreshes the session's flags so the rest of
 * the app reacts without a reload. Off = the API refuses the feature and
 * the UI hides it, for every company on the platform.
 */

import { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { IconRefresh } from '@tabler/icons-react';
import { platformFeaturesApi, type FeatureInfo, type FeatureKey } from '../../../services/platform/features';
import { useFeatures } from '../../../contexts/FeaturesContext';

const Page = styled.div`padding: 4px 0 32px;`;
const Header = styled.div`
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  margin-bottom: 4px;
  h1 { font-size: 20px; font-weight: 650; margin: 0; color: ${({ theme }) => theme.colors.text.primary}; }
`;
const Intro = styled.p`
  font-size: 13px; color: ${({ theme }) => theme.colors.text.tertiary};
  margin: 4px 0 20px; max-width: 640px; line-height: 1.5;
`;
const List = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.background.primary};
  overflow: hidden;
`;
const RowEl = styled.label<{ $off: boolean }>`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  cursor: pointer;
  &:last-of-type { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }

  .label {
    font-size: 14px; font-weight: 600;
    color: ${({ theme, $off }) => ($off ? theme.colors.text.secondary : theme.colors.text.primary)};
  }
  .desc {
    font-size: 12.5px; line-height: 1.45; margin-top: 2px;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;
const Switch = styled.span<{ $on: boolean; $busy: boolean }>`
  position: relative;
  width: 38px; height: 22px;
  border-radius: 999px;
  background: ${({ theme, $on }) => ($on ? theme.colors.brand.primary : theme.colors.border.medium)};
  opacity: ${({ $busy }) => ($busy ? 0.6 : 1)};
  transition: background 0.15s ease;
  flex: none;

  &::after {
    content: '';
    position: absolute;
    top: 3px; left: ${({ $on }) => ($on ? '19px' : '3px')};
    width: 16px; height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
    transition: left 0.15s ease;
  }
  input {
    position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer;
  }
  input:focus-visible + &,
  &:has(input:focus-visible) {
    outline: 2px solid ${({ theme }) => theme.colors.brand.primary};
    outline-offset: 2px;
  }
`;
const Note = styled.div`
  font-size: 13px; color: ${({ theme }) => theme.colors.text.tertiary};
  padding: 16px; border: 1px dashed ${({ theme }) => theme.colors.border.light}; border-radius: 10px;
`;
const ErrorBanner = styled.div`
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: #991b1b; background: #fef2f2; border: 1px solid #fecaca;
  border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;
  button {
    display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px;
    border-radius: 6px; border: 1px solid #fecaca; background: #fff; color: #991b1b;
    font-size: 12px; font-family: inherit; cursor: pointer;
  }
`;

export default function FeaturesPage() {
  const { reload } = useFeatures();
  const [items, setItems] = useState<FeatureInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<FeatureKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await platformFeaturesApi.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load features');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (f: FeatureInfo) => {
    if (busy) return;
    setBusy(f.key);
    setError(null);
    try {
      setItems(await platformFeaturesApi.update({ [f.key]: !f.enabled }));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <Header><h1>Features</h1></Header>
      <Intro>
        Turn optional features on or off for every company on this platform.
        A feature that is off disappears from the app and the API refuses it,
        so nothing depends on it being hidden. Changes apply within seconds.
      </Intro>

      {loading && <Note>Loading features…</Note>}

      {error && (
        <ErrorBanner role="alert">
          {error}
          <button type="button" onClick={() => { setLoading(true); void load(); }}>
            <IconRefresh size={13} /> Retry
          </button>
        </ErrorBanner>
      )}

      {!loading && items && (
        <List>
          {items.map((f) => (
            <RowEl key={f.key} $off={!f.enabled}>
              <span>
                <span className="label">{f.label}</span>
                <div className="desc">{f.description}</div>
              </span>
              <Switch $on={f.enabled} $busy={busy === f.key}>
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={f.enabled}
                  aria-label={f.label}
                  checked={f.enabled}
                  disabled={busy != null}
                  onChange={() => void toggle(f)}
                />
              </Switch>
            </RowEl>
          ))}
        </List>
      )}
    </Page>
  );
}
