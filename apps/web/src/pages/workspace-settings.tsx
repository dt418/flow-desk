import { useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '@/features/workspace';
import {
  SettingsTabs,
  GeneralTab,
  MembersTab,
  ColumnsTab,
  DangerZoneTab,
} from '@/features/workspace';
import { LabelManagerPage } from '@/features/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { initials } from '@/features/workspace/components/role';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function WorkspaceSettingsPage() {
  const { workspaceId = '' } = useParams();
  const ws = useWorkspace(workspaceId);

  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to board" title="Back to board">
          <Link to={`/board/${workspaceId}`}>
            <ArrowLeft />
          </Link>
        </Button>
        {ws.isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 text-[12px]">
              <AvatarFallback>{initials(ws.data?.name ?? '?')}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs text-muted-foreground">Workspace settings</p>
              <h1 className="text-2xl font-semibold tracking-tight">
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
          labels: <LabelManagerPage workspaceId={workspaceId} embedded />,
          danger: <DangerZoneTab workspaceId={workspaceId} />,
        }}
      </SettingsTabs>
    </div>
  );
}
