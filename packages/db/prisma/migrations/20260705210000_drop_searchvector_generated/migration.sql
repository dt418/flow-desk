-- Replace GENERATED ALWAYS AS with triggers so Prisma can coexist
-- with the tsvector columns.  PostgreSQL refuses to ALTER a generated
-- column directly, so we DROP it and re-add as a plain nullable
-- tsvector, then create triggers that keep it populated.

-- ── 1. Drop generated columns + indexes ──────────────────────────
DROP INDEX IF EXISTS "Task_searchVector_idx";
DROP INDEX IF EXISTS "Comment_searchVector_idx";
DROP INDEX IF EXISTS "Attachment_searchVector_idx";

ALTER TABLE "Task"       DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "Comment"    DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "Attachment" DROP COLUMN IF EXISTS "searchVector";

-- ── 2. Re-add as plain nullable tsvector ─────────────────────────
ALTER TABLE "Task"       ADD COLUMN "searchVector" tsvector;
ALTER TABLE "Comment"    ADD COLUMN "searchVector" tsvector;
ALTER TABLE "Attachment" ADD COLUMN "searchVector" tsvector;

-- ── 3. GIN indexes for full-text search ──────────────────────────
CREATE INDEX "Task_searchVector_idx"       ON "Task"       USING GIN ("searchVector");
CREATE INDEX "Comment_searchVector_idx"    ON "Comment"    USING GIN ("searchVector");
CREATE INDEX "Attachment_searchVector_idx" ON "Attachment"  USING GIN ("searchVector");

-- ── 4. Trigger function: rebuild searchVector from text fields ───
CREATE OR REPLACE FUNCTION rebuild_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'Task' THEN
    NEW."searchVector" := to_tsvector('english',
      regexp_replace(
        coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, ''),
        '[^a-zA-Z0-9]+', ' ', 'g'
      )
    );
  ELSIF TG_TABLE_NAME = 'Comment' THEN
    NEW."searchVector" := to_tsvector('english',
      regexp_replace(coalesce(NEW.content, ''), '[^a-zA-Z0-9]+', ' ', 'g')
    );
  ELSIF TG_TABLE_NAME = 'Attachment' THEN
    NEW."searchVector" := to_tsvector('english',
      regexp_replace(coalesce(NEW.filename, ''), '[^a-zA-Z0-9]+', ' ', 'g')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 5. Attach triggers (BEFORE INSERT OR UPDATE) ────────────────
CREATE TRIGGER trg_task_search_vector
  BEFORE INSERT OR UPDATE OF title, description
  ON "Task" FOR EACH ROW EXECUTE FUNCTION rebuild_search_vector();

CREATE TRIGGER trg_comment_search_vector
  BEFORE INSERT OR UPDATE OF content
  ON "Comment" FOR EACH ROW EXECUTE FUNCTION rebuild_search_vector();

CREATE TRIGGER trg_attachment_search_vector
  BEFORE INSERT OR UPDATE OF filename
  ON "Attachment" FOR EACH ROW EXECUTE FUNCTION rebuild_search_vector();

-- ── 6. Backfill existing rows ───────────────────────────────────
UPDATE "Task" SET "searchVector" = to_tsvector('english',
  regexp_replace(coalesce(title, '') || ' ' || coalesce(description, ''), '[^a-zA-Z0-9]+', ' ', 'g')
) WHERE "searchVector" IS NULL;

UPDATE "Comment" SET "searchVector" = to_tsvector('english',
  regexp_replace(coalesce(content, ''), '[^a-zA-Z0-9]+', ' ', 'g')
) WHERE "searchVector" IS NULL;

UPDATE "Attachment" SET "searchVector" = to_tsvector('english',
  regexp_replace(coalesce(filename, ''), '[^a-zA-Z0-9]+', ' ', 'g')
) WHERE "searchVector" IS NULL;
