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
import { FOCUS_RING_CLASS } from '@/lib/a11y';
import { cn } from '@/lib/utils';
import { Pencil, Trash2, Play, Plus } from 'lucide-react';

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

  // Create/edit form state
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [estimate, setEstimate] = useState('');
  const [cronChoice, setCronChoice] = useState('weekly');
  const [customCron, setCustomCron] = useState('0 9 * * 1');

  const templates = useQuery({
    queryKey: ['templates', workspaceId],
    queryFn: () => api<{ data: Template[] }>(`/workspaces/${workspaceId}/templates`),
  });

  const recurring = useQuery({
    queryKey: ['recurring', workspaceId],
    queryFn: () => api<{ data: RecurringRule[] }>(`/workspaces/${workspaceId}/templates/recurring`),
  });

  const create = useMutation({
    mutationFn: async () => {
      const cron = cronChoice === 'custom' ? customCron : cronChoice;
      const tpl = await api<Template>(`/workspaces/${workspaceId}/templates`, {
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
      await api(`/workspaces/${workspaceId}/templates/recurring`, {
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
      return api(`/workspaces/${workspaceId}/templates/${editing.id}`, {
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
      api(`/workspaces/${workspaceId}/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Template deleted');
      qc.invalidateQueries({ queryKey: ['templates', workspaceId] });
      qc.invalidateQueries({ queryKey: ['recurring', workspaceId] });
    },
  });

  const removeRecurring = useMutation({
    mutationFn: (id: string) =>
      api(`/workspaces/${workspaceId}/templates/recurring/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring', workspaceId] });
    },
  });

  const apply = useMutation({
    mutationFn: async ({ templateId, columnId }: { templateId: string; columnId: string }) =>
      api(`/workspaces/${workspaceId}/templates/${templateId}/apply`, {
        method: 'POST',
        json: { columnId },
      }),
    onSuccess: () => {
      toast.success('Task created from template');
      setApplying(null);
    },
  });

  // Fetch columns for apply dialog
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Task templates</h1>
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

      {/* Create / Edit form */}
      {(showCreate || editing) && (
        <div className="space-y-3 rounded-lg border border-border p-4">
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
                      {p}
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
      )}

      {/* Templates list */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Templates</h2>
        <ul className="space-y-2">
          {(templates.data?.data ?? []).map((t) => {
            const rule = recurring.data?.data.find((r) => r.templateId === t.id);
            return (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.fields.title}
                    {t.fields.priority && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {t.fields.priority}
                      </Badge>
                    )}
                    {t.fields.estimate != null && (
                      <span className="ml-2">{t.fields.estimate} pts</span>
                    )}
                  </div>
                  {rule && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {getCronLabel(rule.cron)} · next:{' '}
                      {new Date(rule.nextRunAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
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
              </li>
            );
          })}
          {(templates.data?.data ?? []).length === 0 && (
            <li className="text-sm text-muted-foreground">No templates yet</li>
          )}
        </ul>
      </div>

      {/* Recurring rules */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recurring rules</h2>
        <ul className="space-y-1 text-sm">
          {(recurring.data?.data ?? []).map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded border border-border px-3 py-2"
            >
              <span>
                {getCronLabel(r.cron)} · next: {new Date(r.nextRunAt).toLocaleString()}
                {r.isActive ? '' : ' (paused)'}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-destructive"
                onClick={() => {
                  if (confirm('Delete this recurring rule?')) removeRecurring.mutate(r.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      {/* Apply dialog */}
      {applying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-card p-4 shadow-lg">
            <h3 className="mb-3 text-sm font-medium">Create task from "{applying.name}"</h3>
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
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setApplying(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
