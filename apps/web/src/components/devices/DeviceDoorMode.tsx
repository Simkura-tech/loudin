/**
 * DeviceDoorMode — the door's override mode, as one four-position bar.
 *
 * Live state (the tiles above) is what the lock reports right now. Door
 * mode is the override an admin sets on top of that:
 *
 *   Lockdown mode  deny-all except Master credentials; schedules and
 *                  holidays suspended
 *   Lock mode      pinned locked; credentials still open it; the schedule
 *                  will not auto-unlock it
 *   Normal         no override — the door follows its shifts and holidays
 *   Unlock mode    held unlocked; anyone can enter
 *
 * Normal is not a state the lock reports; it is the absence of an override
 * (doors[].lock.override = 0). A door in Normal is currently locked or
 * unlocked according to its schedule, and a holiday window shows here as
 * Normal with a note — the calendar, not an admin, is driving it.
 *
 * The three overrides map to lock.set-state locked / unlocked / lockdown;
 * Normal sends 'normal', which clears the override. All persist across
 * power cycles. A sleeping lock applies the change on its next wake, so a
 * just-sent mode shows as pending until the device reports it.
 */

import { useEffect, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconCalendarEvent,
  IconChevronDown,
  IconClockPause,
  IconLock,
  IconLockOpen,
  IconRoute,
  IconX,
} from '@tabler/icons-react';

import { devicesApi, type Device } from '../../services/access/devices';
import { useDeviceCapabilities } from '../../hooks';
import { unsupportedStyle } from './capabilityStyles';
import { UnsupportedBadge } from './CapabilityGate';

// ── Layout ────────────────────────────────────────────────────────────────────

const Panel = styled.section`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  margin-bottom: 16px;
`;

/* The whole header is the collapse toggle. When collapsed it carries a
   one-line summary of the current mode so nothing is hidden, only folded. */
const PanelHeader = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 16px;
  border: none;
  border-bottom: 1px solid ${({ theme, $open }) => ($open ? theme.colors.border.light : 'transparent')};
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.primary};

  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.brand.primary}; outline-offset: -2px; }

  h2 {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin: 0;
  }
  .summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 500;
    color: ${({ theme }) => theme.colors.text.secondary};
  }
  .spacer { flex: 1; }
  .chevron {
    color: ${({ theme }) => theme.colors.text.tertiary};
    transition: transform 0.15s ease;
    transform: rotate(${({ $open }) => ($open ? '0deg' : '-90deg')});
  }
`;

const PanelBody = styled.div`
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Explainer = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text.secondary};
  max-width: 72ch;

  strong { color: ${({ theme }) => theme.colors.text.primary}; font-weight: 600; }
`;

/* The bar: four equal segments, most restrictive on the left. */
const Bar = styled.div<{ $unsupported?: boolean }>`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  overflow: hidden;
  ${({ $unsupported }) => $unsupported && unsupportedStyle}
`;

/* Segments follow the Actions panel's secondary-button idiom: outlined,
   quiet, text-led. The active one gets a soft tint (brand, or the danger
   red for lockdown) rather than a solid fill. */
const Segment = styled.button<{ $active: boolean; $pending: boolean; $tone: 'danger' | 'neutral' | 'brand' | 'open' }>`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px 9px;
  border: none;
  border-right: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme, $active, $tone }) =>
    !$active ? theme.colors.background.primary
  : $tone === 'danger' ? '#fef2f2'
  :                      theme.colors.brand.primary + '14'};
  color: ${({ theme, $active, $tone }) =>
    !$active ? theme.colors.text.secondary
  : $tone === 'danger' ? '#b91c1c'
  :                      theme.colors.brand.primary};
  box-shadow: ${({ theme, $active, $tone }) =>
    $active ? `inset 0 0 0 1px ${$tone === 'danger' ? '#fecaca' : theme.colors.brand.primary + '66'}` : 'none'};
  font-family: inherit;
  font-size: 12.5px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:last-child { border-right: none; }
  &:hover:not(:disabled) {
    background: ${({ theme, $active, $tone }) =>
      $active
        ? ($tone === 'danger' ? '#fee2e2' : theme.colors.brand.primary + '1f')
        : ($tone === 'danger' ? '#fef2f2' : theme.colors.background.secondary)};
    color: ${({ theme, $active, $tone }) =>
      $tone === 'danger' ? '#b91c1c' : $active ? theme.colors.brand.primary : theme.colors.text.primary};
  }
  &:disabled { cursor: not-allowed; }
  &:disabled:not([data-active="true"]) { opacity: 0.55; }

  ${({ $pending, theme }) => $pending && `
    outline: 1.5px dashed ${theme.colors.brand.primary};
    outline-offset: -4px;
  `}

  .seg-label { line-height: 1.1; }
  .seg-sub {
    font-size: 10.5px;
    font-weight: 500;
    opacity: 0.8;
    line-height: 1.1;
    min-height: 12px;
  }
`;

const Caption = styled.div<{ $tone?: 'warn' | 'info' }>`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  line-height: 1.45;
  background: ${({ theme, $tone }) =>
    $tone === 'warn' ? theme.colors.status.warningBackground
  : $tone === 'info' ? theme.colors.status.infoBackground
  :                    theme.colors.background.secondary};
  color: ${({ theme, $tone }) =>
    $tone === 'warn' ? '#92400e'
  : $tone === 'info' ? '#1e40af'
  :                    theme.colors.text.secondary};
  border: 1px solid ${({ theme, $tone }) =>
    $tone === 'warn' ? theme.colors.status.warningBorder
  : $tone === 'info' ? theme.colors.status.infoBorder
  :                    theme.colors.border.light};

  svg { flex: none; margin-top: 1px; }
  strong { font-weight: 600; }
`;

const Status = styled.div<{ $tone: 'idle' | 'success' | 'error' }>`
  font-size: 12px;
  color: ${({ $tone, theme }) =>
    $tone === 'success' ? '#166534'
  : $tone === 'error'   ? '#991b1b'
  :                       theme.colors.text.tertiary};
  min-height: 16px;
`;

// ── Confirm dialog (lockdown only) ───────────────────────────────────────────

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
  max-width: 460px;
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
  h2 { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; margin: 0; }
`;

const DialogBody = styled.div`
  padding: 14px 18px;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text.secondary};
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const SecondaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
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
`;

const DangerButton = styled(SecondaryButton)`
  border: none;
  background: #b91c1c;
  color: #fff;
  font-weight: 600;
  &:hover { background: #991b1b; }
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
`;

// ── Modes ────────────────────────────────────────────────────────────────────

type Mode = 'lockdown' | 'locked' | 'normal' | 'unlocked';

const MODES: {
  value: Mode;
  label: string;
  icon: typeof IconLock;
  tone: 'danger' | 'neutral' | 'brand' | 'open';
  description: string;
}[] = [
  {
    value: 'lockdown', label: 'Lockdown mode', icon: IconAlertOctagon, tone: 'danger',
    description: 'Deny-all. The door is pinned locked and every schedule and holiday is suspended. Only Master credentials open it.',
  },
  {
    value: 'locked', label: 'Lock mode', icon: IconLock, tone: 'neutral',
    description: 'Pinned locked until you change it. PINs and cards still open the door, but the schedule will not auto-unlock it.',
  },
  {
    value: 'normal', label: 'Normal', icon: IconRoute, tone: 'brand',
    description: 'No override. The door follows its schedule and holidays — locked outside shifts, auto-unlocked during them. PINs and cards always work.',
  },
  {
    value: 'unlocked', label: 'Unlock mode', icon: IconLockOpen, tone: 'open',
    description: 'Held unlocked until you change it. Anyone can enter; the schedule is suspended.',
  },
];

/** Which segment the device's reported state corresponds to. */
function currentMode(device: Device): { mode: Mode; holiday: boolean } {
  // Lockdown is only ever an override, so it wins regardless of the flag.
  if (device.door_state === 'lockdown') return { mode: 'lockdown', holiday: false };
  const override = device.door_override_mode
    ?? (device.door_override == null ? null : device.door_override ? 'command' : 'none');
  if (override === 'command') {
    return { mode: device.door_state === 'unlocked' ? 'unlocked' : 'locked', holiday: false };
  }
  return { mode: 'normal', holiday: override === 'holiday' };
}

const MODE_TO_STATE: Record<Mode, 'locked' | 'unlocked' | 'lockdown' | 'normal'> = {
  lockdown: 'lockdown', locked: 'locked', normal: 'normal', unlocked: 'unlocked',
};

/** Collapse preference, per browser. Open by default. */
const COLLAPSE_KEY = 'loudin.deviceDoorMode.collapsed';
function readCollapsed(): boolean {
  try { return window.localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(v: boolean) {
  try { window.localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  device: Device;
  canEdit: boolean;
  /** Bumped by the parent when a command lands so the activity feed re-pulls. */
  onCommandSent?: () => void;
  /** Called after a mode change so the parent re-reads the device. */
  onDeviceChanged?: () => void;
}

export function DeviceDoorMode({ device, canEdit, onCommandSent, onDeviceChanged }: Props) {
  const caps = useDeviceCapabilities(device);
  const gate = caps.gate({ capability: 'lock-control' });

  const current = currentMode(device);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmLockdown, setConfirmLockdown] = useState(false);
  const [hover, setHover] = useState<Mode | null>(null);
  const [status, setStatus] = useState<{ tone: 'idle' | 'success' | 'error'; text: string }>({ tone: 'idle', text: '' });
  const [open, setOpen] = useState(() => !readCollapsed());
  const toggleOpen = () => setOpen((o) => { writeCollapsed(o); return !o; });

  // The device reported the mode we sent → no longer pending.
  useEffect(() => {
    if (pendingMode && current.mode === pendingMode) setPendingMode(null);
  }, [pendingMode, current.mode]);

  const send = async (mode: Mode) => {
    setSending(true);
    setStatus({ tone: 'idle', text: '' });
    try {
      await devicesApi.sendCommand(device.device_id, 'lock.set-state', { state: MODE_TO_STATE[mode] });
      setPendingMode(mode);
      const label = MODES.find((m) => m.value === mode)!.label;
      setStatus({
        tone: 'success',
        text: device.power_mode === 'active'
          ? `${label} sent.`
          : `${label} sent — the lock is asleep and applies it on its next wake (enter 00000# on the keypad to wake it now).`,
      });
      onCommandSent?.();
      onDeviceChanged?.();
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'Command failed' });
    } finally {
      setSending(false);
    }
  };

  const choose = (mode: Mode) => {
    if (!canEdit || sending || !gate.enabled) return;
    if (mode === current.mode && !pendingMode) return;
    if (mode === 'lockdown') { setConfirmLockdown(true); return; }
    void send(mode);
  };

  const shown = MODES.find((m) => m.value === (hover ?? pendingMode ?? current.mode))!;
  const showingLockdown = shown.value === 'lockdown';
  const currentDef = MODES.find((m) => m.value === current.mode)!;
  const CurrentIcon = currentDef.icon;

  return (
    <Panel>
      <PanelHeader
        type="button"
        $open={open}
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls="device-door-mode-body"
        title={open ? 'Collapse' : 'Expand'}
      >
        <h2>Door mode</h2>
        <span className="summary">
          <CurrentIcon size={14} strokeWidth={2} />
          {currentDef.label}
          {current.mode === 'normal' && (
            <span style={{ opacity: 0.75 }}>
              · {current.holiday ? 'holiday in effect' : `currently ${device.door_state}`}
            </span>
          )}
          {pendingMode && (
            <span style={{ opacity: 0.75 }}>
              · {MODES.find((m) => m.value === pendingMode)!.label} pending
            </span>
          )}
        </span>
        <span className="spacer" />
        {!gate.enabled && <UnsupportedBadge reason={gate.reason} />}
        <IconChevronDown className="chevron" size={16} strokeWidth={2} />
      </PanelHeader>
      {open && (
      <PanelBody id="device-door-mode-body">
        <Explainer>
          <strong>Live state</strong> above is what the lock reports right now.{' '}
          <strong>Door mode</strong> is the override you set on top of it: it pins the door in one
          mode until you return it to Normal, where the door follows its schedule and holidays.
          Momentary unlock, under Actions, is a pulse and does not change the mode.
        </Explainer>

        <Bar
          role="radiogroup"
          aria-label="Door mode"
          $unsupported={!gate.enabled}
          title={gate.reason ?? (!canEdit ? 'Only admins can change the door mode' : undefined)}
        >
          {MODES.map((m) => {
            const active  = m.value === current.mode;
            const pending = m.value === pendingMode;
            const Icon = m.icon;
            const sub = active && m.value === 'normal'
              ? (current.holiday ? 'holiday in effect' : `currently ${device.door_state}`)
              : pending ? 'pending' : '';
            return (
              <Segment
                key={m.value}
                type="button"
                role="radio"
                aria-checked={active}
                data-active={active ? 'true' : 'false'}
                $active={active}
                $pending={pending}
                $tone={m.tone}
                disabled={!canEdit || sending || !gate.enabled}
                onClick={() => choose(m.value)}
                onMouseEnter={() => setHover(m.value)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(m.value)}
                onBlur={() => setHover(null)}
              >
                <Icon size={18} strokeWidth={2} />
                <span className="seg-label">{m.label}</span>
                <span className="seg-sub">{sub}</span>
              </Segment>
            );
          })}
        </Bar>

        <Caption>
          <shown.icon size={15} />
          <span><strong>{shown.label}.</strong> {shown.description}</span>
        </Caption>

        {current.holiday && current.mode === 'normal' && (
          <Caption $tone="info">
            <IconCalendarEvent size={15} />
            <span>A holiday is in effect, so the calendar is driving the door right now. Setting a mode here overrides the holiday until you return to Normal.</span>
          </Caption>
        )}

        {pendingMode && (
          <Caption $tone="info">
            <IconClockPause size={15} />
            <span>
              <strong>{MODES.find((m) => m.value === pendingMode)!.label}</strong> has been sent and is waiting for the lock to apply it.
              The bar moves when the lock reports the change.
            </span>
          </Caption>
        )}

        {showingLockdown && (
          <Caption $tone="warn">
            <IconAlertTriangle size={15} />
            <span>
              Lockdown still admits <strong>Master</strong> credentials, and every credential this platform installs is
              currently Master. Until credential classes are exposed, PINs and cards will keep opening this door in
              Lockdown mode.
            </span>
          </Caption>
        )}

        <Status $tone={status.tone}>{status.text}</Status>
      </PanelBody>
      )}

      {confirmLockdown && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmLockdown(false); }}>
          <Dialog>
            <DialogHeader>
              <h2><IconAlertOctagon size={16} color="#b91c1c" /> Lock down {device.device_name}?</h2>
              <IconButton type="button" onClick={() => setConfirmLockdown(false)}>
                <IconX size={16} />
              </IconButton>
            </DialogHeader>
            <DialogBody>
              <span>
                The door is pinned locked and every schedule and holiday is suspended until an admin returns it to
                Normal. A sleeping lock applies this on its next wake — enter 00000# on the keypad to wake it now.
              </span>
              <span>
                <strong>Note:</strong> every credential this platform installs is Master, and Lockdown admits Master
                credentials — PINs and cards will still open this door.
              </span>
            </DialogBody>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setConfirmLockdown(false)}>Cancel</SecondaryButton>
              <DangerButton type="button" onClick={() => { setConfirmLockdown(false); void send('lockdown'); }}>
                <IconAlertOctagon size={14} /> Lock down
              </DangerButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}
    </Panel>
  );
}

export default DeviceDoorMode;
