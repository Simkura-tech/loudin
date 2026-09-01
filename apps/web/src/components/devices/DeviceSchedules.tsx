/**
 * DeviceSchedules — per-device list + CRUD for auto-unlock windows.
 *
 * Each schedule names a recurring window (days-of-week + start/end time).
 * Storage is the company-scoped `shifts` table joined to the device via
 * `device_shifts`; the UI presents one row per assignment.
 *
 * Changes reach the lock via the explicit "Update device" push
 * (shifts.add / schedule.set) — a saved schedule is recorded immediately
 * and enforced on the lock after the next push.
 */

import { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconCheck,
  IconClock,
  IconEdit,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';

import {
  deviceShiftsApi,
  type DayOfWeek,
  type DeviceShift,
  type DeviceShiftPayload,
} from '../../services/access/devices';

// ── Layout ────────────────────────────────────────────────────────────────────

const Panel = styled.section`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
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
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: none;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const DangerButton = styled(SecondaryButton)`
  color: #b91c1c;
  border-color: #fecaca;
  &:hover { background: #fef2f2; }
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

const Description = styled.p`
  margin: 0;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Empty = styled.div`
  padding: 40px 16px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 13px;

  .title {
    color: ${({ theme }) => theme.colors.text.primary};
    font-weight: 600;
    margin-bottom: 4px;
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};

  &:last-of-type { border-bottom: none; }

  .left   { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .actions{ display: flex; gap: 6px; flex-shrink: 0; }

  .crest {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .name { font-size: 13px; font-weight: 600; line-height: 1.2; }
  .meta {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.secondary};
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
`;

const DayChip = styled.span<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: ${({ theme, $on }) =>
    $on ? theme.colors.brand.primary + '1f' : theme.colors.background.secondary};
  color: ${({ theme, $on }) =>
    $on ? theme.colors.brand.primary : theme.colors.text.tertiary};
`;

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  margin: 12px 16px;
`;

// ── Modal ─────────────────────────────────────────────────────────────────────

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

const DialogHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  h2 { font-size: 15px; font-weight: 600; margin: 0; }
`;

const DialogBody = styled.div`
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
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

const Row2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`;

const DayPicker = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const DayToggle = styled.button<{ $on: boolean }>`
  height: 30px;
  min-width: 38px;
  padding: 0 8px;
  border-radius: 7px;
  border: 1px solid ${({ theme, $on }) =>
    $on ? theme.colors.brand.primary : theme.colors.border.light};
  background: ${({ theme, $on }) =>
    $on ? theme.colors.brand.primary + '14' : theme.colors.background.primary};
  color: ${({ theme, $on }) =>
    $on ? theme.colors.brand.primary : theme.colors.text.secondary};
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;

  &:hover { border-color: ${({ theme }) => theme.colors.brand.primary}; }
`;

// ── Day-of-week helpers ──────────────────────────────────────────────────────

// 0=Sun … 6=Sat, but we render Mon-first for readability.
const DAY_ORDER: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABEL: Record<DayOfWeek, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

function summariseDays(days: DayOfWeek[]): string {
  if (days.length === 7) return 'Every day';
  const set = new Set(days);
  const weekday = [1, 2, 3, 4, 5].every((d) => set.has(d as DayOfWeek)) && set.size === 5;
  if (weekday) return 'Weekdays';
  const weekend = set.has(0) && set.has(6) && set.size === 2;
  if (weekend) return 'Weekends';
  return DAY_ORDER.filter((d) => set.has(d)).map((d) => DAY_LABEL[d]).join(' · ');
}

function formatTime(t: string): string {
  // 'HH:MM' or 'HH:MM:SS' → 'HH:MM'.
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function formatWindow(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}${
    formatTime(start) > formatTime(end) ? ' (next day)' : ''
  }`;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  deviceId: number;
  canEdit: boolean;
  /** Fired after a successful create/update/remove so the parent can
   *  refresh its sync summary banner. */
  onChanged?: () => void;
}

const EMPTY_FORM: DeviceShiftPayload = {
  shift_name:   '',
  start_time:   '09:00',
  end_time:     '17:00',
  days_of_week: [1, 2, 3, 4, 5],
};

export function DeviceSchedules({ deviceId, canEdit, onChanged }: Props) {
  const [shifts, setShifts]   = useState<DeviceShift[] | null>(null);
  const [error,  setError]    = useState<string | null>(null);
  const [editing, setEditing] = useState<DeviceShift | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form,   setForm]     = useState<DeviceShiftPayload>(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await deviceShiftsApi.list(deviceId);
      setShifts(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
      setShifts([]);
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setModalOpen(true);
  };

  const openEdit = (s: DeviceShift) => {
    setEditing(s);
    setForm({
      shift_name:   s.shift_name,
      description:  s.description,
      start_time:   formatTime(s.start_time),
      end_time:     formatTime(s.end_time),
      days_of_week: s.days_of_week,
    });
    setSaveError(null);
    setModalOpen(true);
  };

  const toggleDay = (d: DayOfWeek) => {
    setForm((f) => {
      const set = new Set(f.days_of_week);
      if (set.has(d)) set.delete(d); else set.add(d);
      return { ...f, days_of_week: [...set].sort((a, b) => a - b) as DayOfWeek[] };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const name = form.shift_name.trim();
    if (!name) { setSaveError('Name is required'); return; }
    if (form.days_of_week.length === 0) { setSaveError('Pick at least one day'); return; }
    if (form.start_time === form.end_time) { setSaveError('Start and end time cannot be equal'); return; }

    setSaving(true);
    try {
      const payload: DeviceShiftPayload = {
        shift_name:   name,
        description:  form.description?.toString().trim() || null,
        start_time:   form.start_time,
        end_time:     form.end_time,
        days_of_week: form.days_of_week,
      };
      if (editing) await deviceShiftsApi.update(deviceId, editing.id, payload);
      else         await deviceShiftsApi.create(deviceId, payload);
      setModalOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: DeviceShift) => {
    if (!window.confirm(`Delete schedule "${s.shift_name}"?`)) return;
    try {
      await deviceShiftsApi.remove(deviceId, s.id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <Panel>
      <PanelHeader>
        <h2>Schedules</h2>
        {canEdit && (
          <PrimaryButton type="button" onClick={openCreate}>
            <IconPlus size={14} /> New schedule
          </PrimaryButton>
        )}
      </PanelHeader>

      <Description>
        Schedules tell this lock when to automatically unlock. During a scheduled
        window the door stays open for everyone; outside it, normal access
        (cards, PINs, the app) is required. Changes reach the lock when you push
        an update to the device.
      </Description>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      {shifts === null ? (
        <Empty>Loading…</Empty>
      ) : shifts.length === 0 ? (
        <Empty>
          <div className="title">No schedules</div>
          <div>
            {canEdit
              ? 'Add one to set days and times when this lock auto-unlocks.'
              : 'Nothing has been scheduled for this lock.'}
          </div>
        </Empty>
      ) : (
        shifts.map((s) => (
          <Row key={s.id}>
            <div className="left">
              <span className="crest"><IconClock size={16} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="name">{s.shift_name}</div>
                <div className="meta">
                  <span>{formatWindow(s.start_time, s.end_time)}</span>
                  <span>·</span>
                  <span>{summariseDays(s.days_of_week)}</span>
                  {DAY_ORDER.map((d) => (
                    <DayChip key={d} $on={s.days_of_week.includes(d)}>{DAY_LABEL[d][0]}</DayChip>
                  ))}
                </div>
              </div>
            </div>
            {canEdit && (
              <div className="actions">
                <IconButton type="button" onClick={() => openEdit(s)} title="Edit">
                  <IconEdit size={14} />
                </IconButton>
                <IconButton type="button" onClick={() => handleDelete(s)} title="Delete">
                  <IconTrash size={14} />
                </IconButton>
              </div>
            )}
          </Row>
        ))
      )}

      {modalOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <Dialog>
            <form onSubmit={handleSave}>
              <DialogHeader>
                <h2>{editing ? 'Edit schedule' : 'New schedule'}</h2>
                <IconButton type="button" onClick={() => setModalOpen(false)}>
                  <IconX size={16} />
                </IconButton>
              </DialogHeader>
              <DialogBody>
                <Field>
                  <FieldLabel>Name *</FieldLabel>
                  <Input
                    value={form.shift_name}
                    onChange={(e) => setForm({ ...form, shift_name: e.target.value })}
                    placeholder="e.g. Business hours"
                    autoFocus required maxLength={255}
                  />
                </Field>
                <Row2>
                  <Field>
                    <FieldLabel>Start time *</FieldLabel>
                    <Input
                      type="time"
                      value={form.start_time}
                      onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>End time *</FieldLabel>
                    <Input
                      type="time"
                      value={form.end_time}
                      onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                      required
                    />
                  </Field>
                </Row2>
                <Field>
                  <FieldLabel>Days *</FieldLabel>
                  <DayPicker>
                    {DAY_ORDER.map((d) => (
                      <DayToggle
                        key={d}
                        type="button"
                        $on={form.days_of_week.includes(d)}
                        onClick={() => toggleDay(d)}
                      >
                        {DAY_LABEL[d]}
                      </DayToggle>
                    ))}
                  </DayPicker>
                </Field>
                {saveError && <ErrorBanner style={{ margin: 0 }}>{saveError}</ErrorBanner>}
              </DialogBody>
              <DialogFooter>
                <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
                  Cancel
                </SecondaryButton>
                {editing && (
                  <DangerButton
                    type="button"
                    onClick={() => { setModalOpen(false); handleDelete(editing); }}
                  >
                    <IconTrash size={14} /> Delete
                  </DangerButton>
                )}
                <PrimaryButton type="submit" disabled={saving}>
                  {saving ? 'Saving…' : <><IconCheck size={14} /> Save</>}
                </PrimaryButton>
              </DialogFooter>
            </form>
          </Dialog>
        </Backdrop>
      )}
    </Panel>
  );
}

export default DeviceSchedules;
