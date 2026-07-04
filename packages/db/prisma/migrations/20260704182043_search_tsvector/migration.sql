-- AlterTable: add generated tsvector column on Task
ALTER TABLE "Task"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX "Task_searchVector_idx" ON "Task" USING GIN ("searchVector");

-- AlterTable: add generated tsvector column on Comment
ALTER TABLE "Comment"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(content, ''))
  ) STORED;

CREATE INDEX "Comment_searchVector_idx" ON "Comment" USING GIN ("searchVector");

-- AlterTable: add generated tsvector column on Attachment
ALTER TABLE "Attachment"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(filename, ''))
  ) STORED;

CREATE INDEX "Attachment_searchVector_idx" ON "Attachment" USING GIN ("searchVector");
