import type { ChannelWithLatest } from '../types';
import { ChannelItem } from './ChannelItem';

interface ChatSidebarProps {
  channels: ChannelWithLatest[];
  activeChannelId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  loading?: boolean;
}

export function ChatSidebar({
  channels,
  activeChannelId,
  onSelect,
  onCreate,
  loading,
}: ChatSidebarProps) {
  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold">Channels</span>
        <button
          type="button"
          onClick={onCreate}
          aria-label="Create channel"
          className="flex h-6 w-6 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Create channel"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="px-4 py-2 text-xs text-muted-foreground">Loading…</div>}
        {!loading && channels.length === 0 && (
          <div className="px-4 py-2 text-xs text-muted-foreground">No channels yet</div>
        )}
        {channels.map((ch) => (
          <ChannelItem
            key={ch.id}
            channel={ch}
            active={ch.id === activeChannelId}
            onClick={() => onSelect(ch.id)}
          />
        ))}
      </div>
    </div>
  );
}

export { ChannelItem };
