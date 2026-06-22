import { useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '@/features/workspace';
import { SettingsTabs, GeneralTab, MembersTab, ColumnsTab, DangerZoneTab } from '@/features/workspace';
import { Skeleton } from '@/components/ui/skeleton';
import { initials } from '@/features/workspace/components/role';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export function WorkspaceSettingsPage() {
  const { workspaceId = '' } = useParams();
  const ws = useWorkspace(workspaceId);

  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8">
      <header className="flex items-center gap-3">
        <Link
          to={`/board/${workspaceId}`}
          className="btn-ghost h-8 w-8 p-0"
          aria-label="Back to board"
          title="Back to board"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {ws.isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 text-[12px]">
              <AvatarFallback>{initials(ws.data?.name ?? '?')}</AvatarFallback>
            </Avatar>
            <div>
              <span className="caption">Workspace settings</span>
              <h1 className="text-[20px] font-semibold tracking-tight">
                {ws.data?.name ?? 'Untitled'}
              </h1>
            </div>
          </div>
        )}
      </header>

      <SettingsTabs workspaceId={workspaceId}>
        {{
          general: <GeneralTab workspaceId={workspaceId} />,
          members: <MembersTab workspaceId={workspaceId} />,
          columns: <ColumnsTab workspaceId={workspaceId} />,
          danger: <DangerZoneTab workspaceId={workspaceId} />,
        }}
      </SettingsTabs>
    </div>
  );
}
