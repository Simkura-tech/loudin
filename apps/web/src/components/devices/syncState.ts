/**
 * Per-row sync state for a credential or shift attached to a device.
 *
 * The API returns three timestamps from the junction row, and the device's
 * sync summary banner aggregates the same three states. Keeping the row
 * chips and the banner on one definition means they never disagree:
 *
 *   pending    attached / changed in Loudin, not yet pushed
 *              (submitted_at null, or synced before the latest change)
 *   submitted  accepted by Simkura (202), waiting for the lock to wake
 *   synced     confirmed on the lock
 */

export type SyncState = 'pending' | 'submitted' | 'synced';

export interface SyncTrail {
  applied_at: string | null;
  submitted_at: string | null;
  synced_at: string | null;
}

export function syncStateOf(row: SyncTrail): SyncState {
  const applied   = row.applied_at   ? Date.parse(row.applied_at)   : null;
  const synced    = row.synced_at    ? Date.parse(row.synced_at)    : null;
  if (synced != null && (applied == null || synced >= applied)) return 'synced';
  if (row.submitted_at) return 'submitted';
  return 'pending';
}

export const SYNC_STATE_LABEL: Record<SyncState, string> = {
  pending:   'Pending push',
  submitted: 'Sent to lock',
  synced:    'On the lock',
};

export const SYNC_STATE_HINT: Record<SyncState, string> = {
  pending:   'Saved here but not yet pushed — click Update device to send it to the lock.',
  submitted: 'Accepted by Simkura and queued; the lock applies it on its next wake.',
  synced:    'The lock has confirmed this record.',
};
