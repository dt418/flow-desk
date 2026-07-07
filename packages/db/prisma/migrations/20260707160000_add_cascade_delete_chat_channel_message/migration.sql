-- AlterForeignKey: ChatChannel.workspace → add ON DELETE CASCADE
ALTER TABLE "ChatChannel" DROP CONSTRAINT "ChatChannel_workspaceId_fkey";
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterForeignKey: ChatMessage.channel → add ON DELETE CASCADE
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_channelId_fkey";
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
