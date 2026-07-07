import { useEffect, useRef } from 'react';
import type { ChannelView, ChatMessageWithAuthor } from '../types';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { Skeleton } from '@/components/ui/skeleton';

interface ChannelViewProps {
  channel: ChannelView | null;
  messages: ChatMessageWithAuthor[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSend: (content: string) => void;
  currentUserId: string;
  sending?: boolean;
}

export function ChannelView({
  channel,
  messages,
  loading,
  hasMore,
  onLoadMore,
  onSend,
  currentUserId,
  sending,
}: ChannelViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLenRef.current = messages.length;
  }, [messages.length]);

  if (!channel) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Select a channel to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold"># {channel.name}</h2>
        {channel.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{channel.description}</p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        {hasMore && (
          <div ref={topRef} className="flex justify-center py-2">
            <button
              type="button"
              onClick={onLoadMore}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Load older messages
            </button>
          </div>
        )}

        {loading && (
          <div className="space-y-3 px-4 py-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No messages yet. Start a conversation!</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} isOwn={msg.authorId === currentUserId} />
        ))}
        <div ref={bottomRef} />
      </div>

      <ChatInput channelId={channel.id} onSend={onSend} disabled={sending} placeholder={`Message #${channel.name}`} />
    </div>
  );
}
