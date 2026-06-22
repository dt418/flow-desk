import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { useDeleteWorkspace, useWorkspace, useWorkspaceRole } from '../hooks';
import { canDeleteWorkspace } from './role';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';

interface Props {
  workspaceId: string;
}

export function DangerZoneTab({ workspaceId }: Props) {
  const navigate = useNavigate();
  const ws = useWorkspace(workspaceId);
  const role = useWorkspaceRole(workspaceId);
  const del = useDeleteWorkspace(workspaceId);
  const [confirmText, setConfirmText] = useState('');

  const allowed = canDeleteWorkspace(role);
  const wsName = ws.data?.name ?? '';
  const matchRequired = wsName.trim();
  const canSubmit = allowed && confirmText.trim() === matchRequired && !del.isPending;

  const onDelete = async () => {
    if (!canSubmit) return;
    try {
      await del.mutateAsync();
      toast.success(`Workspace “${wsName}” deleted`);
      navigate('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete workspace');
    }
  };

  if (ws.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-5">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-red-500">
          <Trash2 className="h-4 w-4" />
          Delete this workspace
        </h3>
        <p className="mt-2 text-[12px] text-[var(--fg-2)]">
          This soft-deletes the workspace and all its tasks. Members lose access immediately.
          Data is recoverable for 30 days via an admin tool.
        </p>
      </div>

      {!allowed ? (
        <p className="caption">Only the workspace owner can delete this workspace.</p>
      ) : (
        <>
          <p className="text-[13px]">
            Type <span className="font-mono font-semibold">{matchRequired}</span> to confirm.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={matchRequired}
            className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/60"
          />
          <Button
            type="button"
            onClick={onDelete}
            disabled={!canSubmit}
            variant="destructive"
            className="h-9 w-fit px-4 text-[12px]"
          >
            {del.isPending ? 'Deleting…' : 'Delete workspace'}
          </Button>
        </>
      )}
    </div>
  );
}
