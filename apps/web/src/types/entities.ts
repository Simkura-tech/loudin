/**
 * Entity types aligned with the new schema in apps/api/database/migrations/.
 *
 * Conventions
 * - Two user types: Admin (1), User (2). What kind of admin (platform admin,
 *   reseller admin, end-user admin) is determined by company.company_type.
 * - Three company types: 'platform', 'end_user', 'reseller'.
 * - Door-access credential holders live in `people` (separate from `users`).
 */

// ── Users ──────────────────────────────────────────────────────────────────

export const USER_TYPE_IDS = {
  ADMIN: 1,
  USER: 2,
} as const;

export type UserTypeId = typeof USER_TYPE_IDS[keyof typeof USER_TYPE_IDS];

export interface User {
  id: number;
  company_id: number;
  user_type_id: UserTypeId;
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string | null;
  status: 'active' | 'inactive' | 'suspended' | 'pending';
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
  // Joined from companies (when the API returns it)
  company_name?: string;
  company_type?: CompanyType;
}

// ── Companies ──────────────────────────────────────────────────────────────

export const COMPANY_TYPES = {
  PLATFORM: 'platform',
  END_USER: 'end_user',
  RESELLER: 'reseller',
} as const;

export type CompanyType = typeof COMPANY_TYPES[keyof typeof COMPANY_TYPES];

export interface Company {
  id: number;
  name: string;
  company_type: CompanyType;
  status: 'active' | 'inactive' | 'suspended' | 'canceled';
  company_email?: string | null;
  company_phone?: string | null;
  company_url?: string | null;
  parent_company_id?: number | null;
  parent_locked_at?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  simkura_api_key?: string | null;
  simkura_api_url?: string | null;
  // Suspension / cancellation audit columns
  suspended_at?: string | null;
  suspended_by?: number | null;
  suspension_reason?: string | null;
  reactivated_at?: string | null;
  reactivated_by?: number | null;
  canceled_at?: string | null;
  canceled_by?: number | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// ── People (door-access credential holders) ────────────────────────────────

export interface Person {
  id: number;
  company_id: number;
  first_name: string;
  last_name: string;
  email?: string | null;            // contact only — not for auth
  phone_number?: string | null;
  employee_id?: string | null;
  department?: string | null;
  job_title?: string | null;
  group_id?: number | null;
  status: 'active' | 'inactive' | 'suspended';
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PeopleGroup {
  id: number;
  company_id: number;
  name: string;
  description?: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

// ── Devices ────────────────────────────────────────────────────────────────

export type DeviceStatus = 'online' | 'offline' | 'error' | 'maintenance';
export type DoorState   = 'locked' | 'unlocked' | 'lockdown' | 'unknown';
export type PowerMode   = 'active' | 'sleep' | 'deep_sleep';

export interface Device {
  id: number;
  company_id?: number | null;                // null = unclaimed / pool
  reseller_company_id?: number | null;
  device_id: string;                          // hardware serial / UUID
  reseller_code?: string | null;
  device_type: string;                        // e.g. 'sb6'
  firmware_version?: string | null;
  device_name: string;
  location?: string | null;
  notes?: string | null;
  status: DeviceStatus;
  last_seen?: string | null;
  door_state: DoorState;
  battery_percent?: number | null;            // 0–100
  power_mode: PowerMode;
  assigned_by?: number | null;
  assigned_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Credentials ────────────────────────────────────────────────────────────

export type CredentialType = 'pin' | 'HID' | 'mifare';

export interface Credential {
  id: number;
  company_id: number;
  person_id?: number | null;
  credential_name: string;
  credential_type: CredentialType;
  credential_value?: string | null;          // PIN value
  facility_code?: string | null;             // card only
  card_number?: string | null;               // card only
  status: 'active' | 'inactive' | 'expired' | 'revoked';
  valid_from?: string | null;
  valid_until?: string | null;
  description?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Shifts ─────────────────────────────────────────────────────────────────

export interface Shift {
  id: number;
  company_id: number;
  shift_name: string;
  description?: string | null;
  start_time: string;                         // 'HH:MM:SS'
  end_time: string;                           // 'HH:MM:SS'
  days_of_week: number[];                     // 0=Sun … 6=Sat
  valid_from?: string | null;                 // date
  valid_until?: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

// ── Holidays ───────────────────────────────────────────────────────────────

export type HolidayAccessMode = 'open' | 'restricted' | 'locked';

export interface Holiday {
  id: number;
  company_id: number;
  holiday_name: string;
  description?: string | null;
  start_datetime: string;
  end_datetime: string;
  access_mode: HolidayAccessMode;
  custom_hours?: { start_time?: string; end_time?: string } | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}
