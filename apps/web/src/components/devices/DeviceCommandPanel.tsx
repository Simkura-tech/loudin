/**
 * DeviceCommandPanel — the command surface for the Device Testing bench.
 *
 * A flat, declarative list of preset test commands. Each row is one named
 * action with a matching button; the payload is fixed per row so testing is
 * one click. Every command maps to the backend allowlist
 * (apps/api/controllers/access/deviceCommands.js → ALLOWED_COMMANDS):
 * the four v2 operations lock.unlock / lock.set-state / lock.configure /
 * device.reboot.
 *
 * Commands forward to Simkura immediately (202 = queued); the device acts
 * on its next check-in and reports back via webhook. We show the queued-
 * command record here.
 *
 * Data-record commands (credentials/shifts/holidays) are deliberately NOT
 * on this bench — raw test pushes desync the lock from the DB. Exercise
 * them through the real flow instead: attach a credential or schedule to
 * the device and press "Update device" (the push orchestrator).
 * (v1's inventory-request button is gone with v2 — record counts arrive
 * with every state sync.)
 */

import { useState, type ReactNode } from 'react';
import styled from '@emotion/styled';
import {
  IconLockOpen,
  IconLock,
  IconShieldLock,
  IconPower,
  IconAdjustments,
  IconAlertTriangle,
  IconAlertOctagon,
  IconSend,
} from '@tabler/icons-react';
import { devicesApi, type PlatformDevice } from '../../services/access/devices';

// ── command presets ────────────────────────────────────────────────────────────

type Variant = 'primary' | 'default' | 'danger';

interface Preset {
  id: string;
  label: string;
  description?: string;
  command: string;
  payload?: Record<string, unknown>;
  icon: ReactNode;
  buttonText: string;
  variant?: Variant;
  /** When set, the button requires a second confirming click. */
  confirm?: string;
}

interface Group {
  title: string;
  items: Preset[];
}

const GROUPS: Group[] = [
  {
    title: 'Door control',
    items: [
      {
        id: 'unlock', label: 'Unlock door', description: 'Momentary unlock — relocks after the latch interval.',
        command: 'lock.unlock', icon: <IconLockOpen size={18} />, buttonText: 'Unlock', variant: 'primary',
      },
      {
        // 'normal' clears any hold-open/lockdown override and returns the
        // door to schedule-driven operation. 'locked' would pin the door
        // locked and suppress shift-driven auto-unlock.
        id: 'lock', label: 'Lock door', description: 'Return to normal operation — locked, following the door schedule.',
        command: 'lock.set-state', payload: { state: 'normal' }, icon: <IconLock size={18} />, buttonText: 'Lock',
      },
      {
        id: 'unlock-hold', label: 'Unlock & hold', description: 'Hold the door unlocked until changed.',
        command: 'lock.set-state', payload: { state: 'unlocked' }, icon: <IconLockOpen size={18} />, buttonText: 'Hold open',
      },
      {
        id: 'lockdown', label: 'Lockdown', description: 'No credential opens the door until cleared.',
        command: 'lock.set-state', payload: { state: 'lockdown' }, icon: <IconShieldLock size={18} />,
        buttonText: 'Lockdown', variant: 'danger', confirm: 'Put this device into lockdown?',
      },
    ],
  },
  {
    title: 'Configuration & diagnostics',
    items: [
      {
        id: 'latch-5s', label: 'Set latch interval to 5s',
        description: 'Door holds unlatched for 5 seconds on momentary unlock.',
        command: 'lock.configure', payload: { latchInterval: 5 },
        icon: <IconAdjustments size={18} />, buttonText: 'Set',
      },
      {
        id: 'reboot', label: 'Reboot device', description: 'Soft reboot. The door stays locked during restart.',
        command: 'device.reboot', icon: <IconPower size={18} />, buttonText: 'Reboot',
        variant: 'danger', confirm: 'Reboot this device now?',
      },
    ],
  },
];

// ── styled ───────────────────────────────────────────────────────────────────

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
`;

const SelectedHead = styled.div`
  padding: 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};

  .name { font-size: 15px; font-weight: 600; color: ${({ theme }) => theme.colors.text.primary}; }
  .serial {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin-top: 2px;
  }
`;

const NotInSimkura = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 14px 14px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  font-size: 13px;
`;

const GroupTitle = styled.div`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text.tertiary};
  padding: 14px 14px 6px;
`;

const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};

  .icon {
    color: ${({ theme }) => theme.colors.text.tertiary};
    flex-shrink: 0;
    display: inline-flex;
  }
  .text { flex: 1; min-width: 0; }
  .label { font-size: 13px; font-weight: 500; color: ${({ theme }) => theme.colors.text.primary}; }
  .desc { font-size: 12px; color: ${({ theme }) => theme.colors.text.tertiary}; margin-top: 1px; }
`;

const Btn = styled.button<{ $variant?: Variant }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  min-width: 84px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid
    ${({ theme, $variant }) => ($variant === 'primary' ? 'transparent' : theme.colors.border.light)};
  background: ${({ theme, $variant }) =>
    $variant === 'primary' ? theme.colors.brand.primary : theme.colors.background.primary};
  color: ${({ theme, $variant }) =>
    $variant === 'primary' ? '#fff'
  : $variant === 'danger'  ? '#b91c1c'
  :                          theme.colors.text.primary};
  font-size: 13px;
  font-weight: ${({ $variant }) => ($variant === 'primary' ? 600 : 500)};
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: ${({ theme, $variant }) =>
      $variant === 'primary' ? theme.colors.brand.primaryHover ?? theme.colors.brand.primary
    : $variant === 'danger'  ? '#fef2f2'
    :                          theme.colors.background.secondary};
  }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
`;

const ConfirmRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  .q {
    font-size: 12px;
    color: #9a3412;
    max-width: 180px;
  }
`;

const ResultBox = styled.div<{ $tone: 'success' | 'error' }>`
  margin: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  border: 1px solid ${({ $tone }) => ($tone === 'success' ? '#bbf7d0' : '#fecaca')};
  background: ${({ $tone }) => ($tone === 'success' ? '#f0fdf4' : '#fef2f2')};
  color: ${({ $tone }) => ($tone === 'success' ? '#166534' : '#991b1b')};

  pre {
    margin: 8px 0 0;
    padding: 8px;
    background: rgba(15, 23, 42, 0.04);
    border-radius: 6px;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow: auto;
    color: ${({ theme }) => theme.colors.text.secondary};
  }
`;

// ── component ──────────────────────────────────────────────────────────────────

interface Props {
  device: PlatformDevice;
}

export function DeviceCommandPanel({ device }: Props) {
  const hwId = device.hardware_device_id;

  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string; response?: unknown } | null>(null);

  const busy = pending !== null;

  const run = async (p: Preset) => {
    setPending(p.id);
    setConfirming(null);
    setResult(null);
    try {
      const res = await devicesApi.sendCommand(hwId, p.command, p.payload);
      setResult({ tone: 'success', text: `${p.label} — accepted by Simkura.`, response: res?.simkura ?? res });
    } catch (err) {
      setResult({ tone: 'error', text: err instanceof Error ? err.message : `${p.label} failed.` });
    } finally {
      setPending(null);
    }
  };

  const onClick = (p: Preset) => {
    if (p.confirm && confirming !== p.id) {
      setConfirming(p.id);
      return;
    }
    run(p);
  };

  return (
    <Wrap>
      <SelectedHead>
        <div className="name">{device.device_name || 'Unassigned device'}</div>
        <div className="serial">{hwId}</div>
      </SelectedHead>

      {!device.in_simkura && (
        <NotInSimkura>
          <IconAlertTriangle size={16} />
          <div>This device isn&apos;t in Simkura — commands will be rejected upstream.</div>
        </NotInSimkura>
      )}

      {GROUPS.map((group) => (
        <div key={group.title}>
          <GroupTitle>{group.title}</GroupTitle>
          {group.items.map((p) => (
            <Item key={p.id}>
              <span className="icon">{p.icon}</span>
              <div className="text">
                <div className="label">{p.label}</div>
                {p.description && <div className="desc">{p.description}</div>}
              </div>

              {confirming === p.id ? (
                <ConfirmRow>
                  <IconAlertOctagon size={16} color="#b91c1c" />
                  <span className="q">{p.confirm}</span>
                  <Btn disabled={busy} onClick={() => setConfirming(null)}>Cancel</Btn>
                  <Btn $variant="danger" disabled={busy} onClick={() => run(p)}>
                    {pending === p.id ? 'Sending…' : 'Confirm'}
                  </Btn>
                </ConfirmRow>
              ) : (
                <Btn $variant={p.variant} disabled={busy} onClick={() => onClick(p)}>
                  {pending === p.id ? 'Sending…' : p.buttonText}
                </Btn>
              )}
            </Item>
          ))}
        </div>
      ))}

      {result && (
        <ResultBox $tone={result.tone}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {result.tone === 'error' ? <IconAlertTriangle size={15} /> : <IconSend size={15} />}
            {result.text}
          </div>
          {result.response != null && <pre>{JSON.stringify(result.response, null, 2)}</pre>}
        </ResultBox>
      )}
    </Wrap>
  );
}

export default DeviceCommandPanel;
