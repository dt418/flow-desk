-- P4-3 Integration OAuth tokens (Slack + GitLab)
-- One row per (provider, workspace, external account). Tokens encrypted at
-- rest with AES-256-GCM. Soft-delete so disconnect+reconnect of the same
-- account is allowed.

-- Enum
CREATE TYPE "IntegrationProvider" AS ENUM ('SLACK', 'GITLAB');

CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "externalAccountName" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "accessTokenCipher" TEXT NOT NULL,
    "refreshTokenCipher" TEXT,
    "accessTokenExpiresAt" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Integration_workspaceId_provider_idx" ON "Integration"("workspaceId", "provider");
CREATE INDEX "Integration_userId_idx" ON "Integration"("userId");
CREATE INDEX "Integration_deletedAt_idx" ON "Integration"("deletedAt");

-- Partial unique index: one live integration per (provider, workspace, account)
CREATE UNIQUE INDEX "Integration_provider_workspace_account_active_key"
  ON "Integration"("provider", "workspaceId", "externalAccountId")
  WHERE "deletedAt" IS NULL;

-- FKs
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
