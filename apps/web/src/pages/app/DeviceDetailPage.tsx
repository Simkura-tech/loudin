/**
 * DeviceDetailPage — single device view.
 *
 * Live state (status / door / battery / power / last_seen) is read-only
 * and reflects whatever the backend has cached from Simkura. The human
 * labels (device_name, location, notes) are editable via the Edit modal.
 *
 * Actions (remote unlock / lockdown / reboot) land later once we wire device
 * commands through the Simkura client.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconAlertTriangle,
  IconAntennaBars5,
  IconAntennaBarsOff,
  IconArrowLeft,
  IconBattery,
  IconBattery1,
  IconBattery2,
  IconBattery3,
  IconBattery4,
  IconBatteryOff,
  IconCheck,
  IconAlertCircle,
  IconCloudUpload,
  IconDoor,
  IconEdit,
  IconLoader2,
  IconLock,
  IconLockOpen,
  IconLockSquare,
  IconQuestionMark,
  IconRefresh,
  IconTrash,
  IconX,
} from '@tabler/icons-react';

import {
  devicesApi,
  type Device,
  type DevicePatch,
  type DeviceStatus,
  type DeviceSync,
  type DoorState,
  type PushResult,
} from '../../services/access/devices';
import DeviceActivityFeed from '../../components/devices/DeviceActivityFeed';
import DeviceActions from '../../components/devices/DeviceActions';
import DeviceDoorMode from '../../components/devices/DeviceDoorMode';
import DeviceCommandQueue from '../../components/devices/DeviceCommandQueue';
import DeviceSchedules from '../../components/devices/DeviceSchedules';
import DeviceHolidays from '../../components/devices/DeviceHolidays';
import DeviceCredentials from '../../components/devices/DeviceCredentials';
import { useAuth } from '../../contexts/AuthContext';
import { useDeviceCapabilities } from '../../hooks';
import { useFeatures } from '../../contexts/FeaturesContext';
import { UnsupportedBadge } from '../../components/devices/CapabilityGate';
import { unsupportedStyle } from '../../components/devices/capabilityStyles';

// ── Chrome ────────────────────────────────────────────────────────────────────

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-decoration: none;
  margin-bottom: 12px;

  &:hover { color: ${({ theme }) => theme.colors.text.primary}; }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  flex-wrap: wrap;

  .crest {
    width: 44px;
    height: 44px;
    border-radius: 11px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .name {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .sub {
    color: ${({ theme }) => theme.colors.text.secondary};
    font-size: 13px;
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 6px;
  }
`;

const StatusPill = styled.span<{ $status: DeviceStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: capitalize;
  background: ${({ $status }) =>
    $status === 'online'      ? '#dcfce7'
  : $status === 'offline'     ? '#f1f5f9'
  : $status === 'error'       ? '#fee2e2'
  :                             '#fef3c7'};
  color: ${({ $status }) =>
    $status === 'online'      ? '#166534'
  : $status === 'offline'     ? '#475569'
  : $status === 'error'       ? '#991b1b'
  :                             '#92400e'};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.85;
  }
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
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
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

const DangerButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #fecaca;
  background: #fff;
  color: #b91c1c;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: #fef2f2; border-color: #fca5a5; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const DeactivatedBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f3f4f6;
  color: #374151;
  margin-bottom: 14px;
  font-size: 13px;

  .icon { color: #6b7280; flex-shrink: 0; margin-top: 2px; }
  .title { font-weight: 600; color: #111827; margin-bottom: 2px; }
`;

// ── Two-column layout ─────────────────────────────────────────────────────────

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 14px;

  @media (max-width: 880px) { grid-template-columns: 1fr; }
`;

const Panel = styled.section`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};

  h2 {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin: 0;
  }
`;

const PanelBody = styled.div`
  padding: 12px 16px;
`;

// ── Live state visuals ────────────────────────────────────────────────────────

const LiveGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`;

/* $unsupported: the hardware can't report this — see CapabilityGate.tsx.
   The tile keeps its slot (same layout on every board) but goes dashed and
   muted, with the reason in the hint and a badge in the label row. */
const LiveTile = styled.div<{ $unsupported?: boolean }>`
  padding: 10px 12px;
  border: 1px ${({ $unsupported }) => ($unsupported ? 'dashed' : 'solid')}
    ${({ theme, $unsupported }) => ($unsupported ? theme.colors.border.medium : theme.colors.border.light)};
  border-radius: 8px;
  background: ${({ theme, $unsupported }) =>
    $unsupported ? theme.colors.background.secondary : theme.colors.background.primary};

  .label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};

    > :last-child:not(:first-child) { margin-left: auto; }
  }
  ${({ $unsupported, theme }) => $unsupported && `
    .value { color: ${theme.colors.text.disabled}; filter: grayscale(1); }
    .hint  { color: ${theme.colors.text.tertiary}; }
  `}
  .value {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.1;
  }
  .hint {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.4;
    color: ${({ theme }) => theme.colors.text.secondary};
  }
`;

const BatteryBar = styled.div<{ $pct: number; $tone: 'good' | 'low' | 'critical' }>`
  position: relative;
  height: 6px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.background.secondary};
  overflow: hidden;
  margin-top: 8px;

  &::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: ${({ $pct }) => Math.max(0, Math.min(100, $pct))}%;
    background: ${({ $tone }) =>
      $tone === 'critical' ? '#dc2626'
    : $tone === 'low'      ? '#f59e0b'
    :                        '#16a34a'};
  }
`;

const DetailRow = styled.div`
  display: grid;
  grid-template-columns: 115px 1fr;
  gap: 10px;
  padding: 7px 0;
  font-size: 13px;

  dt {
    color: ${({ theme }) => theme.colors.text.tertiary};
    font-weight: 500;
  }
  dd {
    margin: 0;
    color: ${({ theme }) => theme.colors.text.primary};
    word-break: break-word;
  }
  .empty { color: ${({ theme }) => theme.colors.text.tertiary}; opacity: 0.5; }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
`;

const Tabs = styled.nav`
  display: flex;
  gap: 2px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  margin-bottom: 16px;
`;

/* $unsupported: the tab stays in the bar so the page reads the same on every
   board, but is inert and muted; the reason rides on `title`. */
const Tab = styled.button<{ $active: boolean; $unsupported?: boolean }>`
  position: relative;
  padding: 8px 12px;
  margin-bottom: -1px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${({ theme, $active }) => ($active ? theme.colors.brand.primary : 'transparent')};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.text.primary : theme.colors.text.secondary};
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;

  &:hover { color: ${({ theme }) => theme.colors.text.primary}; }

  ${({ $unsupported }) => $unsupported && unsupportedStyle}
  ${({ $unsupported, theme }) => $unsupported && `&:hover { color: ${theme.colors.text.secondary}; }`}
`;

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  margin-bottom: 16px;
`;

const SyncBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 13px;
  margin-bottom: 16px;
  flex-wrap: wrap;

  .icon { flex-shrink: 0; color: #b45309; }
  .body { flex: 1; min-width: 220px; }
  .title { font-weight: 600; color: #78350f; }
  .detail { font-size: 12px; margin-top: 2px; }
  .actions { flex-shrink: 0; }
`;

const UpdateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: none;
  background: #b45309;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: #92400e; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }

  .spin { animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

/** Blue/info banner shown when a push has happened and we're waiting on the
 *  device to acknowledge. Distinct from SyncBanner (orange, action required). */
const AwaitingBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  font-size: 13px;
  margin-bottom: 16px;

  .icon { flex-shrink: 0; color: #2563eb; }
  .title { font-weight: 600; color: #1e3a8a; }
  .detail { font-size: 12px; margin-top: 2px; }
`;

/** Inline result strip rendered right under the SyncBanner after a push. */
const PushResultStrip = styled.div<{ $tone: 'success' | 'error' | 'info' }>`
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 12px;
  ${({ $tone }) =>
    $tone === 'success' ? 'background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;'
  : $tone === 'info'    ? 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;'
  :                       'background:#fef2f2;border:1px solid #fecaca;color:#991b1b;'}
`;

const NotFound = styled.div`
  padding: 64px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};

  h2 { color: ${({ theme }) => theme.colors.text.primary}; margin: 0 0 6px; }
`;

// ── Modal pieces (mirrors PersonDetailPage's edit modal) ──────────────────────

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

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
`;

const Input = styled.input`
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
`;

const Textarea = styled.textarea`
  min-height: 64px;
  padding: 8px 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Render a human summary of the sync state for the banner — e.g.
 *   "9 new credentials, 2 removed credentials, 5 new schedules"
 * Anything with a zero count is dropped.
 */
function formatPendingSummary(sync: DeviceSync): string {
  const parts: string[] = [];
  if (sync.credentials.add)    parts.push(`${sync.credentials.add} new ${pluralize('credential', sync.credentials.add)}`);
  if (sync.credentials.remove) parts.push(`${sync.credentials.remove} removed ${pluralize('credential', sync.credentials.remove)}`);
  if (sync.shifts.add)         parts.push(`${sync.shifts.add} new ${pluralize('schedule', sync.shifts.add)}`);
  if (sync.shifts.remove)      parts.push(`${sync.shifts.remove} removed ${pluralize('schedule', sync.shifts.remove)}`);
  if (sync.holidays?.add)      parts.push(`${sync.holidays.add} new ${pluralize('holiday', sync.holidays.add)}`);
  if (sync.holidays?.remove)   parts.push(`${sync.holidays.remove} removed ${pluralize('holiday', sync.holidays.remove)}`);
  return parts.join(', ') + ' to push to the lock.';
}

function pluralize(word: string, n: number): string {
  return n === 1 ? word : `${word}s`;
}


function doorIcon(state: DoorState) {
  if (state === 'unknown')  return <IconQuestionMark size={18} />;
  if (state === 'lockdown') return <IconLockSquare  size={18} />;
  if (state === 'unlocked') return <IconLockOpen    size={18} />;
  return <IconLock size={18} />;
}

function batteryTone(pct: number | null): 'good' | 'low' | 'critical' {
  if (pct == null) return 'good';
  if (pct <= 15)   return 'critical';
  if (pct <= 35)   return 'low';
  return 'good';
}

function doorStateHint(state: DoorState): string {
  switch (state) {
    case 'locked':   return 'Secured. Access requires a card, PIN, or app unlock.';
    case 'unlocked': return 'Open access — anyone can enter without a credential.';
    case 'lockdown': return 'All access denied. Only an admin can clear lockdown.';
    case 'unknown':  return 'The lock has not reported its state recently.';
    default:         return '';
  }
}

function powerModeHint(mode: Device['power_mode']): string {
  switch (mode) {
    case 'active':     return 'Always reachable — commands run immediately.';
    case 'sleep':      return 'Wakes periodically. Commands queue until the next check-in — or enter 00000# on the keypad to wake it right away.';
    case 'deep_sleep': return 'Sleeps for a fixed duration to save battery. Commands queue until it wakes — or enter 00000# on the keypad to wake it right away.';
    default:           return '';
  }
}

function batteryHint(pct: number | null): string {
  if (pct == null) return 'No battery reading yet — the lock reports it on each check-in.';
  if (pct <= 15)   return 'Critically low. Replace the batteries now to keep the lock reachable.';
  if (pct <= 35)   return 'Getting low — plan to replace the batteries soon.';
  return 'Locks run about a year on a set of batteries under typical use.';
}

const READER_TECHNOLOGY_LABELS: Record<string, string> = {
  prox:      'Prox',
  smartcard: 'Smart card',
  nfc:       'NFC',
  ble:       'BLE',
  multi:     'Multi-technology',
};

/** Simkura card-format slugs → labels. Unknown slugs fall back to the slug
 *  (the upstream vocabulary is additive). */
const CARD_FORMAT_LABELS: Record<string, string> = {
  '26-bit':    '26-bit Wiegand',
  'mifare-1k': 'MIFARE 1k',
  'hid-34':    'HID 34-bit',
  'hid-37':    'HID 37-bit',
};

const BATTERY_CHEMISTRY_LABELS: Record<string, string> = {
  alkaline: 'Alkaline',
  lithium:  'Lithium',
  'li-ion': 'Li-ion',
};

function readerHint(reader: Device['reader']): string {
  const tech = reader.technology
    ? ''
    : ' Reader technology is recorded by the installer under Actions → Provisioning.';
  switch (reader.protocol) {
    case 'osdp':
      return (reader.connection === 'secure'
        ? 'OSDP reader on a secure channel — PIN entry and reader feedback work.'
        : 'OSDP reader without a secure channel — it works, but the link to the reader is not encrypted.') + tech;
    case 'wiegand':
      return 'One-way Wiegand reader — card data only. PIN entry and reader feedback need OSDP.' + tech;
    default:
      return 'Reader link not reported yet.' + tech;
  }
}

function lastSeenHint(status: DeviceStatus): string {
  switch (status) {
    case 'online':  return 'The last time the lock checked in. Sleeping locks check in periodically, so gaps of a few hours are normal.';
    case 'offline': return 'The lock has not checked in for a while — check its batteries and signal at the door.';
    case 'error':   return 'The lock reported a problem on its last check-in. Try Refresh, or reboot it from Actions.';
    default:        return 'The last time the lock checked in.';
  }
}

function batteryIcon(pct: number | null) {
  if (pct == null) return <IconBatteryOff size={20} />;
  if (pct >= 80) return <IconBattery4 size={20} />;
  if (pct >= 55) return <IconBattery3 size={20} />;
  if (pct >= 30) return <IconBattery2 size={20} />;
  if (pct >= 10) return <IconBattery1 size={20} />;
  return <IconBattery size={20} />;
}

const REL_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year',    365 * 24 * 60 * 60_000],
  ['month',    30 * 24 * 60 * 60_000],
  ['day',           24 * 60 * 60_000],
  ['hour',               60 * 60_000],
  ['minute',                  60_000],
  ['second',                   1_000],
];

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = new Date(iso).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  for (const [unit, ms] of REL_UNITS) {
    if (absDiff >= ms || unit === 'second') {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return 'just now';
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const EMPTY_PATCH: DevicePatch = { device_name: '', location: '', notes: '' };

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const deviceId = Number(id);
  const { user } = useAuth();
  const isAdmin = user?.user_type_id === 1;

  const [device, setDevice] = useState<Device | null | undefined>(undefined);
  // What this board can do — drives the greyed-out treatment on tiles, tabs
  // and actions. Open on every gate until the device loads.
  const caps = useDeviceCapabilities(device);
  // Platform feature flags: a feature turned off by a platform admin is not
  // offered at all (tab / panel not rendered), unlike a hardware gate.
  const features = useFeatures();
  const schedulesOn = features.enabled('schedules');
  const holidaysOn  = features.enabled('holidays');
  const doorModeOn  = features.enabled('door_mode');
  const [sync, setSync] = useState<DeviceSync | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [tab, setTab] = useState<'overview' | 'schedules' | 'holidays' | 'credentials' | 'queue' | 'activity'>('overview');
  // If the tab we're on gets switched off platform-wide, fall back.
  useEffect(() => {
    if ((tab === 'schedules' && !schedulesOn) || (tab === 'holidays' && !holidaysOn)) setTab('overview');
  }, [tab, schedulesOn, holidaysOn]);
  // Bumping this remounts/reloads the activity feed when the user clicks
  // Refresh in the header while on the Activity tab.
  const [activityKey, setActivityKey] = useState(0);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<DevicePatch>(EMPTY_PATCH);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Push state for the "Update device" button.
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    setActivityKey((k) => k + 1);
    try {
      const r = await devicesApi.get(deviceId);
      setDevice(r.device);
      setSync(r.sync);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load device';
      if (/not found/i.test(msg)) setDevice(null);
      else { setError(msg); setDevice(null); }
    } finally {
      setRefreshing(false);
    }
  }, [deviceId]);

  /** Run the orchestrated push and refresh the sync summary on the way out. */
  const handlePush = useCallback(async () => {
    if (pushing) return;
    setPushing(true);
    setPushResult(null);
    try {
      const result: PushResult = await devicesApi.pushDevice(deviceId);
      if (result.ok) {
        const ok    = result.sequence.filter((s) => s.status === 'ok').length;
        const skip  = result.sequence.filter((s) => s.status === 'skipped').length;
        setPushResult({
          tone: 'success',
          text: `Pushed ${ok} command${ok === 1 ? '' : 's'} to the device${skip ? ` (${skip} skipped)` : ''}.`,
        });
      } else if (result.blocked) {
        // Not a failure — a previous rebuild is still queued on Simkura's
        // side (sleeping device) and will apply on its next wake.
        setPushResult({
          tone: 'info',
          text: result.error || 'A previous update is still queued on the device.',
        });
      } else {
        const failed = result.sequence.find((s) => s.status === 'failed');
        const where  = failed ? ` at ${failed.command}` : '';
        const detail = failed?.detail || result.error || 'Push failed';
        setPushResult({ tone: 'error', text: `Stopped${where}: ${detail}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Push failed';
      setPushResult({ tone: 'error', text: msg });
    } finally {
      setPushing(false);
      // Refresh the sync summary either way so the banner reflects the new
      // submitted_at stamps (or stays accurate on partial failure).
      try {
        const r = await devicesApi.get(deviceId);
        setSync(r.sync);
      } catch { /* ignore — banner stays at previous reading */ }
    }
  }, [deviceId, pushing]);

  /** Re-fetch only the sync summary so the banner stays accurate after a
   *  child tab attaches/detaches without flashing the whole page. */
  const refreshSync = useCallback(async () => {
    try {
      const r = await devicesApi.get(deviceId);
      setSync(r.sync);
      // Don't overwrite `device` here — child components may have already
      // updated their own state and we don't want to clobber transient UI.
    } catch {
      /* ignore — the banner stays at the previous reading */
    }
  }, [deviceId]);

  useEffect(() => {
    if (!Number.isFinite(deviceId)) { setDevice(null); return; }
    load({ silent: true });
  }, [deviceId, load]);

  const openEdit = () => {
    if (!device) return;
    setForm({
      device_name: device.device_name,
      location:    device.location ?? '',
      notes:       device.notes ?? '',
    });
    setSaveError(null);
    setEditOpen(true);
  };

  const handleDeactivate = async () => {
    if (!device) return;
    const ok = confirm(
      `Deactivate "${device.device_name}"?\n\n` +
      `It will be removed from your workspace. ` +
      `The lock hardware will keep working until physically uninstalled. This cannot be undone from the end-user UI.`
    );
    if (!ok) return;
    try {
      await devicesApi.release(deviceId);
      navigate('/app/devices');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Deactivate failed');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const payload: DevicePatch = {
        device_name: form.device_name?.trim() || undefined,
        location:    form.location ? form.location.trim() : null,
        notes:       form.notes    ? form.notes.trim()    : null,
      };
      const updated = await devicesApi.update(deviceId, payload);
      setDevice(updated);
      setEditOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const battery = useMemo(() => {
    if (!device) return null;
    return { pct: device.battery_percent, tone: batteryTone(device.battery_percent) };
  }, [device]);

  if (device === undefined) {
    return (
      <>
        <BackLink to="/app/devices"><IconArrowLeft size={16} /> Devices</BackLink>
        <div style={{ color: '#94a3b8', padding: 32 }}>Loading…</div>
      </>
    );
  }
  if (device === null) {
    return (
      <>
        <BackLink to="/app/devices"><IconArrowLeft size={16} /> Devices</BackLink>
        <NotFound>
          <h2>Device not found</h2>
          <p>It may have been removed, or the link is wrong.</p>
        </NotFound>
      </>
    );
  }

  return (
    <>
      <BackLink to="/app/devices"><IconArrowLeft size={16} /> Devices</BackLink>

      <Header>
        <span className="crest"><IconLock size={22} strokeWidth={1.5} /></span>
        <div>
          <h1 className="name">{device.device_name}</h1>
          <div className="sub">
            <StatusPill $status={device.status}>{device.status}</StatusPill>
            {device.location || <span style={{ opacity: 0.5 }}>No location set</span>}
          </div>
        </div>
        <div className="actions">
          <SecondaryButton onClick={() => load()} disabled={refreshing} title="Refresh state">
            <IconRefresh size={16} /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </SecondaryButton>
          {/* Edit and Deactivate are admin-only server-side (PATCH / release
              are requireAdmin), so hide them rather than let a click 403. */}
          {!device.deleted_at && isAdmin && (
            <>
              <PrimaryButton onClick={openEdit}>
                <IconEdit size={16} /> Edit
              </PrimaryButton>
              <DangerButton onClick={handleDeactivate} title="Deactivate this device">
                <IconTrash size={16} /> Deactivate
              </DangerButton>
            </>
          )}
        </div>
      </Header>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      {device.deleted_at && (
        <DeactivatedBanner role="status">
          <IconAlertTriangle className="icon" size={20} />
          <div>
            <div className="title">This device is deactivated</div>
            <div>
              Deactivated{' '}
              {device.released_at
                ? new Date(device.released_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                : new Date(device.deleted_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.
              The lock hardware may still be operating physically until uninstalled.
            </div>
          </div>
        </DeactivatedBanner>
      )}

      {!device.deleted_at && sync?.has_pending && (
        <SyncBanner>
          <IconAlertTriangle className="icon" size={20} />
          <div className="body">
            <div className="title">Device is out of sync</div>
            <div className="detail">
              {formatPendingSummary(sync)}
            </div>
            {pushResult && (
              <PushResultStrip $tone={pushResult.tone}>
                {pushResult.text}
              </PushResultStrip>
            )}
          </div>
          {isAdmin && (
            <div className="actions">
              <UpdateButton
                type="button"
                disabled={pushing}
                onClick={handlePush}
              >
                {pushing
                  ? <><IconLoader2 size={16} className="spin" /> Pushing…</>
                  : <><IconCloudUpload size={16} /> Update device</>}
              </UpdateButton>
            </div>
          )}
        </SyncBanner>
      )}

      {/* Awaiting-confirmation state: push has happened but the device
          hasn't acknowledged. Only shown when nothing else is pending. */}
      {!device.deleted_at && !sync?.has_pending && sync?.has_awaiting && (
        <AwaitingBanner>
          <IconAlertCircle className="icon" size={20} />
          <div>
            <div className="title">Pushed; device confirmation pending</div>
            <div className="detail">
              Update sent to {device.device_name}. The lock will apply the changes on its next check-in
              {device.power_mode !== 'active' && ' — enter 00000# on the keypad to wake it now'}.
            </div>
          </div>
        </AwaitingBanner>
      )}

      <Tabs>
        <Tab type="button" $active={tab === 'overview'} onClick={() => setTab('overview')}>
          Overview
        </Tab>
        {schedulesOn && (() => {
          const g = caps.gate({ capability: 'schedules' });
          return (
            <Tab
              type="button"
              $active={tab === 'schedules'}
              $unsupported={!g.enabled}
              aria-disabled={!g.enabled}
              title={g.reason ?? undefined}
              onClick={() => g.enabled && setTab('schedules')}
            >
              Schedules
            </Tab>
          );
        })()}
        {holidaysOn && (() => {
          const g = caps.gate({ capability: 'schedules' });
          return (
            <Tab
              type="button"
              $active={tab === 'holidays'}
              $unsupported={!g.enabled}
              aria-disabled={!g.enabled}
              title={g.reason ?? undefined}
              onClick={() => g.enabled && setTab('holidays')}
            >
              Holidays
            </Tab>
          );
        })()}
        {(() => {
          const g = caps.gate({ capability: 'credential-store' });
          return (
            <Tab
              type="button"
              $active={tab === 'credentials'}
              $unsupported={!g.enabled}
              aria-disabled={!g.enabled}
              title={g.reason ?? undefined}
              onClick={() => g.enabled && setTab('credentials')}
            >
              Credentials
            </Tab>
          );
        })()}
        <Tab type="button" $active={tab === 'queue'} onClick={() => setTab('queue')}>
          Queue
        </Tab>
        <Tab type="button" $active={tab === 'activity'} onClick={() => setTab('activity')}>
          Activity
        </Tab>
      </Tabs>

      {tab === 'activity' ? (
        <DeviceActivityFeed deviceId={device.id} refreshKey={activityKey} />
      ) : tab === 'queue' ? (
        <DeviceCommandQueue
          deviceId={device.id}
          powerMode={device.power_mode}
          refreshKey={activityKey}
        />
      ) : tab === 'schedules' ? (
        <DeviceSchedules deviceId={device.id} canEdit={isAdmin} onChanged={refreshSync} />
      ) : tab === 'holidays' ? (
        <DeviceHolidays deviceId={device.id} canEdit={isAdmin} onChanged={refreshSync} />
      ) : tab === 'credentials' ? (
        <DeviceCredentials deviceId={device.id} canEdit={isAdmin} onChanged={refreshSync} />
      ) : (
      <>
      {isAdmin && (
        <DeviceActions
          device={device}
          onCommandSent={() => setActivityKey((k) => k + 1)}
          onDeviceChanged={refreshSync}
        />
      )}
      {doorModeOn && (
        <DeviceDoorMode
          device={device}
          canEdit={isAdmin}
          onCommandSent={() => setActivityKey((k) => k + 1)}
          onDeviceChanged={refreshSync}
        />
      )}
      <Grid>
        <Panel>
          <PanelHeader><h2>Live state</h2></PanelHeader>
          <PanelBody>
            <LiveGrid>
              <LiveTile>
                <div className="label">State</div>
                <div className="value">
                  {doorIcon(device.door_state)}
                  <span style={{ textTransform: 'capitalize' }}>{device.door_state}</span>
                </div>
                <div className="hint">
                  {device.door_override_mode === 'holiday'
                    ? 'A holiday is in effect — the calendar is driving the door, not its shifts.'
                    : device.door_override_mode === 'command' || (device.door_override_mode == null && device.door_override)
                      ? 'Held by a door mode set by an admin — the schedule is suspended until the door is returned to Normal (see Door mode below).'
                      : doorStateHint(device.door_state)}
                </div>
              </LiveTile>
              {(() => {
                // Door position is a feature flag that is off on the SB6,
                // so this tile is greyed out on today's fleet and lights up
                // on a board that has the sensor.
                const g = caps.gate({ feature: 'door-position-sensing' });
                const position = g.enabled ? device.door_position : null;
                return (
                  <LiveTile $unsupported={!g.enabled} title={g.reason ?? undefined}>
                    <div className="label">
                      <span>Door position</span>
                      {!g.enabled && <UnsupportedBadge reason={g.reason} />}
                    </div>
                    <div className="value">
                      <IconDoor size={20} />
                      <span style={{ textTransform: 'capitalize' }}>{position ?? '—'}</span>
                    </div>
                    <div className="hint">
                      {!g.enabled
                        ? g.reason
                        : position
                          ? 'Open or closed, as reported by the door position sensor.'
                          : 'Not reported yet — the sensor value arrives on the next state check.'}
                    </div>
                  </LiveTile>
                );
              })()}
              <LiveTile style={{ gridColumn: '1 / -1' }}>
                <div className="label">Power mode</div>
                <div className="value" style={{ fontSize: 16 }}>
                  <span style={{ textTransform: 'capitalize' }}>
                    {device.power_mode.replace('_', ' ')}
                  </span>
                </div>
                <div className="hint">{powerModeHint(device.power_mode)}</div>
              </LiveTile>
              {(() => {
                // Battery: needs the power block, and a plug-in board has
                // no battery to report even when it has one.
                const capGate = caps.gate({ capability: 'power' });
                const g = !capGate.enabled
                  ? capGate
                  : caps.powerType === 'plugin'
                    ? { enabled: false, reason: `${caps.boardName} is mains-powered — there is no battery to report.` }
                    : capGate;
                return (
                  <LiveTile style={{ gridColumn: '1 / -1' }} $unsupported={!g.enabled} title={g.reason ?? undefined}>
                    <div className="label">
                      <span>Battery</span>
                      {!g.enabled && <UnsupportedBadge reason={g.reason} />}
                    </div>
                    <div className="value">
                      {batteryIcon(g.enabled ? device.battery_percent : null)}
                      {g.enabled && device.battery_percent != null ? `${device.battery_percent}%` : '—'}
                      {g.enabled && device.battery_health && device.battery_health !== 'ok' && (
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: device.battery_health === 'dead' ? '#b91c1c' : '#b45309',
                        }}>
                          · {device.battery_health === 'dead' ? 'Dead — safe mode' : 'Low'}
                        </span>
                      )}
                      {g.enabled && device.battery_chemistry && (
                        <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                          · {BATTERY_CHEMISTRY_LABELS[device.battery_chemistry] ?? device.battery_chemistry}
                        </span>
                      )}
                    </div>
                    {g.enabled && battery && device.battery_percent != null && (
                      <BatteryBar
                        $pct={device.battery_percent}
                        $tone={device.battery_health === 'dead' ? 'critical'
                             : device.battery_health === 'low' && battery.tone === 'good' ? 'low'
                             : battery.tone}
                      />
                    )}
                    <div className="hint">
                      {!g.enabled
                        ? g.reason
                        : device.battery_health === 'dead'
                          ? 'The lock reports its batteries as dead and has entered safe mode — the motor will not move until they are replaced.'
                          : device.battery_health === 'low'
                            ? 'The lock reports its batteries as low. Replace them soon to keep the door operating.'
                            : batteryHint(device.battery_percent)}
                    </div>
                  </LiveTile>
                );
              })()}
              {(() => {
                const g = caps.gate({ capability: 'connectivity' });
                return (
                  <LiveTile style={{ gridColumn: '1 / -1' }} $unsupported={!g.enabled} title={g.reason ?? undefined}>
                    <div className="label">
                      <span>Connectivity</span>
                      {!g.enabled && <UnsupportedBadge reason={g.reason} />}
                    </div>
                    <div className="value" style={{ fontSize: 16 }}>
                      {g.enabled && device.carrier ? <IconAntennaBars5 size={20} /> : <IconAntennaBarsOff size={20} />}
                      {(g.enabled && device.carrier) || '—'}
                      {g.enabled && device.signal_strength != null && (
                        <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                          · signal {device.signal_strength}
                        </span>
                      )}
                    </div>
                    <div className="hint">
                      {!g.enabled
                        ? g.reason
                        : device.carrier
                          ? 'Cellular carrier and signal as last reported by the lock.'
                          : 'Not reported yet — requires a newer firmware.'}
                    </div>
                  </LiveTile>
                );
              })()}
              {(() => {
                // Reader: v2 reports the wire protocol and OSDP secure-channel
                // status; technology is whatever the installer recorded.
                const g = caps.gate({ capability: 'lock-control' });
                const r = device.reader;
                const protocol = !g.enabled ? null
                  : r.protocol === 'osdp'    ? 'OSDP'
                  : r.protocol === 'wiegand' ? 'Wiegand'
                  : null;
                return (
                  <LiveTile $unsupported={!g.enabled} title={g.reason ?? undefined}>
                    <div className="label">
                      <span>Reader</span>
                      {!g.enabled && <UnsupportedBadge reason={g.reason} />}
                    </div>
                    <div className="value" style={{ fontSize: 16, flexWrap: 'wrap' }}>
                      {protocol ?? '—'}
                      {protocol && r.connection && (
                        <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                          · {r.connection}
                        </span>
                      )}
                      {g.enabled && r.technology && (
                        <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                          · {READER_TECHNOLOGY_LABELS[r.technology] ?? r.technology}
                        </span>
                      )}
                    </div>
                    <div className="hint">{g.enabled ? readerHint(r) : g.reason}</div>
                  </LiveTile>
                );
              })()}
              {(() => {
                // Card formats: the device's own effective list when its
                // firmware has reported one, else the board's — caps
                // already does that fallback.
                const g = caps.gate({ capability: 'credential-store' });
                const formats = g.enabled ? caps.cardFormats : null;
                const fromDevice = device.card_formats != null;
                return (
                  <LiveTile $unsupported={!g.enabled} title={g.reason ?? undefined}>
                    <div className="label">
                      <span>Card formats</span>
                      {!g.enabled && <UnsupportedBadge reason={g.reason} />}
                    </div>
                    <div className="value" style={{ fontSize: 14, flexWrap: 'wrap' }}>
                      {formats && formats.length > 0
                        ? formats.map((f) => CARD_FORMAT_LABELS[f] ?? f).join(', ')
                        : '—'}
                      {g.enabled && device.latch_interval_s != null && (
                        <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                          · {device.latch_interval_s}s latch
                        </span>
                      )}
                    </div>
                    <div className="hint">
                      {!g.enabled
                        ? g.reason
                        : (fromDevice
                            ? 'Card formats this lock can read, as reported by its firmware. '
                            : 'Card formats this board can read — the lock has not reported its own list yet. ')
                          + 'The latch is how long a momentary unlock holds the door; change it under Actions → Provisioning.'}
                    </div>
                  </LiveTile>
                );
              })()}
              <LiveTile style={{ gridColumn: '1 / -1' }}>
                <div className="label">On the lock</div>
                <div className="value" style={{ fontSize: 16 }}>
                  {device.fw_counts?.credentials != null
                    ? `${device.fw_counts.credentials} ${pluralize('credential', device.fw_counts.credentials)}`
                    : '—'}
                  {device.fw_counts?.shifts != null && (
                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                      · {device.fw_counts.shifts} {pluralize('shift', device.fw_counts.shifts)}
                    </span>
                  )}
                  {device.fw_counts?.holidays != null && (
                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                      · {device.fw_counts.holidays} {pluralize('holiday', device.fw_counts.holidays)}
                    </span>
                  )}
                </div>
                <div className="hint">
                  {device.state_synced_at
                    ? `Records stored on the lock itself, as of ${relativeTime(device.state_synced_at)}. If these don't match your credential list, push an update.`
                    : 'Records stored on the lock itself — reported after the first state check.'}
                </div>
              </LiveTile>
              <LiveTile style={{ gridColumn: '1 / -1' }}>
                <div className="label">Last seen</div>
                <div className="value" style={{ fontSize: 16 }}>
                  {relativeTime(device.last_seen)}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8' }}>
                  {formatAbsolute(device.last_seen)}
                </div>
                <div className="hint">{lastSeenHint(device.status)}</div>
              </LiveTile>
            </LiveGrid>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader><h2>Details</h2></PanelHeader>
          <PanelBody>
            <dl style={{ margin: 0 }}>
              <DetailRow>
                <dt>Serial</dt>
                <dd><span className="mono">{device.device_id}</span></dd>
              </DetailRow>
              <DetailRow>
                <dt>Board</dt>
                <dd>
                  {device.board?.display_name ?? device.device_type.toUpperCase()}
                  {device.hardware_version && (
                    <span style={{ marginLeft: 6, color: '#94a3b8', fontWeight: 500 }}>
                      rev {device.hardware_version}
                    </span>
                  )}
                </dd>
              </DetailRow>
              {device.manufacturer && !device.board?.display_name && (
                <DetailRow>
                  <dt>Manufacturer</dt>
                  <dd>{device.manufacturer}</dd>
                </DetailRow>
              )}
              <DetailRow>
                <dt>Firmware</dt>
                <dd>{device.firmware_version || <span className="empty">—</span>}</dd>
              </DetailRow>
              <DetailRow>
                <dt>Location</dt>
                <dd>{device.location || <span className="empty">—</span>}</dd>
              </DetailRow>
              <DetailRow>
                <dt>Notes</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>
                  {device.notes || <span className="empty">—</span>}
                </dd>
              </DetailRow>
            </dl>
          </PanelBody>
        </Panel>
      </Grid>
      </>
      )}

      {editOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setEditOpen(false); }}>
          <Dialog>
            <form onSubmit={handleSave}>
              <DialogHeader>
                <h2>Edit device</h2>
                <IconButton type="button" onClick={() => setEditOpen(false)}><IconX size={16} /></IconButton>
              </DialogHeader>
              <DialogBody>
                <Field>
                  <FieldLabel>Name *</FieldLabel>
                  <Input
                    value={form.device_name ?? ''}
                    onChange={(e) => setForm({ ...form, device_name: e.target.value })}
                    required autoFocus maxLength={255}
                  />
                </Field>
                <Field>
                  <FieldLabel>Location</FieldLabel>
                  <Input
                    value={form.location ?? ''}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. Main entrance"
                    maxLength={255}
                  />
                </Field>
                <Field>
                  <FieldLabel>Notes</FieldLabel>
                  <Textarea
                    value={form.notes ?? ''}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional"
                  />
                </Field>
                {saveError && <ErrorBanner>{saveError}</ErrorBanner>}
              </DialogBody>
              <DialogFooter>
                <SecondaryButton type="button" onClick={() => setEditOpen(false)}>Cancel</SecondaryButton>
                <PrimaryButton type="submit" disabled={saving}>
                  {saving ? 'Saving…' : <><IconCheck size={16} /> Save changes</>}
                </PrimaryButton>
              </DialogFooter>
            </form>
          </Dialog>
        </Backdrop>
      )}
    </>
  );
}

export default DeviceDetailPage;
