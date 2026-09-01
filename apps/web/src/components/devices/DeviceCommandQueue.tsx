/**
 * DeviceCommandQueue — commands still in flight to the lock ("Queue" tab).
 *
 * Reads /api/devices/:id/queue, which proxies simkura-core's per-device
 * command queue. The queue lives in simkura-core (the device gateway), NOT
 * in this app — the app stores nothing; every load asks Simkura what's still
 * undelivered. Sleeping locks hold 'queued' rows until their next wake, so
 * this tab is the answer to "did my change reach the door yet?": an empty
 * queue means the lock is up to date with everything we've sent.
 */

import { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconCircleCheck,
  IconClockPause,
  IconHelpCircle,
  IconSend,
} from '@tabler/icons-react';

import { devicesApi, type QueuedCommand } from '../../services/access/devices';
import { relativeTime } from './deviceEventRendering';

const Panel = styled.section`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
`;

const Description = styled.p`
  margin: 0;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text.secondary};
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
  .count {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};

  &:last-child { border-bottom: none; }

  .crest {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .title { font-size: 13px; font-weight: 600; }
  .meta {
    margin-top: 1px;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const StatusChip = styled.span<{ $status: QueuedCommand['status'] }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: ${({ $status }) => ($status === 'sending' ? '#dbeafe' : '#fef3c7')};
  color:      ${({ $status }) => ($status === 'sending' ? '#1e40af' : '#92400e')};
`;

const UpToDate = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};

  .icon { color: #16a34a; flex-shrink: 0; }
  .title { font-weight: 600; color: ${({ theme }) => theme.colors.text.primary}; }
`;

const Note = styled.div`
  padding: 12px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const WakeTip = styled.div`
  padding: 9px 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const Skeleton = styled.div`
  height: 46px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  background: linear-gradient(90deg,
    ${({ theme }) => theme.colors.background.primary} 0%,
    ${({ theme }) => theme.colors.background.secondary} 50%,
    ${({ theme }) => theme.colors.background.primary} 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  &:last-child { border-bottom: none; }
`;

// Friendly labels for Simkura v2 operations. Unknown types fall back
// to the raw name so new commands still render.
const COMMAND_LABEL: Record<string, string> = {
  'lock.unlock':          'Unlock door',
  'lock.set-state':       'Set door state',
  'lock.configure':       'Door configuration',
  'device.reboot':        'Reboot',
  'device.configure':     'Device configuration',
  'device.factory-reset': 'Factory reset',
  'credentials.add':      'Install credential',
  'credentials.remove':   'Remove credential',
  'credentials.clear':    'Clear all credentials',
  'shifts.add':           'Install schedule',
  'shifts.clear':         'Clear all schedules',
  'holidays.add':         'Install holiday',
  'holidays.clear':       'Clear all holidays',
  'schedule.set':         'Apply door schedule',
  'schedule.clear':       'Unbind door schedule',
};

function commandLabel(type: string): string {
  return COMMAND_LABEL[type] ?? type;
}

interface Props {
  deviceId: number;
  /** Device power mode — sleeping devices get the 00000# wake tip. */
  powerMode: 'active' | 'sleep' | 'deep_sleep';
  /** Bumped by the parent (e.g., on Refresh or after sending a command). */
  refreshKey?: number;
}

export function DeviceCommandQueue({ deviceId, powerMode, refreshKey = 0 }: Props) {
  const [queue, setQueue] = useState<QueuedCommand[] | null>(null);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await devicesApi.queue(deviceId);
      setAvailable(r.available);
      setQueue(r.queue);
    } catch {
      setAvailable(false);
      setQueue([]);
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <Panel>
      <PanelHeader>
        <h2>Command queue</h2>
        {queue != null && available && queue.length > 0 && (
          <span className="count">
            {queue.length} waiting
          </span>
        )}
      </PanelHeader>

      <Description>
        Commands travel to the lock through a delivery queue. Anything listed
        here has been sent but hasn&apos;t reached the lock yet — usually
        because the lock is asleep. An empty queue means the lock is up to
        date with everything you&apos;ve sent.
      </Description>

      {queue === null ? (
        <><Skeleton /><Skeleton /></>
      ) : !available ? (
        <Note>
          <IconHelpCircle size={16} />
          Queue status is unavailable right now — commands may still be on their way to the lock.
        </Note>
      ) : queue.length === 0 ? (
        <UpToDate>
          <IconCircleCheck className="icon" size={20} />
          <div>
            <span className="title">Lock is up to date.</span>{' '}
            Nothing is waiting to be delivered.
          </div>
        </UpToDate>
      ) : (
        <>
          {queue.map((c) => (
            <Row key={c.id}>
              <span className="crest">
                {c.status === 'sending' ? <IconSend size={15} /> : <IconClockPause size={15} />}
              </span>
              <div>
                <div className="title">{commandLabel(c.command_type)}</div>
                <div className="meta">
                  {c.created_at ? `Queued ${relativeTime(c.created_at)}` : 'Queued'}
                  {c.attempts > 1 && ` · attempt ${c.attempts}`}
                </div>
              </div>
              <StatusChip $status={c.status}>
                {c.status === 'sending' ? 'Sending' : 'Waiting for device'}
              </StatusChip>
            </Row>
          ))}
          {powerMode !== 'active' && (
            <WakeTip>
              This lock is sleeping — queued commands deliver on its next
              check-in, or enter 00000# on the keypad to wake it now.
            </WakeTip>
          )}
        </>
      )}
    </Panel>
  );
}

export default DeviceCommandQueue;
