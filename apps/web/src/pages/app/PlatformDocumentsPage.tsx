/**
 * PlatformDocumentsPage — admin management for the public document library.
 *
 * Platform-admin only (route is gated; backend also checks). Lists every
 * document including unpublished ones (greyed out). Upload modal captures the
 * file plus its category/title/description and publish state. Editing a doc
 * changes metadata only — the file is immutable, so replacing it is delete +
 * re-upload. Delete is hard (row + on-disk file), matching the controller.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import styled from '@emotion/styled';
import {
  IconAlertTriangle,
  IconCheck,
  IconDownload,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconPlus,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import {
  platformDocumentsApi,
  type AdminDocument,
} from '../../services/platform/platformDocuments';

// Same base resolution as services/api.ts: empty in dev (Vite proxies /api),
// the API domain in prod. Downloads are plain links so the browser honors the
// server's Content-Disposition.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ── Layout ───────────────────────────────────────────────────────────────────

const PageHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 16px;

  h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
  .sub { color: ${({ theme }) => theme.colors.text.secondary}; font-size: 13px; }
`;

const Section = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.background.primary};
  margin-bottom: 16px;
  overflow: hidden;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  h2 {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    margin: 0;
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
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

const SecondaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  text-decoration: none;

  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const DangerButton = styled(SecondaryButton)`
  color: #b91c1c;
  border-color: #fecaca;
  &:hover { background: #fef2f2; }
`;

// Anchor styled like SecondaryButton — used for the file download link so we
// get a real <a download> without the `as` polymorphism on a styled button.
const DownloadLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
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
  tbody tr.hidden-row td { opacity: 0.5; }

  .title  { font-weight: 600; }
  .desc   { color: ${({ theme }) => theme.colors.text.tertiary}; font-size: 12px; margin-top: 1px; max-width: 360px; }
  .nums   { font-variant-numeric: tabular-nums; }
  .muted  { color: ${({ theme }) => theme.colors.text.tertiary}; }
`;

const CategoryRow = styled.tr`
  td {
    background: ${({ theme }) => theme.colors.background.secondary};
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    padding: 7px 14px;
  }
`;

const StatusPill = styled.span<{ $published: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $published }) => ($published ? '#dcfce7' : '#f1f5f9')};
  color:      ${({ $published }) => ($published ? '#166534' : '#475569')};
`;

const Empty = styled.div`
  padding: 56px 16px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
`;

const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  margin: 0 16px 12px;
`;

// ── Modal pieces ─────────────────────────────────────────────────────────────

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
  max-width: 520px;
  background: ${({ theme }) => theme.colors.background.primary};
  border-radius: 12px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
`;

const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.light};
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
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
`;

const FieldLabel = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Input = styled.input`
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 14px;
  font-family: inherit;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
`;

const Textarea = styled.textarea`
  min-height: 84px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  font-size: 13.5px;
  font-family: inherit;
  resize: vertical;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brand.primary}26;
  }
`;

const Row2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 140px;
  gap: 10px;
`;

const CheckRow = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;

  input { width: 16px; height: 16px; }
`;

// A click-or-drop zone wrapping a hidden file input.
const UploadZone = styled.label<{ $hasFile?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px dashed ${({ theme }) => theme.colors.border.medium ?? theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.secondary};
  color: ${({ theme, $hasFile }) => ($hasFile ? theme.colors.text.primary : theme.colors.text.secondary)};
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover { border-color: ${({ theme }) => theme.colors.brand.primary}; }
  input { display: none; }

  .zicon { flex-shrink: 0; color: ${({ theme }) => theme.colors.brand.primary}; }
  .ztext { min-width: 0; }
  .zname { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .zhint { font-size: 11px; color: ${({ theme }) => theme.colors.text.tertiary}; }
`;

const FileFixed = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.secondary};
  font-size: 13px;

  .ficon { color: ${({ theme }) => theme.colors.brand.primary}; flex-shrink: 0; }
  .fname { font-weight: 600; }
  .fmeta { color: ${({ theme }) => theme.colors.text.tertiary}; font-size: 12px; }
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACCEPT = '.pdf,.zip,.doc,.docx,application/pdf,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function typeLabel(mime: string): string {
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('zip')) return 'ZIP';
  if (mime.includes('wordprocessingml')) return 'DOCX';
  if (mime.includes('msword')) return 'DOC';
  return 'FILE';
}

interface DocForm {
  title: string;
  category: string;
  description: string;
  sortOrder: string;
  isPublished: boolean;
}

function emptyForm(): DocForm {
  return { title: '', category: '', description: '', sortOrder: '0', isPublished: true };
}

// ── Component ────────────────────────────────────────────────────────────────

export function PlatformDocumentsPage() {
  const [docs, setDocs] = useState<AdminDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminDocument | null>(null);
  const [form, setForm] = useState<DocForm>(emptyForm());
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AdminDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setDocs(await platformDocumentsApi.list()); }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
      setDocs([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Existing categories power the datalist for quick reuse without locking the
  // field — category is an open list.
  const categories = useMemo(
    () => [...new Set((docs ?? []).map((d) => d.category))].sort((a, b) => a.localeCompare(b)),
    [docs],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, AdminDocument[]>();
    for (const d of docs ?? []) {
      if (!map.has(d.category)) map.set(d.category, []);
      map.get(d.category)!.push(d);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [docs]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFile(null);
    setSaveError(null);
    setModalOpen(true);
  };

  const openEdit = (d: AdminDocument) => {
    setEditing(d);
    setForm({
      title: d.title,
      category: d.category,
      description: d.description ?? '',
      sortOrder: String(d.sort_order),
      isPublished: d.is_published,
    });
    setFile(null);
    setSaveError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setSaveError(null);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setSaveError('Title is required.'); return; }
    if (!editing && !file) { setSaveError('Choose a file to upload.'); return; }

    setSaving(true);
    setSaveError(null);
    const meta = {
      title: form.title.trim(),
      category: form.category.trim() || 'General',
      description: form.description.trim(),
      sort_order: Number(form.sortOrder) || 0,
      is_published: form.isPublished,
    };
    try {
      if (editing) {
        await platformDocumentsApi.update(editing.id, meta);
      } else {
        await platformDocumentsApi.create(file as File, meta);
      }
      closeModal();
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (d: AdminDocument) => {
    setTogglingId(d.id);
    try {
      await platformDocumentsApi.update(d.id, { is_published: !d.is_published });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await platformDocumentsApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const total = docs?.length ?? 0;

  return (
    <>
      <PageHeader>
        <h1>Documents</h1>
        <div className="sub">
          {docs === null
            ? 'Loading…'
            : `${total} ${total === 1 ? 'document' : 'documents'} — spec sheets, guides, and manuals shown on the public Support page.`}
        </div>
      </PageHeader>

      <Section>
        <SectionHeader>
          <h2>Document library</h2>
          <PrimaryButton type="button" onClick={openCreate}>
            <IconPlus size={14} /> Upload document
          </PrimaryButton>
        </SectionHeader>
        {error && <ErrorBanner role="alert">{error}</ErrorBanner>}
        {docs === null ? (
          <Empty>Loading…</Empty>
        ) : docs.length === 0 ? (
          <Empty>
            <IconFileText size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div>No documents yet — upload a spec sheet or guide to populate the Support page.</div>
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Document</th>
                <th>File</th>
                <th>Order</th>
                <th className="nums">Downloads</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([category, items]) => (
                <Fragment key={category}>
                  <CategoryRow>
                    <td colSpan={6}>{category}</td>
                  </CategoryRow>
                  {items.map((d) => (
                    <tr key={d.id} className={d.is_published ? '' : 'hidden-row'}>
                      <td>
                        <div className="title">{d.title}</div>
                        {d.description && <div className="desc">{d.description}</div>}
                      </td>
                      <td className="muted">{typeLabel(d.mime_type)} · {formatBytes(d.size_bytes)}</td>
                      <td className="nums">{d.sort_order}</td>
                      <td className="nums">{d.download_count}</td>
                      <td><StatusPill $published={d.is_published}>{d.is_published ? 'Published' : 'Hidden'}</StatusPill></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {d.is_published && (
                            <DownloadLink
                              href={`${API_BASE}${d.download_path}`}
                              download
                              title="Download"
                            >
                              <IconDownload size={13} />
                            </DownloadLink>
                          )}
                          <SecondaryButton
                            type="button"
                            onClick={() => togglePublished(d)}
                            disabled={togglingId === d.id}
                            title={d.is_published ? 'Unpublish' : 'Publish'}
                          >
                            {d.is_published ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                          </SecondaryButton>
                          <SecondaryButton type="button" onClick={() => openEdit(d)}>
                            <IconEdit size={13} /> Edit
                          </SecondaryButton>
                          <DangerButton type="button" onClick={() => setDeleteTarget(d)} title="Delete">
                            <IconTrash size={13} />
                          </DangerButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* ── Upload / edit modal ─────────────────────────────────────────────── */}
      {modalOpen && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <Dialog>
            <form onSubmit={handleSave} style={{ display: 'contents' }}>
              <DialogHeader>
                <h2>{editing ? 'Edit document' : 'Upload document'}</h2>
                <IconBtn type="button" onClick={closeModal}><IconX size={16} /></IconBtn>
              </DialogHeader>
              <DialogBody>
                {editing ? (
                  <Field as="div">
                    <FieldLabel>File</FieldLabel>
                    <FileFixed>
                      <IconFileText className="ficon" size={20} />
                      <div>
                        <div className="fname">{editing.file_name}</div>
                        <div className="fmeta">
                          {typeLabel(editing.mime_type)} · {formatBytes(editing.size_bytes)} — replace by deleting and re-uploading
                        </div>
                      </div>
                    </FileFixed>
                  </Field>
                ) : (
                  <Field as="div">
                    <FieldLabel>File *</FieldLabel>
                    <UploadZone $hasFile={!!file}>
                      <input
                        type="file"
                        accept={ACCEPT}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setFile(f);
                          // Prefill the title from the filename if still empty.
                          if (f && !form.title.trim()) {
                            const base = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
                            setForm((s) => ({ ...s, title: base }));
                          }
                        }}
                      />
                      <span className="zicon"><IconUpload size={18} /></span>
                      <span className="ztext">
                        {file ? (
                          <>
                            <div className="zname">{file.name}</div>
                            <div className="zhint">{formatBytes(file.size)} — click to choose a different file</div>
                          </>
                        ) : (
                          <>
                            <div className="zname">Choose a file</div>
                            <div className="zhint">PDF, ZIP, DOC, or DOCX — max 25 MB</div>
                          </>
                        )}
                      </span>
                    </UploadZone>
                  </Field>
                )}

                <Field>
                  <FieldLabel>Title *</FieldLabel>
                  <Input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. LockPro Datasheet"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Field>

                <Row2>
                  <Field>
                    <FieldLabel>Category</FieldLabel>
                    <Input
                      type="text"
                      list="doc-categories"
                      placeholder="Spec sheets"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                    <datalist id="doc-categories">
                      {categories.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </Field>
                  <Field>
                    <FieldLabel>Sort order</FieldLabel>
                    <Input
                      type="number"
                      step="1"
                      value={form.sortOrder}
                      onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                    />
                  </Field>
                </Row2>

                <Field>
                  <FieldLabel>Description</FieldLabel>
                  <Textarea
                    placeholder="One or two lines shown under the title on the Support page."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Field>

                <CheckRow>
                  <input
                    type="checkbox"
                    checked={form.isPublished}
                    onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                  />
                  Published (visible on the public Support page)
                </CheckRow>

                {saveError && (
                  <div role="alert" style={{
                    padding: '8px 10px',
                    borderRadius: 7,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    fontSize: 12,
                  }}>{saveError}</div>
                )}
              </DialogBody>
              <DialogFooter>
                <SecondaryButton type="button" onClick={closeModal} disabled={saving}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton type="submit" disabled={saving}>
                  {saving
                    ? 'Saving…'
                    : <><IconCheck size={14} /> {editing ? 'Save changes' : 'Upload'}</>}
                </PrimaryButton>
              </DialogFooter>
            </form>
          </Dialog>
        </Backdrop>
      )}

      {/* ── Delete confirm ──────────────────────────────────────────────────── */}
      {deleteTarget && (
        <Backdrop onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <Dialog style={{ maxWidth: 420 }}>
            <DialogHeader>
              <h2><IconAlertTriangle size={16} /> Delete document?</h2>
              <IconBtn type="button" onClick={() => setDeleteTarget(null)}><IconX size={16} /></IconBtn>
            </DialogHeader>
            <DialogBody>
              Permanently delete <strong>{deleteTarget.title}</strong> and its file. This can't be
              undone, and any links to it will stop working.
            </DialogBody>
            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setDeleteTarget(null)}>Cancel</SecondaryButton>
              <DangerButton type="button" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : <><IconTrash size={13} /> Delete</>}
              </DangerButton>
            </DialogFooter>
          </Dialog>
        </Backdrop>
      )}
    </>
  );
}

export default PlatformDocumentsPage;
