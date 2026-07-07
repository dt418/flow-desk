-- DropIndex
DROP INDEX "Attachment_searchVector_idx";

-- DropIndex
DROP INDEX "Comment_searchVector_idx";

-- DropIndex
DROP INDEX "Task_searchVector_idx";

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "clientMessageId" TEXT;
