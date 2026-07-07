-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_authorId_clientMessageId_key" ON "ChatMessage"("authorId", "clientMessageId");
