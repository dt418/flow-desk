import type { ChatMessageWithAuthor } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, initials } from '@/lib/utils';

interface MessageBubbleProps {
  message: ChatMessageWithAuthor;
  isOwn: boolean;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msgDate = new Date(d);
  msgDate.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - msgDate.getTime()) / 86_400_000;
  if (diff === 0) return formatTime(dateStr);
  if (diff === 1) return `Yesterday ${formatTime(dateStr)}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <div className={cn('flex gap-2 px-4 py-1.5', isOwn && 'flex-row-reverse')}>
      {!isOwn && (
        <Avatar className="mt-0.5 h-7 w-7 shrink-0">
          <AvatarImage src={message.author.avatarUrl ?? undefined} alt={message.author.name} />
          <AvatarFallback className="text-[10px]">{initials(message.author.name)}</AvatarFallback>
        </Avatar>
      )}
      <div className={cn('flex max-w-[70%] flex-col', isOwn && 'items-end')}>
        {!isOwn && (
          <span className="mb-0.5 text-xs font-medium text-muted-foreground">
            {message.author.name}
          </span>
        )}
        <div
          className={cn(
            'rounded-2xl px-3 py-1.5 text-sm',
            isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
          )}
        >
          {message.content}
        </div>
        <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
          {formatDate(message.createdAt)}
          {message.editedAt && ' (edited)'}
        </span>
      </div>
    </div>
  );
}
