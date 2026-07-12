-- AlterTable
ALTER TABLE "Task" ADD COLUMN "startDate" TIMESTAMP(3),
ADD COLUMN "color" TEXT;

-- CreateIndex
CREATE INDEX "Task_startDate_idx" ON "Task"("startDate");
