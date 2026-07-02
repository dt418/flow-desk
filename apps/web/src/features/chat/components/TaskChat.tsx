import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn, initials } from '@/lib/utils';

interface ChatComment {
  id: string;
  content: string;
  authorId: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface TaskChatProps {
  taskId: string;
}

export function TaskChat({ taskId }: TaskChatProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const queryKey = ['task-chat', taskId];

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => api<{ data: ChatComment[] }>(`/api/tasks/${encodeURIComponent(taskId)}/chat`),
    enabled: Boolean(taskId),
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api<{ data: ChatComment }>('/api/comments', {
        method: 'POST',
        json: { taskId, content, isChat: true },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setInput('');
    },
    onError: () => toast.error('Failed to send message'),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !sendMutation.isPending) {
        sendMutation.mutate(trimmed);
      }
    }
  };

  const handleInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-2 p-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        )}
        {isError && (
          <div
            role="alert"
            className="m-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
          >
            Failed to load chat: {(error as Error | null)?.message ?? 'unknown error'}
          </div>
        )}
        {!isLoading && !isError && (!data?.data || data.data.length === 0) && (
          <div className="flex h-full items-center justify-center p-4">
            <p className="text-xs text-muted-foreground">No messages yet</p>
          </div>
        )}
        {(data?.data ?? []).map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-2 px-3 py-1.5',
              msg.authorId === user?.id && 'flex-row-reverse',
            )}
          >
            {msg.authorId !== user?.id && (
              <Avatar className="mt-0.5 h-6 w-6 shrink-0">
                <AvatarImage src={msg.author.avatarUrl ?? undefined} alt={msg.author.name} />
                <AvatarFallback className="text-[9px]">{initials(msg.author.name)}</AvatarFallback>
              </Avatar>
            )}
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3 py-1.5 text-sm',
                msg.authorId === user?.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground',
              )}
            >
              <p className="text-[10px] font-medium text-muted-foreground">{msg.author.name}</p>
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              <p className="mt-0.5 text-right text-[9px] opacity-60">{formatTime(msg.createdAt)}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Chat…"
            aria-label="Chat message"
            rows={1}
            disabled={sendMutation.isPending}
            className="max-h-24 min-h-[32px] flex-1 resize-none rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const trimmed = input.trim();
              if (trimmed && !sendMutation.isPending) {
                sendMutation.mutate(trimmed);
              }
            }}
            disabled={sendMutation.isPending || !input.trim()}
            className="shrink-0"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
