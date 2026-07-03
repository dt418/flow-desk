import { cn } from '@/lib/utils';
import type { ChannelWithLatest } from '../types';

interface ChannelItemProps {
  channel: ChannelWithLatest;
  active: boolean;
  onClick: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function ChannelItem({ channel, active, onClick }: ChannelItemProps) {
  const preview = channel.latestMessage?.content ?? 'No messages';
  const previewClamped = preview.length > 60 ? `${preview.slice(0, 60)}…` : preview;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'w-full px-4 py-2 text-left transition-colors hover:bg-muted',
        active && 'bg-primary/10',
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn('text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>
          # {channel.name}
        </span>
        {channel.latestMessage && (
          <span className="text-xs text-muted-foreground">
            {timeAgo(channel.latestMessage.createdAt)}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{previewClamped}</p>
    </button>
  );
}
