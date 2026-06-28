-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "isChat" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentionedUserIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceNotificationSetting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskAssignedEmail" BOOLEAN NOT NULL DEFAULT true,
    "taskMentionedEmail" BOOLEAN NOT NULL DEFAULT true,
    "taskDueReminderEmail" BOOLEAN NOT NULL DEFAULT true,
    "taskDueReminderHours" INTEGER NOT NULL DEFAULT 24,
    "commentReplyEmail" BOOLEAN NOT NULL DEFAULT true,
    "commentMentionEmail" BOOLEAN NOT NULL DEFAULT true,
    "dailyDigest" BOOLEAN NOT NULL DEFAULT false,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceNotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "taskAssignedEmail" BOOLEAN,
    "taskMentionedEmail" BOOLEAN,
    "taskDueReminderEmail" BOOLEAN,
    "taskDueReminderHours" INTEGER,
    "dailyDigest" BOOLEAN,
    "weeklyDigest" BOOLEAN,
    "emailDelayMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatChannel_workspaceId_idx" ON "ChatChannel"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_workspaceId_name_key" ON "ChatChannel"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_authorId_idx" ON "ChatMessage"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceNotificationSetting_workspaceId_key" ON "WorkspaceNotificationSetting"("workspaceId");

-- CreateIndex
CREATE INDEX "UserNotificationPreference_userId_idx" ON "UserNotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreference_userId_workspaceId_key" ON "UserNotificationPreference"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "EmailJob_userId_status_idx" ON "EmailJob"("userId", "status");

-- CreateIndex
CREATE INDEX "EmailJob_scheduledAt_idx" ON "EmailJob"("scheduledAt");

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceNotificationSetting" ADD CONSTRAINT "WorkspaceNotificationSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
