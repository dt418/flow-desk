import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { FOCUS_RING_CLASS } from '@/lib/a11y';
import { cn } from '@/lib/utils';
import { PRIORITY_DOT } from '@/features/task/utils';
import { FileText, Pencil, Trash2, Play, Plus, Clock } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  fields: { title: string; description?: string; priority?: string; estimate?: number };
}

interface RecurringRule {
  id: string;
  cron: string;
  nextRunAt: string;
  templateId: string;
  isActive: boolean;
}

const CRON_OPTIONS = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Bi-weekly', value: '0 9 * * 1,15' },
  { label: 'Monthly', value: '0 9 1 * *' },
  { label: 'Every Monday', value: '0 9 * * 1' },
  { label: 'Custom', value: 'custom' },
];

export default function TemplatesPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [applying, setApplying] = useState<Template | null>(null);

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [estimate, setEstimate] = useState('');
  const [cronChoice, setCronChoice] = useState('weekly');
  const [customCron, setCustomCron] = useState('0 9 * * 1');

  const templates = useQuery({
    queryKey: ['templates', workspaceId],
    queryFn: () => api<{ data: Template[] }>(`/api/workspaces/${workspaceId}/templates`),
  });

  const recurring = useQuery({
    queryKey: ['recurring', workspaceId],
    queryFn: () =>
      api<{ data: RecurringRule[] }>(`/api/workspaces/${workspaceId}/templates/recurring`),
  });

  const create = useMutation({
    mutationFn: async () => {
      const cron = cronChoice === 'custom' ? customCron : cronChoice;
      const tpl = await api<Template>(`/api/workspaces/${workspaceId}/templates`, {
        method: 'POST',
        json: {
          name,
          fields: {
            title,
            description: description || undefined,
            priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
            estimate: estimate ? parseInt(estimate) : undefined,
          },
        },
      });
      await api(`/api/workspaces/${workspaceId}/templates/recurring`, {
        method: 'POST',
        json: { templateId: tpl.id, cron, isActive: true },
      });
      return tpl;
    },
    onSuccess: () => {
      toast.success('Template created');
      qc.invalidateQueries({ queryKey: ['templates', workspaceId] });
      qc.invalidateQueries({ queryKey: ['recurring', workspaceId] });
      resetForm();
      setShowCreate(false);
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      return api(`/api/workspaces/${workspaceId}/templates/${editing.id}`, {
        method: 'PATCH',
        json: {
          name,
          fields: {
            title,
            description: description || undefined,
            priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
            estimate: estimate ? parseInt(estimate) : undefined,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success('Template updated');
      qc.invalidateQueries({ queryKey: ['templates', workspaceId] });
      resetForm();
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/workspaces/${workspaceId}/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Template deleted');
      qc.invalidateQueries({ queryKey: ['templates', workspaceId] });
      qc.invalidateQueries({ queryKey: ['recurring', workspaceId] });
    },
  });

  const removeRecurring = useMutation({
    mutationFn: (id: string) =>
      api(`/api/workspaces/${workspaceId}/templates/recurring/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring', workspaceId] });
    },
  });

  const apply = useMutation({
    mutationFn: async ({ templateId, columnId }: { templateId: string; columnId: string }) =>
      api(`/api/workspaces/${workspaceId}/templates/${templateId}/apply`, {
        method: 'POST',
        json: { columnId },
      }),
    onSuccess: () => {
      toast.success('Task created from template');
      setApplying(null);
    },
  });

  const columns = useQuery({
    queryKey: ['columns', workspaceId],
    queryFn: () =>
      api<{ data: Array<{ id: string; name: string }> }>(`/workspaces/${workspaceId}/columns`),
    enabled: Boolean(applying),
  });

  function resetForm() {
    setName('');
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setEstimate('');
    setCronChoice('weekly');
  }

  function startEdit(tpl: Template) {
    setName(tpl.name);
    setTitle(tpl.fields.title);
    setDescription(tpl.fields.description ?? '');
    setPriority(tpl.fields.priority ?? 'MEDIUM');
    setEstimate(tpl.fields.estimate?.toString() ?? '');
    setEditing(tpl);
    setShowCreate(false);
  }

  function getCronLabel(cron: string) {
    const match = CRON_OPTIONS.find((o) => o.value === cron);
    return match?.label ?? cron;
  }

  const hasTemplates = (templates.data?.data ?? []).length > 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Task templates</h1>
          <p className="text-sm text-muted-foreground">
            Create reusable task templates and set up recurring schedules
          </p>
        </div>
        <Button
          size="sm"
          className={cn(FOCUS_RING_CLASS)}
          onClick={() => {
            setShowCreate(!showCreate);
            setEditing(null);
            resetForm();
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> New template
        </Button>
      </div>

      {(showCreate || editing) && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{editing ? 'Edit template' : 'New template'}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Template name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Weekly standup"
                    className={FOCUS_RING_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Task title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Write weekly status"
                    className={FOCUS_RING_CLASS}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <textarea
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(e.target.value)
                  }
                  rows={2}
                  placeholder="Template description..."
                  className={cn(
                    'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none',
                    FOCUS_RING_CLASS,
                  )}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                        <SelectItem key={p} value={p}>
                          <span className="flex items-center gap-2">
                            <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[p])} />
                            {p}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estimate (pts)</Label>
                  <Input
                    type="number"
                    value={estimate}
                    onChange={(e) => setEstimate(e.target.value)}
                    placeholder="0"
                    className={FOCUS_RING_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Frequency</Label>
                  <Select value={cronChoice} onValueChange={setCronChoice}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRON_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {cronChoice === 'custom' && (
                <div className="space-y-1.5">
                  <Label>Cron expression</Label>
                  <Input
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    placeholder="0 9 * * 1"
                    className={FOCUS_RING_CLASS}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  className={cn(FOCUS_RING_CLASS)}
                  onClick={() => (editing ? update.mutate() : create.mutate())}
                  disabled={create.isPending || update.isPending || !name.trim() || !title.trim()}
                >
                  {editing ? 'Save changes' : 'Create template'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(null);
                    setShowCreate(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Templates
        </h2>
        {!hasTemplates && !showCreate ? (
          <EmptyState
            icon={FileText}
            title="No templates yet"
            description="Create a template to reuse common task configurations and set up recurring schedules."
            action={
              <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                <Plus className="mr-1 h-3 w-3" /> New template
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(templates.data?.data ?? []).map((t) => {
              const rule = recurring.data?.data.find((r) => r.templateId === t.id);
              return (
                <Card key={t.id} className="group">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{t.name}</span>
                          {rule?.isActive && (
                            <Badge variant="secondary" className="text-[10px]">
                              <Clock className="mr-1 h-2.5 w-2.5" />
                              {getCronLabel(rule.cron)}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1.5 text-sm text-muted-foreground">{t.fields.title}</div>
                        {t.fields.description && (
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {t.fields.description}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          {t.fields.priority && (
                            <Badge variant="outline" className="text-[10px]">
                              <span
                                className={cn(
                                  'mr-1 h-1.5 w-1.5 rounded-full',
                                  PRIORITY_DOT[t.fields.priority] ?? 'bg-muted-foreground',
                                )}
                              />
                              {t.fields.priority}
                            </Badge>
                          )}
                          {t.fields.estimate != null && (
                            <Badge variant="outline" className="text-[10px]">
                              {t.fields.estimate} pts
                            </Badge>
                          )}
                          {rule && (
                            <span className="text-[10px] text-muted-foreground">
                              Next: {new Date(rule.nextRunAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => setApplying(t)}
                          title="Create task from template"
                        >
                          <Play className="mr-1 h-3 w-3" /> Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => startEdit(t)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive"
                          onClick={() => {
                            if (confirm(`Delete template "${t.name}"?`)) remove.mutate(t.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Recurring rules */}
      {(recurring.data?.data ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recurring rules
          </h2>
          <ul className="space-y-2">
            {(recurring.data?.data ?? []).map((r) => {
              const tpl = templates.data?.data.find((t) => t.id === r.templateId);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-2 w-2 rounded-full',
                        r.isActive ? 'bg-green-500' : 'bg-muted-foreground/50',
                      )}
                    />
                    <div>
                      <div className="text-sm font-medium">{tpl?.name ?? 'Unknown template'}</div>
                      <div className="text-xs text-muted-foreground">
                        {getCronLabel(r.cron)} · Next run: {new Date(r.nextRunAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive"
                    onClick={() => {
                      if (confirm('Delete this recurring rule?')) removeRecurring.mutate(r.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Apply dialog */}
      <Dialog open={Boolean(applying)} onOpenChange={(v) => (!v ? setApplying(null) : undefined)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create task from "{applying?.name}"</DialogTitle>
          </DialogHeader>
          {applying && (
            <>
              <p className="text-xs text-muted-foreground">
                {applying.fields.title}
                {applying.fields.priority && ` · ${applying.fields.priority}`}
                {applying.fields.estimate != null && ` · ${applying.fields.estimate} pts`}
              </p>
              <div className="space-y-1.5">
                <Label>Column</Label>
                <Select
                  onValueChange={(colId) => {
                    apply.mutate({ templateId: applying.id, columnId: colId });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick column" />
                  </SelectTrigger>
                  <SelectContent>
                    {(columns.data?.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setApplying(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
