/**
 * Device capability resolution — the one place the UI asks "can this
 * hardware do X?".
 *
 * Simkura publishes three tiers per device (mirrored by the API as
 * `capabilities` / `features` / `supported` on the device, and as the same
 * three on its catalog `board`):
 *
 *   capabilities  which blocks exist at all — lock-control, credential-store,
 *                 schedules, power, connectivity
 *   features      boolean flags for fields with no vocabulary, e.g.
 *                 door-position-sensing
 *   supported     allowed values per enum field keyed by contract path, e.g.
 *                 "doors.reader.technology" → ['prox', 'smartcard', …]
 *
 * Resolution order, per tier independently: **the board catalog is the
 * authority** — the device's catalog board when it has one, else the tiers
 * the device itself reported (for a board the catalog doesn't list), else
 * the SB6 fallback (the whole fleet predates the catalog, so an unknown
 * board is assumed to be an SB6 rather than assumed to support nothing).
 * Rendering a feature greyed out is a claim about the hardware, so a null
 * never turns into "unsupported".
 *
 * Card formats are the one device-specific list: the device reports what
 * its firmware actually implements, which is then intersected with what
 * the board's reader path can decode.
 *
 * Every gate returns `{ enabled, reason }`; `reason` is ready-to-show copy
 * naming the board, for a tooltip or a tile hint.
 */

import { useMemo } from 'react';
import type { Device, DeviceCapability } from '../services/access/devices';

export type CapabilitySource = 'device' | 'board' | 'fallback';

export interface Gate {
  enabled: boolean;
  /** Why it is disabled, naming the board. Null when enabled. */
  reason: string | null;
}

export interface GateRequirement {
  /** One capability, or several that must all be present. */
  capability?: DeviceCapability | DeviceCapability[];
  /** A boolean feature flag that must be true. */
  feature?: string;
  /** A [contractPath, value] pair that must appear in `supported`. */
  supported?: [string, string];
}

export interface DeviceCapabilities {
  /** Human name for the board, e.g. "Simkura SB6". Used in every reason. */
  boardName: string;
  source: Record<'capabilities' | 'features' | 'supported', CapabilitySource>;
  capabilities: ReadonlySet<string>;
  features: Readonly<Record<string, boolean>>;
  supported: Readonly<Record<string, readonly string[]>>;
  /** Effective card formats: the device's firmware-reported list narrowed
   *  to the board's `supported.cardFormats`; the board's list alone when
   *  the device hasn't reported; null when neither is known. */
  cardFormats: readonly string[] | null;
  numDoors: number;
  powerType: Device['power_type'];
  transport: Device['connectivity_transport'];
  has(capability: DeviceCapability): boolean;
  hasFeature(flag: string): boolean;
  values(path: string): readonly string[];
  supports(path: string, value: string): boolean;
  gate(requirement: GateRequirement): Gate;
}

/** The contract's documented fallback board (simkura-core FALLBACK_BOARD). */
export const SB6_FALLBACK = {
  capabilities: ['lock-control', 'credential-store', 'schedules', 'power', 'connectivity'] as const,
  features: { 'door-position-sensing': false } as Record<string, boolean>,
  supported: {
    'doors.reader.protocol':   ['osdp', 'wiegand'],
    'doors.reader.technology': ['prox', 'smartcard', 'nfc', 'ble', 'multi'],
    cardFormats:               ['26-bit', 'mifare-1k', 'hid-34', 'hid-37'],
    'power.batteryChemistry':  ['alkaline', 'lithium', 'li-ion'],
  } as Record<string, string[]>,
};

/** What each capability means to a person, for the greyed-out reason. */
const CAPABILITY_LABEL: Record<string, string> = {
  'lock-control':     'door lock control',
  'credential-store': 'on-device credential storage',
  schedules:          'schedule support',
  power:              'power reporting',
  connectivity:       'network reporting',
};

const FEATURE_LABEL: Record<string, string> = {
  'door-position-sensing': 'door position sensor',
};

const SUPPORTED_LABEL: Record<string, string> = {
  'doors.reader.protocol':   'reader protocol',
  'doors.reader.technology': 'reader technology',
  cardFormats:               'card format',
  'power.batteryChemistry':  'battery chemistry',
};

type CapabilityInput = Pick<
  Device,
  | 'device_type' | 'manufacturer' | 'board' | 'num_doors' | 'power_type'
  | 'connectivity_transport' | 'capabilities' | 'features' | 'supported' | 'card_formats'
>;

function boardNameOf(device: CapabilityInput | null): string {
  if (!device) return 'this device';
  if (device.board?.display_name) return device.board.display_name;
  const type = (device.device_type || '').toUpperCase() || 'device';
  return device.manufacturer ? `${device.manufacturer} ${type}` : type;
}

/** Board catalog first, the device's own report second, contract fallback last. */
function pick<T>(board: T | null | undefined, own: T | null | undefined, fallback: T): [T, CapabilitySource] {
  if (board != null) return [board, 'board'];
  if (own != null) return [own, 'device'];
  return [fallback, 'fallback'];
}

/** Pure resolver — the hook below just memoises it. */
export function resolveDeviceCapabilities(device: CapabilityInput | null): DeviceCapabilities {
  const board = device?.board ?? null;
  const boardName = boardNameOf(device);

  const [capList, capSource] = pick<readonly string[]>(
    board?.capabilities, device?.capabilities, SB6_FALLBACK.capabilities,
  );
  const [features, featSource] = pick<Record<string, boolean>>(
    board?.features, device?.features, SB6_FALLBACK.features,
  );
  const [supported, supSource] = pick<Record<string, string[]>>(
    board?.supported, device?.supported, SB6_FALLBACK.supported,
  );

  const capabilities = new Set(capList);

  // Card formats: firmware-reported ∩ board-decodable.
  const boardFormats = supported.cardFormats ?? null;
  const ownFormats   = device?.card_formats ?? null;
  const cardFormats  = ownFormats && boardFormats
    ? ownFormats.filter((f) => boardFormats.includes(f))
    : ownFormats ?? boardFormats;

  const has        = (c: DeviceCapability) => capabilities.has(c);
  const hasFeature = (f: string) => features[f] === true;
  const values     = (p: string) => supported[p] ?? [];
  const supports   = (p: string, v: string) => values(p).includes(v);

  const gate = (req: GateRequirement): Gate => {
    const caps = req.capability == null ? [] : ([] as DeviceCapability[]).concat(req.capability);
    for (const c of caps) {
      if (!has(c)) {
        return { enabled: false, reason: `Not available on ${boardName}: this board has no ${CAPABILITY_LABEL[c] ?? c}.` };
      }
    }
    if (req.feature && !hasFeature(req.feature)) {
      return { enabled: false, reason: `Not available on ${boardName}: this board has no ${FEATURE_LABEL[req.feature] ?? req.feature}.` };
    }
    if (req.supported) {
      const [path, value] = req.supported;
      if (!supports(path, value)) {
        const what = SUPPORTED_LABEL[path] ?? path;
        return { enabled: false, reason: `Not available on ${boardName}: ${value} is not a supported ${what}.` };
      }
    }
    return { enabled: true, reason: null };
  };

  return {
    boardName,
    source: { capabilities: capSource, features: featSource, supported: supSource },
    capabilities,
    features,
    supported,
    cardFormats,
    numDoors:  device?.num_doors ?? board?.num_doors ?? 1,
    powerType: device?.power_type ?? board?.power_type ?? null,
    transport: device?.connectivity_transport ?? null,
    has, hasFeature, values, supports, gate,
  };
}

/**
 * Memoised capability view of a device. Safe to call with `null` while the
 * device is still loading — every gate is then open (fallback tiers), so
 * nothing flashes greyed-out before the data arrives.
 */
export function useDeviceCapabilities(device: CapabilityInput | null | undefined): DeviceCapabilities {
  return useMemo(() => resolveDeviceCapabilities(device ?? null), [device]);
}
