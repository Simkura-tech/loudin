/**
 * DeviceHolidays — per-device list + CRUD for date-window overrides.
 *
 * A holiday is a start/end date-time and what the door does in between:
 * held unlocked, locked (credentials still work, no auto-unlock), or in
 * lockdown. Storage is the company-scoped `holidays` table joined to the
 * device via `device_holidays`; the UI presents one row per assignment.
 *
 * Changes reach the lock via the explicit "Update device" push
 * (holidays.clear + holidays.add) — a saved holiday is recorded immediately
 * and enforced on the lock after the next push. Same shape as
 * DeviceSchedules on purpose.
 */

import { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconCalendarEvent,
  IconCheck,
  IconEdit,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';

import {
  deviceHolidaysApi,
  type DeviceHoliday,
  type DeviceHolidayPayload,
  type HolidayBehavior,
} from '../../services/access/devices';
import { SyncChip } from './SyncChip';
import { syncStateOf } from './syncState';

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

const Row = styled.div<{ $past?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  opacity: ${({ $past }) => ($past ? 0.6 : 1)};

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

const BehaviorChip = styled.span<{ $mode: HolidayBehavior }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: ${({ $mode }) =>
    $mode === 'open'     ? '#dcfce7'
  : $mode === 'lockdown' ? '#fee2e2'
  :                        '#f1f5f9'};
  color: ${({ $mode }) =>
    $mode === 'open'     ? '#166534'
  : $mode === 'lockdown' ? '#991b1b'
  :                        '#475569'};
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

const FieldHint = styled.span`
  font-size: 11.5px;
  line-height: 1.4;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const inputStyle = (theme: { colors: { border: { light: string }; background: { primary: string }; brand: { primary: string } } }) => `
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${theme.colors.border.light};
  background: ${theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${theme.colors.brand.primary}26;
  }
`;

const Input = styled.input`${({ theme }) => inputStyle(theme)}`;
const Select = styled.select`${({ theme }) => inputStyle(theme)}`;

const Row2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

const BEHAVIOR: Record<HolidayBehavior, { label: string; hint: string }> = {
  locked: {
    label: 'Locked',
    hint:  'The door stays locked for the window. Credentials still open it; any auto-unlock schedule is suspended.',
  },
  open: {
    label: 'Unlocked',
    hint:  'The door is held unlocked for the whole window.',
  },
  lockdown: {
    label: 'Lockdown',
    hint:  'The door is pinned locked. No PIN, card, or schedule opens it until the window ends.',
  },
};
const BEHAVIOR_ORDER: HolidayBehavior[] = ['locked', 'open', 'lockdown'];

/** ISO (UTC) → the value a datetime-local input wants, in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value (local time) → ISO UTC. '' → null. */
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const RANGE_FMT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function formatRange(start: string, end: string): string {
  return `${RANGE_FMT.format(new Date(start))} – ${RANGE_FMT.format(new Date(end))}`;
}

function defaultWindow(): { start: string; end: string } {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: toLocalInput(start.toISOString()), end: toLocalInput(end.toISOString()) };
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  deviceId: number;
  canEdit: boolean;
  /** Fired after a successful create/update/remove so the parent can
   *  refresh its sync summary banner. */
  onChanged?: () => void;
}

interface Form {
  holiday_name: string;
  /** datetime-local values (local time). */
  start: string;
  end: string;
  access_mode: HolidayBehavior;
}

export function DeviceHolidays({ deviceId, canEdit, onChanged }: Props) {
  const [holidays, setHolidays] = useState<DeviceHoliday[] | null>(null);
  const [error,  setError]      = useState<string | null>(null);
  const [editing, setEditing]   = useState<DeviceHoliday | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form,   setForm]       = useState<Form>({ holiday_name: '', access_mode: 'locked', ...defaultWindow() });
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setHolidays(await deviceHolidaysApi.list(deviceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load holidays');
      setHolidays([]);
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ holiday_name: '', access_mode: 'locked', ...defaultWindow() });
    setSaveError(null);
    setModalOpen(true);
  };

  const openEdit = (h: DeviceHoliday) => {
    setEditing(h);
    setForm({
      holiday_name: h.holiday_name,
      start:        toLocalInput(h.start_datetime),
      end:          toLocalInput(h.end_datetime),
      access_mode:  h.access_mode,
    });
    setSaveError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const name = form.holiday_name.trim();
    if (!name) { setSaveError('Name is required'); return; }
    const start = fromLocalInput(form.start);
    const end   = fromLocalInput(form.end);
    if (!start || !end) { setSaveError('Start and end are required'); return; }
    if (end <= start) { setSaveError('End must be after start'); return; }

    setSaving(true);
    try {
      const payload: DeviceHolidayPayload = {
        holiday_name:   name,
        start_datetime: start,
        end_datetime:   end,
        access_mode:    form.access_mode,
      };
      if (editing) await deviceHolidaysApi.update(deviceId, editing.id, payload);
      else         await deviceHolidaysApi.create(deviceId, payload);
      setModalOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h: DeviceHoliday) => {
    if (!window.confirm(`Delete holiday "${h.holiday_name}"?`)) return;
    try {
      await deviceHolidaysApi.remove(deviceId, h.id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const now = Date.now();

  return (
    <Panel>
      <PanelHeader>
        <h2>Holidays</h2>
        {canEdit && (
          <PrimaryButton type="button" onClick={openCreate}>
            <IconPlus size={14} /> New holiday
          </PrimaryButton>
        )}
      </PanelHeader>

      <Description>
        Holidays override the normal schedule for a date range — keep the
        door locked over a public holiday, hold it open for an event, or
        lock it down entirely. {canEdit
          ? 'A saved holiday is enforced on the lock after the next device update.'
          : 'An admin manages the holidays on this door.'}
      </Description>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      {holidays === null ? (
        <Empty>Loading…</Empty>
      ) : holidays.length === 0 ? (
        <Empty>
          <div className="title">No holidays</div>
          <div>
            {canEdit
              ? 'Add one to change how this door behaves over a date range.'
              : 'No date-range overrides are set for this lock.'}
          </div>
        </Empty>
      ) : (
        holidays.map((h) => {
          const past = Date.parse(h.end_datetime) < now;
          return (
            <Row key={h.id} $past={past}>
              <div className="left">
                <span className="crest"><IconCalendarEvent size={16} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="name">{h.holiday_name}</div>
                  <div className="meta">
                    <span>{formatRange(h.start_datetime, h.end_datetime)}</span>
                    {past && <span>· ended</span>}
                    <BehaviorChip $mode={h.access_mode} title={BEHAVIOR[h.access_mode].hint}>
                      {BEHAVIOR[h.access_mode].label}
                    </BehaviorChip>
                    <SyncChip state={syncStateOf(h)} />
                  </div>
                </div>
              </div>
              {canEdit && (
                <div className="actions">
                  <IconButton type="button" onClick={() => openEdit(h)} title="Edit">
                    <IconEdit size={14} />
                  </IconButton>
                  <IconButton type="button" onClick={() => handleDelete(h)} title="Delete">
                    <IconTrash size={14} />
                  </IconButton>
                </div>
              )}
            </Row>
          );
        })
      )}

      {modalOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <Dialog>
            <form onSubmit={handleSave}>
              <DialogHeader>
                <h2>{editing ? 'Edit holiday' : 'New holiday'}</h2>
                <IconButton type="button" onClick={() => setModalOpen(false)}>
                  <IconX size={16} />
                </IconButton>
              </DialogHeader>
              <DialogBody>
                <Field>
                  <FieldLabel>Name *</FieldLabel>
                  <Input
                    value={form.holiday_name}
                    onChange={(e) => setForm({ ...form, holiday_name: e.target.value })}
                    placeholder="e.g. Christmas closure"
                    autoFocus required maxLength={255}
                  />
                </Field>
                <Row2>
                  <Field>
                    <FieldLabel>Starts *</FieldLabel>
                    <Input
                      type="datetime-local"
                      value={form.start}
                      onChange={(e) => setForm({ ...form, start: e.target.value })}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Ends *</FieldLabel>
                    <Input
                      type="datetime-local"
                      value={form.end}
                      onChange={(e) => setForm({ ...form, end: e.target.value })}
                      required
                    />
                  </Field>
                </Row2>
                <Field>
                  <FieldLabel>Door behavior</FieldLabel>
                  <Select
                    value={form.access_mode}
                    onChange={(e) => setForm({ ...form, access_mode: e.target.value as HolidayBehavior })}
                  >
                    {BEHAVIOR_ORDER.map((m) => (
                      <option key={m} value={m}>{BEHAVIOR[m].label}</option>
                    ))}
                  </Select>
                  <FieldHint>{BEHAVIOR[form.access_mode].hint}</FieldHint>
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

export default DeviceHolidays;
