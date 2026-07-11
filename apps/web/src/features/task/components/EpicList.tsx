import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FOCUS_RING_CLASS } from '@/lib/a11y';
import { cn } from '@/lib/utils';
import { Plus, ChevronRight, ChevronDown } from 'lucide-react';

interface TaskRow {
  id: string;
  title: string;
  type: string;
  parentTaskId: string | null;
  status: string;
  priority: string;
}

const TYPE_ICON: Record<string, string> = {
  EPIC: '📦',
  STORY: '📖',
  SUBTASK: '🔗',
  TASK: '•',
};

const STATUS_STYLE: Record<string, string> = {
  BACKLOG: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  TODO: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  IN_PROGRESS: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  IN_REVIEW: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  DONE: 'bg-green-500/15 text-green-700 dark:text-green-300',
  BLOCKED: 'bg-red-500/15 text-red-700 dark:text-red-300',
};

export default function EpicListPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const qc = useQueryClient();
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [creatingEpic, setCreatingEpic] = useState(false);
  const [epicTitle, setEpicTitle] = useState('');
  const [addingStoryTo, setAddingStoryTo] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState('');

  const tasks = useQuery({
    queryKey: ['epic-tasks', workspaceId],
    queryFn: () => api<{ data: TaskRow[] }>(`/api/tasks?workspaceId=${workspaceId}&limit=200`),
    enabled: Boolean(workspaceId),
  });

  const columns = useQuery({
    queryKey: ['columns', workspaceId],
    queryFn: () =>
      api<{ data: Array<{ id: string; name: string }> }>(`/api/workspaces/${workspaceId}/columns`),
    enabled: Boolean(workspaceId),
  });

  const createTask = useMutation({
    mutationFn: (body: { title: string; type: string; parentTaskId?: string; columnId: string }) =>
      api(`/api/tasks`, { method: 'POST', json: { workspaceId, ...body } }),
    onSuccess: () => {
      toast.success('Created');
      qc.invalidateQueries({ queryKey: ['epic-tasks', workspaceId] });
    },
  });

  const all = tasks.data?.data ?? [];
  const epics = all.filter((t) => t.type === 'EPIC');
  const childrenOf = (epicId: string) => all.filter((t) => t.parentTaskId === epicId);

  function toggleEpic(id: string) {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreateEpic() {
    const colId = columns.data?.data[0]?.id;
    if (!colId || !epicTitle.trim()) return;
    createTask.mutate(
      { title: epicTitle.trim(), type: 'EPIC', columnId: colId },
      {
        onSuccess: () => {
          setCreatingEpic(false);
          setEpicTitle('');
        },
      },
    );
  }

  function handleAddStory(epicId: string) {
    const colId = columns.data?.data[0]?.id;
    if (!colId || !storyTitle.trim()) return;
    createTask.mutate(
      { title: storyTitle.trim(), type: 'STORY', parentTaskId: epicId, columnId: colId },
      {
        onSuccess: () => {
          setAddingStoryTo(null);
          setStoryTitle('');
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Epics</h1>
        <Button
          size="sm"
          className={cn(FOCUS_RING_CLASS)}
          onClick={() => {
            setCreatingEpic(true);
            setEpicTitle('');
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> New epic
        </Button>
      </div>

      {/* Create epic inline */}
      {creatingEpic && (
        <div className="flex gap-2 rounded-lg border border-border p-3">
          <Input
            value={epicTitle}
            onChange={(e) => setEpicTitle(e.target.value)}
            placeholder="Epic title..."
            className={FOCUS_RING_CLASS}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreateEpic()}
          />
          <Button
            size="sm"
            onClick={handleCreateEpic}
            disabled={!epicTitle.trim() || createTask.isPending}
          >
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCreatingEpic(false)}>
            Cancel
          </Button>
        </div>
      )}

      {epics.length === 0 && !creatingEpic && (
        <p className="text-sm text-muted-foreground">
          No epics yet. Click "New epic" to create one.
        </p>
      )}

      <ul className="space-y-2">
        {epics.map((epic) => {
          const kids = childrenOf(epic.id);
          const done = kids.filter((k) => k.status === 'DONE').length;
          const expanded = expandedEpics.has(epic.id) || creatingEpic === false;
          return (
            <li key={epic.id} className="rounded-lg border border-border">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => toggleEpic(epic.id)}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                <span>{TYPE_ICON.EPIC}</span>
                <span className="flex-1 font-medium">{epic.title}</span>
                <Badge className={cn('text-[10px]', STATUS_STYLE[epic.status] ?? '')}>
                  {epic.status}
                </Badge>
                {kids.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {done}/{kids.length} done
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setAddingStoryTo(epic.id);
                    setStoryTitle('');
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" /> Story
                </Button>
              </div>

              {/* Children */}
              {expanded && (
                <ul className="border-t border-border px-6 py-2">
                  {kids.length === 0 && (
                    <li className="py-1 text-xs text-muted-foreground">No stories yet</li>
                  )}
                  {kids.map((child) => (
                    <li key={child.id} className="flex items-center gap-2 py-1 text-sm">
                      <span>{TYPE_ICON[child.type] ?? '•'}</span>
                      <span className="flex-1">{child.title}</span>
                      <Badge className={cn('text-[10px]', STATUS_STYLE[child.status] ?? '')}>
                        {child.status}
                      </Badge>
                    </li>
                  ))}

                  {/* Add story inline */}
                  {addingStoryTo === epic.id && (
                    <li className="flex gap-2 py-1">
                      <Input
                        value={storyTitle}
                        onChange={(e) => setStoryTitle(e.target.value)}
                        placeholder="Story title..."
                        className="h-7 text-xs"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleAddStory(epic.id)}
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleAddStory(epic.id)}
                        disabled={!storyTitle.trim()}
                      >
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setAddingStoryTo(null)}
                      >
                        Cancel
                      </Button>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
