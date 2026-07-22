import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMembers } from '@/features/workspace';
import { useAddChannelMember, useChannelMembers, useRemoveChannelMember } from '../hooks';
import { toast } from 'sonner';

interface ChannelMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  channelId: string;
  channelName: string;
  currentUserId: string;
}

export function ChannelMembersDialog({
  open,
  onOpenChange,
  workspaceId,
  channelId,
  channelName,
  currentUserId,
}: ChannelMembersDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const membersQuery = useChannelMembers(workspaceId, channelId, open);
  const workspaceMembers = useMembers(workspaceId);
  const addMember = useAddChannelMember(workspaceId, channelId);
  const removeMember = useRemoveChannelMember(workspaceId, channelId);

  const channelMembers = membersQuery.data ?? [];
  const memberIds = useMemo(() => new Set(channelMembers.map((m) => m.userId)), [channelMembers]);

  const candidates = useMemo(() => {
    const list = workspaceMembers.data ?? [];
    return list.filter((m) => !memberIds.has(m.userId));
  }, [workspaceMembers.data, memberIds]);

  const handleAdd = () => {
    if (!selectedUserId) return;
    addMember.mutate(selectedUserId, {
      onSuccess: () => {
        setSelectedUserId('');
        toast.success('Member added');
      },
      onError: () => toast.error('Failed to add member'),
    });
  };

  const handleRemove = (userId: string) => {
    removeMember.mutate(userId, {
      onSuccess: () => toast.success('Member removed'),
      onError: () => toast.error('Failed to remove member'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Members — #{channelName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              aria-label="Add workspace member"
            >
              <option value="">Select member…</option>
              {candidates.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.name ?? m.user?.email ?? m.userId}
                </option>
              ))}
            </select>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={!selectedUserId || addMember.isPending}
            >
              Add
            </Button>
          </div>

          {membersQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading members…</p>
          )}

          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {channelMembers.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removeMember.isPending || channelMembers.length <= 1}
                  onClick={() => handleRemove(m.userId)}
                >
                  {m.userId === currentUserId ? 'Leave' : 'Remove'}
                </Button>
              </li>
            ))}
            {!membersQuery.isLoading && channelMembers.length === 0 && (
              <li className="text-sm text-muted-foreground">No members yet.</li>
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
