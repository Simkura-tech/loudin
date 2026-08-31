/**
 * Credential type registry — single source of truth for credential_type values.
 *
 * Adding a new credential_type means:
 *   1. Add it to the DB CHECK constraint (010_create_credentials.sql).
 *   2. Add the value to the CredentialType union in services/credentials.ts.
 *   3. Add one entry to CREDENTIAL_TYPES below.
 *
 * No other file should hard-code the type list. The picker tiles, list-item
 * display, field rendering, and submit-time validation all read from here.
 */

import type { ReactNode } from 'react';
import {
  IconKey,
  IconCreditCard,
  IconShieldCheck,
} from '@tabler/icons-react';
import type {
  CredentialPayload,
  CredentialType,
} from '../../services/access/credentials';

/**
 * Per-credential-type form field. The modal walks `config.fields` and
 * renders one of these for each entry — no hard-coded if/else on type.
 */
export interface CredentialField {
  /** Which key on CredentialPayload this field writes. */
  name: 'credential_value' | 'card_number' | 'facility_code';
  label: string;
  placeholder: string;
  required: boolean;
  inputMode?: 'numeric' | 'text';
  maxLength?: number;
  /**
   * Normalize the raw input value as the user types. Useful to e.g. strip
   * non-digits from a PIN. Return the corrected value.
   */
  normalize?: (raw: string) => string;
}

export interface CredentialTypeConfig {
  value: CredentialType;
  label: string;
  hint:  string;
  icon:  ReactNode;
  /** Input fields this type uses, in render order. */
  fields: CredentialField[];
  /**
   * Validate the payload at submit time. Return null on success or a
   * single error string to surface in the modal's error banner.
   */
  validate: (payload: CredentialPayload) => string | null;
}

// ── Reusable validators ──────────────────────────────────────────────────────

const stripNonDigits = (s: string) => s.replace(/\D/g, '');

function nonEmpty(value: string | null | undefined): boolean {
  return !!(value && value.trim());
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const CREDENTIAL_TYPES: CredentialTypeConfig[] = [
  {
    value: 'pin',
    label: 'PIN',
    hint:  '5–8 digits',
    icon:  <IconKey size={18} strokeWidth={1.75} />,
    fields: [
      {
        name: 'credential_value',
        label: 'PIN value *',
        placeholder: '5–8 digits',
        required: true,
        inputMode: 'numeric',
        maxLength: 8,
        normalize: stripNonDigits,
      },
    ],
    validate: (p) => {
      const v = stripNonDigits(p.credential_value ?? '');
      if (!v) return 'PIN value is required';
      if (v.length < 5 || v.length > 8) return 'PIN must be 5–8 digits';
      return null;
    },
  },

  {
    value: 'HID',
    label: 'Prox (26 bit)',
    hint:  'Wiegand 26-bit prox card',
    icon:  <IconCreditCard size={18} strokeWidth={1.75} />,
    fields: [
      {
        name: 'card_number',
        label: 'Card number *',
        placeholder: 'e.g. H-9921',
        required: true,
        maxLength: 32,
      },
      {
        name: 'facility_code',
        label: 'Facility code',
        placeholder: 'Optional (digits)',
        required: false,
        inputMode: 'numeric',
        maxLength: 10,
        normalize: stripNonDigits,
      },
    ],
    validate: (p) => {
      if (!nonEmpty(p.card_number)) return 'Card number is required';
      if (p.facility_code && !/^\d*$/.test(p.facility_code)) {
        return 'Facility code must be numeric';
      }
      return null;
    },
  },

  {
    value: 'mifare',
    label: 'MIFARE',
    hint:  'MIFARE card',
    icon:  <IconShieldCheck size={18} strokeWidth={1.75} />,
    fields: [
      {
        name: 'card_number',
        label: 'Card number *',
        placeholder: 'e.g. 04A1B2C3',
        required: true,
        maxLength: 32,
      },
      {
        name: 'facility_code',
        label: 'Facility code',
        placeholder: 'Optional',
        required: false,
        maxLength: 10,
      },
    ],
    validate: (p) => {
      if (!nonEmpty(p.card_number)) return 'Card number is required';
      return null;
    },
  },
];

/**
 * Lookup a type's config. Throws if the type isn't registered — that's a
 * programming error (would mean DB state diverged from this file).
 */
export function getTypeConfig(type: CredentialType): CredentialTypeConfig {
  const found = CREDENTIAL_TYPES.find((c) => c.value === type);
  if (!found) {
    throw new Error(`Unregistered credential_type: ${type}. Add it to CREDENTIAL_TYPES.`);
  }
  return found;
}
