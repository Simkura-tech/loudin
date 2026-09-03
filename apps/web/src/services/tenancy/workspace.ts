/**
 * Workspace API client — the signed-in user's company.
 */

import api from '../api';

export type CompanyType = 'platform' | 'end_user';
export type CompanyStatus = 'active' | 'inactive' | 'suspended' | 'canceled';

/** Notification preference toggles. Server stores as JSONB; unknown keys
 *  are stripped on PATCH. Defaults: opt-in to everything except marketing. */
export interface NotificationPreferences {
  device_incidents?:  boolean;
  weekly_digest?:     boolean;
  security_alerts?:   boolean;
  marketing_updates?: boolean;
}

export const NOTIFICATION_TOGGLES: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  { key: 'device_incidents',  label: 'Device incidents',  description: 'Email when a lock goes offline, errors, or its battery is critical.' },
  { key: 'security_alerts',   label: 'Security alerts',   description: 'New logins, password changes, suspicious activity.' },
  { key: 'weekly_digest',     label: 'Weekly digest',     description: 'A once-a-week summary of access events and changes.' },
  { key: 'marketing_updates', label: 'Marketing updates', description: 'Occasional product news and announcements. No daily noise.' },
];

export interface Workspace {
  id: number;
  name: string;
  company_type: CompanyType;
  status: CompanyStatus;
  company_email: string | null;
  company_phone: string | null;
  company_url: string | null;
  // Shipping (legacy "main") address
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  // Lead contact — a named person, separate from company_email/_phone.
  lead_contact_name:  string | null;
  lead_contact_email: string | null;
  lead_contact_phone: string | null;
  lead_contact_title: string | null;
  // Billing address (null when billing_same_as_shipping is true)
  billing_street:           string | null;
  billing_city:             string | null;
  billing_state:            string | null;
  billing_zip:              string | null;
  billing_country:          string | null;
  billing_same_as_shipping: boolean;
  // Identity / legal
  tax_id: string | null;
  // Notification preferences
  notification_preferences: NotificationPreferences;
  // Reserved parent-company link (unused since the reseller tier was
  // removed). Always null.
  parent_company_id:   number | null;
  parent_company_name: string | null;
  parent_locked_at:    string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspacePatch {
  name?: string;
  company_email?: string | null;
  company_phone?: string | null;
  company_url?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  lead_contact_name?:  string | null;
  lead_contact_email?: string | null;
  lead_contact_phone?: string | null;
  lead_contact_title?: string | null;
  billing_street?:           string | null;
  billing_city?:             string | null;
  billing_state?:            string | null;
  billing_zip?:              string | null;
  billing_country?:          string | null;
  billing_same_as_shipping?: boolean;
  tax_id?:                   string | null;
  notification_preferences?: NotificationPreferences;
}

export const workspaceApi = {
  get: () =>
    api.get<{ workspace: Workspace }, { workspace: Workspace }>('/api/workspace')
       .then((r) => r.workspace),

  update: (payload: WorkspacePatch) =>
    api.patch<{ workspace: Workspace }, { workspace: Workspace }>('/api/workspace', payload)
       .then((r) => r.workspace),
};
