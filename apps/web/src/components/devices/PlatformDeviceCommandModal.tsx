/**
 * PlatformDeviceCommandModal — minimal command surface for the platform
 * fleet view. Lets a platform admin fire a small set of safe diagnostics
 * against any device, claimed or unclaimed.
 *
 * Backend enforces the whitelist (lock.unlock / lock.set-state /
 * lock.configure / device.reboot); we only expose the two that make sense
 * without a full provisioning context. (v1's inventory request is gone in
 * v2 — record counts arrive with every state sync.)
 */

import { useState } from 'react';
import styled from '@emotion/styled';
import {
  IconAlertTriangle,
  IconLockOpen,
  IconPower,
  IconX,
} from '@tabler/icons-react';
import { devicesApi, type PlatformDevice } from '../../services/access/devices';

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

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  h2 { font-size: 15px; font-weight: 600; margin: 0; }
  .sub {
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin-top: 2px;
  }
`;

const Body = styled.div`
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const ActionRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
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

const SecondaryButton = styled.button<{ $variant?: 'default' | 'danger' }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 36px;
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
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Status = styled.div<{ $tone: 'idle' | 'success' | 'error' }>`
  font-size: 12px;
  color: ${({ $tone, theme }) =>
    $tone === 'success' ? '#166534'
  : $tone === 'error'   ? '#991b1b'
  :                       theme.colors.text.tertiary};
  min-height: 18px;
`;

const ConfirmBox = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  font-size: 13px;
  display: flex;
  gap: 8px;
  align-items: flex-start;
`;

interface Props {
  device: PlatformDevice;
  onClose: () => void;
  onCommandSent?: () => void;
}

export function PlatformDeviceCommandModal({ device, onClose, onCommandSent }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus]   = useState<{ tone: 'idle' | 'success' | 'error'; text: string }>({
    tone: 'idle',
    text: '',
  });
  const [confirmReboot, setConfirmReboot] = useState(false);

  const fire = async (command: string, payload?: Record<string, unknown>) => {
    setPending(command);
    setStatus({ tone: 'idle', text: '' });
    try {
      await devicesApi.sendCommand(device.hardware_device_id, command, payload);
      setStatus({ tone: 'success', text: `${label(command)} sent.` });
      onCommandSent?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Command failed';
      setStatus({ tone: 'error', text: msg });
    } finally {
      setPending(null);
    }
  };

  return (
    <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog>
        <Header>
          <div>
            <h2>{device.device_name || 'Unassigned device'}</h2>
            <div className="sub">{device.hardware_device_id}</div>
          </div>
          <IconButton type="button" onClick={onClose}><IconX size={16} /></IconButton>
        </Header>
        <Body>
          {!device.in_simkura && (
            <ConfirmBox>
              <IconAlertTriangle size={16} />
              <div>This device isn&apos;t in Simkura. Commands will fail at the upstream.</div>
            </ConfirmBox>
          )}

          <ActionRow>
            <PrimaryButton
              type="button"
              disabled={!!pending}
              onClick={() => fire('lock.unlock')}
            >
              <IconLockOpen size={16} />
              {pending === 'lock.unlock' ? 'Unlocking…' : 'Momentary unlock'}
            </PrimaryButton>

            <SecondaryButton
              type="button"
              $variant="danger"
              disabled={!!pending}
              onClick={() => setConfirmReboot(true)}
            >
              <IconPower size={16} />
              Reboot
            </SecondaryButton>
          </ActionRow>

          {confirmReboot && (
            <ConfirmBox>
              <IconAlertTriangle size={16} />
              <div style={{ flex: 1 }}>
                Reboot this device? The door stays locked during the reboot.
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <SecondaryButton type="button" onClick={() => setConfirmReboot(false)}>
                    Cancel
                  </SecondaryButton>
                  <SecondaryButton
                    type="button"
                    $variant="danger"
                    onClick={() => { setConfirmReboot(false); fire('device.reboot'); }}
                  >
                    Reboot
                  </SecondaryButton>
                </div>
              </div>
            </ConfirmBox>
          )}

          <Status $tone={status.tone}>
            {status.text || 'Commands forward to Simkura immediately; the device acts on its next check-in.'}
          </Status>
        </Body>
        <Footer>
          <SecondaryButton type="button" onClick={onClose}>Close</SecondaryButton>
        </Footer>
      </Dialog>
    </Backdrop>
  );
}

function label(command: string): string {
  if (command === 'lock.unlock')   return 'Momentary unlock';
  if (command === 'device.reboot') return 'Reboot';
  return command;
}

export default PlatformDeviceCommandModal;
