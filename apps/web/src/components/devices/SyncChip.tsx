/**
 * Small status pill for a credential or shift row: pending push / sent to
 * lock / on the lock. State and copy come from ./syncState so the chips
 * match the device's sync banner.
 */

import styled from '@emotion/styled';
import { IconCheck, IconClockPause, IconSend } from '@tabler/icons-react';
import { SYNC_STATE_HINT, SYNC_STATE_LABEL, type SyncState } from './syncState';

const Chip = styled.span<{ $state: SyncState }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  cursor: help;
  background: ${({ theme, $state }) =>
    $state === 'synced'    ? theme.colors.status.successBackground
  : $state === 'submitted' ? theme.colors.status.infoBackground
  :                          theme.colors.status.warningBackground};
  color: ${({ theme, $state }) =>
    $state === 'synced'    ? theme.colors.status.success
  : $state === 'submitted' ? theme.colors.status.info
  :                          theme.colors.status.warning};
`;

export function SyncChip({ state }: { state: SyncState }) {
  const Icon = state === 'synced' ? IconCheck : state === 'submitted' ? IconSend : IconClockPause;
  return (
    <Chip $state={state} title={SYNC_STATE_HINT[state]}>
      <Icon size={11} strokeWidth={2.5} />
      {SYNC_STATE_LABEL[state]}
    </Chip>
  );
}
