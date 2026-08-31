/**
 * Documents controller — public download library + platform-admin management.
 *
 * Public reads (`/api/documents`) return only published docs and never expose
 * the on-disk filename. Downloads go through `/api/documents/:id/download`,
 * which streams the file with its original name and bumps a download counter.
 *
 * Admin writes (`/api/platform/documents`) are platform-admin gated and accept
 * a multipart upload on create.
 *
 * Storage: bytes on local disk under apps/api/uploads/documents/, metadata
 * in the `documents` table. Local disk is fine for a single-VM deploy; swap
 * to object storage later without changing this contract.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const { query } = require('../../database/db');

// uploads/documents lives next to the API source (controllers/support → ../../).
const DOCS_DIR = path.join(__dirname, '..', '..', 'uploads', 'documents');
fs.mkdirSync(DOCS_DIR, { recursive: true });

// Allowed MIME types → canonical extension. Anything else is rejected before
// it touches disk. Documents are bigger than images (manuals, datasheets).
const ALLOWED = new Map([
  ['application/pdf', 'pdf'],
  ['application/zip', 'zip'],
  ['application/x-zip-compressed', 'zip'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOCS_DIR),
  filename: (req, file, cb) => {
    // Random, content-agnostic name — never trust the client filename, and
    // keep names unguessable so the static dir can't be enumerated.
    const ext = ALLOWED.get(file.mimetype) || 'bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type. Upload a PDF, ZIP, DOC, or DOCX.'));
  },
}).single('file');

/** Runs multer for the create route and turns its errors into clean 400s. */
function uploadMiddleware(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    let message = err.message;
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      message = 'File must be 25 MB or smaller.';
    }
    return res.status(400).json({ error: 'Bad Request', message });
  });
}

function badRequest(res, message) {
  return res.status(400).json({ error: 'Bad Request', message });
}
function notFound(res) {
  return res.status(404).json({ error: 'Not Found', message: 'Document not found' });
}

/** Coerce a multipart/JSON truthy flag ('true' | true) to a boolean. */
function toBool(v) {
  return v === true || v === 'true';
}

/** Public shape — no on-disk filename, includes a ready-to-use download path. */
function publicDoc(row) {
  return {
    id:            row.id,
    category:      row.category,
    title:         row.title,
    description:   row.description,
    file_name:     row.original_name,
    mime_type:     row.mime_type,
    size_bytes:    Number(row.size_bytes),
    download_path: `/api/documents/${row.id}/download`,
    created_at:    row.created_at,
  };
}

/** Admin shape — adds lifecycle fields the management UI needs. */
function adminDoc(row) {
  return {
    ...publicDoc(row),
    sort_order:     row.sort_order,
    download_count: row.download_count,
    is_published:   row.is_published,
    updated_at:     row.updated_at,
  };
}

// ── GET /api/documents ────────────────────────────────────────────────────────
// Public. Published docs only, ordered for grouped display by category.
async function publicList(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT * FROM documents
        WHERE is_published = TRUE
        ORDER BY category ASC, sort_order ASC, title ASC`
    );
    return res.json({ documents: rows.map(publicDoc) });
  } catch (err) {
    return next(err);
  }
}

// ── GET /api/documents/:id/download ───────────────────────────────────────────
// Public. Streams the file with its original name and increments the counter.
async function download(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      `UPDATE documents SET download_count = download_count + 1
        WHERE id = $1 AND is_published = TRUE
        RETURNING filename, original_name, mime_type`,
      [id]
    );
    if (rows.length === 0) return notFound(res);

    const abs = path.join(DOCS_DIR, rows[0].filename);
    if (!fs.existsSync(abs)) return notFound(res);

    res.type(rows[0].mime_type || 'application/octet-stream');
    return res.download(abs, rows[0].original_name, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    return next(err);
  }
}

// ── Admin CRUD under /api/platform/documents ──────────────────────────────────

async function adminList(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT * FROM documents
        ORDER BY category ASC, sort_order ASC, created_at DESC`
    );
    return res.json({ documents: rows.map(adminDoc) });
  } catch (err) {
    return next(err);
  }
}

// Multipart create: `file` part + title/category/description/sort_order/is_published fields.
async function create(req, res, next) {
  const f = req.file;
  try {
    if (!f) return badRequest(res, 'A document file is required (multipart field "file").');

    const { title, category, description, sort_order, is_published } = req.body || {};
    if (!title || !title.trim()) {
      fs.unlink(f.path, () => {}); // don't leave an orphaned file behind
      return badRequest(res, 'title is required');
    }

    const order = Number(sort_order);
    const { rows } = await query(
      `INSERT INTO documents
         (category, title, description, filename, original_name, mime_type, size_bytes, sort_order, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        (category && category.trim()) || 'General',
        title.trim(),
        description && description.trim() ? description.trim() : null,
        f.filename,
        f.originalname,
        f.mimetype,
        f.size,
        Number.isInteger(order) ? order : 0,
        is_published === undefined ? true : toBool(is_published),
      ]
    );
    return res.status(201).json({ document: adminDoc(rows[0]) });
  } catch (err) {
    if (f) fs.unlink(f.path, () => {});
    return next(err);
  }
}

// JSON metadata update (does not replace the file — delete + re-upload for that).
const EDITABLE = ['category', 'title', 'description', 'sort_order', 'is_published'];

async function update(req, res, next) {
  try {
    const id = Number(req.params.id);
    const sets = [];
    const params = [];

    for (const field of EDITABLE) {
      if (req.body[field] === undefined) continue;
      let v = req.body[field];

      if (field === 'sort_order') {
        const n = Number(v);
        if (!Number.isInteger(n)) return badRequest(res, 'sort_order must be an integer');
        v = n;
      } else if (field === 'is_published') {
        v = toBool(v);
      } else if (field === 'title' || field === 'category') {
        if (!v || !String(v).trim()) return badRequest(res, `${field} cannot be empty`);
        v = String(v).trim();
      } else if (field === 'description') {
        v = v && String(v).trim() ? String(v).trim() : null;
      }

      params.push(v);
      sets.push(`${field} = $${params.length}`);
    }

    if (sets.length === 0) return badRequest(res, 'No fields to update');
    params.push(id);

    const { rows } = await query(
      `UPDATE documents SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length}
        RETURNING *`,
      params
    );
    if (rows.length === 0) return notFound(res);
    return res.json({ document: adminDoc(rows[0]) });
  } catch (err) {
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      `DELETE FROM documents WHERE id = $1 RETURNING filename`,
      [id]
    );
    if (rows.length === 0) return notFound(res);
    // Best-effort file cleanup — a missing file shouldn't fail the API call.
    fs.unlink(path.join(DOCS_DIR, rows[0].filename), () => {});
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  uploadMiddleware,
  publicList,
  download,
  adminList,
  create,
  update,
  remove,
};
