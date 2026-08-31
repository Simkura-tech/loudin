/**
 * Platform admin — support documents CRUD.
 *
 * Public list/download lives behind /api/documents (no auth). This admin
 * service surfaces unpublished docs, lifecycle fields, and create/update/
 * delete. Gated server-side by requirePlatformAdmin.
 */

import api from '../api';

export interface AdminDocument {
  id: number;
  category: string;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  download_path: string;
  created_at: string;
  sort_order: number;
  download_count: number;
  is_published: boolean;
  updated_at: string;
}

/** Metadata fields editable via PATCH (the file itself is immutable — delete + re-upload). */
export interface DocumentMetaPayload {
  category?: string;
  title?: string;
  description?: string | null;
  sort_order?: number;
  is_published?: boolean;
}

export interface NewDocumentMeta {
  title: string;
  category: string;
  description?: string;
  sort_order?: number;
  is_published?: boolean;
}

export const platformDocumentsApi = {
  list: () =>
    api.get<{ documents: AdminDocument[] }, { documents: AdminDocument[] }>(
      '/api/platform/documents',
    ).then((r) => r.documents),

  /** Multipart create. The api client strips the default JSON content-type
   *  for FormData bodies so axios sets multipart with a boundary. */
  create: (file: File, meta: NewDocumentMeta) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', meta.title);
    fd.append('category', meta.category);
    if (meta.description != null) fd.append('description', meta.description);
    if (meta.sort_order != null) fd.append('sort_order', String(meta.sort_order));
    if (meta.is_published != null) fd.append('is_published', String(meta.is_published));
    return api.post<{ document: AdminDocument }, { document: AdminDocument }>(
      '/api/platform/documents', fd, { timeout: 60_000 },
    ).then((r) => r.document);
  },

  update: (id: number, payload: DocumentMetaPayload) =>
    api.patch<{ document: AdminDocument }, { document: AdminDocument }>(
      `/api/platform/documents/${id}`, payload,
    ).then((r) => r.document),

  remove: (id: number) =>
    api.delete<void, void>(`/api/platform/documents/${id}`),
};
