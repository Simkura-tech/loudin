/**
 * PersonDetailPage — full view of one person + their credentials.
 *
 * Routed as /app/people/:id. The People list links here; this page owns
 * everything access-related for the person — credentials now, group
 * memberships / schedule assignments / device access when those land.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconArrowLeft,
  IconCheck,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconKey,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';

import {
  peopleApi,
  type Person,
  type PersonStatus,
  type PersonPayload,
} from '../../services/access/people';
import {
  credentialsApi,
  type Credential,
  type CredentialPayload,
  type CredentialStatus,
} from '../../services/access/credentials';
import { peopleGroupsApi, type PeopleGroup } from '../../services/access/peopleGroups';
import GroupPicker from '../../components/people/GroupPicker';
import {
  CREDENTIAL_TYPES,
  getTypeConfig,
  type CredentialField,
} from '../../components/credentials/credentialTypes';

const PERSON_STATUSES: PersonStatus[] = ['active', 'inactive', 'suspended'];
const CRED_STATUSES: CredentialStatus[] = ['active', 'inactive'];

// ── Page chrome ───────────────────────────────────────────────────────────────

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-decoration: none;
  margin-bottom: 12px;

  &:hover { color: ${({ theme }) => theme.colors.text.primary}; }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  flex-wrap: wrap;

  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.brand.primary};
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 16px;
    flex-shrink: 0;
  }
  .name {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .sub {
    color: ${({ theme }) => theme.colors.text.secondary};
    font-size: 13px;
    margin-top: 2px;
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 6px;
  }
`;

const StatusPill = styled.span<{ $status: PersonStatus | CredentialStatus }>`
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

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: none;
  background: ${({ theme }) => theme.colors.brand.primary};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease;

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
`;

const DangerButton = styled(PrimaryButton)`
  background: #dc2626;
  &:hover { background: #b91c1c; }
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
  &.danger:hover {
    background: #fef2f2;
    color: #b91c1c;
    border-color: #fecaca;
  }
`;

// ── Two-column layout ─────────────────────────────────────────────────────────

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 14px;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.section`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
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
  padding: 12px 16px;
`;

const DetailRow = styled.div`
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px;
  padding: 7px 0;
  font-size: 13px;

  dt {
    color: ${({ theme }) => theme.colors.text.tertiary};
    font-weight: 500;
  }
  dd {
    margin: 0;
    color: ${({ theme }) => theme.colors.text.primary};
    word-break: break-word;
  }
  .empty { color: ${({ theme }) => theme.colors.text.tertiary}; opacity: 0.5; }
`;

// ── Credentials list ──────────────────────────────────────────────────────────

const CredList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const CredCard = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background.primary};

  .icon {
    width: 30px;
    height: 30px;
    border-radius: 7px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .title {
    font-weight: 600;
    font-size: 13px;
  }
  .detail {
    margin-top: 3px;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.secondary};
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .meta {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    background: ${({ theme }) => theme.colors.background.secondary};
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
  }
  .actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
`;

const PinReveal = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 12px;
  font-family: inherit;
  padding: 2px 4px;
  border-radius: 4px;

  &:hover { color: ${({ theme }) => theme.colors.text.primary}; }
`;

const EmptyCreds = styled.div`
  padding: 28px 16px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};

  .crest {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.tertiary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 15px;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  p { margin: 0 0 14px; font-size: 13px; }
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

const NotFound = styled.div`
  padding: 64px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};

  h2 { color: ${({ theme }) => theme.colors.text.primary}; margin: 0 0 6px; }
`;

// ── Shared modal pieces ───────────────────────────────────────────────────────

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

  h2 { font-size: 15px; font-weight: 600; margin: 0; }
`;

const DialogBody = styled.div`
  padding: 14px 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 480px) { grid-template-columns: 1fr; }
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

const Textarea = styled.textarea`
  min-height: 64px;
  padding: 8px 10px;
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

  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.brand.primary}; }
`;

// ── Credential type picker ────────────────────────────────────────────────────

const TypeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  grid-column: 1 / -1;

  @media (max-width: 480px) { grid-template-columns: 1fr; }
`;

const TypeOption = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.brand.primary : theme.colors.border.light)};
  background: ${({ theme, $active }) =>
    $active ? `${theme.colors.brand.primary}0a` : theme.colors.background.primary};
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: border-color 0.15s ease;

  .ico {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }
  .label { font-size: 13px; font-weight: 600; }
  .hint  { font-size: 12px; color: ${({ theme }) => theme.colors.text.secondary}; }
`;

const TypeImmutableNote = styled.div`
  grid-column: 1 / -1;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin-top: -4px;
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCredentialPayload(): CredentialPayload {
  return {
    credential_type: CREDENTIAL_TYPES[0].value,
    credential_name: '',
    credential_value: '',
    facility_code: '',
    card_number: '',
    status: 'active',
    valid_until: null,
    description: '',
    notes: '',
  };
}

/**
 * Read a field's current value off the form payload as a string, so the
 * config-driven renderer can stay agnostic of which key it's writing.
 */
function readField(payload: CredentialPayload, name: CredentialField['name']): string {
  return (payload[name] ?? '') as string;
}

const EMPTY_PERSON_PAYLOAD: PersonPayload = {
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

// ── Component ─────────────────────────────────────────────────────────────────

export function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const personId = Number(id);

  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [groups, setGroups] = useState<PeopleGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Person edit / delete
  const [editOpen, setEditOpen] = useState(false);
  const [personForm, setPersonForm] = useState<PersonPayload>(EMPTY_PERSON_PAYLOAD);
  const [personSaving, setPersonSaving] = useState(false);
  const [personSaveError, setPersonSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reveal PIN per credential
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  // Credential modal
  const [credOpen, setCredOpen] = useState(false);
  const [credEditing, setCredEditing] = useState<Credential | null>(null);
  const [credForm, setCredForm] = useState<CredentialPayload>(emptyCredentialPayload());
  const [credSaving, setCredSaving] = useState(false);
  const [credSaveError, setCredSaveError] = useState<string | null>(null);
  const [credDeleteTarget, setCredDeleteTarget] = useState<Credential | null>(null);
  const [credDeleting, setCredDeleting] = useState(false);

  const loadPerson = useCallback(async () => {
    try {
      const p = await peopleApi.get(personId);
      setPerson(p);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load person';
      if (/not found/i.test(msg)) setPerson(null);
      else { setError(msg); setPerson(null); }
    }
  }, [personId]);

  const loadCredentials = useCallback(async () => {
    try {
      const list = await credentialsApi.list({ person_id: personId });
      setCredentials(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load credentials');
      setCredentials([]);
    }
  }, [personId]);

  useEffect(() => {
    if (!Number.isFinite(personId)) {
      setPerson(null);
      return;
    }
    loadPerson();
    loadCredentials();
  }, [personId, loadPerson, loadCredentials]);

  // Groups list for the edit dialog. Re-fetched when opening the modal so a
  // freshly-created group shows up without a page reload.
  const refreshGroups = useCallback(async () => {
    try { setGroups(await peopleGroupsApi.list()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshGroups(); }, [refreshGroups]);

  // ── Person edit/delete ──────────────────────────────────────────────────────

  const openEdit = () => {
    if (!person) return;
    setPersonForm({
      first_name:   person.first_name,
      last_name:    person.last_name,
      email:        person.email ?? '',
      phone_number: person.phone_number ?? '',
      employee_id:  person.employee_id ?? '',
      department:   person.department ?? '',
      job_title:    person.job_title ?? '',
      status:       person.status,
      notes:        person.notes ?? '',
      group_id:     person.group_id,
    });
    setPersonSaveError(null);
    refreshGroups();
    setEditOpen(true);
  };

  const handlePersonSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPersonSaving(true);
    setPersonSaveError(null);
    try {
      const payload = { ...personForm };
      (['email','phone_number','employee_id','department','job_title','notes'] as const).forEach((k) => {
        if (!payload[k]) payload[k] = null;
      });
      await peopleApi.update(personId, payload);
      setEditOpen(false);
      await loadPerson();
    } catch (err) {
      setPersonSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setPersonSaving(false);
    }
  };

  const handlePersonDelete = async () => {
    setDeleting(true);
    try {
      await peopleApi.remove(personId);
      navigate('/app/people');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  // ── Credential add/edit/delete ──────────────────────────────────────────────

  const openCreateCred = () => {
    setCredEditing(null);
    setCredForm({ ...emptyCredentialPayload(), credential_name: '' });
    setCredSaveError(null);
    setCredAddedToast(null);
    setCredOpen(true);
  };

  const openEditCred = (c: Credential) => {
    setCredEditing(c);
    setCredForm({
      credential_type:  c.credential_type,
      credential_name:  c.credential_name,
      credential_value: c.credential_value ?? '',
      facility_code:    c.facility_code ?? '',
      card_number:      c.card_number ?? '',
      status:           c.status,
      valid_until:      c.valid_until ?? null,
      description:      c.description ?? '',
      notes:            c.notes ?? '',
    });
    setCredSaveError(null);
    setCredAddedToast(null);
    setCredOpen(true);
  };

  const closeCredModal = () => {
    setCredOpen(false);
    setCredAddedToast(null);
    setCredSaveError(null);
  };

  // "another" path keeps the modal open and resets the form (preserving
  // the chosen type and status) so several credentials can be added in a row.
  const [credAddedToast, setCredAddedToast] = useState<string | null>(null);

  const handleCredSave = async (e: React.FormEvent, andAnother = false) => {
    e.preventDefault();
    setCredSaveError(null);

    // Per-type validation (always — both create and edit).
    const validationError = getTypeConfig(credForm.credential_type).validate(credForm);
    if (validationError) {
      setCredSaveError(validationError);
      return;
    }

    setCredSaving(true);
    try {
      if (credEditing) {
        // Type is immutable; strip it from the patch payload.
        const { credential_type: _omit, ...rest } = credForm;
        void _omit;
        const normalized: Partial<CredentialPayload> = { ...rest };
        (['facility_code','card_number','description','notes'] as const).forEach((k) => {
          if (!normalized[k]) normalized[k] = null;
        });
        if (credForm.credential_type !== 'pin') normalized.credential_value = null;
        await credentialsApi.update(credEditing.id, normalized);
      } else {
        const payload: CredentialPayload = { ...credForm, person_id: personId };
        (['facility_code','card_number','description','notes'] as const).forEach((k) => {
          if (!payload[k]) (payload as unknown as Record<string, unknown>)[k] = null;
        });
        if (payload.credential_type !== 'pin') payload.credential_value = null;
        await credentialsApi.create(payload);
      }
      await loadCredentials();
      if (andAnother && !credEditing) {
        // Keep modal open; reset value fields + name but preserve type/status.
        const justAdded = credForm.credential_name;
        setCredForm({
          ...emptyCredentialPayload(),
          credential_type: credForm.credential_type,
          status:          credForm.status,
          credential_name: '',
        });
        setCredAddedToast(`Added “${justAdded}”. Enter the next one.`);
      } else {
        setCredOpen(false);
        setCredAddedToast(null);
      }
    } catch (err) {
      setCredSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setCredSaving(false);
    }
  };

  const handleCredDelete = async () => {
    if (!credDeleteTarget) return;
    setCredDeleting(true);
    try {
      await credentialsApi.remove(credDeleteTarget.id);
      setCredDeleteTarget(null);
      await loadCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setCredDeleting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const initials = useMemo(() => {
    if (!person) return '';
    return `${person.first_name[0] || ''}${person.last_name[0] || ''}`.toUpperCase();
  }, [person]);

  if (person === undefined) {
    return (
      <>
        <BackLink to="/app/people"><IconArrowLeft size={16} /> People</BackLink>
        <div style={{ color: '#94a3b8', padding: 32 }}>Loading…</div>
      </>
    );
  }

  if (person === null) {
    return (
      <>
        <BackLink to="/app/people"><IconArrowLeft size={16} /> People</BackLink>
        <NotFound>
          <h2>Person not found</h2>
          <p>They may have been removed, or the link is wrong.</p>
        </NotFound>
      </>
    );
  }

  return (
    <>
      <BackLink to="/app/people"><IconArrowLeft size={16} /> People</BackLink>

      <Header>
        <span className="avatar">{initials}</span>
        <div>
          <h1 className="name">{person.first_name} {person.last_name}</h1>
          <div className="sub">
            {person.email || person.employee_id || `Person #${person.id}`}
            {' · '}
            <StatusPill $status={person.status}>{person.status}</StatusPill>
          </div>
        </div>
        <div className="actions">
          <SecondaryButton onClick={openEdit}>
            <IconEdit size={16} /> Edit
          </SecondaryButton>
          <SecondaryButton onClick={() => setConfirmDelete(true)} style={{ color: '#b91c1c' }}>
            <IconTrash size={16} /> Delete
          </SecondaryButton>
        </div>
      </Header>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <Grid>
        <Panel>
          <PanelHeader><h2>Details</h2></PanelHeader>
          <PanelBody>
            <dl style={{ margin: 0 }}>
              <DetailRow><dt>Email</dt><dd>{person.email || <span className="empty">—</span>}</dd></DetailRow>
              <DetailRow><dt>Phone</dt><dd>{person.phone_number || <span className="empty">—</span>}</dd></DetailRow>
              <DetailRow><dt>Employee ID</dt><dd>{person.employee_id || <span className="empty">—</span>}</dd></DetailRow>
              <DetailRow><dt>Department</dt><dd>{person.department || <span className="empty">—</span>}</dd></DetailRow>
              <DetailRow><dt>Job title</dt><dd>{person.job_title || <span className="empty">—</span>}</dd></DetailRow>
              <DetailRow>
                <dt>Group</dt>
                <dd>
                  {person.group_name
                    ? <Link to={`/app/people?group_id=${person.group_id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>{person.group_name}</Link>
                    : <span className="empty">—</span>}
                </dd>
              </DetailRow>
              <DetailRow><dt>Notes</dt><dd>{person.notes || <span className="empty">—</span>}</dd></DetailRow>
            </dl>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <h2>Credentials</h2>
            <PrimaryButton onClick={openCreateCred}>
              <IconPlus size={16} /> Add credential
            </PrimaryButton>
          </PanelHeader>
          <PanelBody>
            {credentials === null ? (
              <div style={{ color: '#94a3b8' }}>Loading…</div>
            ) : credentials.length === 0 ? (
              <EmptyCreds>
                <span className="crest"><IconKey size={20} strokeWidth={1.5} /></span>
                <h3>No credentials yet</h3>
                <p>Add a PIN or scan a card so this person can open doors.</p>
                <PrimaryButton onClick={openCreateCred}>
                  <IconPlus size={16} /> Add credential
                </PrimaryButton>
              </EmptyCreds>
            ) : (
              <CredList>
                {credentials.map((c) => {
                  const isRevealed = revealed[c.id];
                  const cfg = getTypeConfig(c.credential_type);
                  return (
                    <CredCard key={c.id}>
                      <span className="icon">{cfg.icon}</span>
                      <div className="body">
                        <div className="title-row">
                          <span className="title">{c.credential_name}</span>
                          <StatusPill $status={c.status}>{c.status}</StatusPill>
                        </div>
                        <div className="detail">
                          <span style={{ fontSize: 11, letterSpacing: 0.04, fontWeight: 600 }}>
                            {cfg.label}
                          </span>
                          {c.credential_type === 'pin' ? (
                            <>
                              <span className="meta">{isRevealed ? c.credential_value : '••••'}</span>
                              <PinReveal type="button" onClick={() => setRevealed((r) => ({ ...r, [c.id]: !r[c.id] }))}>
                                {isRevealed ? <><IconEyeOff size={12} /> Hide</> : <><IconEye size={12} /> Show</>}
                              </PinReveal>
                            </>
                          ) : (
                            <>
                              {c.facility_code && <span className="meta">FC {c.facility_code}</span>}
                              <span className="meta">{c.card_number}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="actions">
                        <IconButton onClick={() => openEditCred(c)} title="Edit">
                          <IconEdit size={16} />
                        </IconButton>
                        <IconButton className="danger" onClick={() => setCredDeleteTarget(c)} title="Delete">
                          <IconTrash size={16} />
                        </IconButton>
                      </div>
                    </CredCard>
                  );
                })}
              </CredList>
            )}
          </PanelBody>
        </Panel>
      </Grid>

      {/* ── Person edit modal ───────────────────────────────────────────────── */}
      {editOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setEditOpen(false); }}>
          <Dialog>
            <form onSubmit={handlePersonSave}>
              <DialogHeader>
                <h2>Edit person</h2>
                <IconButton type="button" onClick={() => setEditOpen(false)}><IconX size={16} /></IconButton>
              </DialogHeader>
              <DialogBody>
                <Field>
                  <FieldLabel>First name *</FieldLabel>
                  <Input value={personForm.first_name}
                    onChange={(e) => setPersonForm({ ...personForm, first_name: e.target.value })}
                    required autoFocus />
                </Field>
                <Field>
                  <FieldLabel>Last name *</FieldLabel>
                  <Input value={personForm.last_name}
                    onChange={(e) => setPersonForm({ ...personForm, last_name: e.target.value })}
                    required />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input type="email" value={personForm.email ?? ''}
                    onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>Phone</FieldLabel>
                  <Input value={personForm.phone_number ?? ''}
                    onChange={(e) => setPersonForm({ ...personForm, phone_number: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>Employee ID</FieldLabel>
                  <Input value={personForm.employee_id ?? ''}
                    onChange={(e) => setPersonForm({ ...personForm, employee_id: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>Department</FieldLabel>
                  <Input value={personForm.department ?? ''}
                    onChange={(e) => setPersonForm({ ...personForm, department: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>Job title</FieldLabel>
                  <Input value={personForm.job_title ?? ''}
                    onChange={(e) => setPersonForm({ ...personForm, job_title: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <Select value={personForm.status ?? 'active'}
                    onChange={(e) => setPersonForm({ ...personForm, status: e.target.value as PersonStatus })}>
                    {PERSON_STATUSES.map((s) => (
                      <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Group</FieldLabel>
                  <GroupPicker
                    value={personForm.group_id ?? null}
                    onChange={(id) => setPersonForm({ ...personForm, group_id: id })}
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
                    <Textarea value={personForm.notes ?? ''}
                      onChange={(e) => setPersonForm({ ...personForm, notes: e.target.value })}
                      placeholder="Optional" />
                  </Field>
                </FullSpan>
                {personSaveError && <FullSpan><ErrorBanner>{personSaveError}</ErrorBanner></FullSpan>}
              </DialogBody>
              <DialogFooter>
                <SecondaryButton type="button" onClick={() => setEditOpen(false)}>Cancel</SecondaryButton>
                <PrimaryButton type="submit" disabled={personSaving}>
                  {personSaving ? 'Saving…' : <><IconCheck size={16} /> Save changes</>}
                </PrimaryButton>
              </DialogFooter>
            </form>
          </Dialog>
        </Backdrop>
      )}

      {/* ── Person delete confirm ───────────────────────────────────────────── */}
      {confirmDelete && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false); }}>
          <Dialog style={{ maxWidth: 420 }}>
            <DialogHeader>
              <h2>Remove person</h2>
              <IconButton type="button" onClick={() => setConfirmDelete(false)}><IconX size={16} /></IconButton>
            </DialogHeader>
            <div style={{ padding: '20px 22px', fontSize: 14, lineHeight: 1.55 }}>
              Remove <strong>{person.first_name} {person.last_name}</strong> from your workspace?
              Their credentials will be revoked. This action can be reversed by support.
            </div>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setConfirmDelete(false)}>Cancel</SecondaryButton>
              <DangerButton type="button" disabled={deleting} onClick={handlePersonDelete}>
                {deleting ? 'Removing…' : 'Remove'}
              </DangerButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}

      {/* ── Credential add/edit modal ───────────────────────────────────────── */}
      {credOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) closeCredModal(); }}>
          <Dialog>
            <form onSubmit={(e) => handleCredSave(e, false)}>
              <DialogHeader>
                <h2>{credEditing ? 'Edit credential' : 'Add credential'}</h2>
                <IconButton type="button" onClick={closeCredModal}><IconX size={16} /></IconButton>
              </DialogHeader>
              <DialogBody>
                <TypeGrid>
                  {CREDENTIAL_TYPES.map((cfg) => (
                    <TypeOption
                      key={cfg.value}
                      type="button"
                      $active={credForm.credential_type === cfg.value}
                      disabled={!!credEditing}
                      onClick={() => setCredForm({ ...credForm, credential_type: cfg.value })}
                    >
                      <span className="ico">{cfg.icon}</span>
                      <span className="label">{cfg.label}</span>
                      <span className="hint">{cfg.hint}</span>
                    </TypeOption>
                  ))}
                </TypeGrid>
                {credEditing && (
                  <TypeImmutableNote>
                    Credential type can&apos;t be changed — delete and recreate to switch types.
                  </TypeImmutableNote>
                )}

                <FullSpan>
                  <Field>
                    <FieldLabel>Name *</FieldLabel>
                    <Input value={credForm.credential_name}
                      onChange={(e) => setCredForm({ ...credForm, credential_name: e.target.value })}
                      placeholder={credForm.credential_type === 'pin' ? 'e.g. Main PIN' : 'e.g. Office badge'}
                      required />
                  </Field>
                </FullSpan>

                {/* Type-specific fields driven by the registry — no per-type
                    if/else here so adding a new credential_type only needs an
                    entry in CREDENTIAL_TYPES. */}
                {getTypeConfig(credForm.credential_type).fields.map((field) => {
                  const fullWidth = field.name === 'credential_value';
                  const input = (
                    <Field key={field.name}>
                      <FieldLabel>{field.label}</FieldLabel>
                      <Input
                        value={readField(credForm, field.name)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const v = field.normalize ? field.normalize(raw) : raw;
                          setCredForm({ ...credForm, [field.name]: v });
                        }}
                        placeholder={field.placeholder}
                        required={field.required}
                        inputMode={field.inputMode}
                        maxLength={field.maxLength}
                        autoComplete="off"
                      />
                    </Field>
                  );
                  return fullWidth ? <FullSpan key={field.name}>{input}</FullSpan> : input;
                })}

                <FullSpan>
                  <Field>
                    <FieldLabel>Status</FieldLabel>
                    <Select value={credForm.status ?? 'active'}
                      onChange={(e) => setCredForm({ ...credForm, status: e.target.value as CredentialStatus })}>
                      {CRED_STATUSES.map((s) => (
                        <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                      ))}
                    </Select>
                  </Field>
                </FullSpan>

                <FullSpan>
                  <Field>
                    <FieldLabel>Notes</FieldLabel>
                    <Textarea value={credForm.notes ?? ''}
                      onChange={(e) => setCredForm({ ...credForm, notes: e.target.value })}
                      placeholder="Optional" />
                  </Field>
                </FullSpan>
                {credAddedToast && (
                  <FullSpan>
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: 7,
                      background: '#dcfce7',
                      border: '1px solid #bbf7d0',
                      color: '#166534',
                      fontSize: 12,
                    }}>{credAddedToast}</div>
                  </FullSpan>
                )}
                {credSaveError && <FullSpan><ErrorBanner>{credSaveError}</ErrorBanner></FullSpan>}
              </DialogBody>
              <DialogFooter>
                <SecondaryButton type="button" onClick={closeCredModal}>Cancel</SecondaryButton>
                {!credEditing && (
                  <SecondaryButton
                    type="button"
                    disabled={credSaving}
                    onClick={(e) => handleCredSave(e as unknown as React.FormEvent, true)}
                  >
                    {credSaving ? 'Saving…' : <><IconPlus size={14} /> Save & add another</>}
                  </SecondaryButton>
                )}
                <PrimaryButton type="submit" disabled={credSaving}>
                  {credSaving ? 'Saving…' : <><IconCheck size={16} /> {credEditing ? 'Save changes' : 'Add credential'}</>}
                </PrimaryButton>
              </DialogFooter>
            </form>
          </Dialog>
        </Backdrop>
      )}

      {/* ── Credential delete confirm ───────────────────────────────────────── */}
      {credDeleteTarget && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setCredDeleteTarget(null); }}>
          <Dialog style={{ maxWidth: 420 }}>
            <DialogHeader>
              <h2>Delete credential</h2>
              <IconButton type="button" onClick={() => setCredDeleteTarget(null)}><IconX size={16} /></IconButton>
            </DialogHeader>
            <div style={{ padding: '20px 22px', fontSize: 14, lineHeight: 1.55 }}>
              Delete <strong>{credDeleteTarget.credential_name}</strong>? This person can no longer
              use it to open doors.
            </div>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setCredDeleteTarget(null)}>Cancel</SecondaryButton>
              <DangerButton type="button" disabled={credDeleting} onClick={handleCredDelete}>
                {credDeleting ? 'Deleting…' : 'Delete'}
              </DangerButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}
    </>
  );
}

export default PersonDetailPage;
