-- AlterTable: add generated tsvector column on Task
-- regexp_replace normalizes non-alphanumerics to spaces so hyphens/dots
-- don't glue tokens (e.g. "invoice-2026.xlsx" → "invoice 2026 xlsx").
ALTER TABLE "Task"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', regexp_replace(coalesce(title, '') || ' ' || coalesce(description, ''), '[^a-zA-Z0-9]+', ' ', 'g'))
  ) STORED;

CREATE INDEX "Task_searchVector_idx" ON "Task" USING GIN ("searchVector");

-- AlterTable: add generated tsvector column on Comment
ALTER TABLE "Comment"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', regexp_replace(coalesce(content, ''), '[^a-zA-Z0-9]+', ' ', 'g'))
  ) STORED;

CREATE INDEX "Comment_searchVector_idx" ON "Comment" USING GIN ("searchVector");

-- AlterTable: add generated tsvector column on Attachment
ALTER TABLE "Attachment"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', regexp_replace(coalesce(filename, ''), '[^a-zA-Z0-9]+', ' ', 'g'))
  ) STORED;

CREATE INDEX "Attachment_searchVector_idx" ON "Attachment" USING GIN ("searchVector");
