-- Self-service downloadable documents (spec sheets, install guides, manuals,
-- integration docs, etc.) surfaced on the public Support page and managed by
-- platform admins.
--
-- File BYTES live on local disk under apps/api/uploads/documents/ (same
-- convention as product images — see controllers/shop/productImages.js). Only
-- metadata lives here; `filename` is the random on-disk name, `original_name`
-- is what the visitor's browser saves the download as.
--
-- `category` is intentionally free TEXT (an open, extensible list) rather than
-- an enum, so new document groupings can be added without a migration.

CREATE TABLE IF NOT EXISTS documents (
    id              SERIAL PRIMARY KEY,
    category        VARCHAR(80)  NOT NULL DEFAULT 'General',
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    -- Storage: random on-disk name vs. the client-facing download name.
    filename        VARCHAR(255) NOT NULL,
    original_name   VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(120) NOT NULL,
    size_bytes      BIGINT       NOT NULL,
    -- Presentation + lifecycle.
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    download_count  INTEGER      NOT NULL DEFAULT 0,
    is_published    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- The public Support page lists published docs grouped by category, in
-- (category, sort_order, title) order — this index matches that read.
CREATE INDEX idx_documents_published
    ON documents (category, sort_order, title)
    WHERE is_published = TRUE;

COMMENT ON TABLE  documents               IS 'Downloadable support documents (spec sheets, guides, manuals). Bytes on disk; metadata here.';
COMMENT ON COLUMN documents.filename      IS 'Random, unguessable on-disk filename under uploads/documents/.';
COMMENT ON COLUMN documents.original_name IS 'Client-facing download filename (Content-Disposition).';
COMMENT ON COLUMN documents.category      IS 'Free-text grouping (open list), e.g. "Spec sheets", "Install guides".';
