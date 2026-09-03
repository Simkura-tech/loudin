/**
 * DeviceActions — admin command surface on DeviceDetailPage.
 *
 * Buttons forward to Simkura's v2 API. The set is whitelisted server-side
 * (lock.unlock / lock.set-state / lock.configure / device.reboot) so the UI
 * only renders what the backend will accept.
 *
 * Layout:
 *   • Momentary unlock — lock.unlock, big primary button (the killer feature)
 *   • (door mode — lock / unlock / lockdown / normal — lives in DeviceDoorMode)
 *   • Reboot — device.reboot, confirm-gated
 *   • Provisioning — opens a modal that fires lock.configure
 *     (readerTechnology + latchInterval)
 *   • Re-sync — POST /api/devices/:id/push { force: true }: wipes the lock
 *     and re-pushes the full credential/schedule state from the platform.
 *     Confirm-gated (the lock briefly holds no credentials mid-rebuild).
 *   • Clear device — POST /api/devices/:id/clear: wipes the lock AND removes
 *     the assignments in the platform. Confirm-gated, destructive.
 *
 * Successful commands reach Simkura instantly but the device confirms
 * execution asynchronously — this panel reports "command sent", not
 * "device acted on it". The confirmation event lands in the Activity tab.
 */

import { useMemo, useState } from 'react';
import styled from '@emotion/styled';
import { branding } from '../../branding';
import { useDeviceCapabilities } from '../../hooks';
import { useFeatures } from '../../contexts/FeaturesContext';
import { unsupportedStyle } from './capabilityStyles';
import {
  IconAlertTriangle,
  IconCheck,
  IconEraser,
  IconLockOpen,
  IconPower,
  IconRefresh,
  IconSettings,
  IconX,
} from '@tabler/icons-react';
import {
  devicesApi,
  type Device,
  type PushResult,
} from '../../services/access/devices';

const Panel = styled.section`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  margin-bottom: 14px;
`;

const PanelHeader = styled.div`
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
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

/* $unsupported on every action button: the board can't do this at all (as
   opposed to `disabled`, which is "busy right now"). Muted and desaturated
   via CapabilityGate.unsupportedStyle; the reason rides on `title`. */
const PrimaryButton = styled.button<{ $unsupported?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 18px;
  border-radius: 9px;
  border: none;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.05s ease;

  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
  &:active { transform: translateY(1px); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  ${({ $unsupported }) => $unsupported && unsupportedStyle}
`;

const SecondaryButton = styled.button<{ $variant?: 'default' | 'danger'; $unsupported?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme, $variant }) =>
    $variant === 'danger' ? '#b91c1c' : theme.colors.text.primary};
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    background: ${({ $variant }) => ($variant === 'danger' ? '#fef2f2' : 'inherit')};
    border-color: ${({ theme, $variant }) =>
      $variant === 'danger' ? '#fecaca' : theme.colors.border.medium ?? theme.colors.border.light};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  ${({ $unsupported }) => $unsupported && unsupportedStyle}
`;

const Status = styled.div<{ $tone: 'idle' | 'success' | 'error' }>`
  font-size: 12px;
  color: ${({ $tone, theme }) =>
    $tone === 'success' ? '#166534'
  : $tone === 'error'   ? '#991b1b'
  :                       theme.colors.text.tertiary};
  min-height: 18px;
`;

// ── Modal pieces (shared with confirm + provisioning) ────────────────────────

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

const Dialog = styled.div<{ $wide?: boolean }>`
  width: 100%;
  max-width: ${({ $wide }) => ($wide ? '480px' : '420px')};
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
  h2 { font-size: 15px; font-weight: 600; margin: 0; display: inline-flex; align-items: center; gap: 8px; }
`;

const DialogBody = styled.div`
  padding: 14px 18px;
  font-size: 14px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
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

const DangerButton = styled(PrimaryButton)`
  background: #dc2626;
  &:hover { background: #b91c1c; }
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 12px;
`;

const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const FieldHint = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.tertiary};
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

const Select = styled.select`
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;
`;

// ── Constants ────────────────────────────────────────────────────────────────

// v2 lock.configure readerTechnology vocabulary — records which credential
// reader the installer wired to this door (a platform fact, not a firmware
// setting; card formats are firmware-implemented and not configurable).
// The modal offers only the subset in the board's
// supported["doors.reader.technology"] list.
const READER_TECHNOLOGIES: { value: string; label: string }[] = [
  { value: 'prox',      label: 'Prox — 125 kHz' },
  { value: 'smartcard', label: 'Smart card — 13.56 MHz' },
  { value: 'nfc',       label: 'NFC' },
  { value: 'ble',       label: 'Bluetooth (BLE)' },
  { value: 'multi',     label: 'Multi-technology reader' },
];

interface ConfirmState {
  command: string;
  payload?: Record<string, unknown>;
  title: string;
  body: string;
  confirmLabel: string;
  /** Custom action instead of fire(command) — used by Re-sync / Clear device,
   *  which go through their own endpoints rather than /commands. */
  run?: () => void;
}

/** Provisioning form values as strings, so "not recorded" / "not reported
 *  yet" can be an empty field rather than a fabricated default. The modal
 *  diffs against what the device currently reports and sends only the
 *  fields that changed. */
interface ProvisioningForm {
  /** '' = not recorded. */
  readerTechnology: string;
  /** '' = not reported yet. */
  latchInterval: string;
}

function provisioningFormFor(device: Device): ProvisioningForm {
  return {
    readerTechnology: device.reader.technology ?? '',
    latchInterval:    device.latch_interval_s != null ? String(device.latch_interval_s) : '',
  };
}

interface Props {
  device: Device;
  /** Bumped by the parent when a command lands so the activity feed re-pulls. */
  onCommandSent?: () => void;
  /** Called after Re-sync / Clear device so the parent refreshes the sync
   *  banner and counts (both actions change the junction tables). */
  onDeviceChanged?: () => void;
}

export function DeviceActions({ device, onCommandSent, onDeviceChanged }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus]   = useState<{ tone: 'idle' | 'success' | 'error'; text: string }>({
    tone: 'idle',
    text: '',
  });
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Provisioning modal state. `provInitial` is what the device reported when
  // the modal opened — the baseline the form is diffed against on Apply.
  const [provOpen, setProvOpen]       = useState(false);
  const [provInitial, setProvInitial] = useState<ProvisioningForm>(() => provisioningFormFor(device));
  const [provForm, setProvForm]       = useState<ProvisioningForm>(provInitial);
  const [provSaving, setProvSaving]   = useState(false);
  const [provError, setProvError]     = useState<string | null>(null);


  // Hardware gates. Lock commands need the lock-control block; pushing or
  // clearing records needs somewhere on the device to put them (either the
  // credential store or schedules is enough). Reboot is universal.
  const caps     = useDeviceCapabilities(device);
  const lockGate = caps.gate({ capability: 'lock-control' });

  // Platform feature flags: a switched-off action is not rendered at all.
  const features      = useFeatures();
  const unlockOn      = features.enabled('momentary_unlock');
  const provisionOn   = features.enabled('provisioning');
  const maintenanceOn = features.enabled('maintenance');
  const dataGate = caps.has('credential-store') || caps.has('schedules')
    ? { enabled: true, reason: null }
    : caps.gate({ capability: 'credential-store' });

  // Reader technologies this board can pair with. If the device somehow
  // carries a value outside that list, keep it selectable so the form shows
  // the truth rather than silently switching it.
  const technologyOptions = useMemo(() => {
    const allowed = caps.values('doors.reader.technology');
    const list = READER_TECHNOLOGIES.filter((t) => allowed.includes(t.value));
    const current = device.reader.technology;
    if (current && !list.some((t) => t.value === current)) {
      list.push(READER_TECHNOLOGIES.find((t) => t.value === current) ?? { value: current, label: current });
    }
    return list;
  }, [caps, device.reader.technology]);

  const provDirty =
    provForm.readerTechnology !== provInitial.readerTechnology ||
    provForm.latchInterval !== provInitial.latchInterval;

  const fire = async (command: string, payload?: Record<string, unknown>) => {
    setPending(command);
    setStatus({ tone: 'idle', text: '' });
    try {
      await devicesApi.sendCommand(device.device_id, command, payload);
      setStatus({ tone: 'success', text: `${commandLabel(command, payload)} sent.` });
      onCommandSent?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Command failed';
      setStatus({ tone: 'error', text: msg });
    } finally {
      setPending(null);
    }
  };

  const fireFromConfirm = () => {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    if (c.run) c.run();
    else fire(c.command, c.payload);
  };

  /** Shared wrapper for the orchestrated endpoints (re-sync / clear), which
   *  return 200 + PushResult instead of throwing on device-side failure. */
  const runOrchestrated = async (
    key: 'resync' | 'clear',
    call: () => Promise<PushResult>,
    successText: (result: PushResult) => string,
  ) => {
    setPending(key);
    setStatus({ tone: 'idle', text: '' });
    try {
      const result = await call();
      if (result.ok) {
        setStatus({ tone: 'success', text: successText(result) });
      } else {
        const failed = result.sequence.find((s) => s.status === 'failed');
        setStatus({
          tone: 'error',
          text: failed?.detail || result.error || 'Command sequence failed',
        });
      }
      onCommandSent?.();
      onDeviceChanged?.();
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'Command failed' });
    } finally {
      setPending(null);
    }
  };

  const runResync = () =>
    runOrchestrated(
      'resync',
      () => devicesApi.pushDevice(device.id, { force: true }),
      (r) => {
        const n = r.sequence.filter((s) => s.status === 'ok').length;
        return `Full re-sync sent (${n} command${n === 1 ? '' : 's'}). The lock applies it on its next check-in.`;
      },
    );

  const runClear = () =>
    runOrchestrated(
      'clear',
      () => devicesApi.clearDevice(device.id),
      () => 'Clear sent. The lock will report 0 credentials and 0 schedules after its next check-in.',
    );

  const openProvisioning = () => {
    const initial = provisioningFormFor(device);
    setProvInitial(initial);
    setProvForm(initial);
    setProvError(null);
    setProvOpen(true);
  };

  const applyProvisioning = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvError(null);

    // Send only what changed. The contract's DoorConfigPatch treats omitted
    // fields as unchanged, so an untouched latch never gets re-sent (and
    // never gets reset to a default the device didn't have).
    const patch: { readerTechnology?: string; latchInterval?: number } = {};
    if (provForm.readerTechnology && provForm.readerTechnology !== provInitial.readerTechnology) {
      patch.readerTechnology = provForm.readerTechnology;
    }
    if (provForm.latchInterval !== '' && provForm.latchInterval !== provInitial.latchInterval) {
      const n = Number(provForm.latchInterval);
      if (!Number.isInteger(n) || n < 1 || n > 255) {
        setProvError('Latch interval must be a whole number of seconds from 1 to 255.');
        return;
      }
      patch.latchInterval = n;
    }
    if (Object.keys(patch).length === 0) {
      setProvOpen(false);
      return;
    }

    setProvSaving(true);
    try {
      await devicesApi.sendCommand(device.device_id, 'lock.configure', patch);
      const parts: string[] = [];
      if (patch.readerTechnology) parts.push('reader technology recorded');
      if (patch.latchInterval != null) parts.push(`${patch.latchInterval}s latch queued to the lock`);
      setStatus({ tone: 'success', text: `Provisioning sent — ${parts.join(', ')}.` });
      setProvOpen(false);
      onCommandSent?.();
      onDeviceChanged?.();
    } catch (err) {
      setProvError(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      setProvSaving(false);
    }
  };

  return (
    <Panel>
      <PanelHeader><h2>Actions</h2></PanelHeader>
      <PanelBody>
        <Row>
          {/* Momentary unlock — primary action */}
{unlockOn && (
          <PrimaryButton
            type="button"
            disabled={!!pending || !lockGate.enabled}
            $unsupported={!lockGate.enabled}
            title={lockGate.reason ?? undefined}
            onClick={() => fire('lock.unlock')}
          >
            <IconLockOpen size={18} strokeWidth={2} />
            {pending === 'lock.unlock' ? 'Unlocking…' : 'Momentary unlock'}
          </PrimaryButton>
          )}

{maintenanceOn && (
          <SecondaryButton
            type="button"
            disabled={!!pending}
            onClick={() => setConfirm({
              command: 'device.reboot',
              title: `Reboot ${device.device_name}?`,
              body: 'The device will reset within a few seconds. The door stays locked during the reboot.',
              confirmLabel: 'Reboot',
            })}
          >
            <IconPower size={16} strokeWidth={2} />
            Reboot
          </SecondaryButton>
          )}

{provisionOn && (
          <SecondaryButton
            type="button"
            disabled={!!pending || !lockGate.enabled}
            $unsupported={!lockGate.enabled}
            title={lockGate.reason ?? undefined}
            onClick={openProvisioning}
          >
            <IconSettings size={16} strokeWidth={2} />
            Provisioning
          </SecondaryButton>
          )}

{maintenanceOn && (<>
          <SecondaryButton
            type="button"
            disabled={!!pending || !dataGate.enabled}
            $unsupported={!dataGate.enabled}
            title={dataGate.reason ?? `Wipe the lock and re-push every credential and schedule from ${branding.productName}`}
            onClick={() => setConfirm({
              command: 'resync',
              title: `Re-sync ${device.device_name}?`,
              body: `The lock is wiped and every credential and schedule is re-pushed from ${branding.productName}. ` +
                    `Use this when the lock’s contents have drifted from what ${branding.productName} shows. ` +
                    'Credentials won’t open the door for a brief moment while the rebuild applies.',
              confirmLabel: 'Re-sync',
              run: runResync,
            })}
          >
            <IconRefresh size={16} strokeWidth={2} />
            {pending === 'resync' ? 'Re-syncing…' : 'Re-sync'}
          </SecondaryButton>

          <SecondaryButton
            type="button"
            $variant="danger"
            disabled={!!pending || !dataGate.enabled}
            $unsupported={!dataGate.enabled}
            title={dataGate.reason ?? 'Remove every credential and schedule from this lock'}
            onClick={() => setConfirm({
              command: 'clear',
              title: `Clear ${device.device_name}?`,
              body: `Every credential and schedule is removed from the lock and unassigned in ${branding.productName}. ` +
                    'No card or PIN will open this door until you push new credentials. ' +
                    'The device stays claimed by your company.',
              confirmLabel: 'Clear device',
              run: runClear,
            })}
          >
            <IconEraser size={16} strokeWidth={2} />
            {pending === 'clear' ? 'Clearing…' : 'Clear device'}
          </SecondaryButton>
          </>)}
        </Row>

        <Status $tone={status.tone}>
          {status.text || (
            device.power_mode === 'active'
              ? 'Commands forward to Simkura immediately; the device confirms on its next check-in.'
              : 'Commands forward to Simkura immediately; this lock is sleeping, so they apply on its next check-in — enter 00000# on the keypad to wake it now.'
          )}
        </Status>

      </PanelBody>

      {/* ── Confirm dialog (reboot) ──────────────────────────────────────── */}
      {confirm && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <Dialog>
            <DialogHeader>
              <h2><IconAlertTriangle size={16} color="#b45309" /> {confirm.title}</h2>
              <IconButton type="button" onClick={() => setConfirm(null)}>
                <IconX size={16} />
              </IconButton>
            </DialogHeader>
            <DialogBody>{confirm.body}</DialogBody>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setConfirm(null)}>
                Cancel
              </SecondaryButton>
              <DangerButton type="button" onClick={fireFromConfirm}>
                {confirm.confirmLabel}
              </DangerButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}

      {/* ── Provisioning modal ───────────────────────────────────────────── */}
      {provOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setProvOpen(false); }}>
          <Dialog $wide>
            <form onSubmit={applyProvisioning}>
              <DialogHeader>
                <h2><IconSettings size={16} /> Provision {device.device_name}</h2>
                <IconButton type="button" onClick={() => setProvOpen(false)}>
                  <IconX size={16} />
                </IconButton>
              </DialogHeader>
              <DialogBody>
                <Field>
                  <FieldLabel>Reader technology</FieldLabel>
                  <Select
                    value={provForm.readerTechnology}
                    onChange={(e) => setProvForm({ ...provForm, readerTechnology: e.target.value })}
                  >
                    <option value="">— not recorded —</option>
                    {technologyOptions.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </Select>
                  <FieldHint>
                    Which credential reader the installer wired to this door. {caps.boardName} can pair with{' '}
                    {technologyOptions.map((t) => t.label.split(' — ')[0]).join(', ') || 'no listed technologies'}.
                    Recorded by the platform and shown on the device immediately.
                  </FieldHint>
                </Field>

                <Field>
                  <FieldLabel>Latch interval (seconds)</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    max={255}
                    step={1}
                    value={provForm.latchInterval}
                    placeholder={provInitial.latchInterval === '' ? 'Not reported yet' : undefined}
                    onChange={(e) => setProvForm({ ...provForm, latchInterval: e.target.value })}
                  />
                  <FieldHint>
                    How long the door stays unlatched after a momentary unlock (1–255).
                    Queued to the lock; takes effect on its next wake.
                    {provInitial.latchInterval !== '' && ` Currently ${provInitial.latchInterval}s.`}
                  </FieldHint>
                </Field>

                {provError && (
                  <div role="alert" style={{
                    padding: '8px 10px',
                    borderRadius: 7,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    fontSize: 12,
                    marginTop: 4,
                  }}>{provError}</div>
                )}
              </DialogBody>
              <DialogFooter>
                <SecondaryButton type="button" onClick={() => setProvOpen(false)} disabled={provSaving}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton
                  type="submit"
                  disabled={provSaving || !provDirty}
                  title={provDirty ? undefined : 'Nothing has changed'}
                >
                  {provSaving ? 'Applying…' : <><IconCheck size={16} /> Apply</>}
                </PrimaryButton>
              </DialogFooter>
            </form>
          </Dialog>
        </Backdrop>
      )}
    </Panel>
  );
}

function commandLabel(command: string, payload?: Record<string, unknown>): string {
  if (command === 'lock.unlock')    return 'Momentary unlock';
  if (command === 'device.reboot')  return 'Reboot';
  if (command === 'lock.configure') return 'Provisioning';
  if (command === 'lock.set-state') {
    const s = payload?.state as string | undefined;
    if (s === 'locked')   return 'Lock';
    if (s === 'unlocked') return 'Hold unlocked';
    if (s === 'lockdown') return 'Lockdown';
    if (s === 'normal')   return 'Return to normal';
    return 'State change';
  }
  return command;
}

export default DeviceActions;
