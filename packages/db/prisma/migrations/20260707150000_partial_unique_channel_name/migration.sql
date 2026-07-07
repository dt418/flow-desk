-- Replace non-partial unique index with partial unique index so soft-deleted
-- channels don't block name reuse within a workspace.
DROP INDEX IF EXISTS "ChatChannel_workspaceId_name_key";

CREATE UNIQUE INDEX "ChatChannel_workspaceId_name_key"
  ON "ChatChannel"("workspaceId", "name")
  WHERE "deletedAt" IS NULL;
