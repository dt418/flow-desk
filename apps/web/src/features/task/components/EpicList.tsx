import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { workspaceApi } from '@/features/workspace/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { FOCUS_RING_CLASS } from '@/lib/a11y';
import { cn } from '@/lib/utils';
import { PRIORITY_DOT, STATUS_TONE } from '@/features/task/utils';
import { Plus, ChevronRight, ChevronDown, Layers } from 'lucide-react';

interface TaskRow {
  id: string;
  title: string;
  type: string;
  parentTaskId: string | null;
  status: string;
  priority: string;
}

type TaskPage = { data: TaskRow[]; nextCursor: string | null };

async function fetchTaskPage(
  workspaceId: string,
  type: string,
  pageParam: string | undefined,
): Promise<TaskPage> {
  const params = new URLSearchParams({ workspaceId, limit: '50', type });
  if (pageParam) params.set('cursor', pageParam);
  const res = await api<TaskPage>(`/api/tasks?${params.toString()}`);
  return {
    data: Array.isArray(res?.data) ? res.data : [],
    nextCursor: typeof res?.nextCursor === 'string' ? res.nextCursor : null,
  };
}

export default function EpicListPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const qc = useQueryClient();
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [creatingEpic, setCreatingEpic] = useState(false);
  const [epicTitle, setEpicTitle] = useState('');
  const [addingStoryTo, setAddingStoryTo] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState('');

  const epicsQuery = useInfiniteQuery({
    queryKey: ['epic-tasks', workspaceId, 'EPIC'],
    queryFn: ({ pageParam }) => fetchTaskPage(workspaceId, 'EPIC', pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(workspaceId),
  });

  const storiesQuery = useInfiniteQuery({
    queryKey: ['epic-tasks', workspaceId, 'STORY'],
    queryFn: ({ pageParam }) =>
      fetchTaskPage(workspaceId, 'STORY', pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(workspaceId),
  });

  const columns = useQuery({
    queryKey: ['columns', workspaceId],
    queryFn: () => workspaceApi.columns(workspaceId),
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

  const epics = useMemo(
    () => (epicsQuery.data?.pages ?? []).flatMap((p) => p.data),
    [epicsQuery.data],
  );
  const stories = useMemo(
    () => (storiesQuery.data?.pages ?? []).flatMap((p) => p.data),
    [storiesQuery.data],
  );
  const childrenOf = (epicId: string) => stories.filter((t) => t.parentTaskId === epicId);

  function toggleEpic(id: string) {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreateEpic() {
    const colId = columns.data?.[0]?.id;
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
    const colId = columns.data?.[0]?.id;
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

  const hasEpics = epics.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Epics</h1>
          <p className="text-sm text-muted-foreground">
            Organize large bodies of work into epics with nested stories
          </p>
        </div>
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

      {creatingEpic && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex gap-2">
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
          </CardContent>
        </Card>
      )}

      {!hasEpics && !creatingEpic ? (
        <EmptyState
          icon={Layers}
          title="No epics yet"
          description="Epics help you organize large bodies of work. Create an epic to get started."
          action={
            <Button size="sm" variant="outline" onClick={() => setCreatingEpic(true)}>
              <Plus className="mr-1 h-3 w-3" /> New epic
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {epics.map((epic) => {
            const kids = childrenOf(epic.id);
            const done = kids.filter((k) => k.status === 'DONE').length;
            const total = kids.length;
            const progress = total > 0 ? (done / total) * 100 : 0;
            const expanded = expandedEpics.has(epic.id);

            return (
              <Card key={epic.id}>
                <div
                  className="flex cursor-pointer items-center gap-3 px-4 py-3"
                  onClick={() => toggleEpic(epic.id)}
                >
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleEpic(epic.id);
                    }}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{epic.title}</span>
                      <Badge className={cn('text-[10px]', STATUS_TONE[epic.status] ?? '')}>
                        {epic.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {total > 0 && (
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={progress} className="h-1.5 flex-1 max-w-[200px]" />
                        <span className="text-xs text-muted-foreground">
                          {done}/{total} stories
                        </span>
                      </div>
                    )}
                    {total === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">No stories yet</p>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingStoryTo(epic.id);
                      setStoryTitle('');
                    }}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Story
                  </Button>
                </div>

                {expanded && (
                  <div className="border-t border-border px-4 py-3">
                    {kids.length === 0 ? (
                      <p className="py-2 text-center text-xs text-muted-foreground">
                        No stories yet. Add a story to this epic.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {kids.map((child) => (
                          <li
                            key={child.id}
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                PRIORITY_DOT[child.priority] ?? 'bg-muted-foreground',
                              )}
                            />
                            <span className="flex-1 min-w-0 truncate">{child.title}</span>
                            <Badge
                              variant="secondary"
                              className={cn('text-[10px]', STATUS_TONE[child.status] ?? '')}
                            >
                              {child.status.replace('_', ' ')}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}

                    {addingStoryTo === epic.id && (
                      <div className="mt-2 flex gap-2">
                        <Input
                          value={storyTitle}
                          onChange={(e) => setStoryTitle(e.target.value)}
                          placeholder="Story title..."
                          className="h-8 text-xs"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleAddStory(epic.id)}
                        />
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => handleAddStory(epic.id)}
                          disabled={!storyTitle.trim()}
                        >
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => setAddingStoryTo(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {(epicsQuery.hasNextPage || storiesQuery.hasNextPage) && (
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {epicsQuery.hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={epicsQuery.isFetchingNextPage}
                  onClick={() => void epicsQuery.fetchNextPage()}
                >
                  {epicsQuery.isFetchingNextPage ? 'Loading…' : 'Load more epics'}
                </Button>
              ) : null}
              {storiesQuery.hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={storiesQuery.isFetchingNextPage}
                  onClick={() => void storiesQuery.fetchNextPage()}
                >
                  {storiesQuery.isFetchingNextPage ? 'Loading…' : 'Load more stories'}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
