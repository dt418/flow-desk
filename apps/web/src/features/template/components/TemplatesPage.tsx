import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FOCUS_RING_CLASS } from '@/lib/a11y';

interface Template {
  id: string;
  name: string;
  fields: { title: string };
}

export default function TemplatesPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const qc = useQueryClient();
  const [name, setName] = useState('Weekly status writeup');
  const [title, setTitle] = useState('Weekly status writeup');

  const templates = useQuery({
    queryKey: ['templates', workspaceId],
    queryFn: () => api<{ data: Template[] }>(`/workspaces/${workspaceId}/templates`),
  });

  const recurring = useQuery({
    queryKey: ['recurring', workspaceId],
    queryFn: () =>
      api<{ data: Array<{ id: string; cron: string; nextRunAt: string; templateId: string }> }>(
        `/workspaces/${workspaceId}/templates/recurring`,
      ),
  });

  const create = useMutation({
    mutationFn: async () => {
      const tpl = await api<Template>(`/workspaces/${workspaceId}/templates`, {
        method: 'POST',
        json: { name, fields: { title, priority: 'MEDIUM' } },
      });
      await api(`/workspaces/${workspaceId}/templates/recurring`, {
        method: 'POST',
        json: { templateId: tpl.id, cron: 'weekly', isActive: true },
      });
      return tpl;
    },
    onSuccess: () => {
      toast.success('Template + weekly rule created');
      qc.invalidateQueries({ queryKey: ['templates', workspaceId] });
      qc.invalidateQueries({ queryKey: ['recurring', workspaceId] });
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Task templates</h1>
      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="space-y-1.5">
          <Label htmlFor="tpl-name">Template name</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FOCUS_RING_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-title">Task title</Label>
          <Input
            id="tpl-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={FOCUS_RING_CLASS}
          />
        </div>
        <Button
          aria-label="Create template with weekly recurring rule"
          className={FOCUS_RING_CLASS}
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          Create template + weekly rule
        </Button>
      </div>

      <ul className="space-y-2">
        {(templates.data?.data ?? []).map((t) => (
          <li key={t.id} className="rounded border border-border px-3 py-2 text-sm">
            <div className="font-medium">{t.name}</div>
            <div className="text-xs text-muted-foreground">title: {t.fields.title}</div>
          </li>
        ))}
      </ul>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recurring rules</h2>
        <ul className="space-y-1 text-sm">
          {(recurring.data?.data ?? []).map((r) => (
            <li key={r.id} className="rounded border border-border px-3 py-2">
              cron={r.cron} · next={new Date(r.nextRunAt).toLocaleString()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
