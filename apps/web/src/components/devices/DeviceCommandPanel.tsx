/**
 * DeviceCommandPanel — the command surface for the Device Testing bench.
 *
 * A flat, declarative list of preset test commands. Each row is one named
 * action with a matching button; the payload is fixed per row so testing is
 * one click. Every command maps to the backend allowlist
 * (apps/api/controllers/access/deviceCommands.js → ALLOWED_COMMANDS).
 *
 * Commands forward to Simkura immediately; the device acts on its next
 * check-in and reports back via webhook. We show the synchronous ack here.
 *
 * NOTE: credentials are master-only in this platform (bwCred is forced to
 * cardClass:1 server-side). The "8–5 shift" PIN currently sends the same
 * master bwCred as the plain PIN — the shift + bwDoorSched binding is a
 * later bite. See [[feedback-credentials-master-only]].
 */

import { useState, type ReactNode } from 'react';
import styled from '@emotion/styled';
import {
  IconLockOpen,
  IconLock,
  IconShieldLock,
  IconReportAnalytics,
  IconPower,
  IconKey,
  IconClock,
  IconCalendarBolt,
  IconTrash,
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
        command: 'bwUnlock', icon: <IconLockOpen size={18} />, buttonText: 'Unlock', variant: 'primary',
      },
      {
        // 'normal' (3) clears any hold-open/lockdown override and returns the
        // door to schedule-driven operation. 'locked' (0) would pin the door
        // locked and suppress shift-driven auto-unlock.
        id: 'lock', label: 'Lock door', description: 'Return to normal operation — locked, following the door schedule.',
        command: 'bwState', payload: { state: 'normal' }, icon: <IconLock size={18} />, buttonText: 'Lock',
      },
      {
        id: 'unlock-hold', label: 'Unlock & hold', description: 'Hold the door unlocked until changed.',
        command: 'bwState', payload: { state: 'unlocked' }, icon: <IconLockOpen size={18} />, buttonText: 'Hold open',
      },
      {
        id: 'lockdown', label: 'Lockdown', description: 'No credential opens the door until cleared.',
        command: 'bwState', payload: { state: 'lockdown' }, icon: <IconShieldLock size={18} />,
        buttonText: 'Lockdown', variant: 'danger', confirm: 'Put this device into lockdown?',
      },
    ],
  },
  {
    title: 'Diagnostics',
    items: [
      {
        id: 'inventory', label: 'Request inventory', description: 'Ask the device to dump its credential/shift counts.',
        command: 'bwCount', icon: <IconReportAnalytics size={18} />, buttonText: 'Request',
      },
      {
        id: 'reboot', label: 'Reboot device', description: 'Soft reboot. The door stays locked during restart.',
        command: 'bwReset', icon: <IconPower size={18} />, buttonText: 'Reboot',
        variant: 'danger', confirm: 'Reboot this device now?',
      },
    ],
  },
  {
    title: 'Credentials',
    items: [
      {
        id: 'pin-shift', label: 'Add PIN 12345 — 8–5 shift',
        description: 'PIN credential 12345 (master). Pair with "Add 8–5 shift" + "Bind shift to door" below to time-gate it.',
        command: 'bwCred', payload: { credentialType: 'pin', pinCode: 12345, cardClass: 1 },
        icon: <IconClock size={18} />, buttonText: 'Add',
      },
      {
        id: 'pin-master', label: 'Add PIN 12345 — master',
        description: 'PIN credential 12345 as a master (works any time).',
        command: 'bwCred', payload: { credentialType: 'pin', pinCode: 12345, cardClass: 1 },
        icon: <IconKey size={18} />, buttonText: 'Add',
      },
      {
        id: 'cred-clear', label: 'Clear all credentials', description: 'Wipe every credential stored on the device.',
        command: 'bw_cred_clear', icon: <IconTrash size={18} />, buttonText: 'Clear',
        variant: 'danger', confirm: 'Wipe ALL credentials on this device?',
      },
    ],
  },
  {
    title: 'Shifts',
    items: [
      {
        id: 'shift-add', label: 'Add 8–5 shift (Mon–Fri)',
        description: 'Define an 08:00–17:00 weekday shift (id 1) on the device.',
        command: 'bwShift',
        payload: {
          shiftId: 1,
          startHour: 8, startMinute: 0, startSecond: 0,
          endHour: 17, endMinute: 0, endSecond: 0,
          daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          scheduleType: 'normal',
        },
        icon: <IconClock size={18} />, buttonText: 'Add',
      },
      {
        id: 'shift-bind', label: 'Bind 8–5 shift to door',
        description: 'Bind shift id 1 as the door schedule so access is time-gated to the shift.',
        command: 'bwDoorSched', payload: { scheduleIds: [1] },
        icon: <IconCalendarBolt size={18} />, buttonText: 'Bind',
      },
      {
        id: 'shift-clear', label: 'Clear all shifts', description: 'Wipe every shift definition on the device.',
        command: 'bw_shift_clear', icon: <IconTrash size={18} />, buttonText: 'Clear',
        variant: 'danger', confirm: 'Wipe ALL shifts on this device?',
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
