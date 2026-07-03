import * as React from 'react';
import { Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNamespacedSocket } from '@/lib/socket';
import { cn, initials } from '@/lib/utils';

export interface PresenceUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Last heartbeat timestamp (ms). Server is authoritative; clients only filter for display. */
  lastSeen?: number;
}

interface PresenceBarProps {
  workspaceId: string;
  /** Max avatars to show before collapsing into "+N". Defaults to 5. */
  max?: number;
  className?: string;
}

/**
 * Stacked avatar list of users currently viewing this workspace.
 *
 * CLIENT PROTOCOL:
 *   - On socket.connect  → emit 'presence:join' { workspaceId }
 *   - Every 10s           → emit 'presence:heartbeat' { workspaceId }
 *   - On unmount/leave    → emit 'presence:leave'  { workspaceId }
 *   - Listen              → 'presence:update' (server broadcasts user list)
 *
 * Server: apps/api/src/modules/realtime/realtime.gateway.ts handles
 *   - presence:join     → register socket in `workspace:{id}` room
 *   - presence:heartbeat → refresh TTL for this socket (30s)
 *   - presence:leave    → remove socket from room, broadcast presence:update
 *   - presence:update   → broadcast full user list to room on every join/leave/TTL expiry
 */
export function PresenceBar({ workspaceId, max = 5, className }: PresenceBarProps) {
  const { socket } = useNamespacedSocket('/tasks');
  const [users, setUsers] = React.useState<PresenceUser[]>([]);

  React.useEffect(() => {
    if (!workspaceId) return;

    const join = () => socket.emit('presence:join', { workspaceId });
    join();
    socket.on('connect', join);

    const heartbeat = window.setInterval(() => {
      socket.emit('presence:heartbeat', { workspaceId });
    }, 10_000);

    const onUpdate = (next: PresenceUser[]) => {
      const cutoff = Date.now() - 30_000;
      setUsers(
        next
          .filter((u) => !u.lastSeen || u.lastSeen >= cutoff)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    };
    socket.on('presence:update', onUpdate);

    return () => {
      window.clearInterval(heartbeat);
      socket.emit('presence:leave', { workspaceId });
      socket.off('connect', join);
      socket.off('presence:update', onUpdate);
    };
  }, [socket, workspaceId]);

  if (users.length === 0) {
    return (
      <div
        className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}
        aria-label="No active collaborators"
        title="No active collaborators"
      >
        <Users className="h-3.5 w-3.5" aria-hidden />
        <span>Just you</span>
      </div>
    );
  }

  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;

  return (
    <div
      className={cn('inline-flex items-center gap-2', className)}
      aria-label={`${users.length} active collaborator${users.length === 1 ? '' : 's'}`}
    >
      <div className="flex -space-x-2">
        {visible.map((u) => (
          <Avatar key={u.userId} size="sm" className="ring-2 ring-background" title={u.name}>
            {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
            <AvatarFallback>{initials(u.name)}</AvatarFallback>
          </Avatar>
        ))}
        {overflow > 0 && (
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background"
          >
            +{overflow}
          </span>
        )}
      </div>
      <span className="hidden text-xs text-muted-foreground sm:inline">{users.length} online</span>
    </div>
  );
}
