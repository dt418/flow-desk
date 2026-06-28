import type { ChatMessageWithAuthor } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface MessageBubbleProps {
  message: ChatMessageWithAuthor;
  isOwn: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
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
    <div className={`flex gap-2 px-4 py-1.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && (
        <Avatar className="mt-0.5 h-7 w-7 shrink-0">
          <AvatarImage src={message.author.avatarUrl ?? undefined} />
          <AvatarFallback className="text-[10px]">{initials(message.author.name)}</AvatarFallback>
        </Avatar>
      )}
      <div className={`flex max-w-[70%] flex-col ${isOwn ? 'items-end' : ''}`}>
        {!isOwn && (
          <span className="mb-0.5 text-[11px] font-medium text-[var(--fg-2)]">
            {message.author.name}
          </span>
        )}
        <div
          className={`rounded-2xl px-3 py-1.5 text-sm ${
            isOwn ? 'bg-emerald-500 text-white' : 'bg-[var(--bg-3)] text-[var(--fg)]'
          }`}
        >
          {message.content}
        </div>
        <span className="mt-0.5 px-1 text-[10px] text-[var(--fg-3)]">
          {formatDate(message.createdAt)}
          {message.editedAt && ' (edited)'}
        </span>
      </div>
    </div>
  );
}
