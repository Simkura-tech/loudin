/**
 * AddDeviceModal — claim flow for the end-user Devices page.
 *
 * Two-step:
 *   1. Suffix search — user types 3–6 chars of the hardware id; we hit
 *      GET /api/devices/unclaimed and show matches in a small list.
 *   2. Naming + confirm — clicking a match swaps to a form with a required
 *      device_name field; submit hits POST /api/devices/claim.
 *
 * Debounced (220ms) so each keystroke doesn't hammer the search endpoint.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconArrowLeft,
  IconCheck,
  IconDeviceUnknown,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { devicesApi, type UnclaimedDevice } from '../../services/access/devices';

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
  max-width: 480px;
  background: ${({ theme }) => theme.colors.background.primary};
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  max-height: min(80vh, 600px);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  h2 { font-size: 15px; font-weight: 600; margin: 0; display: inline-flex; align-items: center; gap: 8px; }
`;

const Body = styled.div`
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const SearchWrap = styled.div`
  position: relative;

  .icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  input {
    width: 100%;
    height: 36px;
    padding: 0 10px 0 32px;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.border.light};
    background: ${({ theme }) => theme.colors.background.primary};
    color: ${({ theme }) => theme.colors.text.primary};
    font-size: 14px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.05em;

    &:focus {
      outline: none;
      border-color: ${({ theme }) => theme.colors.brand.primary};
      box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
    }
  }
`;

const Hint = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const Results = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 8px;
  overflow: hidden;
  max-height: 280px;
  overflow-y: auto;
`;

const ResultItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};

  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }

  .serial {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  .meta {
    font-size: 11px;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const EmptyState = styled.div`
  padding: 24px 12px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 13px;

  .crest {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.tertiary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
  }
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Input = styled.input`
  height: 36px;
  padding: 0 10px;
  border-radius: 7px;
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

const SerialBox = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background.secondary};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.primary};
  word-break: break-all;
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

const SecondaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 36px;
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

const IconButton = styled.button`
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

const ErrorAlert = styled.div`
  padding: 8px 10px;
  border-radius: 7px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 12px;
`;

interface Props {
  onClose: () => void;
  onClaimed?: () => void;
}

export function AddDeviceModal({ onClose, onClaimed }: Props) {
  const [suffix, setSuffix] = useState('');
  const [results, setResults] = useState<UnclaimedDevice[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<UnclaimedDevice | null>(null);
  const [name, setName] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const debounceTimer = useRef<number | null>(null);

  const runSearch = useCallback(async (s: string) => {
    if (s.length < 3) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const r = await devicesApi.searchUnclaimed(s);
      setResults(r.devices);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (selected) return;
    if (debounceTimer.current != null) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => runSearch(suffix), 220);
    return () => {
      if (debounceTimer.current != null) window.clearTimeout(debounceTimer.current);
    };
  }, [suffix, selected, runSearch]);

  const onPick = (d: UnclaimedDevice) => {
    setSelected(d);
    setName(d.device_id.slice(-6));
    setClaimError(null);
  };

  const onBack = () => {
    setSelected(null);
    setClaimError(null);
  };

  const onClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setClaimError('Please enter a name for this device.');
      return;
    }
    setClaiming(true);
    setClaimError(null);
    try {
      await devicesApi.claim({ device_id: selected.device_id, device_name: trimmed });
      onClaimed?.();
      onClose();
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog>
        <Header>
          <h2>
            {selected
              ? <><IconCheck size={16} /> Name your device</>
              : <>Add device</>}
          </h2>
          <IconButton type="button" onClick={onClose}><IconX size={16} /></IconButton>
        </Header>

        {!selected ? (
          <Body>
            <Hint>Enter the last 3–6 characters of the device&apos;s hardware ID.</Hint>
            <SearchWrap>
              <IconSearch className="icon" size={16} />
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                autoFocus
                maxLength={6}
                placeholder="e.g. 15e6c8"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value.trim())}
              />
            </SearchWrap>

            {searchError && <ErrorAlert role="alert">{searchError}</ErrorAlert>}

            {suffix.length < 3 ? (
              <EmptyState>
                <div className="crest"><IconSearch size={18} /></div>
                <div>Type at least 3 characters to start searching.</div>
              </EmptyState>
            ) : searching ? (
              <Hint>Searching…</Hint>
            ) : results.length === 0 ? (
              <EmptyState>
                <div className="crest"><IconDeviceUnknown size={18} /></div>
                <div>No unclaimed devices end with &ldquo;{suffix}&rdquo;.</div>
              </EmptyState>
            ) : (
              <Results>
                {results.map((d) => (
                  <ResultItem key={d.device_id} onClick={() => onPick(d)}>
                    <span className="serial">{d.device_id}</span>
                    <span className="meta">
                      {d.device_type}
                      {d.firmware_version ? ` · fw ${d.firmware_version}` : ''}
                    </span>
                  </ResultItem>
                ))}
              </Results>
            )}
          </Body>
        ) : (
          <Body as="form" onSubmit={onClaim}>
            <Hint>This device will be added to your company once you claim it.</Hint>
            <SerialBox>{selected.device_id}</SerialBox>

            <Field>
              <FieldLabel>Device name</FieldLabel>
              <Input
                type="text"
                autoFocus
                required
                maxLength={255}
                placeholder="e.g. Front Door"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            {claimError && <ErrorAlert role="alert">{claimError}</ErrorAlert>}
          </Body>
        )}

        <Footer>
          {selected ? (
            <>
              <SecondaryButton type="button" onClick={onBack} disabled={claiming}>
                <IconArrowLeft size={14} />
                Back
              </SecondaryButton>
              <PrimaryButton type="button" onClick={onClaim} disabled={claiming || !name.trim()}>
                {claiming ? 'Claiming…' : 'Claim device'}
              </PrimaryButton>
            </>
          ) : (
            <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          )}
        </Footer>
      </Dialog>
    </Backdrop>
  );
}

export default AddDeviceModal;
