/**
 * Devices API client (end-user-admin scope).
 *
 * Reads only — mutations land later once we wire device commands back
 * through the Simkura client (rename, unlock, lockdown, reboot).
 */

import api from '../api';

export type DeviceStatus    = 'online' | 'offline' | 'error' | 'maintenance';
export type DoorState       = 'locked' | 'unlocked' | 'lockdown' | 'unknown';
export type DevicePowerMode = 'active' | 'sleep' | 'deep_sleep';

export interface Device {
  id: number;
  device_id: string;
  device_type: string;
  firmware_version: string | null;
  device_name: string;
  location: string | null;
  notes: string | null;
  status: DeviceStatus;
  door_state: DoorState;
  battery_percent: number | null;
  power_mode: DevicePowerMode;
  /** Cellular carrier + raw signal value. Reported by newer firmwares only —
   *  null means the device hasn't reported connectivity yet. */
  carrier: string | null;
  signal_strength: number | null;
  /** Richer state mirrored from Simkura's /state poll. Null = not reported
   *  yet (old firmware / never polled). */
  door_override: boolean | null;
  deep_sleep_duration_s: number | null;
  /** OSDP reader link stage: 0=Root … 3=Connected. */
  osdp_stage: number | null;
  /** Record counts as reported BY the firmware (device-side truth). */
  fw_counts: {
    credentials: number | null;
    shifts: number | null;
    holidays: number | null;
    door_shifts: number | null;
  };
  /** Provisioned reader type: 0=26-bit Wiegand, 1=32-bit HID, 2=Mifare 1k. */
  config_card_type: number | null;
  /** Momentary-unlock hold time in seconds. */
  latch_interval_s: number | null;
  /** Last successful state poll — freshness of the fields above. */
  state_synced_at: string | null;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
  /** Deactivation audit. Null on active devices. */
  deleted_at:  string | null;
  released_at: string | null;
  released_by: number | null;
}

/**
 * Sync summary returned alongside the device on GET /api/devices/:id.
 *
 * Per-junction counts (credentials + shifts):
 *   add       — active rows that haven't been submitted to the firmware yet
 *   submitted — accepted by Simkura (202), awaiting device confirmation
 *               (NB: v2 doesn't correlate device acks to command records
 *                yet, so for cred/shift this is the terminal state)
 *   remove    — soft-deleted rows still cached on the firmware
 *   total     — active rows in the junction
 *
 * Banner copy:
 *   has_pending  → orange "Device is out of sync" (action required)
 *   has_awaiting → blue "Pushed; device confirmation pending" (no action)
 */
export interface DeviceSync {
  has_pending: boolean;
  has_awaiting: boolean;
  credentials: { add: number; submitted: number; remove: number; total: number };
  shifts:      { add: number; submitted: number; remove: number; total: number };
}

/** Response from POST /api/devices/:id/push (and /clear, same shape minus
 *  mode/noop). `sequence` is the per-step log. */
export interface PushResult {
  ok: boolean;
  hwId: string | null;
  /** 'delta' sends only pending changes; 'rebuild' (force) wipes and re-pushes everything. */
  mode?: 'delta' | 'rebuild';
  /** True when a delta push found nothing pending — no commands were sent. */
  noop?: boolean;
  sequence: Array<{
    command: string;
    status: 'ok' | 'failed' | 'skipped';
    detail?: string;
  }>;
  /** True when the push was refused because a previous rebuild is still
   *  queued on Simkura's side (sleeping device). `queued` is how many
   *  commands are waiting. POST body { force: true } overrides. */
  blocked?: boolean;
  queued?: number;
  error?: string;
}

export interface DeviceListResponse {
  devices: Device[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListParams {
  search?: string;
  status?: DeviceStatus;
  limit?: number;
  offset?: number;
  /** When true, include soft-deleted (deactivated) devices in the result. */
  include_deactivated?: boolean;
}

export interface DevicePatch {
  device_name?: string;
  location?: string | null;
  notes?: string | null;
}

export type EventSeverity = 'info' | 'warning' | 'error';

export interface DeviceEvent {
  id: number;
  device_id: string;
  event_type: string;
  event_category: string | null;
  severity: EventSeverity;
  event_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  simkura_event_id: string | null;
  simkura_webhook_id: number | null;
  event_timestamp: string | null;
  received_at: string;
  /** Credential/person the presented PIN/card resolved to (access events only, null if unmatched). */
  credential_id: number | null;
  person_id: number | null;
  person_name: string | null;
  credential_name: string | null;
}

export interface EventsResponse {
  events: DeviceEvent[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Company-wide event row (GET /api/devices/events). Same shape as
 * DeviceEvent plus the owning device's internal id + name so feed rows
 * can link to /app/devices/:device_pk.
 */
export interface CompanyEvent extends DeviceEvent {
  device_pk: number;
  device_name: string;
}

export interface CompanyEventsResponse {
  events: CompanyEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface EventsParams {
  limit?: number;
  offset?: number;
  type?: string;
}

/**
 * A command still in flight to the lock, from simkura-core's per-device
 * queue (GET /api/devices/:id/queue proxies it — the app stores nothing).
 * 'queued' rows sit until a sleeping device's next wake; an empty queue
 * means the lock has everything we've sent. command_type carries the v2
 * operation name (e.g. 'lock.unlock', 'credentials.add').
 */
export interface QueuedCommand {
  id: number | string;
  command_type: string;
  status: 'queued' | 'sending';
  attempts: number;
  created_at: string | null;
  expires_at: string | null;
  error_message: string | null;
}

export interface QueueResponse {
  /** False when Simkura is unconfigured/unreachable — queue state unknown. */
  available: boolean;
  queue: QueuedCommand[];
}

export const devicesApi = {
  list: (params: ListParams = {}) =>
    api.get<DeviceListResponse, DeviceListResponse>('/api/devices', { params }),

  get: (id: number) =>
    api.get<{ device: Device; sync: DeviceSync }, { device: Device; sync: DeviceSync }>(
      `/api/devices/${id}`,
    ),

  update: (id: number, payload: DevicePatch) =>
    api.patch<{ device: Device }, { device: Device }>(`/api/devices/${id}`, payload)
       .then((r) => r.device),

  events: (id: number, params: EventsParams = {}) =>
    api.get<EventsResponse, EventsResponse>(`/api/devices/${id}/events`, { params }),

  /** Recent events across every device in the company (overview feed). */
  recentEvents: (params: Pick<EventsParams, 'limit' | 'offset'> = {}) =>
    api.get<CompanyEventsResponse, CompanyEventsResponse>('/api/devices/events', { params }),

  /** Commands still in flight to the lock (Simkura per-device queue). */
  queue: (id: number) =>
    api.get<QueueResponse, QueueResponse>(`/api/devices/${id}/queue`),

  /**
   * Forward a command to the device via Simkura's v2 API.
   * Whitelisted server-side: lock.unlock | lock.set-state | lock.configure |
   * device.reboot.
   * lock.set-state requires payload.state ∈ {'locked','unlocked','lockdown','normal'}
   * — 'normal' clears the override and returns the door to its schedule;
   * the other values pin the door in that state until changed.
   * lock.configure accepts ≥1 of payload.cardType
   * ('wiegand-26'|'hid-32'|'mifare-classic-1k'), payload.readerFrequency
   * ('prox'|'smartCard'|'nfc'|'ble'), payload.latchInterval (1–255 s).
   *
   * @param hwId Hardware device_id (unique at the source). Platform admins
   *   can target devices not yet claimed by any tenant.
   */
  sendCommand: (hwId: string, command: string, payload?: Record<string, unknown>) =>
    api.post<
      { success: boolean; command: string; device_id: string; simkura?: unknown },
      { success: boolean; command: string; device_id: string; simkura?: unknown }
    >(`/api/devices/${encodeURIComponent(hwId)}/commands`, { command, payload }),

  /**
   * Push the device's pending credential + shift changes to the firmware.
   * By default the server sends a delta — credentials.remove for removals,
   * credentials.add for new attachments, and a shifts-only rebuild when any
   * schedule changed (the firmware has no per-shift delete). With force:true it
   * instead wipes the lock and re-pushes the full active state (also
   * skipping the queued-rebuild pre-flight) — the escape hatch for a lock
   * that has drifted from the DB.
   *
   * Returns PushResult with a per-step log even on failure, so the UI can
   * show what succeeded before the sequence stopped.
   */
  pushDevice: (id: number, opts: { force?: boolean } = {}) =>
    api.post<PushResult, PushResult>(`/api/devices/${id}/push`, opts.force ? { force: true } : {}),

  /**
   * Wipe the lock: clears schedules, credentials, and shifts on the firmware
   * and removes the matching assignments from the DB. The device stays
   * claimed — the lock reports 0 credentials / 0 shifts on its next check-in.
   */
  clearDevice: (id: number) =>
    api.post<PushResult, PushResult>(`/api/devices/${id}/clear`, {}),

  /**
   * Search Simkura's device pool for unclaimed devices whose hardware id
   * ends with the given suffix. Suffix is matched case-insensitively;
   * fewer than 3 chars returns an empty list.
   */
  searchUnclaimed: (suffix: string) =>
    api.get<
      { devices: UnclaimedDevice[]; match_suffix: string },
      { devices: UnclaimedDevice[]; match_suffix: string }
    >('/api/devices/unclaimed', { params: { suffix } }),

  /**
   * Claim a device for the caller's company. Returns the new device row.
   * 409 if the device is already claimed; 404 if Simkura doesn't know it.
   */
  claim: (payload: { device_id: string; device_name: string }) =>
    api.post<{ device: Device }, { device: Device }>(
      '/api/devices/claim',
      payload,
    ).then((r) => r.device),

  /**
   * Soft-delete (deactivate) a claimed device.
   * Cannot be reversed from the end-user UI — re-claiming requires a
   * platform-admin restore.
   */
  release: (id: number) =>
    api.post<{ device: Device }, { device: Device }>(
      `/api/devices/${id}/release`,
    ).then((r) => r.device),
};

export interface UnclaimedDevice {
  device_id: string;
  device_type: string;
  firmware_version: string | null;
  status: string;
  last_seen: string | null;
  registered_at: string | null;
}

// ── Platform Admin fleet view (Simkura + DB merge) ───────────────────────────

export interface PlatformDevice {
  hardware_device_id: string;
  device_name: string | null;
  device_type: string | null;
  firmware_version: string | null;
  company_id: number | null;
  company_name: string | null;
  claimed: boolean;
  in_simkura: boolean;
  status: DeviceStatus | 'unknown';
  door_state: DoorState | null;
  battery_percent: number | null;
  carrier: string | null;
  signal_strength: number | null;
  last_seen: string | null;
  registered_at: string | null;
}

export interface PlatformFleetResponse {
  devices: PlatformDevice[];
  total: number;
  claimed_count: number;
  unclaimed_count: number;
  simkura: { available: boolean; error: string | null; count: number };
}

export interface PlatformSyncResult {
  ok:       boolean;
  fetched:  number;
  inserted: number;
  skipped:  number;
  /** Set when the worker couldn't run (e.g. Simkura key missing). */
  skipped_reason?: string;
  /** True when a sync was already in progress on the server. */
  busy?:    boolean;
}

export const platformDevicesApi = {
  list: () =>
    api.get<PlatformFleetResponse, PlatformFleetResponse>('/api/platform/devices'),

  /** Triggers the device-discovery worker on demand. Same code path as the
   *  daily scheduled tick — pulls Simkura's full list and inserts any
   *  newcomers into our `devices` table as unclaimed rows. */
  syncNow: () =>
    api.post<PlatformSyncResult, PlatformSyncResult>('/api/platform/devices/sync'),
};

// ── Per-device schedules (shifts) ────────────────────────────────────────────

/** Day numbers: 0=Sun, 1=Mon, … 6=Sat. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DeviceShift {
  id: number;
  shift_name: string;
  description: string | null;
  /** 'HH:MM' (24h). */
  start_time: string;
  /** 'HH:MM' (24h). Cross-midnight is allowed (start_time > end_time). */
  end_time: string;
  days_of_week: DayOfWeek[];
  status: 'active' | 'inactive';
  applied_at: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceShiftPayload {
  shift_name: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  days_of_week: DayOfWeek[];
  status?: 'active' | 'inactive';
}

export const deviceShiftsApi = {
  list: (deviceId: number) =>
    api.get<{ shifts: DeviceShift[] }, { shifts: DeviceShift[] }>(
      `/api/devices/${deviceId}/shifts`,
    ).then((r) => r.shifts),

  create: (deviceId: number, payload: DeviceShiftPayload) =>
    api.post<{ shift: DeviceShift }, { shift: DeviceShift }>(
      `/api/devices/${deviceId}/shifts`, payload,
    ).then((r) => r.shift),

  update: (deviceId: number, shiftId: number, payload: Partial<DeviceShiftPayload>) =>
    api.patch<{ shift: DeviceShift }, { shift: DeviceShift }>(
      `/api/devices/${deviceId}/shifts/${shiftId}`, payload,
    ).then((r) => r.shift),

  remove: (deviceId: number, shiftId: number) =>
    api.delete<void, void>(`/api/devices/${deviceId}/shifts/${shiftId}`),
};

// ── Per-device credentials (which credentials are installed on this door) ────

import type { CredentialStatus, CredentialType } from './credentials';

/**
 * A credential attached to a device, returned by the device-credentials
 * endpoints. Same shape as a regular Credential but enriched with the
 * junction's applied_at / synced_at and a snapshot of the owning person
 * (left-joined; null when the credential has no person assigned).
 */
export interface AttachedCredential {
  id: number;
  person_id: number | null;
  person_first_name: string | null;
  person_last_name: string | null;
  person_employee_id: string | null;
  credential_name: string;
  credential_type: CredentialType;
  credential_value: string | null;
  facility_code: string | null;
  card_number: string | null;
  status: CredentialStatus;
  applied_at: string | null;
  synced_at: string | null;
}

export const deviceCredentialsApi = {
  list: (deviceId: number) =>
    api.get<{ credentials: AttachedCredential[] }, { credentials: AttachedCredential[] }>(
      `/api/devices/${deviceId}/credentials`,
    ).then((r) => r.credentials),

  attach: (deviceId: number, credentialId: number) =>
    api.post<{ credential: AttachedCredential }, { credential: AttachedCredential }>(
      `/api/devices/${deviceId}/credentials`,
      { credential_id: credentialId },
    ).then((r) => r.credential),

  /**
   * Attach every credential owned by `personId` to the device in one call.
   * Idempotent — already-attached credentials are skipped server-side.
   * 409 if the person has no credentials yet.
   */
  attachByPerson: (deviceId: number, personId: number) =>
    api.post<
      { attached: number; already_attached: number; credentials: AttachedCredential[] },
      { attached: number; already_attached: number; credentials: AttachedCredential[] }
    >(`/api/devices/${deviceId}/credentials/bulk`, { person_id: personId }),

  /**
   * Attach every credential owned by any active member of `groupId` to
   * the device. Same idempotent + revive semantics as attachByPerson.
   * 409 if the group has no member credentials.
   */
  attachByGroup: (deviceId: number, groupId: number) =>
    api.post<
      { attached: number; already_attached: number; credentials: AttachedCredential[] },
      { attached: number; already_attached: number; credentials: AttachedCredential[] }
    >(`/api/devices/${deviceId}/credentials/bulk-group`, { group_id: groupId }),

  detach: (deviceId: number, credentialId: number) =>
    api.delete<void, void>(`/api/devices/${deviceId}/credentials/${credentialId}`),

  /**
   * Detach every credential owned by `personId` from the device. Synced
   * attachments become pending removals (deactivated on the next push);
   * never-synced ones are removed immediately. Idempotent — detached is 0
   * when nothing of theirs was on the door.
   */
  detachByPerson: (deviceId: number, personId: number) =>
    api.post<
      { detached: number; credentials: AttachedCredential[] },
      { detached: number; credentials: AttachedCredential[] }
    >(`/api/devices/${deviceId}/credentials/bulk-detach`, { person_id: personId }),

  /**
   * Detach every credential owned by any member of `groupId` from the
   * device. Same semantics as detachByPerson, fanned out across the group.
   */
  detachByGroup: (deviceId: number, groupId: number) =>
    api.post<
      { detached: number; credentials: AttachedCredential[] },
      { detached: number; credentials: AttachedCredential[] }
    >(`/api/devices/${deviceId}/credentials/bulk-group-detach`, { group_id: groupId }),
};
