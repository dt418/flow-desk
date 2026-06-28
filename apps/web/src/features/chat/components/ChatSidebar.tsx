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
    <div className="flex h-full flex-col border-r border-[var(--border)] bg-[var(--bg-2)]">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold">Channels</span>
        <button
          type="button"
          onClick={onCreate}
          className="flex h-6 w-6 items-center justify-center rounded-md text-sm text-[var(--fg-2)] hover:bg-[var(--bg-3)] hover:text-[var(--fg)]"
          title="Create channel"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="px-4 py-2 text-xs text-[var(--fg-3)]">Loading…</div>
        )}
        {!loading && channels.length === 0 && (
          <div className="px-4 py-2 text-xs text-[var(--fg-3)]">No channels yet</div>
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
