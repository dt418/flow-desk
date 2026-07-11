import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AutomationRule } from '@flow-desk/shared/automation';

export function RulesTab() {
  const { workspaceId } = useParams<Record<string, string>>();
  const wid = workspaceId!;
  const qc = useQueryClient();
  const [name, setName] = useState('Assign owner on In Review');
  const [showForm, setShowForm] = useState(false);

  const rules = useQuery({
    queryKey: ['rules', wid],
    queryFn: () => api<{ data: AutomationRule[] }>(`/workspaces/${wid}/rules`),
  });

  const create = useMutation({
    mutationFn: () =>
      api(`/workspaces/${wid}/rules`, {
        method: 'POST',
        json: {
          name,
          trigger: 'STATUS_CHANGED',
          condition: { field: 'newValue', op: 'eq', value: 'IN_REVIEW' },
          action: { type: 'assign', assigneeId: 'workspace-owner' },
          isActive: true,
        },
      }),
    onSuccess: () => {
      toast.success('Rule created');
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['rules', wid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${wid}/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Rule deleted');
      qc.invalidateQueries({ queryKey: ['rules', wid] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Automation rules</h2>
          <p className="text-sm text-muted-foreground">
            When activity matches a trigger + condition, run an action.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'New rule'}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Template: on STATUS_CHANGED → IN_REVIEW, assign workspace owner.
          </p>
          <Button size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
            Create
          </Button>
        </div>
      )}

      {rules.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (rules.data?.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No rules yet.</p>
      ) : (
        <ul className="space-y-2">
          {(rules.data?.data ?? []).map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.trigger} · {r.isActive ? 'active' : 'off'} · action{' '}
                  {(r.action as { type: string }).type}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
