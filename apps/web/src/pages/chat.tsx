import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import {
  useChannels,
  useCreateChannel,
  useMessages,
  useSendMessage,
  useChatRealtime,
  useChatPresence,
  useFlattenedMessages,
  useReadReceipts,
  useAutoMarkRead,
} from '@/features/chat';
import { ChatSidebar } from '@/features/chat/components/ChatSidebar';
import { ChannelView } from '@/features/chat/components/ChannelView';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function ChatPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelDesc, setChannelDesc] = useState('');

  const channelsQuery = useChannels(workspaceId);
  const messagesQuery = useMessages(workspaceId, activeChannelId ?? '');
  const sendMessage = useSendMessage(workspaceId, activeChannelId ?? '', user!);
  const createChannel = useCreateChannel(workspaceId);

  useChatRealtime(workspaceId, activeChannelId);
  const viewers = useChatPresence(activeChannelId);
  const readReceipts = useReadReceipts(activeChannelId);
  useAutoMarkRead(workspaceId, activeChannelId, user?.id ?? null);

  const messages = useFlattenedMessages(messagesQuery.data);
  const channels = channelsQuery.data?.data ?? [];

  const activeChannel = channels.find((ch) => ch.id === activeChannelId) ?? null;
  const hasMore = messagesQuery.hasNextPage ?? false;

  const handleSend = (content: string) => {
    if (!activeChannelId) return;
    sendMessage.mutate({
      content,
      mentionedUserIds: [],
      clientMessageId: crypto.randomUUID(),
    });
  };

  const handleResend = (content: string) => {
    handleSend(content);
  };

  const handleCreate = () => {
    const name = channelName.trim();
    if (!name) return;
    createChannel.mutate(
      {
        workspaceId,
        name,
        isPrivate: false,
        scope: 'WORKSPACE',
        description: channelDesc.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setChannelName('');
          setChannelDesc('');
          toast.success('Channel created');
        },
        onError: () => toast.error('Failed to create channel'),
      },
    );
  };

  const handleLoadMore = () => {
    messagesQuery.fetchNextPage();
  };

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0">
        <ChatSidebar
          channels={channels}
          activeChannelId={activeChannelId}
          onSelect={setActiveChannelId}
          onCreate={() => setCreateOpen(true)}
          loading={channelsQuery.isLoading}
        />
      </div>
      <div className="flex-1">
        <ChannelView
          channel={activeChannel}
          messages={messages}
          loading={messagesQuery.isLoading}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onSend={handleSend}
          onResend={handleResend}
          currentUserId={user?.id ?? ''}
          sending={sendMessage.isPending}
          viewerCount={viewers.length}
          readReceipts={readReceipts}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="label-xs mb-1 block">Name</label>
              <Input
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="e.g. general"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
              />
            </div>
            <div>
              <label className="label-xs mb-1 block">Description (optional)</label>
              <Input
                value={channelDesc}
                onChange={(e) => setChannelDesc(e.target.value)}
                placeholder="What's this channel about?"
              />
            </div>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!channelName.trim() || createChannel.isPending}
              className="w-full"
            >
              {createChannel.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
