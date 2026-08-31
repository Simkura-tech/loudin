/**
 * Shared rendering for device_events rows — used by the per-device activity
 * feed (DeviceActivityFeed) and the company-wide feed on the overview page.
 *
 * If new Simkura event types appear, renderEvent falls back to a generic row
 * rather than rendering blank.
 */

import {
  IconActivity,
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
  IconCheck,
  IconLock,
  IconLockOpen,
  IconLockSquare,
  IconPower,
  IconQuestionMark,
  IconSend,
  IconX,
} from '@tabler/icons-react';

type EventData = Record<string, unknown>;

function getString(data: EventData, key: string): string | null {
  const v = data[key];
  return typeof v === 'string' ? v : null;
}
function getNumber(data: EventData, key: string): number | null {
  const v = data[key];
  return typeof v === 'number' ? v : null;
}
function getBool(data: EventData, key: string): boolean {
  return data[key] === true;
}

function maskPin(pin: string): string {
  if (!pin) return '';
  return '•'.repeat(Math.min(pin.length, 8));
}

export interface Rendered {
  icon: React.ReactNode;
  title: string;
  detail: string | null;
}

/**
 * Who an access event resolved to, from the event row's person/credential
 * link (matched server-side at ingest). When present, access rows show the
 * person's name ("Pete Jones · PIN") instead of the masked raw value.
 */
export interface EventWho {
  person_name?: string | null;
  credential_name?: string | null;
}

/**
 * Extract the presented credential from an access event's data. The carrier
 * is `credential` (granted) or `attemptedCredential` (denied), and is either
 * an object ({ pin: [1,2,3,4] } | { pin: "1234" } | { cardNumber, facilityCode })
 * or a legacy flat PIN string.
 */
function presentedCredential(data: EventData): {
  method: 'pin' | 'card' | null;
  pinMasked: string | null;
  cardNumber: string | null;
} {
  const cred = data.credential ?? data.attemptedCredential;
  if (cred && typeof cred === 'object') {
    const obj = cred as Record<string, unknown>;
    if (Array.isArray(obj.pin)) {
      return { method: 'pin', pinMasked: maskPin(obj.pin.join('')), cardNumber: null };
    }
    if (typeof obj.pin === 'string' || typeof obj.pin === 'number') {
      return { method: 'pin', pinMasked: maskPin(String(obj.pin)), cardNumber: null };
    }
    if (obj.cardNumber != null) {
      return { method: 'card', pinMasked: null, cardNumber: String(obj.cardNumber) };
    }
  } else if (typeof cred === 'string' && cred) {
    return { method: 'pin', pinMasked: maskPin(cred), cardNumber: null };
  }
  return { method: null, pinMasked: null, cardNumber: null };
}

// Map legacy snake_case event types (older Simkura deliveries) to the
// canonical dot notation in INTEGRATION_REST.md. Stored data hasn't been
// rewritten — events in the DB from before the rename still render with
// the right icon thanks to this lookup.
const LEGACY_EVENT_ALIAS: Record<string, string> = {
  access_granted:     'access.granted',
  access_denied:      'access.denied',
  lock_state_changed: 'lock.state_changed',
  device_wake:        'device.wake',
  device_sleep:       'device.sleep',
  device_restart:     'device.restart',
  command_sent:       'command.sent',
  command_failed:     'command.failed',
};

function normalizeEventType(type: string): string {
  return LEGACY_EVENT_ALIAS[type] ?? type;
}

export function renderEvent(rawType: string, data: EventData, who?: EventWho): Rendered {
  const type = normalizeEventType(rawType);
  // Prefer the person; a person-less credential still beats a masked value.
  const name = who?.person_name || who?.credential_name || null;
  switch (type) {
    case 'access.granted': {
      const { method, pinMasked, cardNumber } = presentedCredential(data);
      const detail = name
        ? `${name}${method === 'pin' ? ' · PIN' : method === 'card' ? ' · card' : ''}`
        : method === 'pin'  ? `PIN ${pinMasked} matched`
        : method === 'card' ? `Card ${cardNumber}`
        : null;
      return {
        icon: <IconCheck size={16} strokeWidth={2.2} />,
        title: 'Access granted',
        detail: detail ?? (getString(data, 'reason') || null),
      };
    }
    case 'access.denied': {
      const { method, pinMasked, cardNumber } = presentedCredential(data);
      const who = name
        ?? (method === 'pin'  ? `Attempted ${pinMasked}`
          : method === 'card' ? `Attempted card ${cardNumber}`
          : null);
      const reason = getString(data, 'reason');
      const detail = [who, reason ? reason.replace(/_/g, ' ') : null]
        .filter(Boolean).join(' · ');
      return {
        icon: <IconX size={16} strokeWidth={2.2} />,
        title: 'Access denied',
        detail: detail || 'Invalid credential',
      };
    }
    case 'lock.state_changed': {
      const state = (getString(data, 'lockState') || '').toLowerCase();
      const override = getBool(data, 'override');
      let icon: React.ReactNode = <IconQuestionMark size={16} />;
      let label = 'Lock state changed';
      if (state === 'locked')    { icon = <IconLock       size={16} strokeWidth={2} />; label = 'Locked'; }
      if (state === 'unlocked')  { icon = <IconLockOpen   size={16} strokeWidth={2} />; label = 'Unlocked'; }
      if (state === 'lockdown')  { icon = <IconLockSquare size={16} strokeWidth={2} />; label = 'Lockdown'; }
      return { icon, title: label, detail: override ? 'Manual override' : null };
    }
    case 'device.wake': {
      const battery = getString(data, 'batteryLevel');
      const creds   = getNumber(data, 'credentialCount');
      const shifts  = getNumber(data, 'shiftCount');
      const wakes   = getNumber(data, 'wakeUpCount');
      const parts = [];
      if (battery) parts.push(`Battery ${battery}`);
      if (creds  != null) parts.push(`${creds} credentials`);
      if (shifts != null) parts.push(`${shifts} shifts`);
      if (wakes  != null && !parts.length) parts.push(`Wake #${wakes}`);
      return {
        icon: <IconArrowUpRight size={16} strokeWidth={2} />,
        title: 'Device woke up',
        detail: parts.length ? parts.join(' · ') : null,
      };
    }
    case 'device.sleep': {
      const dur = getNumber(data, 'awakeDurationMs');
      const cmds = getNumber(data, 'commandsSent');
      const parts = [];
      if (dur  != null) parts.push(`Awake ${Math.round(dur / 1000)}s`);
      if (cmds != null) parts.push(`${cmds} commands`);
      return {
        icon: <IconArrowDownRight size={16} strokeWidth={2} />,
        title: 'Device went to sleep',
        detail: parts.length ? parts.join(' · ') : null,
      };
    }
    case 'device.restart': {
      const isFactory = getBool(data, 'isFactoryReset');
      const reason = getString(data, 'reason');
      return {
        icon: <IconPower size={16} strokeWidth={2} />,
        title: isFactory ? 'Factory reset' : 'Device rebooted',
        detail: reason || null,
      };
    }
    case 'command.sent': {
      // code 1 = unlock confirmed, 3 = provision confirmed (per INTEGRATION_REST.md).
      const code = getNumber(data, 'code');
      const label =
        code === 1 ? 'Unlock confirmed'
      : code === 3 ? 'Provisioning confirmed'
      :              'Command confirmed';
      return {
        icon: <IconSend size={16} strokeWidth={2} />,
        title: label,
        detail: null,
      };
    }
    case 'command.failed': {
      const cmd = getString(data, 'command');
      const err = getString(data, 'error');
      return {
        icon: <IconAlertTriangle size={16} strokeWidth={2} />,
        title: cmd ? `${cmd} failed` : 'Command failed',
        detail: err,
      };
    }
    default: {
      // Any event that resolved to a person/credential (e.g. an 'admit' that
      // matched a stored PIN/card) names who got in — same as the access.*
      // rows above. Unmatched events just render their title.
      const { method } = presentedCredential(data);
      const detail = name
        ? `${name}${method === 'pin' ? ' · PIN' : method === 'card' ? ' · card' : ''}`
        : null;
      return {
        icon: name ? <IconCheck size={16} strokeWidth={2.2} /> : <IconActivity size={16} strokeWidth={2} />,
        // Title-case unknown event types so new Simkura types still render readably.
        title: rawType.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        detail,
      };
    }
  }
}

// ── Time helpers ─────────────────────────────────────────────────────────────

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const REL_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year',    365 * 24 * 60 * 60_000],
  ['month',    30 * 24 * 60 * 60_000],
  ['day',           24 * 60 * 60_000],
  ['hour',               60 * 60_000],
  ['minute',                  60_000],
  ['second',                   1_000],
];
export function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  for (const [unit, ms] of REL_UNITS) {
    if (abs >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}
