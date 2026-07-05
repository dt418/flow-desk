import { useState } from 'react';
import { Settings, Users, Columns3, AlertTriangle, Tag, Bookmark, Webhook } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceRole } from '../hooks';
import { canDeleteWorkspace, canManageColumns, canManageMembers } from './role';
import { WebhooksTab } from '../../webhook/components/WebhooksTab';

type TabId = 'general' | 'members' | 'columns' | 'labels' | 'views' | 'webhooks' | 'danger';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Settings;
  visible: (role: ReturnType<typeof useWorkspaceRole>) => boolean;
}

const TABS: TabDef[] = [
  { id: 'general', label: 'General', icon: Settings, visible: () => true },
  {
    id: 'members',
    label: 'Members',
    icon: Users,
    visible: (r) => canManageMembers(r) || r !== null,
  },
  {
    id: 'columns',
    label: 'Columns',
    icon: Columns3,
    visible: (r) => canManageColumns(r) || r !== null,
  },
  {
    id: 'labels',
    label: 'Labels',
    icon: Tag,
    visible: () => true,
  },
  {
    id: 'views',
    label: 'Saved views',
    icon: Bookmark,
    visible: () => true,
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    icon: Webhook,
    visible: () => true,
  },
  {
    id: 'danger',
    label: 'Danger zone',
    icon: AlertTriangle,
    visible: (r) => canDeleteWorkspace(r),
  },
];

interface Props {
  workspaceId: string;
  children: Partial<Record<TabId, React.ReactNode>>;
}

export function SettingsTabs({ workspaceId, children }: Props) {
  const role = useWorkspaceRole(workspaceId);
  const [active, setActive] = useState<TabId>('general');
  const visibleTabs = TABS.filter((t) => t.visible(role));

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="lg:w-56">
        <ul className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-1">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === active;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setActive(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    tab.id === 'danger' &&
                      !isActive &&
                      'text-destructive/80 hover:text-destructive',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex-1 min-w-0">
        {active === 'webhooks' ? (
          <WebhooksTab />
        ) : (
          <div className="rounded-lg border border-border bg-card p-5">{children[active]}</div>
        )}
      </div>
    </div>
  );
}
