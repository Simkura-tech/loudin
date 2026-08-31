/**
 * PeoplePage — full CRUD for door-access credential holders.
 *
 * Backend: /api/people (tenant-scoped via JWT). List supports search +
 * status filter; modal handles both create and edit; delete is a soft delete
 * confirmed by a small prompt.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconPlus,
  IconSearch,
  IconUserPlus,
  IconEdit,
  IconTrash,
  IconX,
  IconCheck,
  IconChevronDown,
} from '@tabler/icons-react';
import {
  peopleApi,
  type Person,
  type PersonPayload,
  type PersonStatus,
} from '../../services/access/people';
import { peopleGroupsApi, type PeopleGroup } from '../../services/access/peopleGroups';
import GroupPicker from '../../components/people/GroupPicker';
import GroupMenu from '../../components/people/GroupMenu';

const STATUSES: PersonStatus[] = ['active', 'inactive', 'suspended'];

// ── Page chrome ───────────────────────────────────────────────────────────────

const PageHeader = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;

  h1 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0 0 2px;
  }
  .sub {
    color: ${({ theme }) => theme.colors.text.secondary};
    font-size: 13px;
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  border: none;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.brand.primaryHover ?? theme.colors.brand.primary};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`;

const SearchWrap = styled.div`
  position: relative;
  flex: 1;
  min-width: 220px;
  max-width: 360px;

  .icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  input {
    width: 100%;
    height: 32px;
    padding: 0 10px 0 32px;
    border-radius: 7px;
    border: 1px solid ${({ theme }) => theme.colors.border.light};
    background: ${({ theme }) => theme.colors.background.primary};
    color: ${({ theme }) => theme.colors.text.primary};
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;

    &:focus {
      outline: none;
      border-color: ${({ theme }) => theme.colors.brand.primary};
      box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
    }
  }
`;

const FilterSelect = styled.select`
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
  }
`;

// ── Table ─────────────────────────────────────────────────────────────────────

const TableCard = styled.div`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  thead th {
    text-align: left;
    padding: 9px 14px;
    background: ${({ theme }) => theme.colors.background.secondary};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  }

  tbody td {
    padding: 10px 14px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
    vertical-align: middle;
  }

  tbody tr:last-child td { border-bottom: none; }
  tbody tr.clickable { cursor: pointer; }
  tbody tr:hover { background: ${({ theme }) => theme.colors.background.secondary}55; }

  .name {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  .meta {
    color: ${({ theme }) => theme.colors.text.tertiary};
    font-size: 12px;
    margin-top: 1px;
  }
  .actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }
`;

const StatusPill = styled.span<{ $status: PersonStatus }>`
  display: inline-block;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: capitalize;
  background: ${({ $status }) =>
    $status === 'active'    ? '#dcfce7'
  : $status === 'suspended' ? '#fef3c7'
  :                           '#f1f5f9'};
  color: ${({ $status }) =>
    $status === 'active'    ? '#166534'
  : $status === 'suspended' ? '#92400e'
  :                           '#475569'};
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
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.primary};
  }
  &.danger:hover {
    background: #fef2f2;
    color: #b91c1c;
    border-color: #fecaca;
  }
`;

const Empty = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};

  .crest {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.tertiary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }
  h3 {
    color: ${({ theme }) => theme.colors.text.primary};
    margin: 0 0 4px;
    font-size: 16px;
  }
  p { margin: 0 0 16px; font-size: 14px; }
`;

const SkeletonRow = styled.div`
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

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  margin-bottom: 16px;
`;

/* Inline-edit trigger inside the Group cell of the table. */
const GroupCellTrigger = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  margin: -3px -8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  max-width: 100%;

  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chev {
    opacity: 0;
    transition: opacity 0.15s ease;
    flex-shrink: 0;
  }
  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
    border-color: ${({ theme }) => theme.colors.border.light};
  }
  &:hover .chev { opacity: 0.5; }
`;

const GroupPopover = styled.div`
  position: fixed;
  z-index: 200;
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
  overflow: hidden;
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
  max-width: 500px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
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

  h2 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
  }
`;

const DialogBody = styled.div`
  padding: 14px 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
`;

const FullSpan = styled.div`
  grid-column: 1 / -1;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
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

const Textarea = styled.textarea`
  min-height: 70px;
  padding: 9px 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13px;
  font-family: inherit;
  resize: vertical;

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

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
  }
`;

const SecondaryButton = styled.button`
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

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
  }
`;

const DangerButton = styled(PrimaryButton)`
  background: #dc2626;
  &:hover { background: #b91c1c; }
`;

// ── Component ─────────────────────────────────────────────────────────────────

const EMPTY_PAYLOAD: PersonPayload = {
  first_name: '',
  last_name: '',
  email: '',
  phone_number: '',
  employee_id: '',
  department: '',
  job_title: '',
  status: 'active',
  notes: '',
  group_id: null,
};

export function PeoplePage() {
  const navigate = useNavigate();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PersonStatus | ''>('');
  const [groupFilter, setGroupFilter] = useState<number | 'none' | ''>('');
  const [groups, setGroups] = useState<PeopleGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editing, setEditing]         = useState<Person | null>(null);
  const [form, setForm]               = useState<PersonPayload>(EMPTY_PAYLOAD);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // Inline group edit (click the Group cell on a row to pop a GroupPicker).
  const [groupEdit, setGroupEdit] = useState<{ personId: number; rect: DOMRect } | null>(null);
  const groupPopoverRef = useRef<HTMLDivElement>(null);

  const fetchPeople = useCallback(async () => {
    setError(null);
    try {
      const r = await peopleApi.list({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        group_id: groupFilter === '' ? undefined : groupFilter,
      });
      setPeople(r.people);
      setTotal(r.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load people');
      setPeople([]);
    }
  }, [search, statusFilter, groupFilter]);

  // Debounce search; status filter is instant.
  useEffect(() => {
    const t = setTimeout(fetchPeople, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [fetchPeople, search]);

  // Load groups once for the filter dropdown + modal picker. Refetched when
  // we re-open the modal (cheap) so newly-created groups appear immediately.
  useEffect(() => {
    peopleGroupsApi.list().then(setGroups).catch(() => setGroups([]));
  }, []);

  const refreshGroups = useCallback(async () => {
    try { setGroups(await peopleGroupsApi.list()); } catch { /* ignore */ }
  }, []);

  // Close the inline group-edit popover on outside-click or Escape.
  useEffect(() => {
    if (!groupEdit) return;
    const onMouseDown = (e: MouseEvent) => {
      if (groupPopoverRef.current && !groupPopoverRef.current.contains(e.target as Node)) {
        setGroupEdit(null);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setGroupEdit(null); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [groupEdit]);

  const openGroupEdit = (e: React.MouseEvent<HTMLButtonElement>, personId: number) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setGroupEdit({ personId, rect });
  };

  const handleInlineGroupChange = async (personId: number, groupId: number | null) => {
    try {
      const updated = await peopleApi.update(personId, { group_id: groupId });
      setPeople((arr) => arr ? arr.map((p) => (p.id === personId ? updated : p)) : arr);
      setGroupEdit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update group');
      setGroupEdit(null);
    }
  };

  // Honor /app/people?group_id=… deep links from the Groups page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get('group_id');
    if (g === 'none') setGroupFilter('none');
    else if (g && Number.isInteger(Number(g))) setGroupFilter(Number(g));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_PAYLOAD);
    setSaveError(null);
    refreshGroups();
    setDialogOpen(true);
  };

  const openEdit = (p: Person) => {
    setEditing(p);
    setForm({
      first_name:   p.first_name,
      last_name:    p.last_name,
      email:        p.email ?? '',
      phone_number: p.phone_number ?? '',
      employee_id:  p.employee_id ?? '',
      department:   p.department ?? '',
      job_title:    p.job_title ?? '',
      status:       p.status,
      notes:        p.notes ?? '',
      group_id:     p.group_id,
    });
    setSaveError(null);
    refreshGroups();
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const payload = { ...form };
      // Normalize empty strings to null on optional fields so the backend
      // doesn't store blank strings.
      (['email','phone_number','employee_id','department','job_title','notes'] as const).forEach((k) => {
        if (!payload[k]) payload[k] = null;
      });
      if (editing) {
        await peopleApi.update(editing.id, payload);
      } else {
        await peopleApi.create(payload);
      }
      setDialogOpen(false);
      await fetchPeople();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await peopleApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      await fetchPeople();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const hasFilter = useMemo(() => Boolean(search.trim() || statusFilter), [search, statusFilter]);

  return (
    <>
      <PageHeader>
        <div>
          <h1>People</h1>
          <div className="sub">
            {people === null ? 'Loading…' : `${total} ${total === 1 ? 'person' : 'people'} with door access.`}
          </div>
        </div>
        <PrimaryButton onClick={openCreate}>
          <IconPlus size={16} /> Add person
        </PrimaryButton>
      </PageHeader>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <Toolbar>
        <SearchWrap>
          <IconSearch className="icon" size={16} />
          <input
            type="text"
            placeholder="Search name, email, employee ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </SearchWrap>
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PersonStatus | '')}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={groupFilter === 'none' ? 'none' : groupFilter === '' ? '' : String(groupFilter)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') setGroupFilter('');
            else if (v === 'none') setGroupFilter('none');
            else setGroupFilter(Number(v));
          }}
        >
          <option value="">All groups</option>
          <option value="none">No group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </FilterSelect>
      </Toolbar>

      <TableCard>
        {people === null ? (
          <>
            <SkeletonRow /><SkeletonRow /><SkeletonRow />
          </>
        ) : people.length === 0 ? (
          <Empty>
            <span className="crest"><IconUserPlus size={22} strokeWidth={1.5} /></span>
            <h3>{hasFilter ? 'No matches' : 'No people yet'}</h3>
            <p>
              {hasFilter
                ? 'Try a different search or clear the status filter.'
                : 'Add the first person who needs door access.'}
            </p>
            {!hasFilter && (
              <PrimaryButton onClick={openCreate}>
                <IconPlus size={16} /> Add person
              </PrimaryButton>
            )}
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Employee ID</th>
                <th>Group</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr
                  key={p.id}
                  className="clickable"
                  onClick={() => navigate(`/app/people/${p.id}`)}
                >
                  <td>
                    <div className="name">{p.first_name} {p.last_name}</div>
                    {p.email && <div className="meta">{p.email}</div>}
                  </td>
                  <td>{p.employee_id || <span style={{ opacity: 0.4 }}>—</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <GroupCellTrigger
                      type="button"
                      onClick={(e) => openGroupEdit(e, p.id)}
                      title="Change group"
                    >
                      <span className="name">
                        {p.group_name || <span style={{ opacity: 0.4 }}>—</span>}
                      </span>
                      <IconChevronDown className="chev" size={14} />
                    </GroupCellTrigger>
                  </td>
                  <td><StatusPill $status={p.status}>{p.status}</StatusPill></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="actions">
                      <IconButton onClick={() => openEdit(p)} title="Edit">
                        <IconEdit size={16} />
                      </IconButton>
                      <IconButton className="danger" onClick={() => setDeleteTarget(p)} title="Delete">
                        <IconTrash size={16} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>

      {dialogOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setDialogOpen(false); }}>
          <Dialog>
            <form onSubmit={handleSave}>
              <DialogHeader>
                <h2>{editing ? 'Edit person' : 'Add person'}</h2>
                <IconButton type="button" onClick={() => setDialogOpen(false)}>
                  <IconX size={16} />
                </IconButton>
              </DialogHeader>
              <DialogBody>
                <Field>
                  <FieldLabel>First name *</FieldLabel>
                  <Input
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    required autoFocus
                  />
                </Field>
                <Field>
                  <FieldLabel>Last name *</FieldLabel>
                  <Input
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Phone</FieldLabel>
                  <Input
                    value={form.phone_number ?? ''}
                    onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Employee ID</FieldLabel>
                  <Input
                    value={form.employee_id ?? ''}
                    onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Department</FieldLabel>
                  <Input
                    value={form.department ?? ''}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Job title</FieldLabel>
                  <Input
                    value={form.job_title ?? ''}
                    onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <Select
                    value={form.status ?? 'active'}
                    onChange={(e) => setForm({ ...form, status: e.target.value as PersonStatus })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Group</FieldLabel>
                  <GroupPicker
                    value={form.group_id ?? null}
                    onChange={(id) => setForm({ ...form, group_id: id })}
                    groups={groups}
                    onGroupCreated={(g) =>
                      setGroups((gs) =>
                        [...gs.filter((x) => x.id !== g.id), g].sort((a, b) =>
                          a.name.localeCompare(b.name)
                        )
                      )
                    }
                  />
                </Field>
                <FullSpan>
                  <Field>
                    <FieldLabel>Notes</FieldLabel>
                    <Textarea
                      value={form.notes ?? ''}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Optional"
                    />
                  </Field>
                </FullSpan>
                {saveError && (
                  <FullSpan>
                    <ErrorBanner role="alert">{saveError}</ErrorBanner>
                  </FullSpan>
                )}
              </DialogBody>
              <DialogFooter>
                <SecondaryButton type="button" onClick={() => setDialogOpen(false)}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton type="submit" disabled={saving}>
                  {saving ? 'Saving…' : (
                    <>
                      <IconCheck size={16} /> {editing ? 'Save changes' : 'Add person'}
                    </>
                  )}
                </PrimaryButton>
              </DialogFooter>
            </form>
          </Dialog>
        </Backdrop>
      )}

      {deleteTarget && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <Dialog style={{ maxWidth: 440 }}>
            <DialogHeader>
              <h2>Remove person</h2>
              <IconButton type="button" onClick={() => setDeleteTarget(null)}>
                <IconX size={16} />
              </IconButton>
            </DialogHeader>
            <div style={{ padding: '20px 24px', fontSize: 14, lineHeight: 1.55 }}>
              Remove <strong>{deleteTarget.first_name} {deleteTarget.last_name}</strong> from your
              workspace? Their credentials will be revoked. This action can be reversed by support.
            </div>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setDeleteTarget(null)}>
                Cancel
              </SecondaryButton>
              <DangerButton type="button" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Removing…' : 'Remove'}
              </DangerButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}

      {groupEdit && createPortal(
        <GroupPopover
          ref={groupPopoverRef}
          style={{
            top:  Math.min(groupEdit.rect.bottom + 6, window.innerHeight - 280),
            left: Math.min(groupEdit.rect.left,       window.innerWidth  - 260),
          }}
        >
          <GroupMenu
            value={people?.find((p) => p.id === groupEdit.personId)?.group_id ?? null}
            onChange={(id) => handleInlineGroupChange(groupEdit.personId, id)}
            groups={groups}
            onGroupCreated={(g) =>
              setGroups((gs) =>
                [...gs.filter((x) => x.id !== g.id), g].sort((a, b) => a.name.localeCompare(b.name))
              )
            }
          />
        </GroupPopover>,
        document.body
      )}
    </>
  );
}

export default PeoplePage;
