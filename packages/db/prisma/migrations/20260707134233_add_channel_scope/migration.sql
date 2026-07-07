-- AlterTable
ALTER TABLE "ChatChannel" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'WORKSPACE',
ADD COLUMN     "taskId" TEXT;

-- CreateIndex
CREATE INDEX "ChatChannel_taskId_idx" ON "ChatChannel"("taskId");
