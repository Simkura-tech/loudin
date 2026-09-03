/**
 * DeviceCredentials — per-device list of credentials installed on a door.
 *
 * Storage view: rows live in the `device_credentials` junction. Adding a
 * credential here attaches an existing credential (created via a person's
 * detail page) to this specific device. Removing detaches it. The picker
 * modal works in two modes — 'add' bulk-attaches a person's or group's
 * credentials, 'remove' bulk-detaches them (confirm-gated).
 *
 * Changes reach the lock via "Update device" (see services/access/
 * devicePush.js): new attachments push credentials.add, detachments push
 * credentials.remove.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUser,
  IconUsersGroup,
  IconX,
} from '@tabler/icons-react';

import {
  deviceCredentialsApi,
  type AttachedCredential,
} from '../../services/access/devices';
import { credentialsApi, type Credential } from '../../services/access/credentials';
import { SyncChip } from './SyncChip';
import { syncStateOf } from './syncState';
import { peopleApi, type Person } from '../../services/access/people';
import { peopleGroupsApi, type PeopleGroup } from '../../services/access/peopleGroups';
import { getTypeConfig } from '../credentials/credentialTypes';

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

const IconBtn = styled.button`
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
  &:disabled { opacity: 0.5; cursor: not-allowed; }
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
  padding: 32px 16px;
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

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  margin: 12px 16px;
`;

const Skeleton = styled.div`
  height: 56px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  background: linear-gradient(90deg,
    ${({ theme }) => theme.colors.background.primary} 0%,
    ${({ theme }) => theme.colors.background.secondary} 50%,
    ${({ theme }) => theme.colors.background.primary} 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;

// ── Picker modal ─────────────────────────────────────────────────────────────

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
  max-width: 480px;
  background: ${({ theme }) => theme.colors.background.primary};
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  max-height: min(80vh, 600px);
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
  gap: 10px;
  overflow-y: auto;
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const SearchWrap = styled.div`
  position: relative;

  .icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  input {
    width: 100%;
    height: 36px;
    padding: 0 10px 0 32px;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.border.light};
    background: ${({ theme }) => theme.colors.background.primary};
    color: ${({ theme }) => theme.colors.text.primary};
    font-size: 14px;
    font-family: inherit;

    &:focus {
      outline: none;
      border-color: ${({ theme }) => theme.colors.brand.primary};
      box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
    }
  }
`;

const PickerList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 8px;
  overflow: hidden;
  max-height: 320px;
  overflow-y: auto;
`;

const SectionToggle = styled.button`
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
  padding: 8px 10px;
  margin-top: 6px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  text-align: left;

  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }

  .chev   { color: ${({ theme }) => theme.colors.text.tertiary}; flex-shrink: 0; }
  .icon   { color: ${({ theme }) => theme.colors.brand.primary}; flex-shrink: 0; }
  .label  { flex: 1; }
  .count  {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    padding: 1px 7px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.secondary};
  }
`;

const PickerItem = styled.li`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};

  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }

  .crest {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .body { min-width: 0; flex: 1; }
  .name { font-size: 13px; font-weight: 600; }
  .meta {
    font-size: 11px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin-top: 1px;
  }
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Type-specific identifier shown alongside the credential name. */
function credentialDetail(c: { credential_type: AttachedCredential['credential_type']; card_number: string | null; facility_code: string | null }) {
  if (c.credential_type === 'pin') return '••••';
  const fc = c.facility_code ? `FC ${c.facility_code} · ` : '';
  return `${fc}${c.card_number ?? ''}`;
}

/** Full name from the LEFT-joined people snapshot, or null when unassigned. */
function personFullName(c: AttachedCredential): string | null {
  if (!c.person_first_name && !c.person_last_name) return null;
  return [c.person_first_name, c.person_last_name].filter(Boolean).join(' ');
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  deviceId: number;
  /** Admins only: every attach/detach route is requireAdmin server-side,
   *  so the controls are hidden (not merely disabled) for everyone else —
   *  same rule as DeviceSchedules. */
  canEdit: boolean;
  /** Fired after a successful attach/detach so the parent can refresh
   *  its sync summary banner. */
  onChanged?: () => void;
}

export function DeviceCredentials({ deviceId, canEdit, onChanged }: Props) {
  const [items, setItems] = useState<AttachedCredential[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  /** 'add' bulk-attaches, 'remove' bulk-detaches — same picker, inverted candidates. */
  const [pickerMode, setPickerMode] = useState<'add' | 'remove'>('add');
  const [allCreds,  setAllCreds]  = useState<Credential[]   | null>(null);
  const [allPeople, setAllPeople] = useState<Person[]       | null>(null);
  const [allGroups, setAllGroups] = useState<PeopleGroup[]  | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  // Sections collapse by default so the modal stays compact; user can
  // toggle, and a non-empty search auto-expands sections with matches.
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  /** person_id of the person currently being bulk-attached. */
  const [attachingPerson, setAttachingPerson] = useState<number | null>(null);
  /** group_id of the group currently being bulk-attached. */
  const [attachingGroup,  setAttachingGroup]  = useState<number | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const [detachTarget, setDetachTarget] = useState<AttachedCredential | null>(null);
  const [detaching, setDetaching] = useState(false);

  /** Pending bulk removal awaiting confirmation (picker remove mode). */
  const [bulkDetachTarget, setBulkDetachTarget] = useState<
    { kind: 'person' | 'group'; id: number; name: string; count: number } | null
  >(null);
  const [bulkDetaching, setBulkDetaching] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await deviceCredentialsApi.list(deviceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load credentials');
      setItems([]);
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  const openPicker = async (mode: 'add' | 'remove') => {
    setPickerMode(mode);
    setPickerSearch('');
    setPickerError(null);
    setPickerOpen(true);
    setGroupsOpen(false);
    setPeopleOpen(false);
    setAllCreds(null);
    setAllPeople(null);
    setAllGroups(null);
    try {
      const [creds, people, groups] = await Promise.all([
        credentialsApi.list(),
        peopleApi.list({ limit: 500 }),
        peopleGroupsApi.list(),
      ]);
      setAllCreds(creds);
      setAllPeople(people.people);
      setAllGroups(groups);
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Failed to load picker data');
      setAllCreds([]);
      setAllPeople([]);
      setAllGroups([]);
    }
  };

  const attachedIds = useMemo(
    () => new Set((items ?? []).map((c) => c.id)),
    [items],
  );

  /**
   * Group the company's credential pool by person. Each entry carries the
   * full credential list for that person and how many are already on
   * this device, so the picker can show "1 of 2 already on this door"
   * and disable fully-attached people. Orphan credentials (person_id
   * is null) are intentionally dropped from this view.
   */
  interface PersonGroup {
    person_id: number;
    name: string;
    employee_id: string | null;
    credentials: Credential[];
    attachedCount: number;
  }

  const personGroups = useMemo<PersonGroup[]>(() => {
    const map = new Map<number, PersonGroup>();
    for (const c of allCreds ?? []) {
      if (c.person_id == null) continue;
      let g = map.get(c.person_id);
      if (!g) {
        const name = [c.person_first_name, c.person_last_name]
          .filter(Boolean).join(' ').trim() || `Person #${c.person_id}`;
        g = {
          person_id:     c.person_id,
          name,
          employee_id:   c.person_employee_id ?? null,
          credentials:   [],
          attachedCount: 0,
        };
        map.set(c.person_id, g);
      }
      g.credentials.push(c);
      if (attachedIds.has(c.id)) g.attachedCount += 1;
    }
    // Stable sort: alphabetic by displayed name.
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allCreds, attachedIds]);

  const pickerCandidates = useMemo(() => {
    // Remove mode only offers people who actually have something on this door.
    const pool = pickerMode === 'remove'
      ? personGroups.filter((g) => g.attachedCount > 0)
      : personGroups;
    const term = pickerSearch.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((g) => {
      const hay = [
        g.name, g.employee_id,
        ...g.credentials.flatMap((c) => [
          c.credential_name, c.credential_type, c.card_number, c.facility_code,
        ]),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [personGroups, pickerSearch, pickerMode]);

  /**
   * Roll up groups → their members' credentials so the picker can offer a
   * one-click "attach all of Engineering Team". Groups whose members have
   * no credentials at all are dropped (nothing to attach).
   */
  interface GroupRow {
    group_id: number;
    name: string;
    member_count: number;
    /** Distinct member names — used as additional search hay. */
    member_names: string[];
    credentials: Credential[];
    attachedCount: number;
  }

  const groupRows = useMemo<GroupRow[]>(() => {
    if (!allGroups || !allPeople || !allCreds) return [];
    const personToGroup = new Map<number, number | null>(
      allPeople.map((p) => [p.id, p.group_id]),
    );
    const buckets = new Map<number, { creds: Credential[]; names: Set<string> }>();
    for (const g of allGroups) buckets.set(g.id, { creds: [], names: new Set() });

    for (const c of allCreds) {
      if (c.person_id == null) continue;
      const gid = personToGroup.get(c.person_id);
      if (gid == null) continue;
      const b = buckets.get(gid);
      if (!b) continue;
      b.creds.push(c);
      const fullName = [c.person_first_name, c.person_last_name]
        .filter(Boolean).join(' ');
      if (fullName) b.names.add(fullName);
    }

    return allGroups
      .map<GroupRow>((g) => {
        const b = buckets.get(g.id) ?? { creds: [], names: new Set<string>() };
        return {
          group_id:      g.id,
          name:          g.name,
          member_count:  g.member_count,
          member_names:  [...b.names],
          credentials:   b.creds,
          attachedCount: b.creds.filter((c) => attachedIds.has(c.id)).length,
        };
      })
      .filter((r) => r.credentials.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allGroups, allPeople, allCreds, attachedIds]);

  const pickerGroupCandidates = useMemo(() => {
    const pool = pickerMode === 'remove'
      ? groupRows.filter((g) => g.attachedCount > 0)
      : groupRows;
    const term = pickerSearch.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((g) => {
      const hay = [g.name, ...g.member_names].join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [groupRows, pickerSearch, pickerMode]);

  const doAttachGroup = async (g: GroupRow) => {
    setAttachingGroup(g.group_id);
    setPickerError(null);
    try {
      await deviceCredentialsApi.attachByGroup(deviceId, g.group_id);
      await load();
      onChanged?.();
      setPickerOpen(false);
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Attach failed');
    } finally {
      setAttachingGroup(null);
    }
  };

  const doAttachPerson = async (group: PersonGroup) => {
    setAttachingPerson(group.person_id);
    setPickerError(null);
    try {
      await deviceCredentialsApi.attachByPerson(deviceId, group.person_id);
      await load();
      onChanged?.();
      setPickerOpen(false);
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Attach failed');
    } finally {
      setAttachingPerson(null);
    }
  };

  const doBulkDetach = async () => {
    if (!bulkDetachTarget) return;
    setBulkDetaching(true);
    setPickerError(null);
    try {
      if (bulkDetachTarget.kind === 'person') {
        await deviceCredentialsApi.detachByPerson(deviceId, bulkDetachTarget.id);
      } else {
        await deviceCredentialsApi.detachByGroup(deviceId, bulkDetachTarget.id);
      }
      setBulkDetachTarget(null);
      setPickerOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      setBulkDetachTarget(null);
      setPickerError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setBulkDetaching(false);
    }
  };

  const doDetach = async () => {
    if (!detachTarget) return;
    setDetaching(true);
    try {
      await deviceCredentialsApi.detach(deviceId, detachTarget.id);
      setDetachTarget(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setDetaching(false);
    }
  };

  return (
    <>
      <Panel>
        <PanelHeader>
          <h2>Credentials</h2>
          {canEdit && (
            <div style={{ display: 'flex', gap: 6 }}>
              {(items?.length ?? 0) > 0 && (
                <DangerButton
                  type="button"
                  style={{ height: 30, padding: '0 10px', fontSize: 12, fontWeight: 600 }}
                  onClick={() => openPicker('remove')}
                >
                  <IconTrash size={14} /> Remove
                </DangerButton>
              )}
              <PrimaryButton type="button" onClick={() => openPicker('add')}>
                <IconPlus size={14} /> Add
              </PrimaryButton>
            </div>
          )}
        </PanelHeader>

        <Description>
          Credentials are the PINs and cards that open this door. Each one
          belongs to a person
          {canEdit
            ? ' (create them from a person’s page), and attaching one here grants that person access to this lock. Changes reach the lock when you push an update to the device.'
            : '; attaching one grants that person access to this lock. An admin manages which credentials are on this door.'}
        </Description>

        {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

        {items === null ? (
          <><Skeleton /><Skeleton /></>
        ) : items.length === 0 ? (
          <Empty>
            <div className="title">No credentials installed</div>
            <div>
              {canEdit
                ? 'Attach an existing credential to control who can open this door.'
                : 'No PIN or card opens this door yet.'}
            </div>
          </Empty>
        ) : (
          items.map((c) => {
            const cfg = getTypeConfig(c.credential_type);
            const person = personFullName(c);
            return (
              <Row key={c.id}>
                <div className="left">
                  <span className="crest">{cfg.icon}</span>
                  <div>
                    <div className="name">
                      {person ?? (
                        <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Unassigned</span>
                      )}
                    </div>
                    <div className="meta">
                      <span>{c.credential_name}</span>
                      <span>·</span>
                      <span>{cfg.label}</span>
                      <span>·</span>
                      <span>{credentialDetail(c)}</span>
                      <SyncChip state={syncStateOf(c)} />
                    </div>
                  </div>
                </div>
                {canEdit && (
                  <div className="actions">
                    <IconBtn type="button" title="Remove" onClick={() => setDetachTarget(c)}>
                      <IconTrash size={16} />
                    </IconBtn>
                  </div>
                )}
              </Row>
            );
          })
        )}
      </Panel>

      {/* ── Picker modal ──────────────────────────────────────────────────── */}
      {pickerOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setPickerOpen(false); }}>
          <Dialog>
            <DialogHeader>
              <h2>{pickerMode === 'remove' ? 'Remove credentials' : 'Add credential'}</h2>
              <IconBtn type="button" onClick={() => setPickerOpen(false)}><IconX size={16} /></IconBtn>
            </DialogHeader>
            <DialogBody>
              <SearchWrap>
                <IconSearch className="icon" size={16} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search name, employee ID, credential…"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                />
              </SearchWrap>

              {pickerError && <ErrorBanner role="alert">{pickerError}</ErrorBanner>}

              {allCreds === null || allPeople === null || allGroups === null ? (
                <Empty>Loading…</Empty>
              ) : pickerCandidates.length === 0 && pickerGroupCandidates.length === 0 ? (
                <Empty>
                  <div className="title">{pickerMode === 'remove' ? 'Nothing to remove' : 'Nothing to add'}</div>
                  <div>
                    {pickerMode === 'remove'
                      ? 'No people or groups have credentials on this door.'
                      : personGroups.length === 0 && groupRows.length === 0
                        ? 'No people in your company have credentials yet — create one from a person’s page first.'
                        : 'No matches.'}
                  </div>
                </Empty>
              ) : (
                <>
                  {/* When the user is searching we force both sections open
                      so matches are visible without an extra click. With
                      an empty search we respect the manual toggles. */}
                  {pickerGroupCandidates.length > 0 && (
                    <>
                      <SectionToggle
                        type="button"
                        onClick={() => setGroupsOpen((v) => !v)}
                        aria-expanded={pickerSearch.trim() ? true : groupsOpen}
                      >
                        {(pickerSearch.trim() ? true : groupsOpen)
                          ? <IconChevronDown  className="chev" size={14} />
                          : <IconChevronRight className="chev" size={14} />}
                        <IconUsersGroup className="icon" size={14} />
                        <span className="label">Groups</span>
                        <span className="count">{pickerGroupCandidates.length}</span>
                      </SectionToggle>
                      {(pickerSearch.trim() !== '' || groupsOpen) && (
                        <PickerList>
                          {pickerGroupCandidates.map((g) => {
                          const total       = g.credentials.length;
                          const allAttached = g.attachedCount === total;
                          const isAttaching = attachingGroup === g.group_id;
                          const busy        = attachingGroup != null || attachingPerson != null;
                          const disabled    = pickerMode === 'remove' ? busy : (allAttached || busy);

                          let statusLine: string;
                          if (pickerMode === 'remove') {
                            statusLine = `${g.member_count} ${g.member_count === 1 ? 'person' : 'people'} · ${g.attachedCount} ${g.attachedCount === 1 ? 'credential' : 'credentials'} on this door — clicking removes ${g.attachedCount === 1 ? 'it' : 'them all'}`;
                          } else if (allAttached) {
                            statusLine = `All ${total} ${total === 1 ? 'credential' : 'credentials'} already on this door`;
                          } else if (g.attachedCount > 0) {
                            statusLine = `${g.member_count} ${g.member_count === 1 ? 'person' : 'people'} · ${g.attachedCount} of ${total} already on this door — clicking adds the remaining ${total - g.attachedCount}`;
                          } else {
                            statusLine = `${g.member_count} ${g.member_count === 1 ? 'person' : 'people'} · ${total} ${total === 1 ? 'credential' : 'credentials'}`;
                          }

                          return (
                            <PickerItem
                              key={g.group_id}
                              onClick={() => {
                                if (disabled) return;
                                if (pickerMode === 'remove') {
                                  setBulkDetachTarget({ kind: 'group', id: g.group_id, name: g.name, count: g.attachedCount });
                                } else {
                                  doAttachGroup(g);
                                }
                              }}
                              style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                            >
                              <span className="crest"><IconUsersGroup size={16} /></span>
                              <div className="body">
                                <div className="name">{g.name}</div>
                                <div className="meta">{statusLine}</div>
                              </div>
                              {isAttaching && <span style={{ fontSize: 12 }}>Attaching…</span>}
                            </PickerItem>
                          );
                        })}
                      </PickerList>
                      )}
                    </>
                  )}

                  {pickerCandidates.length > 0 && (
                    <>
                      <SectionToggle
                        type="button"
                        onClick={() => setPeopleOpen((v) => !v)}
                        aria-expanded={pickerSearch.trim() ? true : peopleOpen}
                      >
                        {(pickerSearch.trim() ? true : peopleOpen)
                          ? <IconChevronDown  className="chev" size={14} />
                          : <IconChevronRight className="chev" size={14} />}
                        <IconUser className="icon" size={14} />
                        <span className="label">People</span>
                        <span className="count">{pickerCandidates.length}</span>
                      </SectionToggle>
                      {(pickerSearch.trim() !== '' || peopleOpen) && (
                        <PickerList>
                          {pickerCandidates.map((g) => {
                          const total       = g.credentials.length;
                          const allAttached = g.attachedCount === total;
                          const isAttaching = attachingPerson === g.person_id;
                          const busy        = attachingGroup != null || attachingPerson != null;
                          const disabled    = pickerMode === 'remove' ? busy : (allAttached || busy);

                          let statusLine: string;
                          if (pickerMode === 'remove') {
                            statusLine = `${g.attachedCount} ${g.attachedCount === 1 ? 'credential' : 'credentials'} on this door — clicking removes ${g.attachedCount === 1 ? 'it' : 'them all'}`;
                          } else if (allAttached) {
                            statusLine = `All ${total} ${total === 1 ? 'credential' : 'credentials'} already on this door`;
                          } else if (g.attachedCount > 0) {
                            statusLine = `${g.attachedCount} of ${total} already on this door — clicking adds the remaining ${total - g.attachedCount}`;
                          } else {
                            statusLine = `${total} ${total === 1 ? 'credential' : 'credentials'}`;
                          }

                          return (
                            <PickerItem
                              key={g.person_id}
                              onClick={() => {
                                if (disabled) return;
                                if (pickerMode === 'remove') {
                                  setBulkDetachTarget({ kind: 'person', id: g.person_id, name: g.name, count: g.attachedCount });
                                } else {
                                  doAttachPerson(g);
                                }
                              }}
                              style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                            >
                              <span className="crest"><IconUser size={16} /></span>
                              <div className="body">
                                <div className="name">
                                  {g.name}
                                  {g.employee_id && (
                                    <span style={{
                                      marginLeft: 6,
                                      fontSize: 11,
                                      fontWeight: 500,
                                      color: '#94a3b8',
                                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                    }}>
                                      {g.employee_id}
                                    </span>
                                  )}
                                </div>
                                <div className="meta">{statusLine}</div>
                                {/* Tiny per-credential breakdown so the user knows what they're attaching. */}
                                <div style={{
                                  display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4,
                                }}>
                                  {g.credentials.map((c) => {
                                    const cfg = getTypeConfig(c.credential_type);
                                    const isAttached = attachedIds.has(c.id);
                                    return (
                                      <span key={c.id} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '2px 6px', borderRadius: 5,
                                        background: isAttached ? '#dcfce7' : '#f1f5f9',
                                        color:      isAttached ? '#166534' : '#475569',
                                        fontSize: 10, fontWeight: 600,
                                      }}>
                                        {cfg.label}{isAttached ? ' ✓' : ''}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                              {isAttaching && <span style={{ fontSize: 12 }}>Attaching…</span>}
                            </PickerItem>
                          );
                        })}
                      </PickerList>
                      )}
                    </>
                  )}
                </>
              )}
            </DialogBody>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setPickerOpen(false)}>
                Close
              </SecondaryButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}

      {/* ── Detach confirm ────────────────────────────────────────────────── */}
      {detachTarget && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setDetachTarget(null); }}>
          <Dialog style={{ maxWidth: 420 }}>
            <DialogHeader>
              <h2>Remove credential</h2>
              <IconBtn type="button" onClick={() => setDetachTarget(null)}><IconX size={16} /></IconBtn>
            </DialogHeader>
            <div style={{ padding: '20px 22px', fontSize: 14, lineHeight: 1.55 }}>
              Remove <strong>{personFullName(detachTarget) ?? 'Unassigned'}</strong>
              &rsquo;s <strong>{detachTarget.credential_name}</strong> from this door?
              The credential itself stays — only the link to this device is removed.
            </div>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setDetachTarget(null)}>Cancel</SecondaryButton>
              <DangerButton type="button" disabled={detaching} onClick={doDetach}>
                {detaching ? 'Removing…' : <><IconCheck size={14} /> Remove</>}
              </DangerButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}

      {/* ── Bulk detach confirm (picker remove mode) ──────────────────────── */}
      {bulkDetachTarget && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setBulkDetachTarget(null); }}>
          <Dialog style={{ maxWidth: 420 }}>
            <DialogHeader>
              <h2>Remove {bulkDetachTarget.kind === 'group' ? 'group' : 'person'} from this door</h2>
              <IconBtn type="button" onClick={() => setBulkDetachTarget(null)}><IconX size={16} /></IconBtn>
            </DialogHeader>
            <div style={{ padding: '20px 22px', fontSize: 14, lineHeight: 1.55 }}>
              Remove <strong>{bulkDetachTarget.name}</strong>
              {bulkDetachTarget.kind === 'group' ? "'s members'" : "'s"}{' '}
              <strong>{bulkDetachTarget.count} {bulkDetachTarget.count === 1 ? 'credential' : 'credentials'}</strong>{' '}
              from this door? The credentials themselves stay — only their links
              to this device are removed. The lock updates on the next device push.
            </div>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setBulkDetachTarget(null)}>Cancel</SecondaryButton>
              <DangerButton type="button" disabled={bulkDetaching} onClick={doBulkDetach}>
                {bulkDetaching ? 'Removing…' : <><IconCheck size={14} /> Remove all</>}
              </DangerButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}
    </>
  );
}

export default DeviceCredentials;
