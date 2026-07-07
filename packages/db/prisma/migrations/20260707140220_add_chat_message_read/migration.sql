-- CreateTable
CREATE TABLE "ChatMessageRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessageRead_channelId_idx" ON "ChatMessageRead"("channelId");

-- CreateIndex
CREATE INDEX "ChatMessageRead_messageId_idx" ON "ChatMessageRead"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageRead_userId_messageId_key" ON "ChatMessageRead"("userId", "messageId");

-- AddForeignKey
ALTER TABLE "ChatMessageRead" ADD CONSTRAINT "ChatMessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageRead" ADD CONSTRAINT "ChatMessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
