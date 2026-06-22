import { useState } from 'react';
import { Settings, Users, Columns3, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceRole } from '../hooks';
import { canDeleteWorkspace, canManageColumns, canManageMembers } from './role';

type TabId = 'general' | 'members' | 'columns' | 'danger';

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
    id: 'danger',
    label: 'Danger zone',
    icon: AlertTriangle,
    visible: (r) => canDeleteWorkspace(r),
  },
];

interface Props {
  workspaceId: string;
  children: Record<TabId, React.ReactNode>;
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
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors',
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'text-[var(--fg-2)] hover:bg-[var(--bg-2)]',
                    tab.id === 'danger' && !isActive && 'text-red-500/80 hover:text-red-500',
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
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5">
          {children[active]}
        </div>
      </div>
    </div>
  );
}
